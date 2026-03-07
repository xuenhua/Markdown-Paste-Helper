/**
 * 博客园 platform handler
 *
 * Strategy: preprocess-text mode.
 * 博客园 uses a native Markdown editor.
 * It accepts raw Markdown text directly.
 */
(function () {
  "use strict";
  console.log(
    "%c[Markdown Paste Helper] cnblogs.js loaded",
    "color: lime; font-size: 14px;",
  );

  function preprocessText(text) {
    let processed = text;

    processed = processed.replace(/^(\s*)- \[x\] /gm, "$1- ✅ ");
    processed = processed.replace(/^(\s*)- \[ \] /gm, "$1- ⬜ ");

    processed = processed.replace(
      /<details>\s*\n\s*<summary>([\s\S]*?)<\/summary>\s*\n([\s\S]*?)\n\s*<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`,
    );
    processed = processed.replace(
      /<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`,
    );

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

    processed = processed.replace(/\n{3,}/g, "\n\n");

    console.log("[Markdown Paste Helper] 博客园预处理完成");
    return processed;
  }

  window.PlatformHandlers = window.PlatformHandlers || {};
  window.PlatformHandlers.cnblogs = {
    mode: "preprocess-text",
    preprocessText,
  };
})();
