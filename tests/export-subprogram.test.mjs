import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [helpers, mindMap] = await Promise.all([
    readFile('app/JS/AI-Contents.js', 'utf8'),
    readMindMapSource(),
]);
const storage = new Map();
const calls = [];
let selectResult = {
    directoryPath: 'D:\\Notes\\Obsidian',
    cancelled: false,
};

const quickerSubprogram = async (name, args) => {
    calls.push({ name, args });
    if (name === 'DeepConvoSelectExportFolder') return selectResult;
    if (name === 'DeepConvoSaveExportFile') return { success: true, cancelled: false };
    throw new Error(`未知子程序：${name}`);
};

const window = {
    __DEEPCONVO_NATIVE_QUICKER_HOST__: true,
    $quickerSp: quickerSubprogram,
};
const chrome = {
    storage: {
        local: {
            async get(key) { return { [key]: storage.get(key) }; },
            async set(values) {
                Object.entries(values).forEach(([key, value]) => storage.set(key, value));
            },
            async remove(key) { storage.delete(key); },
        },
    },
};
const toasts = [];
const context = vm.createContext({
    Blob,
    URL,
    chrome,
    console,
    document: {
        body: { appendChild() {} },
        createElement() { return {}; },
        addEventListener() {},
        title: '',
    },
    getI18nText: key => key,
    idbGet: async () => null,
    setTimeout,
    showTopToast: message => toasts.push(message),
    window,
});
vm.runInContext(helpers, context, { filename: 'AI-Contents.js' });

const selectedDirectory = await vm.runInContext('changeObsidianPath()', context);
assert.equal(selectedDirectory, 'D:\\Notes\\Obsidian');
assert.equal(storage.get('obsidian_export_directory'), selectedDirectory);
assert.equal(calls.at(-1).name, 'DeepConvoSelectExportFolder');

const saved = await vm.runInContext(
    `saveFileDirectly('示例.canvas', '{"nodes":[]}', 'application/json')`,
    context,
);
assert.equal(saved, true);
assert.equal(calls.at(-1).name, 'DeepConvoSaveExportFile');
assert.equal(calls.at(-1).args.directoryPath, selectedDirectory);
assert.equal(calls.at(-1).args.filename, '示例.canvas');
assert.equal(calls.at(-1).args.content, '{"nodes":[]}');

selectResult = { directoryPath: '', cancelled: true };
const cancelledSelection = await vm.runInContext('changeObsidianPath()', context);
assert.equal(cancelledSelection, null);
assert.equal(storage.get('obsidian_export_directory'), selectedDirectory,
    '取消切换目录时必须保留原保存目录');
assert.deepEqual(toasts, []);

const browserHelperStart = helpers.indexOf('async function selectAndPersistObsidianHandle');
const browserHelperEnd = helpers.indexOf('async function saveFileDirectly', browserHelperStart);
assert.ok(browserHelperStart >= 0 && browserHelperEnd > browserHelperStart,
    '浏览器目录选择与持久化逻辑应集中在同一辅助函数中');

const selectedHandle = { name: 'Obsidian Vault' };
let pickerCalls = 0;
const persistedHandles = [];
const browserToasts = [];
const browserContext = vm.createContext({
    window: {
        async showDirectoryPicker(options) {
            pickerCalls += 1;
            assert.deepEqual({ ...options }, {
                id: 'obsidian-vault',
                mode: 'readwrite',
                startIn: 'documents',
            });
            return selectedHandle;
        },
    },
    console,
    OBSIDIAN_HANDLE_KEY: 'obsidian_vault_handle',
    readFileHandle: async () => null,
    writeFileHandle: async (key, handle) => { persistedHandles.push({ key, handle }); },
    verifyPermission: async () => true,
    isNativeQuickerExport: () => false,
    getI18nText: key => key,
    showTopToast: message => browserToasts.push(message),
});
vm.runInContext(`${helpers.slice(browserHelperStart, browserHelperEnd)}
    globalThis.getObsidianHandle = getObsidianHandle;
    globalThis.changeObsidianPath = changeObsidianPath;
`, browserContext);

assert.equal(await browserContext.getObsidianHandle(), selectedHandle,
    '首次浏览器导出应选择并保存目录句柄');
assert.equal(pickerCalls, 1);
assert.deepEqual(persistedHandles, [{ key: 'obsidian_vault_handle', handle: selectedHandle }]);
assert.equal(await browserContext.changeObsidianPath(), selectedHandle,
    '手动更换目录仍应强制打开目录选择器');
assert.equal(pickerCalls, 2);
assert.deepEqual(browserToasts, []);

const cachedHandle = { name: '已授权目录' };
let permissionChecks = 0;
browserContext.readFileHandle = async () => cachedHandle;
browserContext.verifyPermission = async () => {
    permissionChecks += 1;
    return true;
};
assert.equal(await browserContext.getObsidianHandle(), cachedHandle,
    '后续浏览器导出应继续复用已授权目录，而不重复打开选择器');
assert.equal(permissionChecks, 1);
assert.equal(pickerCalls, 2);

const canvasWriterStart = mindMap.indexOf('async function writeMindMapCanvasExport');
const canvasWriterEnd = mindMap.indexOf('async function exportToCanvas', canvasWriterStart);
assert.ok(canvasWriterStart >= 0 && canvasWriterEnd > canvasWriterStart,
    '两种 Canvas 导出应复用统一写入收尾逻辑');
const canvasToasts = [];
const downloads = [];
let shouldSaveCanvas = true;
const canvasContext = vm.createContext({
    JSON,
    saveFileDirectly: async (filename, content) => {
        assert.equal(filename, '测试.canvas');
        assert.deepEqual(JSON.parse(content), { nodes: [], edges: [] });
        return shouldSaveCanvas;
    },
    showTopToast: message => canvasToasts.push(message),
    downloadFile: (...args) => downloads.push(args),
});
vm.runInContext(`${mindMap.slice(canvasWriterStart, canvasWriterEnd)}
    globalThis.writeCanvas = writeMindMapCanvasExport;
`, canvasContext);

assert.equal(await canvasContext.writeCanvas({ nodes: [], edges: [] }, '测试.canvas'), true);
assert.deepEqual(canvasToasts, ['✅ 导图已保存到 Obsidian: 测试.canvas']);
assert.deepEqual(downloads, []);

shouldSaveCanvas = false;
assert.equal(await canvasContext.writeCanvas({ nodes: [], edges: [] }, '测试.canvas'), false);
assert.deepEqual(downloads, [[
    '{\n  "nodes": [],\n  "edges": []\n}',
    '测试.canvas',
    'application/json',
]], '保存失败时应保持原有浏览器下载兜底');
assert.match(mindMap, /async function exportToCanvas\([\s\S]*?await writeMindMapCanvasExport\(canvasData, fileName\)/,
    '横向 Canvas 导出应复用统一写入函数');
assert.match(mindMap, /async function exportToVerticalCanvas\([\s\S]*?await writeMindMapCanvasExport\(canvasData, fileName\)/,
    '竖向 Canvas 导出应复用统一写入函数');

console.log('导出子程序校验通过：Quicker 可选择、记忆并使用保存目录，取消选择时保留原目录。');
