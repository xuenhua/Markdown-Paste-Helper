/**
 * Zhihu platform handler
 *
 * Strategy: Let Zhihu's own Markdown parser handle the conversion.
 * We only do two things:
 * 1. Pre-process Markdown text (replace unsupported syntax)
 * 2. After user clicks "确认", auto-cleanup ALL empty blocks
 */
(function () {
  'use strict';
  console.log('%c[Markdown Paste Helper] ✅ zhihu.js 已加载', 'color: lime; font-size: 14px;');

  /**
   * Pre-process Markdown text before paste.
   * Converts syntax that Zhihu doesn't support into supported equivalents.
   */
  function preprocessText(text) {
    let processed = text;

    // 1. Convert task list checkboxes to emoji (知乎不支持 - [x] 语法)
    //    - [x] item → - ✅ item
    //    - [ ] item → - ⬜ item
    processed = processed.replace(/^(\s*)- \[x\] /gm, '$1- ✅ ');
    processed = processed.replace(/^(\s*)- \[ \] /gm, '$1- ⬜ ');

    // 2. Replace <details><summary>...</summary>...</details> with bold heading + content
    processed = processed.replace(
      /<details>\s*\n\s*<summary>([\s\S]*?)<\/summary>\s*\n([\s\S]*?)\n\s*<\/details>/gi,
      function (_, summary, content) {
        return `**${summary.trim()}**\n\n${content.trim()}`;
      }
    );
    // Fallback: single-line format
    processed = processed.replace(
      /<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi,
      function (_, summary, content) {
        return `**${summary.trim()}**\n\n${content.trim()}`;
      }
    );

    // 3. Replace GitHub-style alerts [!NOTE], [!TIP], [!WARNING] etc.
    processed = processed.replace(
      /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gm,
      function (_, type) {
        const labels = {
          NOTE: '📝 **注意**',
          TIP: '💡 **提示**',
          IMPORTANT: '❗ **重要**',
          WARNING: '⚠️ **警告**',
          CAUTION: '🚨 **危险**',
        };
        return `> ${labels[type] || '> **' + type + '**'}`;
      }
    );

    // 4. Remove excessive blank lines (3+ consecutive → 2)
    processed = processed.replace(/\n{3,}/g, '\n\n');

    console.log('[Markdown Paste Helper] 预处理完成');
    return processed;
  }

  /**
   * Watch for Zhihu's Markdown confirm button and trigger cleanup after click.
   */
  function init() {
    console.log('[Markdown Paste Helper] 知乎模式：开始监听确认按钮');

    const observer = new MutationObserver(() => {
      const allClickables = document.querySelectorAll('button, a, span[role="button"]');
      for (const el of allClickables) {
        const text = el.textContent.trim();
        if (text === '确认' && !el.dataset.mphBound) {
          el.dataset.mphBound = 'true';
          el.addEventListener('click', onConfirmClick);
          console.log('[Markdown Paste Helper] 已绑定确认按钮:', el.tagName);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function onConfirmClick() {
    console.log('[Markdown Paste Helper] 用户点击了确认，开始分轮清理空行...');

    const showToast = window._mdphShowToast;
    const removeToast = window._mdphRemoveToast;

    let progressToast = showToast
      ? showToast('⏳ 正在清理多余空行...', 'progress')
      : null;

    // Run cleanup at multiple intervals to handle image uploads still in progress
    const delays = [3000, 6000, 10000, 15000, 20000];
    delays.forEach((delay, idx) => {
      setTimeout(() => {
        console.log(`[Markdown Paste Helper] 第 ${delay / 1000}s 轮清理...`);
        const removed = cleanupEmptyBlocks();
        if (removed > 0 && progressToast) {
          progressToast.textContent = `⏳ 已清理 ${removed} 个多余空行，继续监控中...`;
        }
        // Last round of cleanup
        if (idx === delays.length - 1 && progressToast) {
          removeToast(progressToast);
          progressToast = null;
        }
      }, delay);
    });

    // Start auto-retrying failed image uploads
    startImageRetry();
  }

  // ===== Auto-retry failed image uploads =====

  function startImageRetry() {
    console.log('%c[Markdown Paste Helper] 🔄 开始监控图片上传失败...', 'color: orange; font-size: 13px;');

    const showToast = window._mdphShowToast;
    const removeToast = window._mdphRemoveToast;

    let retryToast = null;
    let totalRetried = 0;
    let elapsed = 0;
    const MAX_TIME = 60000;
    const CHECK_INTERVAL = 3000;

    const interval = setInterval(() => {
      elapsed += CHECK_INTERVAL;
      console.log(`[Markdown Paste Helper] 🔍 第 ${elapsed / 1000}s 次扫描上传失败...`);

      const failedImages = findFailedImages();
      if (failedImages.length > 0) {
        totalRetried += failedImages.length;
        console.log(`[Markdown Paste Helper] 发现 ${failedImages.length} 张上传失败的图片，开始重试...`);

        // Show or update retry toast
        if (!retryToast && showToast) {
          retryToast = showToast(`🔄 检测到 ${failedImages.length} 张图片上传失败，正在重试...`, 'progress');
        } else if (retryToast) {
          retryToast.textContent = `🔄 检测到 ${failedImages.length} 张图片上传失败，正在重试...`;
        }

        retryImages(failedImages);
      } else {
        console.log('[Markdown Paste Helper] 本轮未发现失败图片');
      }

      cleanupEmptyBlocks();

      if (elapsed >= MAX_TIME) {
        clearInterval(interval);
        const remaining = findFailedImages();

        if (retryToast) {
          removeToast(retryToast);
          retryToast = null;
        }

        if (remaining.length > 0) {
          console.log(`[Markdown Paste Helper] 超时停止，仍有 ${remaining.length} 张图片上传失败`);
          if (showToast) showToast(`⚠️ 仍有 ${remaining.length} 张图片上传失败，请手动重试`, 'warning');
        } else {
          console.log('[Markdown Paste Helper] 图片监控结束 ✅');
          if (totalRetried > 0 && showToast) {
            showToast(`✅ ${totalRetried} 张图片已全部重新上传成功`, 'success');
          }
          if (showToast) showToast('✅ 知乎文章处理完成', 'success');
        }
      }
    }, CHECK_INTERVAL);
  }

  /**
   * Find failed image containers.
   * Uses multiple strategies to locate the error indicator.
   */
  function findFailedImages() {
    const results = [];

    // Strategy 1: exact class match
    let icons = document.querySelectorAll('svg.ZDI--ExclamationCircle24');
    console.log(`[Markdown Paste Helper] [检测] svg.ZDI--ExclamationCircle24: ${icons.length} 个`);

    // Strategy 2: partial class match (in case of class name changes)
    if (icons.length === 0) {
      icons = document.querySelectorAll('svg[class*="ExclamationCircle"]');
      console.log(`[Markdown Paste Helper] [检测] svg[class*="ExclamationCircle"]: ${icons.length} 个`);
    }

    // Strategy 3: look for the "上传失败" text inside figure/image blocks only
    if (icons.length === 0) {
      const editor = document.querySelector('[contenteditable="true"]');
      if (editor) {
        // Only look inside figure or image wrapper elements, not in text blocks
        const figures = editor.querySelectorAll('figure, [data-block="true"]');
        figures.forEach(fig => {
          // Check if this block has an img element or is an image container
          const hasImgWrapper = fig.querySelector('img') ||
                                fig.querySelector('[class*="image"], [class*="Image"], [class*="upload"]');
          if (!hasImgWrapper && fig.textContent.includes('上传失败')) {
            // This might be a failed image (no img, shows error text)
            icons = [...icons, fig.querySelector('svg') || fig];
          }
        });
        console.log(`[Markdown Paste Helper] [检测] 文本匹配 (仅 figure/block 内): ${icons.length} 个`);
      }
    }

    // Strategy 4: find any SVG inside a block that also contains "上传失败" text
    if (icons.length === 0) {
      const allSvgs = document.querySelectorAll('[contenteditable="true"] svg');
      console.log(`[Markdown Paste Helper] [检测] 编辑器内所有 SVG: ${allSvgs.length} 个`);
      allSvgs.forEach(svg => {
        const parentBlock = svg.closest('[data-block="true"]') || svg.closest('figure');
        if (parentBlock) {
          const blockText = parentBlock.textContent.trim();
          if (blockText.includes('上传失败') || blockText.includes('重试')) {
            icons = [...icons, svg];
          }
        }
      });
      console.log(`[Markdown Paste Helper] [检测] 含「上传失败/重试」的 SVG 块: ${icons.length} 个`);
    }

    icons.forEach(svg => {
      const container = svg.closest('figure') ||
                        svg.closest('[data-block="true"]') ||
                        svg.parentElement?.parentElement;
      if (!container) return;

      const retries = parseInt(container.dataset.mphRetries || '0', 10);
      if (retries >= 3) return;

      results.push({ svg, container, retries });
    });

    return results;
  }

  /**
   * Retry uploading failed images by simulating hover → click retry.
   */
  async function retryImages(failedImages) {
    for (const { svg, container, retries } of failedImages) {
      try {
        // Increment retry counter
        container.dataset.mphRetries = String(retries + 1);
        console.log(`[Markdown Paste Helper] 重试第 ${retries + 1} 次:`, container);

        // Step 1: simulate hover to reveal the "重试" button
        const hoverTarget = svg.closest('div') || svg.parentElement;
        hoverTarget.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        hoverTarget.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

        // Step 2: wait for hover state to render
        await sleep(300);

        // Step 3: find and click the retry button/link
        // After hover, look for any clickable element with retry icon or text
        let retryBtn = container.querySelector('[class*="Retry"], [class*="retry"]');
        if (!retryBtn) {
          // Broader search: any element that appeared after hover
          const clickables = container.querySelectorAll('a, button, [role="button"], div[class*="css-"]');
          for (const el of clickables) {
            const text = el.textContent.trim();
            if (text === '重试' || el.querySelector('svg.ZDI--Refresh24, svg.ZDI--Refresh16, svg[class*="Refresh"]')) {
              retryBtn = el;
              break;
            }
          }
        }

        if (retryBtn) {
          retryBtn.click();
          console.log(`[Markdown Paste Helper] ✅ 已点击重试按钮`);
        } else {
          // Fallback: try clicking the whole hover area
          hoverTarget.click();
          console.log(`[Markdown Paste Helper] 未找到重试按钮，尝试点击容器`);
        }

        // Wait between retries to avoid overwhelming the server
        await sleep(2000);

      } catch (err) {
        console.error('[Markdown Paste Helper] 重试失败:', err);
      }
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Remove ALL empty blocks from the editor.
   *
   * Criteria: A block is considered "empty" if it has:
   * - No visible text (after stripping zero-width chars and &nbsp;)
   * - No media elements (img, figure, video, iframe, table)
   *
   * ALL empty blocks are removed. Draft.js CSS handles proper spacing
   * between paragraphs, headings, lists, etc. — extra empty blocks
   * only cause unwanted double/triple spacing.
   */
  function cleanupEmptyBlocks() {
    const contentRoot = document.querySelector('[data-contents="true"]') ||
                        document.querySelector('.DraftEditor-root') ||
                        document.querySelector('[contenteditable="true"]');
    if (!contentRoot) {
      console.log('[Markdown Paste Helper] 未找到编辑器内容区域');
      return;
    }

    // Get top-level block children (don't recurse into nested blocks)
    // Draft.js blocks have data-offset-key at the top level
    const topLevelBlocks = contentRoot.children;
    let removed = 0;

    // Iterate backwards to safely remove elements
    for (let i = topLevelBlocks.length - 1; i >= 0; i--) {
      const block = topLevelBlocks[i];

      // Skip non-element nodes
      if (block.nodeType !== Node.ELEMENT_NODE) continue;

      // Get text content, strip invisible chars
      const text = block.textContent
        .replace(/\u00A0/g, '')   // &nbsp;
        .replace(/\u200B/g, '')   // zero-width space
        .replace(/\uFEFF/g, '')   // BOM
        .trim();

      // Check for media/embedded content
      const hasMedia = block.querySelector('img, figure, video, iframe, table, hr');

      // If block has no text and no media → it's an empty block → remove it
      if (!text && !hasMedia) {
        block.remove();
        removed++;
      }
    }

    console.log(`[Markdown Paste Helper] 清理了 ${removed} 个多余空行`);
    return removed;
  }

  // Register platform handler
  window.PlatformHandlers = window.PlatformHandlers || {};
  window.PlatformHandlers.zhihu = {
    mode: 'preprocess-text',
    preprocessText,
    init,
    cleanupEmptyBlocks,
  };

  // Auto-initialize
  init();
})();
