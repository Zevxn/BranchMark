import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

// SECTION 更新发布清单检查

const root = await mkdtemp(join(tmpdir(), 'branchmark-updater-'));
try {
    const bundle = join(root, 'desktop-tauri/src-tauri/target/release/bundle');
    await Promise.all([
        mkdir(join(root, 'scripts'), { recursive: true }),
        mkdir(join(root, '.tauri-updater'), { recursive: true }),
        mkdir(join(root, 'desktop-tauri/node_modules/@tauri-apps/cli'), { recursive: true }),
        mkdir(join(bundle, 'nsis'), { recursive: true }),
    ]);
    await copyFile('scripts/build-tauri.mjs', join(root, 'scripts/build-tauri.mjs'));
    await writeFile(join(root, 'desktop-tauri/src-tauri/tauri.conf.json'), JSON.stringify({ productName: 'BranchMark', version: '1.0.3', plugins: { updater: { pubkey: 'expected-public-key' } } }));
    // 用本地假 CLI 检查构建编排，不执行编译、下载或安装。
    await writeFile(join(root, 'desktop-tauri/node_modules/@tauri-apps/cli/tauri.js'), 'require("node:fs").writeFileSync("build-ran.txt", "yes");');
    const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: '', TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '', BRANCHMARK_UPDATE_NOTES_FILE: 'notes.txt' };
    const run = () => spawnSync(process.execPath, [join(root, 'scripts/build-tauri.mjs')], { env, encoding: 'utf8' });
    assert.notEqual(run().status, 0, '没有密钥时不得构建无法验证的更新包');
    await writeFile(join(root, '.tauri-updater/branchmark.key'), 'fake-private-key');
    await writeFile(join(root, '.tauri-updater/branchmark.key.pub'), 'wrong-public-key');
    assert.notEqual(run().status, 0, '不匹配的本地公钥必须阻止构建');
    await assert.rejects(readFile(join(root, 'desktop-tauri/build-ran.txt')));
    await writeFile(join(root, '.tauri-updater/branchmark.key.pub'), 'expected-public-key');
    await writeFile(join(root, 'notes.txt'), '修复问题\n改进体验');
    for (const name of ['BranchMark_1.0.3_x64-setup.exe', 'BranchMark_1.0.3_arm64-setup.exe', 'BranchMark_1.0.2_x64-setup.exe']) {
        await writeFile(join(bundle, 'nsis', name), 'fake installer');
        await writeFile(join(bundle, 'nsis', `${name}.sig`), `signature:${name}\n`);
    }
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(await readFile(join(bundle, 'latest.json'), 'utf8'));
    assert.equal(manifest.version, '1.0.3');
    assert.equal(manifest.notes, '修复问题\n改进体验');
    assert.deepEqual(Object.keys(manifest.platforms).sort(), ['windows-aarch64', 'windows-x86_64']);
    assert.equal(manifest.platforms['windows-x86_64'].signature, 'signature:BranchMark_1.0.3_x64-setup.exe');
    assert.equal(manifest.platforms['windows-x86_64'].url, 'https://github.com/Zevxn/BranchMark/releases/download/v1.0.3/BranchMark_1.0.3_x64-setup.exe');
    assert.ok(Number.isFinite(Date.parse(manifest.pub_date)));
    console.log('Tauri 更新发布检查通过：密钥门槛、版本/架构筛选、签名内容及更新说明。');
} finally {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('branchmark-updater-'));
    await rm(root, { recursive: true, force: true });
}

// !SECTION 更新发布清单检查
