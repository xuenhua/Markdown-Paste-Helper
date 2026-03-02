# Markdown Paste Helper 🚀

一键将 Markdown 内容粘贴到各大内容平台，自动转换为平台适配的富文本格式。

**写一次 Markdown，发布到所有平台。**

## ✨ 支持平台

### 自动转换（需要插件）

| 平台           | 转换模式        | 特色功能                                        |
| -------------- | --------------- | ----------------------------------------------- |
| **知乎**       | 预处理文本      | `<details>`、GitHub alerts、task lists 自动转换 |
| **微信公众号** | 带样式 HTML     | 4 种预设主题、自定义主题色、代码高亮            |
| **飞书**       | 合成粘贴        | 完整 Markdown 语法支持                          |
| **X Articles** | HTML + 自动插入 | 代码块/图片/表格自动通过原生对话框插入          |

### 原生支持（无需插件）

- **掘金** — 直接粘贴 Markdown
- **CSDN** — 直接粘贴 Markdown

## 📦 安装

1. 下载或 clone 本仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择 `browser-extension` 文件夹

## 🎯 使用方式

1. 复制 Markdown 内容（从 VS Code、Obsidian 等编辑器）
2. 在目标平台的编辑器中按 `Cmd+V`（Mac）或 `Ctrl+V`（Windows）
3. 插件自动检测 Markdown 并转换为平台适配格式
4. 右上角 Toast 提示转换成功 ✅

## 🎨 公众号主题预设

点击扩展图标即可配置：

- **简约** — 无衬线字体，干净清爽
- **醒目** — 大标题，强对比，吸引眼球
- **精致** — Georgia 衬线字体，典雅排版
- **聚焦** — Optima 字体，紧凑布局

支持自定义主题色，所有预设动态跟随主题色变化。

## 🏗️ 项目结构

```
browser-extension/
├── manifest.json              # 扩展配置
├── background.js              # 后台脚本（图片跨域下载）
├── content/
│   ├── main.js                # 入口：平台检测 + 粘贴拦截
│   ├── markdown-converter.js  # Markdown → HTML 转换器
│   └── platforms/
│       ├── zhihu.js           # 知乎处理器
│       ├── wechat.js          # 公众号处理器（含样式系统）
│       ├── feishu.js          # 飞书处理器
│       └── twitter.js         # X Articles 处理器（代码块/图片自动插入）
├── popup/
│   ├── popup.html             # 弹窗 UI
│   └── popup.js               # 弹窗逻辑 + 公众号设置
├── lib/                       # 第三方库
│   ├── markdown-it.min.js
│   └── highlight.min.js
└── icons/                     # 扩展图标
```

## 🔧 技术实现

| 平台       | 编辑器框架    | 粘贴策略                                   |
| ---------- | ------------- | ------------------------------------------ |
| 知乎       | 自研 Markdown | `preprocess-text`：预处理后写回剪贴板      |
| 公众号     | 自研富文本    | `keydown-html`：带 inline styles 的 HTML   |
| 飞书       | Slate.js      | `convert-to-html`：合成 ClipboardEvent     |
| X Articles | Draft.js      | `keydown-html` + `postPasteCleanup` 自动化 |

### X Articles 特殊处理

X 的 Draft.js 编辑器不支持通过 HTML 粘贴创建代码块和图片（它们是 atomic blocks）。插件采用：

- **代码块/表格**：提取 → 标记占位 → 粘贴后自动打开 `插入→代码` 对话框填入
- **图片**：提取 URL → 后台脚本下载 → synthetic paste event 插入

## 📋 Roadmap

- [ ] B站专栏
- [ ] 头条号
- [ ] 少数派
- [ ] Medium
- [ ] Dev.to

## 📄 License

[MIT License](./LICENSE)
