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

console.log('存储同步校验通过：保存收藏思维导图时同步更新下次启动快照。');
