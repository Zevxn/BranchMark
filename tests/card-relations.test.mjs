import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readFile('app/JS/MindMap.js', 'utf8'),
]);

assert.match(html, /id=["']btn-add-relation["'][^>]*disabled/,
    '工具栏应提供默认禁用的建立关联按钮');
assert.match(html, /<svg[^>]*id=["']relation-layer["']/,
    '画布变换层中应包含 SVG 关联线图层');
assert.match(html, /\.relation-hit\s*\{[^}]*pointer-events:\s*stroke/s,
    '关联线应使用透明宽描边提供稳定的点击区域');
assert.match(html, /\.relation-group\.selected \.relation-line/,
    '选中的关联线应有明确视觉状态');
assert.match(html, /id=["']relationEditor["'][\s\S]*?id=["']relationLabelInput["']/,
    '点击关联后应提供可编辑标签的紧凑面板');
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
assert.match(mindMap, /document\.querySelectorAll\('\.fold-btn'\)[\s\S]*?MINDMAP_RELATION_FOLD_BUTTON_PADDING/,
    '可见折叠按钮应作为带安全间距的路由障碍');
assert.match(mindMap, /function getMindMapRelationFoldCorridors\(cardRects\)/,
    '路由应计算折叠按钮与相邻子卡片之间的几何中线');
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

routingContext.alignedSourceRect = {
    id: 'upper', left: 20, right: 170, top: 0, bottom: 140, width: 150, height: 140
};
routingContext.alignedTargetRect = {
    id: 'lower', left: 10, right: 330, top: 500, bottom: 660, width: 320, height: 160
};
const alignedCandidate = vm.runInContext(`
    getMindMapRelationSideCandidates(alignedSourceRect, alignedTargetRect)
        .find(candidate => candidate.sourceSide === 'bottom' && candidate.targetSide === 'top')
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
        .find(candidate => candidate.sourceSide === 'right' && candidate.targetSide === 'top')
`, routingContext);
assert.equal(centeredMixedCandidate.sourcePort.port.y, 50,
    '无法共线的混合方向连接应优先使用源卡片边中心');
assert.equal(centeredMixedCandidate.targetPort.port.x, 250,
    '无法共线的混合方向连接应优先使用目标卡片边中心');
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

console.log('卡片关联校验通过：编辑、正交避障、分流防重叠、缓存与 Canvas 导出逻辑完整。');
