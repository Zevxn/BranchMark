'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const { app, BrowserWindow } = require('electron');

// SECTION 增量插入页面环境
const root = resolve(__dirname, '../app');
const server = http.createServer(async (request, response) => {
    try {
        const path = resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
        if (!path.startsWith(root + sep)) throw new Error('Invalid path');
        const body = await readFile(path);
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(path)];
        response.writeHead(200, { 'Content-Type': `${type || 'application/octet-stream'}; charset=utf-8` });
        response.end(body);
    } catch { response.writeHead(404); response.end(); }
});
let window;
async function evaluate(code) {
    const result = await window.webContents.executeJavaScript(`(async () => {
        try { return { value: await eval(${JSON.stringify(code)}) }; }
        catch (error) { return { error: error.stack }; }
    })()`, true);
    if (result.error) throw new Error(result.error);
    return result.value;
}
async function waitFor(condition) {
    await evaluate(`new Promise((resolve, reject) => {
        const started = Date.now();
        const check = () => {
            if (${condition}) return resolve();
            if (Date.now() - started > 5000) return reject(new Error('等待超时: ' + ${JSON.stringify(condition)}));
            setTimeout(check, 20);
        };
        check();
    })`);
}
// !SECTION 增量插入页面环境

// SECTION 新建节点与已有 iframe 保留
async function run() {
    window = new BrowserWindow({ show: false, webPreferences: {
        contextIsolation: true, backgroundThrottling: false, partition: `node-insertion-${Date.now()}`
    } });
    await window.loadURL(`http://127.0.0.1:${server.address().port}/HTML/MindMap.html`);
    window.webContents.focus();
    await evaluate(`
        window.frameRuns = new Map();
        addEventListener('message', event => {
            if (event.data?.type === 'node-insertion-test') {
                frameRuns.set(event.source, (frameRuns.get(event.source) || 0) + 1);
            }
        });
    `);
    const content = '\n```interactive\n<main style="height:400px">内容</main><script>parent.postMessage({type:"node-insertion-test"}, "*")</script>\n```';
    const cases = [
        { name: '根节点左侧兄弟', selected: 'left', action: 'sibling', rainbow: true },
        { name: '根节点右侧兄弟', selected: 'right', action: 'sibling' },
        { name: '左侧已有子树', selected: 'left', action: 'child', rainbow: true },
        { name: '右侧首个子节点', selected: 'right', action: 'child', rainbow: true },
        { name: '根节点首个右分支', selected: 'root', action: 'child', noRight: true, rainbow: true },
        { name: '展开折叠父节点', selected: 'left', action: 'child', folded: true, rainbow: true },
        { name: '搜索临时展开分支', selected: 'left', action: 'sibling', revealed: true, rainbow: true }
    ];
    for (const item of cases) {
        await evaluate(`
            state.data = { id: 'root', topic: '根节点', children: [
                { id: 'left', topic: '左节点', dir: 'left', children: [
                    { id: 'existing', topic: '已有子节点', children: [{ id: 'descendant', topic: '后代' }] }
                ] },
                ...(${Boolean(item.noRight)} ? [] : [{ id: 'right', topic: '右节点', dir: 'right', children: [] }])
            ] };
            const addContent = node => {
                node.content = ${JSON.stringify(content)};
                (node.children || []).forEach(addContent);
            };
            addContent(state.data);
            state.data.children[0].folded = ${Boolean(item.folded)};
            state.data.foldedLeft = ${Boolean(item.revealed)};
            state.data.foldedRight = ${Boolean(item.noRight)};
            mapSearchState.revealedRootDirections.clear();
            mapSearchState.revealedNodeIds.clear();
            if (${Boolean(item.revealed)}) mapSearchState.revealedRootDirections.add('left');
            state.rainbowMode = ${Boolean(item.rainbow)};
            state.selectedIds = new Set([${JSON.stringify(item.selected)}]);
            state.history = []; state.historyIndex = -1;
            invalidateMindMapNodeIndex();
            renderTree(); updateSelection(); recordHistory();
            window.oldCards = [...document.querySelectorAll('.node-card')];
            window.oldFrames = [...document.querySelectorAll('.interactive-block-frame')];
            window.oldWindows = oldFrames.map(frame => frame.contentWindow);
        `);
        await waitFor('oldWindows.every(frame => frameRuns.get(frame) === 1)');
        await evaluate(`document.getElementById('btn-add-${item.action}').click(); window.newId = [...state.selectedIds][0]`);
        await waitFor('document.activeElement === document.getElementById("card-" + newId)?.querySelector(".node-topic")');
        assert.equal(await evaluate('oldCards.every(card => document.getElementById(card.id) === card)'), true, `${item.name}：保留已有卡片 DOM`);
        assert.equal(await evaluate('oldFrames.every((frame, i) => frame.isConnected && frame.contentWindow === oldWindows[i] && frameRuns.get(oldWindows[i]) === 1)'), true, `${item.name}：保留 iframe 和运行实例`);
        assert.equal(await evaluate('document.querySelectorAll(".node-card.selected").length === 1 && document.getElementById("card-" + newId).classList.contains("selected")'), true, `${item.name}：同步新节点选中样式`);
        assert.equal(await evaluate(`
            (() => {
                const node = findNode(state.data, newId);
                const parent = findParent(state.data, newId);
                const card = document.getElementById('card-' + newId);
                const left = parent.id === 'root' ? node.dir === 'left' : isDescendantOfLeft(parent.id);
                const expected = parent.id === 'root' ? 'hsl(' + getStableHue(newId) + ', 85%, 88%)'
                    : darkenHSL(document.getElementById('card-' + parent.id).dataset.rainbowColor, 5);
                return card.classList.contains('left-side') === left
                    && (!state.rainbowMode || card.dataset.rainbowColor === expected)
                    && state.history.length === 2;
            })()
        `), true, `${item.name}：保持分支方向、彩虹颜色和历史记录`);
        await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
        }))`);
        assert.equal(await evaluate('document.activeElement.classList.contains("node-topic")'), false, `${item.name}：默认标题可直接完成编辑`);
        assert.equal(await evaluate('window.getSelection().toString()'), '', `${item.name}：完成编辑后清理标题选区`);
        const count = await evaluate('document.querySelectorAll(".node-card").length');
        for (const key of ['Enter', 'Tab']) {
            await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
                key: ${JSON.stringify(key)}, code: ${JSON.stringify(key)}, repeat: true, bubbles: true, cancelable: true
            }))`);
        }
        assert.equal(await evaluate('document.querySelectorAll(".node-card").length'), count, `${item.name}：长按不重复新建节点`);
    }
    // 完成默认标题后，按键应能继续新建；重复按键和输入法确认不能打断新标题编辑。
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
    })); window.nextId = [...state.selectedIds][0];`);
    await waitFor('document.activeElement === document.getElementById("card-" + nextId)?.querySelector(".node-topic")');
    for (const options of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
        await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ...${JSON.stringify(options)}
        }))`);
        assert.equal(await evaluate('document.activeElement.classList.contains("node-topic")'), true, '重复按键或输入法确认应保留编辑焦点');
    }
    await evaluate(`
        document.activeElement.textContent = '修改后的标题';
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    `);
    assert.equal(await evaluate('findNode(state.data, nextId).topic'), '修改后的标题', '修改标题后提交应保存文字');
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab', code: 'Tab', bubbles: true, cancelable: true
    })); window.childId = [...state.selectedIds][0];`);
    await waitFor('document.activeElement === document.getElementById("card-" + childId)?.querySelector(".node-topic")');
    assert.equal(await evaluate('findParent(state.data, childId).id === nextId'), true, '提交后 Tab 应能继续创建子节点');
    console.log(`节点增量插入检查通过：${cases.length} 个场景保留已有卡片和 iframe，支持直接编辑。`);
    console.log('标题提交检查通过：默认标题退出、连续新建、长按和输入法确认行为正常。');
}
// !SECTION 新建节点与已有 iframe 保留

app.whenReady().then(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try { await run(); app.exit(0); }
    catch (error) { console.error(error); app.exit(1); }
    finally { window?.destroy(); server.close(); }
});
