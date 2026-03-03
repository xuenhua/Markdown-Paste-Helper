/**
 * SegmentFault platform handler
 *
 * Strategy: preprocess-text mode.
 * SegmentFault uses a CodeMirror-based native Markdown editor.
 * It accepts raw Markdown text directly, so we only need to preprocess
 * unsupported syntax (details/summary, GitHub alerts, task lists).
 */
(function () {
  "use strict";
  console.log(
    "%c[Markdown Paste Helper] ✅ segmentfault.js 已加载",
    "color: lime; font-size: 14px;",
  );

  function preprocessText(text) {
    let processed = text;

    // 1. Convert task list checkboxes to emoji
    processed = processed.replace(/^(\s*)- \[x\] /gm, "$1- ✅ ");
    processed = processed.replace(/^(\s*)- \[ \] /gm, "$1- ⬜ ");

    // 2. Replace <details><summary>...</summary>...</details>
    processed = processed.replace(
      /<details>\s*\n\s*<summary>([\s\S]*?)<\/summary>\s*\n([\s\S]*?)\n\s*<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`,
    );
    processed = processed.replace(
      /<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`,
    );

    // 3. Replace GitHub-style alerts
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

    // 4. Clean excessive blank lines
    processed = processed.replace(/\n{3,}/g, "\n\n");

    console.log("[Markdown Paste Helper] SegmentFault 预处理完成");
    return processed;
  }

  window.PlatformHandlers = window.PlatformHandlers || {};
  window.PlatformHandlers.segmentfault = {
    mode: "preprocess-text",
    preprocessText,
  };
})();
