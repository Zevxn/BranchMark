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
const initializeEnd = source.indexOf('/**', initializeStart);
assert.ok(initializeEnd > initializeStart, '应准确定位拖放初始化模块的结束位置');
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
    generateNodeId: () => 'new-node',
    recordHistory: () => { historyCount += 1; },
    updateChildrenDOM: id => { updatedParentId = id; },
    showTopToast: () => {},
});

vm.runInContext(`
    ${source.slice(source.indexOf('// SECTION 节点查询索引'), source.indexOf('// !SECTION 节点查询索引'))}
    ${plainTextParserSource}
    ${helperSource}
    ${initializeSource}
    ${markdownHeaderSource}
    initializeNativeDragDrop();
`, integrationContext);
const beforeFileDropIndex = integrationContext.getMindMapNodeIndex();
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
assert.notEqual(integrationContext.getMindMapNodeIndex(), beforeFileDropIndex, '文件拖入后应使旧索引失效');
assert.equal(integrationContext.findNode(rootNode, 'new-node'), targetNode.children[0]);

targetNode.children = [];
integrationContext.invalidateMindMapNodeIndex();
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

// 文档素材只能在目标插入成功后处理，Ctrl 仅覆盖本次拖放的模式。
let removals = 0;
let retentions = 0;
const draggedBlocks = [{ id: 'source-block' }];
integrationContext.mindMapDocumentState = { retainAfterDrop: false };
integrationContext.getMindMapDocumentDraggedBlocks = () => [...draggedBlocks];
integrationContext.completeMindMapDocumentDrop = (blocks, retain) => {
    assert.deepEqual(Array.from(blocks), draggedBlocks);
    assert.equal(historyCount, 1, '应先创建节点并记录历史，再处理预览内容');
    if (retain) retentions++;
    else removals++;
};
const dropDocument = async (card, y, ctrlKey = false) => listeners.drop({
    preventDefault() {}, clientX: 280, clientY: y, ctrlKey,
    target: { closest: () => card },
    dataTransfer: { files: [], getData: type => type === 'text/plain' ? '摘取正文' : '' },
});
historyCount = 0;
await dropDocument(null, 200);
await dropDocument({ ...targetCard, dataset: { nodeId: '不存在的节点' } }, 200);
assert.equal(removals, 0, '落在空白或无效节点上时不得移除素材');
await dropDocument(targetCard, 200);
historyCount = 0;
await dropDocument(targetCard, 200, true);
assert.equal(retentions, 1, '移除模式下按住 Ctrl 拖放应保留素材');
assert.equal(integrationContext.mindMapDocumentState.retainAfterDrop, false, 'Ctrl 不得修改记住的模式');
integrationContext.mindMapDocumentState.retainAfterDrop = true;
historyCount = 0;
await dropDocument(targetCard, 200);
assert.equal(retentions, 2, '保留模式下无需 Ctrl 即可保留素材');
integrationContext.mindMapDocumentState.retainAfterDrop = false;
assert.equal(removals, 1, '成功生成子节点后应移除对应素材');
historyCount = 0;
const beforeSiblingDropIndex = integrationContext.getMindMapNodeIndex();
await dropDocument(targetCard, 110);
assert.equal(removals, 2, '成功生成兄弟节点后同样应移除对应素材');
assert.notEqual(integrationContext.getMindMapNodeIndex(), beforeSiblingDropIndex, '兄弟节点插入后应使旧索引失效');
assert.equal(integrationContext.findParent(rootNode, 'new-node'), rootNode);
integrationContext.findParent = () => null;
await dropDocument(targetCard, 110);
assert.equal(removals, 2, '兄弟节点插入失败时应保留素材');

console.log('Markdown 文件拖放校验通过：文件名映射标题，完整文件内容映射卡片正文。');
