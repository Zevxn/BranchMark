import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const mindMap = await readFile('app/JS/MindMap.js', 'utf8');

assert.match(mindMap, /getMindMapDragProcessingOrder\(selectedNodes, state\.drag\.dropType\)/,
    '多选拖动应统一通过稳定的节点顺序函数处理');
assert.match(mindMap, /dropType === 'AFTER' \? \[\.\.\.orderedNodes\]\.reverse\(\) : orderedNodes/,
    '释放到目标后方时应反向处理，抵消连续插入导致的最终倒序');

const helperSource = mindMap.slice(
    mindMap.indexOf('function getMindMapNodeTreeOrder'),
    mindMap.indexOf('function removeMindMapRelationsForNodes'),
);
assert.ok(helperSource.startsWith('function getMindMapNodeTreeOrder'), '应能提取多选拖放顺序辅助函数');

const context = vm.createContext({
    state: {
        data: {
            id: 'root',
            children: [
                { id: 'a' },
                { id: 'b' },
                { id: 'c', children: [{ id: 'd' }, { id: 'e' }] },
            ],
        },
    },
});
vm.runInContext(helperSource, context);

context.mixedSelection = ['e', 'b', 'a', 'd'];
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('sortMindMapNodeIdsByTreeOrder(mixedSelection)', context))),
    ['a', 'b', 'd', 'e'],
    '点选或框选的加入顺序不能影响按原树排序后的节点顺序',
);

context.siblingSelection = ['b', 'a'];
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext("getMindMapDragProcessingOrder(siblingSelection, 'BEFORE')", context))),
    ['a', 'b'],
    '插入目标前方时应按原树顺序处理兄弟节点',
);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext("getMindMapDragProcessingOrder(siblingSelection, 'AFTER')", context))),
    ['b', 'a'],
    '插入目标后方时应反向处理，以保证最终顺序仍为 a、b',
);

function simulateSiblingMove(initial, movingIds, targetId, dropType) {
    const output = [...initial];
    for (const id of movingIds) {
        const fromIndex = output.indexOf(id);
        output.splice(fromIndex, 1);
        const targetIndex = output.indexOf(targetId);
        output.splice(dropType === 'BEFORE' ? targetIndex : targetIndex + 1, 0, id);
    }
    return output;
}

context.beforeOrder = vm.runInContext("getMindMapDragProcessingOrder(siblingSelection, 'BEFORE')", context);
context.afterOrder = vm.runInContext("getMindMapDragProcessingOrder(siblingSelection, 'AFTER')", context);
assert.deepEqual(simulateSiblingMove(['a', 'b', 'c'], context.beforeOrder, 'c', 'BEFORE'), ['a', 'b', 'c'],
    '多选兄弟节点放到目标前方后应保持原有相对顺序');
assert.deepEqual(simulateSiblingMove(['a', 'b', 'c'], context.afterOrder, 'c', 'AFTER'), ['c', 'a', 'b'],
    '多选兄弟节点放到目标后方后也应保持原有相对顺序');

console.log('多选拖放顺序校验通过：无论选择顺序或释放方向，兄弟节点均保持原树顺序。');
