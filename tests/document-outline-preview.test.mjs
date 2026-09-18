import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [source, html] = await Promise.all([
    readMindMapSource(),
    readFile('app/HTML/MindMap.html', 'utf8'),
]);

assert.match(source, /MINDMAP_DOCUMENT_OUTLINE_MIN_LENGTH\s*=\s*1200/,
    '长文档目录应使用独立的字符数阈值');
assert.match(source, /MINDMAP_DOCUMENT_OUTLINE_MIN_HEADINGS\s*=\s*4/,
    '长文档目录应使用独立的标题数阈值');

const helperStart = source.indexOf('function getMindMapDocumentOutline');
const helperEnd = source.indexOf('function getMindMapContentPreviewDescriptor', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, '应提供可独立校验的渲染标题目录提取函数');

const context = vm.createContext({
    MINDMAP_DOCUMENT_OUTLINE_MIN_LENGTH: 1200,
    MINDMAP_DOCUMENT_OUTLINE_MIN_HEADINGS: 4,
    Array,
    Math,
    Number,
    String,
});
vm.runInContext(source.slice(helperStart, helperEnd), context, { filename: 'document-outline-preview.js' });

const renderedElements = [
    { tagName: 'H2', innerText: '它具体是怎么压缩的？' },
    { tagName: 'H2', innerText: '对你的维护决策问题来说' },
    { tagName: 'H2', innerText: '但有一个非常重要的问题' },
    { tagName: 'H3', innerText: '压缩后是否保留了真正需要的信息？' },
];
context.renderedBody = { querySelectorAll: () => renderedElements };
context.shortRenderedBody = { querySelectorAll: () => renderedElements.slice(0, 3) };
context.longDocument = 'x'.repeat(1200);
const outline = vm.runInContext(
    `getMindMapDocumentOutline(${JSON.stringify(`$$h_i^{(L)}$$\n$$z_t$$\n${'x'.repeat(1200)}`)}, renderedBody)`,
    context,
);
assert.deepEqual(Array.from(outline, item => ({ level: item.level, text: item.text })), [
    { level: 2, text: '它具体是怎么压缩的？' },
    { level: 2, text: '对你的维护决策问题来说' },
    { level: 2, text: '但有一个非常重要的问题' },
    { level: 3, text: '压缩后是否保留了真正需要的信息？' },
], '目录应只采信浏览器实际渲染的标题，不得把数学块误判为标题');
assert.equal(outline[2].element, renderedElements[2], '目录项应直接保留对应的真实标题元素');

const cardLayout = { offsetTop: 100, offsetParent: null };
context.scrollBody = {
    offsetTop: 40,
    offsetParent: cardLayout,
    scrollHeight: 1200,
    clientHeight: 400,
};
context.targetHeading = { offsetTop: 220, offsetParent: context.scrollBody };
assert.equal(vm.runInContext(
    `getMindMapHeadingScrollTop(scrollBody, targetHeading)`,
    context,
), 212, '目录定位应使用未缩放的文档布局坐标，一次滚动即到达标题');
context.targetHeading.offsetTop = 1100;
assert.equal(vm.runInContext(
    `getMindMapHeadingScrollTop(scrollBody, targetHeading)`,
    context,
), 800, '文档尾部标题应限制在最大可滚动位置');

assert.equal(vm.runInContext(
    `getMindMapDocumentOutline(longDocument, shortRenderedBody)`,
    context,
).length, 0, '标题数未达阈值时不应显示目录气泡');
assert.equal(vm.runInContext(
    `getMindMapDocumentOutline('short', renderedBody)`,
    context,
).length, 0, '文档长度未达阈值时不应显示目录气泡');

assert.match(source,
    /const body = card\.querySelector\('\.card-body'\);[\s\S]*?card\.classList\.contains\('simple'\) \|\| !body[\s\S]*?mode: 'content'/,
    '便利贴和正文折叠卡片应继续显示全文预览');
assert.match(source,
    /const headings = getMindMapDocumentOutline\(node\.content, body\);[\s\S]*?mode: 'outline'/,
    '正文展开的标准卡片达到阈值后应显示目录');
assert.match(source, /data-heading-index="\$\{index\}"/,
    '每个目录项应记录对应的标题序号');
assert.match(source, /const target = headings\[[^\]]+\]\?\.element;[\s\S]*?getMindMapHeadingScrollTop\(body, target\)[\s\S]*?body\.scrollTo\(\{ top: targetTop, behavior: 'smooth'/,
    '点击目录项应平滑滚动到卡片正文的对应标题');
const scrollHelperSource = source.slice(
    source.indexOf('function getMindMapLayoutOffsetTop'),
    source.indexOf('function getMindMapContentPreviewDescriptor'),
);
assert.doesNotMatch(scrollHelperSource, /getBoundingClientRect/,
    '目录滚动不得再混用经画布缩放的屏幕坐标');
assert.match(html, /\.card-content-preview\.outline-preview\s*\{/,
    '目录应复用内容预览气泡外层');
assert.match(html, /padding:\s*7px 8px 7px calc\(8px \+ var\(--outline-depth, 0\) \* 16px\)/,
    '目录项应按 Markdown 标题层级缩进');
const targetHighlightRule = html.match(/\.card-body \.mindmap-outline-target\s*\{([^}]*)\}/)?.[1] || '';
assert.doesNotMatch(targetHighlightRule, /box-shadow|border-left/,
    '目录定位后的标题高亮不应显示左侧蓝色竖条');

console.log('长文档目录气泡校验通过：阈值、真实渲染标题、层级与点击定位逻辑完整。');
