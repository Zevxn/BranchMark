import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readMindMapSource(),
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
assert.match(html, /:root\s*\{[^}]*--node-card-topic-only-min-height:\s*43px/s,
    '无正文单行标题卡片的自然高度应作为共享尺寸变量');
assert.match(html, /:root\s*\{[^}]*--node-card-min-width:\s*100px/s,
    '所有卡片状态应复用 100px 最小宽度变量');
assert.match(html, /\.node-card\s*\{[^}]*min-width:\s*var\(--node-card-min-width\)/s,
    '普通卡片应使用共享最小宽度');
assert.match(html, /\.node-card\.simple\s*\{[\s\S]*?min-width:\s*var\(--node-card-min-width\)/,
    '便利贴不得覆盖为更大的最小宽度');
assert.match(html, /\.node-card\s*\{[^}]*min-height:\s*var\(--node-card-topic-only-min-height\)/s,
    '普通卡片应声明无正文单行标题卡片的统一最小高度');
assert.match(html, /\.node-card\.simple,\s*\.summary-editor\.simple\s*\{[^}]*min-height:\s*var\(--node-card-topic-only-min-height\)/s,
    '便利贴应复用普通无正文卡片的最小高度');
assert.match(html, /\.node-card\.topic-empty:not\(\.simple\) \.card-body\s*\{[\s\S]*?min-height:\s*calc\([\s\S]*?--node-card-topic-only-min-height/,
    '无标题但有正文的普通卡片应把统一下限落实到实际缩放的正文区域');
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
    mindMap.indexOf('// SECTION 鼠标移动事件'),
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
assert.match(mindMap, /const resizeHandles = \(isSimple \|\| \(hasContent && !isContentCollapsed\)\)[\s\S]*?getMindMapResizeHandlesHTML\(\)/,
    '只有 Topic 的标准卡片不应生成手柄，便利贴模式则必须始终保留完整尺寸调节能力');
assert.match(mindMap, /function getMindMapEntityMinHeight[\s\S]*?window\.getComputedStyle\(heightElement\)\.minHeight[\s\S]*?Number\.isFinite\(minHeight\) \? minHeight : 0/,
    '拖拽和尺寸写回应统一读取实际高度元素的 CSS min-height');
assert.match(mindMap, /function getMindMapEntityMinWidth[\s\S]*?window\.getComputedStyle\(element\)\.minWidth[\s\S]*?MINDMAP_CARD_MIN_WIDTH/,
    '拖拽和尺寸写回应读取目标卡片的实际 CSS min-width');
assert.match(mindMap, /newWidth = Math\.max\(state\.resize\.minWidth, Math\.min\(600, rawWidth\)\)/,
    '拖拽宽度不得继续使用硬编码的 120px 下限');
assert.match(mindMap, /newHeight = Math\.max\(state\.resize\.minHeight, Math\.min\(maxHeightLimit, rawHeight\)\)/,
    '拖拽时应使用保存的 CSS 最小高度约束');
assert.doesNotMatch(mindMap, /state\.resize\.startW\s*=\s*newWidth|state\.resize\.mx\s*=\s*e\.clientX/,
    '达到宽度边界后应保留越界光标行程，返回手柄前不得提前改变宽度');
assert.doesNotMatch(mindMap, /state\.resize\.startH\s*=\s*newHeight|state\.resize\.my\s*=\s*e\.clientY/,
    '达到高度边界后应保留越界光标行程，返回手柄前不得提前改变高度');
assert.match(mindMap, /const safeHeight = Math\.max\(getMindMapEntityMinHeight\(target, kind, element\), height\)/,
    '尺寸写回时应再次按目标卡片实际下限校正，避免保存不可见的小尺寸');
assert.doesNotMatch(mindMap, /Math\.max\(50, Math\.min\(maxHeightLimit, newHeight\)\)/,
    '拖拽高度下限不得再固定为 50px');
assert.match(html, /\.resize-br\s*\{[^}]*z-index:\s*51/,
    '右下角手柄应高于侧边和底边手柄，以稳定接收双向自适应操作');
assert.match(html, /\.resize-bl\s*\{[^}]*z-index:\s*51/,
    '左下角手柄应高于侧边和底边手柄，以稳定接收双向自适应操作');
assert.match(html, /\.node-card\s*\{[\s\S]*?--node-card-radius:\s*8px[\s\S]*?--node-card-border-width:\s*2px/,
    '卡片应声明角标所需的圆角和边框宽度变量');
assert.match(html, /\.node-card\s*\{[\s\S]*?--node-card-inner-radius:\s*max\(0px, calc\(var\(--node-card-radius\) - var\(--node-card-border-width\)\)\)/,
    '卡片内部背景圆角应跟随外圆角和实际边框宽度');
assert.match(html, /\.card-header\s*\{[\s\S]*?border-radius:\s*var\(--node-card-inner-radius\)/,
    '标准卡片标题背景应贴合卡片内沿圆角');
assert.match(html, /\.node-card\.has-content:not\(\.simple\):not\(\.content-collapsed\) > \.card-header\s*\{[^}]*border-radius:\s*var\(--node-card-inner-radius\) var\(--node-card-inner-radius\) 0 0/,
    '只有正文实际展开时，标准卡片标题才应只保留顶部内圆角');
assert.match(mindMap, /\$\{isContentCollapsed\?'content-collapsed':''\}/,
    '正文折叠或精简折叠时应给普通卡片添加独立状态类，使标题恢复四角圆角');
assert.doesNotMatch(`${html}\n${mindMap}`, /node-card-selection-ring/,
    '不应再用额外选中描边掩盖标题背景越过圆角的问题');
assert.match(html, /\.card-body\s*\{[\s\S]*?border-radius:\s*0 0 var\(--node-card-inner-radius\) var\(--node-card-inner-radius\)/,
    '标准卡片正文背景应贴合卡片底部内圆角，避免选中边框在拐角处被遮细');
assert.match(html, /\.node-card\.is-root\s*\{[^}]*--node-card-border-width:\s*4px/,
    '根节点应覆盖边框宽度变量，使角标跟随更粗的根节点边框');
assert.match(html, /\.node-card \.resize-br,\s*\.node-card \.resize-bl\s*\{[\s\S]*?bottom:\s*calc\(-1 \* var\(--node-card-border-width\)\)[\s\S]*?width:\s*32px[\s\S]*?height:\s*32px[\s\S]*?overflow:\s*hidden/,
    '卡片底角手柄应补偿边框宽度并提供足够大的拖拽区域');
assert.match(html, /\.node-card \.resize-bl::after,\s*\.node-card \.resize-br::after\s*\{[\s\S]*?width:\s*20px[\s\S]*?height:\s*20px[\s\S]*?background:\s*color-mix\(in srgb, var\(--text-color-secondary\) 62%, transparent\)[\s\S]*?pointer-events:\s*none/,
    '两侧尺寸手柄应共用不截获鼠标事件的灰色小三角角标样式');
assert.match(html, /\.node-card \.resize-bl\s*\{[^}]*left:\s*calc\(-1 \* var\(--node-card-border-width\)\)[^}]*border-bottom-left-radius:\s*var\(--node-card-radius\)/,
    '左下角手柄应补偿边框并按卡片外侧圆角裁切');
assert.match(html, /\.node-card \.resize-br\s*\{[^}]*right:\s*calc\(-1 \* var\(--node-card-border-width\)\)[^}]*border-bottom-right-radius:\s*var\(--node-card-radius\)/,
    '右下角手柄应补偿边框并按卡片外侧圆角裁切');
assert.match(html, /\.node-card \.resize-bl::after\s*\{[^}]*clip-path:\s*polygon\(0 0, 0 100%, 100% 100%\)/,
    '左下角手柄应显示向左镜像的灰色三角角标');
assert.match(html, /\.node-card \.resize-br::after\s*\{[^}]*clip-path:\s*polygon\(100% 0, 100% 100%, 0 100%\)/,
    '右下角手柄应显示向右镜像的灰色三角角标');
assert.match(html, /\.summary-editor\s*\{[\s\S]*?--summary-card-radius:\s*8px[\s\S]*?--summary-card-border-width:\s*2px/,
    '总结卡片应声明独立的圆角和边框宽度变量');
assert.match(html, /\.summary-editor \.resize-br,\s*\.summary-editor \.resize-bl\s*\{[\s\S]*?bottom:\s*calc\(-1 \* var\(--summary-card-border-width\)\)[\s\S]*?width:\s*32px[\s\S]*?height:\s*32px/,
    '总结卡片应提供与普通卡片一致的大尺寸底角拖拽热区');
assert.match(html, /\.summary-editor \.resize-bl::after,\s*\.summary-editor \.resize-br::after\s*\{[\s\S]*?width:\s*20px[\s\S]*?height:\s*20px[\s\S]*?pointer-events:\s*none/,
    '总结卡片应显示不截获鼠标事件的灰色三角角标');
assert.match(html, /\.summary-editor \.resize-br\s*\{[^}]*right:\s*calc\(-1 \* var\(--summary-card-border-width\)\)[^}]*border-bottom-right-radius:\s*var\(--summary-card-radius\)/,
    '总结卡片右下角标应贴合自身圆角');
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
