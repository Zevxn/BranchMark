import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const distRoot = join(root, 'dist');
const actionRoot = join(root, 'quicker', 'DeepConvoMindMap');
const templatePath = join(actionRoot, 'DeepConvoMindMap.template.cs');
const outputPath = join(actionRoot, 'DeepConvoMindMap.cs');

async function collectFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await collectFiles(fullPath));
        if (entry.isFile()) files.push(fullPath);
    }
    return files;
}

// WebView2 原生支持 WOFF2。KaTeX 与 Remix Icon 同时携带的 TTF/WOFF 只是
// 旧浏览器回退副本，不需要重复嵌入 Quicker 动作，否则 Base64 后会超过 5 MB。
const isRedundantFallbackFont = filePath => /\.(?:ttf|woff)$/i.test(filePath);
const allFiles = await collectFiles(distRoot);
const packagedFiles = allFiles.filter(filePath => !isRedundantFallbackFont(filePath));
const excludedFiles = allFiles.filter(isRedundantFallbackFont);

const manifest = {};
for (const filePath of packagedFiles) {
    const key = relative(distRoot, filePath).split(sep).join('/');
    manifest[key] = (await readFile(filePath)).toString('base64');
}

const manifestBuffer = Buffer.from(JSON.stringify(manifest));
const compressed = gzipSync(manifestBuffer, { level: 9 });
const bundle = compressed.toString('base64');
const version = createHash('sha256').update(compressed).digest('hex').slice(0, 16);
const chunks = bundle.match(/.{1,8000}/g) || [];
const bundleSource = chunks.map((chunk, index) =>
    `        "${chunk}"${index === chunks.length - 1 ? '' : ','}`).join('\n');

const template = await readFile(templatePath, 'utf8');
const source = template
    .replace('__BUNDLE_VERSION__', version)
    .replace('__APP_BUNDLE_BASE64__', bundleSource);

await writeFile(outputPath, source, 'utf8');
console.log(JSON.stringify({
    outputPath,
    files: Object.keys(manifest).length,
    rawBytes: manifestBuffer.length,
    compressedBytes: compressed.length,
    sourceBytes: Buffer.byteLength(source),
    excludedFallbackFonts: excludedFiles.length,
    version,
}, null, 2));
