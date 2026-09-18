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

console.log('精简视图校验通过：仅临时折叠有标题的标准卡片，不修改持久状态。');
