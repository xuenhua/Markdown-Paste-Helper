/**
 * X (Twitter) Articles platform handler
 *
 * Strategy: keydown-html mode with automated code block + image insertion.
 *
 * Key design:
 *   - Code blocks + images extracted in a single pass, sorted by position
 *   - For each marker in document order:
 *     - Scroll to marker, record its position, select and delete it
 *     - Code: open Insert→Code dialog, fill textarea, submit
 *     - Image: download blob, dispatch synthetic paste event on editor
 *       (avoids dialog cursor-position issues)
 */
(function () {
  "use strict";
  console.log(
    "%c[Markdown Paste Helper] ✅ twitter.js 已加载",
    "color: lime; font-size: 14px;",
  );

  let pendingItems = [];

  // ===== Preprocessing =====

  function preprocessMarkdown(text) {
    pendingItems = [];

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
        lang: m[1] || "",
        code: m[2].trimEnd(),
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

    // Markdown tables → treat as code blocks (X doesn't support tables)
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
        type: "code",
        start,
        end,
        lang: "",
        code: tableText,
      });
    }

    // Sort by position
    matches.sort((a, b) => a.start - b.start);

    // Assign markers in document order
    let processed = text;
    for (let i = 0; i < matches.length; i++) {
      matches[i].marker = `【标记${i + 1}】`;
    }

    // Replace from end→start
    for (let i = matches.length - 1; i >= 0; i--) {
      const mt = matches[i];
      // Both code blocks and images need their own line —
      // Draft.js media/code are block-level atomic blocks
      const rep = `\n${mt.marker}\n`;
      processed = processed.substring(0, mt.start) + rep + processed.substring(mt.end);
    }

    // Build pendingItems
    pendingItems = matches.map((mt) =>
      mt.type === "code"
        ? { type: "code", marker: mt.marker, lang: mt.lang, code: mt.code }
        : { type: "image", marker: mt.marker, alt: mt.alt, url: mt.url },
    );

    // Other preprocessing
    processed = processed.replace(
      /<details>\s*\n\s*<summary>([\s\S]*?)<\/summary>\s*\n([\s\S]*?)\n\s*<\/details>/gi,
      (_, s, c) => `**${s.trim()}**\n\n${c.trim()}`,
    );
    processed = processed.replace(
      /<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi,
      (_, s, c) => `**${s.trim()}**\n\n${c.trim()}`,
    );
    processed = processed.replace(
      /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gm,
      (_, type) => {
        const labels = {
          NOTE: "📝 注意",
          TIP: "💡 提示",
          IMPORTANT: "❗ 重要",
          WARNING: "⚠️ 警告",
          CAUTION: "🚨 危险",
        };
        return `> **${labels[type]}**\n>\n>`;
      },
    );
    processed = processed.replace(/^(\s*)- \[ \] /gm, "$1- ⬜ ");
    processed = processed.replace(/^(\s*)- \[x\] /gm, "$1- ✅ ");
    processed = processed.replace(/^#{3,6}\s+/gm, "## ");
    processed = processed.replace(/\n{3,}/g, "\n\n");

    return processed;
  }

  function getHtml(markdown) {
    return window.MarkdownConverter.toCleanHtml(markdown);
  }

  // ===== Post-Paste =====

  async function postPasteCleanup() {
    const items = [...pendingItems];
    pendingItems = [];
    if (items.length === 0) return;

    console.log(`[X Auto] 按文档顺序处理 ${items.length} 项...`);

    // Show progress toast (use global toast functions from main.js)
    const showToast = window._mdphShowToast;
    const removeToast = window._mdphRemoveToast;

    const hasImages = items.some((it) => it.type === "image");
    const initialMsg = hasImages
      ? `⏳ [0/${items.length}] 正在预下载图片...`
      : `⏳ [0/${items.length}] 准备插入...`;
    let progressToast = showToast
      ? showToast(initialMsg, 'progress')
      : null;

    // Pre-download all images in parallel to save time
    const downloadTasks = items
      .filter((it) => it.type === "image")
      .map(async (it) => {
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
          console.log(`[X Auto] ✅ 预下载完成: ${it.alt || it.url}`);
        } catch (err) {
          console.warn(`[X Auto] ❌ 预下载失败: ${it.alt} — ${err.message}`);
          it._blob = null;
        }
      });
    await Promise.all(downloadTasks);

    await sleep(1500); // Let paste rendering settle

    // Process items in document order
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const label = item.type === "code" ? "代码块" : "图片";
      console.log(`[X Auto] [${i + 1}/${items.length}] ${label}`);

      // Update progress toast
      if (progressToast) {
        progressToast.textContent = `⏳ [${i + 1}/${items.length}] 正在插入${label}...`;
      }

      try {
        // Step 1: Find marker, get its position, scroll to it
        const markerInfo = findMarkerInEditor(item.marker);
        if (!markerInfo) {
          console.warn(`[X Auto] ❌ 未找到: ${item.marker}`);
          continue;
        }

        // Scroll marker into view
        markerInfo.parentBlock.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        await sleep(400);

        // Step 2: Select marker and get its bounding rect BEFORE deletion
        const range = document.createRange();
        range.setStart(markerInfo.node, markerInfo.offset);
        range.setEnd(
          markerInfo.node,
          markerInfo.offset + item.marker.length,
        );
        const rect = range.getBoundingClientRect();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        await sleep(100);

        // Step 3: Delete marker
        document.execCommand("delete");
        await sleep(200);

        // Step 4: Click at the marker's old position to ensure cursor is there
        clickAtPosition(rect.left + 1, rect.top + rect.height / 2);
        await sleep(200);

        // Step 5: Process
        if (item.type === "code") {
          await processCodeBlock(item);
        } else {
          await processImageViaPaste(item);
        }

        console.log(`[X Auto] ✅ ${label} 完成`);
        await sleep(800);
      } catch (err) {
        console.error(`[X Auto] ${item.marker} 失败:`, err);
        pressEscape();
        await sleep(300);
      }
    }

    console.log("[X Auto] ✅ 全部完成");

    // Replace progress toast with success toast
    if (removeToast && progressToast) removeToast(progressToast);
    if (showToast) showToast('✅ X Articles 代码块和图片全部插入完成！', 'success');
  }

  // ===== Find marker in editor DOM =====

  function findMarkerInEditor(marker) {
    const editor =
      document.querySelector("[data-contents='true']") ||
      document.querySelector("[contenteditable='true']");
    if (!editor) return null;

    const walker = document.createTreeWalker(
      editor,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(marker);
      if (idx !== -1) {
        const parentBlock =
          node.parentElement.closest("[data-block='true']") ||
          node.parentElement;
        return { node, offset: idx, parentBlock };
      }
    }
    return null;
  }

  /** Simulate a click at specific coordinates to set Draft.js cursor */
  function clickAtPosition(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    el.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: x,
        clientY: y,
        bubbles: true,
      }),
    );
    el.dispatchEvent(
      new MouseEvent("mouseup", {
        clientX: x,
        clientY: y,
        bubbles: true,
      }),
    );
    el.dispatchEvent(
      new MouseEvent("click", { clientX: x, clientY: y, bubbles: true },
      ),
    );
  }

  // ===== Code Block: still uses dialog =====

  async function processCodeBlock(item) {
    if (!(await openInsertDialog("代码"))) return;

    let textarea = null;
    for (let i = 0; i < 15; i++) {
      textarea = document.querySelector("textarea");
      if (textarea) break;
      await sleep(200);
    }
    if (!textarea) {
      pressEscape();
      return;
    }

    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    ).set;
    nativeSetter.call(textarea, item.code);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    textarea.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: item.code }),
    );
    await sleep(300);

    const btn = findDialogButton("插入") || findDialogButton("Insert");
    if (!btn) {
      pressEscape();
      return;
    }
    btn.click();
    await sleep(1000); // Wait for code block to render
  }

  // ===== Image: synthetic paste event (no dialog!) =====

  async function processImageViaPaste(item) {
    if (!item._blob) {
      document.execCommand(
        "insertText",
        false,
        `[图片下载失败: ${item.alt || item.url}]`,
      );
      return;
    }

    const fileName =
      item.url.split("/").pop().split("?")[0] || "image.png";
    const mimeType = item._blob.type || "image/png";
    const file = new File([item._blob], fileName, { type: mimeType });

    // Ensure editor has focus
    const editor = document.querySelector("[contenteditable='true']");
    if (editor) editor.focus();
    await sleep(100);

    // Create a synthetic paste event containing the image file
    const dt = new DataTransfer();
    dt.items.add(file);

    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });

    // Dispatch on the editor — Draft.js's handlePastedFiles should pick it up
    console.log("[X Auto] 派发图片粘贴事件...");
    editor.dispatchEvent(pasteEvent);

    // Wait for X to upload and insert the image
    await waitForImageInEditor(8000);
  }

  /** Wait until a new image/media block appears in the editor */
  async function waitForImageInEditor(timeoutMs) {
    const start = Date.now();
    // Wait for any upload progress / loading indicator to finish
    while (Date.now() - start < timeoutMs) {
      await sleep(500);
      // Check if there's a loading/uploading indicator
      const uploading = document.querySelector(
        "[data-testid='uploadProgress'], [role='progressbar']",
      );
      if (!uploading) {
        // No loading indicator — image should be done
        await sleep(300);
        return;
      }
    }
  }

  // ===== Dialog Helpers =====

  async function openInsertDialog(optionText) {
    // Ensure editor has focus first
    const editor = document.querySelector("[contenteditable='true']");
    if (editor) editor.focus();
    await sleep(100);

    const insertBtn = findClickableByText("插入");
    if (!insertBtn) {
      console.warn("[X Auto] 未找到「插入」按钮");
      return false;
    }
    insertBtn.click();
    await sleep(400);

    const option = findClickableByText(optionText);
    if (!option) {
      console.warn(`[X Auto] 未找到「${optionText}」`);
      pressEscape();
      return false;
    }
    option.click();
    await sleep(500);
    return true;
  }

  function findClickableByText(targetText) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() === targetText) {
        let el = node.parentElement;
        for (let d = 0; d < 6 && el; d++) {
          if (
            el.matches(
              "button, [role='button'], [role='menuitem'], [role='option']",
            )
          ) {
            return el;
          }
          el = el.parentElement;
        }
        return node.parentElement;
      }
    }
    return null;
  }

  function findDialogButton(targetText) {
    const dialogs = document.querySelectorAll(
      "[role='dialog'], [aria-modal='true']",
    );
    for (const dialog of dialogs) {
      const btns = dialog.querySelectorAll("button, [role='button']");
      for (const btn of btns) {
        if (btn.textContent.trim() === targetText) return btn;
      }
    }
    const allBtns = document.querySelectorAll("button, [role='button']");
    for (const btn of allBtns) {
      if (btn.textContent.trim() === targetText) {
        const rect = btn.getBoundingClientRect();
        if (rect.top > 120 && rect.width > 0) return btn;
      }
    }
    return null;
  }

  function pressEscape() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
      }),
    );
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ===== Register =====

  window.PlatformHandlers = window.PlatformHandlers || {};
  window.PlatformHandlers.twitter = {
    mode: "keydown-html",
    getHtml,
    preprocessText: preprocessMarkdown,
    postPasteCleanup,
  };
})();
