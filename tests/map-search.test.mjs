import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readFile('app/JS/MindMap.js', 'utf8'),
]);

for (const id of [
    'btn-search',
    'mapSearchPanel',
    'mapSearchInput',
    'mapSearchResults',
    'mapSearchCount',
    'btn-search-prev',
    'btn-search-next',
    'btn-search-close',
]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `搜索界面应包含 #${id}`);
}

assert.match(mindMap, /e\.key\.toLowerCase\(\) === 'f'[\s\S]*?openMapSearch\(\)/,
    'Ctrl+F 应打开思维导图搜索，而不是浏览器页面查找');
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

console.log('搜索定位校验通过：界面、检索、排序、路径临时展开与居中选择逻辑完整。');
