# 第三方资源与版权说明

BranchMark 自有代码由 Zevxn 编写，并由作者自己的 DeepConvo 项目演进而来。自有源码与文档按 [GPL-3.0-only](LICENSE) 提供；第三方资源保留原有版权和许可证，不因放入本仓库而改变授权。

以下前端资源已随源码提供。版本根据本地文件头或捆绑代码核对，许可证正文保存在 [docs/licenses/](docs/licenses/)。

## 前端库、字体与图标

| 组件 | 本地文件 / 版本 | 上游与许可 | 本仓库许可文本 |
| --- | --- | --- | --- |
| Marked | `app/libs/marked.min.js`，15.0.12 | [Marked](https://github.com/markedjs/marked/tree/v15.0.12)，MIT，保留其附带 Markdown 声明 | [原文](docs/licenses/marked-LICENSE.md) |
| Highlight.js | `highlight.min.js`，11.9.0；`atom-one-light.min.css` 主题 | [Highlight.js](https://github.com/highlightjs/highlight.js/tree/11.9.0)，BSD-3-Clause | [原文](docs/licenses/highlightjs-LICENSE.txt) |
| KaTeX | `katex.min.js`，0.16.9；CSS 与 auto-render | [KaTeX](https://github.com/KaTeX/KaTeX/tree/v0.16.9)，MIT | [原文](docs/licenses/katex-LICENSE.txt) |
| KaTeX 字体 | `app/libs/fonts/KaTeX_*` | [katex-fonts](https://github.com/KaTeX/katex-fonts)，MIT | [原文](docs/licenses/katex-fonts-LICENSE.txt) |
| Mermaid | `app/libs/mermaid.min.js`，代码内版本 12.0.0 | [Mermaid](https://github.com/mermaid-js/mermaid/tree/mermaid%4012.0.0)，MIT | [原文](docs/licenses/mermaid-LICENSE.txt)、[捆绑声明](docs/licenses/mermaid-bundled-notices.txt) |
| Remix Icon | `remixicon.css` 与字体，2.5.0 | [Remix Icon 2.5.0](https://github.com/Remix-Design/RemixIcon/tree/v2.5.0)，Apache-2.0 | [原文](docs/licenses/remixicon-LICENSE.txt) |
| Font Awesome Free | `app/libs/css/all.min.css` 与 `webfonts/`，7.1.0 | [Font Awesome](https://github.com/FortAwesome/Font-Awesome/tree/7.1.0)：代码 MIT、字体 OFL-1.1、SVG/JS 图标 CC-BY-4.0 | [原文](docs/licenses/fontawesome-LICENSE.txt) |

Mermaid 捆绑包还包含其他组件。本仓库保留了原文件中的版权注释，并单独保存了其中的 bundled license information，包括 DOMPurify、Lodash 和 Cytoscape 的声明；该文件不是全部传递依赖的完整许可清单。发布前仍需结合对应版本的上游源码与依赖清单核对捆绑内容。

## 桌面运行时与构建依赖

- Electron 和 electron-builder：版本与依赖见 `desktop/package.json`、`desktop/package-lock.json`。
- Tauri CLI：版本与依赖见 `desktop-tauri/package.json`、`desktop-tauri/package-lock.json`。
- Tauri、serde、rfd 与窗口插件等 Rust 依赖：见 `desktop-tauri/src-tauri/Cargo.toml` 和 `Cargo.lock`。

这些依赖由各自项目维护。分发桌面安装包时，应保留随运行时生成的第三方许可证材料，并核对实际打包依赖，不能只附本项目的 GPL 正文。

## 项目图标

桌面应用图标的生成代码位于 `desktop/tools/make-icon.mjs`。

`app/assets/mindmap.svg` 当前未启用，来源及授权本次未核实，不列为已确认的项目原创资源。维护者暂不使用该图标；后续启用或分发该资源前，应补充来源与授权说明。

## 维护方式

引入、替换或升级第三方资源时，应同步更新此文件，记录实际版本、上游来源及对应许可，保留原始版权注释。

许可证正文来自上游仓库；项目 GPL 正文采用 [SPDX 的 GPL-3.0-only 文本](https://github.com/spdx/license-list-data/blob/main/text/GPL-3.0-only.txt)，官方条款见 [GNU GPL v3](https://www.gnu.org/licenses/gpl-3.0.html)。
