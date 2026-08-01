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
{"version":1,"chrome":{},"idb":{}}
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
`file:///.../index.html`：HTTPS 虚拟域名对相对资源、IndexedDB 和 WebView2 权限的兼容性更稳定。

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

## 5. 配置 Markdown 链接打开子程序

Quicker 模式会拦截思维导图 Markdown 中的外部链接，通过以下子程序交给 Windows 默认程序打开：

### `DeepConvoOpenPathOrUrl`

输入变量：

| 输入变量 | 类型 | 说明 |
| --- | --- | --- |
| `target` | 文本 | 已规范化的 Windows 文件路径或网址 |
| `kind` | 文本 | `file` 表示本地文件，`url` 表示外部网址 |
| `originalHref` | 文本 | Markdown 中未经转换的原始链接 |

子程序根据 `kind` 使用 Quicker 的“打开文件/文件夹”或“打开网址”模块，也可以统一使用支持
Windows Shell 默认程序的打开模块，并返回：

| 输出变量 | 类型 | 说明 |
| --- | --- | --- |
| `success` | 布尔 | 默认设为 `false`；成功发起打开后设为 `true` |
| `cancelled` | 布尔 | 正常执行时为 `false` |
| `error` | 文本 | 可选；失败原因，没有错误时留空 |

例如 Markdown：

```markdown
[查看论文](<file:///D:/Zotero/storage/example/paper.pdf>)
```

网页会把它转换为 `D:\Zotero\storage\example\paper.pdf` 后传给子程序。PDF、Word、图片等文件
均由 Windows 文件关联决定使用哪个默认程序打开。`http`、`https`、`mailto`、`zotero` 和
`obsidian` 链接也通过同一子程序打开；`javascript:`、`data:` 等危险协议会被拒绝。

普通浏览器不调用该子程序，仍使用浏览器原生链接行为。Quicker 内部页面的新窗请求则自动
降级为当前窗口打开，避免新 WebView2 无法识别本地虚拟域名。

## 6. 配置 Canvas 导出子程序

Quicker WebView2 不能可靠地使用网页 `showDirectoryPicker()`，而且 Quicker 返回的目录路径不能转换成
浏览器的 `FileSystemDirectoryHandle`。因此原生模式使用两个子程序完成目录选择和文件写入。

### 6.1 `DeepConvoSelectExportFolder`

该子程序不需要输入参数，调用 Quicker 的“选择文件夹”模块，并返回：

| 输出变量 | 类型 | 说明 |
| --- | --- | --- |
| `directoryPath` | 文本 | 用户选择的文件夹完整路径 |
| `cancelled` | 布尔 | 默认设为 `true`；选择成功后设为 `false` |
| `error` | 文本 | 可选；失败原因，没有错误时留空 |

用户取消时必须返回 `cancelled = true`，不要把它固定为 `false`。网页只有在选择成功后才会更新保存目录，
所以取消切换不会清除原目录。

### 6.2 `DeepConvoSaveExportFile`

该子程序接收：

| 输入变量 | 类型 | 说明 |
| --- | --- | --- |
| `directoryPath` | 文本 | 上一个子程序选择的文件夹 |
| `filename` | 文本 | 要保存的 `.canvas` 文件名 |
| `content` | 文本 | 完整文件内容 |

将 `directoryPath` 和 `filename` 组合为完整路径后，通过 Quicker 的文件写入模块保存 `content`，并返回：

| 输出变量 | 类型 | 说明 |
| --- | --- | --- |
| `success` | 布尔 | 默认设为 `false`；文件写入成功后设为 `true` |
| `cancelled` | 布尔 | 正常写入时为 `false` |
| `error` | 文本 | 可选；失败原因，没有错误时留空 |

网页会把已选择路径保存到 `app_data_json.chrome.obsidian_export_directory`。点击“切换保存目录”时调用
目录选择子程序；导出 Canvas 时调用文件保存子程序。普通浏览器仍使用原来的
`showDirectoryPicker() + IndexedDB FileSystemHandle`，不会调用 Quicker 子程序。

## 7. 数据如何保存

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

## 8. 快速自检

新动作第一次打开后，可以按以下顺序验证：

1. 新建一个收藏文件夹并创建一张脑图。
2. 关闭 WebView2 窗口。
3. 在 Quicker 动作变量中确认 `app_data_json` 已不再是初始值。
4. 再次运行动作，确认文件夹和脑图内容能够恢复。
5. 点击“导入”，确认会由 `DeepConvoImportMindMap` 子程序弹出 Quicker 原生文件选择窗口。
6. 点击“切换保存目录”，确认 `DeepConvoSelectExportFolder` 能返回目录路径。
7. 导出 Canvas，确认 `DeepConvoSaveExportFile` 将文件写入刚选择的目录。
8. 在 Markdown 中点击本地文件或网址，确认 `DeepConvoOpenPathOrUrl` 使用系统默认程序打开。

如果数据不能恢复，优先检查：变量名是否完全一致、SaveState 是否开启、WebView2 是否提供
`$quickerSync`，以及动作是否在窗口关闭前就提前结束。
