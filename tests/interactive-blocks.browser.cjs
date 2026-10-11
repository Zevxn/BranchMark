'use strict';

// SECTION 交互块浏览器测试环境
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = resolve(__dirname, '../app');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const path = resolve(root, `.${pathname}`);
        if (!path.startsWith(root + sep)) throw new Error('Invalid path');
        const body = await readFile(path);
        response.writeHead(200, { 'Content-Type': `${types[extname(path)] || 'application/octet-stream'}; charset=utf-8` });
        response.end(body);
    } catch {
        response.writeHead(404);
        response.end();
    }
});

const source = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8">
<style>
body { font: 14px system-ui; padding: 16px; }
main { width: 720px; height: 180px; }
main.responsive { display: grid; grid-template-columns: 3fr 1fr; width: auto; height: 1200px; }
@media (max-width: 900px) { main.responsive { grid-template-columns: 1fr; } }
</style>
<main>
<label>参数 <input id="amount" type="range" min="0" max="100" value="50"></label>
<output>50</output>
</main>
<script>
const runId = Math.random().toString(36);
let counter = 0;
const amount = document.querySelector('input');
let parentBlocked = false;
try { parent.document.title; } catch { parentBlocked = true; }
function report() {
    parent.postMessage({ type: 'interactive-test', runId, counter, amount: amount.value,
        parentBlocked, width: innerWidth, height: innerHeight,
        clientWidth: document.documentElement.clientWidth, scrollTop: scrollY,
        expanded: document.documentElement.hasAttribute('data-branchmark-expanded'),
        verticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        focused: document.activeElement === amount,
        columns: getComputedStyle(document.querySelector('main')).gridTemplateColumns.split(' ').length,
        scrollbar: getComputedStyle(document.documentElement, '::-webkit-scrollbar').width }, '*');
}
amount.oninput = () => { document.querySelector('output').value = amount.value; report(); };
addEventListener('message', event => {
    if (event.data === 'increment') { counter++; amount.value = '73'; amount.oninput(); }
    if (event.data === 'focus') amount.focus();
    if (event.data === 'compact') Object.assign(document.querySelector('main').style, { width: '240px', height: '100px' });
    if (event.data === 'large') Object.assign(document.querySelector('main').style, { width: '1600px', height: '1200px' });
    if (event.data === 'normal') document.querySelector('main').removeAttribute('style');
    if (event.data === 'responsive') {
        document.querySelector('main').removeAttribute('style');
        document.querySelector('main').className = 'responsive';
    }
    report();
});
addEventListener('resize', report);
addEventListener('scroll', report);
report();
</script></html>`;
const markdown = '# 交互笔记\n\n```interactive\n' + source
    + '\n```\n\n```html\n<script>window.shouldNotRun = true;</script>\n```\n\n普通正文 $x^2$。';

let window;
async function evaluate(code) {
    return window.webContents.executeJavaScript(code, true);
}

async function waitFor(condition) {
    await evaluate(`new Promise((resolve, reject) => {
        const started = Date.now();
        const check = () => {
            if (${condition}) return resolve();
            if (Date.now() - started > 5000) return reject(new Error('等待条件超时: ' + ${JSON.stringify(condition)}));
            setTimeout(check, 20);
        };
        check();
    })`);
}

async function report() {
    await evaluate(`window.interactiveReports = []; window.testFrame.contentWindow.postMessage('report', '*')`);
    await waitFor('window.interactiveReports.length > 0');
    return evaluate('window.interactiveReports.at(-1)');
}
// !SECTION 交互块浏览器测试环境

// SECTION 运行、隔离与放大还原
async function checkInlineHeight() {
    await waitFor('window.testFrame.closest(".interactive-block").style.getPropertyValue("--interactive-inline-height") !== ""');
    await evaluate('window.testFrame.contentWindow.postMessage("large", "*")');
    await waitFor('window.testFrame.clientHeight > 1200');
    assert.equal((await report()).verticalOverflow, false, '笔记内应撑高 iframe，不截断长内容');
    await evaluate('window.testFrame.contentWindow.postMessage("compact", "*")');
    await waitFor('window.testFrame.clientHeight < 250');
    await evaluate('window.testFrame.contentWindow.postMessage("normal", "*")');
    await waitFor('window.testFrame.clientHeight > 200 && window.testFrame.clientHeight < 300');
}

async function run() {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    window = new BrowserWindow({
        show: false, width: 1280, height: 900,
        webPreferences: { nodeIntegration: false, contextIsolation: true, partition: `interactive-test-${Date.now()}` },
    });
    await window.loadURL(`http://127.0.0.1:${server.address().port}/HTML/MindMap.html`);
    await evaluate(`
        window.interactiveReports = [];
        addEventListener('message', event => {
            if (event.source === window.testFrame?.contentWindow && event.data?.type === 'interactive-test') {
                window.interactiveReports.push(event.data);
            }
        });
        state.data = { id: 'interactive-test-root', topic: '交互笔记', content: ${JSON.stringify(markdown)}, children: [] };
        state.view.scale = 0.7;
        renderTree();
        window.testFrame = document.querySelector('.interactive-block-frame');
        window.testSurface = document.querySelector('.interactive-block-surface');
    `);
    await waitFor('window.interactiveReports.length > 0');
    await checkInlineHeight();
    const initial = await report();
    assert.equal(initial.amount, '50');
    assert.equal(initial.parentBlocked, true, '沙箱必须阻止访问导图页面');
    assert.equal(initial.scrollbar, '8px', 'iframe 滚动条应采用卡片同款宽度');
    assert.equal(await evaluate('window.testFrame.getAttribute("sandbox")'), 'allow-scripts');
    assert.ok((await evaluate('window.testFrame.srcdoc')).endsWith(source + '\n'), '交互源码应保留 Markdown 代码块的结尾换行');
    assert.equal(await evaluate('state.data.content'), markdown, '渲染不能修改笔记源码');
    assert.equal(await evaluate('window.shouldNotRun'), undefined, '普通 html 代码块不能执行');
    assert.equal(await evaluate('document.querySelectorAll(".interactive-block").length'), 1);

    await evaluate(`
        document.querySelector('.interactive-block-action').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        document.querySelector('.interactive-block-action').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    `);
    assert.equal(await evaluate('state.mode'), 'IDLE', '工具栏操作不能触发导图拖拽');
    assert.equal(await evaluate('isSpacePressed'), false, '交互块空格不能触发画布平移状态');

    await evaluate('document.querySelector(".interactive-block-action").click()');
    assert.equal(await evaluate('window.testSurface.matches(":modal")'), true);
    await waitFor('window.testSurface.getBoundingClientRect().width > 700 && window.testSurface.getBoundingClientRect().width < 900 && window.testSurface.getBoundingClientRect().height < 400');
    assert.ok(await evaluate('window.testSurface.getBoundingClientRect().width < 900 && window.testSurface.getBoundingClientRect().height < 400'),
        '放大窗口应脱离画布缩放并贴合内容宽高');
    assert.equal(await evaluate('window.testSurface.querySelector(".interactive-block-scrollbar").hidden'), true,
        '内容完整显示时不应出现悬浮滑块');
    await evaluate('window.testFrame.contentWindow.postMessage("increment", "*")');
    await waitFor('window.interactiveReports.some(item => item.counter === 1)');
    const expanded = await report();
    assert.equal(expanded.runId, initial.runId, '放大不能重新加载脚本');
    assert.equal(expanded.counter, 1);
    assert.equal(expanded.amount, '73');
    assert.ok(expanded.width > initial.width, '放大后应增加交互内容的布局宽度');
    await evaluate('window.testFrame.contentWindow.postMessage("compact", "*")');
    await waitFor('window.testSurface.getBoundingClientRect().width >= 320 && window.testSurface.getBoundingClientRect().width < 400 && window.testSurface.getBoundingClientRect().height < 250');
    await evaluate('window.testFrame.contentWindow.postMessage("large", "*")');
    await waitFor('window.testSurface.getBoundingClientRect().width > 1000 && window.testSurface.getBoundingClientRect().height > 700');
    assert.ok(await evaluate('window.testSurface.getBoundingClientRect().width <= innerWidth - 32 && window.testSurface.getBoundingClientRect().height <= innerHeight - 32'),
        '超大内容应限制在屏幕内');
    await evaluate('window.testFrame.contentWindow.postMessage("responsive", "*")');
    await waitFor('window.interactiveReports.some(item => item.columns === 2)');

    await evaluate('window.testSurface.querySelector("button[aria-label=关闭放大视图]").click()');
    assert.equal(await evaluate('window.testSurface.matches(":modal")'), false);
    await waitFor('window.testFrame.clientHeight > 1200');
    const restored = await report();
    assert.equal(restored.runId, initial.runId);
    assert.equal(restored.counter, 1);
    assert.equal(restored.amount, '73', '还原后保留输入与脚本内部状态');
    await evaluate('processRichContent(document.querySelector(".card-body"))');
    assert.equal(await evaluate('document.querySelector(".interactive-block-frame") === window.testFrame'), true,
        '重复富内容处理不能重建已有 iframe');

    await evaluate('window.testSurface.querySelector("button[aria-label=放大交互内容]").click()');
    await waitFor('window.testSurface.getBoundingClientRect().width > 1000');
    await evaluate(`new Promise(resolve => {
        let frames = 0;
        const tick = () => ++frames >= 12 ? resolve() : requestAnimationFrame(tick);
        requestAnimationFrame(tick);
    })`);
    assert.ok(await evaluate('window.testSurface.getBoundingClientRect().width > 1000'),
        '有竖向滚动条的响应式页面不能在重复测量中越缩越窄');
    assert.equal((await report()).columns, 2, '从笔记放大后应恢复桌面双栏布局');
    const scrollable = await report();
    assert.equal(scrollable.clientWidth, scrollable.width, '悬浮滚动条不能占用网页布局宽度: ' + JSON.stringify(scrollable));
    await waitFor('!window.testSurface.querySelector(".interactive-block-scrollbar").hidden');
    await evaluate(`window.testSurface.querySelector('.interactive-block-scrollbar').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))`);
    await waitFor('window.interactiveReports.some(item => item.scrollTop > 0)');
    const drag = await evaluate(`(() => {
        const track = window.testSurface.querySelector('.interactive-block-scrollbar').getBoundingClientRect();
        const thumb = window.testSurface.querySelector('.interactive-block-scrollbar-thumb').getBoundingClientRect();
        return { x: Math.round(thumb.left + thumb.width / 2), from: Math.round(thumb.top + 5), to: Math.round(track.bottom - 5) };
    })()`);
    window.webContents.sendInputEvent({ type: 'mouseMove', x: drag.x, y: drag.from });
    window.webContents.sendInputEvent({ type: 'mouseDown', x: drag.x, y: drag.from, button: 'left', clickCount: 1 });
    window.webContents.sendInputEvent({ type: 'mouseMove', x: drag.x, y: drag.to });
    window.webContents.sendInputEvent({ type: 'mouseUp', x: drag.x, y: drag.to, button: 'left', clickCount: 1 });
    await waitFor('window.interactiveReports.some(item => item.scrollTop > 100)');
    assert.ok(await evaluate('Number(window.testSurface.querySelector(".interactive-block-scrollbar").getAttribute("aria-valuenow")) > 100'),
        '拖动悬浮滑块应滚动网页并同步位置');
    await evaluate(`window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'branchmark-interactive-escape' } }))`);
    assert.equal(await evaluate('window.testSurface.matches(":modal")'), true, '其他来源不能通过关闭消息控制此交互块');
    await evaluate('window.testFrame.contentWindow.postMessage("focus", "*")');
    await waitFor('window.interactiveReports.some(item => item.focused)');
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await waitFor('!window.testSurface.matches(":modal")');
    assert.equal((await report()).counter, 1, 'iframe 内按 Esc 关闭也应保留脚本状态');

    await evaluate('window.testSurface.querySelector("button[aria-label=放大交互内容]").click()');
    await evaluate(`window.testSurface.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }))`);
    assert.equal(await evaluate('window.testSurface.matches(":modal")'), false, '点击遮罩应还原');

    await evaluate('window.testSurface.querySelector("button[aria-label=放大交互内容]").click(); renderTree()');
    await waitFor('expandedInteractiveBlock === null');
    assert.equal(await evaluate('window.testSurface.isConnected'), false, '重建笔记应清理旧的放大窗口');
    console.log('交互块验证通过：悬浮滑块不占宽度、拖动与键盘滚动、内容自适应与屏幕限制、源码渲染、脚本隔离、手势隔离、放大/还原保留状态、iframe 内 Esc、遮罩关闭与重建清理。');
}

const timeout = setTimeout(() => { console.error('交互块测试超时'); app.exit(1); }, 30000);
app.whenReady().then(run).then(() => app.exit(0)).catch(error => {
    console.error(error);
    app.exit(1);
}).finally(() => {
    clearTimeout(timeout);
    server.close();
});
// !SECTION 运行、隔离与放大还原
