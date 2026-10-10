import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile('app/JS/MindMap.js', 'utf8');
const normalizers = source.slice(source.indexOf('function isMindMapNodeData'), source.indexOf('function applyImportedMindMap'));
const model = source.slice(source.indexOf('const defaultTreeData'), source.indexOf('let dockData'));
const persistence = source.slice(source.indexOf('function getActiveMindMapTab'), source.indexOf('async function updateState'));
const openFile = source.slice(source.indexOf('async function updateState'), source.indexOf('function updateDockData'));
const fileActions = source.slice(source.indexOf('// SECTION 当前导图文件操作'), source.indexOf('// !SECTION 当前导图文件操作'));

const saved = {
    version: 'tabs-v1', documentId: 'map', activeTabId: 'b',
    tabs: ['a', 'b'].map(id => ({
        id, name: id, data: { id: `root-${id}`, topic: id, children: [], relations: [], summaries: [] },
        view: { tx: 120, ty: 80, scale: 1.5 }, scrollMap: { [`root-${id}`]: 12 },
    })),
};

function setup({ native = true, initial = saved, disk = saved, confirmation = true } = {}) {
    const session = new Map([['currentFileID', 'map']]);
    const calls = { messages: [], confirmations: [], toasts: [], paths: [], cancelledTimers: [], reads: 0, renders: 0, saves: 0 };
    const elements = new Map();
    const element = key => {
        if (!elements.has(key)) elements.set(key, { disabled: false, hidden: false, classList: { remove() {} }, addEventListener() {} });
        return elements.get(key);
    };
    let file = structuredClone(disk);
    let baseline = structuredClone(initial);
    let readHook = null;
    const context = vm.createContext({
        window: {
            innerWidth: 1200, innerHeight: 800, __DEEPCONVO_NATIVE_TAURI_HOST__: native,
            __TAURI__: { core: { async invoke(command, args) {
                assert.equal(command, 'get_mindmap_file_path');
                assert.equal(args.id, 'map');
                return 'D:\\资料\\maps\\map.json';
            } } },
        },
        document: { title: '当前导图', querySelector() { return null; } },
        navigator: { clipboard: { async writeText(path) { calls.paths.push(path); } } },
        sessionStorage: {
            getItem: key => session.get(key) ?? null,
            setItem: (key, value) => session.set(key, String(value)),
        },
        $: element, structuredClone, initial: structuredClone(initial),
        generateNodeId: (() => { let id = 0; return () => `generated-${++id}`; })(),
        saveGlobalScrolls() {}, closeMindMapRelationEditor() {}, closeMindMapRelationNavigationMenu() {}, resetMapSearch() {},
        renderTree() { calls.renders++; }, renderMindMapTabs() {},
        clearTimeout: timer => calls.cancelledTimers.push(timer),
        showTopToast: message => calls.toasts.push(message),
        async saveMindMapData() { calls.saves++; return true; },
        async confirmMindMapFileAction(...args) { calls.confirmations.push(args); return confirmation; },
        async idbGet(key) {
            assert.equal(key, 'MindMapData.__REF__map-extra');
            calls.reads++;
            await readHook?.();
            return structuredClone(file);
        },
        async sendRuntimeMessage(message) {
            calls.messages.push(structuredClone(message));
            if (message.action === 'TAURI_ACCEPT_MINDMAP_FILE') baseline = structuredClone(message.snapshot);
            return { success: true, snapshot: structuredClone(baseline) };
        },
    });
    vm.runInContext(`${normalizers}\n${model}\n
        let mindMapWorkbook = normalizeMindMapWorkbookSnapshot(initial, document.title);
        const mindMapTabRuntime = new Map();
        let state = { selectedIds: new Set(), mode: 'IDLE', history: ['old', 'older'], historyIndex: 1 };
        let skipNextGlobalScrollCapture = false;
        let saveTimer = 'session-save', saveToCloudTimer = 'disk-save';
        ${persistence}\n${fileActions}\n${openFile}\n
        loadActiveMindMapTab();
        globalThis.api = {
            reload: reloadCurrentMindMapFile, copy: copyCurrentMindMapFilePath, update: updateMindMapFileActions,
            signature: getMindMapFileContentSignature,
            open: updateState,
            get workbook() { return mindMapWorkbook; }, get state() { return state; },
        };
    `, context);
    calls.renders = 0;
    return { api: context.api, calls, session, element, setReadHook: hook => { readHook = hook; }, setDisk: value => { file = value; } };
}

// SECTION 路径复制与宿主入口
const copy = setup();
copy.api.update();
assert.equal(copy.element('#btn-copy-map-path').disabled, false);
await copy.api.copy();
assert.deepEqual(copy.calls.paths, ['D:\\资料\\maps\\map.json']);
assert.equal(copy.calls.reads, 0, '复制路径不得重新加载或保存导图');
assert.equal(copy.calls.messages.length, 0);
copy.session.delete('currentFileID');
copy.api.update();
assert.equal(copy.element('#btn-copy-map-path').disabled, true);
assert.equal(copy.element('#btn-reload-map').disabled, true);
const browser = setup({ native: false });
browser.api.update();
assert.equal(browser.element('#btn-copy-map-path').hidden, true);
assert.equal(browser.element('#btn-reload-map').hidden, true);
// !SECTION 路径复制与宿主入口

// SECTION 重新加载与状态恢复
const agent = structuredClone(saved);
agent.activeTabId = 'a';
agent.tabs[1].data.topic = 'Agent 修改';
agent.tabs[1].data.foldedLeft = true;
agent.tabs[1].data.relations = [{ id: 'relation', sourceId: 'root-b', targetId: 'child' }];
agent.tabs[1].data.children = [{ id: 'child', topic: '子节点' }];
agent.tabs[1].data.summaries = [{ id: 'summary', nodeIds: ['child'] }];
agent.tabs[1].view = { tx: 0, ty: 0, scale: 1 };
const reload = setup({ disk: agent });
await reload.api.reload();
assert.equal(reload.api.workbook.activeTabId, 'b');
assert.equal(reload.api.state.data.topic, 'Agent 修改');
assert.equal(reload.api.state.data.foldedLeft, true);
assert.equal(reload.api.state.data.relations[0].id, 'relation');
assert.equal(reload.api.state.data.summaries[0].id, 'summary');
assert.deepEqual({ ...reload.api.state.view }, saved.tabs[1].view);
assert.equal(reload.api.state.scrollMap.get('root-b'), 12);
assert.equal(reload.api.state.history.length, 1);
assert.equal(reload.api.state.historyIndex, 0);
assert.equal(reload.calls.confirmations.length, 0, '没有内容编辑时直接重新加载');
assert.deepEqual(reload.calls.cancelledTimers, ['session-save', 'disk-save']);
assert.equal(reload.calls.messages.at(-1).snapshot.tabs[1].view.scale, 1, '文件基线必须使用原始文件，不能混入保留的页面视图');
assert.equal(JSON.parse(reload.session.get('MindMapData')).tabs[1].data.topic, 'Agent 修改');

const cancel = setup({ disk: agent, confirmation: false });
cancel.api.state.data.topic = '尚未保存';
await cancel.api.reload();
assert.equal(cancel.calls.confirmations.length, 1);
assert.equal(cancel.calls.reads, 0);
assert.equal(cancel.api.state.data.topic, '尚未保存');
const discard = setup({ disk: agent });
discard.api.state.data.topic = '尚未保存';
await discard.api.reload();
assert.equal(discard.calls.confirmations.length, 1);
assert.equal(discard.api.state.data.topic, 'Agent 修改');

for (const invalid of [null, {}, { version: 'tabs-v1', tabs: [] }, { tabs: [{ data: { children: [null] } }] }]) {
    const failed = setup({ disk: invalid });
    const original = failed.api.workbook;
    await failed.api.reload();
    assert.equal(failed.api.workbook, original, '读取失败必须保留当前工作簿');
    assert.equal(failed.calls.renders, 0);
    assert.equal(failed.calls.messages.some(message => message.action === 'TAURI_ACCEPT_MINDMAP_FILE'), false);
    assert.match(failed.calls.toasts.at(-1), /重新加载失败/);
}

const switched = setup({ disk: agent });
switched.setReadHook(() => switched.session.set('currentFileID', 'other'));
await switched.api.reload();
assert.equal(switched.calls.renders, 0, '读取期间切换文件后，不能应用过期结果');
const editing = setup({ disk: agent });
editing.setReadHook(() => { editing.api.state.data.topic = '读取期间的新编辑'; });
await editing.api.reload();
assert.equal(editing.api.state.data.topic, '读取期间的新编辑');
assert.equal(editing.calls.renders, 0);
assert.match(editing.calls.toasts.at(-1), /正在编辑/);

const legacy = { data: { id: 'legacy', topic: '旧版导图' }, view: { tx: 10, ty: 20, scale: 1 } };
const reopen = setup();
await reopen.api.open(structuredClone(legacy), 'map', '旧版导图');
assert.equal(reopen.calls.saves, 0, '重新打开同一文件不得把旧画布保存回去');
assert.deepEqual(reopen.calls.messages.at(-1).snapshot, legacy,
    '节点规范化补齐默认值时，不得修改用于文件冲突检查的原始基线');
assert.equal(reopen.api.signature(legacy, 'map'), reopen.api.signature(reopen.api.workbook, 'map'),
    '旧格式迁移生成的标签页 ID 不应被误判为未保存编辑');
const legacyReload = setup({ initial: legacy, disk: legacy });
legacyReload.api.state.view.scale = 2;
await legacyReload.api.reload();
assert.equal(legacyReload.calls.confirmations.length, 0);
assert.equal(legacyReload.api.state.view.scale, 2, '旧格式单页导图重新加载也应保留当前视图');
// !SECTION 重新加载与状态恢复

console.log('导图文件操作校验通过：路径复制、未保存确认、完整工作簿恢复、失败保留及异步切换保护。');
