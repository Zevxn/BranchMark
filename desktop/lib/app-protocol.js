'use strict';

/**
 * app:// 自定义协议：把 app/ 的构建产物（dist/）当作一个正常站点来伺服。
 *
 * 为什么不用 file://：
 *   - file:// 是不透明来源，File System Access API（app/JS/AI-Contents.js 的
 *     Obsidian 目录导出）不可用；
 *   - file:// 下 IndexedDB 的行为不确定，standalone-shim.js 只能回退到
 *     localStorage（约 5MB 配额）。
 *
 * 注册为 standard + secure 之后，页面拥有正常来源（app://local），
 * localStorage / IndexedDB / showDirectoryPicker / navigator.clipboard 全部可用。
 *
 * 本模块同时被 desktop/main.js 与 desktop/tools/smoke.cjs 使用，
 * 保证「实际运行的协议行为」和「冒烟测试验证的协议行为」是同一份实现。
 */

const { app, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'local';
const ORIGIN = `${SCHEME}://${HOST}`;
const ENTRY_PAGE = 'HTML/MindMap.html';

/**
 * app/ 构建产物的根目录。
 * - 打包后：electron-builder 通过 extraResources 放到 resources/app
 * - 开发时：仓库根目录下的 dist/（由 scripts/build.mjs 生成）
 */
function resolveAppRoot() {
    return app.isPackaged
        ? path.join(process.resourcesPath, 'app')
        : path.resolve(__dirname, '..', '..', 'dist');
}

/**
 * 注册协议特权。必须在 app ready 之前调用，否则不生效。
 */
function registerAppScheme() {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: SCHEME,
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                corsEnabled: true,
                stream: true,
            },
        },
    ]);
}

/**
 * 把 app://local/<相对路径> 解析为 root 下的真实绝对路径。
 * 越界（目录穿越）时返回 null。
 */
function resolveRequestPath(root, requestUrl) {
    let parsed;
    try {
        parsed = new URL(requestUrl);
    } catch {
        return null;
    }
    if (parsed.host !== HOST) return null;

    let relative;
    try {
        relative = decodeURIComponent(parsed.pathname);
    } catch {
        return null;
    }
    relative = relative.replace(/^\/+/, '');

    const target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(root + path.sep)) return null;
    return target;
}

/**
 * 安装请求处理器。必须在 app ready 之后调用。
 */
function installAppProtocolHandler(root) {
    protocol.handle(SCHEME, async (request) => {
        let target = resolveRequestPath(root, request.url);
        if (!target) {
            console.warn('[desktop] 拒绝越界的资源请求:', request.url);
            return new Response('Forbidden', { status: 403 });
        }

        try {
            if (fs.statSync(target).isDirectory()) {
                target = path.join(target, 'index.html');
            }
        } catch {
            return new Response('Not Found', { status: 404 });
        }

        if (!fs.existsSync(target)) {
            console.warn('[desktop] 资源不存在:', request.url);
            return new Response('Not Found', { status: 404 });
        }

        // 交给 Chromium 自己的文件加载器：正确的 MIME、正确的字体/图片解码。
        return net.fetch(pathToFileURL(target).toString());
    });
}

module.exports = {
    SCHEME,
    HOST,
    ORIGIN,
    ENTRY_PAGE,
    resolveAppRoot,
    registerAppScheme,
    installAppProtocolHandler,
    resolveRequestPath,
};
