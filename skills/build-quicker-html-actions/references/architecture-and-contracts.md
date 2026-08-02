# 宿主架构与桥接契约

## 目录

1. 推荐分层
2. 宿主检测
3. 数据容器
4. 存储兼容
5. 子程序契约
6. 导航与安全
7. 常见故障

## 1. 推荐分层

```text
业务 UI 与业务模块
        |
        v
原有网页接口（chrome.storage / runtime message / IDB wrapper / file service）
        |
        v
host-adapter.js
   |                     |
   v                     v
Quicker WebView2         普通浏览器
$quickerSync             localStorage / IndexedDB
$quickerSp               File API / File System Access API
```

适配层应早于业务脚本加载。不要让业务模块到处判断 `$quickerSync` 或 `$quickerSp`。

## 2. 宿主检测

```javascript
const quickerSync = window.$quickerSync
    || (typeof $quickerSync !== 'undefined' ? $quickerSync : null);

const quickerSp = window.$quickerSp
    || (typeof $quickerSp !== 'undefined' ? $quickerSp : null);

const originalWebView = window.chrome?.webview || null;
window.__APP_NATIVE_QUICKER_HOST__ = Boolean(quickerSync);
```

如果为了兼容扩展代码而重建 `window.chrome`，把 `originalWebView` 放回 `chrome.webview`。`$quickerSync.setVar()` 可能依赖这个原生消息通道。

## 3. 数据容器

推荐动作变量名可配置，默认示例：

```json
{
  "version": 1,
  "syncUpdatedAt": 0,
  "chrome": {},
  "idb": {}
}
```

- `chrome`：模拟 `chrome.storage.local` 的键值。
- `idb`：保存原业务代码通过 IDB 封装访问的数据。
- `syncUpdatedAt`：用于诊断或跨来源冲突处理。
- `version`：为后续迁移保留。

Quicker 动作中的文本变量必须开启 SaveState。动作需要等待 WebView2 窗口关闭，保证变量在窗口存续期可读写。

## 4. 存储兼容

核心写入结构：

```javascript
async function persistState() {
    if (!quickerState) return;
    quickerState.syncUpdatedAt = Date.now();
    await Promise.resolve(quickerSync.setVar(
        'app_data_json',
        JSON.stringify(quickerState),
    ));
}

async function writeLocalValue(bucket, key, value) {
    if (quickerState) {
        quickerState[bucket][key] = structuredClone(value);
        await persistState();
        return;
    }
    localStorage.setItem(`${bucket}:${key}`, JSON.stringify(value));
}

async function writeLocalValues(bucket, values) {
    if (quickerState) {
        Object.entries(values).forEach(([key, value]) => {
            quickerState[bucket][key] = structuredClone(value);
        });
        await persistState();
        return;
    }
    Object.entries(values).forEach(([key, value]) => {
        localStorage.setItem(`${bucket}:${key}`, JSON.stringify(value));
    });
}
```

`writeLocalValue` 更新一个键；`writeLocalValues` 批量更新多个键并只提交一次。两者不是两套存储机制，必须落到同一个持久化函数。

如果业务保存流程同时维护“当前对象快照”和“收藏/索引引用”，保存时必须更新两者。重启验证时检查启动代码实际读取的键。

## 5. 子程序契约

子程序名应由项目统一定义。下面是通用契约。

### 选择并读取文件

输入：可选 `filter`、`initialDirectory`。

输出：

| 字段 | 类型 | 初始值 | 说明 |
| --- | --- | --- | --- |
| `content` | 文本 | 空 | 文件内容 |
| `path` | 文本 | 空 | 可选完整路径 |
| `cancelled` | 布尔 | `true` | 选择成功后设为 `false` |
| `error` | 文本 | 空 | 失败原因 |

### 选择目录

输出：

| 字段 | 类型 | 初始值 | 说明 |
| --- | --- | --- | --- |
| `directoryPath` | 文本 | 空 | 成功选择的目录 |
| `cancelled` | 布尔 | `true` | 成功后设为 `false` |
| `error` | 文本 | 空 | 失败原因 |

取消时保留网页中原来的目录，不要写入空值。

### 写入文件

输入：`directoryPath`、`filename`、`content`。

输出：

| 字段 | 类型 | 初始值 | 说明 |
| --- | --- | --- | --- |
| `success` | 布尔 | `false` | 写入成功后设为 `true` |
| `cancelled` | 布尔 | `false` | 非选择器通常为 `false` |
| `error` | 文本 | 空 | 失败原因 |

### 打开文件或网址

输入：`target`、`kind`、`originalHref`。

- `kind=file`：用 Windows 默认关联程序打开路径。
- `kind=url`：用默认浏览器或对应协议处理器打开。

输出：`success`、`cancelled`、`error`，初始值规则与写入文件一致。

网页按钮统一使用：

```javascript
button.disabled = true;
try {
    const result = await quickerSp(name, args);
    if (result?.cancelled) return;
    if (!result || result.success === false) {
        throw new Error(result?.error || '操作失败');
    }
} finally {
    button.disabled = false;
}
```

## 6. 导航与安全

建议允许的外部协议：`http:`、`https:`、`mailto:`、`file:`、`zotero:`、`obsidian:`。按项目缩减白名单，不要无条件扩大。

内部相对链接在 Quicker 中使用当前窗口。外部链接和本地文件交给子程序。普通浏览器保留原生链接行为。

将文件 URL 转为 Windows 路径时处理：

- `file:///D:/path/file.pdf` 到 `D:\path\file.pdf`。
- `file://server/share/file.pdf` 到 `\\server\share\file.pdf`。
- URL 百分号编码和中文路径。

## 7. 常见故障

| 现象 | 优先检查 |
| --- | --- |
| 保存后页面内切换正常，重开丢失 | 是否等待 `setVar`；是否更新启动快照；SaveState 是否开启 |
| 显示保存失败 | 是否覆盖 `window.chrome.webview`；桥接变量是否仍在窗口生命周期内 |
| 取消一次后按钮失效 | 是否在 `finally` 恢复按钮；`cancelled` 初始值是否正确 |
| 文件选择器在浏览器可用、Quicker 无响应 | 改用 Quicker 选择文件子程序 |
| 目录选择器无响应 | 改用选择目录和写文件两个子程序 |
| 新窗口打开虚拟域名失败 | 内部页面改当前窗口导航 |
| Mermaid 默认暗色 | 渲染器初始化前显式传入当前主题 |
| 图标精简后消失 | 检查图标字体 CSS、类名字符串和构建复制规则 |
| 白色手型光标 | 排查 WebView2 Runtime、GPU 驱动和 ANGLE 后端，不先归因 CSS |
