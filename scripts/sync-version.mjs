import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

// SECTION 项目版本同步

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paths = [
    'package.json',
    'package-lock.json',
    'app/version.json',
    'desktop/package.json',
    'desktop/package-lock.json',
    'desktop-tauri/package.json',
    'desktop-tauri/package-lock.json',
    'desktop-tauri/src-tauri/tauri.conf.json',
    'desktop-tauri/src-tauri/Cargo.toml',
    'desktop-tauri/src-tauri/Cargo.lock',
];
const files = await Promise.all(paths.map(async path => ({
    path,
    text: await readFile(resolve(root, path), 'utf8'),
})));
if (process.argv.length > 3) throw new Error('用法：npm run version:set -- 1.0.7，或 npm run version:sync');
const version = process.argv[2] ?? JSON.parse(files[0].text).version;
const match = typeof version === 'string' && version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/);
if (!match || match.slice(1, 4).some(part => !Number.isSafeInteger(Number(part)))
    || match[4]?.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    throw new Error(`无效的版本号：${version}`);
}

// 先读取并校验全部文件，避免配置缺失或格式错误时只更新部分版本号。
const changes = files.map(({ path, text }) => {
    let updated;
    if (path.endsWith('.json')) {
        const data = JSON.parse(text);
        if (typeof data.version !== 'string') throw new Error(`${path} 缺少项目版本号`);
        data.version = version;
        updated = text.replace(/("version"\s*:\s*")[^"]*(")/, (_, prefix, suffix) => `${prefix}${version}${suffix}`);
        if (path.endsWith('package-lock.json')) {
            if (typeof data.packages?.['']?.version !== 'string') throw new Error(`${path} 缺少根项目版本号`);
            data.packages[''].version = version;
            updated = updated.replace(/("packages"\s*:\s*\{\s*""\s*:\s*\{[\s\S]*?"version"\s*:\s*")[^"]*(")/, (_, prefix, suffix) => `${prefix}${version}${suffix}`);
        }
        if (!isDeepStrictEqual(JSON.parse(updated), data)) throw new Error(`${path} 无法定位项目版本号`);
    } else {
        let inPackage = false;
        let count = 0;
        updated = text.replace(/[^\r\n]+/g, line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('[')) inPackage = path.endsWith('Cargo.toml') && trimmed === '[package]';
            if (path.endsWith('Cargo.lock') && trimmed === 'name = "deepconvo-mindmap-tauri"') inPackage = true;
            if (!inPackage) return line;
            return line.replace(/^(\s*version\s*=\s*")[^"]+(".*)$/, (_, prefix, suffix) => {
                count++;
                return `${prefix}${version}${suffix}`;
            });
        });
        if (count !== 1) throw new Error(`${path} 无法唯一定位项目版本号`);
    }
    return { path, updated, changed: updated !== text };
});
for (const { path, updated, changed } of changes) {
    if (changed) await writeFile(resolve(root, path), updated, 'utf8');
}
console.log(`项目版本已统一为 ${version}，更新 ${changes.filter(file => file.changed).length} 个文件。`);

// !SECTION 项目版本同步
