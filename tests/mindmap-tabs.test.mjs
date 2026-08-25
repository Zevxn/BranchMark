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
assert.match(mindMap, /function reorderMindMapTab\(/,
    '基础版本应支持拖动调整页面顺序');
assert.match(mindMap, /function setMindMapTabDropIndicator[\s\S]*?classList\.contains\(className\)[\s\S]*?return/,
    '拖动停留在同一插入位置时不得反复移除并添加指示器');
assert.match(html, /\.mindmap-tab\.drop-after::after\s*\{\s*right:\s*0;\s*\}/,
    '最右侧插入线应位于 Tab 内部，避免反复改变横向滚动宽度');
assert.match(mindMap, /if \(skipNextGlobalScrollCapture\)[\s\S]*?else saveGlobalScrolls\(\)/,
    '切页首次渲染不得把旧页面 DOM 的滚动位置写入新页面');

console.log('多页面 Tab 校验通过：旧数据迁移、页面状态隔离、基础交互与工作簿持久化逻辑完整。');
