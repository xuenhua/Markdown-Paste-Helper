/**
 * Markdown Converter — markdown-it wrapper for content scripts
 * Provides MarkdownConverter global namespace
 */
(function () {
  'use strict';
  console.log('%c[Markdown Paste Helper] ✅ markdown-converter.js 已加载', 'color: lime; font-size: 14px;');
  // Initialize markdown-it with highlight.js
  const md = window.markdownit({
    html: true,
    breaks: false,
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

  // Detect if text is Markdown
  function isMarkdown(text) {
    if (!text || text.length < 10) return false;
    const patterns = [
      /^#{1,6}\s/m,           // Headings
      /^```/m,                // Code blocks
      /^\s*[-*+]\s/m,         // Unordered lists
      /^\s*\d+\.\s/m,         // Ordered lists
      /\[.+?\]\(.+?\)/,       // Links
      /!\[.*?\]\(.+?\)/,      // Images
      /^\|.+\|/m,             // Tables
      /^>\s/m,                // Blockquotes
      /\*\*.+?\*\*/,          // Bold
    ];
    const matchCount = patterns.filter(p => p.test(text)).length;
    return matchCount >= 2;
  }

  // Convert Markdown to clean semantic HTML (no inline styles)
  function toCleanHtml(markdown) {
    return md.render(markdown);
  }

  // Convert Markdown to HTML with inline styles (for WeChat etc.)
  function toStyledHtml(markdown, styles) {
    let html = md.render(markdown);

    const container = document.createElement('div');
    container.innerHTML = html;

    const tagMap = {
      H1: styles.h1 || '',
      H2: styles.h2 || '',
      H3: styles.h3 || '',
      H4: styles.h4 || '',
      H5: styles.h5 || '',
      H6: styles.h6 || '',
      P: styles.p || '',
      A: styles.a || '',
      STRONG: styles.strong || '',
      B: styles.strong || '',
      EM: styles.em || '',
      I: styles.em || '',
      BLOCKQUOTE: styles.blockquote || '',
      UL: styles.ul || '',
      OL: styles.ol || '',
      LI: styles.li || '',
      TABLE: styles.table || '',
      TH: styles.th || '',
      TD: styles.td || '',
      IMG: styles.img || '',
      HR: styles.hr || '',
    };

    function applyStyles(element) {
      const tagName = element.tagName;
      if (tagMap[tagName]) {
        element.setAttribute('style', tagMap[tagName]);
      }
      if (tagName === 'PRE') {
        element.setAttribute('style', styles.pre || '');
        const codeEl = element.querySelector('code');
        if (codeEl) codeEl.setAttribute('style', styles.code || '');
        return;
      }
      if (tagName === 'CODE' && element.parentElement && element.parentElement.tagName !== 'PRE') {
        element.setAttribute('style', styles.code_inline || '');
      }
      for (const child of element.children) {
        applyStyles(child);
      }
    }

    for (const child of container.children) {
      applyStyles(child);
    }

    return container.innerHTML;
  }

  // Export as global
  window.MarkdownConverter = {
    isMarkdown,
    toCleanHtml,
    toStyledHtml,
    md,
  };
})();
