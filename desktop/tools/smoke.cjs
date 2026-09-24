'use strict';

/**
 * 源码态冒烟测试：验证 app:// 协议下思维导图能真正跑起来。
 *
 * 这是唯一可靠的验证方式——GUI 应用没法靠肉眼看进程活着就算通过。
 * 探针脚本与断言清单来自 tools/probe.cjs，与产物验证脚本共用，
 * 保证「源码能跑」和「装出来的能跑」用同一套标准衡量。
 *
 * 运行：npm run smoke（在 desktop/ 下）
 * 退出码 0 表示全部通过，1 表示有失败项。
 */

const { app, BrowserWindow } = require('electron');

const {
    ORIGIN,
    ENTRY_PAGE,
    resolveAppRoot,
    registerAppScheme,
    installAppProtocolHandler,
} = require('../lib/app-protocol');

const { PROBE, buildAssertions, printReport } = require('./probe.cjs');

const APP_ROOT = resolveAppRoot();
const TIMEOUT_MS = 30000;

registerAppScheme();

async function run() {
    installAppProtocolHandler(APP_ROOT);

    const window = new BrowserWindow({
        show: false,
        width: 1280,
        height: 800,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    const consoleErrors = [];
    // Electron 新旧版本的 console-message 签名不同：
    //   旧：(event, level:number, message:string, ...)
    //   新：(event, details:{ level:'info'|'warning'|'error'|..., message:string })
    // 这里同时兼容，避免冒烟测试因为 Electron 升级而误报。
    window.webContents.on('console-message', (...args) => {
        const details = args[1];
        if (details && typeof details === 'object' && typeof details.level === 'string') {
            if (details.level === 'error' || details.level === 'warning') {
                consoleErrors.push(`[${details.level}] ${details.message}`);
            }
            return;
        }
        const level = args[1];
        const message = args[2];
        if (typeof level === 'number' && level >= 2) consoleErrors.push(`[console] ${message}`);
    });
    window.webContents.on('did-fail-load', (event, code, description, url) => {
        consoleErrors.push(`did-fail-load ${code} ${description} ${url}`);
    });

    try {
        await window.loadURL(`${ORIGIN}/${ENTRY_PAGE}`);
    } catch (error) {
        console.error('[FAIL] 页面加载失败:', error.message);
        app.exit(1);
        return;
    }

    const probe = await window.webContents.executeJavaScript(PROBE, true);

    console.log('\n--- 环境 ---');
    console.log(`应用资源根目录 : ${APP_ROOT}`);
    console.log(`页面地址       : ${ORIGIN}/${ENTRY_PAGE}`);
    console.log(`Electron       : ${process.versions.electron}  Chromium: ${process.versions.chrome}`);

    const realErrors = consoleErrors.filter(
        message => !/Autofill|DevTools|net::ERR_FILE_NOT_FOUND.*favicon/i.test(message),
    );
    if (realErrors.length) {
        console.log('\n--- 页面控制台告警/错误 ---');
        realErrors.slice(0, 20).forEach(message => console.log(`  ${message}`));
    }

    const assertions = buildAssertions(probe);
    const failures = printReport(probe, assertions);

    app.exit(failures === 0 ? 0 : 1);
}

const timeout = setTimeout(() => {
    console.error('[FAIL] 冒烟测试超时');
    app.exit(1);
}, TIMEOUT_MS);

app.whenReady().then(() => {
    run()
        .catch(error => {
            console.error('[FAIL] 冒烟测试异常:', error);
            app.exit(1);
        })
        .finally(() => clearTimeout(timeout));
});
