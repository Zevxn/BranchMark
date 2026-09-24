'use strict';

/**
 * 共享探针：一段在渲染进程里执行的探测脚本，以及基于探测结果的断言清单。
 *
 * 抽成独立模块的原因：源码态冒烟测试（tools/smoke.cjs，跑 electron 加载源目录）
 * 与产物态验证（tools/verify-packaged.cjs，跑 release/win-unpacked 里的真实 EXE）
 * 必须用**完全同一套**判断标准，否则「源码能跑但装出来的打不开」这类问题会漏掉。
 *
 * 探针覆盖的都是打包方案里真正有风险的地方：
 *   - app:// 能否正确伺服 dist/（中文路径下的 MIME、字体、大体积 JS）
 *   - 页面来源是否为 app://local、是否处于安全上下文
 *   - standalone-shim.js 是否按预期接管存储（window.chrome 兼容层）
 *   - IndexedDB 在 app:// 源上是否真的可写（选择 app:// 而非 file:// 的核心理由）
 *   - 第三方库是否全部从本地加载成功
 *   - showDirectoryPicker 是否可用（决定 Obsidian 目录导出功能是否恢复）
 */

const { ORIGIN } = require('../lib/app-protocol');

const PROBE = `(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    const indexedDbProbe = await new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        try {
            const request = indexedDB.open('__smoke__', 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('probe')) {
                    request.result.createObjectStore('probe');
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                try {
                    const tx = db.transaction('probe', 'readwrite');
                    tx.objectStore('probe').put({ at: Date.now() }, 'last');
                    tx.oncomplete = () => {
                        const readTx = db.transaction('probe', 'readonly');
                        const get = readTx.objectStore('probe').get('last');
                        get.onsuccess = () => finish(get.result ? 'writable' : 'empty');
                        get.onerror = () => finish('read-failed');
                    };
                    tx.onerror = () => finish('write-failed');
                } catch (error) {
                    finish('exception:' + error.name);
                }
            };
            request.onerror = () => finish('open-failed');
            request.onblocked = () => finish('blocked');
        } catch (error) {
            finish('exception:' + error.name);
        }
        setTimeout(() => finish('timeout'), 4000);
    });

    await wait(300);

    const styles = Array.from(document.styleSheets).map(sheet => sheet.href || 'inline');
    const externalStyles = styles.filter(href => href && /^https?:/i.test(href));
    const scriptSources = Array.from(document.querySelectorAll('script[src]')).map(s => s.getAttribute('src'));
    const remoteScripts = scriptSources.filter(src => /^https?:/i.test(src));

    return {
        title: document.title,
        origin: location.origin,
        protocol: location.protocol,
        baseUri: document.baseURI,
        isSecureContext: window.isSecureContext,
        appRootElement: Boolean(document.getElementById('app')),
        toolbarElement: Boolean(document.querySelector('.toolbar')),
        cardCount: document.querySelectorAll('.node-card').length,

        standaloneShim: window.__DEEP_CONVO_STANDALONE__ === true,
        chromeCompatLayer: typeof chrome !== 'undefined'
            && typeof chrome.storage?.local?.get === 'function'
            && typeof chrome.runtime?.sendMessage === 'function',
        shimRuntimeIdbGet: typeof idbGet === 'function',
        indexedDb: indexedDbProbe,
        showDirectoryPicker: typeof window.showDirectoryPicker === 'function',
        quickerHostFlag: window.__DEEPCONVO_NATIVE_QUICKER_HOST__ === true,

        libs: {
            marked: typeof window.marked !== 'undefined',
            katex: typeof window.katex !== 'undefined',
            mermaid: typeof window.mermaid !== 'undefined',
            hljs: typeof window.hljs !== 'undefined',
        },
        fontFaceCount: document.fonts ? document.fonts.size : -1,
        totals: {
            scripts: scriptSources.length,
            remoteScripts: remoteScripts.length,
            stylesheets: styles.length,
            remoteStyles: externalStyles.length,
        },
    };
})()`;

/**
 * 把探测结果转成断言清单。
 * @param {object} probe PROBE 的返回值
 * @returns {Array<{ name: string, passed: boolean, detail: string|boolean|number }>}
 */
function buildAssertions(probe) {
    const check = (name, passed, detail) => ({ name, passed: passed === true, detail });

    return [
        check('页面加载并解析出标题', probe.title === 'BranchMark', probe.title),
        check('来源为 app://local', probe.origin === ORIGIN, probe.origin),
        check('处于安全上下文', probe.isSecureContext === true, probe.isSecureContext),
        check('主画布容器存在', probe.appRootElement, probe.appRootElement),
        check('工具栏渲染完成', probe.toolbarElement, probe.toolbarElement),
        check('渲染出节点卡片', probe.cardCount > 0, `${probe.cardCount} 张`),
        check('standalone-shim 已生效', probe.standaloneShim, probe.standaloneShim),
        check('chrome.* 兼容层已安装', probe.chromeCompatLayer, probe.chromeCompatLayer),
        check('业务层存储函数可用', probe.shimRuntimeIdbGet, probe.shimRuntimeIdbGet),
        check('IndexedDB 在 app:// 源上可读写', probe.indexedDb === 'writable', probe.indexedDb),
        check(
            'showDirectoryPicker 可用（Obsidian 目录导出）',
            probe.showDirectoryPicker === true,
            probe.showDirectoryPicker,
        ),
        check('未被误判为 Quicker 宿主', probe.quickerHostFlag === false, probe.quickerHostFlag),
        check('marked 本地加载成功', probe.libs.marked, probe.libs.marked),
        check('katex 本地加载成功', probe.libs.katex, probe.libs.katex),
        check('mermaid 本地加载成功', probe.libs.mermaid, probe.libs.mermaid),
        check('highlight.js 本地加载成功', probe.libs.hljs, probe.libs.hljs),
        check('Web 字体已注册', probe.fontFaceCount > 0, `${probe.fontFaceCount} 个 FontFace`),
        check('无远程脚本依赖', probe.totals.remoteScripts === 0, `${probe.totals.remoteScripts} 个`),
        check('无远程样式依赖', probe.totals.remoteStyles === 0, `${probe.totals.remoteStyles} 个`),
    ];
}

/**
 * 打印探测结果与断言结论。
 * @returns {number} 失败项数量
 */
function printReport(probe, assertions) {
    console.log('\n--- 探测结果 ---');
    console.log(JSON.stringify(probe, null, 2));

    console.log('\n--- 断言 ---');
    for (const item of assertions) {
        const mark = item.passed ? 'PASS' : 'FAIL';
        console.log(`[${mark}] ${item.name}  → ${item.detail}`);
    }

    const failures = assertions.filter(item => !item.passed).length;
    console.log(`\n结果：${assertions.length - failures}/${assertions.length} 项通过`);
    return failures;
}

module.exports = { PROBE, buildAssertions, printReport };
