import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [html, shim, mindMap, bookmarks, helpers, utils, i18n, renderMarkdown, bookmarksCss] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readFile('app/JS/standalone-shim.js', 'utf8'),
    readFile('app/JS/MindMap.js', 'utf8'),
    readFile('app/JS/BookMarks.js', 'utf8'),
    readFile('app/JS/AI-Contents.js', 'utf8'),
    readFile('app/JS/utils.js', 'utf8'),
    readFile('app/JS/static/i18n.js', 'utf8'),
    readFile('app/JS/renderMD.js', 'utf8'),
    readFile('app/CSS/BookMarks.css', 'utf8'),
]);

assert.match(html, /standalone-shim\.js/);
assert.match(html, /standalone-locale-zh-cn\.js/);
assert.match(html, /libs\/css\/all\.min\.css/);
assert.doesNotMatch(html, /AI-Contents\.css/);
assert.match(html, /id="btn-settings"/);
assert.doesNotMatch(html, /id="btn-theme-toggle"/);
assert.match(html, /id="fileInput" class="mindmap-file-input"/);
assert.match(html, /:root\[data-theme="light"\]/);
assert.match(html, /:root\[data-theme="dark"\]/);

assert.match(shim, /\$quickerSync/);
assert.match(shim, /getVar\('app_data_json'\)/);
assert.match(shim, /setVar\('app_data_json'/);
assert.match(shim, /indexedDB\.open\('DeepConvoStandalone'/);
assert.match(shim, /deepconvo-standalone:chrome:/);
assert.match(shim, /deepconvo-standalone:idb:/);
assert.match(shim, /syncSavedMindMapSnapshot/);
assert.match(shim, /repairCurrentMindMapSnapshot/);
assert.doesNotMatch(shim, /__DEEPCONVO_QUICKER_STATE__/);
assert.doesNotMatch(shim, /DEEPCONVO_PERSIST:|DEEPCONVO_OPEN_WINDOW:/);
assert.match(shim, /window\.chrome && window\.chrome\.webview/,
    'Chrome API 兼容层必须保留 Quicker 的 WebView2 原生消息通道');
assert.match(shim, /webview:\s*quickerWebView/);
assert.doesNotMatch(shim, /app_lang|window\.fetch\s*=/);

assert.match(mindMap, /window\.__DEEPCONVO_NATIVE_QUICKER_HOST__/);
assert.match(mindMap, /quickerSubprogram\('DeepConvoImportMindMap', \{\}\)/);
assert.match(mindMap, /fileInput\.showPicker\(\)/);
assert.match(mindMap, /fileInput\.click\(\)/);
assert.doesNotMatch(mindMap, /openButton\.disabled/, '取消 Quicker 文件选择后导入按钮必须仍可再次点击');
assert.match(mindMap, /await idbSet\(\{\[`MindMapData\.__REF__/,
    '保存成功提示前必须等待思维导图数据真正写入');
assert.doesNotMatch(mindMap, /DEEPCONVO_THEME:|DEEPCONVO_IMPORT_REQUEST|DEEPCONVO_IMPORT_RESULT/);
assert.doesNotMatch(mindMap, /chrome\.webview|__DEEPCONVO_LEGACY_QUICKER_HOST__/);

const importInitializerStart = mindMap.indexOf('function initializeMindMapImport()');
const importInitializerEnd = mindMap.indexOf('const defaultTreeData', importInitializerStart);
const importInitializer = mindMap
    .slice(importInitializerStart, importInitializerEnd)
    .trim();
assert.ok(importInitializer, '应能定位导入初始化函数');
const importButton = { disabled: false, onclick: null };
let importCallCount = 0;
const pendingImport = new Promise(() => {});
const importWindow = {
    __DEEPCONVO_NATIVE_QUICKER_HOST__: true,
    $quickerSp() {
        importCallCount += 1;
        return pendingImport;
    },
};
vm.runInContext(`
    const $ = selector => selector === '#btn-open' ? importButton : null;
    const importButton = globalThis.importButton;
    function showMindMapImportFeedback() {}
    function applyImportedMindMap() {}
    ${importInitializer}
    initializeMindMapImport();
`, vm.createContext({
    console,
    importButton,
    window: importWindow,
}));
importButton.onclick();
await Promise.resolve();
assert.equal(importButton.disabled, false, '等待或取消导入时按钮不能被禁用');
importButton.onclick();
await Promise.resolve();
assert.equal(importCallCount, 2, '上一次导入未返回时仍应允许再次点击');

assert.match(utils, /function idbGet/);
assert.match(utils, /function idbSet/);
assert.match(utils, /function idbRemove/);
assert.doesNotMatch(utils, /chatgpt\.com|deepseek\.com|initLineNumber|initHighlight/);
assert.match(helpers, /function openQAdata/);
assert.match(helpers, /function buildQAList/);
assert.match(helpers, /function saveFileDirectly/);
assert.match(helpers, /function changeObsidianPath/);
assert.match(helpers, /DeepConvoSelectExportFolder/);
assert.match(helpers, /DeepConvoSaveExportFile/);
assert.match(helpers, /obsidian_export_directory/);
assert.match(mindMap, /await changeObsidianPath\(\)/);
assert.doesNotMatch(helpers, /websiteConfigs|initDirectory|HistoryListMonitor|HighlightManager/);

assert.doesNotMatch(bookmarks, /initI18n|app_lang|mountToContainer|renderEmbeddedView|checkUIMM/);
assert.doesNotMatch(bookmarks, /findTargetInGeminiSidebar|spaNavigate|currentCfg|currentSettings/);
assert.match(bookmarks, /initializeBookmarkManager/);
assert.match(bookmarks, /initializeSearch\(\)/);

assert.match(i18n, /__DEEPCONVO_STANDALONE_ZH_CN__/);
assert.match(i18n, /function getI18nText/);
assert.doesNotMatch(i18n, /fetch\(|currentLang|initI18n|storage\.onChanged|navigator\.language/);

for (const [name, source] of [
    ['MindMap.html', html],
    ['BookMarks.css', bookmarksCss],
    ['renderMD.js', renderMarkdown],
]) {
    assert.doesNotMatch(source, /@media\s*\(prefers-color-scheme:\s*dark\)/, `${name} 不应绕过 data-theme`);
}
assert.match(renderMarkdown, /:root\[data-theme="dark"\][\s\S]*\.mermaid-container svg/);
assert.match(renderMarkdown, /var\(--code-line-separator, var\(--code-block-border\)\)/);
assert.doesNotMatch(renderMarkdown, /border-right-color:\s*#444/);
assert.match(renderMarkdown, /DeepConvoOpenPathOrUrl/);
assert.match(renderMarkdown, /function fileUrlToWindowsPath/);
assert.match(renderMarkdown, /function normalizeMarkdownLinkTarget/);
assert.match(renderMarkdown, /event\.preventDefault\(\)[\s\S]*openMarkdownLinkWithQuicker/);
assert.match(bookmarks, /!newTab \|\| window\.__DEEPCONVO_NATIVE_QUICKER_HOST__/,
    'Quicker 内部新窗请求应降级为当前窗口打开');
assert.match(shim, /if \(nativeQuickerBridge\) location\.href = target/);

const bookmarkReset = bookmarksCss.match(
    /\.custom-directory-container,\s*\.custom-directory-container \*,\s*\.bookmark-manager-container,\s*\.bookmark-manager-container \*\s*\{([^}]*)\}/,
);
assert.ok(bookmarkReset, '应保留收藏夹元素的布局重置规则');
assert.doesNotMatch(bookmarkReset[1], /font-family/, '通配重置不能覆盖 Font Awesome 图标字体');
assert.match(
    bookmarksCss,
    /\.custom-directory-container,\s*\.bookmark-manager-container\s*\{[^}]*font-family:/,
    '界面字体应只在收藏夹容器上继承',
);

for (const removedPath of [
    'app/CSS/AI-Contents.css',
    'app/locales/en_US/messages.json',
    'app/locales/zh_CN/messages.json',
    'scripts/package-quicker.mjs',
    'tests/quicker-package.test.mjs',
    'quicker/DeepConvoMindMap/DeepConvoMindMap.json',
]) {
    await assert.rejects(access(removedPath), error => error?.code === 'ENOENT', `${removedPath} 应已删除`);
}

console.log('独立版结构校验通过：只保留原生 Quicker 与普通浏览器运行所需代码。');
