import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const renderMarkdown = await readFile('app/JS/renderMD.js', 'utf8');
const markedSource = await readFile('app/libs/marked.min.js', 'utf8');
const helperStart = renderMarkdown.indexOf("const QUICKER_OPEN_PATH_OR_URL_SP");
const helperEnd = renderMarkdown.indexOf('// =============================================================================', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, '应能定位 Markdown 链接打开适配代码');
assert.match(renderMarkdown, /\.md-content a\.md-file-link\s*\{/,
    '本地文件链接应使用独立的附件式样式');
assert.match(renderMarkdown, /\.md-content a\.md-file-link\s*\{[\s\S]*?background-color:\s*color-mix\(in srgb, var\(--bg-secondary\) 55%, transparent\);/,
    '本地文件链接默认应使用半透明背景');
assert.match(renderMarkdown, /font-size:\s*clamp\(13px, 0\.92em, 15px\)/,
    '本地文件链接字号不应随大字号容器无限放大');
assert.match(renderMarkdown, /ri-file-paper-2-line md-file-link-icon/,
    '本地文件链接应复用现有 Remix Icon 文件图标');

const calls = [];
const toasts = [];
const window = {
    __DEEPCONVO_NATIVE_QUICKER_HOST__: true,
    async $quickerSp(name, args) {
        calls.push({ name, args });
        return { success: true, cancelled: false };
    },
};
const location = {
    href: 'https://deepconvo-mindmap-native.local/HTML/MindMap.html',
    origin: 'https://deepconvo-mindmap-native.local',
};
const context = vm.createContext({
    URL,
    console,
    document: { baseURI: location.href },
    location,
    showTopToast: message => toasts.push(message),
    window,
});
vm.runInContext(renderMarkdown.slice(helperStart, helperEnd), context, {
    filename: 'renderMD-link-helpers.js',
});

const fileHref = 'file:///D:/00科研资料/03书籍文献/Zotero文献/storage/JVYAFCEH/Ning 等 - 2024.pdf';
const markedContext = vm.createContext({});
vm.runInContext(markedSource, markedContext, { filename: 'marked.min.js' });
const renderedLink = markedContext.marked.parse(`[查看论文](<${fileHref}>)`);
const renderedHref = renderedLink.match(/<a href="([^"]+)"/)?.[1];
assert.ok(renderedHref?.startsWith('file:///D:/'),
    '项目使用的 marked 解析器必须保留 file URI 协议和盘符');
const normalizedFile = JSON.parse(vm.runInContext(
    `JSON.stringify(normalizeMarkdownLinkTarget(${JSON.stringify(renderedHref)}))`,
    context,
));
assert.deepEqual(normalizedFile, {
    kind: 'file',
    target: 'D:\\00科研资料\\03书籍文献\\Zotero文献\\storage\\JVYAFCEH\\Ning 等 - 2024.pdf',
});

// SECTION Windows 代码文件路径与位置后缀
const pythonPath = 'D:/04Git代码项目/SMDP-MILP模型/core/wind_farm_scheduler.py';
const expectedPythonPath = pythonPath.replace(/\//g, '\\');
const pythonTargets = [
    pythonPath,
    `${pythonPath}:418`,
    `${pythonPath}:418:12`,
    `${expectedPythonPath}:418:12`,
    `file:///${pythonPath}:418`,
    `file:///${pythonPath}:418:12`,
    `file:///${encodeURI(pythonPath)}:418`,
];
for (const href of pythonTargets) {
    // 使用项目实际的 Markdown 解析器，确保渲染后的 href 仍能识别。
    const html = markedContext.marked.parse(`[同间隔关联约束](${href})`);
    const parsedHref = html.match(/<a href="([^"]+)"/)?.[1];
    assert.ok(parsedHref);
    const normalized = context.normalizeMarkdownLinkTarget(parsedHref);
    assert.equal(normalized?.kind, 'file', href);
    assert.equal(normalized.target, expectedPythonPath, href);
}
for (const href of ['D:/资料/invalid.py:abc', 'D:/资料/invalid.py:418:abc']) {
    assert.equal(context.normalizeMarkdownLinkTarget(href), null, '只剥离数字行号和列号');
}
for (const path of ['D:\\资料\\100% #论文.py', '\\\\server\\share\\100% #论文.py']) {
    const fileUrl = context.windowsPathToFileUrl(path);
    assert.equal(context.normalizeMarkdownLinkTarget(fileUrl).target, path,
        '生成 file URL 时必须保留文件名中的百分号、空格和 #');
}
// !SECTION Windows 代码文件路径与位置后缀

const normalizedUrl = JSON.parse(vm.runInContext(
    `JSON.stringify(normalizeMarkdownLinkTarget('https://example.com/paper?id=1'))`,
    context,
));
assert.equal(normalizedUrl.kind, 'url');
assert.equal(normalizedUrl.target, 'https://example.com/paper?id=1');
assert.equal(vm.runInContext(`normalizeMarkdownLinkTarget('javascript:alert(1)')`, context), null);

const opened = await vm.runInContext(
    `openMarkdownLinkWithQuicker(${JSON.stringify(renderedHref)})`,
    context,
);
assert.equal(opened, true);
assert.equal(calls.at(-1).name, 'DeepConvoOpenPathOrUrl');
assert.equal(calls.at(-1).args.kind, 'file');
assert.equal(calls.at(-1).args.target, normalizedFile.target);
assert.deepEqual(toasts, []);

// SECTION 文件链接交互与宿主分流
const richContentStart = renderMarkdown.indexOf('async function processRichContent(element)');
const richContentEnd = renderMarkdown.indexOf('// !SECTION 富文本渲染', richContentStart);
vm.runInContext(renderMarkdown.slice(richContentStart, richContentEnd), context);

function createLink(href) {
    const listeners = {};
    return {
        href,
        dataset: { fileLinkDecorated: 'true' },
        classList: { toggle() {} },
        getAttribute: name => name === 'href' ? href : null,
        removeAttribute(name) { delete this[name]; },
        addEventListener(name, listener) { listeners[name] = listener; },
        async dispatch(name, detail = 1) {
            const event = {
                detail, prevented: false, stopped: false,
                preventDefault() { this.prevented = true; },
                stopPropagation() { this.stopped = true; },
            };
            await listeners[name](event);
            return event;
        },
    };
}

async function bindLink(href) {
    const link = createLink(href);
    await context.processRichContent({ querySelectorAll: selector => selector === 'a[href]' ? [link] : [] });
    return link;
}

const nativeCalls = [];
const browserCalls = [];
window.open = (...args) => browserCalls.push(args);
window.__DEEPCONVO_NATIVE_QUICKER_HOST__ = false;
window.__TAURI__ = { core: { async invoke(command, args) { nativeCalls.push({ command, args }); } } };
const tauriLink = await bindLink(renderedHref);
assert.equal(tauriLink.target, undefined);
await tauriLink.dispatch('click', 1);
await tauriLink.dispatch('click', 2);
assert.equal(nativeCalls.length, 0, '鼠标单击和双击的第二次 click 均不能提前打开文件');
const doubleClick = await tauriLink.dispatch('dblclick', 2);
assert.equal(doubleClick.prevented && doubleClick.stopped, true);
assert.equal(nativeCalls.length, 1, '双击只调用一次 Tauri 文件打开命令');
assert.equal(nativeCalls[0].command, 'open_local_file');
assert.equal(nativeCalls[0].args.url, context.windowsPathToFileUrl(normalizedFile.target));
assert.deepEqual(browserCalls, [], 'Tauri 文件链接不得交给 window.open');
await tauriLink.dispatch('click', 0);
assert.equal(nativeCalls.length, 2, '键盘激活也应调用 Tauri 命令');

for (const href of pythonTargets) {
    const link = await bindLink(href);
    await link.dispatch('dblclick', 2);
    assert.equal(nativeCalls.at(-1).command, 'open_local_file');
    assert.equal(nativeCalls.at(-1).args.url, context.windowsPathToFileUrl(expectedPythonPath),
        '代码文件链接双击时必须发送不含行号/列号的 file URL');
}
const nativeCallsAfterFiles = nativeCalls.length;

const externalLink = await bindLink('https://example.com/paper');
assert.equal(externalLink.target, '_blank', '普通网址保留原有行为');
assert.equal((await externalLink.dispatch('click')).prevented, false);
assert.equal(nativeCalls.length, nativeCallsAfterFiles);

window.__TAURI__.core.invoke = async () => { throw '文件或目录不存在'; };
await tauriLink.dispatch('dblclick', 2);
assert.match(toasts.at(-1), /文件或目录不存在/, '原生命令失败应显示错误，不能静默失败');
assert.deepEqual(browserCalls, []);

window.__DEEPCONVO_NATIVE_QUICKER_HOST__ = true;
const quickerLink = await bindLink(renderedHref);
const quickerCallsBefore = calls.length;
await quickerLink.dispatch('dblclick', 2);
assert.equal(calls.length, quickerCallsBefore + 1, 'Quicker 环境优先使用原子程序');
assert.equal(calls.at(-1).args.target, normalizedFile.target);
const quickerPythonLink = await bindLink(`${pythonPath}:418:12`);
await quickerPythonLink.dispatch('dblclick', 2);
assert.equal(calls.at(-1).args.target, expectedPythonPath, 'Quicker 接收去掉位置后缀的实际路径');

window.__DEEPCONVO_NATIVE_QUICKER_HOST__ = false;
delete window.__TAURI__;
const browserLink = await bindLink(renderedHref);
await browserLink.dispatch('dblclick', 2);
assert.equal(browserCalls.length, 1, '普通浏览器保留原有文件打开方式');
assert.equal(browserCalls[0][0], renderedHref);
// !SECTION 文件链接交互与宿主分流

console.log('Markdown 链接校验通过：Tauri 双击/键盘原生打开、错误提示及 Quicker/浏览器分流完整。');
