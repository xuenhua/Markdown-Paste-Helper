/**
 * 51CTO platform handler
 *
 * Strategy: convert-to-html mode, direct HTML paste.
 * 51CTO uses am-engine (AOMAO Editor), a rich text L1 editor.
 * am-engine can directly accept <img> tags in HTML paste,
 * so we don't need the marker + postPasteCleanup approach.
 */
(function () {
  "use strict";
  console.log(
    "%c[Markdown Paste Helper] ✅ 51cto.js 已加载",
    "color: lime; font-size: 14px;",
  );

  function preprocessMarkdown(text) {
    let processed = text;

    // Convert task list checkboxes to emoji (am-engine doesn't support <input> in lists)
    processed = processed.replace(/^(\s*)- \[x\] /gm, "$1- ✅ ");
    processed = processed.replace(/^(\s*)- \[ \] /gm, "$1- ⬜ ");

    // Replace <details><summary>
    processed = processed.replace(
      /<details>\s*\n\s*<summary>([\s\S]*?)<\/summary>\s*\n([\s\S]*?)\n\s*<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`,
    );
    processed = processed.replace(
      /<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`,
    );

    // Replace GitHub alerts
    processed = processed.replace(
      /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gm,
      (_, type) => {
        const labels = {
          NOTE: "📝 **注意**",
          TIP: "💡 **提示**",
          IMPORTANT: "❗ **重要**",
          WARNING: "⚠️ **警告**",
          CAUTION: "🚨 **危险**",
        };
        return `> ${labels[type]}`;
      },
    );

    // Clean excessive blank lines
    processed = processed.replace(/\n{3,}/g, "\n\n");

    return processed;
  }

  function getHtml(markdown) {
    const processed = preprocessMarkdown(markdown);
    let html = window.MarkdownConverter.toCleanHtml(processed);

    const container = document.createElement("div");
    container.innerHTML = html;

    // Remove inline styles (am-engine handles its own styling)
    container.querySelectorAll("[style]").forEach((el) => {
      el.removeAttribute("style");
    });

    // Remove empty paragraphs
    container.querySelectorAll("p").forEach((p) => {
      const text = p.textContent.replace(/\u00A0/g, "").trim();
      if (!text && !p.querySelector("img, figure")) {
        p.remove();
      }
    });

    return container.innerHTML;
  }

  window.PlatformHandlers = window.PlatformHandlers || {};
  window.PlatformHandlers["51cto"] = {
    mode: "convert-to-html",
    getHtml,
  };
})();
