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

// SECTION Tauri 分文件存储
const tauriValues = { chrome: {}, idb: {} };
const tauriCommands = [];
const unreadableKeys = new Set();
let failNextWrite = false;
let failWriteKey = null;
const tauriInvoke = async (command, args = {}) => {
    tauriCommands.push({ command, args: structuredClone(args) });
    const values = tauriValues[args.bucket];
    if (command === 'read_storage_values') {
        const keys = args.keys ?? Object.keys(values);
        if (keys.some(key => unreadableKeys.has(key))) throw new Error('测试：导图文件损坏');
        return Object.fromEntries(keys.filter(key => Object.hasOwn(values, key))
            .map(key => [key, structuredClone(values[key])]));
    }
    if (command === 'write_storage_values') {
        if (failNextWrite || (failWriteKey && Object.hasOwn(args.values, failWriteKey))) {
            failNextWrite = false;
            failWriteKey = null;
            throw new Error('测试：磁盘不可写');
        }
        if (args.bucket === 'chrome') assert.equal(Object.hasOwn(args.values, 'MindMapData'), false,
            '状态写入不得包含完整导图');
        Object.assign(values, structuredClone(args.values));
        args.removedKeys.forEach(key => delete values[key]);
        return null;
    }
    throw new Error('Unexpected Tauri command: ' + command);
};
const oldLocalStorage = new Map([
    ['deepconvo-standalone:chrome:mindmap_theme', JSON.stringify('dark')],
    ['deepconvo-standalone:idb:bookmarkData', JSON.stringify(bookmarkData)],
]);
const tauriRuntime = startRuntime({
    tauri: tauriInvoke,
    indexedDB: { open() { throw new Error('Tauri 不应访问旧 IndexedDB'); } },
    storageValues: oldLocalStorage,
});
assert.equal(tauriRuntime.window.__DEEPCONVO_NATIVE_TAURI_HOST__, true);
const initialSettings = await tauriRuntime.window.chrome.storage.local.get({ mindmap_theme: 'light' });
assert.equal(initialSettings.mindmap_theme, 'light', '测试阶段不迁移旧 WebView 数据');
assert.equal(tauriCommands.length, 1, '启动只读取状态，不扫描所有导图');
assert.equal(tauriCommands[0].args.bucket, 'chrome');

const mapKey = 'MindMapData.__REF__tauri_file-extra';
const otherMapKey = 'MindMapData.__REF__other_file-extra';
const contentKey = 'largeContents.__REF__tauri_file-extra';
const tauriSnapshot = {
    version: 'tabs-v1',
    documentId: 'tauri_file',
    activeTabId: 'tab-a',
    tabs: [
        { id: 'tab-a', name: '第一页', data: { id: 'root-a', topic: 'A', relations: [], summaries: [] },
            view: { tx: 25, ty: 45, scale: 1.1 }, scrollMap: { 'root-a': 12 } },
        { id: 'tab-b', name: '第二页', data: { id: 'root-b', topic: 'B', children: [] } },
    ],
};
await tauriRuntime.window.chrome.runtime.sendMessage({
    action: 'IDB_SET',
    data: { [mapKey]: tauriSnapshot, bookmarkData, [contentKey]: ['Markdown 内容'] },
});
await Promise.all([
    tauriRuntime.window.chrome.storage.local.set({ mindmap_theme: 'dark' }),
    tauriRuntime.window.chrome.storage.local.set({ mindmap_node_stats_visible: false }),
    tauriRuntime.window.chrome.runtime.sendMessage({
        action: 'IDB_SET', data: { [otherMapKey]: { data: { topic: '另一张导图' } } },
    }),
]);
assert.deepEqual(tauriValues.idb[mapKey], tauriSnapshot);
assert.equal(tauriValues.chrome.mindmap_theme, 'dark');
assert.equal(tauriValues.chrome.mindmap_node_stats_visible, false);
assert.equal(oldLocalStorage.size, 2, '新写入不得进入 WebView localStorage');

const tauriEditedSnapshot = structuredClone(tauriSnapshot);
tauriEditedSnapshot.tabs[0].data.topic = '已编辑';
const saveStart = tauriCommands.length;
await tauriRuntime.window.chrome.runtime.sendMessage({ action: 'IDB_SET', data: { [mapKey]: tauriEditedSnapshot } });
const saveWrites = tauriCommands.slice(saveStart).filter(call => call.command === 'write_storage_values');
assert.equal(saveWrites.length, 1, '当前导图保存只提交一次内容写入，不重复保存启动快照');
assert.deepEqual(Object.keys(saveWrites[0].args.values), [mapKey], '不能提交其他导图或收藏夹');
assert.equal(tauriValues.idb[otherMapKey].data.topic, '另一张导图');
assert.equal(Object.hasOwn(tauriValues.chrome, 'MindMapData'), false);

const reloadStart = tauriCommands.length;
const tauriReloaded = startRuntime({ tauri: tauriInvoke });
const reloadedSettings = await tauriReloaded.window.chrome.storage.local.get(['currentFileID', 'mindmap_theme']);
assert.equal(reloadedSettings.currentFileID, 'tauri_file');
assert.equal(reloadedSettings.mindmap_theme, 'dark');
assert.equal(tauriCommands.length - reloadStart, 1, '读取设置不得加载导图文件');
const reloadedSnapshot = await tauriReloaded.window.chrome.storage.local.get('MindMapData');
assert.deepEqual(reloadedSnapshot.MindMapData, tauriEditedSnapshot, '启动根据当前 ID 恢复完整多标签工作簿');
assert.deepEqual(tauriCommands.at(-1).args.keys, [mapKey], '恢复当前导图不得扫描其他文件');
const allValues = await tauriReloaded.window.chrome.runtime.sendMessage({ action: 'IDB_GET', keys: null });
assert.deepEqual(allValues.data[contentKey], ['Markdown 内容']);
assert.deepEqual(allValues.data.bookmarkData, bookmarkData);

failNextWrite = true;
await assert.rejects(tauriReloaded.window.chrome.storage.local.set({ mindmap_theme: 'light' }), /磁盘不可写/);
assert.equal((await tauriReloaded.window.chrome.storage.local.get('mindmap_theme')).mindmap_theme, 'dark',
    '写入失败不能提前修改内存状态');
await tauriReloaded.window.chrome.storage.local.set({ mindmap_theme: 'light' });
assert.equal(tauriValues.chrome.mindmap_theme, 'light', '失败后的写入队列仍应继续工作');
unreadableKeys.add(mapKey);
const isolatedRuntime = startRuntime({ tauri: tauriInvoke });
assert.equal((await isolatedRuntime.window.chrome.storage.local.get('mindmap_theme')).mindmap_theme, 'light');
await assert.rejects(isolatedRuntime.window.chrome.runtime.sendMessage({ action: 'IDB_GET', keys: mapKey }), /文件损坏/);
assert.equal((await isolatedRuntime.window.chrome.runtime.sendMessage({
    action: 'IDB_GET', keys: otherMapKey,
})).data[otherMapKey].data.topic, '另一张导图');
unreadableKeys.clear();

await tauriReloaded.window.chrome.storage.local.set({
    currentFileID: 'other_file', MindMapData: tauriValues.idb[otherMapKey], MindMapAction: 'open',
});
assert.equal((await tauriReloaded.window.chrome.storage.local.get('MindMapData')).MindMapData.data.topic, '另一张导图');
await tauriReloaded.window.chrome.runtime.sendMessage({ action: 'IDB_REMOVE', keys: otherMapKey });
assert.equal(Object.hasOwn(tauriValues.idb, otherMapKey), false);
assert.equal(tauriValues.chrome.currentFileID, null, '删除当前导图后清除启动引用');
const afterDelete = startRuntime({ tauri: tauriInvoke });
assert.equal((await afterDelete.window.chrome.storage.local.get('MindMapData')).MindMapData, undefined);
assert.deepEqual(tauriValues.idb[mapKey], tauriEditedSnapshot, '删除其他文件不能影响已保存导图');
// !SECTION Tauri 分文件存储

// SECTION 收藏夹与文件一致性
const bookmarksSource = await readFile('app/JS/BookMarks.js', 'utf8');
const testSession = new Map();
const bookmarkContext = vm.createContext({
    window: tauriReloaded.window,
    chrome: tauriReloaded.window.chrome,
    console: { log() {} },
    document: { title: '', getElementById() { return {}; } },
    sessionStorage: { setItem(key, value) { testSession.set(key, value); } },
    async idbGet(keys) {
        const response = await tauriReloaded.window.chrome.runtime.sendMessage({ action: 'IDB_GET', keys });
        return response.data[Array.isArray(keys) ? keys[0] : keys];
    },
    async idbSet(data) {
        await tauriReloaded.window.chrome.runtime.sendMessage({ action: 'IDB_SET', data });
    },
    async idbRemove(keys) {
        await tauriReloaded.window.chrome.runtime.sendMessage({ action: 'IDB_REMOVE', keys });
    },
    showTopToast() {},
});
vm.runInContext(bookmarksSource.slice(bookmarksSource.indexOf('class myBookmarkManager'),
    bookmarksSource.indexOf('// SECTION 书签管理器初始化')), bookmarkContext);
const manager = Object.create(vm.runInContext('myBookmarkManager.prototype', bookmarkContext));
manager.loadFromStorage = async () => { manager.data = structuredClone(tauriValues.idb.bookmarkData); };
manager.indexData = { id: 'created_file', data: 'MindMapData.__REF__created_file-extra' };
manager.replyData = tauriSnapshot;
manager.action = 'save_mindmap';
manager.expandedFolders = new Set();
manager.currentFolderId = 'root';
manager.visibleIds = new Set();
manager.hideModal = manager.renderInsertNode = manager.renderDeleteNode = () => {};
const createStart = tauriCommands.length;
assert.equal(await manager.confirmNewItem(true, '新导图', 'unused', 'root'), 'created_file');
const creationWrites = tauriCommands.slice(createStart).filter(call => call.command === 'write_storage_values');
assert.ok(Object.hasOwn(creationWrites[0].args.values, 'MindMapData.__REF__created_file-extra'),
    '创建收藏项之前必须先落盘导图');
assert.ok(creationWrites.some(call => Object.hasOwn(call.args.values, 'bookmarkData')));
assert.equal(tauriValues.idb.bookmarkData.items.created_file.name, '新导图');
assert.equal(tauriValues.chrome.currentFileID, 'created_file');

failWriteKey = 'bookmarkData';
assert.equal(await manager.deleteItem('created_file'), false, '索引保存失败应停止删除');
assert.ok(tauriValues.idb['MindMapData.__REF__created_file-extra'], '索引失败不能先删导图文件');
assert.ok(tauriValues.idb.bookmarkData.items.created_file);
manager.data.items.created_file.parentId = 'folder';
manager.data.folders.folder = { id: 'folder', parentId: 'root', children: ['created_file'] };
manager.data.rootOrder = ['folder'];
await manager.saveToStorage();
const deleteStart = tauriCommands.length;
await manager.deleteItem('folder');
assert.equal(Object.hasOwn(tauriValues.idb, 'MindMapData.__REF__created_file-extra'), false,
    '删除文件夹应清理其中导图的文件');
assert.equal(Object.hasOwn(tauriValues.idb.bookmarkData.folders, 'folder'), false);
const deletionWrites = tauriCommands.slice(deleteStart).filter(call => call.command === 'write_storage_values');
assert.ok(Object.hasOwn(deletionWrites[0].args.values, 'bookmarkData'), '删除应先提交移除引用后的索引');
assert.equal(await manager.openMindMap('missing_file', '缺失导图'), false);
assert.equal(tauriValues.chrome.currentFileID, null, '缺失文件不能成为当前导图并覆盖原内容');
unreadableKeys.add(mapKey);
assert.equal(await manager.openMindMap('tauri_file', '损坏导图'), false);
assert.equal(tauriValues.chrome.currentFileID, null);
unreadableKeys.clear();
// !SECTION 收藏夹与文件一致性

// SECTION 浏览器 IndexedDB 回归
const indexedBrowser = startRuntime({ indexedDB: createIndexedDb({ bookmarkData }) });
await indexedBrowser.window.chrome.runtime.sendMessage({ action: 'IDB_SET', data: { [mapKey]: tauriSnapshot } });
const indexedResult = await indexedBrowser.window.chrome.runtime.sendMessage({ action: 'IDB_GET', keys: mapKey });
assert.deepEqual(indexedResult.data[mapKey], tauriSnapshot);
await indexedBrowser.window.chrome.runtime.sendMessage({ action: 'IDB_REMOVE', keys: mapKey });
assert.equal((await indexedBrowser.window.chrome.runtime.sendMessage({ action: 'IDB_GET', keys: mapKey })).data[mapKey], undefined);
// !SECTION 浏览器 IndexedDB 回归

console.log('存储同步校验通过：Tauri 分文件按需读写、故障隔离及浏览器/Quicker 数据恢复。');
