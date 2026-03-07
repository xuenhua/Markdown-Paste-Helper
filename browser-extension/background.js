/**
 * Background Service Worker
 * Handles cross-origin image fetching for content scripts.
 * Extensions bypass CORS restrictions in the background context.
 */

// ===== Distribution State =====
const distributionState = {
  currentDistribution: null,
  currentTabId: null,
  sentForUrl: null, // 记录已发送 distribution-active 的 URL，防止重复发送
};

const PLATFORM_URLS = {
  zhihu: 'https://zhuanlan.zhihu.com/write',
  wechat: 'https://mp.weixin.qq.com',
  feishu: 'https://www.feishu.cn',
  twitter: 'https://x.com/compose/articles',
  bilibili: 'https://member.bilibili.com/platform/upload/text/new-edit',
  toutiao: 'https://mp.toutiao.com/profile_v4/graphic/publish',
  segmentfault: 'https://segmentfault.com/write?freshman=1',
  '51cto': 'https://blog.51cto.com/blogger/publish?old=1',
  juejin: 'https://juejin.cn/editor/drafts/new',
  csdn: 'https://editor.csdn.net/md/',
  cnblogs: 'https://i.cnblogs.com/posts/edit',
};

const PLATFORM_NAMES = {
  zhihu: '知乎',
  wechat: '公众号',
  feishu: '飞书',
  twitter: 'X Articles',
  bilibili: 'B站专栏',
  toutiao: '头条号',
  segmentfault: 'SegmentFault',
  '51cto': '51CTO',
  juejin: '掘金',
  csdn: 'CSDN',
  cnblogs: '博客园',
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ===== Image Fetching =====
  if (message.type === "fetch-image") {
    fetchImageAsBase64(message.url)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({ success: false, error: err.message }),
      );
    return true; // Keep channel open for async response
  }

  // ===== Login Detection =====
  if (message.type === 'check-login') {
    checkLoginStatus(message.platform, message.forceRefresh)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ loggedIn: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  // ===== Clear Auth Cache =====
  if (message.type === 'clear-auth-cache') {
    chrome.storage.local.remove(AUTH_CACHE_KEY)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ===== Distribution Request (Serial Mode) =====
  if (message.type === 'start-distribution') {
    handleSerialDistribution(message);
    return false;
  }

  // ===== Next Platform =====
  if (message.type === 'next-platform') {
    handleNextPlatform();
    return false;
  }

  // ===== Retry Current Platform =====
  if (message.type === 'retry-platform') {
    handleRetryPlatform();
    return false;
  }

  // ===== Complete Distribution =====
  if (message.type === 'complete-distribution') {
    handleCompleteDistribution();
    return false;
  }

  // ===== Paste Complete/Failed =====
  if (message.type === 'paste-complete' || message.type === 'paste-failed') {
    handlePasteResult(message);
    return false;
  }
});

// ===== Serial Distribution Handler =====

async function handleSerialDistribution({ distributionId, markdown, platforms, platformNames }) {
  console.log(`[Markdown Paste Helper] Starting serial distribution ${distributionId}`);

  distributionState.currentDistribution = {
    id: distributionId,
    markdown,
    queue: platforms,
    platformNames,
    currentIndex: 0,
    status: {},
    startTime: Date.now(),
  };

  // Initialize status
  platforms.forEach(p => {
    distributionState.currentDistribution.status[p] = 'pending';
  });

  // Open first platform
  openCurrentPlatform();
}

async function openCurrentPlatform() {
  const dist = distributionState.currentDistribution;
  if (!dist) return;

  const platform = dist.queue[dist.currentIndex];
  let url = PLATFORM_URLS[platform];

  // 飞书: 使用缓存的用户主页 URL（含二级域名）
  if (platform === 'feishu') {
    try {
      const cache = await getCachedAuth();
      const cached = cache[platform];
      if (cached?.homeUrl) {
        url = cached.homeUrl;
      }
    } catch (e) {
      console.warn('[Markdown Paste Helper] Failed to read feishu cached URL:', e);
    }
  }

  if (!url) {
    console.error(`[Markdown Paste Helper] No URL for platform: ${platform}`);
    sendProgressUpdate(dist.id, platform, 'error', 'URL 未配置');
    return;
  }

  console.log(`[Markdown Paste Helper] Opening platform ${platform} (${dist.currentIndex + 1}/${dist.queue.length})`);

  try {
    const tab = await chrome.tabs.create({ url, active: true });
    distributionState.currentTabId = tab.id;
    distributionState.sentForUrl = null; // 新平台，重置标记
    dist.status[platform] = 'in-progress';

    sendProgressUpdate(dist.id, platform, 'in-progress', '页面加载中...');

    // Wait for content script to be ready, then send distribution-active message
    waitForContentScript(tab.id, platform);

  } catch (err) {
    console.error(`[Markdown Paste Helper] Failed to open tab:`, err);
    sendProgressUpdate(dist.id, platform, 'error', `打开失败: ${err.message}`);
  }
}

async function waitForContentScript(tabId, platform) {
  const dist = distributionState.currentDistribution;
  if (!dist) return;

  const maxAttempts = 30; // 15 seconds
  let attempts = 0;

  const checkInterval = setInterval(async () => {
    attempts++;

    try {
      // Try to send a ping message to check if content script is ready
      await chrome.tabs.sendMessage(tabId, { type: 'ping' });

      // If successful, content script is ready
      clearInterval(checkInterval);
      console.log(`[Markdown Paste Helper] Content script ready in tab ${tabId}`);

      // 等待所有 content script 加载完毕（ping 只说明 distribution-float.js 已加载，
      // 平台 handler 可能还在加载中）
      await new Promise(r => setTimeout(r, 500));

      // 获取当前 tab URL，防止对同一页面重复发送
      let currentUrl = '';
      try {
        const tabInfo = await chrome.tabs.get(tabId);
        currentUrl = tabInfo.url || '';
      } catch (_) {}

      if (distributionState.sentForUrl === currentUrl && currentUrl) {
        console.log(`[Markdown Paste Helper] Already sent for this URL, skipping: ${currentUrl}`);
        return;
      }
      distributionState.sentForUrl = currentUrl;

      // Send distribution-active message
      await chrome.tabs.sendMessage(tabId, {
        type: 'distribution-active',
        distributionId: dist.id,
        markdown: dist.markdown,
        platform,
        currentIndex: dist.currentIndex,
        queue: dist.queue,
        platformNames: dist.platformNames,
      });
      console.log(`[Markdown Paste Helper] Sent distribution-active to tab ${tabId}`);

    } catch (err) {
      // Content script not ready yet, continue waiting
      if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.error(`[Markdown Paste Helper] Content script timeout for tab ${tabId}`);
        sendProgressUpdate(dist.id, platform, 'error', 'Content script 加载超时');
      }
    }
  }, 500);
}

function handleNextPlatform() {
  const dist = distributionState.currentDistribution;
  if (!dist) return;

  dist.currentIndex++;

  if (dist.currentIndex >= dist.queue.length) {
    // All platforms completed
    console.log('[Markdown Paste Helper] All platforms completed');
    sendProgressUpdate(dist.id, null, 'all-complete', '全部完成');
    return;
  }

  // Open next platform
  openCurrentPlatform();
}

function handleRetryPlatform() {
  const dist = distributionState.currentDistribution;
  if (!dist) return;

  const platform = dist.queue[dist.currentIndex];
  console.log(`[Markdown Paste Helper] Retrying platform: ${platform}`);

  // Close current tab and reopen
  if (distributionState.currentTabId) {
    chrome.tabs.remove(distributionState.currentTabId).catch(() => {});
  }

  openCurrentPlatform();
}

function handleCompleteDistribution() {
  console.log('[Markdown Paste Helper] Distribution completed by user');
  distributionState.currentDistribution = null;
  distributionState.currentTabId = null;
}

// ===== New Tab Editor Listener =====
// 部分平台（飞书、微信公众号）的编辑器会在新标签页中打开，
// 新标签页的 content script 不会收到 distribution-active 消息。
// 通过监听标签页切换，当用户切到同域名的新标签页时，重新发送消息。

const PLATFORMS_NEW_TAB_EDITOR = new Set(['feishu', 'wechat']);

// 平台域名匹配规则
const PLATFORM_DOMAIN_PATTERNS = {
  feishu: url => /\.feishu\.cn/.test(url),
  wechat: url => /mp\.weixin\.qq\.com/.test(url),
};

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const dist = distributionState.currentDistribution;
  if (!dist) return;

  const platform = dist.queue[dist.currentIndex];
  if (!PLATFORMS_NEW_TAB_EDITOR.has(platform)) return;
  if (dist.status[platform] === 'success') return;

  // 如果切回的就是原来的标签页，跳过
  if (tabId === distributionState.currentTabId) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    const tabUrl = tab.url || '';

    // 检查新标签页 URL 是否属于当前平台
    const domainMatch = PLATFORM_DOMAIN_PATTERNS[platform];
    if (!domainMatch || !domainMatch(tabUrl)) return;

    console.log(`[Markdown Paste Helper] User switched to new ${platform} tab ${tabId}, sending distribution-active`);

    // 更新为新标签页
    distributionState.currentTabId = tabId;
    distributionState.sentForUrl = null;

    waitForContentScript(tabId, platform);
  } catch (err) {
    // 标签页可能已关闭
  }
});

function handlePasteResult({ type, platform, message: msg }) {
  const dist = distributionState.currentDistribution;
  if (!dist) return;

  const status = type === 'paste-complete' ? 'success' : 'error';
  const displayMsg = type === 'paste-complete' ? '粘贴成功' : msg || '粘贴失败';

  dist.status[platform] = status;

  console.log(`[Markdown Paste Helper] Paste ${status} for ${platform}: ${displayMsg}`);
  sendProgressUpdate(dist.id, platform, status, displayMsg);
}

function sendProgressUpdate(distributionId, platform, status, message) {
  // Send to distribute page
  chrome.runtime.sendMessage({
    type: 'progress-update',
    distributionId,
    platform,
    status,
    message,
  }).catch(() => {
    // Distribute page might be closed, ignore error
  });
}

// ===== Login Detection =====

// 缓存配置
const AUTH_CACHE_KEY = 'authCache';
const AUTH_CACHE_TTL_AUTHENTICATED = 5 * 60 * 1000;    // 已登录：5分钟缓存
const AUTH_CACHE_TTL_UNAUTHENTICATED = 30 * 1000;     // 未登录：30秒缓存
const AUTH_CHECK_TIMEOUT = 10 * 1000;                  // 单个平台超时：10秒

/**
 * 获取缓存的认证状态
 */
async function getCachedAuth() {
  try {
    const storage = await chrome.storage.local.get(AUTH_CACHE_KEY);
    return storage[AUTH_CACHE_KEY] || {};
  } catch {
    return {};
  }
}

/**
 * 保存认证状态到缓存
 */
async function setCachedAuth(cache) {
  await chrome.storage.local.set({ [AUTH_CACHE_KEY]: cache });
}

/**
 * 带超时的 Promise 包装
 */
function withTimeout(promise, ms, errorMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);

    promise
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * 平台认证检测函数（直接在 background 中执行）
 */
const PLATFORM_AUTH_CHECKERS = {
  /**
   * 知乎
   */
  zhihu: async () => {
    try {
      const response = await fetch('https://www.zhihu.com/api/v4/me', {
        method: 'GET',
        credentials: 'include',
        headers: { 'x-requested-with': 'fetch' },
      });

      if (!response.ok) {
        return { isAuthenticated: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      if (data.id) {
        return {
          isAuthenticated: true,
          userId: data.id,
          username: data.name,
          avatar: data.avatar_url,
        };
      }

      return { isAuthenticated: false, error: 'No user ID' };
    } catch (error) {
      return { isAuthenticated: false, error: error.message };
    }
  },

  /**
   * 微信公众号
   * 使用更严格的检测逻辑
   */
  wechat: async () => {
    try {
      const response = await fetch('https://mp.weixin.qq.com/', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        return { isAuthenticated: false, error: `HTTP ${response.status}` };
      }

      const html = await response.text();

      // 检测登录表单（未登录时会有）
      const hasLoginForm = html.includes('class="login_iframe"') ||
                          html.includes('id="login_frame"') ||
                          html.includes('账号登录') ||
                          html.includes('扫码登录');

      if (hasLoginForm) {
        console.log('[Markdown Paste Helper] wechat: Login form detected, not logged in');
        return { isAuthenticated: false, error: 'Login form detected' };
      }

      // 检测 token（登录后才有）
      const tokenMatch = html.match(/data:\s*\{[\s\S]*?t:\s*["']([^"']+)["']/);
      if (!tokenMatch) {
        console.log('[Markdown Paste Helper] wechat: No token found');
        return { isAuthenticated: false, error: 'No token found' };
      }

      // 检测用户名（登录后才有）
      const nickNameMatch = html.match(/nick_name:\s*["']([^"']+)["']/);
      const userNameMatch = html.match(/user_name:\s*["']([^"']+)["']/);

      if (!nickNameMatch && !userNameMatch) {
        console.log('[Markdown Paste Helper] wechat: No username found');
        return { isAuthenticated: false, error: 'No username found' };
      }

      // 提取头像
      const avatarMatch = html.match(/class="weui-desktop-account__thumb"[^>]*src="([^"]+)"/);

      console.log('[Markdown Paste Helper] wechat: Logged in as', nickNameMatch ? nickNameMatch[1] : userNameMatch[1]);

      return {
        isAuthenticated: true,
        userId: userNameMatch ? userNameMatch[1] : undefined,
        username: nickNameMatch ? nickNameMatch[1] : undefined,
        avatar: avatarMatch ? avatarMatch[1] : undefined,
      };
    } catch (error) {
      return { isAuthenticated: false, error: error.message };
    }
  },

  /**
   * 飞书
   * 跟随重定向，从最终 URL 提取用户的二级域名（如 oihbmn5sukx.feishu.cn）
   */
  feishu: async () => {
    try {
      const response = await fetch('https://www.feishu.cn/', {
        method: 'GET',
        credentials: 'include',
        redirect: 'follow',
      });

      const finalUrl = response.url || '';

      // 如果最终跳转到登录页，说明未登录
      if (finalUrl.includes('login') || finalUrl.includes('passport')) {
        return { isAuthenticated: false, error: 'Redirected to login' };
      }

      if (response.ok) {
        // 从最终 URL 提取用户主页地址（如 https://xxx.feishu.cn/drive/home/）
        let homeUrl = '';
        const match = finalUrl.match(/https:\/\/[^/]+\.feishu\.cn/);
        if (match) {
          homeUrl = match[0] + '/drive/home/';
        }

        return {
          isAuthenticated: true,
          homeUrl,
        };
      }

      return { isAuthenticated: false, error: `HTTP ${response.status}` };
    } catch (error) {
      return { isAuthenticated: false, error: error.message };
    }
  },

  /**
   * X (Twitter)
   */
  twitter: async () => {
    try {
      const response = await fetch('https://x.com/', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        return { isAuthenticated: false, error: `HTTP ${response.status}` };
      }

      const html = await response.text();

      // 检测是否有用户数据
      const hasUserData = html.includes('"screen_name"') || html.includes('data-testid="AppTabBar_Profile_Link"');

      return {
        isAuthenticated: hasUserData,
        error: hasUserData ? undefined : 'No user data found',
      };
    } catch (error) {
      return { isAuthenticated: false, error: error.message };
    }
  },

  /**
   * B站专栏
   */
  bilibili: async () => {
    try {
      const response = await fetch('https://api.bilibili.com/x/web-interface/nav?build=0&mobi_app=web', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        return { isAuthenticated: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      if (data.code === 0 && data.data?.isLogin) {
        return {
          isAuthenticated: true,
          userId: String(data.data.mid),
          username: data.data.uname,
          avatar: data.data.face,
        };
      }

      return { isAuthenticated: false, error: 'Not logged in' };
    } catch (error) {
      return { isAuthenticated: false, error: error.message };
    }
  },

  /**
   * 头条号
   */
  toutiao: async () => {
    try {
      const response = await fetch('https://mp.toutiao.com/mp/agw/media/get_media_info', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        return { isAuthenticated: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      if (data.data?.user?.id) {
        return {
          isAuthenticated: true,
          userId: String(data.data.user.id),
          username: data.data.user.screen_name,
          avatar: data.data.user.https_avatar_url,
        };
      }

      return { isAuthenticated: false, error: 'No user info' };
    } catch (error) {
      return { isAuthenticated: false, error: error.message };
    }
  },

  /**
   * SegmentFault
   */
  segmentfault: async () => {
    try {
      const response = await fetch('https://segmentfault.com/user/settings', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        return { isAuthenticated: false, error: `HTTP ${response.status}` };
      }

      const html = await response.text();

      // 匹配用户链接 href="/u/username"
      const userLinkMatch = html.match(/href="\/u\/([^"]+)"/);
      if (!userLinkMatch) {
        return { isAuthenticated: false, error: 'No user link found' };
      }

      const uid = userLinkMatch[1];

      // 匹配头像
      const avatarMatch = html.match(/src="(https:\/\/avatar-static\.segmentfault\.com\/[^"]+)"/);

      return {
        isAuthenticated: true,
        userId: uid,
        username: uid,
        avatar: avatarMatch ? avatarMatch[1] : undefined,
      };
    } catch (error) {
      return { isAuthenticated: false, error: error.message };
    }
  },

  /**
   * 51CTO
   */
  '51cto': async () => {
    try {
      const response = await fetch('https://blog.51cto.com/blogger/publish', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        return { isAuthenticated: false, error: `HTTP ${response.status}` };
      }

      const html = await response.text();

      // 解析用户链接和头像
      const imgMatch = html.match(/<li class="more user">\s*<a[^>]*href="([^"]+)"[^>]*>\s*<img[^>]*src="([^"]+)"/);
      if (!imgMatch) {
        return { isAuthenticated: false, error: 'No user info found' };
      }

      const userLink = imgMatch[1];
      const avatar = imgMatch[2];
      const uid = userLink.split('/').filter(Boolean).pop() || '';

      return {
        isAuthenticated: true,
        userId: uid,
        username: uid,
        avatar: avatar,
      };
    } catch (error) {
      return { isAuthenticated: false, error: error.message };
    }
  },

  /**
   * 掘金
   */
  juejin: async () => {
    try {
      const response = await fetch('https://api.juejin.cn/user_api/v1/user/get', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        return { isAuthenticated: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      if (data.data && data.data.user_id) {
        return {
          isAuthenticated: true,
          username: data.data.user_name,
          avatar: data.data.avatar_large,
        };
      }

      return { isAuthenticated: false, error: 'Not logged in' };
    } catch (error) {
      return { isAuthenticated: false, error: error.message };
    }
  },

  /**
   * CSDN
   * 使用带签名的 API
   */
  csdn: async () => {
    const API_KEY = '203803574';
    const API_SECRET = '9znpamsyl2c7cdrr9sas0le9vbc3r6ba';

    function createUuid() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    async function hmacSha256(message, secret) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret);
      const messageData = encoder.encode(message);
      const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
      const bytes = new Uint8Array(signature);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }

    try {
      const apiPath = '/blog-console-api/v3/editor/getBaseInfo';
      const nonce = createUuid();
      const signStr = `GET\n*/*\n\n\n\nx-ca-key:${API_KEY}\nx-ca-nonce:${nonce}\n${apiPath}`;
      const signature = await hmacSha256(signStr, API_SECRET);

      const response = await fetch(`https://bizapi.csdn.net${apiPath}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'accept': '*/*',
          'x-ca-key': API_KEY,
          'x-ca-nonce': nonce,
          'x-ca-signature': signature,
          'x-ca-signature-headers': 'x-ca-key,x-ca-nonce',
        },
      });

      if (!response.ok) {
        return { isAuthenticated: false, error: `HTTP ${response.status}` };
      }

      const res = await response.json();
      if (res.code === 200 && res.data && res.data.name) {
        return {
          isAuthenticated: true,
          username: res.data.nickname || res.data.name,
          avatar: res.data.avatar,
        };
      }

      return { isAuthenticated: false, error: 'Not logged in' };
    } catch (error) {
      return { isAuthenticated: false, error: error.message };
    }
  },

  /**
   * 博客园
   * 通过用户信息页 HTML 解析
   */
  cnblogs: async () => {
    try {
      const response = await fetch('https://home.cnblogs.com/user/CurrentUserInfo', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        return { isAuthenticated: false, error: `HTTP ${response.status}` };
      }

      const html = await response.text();

      // 解析用户 ID：href="/u/xxx/"
      const linkMatch = html.match(/href="\/u\/([^/]+)\/"/);
      if (!linkMatch) {
        return { isAuthenticated: false, error: 'No user link found' };
      }

      const uid = linkMatch[1];
      // 解析头像：<img class="pfs" src="...">
      const avatarMatch = html.match(/<img[^>]+class="pfs"[^>]+src="([^"]+)"/);

      return {
        isAuthenticated: true,
        username: uid,
        avatar: avatarMatch ? avatarMatch[1] : undefined,
      };
    } catch (error) {
      return { isAuthenticated: false, error: error.message };
    }
  },
};

/**
 * 检查单个平台登录状态（基于 API）
 */
async function checkLoginStatus(platform, forceRefresh = false) {
  console.log(`[Markdown Paste Helper] Checking ${platform}...`);

  // 检查缓存
  if (!forceRefresh) {
    const cache = await getCachedAuth();
    const cached = cache[platform];
    const now = Date.now();
    const cacheTTL = cached?.isAuthenticated ? AUTH_CACHE_TTL_AUTHENTICATED : AUTH_CACHE_TTL_UNAUTHENTICATED;

    if (cached && (now - cached.timestamp < cacheTTL)) {
      console.log(`[Markdown Paste Helper] Using cached result for ${platform}`);
      return {
        loggedIn: cached.isAuthenticated,
        username: cached.username,
        avatar: cached.avatar,
        homeUrl: cached.homeUrl,
        details: 'From cache',
      };
    }
  }

  // 获取检测函数
  const checker = PLATFORM_AUTH_CHECKERS[platform];
  if (!checker) {
    return { loggedIn: false, error: 'No auth checker for platform' };
  }

  try {
    // 执行检测（带超时）
    const authResult = await withTimeout(
      checker(),
      AUTH_CHECK_TIMEOUT,
      `认证检查超时（${AUTH_CHECK_TIMEOUT / 1000}秒）`
    );

    console.log(`[Markdown Paste Helper] ${platform} result:`, authResult);

    // 更新缓存
    const cache = await getCachedAuth();
    cache[platform] = {
      isAuthenticated: authResult.isAuthenticated,
      username: authResult.username,
      avatar: authResult.avatar,
      homeUrl: authResult.homeUrl,
      error: authResult.error,
      timestamp: Date.now(),
    };
    await setCachedAuth(cache);

    return {
      loggedIn: authResult.isAuthenticated,
      username: authResult.username,
      avatar: authResult.avatar,
      homeUrl: authResult.homeUrl,
      details: authResult.error || 'API check',
    };
  } catch (err) {
    console.error(`[Markdown Paste Helper] Error for ${platform}:`, err);

    // 缓存错误状态
    const cache = await getCachedAuth();
    cache[platform] = {
      isAuthenticated: false,
      error: err.message,
      timestamp: Date.now(),
    };
    await setCachedAuth(cache);

    return { loggedIn: false, error: err.message };
  }
}

// ===== Image Fetching =====

async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const blob = await response.blob();
    const mimeType = blob.type || "image/png";

    // Convert blob to base64 (can't send Blob through message passing)
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    return { success: true, base64, mimeType };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
