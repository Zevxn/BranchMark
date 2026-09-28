# Tauri 桌面版

Tauri 桌面版与现有 Electron 桌面版并列维护。它复用 `app/` 的前端和根目录 `scripts/build.mjs` 生成的 `dist/`，不改思维导图业务代码。

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

Tauri 初始版本由 `standalone-shim.js` 使用浏览器存储路径，数据保存在 Tauri WebView 的站点存储中，与 Chrome、Quicker 和 Electron 的存储相互隔离。跨运行环境迁移请使用应用已有的思维导图导入/导出功能。

Quicker 子程序仍只在 Quicker 宿主中可用；Tauri 版使用应用现有的浏览器回退路径。后续接入 Tauri 原生文件或外链能力时，应增加独立宿主适配，并保留浏览器和 Quicker 路径。
