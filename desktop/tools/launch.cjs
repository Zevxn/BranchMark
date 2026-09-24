'use strict';

/**
 * 启动器：清掉可能存在的 ELECTRON_RUN_AS_NODE 环境变量后再拉起 Electron。
 *
 * 某些 IDE / 智能体终端会把 ELECTRON_RUN_AS_NODE=1 注入到子进程环境里。
 * 一旦存在，electron.exe 会退化成普通的 Node 解释器，直接执行 .js 文件，
 * 结果是「窗口不出现、脚本静默当成 Node 跑」，非常难排查。
 * 这里显式剔除该变量，保证 npm run desktop / npm run smoke 在任何终端下行为一致。
 */

const { spawn } = require('node:child_process');

const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, process.argv.slice(2), { stdio: 'inherit', env });

child.on('error', error => {
    console.error('[desktop] 无法启动 Electron:', error.message);
    process.exit(1);
});

child.on('close', code => process.exit(code === null ? 1 : code));
