import { build } from 'esbuild';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// SECTION CodeMirror 资源与许可打包
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
    absWorkingDir: root,
    entryPoints: ['scripts/codemirror-entry.mjs'],
    outfile: 'app/libs/codemirror.bundle.js',
    bundle: true,
    format: 'iife',
    globalName: 'BranchMarkCodeMirror',
    target: 'es2020',
    minify: true,
    metafile: true,
    legalComments: 'eof',
    banner: { js: '/* CodeMirror 6 本地资源，由 npm run editor:build 生成；许可证见 docs/licenses/codemirror-bundled-notices.txt。 */' },
});

const packages = [...new Set(Object.keys(result.metafile.inputs)
    .map(path => path.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1])
    .filter(Boolean))].sort();
const notices = await Promise.all(packages.map(async name => {
    const directory = resolve(root, 'node_modules', name);
    const metadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
    let license;
    for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
        try {
            license = await readFile(resolve(directory, filename), 'utf8');
            break;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
    if (!license) throw new Error(`${name} 缺少许可证正文`);
    return `${name}@${metadata.version} (${metadata.license})\n${'='.repeat(72)}\n${license.trim()}\n`;
}));
const licenseText = notices.join('\n');
await writeFile(resolve(root, 'docs/licenses/codemirror-bundled-notices.txt'), licenseText);
// 发布目录只复制 app/，因此在分发资源中也保留完整的第三方许可。
await appendFile(resolve(root, 'app/libs/codemirror.bundle.js'), `\n/*!\n${licenseText.replace(/\*\//g, '* /')}\n*/\n`);
console.log(`已生成 CodeMirror 离线资源及 ${packages.length} 个组件的许可证声明。`);
// !SECTION CodeMirror 资源与许可打包
