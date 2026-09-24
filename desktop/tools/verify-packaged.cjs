'use strict';

/**
 * 产物验证：直接启动 release/win-unpacked 里的**真实 EXE**，
 * 通过 Chromium 远程调试协议把 tools/probe.cjs 的探针注入页面，确认装出来的东西真能跑。
 *
 * 为什么必须有这一步：
 *   tools/smoke.cjs 跑的是「electron + 源目录」，验证的是代码正确性；
 *   打包会引入 asar 封装、extraResources 拷贝、图标/清单替换、NSIS 压缩等一整套新变量，
 *   只有真正拉起产物才能证明「装完能打开、数据能存、库能加载」。
 *
 * 运行：npm run verify（在 desktop/ 下）或 node tools/verify-packaged.cjs [exe 路径]
 * 退出码 0 表示全部通过，1 表示有失败项或启动失败。
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { PROBE, buildAssertions, printReport } = require('./probe.cjs');

const DEFAULT_EXE = path.join(__dirname, '..', 'release', 'win-unpacked', 'BranchMark.exe');
const EXE_PATH = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_EXE;
const DEBUG_PORT = 9333;
const BOOT_TIMEOUT_MS = 45000;
const PROBE_TIMEOUT_MS = 60000;

function fail(message) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** 轮询远程调试端口，直到页面目标出现 */
async function waitForPageTarget(deadline) {
    let lastError = '未知原因';
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
            const targets = await response.json();
            const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
            if (page) return page;
            lastError = `已连上调试端口，但暂无 page 目标（${targets.length} 个目标）`;
        } catch (error) {
            lastError = error.message;
        }
        await sleep(400);
    }
    throw new Error(`等待调试端口超时：${lastError}`);
}

/**
 * 通过 CDP 在页面里执行表达式。
 * 只用到 Runtime.evaluate 一个方法，无需引入 ws 依赖——Node 22 自带全局 WebSocket。
 */
function createCdpClient(webSocketDebuggerUrl) {
    if (typeof WebSocket !== 'function') {
        throw new Error('当前 Node 版本没有全局 WebSocket，请使用 Node 22 及以上运行本脚本');
    }

    const socket = new WebSocket(webSocketDebuggerUrl);
    const pending = new Map();
    let nextId = 1;

    const ready = new Promise((resolve, reject) => {
        socket.addEventListener('open', () => resolve());
        socket.addEventListener('error', () => reject(new Error('调试 WebSocket 连接失败')));
    });

    socket.addEventListener('message', event => {
        let message;
        try {
            message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
        } catch {
            return;
        }
        if (typeof message.id !== 'number') return;
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
    });

    function send(method, params, timeoutMs) {
        const id = nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`${method} 超时`));
            }, timeoutMs);
            pending.set(id, {
                resolve: value => {
                    clearTimeout(timer);
                    resolve(value);
                },
                reject: error => {
                    clearTimeout(timer);
                    reject(error);
                },
            });
            socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async function evaluate(expression, timeoutMs) {
        const result = await send(
            'Runtime.evaluate',
            { expression, awaitPromise: true, returnByValue: true },
            timeoutMs,
        );
        if (result.exceptionDetails) {
            const text = result.exceptionDetails.exception?.description
                || result.exceptionDetails.text
                || '未知异常';
            throw new Error(`页面内执行异常：${text}`);
        }
        return result.result?.value;
    }

    return { ready, evaluate, close: () => socket.close() };
}

/** 结束进程及其所有子进程（Electron 会派生多个渲染/GPU 进程） */
function killTree(pid) {
    if (!pid) return;
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
        try {
            process.kill(-pid, 'SIGKILL');
        } catch {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
                // 进程可能已经退出
            }
        }
    }
}

async function run() {
    if (!fs.existsSync(EXE_PATH)) {
        fail(`未找到产物：${EXE_PATH}\n请先执行 npm run build:win 或 npm run pack。`);
    }

    const exeSize = fs.statSync(EXE_PATH).size;
    console.log('--- 产物 ---');
    console.log(`可执行文件 : ${EXE_PATH}`);
    console.log(`体积       : ${(exeSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`调试端口   : ${DEBUG_PORT}`);

    // 用临时 userData，避免污染用户真实数据目录，也保证每次验证都是「全新安装」状态
    const userDataDir = path.join(os.tmpdir(), `deepconvo-verify-${process.pid}`);
    fs.mkdirSync(userDataDir, { recursive: true });

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    // 打包后的 Electron 不支持 NODE_OPTIONS（会刷一堆 ERROR 日志）。
    // 真实用户环境里本来也没有它，这里顺手清掉，让验证环境与用户环境一致。
    delete env.NODE_OPTIONS;

    const stderrChunks = [];
    const child = spawn(
        EXE_PATH,
        [`--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${userDataDir}`],
        { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    );

    child.stderr?.on('data', chunk => stderrChunks.push(String(chunk)));

    let exitInfo = null;
    child.on('exit', (code, signal) => {
        exitInfo = `code=${code} signal=${signal}`;
    });

    let client = null;
    try {
        const page = await waitForPageTarget(Date.now() + BOOT_TIMEOUT_MS);
        console.log(`页面目标   : ${page.url}`);

        client = createCdpClient(page.webSocketDebuggerUrl);
        await client.ready;

        // 先等首屏渲染稳定，再跑完整探针，避免把「还没渲染完」误判成「渲染失败」
        const deadline = Date.now() + 20000;
        let title = '';
        while (Date.now() < deadline) {
            title = await client.evaluate('document.title', 5000);
            if (title === 'BranchMark') break;
            await sleep(400);
        }

        const probe = await client.evaluate(PROBE, PROBE_TIMEOUT_MS);

        console.log('\n--- 环境 ---');
        console.log(`Electron/Chromium : 由产物内置，未在此脚本中读取`);
        console.log(`userData          : ${userDataDir}`);

        const assertions = buildAssertions(probe);
        const failures = printReport(probe, assertions);

        const realErrors = stderrChunks
            .join('')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !/DevTools listening|Autofill/i.test(line));
        if (realErrors.length) {
            console.log('\n--- 进程 stderr ---');
            realErrors.slice(0, 20).forEach(line => console.log(`  ${line}`));
        }

        killTree(child.pid);
        process.exit(failures === 0 ? 0 : 1);
    } catch (error) {
        fail(`${error.message}${exitInfo ? `（进程已退出 ${exitInfo}）` : ''}`);
    } finally {
        try {
            client?.close();
        } catch {
            // 忽略关闭异常
        }
        killTree(child.pid);
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
        } catch {
            // 临时目录清理失败不影响结论
        }
    }
}

void run();
