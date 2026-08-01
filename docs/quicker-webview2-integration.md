# Quicker WebView2 手工接入说明

本项目只提供网页代码与 Quicker 数据读写适配层，不负责创建、安装或修改 Quicker 动作。
构建后的页面会自动识别 Quicker 原生 WebView2 注入的 `$quickerSync`，不需要 C# 中转。

## 1. 构建网页

在项目目录执行：

```powershell
npm run build
```

静态页面会生成到项目的 `dist` 目录，入口为 `dist/index.html`。

## 2. 新建持久变量

在你自己的 Quicker 组合动作中添加一个文本变量：

- 变量名：`app_data_json`
- 类型：文本
- 保存状态（SaveState）：开启
- 初始值：

```json
{"version":1,"chrome":{"app_lang":"zh-CN"},"idb":{}}
```

变量名必须是 `app_data_json`。网页启动时调用
`$quickerSync.getVar('app_data_json')` 读取，数据变化后调用
`$quickerSync.setVar('app_data_json', json)` 写回。写入值始终是 JSON 字符串。

## 3. 配置 WebView2 浏览器窗口

在动作中添加 Quicker 自带的“WebView2 浏览器窗口”模块，并按以下原则配置：

- 将 `dist` 目录映射为一个 HTTPS 虚拟域名，例如 `deepconvo-mindmap.local`。
- 打开地址使用 `https://deepconvo-mindmap.local/index.html`。
- 建议选择“打开网页并等待窗口关闭”，确保动作变量在窗口使用期间始终可读写。
- WebView Profile 可以按你的动作单独设置，避免与其他网页动作混用浏览器缓存。

虚拟域名对应的本地目录必须填写你电脑上 `dist` 的绝对路径。不要直接使用
`file:///.../index.html`：页面包含相对资源和 `fetch` 请求，HTTPS 虚拟域名的兼容性更稳定。

页面不需要额外注入 JavaScript。原生 WebView2 提供 `$quickerSync` 后，适配层会自动启用
Quicker 持久化；若没有该接口，则自动退回普通浏览器的 localStorage/IndexedDB，不会误写动作变量。

## 4. 配置原生文件导入子程序

Quicker 的 WebView2 宿主不能可靠地通过网页 `<input type="file">` 打开本地文件。网页检测到
Quicker 原生宿主后，会改为调用：

```javascript
await $quickerSp('DeepConvoImportMindMap', {})
```

因此需要在你自己的动作中手工添加一个名为 `DeepConvoImportMindMap` 的子程序。该子程序不需要
C#，只使用 Quicker 自带模块：

1. 添加“选择文件”模块，操作类型选择“打开单个文件”。
2. 文件筛选器填写 `思维导图 JSON|*.json|所有文件|*.*`。
3. 输出“是否成功”和“路径”，取消选择时不要中止整个动作。
4. 选择成功后，使用“读取文件”模块按文本读取该路径。
5. 子程序定义以下输出变量，并确保勾选为输出：

| 输出变量 | 类型 | 含义 |
| --- | --- | --- |
| `content` | 文本 | “读取文件”模块得到的完整 JSON 文本 |
| `cancelled` | 布尔 | 用户取消时为 `true`，读取成功时为 `false` |
| `error` | 文本 | 可选；失败原因，没有错误时留空 |

变量名和子程序名称需要完全一致。点击网页“导入”按钮后，网页会异步等待子程序返回，再解析
`content` 并载入脑图。这条路径使用 Quicker 原生文件对话框，不依赖 WebView2 的网页上传能力。

## 5. 数据如何保存

`app_data_json` 是核心业务状态的单一 JSON 容器：

```json
{
  "version": 1,
  "syncUpdatedAt": 0,
  "chrome": {},
  "idb": {}
}
```

- `chrome`：适配原网页的 `chrome.storage.local`，保存当前文件、主题、收藏夹展开状态等。
- `idb.bookmarkData`：收藏夹目录树和收藏项元数据。
- `idb["MindMapData.__REF__<文件ID>-extra"]`：每个收藏脑图的完整内容。
- `syncUpdatedAt`：最近一次写回的时间戳。

收藏夹读取时，原业务代码请求 `IDB_GET bookmarkData`，适配层从 `idb.bookmarkData` 返回；
新增、重命名、移动或删除后，业务代码发送 `IDB_SET`，适配层更新内存状态并立即把完整 JSON
写回 `app_data_json`。脑图内容采用同样流程，因此关闭窗口后再次打开仍可恢复。

## 6. 快速自检

新动作第一次打开后，可以按以下顺序验证：

1. 新建一个收藏文件夹并创建一张脑图。
2. 关闭 WebView2 窗口。
3. 在 Quicker 动作变量中确认 `app_data_json` 已不再是初始值。
4. 再次运行动作，确认文件夹和脑图内容能够恢复。
5. 点击“导入”，确认会由 `DeepConvoImportMindMap` 子程序弹出 Quicker 原生文件选择窗口。

如果数据不能恢复，优先检查：变量名是否完全一致、SaveState 是否开启、WebView2 是否提供
`$quickerSync`，以及动作是否在窗口关闭前就提前结束。
