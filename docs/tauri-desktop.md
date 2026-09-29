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

Tauri 主窗口始终使用 WebView2 的默认用户数据目录。业务数据位于默认应用数据目录或用户选择的目录；`EBWebView`、缓存、GPUCache、Crashpad 和其他 WebView 配置继续由 WebView2 保存在默认位置。

窗口标题栏跟随导图的亮暗主题：设置中切换主题后立即同步，启动恢复已保存的导图主题时也会同步。

业务数据按职责分别保存：

- `app-state.json`：主题、设置、当前导图 ID 和其他界面状态，不保存完整导图快照。
- `bookmarks.json`：收藏夹目录、排序、条目名称及导图引用。
- `maps/<导图ID>.json`：每张导图的完整 `tabs-v1` 工作簿，包含标签页、节点、关联、总结、折叠、视图和滚动数据。
- `contents/<键名>.json`：大型 Markdown 引用及其他逻辑 IDB 内容，按键独立保存。

每个业务文件包含 `{ "version": 1, "data": ... }` 包装。文件名中的特殊字符、大写字母和 Windows 保留名称使用可逆百分号转义，避免路径穿越及大小写冲突。导图重命名不改变 ID 和存储文件名。前端保持 `idbGet/idbSet/idbRemove` 接口，Tauri 桥接按键读写对应文件；启动只读取状态，恢复当前导图时才读取该 ID 的文件，保存一张导图或修改设置不重写其他导图。

本项目仍处于测试阶段，新版本不读取或迁移旧的 `deepconvo-mindmap-data.json` 和 WebView2 IndexedDB/localStorage 数据，也不会删除这些旧数据。

工具栏的数据库按钮可选择业务数据目录。应用先保存当前已保存的导图，并在 Tauri 应用配置目录的 `storage-location.json` 中记录待切换位置；完全退出并重新打开后生效。重启前旧位置仍是活动写入位置。启动时，目标包含受支持的新格式业务文件就直接使用，并保留原位置的数据；目标没有新格式业务文件时复制当前目录的全部业务文件，逐个校验且目录配置保存成功后，只清理原位置的业务文件，保留目录、旧测试数据和无关文件。复制或配置保存失败时清理本次复制的文件并保留原数据。原文件清理失败时继续使用新位置，并提示仍有文件保留。恢复默认使用相同规则；若原位置不可访问，应用提示后仍可恢复，旧文件保持不动。

业务文件使用同目录暂存文件、落盘同步和替换写入。新建导图先保存内容再添加收藏夹引用；删除先移除引用再清理内容，删除当前导图时同时清除启动引用。单张导图损坏不影响其他导图和设置的按需读写；目录切换会检查全部业务文件，损坏或不支持的文件会阻止切换。

普通浏览器继续使用现有 IndexedDB/localStorage 路径，Quicker 继续使用 `app_data_json`；两者都不调用 Tauri 文件命令。跨运行环境迁移仍可使用应用已有的思维导图导入/导出功能。

工具栏“导出脑图”每次都会打开原生目录选择框，将完整 JSON 工作簿写入选定目录。同名文件先询问是否覆盖，取消目录选择或拒绝覆盖时结束本次导出。导出目录与业务数据目录、Obsidian 默认保存目录分别使用；此操作不会切换存储位置。
