(function adaptStandaloneMindMap() {
    'use strict';

    // 独立版不需要原插件的对话目录面板。BookMarks 初始化流程仍会调用
    // initDirectory，因此在这里替换为空实现，避免创建蓝色按钮、面板和定时器。
    window.initDirectory = async function initStandaloneDirectory() {};
    window.updatehasFavBtn = function updateStandaloneFavoriteButton() {};
    window.refreshDirectoryStar = function refreshStandaloneDirectoryStar() {};
    window.toggleHistoryStar = function toggleStandaloneHistoryStar() {};

    // 原版收藏夹开关会同步修改 dirBtn 的状态。保留一个不可见的兼容节点，
    // 既不呈现蓝色按钮，也无需改动原版 BookMarks.js 的交互代码。
    const directoryButtonSentinel = document.createElement('button');
    directoryButtonSentinel.id = 'dirBtn';
    directoryButtonSentinel.hidden = true;
    directoryButtonSentinel.tabIndex = -1;
    directoryButtonSentinel.setAttribute('aria-hidden', 'true');
    document.body.appendChild(directoryButtonSentinel);

    const style = document.createElement('style');
    style.id = 'standalone-mindmap-adapter';
    style.textContent = `
        /* 独立应用只管理思维导图与收藏夹文件夹；其余界面和样式保持 DeepConvo 原样。 */
        :root[data-theme="light"] {
            color-scheme: light;
            --bg-color: #f4f6f8;
            --bg-pattern: #dde1e6;
            --bg-secondary: #f1f5f9;
            --primary: #007bff;
            --line-color: #464343;
            --text-color: #24292e;
            --text-color-secondary: #666;
            --bg-mix-ratio: 75%;
            --card-bg: #ffffff;
            --card-border: transparent;
            --header-bg-top: #fff;
            --header-bg-bottom: #f9f9f9;
            --header-border-bottom: #eaecef;
            --shadow-color: rgba(0, 0, 0, 0.189);
            --shadow-color-hover: rgba(0, 0, 0, 0.219);
            --shadow-color-active: rgba(24, 144, 255, 0.15);
            --node-default-color: rgba(0, 0, 0, 0.15);
            --toolbar-bg: white;
            --toolbar-border: #e1e4e8;
            --btn-hover: #f1f3f5;
            --modal-mask: rgba(0, 0, 0, 0.45);
            --modal-bg: #ffffff;
            --scroll-track: transparent;
            --scroll-thumb: #c1c7cd;
            --scroll-thumb-hover: #a0a5aa;
            --code-block-bg: #f6f8fa;
            --code-block-border: #d0d7de;
            --code-inline-bg: rgba(175, 184, 193, 0.2);
        }

        :root[data-theme="dark"] {
            color-scheme: dark;
            --bg-color: #1e1e1e;
            --bg-pattern: #333333;
            --bg-secondary: #383838;
            --primary: #4dabf7;
            --line-color: #8a8989;
            --text-color: #e0e0e0;
            --text-color-secondary: #aaaaaa;
            --bg-mix-ratio: 97%;
            --card-bg: #2d2d2d;
            --card-border: #444;
            --header-bg-top: #383838;
            --header-bg-bottom: #303030;
            --header-border-bottom: #444;
            --shadow-color: rgba(0, 0, 0, 0.3);
            --shadow-color-hover: rgba(0, 0, 0, 0.5);
            --shadow-color-active: rgba(77, 171, 247, 0.3);
            --node-default-color: rgba(255, 255, 255, 0.15);
            --toolbar-bg: #2d2d2d;
            --toolbar-border: #444;
            --btn-hover: #3d3d3d;
            --modal-mask: rgba(0, 0, 0, 0.7);
            --modal-bg: #2d2d2d;
            --scroll-track: rgba(255, 255, 255, 0.02);
            --scroll-thumb: #4a4a4a;
            --scroll-thumb-hover: #666666;
            --code-block-bg: rgba(0, 0, 0, 0.3);
            --code-block-border: #444;
            --code-inline-bg: rgba(110, 118, 129, 0.4);
        }

        .custom-directory-container,
        #dirBtn,
        .directory-panel,
        #newItemBtn,
        #filterBtn,
        #filterDropdown,
        #switchBtn,
        .bookmark-panel .panel-actions > div,
        .bookmark-panel .item-actions button[data-action="newItem"],
        #contextMenuBM .context-menu-item[data-action="newItem"],
        #contextMenuBM .context-menu-item[data-action="newMap"],
        #contextMenuBM .context-menu-item[data-action="preview"],
        #contextMenuBM .context-menu-item[data-action="sideview"] {
            display: none !important;
        }

        .bookmark-panel .panel-actions {
            justify-content: space-between;
            gap: 0;
        }

        #btn-theme-toggle {
            flex: 0 0 auto;
        }
    `;
    document.head.appendChild(style);

    const themeStorageKey = 'mindmap_theme';
    const themeButton = document.createElement('button');
    const themeIcon = document.createElement('i');
    themeButton.className = 'btn';
    themeButton.id = 'btn-theme-toggle';
    themeButton.type = 'button';
    themeButton.setAttribute('aria-label', '切换亮暗模式');
    themeButton.appendChild(themeIcon);

    function applyTheme(theme) {
        const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = normalizedTheme;
        const switchingToDark = normalizedTheme === 'light';
        themeIcon.className = switchingToDark ? 'ri-moon-line' : 'ri-sun-line';
        themeButton.title = switchingToDark ? '切换到暗色模式' : '切换到亮色模式';
        themeButton.setAttribute('aria-pressed', String(normalizedTheme === 'dark'));
    }

    function notifyQuickerTheme(theme) {
        const webView = window.chrome && window.chrome.webview;
        if (webView && typeof webView.postMessage === 'function') {
            webView.postMessage(`DEEPCONVO_THEME:${theme}`);
        }
    }

    function showImportFeedback(message) {
        if (typeof showTopToast === 'function') {
            showTopToast(message);
        } else {
            window.alert(message);
        }
    }

    function getMindMapExportBaseName() {
        const title = String(document.title || sessionStorage.getItem('pageTitle') || '').trim();
        const safeTitle = title
            .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
            .replace(/[.\s]+$/g, '')
            .trim();
        return safeTitle || '思维导图';
    }

    function installNamedMindMapExport() {
        const exportButton = document.querySelector('#btn-export');
        if (!exportButton) return;

        // 原版将普通 JSON 导出名称写死为 mindmap.json；独立版改用当前收藏中的思维导图名称。
        exportButton.onclick = () => {
            const exportData = {
                version: 'v36-final-fix',
                data: state.data,
                view: state.view,
            };
            const url = URL.createObjectURL(new Blob(
                [JSON.stringify(exportData)],
                { type: 'application/json' },
            ));
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${getMindMapExportBaseName()}.json`;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
        };
    }

    function applyImportedMindMap(content) {
        try {
            const imported = JSON.parse(content);
            if (!imported || !imported.data) {
                throw new Error('文件中没有思维导图数据');
            }

            state.data = imported.data;
            state.view = imported.view || state.view;
            state.history = [];
            state.historyIndex = -1;
            sessionStorage.removeItem('currentFileID');
            recordHistory();
            renderTree();
            showImportFeedback('✅ 思维导图导入成功');
        } catch (error) {
            console.error('[Standalone] 导入思维导图失败:', error);
            showImportFeedback(`❌ 导入失败：${error.message || '文件格式不正确'}`);
        }
    }

    const quickerWebView = window.chrome && window.chrome.webview;
    if (quickerWebView &&
        typeof quickerWebView.postMessage === 'function' &&
        typeof quickerWebView.addEventListener === 'function') {
        const installQuickerImportButton = () => {
            const openButton = document.querySelector('#btn-open');
            if (openButton) {
                // 仅 Quicker 使用 Windows 原生选择器；普通 HTML 继续使用原版 fileInput。
                openButton.onclick = () => quickerWebView.postMessage('DEEPCONVO_IMPORT_REQUEST');
            }
        };
        if (document.readyState !== 'complete') {
            // 原版会在 DOMContentLoaded 中绑定按钮，适配层必须随后覆盖 Quicker 分支。
            document.addEventListener('DOMContentLoaded', installQuickerImportButton, { once: true });
        } else {
            installQuickerImportButton();
        }

        quickerWebView.addEventListener('message', event => {
            let payload = event.data;
            if (typeof payload === 'string') {
                try {
                    payload = JSON.parse(payload);
                } catch {
                    return;
                }
            }
            if (!payload || payload.type !== 'DEEPCONVO_IMPORT_RESULT') return;
            if (payload.cancelled) return;
            if (payload.error) {
                showImportFeedback(`❌ 导入失败：${payload.error}`);
                return;
            }
            applyImportedMindMap(payload.content);
        });
    }

    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
        const divider = document.createElement('div');
        divider.className = 'divider';
        divider.dataset.standaloneThemeDivider = 'true';
        toolbar.append(divider, themeButton);
    }

    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(systemTheme);
    window.chrome.storage.local.get(themeStorageKey).then(result => {
        const savedTheme = result && result[themeStorageKey];
        applyTheme(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : systemTheme);
    });

    themeButton.addEventListener('click', async () => {
        const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        await window.chrome.storage.local.set({ [themeStorageKey]: nextTheme });
        notifyQuickerTheme(nextTheme);
    });

    document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.standaloneMindmap = 'true';
        installNamedMindMapExport();
    });
})();
