import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const actionRoot = join(root, 'quicker', 'DeepConvoMindMap');
const source = await readFile(join(actionRoot, 'DeepConvoMindMap.cs'), 'utf8');
const config = JSON.parse((await readFile(join(actionRoot, 'DeepConvoMindMap.json'), 'utf8')).replace(/^\uFEFF/, ''));

assert.match(config.ActionId, /^(?:|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
assert.notEqual(config.ActionId, '25a18bc1-0e2e-433d-8464-7e36961fddf5');
assert.ok(!Object.hasOwn(config, 'Steps'), '动作 JSON 不得包含 Steps');
assert.ok(config.References.includes('Microsoft.Web.WebView2.Wpf.dll'));
assert.ok(config.References.includes('Microsoft.Web.WebView2.Core.dll'));
assert.equal(config.Variables.find(variable => variable.Key === 'app_data_json')?.SaveState, true);
assert.match(source, /public static string Exec\(IStepContext context\)/);
assert.match(source, /DEEPCONVO_THEME:/);
assert.match(source, /PreferredColorScheme/);
assert.match(source, /DEEPCONVO_IMPORT_REQUEST/);
assert.match(source, /DEEPCONVO_IMPORT_RESULT/);
assert.match(source, /OpenFileDialog/);
assert.doesNotMatch(source, /\b(?:namespace|class)\s+[A-Za-z_]/);
assert.ok(!source.includes('__APP_BUNDLE_BASE64__'));
assert.ok(!source.includes('__BUNDLE_VERSION__'));

const bundleBlock = source.match(/return String\.Concat\(new string\[\]\s*\{([\s\S]*?)\}\);/);
assert.ok(bundleBlock, '未找到内嵌应用资源');
const chunks = [...bundleBlock[1].matchAll(/"([A-Za-z0-9+/=]+)"/g)].map(match => match[1]);
const manifest = JSON.parse(gunzipSync(Buffer.from(chunks.join(''), 'base64')).toString('utf8'));

async function collectFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await collectFiles(fullPath));
        if (entry.isFile()) files.push(fullPath);
    }
    return files;
}

const distRoot = join(root, 'dist');
const distFiles = await collectFiles(distRoot);
const isRedundantFallbackFont = filePath => /\.(?:ttf|woff)$/i.test(filePath);
const packagedFiles = distFiles.filter(filePath => !isRedundantFallbackFont(filePath));
const excludedFiles = distFiles.filter(isRedundantFallbackFont);
const distKeys = new Set(distFiles.map(filePath => relative(distRoot, filePath).split(sep).join('/')));

assert.equal(Object.keys(manifest).length, packagedFiles.length);
for (const filePath of packagedFiles) {
    const key = relative(distRoot, filePath).split(sep).join('/');
    assert.ok(Object.hasOwn(manifest, key), `动作资源缺少 ${key}`);
    assert.deepEqual(Buffer.from(manifest[key], 'base64'), await readFile(filePath), `${key} 打包内容不一致`);
}

for (const filePath of excludedFiles) {
    const key = relative(distRoot, filePath).split(sep).join('/');
    const woff2Key = key.replace(/\.(?:ttf|woff)$/i, '.woff2');
    assert.ok(!Object.hasOwn(manifest, key), `冗余回退字体不应嵌入动作：${key}`);
    assert.ok(distKeys.has(woff2Key), `排除 ${key} 前必须存在对应的 WOFF2 字体`);
    assert.ok(Object.hasOwn(manifest, woff2Key), `对应的 WOFF2 字体必须嵌入动作：${woff2Key}`);
}

assert.ok(Buffer.byteLength(source) < 5_000_000, '生成的 Quicker C# 动作必须小于 5 MB');

console.log(`Quicker 包校验通过：内嵌 ${packagedFiles.length} 个应用文件，排除 ${excludedFiles.length} 个冗余字体，动作小于 5 MB。`);
