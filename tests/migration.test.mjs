import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const exactCopies = [
    ['ref/JS/MindMap.js', 'app/JS/MindMap.js'],
    ['ref/JS/BookMarks.js', 'app/JS/BookMarks.js'],
    ['ref/JS/AI-Contents.js', 'app/JS/AI-Contents.js'],
    ['ref/JS/utils.js', 'app/JS/utils.js'],
    ['ref/JS/renderMD.js', 'app/JS/renderMD.js'],
    ['ref/CSS/BookMarks.css', 'app/CSS/BookMarks.css'],
    ['ref/CSS/AI-Contents.css', 'app/CSS/AI-Contents.css'],
];

for (const [referencePath, migratedPath] of exactCopies) {
    const [reference, migrated] = await Promise.all([
        readFile(referencePath),
        readFile(migratedPath),
    ]);
    assert.deepEqual(migrated, reference, `${migratedPath} 必须与原版逐字节一致`);
}

const normalize = value => value.replace(/\r\n/g, '\n').replace(/\n$/, '');
const [referenceHtmlBuffer, migratedHtmlBuffer] = await Promise.all([
    readFile('ref/HTML/MindMap.html'),
    readFile('app/HTML/MindMap.html'),
]);
const referenceHtml = normalize(referenceHtmlBuffer.toString('utf8'));
const migratedHtml = normalize(migratedHtmlBuffer.toString('utf8'))
    .replace('    <link rel="icon" href="data:,">\n', '')
    .replace('    <script src="../JS/standalone-locale-zh-cn.js"></script>\n', '')
    .replace('    <script src="../JS/standalone-shim.js"></script>\n', '')
    .replace('    <script src="../JS/standalone-adapter.js" defer></script>\n', '');

assert.equal(migratedHtml, referenceHtml, 'MindMap.html 除独立运行入口外必须与原版一致');

const shim = await readFile('app/JS/standalone-shim.js', 'utf8');
assert.match(shim, /window\.chrome = chromeApi/);
assert.match(shim, /case 'IDB_GET'/);
assert.match(shim, /case 'IDB_SET'/);
assert.match(shim, /case 'IDB_REMOVE'/);
assert.match(shim, /chromePrefix \+ 'app_lang', JSON\.stringify\('zh-CN'\)/);
assert.match(shim, /__DEEPCONVO_STANDALONE_ZH_CN__/);
assert.match(shim, /locales\\\/zh_CN\\\/messages/);
assert.match(shim, /__DEEPCONVO_QUICKER_STATE__/);
assert.match(shim, /DEEPCONVO_PERSIST:/);
assert.match(shim, /quickerWebView\.postMessage/);

const adapter = await readFile('app/JS/standalone-adapter.js', 'utf8');
assert.match(adapter, /window\.initDirectory = async function/);
for (const hiddenSelector of ['#dirBtn', '#newItemBtn', '#filterBtn', '#switchBtn', 'button[data-action="newItem"]']) {
    assert.ok(adapter.includes(hiddenSelector), `独立版必须隐藏 ${hiddenSelector}`);
}
assert.match(adapter, /justify-content: space-between/);
assert.match(adapter, /btn-theme-toggle/);
assert.match(adapter, /mindmap_theme/);
assert.match(adapter, /DEEPCONVO_THEME:/);
assert.match(adapter, /DEEPCONVO_IMPORT_REQUEST/);
assert.match(adapter, /DEEPCONVO_IMPORT_RESULT/);
assert.match(adapter, /仅 Quicker 使用 Windows 原生选择器/);

const [localeJson, localeScript] = await Promise.all([
    readFile('app/locales/zh_CN/messages.json', 'utf8').then(JSON.parse),
    readFile('app/JS/standalone-locale-zh-cn.js', 'utf8'),
]);
const localePayload = localeScript
    .replace(/^window\.__DEEPCONVO_STANDALONE_ZH_CN__\s*=\s*/, '')
    .replace(/;\s*$/, '');
assert.deepEqual(JSON.parse(localePayload), localeJson, '独立版中文脚本必须与原中文语言包一致');

console.log(`迁移校验通过：${exactCopies.length} 个原版文件逐字节一致，MindMap.html 仅包含独立运行入口改动。`);
