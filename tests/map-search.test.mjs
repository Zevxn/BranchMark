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
assert.match(mindMap, /\$\('#btn-search'\)\.onclick = \(\) => openMapSearch\(\)/,
    '工具栏搜索按钮不应自动读取剪贴板');
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
assert.match(mindMap, /mapSearchState\.visibleOnly \? getRenderedMapSearchNodeIds\(\) : null/,
    '开启可见范围时应将已渲染节点集合传入搜索');
assert.match(mindMap, /if \(!mapSearchState\.visibleOnly\) \{[\s\S]*?clearMapSearchReveal\(\)[\s\S]*?renderTree\(\)/,
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

console.log('搜索定位校验通过：聚焦、短剪贴板预填、检索排序、路径展开与居中选择逻辑完整。');
