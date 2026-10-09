import { spawnSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// SECTION 签名构建与更新清单

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = resolve(root, 'desktop-tauri');
const config = JSON.parse(await readFile(resolve(desktop, 'src-tauri/tauri.conf.json'), 'utf8'));
const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY) {
    const key = resolve(root, '.tauri-updater/branchmark.key');
    try {
        const publicKey = (await readFile(`${key}.pub`, 'utf8')).trim();
        if (publicKey !== config.plugins.updater.pubkey) {
            throw new Error('本地签名公钥与 tauri.conf.json 不一致');
        }
        // 传入内容，避免不同平台对私钥路径的处理差异；不输出私钥。
        env.TAURI_SIGNING_PRIVATE_KEY = (await readFile(key, 'utf8')).trim();
        env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
    } catch (error) {
        throw new Error(`无法读取更新签名密钥，请恢复 .tauri-updater/branchmark.key，或设置 TAURI_SIGNING_PRIVATE_KEY：${error.message}`);
    }
}
const cli = resolve(desktop, 'node_modules/@tauri-apps/cli/tauri.js');
const result = spawnSync(process.execPath, [cli, 'build', '--bundles', 'nsis,msi'], {
    cwd: desktop,
    env,
    stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const bundle = resolve(desktop, 'src-tauri/target/release/bundle');
const platforms = {};
for (const name of await readdir(resolve(bundle, 'nsis'))) {
    const prefix = `${config.productName}_${config.version}_`;
    if (!name.startsWith(prefix) || !name.endsWith('-setup.exe')) continue;
    const architecture = { x64: 'x86_64', x86: 'i686', arm64: 'aarch64' }[name.slice(prefix.length, -'-setup.exe'.length)];
    if (!architecture) continue;
    const signature = (await readFile(resolve(bundle, 'nsis', `${name}.sig`), 'utf8')).trim();
    platforms[`windows-${architecture}`] = {
        url: `https://github.com/Zevxn/BranchMark/releases/download/v${config.version}/${encodeURIComponent(name)}`,
        signature,
    };
}
if (!Object.keys(platforms).length) throw new Error('未找到带签名的 NSIS 更新包');
const notes = process.env.BRANCHMARK_UPDATE_NOTES_FILE
    ? await readFile(resolve(root, process.env.BRANCHMARK_UPDATE_NOTES_FILE), 'utf8')
    : '';
await writeFile(resolve(bundle, 'latest.json'), JSON.stringify({
    version: config.version,
    notes,
    pub_date: new Date().toISOString(),
    platforms,
}, null, 2) + '\n');
console.log(`更新清单已生成：${resolve(bundle, 'latest.json')}`);
console.log(`请将同次构建的 latest.json 和对应的 NSIS 安装包上传到 GitHub Release v${config.version}；.sig 可选上传留存。`);

// !SECTION 签名构建与更新清单
