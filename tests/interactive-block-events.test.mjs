import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// SECTION 交互块事件归属检查
const source = await readFile(new URL('../app/JS/interactive-blocks.js', import.meta.url), 'utf8');
const host = vm.createContext({
    window: { addEventListener() {} }, document: { documentElement: {} },
    getComputedStyle: () => ({ colorScheme: 'dark', getPropertyValue: () => '' })
});
vm.runInContext(source, host);
const node = { owner: 'node', mode: 'IDLE', expanded: false, spacePressed: false };
const action = (event, context = {}) => host.getInteractiveBlockEventAction(event, { ...node, ...context });
const tab = { type: 'keydown', key: 'Tab', code: 'Tab' };
const nodeKeys = ['Enter', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape']
    .map(key => ({ type: 'keydown', key, code: key }));
const commandKeys = ['a', 'c', 'v', 'x', 'z', 'y', 'f', 'Enter'].flatMap(key =>
    ['ctrlKey', 'metaKey'].map(modifier => ({ type: 'keydown', key, code: key === 'Enter' ? key : `Key${key.toUpperCase()}`, [modifier]: true })));
const forwardedKeys = [tab, ...nodeKeys, ...commandKeys];
const fullscreen = { type: 'keydown', key: 'F11', code: 'F11' };
const space = { type: 'keydown', key: ' ', code: 'Space' };
const click = { type: 'mousedown', button: 0 };
const save = { type: 'keydown', key: 's', code: 'KeyS', ctrlKey: true };

for (const context of [{}, { expanded: true }, { owner: '' }, { owner: 'summary' },
    { expanded: true, activeElement: { tagName: 'TEXTAREA' } }]) {
    assert.equal(action(save, context), 'save');
    assert.equal(action({ ...save, key: 'S', ctrlKey: false, metaKey: true }, context), 'save');
}
assert.equal(action({ ...save, ctrlKey: false }), '');
assert.equal(action({ ...save, type: 'keyup' }), '');
assert.equal(action(fullscreen), '');
assert.equal(action(fullscreen, { nativeFullscreen: true, owner: '', expanded: true }), 'fullscreen');

assert.equal(action(click), 'select');
assert.equal(action(click, { mode: 'SELECTING' }), '');
assert.equal(action(click, { mode: 'DRAGGING' }), '');
assert.equal(action(click, { spacePressed: true }), 'canvas');
assert.equal(action({ type: 'wheel' }, { spacePressed: true }), 'canvas');
assert.equal(action({ type: 'wheel' }), '');
assert.equal(action(tab), 'tab');
for (const modifier of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) {
    assert.equal(action({ ...tab, [modifier]: true }), '');
}
assert.equal(action(tab, { mode: 'SELECTING' }), '');
for (const key of nodeKeys) {
    assert.equal(action(key), 'node-key');
    for (const modifier of ['shiftKey', 'altKey', 'isComposing', 'defaultPrevented']) {
        assert.equal(action({ ...key, [modifier]: true }), '');
    }
    for (const modifier of ['ctrlKey', 'metaKey']) {
        assert.equal(action({ ...key, [modifier]: true }), key.key === 'Enter' ? 'node-key' : '');
    }
    assert.equal(action({ ...key, keyCode: 229 }), '');
    for (const context of [{ mode: 'DRAGGING' }, { hasSelection: true }, { expanded: true }, { owner: '' }, { owner: 'summary' }]) {
        assert.equal(action(key, context), key.key === 'Escape' && context.expanded ? 'escape' : '');
    }
    for (const activeElement of [
        ...['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY'].map(tagName => ({ tagName })),
        { isContentEditable: true }, { tagName: 'SPAN', closest: () => ({ role: 'button' }) }
    ]) {
        assert.equal(action(key, { activeElement }), '');
    }
}
for (const key of commandKeys) {
    assert.equal(action(key), 'node-key');
    assert.equal(action({ ...key, key: key.key.toUpperCase() }), key.key === 'Enter' ? '' : 'node-key');
    for (const modifier of ['shiftKey', 'altKey', 'isComposing', 'defaultPrevented']) {
        assert.equal(action({ ...key, [modifier]: true }), '');
    }
    for (const context of [{ mode: 'DRAGGING' }, { hasSelection: true }, { expanded: true }, { owner: '' }, { owner: 'summary' }]) {
        assert.equal(action(key, context), '');
    }
    for (const activeElement of [{ tagName: 'TEXTAREA' }, { tagName: 'INPUT', type: 'text' },
        { tagName: 'SELECT' }, { isContentEditable: true }]) {
        assert.equal(action(key, { activeElement }), '');
    }
    assert.equal(action(key, { activeElement: { tagName: 'INPUT', type: 'range' } }), 'node-key');
}
for (const activeElement of [{ tagName: 'TEXTAREA' }, { tagName: 'BUTTON' }, { tagName: 'INPUT', type: 'range' }]) {
    assert.equal(action(tab, { activeElement }), '', '聚焦控件后 Tab 应保留控件焦点导航');
}
assert.equal(action(space), 'space');
for (const activeElement of [{ tagName: 'TEXTAREA' }, { tagName: 'INPUT', type: 'number' }, { isContentEditable: true }]) {
    assert.equal(action(space, { activeElement }), '');
}
assert.equal(action(space, { activeElement: { tagName: 'INPUT', type: 'range' } }), 'space');
for (const context of [{ expanded: true }, { owner: '' }, { owner: 'summary' }]) {
    for (const event of [tab, space, click]) assert.equal(action(event, context), '');
}
assert.equal(action({ type: 'contextmenu' }, { owner: 'summary' }), 'contextmenu');
assert.equal(action({ type: 'contextmenu' }, { expanded: true }), '');
assert.equal(action({ type: 'contextmenu' }, { owner: '' }), '');
// 导航开始后即使视图状态发生变化，也必须允许松开空格清理状态。
assert.equal(action({ type: 'keyup', code: 'Space' }, { expanded: true, owner: '', spacePressed: true }), 'space');
assert.equal(action({ type: 'keydown', key: 'Escape' }, { expanded: true }), 'escape');
assert.equal(action({ type: 'keydown', key: 'Escape', defaultPrevented: true }, { expanded: true }), '');
// !SECTION 交互块事件归属检查

// SECTION 实际 iframe 桥接检查
const listeners = new Map();
const messages = [];
let expanded = false;
let selectedText = '';
const document = {
    activeElement: null,
    documentElement: { hasAttribute: () => expanded },
    head: { appendChild() {} }, createElement: () => ({})
};
const iframe = vm.createContext({
    document, parent: { postMessage: message => messages.push(message) },
    getSelection: () => ({ toString: () => selectedText }),
    addEventListener(type, listener, capture) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push({ listener, capture: capture === true });
    }
});
host.window.__TAURI__ = { core: { invoke() {} } };
const html = host.createInteractiveBlockDocument('<main>控件</main>', 'node');
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], iframe);
function dispatch(input, beforeBubble) {
    messages.length = 0;
    const event = { ...input, defaultPrevented: input.defaultPrevented === true,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.stopped = true; }
    };
    const handlers = listeners.get(event.type) || [];
    for (const capture of [true, false]) {
        if (!capture) beforeBubble?.(event);
        for (const entry of handlers.filter(entry => entry.capture === capture)) {
            entry.listener(event);
            if (event.stopped) return event;
        }
    }
    return event;
}
assert.equal(dispatch(click).defaultPrevented, false);
assert.equal(messages[0].type, 'branchmark-interactive-event');
assert.equal(messages[0].event.type, 'mousedown');
assert.equal(dispatch(tab).defaultPrevented, true);
assert.equal(messages[0].event.key, 'Tab');
assert.equal(dispatch({ ...tab, shiftKey: true }).defaultPrevented, false);
assert.equal(messages.length, 0);
for (const key of forwardedKeys) {
    const event = dispatch(key, () => assert.equal(messages.length, 0, '卡片快捷键应等控件处理后再转发'));
    assert.equal(event.defaultPrevented, true);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].event.key, key.key);
    dispatch(key, event => event.preventDefault());
    assert.equal(messages.length, 0, '控件已消费的按键不得触发卡片操作');
    document.activeElement = { tagName: 'TEXTAREA' };
    assert.equal(dispatch(key).defaultPrevented, false);
    assert.equal(messages.length, 0);
    document.activeElement = null;
    selectedText = '控件文字';
    assert.equal(dispatch(key).defaultPrevented, false);
    assert.equal(messages.length, 0);
    selectedText = '';
    expanded = true;
    assert.equal(dispatch(key).defaultPrevented, false);
    assert.equal(messages.length, key.key === 'Escape' ? 1 : 0);
    expanded = false;
}
assert.equal(dispatch(fullscreen).defaultPrevented, true);
assert.equal(messages.length, 1, 'F11 应沿用 Tauri 全局全屏入口');
assert.equal(messages[0].event.key, 'F11');
document.activeElement = { tagName: 'TEXTAREA' };
assert.equal(dispatch(space).defaultPrevented, false);
assert.equal(messages.length, 0);
document.activeElement = { tagName: 'INPUT', type: 'range' };
assert.equal(dispatch(space).defaultPrevented, true);
assert.equal(dispatch({ ...space, repeat: true }).defaultPrevented, true);
assert.equal(messages[0].event.repeat, true);
expanded = true;
assert.equal(dispatch({ type: 'keyup', code: 'Space' }).defaultPrevented, true);
assert.equal(messages[0].event.type, 'keyup');
assert.equal(dispatch(tab).defaultPrevented, false);
assert.equal(messages.length, 0);
dispatch({ type: 'keydown', key: 'Escape', defaultPrevented: true });
assert.equal(messages.length, 0);
dispatch({ type: 'keydown', key: 'Escape' });
assert.equal(messages[0].event.key, 'Escape');
// 输入框和放大预览内也应在捕获阶段转发保存，阻止浏览器保存 iframe 页面。
document.activeElement = { tagName: 'TEXTAREA' };
for (const previewExpanded of [false, true]) {
    expanded = previewExpanded;
    const event = dispatch(save);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].event.key, 's');
    assert.equal(messages[0].event.ctrlKey, true);
}
assert.equal(dispatch({ type: 'contextmenu' }).defaultPrevented, true);
assert.equal(messages.length, 0);
// !SECTION 实际 iframe 桥接检查

// SECTION 宿主卡片快捷键转发检查
const hostKeys = [];
Object.assign(host, {
    state: { mode: 'IDLE' }, expanded: false, isSpacePressed: false,
    wrapper: { isConnected: true, closest: () => ({ matches: () => true }) },
    KeyboardEvent: class {
        constructor(type, options) { Object.assign(this, { type }, options); }
        preventDefault() { this.defaultPrevented = true; }
    }
});
host.document.body = { dispatchEvent: event => hostKeys.push(event) };
const handlerStart = source.indexOf('function handleInteraction(');
vm.runInContext(source.slice(handlerStart, source.indexOf('function scrollToTop(', handlerStart)), host);
expanded = false;
document.activeElement = null;
for (const key of [...forwardedKeys, fullscreen]) {
    dispatch(key);
    host.handleInteraction(messages[0].event, true);
}
assert.deepEqual(hostKeys.map(event => [event.key, event.code, event.ctrlKey, event.metaKey]),
    [...forwardedKeys, fullscreen].map(event => [event.key, event.code, event.ctrlKey === true, event.metaKey === true]),
    'iframe 按键及 Ctrl/Cmd 修饰键应完整进入宿主快捷键入口');
// !SECTION 宿主卡片快捷键转发检查

// SECTION 主页面快捷键调用检查
const mindMap = await readFile(new URL('../app/JS/MindMap.js', import.meta.url), 'utf8');
const operations = [];
Object.assign(host, {
    $: selector => ({ click: () => operations.push(selector) }),
    isMindMapSplitReaderOpen: () => false, isMapSearchOpen: () => false,
    getMindMapSummaryById: () => null, syncCurrentInput() {},
    findNode: () => ({ id: 'card' }),
    openMindMapEditor: () => operations.push('editor'), openMapSearch: () => operations.push('search'),
    closeMapSearch: () => operations.push('close-search'),
    selectAllMindMapNodes: () => operations.push('all'),
    copySelectedNodes: () => operations.push('copy'), pasteNodesToSelection: () => operations.push('paste'),
    cutSelectedNodes: () => operations.push('cut'), undo: () => operations.push('undo'), redo: () => operations.push('redo'),
    moveMindMapSelectionByArrow: key => operations.push(key)
});
host.state.selectedIds = new Set(['card']);
host.document.activeElement = { tagName: 'IFRAME', classList: { contains: () => false } };
host.document.getElementById = () => ({ classList: { contains: () => false } });
host.window.getSelection = () => ({ toString: () => '' });
host.window.addEventListener = (type, listener) => { if (type === 'keydown') host.onKeyDown = listener; };
const shortcutsStart = mindMap.lastIndexOf("window.addEventListener('keydown', (e) => {");
vm.runInContext(mindMap.slice(shortcutsStart, mindMap.indexOf('// recordHistory(); renderTree(); renderDock();', shortcutsStart)), host);
host.document.body.dispatchEvent = event => host.onKeyDown(event);
const expectedOperations = {
    Tab: '#btn-add-child', Enter: '#btn-add-sibling', Delete: '#btn-delete',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    a: 'all', c: 'copy', v: 'paste', x: 'cut', z: 'undo', y: 'redo', f: 'search'
};
for (const key of forwardedKeys) {
    operations.length = 0;
    dispatch(key);
    host.handleInteraction(messages[0].event, true);
    const expected = key.key === 'Enter' && (key.ctrlKey || key.metaKey) ? 'editor' : expectedOperations[key.key];
    assert.deepEqual(operations, expected ? [expected] : [], `${JSON.stringify(key)} 应调用主页面对应的卡片操作`);
}
host.isMapSearchOpen = () => true;
dispatch({ type: 'keydown', key: 'Escape', code: 'Escape' });
host.handleInteraction(messages[0].event, true);
assert.equal(operations.at(-1), 'close-search', '普通视图 Esc 应沿用宿主关闭搜索的逻辑');
// !SECTION 主页面快捷键调用检查

console.log('交互块事件归属与 iframe 桥接检查通过');
