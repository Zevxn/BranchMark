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

console.log('Markdown 链接校验通过：本地文件路径可转换并交给 Quicker，网址可打开，危险协议被拒绝。');
