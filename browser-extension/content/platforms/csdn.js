/**
 * CSDN platform handler
 *
 * Strategy: preprocess-text mode.
 * CSDN uses a native Markdown editor.
 * It accepts raw Markdown text directly.
 *
 * Post-paste: Detects images that failed CSDN's external link transfer
 * and re-uploads them via the extension's background worker.
 */
(function () {
  "use strict";
  console.log(
    "%c[Markdown Paste Helper] csdn.js loaded",
    "color: lime; font-size: 14px;",
  );

  // 转存失败的占位图 URL 前缀
  const FAILED_IMG_PREFIX =
    "https://img-home.csdnimg.cn/images/20230724024159.png?origin_url=";

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

    console.log("[Markdown Paste Helper] CSDN 预处理完成");
    return processed;
  }

  // ===== Post-Paste Cleanup: Fix Failed Image Transfers =====

  async function postPasteCleanup() {
    console.log("[Markdown Paste Helper] CSDN postPasteCleanup: 开始检测转存失败的图片...");

    if (window._mdphShowToast) {
      window._mdphShowToast("⏳ 等待 CSDN 图片转存完成...", "progress");
    }

    // 等待 CSDN 完成图片转存（通常需要几秒）
    await sleep(8000);

    // 获取编辑器内容
    const editor = getEditorContent();
    if (!editor) {
      console.warn("[Markdown Paste Helper] CSDN 编辑器未找到");
      return;
    }

    const content = editor.getValue ? editor.getValue() : editor.value;
    if (!content) {
      console.warn("[Markdown Paste Helper] 编辑器内容为空");
      return;
    }

    // 查找转存失败的图片
    // 模式: ![外链图片转存失败...](https://img-home.csdnimg.cn/images/20230724024159.png?origin_url=ENCODED_URL&pos_id=...)
    const failedPattern =
      /!\[外链图片转存失败[^\]]*\]\((https:\/\/img-home\.csdnimg\.cn\/images\/20230724024159\.png\?origin_url=([^&]+)&[^)]*)\)/g;

    const failures = [];
    let match;
    while ((match = failedPattern.exec(content)) !== null) {
      const fullUrl = match[1];
      const encodedOrigUrl = match[2];
      const originalUrl = decodeURIComponent(encodedOrigUrl);
      failures.push({
        fullMatch: match[0],
        failedUrl: fullUrl,
        originalUrl,
      });
    }

    if (failures.length === 0) {
      console.log("[Markdown Paste Helper] CSDN: 所有图片转存成功，无需修复");
      if (window._mdphShowToast) {
        window._mdphShowToast("✅ CSDN 图片全部转存成功", "success");
      }
      return;
    }

    console.log(
      `[Markdown Paste Helper] CSDN: 发现 ${failures.length} 张转存失败的图片，开始重新上传...`,
    );

    if (window._mdphShowToast) {
      window._mdphShowToast(
        `🔄 发现 ${failures.length} 张图片转存失败，正在重新上传...`,
        "progress",
      );
    }

    let updatedContent = content;
    let successCount = 0;
    let failCount = 0;

    for (const item of failures) {
      try {
        // 从 URL 中推断图片后缀
        const urlPath = new URL(item.originalUrl).pathname;
        const suffix = urlPath.split(".").pop() || "png";

        console.log(
          `[Markdown Paste Helper] 重新上传: ${item.originalUrl} (${suffix})`,
        );

        const result = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: "csdn-upload-image", url: item.originalUrl, suffix },
            resolve,
          );
        });

        if (result && result.success && result.url) {
          // 将失败的 markdown 图片语法替换为新的 CSDN URL
          // 原始: ![外链图片转存失败...](failed_url)
          // 替换为: ![image](csdn_url)
          const newMarkdown = `![image](${result.url})`;
          updatedContent = updatedContent.replace(item.fullMatch, newMarkdown);
          successCount++;
          console.log(
            `[Markdown Paste Helper] ✅ 上传成功: ${result.url}`,
          );
        } else {
          failCount++;
          console.error(
            `[Markdown Paste Helper] ❌ 上传失败: ${result?.error || "未知错误"}`,
          );
        }
      } catch (err) {
        failCount++;
        console.error(
          `[Markdown Paste Helper] ❌ 上传异常: ${err.message}`,
        );
      }

      // 间隔避免并发
      await sleep(500);
    }

    // 替换编辑器内容
    if (successCount > 0) {
      setEditorContent(updatedContent);
      console.log(
        `[Markdown Paste Helper] CSDN 编辑器内容已更新 (${successCount} 张成功, ${failCount} 张失败)`,
      );
    }

    if (window._mdphShowToast) {
      if (failCount === 0) {
        window._mdphShowToast(
          `✅ ${successCount} 张图片重新上传成功`,
          "success",
        );
      } else {
        window._mdphShowToast(
          `⚠️ ${successCount} 张成功, ${failCount} 张失败`,
          "warning",
        );
      }
    }
  }

  // ===== Editor Helpers =====

  /**
   * 获取 CSDN 编辑器实例
   * CSDN 使用 StackEdit (cledit) 编辑器，底层不是标准 CodeMirror
   * 内容存储在 contenteditable 的 .cledit-section 中，
   * 但实际 Markdown 源码通过内部 API 管理
   */
  function getEditorContent() {
    // 方法 1: 查找 CodeMirror 实例
    const cmElement = document.querySelector(".CodeMirror");
    if (cmElement && cmElement.CodeMirror) {
      return cmElement.CodeMirror;
    }

    // 方法 2: 查找 textarea
    const textarea = document.querySelector("textarea.editor__inner") ||
      document.querySelector("textarea");
    if (textarea) {
      return textarea;
    }

    // 方法 3: CSDN 的 cledit 编辑器 — 通过 contenteditable 获取文本
    const cledit = document.querySelector(".editor__inner");
    if (cledit) {
      return {
        getValue: () => cledit.textContent,
        setValue: (val) => {
          // cledit 编辑器不能直接设置 textContent，需要触发 input 事件
          cledit.textContent = val;
          cledit.dispatchEvent(new Event("input", { bubbles: true }));
        },
      };
    }

    return null;
  }

  function setEditorContent(content) {
    const cmElement = document.querySelector(".CodeMirror");
    if (cmElement && cmElement.CodeMirror) {
      cmElement.CodeMirror.setValue(content);
      return;
    }

    const textarea = document.querySelector("textarea.editor__inner") ||
      document.querySelector("textarea");
    if (textarea) {
      textarea.value = content;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const cledit = document.querySelector(".editor__inner");
    if (cledit) {
      cledit.textContent = content;
      cledit.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  window.PlatformHandlers = window.PlatformHandlers || {};
  window.PlatformHandlers.csdn = {
    mode: "preprocess-text",
    preprocessText,
    postPasteCleanup,
  };
})();
