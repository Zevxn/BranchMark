import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const mindMap = await readFile('app/JS/MindMap.js', 'utf8');

assert.match(mindMap,
    /\['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'\]\.includes\(e\.key\)[\s\S]*?state\.selectedIds\.size === 1[\s\S]*?moveMindMapSelectionByArrow\(e\.key\)/,
    '画布单选状态下应由公共方向键导航入口接管四个方向键');
assert.match(mindMap,
    /if \(isInput \|\| isModalActive \|\| hasSelection\)[\s\S]*?return;[\s\S]*?moveMindMapSelectionByArrow/,
    '输入、Markdown 编辑或文字选择状态应优先拦截方向键导航');
assert.match(mindMap,
    /function keepMindMapKeyboardSelectionVisible\(card\)[\s\S]*?state\.view\.tx \+= dx;[\s\S]*?state\.view\.ty \+= dy;/,
    '方向键切换到视口外卡片时应仅执行必要的画布平移');

const navigationSource = mindMap.slice(
    mindMap.indexOf('function getVisibleMindMapNodeCard'),
    mindMap.indexOf('function keepMindMapKeyboardSelectionVisible'),
);
assert.ok(navigationSource.startsWith('function getVisibleMindMapNodeCard'), '应能提取结构导航函数');

const tree = {
    id: 'root',
    children: [
        { id: 'left-a', dir: 'left', children: [{ id: 'left-a-1' }, { id: 'left-a-2' }] },
        { id: 'right-a', dir: 'right', children: [{ id: 'right-a-1' }, { id: 'right-a-2' }] },
        { id: 'left-b', dir: 'left', children: [] },
        { id: 'right-b', dir: 'right', children: [] },
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

const verticalCenters = new Map([
    ['root', 200],
    ['left-a', 120], ['left-b', 260],
    ['right-a', 150], ['right-b', 280],
    ['left-a-1', 90], ['left-a-2', 145],
    ['right-a-1', 110], ['right-a-2', 165],
]);
const hiddenIds = new Set();
const document = {
    getElementById(id) {
        const nodeId = id.replace(/^card-/, '');
        if (!verticalCenters.has(nodeId)) return null;
        return {
            getClientRects: () => hiddenIds.has(nodeId) ? [] : [{}],
            getBoundingClientRect: () => ({ top: verticalCenters.get(nodeId) - 10, height: 20 }),
        };
    },
};

const context = vm.createContext({
    state: { data: tree },
    document,
    findNode,
    findParent,
    getMindMapNodeBranchSide: id => id.startsWith('left-') ? 'left' : (id === 'root' ? null : 'right'),
});
vm.runInContext(navigationSource, context);
const target = (id, key) => vm.runInContext(`getMindMapKeyboardNavigationTarget('${id}', '${key}')`, context);

assert.equal(target('right-a', 'ArrowDown'), 'right-b', '向下应选择右侧下一个兄弟');
assert.equal(target('right-b', 'ArrowUp'), 'right-a', '向上应选择右侧上一个兄弟');
assert.equal(target('left-a', 'ArrowDown'), 'left-b', '根节点的左右两侧兄弟不能混合切换');
assert.equal(target('right-a', 'ArrowUp'), null, '到达同侧首个兄弟后不应循环跳转');

assert.equal(target('right-a', 'ArrowLeft'), 'root', '右分支向左应返回父节点');
assert.equal(target('right-a', 'ArrowRight'), 'right-a-2', '右分支向右应进入纵向最近的子节点');
assert.equal(target('left-a', 'ArrowRight'), 'root', '左分支向右应返回父节点');
assert.equal(target('left-a', 'ArrowLeft'), 'left-a-2', '左分支向左应进入纵向最近的子节点');

assert.equal(target('root', 'ArrowLeft'), 'left-b', '根节点向左应进入最近的可见左分支');
assert.equal(target('root', 'ArrowRight'), 'right-a', '根节点向右应进入最近的可见右分支');

hiddenIds.add('right-a-2');
assert.equal(target('right-a', 'ArrowRight'), 'right-a-1', '折叠或隐藏的子节点不得成为方向键目标');
hiddenIds.add('right-a-1');
assert.equal(target('right-a', 'ArrowRight'), null, '没有可见子节点时应保持当前选择');

console.log('方向键卡片导航校验通过：同侧兄弟、镜像父子、根节点分支与折叠可见性逻辑完整。');
