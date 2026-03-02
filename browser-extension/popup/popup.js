/**
 * Markdown Paste Helper — Popup Logic
 * Platform detection + embedded WeChat style settings
 */
(function () {
  'use strict';

  const THEME_COLORS = [
    '#50B891', '#4B6EF5', '#F5A623', '#E85D5D',
    '#2F54EB', '#B8860B', '#4A5568', '#4299E1'
  ];

  const DEFAULT_CONFIG = {
    themeColor: '#4B6EF5',
    stylePreset: 'minimalist',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: '16',
    lineSpacing: '1.75'
  };

  let currentConfig = { ...DEFAULT_CONFIG };
  let saveTimeout;

  const platformInfo = {
    zhihu: { name: '知乎', emoji: '📝' },
    wechat: { name: '公众号', emoji: '💬' },
    feishu: { name: '飞书', emoji: '🐦' },
    twitter: { name: 'X', emoji: '𝕏' },
  };

  async function init() {
    const statusEl = document.getElementById('status');
    const hintEl = document.getElementById('hint');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab && tab.url) {
        const url = new URL(tab.url);
        let platform = null;

        if (url.hostname === 'zhuanlan.zhihu.com' && url.pathname.endsWith('/edit')) {
          platform = 'zhihu';
        } else if (url.hostname === 'mp.weixin.qq.com') {
          platform = 'wechat';
        } else if (url.hostname.endsWith('.feishu.cn') || url.hostname.endsWith('.larkoffice.com')) {
          platform = 'feishu';
        } else if (url.hostname === 'x.com' && url.pathname.startsWith('/compose/articles/edit/')) {
          platform = 'twitter';
        }

        if (platform) {
          const info = platformInfo[platform];
          statusEl.className = 'status active';
          statusEl.innerHTML = `${info.emoji} 已激活 — <span class="platform-name">${info.name}</span>`;
          hintEl.textContent = '直接粘贴 Markdown 内容即可，插件会自动转换格式。';
        } else {
          statusEl.className = 'status inactive';
          statusEl.textContent = '😴 当前页面不是支持的编辑器';
          hintEl.textContent = '支持：知乎文章编辑器、公众号编辑器、飞书文档、X Articles';
        }
      } else {
        statusEl.className = 'status inactive';
        statusEl.textContent = '😴 当前页面不是支持的编辑器';
        hintEl.textContent = '支持：知乎文章编辑器、公众号编辑器、飞书文档、X Articles';
      }
    } catch (err) {
      statusEl.textContent = '检测失败';
    }

    // Always show WeChat settings panel
    initWechatSettings();
  }

  // ===== WeChat Settings =====

  function initWechatSettings() {
    const panel = document.getElementById('wechatSettings');
    panel.classList.add('show');

    // 1. Render Color Grid
    const colorGrid = document.getElementById('colorGrid');
    THEME_COLORS.forEach(color => {
      const dot = document.createElement('div');
      dot.className = 'color-dot';
      dot.style.setProperty('--dot-color', color);
      dot.style.backgroundColor = color;
      dot.dataset.color = color;
      dot.addEventListener('click', () => updateConfig('themeColor', color));
      colorGrid.appendChild(dot);
    });

    // 2. Custom Color Picker
    const colorPicker = document.getElementById('customColorPicker');
    colorPicker.addEventListener('input', (e) => {
      const color = e.target.value.toUpperCase();
      document.getElementById('customColorValue').textContent = color;
      updateConfig('themeColor', color);
    });

    // 3. Style Presets
    document.querySelectorAll('.style-card').forEach(card => {
      card.addEventListener('click', () => {
        updateConfig('stylePreset', card.dataset.style);
      });
    });

    // 4. Advanced Toggle
    const advancedToggle = document.getElementById('advancedToggle');
    const advancedContent = document.getElementById('advancedContent');
    advancedToggle.addEventListener('click', () => {
      advancedContent.classList.toggle('show');
      advancedToggle.classList.toggle('open');
    });

    // 5. Radio Groups
    setupRadioGroup('fontGroup', 'fontFamily');
    setupRadioGroup('fontSizeGroup', 'fontSize');
    setupRadioGroup('lineSpacingGroup', 'lineSpacing');

    // 6. Load saved config
    loadConfig();
  }

  function setupRadioGroup(groupId, configKey) {
    const group = document.getElementById(groupId);
    group.querySelectorAll('.radio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        updateConfig(configKey, btn.dataset.value);
      });
    });
  }

  function updateConfig(key, value) {
    currentConfig[key] = value;
    applyUIState();
    saveConfig();
  }

  function applyUIState() {
    // Color Grid
    document.querySelectorAll('.color-dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.color.toUpperCase() === currentConfig.themeColor.toUpperCase());
    });

    // Custom Color
    const isCustom = !THEME_COLORS.map(c => c.toUpperCase()).includes(currentConfig.themeColor.toUpperCase());
    if (isCustom) {
      document.getElementById('customColorValue').textContent = currentConfig.themeColor.toUpperCase();
      document.getElementById('customColorPicker').value = currentConfig.themeColor;
    } else {
      document.getElementById('customColorValue').textContent = currentConfig.themeColor.toUpperCase();
      document.getElementById('customColorPicker').value = currentConfig.themeColor;
    }

    // Style Presets
    document.querySelectorAll('.style-card').forEach(card => {
      card.classList.toggle('active', card.dataset.style === currentConfig.stylePreset);
    });

    // Radio Groups
    const updateRadio = (groupId, val) => {
      document.getElementById(groupId).querySelectorAll('.radio-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === val);
      });
    };
    updateRadio('fontGroup', currentConfig.fontFamily);
    updateRadio('fontSizeGroup', currentConfig.fontSize);
    updateRadio('lineSpacingGroup', currentConfig.lineSpacing);
  }

  function loadConfig() {
    chrome.storage.sync.get(['wechatConfig'], (result) => {
      if (result.wechatConfig) {
        currentConfig = { ...DEFAULT_CONFIG, ...result.wechatConfig };
      }
      applyUIState();
    });
  }

  function saveConfig() {
    chrome.storage.sync.set({ wechatConfig: currentConfig }, () => {
      showToast();
    });
  }

  function showToast() {
    const toast = document.getElementById('saveToast');
    toast.classList.add('show');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 1200);
  }

  init();
})();
