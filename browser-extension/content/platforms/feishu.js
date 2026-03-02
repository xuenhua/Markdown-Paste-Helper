/**
 * Feishu (飞书) platform handler
 *
 * Strategy: convert-to-html mode.
 * Since preprocess-text + execCommand('paste') is unreliable on Feishu,
 * we convert Markdown to clean semantic HTML and inject it via the paste event.
 *
 * Pre-processing: convert unsupported syntax before HTML conversion.
 * Post-processing: strip inline styles, ensure clean HTML.
 */
(function () {
  'use strict';
  console.log('%c[Markdown Paste Helper] ✅ feishu.js 已加载', 'color: lime; font-size: 14px;');

  /**
   * Pre-process Markdown text before converting to HTML.
   */
  function preprocessMarkdown(text) {
    let processed = text;

    // 1. Replace <details><summary>...</summary>...</details>
    processed = processed.replace(
      /<details>\s*\n\s*<summary>([\s\S]*?)<\/summary>\s*\n([\s\S]*?)\n\s*<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`
    );
    processed = processed.replace(
      /<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`
    );

    // 2. Replace GitHub alerts
    processed = processed.replace(
      /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gm,
      (_, type) => {
        const labels = {
          NOTE: '📝 **注意**',
          TIP: '💡 **提示**',
          IMPORTANT: '❗ **重要**',
          WARNING: '⚠️ **警告**',
          CAUTION: '🚨 **危险**',
        };
        return `> ${labels[type]}`;
      }
    );

    // 3. Normalize table formatting (trim extra spaces)
    processed = processed.replace(/^(\|.+\|)$/gm, (line) => {
      if (/^\|[\s:-]+\|$/.test(line.replace(/[^|:\-\s]/g, ''))) {
        return line.replace(/\|\s*:?-+:?\s*(?=\|)/g, '| --- ');
      }
      return line.replace(/\|\s*(.*?)\s*(?=\|)/g, '| $1 ');
    });

    // 4. Clean excessive blank lines
    processed = processed.replace(/\n{3,}/g, '\n\n');

    return processed;
  }

  /**
   * Convert Markdown to clean semantic HTML for Feishu's Slate editor.
   */
  function getHtml(markdown) {
    // Pre-process Markdown first
    const processed = preprocessMarkdown(markdown);

    // Convert to HTML
    let html = window.MarkdownConverter.toCleanHtml(processed);

    // Post-process: clean up the HTML for Feishu
    const container = document.createElement('div');
    container.innerHTML = html;

    // Remove any inline styles (Feishu prefers clean HTML)
    container.querySelectorAll('[style]').forEach(el => {
      el.removeAttribute('style');
    });

    // Wrap all standalone images in <figure> for better Feishu compatibility
    container.querySelectorAll('p').forEach(p => {
      const imgs = p.querySelectorAll('img');
      if (imgs.length > 0) {
        const textOnly = p.textContent.replace(/\u00A0/g, '').trim();
        if (!textOnly) {
          // Pure image paragraph → convert to <figure>
          imgs.forEach(img => {
            const figure = document.createElement('figure');
            figure.appendChild(img.cloneNode(true));
            p.parentNode.insertBefore(figure, p);
          });
          p.remove();
        }
      }
    });

    // Also wrap any bare <img> not already in <figure>
    container.querySelectorAll('img').forEach(img => {
      if (img.parentElement.tagName !== 'FIGURE') {
        const figure = document.createElement('figure');
        img.parentNode.insertBefore(figure, img);
        figure.appendChild(img);
      }
    });

    // Remove empty paragraphs
    container.querySelectorAll('p').forEach(p => {
      const text = p.textContent.replace(/\u00A0/g, '').trim();
      if (!text && !p.querySelector('img, figure')) {
        p.remove();
      }
    });

    console.log('[Markdown Paste Helper] 飞书 HTML 转换完成');
    return container.innerHTML;
  }

  function postPasteCleanup() {
    // Feishu usually handles well, no cleanup needed for now
  }

  window.PlatformHandlers = window.PlatformHandlers || {};
  window.PlatformHandlers.feishu = {
    mode: 'convert-to-html',
    getHtml,
    postPasteCleanup,
  };
})();
