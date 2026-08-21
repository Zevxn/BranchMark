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
assert.match(mindMap, /labelElement\.textContent\s*=\s*label/,
    '关联标签应通过 textContent 安全写入 SVG');
assert.match(mindMap, /updateSelectedMindMapRelation\('direction'/,
    '方向编辑应更新关联数据并进入历史记录');
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
const appendSource = mindMap.slice(
    mindMap.indexOf('function appendMindMapRelationsToCanvas'),
    mindMap.indexOf('// #endregion', mindMap.indexOf('function appendMindMapRelationsToCanvas')),
);
assert.ok(pathSource.startsWith('function getMindMapRelationPath'), '应能提取关联曲线路径计算函数');
assert.ok(sideSource.startsWith('function getCanvasRelationSides'), '应能提取 Canvas 连接侧计算函数');
assert.ok(appendSource.startsWith('function appendMindMapRelationsToCanvas'), '应能提取 Canvas 关联导出函数');

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

console.log('卡片关联校验通过：V1 创建/删除兼容，V1.5 编辑、渲染、历史与 Canvas 导出逻辑完整。');
