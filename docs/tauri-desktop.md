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

## 软件更新与发布

Tauri、浏览器和 Quicker 的“检查更新”统一读取 GitHub 最新正式版信息并比较版本号。没有新版时直接显示“已是最新版本”，不读取更新清单。Tauri 发现新版且发布附件包含 `latest.json` 时，再读取自动更新信息；清单版本必须与发现的正式版一致。清单缺失、不可用或版本不一致时，提示“自动更新暂不可用，请查看新版”，仍可打开 GitHub 发布页。

自动更新可用时显示确认窗口，包含当前版本、新版本、更新说明和“立即更新 / 稍后”。选择稍后可以关闭窗口，设置按钮保留“更新到 v版本号”。选择更新后下载并验证签名，显示下载进度；完成后保存当前导图，再退出并启动安装器，安装结束后重新打开应用。新建但尚未保存的导图必须先手动保存；保存失败时不会启动安装。下载、校验或启动安装失败可在窗口内重试。浏览器和 Quicker 使用 GitHub 发布页入口。

更新签名公钥已写入 `desktop-tauri/src-tauri/tauri.conf.json`。配套私钥位于本地 `.tauri-updater/branchmark.key`，该目录已被 Git 忽略。请将私钥和 `.pub` 文件备份到安全位置；不要提交或上传私钥。换机器构建时恢复这两个文件，或通过 `TAURI_SIGNING_PRIVATE_KEY` 和可选的 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 提供原有密钥。应持续使用同一签名密钥，避免已安装的客户端无法验证后续更新。

`npm run tauri:build` 和 `build-tauri.bat` 会自动使用本地密钥签名，生成 NSIS/MSI 安装包及 `.sig`，并在 `desktop-tauri/src-tauri/target/release/bundle/latest.json` 生成更新清单。清单默认使用 NSIS 包进行应用内更新，按架构匹配；MSI 仍可手动安装。

发布前统一修改根 `package.json`、`app/version.json`、`desktop-tauri/package.json`、`src-tauri/Cargo.toml` 和 `tauri.conf.json` 的版本号；涉及 Electron 发布时同时同步其版本。可通过环境变量提供 UTF-8 更新说明文件：

```powershell
$env:BRANCHMARK_UPDATE_NOTES_FILE = 'docs/release-notes.md'
npm run tauri:build
```

构建后在 GitHub 创建与清单一致的正式 Release（例如版本 `1.0.3` 使用标签 `v1.0.3`），上传同一次构建生成的 `latest.json` 和对应版本的 `BranchMark_版本_x64-setup.exe`。`latest.json` 中已包含 `.exe.sig` 的签名内容，`.sig` 可单独上传留存，客户端无需下载它。仅上传普通安装包不能启用应用内更新，但不影响版本检查和打开发布页。更新说明直接显示清单的 `notes`，以纯文本展示。未提供说明文件时显示“此版本未提供更新说明”。

首次接入更新功能的版本需要用户手动安装一次。之后只有发布了包含更新清单和签名安装包的新版本，才能完成真实的检查、下载、安装验证。Windows 使用 `passive` 安装模式，显示安装进度，必要时仍会出现系统权限提示。

## 存储与宿主能力

Tauri 主窗口始终使用 WebView2 的默认用户数据目录。业务数据位于默认应用数据目录或用户选择的目录；`EBWebView`、缓存、GPUCache、Crashpad 和其他 WebView 配置继续由 WebView2 保存在默认位置。

窗口标题栏跟随导图的亮暗主题：设置中切换主题后立即同步，启动恢复已保存的导图主题时也会同步。

Markdown 中的 `file://` 文件链接可双击或通过键盘激活，Tauri 将链接转换为 Windows 路径后交给系统默认程序打开。支持中文、空格、百分号编码和 UNC 共享路径；文件或目录不存在、系统打开失败时显示提示。该能力只处理文件链接，浏览器和 Quicker 保留各自的打开方式。

也支持 Markdown 链接中的 `D:/目录/文件.py` 和 `D:\目录\文件.py` 盘符路径。路径或 `file://` 链接末尾的 `:行号`、`:行号:列号` 会在打开前移除；打开的是实际文件，暂不向编辑器传递行列定位参数。

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
