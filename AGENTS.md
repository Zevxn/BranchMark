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

## Tauri 发布与更新说明

- 准备 Tauri 发布产物时，必须根据上一已发布 Tag 到目标版本的最终实际变化整理面向用户的更新说明，覆盖该范围内全部已落地功能；同一功能合并描述，不包含中间方案、撤销内容或纯内部变更。
- 应用内更新弹窗读取 `latest.json` 的 `notes` 字段，不会自动读取 GitHub Release 正文。`notes` 字符串必须使用纯文本，不包含 Markdown 标题、加粗、链接等格式标记；该要求针对字符串内容，与说明文件的扩展名无关。构建时将纯文本更新说明保存为 UTF-8 文件，通过环境变量 `BRANCHMARK_UPDATE_NOTES_FILE` 指定该文件，再执行已有 Tauri 打包命令；不得只填写 GitHub Release 正文而遗漏清单中的说明。
- 发布前核对生成的 `latest.json`：`version` 与目标版本一致，`notes` 非空且为纯文本，与该版本 GitHub Release 正文保持信息内容一致，无需保持格式一致；下载地址和签名对应同一次构建的安装包。自动更新必须配套上传安装包和 `latest.json`；签名内容已写入清单，`.sig` 可选上传留存。
- 若仅补充或修正已发布版本的更新说明，可以只修改 `latest.json` 的 `notes` 并重新上传清单，无需重新打包；保留原有版本号、安装包地址和签名，避免误用其他构建的更新包。

## 修改约束

- 功能代码优先修改 `app/` 中的非压缩源文件；不要把 `dist/`、`*min.js` 或 `ref/` 的修改当作核心修复。
- 保持主页面脚本加载顺序、经典全局脚本模式、跨文件使用的全局变量/函数，以及 HTML 中被 JavaScript 依赖的 ID、class 和 data 属性。
- 保持持久化键、数据版本、旧数据兼容逻辑、剪贴板 MIME 类型、Quicker 子程序名称和返回字段兼容。新增字段应采用向后兼容的默认值。
- 涉及 `state`、标签页、关联、总结、滚动位置、历史记录或拖拽状态的修改，必须同时检查渲染、UI、持久化和导入导出调用链，避免只修复一个拆分文件。
- 涉及浏览器/Quicker 存储的修改，必须保留普通浏览器回退路径，并确认 `app_data_json` 的 JSON 结构和同步行为仍然有效。
- 构建脚本会清理并重建 `dist/`；发布验证应从 `app/` 修改后重新构建，不要直接修补生成结果。
- 较长文件继续使用成对的 `// SECTION 名称` 与 `// !SECTION 名称` 功能分区标记；名称必须一致、正确嵌套，且不要为单个函数滥设分区。

## 完成修改后的检查

按用户要求和实际改动风险选择最小必要检查。以下规则不是每次修改都要执行的测试清单，禁止因“完成流程”而扩大验证范围。

1. **小改动默认不跑测试。** 文案、注释、文档、局部样式，以及按钮、配置入口、复用模态框等简单交互，只检查相关源码和最终差异；修改 JavaScript 时，按需对改动文件执行 `node --check`。不新增测试，不默认运行 `npm test`、全项目检查或浏览器/Electron 冒烟验证。
2. **按行为变化判断风险。** 仅调用现有存储、渲染或导入导出接口，不等于改变这些底层契约，不能据此启动全套回归。确实修改持久化结构、兼容逻辑、跨页面状态或复杂算法时，优先运行直接覆盖该变化的已有测试；只有影响范围广、局部检查不足或用户明确要求时，才运行全量测试。
3. **构建不作为小修改的默认步骤。** 仅在用户要求构建/打包，或修改构建流程、脚本加载和资源引用且需要验证产物时，执行 `npm run build`。普通 HTML、CSS 和界面交互修改不自动触发构建、发布目录启动或安装包验证。
4. **实际页面验证限于必要场景。** 仅在用户明确要求，或问题必须通过实际运行才能判断时，进行浏览器、Electron 或 Quicker 验证，并只覆盖本次改动涉及的操作。不得顺带检查节点创建、刷新持久化、书签、导入导出等无关功能，也不得为小改动编写临时大型验证脚本。
5. **检查通过即停止。** 没有新的代码变化、失败或明确疑点，不重复验证。测试环境不可用时，说明尚未验证的范围；小改动不得因此反复启动浏览器、申请提权或排查运行环境来补齐流程。
6. **用户要求少测或停止测试时立即遵守。** 不换成“冒烟”“探针”“截图检查”等名称继续测试，也不自行追加其他验证。
7. 检查本次改动涉及的 SECTION 标记是否成对、名称一致、嵌套正确；核对最终变更范围，按需执行 `git diff --check`。纯文档规则修改只需核对文档差异，不运行项目测试或构建。

## 编码风格

界面文本和注释以中文为主，JavaScript 标识符以英文为主；函数通常使用 `get...`、`render...`、`initialize...`、`save...` 等按职责命名，常量使用大写下划线命名。源码普遍采用 4 个空格缩进、分号、async/await、可选链和模板字符串。保持现有经典浏览器脚本风格，不要无必要地改造成模块化打包架构。
