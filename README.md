# DeepConvo 思维导图独立版

本项目以 `ref` 中 DeepConvo 的原版思维导图为地基，维护一套可直接修改的独立网页应用。`ref` 只作为原始参考，不参与运行；所有产品改动直接落在 `app`。

## 保留的原版代码

以下未定制文件仍从 `ref` 原样复制到 `app`，测试会逐字节检查它们没有被改写：

- `JS/AI-Contents.js`
- `JS/utils.js`
- `JS/renderMD.js`
- `CSS/AI-Contents.css`

`HTML/MindMap.html`、`JS/MindMap.js`、`JS/BookMarks.js` 和 `CSS/BookMarks.css` 已作为独立应用正式源码维护，主题、导入导出和收藏夹精简等需求直接在这些文件中实现。

原版 KaTeX、Mermaid、Marked、Highlight、Remix Icon、Font Awesome、字体与中英文语言包均已复制到 `app`，运行时不再引用 `ref`。

## 独立运行改动

- `standalone-shim.js` 模拟原代码依赖的 `chrome.storage` 和 `chrome.runtime`。
- 原扩展后台的 IndexedDB 消息被映射到网页自己的 IndexedDB。
- 付费状态检查在独立应用中直接放行。
- 原收藏夹继续负责文件夹、脑图文件、搜索、移动、重命名、删除和列表/网格视图。
- 独立版隐藏网页收藏、聊天预览等与思维导图无关的入口。
- 亮暗主题、Quicker 原生导入和按导图名称导出均由正式思维导图代码直接实现，不再通过额外适配脚本覆盖。
- 其余脑图 DOM、CSS、工具栏、卡片、编辑器、拖拽、缩放和右键交互保持原版。

## 运行

```powershell
npm run dev
```

访问 `http://127.0.0.1:4173`，入口会跳转到原版页面 `HTML/MindMap.html`。

## 验证与构建

```powershell
npm test
npm run check
npm run build
```

构建产物位于 `dist`，可由任意静态 HTTP 服务托管。

## Quicker 动作

Quicker 动作源码位于 `quicker/DeepConvoMindMap`：

- `DeepConvoMindMap.json`：动作元数据、WebView2 引用和持久变量。
- `DeepConvoMindMap.cs`：可直接由 QK 扳手构建的最终动作代码，已内嵌 WebView2 所需的全部前端资源。
- `DeepConvoMindMap_简介.md`：动作简介。
- `DeepConvoMindMap.template.cs`：用于重新打包的 C# 模板。

重新生成动作包：

```powershell
npm run quicker:package
npm run quicker:test
```

动作启动后会把内嵌的静态资源释放到 `%LOCALAPPDATA%\Quicker\DeepConvoMindMap`，但收藏夹和思维导图数据不会写入该目录。全部用户数据保存在启用 `SaveState` 的 Quicker 动作变量 `app_data_json` 中。

Quicker 打包时只保留现代 WebView2 实际使用的 `.woff2` 字体，排除同字体的 `.ttf` 和 `.woff` 旧浏览器回退副本，使最终动作代码稳定低于 5 MB；网页开发版和 `dist` 仍保留完整文件。

当前本机动作 ID：`0ec2f0b4-429d-4274-9831-7432d7125a19`。

### 手工接入 Quicker 原生 WebView2

网页底层已支持 Quicker 原生 WebView2 提供的 `$quickerSync` 接口。你可以自行新建动作，
让 WebView2 加载构建后的 `dist/index.html`；无需 C#，也无需由本仓库创建或修改动作。

动作变量、虚拟域名映射和数据结构见 [Quicker WebView2 手工接入说明](docs/quicker-webview2-integration.md)。

### 单机图形兼容模式

如果只有某台电脑的 WebView2 出现光标或图形渲染异常，可在该电脑设置用户环境变量 `DEEPCONVO_MINDMAP_GRAPHICS_MODE`：

- `opengl`：向动作的 WebView2 传入 `--use-gl=angle --use-angle=gl`。
- `software`：向动作的 WebView2 传入 `--disable-gpu`，仅作为诊断或后备模式。

该变量由动作代码显式读取，只影响当前电脑上的思维导图动作，不会进入 Quicker 状态 JSON。修改后需要完全退出 Quicker 和相关 `msedgewebview2.exe` 进程再重新启动。

## 目录

```text
app/
  HTML/MindMap.html          独立版思维导图页面
  JS/MindMap.js              脑图交互、主题与导入导出
  JS/BookMarks.js            收藏夹与文件夹
  JS/AI-Contents.js          原版共享内容与导出工具
  JS/utils.js                原版通用交互
  JS/renderMD.js             原版 Markdown 渲染
  JS/standalone-shim.js      Chrome 扩展兼容层
  JS/standalone-locale-zh-cn.js 独立版中文语言脚本
  CSS/                       基于原版维护的应用样式
  libs/                      原版第三方资源
  locales/                   原版语言包
ref/                         参考源代码，不参与运行
quicker/                     Quicker 动作配置、代码与简介
```
