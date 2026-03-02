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

    if (host === 'zhuanlan.zhihu.com' && path.endsWith('/edit')) {
      return 'zhihu';
    }
    if (host === 'mp.weixin.qq.com') {
      return 'wechat';
    }
    if (host.endsWith('.feishu.cn') || host.endsWith('.larkoffice.com')) {
      return 'feishu';
    }
    if (host === 'x.com' && path.startsWith('/compose/articles/edit/')) {
      return 'twitter';
    }
    return null;
  }

  const platform = detectPlatform();
  if (!platform) return;

  const handler = window.PlatformHandlers && window.PlatformHandlers[platform];
  if (!handler) return;

  const mode = handler.mode || 'convert-to-html';
  console.log(`[Markdown Paste Helper] 已激活 — 平台: ${platform}, 模式: ${mode}`);

  // ===== Zhihu: Intercept Cmd+V to modify clipboard BEFORE paste =====

  if (mode === 'preprocess-text') {
    let isReTriggering = false;

    document.addEventListener('keydown', async function (e) {
      if (isReTriggering) return;
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'v') return;

      // MUST preventDefault synchronously BEFORE any await!
      // Otherwise the browser fires the native paste while we're awaiting.
      e.preventDefault();

      try {
        const text = await navigator.clipboard.readText();

        if (!window.MarkdownConverter.isMarkdown(text)) {
          console.log('[Markdown Paste Helper] 非 Markdown，跳过');
          // Not markdown — re-trigger normal paste since we already prevented default
          isReTriggering = true;
          document.execCommand('paste');
          isReTriggering = false;
          return;
        }

        const processed = handler.preprocessText
          ? handler.preprocessText(text)
          : text;

        // Write text-only to clipboard (clears text/html)
        await navigator.clipboard.writeText(processed);
        console.log('[Markdown Paste Helper] ✅ 剪贴板已更新（text-only，已清除 HTML）');
        showToast(`✅ Markdown 已转换并粘贴至${PLATFORM_NAMES[platform]}`, 'success');

        // Re-trigger paste — platform reads pure text/plain
        isReTriggering = true;
        const editor = document.querySelector('[contenteditable="true"]');
        if (editor) editor.focus();
        document.execCommand('paste');
        isReTriggering = false;

        console.log('[Markdown Paste Helper] ✅ 已重新触发粘贴');
      } catch (err) {
        console.error('[Markdown Paste Helper] 剪贴板处理失败:', err);
        isReTriggering = false;
      }
    }, true);

    // Skip paste interception for Zhihu — all handled in keydown
    document.addEventListener('paste', function () {
      if (isReTriggering) {
        console.log('[Markdown Paste Helper] 重触发的粘贴，不再拦截');
      }
    }, true);
  }
  // ===== WeChat: Write styled HTML to clipboard BEFORE native paste =====

  if (mode === 'keydown-html') {
    let isReTriggering = false;

    document.addEventListener('keydown', async function (e) {
      if (isReTriggering) return;
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'v') return;

      // MUST preventDefault synchronously BEFORE any await!
      // Otherwise the browser fires the default paste while we're awaiting.
      e.preventDefault();

      try {
        const text = await navigator.clipboard.readText();

        if (!text || !window.MarkdownConverter.isMarkdown(text)) {
          console.log('[Markdown Paste Helper] 非 Markdown，跳过');
          // Not markdown — trigger a normal paste manually since we already prevented default
          isReTriggering = true;
          document.execCommand('paste');
          isReTriggering = false;
          return;
        }

        console.log('[Markdown Paste Helper] 检测到 Markdown，开始生成 HTML...');
        
        // Preprocess Markdown
        const processed = handler.preprocessText ? handler.preprocessText(text) : text;
        // Convert to styled HTML
        const styledHtml = handler.getHtml(processed);

        // Write styled HTML + plain text to real system clipboard
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
          // Fallback: just write text
          await navigator.clipboard.writeText(processed);
        }

        // Now re-trigger paste — editor reads the real system clipboard
        isReTriggering = true;
        document.execCommand('paste');
        isReTriggering = false;

        console.log('[Markdown Paste Helper] ✅ 已重新触发粘贴');

        // Run post-paste cleanup (e.g. X code block auto-insertion)
        if (handler.postPasteCleanup) {
          // Twitter: postPasteCleanup handles its own toast lifecycle
          handler.postPasteCleanup(); // async, runs in background
        } else {
          showToast(`✅ Markdown 已转换并粘贴至${PLATFORM_NAMES[platform]}`, 'success');
        }
      } catch (err) {
        console.error('[Markdown Paste Helper] 处理失败:', err);
        isReTriggering = false;
      }
    }, true);
  }

  // ===== Other platforms: Intercept paste to provide HTML =====

  if (mode === 'convert-to-html') {
    let isSyntheticPaste = false;

    document.addEventListener('paste', function (e) {
      // Skip our own synthetic paste event — let it flow to Slate
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

      // Choose paste strategy based on platform requirements
      const strategy = handler.pasteStrategy || 'synthetic-event'; // Default Feishu

      if (strategy === 'synthetic-event') {
        // Block the original paste completely for Slate
        e.preventDefault();
        e.stopImmediatePropagation();
        // Create a new DataTransfer with our HTML
        const dt = new DataTransfer();
        dt.setData('text/html', convertedHtml);
        dt.setData('text/plain', plainText);

        // Create a synthetic ClipboardEvent
        const syntheticEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });

        // Dispatch to the editor — Slate will process this naturally
        isSyntheticPaste = true;
        const editor = document.querySelector('[contenteditable="true"]') || e.target;
        editor.dispatchEvent(syntheticEvent);
        isSyntheticPaste = false;

        console.log('[Markdown Paste Helper] ✅ 合成 paste 事件已派发给编辑器');
        showToast(`✅ Markdown 已转换并粘贴至${PLATFORM_NAMES[platform]}`, 'success');
      } else if (strategy === 'insert-html') {
        // For WeChat: simply override getData. Do NOT preventDefault!
        // WeChat's built-in paste handler will call getData('text/html')
        // and process our styled HTML perfectly.
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
})();
