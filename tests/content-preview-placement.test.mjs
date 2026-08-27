import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [source, mindMapHtml] = await Promise.all([
    readFile('app/JS/MindMap.js', 'utf8'),
    readFile('app/HTML/MindMap.html', 'utf8'),
]);
const helperStart = source.indexOf('function clampMindMapContentPreview');
const helperEnd = source.indexOf('function clearMindMapContentPreviewTimer', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart,
    '应提供独立的预览气泡定位辅助函数');

const context = vm.createContext({
    MINDMAP_CONTENT_PREVIEW_GAP: 12,
    MINDMAP_CONTENT_PREVIEW_ARROW_INSET: 8,
    MINDMAP_CONTENT_PREVIEW_ARROW_CORNER_CLEARANCE: 24,
    MINDMAP_CONTENT_PREVIEW_BOTTOM_COMFORT_HEIGHT: 160,
    MINDMAP_CONTENT_PREVIEW_MIN_HEIGHT: 52,
    MINDMAP_CONTENT_PREVIEW_MIN_WIDTH: 120,
    Math,
});
vm.runInContext(source.slice(helperStart, helperEnd), context, { filename: 'content-preview-placement.js' });

const getPlacement = (card, preview, viewport, occupied = [], allowTop = false) => vm.runInContext(
    `getMindMapContentPreviewPlacement(${JSON.stringify(card)}, ${JSON.stringify(preview)}, ${JSON.stringify(viewport)}, ${JSON.stringify(occupied)}, ${allowTop})`,
    context,
);

const viewport = { left: 12, top: 64, right: 1000, bottom: 700 };
const card = { left: 400, top: 280, width: 120, height: 80, right: 520, bottom: 360 };
const preview = { width: 260, height: 180 };

const emptyLeftPlacement = getPlacement(card, preview, viewport, [
    { left: 532, top: 220, right: 792, bottom: 440 },
]);
assert.equal(emptyLeftPlacement.placement, 'left', '应优先选取没有文字卡片遮挡的左右位置');
assert.equal(emptyLeftPlacement.arrowOffset, 90, '左右气泡的箭头应对齐卡片纵向中心');

const narrowViewport = { left: 12, top: 64, right: 300, bottom: 700 };
const bottomFallback = getPlacement(
    { left: 90, top: 280, width: 100, height: 80, right: 190, bottom: 360 },
    preview,
    narrowViewport,
);
assert.equal(bottomFallback.placement, 'bottom', '左右空间不足时应默认在卡片下方显示');
assert.equal(bottomFallback.arrowOffset, 128, '下方气泡的箭头应对齐卡片横向中心');

const shiftedArrowOffset = vm.runInContext(
    "getMindMapContentPreviewArrowOffset('bottom', { left: 20, top: 280, width: 80, height: 80 }, { left: 12, top: 372, width: 260, height: 180 })",
    context,
);
assert.equal(shiftedArrowOffset, 48,
    '气泡因视口边界偏移后，箭头应跟随卡片中心投影，而不是停在气泡中点');

const tallSidePlacement = getPlacement(
    card,
    { width: 260, height: 900 },
    viewport,
);
assert.equal(tallSidePlacement.placement, 'right',
    '左右有横向空间时，不应仅因气泡过高而错误回退到下方');
assert.equal(tallSidePlacement.maxHeight, 636,
    '侧边气泡过高时应压缩到工具栏以下的可用视口高度');

const constrainedBottom = getPlacement(
    { left: 90, top: 500, width: 100, height: 60, right: 190, bottom: 560 },
    { width: 260, height: 500 },
    { left: 12, top: 64, right: 300, bottom: 620 },
);
assert.equal(constrainedBottom.placement, 'bottom');
assert.equal(constrainedBottom.top, 572,
    '下方气泡必须从卡片底部加间距处开始，不能向上夹回并覆盖目标卡片');
assert.equal(constrainedBottom.maxHeight, 52,
    '下方空间不足时应压缩为最小可交互高度并在内部滚动');

const narrowedRightPlacement = getPlacement(
    card,
    preview,
    { left: 300, top: 64, right: 700, bottom: 700 },
);
assert.equal(narrowedRightPlacement.placement, 'right',
    '右侧达到最小可读宽度时，应收缩气泡宽度而不是错误回退到下方');
assert.equal(narrowedRightPlacement.maxWidth, 168,
    '右侧气泡宽度应限制为卡片与视口右边缘之间的实际剩余空间');

const topPlacement = getPlacement(card, preview, viewport, [
    { left: 532, top: 230, right: 792, bottom: 410 },
    { left: 128, top: 230, right: 388, bottom: 410 },
    { left: 330, top: 372, right: 590, bottom: 552 },
], true);
assert.equal(topPlacement.placement, 'top',
    '关闭悬停工具栏后，应把卡片上方加入候选并在遮挡更少时选中');
assert.equal(topPlacement.arrowOffset, 130,
    '上方气泡的箭头仍应指向卡片横向中心');
assert.match(mindMapHtml, /\.card-content-preview\[data-placement="top"\]::before\s*\{[^}]*bottom:\s*-7px/s,
    '上方气泡的箭头应位于气泡底边并朝向目标卡片');
assert.match(mindMapHtml, /\.card-content-preview \.card-body:has\(> p:only-child\)\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*justify-content:\s*safe center;/s,
    '只有一个段落的短文本预览应在最小高度内安全垂直居中');
assert.doesNotMatch(mindMapHtml, /\.card-content-preview \.card-body\s*\{[^}]*justify-content:\s*(?!safe center)/s,
    '多段、表格和长内容预览不得全局强制居中');

const bottomEdgeCard = { left: 800, top: 740, width: 200, height: 100, right: 1000, bottom: 840 };
const edgeConstrainedPlacement = getPlacement(
    bottomEdgeCard,
    { width: 600, height: 720 },
    { left: 12, top: 64, right: 1200, bottom: 800 },
    [],
    true,
);
assert.equal(edgeConstrainedPlacement.placement, 'top',
    '底部卡片使左右箭头贴近角落时，应优先选择能正对卡片中心的上方气泡');
assert.ok(edgeConstrainedPlacement.arrowEdgeClearance >= 24,
    '选中的箭头应保留足够的边角间距，避免落在气泡角落');

const constrainedSideArrow = getPlacement(
    bottomEdgeCard,
    { width: 600, height: 720 },
    { left: 12, top: 64, right: 1200, bottom: 800 },
);
assert.ok(constrainedSideArrow.arrowEdgeClearance < 24 || constrainedSideArrow.arrowAlignmentError > 1,
    '没有上方候选时，算法应明确识别左右箭头被挤到边角的受限状态');

const shallowBottomPlacement = getPlacement(
    { left: 320, top: 15, width: 206, height: 48, right: 526, bottom: 63 },
    { width: 480, height: 74 },
    { left: 12, top: 12, right: 1000, bottom: 176 },
    [
        { left: 31, top: 15, right: 269, bottom: 63 },
        { left: 576, top: 15, right: 816, bottom: 63 },
    ],
);
assert.notEqual(shallowBottomPlacement.placement, 'bottom',
    '下方只剩卡片与 Tab 栏之间的狭窄走廊时，应优先选择可读的左右候选');
assert.ok(shallowBottomPlacement.availableHeight >= 160,
    '被选中的侧边候选应拥有完整的纵向可用高度');

const availableContentHeight = vm.runInContext(
    "getMindMapContentPreviewAvailableContentHeight('bottom', { top: 148, height: 140 }, { height: 138 }, { top: 64, bottom: 271 })",
    context,
);
assert.equal(availableContentHeight, 121,
    '最终排版校正应扣除气泡外框后再限制正文高度，确保完整留在视口内');

const tabLayer = Number(mindMapHtml.match(/\.mindmap-tabs\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
const previewLayer = Number(mindMapHtml.match(/\.card-content-preview\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
const contextMenuLayer = Number(mindMapHtml.match(/\.context-menu\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
const modalLayer = Number(mindMapHtml.match(/\.modal-mask\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
assert.ok(previewLayer < tabLayer,
    '预览气泡不得覆盖底部 Tab 栏');
assert.ok(contextMenuLayer < tabLayer,
    '画布右键菜单不得覆盖底部 Tab 栏');
assert.ok(previewLayer < modalLayer,
    '预览气泡不应盖过编辑器等模态框');

const overlayBottomStart = source.indexOf('function getMindMapOverlayViewportBottom');
const overlayBottomEnd = source.indexOf('function getMindMapUsableViewportBottom', overlayBottomStart);
assert.ok(overlayBottomStart >= 0 && overlayBottomEnd > overlayBottomStart,
    '应提供复用 Tab 栏边界的浮层可用底边函数');
const overlayContext = vm.createContext({ Number, Math });
vm.runInContext(source.slice(overlayBottomStart, overlayBottomEnd), overlayContext);
assert.equal(
    vm.runInContext('getMindMapOverlayViewportBottom(800, 748, 8)', overlayContext),
    740,
    '气泡和右键菜单的可用底边应位于 Tab 栏顶部并保留安全间距',
);
assert.match(source, /function positionMindMapContextMenu[\s\S]*?getMindMapUsableViewportBottom\(viewportMargin\)/,
    '右键菜单定位必须复用 Tab 栏感知的可用底边');
assert.match(source, /function getMindMapContentPreviewViewport[\s\S]*?getMindMapUsableViewportBottom\(MINDMAP_CONTENT_PREVIEW_MARGIN\)/,
    '预览气泡定位必须复用 Tab 栏感知的可用底边');
assert.match(source,
    /Promise\.resolve\(processRichContentResult\)\.then\([\s\S]*?positionMindMapContentPreview\(preview, previewContent, card, true\)/,
    'Mermaid 等富内容渲染完成后，必须按真实尺寸重新选择预览方向');

console.log('内容预览定位校验通过：避让文字、左右不足时下置、箭头对齐卡片中心。');
