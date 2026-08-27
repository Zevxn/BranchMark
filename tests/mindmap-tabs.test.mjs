import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readFile('app/JS/MindMap.js', 'utf8'),
]);

const normalizerSource = mindMap.slice(
    mindMap.indexOf('function isMindMapNodeData'),
    mindMap.indexOf('function applyImportedMindMap'),
);
const modelSource = mindMap.slice(
    mindMap.indexOf('const defaultTreeData'),
    mindMap.indexOf('let dockData'),
);
const context = vm.createContext({
    window: { innerWidth: 1200, innerHeight: 800 },
    generateNodeId: (() => {
        let index = 0;
        return () => `generated_${++index}`;
    })(),
});
vm.runInContext(`${normalizerSource}\n${modelSource}\n`
    + 'globalThis.normalizeMindMapWorkbookSnapshot = normalizeMindMapWorkbookSnapshot;', context);
const normalizeWorkbook = context.normalizeMindMapWorkbookSnapshot;

const legacySnapshot = {
    data: { id: 'root', topic: '旧导图', children: [] },
    view: { tx: 10, ty: 20, scale: 1.2 },
    scrollMap: { root: 18 },
};
const migrated = normalizeWorkbook(legacySnapshot, '家谱资料');
assert.equal(migrated.version, 'tabs-v1', '旧导图应迁移为带版本的多页面工作簿');
assert.equal(migrated.tabs.length, 1, '旧导图应自动包装成一个页面');
assert.equal(migrated.tabs[0].name, '家谱资料', '迁移页面应优先沿用原文件名');
assert.equal(migrated.tabs[0].data.topic, '旧导图', '迁移不得改变原根节点内容');
assert.deepEqual({ ...migrated.tabs[0].view }, legacySnapshot.view, '迁移应保留画布视图');
assert.deepEqual({ ...migrated.tabs[0].scrollMap }, legacySnapshot.scrollMap, '迁移应保留滚动位置');

const cleanedScrollSnapshot = normalizeWorkbook({
    data: {
        id: 'root',
        topic: '滚动清理',
        children: [{ id: 'child', topic: '子节点', children: [] }],
    },
    scrollMap: {
        root: 0,
        child: 24,
        deleted: 80,
        invalid: 'not-a-number',
    },
});
assert.deepEqual({ ...cleanedScrollSnapshot.tabs[0].scrollMap }, { child: 24 },
    '滚动状态应只保留现存节点大于零的有效位置');

const modern = normalizeWorkbook({
    version: 'tabs-v1',
    activeTabId: 'tab_b',
    tabs: [
        { id: 'tab_a', name: '页面 A', data: { id: 'a', topic: 'A', children: [] } },
        { id: 'tab_b', name: '页面 B', data: { id: 'b', topic: 'B', children: [] } },
    ],
});
assert.equal(modern.tabs.length, 2, '新版工作簿应保留全部页面');
assert.equal(modern.activeTabId, 'tab_b', '新版工作簿应恢复上次活动页面');
assert.equal(modern.tabs[1].data.topic, 'B', '页面内容必须相互独立并完整恢复');
assert.equal(Array.isArray(modern.tabs[1].data.relations), true, '每页应独立补齐关联数据');
assert.equal(Array.isArray(modern.tabs[1].data.summaries), true, '每页应独立补齐总结数据');

const empty = normalizeWorkbook({}, '新建思维导图');
assert.equal(empty.tabs.length, 1, '新建工作簿应至少包含一个页面');
assert.throws(
    () => normalizeWorkbook({}, '导入页面', { allowEmpty: false }),
    /节点格式不正确/,
    '导入无效空文件时不应静默创建空页面',
);

assert.match(html, /id=["']mindMapTabList["'][^>]*role=["']tablist["']/,
    '页面底部应提供可访问的 Tab 列表');
assert.match(html, /id=["']btn-add-mindmap-tab["']/,
    'Tab 栏应提供新建页面按钮');
assert.match(html, /data-action=["']create-tab-from-node["'][^>]*style=["']display:none["']/,
    '节点右键菜单应提供默认隐藏的“从此节点新建页面”入口');
assert.equal((html.match(/data-tab-action=/g) || []).length, 3,
    'Tab 右键菜单应提供重命名、复制和删除操作');
assert.match(html, /id=["']mindMapTabRenameModal["'][^>]*role=["']dialog["']/,
    'Tab 重命名应复用站内模态框样式，而不是原生 prompt');
assert.match(html, /id=["']mindMapTabDeleteModal["'][^>]*role=["']alertdialog["']/,
    'Tab 删除应复用站内模态框样式，而不是原生 confirm');
const tabDialogSource = mindMap.slice(
    mindMap.indexOf('function showMindMapTabModal'),
    mindMap.indexOf('function reorderMindMapTab'),
);
assert.doesNotMatch(tabDialogSource, /window\.(?:prompt|confirm)\s*\(/,
    'Tab 重命名和删除不得调用浏览器原生提示框');
assert.match(tabDialogSource, /function renameMindMapTab[\s\S]*?#mindMapTabRenameModal/,
    '重命名操作应打开 Tab 专用模态框');
assert.match(tabDialogSource, /function deleteMindMapTab[\s\S]*?#mindMapTabDeleteModal/,
    '删除操作应打开 Tab 专用确认框');
assert.match(mindMap, /function activateMindMapTab\([\s\S]*?commitCurrentMindMapTabEdits\(\)[\s\S]*?loadActiveMindMapTab\(\)/,
    '切页前应提交当前编辑并载入目标页面运行状态');
assert.match(mindMap, /function getMindMapWorkbookSnapshot\([\s\S]*?tabs:\s*mindMapWorkbook\.tabs\.map/,
    '持久化应保存整个工作簿而非仅保存活动页面');
assert.match(mindMap, /\.\.\.\(Object\.keys\(scrollMap\)\.length > 0 \? \{ scrollMap \} : \{\}\)/,
    '导出工作簿时应省略没有有效位置的空 scrollMap');
assert.match(mindMap, /function saveGlobalScrolls\([\s\S]*?scrollTop > 0[\s\S]*?state\.scrollMap\.set\(nodeId, scrollTop\)[\s\S]*?state\.scrollMap\.delete\(nodeId\)/,
    '采集滚动位置时应删除零值，避免为每张卡片生成无意义条目');
assert.match(mindMap, /function reorderMindMapTab\(/,
    '基础版本应支持拖动调整页面顺序');
assert.match(mindMap, /createTabItem\.style\.display\s*=\s*state\.selectedIds\.size === 1 \? '' : 'none'/,
    '从节点新建页面的入口只能在单选时显示');
assert.match(mindMap, /if \(action === 'create-tab-from-node'\)[\s\S]*?createMindMapTabFromSelectedNode\(\)/,
    '节点右键菜单应调用子树新建页面逻辑');
assert.match(mindMap, /function setMindMapTabDropIndicator[\s\S]*?classList\.contains\(className\)[\s\S]*?return/,
    '拖动停留在同一插入位置时不得反复移除并添加指示器');
assert.match(html, /\.mindmap-tab\.drop-after::after\s*\{\s*right:\s*0;\s*\}/,
    '最右侧插入线应位于 Tab 内部，避免反复改变横向滚动宽度');
assert.match(html, /\.mindmap-tab-list\s*\{[\s\S]*?gap:\s*0;/,
    '相邻 Tab 的激活态和悬停态之间不应保留背景断层');
assert.match(html, /\.mindmap-tab-add\s*\{[\s\S]*?margin-left:\s*0;/,
    '最右侧 Tab 的高亮背景应紧贴新增按钮分隔线');
assert.match(mindMap, /if \(skipNextGlobalScrollCapture\)[\s\S]*?else saveGlobalScrolls\(\)/,
    '切页首次渲染不得把旧页面 DOM 的滚动位置写入新页面');

const subtreeSource = mindMap.slice(
    mindMap.indexOf('function getMindMapSubtreeSourceSide'),
    mindMap.indexOf('function createMindMapTabFromSelectedNode'),
);
function findTestNode(root, id) {
    if (root.id === id) return root;
    for (const child of root.children || []) {
        const found = findTestNode(child, id);
        if (found) return found;
    }
    return null;
}
function collectTestNodeIds(node, target = new Set()) {
    if (!node) return target;
    target.add(node.id);
    (node.children || []).forEach(child => collectTestNodeIds(child, target));
    return target;
}
const subtreeContext = vm.createContext({
    MINDMAP_SUMMARY_MIN_NODES: 2,
    cloneMindMapValue: value => JSON.parse(JSON.stringify(value)),
    findNode: findTestNode,
    collectMindMapNodeIds: collectTestNodeIds,
});
vm.runInContext(`${subtreeSource}\nglobalThis.buildSubtree = buildMindMapTabDataFromNode;`, subtreeContext);
const sourceTree = {
    id: 'root',
    topic: '总图',
    children: [
        {
            id: 'branch',
            topic: '分支',
            dir: 'left',
            isSimple: true,
            folded: true,
            children: [
                { id: 'inside_a', topic: 'A', children: [] },
                { id: 'inside_b', topic: 'B', children: [] },
            ],
        },
        { id: 'outside', topic: '外部', dir: 'right', children: [] },
    ],
    relations: [
        { id: 'internal_relation', sourceId: 'inside_a', targetId: 'inside_b' },
        { id: 'external_relation', sourceId: 'branch', targetId: 'outside' },
    ],
    summaries: [
        { id: 'internal_summary', nodeIds: ['inside_a', 'inside_b'], side: 'left' },
        { id: 'external_summary', nodeIds: ['inside_a', 'outside'], side: 'left' },
    ],
};
const sourceTreeBefore = JSON.stringify(sourceTree);
const subtree = JSON.parse(JSON.stringify(subtreeContext.buildSubtree(sourceTree, 'branch')));
assert.equal(subtree.id, 'branch', '所选节点应成为新页面根节点');
assert.equal('dir' in subtree, false, '新根节点不应保留原分支方向字段');
assert.equal(subtree.isSimple, true, '复制子树时应保留所选节点的卡片样式数据');
assert.equal(subtree.folded, false, '新页面应默认展开所选节点的后代');
assert.deepEqual(subtree.children.map(child => child.dir), ['left', 'left'],
    '左侧来源子树应在新页面中保持左向布局');
assert.deepEqual(subtree.relations.map(relation => relation.id), ['internal_relation'],
    '新页面只应保留子树内部关联');
assert.deepEqual(subtree.summaries.map(summary => summary.id), ['internal_summary'],
    '新页面只应保留成员全部位于子树内的总结');
assert.equal(JSON.stringify(sourceTree), sourceTreeBefore, '创建页面不得修改来源导图');

console.log('多页面 Tab 校验通过：旧数据迁移、页面状态隔离、基础交互与工作簿持久化逻辑完整。');
