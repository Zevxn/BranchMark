# BranchMark

BranchMark 是一款以本地数据为核心的思维导图与 Markdown 知识整理工具。它由作者自己的 DeepConvo 思维导图代码演进而来，提供中文界面，并共用一套前端支持浏览器、Windows 桌面和 Quicker WebView2。

[下载与发布](https://github.com/Zevxn/BranchMark/releases) · [问题反馈](https://github.com/Zevxn/BranchMark/issues) · [GPL-3.0 许可证](LICENSE)

项目仍在持续开发。处理重要资料时，请通过 JSON 导出保留备份；不同运行环境的数据不会自动互通。

## 功能

- **思维导图编辑**：节点增删、拖拽、缩放、折叠、卡片与便利贴模式、撤销和重做。
- **多标签页**：一份导图可包含多个页面，各页保存自己的节点与视图状态。
- **Markdown 内容**：CodeMirror 6 源码语法着色、亮暗配色，以及公式、Mermaid 图表、代码高亮、图片和链接预览。
- **交互笔记**：`interactive` 代码块运行 HTML/CSS/JavaScript，支持放大查看和继续操作。
- **文档整理**：Markdown 文档素材预览、目录导航和内容块拖拽摘取。
- **卡片关联与总结**：建立节点关联、添加多卡片总结，配合地图搜索定位内容。
- **收藏夹目录**：文件夹管理、搜索、排序、重命名、移动和多选操作。
- **导入与导出**：完整 JSON 工作簿、Markdown 与 Obsidian Canvas 相关导出。
- **主题与视图设置**：亮暗主题、悬停工具栏、正文预览和节点统计。

## 选择运行方式

| 方式 | 适用场景 | 数据存放 |
| --- | --- | --- |
| 浏览器 | 直接运行静态前端 | 当前站点的 IndexedDB / localStorage |
| Tauri 桌面版 | Windows 本地应用、自定义业务数据目录 | 应用数据目录或用户选择的目录中的 JSON 文件 |
| Electron 桌面版 | Windows 桌面运行与独立窗口 | 应用 WebView 的 IndexedDB / localStorage |
| Quicker WebView2 | 在 Quicker 动作中使用网页前端 | Quicker 文本变量 `app_data_json` |

现有桌面打包命令面向 Windows。Quicker 集成需要自行配置宿主动作和子程序，见 [集成说明](docs/quicker-webview2-integration.md)。

### 浏览器快速开始

需要 Git、Node.js 22 或更新版本及 npm。在终端执行：

```powershell
git clone https://github.com/Zevxn/BranchMark.git
cd BranchMark
npm run dev
```

打开 <http://127.0.0.1:4173>。浏览器版前端与开发服务器不需要安装额外 npm 依赖。

保持访问地址一致：主机名或端口变化会使用不同的浏览器存储空间。跨环境迁移可使用 JSON 导入与导出。

Markdown 源码编辑器的依赖已打包到本地，离线可用。更新编辑器依赖后，执行 `npm ci` 和 `npm run editor:build` 重新生成资源与第三方许可说明；日常运行与发布复制可直接使用仓库中的资源。

### Tauri 桌面版

需要 Node.js、Rust 工具链、Windows C++ 构建工具和 WebView2。

```powershell
npm --prefix desktop-tauri ci
npm run tauri:dev
```

生成 Windows 安装包：

```powershell
npm run tauri:build
```

产物位于 `desktop-tauri/src-tauri/target/release/bundle/`。也可运行根目录的 `build-tauri.bat`。数据目录切换、存储结构及宿主能力见 [Tauri 桌面版说明](docs/tauri-desktop.md)。

### Electron 桌面版

```powershell
npm --prefix desktop ci
npm run desktop
```

从全新克隆打包时，先生成应用图标：

```powershell
npm --prefix desktop run icon
npm run desktop:build
```

安装版与便携版产物位于 `desktop/release/`。`desktop/.npmrc` 配置了构建下载镜像；遇到下载失败时，可按该文件中的说明切换下载来源。

## 数据与备份

- 浏览器与 Electron 的数据由各自的站点存储保存；清理浏览器数据或应用用户数据可能移除导图。
- Tauri 将设置、收藏夹和每张导图分别保存。更换业务数据目录后，需要完全退出并重新打开应用。
- Quicker 的数据由动作变量和宿主配置管理，具体结构见集成说明。
- JSON 导出保存一份导图的完整工作簿，包括标签页、节点、关联、总结和视图信息。它不等同于整个收藏夹与全部设置的备份。
- Markdown 中引用的外部图片、网页和文件仍依赖各自的地址或文件位置；打开这些资源可能产生网络请求。

## Markdown 交互块

在笔记的 Markdown 源码中使用 `interactive` 围栏代码块，放入自包含的 HTML（可以包含 CSS 和 JavaScript）：

````markdown
拖动滑块，观察参数变化：

```interactive
<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<style>body { font: 14px system-ui; padding: 16px; }</style>
<label>参数：
  <input type="range" min="0" max="100" value="50"
         oninput="document.querySelector('output').value = this.value">
</label>
<output>50</output>
</html>
```
````

交互块在笔记内根据内容自动撑高，内容变化时同步调整。右上角可放大查看，竖向滑块悬浮在网页背景上，不占用内容宽度；使用关闭按钮、Esc 或点击窗口外侧还原。放大与还原复用同一个 iframe，保留当次运行的输入和脚本状态。源码随 Markdown 保存、复制和导出；普通 Markdown 阅读器将它显示为代码块。

交互脚本在隔离的 iframe 中运行，不提供访问导图数据或浏览器/Quicker/Tauri 宿主接口的通道。建议使用自包含代码；相对资源地址和依赖同源存储的代码不保证可用。修改源码、重新渲染笔记或刷新页面会重新运行，任意脚本内部状态不会自动保存到导图文件。

## 开发

核心源码位于 `app/`。页面使用按顺序加载的经典 JavaScript 脚本；修改时需要保留跨文件的共享状态与调用约定。

```powershell
npm run check
npm test
npm run build
```

交互块的定向运行验证使用 `npm run test:interactive`（需先安装 `desktop/` 的依赖）；测试通过隐藏的 Electron 窗口直接加载 `app/`，不需要构建 `dist/`。

`npm run build` 会清理并从 `app/` 重新生成 `dist/`。可用 `node scripts/dev-server.mjs --dist` 运行构建产物。

| 目录 | 内容 |
| --- | --- |
| `app/` | 前端源码、第三方库和静态资源 |
| `desktop/` | Electron 外壳与打包配置 |
| `desktop-tauri/` | Tauri / Rust 外壳与文件存储实现 |
| `scripts/` | 静态开发服务器与构建脚本 |
| `tests/` | 数据兼容、存储、导入导出和交互契约测试 |
| `docs/` | 集成、发布及第三方许可证材料 |
| `ref/` | 不参与当前构建的参考代码 |
| `skills/` | 仓库附带的开发辅助说明 |

开发约定见 [AGENTS.md](AGENTS.md)。

### 版本号管理

根目录 `package.json` 是项目版本号的统一来源。升级版本时执行一次：

```powershell
npm run version:set -- 1.0.7
```

命令会同步网页、Electron、Tauri、Cargo 配置及锁文件中的项目版本号，不修改第三方依赖版本，也不会创建 Git 提交或 Tag。若已手动修改根目录版本号，执行 `npm run version:sync` 同步其余文件。

同步不会修改已有的 `dist/`、安装包或 `latest.json`；发布产物仍需重新构建，更新清单由 Tauri 打包命令生成。

## 问题反馈

通过 [Issues](https://github.com/Zevxn/BranchMark/issues) 提交问题或功能建议。报告问题时，请说明运行方式、版本、复现步骤与预期行为，并使用去除私人内容的最小样例。

涉及安全问题，请按 [安全反馈说明](SECURITY.md) 处理。

## 许可证与致谢

Copyright (C) 2026 Zevxn。

BranchMark 自有源码与文档采用 **GNU GPL 第 3 版（GPL-3.0-only）**，完整条款见 [LICENSE](LICENSE)。许可证不要求你公开个人导图或笔记内容。

第三方库、字体和图标保留各自的许可证与版权声明，见 [第三方资源说明](THIRD_PARTY_NOTICES.md) 和 [许可证正文](docs/licenses/)。
