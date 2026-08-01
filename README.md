# DeepConvo 思维导图独立版

本项目以 `ref` 中的 DeepConvo 思维导图为参考，维护可直接在普通浏览器或 Quicker 原生 WebView2 中运行的独立网页应用。`ref` 不参与构建和运行。

## 当前保留的功能

- 思维导图编辑、拖拽、缩放、亮暗主题和 Markdown 渲染。
- 思维导图 JSON 导入、导出及 Obsidian Canvas 导出。
- 中文收藏夹：文件夹、脑图、搜索、移动、重命名、删除和列表/网格视图。
- Quicker 原生 WebView2 的 `$quickerSync` 数据读写。
- 普通浏览器的 `localStorage + IndexedDB` 数据读写。

原浏览器扩展中针对 ChatGPT、DeepSeek、Gemini 等网站的会话抓取、侧栏嵌入、宽度控制、行号、高亮、批量删除、付费校验和语言切换均不属于独立思维导图，已从运行代码中删除。界面固定为中文。

## 运行

```powershell
npm run dev
```

访问 `http://127.0.0.1:4173`，入口会跳转到 `HTML/MindMap.html`。

## 验证与构建

```powershell
npm test
npm run check
npm run build
```

构建产物位于 `dist`，可由普通静态服务器或 Quicker WebView2 加载。

## Quicker 接入

仓库只维护网页和数据适配层，不创建、安装或修改 Quicker 动作。你可以自行新建动作，让 Quicker 自带的 WebView2 加载 `dist/index.html`；不需要 C#。

动作变量、虚拟域名映射、导入子程序和数据结构见 [Quicker WebView2 手工接入说明](docs/quicker-webview2-integration.md)。

## 数据存储

- Quicker：通过 `$quickerSync.getVar/setVar` 读写启用 SaveState 的文本变量 `app_data_json`。
- 普通浏览器：小型状态写入带命名空间的 `localStorage`，收藏夹和完整脑图优先写入 IndexedDB；浏览器不支持 IndexedDB 时自动回退到 `localStorage`。

两种环境使用同一套 `chrome.storage.local` 和 `IDB_GET/SET/REMOVE` 兼容接口，业务代码无需区分宿主。

## 目录

```text
app/
  HTML/MindMap.html             思维导图页面
  JS/MindMap.js                 脑图交互、主题与导入导出
  JS/BookMarks.js               中文收藏夹与文件夹
  JS/AI-Contents.js             收藏内容和本地文件导出辅助函数
  JS/utils.js                   收藏夹/脑图存储调用封装
  JS/renderMD.js                Markdown 渲染
  JS/standalone-shim.js         Quicker 与浏览器双存储适配层
  JS/standalone-locale-zh-cn.js 固定中文文案
  CSS/BookMarks.css             收藏夹样式
  libs/                         本地第三方资源
docs/                            手工接入与架构说明
ref/                             原始参考代码，不参与运行
```
