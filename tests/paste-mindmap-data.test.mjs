import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const mindMap = await readFile('app/JS/MindMap.js', 'utf8');
const normalizerStart = mindMap.indexOf('function isMindMapNodeData(');
const normalizerEnd = mindMap.indexOf('function applyImportedMindMap(', normalizerStart);
const clipboardStart = mindMap.indexOf("const CUSTOM_MIME_TYPE = 'web text/x-mindmap-data';");
const clipboardEnd = mindMap.indexOf('// ==========================================\n// #region 图片上传功能', clipboardStart);

const normalizerSource = mindMap.slice(normalizerStart, normalizerEnd).trim();
const clipboardSource = mindMap.slice(clipboardStart, clipboardEnd).trim();
assert.ok(normalizerSource && clipboardSource, '应能定位导入和粘贴逻辑');

const pureData = {
    id: 'source-root',
    topic: '陈映荣',
    content: '李氏-子二',
    children: [{ id: 'source-child', topic: '陈志训', content: '次子-无传', children: [] }]
};
const fullSnapshot = {
    data: {
        ...pureData,
        relations: [{ id: 'relation-source', sourceId: 'source-root', targetId: 'source-child' }],
        summaries: [{ id: 'summary-source', nodeIds: ['source-child'] }],
        foldedLeft: true,
        foldedRight: false
    },
    view: { tx: 100, ty: 100, scale: 1 }
};

const root = {
    id: 'current-root',
    topic: '当前导图',
    children: [{ id: 'target', topic: '粘贴目标', children: [] }]
};
let nextId = 0;
let historyCount = 0;
let updatedParentId = null;
let toast = '';
function findNode(node, id) {
    if (node.id === id) return node;
    return (node.children || []).map(child => findNode(child, id)).find(Boolean);
}
const context = vm.createContext({
    JSON,
    Set,
    console,
    state: { data: root, selectedIds: new Set(['target']) },
    generateNodeId: () => `generated-${++nextId}`,
    findNode,
    recordHistory: () => { historyCount += 1; },
    updateChildrenDOM: id => { updatedParentId = id; },
    updateSelection: () => {},
    showTopToast: message => { toast = message; },
    navigator: {
        clipboard: {
            async read() { throw new Error('不支持自定义 MIME'); },
            async readText() { return JSON.stringify(fullSnapshot); }
        }
    }
});

vm.runInContext(`
    ${normalizerSource}
    ${clipboardSource}
    globalThis.getMindMapClipboardNodes = getMindMapClipboardNodes;
    globalThis.pasteMindMapNodesToSelection = pasteMindMapNodesToSelection;
    globalThis.pasteNodesToSelection = pasteNodesToSelection;
`, context);

const pureNodes = context.getMindMapClipboardNodes(pureData);
assert.equal(pureNodes.length, 1, '纯 data 根节点应转换为一棵待粘贴子树');
assert.equal(pureNodes[0].topic, '陈映荣');

assert.equal(context.pasteMindMapNodesToSelection(context.getMindMapClipboardNodes(pureData)), true,
    '搜索框粘贴已解析 JSON 时应可直接复用子树插入逻辑');
assert.equal(root.children[0].children[0].topic, '陈映荣');
root.children[0].children = [];
context.state.selectedIds = new Set(['target']);
nextId = 0;
historyCount = 0;
updatedParentId = null;
toast = '';

await context.pasteNodesToSelection();

const pastedRoot = root.children[0].children[0];
assert.ok(pastedRoot, '完整存档 data 应作为目标节点的新子节点插入');
assert.equal(pastedRoot.topic, '陈映荣');
assert.equal(pastedRoot.children[0].topic, '陈志训', '后代节点应递归保留');
assert.equal(pastedRoot.id, 'generated-1', '粘贴根节点必须生成新 ID');
assert.equal(pastedRoot.children[0].id, 'generated-2', '粘贴后代也必须生成新 ID');
assert.equal('relations' in pastedRoot, false, '整图关联线不应成为子节点数据');
assert.equal('summaries' in pastedRoot, false, '整图总结不应成为子节点数据');
assert.equal('foldedLeft' in pastedRoot, false, '整图折叠状态不应成为子节点数据');
assert.equal(historyCount, 1, '粘贴子树应记录历史');
assert.equal(updatedParentId, 'target', '应只刷新粘贴目标的子树');
assert.match(toast, /已粘贴 2 个节点/, '提示应包含递归节点数量');

console.log('mind map JSON paste tests passed');
