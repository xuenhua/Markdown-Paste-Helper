/**
 * Markdown Paste Helper — Content Script Entry
 *
 * Detects the current platform and handles Markdown paste.
 *
 * Zhihu mode (preprocess-text):
 *   - Intercepts Cmd+V keydown BEFORE paste fires
 *   - Reads clipboard, pre-processes text (<details> → bold, etc.)
 *   - Writes modified text back to clipboard
 *   - Re-triggers paste with document.execCommand('paste')
 *   - Zhihu's Markdown detector sees the processed text
 *
 * Other modes (convert-to-html):
 *   - Intercepts paste event, converts Markdown to HTML
 */
(function () {
  'use strict';
  console.log('%c[Markdown Paste Helper] ✅ main.js 已加载', 'color: lime; font-size: 14px;');
  console.log('[Markdown Paste Helper] URL:', location.href);

  // ===== Toast Notification =====

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

  let toastContainer = null;

  function ensureToastContainer() {
    if (toastContainer && document.body.contains(toastContainer)) return;
    toastContainer = document.createElement('div');
    toastContainer.id = 'mdph-toast-container';
    toastContainer.style.cssText =
      'position:fixed; top:24px; right:24px; z-index:999999; ' +
      'display:flex; flex-direction:column; gap:8px; pointer-events:none;';
    document.body.appendChild(toastContainer);
  }

  function showToast(message, type) {
    ensureToastContainer();
    const toast = document.createElement('div');
    const colors = {
      info: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      success: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
      warning: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      progress: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    };
    toast.style.cssText =
      'padding:10px 18px; border-radius:10px; color:#fff; font-size:14px; ' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif; ' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.25); pointer-events:auto; ' +
      'opacity:0; transform:translateY(12px); transition:all 0.3s ease; ' +
      'background:' + (colors[type] || colors.info) + '; max-width:360px;';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
    const duration = type === 'progress' ? 60000 : 3000;
    const timer = setTimeout(() => removeToast(toast), duration);
    toast._timer = timer;
    return toast;
  }

  function removeToast(toast) {
    if (!toast || !toast.parentElement) return;
    clearTimeout(toast._timer);
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 300);
  }

  // Export for platform handlers (e.g. twitter.js postPasteCleanup)
  window._mdphShowToast = showToast;
  window._mdphRemoveToast = removeToast;

  // ===== Platform Detection =====

  function detectPlatform() {
    const host = location.hostname;
    const path = location.pathname;

    if (host === 'zhuanlan.zhihu.com' && (path.includes('/write') || path.endsWith('/edit'))) {
      return 'zhihu';
    }
    if (host === 'mp.weixin.qq.com') {
      return 'wechat';
    }
    if (host.endsWith('.feishu.cn') || host.endsWith('.larkoffice.com')) {
      return 'feishu';
    }
    if (host === 'x.com' && path.startsWith('/compose/articles')) {
      return 'twitter';
    }
    if (host === 'member.bilibili.com' && (path.includes('/upload/text') || path.includes('/article'))) {
      return 'bilibili';
    }
    if (host === 'mp.toutiao.com' && path.includes('/publish')) {
      return 'toutiao';
    }
    if (host === 'segmentfault.com' && path.includes('/write')) {
      return 'segmentfault';
    }
    if (host === 'blog.51cto.com' && path.includes('/publish')) {
      return '51cto';
    }
    if ((host === 'editor.juejin.cn' || host === 'juejin.cn') && path.includes('/editor')) {
      return 'juejin';
    }
    if ((host === 'editor.csdn.net' || host === 'mp.csdn.net') && (path.includes('/md') || path.includes('/editor'))) {
      return 'csdn';
    }
    if (host === 'i.cnblogs.com' && path.includes('/posts')) {
      return 'cnblogs';
    }
    return null;
  }

  // ===== Activate handler for a detected platform =====

  let activePlatform = null; // Track current active platform to avoid duplicate init

  function activateHandler(platform) {
    if (activePlatform === platform) return; // Already activated for this platform

    const handler = window.PlatformHandlers && window.PlatformHandlers[platform];
    if (!handler) return;

    activePlatform = platform;
    const mode = handler.mode || 'convert-to-html';
    console.log(`[Markdown Paste Helper] 已激活 — 平台: ${platform}, 模式: ${mode}`);

    // ===== Zhihu: Intercept Cmd+V to modify clipboard BEFORE paste =====

    if (mode === 'preprocess-text') {
      let isReTriggering = false;

      document.addEventListener('keydown', async function (e) {
        if (isReTriggering) return;
        if (!(e.metaKey || e.ctrlKey) || e.key !== 'v') return;

        // MUST preventDefault synchronously BEFORE any await!
        e.preventDefault();

        try {
          const text = await navigator.clipboard.readText();

          if (!window.MarkdownConverter.isMarkdown(text)) {
            console.log('[Markdown Paste Helper] 非 Markdown，跳过');
            isReTriggering = true;
            document.execCommand('paste');
            isReTriggering = false;
            return;
          }

          const processed = handler.preprocessText
            ? handler.preprocessText(text)
            : text;

          await navigator.clipboard.writeText(processed);
          console.log('[Markdown Paste Helper] ✅ 剪贴板已更新（text-only，已清除 HTML）');
          showToast(`✅ Markdown 已转换并粘贴至${PLATFORM_NAMES[platform]}`, 'success');

          isReTriggering = true;
          const editor = document.querySelector('[contenteditable="true"]');
          if (editor) editor.focus();
          document.execCommand('paste');
          isReTriggering = false;

          console.log('[Markdown Paste Helper] ✅ 已重新触发粘贴');

          if (handler.postPasteCleanup) {
            handler.postPasteCleanup();
          }
        } catch (err) {
          console.error('[Markdown Paste Helper] 剪贴板处理失败:', err);
          isReTriggering = false;
        }
      }, true);

      document.addEventListener('paste', function () {
        if (isReTriggering) {
          console.log('[Markdown Paste Helper] 重触发的粘贴，不再拦截');
        }
      }, true);
    }

    // ===== WeChat / X Articles: Write styled HTML to clipboard BEFORE native paste =====

    if (mode === 'keydown-html') {
      let isReTriggering = false;

      document.addEventListener('keydown', async function (e) {
        if (isReTriggering) return;
        if (!(e.metaKey || e.ctrlKey) || e.key !== 'v') return;

        // MUST preventDefault synchronously BEFORE any await!
        e.preventDefault();

        try {
          const text = await navigator.clipboard.readText();

          if (!text || !window.MarkdownConverter.isMarkdown(text)) {
            console.log('[Markdown Paste Helper] 非 Markdown，跳过');
            isReTriggering = true;
            document.execCommand('paste');
            isReTriggering = false;
            return;
          }

          console.log('[Markdown Paste Helper] 检测到 Markdown，开始生成 HTML...');
          
          const processed = handler.preprocessText ? handler.preprocessText(text) : text;
          const styledHtml = handler.getHtml(processed);

          try {
            const htmlBlob = new Blob([styledHtml], { type: 'text/html' });
            const textBlob = new Blob([processed], { type: 'text/plain' });
            await navigator.clipboard.write([
              new ClipboardItem({
                'text/html': htmlBlob,
                'text/plain': textBlob
              })
            ]);
            console.log('[Markdown Paste Helper] ✅ 剪贴板已写入带样式的 HTML');
          } catch (writeErr) {
            console.error('[Markdown Paste Helper] ClipboardItem 写入失败:', writeErr);
            await navigator.clipboard.writeText(processed);
          }

          isReTriggering = true;
          document.execCommand('paste');
          isReTriggering = false;

          console.log('[Markdown Paste Helper] ✅ 已重新触发粘贴');

          if (handler.postPasteCleanup) {
            handler.postPasteCleanup();
          } else {
            showToast(`✅ Markdown 已转换并粘贴至${PLATFORM_NAMES[platform]}`, 'success');
          }
        } catch (err) {
          console.error('[Markdown Paste Helper] 处理失败:', err);
          isReTriggering = false;
        }
      }, true);
    }

    // ===== Other platforms (Feishu etc.): Intercept paste to provide HTML =====

    if (mode === 'convert-to-html') {
      let isSyntheticPaste = false;

      document.addEventListener('paste', function (e) {
        // 跳过来自分发流程的 synthetic paste，避免二次处理导致图片重复
        if (e._fromDistribution) return;

        if (isSyntheticPaste) {
          console.log('[Markdown Paste Helper] 合成 paste 事件，放行');
          return;
        }

        const plainText = e.clipboardData.getData('text/plain');
        if (!plainText || !window.MarkdownConverter.isMarkdown(plainText)) {
          console.log('[Markdown Paste Helper] 非 Markdown 或空内容，跳过');
          return;
        }

        console.log('[Markdown Paste Helper] 检测到 Markdown，开始转换为 HTML...');
        const convertedHtml = handler.getHtml(plainText);

        const strategy = handler.pasteStrategy || 'synthetic-event';

        if (strategy === 'synthetic-event') {
          e.preventDefault();
          e.stopImmediatePropagation();
          // Strip image markdown syntax from text/plain to prevent Tiptap/ProseMirror
          // from parsing ![alt](url) and uploading images (postPasteCleanup handles images)
          const safeText = plainText.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

          const dt = new DataTransfer();
          dt.setData('text/html', convertedHtml);
          dt.setData('text/plain', safeText);

          const syntheticEvent = new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          });

          isSyntheticPaste = true;
          const editor = document.querySelector('[contenteditable="true"]') || e.target;
          editor.dispatchEvent(syntheticEvent);
          isSyntheticPaste = false;

          console.log('[Markdown Paste Helper] ✅ 合成 paste 事件已派发给编辑器');
          showToast(`✅ Markdown 已转换并粘贴至${PLATFORM_NAMES[platform]}`, 'success');
        } else if (strategy === 'insert-html') {
          const origGetData = e.clipboardData.getData.bind(e.clipboardData);
          try {
            e.clipboardData.getData = function (type) {
              if (type === 'text/html') return convertedHtml;
              return origGetData(type);
            };
            console.log('[Markdown Paste Helper] ✅ 已劫持 clipboardData.getData() 提供 HTML');
            showToast(`✅ Markdown 已转换并粘贴至${PLATFORM_NAMES[platform]}`, 'success');
          } catch (err) {
            console.error('[Markdown Paste Helper] Override failed:', err);
          }
        }

        if (handler.postPasteCleanup) {
          setTimeout(() => handler.postPasteCleanup(), 500);
        }
      }, true);
    }
  }

  // ===== Initial activation =====

  const platform = detectPlatform();
  if (platform) {
    activateHandler(platform);
  }

  // ===== Auto-Paste Support (for one-click distribution) =====

  // Check if there's a pending distribution on page load
  checkPendingDistribution();

  // Listen for auto-paste messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'auto-paste') {
      handleAutoPaste(message.markdown, message.platform);
    }
  });

  async function checkPendingDistribution() {
    const platform = detectPlatform();
    if (!platform) return;

    try {
      const result = await chrome.storage.local.get(['pendingDistribution']);
      const pending = result.pendingDistribution;

      if (pending && pending.platforms.includes(platform)) {
        console.log(`[Markdown Paste Helper] 检测到待分发内容，平台: ${platform}`);

        // Wait for editor to be ready
        const editorReady = await waitForEditor(platform, 15000);
        if (!editorReady) {
          console.error('[Markdown Paste Helper] 编辑器未就绪，超时');
          notifyPasteFailed(platform, '编辑器未检测到');
          return;
        }

        // Notify background that editor is ready
        chrome.runtime.sendMessage({
          type: 'editor-ready',
          platform,
        });
      }
    } catch (err) {
      console.error('[Markdown Paste Helper] 检查待分发内容失败:', err);
    }
  }

  async function handleAutoPaste(markdown, platform) {
    console.log(`[Markdown Paste Helper] 开始自动粘贴，平台: ${platform}`);

    const handler = window.PlatformHandlers && window.PlatformHandlers[platform];
    if (!handler) {
      console.error(`[Markdown Paste Helper] 未找到平台 handler: ${platform}`);
      notifyPasteFailed(platform, 'Handler 未找到');
      return;
    }

    try {
      await executeAutoPaste(markdown, handler, platform);
      console.log(`[Markdown Paste Helper] ✅ 自动粘贴完成: ${platform}`);
      notifyPasteComplete(platform);
    } catch (err) {
      console.error(`[Markdown Paste Helper] 自动粘贴失败: ${platform}`, err);
      notifyPasteFailed(platform, err.message);
    }
  }

  async function executeAutoPaste(markdown, handler, platform) {
    const mode = handler.mode || 'convert-to-html';

    if (mode === 'preprocess-text') {
      // Preprocess → write to clipboard → execCommand('paste')
      const processed = handler.preprocessText ? handler.preprocessText(markdown) : markdown;

      // 博客园使用 textarea，需要直接设置 value
      const textarea = document.querySelector('textarea#md-editor');
      if (textarea) {
        textarea.focus();
        await sleep(100);
        textarea.value = processed;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[Markdown Paste Helper] preprocess-text 模式 textarea 粘贴完成');
      } else {
        await navigator.clipboard.writeText(processed);
        await sleep(200);

        const editor = document.querySelector('[contenteditable="true"]');
        if (editor) editor.focus();
        await sleep(100);

        document.execCommand('paste');
        console.log('[Markdown Paste Helper] preprocess-text 模式粘贴完成');
      }

      if (handler.postPasteCleanup) {
        await sleep(500);
        handler.postPasteCleanup();
      }

    } else if (mode === 'keydown-html') {
      // Convert to HTML → write to clipboard via ClipboardItem → execCommand('paste')
      const processed = handler.preprocessText ? handler.preprocessText(markdown) : markdown;
      const styledHtml = handler.getHtml(processed);

      try {
        const htmlBlob = new Blob([styledHtml], { type: 'text/html' });
        const textBlob = new Blob([processed], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
          })
        ]);
        console.log('[Markdown Paste Helper] 剪贴板已写入带样式的 HTML');
      } catch (writeErr) {
        console.error('[Markdown Paste Helper] ClipboardItem 写入失败:', writeErr);
        await navigator.clipboard.writeText(processed);
      }

      await sleep(200);

      const editor = document.querySelector('[contenteditable="true"]');
      if (editor) editor.focus();
      await sleep(100);

      document.execCommand('paste');
      console.log('[Markdown Paste Helper] keydown-html 模式粘贴完成');

      if (handler.postPasteCleanup) {
        await sleep(500);
        handler.postPasteCleanup();
      }

    } else if (mode === 'convert-to-html') {
      // Convert to HTML → synthetic ClipboardEvent → dispatchEvent
      const convertedHtml = handler.getHtml(markdown);

      const dt = new DataTransfer();
      dt.setData('text/html', convertedHtml);
      dt.setData('text/plain', markdown);

      const syntheticEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });

      const editor = document.querySelector('[contenteditable="true"]') || document.body;
      if (editor.contentEditable === 'true') editor.focus();
      await sleep(100);

      editor.dispatchEvent(syntheticEvent);
      console.log('[Markdown Paste Helper] convert-to-html 模式粘贴完成');

      if (handler.postPasteCleanup) {
        await sleep(500);
        handler.postPasteCleanup();
      }
    }
  }

  async function waitForEditor(platform, timeout = 15000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // 博客园使用 textarea，其他平台使用 contenteditable
      const editor = document.querySelector('[contenteditable="true"]') ||
                     document.querySelector('textarea#md-editor');
      if (editor) {
        console.log('[Markdown Paste Helper] 编辑器已就绪');
        return true;
      }
      await sleep(500);
    }

    return false;
  }

  function notifyPasteComplete(platform) {
    chrome.runtime.sendMessage({
      type: 'paste-complete',
      platform,
    }).catch(() => {});
  }

  function notifyPasteFailed(platform, message) {
    chrome.runtime.sendMessage({
      type: 'paste-failed',
      platform,
      message,
    }).catch(() => {});
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===== SPA Navigation Support =====
  // For SPA sites like x.com, the content script may be injected on a
  // non-matching page (e.g. x.com home). We monitor URL changes and
  // activate the handler when the user navigates to a matching page.

  if (!platform && location.hostname === 'x.com') {
    console.log('[Markdown Paste Helper] 🔄 X SPA 模式：监听 URL 变化...');

    let lastUrl = location.href;

    function checkUrlChange() {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      const newPlatform = detectPlatform();
      if (newPlatform) {
        console.log(`[Markdown Paste Helper] 🔄 SPA 导航检测到平台: ${newPlatform}`);
        activateHandler(newPlatform);
      }
    }

    // Hook History API (pushState / replaceState)
    const origPushState = history.pushState;
    history.pushState = function () {
      origPushState.apply(this, arguments);
      checkUrlChange();
    };
    const origReplaceState = history.replaceState;
    history.replaceState = function () {
      origReplaceState.apply(this, arguments);
      checkUrlChange();
    };

    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', checkUrlChange);

    // Fallback: periodic check in case other mechanisms miss the change
    const urlPoller = setInterval(() => {
      checkUrlChange();
      // Stop polling once activated
      if (activePlatform) clearInterval(urlPoller);
    }, 1000);
  }

})();

