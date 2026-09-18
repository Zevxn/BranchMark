import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { readMindMapSource } from './helpers/mindmap-source.mjs';

const [html, mindMap, renderMD] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readMindMapSource(),
    readFile('app/JS/renderMD.js', 'utf8'),
]);
const ui = await readFile('app/JS/MindMap-UI.js', 'utf8');

const linkStart = mindMap.indexOf('// SECTION 导图内链接数据');
const linkEnd = mindMap.indexOf('// !SECTION 导图内链接数据', linkStart);
assert.ok(linkStart >= 0 && linkEnd > linkStart, '应能定位导图内链接数据模块');
const linkConstantsStart = mindMap.indexOf('const MINDMAP_INTERNAL_LINK_PROTOCOL');
const linkConstants = mindMap.slice(linkConstantsStart, linkStart);

const context = vm.createContext({
    Date,
    JSON,
    Map,
    Math,
    URL,
    URLSearchParams,
    console,
    generateFileId: () => 'generated-document',
    mindMapWorkbook: {
        documentId: 'doc-1',
        activeTabId: 'tab-a',
        tabs: [
            {
                id: 'tab-a',
                name: '概念页',
                data: {
                    id: 'root',
                    topic: '主题',
                    children: [
                        { id: 'smdp', topic: 'SMDP', content: 'SMDP 正文', children: [] },
                    ],
                },
            },
            {
                id: 'tab-b',
                name: '补充页',
                data: {
                    id: 'root-b',
                    topic: '补充',
                    children: [
                        { id: 'target-b', topic: '目标卡片', content: '目标正文', children: [] },
                    ],
                },
            },
        ],
    },
});

vm.runInContext(`
    ${linkConstants}
    ${mindMap.slice(linkStart, linkEnd)}
    globalThis.parseLink = parseMindMapInternalLink;
    globalThis.createLink = createMindMapInternalLinkHref;
    globalThis.resolveLink = resolveMindMapInternalLink;
    globalThis.rewriteText = rewriteMindMapInternalLinksInText;
`, context);

const href = context.createLink('smdp', 'tab-a', 'doc-1');
const parsed = context.parseLink(href);
assert.equal(href, 'mindmap://card?v=1&doc=doc-1&tab=tab-a&node=smdp');
assert.deepEqual({
    kind: parsed.kind,
    documentId: parsed.documentId,
    tabId: parsed.tabId,
    nodeId: parsed.nodeId,
}, {
    kind: 'mindmap-card',
    documentId: 'doc-1',
    tabId: 'tab-a',
    nodeId: 'smdp',
});

const resolved = context.resolveLink(parsed);
assert.equal(resolved.node.topic, 'SMDP', '导图内链接应能解析到目标卡片');
assert.equal(resolved.tab.id, 'tab-a', '导图内链接应保留目标页面');

const remapped = context.rewriteText(
    `请参阅 [SMDP](${href})。`,
    {
        sourceDocumentId: 'doc-1',
        destinationDocumentId: 'doc-2',
        tabIdMap: new Map([['tab-a', 'tab-new']]),
    },
);
assert.equal(
    remapped,
    '请参阅 [SMDP](mindmap://card?v=1&doc=doc-2&tab=tab-new&node=smdp)。',
    '导入页面时应同步改写文档和页面 ID',
);

assert.match(renderMD, /kind === 'mindmap-card'/, 'Markdown 渲染器应识别导图内链接');
assert.match(renderMD, /openMindMapInternalLinkPreview\(normalizedTarget\)/, '点击导图内链接应打开预览');
assert.match(html, /id="mindMapLinkPreview"/, '页面应提供导图内链接预览面板');
assert.match(html, /id="btn-mindmap-link-jump"/, '预览面板应提供跳转按钮');
assert.match(html, /id="btn-mindmap-link-jump"[\s\S]*ri-arrow-right-up-line/, '跳转按钮应使用可见的跳转图标');
assert.doesNotMatch(html, /ri-corner-up-right-line/, '不应使用项目未加载的跳转图标类');
assert.match(html, /class="mindmap-link-preview-action danger" id="btn-mindmap-link-close"/, '关闭按钮应使用危险态样式');
assert.match(html, /\.mindmap-link-preview-action\.danger:hover[^{}]*\{[\s\S]*?transform: rotate\(90deg\)/, '关闭按钮应沿用 Mermaid 预览的旋转交互');
assert.doesNotMatch(html, /mindmap-link-preview-(?:kicker|meta)|mindMapLinkPreviewMeta/, '预览头部不应恢复上下辅助文字');
assert.match(html, /data-action="copy-mindmap-link"/, '卡片菜单应提供复制导图内链接入口');
assert.match(html, /id="btn-insert-mindmap-link"/, '编辑器工具栏应提供插入导图内链接入口');
assert.match(html, /data-cmd="insert-mindmap-link"/, '编辑器右键菜单应提供插入导图内链接入口');
assert.match(ui, /card-content-preview, \.mindmap-link-preview, \.md-content a/, '画布交互应避让链接和预览面板');
assert.match(ui, /function isSameMindMapInternalLinkTarget[\s\S]*?panel\.classList\.contains\('is-open'\)[\s\S]*?closeMindMapInternalLinkPreview\(\)/,
    '再次点击当前预览链接时应关闭预览窗口');
assert.match(ui, /function jumpToMindMapInternalLinkTarget[\s\S]*?activateMindMapTab\(target\.tabId\)/,
    '只有点击预览面板的跳转按钮才允许切换页面');
assert.doesNotMatch(
    mindMap.slice(linkStart, linkEnd),
    /relations\.(?:push|splice)|data\.relations\s*=\s*\[/,
    '导图内链接模块不得创建或修改卡片关联关系',
);

console.log('导图内链接校验通过：协议、目标解析、导入改写、预览入口与关联隔离完整。');
