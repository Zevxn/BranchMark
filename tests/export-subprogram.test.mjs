import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const helpers = await readFile('app/JS/AI-Contents.js', 'utf8');
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
    document: { body: { appendChild() {} }, createElement() { return {}; }, title: '' },
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

console.log('导出子程序校验通过：Quicker 可选择、记忆并使用保存目录，取消选择时保留原目录。');
