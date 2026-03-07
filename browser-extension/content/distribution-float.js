/**
 * Distribution Float Button
 * 分发流程中的悬浮控制按钮
 */
(function () {
  'use strict';

  // 分发逻辑只在顶层 frame 运行，避免 iframe 中的实例重复执行
  if (window !== window.top) return;

  console.log('[Markdown Paste Helper] Script loaded');

  let floatButton = null;
  let currentDistribution = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  // ===== Listen for distribution messages =====

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Markdown Paste Helper] Received message:', message.type);

    if (message.type === 'ping') {
      // Respond to ping to indicate content script is ready
      sendResponse({ ready: true });
      return true;
    }

    if (message.type === 'distribution-active') {
      currentDistribution = message;
      showFloatButton('waiting');
      checkEditorReady();
    }

    if (message.type === 'auto-paste') {
      executeAutoPaste(message.markdown);
    }
  });

  // ===== Float Button UI =====

  function showFloatButton(state) {
    if (!floatButton) {
      createFloatButton();
    }

    updateFloatButtonState(state);
    floatButton.style.display = 'flex';
  }

  function createFloatButton() {
    floatButton = document.createElement('div');
    floatButton.id = 'mdph-distribution-float';
    floatButton.className = 'mdph-float-button';

    // Load saved position or use default
    const savedPos = localStorage.getItem('mdph-float-position');
    const pos = savedPos ? JSON.parse(savedPos) : { bottom: '24px', right: '24px' };

    Object.assign(floatButton.style, {
      position: 'fixed',
      bottom: pos.bottom || '24px',
      right: pos.right || '24px',
      zIndex: '999999',
      display: 'none',
      flexDirection: 'column',
      gap: '12px',
      padding: '16px 20px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#fff',
      borderRadius: '12px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '14px',
      minWidth: '280px',
      cursor: 'move',
      userSelect: 'none',
    });

    floatButton.innerHTML = `
      <div class="mdph-float-header">
        <span class="mdph-float-icon">⏳</span>
        <span class="mdph-float-title">分发中...</span>
        <button class="mdph-float-close" title="收起">−</button>
      </div>
      <div class="mdph-float-content">
        <div class="mdph-float-message">检测编辑器中...</div>
        <div class="mdph-float-progress"></div>
      </div>
      <div class="mdph-float-actions"></div>
    `;

    // Drag functionality
    const header = floatButton.querySelector('.mdph-float-header');
    header.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);

    // Close button
    floatButton.querySelector('.mdph-float-close').addEventListener('click', (e) => {
      e.stopPropagation();
      floatButton.style.display = 'none';
    });

    document.body.appendChild(floatButton);
    addFloatButtonStyles();
  }

  function updateFloatButtonState(state) {
    if (!floatButton) return;

    const icon = floatButton.querySelector('.mdph-float-icon');
    const title = floatButton.querySelector('.mdph-float-title');
    const message = floatButton.querySelector('.mdph-float-message');
    const progress = floatButton.querySelector('.mdph-float-progress');
    const actions = floatButton.querySelector('.mdph-float-actions');

    const dist = currentDistribution;
    const current = dist ? dist.currentIndex + 1 : 0;
    const total = dist ? dist.queue.length : 0;
    const platformName = dist ? dist.platformNames[dist.queue[dist.currentIndex]] : '';

    progress.textContent = `${current} / ${total}`;

    switch (state) {
      case 'waiting':
        icon.textContent = '⚠️';
        title.textContent = '等待进入编辑器';
        const platform = dist ? dist.queue[dist.currentIndex] : '';
        if (platform === 'feishu') {
          message.textContent = `请在飞书中新建文档并进入编辑器`;
        } else {
          message.textContent = `请进入 ${platformName} 的编辑器页面`;
        }
        actions.innerHTML = `
          <button class="mdph-btn mdph-btn-secondary" data-action="skip">跳过此平台</button>
        `;
        break;

      case 'pasting':
        icon.textContent = '⏳';
        title.textContent = '正在粘贴';
        message.textContent = `正在粘贴到 ${platformName}...`;
        actions.innerHTML = '';
        break;

      case 'success':
        icon.textContent = '✅';
        title.textContent = '粘贴完成';
        message.textContent = `${platformName} 粘贴成功`;

        if (current < total) {
          const nextPlatform = dist.platformNames[dist.queue[dist.currentIndex + 1]];
          actions.innerHTML = `
            <button class="mdph-btn mdph-btn-primary" data-action="next">
              下一个平台: ${nextPlatform} →
            </button>
            <button class="mdph-btn mdph-btn-secondary" data-action="finish">完成分发</button>
          `;
        } else {
          actions.innerHTML = `
            <button class="mdph-btn mdph-btn-primary" data-action="finish">✓ 全部完成</button>
          `;
        }
        break;

      case 'error':
        icon.textContent = '❌';
        title.textContent = '粘贴失败';
        message.textContent = `${platformName} 粘贴失败`;
        actions.innerHTML = `
          <button class="mdph-btn mdph-btn-primary" data-action="retry">重试</button>
          <button class="mdph-btn mdph-btn-secondary" data-action="next">下一个平台 →</button>
        `;
        break;
    }

    // Bind action buttons
    actions.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', handleAction);
    });
  }

  function handleAction(e) {
    // 使用 closest 确保点击按钮内的子元素也能正确获取 action
    const btn = e.target.closest('[data-action]');
    const action = btn ? btn.dataset.action : null;
    console.log('[Markdown Paste Helper] Action:', action);

    switch (action) {
      case 'next':
      case 'skip':
        chrome.runtime.sendMessage({ type: 'next-platform' }).catch(err => {
          console.error('[Markdown Paste Helper] Failed to send next-platform:', err);
        });
        floatButton.style.display = 'none';
        break;

      case 'retry':
        updateFloatButtonState('waiting');
        checkEditorReady();
        break;

      case 'finish':
        chrome.runtime.sendMessage({ type: 'complete-distribution' }).catch(err => {
          console.error('[Markdown Paste Helper] Failed to send complete-distribution:', err);
        });
        floatButton.style.display = 'none';
        break;
    }
  }

  // ===== Drag functionality =====

  function startDrag(e) {
    if (e.target.classList.contains('mdph-float-close')) return;
    isDragging = true;
    const rect = floatButton.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    floatButton.style.cursor = 'grabbing';
  }

  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();

    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;

    floatButton.style.left = `${x}px`;
    floatButton.style.top = `${y}px`;
    floatButton.style.right = 'auto';
    floatButton.style.bottom = 'auto';
  }

  function stopDrag() {
    if (!isDragging) return;
    isDragging = false;
    floatButton.style.cursor = 'move';

    // Save position
    const rect = floatButton.getBoundingClientRect();
    const pos = {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
    };
    localStorage.setItem('mdph-float-position', JSON.stringify(pos));
  }

  // ===== Editor Detection =====

  /**
   * 判断当前页面是否为飞书文档编辑页面
   * 飞书首页、drive/home 等非编辑页面不应触发粘贴
   */
  function isFeishuEditorPage() {
    const path = window.location.pathname;
    // 文档编辑页 URL 包含 /docx/ /wiki/ /docs/ /sheets/ /minutes/ 等
    // 排除首页 /drive/home/ 和根路径
    return /\/(docx|wiki|docs|sheets|minutes|base|slides)\//i.test(path);
  }

  function findEditor() {
    // Platform-specific editor selectors based on README.md
    const platform = currentDistribution?.queue[currentDistribution.currentIndex];

    let editor = null;
    let editorDoc = document;

    // Try platform-specific selectors first
    switch (platform) {
      case 'zhihu':
        // 知乎: 自研 Markdown (Draft.js based)
        editor = document.querySelector('[data-contents="true"]') ||
                 document.querySelector('.DraftEditor-root [contenteditable="true"]') ||
                 document.querySelector('[contenteditable="true"]');
        break;

      case 'wechat':
        // 公众号: 自研富文本
        editor = document.querySelector('#edui1_iframeholder iframe')?.contentDocument?.body ||
                 document.querySelector('[contenteditable="true"]');
        break;

      case 'feishu':
        // 飞书: Slate.js — 只在文档编辑页匹配，避免在首页误触发
        if (isFeishuEditorPage()) {
          editor = document.querySelector('[data-slate-editor="true"]') ||
                   document.querySelector('.lark-editor [contenteditable="true"]');
        }
        break;

      case 'twitter':
        // X Articles: Draft.js
        editor = document.querySelector('[data-contents="true"]') ||
                 document.querySelector('.DraftEditor-root [contenteditable="true"]') ||
                 document.querySelector('[contenteditable="true"]');
        break;

      case 'bilibili':
        // B站专栏: Tiptap/ProseMirror (in iframe)
        const biliIframes = document.querySelectorAll('iframe');
        for (const iframe of biliIframes) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            editor = iframeDoc.querySelector('.tiptap.ProseMirror[contenteditable="true"]') ||
                     iframeDoc.querySelector('.ProseMirror[contenteditable="true"]') ||
                     iframeDoc.querySelector('[contenteditable="true"]');
            if (editor) {
              editorDoc = iframeDoc;
              console.log('[Markdown Paste Helper] B站 editor found in iframe');
              break;
            }
          } catch (e) {
            // Cross-origin iframe, skip
          }
        }
        break;

      case 'toutiao':
        // 头条号: Syllepsis/ProseMirror
        editor = document.querySelector('.ProseMirror[contenteditable="true"]') ||
                 document.querySelector('[contenteditable="true"]');
        break;

      case 'segmentfault':
        // SegmentFault: CodeMirror
        editor = document.querySelector('.CodeMirror') ||
                 document.querySelector('textarea[name="content"]') ||
                 document.querySelector('[contenteditable="true"]');
        break;

      case '51cto':
        // 51CTO: am-engine (AOMAO)
        editor = document.querySelector('.am-engine[data-element="root"][contenteditable="true"]') ||
                 document.querySelector('.am-engine') ||
                 document.querySelector('[contenteditable="true"]');
        break;

      case 'juejin':
        // 掘金: ByteMD Markdown editor
        editor = document.querySelector('.bytemd-editor .CodeMirror') ||
                 document.querySelector('.CodeMirror') ||
                 document.querySelector('[contenteditable="true"]');
        break;

      case 'csdn':
        // CSDN: Markdown editor
        editor = document.querySelector('.editor__inner .CodeMirror') ||
                 document.querySelector('.CodeMirror') ||
                 document.querySelector('[contenteditable="true"]');
        break;

      case 'cnblogs':
        // 博客园: Markdown editor
        editor = document.querySelector('#Editor_Edit_EditorBody .CodeMirror') ||
                 document.querySelector('.CodeMirror') ||
                 document.querySelector('[contenteditable="true"]');
        break;

      default:
        // Fallback: generic contenteditable
        editor = document.querySelector('[contenteditable="true"]');
    }

    // If still not found, try generic selectors
    if (!editor) {
      editor = document.querySelector('[contenteditable="true"]') ||
               document.querySelector('.ProseMirror') ||
               document.querySelector('.am-engine') ||
               document.querySelector('.DraftEditor-root') ||
               document.querySelector('.CodeMirror');
    }

    // Last resort: check all iframes
    if (!editor) {
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          editor = iframeDoc.querySelector('[contenteditable="true"]') ||
                   iframeDoc.querySelector('.ProseMirror') ||
                   iframeDoc.querySelector('.tiptap');
          if (editor) {
            editorDoc = iframeDoc;
            console.log('[Markdown Paste Helper] Editor found in iframe');
            break;
          }
        } catch (e) {
          // Cross-origin iframe, skip
        }
      }
    }

    return { editor, editorDoc };
  }

  async function checkEditorReady() {
    console.log('[Markdown Paste Helper] Checking editor...');

    const maxAttempts = 120; // 60 seconds — 给用户足够时间手动导航到编辑器
    let attempts = 0;

    const checkInterval = setInterval(async () => {
      attempts++;

      const { editor } = findEditor();

      if (editor) {
        clearInterval(checkInterval);
        const platform = currentDistribution.queue[currentDistribution.currentIndex];
        console.log(`[Markdown Paste Helper] ${platform} editor detected!`, editor);

        // Wait a bit for editor to fully initialize
        await sleep(1000);

        // Auto paste immediately
        await executeAutoPaste(currentDistribution.markdown);
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.warn('[Markdown Paste Helper] Editor detection timeout');
        updateFloatButtonState('error');
      }
    }, 500);
  }

  // ===== Auto Paste =====

  async function executeAutoPaste(markdown) {
    console.log('[Markdown Paste Helper] Executing auto paste...');
    updateFloatButtonState('pasting');

    const platform = currentDistribution.queue[currentDistribution.currentIndex];
    const handler = window.PlatformHandlers && window.PlatformHandlers[platform];

    if (!handler) {
      console.error('[Markdown Paste Helper] Handler not found:', platform);
      updateFloatButtonState('error');
      chrome.runtime.sendMessage({
        type: 'paste-failed',
        platform,
        message: 'Handler 未找到',
      });
      return;
    }

    try {
      const mode = handler.mode || 'convert-to-html';
      const { editor, editorDoc } = findEditor();

      if (!editor) {
        throw new Error('编辑器未找到');
      }

      // 记录粘贴前的编辑器内容长度，用于验证粘贴是否真正成功
      const contentBefore = (editor.textContent || '').replace(/\s/g, '').length;

      if (mode === 'preprocess-text') {
        const processed = handler.preprocessText ? handler.preprocessText(markdown) : markdown;

        if (editor.contentEditable === 'true') editor.focus();
        await sleep(100);

        // 优先尝试 synthetic ClipboardEvent（不受安全策略限制）
        const dt = new DataTransfer();
        dt.setData('text/plain', processed);
        const syntheticEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });
        syntheticEvent._fromDistribution = true;
        editor.dispatchEvent(syntheticEvent);

        // 等待编辑器处理粘贴事件
        await sleep(500);

        // 验证是否粘贴成功，如果没有则尝试 execCommand fallback
        const contentAfterSynthetic = (editor.textContent || '').replace(/\s/g, '').length;
        if (contentAfterSynthetic <= contentBefore) {
          console.log('[Markdown Paste Helper] Synthetic paste did not work, trying clipboard + execCommand...');
          await navigator.clipboard.writeText(processed);
          await sleep(200);
          editor.focus();
          await sleep(100);
          editorDoc.execCommand('paste');
        }

      } else if (mode === 'keydown-html') {
        const processed = handler.preprocessText ? handler.preprocessText(markdown) : markdown;
        const styledHtml = handler.getHtml(processed);

        if (editor.contentEditable === 'true') editor.focus();
        await sleep(100);

        // 优先尝试 synthetic ClipboardEvent
        const dt = new DataTransfer();
        dt.setData('text/html', styledHtml);
        dt.setData('text/plain', processed);
        const syntheticEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });
        syntheticEvent._fromDistribution = true;
        editor.dispatchEvent(syntheticEvent);

        await sleep(500);

        // 验证是否粘贴成功，如果没有则尝试 clipboard API + execCommand fallback
        const contentAfterSynthetic = (editor.textContent || '').replace(/\s/g, '').length;
        if (contentAfterSynthetic <= contentBefore) {
          console.log('[Markdown Paste Helper] Synthetic paste did not work, trying clipboard + execCommand...');
          try {
            const htmlBlob = new Blob([styledHtml], { type: 'text/html' });
            const textBlob = new Blob([processed], { type: 'text/plain' });
            await navigator.clipboard.write([
              new ClipboardItem({
                'text/html': htmlBlob,
                'text/plain': textBlob
              })
            ]);
          } catch (writeErr) {
            await navigator.clipboard.writeText(processed);
          }
          await sleep(200);
          editor.focus();
          await sleep(100);
          editorDoc.execCommand('paste');
        }

        if (handler.postPasteCleanup) {
          await sleep(500);
          try {
            await handler.postPasteCleanup();
          } catch (cleanupErr) {
            console.warn('[Markdown Paste Helper] postPasteCleanup error (non-fatal):', cleanupErr);
          }
        }

      } else if (mode === 'convert-to-html') {
        const convertedHtml = handler.getHtml(markdown);

        // Strip image markdown syntax from text/plain to prevent Tiptap/ProseMirror
        // from parsing ![alt](url) and uploading images (postPasteCleanup handles images)
        const safeText = markdown.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

        const dt = new DataTransfer();
        dt.setData('text/html', convertedHtml);
        dt.setData('text/plain', safeText);

        const syntheticEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });
        syntheticEvent._fromDistribution = true;

        if (editor.contentEditable === 'true') editor.focus();
        await sleep(100);

        editor.dispatchEvent(syntheticEvent);

        if (handler.postPasteCleanup) {
          await sleep(500);
          try {
            await handler.postPasteCleanup();
          } catch (cleanupErr) {
            console.warn('[Markdown Paste Helper] postPasteCleanup error (non-fatal):', cleanupErr);
          }
        }
      }

      // 最终验证：粘贴后编辑器内容是否真的增加了
      await sleep(300);
      const contentAfter = (editor.textContent || '').replace(/\s/g, '').length;
      if (contentAfter > contentBefore) {
        console.log('[Markdown Paste Helper] Paste verified successful');
        updateFloatButtonState('success');
        chrome.runtime.sendMessage({
          type: 'paste-complete',
          platform,
        });
      } else {
        console.warn('[Markdown Paste Helper] Paste did not change editor content');
        throw new Error('粘贴未生效，编辑器内容未变化');
      }

    } catch (err) {
      console.error('[Markdown Paste Helper] Paste failed:', err);
      updateFloatButtonState('error');

      chrome.runtime.sendMessage({
        type: 'paste-failed',
        platform,
        message: err.message,
      });
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===== Styles =====

  function addFloatButtonStyles() {
    if (document.getElementById('mdph-float-styles')) return;

    const style = document.createElement('style');
    style.id = 'mdph-float-styles';
    style.textContent = `
      .mdph-float-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }

      .mdph-float-icon {
        font-size: 20px;
      }

      .mdph-float-title {
        flex: 1;
        font-weight: 600;
        font-size: 15px;
      }

      .mdph-float-close {
        width: 24px;
        height: 24px;
        border: none;
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        transition: background 0.2s;
      }

      .mdph-float-close:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .mdph-float-content {
        margin-bottom: 12px;
      }

      .mdph-float-message {
        font-size: 13px;
        opacity: 0.95;
        margin-bottom: 8px;
      }

      .mdph-float-progress {
        font-size: 12px;
        opacity: 0.8;
        font-weight: 500;
      }

      .mdph-float-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .mdph-btn {
        padding: 10px 16px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
      }

      .mdph-btn-primary {
        background: #fff;
        color: #667eea;
      }

      .mdph-btn-primary:hover {
        background: #f0f0f0;
        transform: translateY(-1px);
      }

      .mdph-btn-secondary {
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
      }

      .mdph-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .mdph-btn:active {
        transform: translateY(0);
      }
    `;

    document.head.appendChild(style);
  }

})();
