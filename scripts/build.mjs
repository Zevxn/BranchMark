import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('app');
const target = resolve('dist');
const { version } = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
await stat(source);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await writeFile(resolve(target, 'version.json'), JSON.stringify({ version }) + '\n');
console.log(`DeepConvo 思维导图独立版已构建到 ${target}`);
