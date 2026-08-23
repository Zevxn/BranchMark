import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readFile('app/JS/MindMap.js', 'utf8'),
]);

assert.match(html, /\.node-stats\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?left:\s*14px;[\s\S]*?bottom:\s*14px;/,
    '节点统计应固定显示在画布左下角');
assert.match(html, /\.node-stats\s*\{[\s\S]*?pointer-events:\s*none;/,
    '节点统计不应遮挡画布交互');
assert.match(html, /id="nodeStats"[\s\S]*?id="nodeStatsTotal"[\s\S]*?id="nodeStatsChildren"[\s\S]*?id="nodeStatsSiblings"/,
    '节点统计应提供总节点、直接子节点和兄弟节点三个简洁字段');
assert.match(mindMap, /function updateToolbar\(\)[\s\S]*?updateMindMapNodeStats\(\);/,
    '选择状态刷新时应同步刷新节点统计');
assert.match(mindMap, /function updateChildrenDOM\(nodeId\)[\s\S]*?updateMindMapNodeStats\(\);/,
    '节点局部增删后应同步刷新节点统计');

const statsSource = mindMap.slice(
    mindMap.indexOf('function getMindMapNodeStats'),
    mindMap.indexOf('function updateMindMapNodeStats'),
);
assert.ok(statsSource.startsWith('function getMindMapNodeStats'), '应能提取节点统计函数');

const tree = {
    id: 'root',
    children: [
        { id: 'a', children: [{ id: 'a-1', children: [] }, { id: 'a-2', children: [] }] },
        { id: 'b', children: [] },
    ],
};

function findNode(root, id) {
    if (root.id === id) return root;
    for (const child of root.children || []) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
}

function findParent(root, id) {
    for (const child of root.children || []) {
        if (child.id === id) return root;
        const found = findParent(child, id);
        if (found) return found;
    }
    return null;
}

function collectMindMapNodeIds(node, ids = new Set()) {
    ids.add(node.id);
    (node.children || []).forEach(child => collectMindMapNodeIds(child, ids));
    return ids;
}

const context = vm.createContext({
    state: { data: tree, selectedIds: new Set(['a']) },
    findNode,
    findParent,
    collectMindMapNodeIds,
});
vm.runInContext(statsSource, context);

assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapNodeStats()', context))),
    { total: 5, children: 2, siblings: 1 },
    '单选卡片时应统计全图节点、直接子节点以及不含自身的兄弟节点',
);
context.state.selectedIds = new Set(['root']);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapNodeStats()', context))),
    { total: 5, children: 2, siblings: 0 },
    '根节点应有直接子节点且没有兄弟节点',
);
context.state.selectedIds = new Set(['a', 'b']);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapNodeStats()', context))),
    { total: 5, children: null, siblings: null },
    '非单选状态只显示全图节点数，局部统计应使用空状态',
);

console.log('节点统计校验通过：左下角布局、实时刷新与总数/子节点/兄弟节点计算完整。');
