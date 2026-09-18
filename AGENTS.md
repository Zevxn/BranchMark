# 项目协作说明

## 项目定位

本项目是 DeepConvo 思维导图的独立 Web 版本，核心是一个可在普通浏览器和 Quicker WebView2 中运行的静态前端应用。主要功能包括思维导图编辑、缩放和拖拽、Markdown 内容渲染、JSON/Obsidian Canvas 导入导出、中文书签目录管理，以及浏览器和 Quicker 两种存储环境的兼容。

`app/` 是项目的核心运行源码目录。修改功能时，优先从 `app` 中定位入口、HTML、CSS 和非压缩 JavaScript 源文件；`ref/` 是参考代码，不参与当前构建和运行。

## 目录与核心文件

- `app/index.html`：静态服务根入口，重定向到 `app/HTML/MindMap.html`。
- `app/HTML/MindMap.html`：主页面布局、工具栏、画布、弹窗、菜单和部分页面样式；同时规定前端脚本的加载顺序。
- `app/CSS/BookMarks.css`：书签目录及相关面板的样式。
- `app/JS/standalone-shim.js`：浏览器/Quicker 兼容层，提供 `chrome.storage`、`chrome.runtime`、IndexedDB 访问、状态同步和运行时动作兼容。
- `app/JS/utils.js`：通过 `chrome.runtime` 转发 `IDB_GET`、`IDB_SET`、`IDB_REMOVE` 的共享存储辅助函数。
- `app/JS/static/i18n.js`、`app/JS/standalone-locale-zh-cn.js`：固定中文界面文本和简单的国际化/Toast 辅助函数。
- `app/JS/MindMap.js`：思维导图配置、设置、导入规范化、运行状态、持久化、多页面/标签页管理、初始化和全局快捷键。
- `app/JS/MindMap-UI.js`：节点工具栏、文件操作、右键菜单、节点选择与键盘导航、内容预览、鼠标交互和 Markdown 编辑器。
- `app/JS/MindMap-Relations.js`：卡片关联数据、关联编辑、选中、路径计算、路由和绘制。
- `app/JS/MindMap-SummariesSearch.js`：多卡片总结、总结布局和地图搜索定位。
- `app/JS/MindMap-Render.js`：节点渲染、视图更新、选择样式、拖拽/缩放提交、历史记录和节点统计。
- `app/JS/MindMap-IO.js`：剪贴板、Markdown 文件拖入、编辑器图片上传、思维导图数据导入以及 Canvas 导出。
- `app/JS/BookMarks.js`：书签管理器及其动态界面，负责文件夹、思维导图条目、搜索、排序、重命名、删除和多选操作。
- `app/JS/AI-Contents.js`：问答内容读取及文件导出辅助，也包含 Quicker 导出目录和浏览器 File System Access API 的适配；不要仅因文件名而将它视为独立的 AI 核心模块。
- `app/JS/renderMD.js`：Markdown、KaTeX、Mermaid、代码高亮、图片预览、链接处理以及渲染结果拖拽。
- `app/libs/`：第三方前端库和资源。除升级依赖等明确任务外，不要手工修改其中的压缩库文件。
- `scripts/`：Node.js 开发服务器和构建脚本。
- `tests/`：基于 Node.js 的迁移、存储、导入导出、交互和数据结构契约测试。
- `README.md`：项目范围、功能边界、常用命令和存储方案的概要说明。
- `docs/`：架构图及 Quicker WebView2 集成说明；复杂的外部配置以其中的文档为准。
- `dist/`：由 `app/` 复制生成的发布目录，不是源码目录，通常不应直接编辑。
- `quicker/`：Quicker 侧的辅助/集成资料；本项目不负责创建、安装或修改 Quicker 动作。

## 页面入口与加载关系

开发服务器默认把 `app/` 作为静态根目录。访问 `/` 时，`app/index.html` 跳转到 `HTML/MindMap.html`。主页面使用经典脚本而不是 ES module；各脚本通过共享的 `window` 全局变量、函数和状态协作，因此 `defer` 脚本的顺序是运行时契约。

当前主页面的关键加载顺序为：兼容层和中文资源 → Mermaid/Marked/KaTeX/代码高亮等第三方库 → `i18n.js` → `utils.js` → `AI-Contents.js` → `renderMD.js` → `MindMap.js` → `MindMap-UI.js` → `MindMap-Relations.js` → `MindMap-SummariesSearch.js` → `MindMap-Render.js` → `MindMap-IO.js` → `BookMarks.js`。

拆分或合并 JavaScript 文件时，必须同时检查 `app/HTML/MindMap.html` 和 `tests/helpers/mindmap-source.mjs` 的加载顺序。测试辅助文件会按源码顺序拼接主要 MindMap 文件到 VM 中执行。

## 数据流与持久化约定

1. 页面加载后，`standalone-shim.js` 根据运行环境提供统一的 Chrome-like API。普通浏览器使用命名空间隔离的 `localStorage` 和 IndexedDB；IndexedDB 不可用时使用 localStorage 回退。Quicker 环境通过 `$quickerSync` 读写文本变量 `app_data_json`。
2. `utils.js` 将业务层的 `idbGet`、`idbSet`、`idbRemove` 转成 `chrome.runtime.sendMessage`。不要让业务模块绕过兼容层直接实现另一套存储协议。
3. 当前思维导图运行状态由 `MindMap.js` 维护；完整导图快照通常写入 `MindMapData.__REF__<文件ID>-extra`，书签目录数据位于 `idb.bookmarkData`，当前文件、标题、主题和设置等元数据位于兼容的 `chrome` 存储区。
4. 思维导图导入需要兼容旧的直接根节点/快照格式，以及当前的 `tabs-v1` 工作簿格式；节点的 `children`、关联、总结、折叠状态、视图和滚动信息都属于数据契约的一部分。
5. `standalone-shim.js` 会根据完整导图的 IDB 键同步当前导图摘要状态。修改持久化时要同时检查 `MindMap.js`、`BookMarks.js`、shim、测试和 `docs/quicker-webview2-integration.md`。
6. Markdown 链接、Canvas 导出、思维导图导入等原生能力通过固定的 Quicker 子程序名称和返回字段通信。名称、参数和取消/错误结果不能随意改动，详细契约见 `docs/quicker-webview2-integration.md`。

## 常用命令

在项目根目录执行：

```powershell
npm run dev
npm run check
npm test
npm run build
```

- `npm run dev`：启动 `127.0.0.1:4173` 开发静态服务器，默认服务 `app/`。
- `npm run check`：对主要非压缩 JavaScript 源文件执行 `node --check`。
- `npm test`：按 `package.json` 中的顺序运行全部 Node.js 测试。
- `npm run build`：删除并重新生成 `dist/`，将整个 `app/` 复制为发布版本。不要把 `dist/` 当作手工维护的源代码。
- 若要验证发布目录，可执行 `node scripts/dev-server.mjs --dist` 后访问同一地址。

## 修改约束

- 功能代码优先修改 `app/` 中的非压缩源文件；不要把 `dist/`、`*min.js` 或 `ref/` 的修改当作核心修复。
- 保持主页面脚本加载顺序、经典全局脚本模式、跨文件使用的全局变量/函数，以及 HTML 中被 JavaScript 依赖的 ID、class 和 data 属性。
- 保持持久化键、数据版本、旧数据兼容逻辑、剪贴板 MIME 类型、Quicker 子程序名称和返回字段兼容。新增字段应采用向后兼容的默认值。
- 涉及 `state`、标签页、关联、总结、滚动位置、历史记录或拖拽状态的修改，必须同时检查渲染、UI、持久化和导入导出调用链，避免只修复一个拆分文件。
- 涉及浏览器/Quicker 存储的修改，必须保留普通浏览器回退路径，并确认 `app_data_json` 的 JSON 结构和同步行为仍然有效。
- 构建脚本会清理并重建 `dist/`；发布验证应从 `app/` 修改后重新构建，不要直接修补生成结果。
- 较长文件继续使用成对的 `// SECTION 名称` 与 `// !SECTION 名称` 功能分区标记；名称必须一致、正确嵌套，且不要为单个函数滥设分区。

## 完成修改后的检查

至少执行与改动范围匹配的检查：

1. `npm run check`，确认 JavaScript 语法有效。
2. `npm test`，确认存储、导入兼容、标签页、交互、关联、总结和导出等契约没有回归。
3. 若修改构建或静态资源，执行 `npm run build`，并用 `node scripts/dev-server.mjs --dist` 做最小启动验证。
4. 浏览器最小验证应覆盖：打开页面、创建/编辑节点、刷新后数据仍在、书签目录打开思维导图、导入/导出至少一条路径，以及 Markdown 内容渲染。
5. 若涉及 Quicker 适配，再按 `docs/quicker-webview2-integration.md` 检查 `app_data_json`、导入、Markdown 链接和 Canvas 导出；不要只在普通浏览器中验证。
6. 检查 SECTION 标记是否成对、名称一致、嵌套正确，并检查 `git diff --check` 和最终变更范围。

## 编码风格

界面文本和注释以中文为主，JavaScript 标识符以英文为主；函数通常使用 `get...`、`render...`、`initialize...`、`save...` 等按职责命名，常量使用大写下划线命名。源码普遍采用 4 个空格缩进、分号、async/await、可选链和模板字符串。保持现有经典浏览器脚本风格，不要无必要地改造成模块化打包架构。
