'use strict';

const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { app, BrowserWindow } = require('electron');

// SECTION 移动与粘贴页面环境
let window;
async function evaluate(code) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        try { return { value: await eval(${JSON.stringify(code)}) }; }
        catch (error) { return { error: error.stack }; }
    })()`, true);
    if (result.error) throw new Error(result.error);
    return result.value;
}
async function settle() {
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}
async function waitForFrames() {
    await evaluate(`new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            if ([...document.querySelectorAll('.interactive-block-frame')].every(frame => frameRuns.has(frame.contentWindow))) return resolve();
            if (Date.now() - start > 5000) return reject(new Error('交互内容加载超时'));
            setTimeout(check, 20);
        };
        check();
    })`);
    await settle();
}
const content = '\n```interactive\n<main style="height:100px">交互内容</main><script>parent.postMessage({type:"movement-ready"}, "*")</script>\n```';
async function reset(options = {}) {
    await evaluate(`
        state.data = { id: 'r', topic: 'root', foldedLeft: false, foldedRight: false, children: [
            { id: 'p', topic: 'left', dir: 'left', children: [
                { id: 'a', topic: 'a', children: [{ id: 'a1', topic: 'a1' }] },
                { id: 'b', topic: 'b' }, { id: 'c', topic: 'c' }
            ] },
            { id: 'q', topic: 'right', dir: 'right', children: [{ id: 'd', topic: 'd' }] }
        ] };
        const options = ${JSON.stringify(options)};
        if (options.folded) state.data.children[1].folded = true;
        if (options.rootFolded) state.data.foldedRight = true;
        const addContent = node => { node.content = ${JSON.stringify(content)}; (node.children || []).forEach(addContent); };
        addContent(state.data);
        state.rainbowMode = true; state.mode = 'IDLE'; state.activeDockIndex = -1;
        state.selectedIds = new Set(); state.selectedRelationId = null; state.selectedSummaryId = null;
        state.history = []; state.historyIndex = -1;
        mapSearchState.revealedNodeIds.clear(); mapSearchState.revealedRootDirections.clear();
        if (options.revealed) { state.data.children[1].folded = true; mapSearchState.revealedNodeIds.add('q'); }
        invalidateMindMapNodeIndex(); renderTree(); updateSelection(); recordHistory();
        window.oldCards = new Map([...document.querySelectorAll('.node-card')].map(card => [card.dataset.nodeId, card]));
        window.oldFrames = new Map([...document.querySelectorAll('.interactive-block-frame')].map(frame =>
            [frame.closest('.node-card').dataset.nodeId, { frame, source: frame.contentWindow }]));
        movementErrors.length = 0;
        void 0;
    `);
    await waitForFrames();
}
async function drag(ids, targetId, dropType, copy = false, left = false) {
    await evaluate(`
        state.selectedIds = new Set(${JSON.stringify(ids)}); state.mode = 'DRAGGING';
        state.drag = { source: 'node', nodeId: ${JSON.stringify(ids[0])}, targetId: ${JSON.stringify(targetId)}, dropType: ${JSON.stringify(dropType)} };
        const rect = document.getElementById('card-r').getBoundingClientRect();
        onMouseUp({ ctrlKey: ${copy}, altKey: false, clientX: rect.left + rect.width * ${left ? 0.25 : 0.75} });
        void 0;
    `);
}
async function check(label, mayReload = []) {
    await waitForFrames();
    const result = await evaluate(`(() => {
        const cards = [...document.querySelectorAll('.node-card')];
        const walk = (node, isLeft = false, color = null) => {
            const card = document.getElementById('card-' + node.id);
            if (!card || card.classList.contains('left-side') !== isLeft) return false;
            if (color && (card.dataset.rainbowColor !== color || card.style.getPropertyValue('--node-color') !== color)) return false;
            const root = node === state.data;
            return (root ? ['left', 'right'] : [isLeft ? 'left' : 'right']).every(side => {
                const children = (node.children || []).filter(child => !root || (child.dir === 'left') === (side === 'left'));
                const visible = root ? !node[side === 'left' ? 'foldedLeft' : 'foldedRight'] : !node.folded || isMapNodeTemporarilyExpanded(node.id);
                const wrapper = root ? card.parentElement : card.parentElement;
                const selector = root ? ':scope > .children-container' + (side === 'left' ? '.left-side' : ':not(.left-side)') : ':scope > .children-container';
                const container = wrapper.querySelector(selector);
                const actual = container ? [...container.children].map(unit => unit.querySelector('.node-card').dataset.nodeId) : [];
                const expected = visible ? children.map(child => child.id) : [];
                if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
                if (Boolean(card.querySelector('[data-action="' + (root ? 'fold-root-' + side : 'fold') + '"]')) !== Boolean(children.length)) return false;
                return !visible || children.every(child => walk(child, side === 'left', root
                    ? 'hsl(' + getStableHue(child.id) + ', 85%, 88%)' : darkenHSL(color, 5)));
            });
        };
        return {
            errors: [...movementErrors], structure: walk(state.data),
            cardsPreserved: [...oldCards].every(([id, card]) => document.getElementById('card-' + id) === card),
            framesPreserved: [...oldFrames].every(([id, old]) => ${JSON.stringify(mayReload)}.includes(id)
                || (old.frame.isConnected && old.frame.contentWindow === old.source && frameRuns.get(old.source) === 1)),
            ids: cards.map(card => card.dataset.nodeId).sort(),
            lines: [...document.querySelectorAll('.tree-connector')].map(path => path.dataset.nodeId).sort(),
            validPaths: [...document.querySelectorAll('.tree-connector')].every(path => path.getTotalLength() > 0),
            history: state.history.length
        };
    })()`);
    assert.deepEqual(result.errors, [], `${label}：页面无异常`);
    assert.equal(result.structure, true, `${label}：顺序、方向、折叠按钮与彩虹颜色一致`);
    assert.equal(result.cardsPreserved, true, `${label}：保留已有卡片 DOM`);
    assert.equal(result.framesPreserved, true, `${label}：保留 iframe 运行实例`);
    assert.deepEqual(result.lines, result.ids.filter(id => id !== 'r'), `${label}：连接线完整`);
    assert.equal(result.validPaths, true, `${label}：连接线路径有效`);
    return result;
}
// !SECTION 移动与粘贴页面环境

// SECTION 移动与批量插入回归
async function run() {
    console.log('开始节点移动与粘贴页面检查');
    window = new BrowserWindow({ show: false, webPreferences: {
        contextIsolation: true, backgroundThrottling: false, partition: `node-movement-${Date.now()}`
    } });
    await window.loadFile(resolve(__dirname, '../app/HTML/MindMap.html'));
    console.log('页面已加载');
    window.webContents.focus();
    await evaluate(`window.movementErrors = []; window.frameRuns = new Map();
        window.nativeMoveBefore = Element.prototype.moveBefore;
        addEventListener('error', event => movementErrors.push(event.message));
        addEventListener('message', event => {
            if (event.data?.type === 'movement-ready') frameRuns.set(event.source, (frameRuns.get(event.source) || 0) + 1);
        });`);
    assert.equal(await evaluate('typeof nativeMoveBefore'), 'function', '当前 Electron 应支持保留 iframe 的原子搬移');
    const cases = [
        { ids: ['a'], target: 'c', type: 'AFTER', expected: ['b', 'c', 'a'] },
        { ids: ['c', 'a'], target: 'b', type: 'AFTER', expected: ['b', 'a', 'c'] },
        { ids: ['a'], target: 'q', type: 'CHILD' },
        { ids: ['p'], target: 'q', type: 'CHILD' },
        { ids: ['a'], target: 'r', type: 'CHILD' },
        { ids: ['q'], target: 'r', type: 'CHILD', left: true },
        { ids: ['a'], target: 'q', type: 'CHILD', folded: true },
        { ids: ['a'], target: 'q', type: 'CHILD', revealed: true },
        { ids: ['a'], target: 'q', type: 'CHILD', copy: true },
        { ids: ['a'], target: 'd', type: 'BEFORE', copy: true },
        { ids: ['a'], target: 'b', type: 'BEFORE', noop: true }
    ];
    for (const item of cases) {
        await reset(item);
        await drag(item.ids, item.target, item.type, Boolean(item.copy), Boolean(item.left));
        const result = await check(JSON.stringify(item));
        assert.equal(result.history, item.noop ? 1 : 2, '有效移动记录一次历史，无变化移动不记录历史');
        if (item.expected) assert.deepEqual(await evaluate('findNode(state.data, "p").children.map(node => node.id)'), item.expected);
        console.log('通过：' + item.ids.join(',') + ' ' + item.type + ' ' + item.target);
    }
    for (const target of ['p', 'q', 'r']) {
        await reset({ folded: target === 'q', rootFolded: target === 'r' });
        await evaluate(`state.selectedIds = new Set(['${target}']);
            pasteMindMapNodesToSelection([{ id: 'copy', topic: '粘贴', content: ${JSON.stringify(content)}, children: [{ id: 'copy-child', topic: '子节点' }] }, { id: 'copy2', topic: '第二张' }]); void 0;`);
        await check('批量粘贴到 ' + target);
        assert.equal(await evaluate(`state.selectedIds.size === 2 && [...state.selectedIds].every(id => document.getElementById('card-' + id)?.classList.contains('selected'))`), true, '选中实际新增的卡片');
        console.log('通过：批量粘贴到 ' + target);
    }
    // 旧宿主回退不得移动未选中的兄弟节点。
    await evaluate('Element.prototype.moveBefore = undefined');
    for (const item of [{ target: 'c', type: 'AFTER' }, { target: 'q', type: 'CHILD' }]) {
        await reset();
        await drag(['a'], item.target, item.type);
        await check('旧宿主 ' + item.type, ['a', 'a1']);
        console.log('通过：旧宿主 ' + item.type);
    }
    await evaluate('Element.prototype.moveBefore = nativeMoveBefore; void 0');
    await reset();
    await evaluate(`state.mode = 'DRAGGING'; state.drag = { source: 'dock', targetId: 'p', dropType: 'CHILD', data: { question: 'Dock', answer: ${JSON.stringify(content)} } };
        onMouseUp({ ctrlKey: true, clientX: 0 }); void 0;`);
    await check('Dock 拖入');
    console.log('节点移动与粘贴检查通过：排序、跨父节点及左右移动、折叠展开、复制拖动、批量粘贴、旧宿主回退和 Dock 插入。');
}
// !SECTION 移动与批量插入回归

app.whenReady().then(async () => {
    try { await run(); app.exit(0); }
    catch (error) { console.error(error); app.exit(1); }
    finally { window?.destroy(); }
});
