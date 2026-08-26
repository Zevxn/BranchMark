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
assert.match(html, /\.children-container\s*\{[^}]*z-index:\s*auto/s,
    '子树容器不应创建会限制悬浮工具栏的独立层叠上下文');
assert.match(html, /\.node-card:hover,\s*\.node-card:focus-within\s*\{[^}]*z-index:\s*120/s,
    '悬停或聚焦卡片应整体提升到选中卡片之上');
assert.ok(html.search(/\.node-card:hover,\s*\.node-card:focus-within\s*\{/) > html.indexOf('.node-card.selected {'),
    '悬停层级规则应位于选中规则之后，确保选中卡片悬停时也不会被覆盖');
assert.match(html, /\.summary-label-layer:hover,\s*\.summary-label-layer:focus-within\s*\{[^}]*z-index:\s*120/s,
    '总结卡片悬浮工具栏显示时应连同所在图层一起提升');

assert.match(mindMap, /e\.target\.closest\('\.header-tools'\)/,
    '工具图标点击仍应与卡片选中和拖动隔离');
assert.match(mindMap, /if\(e\.target\.closest\('\.card-header'\)\)\s*\{\s*state\.mode = 'PRE_DRAG_NODE'/,
    '标题栏未被工具图标命中时应能启动卡片预拖动');
const canvasPointerDownSource = mindMap.slice(
    mindMap.indexOf("if(!e.target.closest('.card-dock-container'))"),
    mindMap.indexOf('// #region 鼠标移动事件'),
);
assert.doesNotMatch(canvasPointerDownSource, /state\.selectedIds\.clear\(\)/,
    '画布按下并进入平移候选时不应立即清除卡片选中');
assert.match(mindMap,
    /state\.mode==='PANNING' && Math\.hypot\([\s\S]*?<5\) \{ state\.selectedIds\.clear\(\); updateSelection\(\); \}/,
    '只有空白画布无位移单击时才应取消卡片选中');
assert.match(mindMap,
    /点击空白画布时提交并退出内联编辑[\s\S]*?commitMindMapInlineEditor\(\);[\s\S]*?state\.mode = 'PANNING'/,
    '点击空白画布应提交并退出内联编辑，避免悬浮工具栏因 focus-within 残留');
assert.match(mindMap,
    /function commitMindMapInlineEditor\(\)[\s\S]*?syncCurrentInput\(\);[\s\S]*?activeEl\.blur\(\)/,
    '退出内联编辑前应同步 topic，再失焦隐藏悬浮工具栏');
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
assert.match(mindMap, /function autoFitMindMapEntity\(target, kind = 'node', direction = 'wh'\) \{[\s\S]*?syncCurrentInput\(\);[\s\S]*?target\.widthMode = 'auto'/,
    '双击自适应前应同步正在编辑的 topic，避免局部更新丢失输入');
assert.match(mindMap, /function beginMindMapResize[\s\S]*?window\.getComputedStyle\(heightElement\)\.minHeight[\s\S]*?minHeight: Number\.isFinite\(minHeight\) \? minHeight : 0/,
    '拖拽高度下限应读取与自动模式相同元素的 CSS min-height，而非硬编码数值');
assert.match(mindMap, /newHeight = Math\.max\(state\.resize\.minHeight, Math\.min\(maxHeightLimit, newHeight\)\)/,
    '拖拽时应使用保存的 CSS 最小高度约束');
assert.doesNotMatch(mindMap, /Math\.max\(50, Math\.min\(maxHeightLimit, newHeight\)\)/,
    '拖拽高度下限不得再固定为 50px');
assert.match(html, /\.resize-br\s*\{[^}]*z-index:\s*51/,
    '右下角手柄应高于侧边和底边手柄，以稳定接收双向自适应操作');
assert.match(html, /\.resize-bl\s*\{[^}]*z-index:\s*51/,
    '左下角手柄应高于侧边和底边手柄，以稳定接收双向自适应操作');
assert.match(html, /\.node-card\s*\{[\s\S]*?--node-card-radius:\s*8px[\s\S]*?--node-card-border-width:\s*2px/,
    '卡片应声明角标所需的圆角和边框宽度变量');
assert.match(html, /\.node-card\.is-root\s*\{[^}]*--node-card-border-width:\s*4px/,
    '根节点应覆盖边框宽度变量，使角标跟随更粗的根节点边框');
assert.match(html, /\.node-card \.resize-br,\s*\.node-card \.resize-bl\s*\{[\s\S]*?bottom:\s*0[\s\S]*?width:\s*32px[\s\S]*?height:\s*32px[\s\S]*?overflow:\s*hidden/,
    '卡片底角手柄应覆盖在卡片内侧，并提供足够大的拖拽区域');
assert.match(html, /\.node-card \.resize-bl::after,\s*\.node-card \.resize-br::after\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%[\s\S]*?background:\s*color-mix\(in srgb, var\(--text-color-secondary\) 62%, transparent\)[\s\S]*?pointer-events:\s*none/,
    '两侧尺寸手柄应共用不截获鼠标事件的灰色三角角标样式');
assert.match(html, /\.node-card \.resize-bl\s*\{[^}]*border-bottom-left-radius:\s*max\(0px, calc\(var\(--node-card-radius\) - var\(--node-card-border-width\)\)\)/,
    '左下角手柄应按卡片内侧圆角裁切');
assert.match(html, /\.node-card \.resize-br\s*\{[^}]*border-bottom-right-radius:\s*max\(0px, calc\(var\(--node-card-radius\) - var\(--node-card-border-width\)\)\)/,
    '右下角手柄应按卡片内侧圆角裁切');
assert.match(html, /\.node-card \.resize-bl::after\s*\{[^}]*clip-path:\s*polygon\(0 0, 0 100%, 100% 100%\)/,
    '左下角手柄应显示向左镜像的灰色三角角标');
assert.match(html, /\.node-card \.resize-br::after\s*\{[^}]*clip-path:\s*polygon\(100% 0, 100% 100%, 0 100%\)/,
    '右下角手柄应显示向右镜像的灰色三角角标');
const standardTopicWrapperRule = html.match(/\.node-card:not\(\.simple\) \.topic-wrapper\s*\{([^}]*)\}/);
assert.ok(standardTopicWrapperRule, '标准卡片标题外层应具有独立的收缩规则');
assert.match(standardTopicWrapperRule[1], /flex:\s*1 1 auto/,
    '标题外层应参与 Flex 收缩，不能由长标题撑开卡片');
assert.match(standardTopicWrapperRule[1], /min-width:\s*0/,
    '标题外层必须解除默认最小内容宽度限制');
assert.match(standardTopicWrapperRule[1], /overflow:\s*hidden/,
    '标题外层应裁切超出卡片宽度的文本');
const standardTopicRule = html.match(/\.node-card:not\(\.simple\) \.node-topic\s*\{([^}]*)\}/);
assert.ok(standardTopicRule, '标准卡片标题文本应具有独立的收缩规则');
assert.match(standardTopicRule[1], /min-width:\s*0/,
    '标题文本必须允许收缩，才能显示省略号而不溢出');
assert.match(standardTopicRule[1], /flex:\s*1 1 auto/,
    '标题文本应填充并收缩标题可用空间');
assert.match(html, /\.node-card\.simple \.node-topic\s*\{[\s\S]*?white-space:\s*pre-wrap/,
    '便利贴标题仍应保留原有自动换行行为');

console.log('卡片交互校验通过：悬浮工具栏、双击自适应与新节点直接输入逻辑完整。');
