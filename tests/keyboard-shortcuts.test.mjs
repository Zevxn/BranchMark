import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readMindMapSource(),
]);

assert.match(mindMap,
    /function selectAllMindMapNodes[\s\S]*?collectMindMapNodeIds\(state\.data\)[\s\S]*?updateSelection\(\)/,
    'Ctrl+A 应复用卡片选择状态，并全选脑图中的全部卡片');
assert.match(mindMap,
    /!isModalActive && !isInput && \(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === 'a'[\s\S]*?selectAllMindMapNodes\(\)/,
    'Ctrl+A 仅应在非输入状态下接管，保留文本原生全选');
assert.match(mindMap,
    /function openMindMapEditor\(node, readOnly = false, focusSource = false\)[\s\S]*?sourceEditor\.focus\(\)[\s\S]*?setSelectionRange/,
    '公共编辑入口应支持自动聚焦 Markdown 源码并把光标放到末尾');
assert.match(mindMap,
    /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key === 'Enter'[\s\S]*?state\.selectedIds\.size === 1[\s\S]*?openMindMapEditor\(node, false, true\)/,
    'Ctrl+Enter 应仅编辑当前单选卡片并请求聚焦源码');
assert.match(mindMap,
    /e\.target\.classList\.contains\('node-topic'\) && e\.key==='Enter' && !\(e\.ctrlKey \|\| e\.metaKey\)/,
    '节点 topic 的普通 Enter 处理不得截断 Ctrl+Enter 编辑快捷键');
assert.match(mindMap,
    /isModalActive && e\.key === 'Escape'[\s\S]*?\$\('#btn-close-modal'\)\.click\(\)/,
    'Esc 应复用完成按钮保存并退出编辑模式');
assert.match(html, /id="btn-close-modal"[^>]*title="完成并退出编辑 \(Esc\)"/,
    '编辑器完成按钮应提示 Esc 快捷键');

console.log('键盘快捷键校验通过：全选卡片、源码编辑聚焦与 Esc 退出逻辑完整。');
