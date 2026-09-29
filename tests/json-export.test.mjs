import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [helpers, uiSource] = await Promise.all([
    readFile('app/JS/AI-Contents.js', 'utf8'),
    readFile('app/JS/MindMap-UI.js', 'utf8'),
]);
const workbook = {
    version: 'tabs-v1',
    activeTabId: 'first',
    tabs: [
        { id: 'first', data: { id: 'root-1', topic: '首页', children: [] } },
        { id: 'second', data: { id: 'root-2', topic: '第二页', children: [] } },
    ],
};
const content = JSON.stringify(workbook);
const filename = '示例脑图.json';

function createRuntime(window) {
    const storage = new Map([['obsidian_export_directory', 'D:\\Obsidian']]);
    const downloads = [];
    const toasts = [];
    const context = vm.createContext({
        window,
        chrome: { storage: { local: {
            async get(key) { return { [key]: storage.get(key) }; },
            async set(values) {
                Object.entries(values).forEach(([key, value]) => storage.set(key, value));
            },
        } } },
        document: { addEventListener() {} },
        console: { warn() {} },
        showTopToast: message => toasts.push(message),
        getI18nText: key => key,
    });
    vm.runInContext(helpers, context, { filename: 'AI-Contents.js' });
    context.downloadFile = (...args) => downloads.push(args);
    return { context, storage, downloads, toasts };
}

// SECTION Quicker 导出与取消
const quickerCalls = [];
let selectedDirectory = 'D:\\JSON';
let saveResult = { success: true, cancelled: false };
const quicker = createRuntime({
    __DEEPCONVO_NATIVE_QUICKER_HOST__: true,
    async $quickerSp(name, args) {
        quickerCalls.push({ name, args });
        if (name === 'DeepConvoSelectExportFolder') {
            return { directoryPath: selectedDirectory, cancelled: !selectedDirectory };
        }
        if (name === 'DeepConvoSaveExportFile') return saveResult;
        throw new Error(`未知子程序：${name}`);
    },
});
for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.equal(await quicker.context.saveMindMapJsonFile(filename, content), true);
}
assert.deepEqual(quickerCalls.map(call => call.name), [
    'DeepConvoSelectExportFolder', 'DeepConvoSaveExportFile',
    'DeepConvoSelectExportFolder', 'DeepConvoSaveExportFile',
], '每次 JSON 导出都必须重新调用现有目录选择动作');
assert.deepEqual({ ...quickerCalls[1].args }, {
    directoryPath: selectedDirectory, filename, content, confirmOverwrite: true,
}, '保存动作必须收到同名覆盖确认要求和完整工作簿');
assert.deepEqual([...quicker.storage], [['obsidian_export_directory', 'D:\\Obsidian']],
    'JSON 目录选择不能改动 Obsidian 默认目录');
selectedDirectory = '';
assert.equal(await quicker.context.saveMindMapJsonFile(filename, content), false);
assert.equal(quickerCalls.at(-1).name, 'DeepConvoSelectExportFolder');
selectedDirectory = 'E:\\JSON';
saveResult = { success: false, cancelled: true };
assert.equal(await quicker.context.saveMindMapJsonFile(filename, content), false);
assert.deepEqual(quicker.downloads, [], '取消导出不能触发下载兜底');
saveResult = { success: false, error: '目录不可写' };
await assert.rejects(quicker.context.saveMindMapJsonFile(filename, content), /目录不可写/);
assert.deepEqual(quicker.downloads, []);
// !SECTION Quicker 导出与取消

// SECTION Tauri 同名确认
const tauriCalls = [];
let tauriDirectory = 'D:\\JSON';
let exists = false;
let overwriteAccepted = false;
let confirmations = 0;
const tauri = createRuntime({
    __TAURI__: { core: { async invoke(command, args) {
        tauriCalls.push({ command, args });
        if (command === 'choose_json_export_directory') return tauriDirectory;
        if (command === 'write_mindmap_json') return !exists || args.overwrite;
        throw new Error(`未知命令：${command}`);
    } } },
    confirm() { confirmations += 1; return overwriteAccepted; },
});
assert.equal(await tauri.context.saveMindMapJsonFile(filename, content), true);
assert.equal(confirmations, 0, '新文件不需要询问覆盖');
assert.deepEqual({ ...tauriCalls[1].args }, {
    directoryPath: tauriDirectory, filename, content, overwrite: false,
});
exists = true;
assert.equal(await tauri.context.saveMindMapJsonFile(filename, content), false);
assert.equal(confirmations, 1);
assert.equal(tauriCalls.at(-1).args.overwrite, false, '拒绝覆盖不能再请求写入');
overwriteAccepted = true;
assert.equal(await tauri.context.saveMindMapJsonFile(filename, content), true);
assert.equal(confirmations, 2);
assert.equal(tauriCalls.at(-1).args.overwrite, true);
assert.equal(tauriCalls.filter(call => call.command === 'choose_json_export_directory').length, 3);
tauriDirectory = null;
const callsBeforeCancel = tauriCalls.length;
assert.equal(await tauri.context.saveMindMapJsonFile(filename, content), false);
assert.equal(tauriCalls.length, callsBeforeCancel + 1, '取消目录选择不能调用写入命令');
assert.deepEqual(tauri.downloads, []);
// !SECTION Tauri 同名确认

// SECTION 浏览器目录选择与写入
const files = new Map();
let pickerCalls = 0;
let writableCalls = 0;
let browserConfirmation = false;
let pickerCancelled = false;
let failWrite = false;
let abortedWrites = 0;
const browser = createRuntime({
    async showDirectoryPicker(options) {
        pickerCalls += 1;
        assert.equal(options.id, 'mindmap-json-export');
        if (pickerCancelled) throw { name: 'AbortError' };
        return {
            async getFileHandle(name, options = {}) {
                if (!files.has(name) && !options.create) throw { name: 'NotFoundError' };
                return { async createWritable() {
                    writableCalls += 1;
                    let pendingContent;
                    return {
                        async write(value) {
                            if (failWrite) throw new Error('磁盘已满');
                            pendingContent = value;
                        },
                        async close() { files.set(name, pendingContent); },
                        async abort() { abortedWrites += 1; },
                    };
                } };
            },
        };
    },
    confirm() { return browserConfirmation; },
});
assert.equal(await browser.context.saveMindMapJsonFile(filename, content), true);
assert.deepEqual(JSON.parse(files.get(filename)), workbook);
assert.equal(await browser.context.saveMindMapJsonFile(filename, 'changed'), false);
assert.equal(files.get(filename), content);
assert.equal(writableCalls, 1, '拒绝覆盖时不得打开写入流');
browserConfirmation = true;
assert.equal(await browser.context.saveMindMapJsonFile(filename, 'changed'), true);
assert.equal(files.get(filename), 'changed');
assert.equal(pickerCalls, 3, '浏览器每次导出也要重新选择目录');
pickerCancelled = true;
assert.equal(await browser.context.saveMindMapJsonFile(filename, content), false);
assert.equal(writableCalls, 2);
pickerCancelled = false;
failWrite = true;
await assert.rejects(browser.context.saveMindMapJsonFile(filename, content), /磁盘已满/);
assert.equal(abortedWrites, 1);
assert.equal(files.get(filename), 'changed', '写入失败应保留原文件');
assert.deepEqual(browser.downloads, []);
const legacyBrowser = createRuntime({});
assert.equal(await legacyBrowser.context.saveMindMapJsonFile(filename, content), true);
assert.deepEqual(legacyBrowser.downloads, [[content, filename, 'application/json']],
    '不支持目录 API 的普通浏览器保留下载路径');
// !SECTION 浏览器目录选择与写入

// SECTION 工具栏导出状态
const exportButton = { disabled: false };
const uiToasts = [];
let uiSaveResult = true;
let uiError = null;
let uiQuickerHost = false;
let pendingSave = null;
const uiContext = vm.createContext({
    $: () => exportButton,
    getMindMapExportBaseName: () => '示例脑图',
    getMindMapWorkbookSnapshot: () => workbook,
    isNativeQuickerExport: () => uiQuickerHost,
    async saveMindMapJsonFile(name, value) {
        assert.equal(exportButton.disabled, !uiQuickerHost);
        assert.equal(name, filename);
        assert.deepEqual(JSON.parse(value), workbook);
        if (uiError) throw uiError;
        if (pendingSave) return pendingSave;
        return uiSaveResult;
    },
    showTopToast: message => uiToasts.push(message),
    console: { warn() {} },
});
vm.runInContext(uiSource.slice(
    uiSource.indexOf('    const exportButton ='),
    uiSource.indexOf("    $('#fileInput').onchange="),
), uiContext);
await exportButton.onclick();
assert.equal(exportButton.disabled, false);
assert.equal(uiToasts.length, 1);
uiSaveResult = false;
await exportButton.onclick();
assert.equal(exportButton.disabled, false);
assert.equal(uiToasts.length, 1, '取消导出不能提示成功');
uiError = new Error('写入失败');
await exportButton.onclick();
assert.equal(exportButton.disabled, false, '失败后必须允许再次导出');
assert.match(uiToasts.at(-1), /写入失败/);
uiQuickerHost = true;
uiError = null;
let finishPendingSave;
pendingSave = new Promise(resolve => { finishPendingSave = resolve; });
const pendingExport = exportButton.onclick();
assert.equal(exportButton.disabled, false,
    'Quicker 取消目录动作但未结束 Promise 时，导出按钮仍需允许再次点击');
pendingSave = null;
await exportButton.onclick();
finishPendingSave(false);
await pendingExport;
// !SECTION 工具栏导出状态

console.log('JSON 导出校验通过：每次选目录、同名确认、取消保留文件、工作簿格式与宿主回退均正常。');
