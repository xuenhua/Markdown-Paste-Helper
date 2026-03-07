/**
 * Bilibili (B站专栏) platform handler
 *
 * Strategy: convert-to-html mode with automated image insertion.
 * B站专栏 uses a Tiptap/ProseMirror editor inside an iframe.
 * 
 * Tables: Converted to text-based code blocks.
 * Images: Replaced with markers during HTML conversion, then postPasteCleanup 
 *         finds them, downloads the image, and dispatches a synthetic paste event 
 *         so B站's native uploader kicks in.
 */
(function () {
  "use strict";
  console.log(
    "%c[Markdown Paste Helper] ✅ bilibili.js 已加载",
    "color: lime; font-size: 14px;",
  );

  let pendingImages = [];

  function preprocessMarkdown(text) {
    pendingImages = [];

    // Find all code blocks and images with their positions
    const matches = [];

    // Code blocks
    const codeRe = /```(\w*)\n([\s\S]*?)```/g;
    let m;
    while ((m = codeRe.exec(text)) !== null) {
      matches.push({
        type: "code",
        start: m.index,
        end: m.index + m[0].length,
      });
    }

    // Images (only http/https, skip those inside code blocks)
    const imgRe = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
    while ((m = imgRe.exec(text)) !== null) {
      const inCode = matches.some(
        (cm) => cm.type === "code" && m.index >= cm.start && m.index < cm.end,
      );
      if (inCode) continue;
      matches.push({
        type: "image",
        start: m.index,
        end: m.index + m[0].length,
        alt: m[1],
        url: m[2],
      });
    }

    // Markdown tables → treat as text code blocks
    const tableRe = /((?:^|\n)\|.+\|\n\|[\s:|-]+\|\n(?:\|.+\|\n?)+)/g;
    while ((m = tableRe.exec(text)) !== null) {
      const tableText = m[1].trim();
      const start = m.index + (m[1].startsWith("\n") ? 1 : 0);
      const end = m.index + m[0].length;
      // Skip if inside a code block
      const inCode = matches.some(
        (cm) => cm.type === "code" && start >= cm.start && start < cm.end,
      );
      if (inCode) continue;
      matches.push({
        type: "table",
        start,
        end,
        code: tableText,
      });
    }

    // Sort by position
    matches.sort((a, b) => a.start - b.start);

    // Assign markers in document order
    let imgCounter = 0;
    let processed = text;

    // Replace from end→start
    for (let i = matches.length - 1; i >= 0; i--) {
      const mt = matches[i];
      if (mt.type === "image") {
          imgCounter++;
          const marker = `【图片标记${imgCounter}】`;
          pendingImages.unshift({ marker, alt: mt.alt, url: mt.url });
          const rep = `\n${marker}\n`;
          processed = processed.substring(0, mt.start) + rep + processed.substring(mt.end);
      } else if (mt.type === "table") {
          const rep = `\n\`\`\`text\n${mt.code}\n\`\`\`\n`;
          processed = processed.substring(0, mt.start) + rep + processed.substring(mt.end);
      }
    }

    // 1. Replace <details><summary>...</summary>...</details>
    processed = processed.replace(
      /<details>\s*\n\s*<summary>([\s\S]*?)<\/summary>\s*\n([\s\S]*?)\n\s*<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`,
    );
    processed = processed.replace(
      /<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`,
    );

    // 2. Replace GitHub alerts
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

    return processed;
  }

  function getHtml(markdown) {
    const processed = preprocessMarkdown(markdown);
    let html = window.MarkdownConverter.toCleanHtml(processed);

    const container = document.createElement("div");
    container.innerHTML = html;

    container.querySelectorAll("[style]").forEach((el) => {
      el.removeAttribute("style");
    });

    container.querySelectorAll("p").forEach((p) => {
      const text = p.textContent.replace(/\u00A0/g, "").trim();
      if (!text && !p.querySelector("img, figure")) {
        p.remove();
      }
    });

    return container.innerHTML;
  }

  // ===== Post-Paste Cleanup for Images =====

  async function postPasteCleanup() {
    const items = [...pendingImages];
    pendingImages = [];
    if (items.length === 0) return;

    console.log(`[Markdown Paste Helper] 按文档顺序处理 ${items.length} 张图片...`);

    const showToast = window._mdphShowToast;
    const removeToast = window._mdphRemoveToast;

    let progressToast = showToast
      ? showToast(`⏳ [0/${items.length}] 正在预下载图片...`, 'progress')
      : null;

    // Pre-download all images in parallel
    const downloadTasks = items.map(async (it) => {
        try {
          const result = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { type: "fetch-image", url: it.url },
              resolve,
            );
          });
          if (!result || !result.success) throw new Error(result?.error);
          const bin = atob(result.base64);
          const bytes = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
          it._blob = new Blob([bytes], { type: result.mimeType });
          console.log(`[Markdown Paste Helper] ✅ 预下载完成: ${it.alt || it.url}`);
        } catch (err) {
          console.warn(`[Markdown Paste Helper] ❌ 预下载失败: ${it.alt} — ${err.message}`);
          it._blob = null;
        }
      });
    await Promise.all(downloadTasks);

    await sleep(1500); // Let paste rendering settle

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (progressToast) {
            progressToast.textContent = `⏳ [${i + 1}/${items.length}] 正在插入图片...`;
        }

        try {
            const markerInfo = findMarkerInEditor(item.marker);
            if (!markerInfo) {
                console.warn(`[Markdown Paste Helper] ❌ 未找到: ${item.marker}`);
                continue;
            }

            markerInfo.parentBlock.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
            await sleep(400);

            // Select and delete marker
            const range = markerInfo.ctx.doc.createRange();
            range.setStart(markerInfo.node, markerInfo.offset);
            range.setEnd(
                markerInfo.node,
                markerInfo.offset + item.marker.length,
            );
            const sel = markerInfo.ctx.win.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            await sleep(100);

            markerInfo.ctx.doc.execCommand("delete");
            await sleep(200);

            await processImageViaPaste(item, markerInfo.ctx);
            console.log(`[Markdown Paste Helper] ✅ 图片插入完成`);
            await sleep(1500); // Wait for upload UI
        } catch (err) {
            console.error(`[Markdown Paste Helper] 插入图片失败:`, err);
        }
    }

    console.log("[Markdown Paste Helper] ✅ 图片全部插入完成");

    if (removeToast && progressToast) removeToast(progressToast);
    if (showToast) showToast('✅ B站专栏 图片全部上传并插入完成！', 'success');
  }

  function getEditorContext() {
    let editor = document.querySelector('.tiptap.ProseMirror, .ProseMirror, [contenteditable="true"]');
    if (editor) return { editor, doc: document, win: window };

    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        editor = iframe.contentDocument.querySelector('.tiptap.ProseMirror, .ProseMirror, [contenteditable="true"]');
        if (editor) {
            return { editor, doc: iframe.contentDocument, win: iframe.contentWindow };
        }
      } catch(e) {}
    }
    return null;
  }

  function findMarkerInEditor(marker) {
    const ctx = getEditorContext();
    if (!ctx) return null;

    const walker = ctx.doc.createTreeWalker(
      ctx.editor,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(marker);
      if (idx !== -1) {
        const parentBlock = node.parentElement;
        return { node, offset: idx, parentBlock, ctx };
      }
    }
    return null;
  }

  async function processImageViaPaste(item, ctx) {
    if (!item._blob) {
      ctx.doc.execCommand(
        "insertText",
        false,
        `[图片下载失败: ${item.alt || item.url}]`,
      );
      return;
    }

    const fileName = item.url.split("/").pop().split("?")[0] || "image.png";
    const mimeType = item._blob.type || "image/png";
    const file = new File([item._blob], fileName, { type: mimeType });

    ctx.editor.focus();
    await sleep(100);

    const dt = new DataTransfer();
    dt.items.add(file);

    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });

    ctx.editor.dispatchEvent(pasteEvent);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  window.PlatformHandlers = window.PlatformHandlers || {};
  window.PlatformHandlers.bilibili = {
    mode: "convert-to-html",
    getHtml,
    postPasteCleanup,
  };
})();
