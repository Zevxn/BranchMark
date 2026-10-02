import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// SECTION 查询与交互测试环境
const [render, ui, io, relations] = await Promise.all([
    readFile('app/JS/MindMap-Render.js', 'utf8'),
    readFile('app/JS/MindMap-UI.js', 'utf8'),
    readFile('app/JS/MindMap-IO.js', 'utf8'),
    readFile('app/JS/MindMap-Relations.js', 'utf8'),
]);
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const querySource = between(render, '// SECTION 节点查询索引', '// !SECTION 节点查询索引');
const helperSource = [
    querySource,
    between(render, 'function isDescendantOfLeft(', 'function updateChildrenDOM('),
    between(render, 'function getMindMapNodeStats(', 'function updateMindMapNodeStats('),
    between(render, 'function isDescendant(', '// ---防止 XSS'),
    between(relations, 'function collectMindMapNodeIds(', 'function removeMindMapRelationsForNodes('),
].join('\n');
const makeTree = () => ({
    id: 'root', children: [
        { id: 'left', dir: 'left', children: [{ id: 'a', children: [{ id: 'a1' }] }, { id: 'b' }] },
        { id: 'right', dir: 'right', children: [{ id: 'c' }, { id: 'd' }] },
    ],
});

function createRuntime(tree = makeTree()) {
    const buttons = new Map();
    const historyIndexes = [];
    let nextId = 0;
    const element = () => ({ style: {}, classList: { remove() {} }, getBoundingClientRect: () => ({ left: 0, width: 100 }) });
    const context = vm.createContext({
        state: { data: tree, selectedIds: new Set(), mode: 'IDLE', activeDockIndex: -1, drag: {} },
        document: { querySelectorAll: () => [], getElementById: element, body: { classList: { remove() {} } } },
        $: selector => {
            if (!buttons.has(selector)) buttons.set(selector, element());
            return buttons.get(selector);
        },
        generateNodeId: () => `generated-${++nextId}`,
        syncCurrentInput() {}, focusMindMapNodeTopic() {}, updateSelection() {}, updateTransform() {}, renderTree() {},
        addSummaryForSelectedCards() {}, removeMindMapRelationsForNodes() {}, removeMindMapSummariesForNodes() {}, showTopToast() {},
        recordHistory: () => historyIndexes.push(context.getMindMapNodeIndex()),
        updateChildrenDOM() {},
    });
    vm.runInContext(helperSource, context);
    vm.runInContext(between(render, 'function onMouseUp(', 'function syncCurrentInput('), context);
    vm.runInContext(between(ui, "$('#btn-add-child').onclick", "$('#btn-color').onclick"), context);
    vm.runInContext(between(io, 'function pasteMindMapNodesToSelection(', '/**\n * 执行粘贴逻辑'), context);
    vm.runInContext(between(io, 'function renewNodeIds(', 'function getMindMapClipboardNodes('), context);
    return { context, buttons, historyIndexes };
}
// !SECTION 查询与交互测试环境

// SECTION 查询规则与缓存生命周期
const { context } = createRuntime();
const root = context.state.data;
const left = root.children[0];
const right = root.children[1];
const a = left.children[0];
const initialIndex = context.getMindMapNodeIndex();
assert.equal(context.findNode(root, 'a1'), a.children[0]);
assert.equal(context.findParent(root, 'a1'), a);
assert.equal(context.findParent(root, 'root'), null);
assert.equal(context.findNode(root, 'missing'), null);
assert.equal(context.isDescendantOfLeft('a1'), true);
assert.equal(context.isDescendantOfLeft('c'), false);
assert.equal(context.isDescendantOfLeft('root'), false);
assert.equal(context.isDescendantOfLeft('missing'), false);
assert.equal(context.findNode(left, 'c'), null, '子树查询不能返回其他分支的节点');
assert.equal(context.findParent(a, 'a'), null, '子树根节点没有子树内父节点');
assert.equal(context.findParent(a, 'a1'), a);
assert.deepEqual(JSON.parse(JSON.stringify(context.getMindMapNodeStats())), { total: 8, children: null, siblings: null });

a.topic = '修改标题';
a.color = '#123456';
left.folded = true;
root.foldedLeft = true;
assert.equal(context.getMindMapNodeIndex(), initialIndex, '文字、颜色和折叠状态不应重建结构索引');
assert.equal(context.findNode(root, 'a').topic, '修改标题', '索引应引用当前节点而非旧副本');
assert.equal(context.findNode(root, 'a1'), a.children[0], '折叠节点仍然可查询');

left.children.splice(0, 1);
right.children.push(a);
context.invalidateMindMapNodeIndex();
assert.equal(context.findParent(root, 'a'), right);
assert.equal(context.isDescendantOfLeft('a1'), false, '移动子树后后代应继承新的分支方向');
right.dir = 'left';
context.invalidateMindMapNodeIndex();
assert.equal(context.isDescendantOfLeft('a1'), true, '根分支方向变化后应重建方向映射');

const replacement = structuredClone(root);
context.state.data = replacement;
assert.equal(context.findNode(replacement, 'a'), replacement.children[1].children[2], '相同 ID 的新根数据不能复用旧节点对象');
assert.notEqual(context.findNode(replacement, 'a'), a);
context.state.data = root;
assert.equal(context.findNode(root, 'a'), a, '切换回原页面时应恢复该页节点');

const typedRoot = { id: 'typed', children: [{ id: 1 }, { id: '1' }, { id: NaN, dir: 'left' }] };
context.state.data = typedRoot;
assert.equal(context.findNode(typedRoot, 1), typedRoot.children[0]);
assert.equal(context.findNode(typedRoot, '1'), typedRoot.children[1], '数字与字符串 ID 不得混用');
assert.equal(context.findNode(typedRoot, NaN), null, '保留严格相等的 ID 匹配规则');
assert.equal(context.findParent(typedRoot, NaN), null);
assert.equal(context.isDescendantOfLeft(NaN), false);
const duplicateRoot = { id: 'duplicate-root', children: [
    { id: 'left', dir: 'left', children: [{ id: 'duplicate' }] },
    { id: 'right', children: [{ id: 'duplicate' }] },
] };
context.state.data = duplicateRoot;
assert.equal(context.findNode(duplicateRoot, 'duplicate'), duplicateRoot.children[0].children[0]);
assert.equal(context.findParent(duplicateRoot, 'duplicate'), duplicateRoot.children[0]);
assert.equal(context.isDescendantOfLeft('duplicate'), true, '重复 ID 的旧数据保留原有深度优先匹配行为');
// !SECTION 查询规则与缓存生命周期

// SECTION 真实结构编辑入口
for (const action of ['#btn-add-child', '#btn-add-sibling']) {
    const runtime = createRuntime();
    const tree = runtime.context.state.data;
    runtime.context.state.selectedIds = new Set(['a']);
    runtime.context.getMindMapNodeIndex();
    runtime.buttons.get(action).onclick();
    assert.equal(runtime.context.findParent(tree, 'generated-1').id, action === '#btn-add-child' ? 'a' : 'left');
    assert.equal(runtime.context.isDescendantOfLeft('generated-1'), true);
    assert.equal(runtime.historyIndexes[0].nodeById.size, 9, '记录历史前必须能查询新节点');
}
for (const selected of [['left', 'a'], ['a', 'left']]) {
    const runtime = createRuntime();
    const tree = runtime.context.state.data;
    runtime.context.state.selectedIds = new Set(selected);
    runtime.context.getMindMapNodeIndex();
    runtime.buttons.get('#btn-delete').onclick();
    assert.equal(runtime.context.findNode(tree, 'a'), null, '批量删除父子节点后不得查询到已脱离导图的节点');
    assert.equal(runtime.context.findParent(tree, 'a1'), null);
    assert.equal(runtime.historyIndexes[0].nodeById.size, 4);
}

for (const dropType of ['CHILD', 'BEFORE', 'AFTER']) {
    for (const copy of [false, true]) {
        const runtime = createRuntime();
        const tree = runtime.context.state.data;
        const targetId = dropType === 'CHILD' ? 'right' : 'c';
        runtime.context.state.selectedIds = new Set(['a', 'a1']);
        runtime.context.state.mode = 'DRAGGING';
        runtime.context.state.drag = { source: 'node', nodeId: 'a', targetId, dropType };
        runtime.context.getMindMapNodeIndex();
        runtime.context.onMouseUp({ ctrlKey: copy, altKey: false, clientX: 50 });
        const movedId = copy ? 'generated-1' : 'a';
        assert.equal(runtime.context.findParent(tree, movedId).id, 'right');
        assert.equal(runtime.context.isDescendantOfLeft(movedId), false);
        if (!copy) assert.equal(runtime.context.findParent(tree, 'a1').id, 'right', '同一拖动中的后续节点查询必须看到已移动的父节点');
        else assert.equal(runtime.context.findParent(tree, 'a').id, 'left', '复制不应改变原节点父级');
        assert.equal(runtime.historyIndexes.length, 1);
    }
}
for (const dropType of ['CHILD', 'BEFORE']) {
    const runtime = createRuntime();
    const tree = runtime.context.state.data;
    runtime.context.state.mode = 'DRAGGING';
    runtime.context.state.drag = { source: 'dock', targetId: dropType === 'CHILD' ? 'right' : 'c', dropType, data: { question: 'Dock 卡片', answer: '正文' } };
    runtime.context.getMindMapNodeIndex();
    runtime.context.onMouseUp({ ctrlKey: false, clientX: 50 });
    assert.equal(runtime.context.findParent(tree, 'generated-1').id, 'right');
    assert.equal(runtime.historyIndexes[0].nodeById.size, 9);
}
const pasteRuntime = createRuntime();
pasteRuntime.context.state.selectedIds = new Set(['left']);
pasteRuntime.context.getMindMapNodeIndex();
const pastedNodes = [{ id: 'source', topic: '粘贴节点', children: [{ id: 'source-child' }] }];
assert.equal(pasteRuntime.context.pasteMindMapNodesToSelection(pastedNodes), true);
assert.equal(pasteRuntime.context.findParent(pasteRuntime.context.state.data, 'generated-1').id, 'left');
assert.equal(pasteRuntime.context.isDescendantOfLeft('generated-2'), true);
assert.equal(pasteRuntime.historyIndexes[0].nodeById.size, 10);
// !SECTION 真实结构编辑入口

// SECTION 大导图查询开销
let childReads = 0;
function countedNode(id, children = []) {
    return { id, get children() { childReads++; return children; } };
}
const largeTree = countedNode('large-root', Array.from({ length: 1000 }, (_, i) => countedNode(`large-${i}`)));
const largeRuntime = createRuntime(largeTree);
largeRuntime.context.findNode(largeTree, 'large-999');
assert.equal(childReads, 1001, '首次查询应只遍历一次全部节点');
for (let i = 0; i < 1000; i++) {
    const id = `large-${i}`;
    assert.equal(largeRuntime.context.findNode(largeTree, id).id, id);
    assert.equal(largeRuntime.context.findParent(largeTree, id), largeTree);
    assert.equal(largeRuntime.context.isDescendantOfLeft(id), false);
    assert.equal(largeRuntime.context.getMindMapNodeStats().total, 1001);
}
assert.equal(childReads, 1001, '重复节点、父节点、方向和总数查询不得重新遍历导图');
// !SECTION 大导图查询开销

console.log('节点查询索引校验通过：查询兼容、根数据替换、真实增删/拖动/复制/粘贴入口及大导图缓存复用完整。');
