import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [marked, documentSource, io, renderMD] = await Promise.all([
    readFile('app/libs/marked.min.js', 'utf8'),
    readFile('app/JS/MindMap-Document.js', 'utf8'),
    readFile('app/JS/MindMap-IO.js', 'utf8'),
    readFile('app/JS/renderMD.js', 'utf8'),
]);
const context = vm.createContext({ console });
vm.runInContext(marked, context);
vm.runInContext(io.slice(io.indexOf('function isMarkdownFile'), io.indexOf('function initializeNativeDragDrop')), context);
vm.runInContext(documentSource, context);

const formula = '$$\nx^2 + y^2\n\n= z^2\n$$';
const table = '| 名称 | 数值 |\n| --- | --- |\n| 风速 | $v$ |';
const code = '```js\nconst text = "\\[原样保留\\]";\n\nconsole.log(text);\n```';
const mermaid = '```mermaid\ngraph LR\nA --> B\n```';
const markdown = ['# 标题', '正文 [资料][ref]。', formula, table, code, mermaid,
    '- 条目一\n  - 子条目\n- 条目二', '> 引用\n>\n> 第二段', '[ref]: https://example.com "参考文档"'].join('\n\n');
context.input = markdown;
const parsed = vm.runInContext('splitMindMapDocumentMarkdown(input)', context);
assert.deepEqual(Array.from(parsed.blocks, block => block.trim()), [
    '# 标题', '正文 [资料][ref]。', formula, table, code, mermaid,
    '- 条目一\n  - 子条目\n- 条目二', '> 引用\n>\n> 第二段',
], '分块应保留完整公式、表格、代码、Mermaid、嵌套列表和引用');
assert.match(parsed.references, /\[ref\]: <https:\/\/example.com> "参考文档"/);
context.fragments = [{ dataset: { markdownSource: parsed.blocks[1] } }, { dataset: { markdownSource: parsed.blocks[3] } }];
vm.runInContext('mindMapDocumentState.references = splitMindMapDocumentMarkdown(input).references', context);
const selection = vm.runInContext('getMindMapDocumentSelectionMarkdown(fragments)', context);
assert.equal(selection, `正文 [资料][ref]。\n\n${table}\n\n${parsed.references}`,
    '摘取非连续块时应保留 Markdown 源码及引用链接定义');
context.fragments = [{ dataset: { markdownSource: '    const x = 1;\n    console.log(x);\n' } }];
assert.equal(vm.runInContext('getMindMapDocumentSelectionMarkdown(fragments)', context),
    `    const x = 1;\n    console.log(x);\n\n${parsed.references}`, '缩进代码块的首行缩进不得丢失');
context.input = '正文 \\(x\\)\n\n\\[\ny^2\n\\]\n\n`\\(code\\)`';
assert.deepEqual(Array.from(vm.runInContext('splitMindMapDocumentMarkdown(input).blocks', context), block => block.trim()),
    ['正文 $x$', '$$\ny^2\n$$', '`\\(code\\)`'], '兼容公式分隔符，同时保护代码文本');

// 无需模拟整个页面：只核验拖拽数据与 DOM 顺序，界面交互在浏览器中验证。
const classes = () => {
    const names = new Set();
    return { add: name => names.add(name), remove: name => names.delete(name), contains: name => names.has(name) };
};
const block = (position, source) => ({
    position, dataset: { markdownSource: source },
    classList: classes(),
    compareDocumentPosition(other) { return position < other.position ? 4 : 2; },
});
context.document = {
    body: { append() {} },
    createElement: () => ({ style: {} }),
    removeEventListener() {},
};
context.Node = { DOCUMENT_POSITION_FOLLOWING: 4 };
vm.runInContext(renderMD.slice(renderMD.indexOf('// SECTION 文档预览内容块框选与拖拽')), context);
context.earlier = block(1, '# 第一块');
context.later = block(3, '后面的正文');
// SECTION 文档滚动条事件隔离
let focusCount = 0;
let preventedCount = 0;
context.scrollRoot = {
    addEventListener() {}, classList: classes(),
    getBoundingClientRect: () => ({ left: 20, top: 30, width: 200, height: 100 }),
    clientLeft: 1, clientTop: 1, clientWidth: 180, clientHeight: 80,
    focus: () => { focusCount += 1; },
};
vm.runInContext(`globalThis.scrollDragger = new RenderedMarkdownDragger(scrollRoot, {
    getMarkdown: getMindMapDocumentSelectionMarkdown, onSelectionChange() {},
}); scrollDragger.getTarget = () => earlier;`, context);
const mouseDown = (x, y) => context.scrollDragger.handleMouseDown({
    button: 0, clientX: x, clientY: y, target: { closest: () => null },
    preventDefault: () => { preventedCount += 1; },
});
for (const [x, y] of [[201, 60], [80, 111], [210, 120]]) mouseDown(x, y);
assert.equal(focusCount, 0, '拖动垂直或水平滚动条时不得抢占焦点');
assert.equal(preventedCount, 0, '滚动条区域不得阻止浏览器默认行为');
assert.equal(context.scrollDragger.selectedElements.size, 0, '滚动条操作不得改变内容块选择');
assert.equal(context.scrollDragger.isBoxSelecting, false, '滚动条操作不得启动框选');
mouseDown(80, 60);
assert.equal(focusCount, 1, '内容区仍应可以聚焦和选择内容块');
assert.equal(context.scrollDragger.selectedElements.has(context.earlier), true);
// !SECTION 文档滚动条事件隔离
context.transfer = {
    values: {}, setData(type, value) { this.values[type] = value; },
    getData(type) { return this.values[type] || ''; }, setDragImage() {},
};
vm.runInContext(`
    const dragger = new RenderedMarkdownDragger({ addEventListener() {}, classList: { remove() {} } }, {
        getMarkdown: getMindMapDocumentSelectionMarkdown, onSelectionChange() {},
    });
    dragger.getTarget = () => later;
    dragger.setSelection([later, earlier]);
    dragger.handleDragStart({ dataTransfer: transfer, stopPropagation() {} });
`, context);
assert.equal(context.transfer.values['text/plain'], `# 第一块\n\n后面的正文\n\n${parsed.references}`,
    '即使选择次序相反，也应按原文顺序拖出');
assert.equal(context.transfer.values['text/markdown'], context.transfer.values['text/plain']);

context.retained = block(2, '剩余正文 [资料][ref]。');
context.preview = {
    children: [context.earlier, context.retained, context.later], scrollTop: 25, classList: classes(),
    querySelector: () => context.preview.children.find(element => element.classList.contains('is-removing')),
};
for (const element of context.preview.children) {
    element.parentElement = context.preview;
    element.remove = () => {
        context.preview.children = context.preview.children.filter(child => child !== element);
        element.parentElement = null;
    };
}
const sourceEditor = { hidden: true };
const emptyState = { hidden: true };
context.root = { querySelector: selector => selector === '.document-source-editor' ? sourceEditor : emptyState };
vm.runInContext(`
    mindMapDocumentState.dragger = dragger;
    mindMapDocumentState.root = root;
    mindMapDocumentState.preview = preview;
    globalThis.draggedBlocks = getMindMapDocumentDraggedBlocks(transfer);
`, context);
assert.equal(context.draggedBlocks.length, 2, '应识别本次拖拽实际携带的块');
assert.equal(context.preview.children.length, 3, '拖拽开始不能删除预览内容');
assert.equal(vm.runInContext("getMindMapDocumentDraggedBlocks({getData: () => '其他拖拽'}).length", context), 0,
    '外部或过期拖拽不能移除当前素材');
await vm.runInContext('dragger.drag = null; removeMindMapDocumentBlocks(draggedBlocks)', context);
assert.deepEqual(context.preview.children, [context.retained], '成功后仅删除本次拖出的块');
assert.equal(vm.runInContext('mindMapDocumentState.source', context), `剩余正文 [资料][ref]。\n\n${parsed.references}`,
    '素材源码应同步更新，重新预览时不得恢复已摘取内容，引用定义应保留');
await vm.runInContext('removeMindMapDocumentBlocks([retained])', context);
assert.equal(vm.runInContext('mindMapDocumentState.source', context), '');
assert.equal(emptyState.hidden, false, '摘取完全部内容后应显示空面板');

// 连续摘取时立即更新数据，等待各批动画完成后再清理 DOM 和显示空状态。
const finishAnimations = [];
context.root.isConnected = true;
context.preview.hidden = false;
context.preview.children = [context.earlier, context.retained, context.later];
emptyState.hidden = true;
context.matchMedia = () => ({ matches: false });
context.getComputedStyle = () => ({ paddingTop: '6px', paddingBottom: '6px', marginTop: '2px', marginBottom: '2px', borderTopWidth: '1px', borderBottomWidth: '1px' });
for (const element of context.preview.children) {
    element.parentElement = context.preview;
    element.classList.remove('is-removing');
    element.getBoundingClientRect = () => ({ height: 40 });
    element.animate = () => ({ finished: new Promise(resolve => finishAnimations.push(resolve)) });
}
const firstRemoval = vm.runInContext('removeMindMapDocumentBlocks([earlier, later])', context);
assert.equal(context.preview.children.length, 3, '动画结束前应保留块元素用于收起动画');
assert.equal(context.earlier.draggable, false, '收起中的块不能再次拖拽');
assert.equal(vm.runInContext('mindMapDocumentState.source', context), `剩余正文 [资料][ref]。\n\n${parsed.references}`,
    '动画期间源码应立即排除已摘取块');
const secondRemoval = vm.runInContext('removeMindMapDocumentBlocks([retained])', context);
finishAnimations[0]();
finishAnimations[1]();
await firstRemoval;
assert.equal(context.preview.children.length, 1);
assert.equal(context.preview.hidden, false, '另一批动画仍在进行时不能提前隐藏预览');
finishAnimations[2]();
await secondRemoval;
assert.equal(context.preview.children.length, 0);
assert.equal(emptyState.hidden, false);
assert.equal(context.preview.classList.contains('is-removing-content'), false);

// Quicker 使用 Markdown 文件导入子程序；普通浏览器仍同步打开网页文件选择器。
const loaded = [];
const toasts = [];
const fileInput = { value: '旧文件', click() { this.clicks = (this.clicks || 0) + 1; } };
context.window = { __DEEPCONVO_NATIVE_QUICKER_HOST__: false };
context.$ = () => fileInput;
context.showTopToast = text => toasts.push(text);
context.renderMindMapDocumentSource = (content, name) => loaded.push({ content, name });
context.console = { ...console, warn() {} };
context.getQuickerSubprogramBridge = () => { throw new Error('浏览器不能调用 Quicker'); };
const browserLoad = context.loadMindMapDocumentFile();
assert.equal(fileInput.clicks, 1, '网页选择器应在用户点击的同步调用栈中打开');
await browserLoad;
assert.equal(fileInput.value, '');

context.window.__DEEPCONVO_NATIVE_QUICKER_HOST__ = true;
let result = { content: '# 原生文档\n\n正文', path: 'D:\\资料\\研究笔记.md', cancelled: false };
context.getQuickerSubprogramBridge = () => async (name, args) => {
    assert.equal(name, 'DeepConvoImportMarkDown', 'Markdown 加载应调用独立子程序，不能调用 JSON 导入');
    assert.deepEqual({ ...args }, {}, 'Markdown 子程序不需要输入变量');
    return result;
};
await context.loadMindMapDocumentFile();
assert.deepEqual(loaded[0], { content: result.content, name: '研究笔记.md' });
assert.equal(fileInput.clicks, 1, 'Quicker 模式不能退回网页文件选择器');
result = { content: '# 没有文件名的兼容返回', cancelled: false };
await context.loadMindMapDocumentFile();
assert.equal(loaded[1].name, '加载的 Markdown', '只有原有 content 字段也应支持加载');
result = { cancelled: true };
await context.loadMindMapDocumentFile();
assert.equal(loaded.length, 2, '取消后不得替换原素材');
assert.equal(toasts.length, 0, '取消不是读取失败');
for (const invalid of [{ error: '无法读取', success: false }, { error: '读取失败时仍为默认取消状态', cancelled: true }, { content: '' }, { content: '# 标题', filename: 'wrong.json' }]) {
    result = invalid;
    await context.loadMindMapDocumentFile();
}
assert.equal(loaded.length, 2, '错误、空内容和非 Markdown 文件应保留原素材');
assert.equal(toasts.length, 4);
context.getQuickerSubprogramBridge = () => null;
await context.loadMindMapDocumentFile();
assert.equal(toasts.length, 5, '缺少桥接能力应给出明确提示');
let resolveOld;
context.getQuickerSubprogramBridge = () => () => new Promise(resolve => { resolveOld = resolve; });
const oldLoad = context.loadMindMapDocumentFile();
context.getQuickerSubprogramBridge = () => async () => ({ content: '# 新文档' });
await context.loadMindMapDocumentFile();
resolveOld({ content: '# 旧文档' });
await oldLoad;
assert.equal(loaded.length, 3);
assert.equal(loaded.at(-1).content, '# 新文档', '重试成功后，旧请求的迟到结果不能覆盖新文档');
console.log('文档素材校验通过：源码保真、摘取动画、Quicker 文件加载及浏览器回退完整。');
