import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const shim = await readFile('app/JS/standalone-shim.js', 'utf8');

function createLocalStorage(values = new Map()) {
    return {
        get length() { return values.size; },
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        key(index) { return [...values.keys()][index] ?? null; },
    };
}

function startRuntime({ bridge = null, webview = null, storageValues = new Map(), host = 'mindmap.test' } = {}) {
    const location = { href: `https://${host}/HTML/MindMap.html` };
    const document = {
        currentScript: { src: `https://${host}/JS/standalone-shim.js` },
        createElement() { return { click() {} }; },
    };
    const window = { location, document, open() {} };
    if (webview) window.chrome = { webview };
    if (bridge) window.$quickerSync = bridge;
    const localStorage = createLocalStorage(storageValues);
    const context = vm.createContext({
        URL,
        clearTimeout,
        console,
        document,
        localStorage,
        location,
        queueMicrotask,
        setTimeout,
        structuredClone,
        window,
    });
    vm.runInContext(shim, context, { filename: 'standalone-shim.js' });
    return { window, storageValues };
}

const startupSnapshot = {
    data: { id: 'root', topic: '已保存脑图' },
    view: { tx: 50, ty: 80, scale: 1 },
    scrollMap: {},
};
const nativeWrites = [];
const nativeWebView = { postMessage() {} };
const nativeBridge = {
    getVar(key) {
        assert.equal(key, 'app_data_json');
        return JSON.stringify({
            version: 1,
            chrome: {
                currentFileID: 'native_file',
                MindMapData: { data: { id: 'root', topic: '旧快照' } },
            },
            idb: { 'MindMapData.__REF__native_file-extra': startupSnapshot },
        });
    },
    setVar(key, value) { nativeWrites.push({ key, value }); },
};

const native = startRuntime({
    bridge: nativeBridge,
    webview: nativeWebView,
    host: 'quicker-mindmap.test',
});
assert.equal(native.window.__DEEPCONVO_NATIVE_QUICKER_HOST__, true);
assert.equal(native.window.chrome.webview, nativeWebView,
    '覆盖 window.chrome 时必须保留 Quicker WebView2 原生通道');
assert.ok(nativeWrites.length > 0, '启动时应修复当前脑图的旧快照并写回 Quicker');
assert.deepEqual(JSON.parse(nativeWrites.at(-1).value).chrome.MindMapData, startupSnapshot);

await native.window.chrome.storage.local.set({
    mindmap_theme: 'dark',
    mindmap_card_toolbar_hover: false,
    mindmap_node_stats_visible: false,
});
const bookmarkData = { folders: {}, items: {}, rootOrder: [] };
await native.window.chrome.runtime.sendMessage({
    action: 'IDB_SET',
    data: { bookmarkData },
});
const bookmarkResult = await native.window.chrome.runtime.sendMessage({
    action: 'IDB_GET',
    keys: 'bookmarkData',
});
assert.deepEqual(bookmarkResult.data.bookmarkData, bookmarkData);
const nativeState = JSON.parse(nativeWrites.at(-1).value);
assert.equal(nativeWrites.at(-1).key, 'app_data_json');
assert.equal(nativeState.chrome.mindmap_theme, 'dark');
assert.equal(nativeState.chrome.mindmap_card_toolbar_hover, false);
assert.equal(nativeState.chrome.mindmap_node_stats_visible, false);
assert.deepEqual(nativeState.idb.bookmarkData, bookmarkData);

let transportRuntimeWindow = null;
const transportWebView = { postMessage() {} };
let transportPersistedState = JSON.stringify({ version: 1, chrome: {}, idb: {} });
const transportAwareBridge = {
    getVar() { return transportPersistedState; },
    setVar(key, value) {
        assert.equal(key, 'app_data_json');
        assert.equal(transportRuntimeWindow.chrome.webview, transportWebView,
            '$quickerSync.setVar 执行时必须仍能访问原生 WebView2 通道');
        transportPersistedState = value;
    },
};
const transportNative = startRuntime({
    bridge: transportAwareBridge,
    webview: transportWebView,
    host: 'transport-quicker-mindmap.test',
});
transportRuntimeWindow = transportNative.window;
await transportNative.window.chrome.storage.local.set({ transport_check: true });
assert.equal(JSON.parse(transportPersistedState).chrome.transport_check, true);

let asyncPersistedState = JSON.stringify({
    version: 1,
    chrome: { currentFileID: 'async_file' },
    idb: {},
});
const asyncBridge = {
    getVar() { return asyncPersistedState; },
    async setVar(key, value) {
        assert.equal(key, 'app_data_json');
        await Promise.resolve();
        asyncPersistedState = value;
    },
};
const asyncNative = startRuntime({ bridge: asyncBridge, host: 'async-quicker-mindmap.test' });
const editedSnapshot = {
    data: { id: 'root', topic: '异步桥接保存后的脑图' },
    view: { tx: 10, ty: 20, scale: 1.2 },
    scrollMap: {},
};
await asyncNative.window.chrome.runtime.sendMessage({
    action: 'IDB_SET',
    data: { 'MindMapData.__REF__async_file-extra': editedSnapshot },
});
const asyncSavedState = JSON.parse(asyncPersistedState);
assert.deepEqual(asyncSavedState.idb['MindMapData.__REF__async_file-extra'], editedSnapshot);
assert.deepEqual(asyncSavedState.chrome.MindMapData, editedSnapshot,
    'IDB_SET 返回成功前必须同步并提交重新打开动作所读取的启动快照');
const reopenedAsyncNative = startRuntime({ bridge: asyncBridge, host: 'async-quicker-mindmap.test' });
const reopenedAsyncMap = await reopenedAsyncNative.window.chrome.storage.local.get('MindMapData');
const reopenedAsyncReference = await reopenedAsyncNative.window.chrome.runtime.sendMessage({
    action: 'IDB_GET',
    keys: 'MindMapData.__REF__async_file-extra',
});
assert.deepEqual(reopenedAsyncMap.MindMapData, editedSnapshot,
    '重新打开 Quicker 动作后应恢复刚保存的当前脑图');
assert.deepEqual(reopenedAsyncReference.data['MindMapData.__REF__async_file-extra'], editedSnapshot,
    '重新打开 Quicker 动作后收藏夹引用也应恢复刚保存的脑图');

const browserValues = new Map();
const browser = startRuntime({ storageValues: browserValues, host: 'browser-mindmap.test' });
assert.equal(browser.window.__DEEPCONVO_NATIVE_QUICKER_HOST__, false);
await browser.window.chrome.storage.local.set({
    mindmap_theme: 'light',
    mindmap_card_toolbar_hover: false,
    mindmap_node_stats_visible: false,
    currentFileID: 'browser_file',
});
await browser.window.chrome.runtime.sendMessage({
    action: 'IDB_SET',
    data: { bookmarkData, 'MindMapData.__REF__browser_file-extra': startupSnapshot },
});
assert.ok(browserValues.has('deepconvo-standalone:chrome:mindmap_theme'));
assert.ok(browserValues.has('deepconvo-standalone:idb:bookmarkData'));

const reopenedBrowser = startRuntime({ storageValues: browserValues, host: 'browser-mindmap.test' });
const reopenedSettings = await reopenedBrowser.window.chrome.storage.local.get([
    'mindmap_theme',
    'mindmap_card_toolbar_hover',
    'mindmap_node_stats_visible',
]);
const reopenedBookmarks = await reopenedBrowser.window.chrome.runtime.sendMessage({
    action: 'IDB_GET',
    keys: 'bookmarkData',
});
assert.equal(reopenedSettings.mindmap_theme, 'light');
assert.equal(reopenedSettings.mindmap_card_toolbar_hover, false);
assert.equal(reopenedSettings.mindmap_node_stats_visible, false);
assert.equal(JSON.stringify(reopenedBookmarks.data.bookmarkData), JSON.stringify(bookmarkData));

console.log('存储同步校验通过：Quicker 原生变量与普通浏览器本地存储均可读写并恢复数据。');
