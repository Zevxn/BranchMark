import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readMindMapSource();
const plainTextParserStart = source.indexOf('function parseMindMapPlainText');
const plainTextParserEnd = source.indexOf('function createMindMapNodeFromPlainText', plainTextParserStart);
const helperStart = source.indexOf('function isMarkdownFile');
const helperEnd = source.indexOf('function initializeNativeDragDrop', helperStart);
const markdownHeaderStart = source.indexOf('function extractMarkdownHeader');
const markdownHeaderEnd = source.indexOf('// !SECTION Markdown 拖拽导入', markdownHeaderStart);

assert.ok(plainTextParserStart >= 0 && plainTextParserEnd > plainTextParserStart,
    '应能定位粘贴与拖放共用的文本解析函数');
assert.ok(helperStart >= 0 && helperEnd > helperStart, '应能定位 Markdown 文件拖放辅助函数');
assert.ok(markdownHeaderStart >= 0 && markdownHeaderEnd > markdownHeaderStart,
    '应能定位 Markdown 标题提取函数');

const plainTextParserSource = source.slice(plainTextParserStart, plainTextParserEnd);
const helperSource = source.slice(helperStart, helperEnd);
const markdownHeaderSource = source.slice(markdownHeaderStart, markdownHeaderEnd);
const context = vm.createContext({});
vm.runInContext(`
    ${helperSource}
    globalThis.dropHelpers = { isMarkdownFile, normalizeMarkdownMathDelimiters, readDroppedMarkdownFiles };
`, context);

const files = [
    { name: '研究笔记.md', text: async () => '# 原始一级标题\n\n行内公式 \\(x+1\\)' },
    { name: 'UPPER.MD', text: async () => '保留完整内容' },
    { name: '忽略.txt', text: async () => '不应导入' },
];

const nodes = await context.dropHelpers.readDroppedMarkdownFiles({ files });
assert.equal(nodes.length, 2, '只应读取 .md 文件');
assert.equal(nodes[0].topic, '研究笔记', '卡片名称应使用不含 .md 扩展名的文件名');
assert.equal(nodes[0].content, '# 原始一级标题\n\n行内公式 $x+1$', '卡片内容应保留全文并规范化公式分隔符');
assert.equal(nodes[1].topic, 'UPPER', '扩展名匹配应不区分大小写');
assert.equal(nodes[1].content, '保留完整内容');
assert.equal(context.dropHelpers.isMarkdownFile({ name: 'not-markdown.pdf' }), false);

const legacyMath = [
    String.raw`行内 \(\tau_t=\pi_\tau(b_t)\)`,
    '',
    String.raw`\[`,
    String.raw`\tau_t=\pi_\tau(b_t)`,
    String.raw`\]`,
    '',
    '行内代码：`\\(do_not_change\\)`',
    '',
    '```md',
    String.raw`\[do_not_change\]`,
    '```',
].join('\n');
const normalizedMath = context.dropHelpers.normalizeMarkdownMathDelimiters(legacyMath);
assert.equal(normalizedMath, `行内 $\\tau_t=\\pi_\\tau(b_t)$

$$
\\tau_t=\\pi_\\tau(b_t)
$$

行内代码：\`\\(do_not_change\\)\`

\`\`\`md
\\[do_not_change\\]
\`\`\``, '应转换公式分隔符，同时跳过行内代码和围栏代码块');

const dropHandlerStart = source.indexOf("app.addEventListener('drop'");
const dropHandlerEnd = source.indexOf('\n    });\n}', dropHandlerStart);
const dropHandler = source.slice(dropHandlerStart, dropHandlerEnd);
assert.match(dropHandler, /async \(e\)/, '文件读取前 drop 处理器必须等待异步 File API');
assert.match(dropHandler, /targetNode\.children\.push\(\.\.\.newNodes\)/, '多个 Markdown 文件应批量添加为子节点');
assert.match(dropHandler, /parent\.children\.splice\(insertIndex, 0, \.\.\.newNodes\)/, '多个 Markdown 文件应批量添加为兄弟节点');
assert.match(dropHandler, /recordHistory\(\)/, '拖放创建节点后应写入历史和持久化流程');

const initializeStart = source.indexOf('function initializeNativeDragDrop');
const initializeEnd = source.indexOf('/**\n * 提取 Markdown 标题', initializeStart);
const initializeSource = source.slice(initializeStart, initializeEnd);
const listeners = {};
const targetNode = { id: 'target', topic: '目标节点', children: [] };
const rootNode = { id: 'root', topic: '根节点', children: [targetNode] };
const targetCard = {
    dataset: { nodeId: 'target' },
    classList: { add() {}, remove() {} },
    contains: () => false,
    getBoundingClientRect: () => ({ left: 100, right: 460, top: 100, bottom: 300, width: 360, height: 200 }),
};
const app = { addEventListener: (type, handler) => { listeners[type] = handler; } };
const insertLine = { style: {} };
let historyCount = 0;
let updatedParentId = null;

const integrationContext = vm.createContext({
    app,
    console,
    document: {
        getElementById: id => id === 'app' ? app : insertLine,
        querySelectorAll: () => [],
    },
    state: { data: rootNode },
    findNode: (node, id) => node.id === id
        ? node
        : (node.children || []).map(child => integrationContext.findNode(child, id)).find(Boolean),
    findParent: (node, id) => (node.children || []).some(child => child.id === id)
        ? node
        : (node.children || []).map(child => integrationContext.findParent(child, id)).find(Boolean),
    generateNodeId: () => 'new-node',
    recordHistory: () => { historyCount += 1; },
    updateChildrenDOM: id => { updatedParentId = id; },
    showTopToast: () => {},
});

vm.runInContext(`
    ${plainTextParserSource}
    ${helperSource}
    ${initializeSource}
    ${markdownHeaderSource}
    initializeNativeDragDrop();
`, integrationContext);
await listeners.drop({
    preventDefault() {},
    clientX: 280,
    clientY: 200,
    target: { closest: selector => selector === '.node-card' ? targetCard : null },
    dataTransfer: {
        files: [{ name: '拖入节点.md', text: async () => '## Markdown 内容' }],
        getData: () => { throw new Error('Markdown 文件拖放不应读取 text/plain 路径'); },
    },
});

assert.equal(targetNode.children.length, 1, '拖到卡片中部应创建一个子节点');
assert.equal(targetNode.children[0].topic, '拖入节点');
assert.equal(targetNode.children[0].content, '## Markdown 内容');
assert.equal(historyCount, 1, '一次文件拖放应只记录一次历史');
assert.equal(updatedParentId, 'target', '创建节点后应局部刷新目标节点的子树');

targetNode.children = [];
historyCount = 0;
updatedParentId = null;
await listeners.drop({
    preventDefault() {},
    clientX: 280,
    clientY: 200,
    target: { closest: selector => selector === '.node-card' ? targetCard : null },
    dataTransfer: {
        files: [],
        getData: type => type === 'text/plain' ? '## **拖放标题**\r\n拖放正文' : '',
    },
});

assert.equal(targetNode.children.length, 1, '拖放纯文本应创建一个节点');
assert.equal(targetNode.children[0].topic, '拖放标题',
    '拖放文本应与粘贴文本使用相同的 Markdown 标题解析规则');
assert.equal(targetNode.children[0].content, '拖放正文');
assert.equal(historyCount, 1, '一次纯文本拖放应只记录一次历史');
assert.equal(updatedParentId, 'target');

console.log('Markdown 文件拖放校验通过：文件名映射标题，完整文件内容映射卡片正文。');
