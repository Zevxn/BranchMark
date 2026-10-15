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
const document = {
    activeElement: null,
    documentElement: { hasAttribute: () => expanded },
    head: { appendChild() {} }, createElement: () => ({})
};
const iframe = vm.createContext({
    document, parent: { postMessage: message => messages.push(message) },
    addEventListener(type, listener, capture) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push({ listener, capture: capture === true });
    }
});
const html = host.createInteractiveBlockDocument('<main>控件</main>', 'node');
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], iframe);
function dispatch(input) {
    messages.length = 0;
    const event = { ...input, defaultPrevented: input.defaultPrevented === true,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.stopped = true; }
    };
    const handlers = listeners.get(event.type) || [];
    for (const capture of [true, false]) {
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

console.log('交互块事件归属与 iframe 桥接检查通过');
