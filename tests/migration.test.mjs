import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const exactCopies = [
    ['ref/JS/AI-Contents.js', 'app/JS/AI-Contents.js'],
    ['ref/JS/utils.js', 'app/JS/utils.js'],
    ['ref/JS/renderMD.js', 'app/JS/renderMD.js'],
    ['ref/CSS/AI-Contents.css', 'app/CSS/AI-Contents.css'],
];

for (const [referencePath, migratedPath] of exactCopies) {
    const [reference, migrated] = await Promise.all([
        readFile(referencePath),
        readFile(migratedPath),
    ]);
    assert.deepEqual(migrated, reference, `${migratedPath} 必须与原版逐字节一致`);
}

const html = await readFile('app/HTML/MindMap.html', 'utf8');
assert.match(html, /standalone-shim\.js/);
assert.doesNotMatch(html, /standalone-adapter\.js/);
assert.match(html, /id="btn-theme-toggle"/);
assert.match(html, /:root\[data-theme="light"\]/);
assert.match(html, /:root\[data-theme="dark"\]/);

const shim = await readFile('app/JS/standalone-shim.js', 'utf8');
assert.match(shim, /window\.chrome = chromeApi/);
assert.match(shim, /case 'IDB_GET'/);
assert.match(shim, /case 'IDB_SET'/);
assert.match(shim, /case 'IDB_REMOVE'/);
assert.match(shim, /chromePrefix \+ 'app_lang', JSON\.stringify\('zh-CN'\)/);
assert.match(shim, /__DEEPCONVO_STANDALONE_ZH_CN__/);
assert.match(shim, /locales\\\/zh_CN\\\/messages/);
assert.match(shim, /__DEEPCONVO_QUICKER_STATE__/);
assert.match(shim, /\$quickerSync/);
assert.match(shim, /__DEEPCONVO_NATIVE_QUICKER_HOST__/);
assert.match(shim, /DEEPCONVO_PERSIST:/);
assert.match(shim, /quickerWebView\.postMessage/);
assert.match(shim, /syncUpdatedAt = Date\.now\(\)/);
assert.match(shim, /syncSavedMindMapSnapshot/);
assert.match(shim, /repairCurrentMindMapSnapshot/);
assert.ok(shim.includes('MindMapData\\.__REF__'));
assert.match(shim, /DEEPCONVO_OPEN_WINDOW:/);
assert.match(shim, /nativeWindowOpen/);
assert.match(shim, /resolvedUrl\.pathname\.startsWith\('\/HTML\/'\)/);

await assert.rejects(access('app/JS/standalone-adapter.js'), error => error && error.code === 'ENOENT');

const mindMap = await readFile('app/JS/MindMap.js', 'utf8');
assert.match(mindMap, /getMindMapExportBaseName/);
assert.match(mindMap, /mindmap_theme/);
assert.match(mindMap, /DEEPCONVO_THEME:/);
assert.match(mindMap, /DEEPCONVO_IMPORT_REQUEST/);
assert.match(mindMap, /DEEPCONVO_IMPORT_RESULT/);
assert.match(mindMap, /a\.download=`\$\{getMindMapExportBaseName\(\)\}\.json`/);

const bookmarks = await readFile('app/JS/BookMarks.js', 'utf8');
for (const removedMarkup of ['id="newItemBtn"', 'id="filterBtn"', 'id="filterDropdown"', 'id="switchBtn"', 'data-action="newItem"']) {
    assert.ok(!bookmarks.includes(removedMarkup), `独立版收藏夹不应再生成 ${removedMarkup}`);
}
assert.doesNotMatch(bookmarks, /await initDirectory\(\)/);
assert.match(bookmarks, /initializeSearch\(\)/);
assert.match(bookmarks, /chromeGet\('embeddedExpandedFolders'\)/);
assert.match(bookmarks, /chromeGet\('localEmptyFolders'\)/);
assert.match(bookmarks, /chrome\.storage\.local\.set\(\{'embeddedExpandedFolders':/);
assert.match(bookmarks, /chrome\.storage\.local\.set\(\{'localEmptyFolders':/);

const bookmarksCss = await readFile('app/CSS/BookMarks.css', 'utf8');
assert.match(bookmarksCss, /\.panel-actions \{[^}]*justify-content: space-between;[^}]*gap: 0;/);

const [localeJson, localeScript] = await Promise.all([
    readFile('app/locales/zh_CN/messages.json', 'utf8').then(JSON.parse),
    readFile('app/JS/standalone-locale-zh-cn.js', 'utf8'),
]);
const localePayload = localeScript
    .replace(/^window\.__DEEPCONVO_STANDALONE_ZH_CN__\s*=\s*/, '')
    .replace(/;\s*$/, '');
assert.deepEqual(JSON.parse(localePayload), localeJson, '独立版中文脚本必须与原中文语言包一致');

console.log(`独立版结构校验通过：ref 保持参考用途，${exactCopies.length} 个未定制文件仍与原版一致，正式功能已迁入 app。`);
