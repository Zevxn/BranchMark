import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readFile('app/JS/MindMap.js', 'utf8'),
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
assert.match(mindMap, /MINDMAP_RELATION_OVERLAP_PENALTY\s*\+\s*overlap\s*\*\s*6/,
    '路由评分应惩罚同通道重叠');
assert.match(mindMap, /penalty \+= MINDMAP_RELATION_CROSSING_PENALTY/,
    '路由评分应惩罚关联线交叉');
assert.match(mindMap, /relationRouteCache\s*=\s*\{\s*key:\s*cacheKey,\s*routes\s*\}/,
    '卡片几何未变化时应复用路由，避免编辑标签时重复寻路');
assert.match(mindMap, /reservedSidePenalty\s*=\s*\(sourceReservedSides\.has\(sourceSide\)/,
    '关系端点应避开已被树结构占用的卡片侧边');
assert.match(mindMap, /function getMindMapRelationPreferredAlong\(/,
    '关联线应根据父子连线占用情况调整卡片边缘端点');
assert.match(mindMap, /document\.querySelectorAll\('\.fold-btn'\)[\s\S]*?MINDMAP_RELATION_FOLD_BUTTON_PADDING/,
    '可见折叠按钮应作为带安全间距的路由障碍');
assert.match(mindMap, /function getMindMapRelationFoldCorridors\(cardRects\)/,
    '路由应计算折叠按钮与相邻子卡片之间的几何中线');
assert.match(mindMap, /function getMindMapRelationRouteFoldCorridors\(/,
    '折叠按钮走廊应按自然路线筛选，避免影响可从其他方向通过的线路');
assert.match(mindMap, /const naturalRoute = routeMindMapRelation\([\s\S]*?\[\][\s\S]*?getMindMapRelationRouteFoldCorridors\(naturalRoute, preferredChannels\)/,
    '单条关联线应先计算无通道偏好的自然路线，再决定是否启用折叠走廊');
assert.match(mindMap, /getMindMapRelationRoutingKey\(relations, cardRects, controlObstacles, preferredChannels\)/,
    '折叠按钮位置变化后应使关系路由缓存失效');
assert.match(mindMap, /collectMindMapNodeIds\(findNode\(state\.data,id\), deletedNodeIds\)[\s\S]*?removeMindMapRelationsForNodes\(deletedNodeIds\)/,
    '删除卡片或子树时应同步清理相关关联');
assert.match(mindMap, /if \(!sourceCard \|\| !targetCard\) return;/,
    '任一端因折叠不可见时不应绘制关联线');
assert.equal((mindMap.match(/appendMindMapRelationsToCanvas\(nodes, edges\);/g) || []).length, 2,
    '横向和竖向 Canvas 导出都应追加卡片关联边');

const pathSource = mindMap.slice(
    mindMap.indexOf('function getMindMapRelationPath'),
    mindMap.indexOf('function renderMindMapRelations'),
);
const sideSource = mindMap.slice(
    mindMap.indexOf('function getCanvasRelationSides'),
    mindMap.indexOf('function appendMindMapRelationsToCanvas'),
);
const routingSource = mindMap.slice(
    mindMap.indexOf('function expandMindMapRelationObstacle'),
    mindMap.indexOf('function renderMindMapRelations'),
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
    const MINDMAP_RELATION_CROSSING_PENALTY = 420;
    const MINDMAP_RELATION_OVERLAP_PENALTY = 720;
    const MINDMAP_RELATION_RESERVED_SIDE_PENALTY = 1200;
    const MINDMAP_RELATION_ROUTE_CANDIDATES = 12;
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
assert.equal(adaptiveEndpointRoute.targetSide, 'right',
    '当其他终点侧被树结构保留时，应从目标卡片右侧进入');
assert.ok(adaptiveEndpointRoute.points.at(-1).y > 150,
    '精确避障评分应最终选中比右侧中心更靠近下方卡片的端点');

vm.runInContext(`
    getMindMapRelationPortContext = nodeId => nodeId === 'upper-target'
        ? { branchSide: 'right', hasChildren: false, childSides: [] }
        : null;
`, routingContext);
const leafEndpointRoute = vm.runInContext(`
    routeMindMapRelation(lowerSourceRect, upperTargetRect, [], [])
`, routingContext);
assert.equal(leafEndpointRoute.targetSide, 'right',
    '无子节点卡片的右侧仍应可作为关联线终点侧');
assert.equal(leafEndpointRoute.points.at(-1).y, 115.5,
    '无子节点卡片的最终关联线必须落在右侧中心');

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

console.log('卡片关联校验通过：编辑、正交避障、分流防重叠、缓存与 Canvas 导出逻辑完整。');
