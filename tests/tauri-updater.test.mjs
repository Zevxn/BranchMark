import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('app/JS/MindMap.js', 'utf8');
const updateSource = source.slice(source.indexOf('// SECTION 项目与版本更新'), source.indexOf('// !SECTION 项目与版本更新'));

// SECTION 更新流程行为检查

function setup({ native = true, saved = true, storage = {} } = {}) {
    const calls = [];
    const elements = new Map();
    const document = { activeElement: null };
    const element = selector => {
        if (!elements.has(selector)) {
            const classes = new Set();
            const listeners = {};
            elements.set(selector, {
                textContent: '', hidden: false, disabled: false, isConnected: true,
                classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
                addEventListener: (name, handler) => { listeners[name] = handler; },
                setAttribute(name, value) { this[name] = value; },
                removeAttribute(name) { delete this[name]; },
                focus() { document.activeElement = this; },
                click: () => listeners.click({ target: elements.get(selector) }),
            });
        }
        return elements.get(selector);
    };
    const state = { saveResult: true, storageError: false, downloadFailures: 0, checkError: false, progress: null, releaseVersion: 'v1.0.3', hasManifest: true, apiStatus: 200 };
    const info = { version: '1.0.3', currentVersion: '1.0.2', notes: '<script>alert(1)</script>\n更新说明' };
    const core = {
        Channel: class {},
        async invoke(command, args) {
            calls.push(command);
            if (command === 'get_branchmark_version') return '1.0.2';
            if (command === 'check_branchmark_update') {
                if (state.checkError) throw new Error('网络不可用');
                return state.noUpdate ? null : info;
            }
            if (command === 'download_branchmark_update') {
                assert.equal(args.version, '1.0.3');
                args.onProgress.onmessage({ downloaded: 5, total: 10 });
                state.progress = element('#branchMarkUpdateProgress').value;
                if (state.downloadFailures-- > 0) throw new Error('签名校验失败');
                if (state.waitForDownload) await state.waitForDownload;
            }
        },
    };
    const keyHandlers = [];
    const windowHandlers = {};
    const context = vm.createContext({
        window: { __TAURI__: native ? { core } : undefined, addEventListener(name, handler) { windowHandlers[name] = handler; if (name === 'keydown') keyHandlers.push(handler); }, open: url => calls.push(url) },
        document, $: element, URL, AbortController, setTimeout, clearTimeout,
        location: { href: 'http://localhost/HTML/MindMap.html' },
        console: { warn() {} },
        positionMindMapSettingsPopover() {}, setMindMapSettingsPopoverOpen() {},
        sessionStorage: { getItem: () => saved ? 'map-1' : null },
        bookmarkManager: { data: { items: saved ? { 'map-1': {} } : {} } },
        commitCurrentMindMapTabEdits: () => calls.push('commit'),
        saveMindMapData: async () => { calls.push('save'); return state.saveResult; },
        chrome: { storage: { local: {
            async get(key) { return { [key]: storage[key] }; },
            async set(values) {
                if (state.storageError) throw new Error('引用写入失败');
                if ('currentFileID' in values) calls.push('persist-reference');
                Object.assign(storage, values);
            },
        } } },
        fetch: async url => {
            const versionFile = String(url).includes('version.json');
            calls.push(versionFile ? 'fetch-version' : 'fetch-release');
            return {
                ok: versionFile || state.apiStatus === 200,
                status: versionFile ? 200 : state.apiStatus,
                json: async () => versionFile ? { version: '1.0.2' } : {
                    tag_name: state.releaseVersion,
                    assets: state.hasManifest ? [{ name: 'latest.json' }] : [],
                },
            };
        },
    });
    vm.runInContext(updateSource, context);
    context.initializeBranchMarkAbout();
    return { calls, element, state, info, keyHandlers, document, windowHandlers };
}

const reminders = {};
const startup = setup({ storage: reminders });
await startup.windowHandlers.load();
assert.equal(startup.element('#branchMarkUpdateModal').classList.contains('show'), true);
assert.equal(startup.calls.includes('download_branchmark_update'), false);
await startup.element('#laterBranchMarkUpdate').click();
const restarted = setup({ storage: reminders });
await restarted.windowHandlers.load();
assert.equal(restarted.element('#branchMarkUpdateModal').classList.contains('show'), false, '重启后同一版本不再自动提醒');
await restarted.element('#btn-check-update').click();
assert.equal(restarted.element('#branchMarkUpdateModal').classList.contains('show'), true, '已提醒的版本仍可手动打开');
const newer = setup({ storage: reminders });
newer.state.releaseVersion = 'v1.0.4';
newer.info.version = '1.0.4';
await newer.windowHandlers.load();
assert.equal(newer.element('#branchMarkUpdateModal').classList.contains('show'), true, '更高版本重新自动提醒');
const manualStorage = {};
const manual = setup({ storage: manualStorage });
await manual.element('#btn-check-update').click();
await manual.element('#laterBranchMarkUpdate').click();
const afterManual = setup({ storage: manualStorage });
await afterManual.windowHandlers.load();
assert.equal(afterManual.element('#branchMarkUpdateModal').classList.contains('show'), false, '手动查看过的版本不再自动提醒');
const reminderFailure = setup();
reminderFailure.state.storageError = true;
await reminderFailure.windowHandlers.load();
assert.equal(reminderFailure.element('#branchMarkUpdateModal').classList.contains('show'), false, '提醒记录写入失败时保持安静');
await reminderFailure.element('#btn-check-update').click();
assert.equal(reminderFailure.element('#branchMarkUpdateModal').classList.contains('show'), true);

const first = setup();
await first.element('#btn-check-update').click();
assert.equal(first.element('#branchMarkUpdateTitle').textContent, '发现新版本 v1.0.3');
assert.equal(first.element('#branchMarkUpdateNotes').textContent, first.info.notes);
assert.equal(first.element('#branchMarkUpdateModal').classList.contains('show'), true);
assert.ok(first.calls.indexOf('fetch-release') < first.calls.indexOf('check_branchmark_update'), '先比较 GitHub 版本，再读取自动更新清单');
await first.element('#laterBranchMarkUpdate').click();
assert.equal(first.element('#branchMarkUpdateModal').classList.contains('show'), false);
assert.equal(first.element('#btn-check-update').textContent, '更新到 v1.0.3');
assert.equal(first.calls.includes('download_branchmark_update'), false);
await first.element('#btn-check-update').click();
await first.element('#confirmBranchMarkUpdate').click();
assert.equal(first.state.progress, 50);
assert.deepEqual(first.calls.slice(-5), ['download_branchmark_update', 'commit', 'save', 'persist-reference', 'install_branchmark_update']);

const retry = setup();
retry.state.downloadFailures = 1;
await retry.element('#btn-check-update').click();
await retry.element('#confirmBranchMarkUpdate').click();
assert.match(retry.element('#branchMarkUpdateError').textContent, /签名校验失败/);
assert.equal(retry.calls.includes('install_branchmark_update'), false);
retry.state.saveResult = false;
await retry.element('#confirmBranchMarkUpdate').click();
assert.equal(retry.calls.includes('install_branchmark_update'), false);
assert.match(retry.element('#branchMarkUpdateError').textContent, /保存失败/);
retry.state.saveResult = true;
retry.state.storageError = true;
await retry.element('#confirmBranchMarkUpdate').click();
assert.equal(retry.calls.includes('install_branchmark_update'), false);
retry.state.storageError = false;
await retry.element('#confirmBranchMarkUpdate').click();
assert.equal(retry.calls.filter(call => call === 'download_branchmark_update').length, 2, '安装重试复用已校验的下载包');
assert.equal(retry.calls.at(-1), 'install_branchmark_update');

const unsaved = setup({ saved: false });
await unsaved.element('#btn-check-update').click();
await unsaved.element('#confirmBranchMarkUpdate').click();
assert.match(unsaved.element('#branchMarkUpdateError').textContent, /先保存当前新建导图/);
assert.equal(unsaved.calls.includes('install_branchmark_update'), false);

const busy = setup();
let finishDownload;
busy.state.waitForDownload = new Promise(resolve => { finishDownload = resolve; });
await busy.element('#btn-check-update').click();
const pending = busy.element('#confirmBranchMarkUpdate').click();
assert.equal(busy.element('#laterBranchMarkUpdate').disabled, true);
busy.keyHandlers[0]({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
assert.equal(busy.element('#branchMarkUpdateModal').classList.contains('show'), true);
finishDownload();
await pending;

const failedCheck = setup();
failedCheck.state.apiStatus = 503;
await failedCheck.element('#btn-check-update').click();
assert.equal(failedCheck.element('#btn-check-update').disabled, false);
assert.equal(failedCheck.element('#btn-check-update').textContent, '检查更新');

const current = setup();
current.state.releaseVersion = 'v1.0.2';
current.state.hasManifest = false;
current.state.checkError = true;
await current.element('#btn-check-update').click();
assert.equal(current.element('#branchMarkUpdateStatus').textContent, '已是最新版本');
assert.equal(current.element('#branchMarkUpdateModal').classList.contains('show'), false);
assert.equal(current.calls.includes('check_branchmark_update'), false, '当前已是最新版时不依赖更新清单');

const olderRelease = setup();
olderRelease.state.releaseVersion = 'v1.0.1';
await olderRelease.element('#btn-check-update').click();
assert.equal(olderRelease.element('#branchMarkUpdateStatus').textContent, '已是最新版本');
assert.equal(olderRelease.calls.includes('check_branchmark_update'), false);

for (const reason of ['missing', 'failed', 'stale', 'empty']) {
    const fallback = setup();
    if (reason === 'missing') fallback.state.hasManifest = false;
    if (reason === 'failed') fallback.state.checkError = true;
    if (reason === 'stale') fallback.info.version = '1.0.4';
    if (reason === 'empty') fallback.state.noUpdate = true;
    await fallback.element('#btn-check-update').click();
    assert.match(fallback.element('#branchMarkUpdateStatus').textContent, /发现新版 v1.0.3.*自动更新暂不可用/);
    assert.equal(fallback.element('#btn-check-update').textContent, '查看新版');
    assert.equal(fallback.element('#branchMarkUpdateModal').classList.contains('show'), false);
    assert.equal(fallback.calls.includes('download_branchmark_update'), false);
    if (reason === 'missing') assert.equal(fallback.calls.includes('check_branchmark_update'), false);
    await fallback.element('#btn-check-update').click();
    assert.equal(fallback.calls.at(-1), 'open_branchmark_url');
}

const browser = setup({ native: false });
await browser.element('#btn-check-update').click();
assert.equal(browser.element('#btn-check-update').textContent, '查看新版');
await browser.element('#btn-check-update').click();
assert.equal(browser.calls.at(-1), 'https://github.com/Zevxn/BranchMark/releases/tag/v1.0.3');
assert.equal(browser.element('#branchMarkUpdateModal').classList.contains('show'), false);

console.log('Tauri 更新流程检查通过：每个版本只自动提醒一次、手动打开、统一版本判断、清单回退、进度、重试及保存门槛。');

// !SECTION 更新流程行为检查
