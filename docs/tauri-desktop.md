# Tauri 桌面版

Tauri 桌面版与现有 Electron 桌面版并列维护。它复用 `app/` 的前端和根目录 `scripts/build.mjs` 生成的 `dist/`；自定义存储位置入口只在 Tauri 中显示，不改变导图数据格式及浏览器、Quicker 的存储路径。

## 开发与打包

在项目根目录运行：

```powershell
npm --prefix desktop-tauri install
npm run tauri:dev
npm run tauri:build
```

Windows 上也可以双击项目根目录的 `build-tauri.bat` 一键打包。它会在缺少 Tauri CLI 依赖时先安装依赖，构建成功后打开安装包目录。

`tauri:dev` 启动现有开发服务器并打开桌面窗口。`tauri:build` 先构建 `dist/`，再生成 Windows NSIS 安装包和 MSI 安装包。产物位于 `desktop-tauri/src-tauri/target/release/bundle/`。

构建需要 Node.js、Rust 工具链、Windows C++ 构建工具和 WebView2。应用图标复用 Electron 桌面版已有的 BranchMark 图标资源。

## 存储与宿主能力

Tauri 主窗口始终使用 WebView2 的默认用户数据目录。自定义位置只存放 `deepconvo-mindmap-data.json` 这一份业务数据文件；`EBWebView`、缓存、GPUCache、Crashpad 和其他 WebView 配置继续由 WebView2 保存在默认位置。默认业务文件位于 Tauri 应用数据目录，与 WebView2 用户数据目录分开。

窗口标题栏跟随导图的亮暗主题：设置中切换主题后立即同步，启动恢复已保存的导图主题时也会同步。

Tauri 专用桥接把兼容层的 `chrome.storage.local` 和逻辑 IndexedDB 键值存入同一个版本化 JSON 文档。首次启动且业务文件不存在时，会从当前 WebView 的 `DeepConvoStandalone` 数据库（`keyval` 对象仓库）及兼容层 localStorage 回退前缀迁移数据；原 IndexedDB/localStorage 项不会删除。文档保存原有键和值，包括 `bookmarkData`、`MindMapData.__REF__<文件ID>-extra`、`largeContents.__REF__…-extra`、当前导图快照和 `tabs-v1` 工作簿，不改变导入格式或业务键。

工具栏的数据库按钮可选择业务数据目录。应用先保存当前已保存的导图，并在 Tauri 应用配置目录的 `storage-location.json` 中记录待切换位置；完全退出并重新打开后生效。重启前旧位置仍是活动写入位置，因此这段时间的后续保存也会被带过去。启动时，目标 `deepconvo-mindmap-data.json` 已存在且格式受支持就直接使用，并保留原位置的数据文件；文件不存在时迁移当前目录的最新业务数据，目标文件内容校验和目录配置保存均成功后，删除原位置的 `deepconvo-mindmap-data.json`，原目录和其他文件保留。业务文件通过同目录暂存文件和原子替换写入；目标不可写、文件损坏、版本不支持或目录配置保存失败时会报告错误，保留原数据。原文件删除失败时继续使用新位置，并提示原文件仍保留。恢复默认使用相同规则；若原位置不可访问，应用提示后仍可恢复，旧文件保持不动，默认位置读取其可用的数据。

普通浏览器继续使用现有 IndexedDB/localStorage 路径，Quicker 继续使用 `app_data_json`；两者都不调用 Tauri 文件命令。跨运行环境迁移仍可使用应用已有的思维导图导入/导出功能。

工具栏“导出脑图”每次都会打开原生目录选择框，将完整 JSON 工作簿写入选定目录。同名文件先询问是否覆盖，取消目录选择或拒绝覆盖时结束本次导出。导出目录与业务数据目录、Obsidian 默认保存目录分别使用；此操作不会切换存储位置。
