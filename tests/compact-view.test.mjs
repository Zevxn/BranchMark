import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const mindMapSource = await readMindMapSource();
const helperStart = mindMapSource.indexOf('function isTemporarilyCollapsed');
const helperEnd = mindMapSource.indexOf('function createNodeHTML', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart,
    '应存在独立的临时精简视图判断函数');

const helperSource = mindMapSource.slice(helperStart, helperEnd);
const createContext = compactView => {
    const context = vm.createContext({ state: { compactView } });
    vm.runInContext(helperSource, context, { filename: 'compact-view-helper.js' });
    return context;
};

const normalContext = createContext(false);
assert.equal(vm.runInContext(
    "isTemporarilyCollapsed({ topic: '研究结论', content: '正文内容' })",
    normalContext,
), false, '关闭精简视图时不得折叠卡片');

const compactContext = createContext(true);
assert.equal(vm.runInContext(
    "isTemporarilyCollapsed({ topic: '研究结论', content: '正文内容' })",
    compactContext,
), true, '精简视图应临时折叠有标题和正文的标准卡片');
assert.equal(vm.runInContext(
    "isTemporarilyCollapsed({ topic: '   ', content: '正文内容' })",
    compactContext,
), false, '无标题卡片应继续显示正文');
assert.equal(vm.runInContext(
    "isTemporarilyCollapsed({ topic: '研究结论', content: '' })",
    compactContext,
), false, '没有正文的卡片无需折叠');
assert.equal(vm.runInContext(
    "isTemporarilyCollapsed({ topic: '研究结论', content: '正文内容', isSimple: true })",
    compactContext,
), false, '便利贴模式不应受精简视图影响');

const clickStart = mindMapSource.indexOf("$('#btn-compact-view').onclick");
const clickEnd = mindMapSource.indexOf("$('#btn-center').onclick", clickStart);
assert.ok(clickStart >= 0 && clickEnd > clickStart, '工具栏应绑定精简视图按钮');
const clickHandler = mindMapSource.slice(clickStart, clickEnd);
assert.doesNotMatch(clickHandler, /recordHistory|saveStorage|saveMindMapData|storage\.local\.set/,
    '精简视图切换不得进入历史或任何持久化流程');
assert.match(mindMapSource, /node\.contentCollapsed \|\| isCompactCollapsed/,
    '临时折叠应只参与渲染计算，不覆盖节点原始折叠状态');

// SECTION 多选正文折叠
const batchStart = mindMapSource.indexOf('// 批量操作');
const batchEnd = mindMapSource.indexOf("contextMenu.classList.remove('active');", batchStart);
assert.ok(batchStart >= 0 && batchEnd > batchStart, '应能定位右键菜单的批量操作');
const nodes = [
    { id: 'titled', topic: '有标题', content: '正文' },
    { id: 'untitled', topic: '', content: '无标题正文' },
    { id: 'whitespace', topic: ' \t\n ', content: '空白标题正文' },
    { id: 'missing', content: '缺少标题正文' },
    { id: 'empty-body', topic: '只有标题', content: '' },
];
const updatedIds = [];
const batchContext = vm.createContext({
    state: { selectedIds: new Set(nodes.map(node => node.id)) },
    findNode: (_, id) => nodes.find(node => node.id === id),
    updateNodeDOM: id => updatedIds.push(id),
    action: 'collapse',
});
const executeBatch = () => vm.runInContext(`{
    let hasChange = false;
    ${mindMapSource.slice(batchStart, batchEnd)}
    globalThis.changed = hasChange;
}`, batchContext);
executeBatch();
assert.deepEqual(updatedIds, ['titled'], '混合多选时只能折叠有标题和正文的卡片');
assert.equal(nodes[0].contentCollapsed, true);
for (const node of nodes.slice(1)) assert.equal(node.contentCollapsed, undefined, '不可折叠卡片的原始状态不得被修改');
updatedIds.length = 0;
batchContext.state.selectedIds = new Set(['untitled', 'whitespace', 'missing']);
executeBatch();
assert.equal(batchContext.changed, false, '仅选择无标题卡片时折叠应为无操作');
assert.deepEqual(updatedIds, []);
nodes[1].contentCollapsed = true;
batchContext.action = 'expand';
executeBatch();
assert.equal(nodes[1].contentCollapsed, false, '展开操作仍应允许恢复已误折叠的无标题卡片');
assert.deepEqual(updatedIds, ['untitled']);
// !SECTION 多选正文折叠

console.log('精简视图与多选折叠校验通过：无标题卡片保持展开，支持恢复误折叠状态。');
