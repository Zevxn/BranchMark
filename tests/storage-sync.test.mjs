import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const shim = await readFile('app/JS/standalone-shim.js', 'utf8');
const postedMessages = [];
const startupSavedSnapshot = {
    data: { id: 'root', topic: 'saved before upgrade' },
    view: { tx: 50, ty: 80, scale: 1 },
    scrollMap: {},
};
const initialState = {
    version: 1,
    chrome: {
        app_lang: 'zh-CN',
        currentFileID: 'id_saved',
        MindMapAction: 'open',
        MindMapData: { data: { id: 'root', topic: 'old' } },
    },
    idb: {
        'MindMapData.__REF__id_saved-extra': startupSavedSnapshot,
    },
};
const location = { href: 'https://deepconvo-mindmap.local/HTML/MindMap.html' };
const document = {
    currentScript: { src: 'https://deepconvo-mindmap.local/JS/standalone-shim.js' },
    createElement() {
        return { click() {} };
    },
};
const webview = {
    postMessage(message) {
        postedMessages.push(message);
    },
};
const window = {
    __DEEPCONVO_QUICKER_STATE__: initialState,
    chrome: { webview },
    fetch: async () => { throw new Error('not used'); },
    open() {},
    location,
    document,
};
const context = vm.createContext({
    URL,
    Response,
    clearTimeout,
    console,
    document,
    localStorage: {
        getItem() { return null; },
        setItem() {},
        removeItem() {},
        key() { return null; },
        length: 0,
    },
    location,
    queueMicrotask,
    setTimeout,
    structuredClone,
    window,
});

vm.runInContext(shim, context, { filename: 'standalone-shim.js' });

const repairedStartupState = JSON.parse(
    postedMessages.findLast(message => message.startsWith('DEEPCONVO_PERSIST:'))
        .slice('DEEPCONVO_PERSIST:'.length),
);
assert.deepEqual(
    repairedStartupState.chrome.MindMapData,
    startupSavedSnapshot,
    '启动时应自动用当前收藏项修复升级前的旧快照',
);
postedMessages.length = 0;

const savedSnapshot = {
    data: { id: 'root', topic: 'new', children: [{ id: 'child', topic: 'saved node' }] },
    view: { tx: 100, ty: 200, scale: 1.25 },
    scrollMap: {},
};
await window.chrome.runtime.sendMessage({
    action: 'IDB_SET',
    data: { 'MindMapData.__REF__id_saved-extra': savedSnapshot },
});

const persistedStates = postedMessages
    .filter(message => message.startsWith('DEEPCONVO_PERSIST:'))
    .map(message => JSON.parse(message.slice('DEEPCONVO_PERSIST:'.length)));
assert.ok(persistedStates.length > 0, '保存思维导图应向 Quicker 提交状态');
const latestState = persistedStates.at(-1);
assert.deepEqual(latestState.idb['MindMapData.__REF__id_saved-extra'], savedSnapshot);
assert.deepEqual(latestState.chrome.MindMapData, savedSnapshot, '启动快照应与收藏项的已保存数据一致');
assert.equal(latestState.chrome.currentFileID, 'id_saved');
assert.equal(latestState.chrome.MindMapAction, 'open');

const nativeWrites = [];
const nativeInitialState = {
    version: 1,
    chrome: { app_lang: 'zh-CN', currentFileID: 'native_file' },
    idb: {},
};
const nativeLocation = { href: 'https://deepconvo-mindmap-native.local/HTML/MindMap.html' };
const nativeDocument = {
    currentScript: { src: 'https://deepconvo-mindmap-native.local/JS/standalone-shim.js' },
    createElement() {
        return { click() {} };
    },
};
const nativeBridge = {
    getVar(key) {
        assert.equal(key, 'app_data_json');
        return JSON.stringify(nativeInitialState);
    },
    setVar(key, value) {
        nativeWrites.push({ key, value });
    },
};
const nativeWindow = {
    $quickerSync: nativeBridge,
    chrome: { webview: { postMessage() {} } },
    fetch: async () => { throw new Error('not used'); },
    open() {},
    location: nativeLocation,
    document: nativeDocument,
};
const nativeContext = vm.createContext({
    URL,
    Response,
    clearTimeout,
    console,
    document: nativeDocument,
    localStorage: {
        getItem() { return null; },
        setItem() {},
        removeItem() {},
        key() { return null; },
        length: 0,
    },
    location: nativeLocation,
    queueMicrotask,
    setTimeout,
    structuredClone,
    window: nativeWindow,
});

vm.runInContext(shim, nativeContext, { filename: 'standalone-shim-native.js' });
assert.equal(nativeWindow.__DEEPCONVO_NATIVE_QUICKER_HOST__, true);
assert.equal(nativeWindow.__DEEPCONVO_LEGACY_QUICKER_HOST__, false);

await nativeWindow.chrome.storage.local.set({ mindmap_theme: 'dark' });
assert.ok(nativeWrites.length > 0, '原生 WebView2 应通过 $quickerSync 写回动作状态');
assert.equal(nativeWrites.at(-1).key, 'app_data_json');

const nativeBookmarkData = [{ id: 'folder_1', title: '测试文件夹', type: 'folder', children: [] }];
await nativeWindow.chrome.runtime.sendMessage({
    action: 'IDB_SET',
    data: { bookmarkData: nativeBookmarkData },
});
const nativeBookmarkResult = await nativeWindow.chrome.runtime.sendMessage({
    action: 'IDB_GET',
    keys: 'bookmarkData',
});
assert.equal(nativeBookmarkResult.success, true);
assert.deepEqual(nativeBookmarkResult.data.bookmarkData, nativeBookmarkData);

const nativeMapSnapshot = {
    data: { id: 'root', topic: '原生 WebView 收藏脑图' },
    view: { tx: 10, ty: 20, scale: 1 },
    scrollMap: {},
};
await nativeWindow.chrome.runtime.sendMessage({
    action: 'IDB_SET',
    data: { 'MindMapData.__REF__native_file-extra': nativeMapSnapshot },
});

const nativePersisted = JSON.parse(nativeWrites.at(-1).value);
assert.equal(nativePersisted.chrome.mindmap_theme, 'dark');
assert.equal(nativePersisted.chrome.currentFileID, 'native_file');
assert.deepEqual(nativePersisted.chrome.MindMapData, nativeMapSnapshot);
assert.deepEqual(nativePersisted.idb.bookmarkData, nativeBookmarkData);
assert.deepEqual(nativePersisted.idb['MindMapData.__REF__native_file-extra'], nativeMapSnapshot);

console.log('存储同步校验通过：旧宿主和 Quicker 原生 WebView2 均可持久化收藏夹与脑图。');
