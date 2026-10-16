'use strict';

const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { app, BrowserWindow } = require('electron');

// SECTION 多选删除页面环境
let window;
async function evaluate(code) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        try { return { value: await eval(${JSON.stringify(code)}) }; }
        catch (error) { return { error: error.stack }; }
    })()`, true);
    if (result.error) throw new Error(result.error);
    return result.value;
}
const settle = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
async function snapshot() {
    await settle();
    return evaluate(`({
        errors: [...deletionErrors],
        data: [...collectMindMapNodeIds(state.data)].sort(),
        cards: [...document.querySelectorAll('.node-card')].map(card => card.dataset.nodeId).sort(),
        connectors: [...document.querySelectorAll('.tree-connector')].map(path => path.dataset.nodeId).sort(),
        validPaths: [...document.querySelectorAll('.tree-connector')].every(path => path.getTotalLength() > 0),
        preservedCards: [...document.querySelectorAll('.node-card')].every(card => oldCards.get(card.dataset.nodeId) === card),
        preservedFrames: [...document.querySelectorAll('.interactive-block-frame')].every(frame => {
            const old = oldFrames.get(frame.closest('.node-card').dataset.nodeId);
            return old?.frame === frame && old.source === frame.contentWindow && deletionRuns.get(old.source) === 1;
        }),
        noEmptyContainers: [...document.querySelectorAll('.children-container')].every(container => container.childElementCount > 0)
    })`);
}
function check(result, label) {
    assert.deepEqual(result.errors, [], `${label}：删除和渲染过程不得抛出异常`);
    assert.deepEqual(result.cards, result.data, `${label}：卡片 DOM 与剩余数据一致`);
    assert.deepEqual(result.connectors, result.data.filter(id => id !== 'r'), `${label}：剩余父子连接线完整`);
    assert.equal(result.validPaths, true, `${label}：连接线路径有效`);
    assert.equal(result.noEmptyContainers, true, `${label}：移除空分支容器`);
}
// !SECTION 多选删除页面环境

// SECTION 删除顺序与失效更新回归
async function run() {
    window = new BrowserWindow({ show: false, webPreferences: {
        contextIsolation: true, backgroundThrottling: false, partition: `node-deletion-${Date.now()}`
    } });
    await window.loadFile(resolve(__dirname, '../app/HTML/MindMap.html'));
    window.webContents.focus();
    await evaluate(`window.deletionErrors = []; window.deletionRuns = new Map();
        addEventListener('error', event => deletionErrors.push(event.message));
        addEventListener('message', event => {
            if (event.data?.type === 'node-deletion-ready') deletionRuns.set(event.source, (deletionRuns.get(event.source) || 0) + 1);
        });`);
    const content = '\n```interactive\n<main style="height:180px">交互内容</main><script>parent.postMessage({type:"node-deletion-ready"}, "*")</script>\n```';
    const cases = [
        ['c1'], ['c1', 'c2'], ['c1', 'p'], ['p', 'c1'],
        ['g', 'p'], ['c1', 'p', 'q1', 'q'], ['r', 'c1'], ['q1', 'p']
    ];
    for (const selected of cases) {
        await evaluate(`
            state.data = { id: 'r', topic: 'root', children: [
                { id: 'p', topic: 'New', dir: 'left', children: [
                    { id: 'c1', topic: 'c1', children: [{ id: 'g', topic: 'g' }] }, { id: 'c2', topic: 'c2' }
                ] },
                { id: 'q', topic: 'Sibling', dir: 'right', children: [{ id: 'q1', topic: 'q1' }] }
            ] };
            const addContent = node => { node.content = ${JSON.stringify(content)}; (node.children || []).forEach(addContent); };
            addContent(state.data);
            state.selectedIds = new Set(${JSON.stringify(selected)});
            state.selectedRelationId = null; state.selectedSummaryId = null;
            state.history = []; state.historyIndex = -1; state.mode = 'IDLE';
            mapSearchState.revealedNodeIds.clear(); mapSearchState.revealedRootDirections.clear();
            invalidateMindMapNodeIndex(); renderTree(); updateSelection(); recordHistory();
            deletionErrors.length = 0;
            window.oldCards = new Map([...document.querySelectorAll('.node-card')].map(card => [card.dataset.nodeId, card]));
            window.oldFrames = new Map([...document.querySelectorAll('.interactive-block-frame')].map(frame =>
                [frame.closest('.node-card').dataset.nodeId, { frame, source: frame.contentWindow }]));
            void 0;
        `);
        await evaluate(`new Promise((resolve, reject) => {
            const started = Date.now();
            const check = () => {
                if ([...oldFrames.values()].every(old => deletionRuns.get(old.source) === 1)) return resolve();
                if (Date.now() - started > 5000) return reject(new Error('交互内容加载超时'));
                setTimeout(check, 20);
            };
            check();
        })`);
        await settle();
        const expected = await evaluate(`(() => {
            const deleted = new Set();
            state.selectedIds.forEach(id => {
                if (id !== state.data.id) collectMindMapNodeIds(findNode(state.data, id), deleted);
            });
            return [...collectMindMapNodeIds(state.data)].filter(id => !deleted.has(id)).sort();
        })()`);
        await evaluate('document.getElementById("btn-delete").click()');
        const result = await snapshot();
        assert.deepEqual(result.data, expected, `${selected}：删除范围与选中的子树一致，保留根节点`);
        check(result, selected.join(' → '));
        assert.equal(result.preservedCards, true, `${selected}：保留剩余卡片 DOM`);
        assert.equal(result.preservedFrames, true, `${selected}：保留剩余 iframe 运行实例`);
        assert.equal(await evaluate(`(() => {
            const root = state.data;
            const rootCard = document.getElementById('card-r');
            return ['left', 'right'].every(side =>
                Boolean(rootCard.querySelector('[data-action="fold-root-' + side + '"]')) ===
                root.children.some(child => (child.dir === 'left') === (side === 'left')))
                && [...document.querySelectorAll('.node-card:not(.is-root)')].every(card =>
                    Boolean(card.querySelector('[data-action="fold"]')) === Boolean(findNode(root, card.dataset.nodeId).children?.length));
        })()`), true, `${selected}：父节点折叠按钮与剩余子节点一致`);
    }
    await evaluate('updateChildrenDOM("p")');
    check(await snapshot(), '更新已删除父节点');
    await evaluate('document.getElementById("card-q").remove(); updateChildrenDOM("q")');
    check(await snapshot(), '父卡片 DOM 缺失');
    console.log(`节点删除检查通过：${cases.length} 个场景保留剩余卡片和 iframe，数据、折叠按钮与连接线一致。`);
}
// !SECTION 删除顺序与失效更新回归

app.whenReady().then(async () => {
    try { await run(); app.exit(0); }
    catch (error) { console.error(error); app.exit(1); }
    finally { window?.destroy(); }
});
