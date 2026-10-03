import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readMindMapSource(),
]);

assert.match(html, /id=["']btn-add-relation["'][^>]*disabled/,
    '工具栏应提供默认禁用的建立关联按钮');
assert.match(html, /data-action=["']add-relation["'][^>]*style=["'][^"']*display\s*:\s*none/,
    '右键菜单应提供默认隐藏的添加关联入口');
assert.match(html, /<svg[^>]*id=["']relation-layer["']/,
    '画布变换层中应包含 SVG 关联线图层');
assert.match(html, /\.relation-hit\s*\{[^}]*pointer-events:\s*stroke/s,
    '关联线应使用透明宽描边提供稳定的点击区域');
assert.match(html, /\.relation-group\.selected \.relation-line/,
    '选中的关联线应有明确视觉状态');
assert.match(html, /id=["']relationEditor["'][\s\S]*?id=["']relationLabelInput["']/,
    '点击关联后应提供可编辑标签的紧凑面板');
assert.match(html, /id=["']relationNavigationMenu["'][\s\S]*?id=["']relationNavigationList["']/,
    '卡片工具栏应提供可选择目标的关联卡片列表');
assert.equal((html.match(/data-relation-direction=/g) || []).length, 3,
    '关联编辑器应支持无向、A 到 B、B 到 A 三种方向');
assert.equal((html.match(/data-relation-style=/g) || []).length, 2,
    '关联编辑器应支持虚线与实线');
assert.match(html, /id=["']relationCustomColor["'][^>]*type=["']color["']/,
    '关联编辑器应支持自定义颜色');
assert.doesNotMatch(html, /\.relation-group\.selected \.relation-line\s*\{[^}]*stroke-dasharray:\s*none/s,
    '选中关系时不应覆盖用户设置的虚线样式');

assert.match(mindMap, /relations:\s*\[\]/,
    '新建思维导图应初始化关联数据集合');
assert.match(mindMap, /state\.selectedIds\.size\s*!==\s*2/,
    '只有恰好选择两张卡片时才能建立关联');
assert.match(mindMap, /const canAddRelation\s*=\s*state\.selectedIds\.size\s*===\s*2;[\s\S]*?addRelationItem\.style\.display\s*=\s*canAddRelation\s*\?\s*''\s*:\s*'none'/,
    '右键菜单仅应在恰好选中两张卡片时显示添加关联入口');
assert.match(mindMap, /\$\('#btn-add-relation'\)\.onclick\s*=\s*event\s*=>\s*addRelationBetweenSelectedCards\(\{[\s\S]*?x:\s*event\.clientX,[\s\S]*?y:\s*event\.clientY[\s\S]*?\}\)/,
    '工具栏建立关联时应传递鼠标坐标');
assert.match(mindMap, /if \(action === 'add-relation'\)\s*\{[\s\S]*?addRelationBetweenSelectedCards\(\{\s*x:\s*e\.clientX,\s*y:\s*e\.clientY\s*\}\);[\s\S]*?contextMenu\.classList\.remove\('active'\);[\s\S]*?return;/,
    '右键菜单应传递鼠标坐标、复用现有的添加关联逻辑并在执行后关闭');
assert.match(mindMap, /function addRelationBetweenSelectedCards\(clientPoint\s*=\s*null\)[\s\S]*?openMindMapRelationEditor\(relation\.id,\s*clientPoint\)/,
    '首次建立关联后，关联编辑框应定位到触发鼠标附近');
assert.match(mindMap, /isDuplicateMindMapRelation\(sourceId, targetId\)/,
    '无向关联应阻止反向重复连接');
assert.match(mindMap, /ensureMindMapRelations\(\)\.push\(relation\)[\s\S]*?recordHistory\(\)/,
    '建立关联后应写入思维导图数据并记录撤销历史');
assert.match(mindMap, /label:\s*'',\s*direction:\s*'none',\s*lineStyle:\s*'dashed',\s*color:\s*''/s,
    '新建关系应保存 V1.5 的兼容默认样式');
assert.match(mindMap, /visiblePath\.setAttribute\('marker-end'/,
    '有向关系应在 SVG 端点绘制箭头');
assert.match(mindMap, /marker\.setAttribute\('markerUnits', 'userSpaceOnUse'\)/,
    '箭头应使用固定画布尺寸，不能随关联线宽度放大');
assert.match(mindMap, /labelElement\.textContent\s*=\s*label/,
    '关联标签应通过 textContent 安全写入 SVG');
assert.match(mindMap, /data-action="navigate-relation"[\s\S]*?relationCount > 0 \? '' : 'hidden'/,
    '只有存在关联的卡片才应显示关联跳转入口');
assert.match(mindMap, /title\.textContent\s*=\s*item\.topic[\s\S]*?meta\.textContent\s*=\s*details\.join/,
    '关联列表应安全显示目标卡片标题、关联标签和折叠状态');
const relationJumpSource = mindMap.slice(
    mindMap.indexOf('function jumpToMindMapRelatedCard'),
    mindMap.indexOf('function getMindMapNodeLabel'),
);
assert.match(relationJumpSource, /clearMapSearchReveal\(\)[\s\S]*?revealedNodeIds\.add[\s\S]*?revealedRootDirections\.add[\s\S]*?renderTree\(\)/,
    '跳转到折叠卡片时应只临时展开完整祖先路径');
assert.doesNotMatch(relationJumpSource, /\.folded\s*=/,
    '关联跳转不得修改卡片持久化折叠状态');
assert.match(relationJumpSource, /state\.selectedIds\.add\(targetId\)[\s\S]*?centerMapNodeInVisibleArea\(card\)[\s\S]*?pulseMapSearchTarget\(card\)/,
    '关联跳转后应选中、居中并高亮目标卡片');
assert.match(mindMap, /updateSelectedMindMapRelation\('direction'/,
    '方向编辑应更新关联数据并进入历史记录');
assert.match(mindMap, /function findMindMapOrthogonalRoute\(/,
    '关联渲染应提供正交避障寻路');
assert.match(mindMap, /MINDMAP_RELATION_OVERLAP_PENALTY\s*\+\s*overlap\s*\*\s*6\s*\+\s*clearanceDeficit\s*\*\s*12/,
    '路由评分应惩罚同通道重叠及平行安全间距不足');
assert.match(mindMap, /parallelDistance >= MINDMAP_RELATION_PARALLEL_CLEARANCE/,
    '占用线段应按可见宽度建立平行安全走廊，而不是只比较完全相同的坐标');
assert.match(mindMap, /\? MINDMAP_RELATION_TREE_CROSSING_PENALTY\s*:\s*MINDMAP_RELATION_CROSSING_PENALTY/,
    '路由评分应惩罚关联线交叉');
assert.match(mindMap, /MINDMAP_RELATION_TREE_CROSSING_PENALTY[\s\S]*?MINDMAP_RELATION_CROSSING_PENALTY/,
    '父子树线与关联线交叉应使用不同的有限代价，不能将任一类交叉设为硬约束');
assert.doesNotMatch(mindMap, /forbidRelationCrossings|doesMindMapRelationSegmentCrossOccupiedRelation/,
    '关系线交叉不得作为硬约束，否则会迫使路线反复穿越父子树线');
assert.match(mindMap, /function getMindMapRelationTreeSegments\(cardRects\)[\s\S]*?getMindMapTreeConnectorPoints[\s\S]*?'tree'/,
    '关联寻路应复用父子连接线的真实几何生成结构占用线段');
assert.match(mindMap, /relationRouteCache\s*=\s*\{\s*key:\s*cacheKey,\s*routes\s*\}/,
    '卡片几何未变化时应复用路由，避免编辑标签时重复寻路');
assert.match(mindMap, /getMindMapRelationPortContext\(rect\.id\)[\s\S]*?getMindMapRelationReservedSides\(rect\.id\)/,
    '端口拓扑状态变化时应使关系路由缓存失效');
assert.match(mindMap, /function getMindMapRelationPortUsage\([\s\S]*?usesStructuralAnchor[\s\S]*?return 'free'/,
    '关系端点应按具体端口区分空闲、子树占用和父线保留状态');
assert.match(mindMap, /left\.reservedPortCount - right\.reservedPortCount[\s\S]*?left\.occupiedPortCount - right\.occupiedPortCount/,
    '关系寻路应先选择拓扑空闲层级，再在同层级内比较几何代价');
assert.match(mindMap, /function getMindMapRelationPreferredAlong\(/,
    '关联线应根据父子连线占用情况调整卡片边缘端点');
assert.match(mindMap, /function getMindMapRelationPortPlan\([\s\S]*?nestingDistance[\s\S]*?positions/,
    '多条关联线应先按对端位置排序并批量分配卡片边缘端口');
assert.match(mindMap, /const naturalRoutes = yield\* buildPass\(null, null, false\)[\s\S]*?buildPass\(portPlan\.assignments, portPlan\.relationOrder, true\)/,
    '关联线应先在不受其他关系占道影响时确定自然连接边，再统一分配端口并按冲突代价寻路');
assert.match(mindMap, /document\.querySelectorAll\('\.fold-btn'\)[\s\S]*?MINDMAP_RELATION_FOLD_BUTTON_PADDING/,
    '可见折叠按钮应作为带安全间距的路由障碍');
assert.match(mindMap, /function getMindMapRelationFoldCorridors\(cardRects\)/,
    '路由应计算折叠按钮与相邻子卡片之间的几何中线');
assert.match(mindMap, /function getMindMapRelationRouteFoldCorridors\(/,
    '折叠按钮走廊应按自然路线筛选，避免影响可从其他方向通过的线路');
assert.match(mindMap, /const naturalRoute = yield\* routeMindMapRelationSteps\([\s\S]*?\[\][\s\S]*?getMindMapRelationRouteFoldCorridors\(naturalRoute, preferredChannels\)/,
    '单条关联线应先计算无通道偏好的自然路线，再决定是否启用折叠走廊');
assert.match(mindMap, /getMindMapRelationRoutingKey\(relations, cardRects, controlObstacles, preferredChannels\)/,
    '折叠按钮位置变化后应使关系路由缓存失效');
assert.match(mindMap, /collectMindMapNodeIds\(findNode\(state\.data,id\), deletedNodeIds\)[\s\S]*?removeMindMapRelationsForNodes\(deletedNodeIds\)/,
    '删除卡片或子树时应同步清理相关关联');
assert.match(mindMap, /if \(!sourceCard \|\| !targetCard\) return;/,
    '任一端因折叠不可见时不应绘制关联线');
assert.equal((mindMap.match(/appendMindMapRelationsToCanvas\(nodes, edges\);/g) || []).length, 2,
    '横向和竖向 Canvas 导出都应追加卡片关联边');

// SECTION 关联绘制与空数据清理
const renderSource = mindMap.slice(
    mindMap.indexOf('async function renderMindMapRelations'),
    mindMap.indexOf('function initializeMindMapRelations'),
);
function createSvgElement(tag) {
    const classes = new Set();
    return {
        tag, children: [], attributes: {}, dataset: {},
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle: (name, active) => active ? classes.add(name) : classes.delete(name),
        },
        style: { setProperty() {} },
        appendChild(child) { this.children.push(child); },
        replaceChildren() { this.children = []; },
        querySelectorAll(selector) { return this.children.filter(child => child.classList.contains(selector.slice(1))); },
        setAttribute(name, value) { this.attributes[name] = value; },
    };
}
const relationLayer = createSvgElement('svg');
const relationPanel = createSvgElement('div');
const renderCards = [{ dataset: { nodeId: 'a' } }, { dataset: { nodeId: 'b' } }];
const renderFrames = [];
let renderPreparationCalls = 0;
const renderContext = vm.createContext({
    state: { data: {}, selectedRelationId: null },
    $: selector => selector === '#relation-layer' ? relationLayer : relationPanel,
    document: {
        createElementNS: (namespace, tag) => createSvgElement(tag),
        querySelectorAll: selector => {
            renderPreparationCalls++;
            return selector === '.node-card' ? renderCards : [];
        },
        getElementById: id => renderCards.find(card => `card-${card.dataset.nodeId}` === id),
    },
    requestAnimationFrame: callback => { renderFrames.push(callback); return renderFrames.length; },
    getMindMapCanvasRect: card => { renderPreparationCalls++; return { id: card.dataset.nodeId }; },
    getMindMapRelationFoldCorridors: () => { renderPreparationCalls++; return []; },
    buildMindMapRelationRoutesAsync: async (relations, cardRects) => {
        renderPreparationCalls++;
        assert.equal(cardRects.size, 2);
        return new Map(relations.map(relation => [relation.id, { path: 'M 0 0 L 100 100' }]));
    },
    getMindMapRelationDirection: () => 'none',
    getMindMapRelationColor: () => '',
    getMindMapRelationLineStyle: () => 'dashed',
    getMindMapRelationLabel: () => '',
});
vm.runInContext(`
    let relationRenderFrame = null;
    let relationRenderVersion = 0;
    const MINDMAP_RELATION_SVG_NS = 'http://www.w3.org/2000/svg';
    ${mindMap.slice(mindMap.indexOf('function getMindMapRelations()'), mindMap.indexOf('function ensureMindMapRelations()'))}
    ${mindMap.slice(mindMap.indexOf('function closeMindMapRelationEditor()'), mindMap.indexOf('function commitMindMapRelationEditor()'))}
    ${renderSource}
`, renderContext);
for (const relations of [[], undefined, null, 'legacy-invalid']) {
    renderContext.state.data = { relations };
    renderContext.state.selectedRelationId = 'removed';
    relationLayer.appendChild(createSvgElement('old-path'));
    relationPanel.classList.add('active');
    renderContext.renderMindMapRelations();
    assert.equal(relationLayer.children.length, 0, '无关联时必须清除旧连线');
    assert.equal(renderContext.state.selectedRelationId, null, '无关联时必须清理失效的选中状态');
    assert.equal(relationPanel.classList.contains('active'), false, '失效关联的编辑面板必须关闭');
    assert.equal(relationPanel.attributes['aria-hidden'], 'true');
    assert.equal(renderPreparationCalls, 0, '无关联时不得扫描卡片、测量几何或准备路由');
}
const renderedRelation = { id: 'visible', sourceId: 'a', targetId: 'b' };
renderContext.state.data.relations = [renderedRelation];
renderContext.state.selectedRelationId = renderedRelation.id;
relationPanel.classList.add('active');
renderContext.scheduleRenderMindMapRelations(true);
renderContext.scheduleRenderMindMapRelations();
assert.equal(renderFrames.length, 1, '同一帧的重绘请求应继续合并');
await renderFrames.shift()();
assert.equal(renderPreparationCalls, 0, '卡片首帧不得测量或计算关联线，应留出绘制卡片的机会');
assert.equal(relationLayer.children.length, 0, '卡片布局改变后应立即移除旧关联线');
renderContext.scheduleRenderMindMapRelations(true);
assert.equal(renderFrames.length, 1, '等待第二帧期间的布局更新也应合并');
await renderFrames.shift()();
assert.ok(renderPreparationCalls > 0, '有关联时应继续测量和准备路由');
assert.equal(relationLayer.children[1].children[0].attributes.d, 'M 0 0 L 100 100');
assert.equal(relationPanel.classList.contains('active'), true, '有效关联的编辑面板应保持打开');
renderContext.state.data.relations = [];
renderPreparationCalls = 0;
renderContext.scheduleRenderMindMapRelations();
await renderFrames.shift()();
await renderFrames.shift()();
assert.equal(relationLayer.children.length, 0, '最后一条关联移除后应清除刚绘制的路径');
assert.equal(renderContext.state.selectedRelationId, null);
assert.equal(relationPanel.classList.contains('active'), false);
assert.equal(renderPreparationCalls, 0);
renderContext.state.data.relations = [renderedRelation];
renderContext.scheduleRenderMindMapRelations();
assert.equal(renderFrames.length, 1, '空关联提前结束后仍应能安排后续重绘');
await renderFrames.shift()();
await renderFrames.shift()();
assert.equal(relationLayer.children.length, 2, '重新添加关联后应恢复绘制');

// 连续切换/折叠时不保存旧快照：第二帧只使用最新的关联和可见卡片。
renderContext.scheduleRenderMindMapRelations(true);
await renderFrames.shift()();
renderContext.state.data.relations = [];
renderPreparationCalls = 0;
renderContext.scheduleRenderMindMapRelations(true);
await renderFrames.shift()();
assert.equal(relationLayer.children.length, 0, '第二帧前移除的关联不得被旧任务重新绘制');
assert.equal(renderPreparationCalls, 0, '第二帧前折叠/切换为空数据时应跳过路由准备');

const originalAsyncBuilder = renderContext.buildMindMapRelationRoutesAsync;
let resolveOldRoutes;
renderContext.buildMindMapRelationRoutesAsync = () => new Promise(resolve => { resolveOldRoutes = resolve; });
renderContext.state.data.relations = [renderedRelation];
const oldRender = renderContext.renderMindMapRelations();
renderContext.state.data.relations = [];
renderContext.scheduleRenderMindMapRelations(true);
resolveOldRoutes(new Map([[renderedRelation.id, { path: 'M 0 0 L 100 100' }]]));
await oldRender;
assert.equal(relationLayer.children.length, 0, '分批计算期间切换/折叠后，旧结果不得回写图层');
await renderFrames.shift()();
await renderFrames.shift()();
renderContext.buildMindMapRelationRoutesAsync = originalAsyncBuilder;

renderContext.state.data.relations = [renderedRelation];
await renderContext.renderMindMapRelations();
const retainedGroup = relationLayer.children[1];
renderContext.buildMindMapRelationRoutesAsync = () => new Promise(resolve => { resolveOldRoutes = resolve; });
const pendingRedraw = renderContext.renderMindMapRelations();
assert.equal(relationLayer.children[1], retainedGroup, '样式重绘计算期间必须保留原关联线及其点击区域');
resolveOldRoutes(new Map([[renderedRelation.id, { path: 'M 0 0 L 200 200' }]]));
await pendingRedraw;
assert.equal(relationLayer.children[1].children[0].attributes.d, 'M 0 0 L 200 200', '计算完成后应替换为最新线路');
renderContext.buildMindMapRelationRoutesAsync = originalAsyncBuilder;

renderContext.commitMindMapRelationEditor = () => {};
renderContext.updateSelection = () => {};
renderContext.updateToolbar = () => {};
renderContext.openMindMapRelationEditor = () => {};
renderContext.state.selectedIds = new Set();
vm.runInContext(mindMap.slice(
    mindMap.indexOf('function clearSelectedMindMapRelation()'),
    mindMap.indexOf('function getMindMapRelationPath('),
), renderContext);
const selectableGroup = relationLayer.children[1];
const preparationBeforeSelection = renderPreparationCalls;
renderContext.selectMindMapRelation(renderedRelation.id, { x: 10, y: 10 });
assert.equal(selectableGroup.classList.contains('selected'), true, '点击关联线应立即更新选中高亮');
assert.equal(relationLayer.children[1], selectableGroup, '点击关联线不得移除或替换原路径和点击区域');
renderContext.clearSelectedMindMapRelation();
assert.equal(selectableGroup.classList.contains('selected'), false, '取消选中应立即移除高亮');
assert.equal(relationLayer.children[1], selectableGroup, '取消选中不得移除或替换原路径');
assert.equal(renderFrames.length, 0, '选中和取消选中不得触发重绘任务');
assert.equal(renderPreparationCalls, preparationBeforeSelection, '选中和取消选中不得重新测量或寻路');
// !SECTION 关联绘制与空数据清理

const pathSource = mindMap.slice(
    mindMap.indexOf('function getMindMapRelationPath'),
    mindMap.indexOf('async function renderMindMapRelations'),
);
const sideSource = mindMap.slice(
    mindMap.indexOf('function getCanvasRelationSides'),
    mindMap.indexOf('function appendMindMapRelationsToCanvas'),
);
const routingSource = mindMap.slice(
    mindMap.indexOf('function expandMindMapRelationObstacle'),
    mindMap.indexOf('async function renderMindMapRelations'),
);
const appendSource = mindMap.slice(
    mindMap.indexOf('function appendMindMapRelationsToCanvas'),
    mindMap.indexOf('// #endregion', mindMap.indexOf('function appendMindMapRelationsToCanvas')),
);
assert.ok(pathSource.startsWith('function getMindMapRelationPath'), '应能提取关联曲线路径计算函数');
assert.ok(sideSource.startsWith('function getCanvasRelationSides'), '应能提取 Canvas 连接侧计算函数');
assert.ok(appendSource.startsWith('function appendMindMapRelationsToCanvas'), '应能提取 Canvas 关联导出函数');
assert.ok(routingSource.startsWith('function expandMindMapRelationObstacle'), '应能提取关联避障路由函数');

const relatedItemsSource = mindMap.slice(
    mindMap.indexOf('function getMindMapRelatedCardItems'),
    mindMap.indexOf('function getMindMapNodePath'),
);
const nodePathSource = mindMap.slice(
    mindMap.indexOf('function getMindMapNodePath'),
    mindMap.indexOf('function closeMindMapRelationNavigationMenu'),
);
const navigationContext = vm.createContext({
    state: {
        data: {
            id: 'root', topic: '根节点', children: [{
                id: 'a', topic: '卡片 A', children: [{ id: 'c', topic: '卡片 C' }]
            }, { id: 'b', topic: '卡片 B' }]
        }
    },
    getMindMapRelations: () => [
        { id: 'r1', sourceId: 'a', targetId: 'b', label: '依赖' },
        { id: 'r2', sourceId: 'c', targetId: 'a', label: '' },
        { id: 'stale', sourceId: 'a', targetId: 'missing', label: '无效' },
    ],
    getMindMapRelationLabel: relation => String(relation.label || ''),
});
navigationContext.findNode = function findNode(root, id) {
    if (!root) return null;
    if (root.id === id) return root;
    for (const child of root.children || []) {
        const found = navigationContext.findNode(child, id);
        if (found) return found;
    }
    return null;
};
navigationContext.findParent = function findParent(root, id) {
    for (const child of root.children || []) {
        if (child.id === id) return root;
        const found = navigationContext.findParent(child, id);
        if (found) return found;
    }
    return null;
};
vm.runInContext(`${relatedItemsSource}\n${nodePathSource}`, navigationContext);
const relatedFromA = vm.runInContext("getMindMapRelatedCardItems('a')", navigationContext);
assert.deepEqual(JSON.parse(JSON.stringify(relatedFromA.map(item => ({
    targetId: item.targetId, topic: item.topic, label: item.label
})))), [
    { targetId: 'b', topic: '卡片 B', label: '依赖' },
    { targetId: 'c', topic: '卡片 C', label: '' },
], '列表应同时包含当前卡片作为起点或终点的有效关联');
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext("getMindMapNodePath('c').map(node => node.id)", navigationContext))),
    ['root', 'a', 'c'],
    '折叠目标应能计算从根节点到目标的完整路径',
);

const context = vm.createContext({});
vm.runInContext(`${pathSource}\n${sideSource}`, context);
context.sourceRect = { left: 100, right: 300, top: 100, bottom: 200, width: 200, height: 100 };
context.targetRect = { left: 500, right: 700, top: 300, bottom: 400, width: 200, height: 100 };
context.view = { tx: 100, ty: 50, scale: 2 };
const curve = vm.runInContext('getMindMapRelationPath(sourceRect, targetRect, view)', context);
assert.match(curve, /^M 100 50 C /,
    '水平关联应从源卡片靠近目标的一侧开始，并正确换算画布缩放坐标');
assert.match(curve, /, 200 150$/,
    '水平关联应连接到目标卡片靠近源卡片的一侧');

context.sourceNode = { x: 0, y: 0, width: 100, height: 50 };
context.targetNode = { x: 20, y: 200, width: 100, height: 50 };
const verticalSides = vm.runInContext('getCanvasRelationSides(sourceNode, targetNode)', context);
assert.deepEqual({ ...verticalSides }, { fromSide: 'bottom', toSide: 'top' },
    '竖向 Canvas 中上下分布的关联应使用底部到顶部连接');

context.getMindMapRelations = () => [{
    id: 'relation-1', sourceId: 'a', targetId: 'b', direction: 'reverse',
    label: '依赖于', color: '#1971c2', lineStyle: 'solid'
}];
context.getMindMapRelationDirection = relation => relation.direction || 'none';
context.getMindMapRelationLabel = relation => relation.label || '';
context.getMindMapRelationColor = relation => relation.color || '';
vm.runInContext(appendSource, context);
context.canvasNodes = [
    { id: 'a', x: 0, y: 0, width: 100, height: 50 },
    { id: 'b', x: 200, y: 0, width: 100, height: 50 },
];
context.canvasEdges = [];
vm.runInContext('appendMindMapRelationsToCanvas(canvasNodes, canvasEdges)', context);
assert.deepEqual({ ...context.canvasEdges[0] }, {
    id: 'relation-1',
    fromNode: 'b',
    fromSide: 'left',
    fromEnd: 'none',
    toNode: 'a',
    toSide: 'right',
    toEnd: 'arrow',
    label: '依赖于',
    color: '#1971c2',
}, '反向关系导出时应翻转端点，并保留箭头、标签和颜色');

const routingContext = vm.createContext({});
vm.runInContext(`
    const MINDMAP_RELATION_ROUTING_PADDING = 18;
    const MINDMAP_RELATION_SOURCE_CLEARANCE = 28;
    const MINDMAP_RELATION_TARGET_APPROACH = 48;
    const MINDMAP_RELATION_ARROW_SIZE = 12;
    const MINDMAP_RELATION_FOLD_BUTTON_PADDING = 6;
    const MINDMAP_RELATION_OBSTACLE_EDGE_PENALTY = 36;
    const MINDMAP_RELATION_CHANNEL_DEVIATION_PENALTY = 48;
    const MINDMAP_RELATION_TERMINAL_ALIGNMENT_PENALTY = 48;
    const MINDMAP_RELATION_LANE_GAP = 12;
    const MINDMAP_RELATION_TURN_PENALTY = 28;
    const MINDMAP_RELATION_VISIBLE_TURN_PENALTY = MINDMAP_RELATION_SOURCE_CLEARANCE
        + MINDMAP_RELATION_TARGET_APPROACH
        + MINDMAP_RELATION_LANE_GAP * 2;
    const MINDMAP_RELATION_CROSSING_PENALTY = 300;
    const MINDMAP_RELATION_TREE_CROSSING_PENALTY = 160;
    const MINDMAP_RELATION_OVERLAP_PENALTY = 720;
    const MINDMAP_RELATION_PARALLEL_CLEARANCE = 10;
    const MINDMAP_RELATION_PORT_PAIR_CANDIDATES = 4;
    const MINDMAP_RELATION_PORT_DEVIATION_PENALTY = 0.2;
    ${routingSource}
`, routingContext);
routingContext.routeStart = { x: 0, y: 50 };
routingContext.routeEnd = { x: 400, y: 50 };
routingContext.routeObstacles = [{ id: 'middle', left: 150, right: 250, top: 0, bottom: 100 }];
const avoidedRoute = vm.runInContext(
    'findMindMapOrthogonalRoute(routeStart, routeEnd, routeObstacles)',
    routingContext,
);
assert.ok(avoidedRoute && avoidedRoute.points.length >= 4,
    '中央卡片阻挡直线路径时应找到绕行路线');
routingContext.avoidedRoute = avoidedRoute;
const avoidsObstacle = vm.runInContext(`
    getMindMapRelationSegments(avoidedRoute.points)
        .every(segment => isMindMapRelationSegmentClear(segment.from, segment.to, routeObstacles))
`, routingContext);
assert.equal(avoidsObstacle, true, '生成的每一段路线都不能穿过卡片障碍');

routingContext.treeOverlapStart = { x: 0, y: 50 };
routingContext.treeOverlapEnd = { x: 100, y: 50 };
routingContext.horizontalTreeSegment = [{
    from: { x: 20, y: 50 },
    to: { x: 80, y: 50 },
    kind: 'tree'
}];
const treeOverlapRoute = vm.runInContext(`
    findMindMapOrthogonalRoute(
        treeOverlapStart,
        treeOverlapEnd,
        [],
        horizontalTreeSegment
    )
`, routingContext);
assert.ok(treeOverlapRoute && treeOverlapRoute.points.some(point => Math.abs(point.y - 50) > 0.1),
    '关系线与父子树线同轴重叠时应主动换到相邻通道');

routingContext.treeNearOverlapStart = { x: 50, y: 0 };
routingContext.treeNearOverlapEnd = { x: 50, y: 100 };
routingContext.nearbyVerticalTreeSegment = [{
    from: { x: 54, y: 20 },
    to: { x: 54, y: 80 },
    kind: 'tree'
}];
const treeNearOverlapRoute = vm.runInContext(`
    findMindMapOrthogonalRoute(
        treeNearOverlapStart,
        treeNearOverlapEnd,
        [],
        nearbyVerticalTreeSegment
    )
`, routingContext);
assert.ok(treeNearOverlapRoute && treeNearOverlapRoute.points.some(point => Math.abs(point.x - 50) > 0.1),
    '关系线与父子树线相差数像素但视觉粘连时，也应离开树线安全走廊');

routingContext.treeCrossingStart = { x: 0, y: 50 };
routingContext.treeCrossingEnd = { x: 100, y: 50 };
routingContext.verticalTreeSegment = [{
    from: { x: 50, y: 0 },
    to: { x: 50, y: 100 },
    kind: 'tree'
}];
const treeCrossingRoute = vm.runInContext(`
    findMindMapOrthogonalRoute(
        treeCrossingStart,
        treeCrossingEnd,
        [],
        verticalTreeSegment
    )
`, routingContext);
assert.equal(treeCrossingRoute.points.length, 2,
    '关系线垂直穿越父子树干时应保留直线路径，不为普通交叉额外绕行');

routingContext.lateTurnStart = { x: 0, y: 1000 };
routingContext.lateTurnEnd = { x: 100, y: 0 };
routingContext.targetColumnObstacles = [
    { id: 'target-column-1', left: 80, right: 120, top: 180, bottom: 260 },
    { id: 'target-column-2', left: 80, right: 120, top: 420, bottom: 500 },
    { id: 'target-column-3', left: 80, right: 120, top: 680, bottom: 760 }
];
const lateTurnRoute = vm.runInContext(`
    findMindMapOrthogonalRoute(
        lateTurnStart,
        lateTurnEnd,
        targetColumnObstacles,
        [],
        [],
        2
    )
`, routingContext);
assert.deepEqual(Array.from(lateTurnRoute.points, point => ({ x: point.x, y: point.y })), [
    { x: 0, y: 1000 },
    { x: 0, y: 0 },
    { x: 100, y: 0 }
], '目标中心列沿途受阻时应保持源侧直线，到目标附近再横移，不能提前横移后蛇形绕障碍');

routingContext.foldButtonObstacle = vm.runInContext(`
    expandMindMapRelationObstacle({
        id: 'fold-button', left: 86, right: 102, top: 90, bottom: 110
    }, MINDMAP_RELATION_FOLD_BUTTON_PADDING)
`, routingContext);
routingContext.foldOwnerObstacle = vm.runInContext(`
    expandMindMapRelationObstacle({
        id: 'fold-owner', left: 0, right: 80, top: 70, bottom: 130
    })
`, routingContext);
routingContext.foldChildObstacle = vm.runInContext(`
    expandMindMapRelationObstacle({
        id: 'fold-child', left: 130, right: 230, top: 70, bottom: 130
    })
`, routingContext);
routingContext.foldChildObstacle.left = 122;
routingContext.unrelatedGridObstacle = {
    id: 'unrelated-grid', left: 115, right: 117, top: 300, bottom: 340
};
routingContext.foldCorridor = [{ axis: 'x', coordinate: 116, min: 52, max: 148 }];
routingContext.foldRouteStart = { x: 100, y: 0 };
routingContext.foldRouteEnd = { x: 100, y: 200 };
const foldAvoidedRoute = vm.runInContext(
    `findMindMapOrthogonalRoute(
        foldRouteStart,
        foldRouteEnd,
        [foldOwnerObstacle, foldButtonObstacle, foldChildObstacle, unrelatedGridObstacle],
        [],
        foldCorridor,
        2
    )`,
    routingContext,
);
assert.ok(foldAvoidedRoute && foldAvoidedRoute.points.some(point => Math.abs(point.x - 116) < 0.1),
    '关系线应从折叠按钮与右侧子卡片之间的准确中点通过');
assert.ok(foldAvoidedRoute.points.every(point => point.x < 248),
    '存在按钮右侧内部通道时，关系线不应绕到右侧子卡片外侧');
assert.equal(foldAvoidedRoute.points.at(-2).x, routingContext.foldRouteEnd.x,
    '离开折叠按钮走廊后应提前对齐目标，不应在箭头前产生小折角');
routingContext.foldAvoidedRoute = foldAvoidedRoute;
assert.equal(vm.runInContext(`
    getMindMapRelationSegments(foldAvoidedRoute.points)
        .every(segment => isMindMapRelationSegmentClear(
            segment.from,
            segment.to,
            [foldOwnerObstacle, foldButtonObstacle, foldChildObstacle, unrelatedGridObstacle]
        ))
`, routingContext), true, '绕行折叠按钮的每一段线路都应保持安全间距');

routingContext.foldCorridorScope = [{
    id: 'fold-corridor:fold-owner:0',
    ownerId: 'fold-owner',
    axis: 'x',
    coordinate: 116,
    gapMin: 104,
    gapMax: 128,
    triggerMin: 82,
    triggerMax: 118,
    min: 52,
    max: 148,
    side: 'right',
    neighborIds: ['fold-child']
}];
routingContext.leftNaturalRoute = {
    points: [
        { x: 40, y: 40 },
        { x: 40, y: 200 },
        { x: 180, y: 200 }
    ]
};
assert.equal(vm.runInContext(
    'getMindMapRelationRouteFoldCorridors(leftNaturalRoute, foldCorridorScope).length',
    routingContext,
), 0, '自然路线可从左侧通过时，即使两端横跨通道也不应被折叠走廊吸附');
routingContext.crossingNaturalRoute = {
    points: [
        { x: 40, y: 100 },
        { x: 180, y: 100 }
    ]
};
assert.equal(vm.runInContext(
    'getMindMapRelationRouteFoldCorridors(crossingNaturalRoute, foldCorridorScope).length',
    routingContext,
), 1, '自然路线确实横穿折叠按钮父子间隙时应启用该走廊');
routingContext.verticalGapRoute = {
    points: [
        { x: 116, y: 20 },
        { x: 116, y: 180 }
    ]
};
assert.equal(vm.runInContext(
    'getMindMapRelationRouteFoldCorridors(verticalGapRoute, foldCorridorScope).length',
    routingContext,
), 1, '自然路线纵向经过折叠按钮父子间隙时也应启用该走廊');

routingContext.occupiedRoute = [{ from: { x: 0, y: 50 }, to: { x: 400, y: 50 } }];
const separatedRoute = vm.runInContext(
    'findMindMapOrthogonalRoute(routeStart, routeEnd, [], occupiedRoute)',
    routingContext,
);
assert.ok(separatedRoute.points.some(point => point.y !== 50),
    '已有关系占用直线通道时，新关系应自动选择错开的平行车道');

routingContext.crossingStart = { x: 0, y: 0 };
routingContext.crossingEnd = { x: 400, y: 0 };
routingContext.crossingOccupied = [{ from: { x: 200, y: -50 }, to: { x: 200, y: 50 } }];
const crossingAvoidedRoute = vm.runInContext(
    'findMindMapOrthogonalRoute(crossingStart, crossingEnd, [], crossingOccupied)',
    routingContext,
);
assert.ok(crossingAvoidedRoute.points.some(point => Math.abs(point.y) > 50),
    '存在可用绕行空间时，新关系应绕过已有关系而不是直接交叉');

routingContext.longCrossingStart = { x: 0, y: 0 };
routingContext.longCrossingEnd = { x: 2000, y: 0 };
routingContext.longCrossingOccupied = [{
    from: { x: 1000, y: -1000 },
    to: { x: 1000, y: 1000 },
}];
const longCrossingAvoidedRoute = vm.runInContext(
    'findMindMapOrthogonalRoute(longCrossingStart, longCrossingEnd, [], longCrossingOccupied)',
    routingContext,
);
assert.ok(longCrossingAvoidedRoute.points.every(point => Math.abs(point.y) < 0.1),
    '避让距离极大时应允许一次关系线交叉，不能因硬约束产生失控绕行');

routingContext.nearTerminalCrossingStart = { x: 0, y: 0 };
routingContext.nearTerminalCrossingEnd = { x: 100, y: 0 };
routingContext.nearTerminalCrossingOccupied = [{
    from: { x: 2, y: -50 },
    to: { x: 2, y: 50 },
}];
const nearTerminalCrossingRoute = vm.runInContext(
    'findMindMapOrthogonalRoute(nearTerminalCrossingStart, nearTerminalCrossingEnd, [], nearTerminalCrossingOccupied)',
    routingContext,
);
assert.ok(nearTerminalCrossingRoute.points.some(point => Math.abs(point.y) > 50),
    '既有关系线即使距离当前出线路由点不足一个车道间距，也不能被当作共享端点直接穿越');

routingContext.weightedCrossingRoute = [{ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } }];
routingContext.oneRelationCrossing = [{
    from: { x: 50, y: -20 }, to: { x: 50, y: 20 }, kind: 'relation'
}];
routingContext.twoTreeCrossings = [
    { from: { x: 30, y: -20 }, to: { x: 30, y: 20 }, kind: 'tree' },
    { from: { x: 70, y: -20 }, to: { x: 70, y: 20 }, kind: 'tree' },
];
const oneRelationCrossingPenalty = vm.runInContext(`
    getMindMapRelationSegmentInteractionPenalty(
        weightedCrossingRoute[0].from,
        weightedCrossingRoute[0].to,
        oneRelationCrossing
    )
`, routingContext);
const twoTreeCrossingsPenalty = vm.runInContext(`
    getMindMapRelationSegmentInteractionPenalty(
        weightedCrossingRoute[0].from,
        weightedCrossingRoute[0].to,
        twoTreeCrossings
    )
`, routingContext);
assert.ok(oneRelationCrossingPenalty < twoTreeCrossingsPenalty,
    '一次关联线交叉应优于两次父子树线交叉，避免路线为零关联交叉而穿越多段树干');

const roundedPath = vm.runInContext(`
    getMindMapRoundedOrthogonalPath([
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 60 }
    ])
`, routingContext);
assert.match(roundedPath, / C /,
    '路径拐角应使用带切线控制点的三次贝塞尔曲线');
assert.doesNotMatch(roundedPath, / [AQ] /,
    '圆滑路径不应继续使用无法适配轻微斜段的固定圆弧或二次曲线');

routingContext.previousCornerPoint = { x: 0, y: 0 };
routingContext.currentCornerPoint = { x: 40, y: 10 };
routingContext.nextCornerPoint = { x: 40, y: 70 };
const tangentCurve = vm.runInContext(`
    getMindMapRelationCornerCurve(previousCornerPoint, currentCornerPoint, nextCornerPoint, 16)
`, routingContext);
const incomingVector = {
    x: routingContext.currentCornerPoint.x - routingContext.previousCornerPoint.x,
    y: routingContext.currentCornerPoint.y - routingContext.previousCornerPoint.y,
};
const entryTangent = {
    x: tangentCurve.control1.x - tangentCurve.before.x,
    y: tangentCurve.control1.y - tangentCurve.before.y,
};
const outgoingVector = {
    x: routingContext.nextCornerPoint.x - routingContext.currentCornerPoint.x,
    y: routingContext.nextCornerPoint.y - routingContext.currentCornerPoint.y,
};
const exitTangent = {
    x: tangentCurve.after.x - tangentCurve.control2.x,
    y: tangentCurve.after.y - tangentCurve.control2.y,
};
assert.ok(Math.abs(incomingVector.x * entryTangent.y - incomingVector.y * entryTangent.x) < 1e-8,
    '曲线入口切线必须与前一条直线平行');
assert.ok(Math.abs(outgoingVector.x * exitTangent.y - outgoingVector.y * exitTangent.x) < 1e-8,
    '曲线出口切线必须与后一条直线平行');

routingContext.portRect = { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 };
const targetAwarePort = vm.runInContext(
    "getMindMapRelationPort(portRect, 'right', 0, 18, 82)",
    routingContext,
);
assert.equal(targetAwarePort.port.y, 82,
    '连接点应沿卡片边缘靠近目标位置，而不是始终固定在边缘中心');

routingContext.adaptivePortRect = {
    left: 0, right: 160, top: 100, bottom: 300, width: 160, height: 200
};
routingContext.distantLowerRect = {
    left: 240, right: 560, top: 440, bottom: 720, width: 320, height: 280
};
const adaptiveRightPorts = vm.runInContext(`
    getMindMapRelationPortCandidates(
        adaptivePortRect,
        'right',
        distantLowerRect,
        MINDMAP_RELATION_TARGET_APPROACH,
        { branchSide: 'right', hasChildren: true, childSides: [] }
    )
`, routingContext);
assert.deepEqual(
    JSON.parse(JSON.stringify(adaptiveRightPorts
        .filter(candidate => candidate.kinds.some(kind => kind.startsWith('quarter')))
        .map(candidate => candidate.port.y)
        .sort((left, right) => left - right))),
    [150, 250],
    '每个卡片侧边应同时提供四分之一和四分之三端点候选',
);
assert.ok(adaptiveRightPorts.some(candidate => candidate.kinds.includes('center') && candidate.port.y === 200),
    '侧边中心应作为稳定回退候选保留');
assert.equal(
    adaptiveRightPorts.find(candidate => candidate.preferred).deviationPenalty,
    0,
    '当子连线侧被占用时，靠近对方的首选四分位不应承担偏移惩罚',
);
assert.ok(
    adaptiveRightPorts.find(candidate => candidate.kinds.includes('quarter-start')).deviationPenalty > 0,
    '偏移端点应带有小额稳定性惩罚，避免轻微移动导致连接点跳动',
);
const leafRightPorts = vm.runInContext(`
    getMindMapRelationPortCandidates(
        adaptivePortRect,
        'right',
        distantLowerRect,
        MINDMAP_RELATION_TARGET_APPROACH,
        { branchSide: 'right', hasChildren: false, childSides: [] }
    )
`, routingContext);
assert.equal(leafRightPorts.length, 1,
    '无子节点右支卡片的右侧只应生成中心端点');
assert.equal(leafRightPorts[0].port.y, 200,
    '无子节点卡片的外侧关联线必须从中心连接');
assert.equal(leafRightPorts[0].kinds.some(kind => kind.startsWith('quarter')), false,
    '无子节点卡片的外侧四分位不得进入候选集');
assert.equal(vm.runInContext(`
    getMindMapRelationPortUsage(
        'bottom',
        { kinds: ['preferred', 'center'] },
        new Set(['left']),
        { branchSide: 'right', hasChildren: true, childSides: [] }
    )
`, routingContext), 'free', '有子节点的右支卡片底边仍应属于空闲端口');
assert.equal(vm.runInContext(`
    getMindMapRelationPortUsage(
        'right',
        { kinds: ['center'] },
        new Set(['left']),
        { branchSide: 'right', hasChildren: true, childSides: [] }
    )
`, routingContext), 'occupied', '有子节点的右支卡片右边应属于子树共享端口');
assert.equal(vm.runInContext(`
    getMindMapRelationPortUsage(
        'left',
        { kinds: ['center'] },
        new Set(['left']),
        { branchSide: 'right', hasChildren: true, childSides: [] }
    )
`, routingContext), 'reserved', '右支卡片左边应属于父线保留端口');
assert.equal(vm.runInContext(`
    getMindMapRelationPortUsage(
        'left',
        { kinds: ['quarter-start'] },
        new Set(['left']),
        { branchSide: 'right', hasChildren: true, childSides: [] }
    )
`, routingContext), 'free', '父线只占左侧中点，未重叠的四分位端口应保持空闲');
assert.equal(vm.runInContext(`
    getMindMapRelationPortUsage(
        'left',
        { kinds: ['quarter-start'] },
        new Set(['left']),
        { branchSide: 'right', hasChildren: false, childSides: [] }
    )
`, routingContext), 'reserved', '叶节点无需复用父线侧，左侧四分位端口应继续保留');
assert.equal(vm.runInContext(`
    getMindMapRelationPortUsage(
        'right',
        { kinds: ['quarter-start'] },
        new Set(['left']),
        { branchSide: 'right', hasChildren: true, childSides: [] }
    )
`, routingContext), 'occupied', '子树侧四分位端口仍应属于占用层级，避免重新产生绕行');
const adaptiveTopPorts = vm.runInContext(`
    getMindMapRelationPortCandidates(
        adaptivePortRect,
        'top',
        distantLowerRect,
        MINDMAP_RELATION_TARGET_APPROACH
    )
`, routingContext);
assert.equal(adaptiveTopPorts.length, 1,
    '卡片上下边只应生成唯一的中心端点');
assert.equal(adaptiveTopPorts[0].port.x, 80,
    '卡片上侧连接点必须严格位于水平中心');
assert.deepEqual([...adaptiveTopPorts[0].kinds], ['preferred', 'center'],
    '卡片上下边不应包含四分位或投影端点');

routingContext.alignedSourceRect = {
    id: 'upper', left: 20, right: 170, top: 0, bottom: 140, width: 150, height: 140
};
routingContext.alignedTargetRect = {
    id: 'lower', left: 10, right: 330, top: 500, bottom: 660, width: 320, height: 160
};
const alignedCandidate = vm.runInContext(`
    getMindMapRelationSideCandidates(alignedSourceRect, alignedTargetRect)
        .find(candidate => candidate.sourceSide === 'bottom'
            && candidate.targetSide === 'top'
            && candidate.sourcePort.preferred
            && candidate.targetPort.preferred)
`, routingContext);
assert.equal(alignedCandidate.sourcePort.port.x, 95,
    '源卡片端点必须位于所选边的准确中点，不能为追求共线而偏移');
assert.equal(alignedCandidate.targetPort.port.x, 170,
    '目标卡片端点必须位于所选边的准确中点，不能受分流偏移影响');

routingContext.centerSourceRect = {
    id: 'source', left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100
};
routingContext.centerTargetRect = {
    id: 'target', left: 200, right: 300, top: 200, bottom: 300, width: 100, height: 100
};
const centeredMixedCandidate = vm.runInContext(`
    getMindMapRelationSideCandidates(centerSourceRect, centerTargetRect)
        .find(candidate => candidate.sourceSide === 'right'
            && candidate.targetSide === 'top'
            && candidate.sourcePort.preferred
            && candidate.targetPort.preferred)
`, routingContext);
assert.equal(centeredMixedCandidate.sourcePort.port.y, 50,
    '无法共线的混合方向连接应优先使用源卡片边中心');
assert.equal(centeredMixedCandidate.targetPort.port.x, 250,
    '无法共线的混合方向连接应优先使用目标卡片边中心');

routingContext.relationCardRect = {
    id: 'relation-card', left: 0, right: 160, top: 100, bottom: 300, width: 160, height: 200
};
routingContext.upperRelatedRect = {
    id: 'upper-related', left: 300, right: 460, top: -20, bottom: 80, width: 160, height: 100
};
routingContext.lowerRelatedRect = {
    id: 'lower-related', left: 300, right: 460, top: 320, bottom: 420, width: 160, height: 100
};
routingContext.foldedChildNode = {
    id: 'folded-parent', folded: true, children: [{ id: 'hidden-child' }]
};
routingContext.rootWithFoldedSides = {
    id: 'root', foldedLeft: true, foldedRight: true,
    children: [{ id: 'left-child', dir: 'left' }, { id: 'right-child', dir: 'right' }]
};
routingContext.state = { data: routingContext.rootWithFoldedSides };
routingContext.findNode = (_root, id) => id === 'root'
    ? routingContext.rootWithFoldedSides
    : (id === 'folded-parent' ? routingContext.foldedChildNode : null);
routingContext.getMindMapNodeBranchSide = () => 'right';
const foldedPortContext = vm.runInContext(
    "getMindMapRelationPortContext('folded-parent')",
    routingContext,
);
assert.equal(foldedPortContext.hasChildren, true,
    '普通卡片即使子树已折叠，子连线侧仍应视为被占用');
const foldedRootContext = vm.runInContext(
    "getMindMapRelationPortContext('root')",
    routingContext,
);
assert.deepEqual(Array.from(foldedRootContext.childSides), ['left', 'right'],
    '根节点左右子树折叠后，两侧折叠入口仍应保留占用状态');

assert.equal(vm.runInContext(`
    getMindMapRelationPreferredAlong(
        relationCardRect,
        'right',
        upperRelatedRect,
        { branchSide: 'right', hasChildren: false, childSides: [] }
    )
`, routingContext), 200,
    '右支卡片没有子节点时，右侧关联线仍应使用边缘中点');
assert.equal(vm.runInContext(`
    getMindMapRelationPreferredAlong(
        relationCardRect,
        'right',
        upperRelatedRect,
        { branchSide: 'right', hasChildren: true, childSides: [] }
    )
`, routingContext), 150,
    '右支卡片的右侧子连线被占用且对方在上时，端点应上移至四分之一高度');
assert.equal(vm.runInContext(`
    getMindMapRelationPreferredAlong(
        relationCardRect,
        'left',
        lowerRelatedRect,
        { branchSide: 'right', hasChildren: false, childSides: [] }
    )
`, routingContext), 250,
    '右支卡片的左侧父连线始终被占用，对方在下时端点应下移至四分之三高度');
assert.equal(vm.runInContext(`
    getMindMapRelationPreferredAlong(
        relationCardRect,
        'left',
        upperRelatedRect,
        { branchSide: 'left', hasChildren: false, childSides: [] }
    )
`, routingContext), 200,
    '左支卡片没有子节点时，左侧关联线应使用边缘中点');
assert.equal(vm.runInContext(`
    getMindMapRelationPreferredAlong(
        relationCardRect,
        'right',
        upperRelatedRect,
        { branchSide: 'left', hasChildren: false, childSides: [] }
    )
`, routingContext), 150,
    '左支卡片的右侧父连线应与右支规则水平镜像');
assert.equal(vm.runInContext(`
    getMindMapRelationPreferredAlong(
        relationCardRect,
        'left',
        upperRelatedRect,
        { branchSide: 'left', hasChildren: true, childSides: [] }
    )
`, routingContext), 150,
    '左支卡片有子节点时，左侧子连线端点应按镜像规则避让');

routingContext.compactRelationCardRect = {
    left: 0, right: 120, top: 0, bottom: 46, width: 120, height: 46
};
const compactQuarterPort = vm.runInContext(`
    getMindMapRelationPort(compactRelationCardRect, 'right', 0, 18, 11.5)
`, routingContext);
assert.equal(compactQuarterPort.port.y, 11.5,
    '矮卡片的四分位端点也应保持精确，不能被固定边距推回中间');

const independentPorts = vm.runInContext(`
    getMindMapRelationSideCandidates(
        relationCardRect,
        upperRelatedRect,
        new Set(),
        new Set(),
        { branchSide: 'right', hasChildren: true, childSides: [] },
        { branchSide: 'right', hasChildren: false, childSides: [] }
    ).find(candidate => candidate.sourceSide === 'right'
        && candidate.targetSide === 'left'
        && candidate.sourcePort.preferred
        && candidate.targetPort.preferred)
`, routingContext);
assert.equal(independentPorts.sourcePort.port.y, 150,
    '关联线起点应根据目标位置独立选取上四分位');
assert.equal(independentPorts.targetPort.port.y, 55,
    '关联线终点应根据源卡片位置独立选取下四分位');
const sourceClearance = Math.abs(
    centeredMixedCandidate.sourcePort.routePoint.x - centeredMixedCandidate.sourcePort.port.x
) + Math.abs(
    centeredMixedCandidate.sourcePort.routePoint.y - centeredMixedCandidate.sourcePort.port.y
);
const targetApproach = Math.abs(
    centeredMixedCandidate.targetPort.routePoint.x - centeredMixedCandidate.targetPort.port.x
) + Math.abs(
    centeredMixedCandidate.targetPort.routePoint.y - centeredMixedCandidate.targetPort.port.y
);
assert.equal(sourceClearance, 28,
    '关联线离开源卡片时应保留独立的短直线段');
assert.equal(targetApproach, 48,
    '箭头进入目标卡片前应保留足够长的直线进场段');

routingContext.lowerSourceRect = {
    id: 'lower-source', left: 18, right: 400, top: 438, bottom: 722, width: 382, height: 284
};
routingContext.upperTargetRect = {
    id: 'upper-target', left: 130, right: 315, top: 28, bottom: 203, width: 185, height: 175
};
const lowerToUpperRightCandidates = vm.runInContext(`
    getMindMapRelationSideCandidates(
        lowerSourceRect,
        upperTargetRect,
        new Set(['left', 'right', 'top']),
        new Set(['left', 'top', 'bottom']),
        null,
        { branchSide: 'right', hasChildren: true, childSides: [] }
    ).filter(candidate => candidate.sourceSide === 'bottom' && candidate.targetSide === 'right')
`, routingContext);
assert.ok(lowerToUpperRightCandidates.some(candidate => candidate.targetPort.port.y > 150),
    '下方卡片连向上方卡片右侧时，应有右侧偏下的更近端点进入精确寻路');
assert.ok(lowerToUpperRightCandidates.length <= 4,
    '每组侧边组合应限制精确寻路数量，避免端点扩展导致性能失控');

vm.runInContext(`
    getMindMapRelationReservedSides = nodeId => nodeId === 'lower-source'
        ? new Set(['left', 'right', 'top'])
        : new Set(['left', 'top', 'bottom']);
    getMindMapRelationPortContext = nodeId => nodeId === 'upper-target'
        ? { branchSide: 'right', hasChildren: true, childSides: [] }
        : null;
`, routingContext);
const adaptiveEndpointRoute = vm.runInContext(`
    routeMindMapRelation(lowerSourceRect, upperTargetRect, [], [])
`, routingContext);
assert.equal(adaptiveEndpointRoute.sourceSide, 'bottom',
    '当其他起点侧被树结构保留时，应从源卡片底边引出关联线');
assert.equal(adaptiveEndpointRoute.targetSide, 'left',
    '父线占用左侧中点时，仍应允许从更近的左侧四分位端口进入');
assert.ok(adaptiveEndpointRoute.points.at(-1).y > 150,
    '精确避障评分应最终选中左侧偏下且未被父线占用的端点');

vm.runInContext(`
    getMindMapRelationPortContext = nodeId => nodeId === 'upper-target'
        ? { branchSide: 'right', hasChildren: false, childSides: [] }
        : null;
`, routingContext);
const leafEndpointRoute = vm.runInContext(`
    routeMindMapRelation(lowerSourceRect, upperTargetRect, [], [])
`, routingContext);
assert.equal(leafEndpointRoute.targetSide, 'right',
    '无子节点卡片应优先使用未被父线占用的外侧端口');
assert.equal(leafEndpointRoute.points.at(-1).y, 115.5,
    '无子节点卡片的外侧关联线应落在右侧中心');

routingContext.foldTargetRect = {
    id: 'fold-target', left: 0, right: 160, top: 100, bottom: 300, width: 160, height: 200
};
routingContext.foldSourceRect = {
    id: 'fold-source', left: 300, right: 460, top: 150, bottom: 250, width: 160, height: 100
};
routingContext.foldCenterObstacle = vm.runInContext(`
    expandMindMapRelationObstacle({
        id: 'fold-button:fold-target:0', left: 166, right: 182, top: 192, bottom: 208
    }, MINDMAP_RELATION_FOLD_BUTTON_PADDING)
`, routingContext);
routingContext.foldTerminalObstacles = vm.runInContext(`[
    expandMindMapRelationObstacle(foldTargetRect),
    expandMindMapRelationObstacle(foldSourceRect),
    foldCenterObstacle
]`, routingContext);
const unobstructedFoldCandidates = vm.runInContext(`
    getMindMapRelationSideCandidates(
        foldSourceRect,
        foldTargetRect,
        new Set(['right', 'top', 'bottom']),
        new Set(['left', 'top', 'bottom']),
        null,
        { branchSide: 'right', hasChildren: true, childSides: [] },
        foldTerminalObstacles
    ).filter(candidate => candidate.sourceSide === 'left' && candidate.targetSide === 'right')
`, routingContext);
assert.equal(unobstructedFoldCandidates.some(candidate => candidate.targetPort.port.y === 200), false,
    '折叠按钮占用右侧中心时，中心端点应在精确寻路前被淘汰');
assert.ok(unobstructedFoldCandidates.some(candidate => candidate.targetPort.port.y === 150 || candidate.targetPort.port.y === 250),
    '中心端点被折叠按钮占用后，未被遮挡的四分位端点仍应参与候选');

vm.runInContext(`
    getMindMapRelationReservedSides = nodeId => nodeId === 'fold-source'
        ? new Set(['right', 'top', 'bottom'])
        : new Set(['left', 'top', 'bottom']);
    getMindMapRelationPortContext = nodeId => nodeId === 'fold-target'
        ? { branchSide: 'right', hasChildren: true, childSides: [] }
        : null;
`, routingContext);
const foldSafeEndpointRoute = vm.runInContext(`
    routeMindMapRelation(foldSourceRect, foldTargetRect, foldTerminalObstacles, [])
`, routingContext);
assert.ok(foldSafeEndpointRoute, '折叠按钮挡住中心端点时仍应找到其他合法路线');
assert.notEqual(foldSafeEndpointRoute.points.at(-1).y, 200,
    '完整关联线不得从折叠按钮所在的中心端点进入');
routingContext.foldSafeEndpointRoute = foldSafeEndpointRoute;
assert.equal(vm.runInContext(`
    getMindMapRelationSegments(foldSafeEndpointRoute.points)
        .every(segment => isMindMapRelationSegmentClear(segment.from, segment.to, [foldCenterObstacle]))
`, routingContext), true, '包含最后进场段的完整关联线都应避开折叠按钮');

routingContext.diagonalLowerSourceRect = {
    id: 'diagonal-lower-source', left: 462, right: 562, top: 374, bottom: 455, width: 100, height: 81
};
routingContext.diagonalUpperTargetRect = {
    id: 'diagonal-upper-target', left: 0, right: 197, top: 0, bottom: 115, width: 197, height: 115
};
routingContext.diagonalSourceColumnObstacle = {
    id: 'diagonal-source-column', left: 500, right: 524, top: 180, bottom: 300
};
vm.runInContext(`
    getMindMapRelationReservedSides = () => new Set(['left']);
    getMindMapRelationPortContext = nodeId => nodeId === 'diagonal-upper-target'
        ? { branchSide: 'right', hasChildren: true, childSides: [] }
        : { branchSide: 'right', hasChildren: false, childSides: [] };
`, routingContext);
const diagonalBottomRoute = vm.runInContext(`
    routeMindMapRelation(
        diagonalLowerSourceRect,
        diagonalUpperTargetRect,
        [diagonalSourceColumnObstacle],
        []
    )
`, routingContext);
assert.equal(diagonalBottomRoute.sourceSide, 'top',
    '右下方来源卡片应从上边中点引出关联线');
assert.equal(diagonalBottomRoute.targetSide, 'bottom',
    '右边进场需要额外终点折角时，应改从上方目标卡片底边进入');
assert.equal(diagonalBottomRoute.points[0].x, 512,
    '上边连接点必须保持在来源卡片中点');
assert.equal(diagonalBottomRoute.points.at(-1).x, 98.5,
    '底边连接点必须保持在目标卡片中点');

routingContext.occupiedRightSourceRect = {
    id: 'occupied-right-source', left: 0, right: 133, top: 0, bottom: 81, width: 133, height: 81
};
routingContext.freeTopTargetRect = {
    id: 'free-top-target', left: 731, right: 864, top: 264, bottom: 379, width: 133, height: 115
};
vm.runInContext(`
    getMindMapRelationReservedSides = () => new Set(['left']);
    getMindMapRelationPortContext = nodeId => nodeId === 'occupied-right-source'
        ? { branchSide: 'right', hasChildren: true, childSides: [] }
        : { branchSide: 'right', hasChildren: false, childSides: [] };
`, routingContext);
const occupiedSourceBottomRoute = vm.runInContext(`
    routeMindMapRelation(occupiedRightSourceRect, freeTopTargetRect, [], [])
`, routingContext);
assert.equal(occupiedSourceBottomRoute.sourceSide, 'bottom',
    '来源右侧已有子树连接时，应优先从空闲的底边中点出线');
assert.equal(occupiedSourceBottomRoute.targetSide, 'top',
    '右下方目标卡片应从空闲的上边中点接入');
assert.equal(occupiedSourceBottomRoute.points[0].x, 66.5,
    '来源底边连接点必须保持在卡片中点');
assert.equal(occupiedSourceBottomRoute.points.at(-1).x, 797.5,
    '目标上边连接点必须保持在卡片中点');

routingContext.internalSourceRect = {
    id: 'internal-source', left: 983, right: 1399, top: 357, bottom: 539, width: 416, height: 182
};
routingContext.internalTargetRect = {
    id: 'internal-target', left: 20, right: 327, top: 566, bottom: 751, width: 307, height: 185
};
routingContext.internalRouteObstacles = vm.runInContext(`[
    expandMindMapRelationObstacle(internalSourceRect),
    expandMindMapRelationObstacle(internalTargetRect),
    expandMindMapRelationObstacle({
        id: 'target-child', left: 446, right: 864, top: 566, bottom: 751
    }),
    expandMindMapRelationObstacle({
        id: 'source-upper-sibling', left: 983, right: 1399, top: 113, bottom: 294
    }),
    expandMindMapRelationObstacle({
        id: 'source-lower-sibling', left: 983, right: 1325, top: 604, bottom: 786
    })
]`, routingContext);
vm.runInContext(`
    getMindMapRelationReservedSides = () => new Set(['left']);
    getMindMapRelationPortContext = () => ({
        branchSide: 'right', hasChildren: true, childSides: []
    });
`, routingContext);
const internalParentQuarterRoute = vm.runInContext(`
    routeMindMapRelation(
        internalSourceRect,
        internalTargetRect,
        internalRouteObstacles,
        []
    )
`, routingContext);
assert.equal(internalParentQuarterRoute.sourceSide, 'left',
    '内部节点父线只占侧边中点时，应允许从更优的左侧四分位端口出线');
assert.equal(internalParentQuarterRoute.points[0].y, 493.5,
    '左侧连接点应选择避开父线中点且更接近目标的自上而下四分之三位置');
assert.equal(internalParentQuarterRoute.targetSide, 'top',
    '左下方目标卡片应从上边中点接入');
assert.equal(internalParentQuarterRoute.points.at(-1).x, 173.5,
    '目标上边连接点必须保持在卡片中点');

routingContext.openUpperSourceRect = {
    id: 'open-upper-source', left: 44, right: 180, top: 20, bottom: 138, width: 136, height: 118
};
routingContext.openLowerTargetRect = {
    id: 'open-lower-target', left: 1224, right: 1448, top: 914, bottom: 1029, width: 224, height: 115
};
routingContext.openVerticalObstacles = vm.runInContext(`[
    expandMindMapRelationObstacle(openUpperSourceRect),
    expandMindMapRelationObstacle(openLowerTargetRect)
]`, routingContext);
const openVerticalRoute = vm.runInContext(`
    routeMindMapRelation(
        openUpperSourceRect,
        openLowerTargetRect,
        openVerticalObstacles,
        []
    )
`, routingContext);
assert.equal(openVerticalRoute.sourceSide, 'bottom',
    '上方来源卡片存在开阔通道时，应从底边中点出线');
assert.equal(openVerticalRoute.targetSide, 'top',
    '顶边路线只比侧边路线多一个常规转弯时，应优先进入下方卡片顶边中点');
assert.equal(openVerticalRoute.points[0].x, 112,
    '来源底边连接点必须保持在卡片中点');
assert.equal(openVerticalRoute.points.at(-1).x, 1336,
    '目标顶边连接点必须保持在卡片中点');

routingContext.snakeSourceRect = {
    id: 'snake-source', left: 974, right: 1130, top: 160, bottom: 284, width: 156, height: 124
};
routingContext.snakeTargetRect = {
    id: 'snake-target', left: 245, right: 528, top: 759, bottom: 874, width: 283, height: 115
};
routingContext.snakeObstacles = vm.runInContext(`[
    expandMindMapRelationObstacle(snakeSourceRect),
    expandMindMapRelationObstacle(snakeTargetRect),
    expandMindMapRelationObstacle({ id: 'upper-card', left: 560, right: 716, top: 0, bottom: 120 }),
    expandMindMapRelationObstacle({ id: 'source-parent', left: 610, right: 894, top: 231, bottom: 356 }),
    expandMindMapRelationObstacle({ id: 'source-sibling', left: 974, right: 1130, top: 303, bottom: 427 }),
    expandMindMapRelationObstacle({ id: 'source-lower-aunt', left: 610, right: 766, top: 453, bottom: 577 }),
    expandMindMapRelationObstacle({ id: 'target-parent', left: 610, right: 870, top: 693, bottom: 816 }),
    expandMindMapRelationObstacle({ id: 'target-cousin', left: 948, right: 1105, top: 620, bottom: 758 })
]`, routingContext);
vm.runInContext(`
    getMindMapRelationReservedSides = () => new Set(['left']);
    getMindMapRelationPortContext = nodeId => nodeId === 'snake-source'
        ? { branchSide: 'right', hasChildren: false, childSides: [] }
        : { branchSide: 'right', hasChildren: true, childSides: [] };
`, routingContext);
const snakeAvoidanceRoute = vm.runInContext(`
    routeMindMapRelation(snakeSourceRect, snakeTargetRect, snakeObstacles, [])
`, routingContext);
assert.equal(snakeAvoidanceRoute.sourceSide, 'right',
    '顶边方案因障碍增加额外折角时，叶节点应改从开阔的右侧中心出线');
assert.equal(snakeAvoidanceRoute.targetSide, 'top',
    '下方目标卡片仍应从上边中点接入');
assert.equal(snakeAvoidanceRoute.points[0].y, 222,
    '叶节点右侧连接点必须保持在卡片中点');
assert.equal(snakeAvoidanceRoute.points.at(-1).x, 386.5,
    '目标上边连接点必须保持在卡片中点');
assert.equal(vm.runInContext(`
    getMindMapRelationTurnCount(${JSON.stringify(snakeAvoidanceRoute.points)})
`, routingContext), 3, '应选择三折角开阔路线，避免顶边方案产生额外蛇形折返');

routingContext.multiPortRelations = [
    { id: 'multi-upper', sourceId: 'multi-source', targetId: 'multi-target-upper' },
    { id: 'multi-middle', sourceId: 'multi-source', targetId: 'multi-target-middle' },
    { id: 'multi-lower', sourceId: 'multi-source', targetId: 'multi-target-lower' },
];
routingContext.multiPortCardRects = new Map([
    ['multi-source', {
        id: 'multi-source', left: 0, right: 160, top: 100, bottom: 300, width: 160, height: 200
    }],
    ['multi-target-upper', {
        id: 'multi-target-upper', left: 400, right: 560, top: -100, bottom: 0, width: 160, height: 100
    }],
    ['multi-target-middle', {
        id: 'multi-target-middle', left: 400, right: 560, top: 180, bottom: 280, width: 160, height: 100
    }],
    ['multi-target-lower', {
        id: 'multi-target-lower', left: 400, right: 560, top: 500, bottom: 600, width: 160, height: 100
    }],
]);
routingContext.multiPortNaturalRoutes = new Map(routingContext.multiPortRelations.map(relation => [
    relation.id,
    { sourceSide: 'right', targetSide: 'left' },
]));
vm.runInContext(`
    getMindMapRelationDirection = relation => relation.direction || 'none';
    getMindMapRelationReservedSides = nodeId => nodeId === 'multi-source'
        ? new Set(['right'])
        : new Set();
    getMindMapRelationPortContext = () => null;
`, routingContext);
const multiPortPlan = vm.runInContext(`
    getMindMapRelationPortPlan(
        multiPortRelations,
        multiPortCardRects,
        multiPortNaturalRoutes
    )
`, routingContext);
const multiPortAssignments = multiPortPlan.assignments;
routingContext.multiPortAssignments = multiPortAssignments;
const multiPortSourceAssignments = routingContext.multiPortRelations.map(relation =>
    multiPortAssignments.get(relation.id).source
);
assert.deepEqual(multiPortSourceAssignments.map(assignment => assignment.side),
    ['right', 'right', 'right'], '同边多条关联应保持自然路线选出的连接边');
assert.ok(
    multiPortSourceAssignments[0].along < multiPortSourceAssignments[1].along
        && multiPortSourceAssignments[1].along < multiPortSourceAssignments[2].along,
    '同边端口顺序应与对端卡片的投影顺序一致，避免线路在出线后交叉',
);
assert.equal(new Set(multiPortSourceAssignments.map(assignment => assignment.along)).size, 3,
    '同边多条关联必须获得互不重叠的连接点');
assert.ok(multiPortSourceAssignments.every(assignment => Math.abs(assignment.along - 200) >= 8),
    '父子树线占用边缘中点时，批量关联端口应为结构连接点保留安全距离');
assert.deepEqual([...multiPortPlan.relationOrder],
    ['multi-middle', 'multi-upper', 'multi-lower'],
    '共享端口组应让距离卡片最近的关系先占用内侧车道');
const assignedPortCandidates = vm.runInContext(`
    getMindMapRelationPortCandidates(
        multiPortCardRects.get('multi-source'),
        'right',
        multiPortCardRects.get('multi-target-upper'),
        MINDMAP_RELATION_SOURCE_CLEARANCE,
        null,
        multiPortAssignments.get('multi-upper').source.along
    )
`, routingContext);
assert.deepEqual([...assignedPortCandidates[0].kinds], ['assigned'],
    '统一寻路时应只使用预先分配的精确端口');
assert.equal(assignedPortCandidates[0].port.y, multiPortSourceAssignments[0].along,
    '预分配端口坐标必须准确传递到最终连接点');

routingContext.nestedRelations = [
    { id: 'nested-far', sourceId: 'nested-source-far', targetId: 'nested-target' },
    { id: 'nested-near', sourceId: 'nested-source-near', targetId: 'nested-target' },
];
routingContext.nestedCardRects = new Map([
    ['nested-target', {
        id: 'nested-target', left: 0, right: 300, top: 500, bottom: 800, width: 300, height: 300
    }],
    ['nested-source-far', {
        id: 'nested-source-far', left: 500, right: 660, top: 50, bottom: 150, width: 160, height: 100
    }],
    ['nested-source-near', {
        id: 'nested-source-near', left: 500, right: 1300, top: 300, bottom: 400, width: 800, height: 100
    }],
]);
routingContext.nestedNaturalRoutes = new Map(routingContext.nestedRelations.map(relation => [
    relation.id,
    { sourceSide: 'right', targetSide: 'right' },
]));
vm.runInContext(`
    getMindMapRelationReservedSides = nodeId => nodeId === 'nested-target'
        ? new Set(['right'])
        : new Set();
    getMindMapRelationPortContext = () => null;
`, routingContext);
const nestedPortPlan = vm.runInContext(`
    getMindMapRelationPortPlan(nestedRelations, nestedCardRects, nestedNaturalRoutes)
`, routingContext);
assert.ok(
    nestedPortPlan.assignments.get('nested-near').target.along
        < nestedPortPlan.assignments.get('nested-far').target.along,
    '多个上方卡片连接同一侧时，距离较近的卡片应连接更靠上的端口',
);
assert.deepEqual([...nestedPortPlan.relationOrder], ['nested-near', 'nested-far'],
    '嵌套绕行应由近到远占用车道，避免远路线截断近路线');
routingContext.nestedPortPlan = nestedPortPlan;
routingContext.nestedObstacles = vm.runInContext(`
    [...nestedCardRects.values()].map(rect => expandMindMapRelationObstacle(rect))
`, routingContext);
const nestedNearRoute = vm.runInContext(`
    routeMindMapRelation(
        nestedCardRects.get('nested-source-near'),
        nestedCardRects.get('nested-target'),
        nestedObstacles,
        [],
        [],
        nestedPortPlan.assignments.get('nested-near')
    )
`, routingContext);
routingContext.nestedOccupiedSegments = vm.runInContext(`
    getMindMapRelationSegments(${JSON.stringify(nestedNearRoute.points)})
`, routingContext);
const nestedFarRoute = vm.runInContext(`
    routeMindMapRelation(
        nestedCardRects.get('nested-source-far'),
        nestedCardRects.get('nested-target'),
        nestedObstacles,
        nestedOccupiedSegments,
        [],
        nestedPortPlan.assignments.get('nested-far'),
        true
    )
`, routingContext);
routingContext.nestedFarRoute = nestedFarRoute;
const nestedRouteInteractionPenalty = vm.runInContext(`
    getMindMapRelationSegments(nestedFarRoute.points).reduce((sum, segment) =>
        sum + getMindMapRelationSegmentInteractionPenalty(
            segment.from,
            segment.to,
            nestedOccupiedSegments,
            [nestedFarRoute.points[0], nestedFarRoute.points.at(-1)]
        ),
    0)
`, routingContext);
assert.equal(nestedRouteInteractionPenalty, 300,
    '宽卡片封死相邻外侧车道时允许一次关系线交叉，不能为追求零交叉绕过整张宽卡片');
assert.ok(Math.max(...nestedFarRoute.points.map(point => point.x)) <= 660,
    '允许一次关系线交叉后，嵌套远线仍应留在端点附近的局部区域');

routingContext.fanoutRelations = [
    { id: 'fanout-upper', sourceId: 'fanout-source', targetId: 'fanout-target-upper' },
    { id: 'fanout-middle', sourceId: 'fanout-source', targetId: 'fanout-target-middle' },
    { id: 'fanout-lower', sourceId: 'fanout-source', targetId: 'fanout-target-lower' },
];
routingContext.fanoutCardRects = new Map([
    ['fanout-source', {
        id: 'fanout-source', left: 0, right: 160, top: 0, bottom: 300, width: 160, height: 300
    }],
    ['fanout-target-upper', {
        id: 'fanout-target-upper', left: 500, right: 660, top: -50, bottom: 50, width: 160, height: 100
    }],
    ['fanout-target-middle', {
        id: 'fanout-target-middle', left: 500, right: 660, top: 100, bottom: 200, width: 160, height: 100
    }],
    ['fanout-target-lower', {
        id: 'fanout-target-lower', left: 500, right: 660, top: 250, bottom: 350, width: 160, height: 100
    }],
]);
vm.runInContext(`
    getMindMapRelationReservedSides = nodeId => new Set([
        nodeId === 'fanout-source' ? 'left' : 'right'
    ]);
    getMindMapRelationPortContext = nodeId => ({
        branchSide: nodeId === 'fanout-source' ? 'right' : 'left',
        hasChildren: false,
        childSides: []
    });
    getMindMapRelationTreeSegments = () => [];
    getMindMapRelationRoutingKey = () => 'fanout-integration';
    getMindMapRelationRouteFoldCorridors = () => [];
    relationRouteCache = { key: '', routes: new Map() };
`, routingContext);
const fanoutRoutes = vm.runInContext(`
    buildMindMapRelationRoutes(fanoutRelations, fanoutCardRects)
`, routingContext);
const fanoutRouteList = routingContext.fanoutRelations.map(relation => fanoutRoutes.get(relation.id));
assert.ok(fanoutRouteList.every(route => route?.sourceSide === 'right'),
    '同一来源的右侧关系应保持自然路线选出的连接边');
const fanoutStartYs = fanoutRouteList.map(route => route.points[0].y);
assert.equal(new Set(fanoutStartYs).size, 3,
    '批量端口分配后，最终避障路线必须从三个独立端点出线');
assert.deepEqual(fanoutStartYs, [75, 150, 225],
    '不考虑圆角限制时，三个连接点应位于卡片完整边长的四等分位置');
assert.ok(fanoutStartYs[0] < fanoutStartYs[1] && fanoutStartYs[1] < fanoutStartYs[2],
    '最终连接点顺序应与上、中、下三个对端卡片保持一致');

routingContext.staggeredFanInRelations = [
    { id: 'fanin-far', sourceId: 'fanin-source-far', targetId: 'fanin-target' },
    { id: 'fanin-near', sourceId: 'fanin-source-near', targetId: 'fanin-target' },
];
routingContext.staggeredFanInCardRects = new Map([
    ['fanin-source-far', {
        id: 'fanin-source-far', left: 320, right: 895, top: 105, bottom: 197, width: 575, height: 92
    }],
    ['fanin-source-near', {
        id: 'fanin-source-near', left: 320, right: 1134, top: 222, bottom: 313, width: 814, height: 91
    }],
    ['fanin-target', {
        id: 'fanin-target', left: 25, right: 688, top: 468, bottom: 560, width: 663, height: 92
    }],
    ['fanin-blocker-above', {
        id: 'fanin-blocker-above', left: 320, right: 1500, top: 0, bottom: 80, width: 1180, height: 80
    }],
    ['fanin-blocker-middle', {
        id: 'fanin-blocker-middle', left: 320, right: 1000, top: 340, bottom: 432, width: 680, height: 92
    }],
    ['fanin-blocker-below', {
        id: 'fanin-blocker-below', left: 25, right: 920, top: 586, bottom: 678, width: 895, height: 92
    }],
]);
vm.runInContext(`
    getMindMapRelationReservedSides = () => new Set(['left']);
    getMindMapRelationPortContext = () => ({ branchSide: 'right', hasChildren: false });
    getMindMapRelationTreeSegments = () => [];
    getMindMapRelationRoutingKey = () => 'staggered-fanin-integration';
    getMindMapRelationRouteFoldCorridors = () => [];
    relationRouteCache = { key: '', routes: new Map() };
`, routingContext);
const staggeredFanInRoutes = vm.runInContext(`
    buildMindMapRelationRoutes(staggeredFanInRelations, staggeredFanInCardRects)
`, routingContext);
const staggeredFanInRouteList = routingContext.staggeredFanInRelations.map(relation =>
    staggeredFanInRoutes.get(relation.id)
);
assert.ok(staggeredFanInRouteList.every(route => route?.sourceSide === 'right' && route?.targetSide === 'right'),
    '宽度不同的上方来源卡片应保持从右侧连接目标右侧，不能因另一条关系占道而切换到左侧');
assert.ok(staggeredFanInRouteList.every(route => route.points.every(point => point.x >= 688)),
    '同目标的嵌套关系应在卡片右侧完成分流，不能绕过整棵树的左侧');
assert.ok(staggeredFanInRouteList.every(route =>
    Math.max(...route.points.map(point => point.x)) <= 1200
), '右侧嵌套分流应使用来源卡片附近的相邻车道，不能绕到远处空白区域');
routingContext.staggeredFanInFirstSegments = vm.runInContext(`
    getMindMapRelationSegments(${JSON.stringify(staggeredFanInRouteList[0].points)})
`, routingContext);
routingContext.staggeredFanInSecondRoute = staggeredFanInRouteList[1];
const staggeredFanInInteractionPenalty = vm.runInContext(`
    getMindMapRelationSegments(staggeredFanInSecondRoute.points).reduce((sum, segment) =>
        sum + getMindMapRelationSegmentInteractionPenalty(
            segment.from,
            segment.to,
            staggeredFanInFirstSegments,
            [staggeredFanInSecondRoute.points[0], staggeredFanInSecondRoute.points.at(-1)]
        ),
    0)
`, routingContext);
assert.equal(staggeredFanInInteractionPenalty, 0,
    '右侧嵌套分流后的两条关系线不应产生交叉或重叠');

routingContext.wideSiblingSourceRect = {
    id: 'wide-sibling-source', left: 121, right: 584, top: 217, bottom: 294, width: 463, height: 77
};
routingContext.wideSiblingTargetRect = {
    id: 'wide-sibling-target', left: -100, right: 415, top: 507, bottom: 594, width: 515, height: 87
};
routingContext.wideSiblingObstacles = vm.runInContext(`[
    expandMindMapRelationObstacle(wideSiblingSourceRect),
    expandMindMapRelationObstacle(wideSiblingTargetRect),
    expandMindMapRelationObstacle({
        id: 'unrelated-wide-sibling', left: 121, right: 1098, top: 122, bottom: 205
    }),
    expandMindMapRelationObstacle({
        id: 'middle-sibling', left: 121, right: 775, top: 311, bottom: 389
    }),
    expandMindMapRelationObstacle({
        id: 'lower-sibling', left: 121, right: 647, top: 406, bottom: 485
    }),
    expandMindMapRelationObstacle({
        id: 'lower-target', left: -100, right: 605, top: 603, bottom: 677
    })
]`, routingContext);
routingContext.wideSiblingOccupiedSegments = [
    { from: { x: 775, y: 350 }, to: { x: 803, y: 350 } },
    { from: { x: 803, y: 350 }, to: { x: 803, y: 620 } },
    { from: { x: 803, y: 620 }, to: { x: 463, y: 620 } },
    { from: { x: 463, y: 620 }, to: { x: 463, y: 550 } },
    { from: { x: 463, y: 550 }, to: { x: 415, y: 550 } },
];
vm.runInContext(`
    getMindMapRelationReservedSides = nodeId => new Set([
        nodeId === 'wide-sibling-source' ? 'left' : 'right'
    ]);
    getMindMapRelationPortContext = nodeId => ({
        branchSide: nodeId === 'wide-sibling-source' ? 'right' : 'left',
        hasChildren: false,
        childSides: []
    });
`, routingContext);
const wideSiblingRoute = vm.runInContext(`
    routeMindMapRelation(
        wideSiblingSourceRect,
        wideSiblingTargetRect,
        wideSiblingObstacles,
        wideSiblingOccupiedSegments
    )
`, routingContext);
assert.ok(wideSiblingRoute, '宽兄弟卡片存在时仍应找到局部关联路线');
assert.equal(wideSiblingRoute.sourceSide, 'right',
    '局部窗口应扩展到中间阻挡卡片之外，不得迫使关联线改走父节点一侧');
const wideSiblingLocalRightLimit = vm.runInContext(`
    775 + MINDMAP_RELATION_ROUTING_PADDING + MINDMAP_RELATION_LANE_GAP
`, routingContext);
assert.ok(
    Math.max(...wideSiblingRoute.points.map(point => point.x))
        <= wideSiblingLocalRightLimit,
    '关联线只应绕过源目标之间的阻挡卡片，不得采用上方超宽兄弟的远端边界',
);

// SECTION 寻路几何复用
const routingCacheChecks = vm.runInContext(`
    (() => {
        const segments = [
            { from: { x: -30, y: 0 }, to: { x: 90, y: 0 }, kind: 'tree' },
            { from: { x: 90, y: 0 }, to: { x: -30, y: 0 }, kind: 'tree' },
            { from: { x: 20, y: -40 }, to: { x: 20, y: 80 }, kind: 'tree' },
            { from: { x: 20, y: -40 }, to: { x: 20, y: 80 }, kind: 'relation' },
            { from: { x: -30, y: 9.9 }, to: { x: 90, y: 9.9 } },
            { from: { x: -30, y: 10 }, to: { x: 90, y: 10 } },
            { from: { x: 30, y: 80 }, to: { x: 30, y: -40 } },
        ];
        const selectSegments = createMindMapRelationSegmentIndex(segments);
        const scores = [];
        for (const coordinate of [-40.1, -40, -9.9, -0.1, 0, 0.1, 9.9, 10, 20, 30, 80, 80.1, 200]) {
            for (const horizontal of [true, false]) {
                for (const reverse of [false, true]) {
                    const ends = horizontal
                        ? [{ x: -30, y: coordinate }, { x: 90, y: coordinate }]
                        : [{ x: coordinate, y: -40 }, { x: coordinate, y: 80 }];
                    if (reverse) ends.reverse();
                    const selected = selectSegments(horizontal, coordinate);
                    scores.push([
                        getMindMapRelationSegmentInteractionPenalty(...ends, segments, ends),
                        getMindMapRelationSegmentInteractionPenalty(...ends, selected, ends),
                    ]);
                }
            }
        }
        const originalPenalty = getMindMapRelationSegmentInteractionPenalty;
        const visitedEdges = new Set();
        let repeatedScores = 0;
        getMindMapRelationSegmentInteractionPenalty = (from, to, ...args) => {
            const key = [from.x, from.y, to.x, to.y].join(',');
            if (visitedEdges.has(key)) repeatedScores++;
            visitedEdges.add(key);
            return originalPenalty(from, to, ...args);
        };
        let route;
        try {
            route = findMindMapOrthogonalRoute(
                { x: 0, y: 0 }, { x: 400, y: 0 },
                [{ left: 150, right: 250, top: -50, bottom: 50 }],
                segments
            );
        } finally {
            getMindMapRelationSegmentInteractionPenalty = originalPenalty;
        }
        const zeroKeyRoute = findMindMapOrthogonalRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
        const samePointRoute = findMindMapOrthogonalRoute({ x: 0, y: 0 }, { x: 0, y: 0 }, []);
        const changedGeometryRoute = findMindMapOrthogonalRoute(
            { x: 0, y: 0 }, { x: 400, y: 0 }, [], []
        );
        return { scores, route, repeatedScores, visitedCount: visitedEdges.size, zeroKeyRoute, samePointRoute, changedGeometryRoute };
    })()
`, routingContext);
for (const [fullScore, indexedScore] of routingCacheChecks.scores) {
    assert.equal(indexedScore, fullScore, '按行列筛选不得改变安全间距、端点或重复树线的评分');
}
assert.ok(routingCacheChecks.route, '缓存几何评分后仍应成功绕开障碍');
assert.ok(routingCacheChecks.visitedCount > 0, '应实际执行几何边评分');
assert.equal(routingCacheChecks.repeatedScores, 0, '同次寻路中每条有向几何边只能评分一次');
assert.deepEqual(JSON.parse(JSON.stringify(routingCacheChecks.zeroKeyRoute)), {
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], cost: 100,
}, '编号为零的起点不得在路径还原时丢失');
assert.deepEqual(JSON.parse(JSON.stringify(routingCacheChecks.samePointRoute)), {
    points: [{ x: 0, y: 0 }], cost: 0,
}, '起终点重合时应正确还原单点路径');
assert.deepEqual(JSON.parse(JSON.stringify(routingCacheChecks.changedGeometryRoute)), {
    points: [{ x: 0, y: 0 }, { x: 400, y: 0 }], cost: 400,
}, '新一轮寻路不得复用旧障碍或旧占用线段的边评分');
// !SECTION 寻路几何复用

// SECTION 分批寻路与失效任务
let sliceClock = 0;
let sliceYields = 0;
let anotherTaskRan = false;
routingContext.performance = { now: () => ++sliceClock };
routingContext.setTimeout = callback => {
    sliceYields++;
    return setTimeout(callback, 0);
};
vm.runInContext(`
    getMindMapRelationReservedSides = nodeId => new Set([nodeId === 'fanout-source' ? 'left' : 'right']);
    getMindMapRelationPortContext = nodeId => ({
        branchSide: nodeId === 'fanout-source' ? 'right' : 'left', hasChildren: false, childSides: []
    });
    getMindMapRelationRoutingKey = () => 'sliced-integration';
    relationRouteCache = { key: '', routes: new Map() };
`, routingContext);
const synchronousRoutes = vm.runInContext(`buildMindMapRelationRoutes(fanoutRelations, fanoutCardRects)`, routingContext);
vm.runInContext(`relationRouteCache = { key: '', routes: new Map() };`, routingContext);
setTimeout(() => { anotherTaskRan = true; }, 0);
const slicedRoutes = await vm.runInContext(`
    buildMindMapRelationRoutesAsync(fanoutRelations, fanoutCardRects, [], [], () => true)
`, routingContext);
assert.deepEqual(JSON.parse(JSON.stringify([...slicedRoutes])), JSON.parse(JSON.stringify([...synchronousRoutes])),
    '分批暂停和恢复不得改变端口规划、路线、评分及路线顺序');
assert.ok(sliceYields > 0, '复杂路线必须真实让出执行权');
assert.equal(anotherTaskRan, true, '寻路完成之前应允许事件循环执行其他任务');

let routingJobCurrent = true;
let stoppedIterator = false;
routingContext.isRoutingJobCurrent = () => routingJobCurrent;
routingContext.markIteratorStopped = () => { stoppedIterator = true; };
vm.runInContext(`relationRouteCache = { key: '', routes: new Map() };`, routingContext);
setTimeout(() => { routingJobCurrent = false; }, 0);
const cancelledRoutes = await vm.runInContext(`
    runMindMapRelationRoutingInSlices((function* () {
        try { return yield* buildMindMapRelationRoutesSteps(fanoutRelations, fanoutCardRects); }
        finally { markIteratorStopped(); }
    })(), isRoutingJobCurrent)
`, routingContext);
assert.equal(cancelledRoutes, null, '新布局出现时应停止尚未完成的旧任务');
assert.equal(stoppedIterator, true, '停止旧任务时应关闭迭代器并释放寻路状态');
assert.equal(vm.runInContext('relationRouteCache.key', routingContext), '', '未完成的任务不得写入全局路由缓存');
// !SECTION 分批寻路与失效任务

console.log('卡片关联校验通过：编辑、正交避障、分流防重叠、几何复用、缓存与 Canvas 导出逻辑完整。');
