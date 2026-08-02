---
name: build-quicker-html-actions
description: 将本地 HTML、CSS、JavaScript 应用适配、重构或排查为可靠的 Quicker WebView2 动作前端，同时保留普通浏览器运行能力。用于 Quicker WebView2 宿主检测、动作变量持久化、Chrome 扩展 API 兼容、文件或目录选择、文件写入、默认程序打开链接、子程序桥接、主题渲染、构建发布和重启级回归测试；也用于用户要求只修改网页底层、不创建或编辑 Quicker 动作的场景。
---

# 构建 Quicker HTML 动作

## 核心原则

把网页业务代码、宿主适配层和 Quicker 动作配置分开。优先通过一层薄适配器复用现有网页，不在业务模块中散落 Quicker 判断。

严格遵守用户给出的修改边界。若用户要求只改底层网页代码，不得创建、安装或编辑 Quicker 动作，只输出需要用户手工配置的变量和子程序契约。仅在用户明确授权时才修改动作。

保留普通浏览器路径。Quicker 专用修复不得破坏 `localStorage`、IndexedDB、`<input type="file">`、File System Access API、普通网址打开等原有浏览器行为。

## 工作流

### 1. 审计现状

先检查入口 HTML、构建脚本、加载顺序、存储 API、文件操作、链接导航、主题初始化和现有测试。绘制最小依赖关系：

```text
业务模块 -> Web API 或扩展 API -> 适配层 -> Quicker / 普通浏览器
```

定位真正的启动数据源和保存数据源。不要因为界面内切换后状态仍在，就认定已经持久化成功。

在删除或精简代码前，先搜索所有调用点、动态字符串、CSS 类名、图标字体和构建复制规则。精简后立即检查图标、导入、保存、主题和收藏夹等高风险功能。

### 2. 确定宿主能力边界

把能力分为三类：

1. 纯网页能力：渲染、编辑、内存状态和普通浏览器存储。
2. Quicker 注入能力：使用 `$quickerSync` 读写动作变量。
3. 原生系统能力：通过 `$quickerSp` 调用用户配置的 Quicker 子程序完成文件选择、目录选择、任意路径写入和 Shell 打开。

不要假定 WebView2 中所有浏览器 API 都可靠。文件选择、`showDirectoryPicker()`、下载、新窗口和本地虚拟域名导航必须单独验证。

需要详细实现时，读取 [宿主架构与桥接契约](references/architecture-and-contracts.md)。

### 3. 实现单一适配层

在最早加载的独立脚本中完成宿主检测和 API 兼容。业务代码继续调用原来的接口，例如 `chrome.storage.local` 或封装后的 IDB 消息，不直接感知 Quicker。

检测到 `$quickerSync` 才进入原生 Quicker 持久化模式，并设置明确的宿主标记。若重建 `window.chrome`，必须保留原有 `window.chrome.webview`，否则 Quicker 注入桥接可能在真正写回时失效。

不要使用 user agent、域名或是否存在 WebView2 来推断 Quicker。普通 Edge WebView2 与 Quicker 注入能力不是一回事。

### 4. 设计持久化

优先使用一个开启 SaveState 的文本动作变量保存版本化 JSON 容器。启动时读取一次，写入时更新内存镜像并等待 `$quickerSync.setVar()` 完成后再报告成功。

单键写入和批量写入必须共用同一持久化入口。保存业务对象时，同时更新应用重新启动真正读取的快照或索引，避免只更新收藏项引用而启动快照仍是旧值。

普通浏览器继续使用原有 `localStorage` 或 IndexedDB。不要把浏览器的 `FileSystemHandle` 序列化进 Quicker JSON。

必须测试以下生命周期：保存、关闭 WebView2/动作、重新运行、重新读取。仅测试页面内切换不算持久化验证。

### 5. 桥接原生操作

优先让 Quicker 自带模块组成子程序，不默认引入 C#。网页只调用命名稳定、输入输出明确的 `$quickerSp(name, args)`。

选择器子程序将 `cancelled` 默认设为 `true`，仅在用户确实选择成功后改为 `false`。写入或打开型子程序将 `success` 默认设为 `false`，成功后再设为 `true`。所有子程序都提供可选 `error` 文本。

网页按钮必须用 `try/finally` 恢复忙碌状态。取消、失败、异常和成功都必须允许再次点击。

对本地文件和外部网址使用协议白名单。拒绝 `javascript:`、`data:` 等危险协议。将 `file://` 正确转换为 Windows 盘符路径或 UNC 路径后再交给 Quicker。

### 6. 处理 WebView2 导航和渲染

优先用 HTTPS 虚拟域名映射构建目录，不直接以 `file:///` 打开入口。确保资源使用相对路径。

Quicker 内部页面的新窗口请求优先降级为当前窗口导航；外部网址和本地文件统一交给子程序或系统默认程序。不要让普通浏览器尝试解析只存在于 Quicker WebView2 内部的虚拟域名。

主题必须由页面状态显式驱动。初始化 Mermaid 等第三方渲染器前先确定主题，避免 WebView2 的系统暗色偏好覆盖应用亮色模式。新增 CSS 必须复用主题变量并检查明暗两种模式。

若光标、透明通道或合成仅在特定显卡上异常，先区分 CSS 问题与 WebView2/ANGLE 图形后端问题。不要用自定义光标掩盖驱动故障。

### 7. 验证并交付

按 [回归检查清单](references/regression-checklist.md) 验证两种宿主。至少运行语法检查、适配层单元测试、完整测试和生产构建。

交付时分别列出：网页代码改动、用户需要手工创建的动作变量、子程序输入输出、未修改的 Quicker 动作，以及测试结果。若用户要求提交说明，基于上次提交之后的实际 diff 编写，不混入更早工作。

## 禁止事项

- 不经授权创建、编辑、安装或发布 Quicker 动作。
- 不默认使用 C# 重写已有 HTML 应用或文件对话框。
- 不删除普通浏览器回退逻辑。
- 不把异步写入当作同步成功，也不吞掉写入异常。
- 不把取消当作失败，不把 `cancelled` 永久写死为 `false`。
- 不用会话内状态恢复替代关闭动作后的持久化测试。
- 不覆盖 `window.chrome.webview`。
- 不允许危险链接协议进入系统 Shell。

## 可复用输入

当用户希望直接用提示词而非安装 Skill 时，复制并填写 [提示词模板](assets/reusable-prompt.md)。
