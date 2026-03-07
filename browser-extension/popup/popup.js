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

  async function init() {
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

  // ===== Distribute Button =====
  const distributeBtn = document.getElementById('distributeBtn');
  if (distributeBtn) {
    distributeBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('distribute/distribute.html') });
    });
  }

  init();
})();
