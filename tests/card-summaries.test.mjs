import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readFile('app/JS/MindMap.js', 'utf8'),
]);

assert.match(html, /id=["']btn-add-summary["'][^>]*disabled/,
    '工具栏应提供默认禁用的多卡片总结按钮');
assert.match(html, /<svg[^>]*id=["']summary-brace-layer["']/,
    '画布变换层中应包含独立的 SVG 大括号图层');
assert.match(html, /id=["']summary-label-layer["']/,
    '画布变换层中应包含独立的 HTML 总结编辑器图层');
assert.match(html, /id=["']summarySelectionAction["'][\s\S]*?添加总结/,
    '框选有效卡片后应提供添加总结的浮动入口');
assert.match(html, /\.summary-editor\s*\{[\s\S]*?pointer-events:\s*auto/,
    '总结编辑器应能在画布覆盖层中接收输入事件');
assert.match(html, /\.summary-editor\.simple\s*\{[\s\S]*?background:/,
    '总结框应提供与卡片一致的便利贴视觉模式');
assert.match(html, /\.summary-editor\.simple \.summary-card-body\s*\{\s*display:\s*none/,
    '便利贴模式应隐藏正文并仅展示总结标题');
assert.match(html, /\.summary-tools\s*\{[\s\S]*?opacity:\s*0/,
    '总结框工具应在悬停或选中时显示');
assert.match(html, /\.summary-brace\s*\{[\s\S]*?vector-effect:\s*non-scaling-stroke/,
    '大括号在画布缩放时应保持清晰稳定的描边');

assert.match(mindMap, /relations:\s*\[\],\s*summaries:\s*\[\]/,
    '新建思维导图应初始化独立的总结数据集合');
assert.match(mindMap, /selectedSummaryId:\s*null/,
    '界面状态应独立记录当前选中的总结');
assert.match(mindMap, /ids\.length\s*<\s*MINDMAP_SUMMARY_MIN_NODES/,
    '少于两张卡片时不能创建总结');
assert.match(mindMap, /if \(sides\.size !== 1\) return null/,
    '跨左右两侧的卡片不能创建基础版总结');
assert.match(mindMap, /ensureMindMapSummaries\(\)\.push\(summary\)[\s\S]*?recordHistory\(\)/,
    '创建总结后应写入数据并记录撤销历史');
assert.match(mindMap, /removeMindMapRelationsForNodes\(deletedNodeIds\);\s*removeMindMapSummariesForNodes\(deletedNodeIds\);/,
    '删除卡片或子树时应同步清理总结成员');
assert.match(mindMap, /createElementNS\(MINDMAP_SUMMARY_SVG_NS, 'path'\)/,
    '总结范围应使用 SVG 路径绘制');
assert.match(mindMap, /createMindMapSummaryEditor\(summary\.id\)/,
    '每个可见总结应复用对应的 HTML 编辑器');
assert.match(mindMap, /isSimple:\s*false/,
    '新建总结应默认使用卡片模式');
assert.match(mindMap, /topic:\s*'卡片总结'/,
    '新建总结应保存可编辑的卡片标题');
assert.match(mindMap, /toggleMindMapEntitySimpleMode\(summary\)[\s\S]*?recordHistory\(\)/,
    '总结应复用卡片模式切换规则，并记录撤销历史');
assert.match(mindMap, /function toggleMindMapEntitySimpleMode[\s\S]*?entity\.widthMode = 'manual'/,
    '普通卡片与总结卡片应共用便利贴尺寸初始化逻辑');
assert.match(mindMap, /classList\.toggle\('simple',\s*Boolean\(summary\.isSimple\)\)/,
    '渲染总结时应恢复已保存的展示模式');
assert.match(mindMap, /textarea\.addEventListener\('input'[\s\S]*?summary\.text\s*=/,
    '编辑总结时应实时同步独立总结对象');
assert.match(mindMap, /topic\.addEventListener\('input'[\s\S]*?summary\.topic\s*=/,
    '总结标题应独立保存，并供便利贴模式展示');
assert.match(mindMap, /beginMindMapResize\(event, summary, 'summary', editor\)/,
    '总结卡片应复用卡片尺寸调整状态机');
assert.match(mindMap, /applyColorToMindMapSelection[\s\S]*?summary\.color\s*=\s*color/,
    '通用颜色入口应同时支持普通卡片和总结卡片');
assert.match(mindMap, /scheduleRenderMindMapRelations\(\);\s*scheduleRenderMindMapSummaries\(\);/,
    '卡片布局更新时应同时刷新关系线和总结标注');

const selectionSource = mindMap.slice(
    mindMap.indexOf('function getMindMapNodeBranchSide'),
    mindMap.indexOf('function getMindMapSummaryBracePath'),
);
const pathSource = mindMap.slice(
    mindMap.indexOf('function getMindMapSummaryBracePath'),
    mindMap.indexOf('function getMindMapSummaryGeometry'),
);
const cleanupSource = mindMap.slice(
    mindMap.indexOf('function removeMindMapSummariesForNodes'),
    mindMap.indexOf('function hasDuplicateMindMapSummary'),
);
assert.ok(selectionSource.startsWith('function getMindMapNodeBranchSide'), '应能提取同侧选择校验函数');
assert.ok(pathSource.startsWith('function getMindMapSummaryBracePath'), '应能提取大括号路径函数');
assert.ok(cleanupSource.startsWith('function removeMindMapSummariesForNodes'), '应能提取总结成员清理函数');

const selectionContext = vm.createContext({
    state: { data: { id: 'root' }, selectedIds: new Set() },
    findNode: (_root, id) => id === 'missing' ? null : { id },
    isDescendantOfLeft: id => id.startsWith('left-'),
});
vm.runInContext(`const MINDMAP_SUMMARY_MIN_NODES = 2; ${selectionSource}`, selectionContext);
selectionContext.sameSide = new Set(['left-a', 'left-b', 'left-c']);
selectionContext.crossSide = new Set(['left-a', 'right-b']);
selectionContext.withRoot = new Set(['root', 'right-b']);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapSummarySelection(sameSide)', selectionContext))),
    { nodeIds: ['left-a', 'left-b', 'left-c'], side: 'left' },
    '至少两张同侧卡片应通过总结选择校验',
);
assert.equal(vm.runInContext('getMindMapSummarySelection(crossSide)', selectionContext), null,
    '跨侧选择必须被拒绝');
assert.equal(vm.runInContext('getMindMapSummarySelection(withRoot)', selectionContext), null,
    '根卡片不能参与同侧总结');

const pathContext = vm.createContext({});
vm.runInContext(pathSource, pathContext);
pathContext.bounds = { left: 100, top: 50, right: 300, bottom: 250 };
const rightPath = vm.runInContext("getMindMapSummaryBracePath(bounds, 'right')", pathContext);
const leftPath = vm.runInContext("getMindMapSummaryBracePath(bounds, 'left')", pathContext);
assert.match(rightPath, /^M 318 42 C /, '右侧总结的大括号应从卡片包围盒右边开始');
assert.match(leftPath, /^M 82 42 C /, '左侧总结的大括号应镜像放在卡片包围盒左边');
assert.notEqual(rightPath, leftPath, '左右大括号路径不能使用相同方向');

const cleanupContext = vm.createContext({
    state: {
        data: {
            summaries: [
                { id: 'keep', nodeIds: ['a', 'b', 'c'], text: '保留' },
                { id: 'remove', nodeIds: ['a', 'b'], text: '删除' },
            ],
        },
        selectedSummaryId: 'remove',
    },
});
vm.runInContext(`const MINDMAP_SUMMARY_MIN_NODES = 2; ${cleanupSource}`, cleanupContext);
cleanupContext.deletedIds = new Set(['a']);
assert.equal(vm.runInContext('removeMindMapSummariesForNodes(deletedIds)', cleanupContext), true,
    '删除总结成员时应报告数据发生变化');
assert.equal(cleanupContext.state.data.summaries.length, 1,
    '剩余成员不足两张的总结应自动删除');
assert.deepEqual([...cleanupContext.state.data.summaries[0].nodeIds], ['b', 'c'],
    '仍有至少两名成员的总结应保留并移除失效成员');
assert.equal(cleanupContext.state.selectedSummaryId, null,
    '自动删除当前总结时应同步清除界面选择状态');

console.log('多卡片总结校验通过：同侧约束、独立数据、SVG 大括号、HTML 编辑与成员清理逻辑完整。');
