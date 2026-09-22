import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, mindMap, renderMD] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readMindMapSource(),
    readFile('app/JS/renderMD.js', 'utf8'),
]);

assert.match(html, /id="btn-settings"[^>]*aria-controls="mindMapSettingsPopover"/,
    '原亮暗模式按钮位置应改为设置按钮');
assert.match(html, /id="mindMapSettingsPopover"[^>]*role="dialog"/,
    '设置应使用轻量悬浮弹出框');
for (const toggleId of [
    'settingThemeToggle',
    'settingCardToolbarHoverToggle',
    'settingCardContentHoverToggle',
    'settingDocumentOutlineToggle',
    'settingMathClickCopyToggle',
    'settingNodeStatsToggle',
]) {
    assert.match(html, new RegExp(`id="${toggleId}"`), `设置面板应包含 ${toggleId}`);
}

assert.match(mindMap, /MINDMAP_THEME_STORAGE_KEY\s*=\s*'mindmap_theme'/,
    '主题设置应继续兼容原持久化键');
assert.match(mindMap, /MINDMAP_CARD_TOOLBAR_HOVER_STORAGE_KEY\s*=\s*'mindmap_card_toolbar_hover'/,
    '卡片工具栏悬停设置应独立持久化');
assert.match(mindMap, /MINDMAP_CARD_CONTENT_HOVER_STORAGE_KEY\s*=\s*'mindmap_card_content_hover'/,
    '折叠内容预览设置应独立持久化');
assert.match(mindMap, /MINDMAP_DOCUMENT_OUTLINE_STORAGE_KEY\s*=\s*'mindmap_document_outline'/,
    '长文档目录设置应独立持久化');
assert.match(mindMap, /MINDMAP_NODE_STATS_VISIBLE_STORAGE_KEY\s*=\s*'mindmap_node_stats_visible'/,
    '左下角统计显示设置应独立持久化');
assert.match(mindMap, /MINDMAP_MATH_CLICK_COPY_STORAGE_KEY\s*=\s*'mindmap_math_click_copy'/,
    '公式点击复制设置应独立持久化');
assert.match(mindMap, /function applyMindMapNodeStatsVisibility[\s\S]*?nodeStats\.hidden\s*=\s*!mindMapSettings\.nodeStatsVisible/,
    '统计显示开关应直接控制左下角统计元素');
assert.match(html,
    /:root:not\(\[data-card-toolbar-hover="false"\]\) \.node-card:hover > \.card-floating-tools/,
    '关闭设置后，卡片悬停不得再显示悬浮工具栏');
assert.match(html,
    /:root:not\(\[data-card-toolbar-hover="false"\]\) \.node-card:focus-within > \.card-floating-tools/,
    '关闭设置后，卡片处于编辑焦点时也不得继续显示悬浮工具栏');
assert.doesNotMatch(html,
    /(?:^|\r?\n)\s*\.node-card:focus-within > \.card-floating-tools/m,
    '卡片聚焦显示规则必须受工具栏设置约束');
assert.match(mindMap,
    /getMindMapContentPreviewOccupiedRects\(card\),\s*!mindMapSettings\.cardToolbarHover/,
    '只有关闭悬停工具栏时，预览定位才应启用上方候选');
assert.match(mindMap,
    /applyMindMapCardContentHover\(result\?\.\[MINDMAP_CARD_CONTENT_HOVER_STORAGE_KEY\] !== false\)/,
    '启动时应恢复折叠内容预览设置');
assert.match(mindMap,
    /applyMindMapDocumentOutline\(result\?\.\[MINDMAP_DOCUMENT_OUTLINE_STORAGE_KEY\] !== false\)/,
    '启动时应恢复长文档目录设置');
assert.match(mindMap,
    /applyMindMapMathClickCopy\(result\?\.\[MINDMAP_MATH_CLICK_COPY_STORAGE_KEY\] !== false\)/,
    '启动时应恢复公式点击复制设置');
assert.match(mindMap,
    /function applyMindMapMathClickCopy[\s\S]*?mindMapSettings\.mathClickCopy = enabled !== false[\s\S]*?updateRenderedMathClickCopyState\(\)/,
    '公式点击复制开关应同步更新渲染状态');
assert.match(renderMD,
    /function isMindMapMathClickCopyEnabled[\s\S]*?mindMapSettings\.mathClickCopy !== false/,
    '公式点击复制应读取设置状态');
assert.match(renderMD,
    /if \(!isMindMapMathClickCopyEnabled\(\)\) return;[\s\S]*?copyToClipboard\(latexSource\)/,
    '关闭公式点击复制后不得执行复制');
assert.match(renderMD,
    /:root\[data-math-click-copy="false"\] \.md-content \.katex-html[\s\S]*?cursor: text/,
    '关闭公式点击复制后应取消公式点击提示样式');
assert.match(mindMap,
    /if \(!mindMapSettings\.documentOutline\) return null;[\s\S]*?getMindMapDocumentOutline\(node\.content, body\)/,
    '关闭目录设置后，展开的标准卡片不应再生成目录气泡');
assert.match(mindMap,
    /return mindMapSettings\.cardContentHover \? \{ mode: 'content', node, headings: \[\] \} : null;/,
    '折叠内容预览开关应与长文档目录开关保持独立');
assert.doesNotMatch(mindMap, /function showMindMapContentPreview\(card\)\s*\{\s*if \(!mindMapSettings\.cardContentHover\)/,
    '目录气泡不应被折叠内容预览开关连带禁用');
assert.match(mindMap, /e\.target\.closest\('\.mindmap-settings-popover'\)/,
    '操作设置弹出框时不得触发画布平移');

console.log('思维导图设置校验通过：六项设置、独立持久化与气泡联动完整。');
