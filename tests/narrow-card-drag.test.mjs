import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readFile('app/JS/MindMap.js', 'utf8'),
]);

const toolbarRule = html.match(/\.node-card:not\(\.simple\) \.header-tools\s*\{([^}]*)\}/);
assert.ok(toolbarRule, '应能定位标准卡片工具栏遮罩样式');
assert.match(toolbarRule[1], /pointer-events:\s*none/,
    '工具栏的透明渐变遮罩不得截获窄卡片的拖动事件');

const toolbarHoverRule = html.match(/\.node-card:not\(\.simple\) \.card-header:hover \.header-tools\s*\{([^}]*)\}/);
assert.ok(toolbarHoverRule, '应能定位工具栏悬停样式');
assert.match(toolbarHoverRule[1], /pointer-events:\s*none/,
    '工具栏显示后遮罩仍不应截获拖动事件');

assert.match(html,
    /\.node-card:not\(\.simple\) \.header-tools \.tool-icon\s*\{[^}]*pointer-events:\s*none/,
    '隐藏状态下的工具图标不得拦截点击');
assert.match(html,
    /\.node-card:not\(\.simple\) \.card-header:hover \.header-tools \.tool-icon\s*\{[^}]*pointer-events:\s*auto/,
    '工具栏显示后应仅由真实图标接收点击');

assert.match(mindMap, /e\.target\.closest\('\.header-tools'\)/,
    '工具图标点击仍应与卡片选中和拖动隔离');
assert.match(mindMap, /if\(e\.target\.closest\('\.card-header'\)\)\s*\{\s*state\.mode = 'PRE_DRAG_NODE'/,
    '标题栏未被工具图标命中时应能启动卡片预拖动');

console.log('窄卡片拖动校验通过：工具栏遮罩不再拦截事件，仅可见图标保留点击。');
