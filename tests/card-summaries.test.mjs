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
assert.match(html, /\.summary-editor\s*\{[\s\S]*?min-height:\s*0/,
    '总结卡片容器不应额外锁定高于普通卡片的最小高度');
assert.match(html, /\.summary-label-layer\s*\{[\s\S]*?width:\s*1px/,
    '总结编辑器覆盖层应继续使用不干扰画布布局的最小尺寸');
assert.match(html, /\.summary-editor\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?min-width:\s*120px;[\s\S]*?max-width:\s*600px/,
    '总结卡片自动宽度应按内容固有宽度计算，并复用普通卡片的尺寸边界');
assert.match(html, /\.node-card\.simple,\s*\.summary-editor\.simple\s*\{\s*min-height:\s*60px/,
    '普通便利贴与总结便利贴应复用一致的最小高度');
assert.match(html, /\.summary-editor\.simple \.summary-card-body\s*\{\s*display:\s*none/,
    '便利贴模式应隐藏正文并仅展示总结标题');
assert.match(html, /\.card-floating-tools\s*\{[\s\S]*?opacity:\s*0/,
    '总结框与普通卡片应复用默认隐藏的悬浮工具栏');
assert.match(html, /\.summary-brace\s*\{[\s\S]*?vector-effect:\s*non-scaling-stroke/,
    '大括号在画布缩放时应保持清晰稳定的描边');
assert.match(html, /\.node-card\.summary-member\s*\{[\s\S]*?outline:[\s\S]*?box-shadow:/,
    '选中总结时，其成员卡片应具有独立的高亮样式');

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
assert.match(mindMap, /function updateMindMapSummaryMemberHighlights\(\)[\s\S]*?getMindMapSummaryById\(state\.selectedSummaryId\)[\s\S]*?summary\.nodeIds\.forEach[\s\S]*?classList\.add\('summary-member'\)/,
    '选中总结时应根据 nodeIds 高亮所有被总结卡片');
assert.match(mindMap, /function clearSelectedMindMapSummary\(\)[\s\S]*?state\.selectedSummaryId = null;[\s\S]*?updateMindMapSummaryMemberHighlights\(\)/,
    '取消总结选中时应同步移除成员卡片高亮');
assert.match(mindMap, /isSimple:\s*false/,
    '新建总结应默认使用卡片模式');
assert.match(mindMap, /topic:\s*'总结'/,
    '新建总结的默认标题应为“总结”');
assert.match(mindMap, /toggleMindMapEntitySimpleMode\(summary\)[\s\S]*?recordHistory\(\)/,
    '总结应复用卡片模式切换规则，并记录撤销历史');
assert.match(mindMap, /function toggleMindMapEntitySimpleMode[\s\S]*?entity\.widthMode = 'manual'/,
    '普通卡片与总结卡片应共用便利贴尺寸初始化逻辑');
assert.match(mindMap, /classList\.toggle\('simple',\s*Boolean\(summary\.isSimple\)\)/,
    '渲染总结时应恢复已保存的展示模式');
assert.match(mindMap, /function getMindMapSummaryContent\(summary\)[\s\S]*?summary\?\.text/,
    '总结 Markdown 内容应兼容读取旧版 text 字段');
assert.match(mindMap, /function setMindMapSummaryContent\(summary, content\)[\s\S]*?summary\.content\s*=[\s\S]*?delete summary\.text/,
    '保存总结 Markdown 时应迁移到与普通卡片一致的 content 字段');
assert.match(mindMap, /topic\.addEventListener\('input'[\s\S]*?summary\.topic\s*=/,
    '总结标题应独立保存，并供便利贴模式展示');
assert.match(mindMap, /beginMindMapResize\(event, summary, 'summary', editor\)/,
    '总结卡片应复用卡片尺寸调整状态机');
assert.match(mindMap, /editor\.addEventListener\('dblclick'[\s\S]*?if \(handle\) autoFitMindMapEntity\(summary, 'summary', handle\.dataset\.resize\);[\s\S]*?openMindMapEditor\(summary\)/,
    '总结卡片双击应打开公共 Markdown 编辑器，仅尺寸手柄双击执行自适应');
assert.match(mindMap, /const summary = getMindMapSummaryById\(state\.selectedSummaryId\);[\s\S]*?const node = summary \|\| findNode[\s\S]*?openMindMapEditor\(node, false, true\)/,
    '选中总结时 Ctrl+Enter 应复用公共 Markdown 源码编辑入口');
assert.match(mindMap, /body\.innerHTML = renderMarkdown\(summaryContent\);[\s\S]*?processRichContent\(body\)/,
    '总结正文应复用普通卡片的 Markdown 渲染与富内容处理');
assert.match(mindMap, /tools\.className = 'summary-tools card-floating-tools'/,
    '总结卡片应复用卡片顶部居中的悬浮工具栏');
assert.match(mindMap, /editor\.append\(header, body, tools\)/,
    '总结工具栏应作为卡片直接子元素，避免被标题区域裁切');
assert.match(mindMap, /getMindMapSummaryById\(summaryEditor\.dataset\.summaryId\)[\s\S]*?kind: 'summary'/,
    '双击尺寸手柄时应能解析总结卡片为公共尺寸目标');
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
