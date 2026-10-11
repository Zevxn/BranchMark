import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

// SECTION 版本同步行为检查

const root = await mkdtemp(join(tmpdir(), 'branchmark-version-'));
const paths = [
    'package.json', 'app/version.json', 'desktop/package.json', 'desktop/package-lock.json',
    'desktop-tauri/package.json', 'desktop-tauri/package-lock.json',
    'desktop-tauri/src-tauri/tauri.conf.json', 'desktop-tauri/src-tauri/Cargo.toml',
    'desktop-tauri/src-tauri/Cargo.lock',
];
const snapshot = () => Promise.all(paths.map(path => readFile(join(root, path), 'utf8')));
const run = (...args) => spawnSync(process.execPath, [join(root, 'scripts/sync-version.mjs'), ...args], {
    cwd: join(root, 'desktop-tauri'), encoding: 'utf8',
});
try {
    for (const path of [...paths, 'scripts/sync-version.mjs']) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await copyFile(path, join(root, path));
    }
    const manifestPath = join(root, 'desktop-tauri/src-tauri/target/release/bundle/latest.json');
    await mkdir(dirname(manifestPath), { recursive: true });
    const manifest = '{"version":"1.0.0","platforms":{"windows-x86_64":{"signature":"existing-signature"}}}';
    await writeFile(manifestPath, manifest);
    const before = await snapshot();
    const version = '9.8.7-beta.1+test';
    const result = run(version);
    assert.equal(result.status, 0, result.stderr);
    const after = await snapshot();
    paths.forEach((path, index) => {
        assert.equal(after[index].split('\n').length, before[index].split('\n').length, `${path} 保留原有排版`);
        if (path.endsWith('.json')) {
            const expected = JSON.parse(before[index]);
            expected.version = version;
            if (path.endsWith('package-lock.json')) expected.packages[''].version = version;
            assert.deepEqual(JSON.parse(after[index]), expected, `${path} 仅修改项目版本号`);
        } else {
            const previousLines = before[index].split(/\r?\n/);
            const nextLines = after[index].split(/\r?\n/);
            const differences = nextLines.filter((line, lineIndex) => line !== previousLines[lineIndex]);
            assert.equal(nextLines.length, previousLines.length);
            assert.deepEqual(differences, [`version = "${version}"`], `${path} 保留依赖及其他配置`);
        }
    });
    assert.equal(await readFile(manifestPath, 'utf8'), manifest, '不改动已生成清单的版本或签名');
    assert.match(run(version).stdout, /更新 0 个文件/, '重复同步不改写已一致的文件');

    await writeFile(join(root, 'package.json'), after[0].replace(version, '9.8.8'));
    const sync = run();
    assert.equal(sync.status, 0, sync.stderr);
    assert.equal(JSON.parse(await readFile(join(root, 'app/version.json'), 'utf8')).version, '9.8.8');
    assert.match(sync.stdout, /更新 8 个文件/, '无参数时从根目录同步所有其他文件');
    const synced = await snapshot();
    for (const invalid of ['v1.2.3', '1.02.3', '1.2.3-01', '1.2', '1.2.3\n']) {
        assert.notEqual(run(invalid).status, 0, `拒绝无效版本 ${JSON.stringify(invalid)}`);
        assert.deepEqual(await snapshot(), synced, '无效输入不会修改文件');
    }
    await writeFile(join(root, 'desktop-tauri/src-tauri/Cargo.toml'), synced[7].replace(/^version = .*\r?\n/m, ''));
    const malformed = await snapshot();
    assert.notEqual(run('9.8.9').status, 0);
    assert.deepEqual(await snapshot(), malformed, '配置缺失时不产生部分更新');
    console.log('版本同步检查通过：跨目录调用、版本统一、依赖保留、根版本同步、输入校验及发布清单保护。');
} finally {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('branchmark-version-'));
    await rm(root, { recursive: true, force: true });
}

// !SECTION 版本同步行为检查
