import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('app/JS/MindMap-UI.js', 'utf8');
const start = source.indexOf('// SECTION 分屏阅读');
const end = source.indexOf('// !SECTION 分屏阅读', start);

// SECTION 分屏阅读 DOM 替身
class Element {
    constructor(tag = 'div') {
        this.tag = tag;
        this.className = '';
        this.children = [];
        this.dataset = {};
        this.style = {};
        this.attributes = {};
        this.listeners = {};
        this.clientWidth = 1200;
        this.clientHeight = 740;
        this.isConnected = true;
        this.classList = {
            contains: name => this.className.split(' ').includes(name),
            add: name => { this.className += ` ${name}`; },
            remove: name => { this.className = this.className.split(' ').filter(item => item !== name).join(' '); },
        };
    }
    appendChild(child) { child.parent = this; this.children.push(child); }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren() { this.children = []; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    focus() { document.activeElement = this; }
    contains(element) { return this === element || this.children.some(child => child.contains(element)); }
    closest(selector) {
        if (this.classList.contains(selector.slice(1))) return this;
        return this.parent?.closest(selector) || null;
    }
    querySelectorAll(selector) {
        const matches = child => selector.startsWith('.') ? child.classList.contains(selector.slice(1))
            : child.tag === 'button' || child.tabIndex === 0;
        return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getClientRects() { return [{}]; }
    getBoundingClientRect() {
        const index = this.parent?.children.indexOf(this) ?? 0;
        return {
            width: parseFloat(this.parent?.style.gridTemplateColumns?.split(' ')[index]) || 1200,
            height: parseFloat(this.parent?.style.gridTemplateRows?.split(' ')[index]) || 740,
        };
    }
    hasPointerCapture(id) { return this.pointerId === id; }
    setPointerCapture(id) { this.pointerId = id; }
    releasePointerCapture() { this.pointerId = null; }
}
const elements = Object.fromEntries(['mindMapSplitReader', 'splitReaderGrid', 'splitReaderHeading',
    'btn-split-reader-close', 'btn-split-reader-layout', 'mindMapLinkPreview', 'imagePreviewModal', 'mermaidModal',
    'editorModal', 'modalTopicInput', 'editorTextarea', 'btn-close-modal']
    .map(id => [id, new Element(id.startsWith('btn') ? 'button' : 'div')]));
const reader = elements.mindMapSplitReader;
const grid = elements.splitReaderGrid;
reader.append(elements['btn-split-reader-close'], elements['btn-split-reader-layout'], grid);
const document = {
    body: new Element(), activeElement: new Element(), listeners: {},
    createElement: tag => new Element(tag),
    addEventListener(type, listener, options) { this.listeners[type] = { listener, options }; },
    createRange: () => ({ selectNodeContents: node => { selectedTextScope = node; } }),
};
let selectedTextScope;
const written = [];
const rendered = [];
const edited = [];
const nodes = [
    { id: 'a', topic: '<原始标题>', content: '# 正文 A', contentCollapsed: true },
    { id: 'b', topic: '', content: '', isSimple: true },
    { id: 'c', topic: 'C', content: '# 正文 C' },
];
const state = { selectedIds: new Set(['a', 'b']), data: nodes, view: { tx: 20, ty: 30, scale: 1.5 } };
const snapshot = JSON.stringify(nodes);
const context = vm.createContext({
    console, document, state, isSpacePressed: true,
    window: { innerWidth: 1200, getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
    $: selector => elements[selector.slice(1)],
    findNode: (data, id) => data.find(node => node.id === id),
    commitMindMapInlineEditor() {}, hideMindMapContentPreview() {}, closeMapSearch() {}, saveMindMapData() {},
    openMindMapEditor: (...args) => edited.push(args),
    recordHistory() {}, updateNodeDOM() {}, setCodeMenuOpen() {},
    closeMindMapInternalLinkPreview: () => elements.mindMapLinkPreview.classList.remove('is-open'),
    renderMarkdown: content => `<p>${content}</p>`,
    processRichContent: async body => { rendered.push(body); },
    ResizeObserver: class { observe() {} },
    chrome: { storage: { local: {
        get: async () => ({ mindmap_split_reader_widths: { 2: [0.6, 0.4], 3: ['invalid', 0, 1] } }),
        set: async values => { written.push(values); },
    } } },
});
vm.runInContext(source.slice(start, end), context);
const run = code => vm.runInContext(code, context);
run('initializeMindMapSplitReader()');
await new Promise(resolve => setImmediate(resolve));
// !SECTION 分屏阅读 DOM 替身

// SECTION 分屏阅读行为
for (const available of [0, 100, 600, 1200]) {
    const sizes = Array.from(run(`getMindMapSplitReaderSizes([0.01, 0.49, 0.5], ${available}, 280)`));
    assert.ok(sizes.every(size => Number.isFinite(size) && size >= Math.min(280, available / 3)));
    assert.ok(Math.abs(sizes.reduce((sum, size) => sum + size, 0) - available) < 1e-8);
}
run('openMindMapSplitReader()');
assert.equal(run('isMindMapSplitReaderOpen()'), true);
assert.equal(grid.children.length, 3);
assert.equal(grid.children[0].children[0].textContent, '<原始标题>', '标题应通过纯文本写入');
assert.match(grid.children[0].children[1].innerHTML, /正文 A/, '折叠卡片应显示完整正文');
assert.equal(grid.children[2].children[0].textContent, '未命名卡片');
assert.match(grid.children[2].children[1].innerHTML, /暂无正文/);
assert.equal(rendered.length, 2);
vm.runInContext(source.slice(source.indexOf('function initializeMapClickEvents()'),
    source.indexOf('// !SECTION 节点选择与键盘导航')), context);
run('initializeMapClickEvents()');
document.listeners.dblclick.listener({ target: grid.children[0].children[1] });
assert.equal(edited[0][0], nodes[0], '双击分屏正文应编辑该栏对应的卡片');
assert.deepEqual(edited[0].slice(1), [false, true]);
assert.equal(run('isSpacePressed'), false);
assert.ok(grid.style.gridTemplateColumns.startsWith('714px'), '应恢复两栏宽度比例');

grid.children[0].children[1].scrollTop = 123;
elements['btn-split-reader-layout'].onclick();
assert.equal(reader.dataset.layout, 'rows');
assert.equal(grid.children[0].children[1].scrollTop, 123, '切换布局不得重建正文或重置滚动');
elements['btn-split-reader-layout'].onclick();
run('resizeMindMapSplitReaderPair(0, 10000)');
const twoSizes = grid.style.gridTemplateColumns.split(' ').map(parseFloat);
assert.equal(twoSizes[2], 280, '拖动不得挤掉相邻栏');
run('saveMindMapSplitReaderWidths()');
assert.ok(written[0].mindmap_split_reader_widths[2][0] > 0.7);

const keydown = document.listeners.keydown;
assert.equal(keydown.options.capture, true, 'Esc 应在图片关闭前识别顶层预览');
const key = (value, extra = {}) => keydown.listener({ key: value, preventDefault() {}, stopPropagation() {}, ...extra });
elements.editorModal.classList.add('active');
key('Escape');
assert.equal(run('isMindMapSplitReaderOpen()'), true, '编辑窗口打开时分屏不得接管 Esc');
elements.editorModal.classList.remove('active');
elements.imagePreviewModal.classList.add('active');
key('Escape');
assert.equal(run('isMindMapSplitReaderOpen()'), true, '图片预览中的 Esc 不得退出分屏');
elements.imagePreviewModal.classList.remove('active');
elements.mindMapLinkPreview.classList.add('is-open');
key('Escape');
assert.equal(run('isMindMapSplitReaderOpen()'), true, '链接预览中的 Esc 应只关闭链接');
grid.children[0].children[1].focus();
key('a', { ctrlKey: true });
assert.equal(selectedTextScope, grid.children[0].children[1], '全选应限定当前栏正文');
key('Escape');
assert.equal(run('isMindMapSplitReaderOpen()'), false);
assert.equal(grid.children.length, 0);
assert.deepEqual([...state.selectedIds], ['a', 'b']);
assert.deepEqual(state.view, { tx: 20, ty: 30, scale: 1.5 });
assert.equal(JSON.stringify(nodes), snapshot, '阅读不能改变卡片数据');

state.selectedIds = new Set(['a', 'b', 'c']);
context.window.innerWidth = 700;
run('openMindMapSplitReader()');
assert.equal(reader.dataset.layout, 'rows', '窄窗口三栏应默认上下排列');
assert.equal(grid.children.length, 5);
elements['btn-split-reader-layout'].onclick();
run('resizeMindMapSplitReaderPair(0, -10000)');
const threeSizes = grid.style.gridTemplateColumns.split(' ').map(parseFloat);
assert.equal(threeSizes[0], 280);
assert.ok(Math.abs(threeSizes[4] - 1180 / 3) < 1e-8, '调整前两栏不得改变第三栏');
run('closeMindMapSplitReader(false)');
state.selectedIds = new Set(['a', 'missing']);
run('openMindMapSplitReader()');
assert.equal(run('isMindMapSplitReaderOpen()'), false, '无效选择不得打开空分屏');

state.selectedIds = new Set(['a', 'b']);
run('openMindMapSplitReader()');
const firstBody = grid.children[0].children[1];
const secondBody = grid.children[2].children[1];
firstBody.scrollTop = 123;
secondBody.scrollTop = 45;
state.editingNode = nodes[0];
state.isReadOnly = false;
elements.editorModal.classList.add('active');
elements.modalTopicInput.value = '修订标题';
elements.editorTextarea.value = '# 修订正文';
const closeStart = source.indexOf("$('#btn-close-modal').onclick = () => {");
vm.runInContext(source.slice(closeStart, source.indexOf('\n    };', closeStart) + 7), context);
elements['btn-close-modal'].onclick();
assert.equal(nodes[0].content, '# 修订正文', '完成编辑应保存原卡片');
assert.equal(grid.children[0].children[0].textContent, '修订标题');
assert.match(firstBody.innerHTML, /修订正文/, '保存后应刷新对应分屏栏');
assert.equal(grid.children[2].children[1], secondBody, '其他分屏栏不得重建');
assert.equal(secondBody.scrollTop, 45);
assert.equal(firstBody.scrollTop, 123);
assert.equal(document.activeElement, firstBody, '编辑完成后焦点应回到对应分屏栏');
assert.equal(run('isMindMapSplitReaderOpen()'), true);
assert.equal(elements.editorModal.classList.contains('active'), false);
// !SECTION 分屏阅读行为

console.log('分屏阅读校验通过：布局、尺寸边界、宽度记忆、退出层级和原始数据保留。');
