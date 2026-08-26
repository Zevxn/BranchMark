import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readFile('app/JS/MindMap.js', 'utf8'),
]);

assert.match(html, /id=["']btn-add-summary["'][^>]*disabled/,
    '工具栏应提供默认禁用的多卡片总结按钮');
assert.match(html, /<svg[^>]*id=["']summary-brace-layer["']/,
    '画布变换层中应包含独立的 SVG 大括号图层');
assert.match(html, /id=["']summary-label-layer["']/,
    '画布变换层中应包含独立的 HTML 总结编辑器图层');
assert.match(html, /id=["']summarySelectionAction["'][\s\S]*?添加总结/,
    '框选有效卡片后应提供添加总结的浮动入口');
assert.match(html, /\.summary-editor\s*\{[\s\S]*?pointer-events:\s*auto/,
    '总结编辑器应能在画布覆盖层中接收输入事件');
assert.match(html, /\.summary-editor\.simple\s*\{[\s\S]*?background:/,
    '总结框应提供与卡片一致的便利贴视觉模式');
assert.match(html, /\.summary-editor\s*\{[\s\S]*?min-height:\s*0/,
    '总结卡片容器不应额外锁定高于普通卡片的最小高度');
assert.match(html, /\.summary-label-layer\s*\{[\s\S]*?width:\s*1px/,
    '总结编辑器覆盖层应继续使用不干扰画布布局的最小尺寸');
assert.match(html, /\.summary-editor\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?min-width:\s*var\(--node-card-min-width\);[\s\S]*?max-width:\s*600px/,
    '总结卡片自动宽度应按内容固有宽度计算，并复用普通卡片的尺寸边界');
assert.match(html, /\.node-card\.simple,\s*\.summary-editor\.simple\s*\{\s*min-height:\s*var\(--node-card-topic-only-min-height\)/,
    '普通便利贴与总结便利贴应复用无正文普通卡片的最小高度');
assert.match(html, /\.summary-editor\.simple \.summary-card-body\s*\{\s*display:\s*none/,
    '便利贴模式应隐藏正文并仅展示总结标题');
assert.match(html, /\.summary-editor\.topic-empty \.summary-card-header\s*\{\s*display:\s*none/,
    '总结标题为空时应彻底隐藏标题栏');
assert.match(html, /\.summary-editor\.topic-empty\.has-content \.summary-card-body\s*\{[\s\S]*?border-radius:\s*6px/,
    '无标题总结的正文应直接接管卡片顶部圆角');
assert.match(html, /\.summary-editor\.topic-empty\.has-content \.summary-card-body\s*\{[\s\S]*?min-height:\s*calc\([\s\S]*?--node-card-topic-only-min-height/,
    '无标题但有正文的总结卡片应把统一最小高度落实到实际缩放的正文区域');
assert.doesNotMatch(html, /\.summary-editor\.topic-empty::before/,
    '总结标题为空时不应生成普通卡片使用的幽灵拖动手柄');
assert.match(html, /\.summary-editor\.horizontal\.placement-top\s*\{\s*transform:\s*translate\(-50%,\s*-100%\)/,
    '横向总结在上方时应以底边居中对齐大括号');
assert.match(html, /\.summary-editor\.horizontal\.placement-bottom\s*\{\s*transform:\s*translate\(-50%,\s*0\)/,
    '横向总结在下方时应以顶边居中对齐大括号');
assert.match(html, /\.summary-editor\.horizontal\.placement-top \.resize-b\s*\{[\s\S]*?top:\s*-5px;[\s\S]*?bottom:\s*auto;/,
    '顶部横向总结应把高度手柄放到不受括号锚定的顶边');
assert.match(html, /\.child-unit\.summary-space-before\s*\{\s*margin-top:\s*var\(--summary-space-before/,
    '导图中部的横向总结应能在分支前预留真实布局空间');
assert.match(html, /\.child-unit\.summary-space-after\s*\{\s*margin-bottom:\s*var\(--summary-space-after/,
    '导图中部的横向总结应能在分支后预留真实布局空间');
assert.match(html, /\.card-floating-tools\s*\{[\s\S]*?opacity:\s*0/,
    '总结框与普通卡片应复用默认隐藏的悬浮工具栏');
assert.match(html, /\.summary-brace\s*\{[\s\S]*?vector-effect:\s*non-scaling-stroke/,
    '大括号在画布缩放时应保持清晰稳定的描边');
assert.match(html, /\.node-card\.summary-member\s*\{[\s\S]*?outline:[\s\S]*?box-shadow:/,
    '选中总结时，其成员卡片应具有独立的高亮样式');

assert.match(mindMap, /relations:\s*\[\],\s*summaries:\s*\[\]/,
    '新建思维导图应初始化独立的总结数据集合');
assert.match(mindMap, /selectedSummaryId:\s*null/,
    '界面状态应独立记录当前选中的总结');
assert.match(mindMap, /ids\.length\s*<\s*MINDMAP_SUMMARY_MIN_NODES/,
    '少于两张卡片时不能创建总结');
assert.match(mindMap, /if \(sides\.size !== 1\) return null/,
    '跨左右两侧的卡片不能创建基础版总结');
assert.match(mindMap, /ensureMindMapSummaries\(\)\.push\(summary\)[\s\S]*?recordHistory\(\)/,
    '创建总结后应写入数据并记录撤销历史');
assert.match(mindMap, /removeMindMapRelationsForNodes\(deletedNodeIds\);\s*removeMindMapSummariesForNodes\(deletedNodeIds\);/,
    '删除卡片或子树时应同步清理总结成员');
assert.match(mindMap, /createElementNS\(MINDMAP_SUMMARY_SVG_NS, 'path'\)/,
    '总结范围应使用 SVG 路径绘制');
assert.match(mindMap, /createMindMapSummaryEditor\(summary\.id\)/,
    '每个可见总结应复用对应的 HTML 编辑器');
assert.match(mindMap, /function updateMindMapSummaryMemberHighlights\(\)[\s\S]*?getMindMapSummaryById\(state\.selectedSummaryId\)[\s\S]*?summary\.nodeIds\.forEach[\s\S]*?classList\.add\('summary-member'\)/,
    '选中总结时应根据 nodeIds 高亮所有被总结卡片');
assert.match(mindMap, /function clearSelectedMindMapSummary\(\)[\s\S]*?state\.selectedSummaryId = null;[\s\S]*?updateMindMapSummaryMemberHighlights\(\)/,
    '取消总结选中时应同步移除成员卡片高亮');
assert.match(mindMap, /isSimple:\s*false/,
    '新建总结应默认使用卡片模式');
assert.match(mindMap, /topic:\s*'总结'/,
    '新建总结的默认标题应为“总结”');
assert.match(mindMap, /toggleMindMapEntitySimpleMode\(summary\)[\s\S]*?recordHistory\(\)/,
    '总结应复用卡片模式切换规则，并记录撤销历史');
assert.match(mindMap, /function toggleMindMapEntitySimpleMode[\s\S]*?entity\.widthMode = 'manual'/,
    '普通卡片与总结卡片应共用便利贴尺寸初始化逻辑');
assert.match(mindMap, /classList\.toggle\('simple',\s*Boolean\(summary\.isSimple\)\)/,
    '渲染总结时应恢复已保存的展示模式');
assert.match(mindMap, /function getMindMapSummaryContent\(summary\)[\s\S]*?summary\?\.text/,
    '总结 Markdown 内容应兼容读取旧版 text 字段');
assert.match(mindMap, /function setMindMapSummaryContent\(summary, content\)[\s\S]*?summary\.content\s*=[\s\S]*?delete summary\.text/,
    '保存总结 Markdown 时应迁移到与普通卡片一致的 content 字段');
assert.match(mindMap, /topic\.addEventListener\('input'[\s\S]*?summary\.topic\s*=/,
    '总结标题应独立保存，并供便利贴模式展示');
assert.match(mindMap, /entityKind === 'summary' \? \(node\.topic \?\? '总结'\)/,
    '公共编辑器应保留总结的显式空标题，只对缺失字段使用默认标题');
assert.match(mindMap, /const summaryTopic = String\(summary\.topic \?\? '总结'\)[\s\S]*?document\.activeElement !== topic[\s\S]*?classList\.toggle\('topic-empty', isTopicEmpty\)/,
    '总结渲染应在非编辑状态根据空标题切换隐藏样式');
assert.match(mindMap, /topic\.addEventListener\('blur'[\s\S]*?recordHistory\(\);[\s\S]*?scheduleRenderMindMapSummaries\(\)/,
    '清空总结标题并失焦后应立即重新测量和渲染卡片');
assert.match(mindMap, /beginMindMapResize\(event, summary, 'summary', editor\)/,
    '总结卡片应复用卡片尺寸调整状态机');
assert.match(mindMap, /function getMindMapResizePointerFactor\(kind, element, axis\)[\s\S]*?classList\.contains\('horizontal'\)[\s\S]*?axis === 'width' \? 2 : 1/,
    '横向总结以中心定位时应补偿宽度手柄只有一半位移的问题');
assert.match(mindMap, /function getMindMapResizeHeightDirection\(kind, element\)[\s\S]*?classList\.contains\('placement-top'\)[\s\S]*?\? -1/,
    '顶部横向总结从自由顶边调高时应反转纵向拖拽方向');
assert.match(mindMap, /if \(resizeKind !== 'summary'\) scheduleRenderMindMapSummaries\(\);/,
    '总结卡片拖拽期间不应重复运行会改写定位的总结布局器');
assert.match(mindMap, /editor\.addEventListener\('dblclick'[\s\S]*?if \(handle\) autoFitMindMapEntity\(summary, 'summary', handle\.dataset\.resize\);[\s\S]*?openMindMapEditor\(summary\)/,
    '总结卡片双击应打开公共 Markdown 编辑器，仅尺寸手柄双击执行自适应');
assert.match(mindMap, /const summary = getMindMapSummaryById\(state\.selectedSummaryId\);[\s\S]*?const node = summary \|\| findNode[\s\S]*?openMindMapEditor\(node, false, true\)/,
    '选中总结时 Ctrl+Enter 应复用公共 Markdown 源码编辑入口');
assert.match(mindMap, /body\.innerHTML = renderMarkdown\(summaryContent\);[\s\S]*?processRichContent\(body\)/,
    '总结正文应复用普通卡片的 Markdown 渲染与富内容处理');
assert.match(mindMap, /tools\.className = 'summary-tools card-floating-tools'/,
    '总结卡片应复用卡片顶部居中的悬浮工具栏');
assert.match(mindMap, /editor\.append\(header, body, tools\)/,
    '总结工具栏应作为卡片直接子元素，避免被标题区域裁切');
assert.match(mindMap, /getMindMapSummaryById\(summaryEditor\.dataset\.summaryId\)[\s\S]*?kind: 'summary'/,
    '双击尺寸手柄时应能解析总结卡片为公共尺寸目标');
assert.match(mindMap, /applyColorToMindMapSelection[\s\S]*?summary\.color\s*=\s*color/,
    '通用颜色入口应同时支持普通卡片和总结卡片');
assert.match(mindMap, /scheduleRenderMindMapRelations\(\);\s*scheduleRenderMindMapSummaries\(\);/,
    '卡片布局更新时应同时刷新关系线和总结标注');
assert.match(mindMap, /parentChildCount\s*>\s*siblingCount\s*\?\s*'horizontal'\s*:\s*'vertical'/,
    '只有选中卡片的直接父子关系多于兄弟配对时才使用横向总结');
assert.match(mindMap, /function prepareMindMapSummaryLayout\(summaries\)[\s\S]*?getMindMapSummaryLayoutDeficit\(candidate\.requiredSpace, anchors\)[\s\S]*?spacingRequests/,
    '横向总结应先比较局部空白与实际所需空间，只对不足部分申请布局占位');
assert.match(mindMap, /function getMindMapSummarySelectedBranchAnchor[\s\S]*?ancestorChains[\s\S]*?ancestorChains\.every\(chain => chain\.includes\(unit\)\)/,
    '总结布局应找到共同包含全部成员卡片的分支边界');
assert.match(mindMap, /function initializeMapContextMenu\(\)[\s\S]*?const summaryEditor = e\.target\.closest\('\.summary-editor'\)[\s\S]*?selectMindMapSummary\(summary\.id\)/,
    '右击总结卡片时应复用脑图右键菜单并选中对应总结');
assert.match(mindMap, /contextTargetKind = 'node'[\s\S]*?clearSelectedMindMapRelation\(\);[\s\S]*?clearSelectedMindMapSummary\(\);/,
    '从总结切换到普通卡片右键菜单时应清理旧的独立对象选中态');
assert.match(mindMap, /\['cut', 'copy', 'paste', 'add-relation', 'create-tab-from-node', 'expand', 'collapse'\][\s\S]*?setActionVisibility\(action, false\)/,
    '总结右键菜单应隐藏依赖树节点结构的不适用功能');
assert.match(mindMap, /contextTargetKind === 'summary'[\s\S]*?action === 'copy-md'[\s\S]*?action === 'delete'[\s\S]*?action === 'auto-fit'[\s\S]*?action === 'to-simple'[\s\S]*?action === 'set-color'/,
    '总结右键菜单应复用复制、删除、自适应、模式切换和颜色动作');
assert.match(mindMap, /const useSelectedBoundary = placement === 'top'[\s\S]*?let direction = useSelectedBoundary \? 'before' : \(placement === 'top' \? 'after' : 'before'\)/,
    '上方总结应移动成员分支，下方总结应直接推动实际碰撞的完整障碍分支');
assert.match(mindMap, /other\.anchor\.contains\(candidate\.anchor\)/,
    '多个嵌套障碍锚点应保留外层分支，避免只拉开叶子子卡片');
assert.doesNotMatch(mindMap, /labelXOffset|getMindMapSummaryHorizontalCollisionShift/,
    '横向总结卡片必须持续与大括号中心对齐，不能独立横移');
assert.match(mindMap, /function getMindMapSummaryLayoutAnchors\(nodeIds, placement, bounds, candidate = null\)[\s\S]*?querySelectorAll\('\.node-card'\)[\s\S]*?collisionRect[\s\S]*?direction,/,
    '总结应使用所有可见普通卡片的实际矩形查找布局障碍');
assert.match(mindMap, /function getMindMapSummaryHorizontalBraceY\(bounds, placement\)[\s\S]*?bounds\.top - MINDMAP_SUMMARY_BRACE_OFFSET[\s\S]*?bounds\.bottom \+ MINDMAP_SUMMARY_BRACE_OFFSET/,
    '横向总结大括号必须贴近成员卡片，不能移到整张导图之外');
assert.match(mindMap, /occupiedSummaryRects[\s\S]*?getMindMapSummaryCollisionOffset[\s\S]*?labelOffset \+= collisionOffset/,
    '多个总结卡片应使用实际矩形错位，避免彼此覆盖');
assert.match(mindMap, /function chooseMindMapSummaryAutoOrientation[\s\S]*?MINDMAP_SUMMARY_ORIENTATION_SWITCH_PENALTY[\s\S]*?MINDMAP_SUMMARY_ORIENTATION_HYSTERESIS/,
    '纵向与横向总结应按避障代价自动择优，并使用迟滞避免频繁切换');
assert.match(mindMap, /function prepareMindMapSummaryLayout\(summaries\)[\s\S]*?getMindMapSummaryVerticalEvaluation[\s\S]*?chooseMindMapSummaryAutoOrientation[\s\S]*?braceX:\s*chosen\.candidate\.braceX/,
    '纵向总结应先计算最小横移距离，必要时自动切换为横版');
assert.match(mindMap, /canvasLayer\?\.getBoundingClientRect\(\)[\s\S]*?rect\.left - canvasLeft[\s\S]*?rect\.top - canvasTop/,
    '卡片坐标应根据画布实际 DOM 变换反算，避免左侧总结使用过期视图偏移');

const selectionSource = mindMap.slice(
    mindMap.indexOf('function getMindMapNodeBranchSide'),
    mindMap.indexOf('function getMindMapSummaryBracePath'),
);
const pathSource = mindMap.slice(
    mindMap.indexOf('function getMindMapSummaryBracePath'),
    mindMap.indexOf('function getMindMapSummaryGeometry'),
);
const canvasRectSource = mindMap.slice(
    mindMap.indexOf('function getMindMapCanvasRect'),
    mindMap.indexOf('function expandMindMapRelationObstacle'),
);
const layoutAnchorSource = mindMap.slice(
    mindMap.indexOf('function getMindMapSummarySelectedBranchAnchor'),
    mindMap.indexOf('function getMindMapSummaryEditorCanvasSize'),
);
const cleanupSource = mindMap.slice(
    mindMap.indexOf('function removeMindMapSummariesForNodes'),
    mindMap.indexOf('function hasDuplicateMindMapSummary'),
);
assert.ok(selectionSource.startsWith('function getMindMapNodeBranchSide'), '应能提取同侧选择校验函数');
assert.ok(pathSource.startsWith('function getMindMapSummaryBracePath'), '应能提取大括号路径函数');
assert.ok(canvasRectSource.startsWith('function getMindMapCanvasRect'), '应能提取画布坐标换算函数');
assert.ok(layoutAnchorSource.startsWith('function getMindMapSummarySelectedBranchAnchor'), '应能提取总结布局占位锚点函数');
assert.ok(cleanupSource.startsWith('function removeMindMapSummariesForNodes'), '应能提取总结成员清理函数');

const selectionContext = vm.createContext({
    state: { data: { id: 'root' }, selectedIds: new Set() },
    findNode: (_root, id) => id === 'missing' ? null : { id },
    isDescendantOfLeft: id => id.startsWith('left-'),
    findParent: (_root, id) => ({
        'left-parent': { id: 'root' },
        'left-child-a': { id: 'left-parent' },
        'left-child-b': { id: 'left-parent' },
        'left-grandchild': { id: 'left-child-a' },
        'left-sibling-a': { id: 'left-shared-parent' },
        'left-sibling-b': { id: 'left-shared-parent' },
        'left-sibling-c': { id: 'left-shared-parent' },
    })[id] || null,
});
vm.runInContext(`const MINDMAP_SUMMARY_MIN_NODES = 2; ${selectionSource}`, selectionContext);
selectionContext.sameSide = new Set(['left-a', 'left-b', 'left-c']);
selectionContext.crossSide = new Set(['left-a', 'right-b']);
selectionContext.withRoot = new Set(['root', 'right-b']);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapSummarySelection(sameSide)', selectionContext))),
    { nodeIds: ['left-a', 'left-b', 'left-c'], side: 'left' },
    '至少两张同侧卡片应通过总结选择校验',
);
assert.equal(vm.runInContext('getMindMapSummarySelection(crossSide)', selectionContext), null,
    '跨侧选择必须被拒绝');
assert.equal(vm.runInContext('getMindMapSummarySelection(withRoot)', selectionContext), null,
    '根卡片不能参与同侧总结');
selectionContext.parentDominant = ['left-parent', 'left-child-a', 'left-grandchild'];
selectionContext.siblingDominant = ['left-sibling-a', 'left-sibling-b', 'left-sibling-c'];
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapSummaryRelationProfile(parentDominant)', selectionContext))),
    { parentChildCount: 2, siblingCount: 0, orientation: 'horizontal' },
    '连续父子关系占优时应选择横向总结',
);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapSummaryRelationProfile(siblingDominant)', selectionContext))),
    { parentChildCount: 0, siblingCount: 3, orientation: 'vertical' },
    '兄弟关系占优时应保留纵向总结',
);

const pathContext = vm.createContext({});
vm.runInContext(`
    const MINDMAP_SUMMARY_BRACE_OFFSET = 18;
    const MINDMAP_SUMMARY_LABEL_GAP = 22;
    const MINDMAP_SUMMARY_COLLISION_GAP = 14;
    const MINDMAP_CARD_MIN_WIDTH = 100;
    const MINDMAP_SUMMARY_ESTIMATED_WIDTH = 180;
    const MINDMAP_SUMMARY_ESTIMATED_HEIGHT = 120;
    const MINDMAP_SUMMARY_ORIENTATION_SWITCH_PENALTY = 48;
    const MINDMAP_SUMMARY_ORIENTATION_HYSTERESIS = 24;
    ${pathSource}
`, pathContext);
pathContext.bounds = { left: 100, top: 50, right: 300, bottom: 250 };
const rightPath = vm.runInContext("getMindMapSummaryBracePath(bounds, 'right')", pathContext);
const leftPath = vm.runInContext("getMindMapSummaryBracePath(bounds, 'left')", pathContext);
const shiftedRightPath = vm.runInContext("getMindMapSummaryBracePath(bounds, 'right', 500)", pathContext);
assert.match(rightPath, /^M 318 42 C /, '右侧总结的大括号应从卡片包围盒右边开始');
assert.match(leftPath, /^M 82 42 C /, '左侧总结的大括号应镜像放在卡片包围盒左边');
assert.match(shiftedRightPath, /^M 500 42 C /, '纵向避障后大括号路径应使用计算得到的水平位置');
assert.notEqual(rightPath, leftPath, '左右大括号路径不能使用相同方向');
const topPath = vm.runInContext("getMindMapSummaryHorizontalBracePath(bounds, 'top')", pathContext);
const bottomPath = vm.runInContext("getMindMapSummaryHorizontalBracePath(bounds, 'bottom')", pathContext);
assert.match(topPath, /^M 92 32 C /, '上方横向大括号应从卡片包围盒左上方开始');
assert.match(bottomPath, /^M 92 268 C /, '下方横向大括号应从卡片包围盒左下方开始');
pathContext.rootRect = { top: 100, height: 100 };
pathContext.topBounds = { top: 0, bottom: 80 };
pathContext.bottomBounds = { top: 220, bottom: 300 };
pathContext.middleBounds = { top: 100, bottom: 220 };
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapSummaryHorizontalPlacement(topBounds, rootRect)', pathContext))),
    { placement: 'top', region: 'top' },
    '成员全部位于根卡片上方时，总结应放在上方',
);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapSummaryHorizontalPlacement(bottomBounds, rootRect)', pathContext))),
    { placement: 'bottom', region: 'bottom' },
    '成员全部位于根卡片下方时，总结应放在下方',
);
assert.equal(vm.runInContext('getMindMapSummaryHorizontalPlacement(middleBounds, rootRect).region', pathContext), 'middle',
    '成员区域跨过根卡片中心线时应进入自动留位模式');
assert.equal(
    vm.runInContext("getMindMapSummaryHorizontalBraceY(bounds, 'top')", pathContext),
    32,
    '上方总结大括号应贴近所选卡片的上边缘',
);
assert.equal(
    vm.runInContext("getMindMapSummaryHorizontalBraceY(bounds, 'bottom')", pathContext),
    268,
    '下方总结大括号应贴近所选卡片的下边缘',
);
pathContext.verticalEditorSize = { width: 140, height: 80 };
const rightVerticalCandidate = vm.runInContext(
    "getMindMapSummaryVerticalCandidate(bounds, 'right', verticalEditorSize)",
    pathContext,
);
assert.equal(rightVerticalCandidate.braceX, 318,
    '无障碍时右侧纵向大括号应保持贴近成员卡片');
assert.ok(rightVerticalCandidate.editorRect.left > rightVerticalCandidate.braceX,
    '右侧纵向总结卡片应位于大括号外侧');
const verticalObstacleCard = {
    dataset: { nodeId: 'vertical-obstacle' },
    getClientRects: () => [{}],
    rect: { left: 280, top: 40, right: 450, bottom: 300 },
};
pathContext.document = { querySelectorAll: selector => selector === '.node-card' ? [verticalObstacleCard] : [] };
pathContext.getMindMapCanvasRect = card => card.rect;
pathContext.verticalNodeIds = [];
const shiftedVerticalEvaluation = vm.runInContext(
    "getMindMapSummaryVerticalEvaluation(bounds, 'right', verticalEditorSize, verticalNodeIds)",
    pathContext,
);
assert.ok(shiftedVerticalEvaluation.cost > 0,
    '纵向大括号与普通卡片重叠时应计算向外移动距离');
assert.ok(shiftedVerticalEvaluation.candidate.collisionRect.left >= verticalObstacleCard.rect.right,
    '移动后的纵向大括号和总结卡片应整体越过障碍卡片');
pathContext.smallVerticalEvaluation = { orientation: 'vertical', cost: 20 };
pathContext.largeVerticalEvaluation = { orientation: 'vertical', cost: 300 };
pathContext.freeHorizontalEvaluation = { orientation: 'horizontal', deficit: 0 };
assert.equal(
    vm.runInContext('chooseMindMapSummaryAutoOrientation(smallVerticalEvaluation, freeHorizontalEvaluation).orientation', pathContext),
    'vertical',
    '纵向只需小幅移动时应保留兄弟关系的纵向表现',
);
assert.equal(
    vm.runInContext('chooseMindMapSummaryAutoOrientation(largeVerticalEvaluation, freeHorizontalEvaluation).orientation', pathContext),
    'horizontal',
    '纵向需要跨越宽卡片时应自动切换为横版',
);
pathContext.nearThresholdVerticalEvaluation = { orientation: 'vertical', cost: 60 };
assert.equal(
    vm.runInContext("chooseMindMapSummaryAutoOrientation(nearThresholdVerticalEvaluation, freeHorizontalEvaluation, 'vertical').orientation", pathContext),
    'vertical',
    '接近切换阈值时应保持上一方向，避免折叠展开导致反复跳变',
);
pathContext.editorSize = { width: 140, height: 80 };
const localBottomCandidate = vm.runInContext(
    "getMindMapSummaryHorizontalCandidate(bounds, 'bottom', editorSize)",
    pathContext,
);
pathContext.localBottomCandidate = localBottomCandidate;
assert.equal(localBottomCandidate.braceY, 268,
    '局部候选位置应继续以所选卡片下边缘为基准');
assert.ok(localBottomCandidate.editorRect.top > pathContext.bounds.bottom,
    '下方总结编辑框应位于大括号外侧');
assert.ok(localBottomCandidate.requiredSpace > localBottomCandidate.editorRect.bottom - pathContext.bounds.bottom,
    '所需空间应包含总结卡片外侧的安全间距');
pathContext.manualResizeObstacle = {
    left: localBottomCandidate.editorRect.left,
    right: localBottomCandidate.editorRect.right,
    top: localBottomCandidate.editorRect.top + 10,
    bottom: localBottomCandidate.editorRect.bottom + 40,
};
const manualResizeOffset = vm.runInContext(
    "getMindMapSummaryCollisionOffset(localBottomCandidate, 'bottom', [manualResizeObstacle])",
    pathContext,
);
pathContext.manualResizeOffset = manualResizeOffset;
const shiftedManualCandidate = vm.runInContext(
    "getMindMapSummaryHorizontalCandidate(bounds, 'bottom', editorSize, manualResizeOffset)",
    pathContext,
);
assert.ok(manualResizeOffset > 0,
    '手动放大的总结与普通卡片重叠时应计算向外移动距离');
assert.ok(shiftedManualCandidate.editorRect.top >= pathContext.manualResizeObstacle.bottom + 14,
    '纵向错位计算应能把候选总结整体移到障碍卡片外侧');
pathContext.wideGapAnchors = [{ distance: localBottomCandidate.requiredSpace + 40 }];
pathContext.narrowGapAnchors = [{ distance: localBottomCandidate.requiredSpace - 35 }];
pathContext.crossingGapAnchors = [{ distance: -10 }];
assert.equal(
    vm.runInContext('getMindMapSummaryLayoutDeficit(localBottomCandidate.requiredSpace, wideGapAnchors).deficit', pathContext),
    0,
    '局部空白足够时不应改动导图布局',
);
assert.ok(Math.abs(
    vm.runInContext('getMindMapSummaryLayoutDeficit(localBottomCandidate.requiredSpace, narrowGapAnchors).deficit', pathContext) - 35
) < 1e-9, '局部空白不足时只能补足缺少的空间');
assert.ok(Math.abs(
    vm.runInContext('getMindMapSummaryLayoutDeficit(localBottomCandidate.requiredSpace, crossingGapAnchors).deficit', pathContext)
        - (localBottomCandidate.requiredSpace + 10)
) < 1e-9, '普通卡片跨过成员边界时，应把侵入深度计入所需占位');
assert.equal(
    vm.runInContext('getMindMapSummaryLayoutDeficit(localBottomCandidate.requiredSpace, []).deficit', pathContext),
    0,
    '指定方向没有相邻卡片时应直接使用自由空间',
);
pathContext.preferredEvaluation = { placement: 'top', deficit: 90 };
pathContext.freeAlternateEvaluation = { placement: 'bottom', deficit: 0 };
assert.equal(
    vm.runInContext("chooseMindMapSummaryHorizontalLayout('top', preferredEvaluation, freeAlternateEvaluation).placement", pathContext),
    'bottom',
    '首选方向空间不足而另一侧有空白时，应直接利用另一侧而不是重排',
);
pathContext.tighterTopEvaluation = { placement: 'top', deficit: 30 };
pathContext.tighterBottomEvaluation = { placement: 'bottom', deficit: 70 };
assert.equal(
    vm.runInContext("chooseMindMapSummaryHorizontalLayout('bottom', tighterTopEvaluation, tighterBottomEvaluation).placement", pathContext),
    'top',
    '上下均不足时，应选择需要调整空白更少的一侧',
);

const canvasElement = {
    offsetWidth: 400,
    offsetHeight: 300,
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 800, height: 600 }),
};
const canvasContext = vm.createContext({
    state: { view: { tx: -999, ty: -999, scale: 3 } },
    document: { getElementById: id => id === 'canvas-layer' ? canvasElement : null },
});
vm.runInContext(canvasRectSource, canvasContext);
canvasContext.cardElement = {
    dataset: { nodeId: 'left-card' },
    getBoundingClientRect: () => ({ left: 140, top: 260, width: 200, height: 100 }),
};
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapCanvasRect(cardElement)', canvasContext))),
    { id: 'left-card', left: 20, top: 30, right: 120, bottom: 80, width: 100, height: 50 },
    '左侧总结成员的坐标应以画布实际原点和缩放为准，不受过期 state.view 影响',
);

const selectedBranchContents = new Set();
const selectedBranchUnit = {
    contains: element => selectedBranchContents.has(element),
    parentElement: null,
};
const selectedCard = {
    dataset: { nodeId: 'selected' },
    closest: selector => selector === '.child-unit' ? selectedBranchUnit : null,
};
selectedBranchContents.add(selectedCard);
const obstacleUnit = {
    contains: () => false,
};
const obstacleCard = {
    dataset: { nodeId: 'obstacle' },
    getClientRects: () => [{}],
    closest: selector => selector === '.child-unit' ? obstacleUnit : null,
    rect: { left: 0, top: 120, right: 100, bottom: 200 },
};
let visibleLayoutCards = [selectedCard, obstacleCard];
const layoutAnchorContext = vm.createContext({
    document: {
        getElementById: id => id === 'card-selected' ? selectedCard : null,
        querySelectorAll: selector => selector === '.node-card' ? visibleLayoutCards : [],
    },
    getMindMapCanvasRect: element => element.rect,
});
vm.runInContext(layoutAnchorSource, layoutAnchorContext);
layoutAnchorContext.selectionBounds = { top: 0, bottom: 100 };
layoutAnchorContext.selectedBranchUnit = selectedBranchUnit;
layoutAnchorContext.obstacleUnit = obstacleUnit;
layoutAnchorContext.layoutCandidate = {
    collisionRect: { left: -20, top: 100, right: 120, bottom: 300 },
};
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, layoutCandidate)[0].anchor === obstacleUnit", layoutAnchorContext),
    true,
    '总结位于成员下方时，应推动实际碰撞的障碍分支',
);
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, layoutCandidate)[0].direction", layoutAnchorContext),
    'before',
    '下方总结应在障碍分支之前留位，确保相邻卡片实际向下避让',
);
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'top', selectionBounds, layoutCandidate)[0].anchor === selectedBranchUnit", layoutAnchorContext),
    true,
    '总结位于成员上方时，应在成员分支边界留位，避免远端出现无关空白',
);
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'top', selectionBounds, layoutCandidate)[0].direction", layoutAnchorContext),
    'before',
    '上方总结应通过成员分支前置留白腾出空间',
);
obstacleCard.rect = { left: 0, top: 90, right: 100, bottom: 200 };
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, layoutCandidate)[0].distance", layoutAnchorContext),
    -10,
    '展开后的普通卡片跨过成员下边界时，必须保留负间距而不能当作无障碍',
);
layoutAnchorContext.unrelatedCandidate = {
    collisionRect: { left: 200, top: 100, right: 300, bottom: 300 },
};
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, unrelatedCandidate).length", layoutAnchorContext),
    0,
    '水平方向不与总结卡片相交的普通卡片不应触发额外留白',
);
const outerBranchUnit = {
    contains: () => false,
    parentElement: { closest: selector => selector === '.child-unit' ? selectedBranchUnit : null },
};
const innerBranchUnit = {
    contains: () => false,
    parentElement: { closest: selector => selector === '.child-unit' ? outerBranchUnit : null },
};
const nestedObstacleCard = {
    dataset: { nodeId: 'nested-obstacle' },
    getClientRects: () => [{}],
    closest: selector => selector === '.child-unit' ? innerBranchUnit : null,
    rect: { left: 0, top: 120, right: 100, bottom: 200 },
};
visibleLayoutCards = [selectedCard, nestedObstacleCard];
selectedBranchContents.add(nestedObstacleCard);
layoutAnchorContext.outerBranchUnit = outerBranchUnit;
layoutAnchorContext.layoutCandidate = {
    collisionRect: { left: -20, top: 100, right: 120, bottom: 300 },
};
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, layoutCandidate)[0].anchor === outerBranchUnit", layoutAnchorContext),
    true,
    '总结避障应移动完整的外层分支，不能把叶子子卡片从兄弟节点中单独拉开',
);
const cleanupContext = vm.createContext({
    state: {
        data: {
            summaries: [
                { id: 'keep', nodeIds: ['a', 'b', 'c'], text: '保留' },
                { id: 'remove', nodeIds: ['a', 'b'], text: '删除' },
            ],
        },
        selectedSummaryId: 'remove',
    },
});
vm.runInContext(`const MINDMAP_SUMMARY_MIN_NODES = 2; ${cleanupSource}`, cleanupContext);
cleanupContext.deletedIds = new Set(['a']);
assert.equal(vm.runInContext('removeMindMapSummariesForNodes(deletedIds)', cleanupContext), true,
    '删除总结成员时应报告数据发生变化');
assert.equal(cleanupContext.state.data.summaries.length, 1,
    '剩余成员不足两张的总结应自动删除');
assert.deepEqual([...cleanupContext.state.data.summaries[0].nodeIds], ['b', 'c'],
    '仍有至少两名成员的总结应保留并移除失效成员');
assert.equal(cleanupContext.state.selectedSummaryId, null,
    '自动删除当前总结时应同步清除界面选择状态');

console.log('多卡片总结校验通过：同侧约束、独立数据、SVG 大括号、HTML 编辑与成员清理逻辑完整。');
