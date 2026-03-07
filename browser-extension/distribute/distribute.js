/**
 * Markdown 一键分发页面逻辑
 */
(function () {
  'use strict';

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

  // DOM elements
  const markdownInput = document.getElementById('markdownInput');
  const fileInput = document.getElementById('fileInput');
  const importBtn = document.getElementById('importBtn');
  const clearBtn = document.getElementById('clearBtn');
  const charCount = document.getElementById('charCount');
  const fileName = document.getElementById('fileName');
  const previewContent = document.getElementById('previewContent');
  const refreshPreviewBtn = document.getElementById('refreshPreviewBtn');
  const distributeBtn = document.getElementById('distributeBtn');

  // State
  let distributionId = null;
  const platformStatus = {};
  const selectedPlatforms = new Set();
  const dynamicUrls = {}; // 存储登录检测返回的动态 URL（如飞书用户主页）

  // Initialize markdown-it
  const md = window.markdownit({
    html: true,
    breaks: true,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
      if (lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
        try {
          return '<pre><code class="hljs language-' + lang + '">' +
                 hljs.highlight(str, { language: lang }).value +
                 '</code></pre>';
        } catch (_) {}
      }
      return '<pre><code>' + md.utils.escapeHtml(str) + '</code></pre>';
    },
  });

  // ===== Platform Selection & Login Detection =====

  document.querySelectorAll('.platform-item').forEach(item => {
    const platform = item.dataset.platform;
    const checkbox = item.querySelector('.checkbox-input');
    const clickableArea = item.querySelector('.platform-clickable');

    // Checkbox: toggle selection
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        selectedPlatforms.add(platform);
        item.classList.add('selected');
      } else {
        selectedPlatforms.delete(platform);
        item.classList.remove('selected');
      }
    });

    // Clickable area: open platform page (优先使用动态 URL)
    clickableArea.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = dynamicUrls[platform] || PLATFORM_URLS[platform];
      if (url) {
        window.open(url, '_blank');
      }
    });

    // Check login status
    checkLoginStatus(platform);
  });

  async function checkLoginStatus(platform) {
    const item = document.querySelector(`.platform-item[data-platform="${platform}"]`);
    const statusIndicator = item.querySelector('.status-indicator');
    const checkbox = item.querySelector('.checkbox-input');

    try {
      // Use background script to check login status via API
      const result = await chrome.runtime.sendMessage({
        type: 'check-login',
        platform,
        forceRefresh: false, // Use cache
      });

      console.log(`[Markdown Paste Helper] ${platform}:`, result);

      if (result.loggedIn) {
        // User is logged in
        statusIndicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        statusIndicator.className = 'status-indicator logged-in';
        item.classList.add('logged-in');

        // 保存动态 URL（如飞书用户主页）
        if (result.homeUrl) {
          dynamicUrls[platform] = result.homeUrl;
        }

        const title = `已登录 - 点击图标打开编辑器\n${result.username || ''}${result.details ? '\n' + result.details : ''}`;
        item.title = title;

        // Auto-select logged-in platforms
        checkbox.checked = true;
        selectedPlatforms.add(platform);
        item.classList.add('selected');
      } else {
        // User is not logged in
        statusIndicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
        statusIndicator.className = 'status-indicator not-logged-in';
        item.classList.add('not-logged-in');

        const title = `未登录 - 点击图标前往登录\n${result.details || result.error || ''}`;
        item.title = title;

        // Disable checkbox for not-logged-in platforms
        checkbox.disabled = true;
      }
    } catch (err) {
      // Error during detection
      console.error(`[Markdown Paste Helper] Error for ${platform}:`, err);
      statusIndicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';
      statusIndicator.className = 'status-indicator not-logged-in';
      item.title = `检测失败: ${err.message}`;
      checkbox.disabled = true;
    }
  }

  // ===== File Import =====

  importBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      markdownInput.value = event.target.result;
      fileName.textContent = file.name;
      updateCharCount();
      updatePreview();
    };
    reader.readAsText(file);
  });

  // Clear button
  clearBtn.addEventListener('click', () => {
    if (confirm('确定要清空编辑器内容吗？')) {
      markdownInput.value = '';
      fileName.textContent = '';
      updateCharCount();
      updatePreview();
    }
  });

  // Drag and drop support
  markdownInput.addEventListener('dragover', (e) => {
    e.preventDefault();
    markdownInput.style.background = '#f8f9ff';
  });

  markdownInput.addEventListener('dragleave', () => {
    markdownInput.style.background = '#fff';
  });

  markdownInput.addEventListener('drop', (e) => {
    e.preventDefault();
    markdownInput.style.background = '#fff';

    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt'))) {
      const reader = new FileReader();
      reader.onload = (event) => {
        markdownInput.value = event.target.result;
        fileName.textContent = file.name;
        updateCharCount();
        updatePreview();
      };
      reader.readAsText(file);
    }
  });

  // ===== Editor & Preview =====

  markdownInput.addEventListener('input', () => {
    updateCharCount();
    updatePreview();
  });

  function updateCharCount() {
    const count = markdownInput.value.length;
    charCount.textContent = `${count} 字符`;
  }

  function updatePreview() {
    const markdown = markdownInput.value.trim();

    if (!markdown) {
      previewContent.innerHTML = `
        <div class="preview-placeholder">
          <div class="placeholder-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg></div>
          <p>在左侧输入 Markdown 内容</p>
          <p class="placeholder-hint">预览将实时更新</p>
        </div>
      `;
      return;
    }

    try {
      const html = md.render(markdown);
      previewContent.innerHTML = html;
    } catch (err) {
      previewContent.innerHTML = `<p style="color: #ef5350;">预览渲染失败: ${err.message}</p>`;
    }
  }

  refreshPreviewBtn.addEventListener('click', () => {
    updatePreview();
  });

  // ===== Distribution =====

  distributeBtn.addEventListener('click', async () => {
    const markdown = markdownInput.value.trim();
    if (!markdown) {
      alert('请输入 Markdown 内容');
      return;
    }

    if (selectedPlatforms.size === 0) {
      alert('请至少选择一个已登录的平台');
      return;
    }

    // Disable button
    distributeBtn.disabled = true;
    distributeBtn.querySelector('.btn-text').textContent = '分发中...';

    // Clear previous status
    Object.keys(platformStatus).forEach(k => delete platformStatus[k]);

    // Initialize progress for selected platforms
    const platforms = Array.from(selectedPlatforms);
    platforms.forEach(platform => {
      platformStatus[platform] = { status: 'pending', startTime: Date.now() };

      // Update platform item visual state
      const item = document.querySelector(`.platform-item[data-platform="${platform}"]`);
      item.classList.remove('success', 'error');
      item.classList.add('pending');

      // Hide progress section initially
      const progressDiv = item.querySelector('.platform-progress');
      progressDiv.style.display = 'none';
    });

    // Send serial distribution request to background
    distributionId = `dist_${Date.now()}`;
    chrome.runtime.sendMessage({
      type: 'start-distribution',
      distributionId,
      markdown,
      platforms,
      platformNames: PLATFORM_NAMES,
    });
  });

  // ===== Progress Updates =====

  function updatePlatformProgress(platform, status, message) {
    const item = document.querySelector(`.platform-item[data-platform="${platform}"]`);
    if (!item) return;

    // Update visual state
    item.classList.remove('pending', 'distributing', 'success', 'error');

    if (status === 'in-progress') {
      item.classList.add('distributing');
    } else {
      item.classList.add(status);
    }

    // Update progress section
    const progressDiv = item.querySelector('.platform-progress');
    progressDiv.style.display = 'block';
    progressDiv.querySelector('.progress-message').textContent = message;

    // Update time
    if (platformStatus[platform]) {
      const elapsed = ((Date.now() - platformStatus[platform].startTime) / 1000).toFixed(1);
      progressDiv.querySelector('.progress-time').textContent = `${elapsed}s`;
    }
  }

  // Listen for progress updates from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'progress-update' && message.distributionId === distributionId) {
      const { platform, status, message: msg } = message;

      if (platform && platformStatus[platform]) {
        platformStatus[platform].status = status;
        updatePlatformProgress(platform, status, msg);
      }

      // Check if all done or special status
      if (status === 'all-complete') {
        distributeBtn.disabled = false;
        distributeBtn.querySelector('.btn-text').textContent = '开始分发';
        alert('所有平台分发完成！');
      }
    }
  });

  // Initialize
  updateCharCount();
  updatePreview();

})();
