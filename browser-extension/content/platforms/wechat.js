/**
 * WeChat (公众号) platform handler
 *
 * Strategy: convert-to-html mode.
 * We convert Markdown to HTML and inject inline styles based on user config.
 */
(function () {
  "use strict";
  console.log(
    "%c[Markdown Paste Helper] ✅ wechat.js 已加载",
    "color: lime; font-size: 14px;",
  );

  const DEFAULT_CONFIG = {
    themeColor: "#4B6EF5",
    stylePreset: "minimalist",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: "16",
    lineSpacing: "1.75",
  };

  let config = { ...DEFAULT_CONFIG };

  // Load config asynchronously when script loads
  if (chrome && chrome.storage) {
    chrome.storage.sync.get(["wechatConfig"], (result) => {
      if (result.wechatConfig) {
        config = { ...DEFAULT_CONFIG, ...result.wechatConfig };
        console.log("[Markdown Paste Helper] 已加载公众号样式配置:", config);
      }
    });

    // Listen for config changes from options page
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync" && changes.wechatConfig) {
        config = { ...DEFAULT_CONFIG, ...changes.wechatConfig.newValue };
        console.log("[Markdown Paste Helper] 公众号样式配置已更新:", config);
      }
    });
  }

  function preprocessMarkdown(text) {
    let processed = text;

    // 1. Details block to bold heading
    processed = processed.replace(
      /<details>\s*\n\s*<summary>([\s\S]*?)<\/summary>\s*\n([\s\S]*?)\n\s*<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`,
    );
    processed = processed.replace(
      /<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi,
      (_, summary, content) => `**${summary.trim()}**\n\n${content.trim()}`,
    );

    // 2. GitHub alerts
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

    // 3. Task lists
    processed = processed.replace(/^(\s*)- \[ \] /gm, "$1- ⬜ ");
    processed = processed.replace(/^(\s*)- \[x\] /gm, "$1- ✅ ");

    // 4. Excessive blank lines
    processed = processed.replace(/\n{3,}/g, "\n\n");

    return processed;
  }

  function applyStyles(html) {
    const container = document.createElement("div");
    container.innerHTML = html;

    const tc = config.themeColor; // shorthand
    const preset = config.stylePreset;
    const fs = parseInt(config.fontSize);

    // ---- Paragraph spacing based on preset ----
    const paraMargin =
      preset === "elegant"
        ? "5px 0 28px"
        : preset === "focus"
          ? "5px 0 12px"
          : "5px 0 20px";

    // ---- Font weight nuance (醒目 uses 600, others 700) ----
    const boldWeight = preset === "bold" ? "600" : "700";

    const baseStyle = `font-family: ${config.fontFamily}; font-size: ${fs}px; line-height: ${config.lineSpacing}; color: #2c2c2c; letter-spacing: 0.05em; margin: ${paraMargin}; word-break: break-word;`;

    // Apply base styles to container and paragraphs
    container.setAttribute("style", baseStyle);
    container
      .querySelectorAll("p")
      .forEach((p) => p.setAttribute("style", baseStyle));

    // ---- Strong / Bold — all presets use theme color ----
    container
      .querySelectorAll("strong")
      .forEach((s) =>
        s.setAttribute("style", `color: ${tc}; font-weight: ${boldWeight};`),
      );

    // ---- Links — no underline, bottom border ----
    container
      .querySelectorAll("a")
      .forEach((a) =>
        a.setAttribute(
          "style",
          `color: ${tc}; text-decoration: none; border-bottom: 1px solid ${tc};`,
        ),
      );

    // ---- Lists ----
    const listPl = preset === "minimalist" ? "20px" : "26px";
    container
      .querySelectorAll("li")
      .forEach((li) => li.setAttribute("style", `margin-bottom: 8px;`));
    container
      .querySelectorAll("ul, ol")
      .forEach((ul) =>
        ul.setAttribute(
          "style",
          `padding-left: ${listPl}; margin-bottom: 20px;`,
        ),
      );

    // ---- Images ----
    container.querySelectorAll("img").forEach((img) => {
      img.setAttribute(
        "style",
        `max-width: 100%; max-height: 600px; border-radius: 8px; display: block; margin: 32px auto; box-shadow: 0 4px 12px rgba(0,0,0,0.1);`,
      );
      if (img.parentElement.tagName !== "FIGURE") {
        const figure = document.createElement("figure");
        figure.setAttribute("style", "margin: 0; text-align: center;");
        img.parentNode.insertBefore(figure, img);
        figure.appendChild(img);
      }
    });

    // ---- Code blocks & inline code ----
    container.querySelectorAll("code").forEach((code) => {
      if (code.parentNode.tagName === "PRE") {
        const pre = code.parentNode;
        // All presets share the same dark code block
        pre.setAttribute(
          "style",
          `background-color: #282c34; color: #abb2bf; padding: 16px; border-radius: 8px; font-family: 'Menlo', Consolas, Monaco, 'Courier New', monospace; font-size: ${Math.max(12, fs - 2)}px; line-height: 1.5; overflow-x: auto; margin-bottom: 20px; white-space: pre-wrap; word-wrap: break-word;`,
        );
      } else {
        // Inline code — minimalist uses gray, others use blue theme
        let inlineStyle;
        if (preset === "minimalist") {
          inlineStyle = `background-color: rgba(0,0,0,0.05); color: inherit; padding: 2px 4px; border-radius: 2px; font-family: 'Menlo', Consolas, monospace; font-size: 0.9em; margin: 0 2px;`;
        } else {
          // bold/elegant/focus — blue-tinted inline code
          inlineStyle = `background-color: ${hexToRgba(tc, 0.08)}; color: ${tc}; padding: 2px 4px; border-radius: 4px; font-family: 'Menlo', Consolas, monospace; font-size: 0.9em; margin: 0 2px;`;
        }
        code.setAttribute("style", inlineStyle);
      }
    });

    // ---- Headings based on preset ----
    const applyHeadingStyle = (el, level) => {
      const isH2 = level <= 2;
      const hSize = isH2 ? fs + 6 : fs + 3;

      let style = `font-family: ${config.fontFamily}; font-size: ${hSize}px; font-weight: ${boldWeight}; margin-top: 32px; margin-bottom: 16px; line-height: 1.4; color: ${tc}; `;

      switch (preset) {
        case "minimalist":
          // 简约: pure blue text, no decoration at all
          style += `padding: 0;`;
          break;

        case "bold":
          // 醒目: H2 has gradient underline, H3 has text-shadow
          if (isH2) {
            // H2: gradient decoration line below heading
            el.innerHTML = `${el.innerHTML}<span style="display: block; width: 100%; height: 1px; margin-top: 8px; background: linear-gradient(to right, ${tc}, transparent);"></span>`;
          } else {
            // H3: text-shadow glow effect
            style += `text-shadow: 0 1px 2px ${hexToRgba(tc, 0.1)};`;
          }
          break;

        case "elegant":
          // 精致: H2 double left border, H3 solid left border + shadow
          if (isH2) {
            style += `border-left: 4px double ${tc}; padding-left: 12px;`;
          } else {
            style += `border-left: 3px solid ${tc}; padding-left: 10px; text-shadow: 0 1px 2px ${hexToRgba(tc, 0.1)};`;
          }
          break;

        case "focus":
          // 聚焦: centered headings with line decoration
          if (isH2) {
            // H2: centered, with top & bottom lines
            style += `text-align: center; padding: 8px 0;`;
            el.innerHTML = `<span style="display: block; width: 40%; height: 1px; background: ${tc}; margin: 0 auto 8px;"></span>${el.innerHTML}<span style="display: block; width: 40%; height: 1px; background: ${tc}; margin: 8px auto 0;"></span>`;
          } else {
            // H3: centered, bottom line only
            style += `text-align: center; padding-bottom: 8px;`;
            el.innerHTML = `${el.innerHTML}<span style="display: block; width: 30%; height: 1px; background: ${tc}; margin: 6px auto 0;"></span>`;
          }
          break;
      }
      el.setAttribute("style", style);
    };

    container.querySelectorAll("h1").forEach((h) => applyHeadingStyle(h, 1));
    container.querySelectorAll("h2").forEach((h) => applyHeadingStyle(h, 2));
    container
      .querySelectorAll("h3, h4, h5, h6")
      .forEach((h) => applyHeadingStyle(h, 3));

    // ---- Blockquotes based on preset ----
    container.querySelectorAll("blockquote").forEach((bq) => {
      let bqStyle = `font-family: ${config.fontFamily}; font-size: 0.95em; line-height: ${config.lineSpacing}; color: #5f5f5f; padding: 12px 16px; margin-bottom: 20px; `;

      switch (preset) {
        case "minimalist":
          // 简约: left border + italic, no background
          bqStyle += `border-left: 3px solid ${tc}; font-style: italic;`;
          break;
        case "bold":
          // 醒目: gradient background + left border + right border-radius
          bqStyle += `background: linear-gradient(135deg, ${hexToRgba(tc, 0.05)}, ${hexToRgba(tc, 0.02)}); border-left: 3px solid ${tc}; border-radius: 0 8px 8px 0;`;
          break;
        case "elegant":
          // 精致: gradient background + left border + rounded
          bqStyle += `background: linear-gradient(135deg, ${hexToRgba(tc, 0.05)}, ${hexToRgba(tc, 0.02)}); border-left: 4px solid ${tc}; border-radius: 0 8px 8px 0;`;
          break;
        case "focus":
          // 聚焦: wider left border + light background
          bqStyle += `background-color: ${hexToRgba(tc, 0.05)}; border-left: 5px solid ${tc}; border-radius: 0 4px 4px 0;`;
          break;
      }
      bq.setAttribute("style", bqStyle);

      bq.querySelectorAll("p").forEach((p) => {
        p.setAttribute(
          "style",
          `margin: 0; padding: 0; line-height: inherit; color: inherit; font-size: inherit;`,
        );
      });
    });

    // ---- Tables ----
    container.querySelectorAll("table").forEach((table) => {
      table.setAttribute(
        "style",
        `width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.9em;`,
      );

      if (preset === "focus") {
        // 聚焦: blue header with white text, centered
        table.querySelectorAll("th").forEach((th) =>
          th.setAttribute(
            "style",
            `border: 1px solid #dfe2e5; padding: 10px 16px; background-color: ${tc}; font-weight: bold; text-align: center; color: #ffffff;`,
          ),
        );
      } else if (preset === "elegant") {
        // 精致: blue text header + thick top line
        table.querySelectorAll("th").forEach((th) =>
          th.setAttribute(
            "style",
            `border-bottom: 2px solid #dfe2e5; border-top: 3px solid ${tc}; padding: 12px 16px; font-weight: bold; text-align: left; color: ${tc}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;`,
          ),
        );
      } else {
        // minimalist / bold: clean table with subtle borders
        table.querySelectorAll("th").forEach((th) =>
          th.setAttribute(
            "style",
            `border-bottom: 2px solid #dfe2e5; padding: 12px 16px; font-weight: bold; text-align: left; color: #1a1a1a;`,
          ),
        );
      }

      table
        .querySelectorAll("td")
        .forEach((td) =>
          td.setAttribute(
            "style",
            `border-bottom: 1px solid #eaecef; padding: 12px 16px; color: #3f3f3f;`,
          ),
        );
    });

    // ---- HR (horizontal rule) ----
    container.querySelectorAll("hr").forEach((hr) => {
      let hrStyle;
      switch (preset) {
        case "minimalist":
          // Full width, subtle
          hrStyle = `margin: 48px 0; border: none; height: 1px; background-color: ${hexToRgba(tc, 0.2)};`;
          break;
        case "bold":
        case "elegant":
          // 50% width, centered gradient fade
          hrStyle = `margin: 48px auto; border: none; height: 1px; width: 50%; background: linear-gradient(to right, transparent, ${hexToRgba(tc, 0.4)}, transparent);`;
          break;
        case "focus":
          // 60% width, thick solid blue
          hrStyle = `margin: 48px auto; border: none; height: 3px; width: 60%; background-color: ${tc}; border-radius: 2px;`;
          break;
        default:
          hrStyle = `margin: 48px 0; border: none; height: 1px; background-color: #eaecef;`;
      }
      hr.setAttribute("style", hrStyle);
    });

    // Section wrapper
    const wrapper = document.createElement("section");
    wrapper.setAttribute(
      "style",
      `box-sizing: border-box; max-width: 720px; margin: 0 auto; padding: 16px; background-color: #ffffff;`,
    );
    wrapper.innerHTML = container.innerHTML;

    return wrapper.outerHTML;
  }

  /**
   * Convert hex color to rgba string.
   * e.g. hexToRgba('#4B6EF5', 0.1) => 'rgba(75,110,245,0.1)'
   */
  function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function getHtml(markdown) {
    const processed = preprocessMarkdown(markdown);
    let html = window.MarkdownConverter.toCleanHtml(processed);

    // Apply inline styles to the HTML
    const styledHtml = applyStyles(html);

    console.log("[Markdown Paste Helper] 公众号 HTML 内联样式注入完成");
    return styledHtml;
  }

  window.PlatformHandlers.wechat = {
    mode: "keydown-html",
    getHtml,
    preprocessText: preprocessMarkdown,
  };
})();
