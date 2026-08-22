import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readFile('app/JS/MindMap.js', 'utf8'),
]);

const toolbarRule = html.match(/\.card-floating-tools\s*\{([^}]*)\}/);
assert.ok(toolbarRule, '普通卡片与总结卡片应共用悬浮工具栏样式');
assert.match(toolbarRule[1], /left:\s*50%/,
    '悬浮工具栏应以卡片中心为定位基准');
assert.match(toolbarRule[1], /transform:\s*translate\(-50%,\s*-100%\)/,
    '悬浮工具栏应位于卡片正上方');
assert.match(toolbarRule[1], /opacity:\s*0/,
    '悬浮工具栏默认应隐藏');
assert.match(toolbarRule[1], /pointer-events:\s*none/,
    '隐藏工具栏不得截获卡片拖动事件');
assert.match(html,
    /\.node-card:hover > \.card-floating-tools,[\s\S]*?\.summary-editor:hover > \.card-floating-tools[\s\S]*?pointer-events:\s*auto/,
    '普通卡片与总结卡片悬停时都应显示并启用工具栏');

assert.match(mindMap, /e\.target\.closest\('\.header-tools'\)/,
    '工具图标点击仍应与卡片选中和拖动隔离');
assert.match(mindMap, /if\(e\.target\.closest\('\.card-header'\)\)\s*\{\s*state\.mode = 'PRE_DRAG_NODE'/,
    '标题栏未被工具图标命中时应能启动卡片预拖动');
assert.match(mindMap, /<div class="header-tools card-floating-tools">/,
    '卡片工具栏应脱离标题遮罩并复用悬浮工具栏');
assert.match(mindMap, /function focusMindMapNodeTopic[\s\S]*?range\.selectNodeContents\(topic\)/,
    '新建节点后应聚焦并选中 topic，允许立即覆盖输入');
assert.equal((mindMap.match(/focusMindMapNodeTopic\(newNode\.id\)/g) || []).length, 2,
    '新建子节点与兄弟节点都应进入 topic 输入状态');
assert.match(mindMap, /const resizeHandle = t\.closest\('\.resize-handle'\)[\s\S]*?autoFitMindMapEntity\([\s\S]*?resizeHandle\.dataset\.resize/,
    '双击任意卡片或总结的尺寸手柄应调用公共自适应逻辑');
assert.match(mindMap, /function autoFitMindMapEntity[\s\S]*?direction\.includes\('w'\)[\s\S]*?direction\.includes\('h'\)/,
    '公共自适应逻辑应按手柄方向恢复自动宽高，且不排除便利贴');
assert.match(html, /\.resize-br\s*\{[^}]*z-index:\s*51/,
    '右下角手柄应高于侧边和底边手柄，以稳定接收双向自适应操作');
assert.match(html, /\.resize-bl\s*\{[^}]*z-index:\s*51/,
    '左下角手柄应高于侧边和底边手柄，以稳定接收双向自适应操作');

console.log('卡片交互校验通过：悬浮工具栏、双击自适应与新节点直接输入逻辑完整。');
