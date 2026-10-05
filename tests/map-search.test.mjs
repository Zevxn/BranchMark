import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readMindMapSource(),
]);

for (const id of [
    'btn-search',
    'mapSearchPanel',
    'mapSearchInput',
    'mapSearchResults',
    'mapSearchCount',
    'btn-search-scope',
    'btn-search-visible',
    'btn-search-prev',
    'btn-search-next',
    'btn-search-close',
]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `搜索界面应包含 #${id}`);
}

assert.match(mindMap, /e\.key\.toLowerCase\(\) === 'f'[\s\S]*?openMapSearch\(\{ prefillFromClipboard: true \}\)/,
    'Ctrl+F 应打开思维导图搜索，而不是浏览器页面查找');
assert.match(mindMap, /function focusMapSearchInput\(input\)[\s\S]*?input\.focus\(\{ preventScroll: true \}\);\s*input\.select\(\)[\s\S]*?requestAnimationFrame\(applyFocus\)[\s\S]*?document\.activeElement !== input[\s\S]*?180/,
    '搜索输入框应立即聚焦，并在 WebView2 完成可见过渡后验证实际焦点');
assert.match(mindMap, /function openMapSearch\(\{ prefillFromClipboard = false \} = \{\}\)[\s\S]*?focusMapSearchInput\(input\)/,
    '打开搜索面板时应统一调用可靠的输入框聚焦逻辑');
const focusSource = mindMap.slice(
    mindMap.indexOf('function cancelMapSearchPendingFocus'),
    mindMap.indexOf('function openMapSearch'),
);
const pendingFocusFrames = [];
const pendingFocusTimers = [];
const focusCalls = [];
const focusDocument = { activeElement: null };
const focusContext = vm.createContext({
    document: focusDocument,
    mapSearchState: { focusRequestId: 0, focusTimer: null },
    isMapSearchOpen: () => true,
    requestAnimationFrame: callback => pendingFocusFrames.push(callback),
    setTimeout: callback => {
        pendingFocusTimers.push(callback);
        return pendingFocusTimers.length;
    },
    clearTimeout() {},
});
vm.runInContext(`${focusSource}\nglobalThis.focusSearch = focusMapSearchInput;`, focusContext);
const focusInput = {
    isConnected: true,
    focus: options => {
        focusCalls.push(options);
        focusDocument.activeElement = focusInput;
    },
    select() {},
};
focusContext.focusSearch(focusInput);
assert.equal(focusCalls.length, 1, '打开面板时应立即尝试聚焦搜索框');
assert.equal(pendingFocusFrames.length, 1, '应安排下一渲染帧的 WebView2 聚焦确认');
pendingFocusFrames.shift()();
assert.equal(focusCalls.length, 2, '下一渲染帧应再次聚焦搜索框');
assert.deepEqual({ ...focusCalls[1] }, { preventScroll: true }, '聚焦搜索框不应改变画布滚动位置');
focusDocument.activeElement = null;
pendingFocusTimers.shift()();
assert.equal(focusCalls.length, 3, '可见过渡完成后若焦点丢失，应再次聚焦搜索框');
assert.match(mindMap, /document\.addEventListener\('mousedown',[\s\S]*?cancelMapSearchPendingFocus\(\)[\s\S]*?true\);/,
    '用户主动点击其他位置时应取消延迟聚焦，避免搜索框抢回焦点');
assert.match(mindMap, /navigator\.clipboard\.readText\(\)[\s\S]*?requestId === mapSearchState\.clipboardRequestId[\s\S]*?input\.value === initialValue/,
    '短剪贴板文本只能在请求仍有效且用户尚未输入时自动填充');
assert.match(mindMap, /async function readMapSearchClipboardText\(\)[\s\S]*?navigator\.clipboard\.readText[\s\S]*?navigator\.clipboard\.read\(\)/,
    '搜索剪贴板预填应在 readText 不可靠时回退到 ClipboardItem 读取');
const clipboardApplySource = mindMap.slice(
    mindMap.indexOf('async function applyMapSearchClipboardQuery'),
    mindMap.indexOf('function openMapSearch'),
);
assert.doesNotMatch(clipboardApplySource, /document\.activeElement === input/,
    '剪贴板异步读取完成时不应因 WebView2 焦点时序而放弃短文本搜索');
assert.match(mindMap, /\$\('#btn-search'\)\.onclick = \(\) => \{\s*if \(isMapSearchOpen\(\)\) closeMapSearch\(\);\s*else openMapSearch\(\);\s*\}/,
    '工具栏搜索按钮应切换面板开关，打开时不自动读取剪贴板');
assert.match(mindMap, /input\.addEventListener\('paste', event => \{[\s\S]*?getMindMapClipboardNodes\(JSON\.parse\(text\)\)[\s\S]*?pasteMindMapNodesToSelection\(nodes\)/,
    '搜索框接收到脑图 JSON 时应阻止文本粘贴，并将其作为当前选中节点的子树导入');
assert.match(mindMap, /if \(isMapSearchOpen\(\)\) \{[\s\S]*?activeEl === \$\('#mapSearchInput'\)\) return;/,
    '搜索面板显示但焦点离开输入框后，不应拦截画布的节点粘贴快捷键');
assert.match(mindMap, /state\.selectedIds\.clear\(\);\s*state\.selectedIds\.add\(result\.id\);/,
    '定位结果后应将目标卡片设为单选');
assert.match(mindMap, /state\.view\.tx \+= targetX[\s\S]*?state\.view\.ty \+= targetY[\s\S]*?updateTransform\(\)/,
    '定位应保持缩放比例，只平移画布到目标位置');
assert.match(mindMap, /isMapNodeTemporarilyExpanded\(node\.id\)/,
    '普通折叠节点应支持搜索期间临时展开');
assert.match(mindMap, /isMapRootDirectionTemporarilyExpanded\('left'\)/,
    '根节点左分支应支持搜索期间临时展开');
assert.match(mindMap, /isMapRootDirectionTemporarilyExpanded\('right'\)/,
    '根节点右分支应支持搜索期间临时展开');
const executeSearchSource = mindMap.slice(
    mindMap.indexOf('function executeMapSearch'),
    mindMap.indexOf('function getMapSearchClipboardQuery'),
);
assert.doesNotMatch(executeSearchSource, /clearMapSearchReveal\(\)|renderTree\(\)/,
    '搜索词变化或无结果时不应清除已定位结果的临时展开路径并重绘折叠视图');
assert.match(mindMap, /function locateMapSearchResult\(index\)[\s\S]*?clearMapSearchReveal\(\)/,
    '定位另一条结果时仍应先清除旧的临时展开路径');
assert.match(mindMap, /document\.querySelectorAll\('#tree-root \.node-card\[data-node-id\]'\)/,
    '可见范围应由当前树中已渲染的卡片决定，不应按屏幕视口过滤');
assert.match(mindMap, /isMapSearchVisibleOnly\(\) \? getRenderedMapSearchNodeIds\(\) : null/,
    '开启可见范围时应将已渲染节点集合传入搜索');
assert.match(mindMap, /if \(!isMapSearchVisibleOnly\(\)\) \{[\s\S]*?clearMapSearchReveal\(\)[\s\S]*?renderTree\(\)/,
    '可见范围内的结果定位不应触发折叠路径临时展开');
assert.match(mindMap, /mapSearchState\.visibleOnly = !mapSearchState\.visibleOnly;[\s\S]*?executeMapSearch\(input\.value\)/,
    '切换搜索范围后应立即按现有关键词刷新结果');
assert.match(html, /animation:\s*map-search-pulse\s+1s\s+ease-out\s+forwards/,
    '定位光效结束后应保持末帧，避免橙色边框样式突然回跳');
assert.match(html, /100%\s*\{[^}]*opacity:\s*0[^}]*\}/,
    '定位光效末帧应完全淡出，不残留橙色边框');

const saveFunction = mindMap.slice(
    mindMap.indexOf('async function saveMindMapData'),
    mindMap.indexOf('async function newMindMap'),
);
assert.doesNotMatch(saveFunction, /mapSearchState/,
    '搜索关键词、结果和临时展开状态不得写入思维导图存储');

const pureSearchSource = mindMap.slice(
    mindMap.indexOf('function normalizeMapSearchText'),
    mindMap.indexOf('function isMapSearchOpen'),
);
assert.ok(pureSearchSource.startsWith('function normalizeMapSearchText'), '应能提取纯搜索函数进行行为测试');

const context = vm.createContext({});
vm.runInContext(pureSearchSource, context);
// SECTION 搜索文字高亮偏移
context.highlightText = 'ＡＬＰＨＡ 财务 e\u0301 ﬃ 😀 关键关键词 ΟΣ';
context.highlightTerms = ['alpha', '财务', 'é', 'ffi', '😀', '关键', 'ος'];
const textMatches = vm.runInContext('getMapSearchTextMatches(highlightText, highlightTerms)', context);
assert.deepEqual([...textMatches.map(match => context.highlightText.slice(match.start, match.end))],
    ['ＡＬＰＨＡ', '财务', 'e\u0301', 'ﬃ', '😀', '关键', '关键', 'ΟΣ'],
    '高亮应保留全角、组合字、兼容字形和 Unicode 原文偏移，并覆盖重复关键词');
context.highlightText = 'aaa';
context.highlightTerms = ['aa', 'aa', ''];
assert.deepEqual([...vm.runInContext('getMapSearchTextMatches(highlightText, highlightTerms)', context)]
    .map(match => ({ ...match })), [{ start: 0, end: 2 }, { start: 1, end: 3 }],
    '应支持重叠匹配，去除重复搜索词并忽略空词');
context.highlightTerms = ['未命中'];
assert.equal(vm.runInContext('getMapSearchTextMatches(highlightText, highlightTerms).length', context), 0,
    '无匹配文本不应创建高亮范围');
assert.match(html, /::highlight\(mindmap-search\)/, '页面应声明搜索文字的高亮样式');
// !SECTION 搜索文字高亮偏移
const tree = {
    id: 'root',
    topic: '项目总览',
    foldedLeft: true,
    foldedRight: true,
    children: [
        {
            id: 'left-parent',
            topic: 'Alpha 计划',
            dir: 'left',
            folded: true,
            children: [
                {
                    id: 'left-target',
                    topic: '关键节点',
                    content: '## 本周财务指标\n包含 [定位词](https://example.com)',
                },
            ],
        },
        {
            id: 'right-body',
            topic: '普通标题',
            dir: 'right',
            content: '正文中提到 Alpha 计划。',
        },
    ],
};

context.tree = tree;
context.query = '关键 指标';
const crossFieldResults = vm.runInContext('collectMapSearchResults(tree, query)', context);
assert.equal(crossFieldResults.length, 1, '多个关键词可分别命中标题和正文');
assert.equal(crossFieldResults[0].id, 'left-target');
assert.equal(crossFieldResults[0].rootDirection, 'left', '结果应记录需要临时展开的根分支方向');
assert.deepEqual([...crossFieldResults[0].pathIds], ['root', 'left-parent'], '结果应记录完整祖先路径');
assert.match(crossFieldResults[0].snippet, /本周财务指标/, '结果应包含去除 Markdown 标记后的正文摘要');

context.query = 'ＡＬＰＨＡ';
const normalizedResults = vm.runInContext('collectMapSearchResults(tree, query)', context);
assert.deepEqual([...normalizedResults.map(item => item.id)], ['left-parent', 'right-body'],
    '搜索应兼容大小写和全角/半角字符，并让标题命中排在正文命中之前');

context.query = '   ';
assert.equal(vm.runInContext('collectMapSearchResults(tree, query).length', context), 0,
    '空白关键词不应返回全部卡片');

context.query = 'alpha';
context.renderedNodeIds = new Set(['root', 'right-body']);
const visibleResults = vm.runInContext(
    'collectMapSearchResults(tree, query, renderedNodeIds)',
    context,
);
assert.deepEqual([...visibleResults.map(item => item.id)], ['right-body'],
    '仅搜索可见卡片时，已折叠分支中的匹配节点必须被过滤');
context.query = '项目总览';
assert.equal(vm.runInContext(
    'collectMapSearchResults(tree, query, renderedNodeIds)[0].id',
    context,
), 'root', '根卡片作为始终渲染的节点应仍可被搜索');

const clipboardQueryStart = mindMap.indexOf('function getMapSearchClipboardQuery');
const clipboardQueryEnd = mindMap.indexOf('async function applyMapSearchClipboardQuery', clipboardQueryStart);
assert.ok(clipboardQueryStart >= 0 && clipboardQueryEnd > clipboardQueryStart,
    '应能提取剪贴板搜索词校验函数');
const clipboardContext = vm.createContext({});
vm.runInContext(`const MAP_SEARCH_CLIPBOARD_MAX_CHARS = 15; ${mindMap.slice(clipboardQueryStart, clipboardQueryEnd)}`, clipboardContext);
clipboardContext.shortText = `  ${'中'.repeat(15)}  `;
clipboardContext.longText = '中'.repeat(16);
assert.equal(vm.runInContext('getMapSearchClipboardQuery(shortText)', clipboardContext), '中'.repeat(15),
    '剪贴板文本应去除首尾空白，并允许恰好 15 个字符');
assert.equal(vm.runInContext('getMapSearchClipboardQuery(longText)', clipboardContext), '',
    '超过 15 个字符的剪贴板文本不得自动填入');
assert.equal(vm.runInContext("getMapSearchClipboardQuery('   ')", clipboardContext), '',
    '空白剪贴板文本不得覆盖现有搜索词');

const clipboardApplyStart = mindMap.indexOf('function getMapSearchClipboardQuery');
const clipboardApplyEnd = mindMap.indexOf('function openMapSearch', clipboardApplyStart);
const appliedQueries = [];
const clipboardFallbackContext = vm.createContext({
    navigator: {
        clipboard: {
            async readText() { throw new Error('WebView2 readText unavailable'); },
            async read() {
                return [{
                    types: ['text/plain'],
                    async getType() {
                        return { async text() { return '陈映荣'; } };
                    }
                }];
            }
        }
    },
    mapSearchState: { clipboardRequestId: 3 },
    document: { activeElement: null },
    isMapSearchOpen: () => true,
    executeMapSearch: query => appliedQueries.push(query),
    MAP_SEARCH_CLIPBOARD_MAX_CHARS: 15,
});
vm.runInContext(mindMap.slice(clipboardApplyStart, clipboardApplyEnd), clipboardFallbackContext);
const delayedInput = { value: '' };
await clipboardFallbackContext.applyMapSearchClipboardQuery(delayedInput, '', 3);
assert.equal(delayedInput.value, '陈映荣', 'readText 失败时应通过 ClipboardItem 回退填入短文本');
assert.deepEqual(appliedQueries, ['陈映荣'], '短剪贴板文本填入后应立即执行搜索');

// SECTION 跨页面搜索行为
const workbook = {
    activeTabId: 'tab-a',
    tabs: [
        { id: 'tab-a', name: '页面 A', data: { id: 'root-a', topic: '旧快照', children: [] }, view: { tx: 10, ty: 20, scale: 1 } },
        { id: 'tab-b', name: '页面 B', data: { id: 'root-b', topic: 'B', children: [
            { id: 'parent-b', topic: '折叠父节点', folded: true, children: [
                { id: 'shared-id', topic: '命中 B', content: '正文 B', children: [] },
            ] },
        ] }, view: { tx: 30, ty: 40, scale: 2 } },
    ],
};
const searchRuntime = {
    query: '', results: [], activeIndex: -1, hasLocated: false, allTabs: false, visibleOnly: false,
    revealedNodeIds: new Set(), revealedRootDirections: new Set(),
    pulseTimer: null, clipboardRequestId: 0, focusRequestId: 0, focusTimer: null,
};
const liveState = {
    data: { id: 'root-a', topic: 'A', children: [
        { id: 'shared-id', topic: '命中 A', content: '正文 A', children: [] },
    ] },
    view: workbook.tabs[0].view, scrollMap: new Map(),
    history: ['历史 A'], historyIndex: 0, selectedIds: new Set(),
};
const buttons = new Map(['#btn-search-scope', '#btn-search-visible'].map(id => [id, {
    attributes: {}, classList: { toggle() {} },
    setAttribute(key, value) { this.attributes[key] = value; },
}]));
const searchPanelClasses = new Set(['active']);
const searchPanel = {
    attributes: { 'aria-hidden': 'false' },
    classList: {
        contains: name => searchPanelClasses.has(name),
        remove: name => searchPanelClasses.delete(name),
    },
    contains: () => false,
    setAttribute(key, value) { this.attributes[key] = value; },
};
const searchInput = { value: '' };
buttons.set('#mapSearchPanel', searchPanel);
buttons.set('#mapSearchInput', searchInput);
const frames = [];
const pulses = [];
let renderCount = 0;
let commitCount = 0;
const tabSearchContext = vm.createContext({
    MINDMAP_TABS_VERSION: 'tabs-v1',
    mindMapWorkbook: workbook, state: liveState, mapSearchState: searchRuntime,
    mindMapTabRuntime: new Map(),
    window: { innerWidth: 1200, innerHeight: 800 },
    document: { getElementById: id => ({ id }), querySelector: () => null },
    sessionStorage: { setItem() {} },
    $: selector => buttons.get(selector),
    getRenderedMapSearchNodeIds: () => new Set(['root-a']),
    renderMapSearchResults() {},
    renderTree: () => { renderCount += 1; },
    renderMindMapTabs() {},
    saveGlobalScrolls() {},
    sanitizeMindMapScrollMap: () => ({}),
    syncCurrentInput: () => { commitCount += 1; liveState.data.children[0].content = '提交的编辑内容'; },
    closeMindMapRelationEditor() {}, closeMindMapRelationNavigationMenu() {},
    saveStorage() {}, scrollActiveMindMapTabIntoView() {}, updateSelection() {},
    cancelMapSearchPendingFocus() {}, clearTimeout() {},
    requestAnimationFrame: callback => frames.push(callback),
    centerMapNodeInVisibleArea() {},
    pulseMapSearchTarget: card => pulses.push(card.id),
});
vm.runInContext(pureSearchSource, tabSearchContext);
vm.runInContext(mindMap.slice(mindMap.indexOf('function isMapSearchOpen'), mindMap.indexOf('function isMapNodeTemporarilyExpanded')), tabSearchContext);
vm.runInContext(mindMap.slice(mindMap.indexOf('function syncMapSearchScopeButton'), mindMap.indexOf('function renderMapSearchResults')), tabSearchContext);
vm.runInContext(executeSearchSource, tabSearchContext);
vm.runInContext(mindMap.slice(mindMap.indexOf('function clearMapSearchReveal'), mindMap.indexOf('function syncMapSearchScopeButton')), tabSearchContext);
vm.runInContext(mindMap.slice(mindMap.indexOf('function closeMapSearch'), mindMap.indexOf('function centerMapNodeInVisibleArea')), tabSearchContext);
vm.runInContext(mindMap.slice(mindMap.indexOf('function getActiveMindMapTab'), mindMap.indexOf('function replaceMindMapWorkbook')), tabSearchContext);
vm.runInContext(mindMap.slice(mindMap.indexOf('function commitCurrentMindMapTabEdits'), mindMap.indexOf('function scrollActiveMindMapTabIntoView')), tabSearchContext);
vm.runInContext(mindMap.slice(mindMap.indexOf('function activateMindMapTab'), mindMap.indexOf('function addMindMapTab')), tabSearchContext);
vm.runInContext(mindMap.slice(mindMap.indexOf('function locateMapSearchResult'), mindMap.indexOf('function initializeMapSearch')), tabSearchContext);
// 纯函数片段包含 DOM 收集函数，此处只控制当前页哪些卡片已渲染。
tabSearchContext.getRenderedMapSearchNodeIds = () => new Set(['root-a']);
tabSearchContext.executeMapSearch('命中');
assert.deepEqual([...searchRuntime.results.map(result => result.tabId)], ['tab-a'],
    '默认只搜索当前 Tab，且应搜索实时数据而非旧快照');
searchRuntime.visibleOnly = true;
tabSearchContext.executeMapSearch('命中');
assert.equal(searchRuntime.results.length, 0, '当前 Tab 的未折叠卡片过滤应继续有效');
searchRuntime.allTabs = true;
tabSearchContext.syncMapSearchScopeButton();
tabSearchContext.executeMapSearch('命中');
assert.deepEqual([...searchRuntime.results.map(result => `${result.tabId}:${result.id}`)],
    ['tab-a:shared-id', 'tab-b:shared-id'], '全局搜索应按 Tab 顺序检索，并区分不同页的重复节点 ID');
assert.equal(searchRuntime.results[1].tabName, '页面 B', '结果应携带所属 Tab 名称');
assert.equal(buttons.get('#btn-search-visible').disabled, true, '全局模式应禁用未折叠卡片过滤');
assert.equal(buttons.get('#btn-search-scope').textContent, '全部 Tab', '范围按钮应明确显示全局模式');
const originalResults = searchRuntime.results;
tabSearchContext.locateMapSearchResult(1);
assert.equal(workbook.activeTabId, 'tab-b', '跨页结果应激活所属 Tab');
assert.equal(commitCount, 1, '跨页定位必须提交当前编辑');
assert.equal(workbook.tabs[0].data.children[0].content, '提交的编辑内容', '切页不得丢失编辑');
assert.equal(searchRuntime.query, '命中', '跨页定位应保留关键词');
assert.equal(searchRuntime.results, originalResults, '跨页定位应保留原结果列表');
assert.equal(searchRuntime.activeIndex, 1, '跨页定位应保留所选结果位置');
assert.equal(searchRuntime.allTabs, true, '跨页定位应保留全局模式');
assert.deepEqual([...liveState.selectedIds], ['shared-id'], '应选中目标页中的目标卡片');
assert.equal(searchRuntime.revealedNodeIds.has('parent-b'), true, '全局模式应临时展开目标路径');
assert.equal(workbook.tabs[1].data.children[0].folded, true, '搜索展开不得改变保存的折叠状态');
assert.ok(renderCount >= 2, '应加载目标页并重绘临时展开路径');
const snapshot = tabSearchContext.getMindMapWorkbookSnapshot(false);
assert.equal(JSON.stringify(snapshot).includes('allTabs'), false, '搜索范围不得写入导图数据');
tabSearchContext.navigateMapSearch(1);
assert.equal(workbook.activeTabId, 'tab-a', '下一个结果应跨页循环定位');
assert.equal(searchRuntime.activeIndex, 0);
assert.equal(liveState.history[0], '历史 A', '返回原页应恢复独立撤销历史');
assert.equal(liveState.view.tx, 10, '切页应恢复各页的视图');
while (frames.length) frames.shift()();
assert.deepEqual(pulses, ['card-shared-id'], '快速跨页跳转时，旧页的异步高亮不得误命中新页同 ID 卡片');
searchRuntime.allTabs = false;
tabSearchContext.syncMapSearchScopeButton();
tabSearchContext.executeMapSearch('命中');
assert.equal(searchRuntime.visibleOnly, true, '切回当前 Tab 应保留原过滤偏好');
assert.equal(searchRuntime.results.length, 0, '切回当前 Tab 后应重新应用未折叠卡片过滤');
assert.equal(buttons.get('#btn-search-visible').disabled, false, '当前 Tab 应重新启用过滤按钮');

searchRuntime.visibleOnly = false;
searchInput.value = '命中';
tabSearchContext.executeMapSearch(searchInput.value);
tabSearchContext.activateMindMapTab('tab-b');
assert.equal(tabSearchContext.isMapSearchOpen(), true, '手动切换 Tab 不得关闭已打开的搜索面板');
assert.equal(searchPanel.attributes['aria-hidden'], 'false', '切页后搜索面板应保持可访问');
assert.equal(searchInput.value, '命中', '手动切页应保留输入框中的关键词');
assert.equal(searchRuntime.query, '命中', '手动切页应保留搜索状态中的关键词');
assert.deepEqual([...searchRuntime.results.map(result => result.tabId)], ['tab-b'],
    '当前 Tab 模式在手动切页后应更新为目标页的结果');

searchRuntime.visibleOnly = true;
tabSearchContext.getRenderedMapSearchNodeIds = () => new Set(workbook.activeTabId === 'tab-a'
    ? ['root-a', 'shared-id'] : ['root-b', 'parent-b']);
tabSearchContext.executeMapSearch(searchInput.value);
assert.equal(searchRuntime.results.length, 0, '目标页折叠路径中的卡片应被过滤');
tabSearchContext.activateMindMapTab('tab-a');
assert.equal(searchRuntime.visibleOnly, true, '手动切页应保留未折叠卡片过滤偏好');
assert.deepEqual([...searchRuntime.results.map(result => result.tabId)], ['tab-a'],
    '切页后应按新页已渲染的卡片更新过滤结果');

searchRuntime.allTabs = true;
tabSearchContext.executeMapSearch(searchInput.value);
searchRuntime.activeIndex = 1;
searchRuntime.hasLocated = true;
const manualSwitchResults = searchRuntime.results;
tabSearchContext.activateMindMapTab('tab-b');
assert.equal(tabSearchContext.isMapSearchOpen(), true, '全局模式下手动切页也应保持搜索面板打开');
assert.equal(searchRuntime.allTabs, true, '手动切页应保留全局搜索范围');
assert.equal(searchRuntime.results, manualSwitchResults, '手动切页应保留全局搜索结果列表');
assert.equal(searchRuntime.activeIndex, 1, '手动切页应保留全局搜索结果位置');
assert.equal(searchRuntime.hasLocated, true, '手动切页后应能继续导航到下一个全局结果');

tabSearchContext.resetMapSearch();
assert.equal(searchRuntime.allTabs, false, '完整重置搜索应恢复默认的当前 Tab 范围');
assert.equal(searchRuntime.query, '', '完整重置应清除关键词');
assert.equal(tabSearchContext.isMapSearchOpen(), false, '完整重置仍应关闭搜索面板');
tabSearchContext.activateMindMapTab('tab-a');
assert.equal(tabSearchContext.isMapSearchOpen(), false, '切换 Tab 不应自动打开已关闭的搜索面板');
// !SECTION 跨页面搜索行为

console.log('搜索定位校验通过：默认当前页、全局检索、跨页连续定位、编辑保留、折叠过滤与原有搜索行为完整。');
