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

function startRuntime({
    bridge = null,
    webview = null,
    tauri = null,
    indexedDB = null,
    storageValues = new Map(),
    host = 'mindmap.test',
} = {}) {
    const location = { href: `https://${host}/HTML/MindMap.html` };
    const document = {
        currentScript: { src: `https://${host}/JS/standalone-shim.js` },
        createElement() { return { click() {} }; },
    };
    const window = { location, document, open() {} };
    if (webview) window.chrome = { webview };
    if (bridge) window.$quickerSync = bridge;
    if (tauri) window.__TAURI__ = { core: { invoke: tauri } };
    if (indexedDB) window.indexedDB = indexedDB;
    const localStorage = createLocalStorage(storageValues);
    const contextValues = {
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
    };
    if (indexedDB) contextValues.indexedDB = indexedDB;
    const context = vm.createContext(contextValues);
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

function createIndexedDb(values) {
    const databaseValues = new Map(Object.entries(values));
    const database = {
        objectStoreNames: { contains: () => true },
        transaction() {
            const transaction = { error: null };
            const store = {
                getAllKeys() {
                    const request = {};
                    queueMicrotask(() => {
                        request.result = [...databaseValues.keys()];
                        request.onsuccess?.();
                    });
                    return request;
                },
                getAll() {
                    const request = {};
                    queueMicrotask(() => {
                        request.result = [...databaseValues.values()];
                        request.onsuccess?.();
                    });
                    return request;
                },
                get(key) {
                    const request = {};
                    queueMicrotask(() => {
                        request.result = databaseValues.get(key);
                        request.onsuccess?.();
                    });
                    return request;
                },
                put(value, key) { databaseValues.set(key, value); },
                delete(key) { databaseValues.delete(key); },
            };
            transaction.objectStore = () => store;
            setTimeout(() => transaction.oncomplete?.(), 0);
            return transaction;
        },
    };
    return {
        open() {
            const request = { result: database };
            queueMicrotask(() => request.onsuccess?.());
            return request;
        },
    };
}

let tauriStoredDocument = null;
const tauriCommands = [];
const tauriInvoke = async (command, args = {}) => {
    tauriCommands.push(command);
    if (command === 'read_storage_data') {
        return tauriStoredDocument ? structuredClone(tauriStoredDocument) : null;
    }
    if (command === 'write_storage_data') {
        if (args.ifMissing && tauriStoredDocument) return structuredClone(tauriStoredDocument);
        tauriStoredDocument = structuredClone(args.data);
        return structuredClone(tauriStoredDocument);
    }
    throw new Error('Unexpected Tauri command: ' + command);
};
const tauriLegacySnapshot = {
    data: { id: 'tauri-root', topic: 'Tauri 旧数据' },
    view: { tx: 25, ty: 45, scale: 1.1 },
    scrollMap: { 'tauri-root': 12 },
};
const tauriLegacyLocalStorage = new Map([
    ['deepconvo-standalone:chrome:currentFileID', JSON.stringify('tauri_file')],
    ['deepconvo-standalone:chrome:MindMapData', JSON.stringify(tauriLegacySnapshot)],
    ['deepconvo-standalone:chrome:mindmap_theme', JSON.stringify('dark')],
    ['deepconvo-standalone:idb:legacyFallback', JSON.stringify({ retained: true })],
]);
const tauriRuntime = startRuntime({
    tauri: tauriInvoke,
    indexedDB: createIndexedDb({
        bookmarkData,
        'MindMapData.__REF__tauri_file-extra': tauriLegacySnapshot,
        'largeContents.__REF__tauri_file-extra': ['旧 Markdown 内容'],
        legacyFallback: { preferred: 'IndexedDB' },
    }),
    storageValues: tauriLegacyLocalStorage,
    host: 'tauri-mindmap.test',
});
const migratedTauriTheme = await tauriRuntime.window.chrome.storage.local.get('mindmap_theme');
const migratedTauriBookmarks = await tauriRuntime.window.chrome.runtime.sendMessage({
    action: 'IDB_GET',
    keys: null,
});
assert.equal(migratedTauriTheme.mindmap_theme, 'dark');
assert.deepEqual(migratedTauriBookmarks.data.bookmarkData, bookmarkData,
    'Tauri 首次启动应迁移 IndexedDB 中的书签索引');
assert.deepEqual(migratedTauriBookmarks.data.legacyFallback, { preferred: 'IndexedDB' },
    '同键冲突时应保留 IndexedDB 数据');
assert.deepEqual(migratedTauriBookmarks.data['MindMapData.__REF__tauri_file-extra'], tauriLegacySnapshot,
    'Tauri 首次启动应迁移导图快照引用');
assert.deepEqual(migratedTauriBookmarks.data['largeContents.__REF__tauri_file-extra'], ['旧 Markdown 内容'],
    'Tauri 首次启动应迁移大型 Markdown 引用内容');
assert.equal(tauriStoredDocument.version, 1);
assert.equal(tauriStoredDocument.chrome.currentFileID, 'tauri_file');
assert.ok(tauriCommands.includes('read_storage_data'));
assert.ok(tauriCommands.includes('write_storage_data'));
assert.equal(tauriLegacyLocalStorage.get('deepconvo-standalone:chrome:mindmap_theme'), JSON.stringify('dark'),
    '迁移不得删除旧 WebView localStorage 数据');

const tauriEditedSnapshot = {
    data: { id: 'tauri-root', topic: '文件桥接保存后的脑图' },
    view: { tx: 55, ty: 65, scale: 1.25 },
    scrollMap: {},
};
await tauriRuntime.window.chrome.storage.local.set({ mindmap_node_stats_visible: false });
await tauriRuntime.window.chrome.runtime.sendMessage({
    action: 'IDB_SET',
    data: { 'MindMapData.__REF__tauri_file-extra': tauriEditedSnapshot },
});
assert.deepEqual(tauriStoredDocument.idb['MindMapData.__REF__tauri_file-extra'], tauriEditedSnapshot);
assert.deepEqual(tauriStoredDocument.chrome.MindMapData, tauriEditedSnapshot,
    'Tauri 文件存储必须同步活动导图启动快照');
assert.equal(tauriStoredDocument.chrome.mindmap_node_stats_visible, false);
assert.equal(tauriLegacyLocalStorage.size, 4,
    'Tauri 新写入不得继续落入 WebView localStorage');

const tauriReloaded = startRuntime({
    tauri: tauriInvoke,
    storageValues: new Map(),
    host: 'tauri-mindmap.test',
});
const reloadedTauriSettings = await tauriReloaded.window.chrome.storage.local.get([
    'currentFileID',
    'mindmap_node_stats_visible',
]);
const reloadedTauriSnapshot = await tauriReloaded.window.chrome.runtime.sendMessage({
    action: 'IDB_GET',
    keys: 'MindMapData.__REF__tauri_file-extra',
});
assert.equal(reloadedTauriSettings.currentFileID, 'tauri_file');
assert.equal(reloadedTauriSettings.mindmap_node_stats_visible, false);
assert.deepEqual(reloadedTauriSnapshot.data['MindMapData.__REF__tauri_file-extra'], tauriEditedSnapshot,
    '重启后应从 Tauri 业务数据文件恢复导图内容');

console.log('存储同步校验通过：Tauri 文件、Quicker 原生变量与普通浏览器本地存储均可读写并恢复数据。');
