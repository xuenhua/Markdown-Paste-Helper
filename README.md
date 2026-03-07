# Markdown Paste Helper

一键将 Markdown 内容粘贴到各大内容平台，自动转换为平台适配的富文本格式。

**写一次 Markdown，发布到所有平台。**

## 支持平台

### 自动转换（需要插件）

| 平台             | 转换模式        | 特色功能                                        |
| ---------------- | --------------- | ----------------------------------------------- |
| **知乎**         | 预处理文本      | `<details>`、GitHub alerts、task lists 自动转换 |
| **微信公众号**   | 带样式 HTML     | 4 种预设主题、自定义主题色、代码高亮            |
| **飞书**         | 合成粘贴        | 完整 Markdown 语法支持                          |
| **X Articles**   | HTML + 自动插入 | 代码块/图片/表格自动通过原生对话框插入          |
| **B站专栏**      | HTML + 图片上传 | 图片自动下载并上传，表格转文本代码块            |
| **头条号**       | HTML + 图片上传 | 图片自动下载并上传，原生表格支持                |
| **SegmentFault** | 预处理文本      | CodeMirror 原生 Markdown 编辑器                 |
| **51CTO**        | 直接 HTML       | am-engine 编辑器，直接接受 `<img>` 标签         |
| **掘金**         | 原生 Markdown   | ByteMD 编辑器，直接粘贴 Markdown                |
| **CSDN**         | 原生 Markdown   | 原生 Markdown 编辑器，直接粘贴                  |
| **博客园**       | 原生 Markdown   | 原生 Markdown 编辑器，直接粘贴                  |

### 原生支持（无需插件）

以上三个平台（掘金、CSDN、博客园）原生支持 Markdown，插件主要提供预处理（task lists、GitHub alerts 等语法转换）和一键分发能力。

## 安装

1. 下载或 clone 本仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择 `browser-extension` 文件夹

## 图片说明

> 本插件**不包含**图床上传功能。Markdown 中的图片需使用**在线 URL**（如 `https://...`），本地路径的图片无法被各平台识别。
>
> 推荐搭配图床工具（如 PicGo + Cloudflare R2）实现「截图 → 自动上传 → 生成链接」的无缝体验。[图床搭建教程](https://mp.weixin.qq.com/s/J4k3Ns0C4GCoCc2u7kz7Hg?scene=1)

## 使用方式

### 手动粘贴

1. 复制 Markdown 内容（从 VS Code、Obsidian 等编辑器）
2. 在目标平台的编辑器中按 `Cmd+V`（Mac）或 `Ctrl+V`（Windows）
3. 插件自动检测 Markdown 并转换为平台适配格式

### 一键分发

1. 点击扩展图标，点击「一键分发」按钮打开分发页面
2. 在分发页面输入或导入 Markdown 内容
3. 勾选目标平台（自动检测登录状态，已登录的平台默认勾选）
4. 点击「开始分发」，插件依次打开各平台编辑器并自动粘贴
5. 右下角悬浮按钮实时显示进度，支持跳过或前进到下一个平台

## 公众号主题预设

点击扩展图标即可配置：

- **简约** — 无衬线字体，干净清爽
- **醒目** — 大标题，强对比，吸引眼球
- **精致** — Georgia 衬线字体，典雅排版
- **聚焦** — Optima 字体，紧凑布局

支持自定义主题色，所有预设动态跟随主题色变化。

## 项目结构

```
browser-extension/
├── manifest.json              # 扩展配置
├── background.js              # 后台脚本（图片跨域下载、登录检测、分发调度）
├── content/
│   ├── main.js                # 入口：平台检测 + 粘贴拦截
│   ├── markdown-converter.js  # Markdown → HTML 转换器
│   ├── distribution-float.js  # 一键分发悬浮按钮 + 自动粘贴
│   └── platforms/
│       ├── zhihu.js           # 知乎处理器
│       ├── wechat.js          # 公众号处理器（含样式系统）
│       ├── feishu.js          # 飞书处理器
│       ├── twitter.js         # X Articles 处理器（代码块/图片自动插入）
│       ├── bilibili.js        # B站专栏处理器（图片自动上传）
│       ├── toutiao.js         # 头条号处理器（图片自动上传）
│       ├── segmentfault.js    # SegmentFault 处理器
│       ├── 51cto.js           # 51CTO 处理器
│       ├── juejin.js          # 掘金处理器（原生 Markdown）
│       ├── csdn.js            # CSDN 处理器（原生 Markdown）
│       └── cnblogs.js         # 博客园处理器（原生 Markdown）
├── distribute/
│   ├── distribute.html        # 一键分发页面
│   ├── distribute.css         # 分发页面样式
│   └── distribute.js          # 分发页面逻辑
├── popup/
│   ├── popup.html             # 弹窗 UI（公众号样式配置）
│   └── popup.js               # 弹窗逻辑
├── lib/                       # 第三方库
│   ├── markdown-it.min.js
│   └── highlight.min.js
└── icons/                     # 图标资源
    ├── icon16.png
    ├── icon48.png
    ├── icon128.png
    ├── feishu.ico
    └── segmentfault.svg
```

## 技术实现

| 平台         | 编辑器框架            | 粘贴策略                                   |
| ------------ | --------------------- | ------------------------------------------ |
| 知乎         | 自研 Markdown         | `preprocess-text`：预处理后写回剪贴板      |
| 公众号       | 自研富文本            | `keydown-html`：带 inline styles 的 HTML   |
| 飞书         | Slate.js              | `convert-to-html`：合成 ClipboardEvent     |
| X Articles   | Draft.js              | `keydown-html` + `postPasteCleanup` 自动化 |
| B站专栏      | Tiptap/ProseMirror    | `convert-to-html` + 图片异步上传           |
| 头条号       | Syllepsis/ProseMirror | `convert-to-html` + 图片异步上传           |
| SegmentFault | CodeMirror            | `preprocess-text`：原生 Markdown           |
| 51CTO        | am-engine (AOMAO)     | `convert-to-html`：直接 HTML 粘贴          |
| 掘金         | ByteMD                | `preprocess-text`：原生 Markdown           |
| CSDN         | 原生 Markdown 编辑器  | `preprocess-text`：原生 Markdown           |
| 博客园       | 原生 Markdown 编辑器  | `preprocess-text`：原生 Markdown           |

### 图片自动上传机制

对于 B站、头条号等平台，插件采用：

1. **预处理阶段**：提取图片 URL → 替换为标记（如 `【图片标记1】`）
2. **粘贴后**：并行下载所有图片（通过 background.js 绕过 CORS）
3. **自动插入**：定位标记 → 删除标记 → 合成 paste 事件插入图片文件 → 触发平台原生上传

### X Articles 特殊处理

X 的 Draft.js 编辑器不支持通过 HTML 粘贴创建代码块和图片（它们是 atomic blocks）。插件采用：

- **代码块/表格**：提取 → 标记占位 → 粘贴后自动打开「插入 → 代码」对话框填入
- **图片**：提取 URL → 后台脚本下载 → synthetic paste event 插入

### 一键分发流程

```
分发页面 → Background → Content Script (逐个平台)
  │            │              │
  │── distribute ──>│              │
  │  {markdown,     │── tabs.create ──>│ (打开平台编辑器)
  │   platforms}    │              │
  │            │<── editor-ready ──│ (编辑器就绪)
  │            │── auto-paste ───>│ (发送 Markdown)
  │            │              │── 执行转换+粘贴
  │            │<── paste-complete │
  │<── progress ──│              │
```

## License

[MIT License](./LICENSE)
