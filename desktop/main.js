'use strict';

/**
 * DeepConvo 思维导图 · 桌面外壳（Electron 主进程）
 *
 * 设计原则：app/ 目录零改动。
 *
 * 1. 用自定义协议 app://local/ 加载 app/ 的构建产物 dist/，取代 file://。
 *    注册为 standard + secure 的协议可让 File System Access API
 *    （app/JS/AI-Contents.js 里的 Obsidian 目录导出）恢复正常，
 *    同时避免 file:// 源下 IndexedDB 行为不确定、只能回退到
 *    localStorage（约 5MB 配额）的风险。协议实现见 lib/app-protocol.js。
 * 2. 不改动任何业务代码：存储仍由 app/JS/standalone-shim.js 接管。
 *    该 shim 在文件末尾无条件执行 window.chrome = chromeApi（并不检查
 *    window.chrome 是否存在），因此 localStorage + IndexedDB 会被原样接管，
 *    数据来源为 app://local。
 * 3. 不安装任何应用菜单（Menu.setApplicationMenu(null)）。
 *    Windows 上菜单栏由 Chromium 画在客户区顶部，暗色模式下它的底边会残留
 *    一条 1px 的纯白分隔线，而且「文件 / 视图 / 帮助」三个入口和页面自带的
 *    悬浮工具栏职责重复，还会白占约 26px 的垂直空间。菜单原先提供的能力
 *    改由窗口级快捷键承接，见 SECTION 菜单与快捷键。
 * 4. 没有任何 preload 脚本：渲染进程不需要 Node 能力，
 *    contextIsolation + sandbox 全开。
 */

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const {
    ORIGIN: APP_ORIGIN,
    ENTRY_PAGE,
    resolveAppRoot,
    registerAppScheme,
    installAppProtocolHandler,
} = require('./lib/app-protocol');

// SECTION 常量与路径

const WINDOW_TITLE = 'BranchMark';
const APP_USER_MODEL_ID = 'com.deepconvo.mindmap';
const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_BOUNDS = { width: 1440, height: 920 };
const MIN_WIDTH = 960;
const MIN_HEIGHT = 640;

const APP_ROOT = resolveAppRoot();

// 必须在 app ready 之前调用
registerAppScheme();

// !SECTION 常量与路径

// SECTION 链接路由

function parseUrl(rawUrl) {
    try {
        return new URL(String(rawUrl || ''));
    } catch {
        return null;
    }
}

function isAppUrl(parsed) {
    return Boolean(parsed && parsed.protocol === 'app:' && parsed.host === 'local');
}

function toAppRelativePath(parsed) {
    try {
        return decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
    } catch {
        return '';
    }
}

/**
 * 把链接交给系统处理。
 * 协议白名单与 app/JS/renderMD.js 的 QUICKER_EXTERNAL_PROTOCOLS 保持一致：
 * http、https、mailto、file、zotero、obsidian。
 */
function openExternally(rawUrl) {
    const parsed = parseUrl(rawUrl);
    if (!parsed) return;

    switch (parsed.protocol) {
        case 'http:':
        case 'https:':
        case 'mailto:':
        case 'obsidian:':
        case 'zotero:':
            void shell.openExternal(rawUrl);
            return;
        case 'file:': {
            let filePath;
            try {
                filePath = fileURLToPath(parsed);
            } catch {
                return;
            }
            if (fs.existsSync(filePath)) void shell.openPath(filePath);
            else console.warn('[desktop] 本地文件不存在:', filePath);
            return;
        }
        default:
            console.warn('[desktop] 未处理的链接协议:', parsed.protocol, rawUrl);
    }
}

// !SECTION 链接路由

// SECTION 窗口状态

function windowStatePath() {
    return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function readWindowBounds() {
    try {
        const saved = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
        if (Number.isFinite(saved?.width) && Number.isFinite(saved?.height)) {
            const bounds = {
                width: Math.max(Math.round(saved.width), MIN_WIDTH),
                height: Math.max(Math.round(saved.height), MIN_HEIGHT),
            };
            if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
                bounds.x = Math.round(saved.x);
                bounds.y = Math.round(saved.y);
            }
            return bounds;
        }
    } catch {
        // 首次启动或文件损坏，使用默认尺寸
    }
    return { ...DEFAULT_BOUNDS };
}

function saveWindowBounds(window) {
    if (!window || window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
    try {
        const { width, height, x, y } = window.getNormalBounds();
        fs.writeFileSync(windowStatePath(), JSON.stringify({ width, height, x, y }, null, 2));
    } catch (error) {
        console.warn('[desktop] 保存窗口尺寸失败:', error);
    }
}

// !SECTION 窗口状态

// SECTION 窗口

function createWindow({ page = ENTRY_PAGE, bounds = null } = {}) {
    const window = new BrowserWindow({
        ...(bounds || readWindowBounds()),
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        show: false,
        title: WINDOW_TITLE,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            // 思维导图卡片没有需要拼写纠正的自然语言输入场景，关掉以减少无谓开销
            spellcheck: false,
        },
    });

    window.once('ready-to-show', () => window.show());
    window.on('close', () => saveWindowBounds(window));

    installWindowShortcuts(window);

    // 应用内的 window.open（例如「在新窗口打开预览」）改为新建同款窗口，
    // 外部链接交给系统处理，避免弹出没有适配过的裸窗口。
    window.webContents.setWindowOpenHandler(({ url }) => {
        const parsed = parseUrl(url);
        if (isAppUrl(parsed)) {
            createWindow({ page: toAppRelativePath(parsed) || ENTRY_PAGE });
        } else {
            openExternally(url);
        }
        return { action: 'deny' };
    });

    // 只允许主窗口停留在应用自己的 HTML 页面。这一条同时兜住两种情况：
    //   1. 从资源管理器拖入文件时 Chromium 的默认跳转行为；
    //   2. Markdown 卡片里的相对链接在 app:// 源下被 renderMD.js:781
    //      判定为 kind='internal'，会执行 location.href 直接离开应用。
    window.webContents.on('will-navigate', (event, url) => {
        const parsed = parseUrl(url);
        if (isAppUrl(parsed) && /^\/HTML\/[^/]*\.html$/i.test(parsed.pathname)) return;

        event.preventDefault();
        if (isAppUrl(parsed)) {
            console.warn('[desktop] 已拦截应用内部跳转:', url);
        } else {
            openExternally(url);
        }
    });

    window.loadURL(`${APP_ORIGIN}/${page}`);
    return window;
}

function focusExistingWindow() {
    const [existing] = BrowserWindow.getAllWindows();
    if (!existing) {
        createWindow();
        return;
    }
    if (existing.isMinimized()) existing.restore();
    existing.focus();
}

// !SECTION 窗口

// SECTION 菜单与快捷键

/*
 * 桌面版不安装应用菜单，原因见文件头设计原则第 3 条。
 * 这里用 before-input-event 直接承接原先由菜单提供的键盘能力，功能没有净损失：
 *
 *   F1        关于（原「帮助 → 关于」）
 *   F5        重新加载
 *   Ctrl+F5   强制重新加载
 *   F11       全屏切换
 *   F12       开发者工具
 *   Ctrl+N    新建窗口
 *
 * 应用自身（app/JS/MindMap.js 与 MindMap-UI.js）实现的是 Ctrl+C / V / X / Z /
 * Y / A / S / F / B / I 等组合键，完全不涉及 F1-F12，因此这些按键不会和
 * 业务快捷键冲突；菜单原来绑定的 Ctrl+C / V / X / Z / A / S / F 更是从未注册，
 * 避免在页面收到 keydown 之前截走事件。除上表以外的按键一律不拦截。
 */

/** 显示版本与路径信息；原「帮助 → 关于」，现在由 F1 触发。 */
function showAboutDialog() {
    const detail = [
        `版本：${app.getVersion()}`,
        `Electron：${process.versions.electron}`,
        `Chromium：${process.versions.chrome}`,
        `Node：${process.versions.node}`,
        '',
        `页面来源：${APP_ORIGIN}/`,
        `应用资源：${APP_ROOT}`,
        `数据目录：${app.getPath('userData')}`,
    ].join('\n');

    void dialog.showMessageBox({
        type: 'info',
        title: `关于 ${WINDOW_TITLE}`,
        message: `${WINDOW_TITLE} · 桌面版`,
        detail,
        buttons: ['确定'],
        noLink: true,
    });
}

/**
 * 处理单个按键事件。
 * @returns {boolean} 是否为已消费的快捷键（true 时调用方需要 preventDefault）
 */
function runWindowShortcut(window, input) {
    const key = typeof input.key === 'string' ? input.key : '';
    const primary = input.control === true || input.meta === true;

    switch (key) {
        case 'F1':
            showAboutDialog();
            return true;
        case 'F5':
            if (primary) window.webContents.reloadIgnoringCache();
            else window.webContents.reload();
            return true;
        case 'F11':
            window.setFullScreen(!window.isFullScreen());
            return true;
        case 'F12':
            window.webContents.toggleDevTools();
            return true;
        default:
            break;
    }

    // Ctrl+N：与原「文件 → 新建窗口」一致。应用未占用该组合键。
    if (primary && !input.shift && !input.alt && key.toLowerCase() === 'n') {
        createWindow();
        return true;
    }

    return false;
}

function installWindowShortcuts(window) {
    window.webContents.on('before-input-event', (event, input) => {
        // 只处理按下、且忽略长按产生的重复事件（否则 F11/F12 会被连续触发）
        if (input.type !== 'keyDown' || input.isAutoRepeat) return;
        if (runWindowShortcut(window, input)) event.preventDefault();
    });
}

// !SECTION 菜单与快捷键

// SECTION 启动

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', focusExistingWindow);

    app.whenReady().then(() => {
        app.setAppUserModelId(APP_USER_MODEL_ID);

        if (!fs.existsSync(path.join(APP_ROOT, ENTRY_PAGE))) {
            void dialog.showMessageBox({
                type: 'error',
                title: WINDOW_TITLE,
                message: '未找到应用资源',
                detail: `缺少 ${path.join(APP_ROOT, ENTRY_PAGE)}\n请先执行 npm run dist 生成 dist/ 目录。`,
                buttons: ['退出'],
                noLink: true,
            }).then(() => app.quit());
            return;
        }

        installAppProtocolHandler(APP_ROOT);
        // 必须显式置空：不调用时 Electron 会挂上默认菜单栏，
        // 那正是要除掉的「左上角三个按钮 + 底部白线」。
        Menu.setApplicationMenu(null);
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}

// !SECTION 启动
