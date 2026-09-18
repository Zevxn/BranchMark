import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readMindMapSource(),
]);

assert.match(html, /id=["']btn-add-summary["'][^>]*disabled/,
    '工具栏应提供默认禁用的多卡片总结按钮');
assert.match(html, /<svg[^>]*id=["']summary-brace-layer["']/,
    '画布变换层中应包含独立的 SVG 大括号图层');
assert.match(html, /\.summary-brace\s*\{[\s\S]*?stroke-width:\s*2\.5/,
    '大括号样式描边宽度应与精细碰撞模型保持一致');
assert.match(html, /<svg[^>]*id=["']tree-connector-layer["']/,
    '父子连接线应使用独立 SVG 图层并根据最终卡片坐标绘制');
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
assert.match(html, /\.summary-editor\.topic-empty\.has-content \.summary-card-body\s*\{[\s\S]*?border-radius:\s*var\(--summary-card-inner-radius\)/,
    '无标题总结的正文应直接接管卡片顶部圆角');
assert.match(html, /\.summary-editor\s*\{[\s\S]*?--summary-card-inner-radius:\s*max\(0px, calc\(var\(--summary-card-radius\) - var\(--summary-card-border-width\)\)\)/,
    '总结卡片内部背景圆角应由外圆角减去边框宽度得到');
assert.match(html, /\.summary-card-header\s*\{[\s\S]*?border-radius:\s*var\(--summary-card-inner-radius\) var\(--summary-card-inner-radius\) 0 0/,
    '总结标题背景应贴合卡片内沿圆角，避免选中边框在拐角处被遮细');
assert.match(html, /\.summary-editor:not\(\.has-content\) > \.summary-card-header,[\s\S]*?\.summary-editor\.simple > \.summary-card-header\s*\{[\s\S]*?border-radius:\s*var\(--summary-card-inner-radius\)/,
    '仅标题和便利贴总结应让标题背景贴合四个内圆角');
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
assert.match(html, /\.summary-editor:not\(\.simple\):not\(\.has-content\) \.resize-handle\s*\{\s*display:\s*none !important;/,
    '没有正文、只有 Topic 的标准总结卡片不应显示尺寸调节手柄');
assert.doesNotMatch(html, /\.summary-editor:not\(\.has-content\) \.resize-(?:b|br|bl)/,
    '便利贴总结不能因没有正文而被隐藏高度及角部手柄');
assert.match(html, /\.child-unit\.summary-shifted\s*\{[\s\S]*?transform:\s*translateY\(var\(--summary-shift-y/,
    '总结避障应使用不参与 Flex 高度计算的分支位移');
assert.doesNotMatch(html, /summary-space-before|summary-space-after/,
    '总结避障不得再通过 margin 撑高祖先布局');
assert.match(html, /\.root-locator\.tree-connectors-active[\s\S]*?\.child-unit::before[\s\S]*?display:\s*none/,
    '启用 SVG 父子连接线后应停用依赖 Flex 中心的伪元素连接线');
assert.match(html, /\.root-locator\.tree-connectors-active[\s\S]*?\.fold-btn\.has-children::before[\s\S]*?display:\s*none/,
    '展开状态下应停用折叠按钮短线，避免与 SVG 父子连接线重复绘制');
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
assert.match(mindMap, /function isMindMapSummaryCompleteSubtree[\s\S]*?selectedRoots\.length !== 1[\s\S]*?subtreeIds\.size === selectedIds\.size/,
    '总结方向判定应识别唯一入口且成员完整的子树');
assert.match(mindMap, /const isSingleChain[\s\S]*?isDescendant\(state\.data, nodeId, otherId\)[\s\S]*?isDescendant\(state\.data, otherId, nodeId\)[\s\S]*?orientation:\s*isCompleteSubtree[\s\S]*?\? 'vertical'[\s\S]*?isSingleChain \|\| parentChildCount > siblingCount/,
    '完整子树应优先使用纵向总结，跨级单链和父子关系占优的混合选区才使用横向总结');
assert.match(mindMap, /function prepareMindMapSummaryLayout\(summaries\)[\s\S]*?clearMindMapSummaryBranchShifts\(\)[\s\S]*?const shiftByUnit = new Map\(\)[\s\S]*?MINDMAP_SUMMARY_LAYOUT_MAX_STEPS[\s\S]*?applyMindMapSummaryBoundaryShift/,
    '总结布局应从原始树迭代求解分支位移约束');
assert.doesNotMatch(mindMap, /summary-space-before|summary-space-after|--summary-space|spacingRequests/,
    '总结避障执行层不得残留 Flex margin 占位逻辑');
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
assert.match(mindMap, /let direction = placement === 'top' \? 'after' : 'before'[\s\S]*?getMindMapSummaryDescendantSeparationAnchor/,
    '上方总结应在障碍子树之后留位，使障碍及其后代整体上移');
assert.match(mindMap, /function getMindMapSummarySeparationAnchor[\s\S]*?outermostSeparateUnit[\s\S]*?!selectedCards\.some\(selectedCard => unit\.contains\(selectedCard\)\)/,
    '避障应锚定到成员与障碍发生分叉的完整子树边界');
assert.match(mindMap, /function getMindMapSummaryDescendantSeparationAnchor[\s\S]*?placement === 'top' \? selectedUnits\[0\] : selectedUnits\[selectedUnits\.length - 1\][\s\S]*?placement === 'top' \? 'before' : 'after'/,
    '祖先碰撞时应把成员分支推离祖先，不能让子树越过父节点');
assert.doesNotMatch(mindMap, /labelXOffset|getMindMapSummaryHorizontalCollisionShift/,
    '横向总结卡片中心必须始终与大括号中心对齐');
assert.match(mindMap, /function getMindMapSummaryVerticalBraceCollisionRegions[\s\S]*?appendMindMapSummaryCollisionCurveSegments[\s\S]*?function getMindMapSummaryHorizontalBraceCollisionRegions/,
    '总结大括号应按实际路径分段建立精细避障区域');
assert.match(mindMap, /function getMindMapSummaryVerticalObstacleConstraint[\s\S]*?isAbove[\s\S]*?isBelow[\s\S]*?getMindMapSummarySeparationAnchor[\s\S]*?deficit/,
    '纵向总结应把可分离的上下兄弟分支转换为纵向位移约束');
assert.match(mindMap, /region\.kind === 'brace' \? MINDMAP_SUMMARY_BRANCH_CLEARANCE : 0/,
    '兄弟分支应只在大括号描边区域追加视觉留白，避免重复扩大总结卡片安全区');
assert.match(mindMap, /if \(evaluation\.orientation === 'vertical'\)[\s\S]*?evaluation\.constraints[\s\S]*?nextConstraint = \{ anchor, direction, deficit \}/,
    '通用布局迭代器应处理纵向总结生成的分支避障约束');
assert.match(mindMap, /function getMindMapSummaryLayoutAnchors\(nodeIds, placement, bounds, candidate = null\)[\s\S]*?candidate\?\.editorRect[\s\S]*?rect\.top >= candidate\.braceY[\s\S]*?getMindMapSummaryIntersectingRegions\(rect, candidate\)/,
    '横向总结应通过共享的精细碰撞区域查找障碍，避免使用空白包围区域误判');
assert.match(mindMap, /function getMindMapSummaryHorizontalBraceY\(bounds, placement\)[\s\S]*?bounds\.top - MINDMAP_SUMMARY_BRACE_OFFSET[\s\S]*?bounds\.bottom \+ MINDMAP_SUMMARY_BRACE_OFFSET/,
    '横向总结大括号必须贴近成员卡片，不能移到整张导图之外');
assert.match(mindMap, /function getMindMapSummaryCollisionFreeHorizontalCandidate[\s\S]*?getMindMapSummaryCollisionOffset[\s\S]*?labelOffset \+= collisionOffset[\s\S]*?occupiedSummaryRects/,
    '多个总结卡片应使用实际矩形错位，避免彼此覆盖');
assert.match(mindMap, /function getMindMapSummaryHorizontalBraceLane[\s\S]*?naturalCandidate[\s\S]*?group\.outerEdge[\s\S]*?overlapsVertically[\s\S]*?MINDMAP_SUMMARY_BRACE_LANE_GAP[\s\S]*?braceOffset \+= outwardShift/,
    '范围相交的横向总结应把大括号和卡片作为完整组合分配轨道');
assert.match(mindMap, /orderedSummaries[\s\S]*?compareMindMapSummaryLayoutOrder[\s\S]*?occupiedHorizontalSummaryGroups[\s\S]*?outerEdge:[\s\S]*?candidate\.editorRect/,
    '多个总结应使用稳定顺序，并以先前总结卡片外边界计算下一条大括号');
assert.match(mindMap, /fixedLayouts\.set\(summary\.id[\s\S]*?orientation:\s*geometry\.orientation[\s\S]*?placement:\s*geometry\.orientation === 'horizontal' \? geometry\.placement : geometry\.side/,
    '总结应先固定大括号方向和位置，再进行分支位移求解');
assert.doesNotMatch(mindMap, /function prepareMindMapSummaryLayout\(summaries\)[\s\S]*?chooseMindMapSummaryHorizontalLayout\(|function prepareMindMapSummaryLayout\(summaries\)[\s\S]*?chooseMindMapSummaryAutoOrientation\(/,
    '布局规划不得在尺寸临界点改选大括号方向或上下位置');
assert.match(mindMap, /function renderMindMapSummaries\(\)\s*\{[\s\S]*?state\.mode === 'RESIZING' && state\.resize\?\.kind === 'summary'[\s\S]*?return;/,
    '总结卡片缩放期间应暂停后台避障重排，松手后再执行最终布局');
assert.match(mindMap, /function renderMindMapTreeConnectors\(\)[\s\S]*?getMindMapCanvasRect\(parentCard\)[\s\S]*?getMindMapCanvasRect\(card\)/,
    '父子连接线必须根据分支位移后的最终卡片矩形绘制');
assert.match(mindMap, /function getMindMapTreeConnectorPoints\(parentRect, childRect, side\)[\s\S]*?return \[[\s\S]*?\];/,
    '父子连接线应通过统一函数计算真实的正交连接点');
assert.match(mindMap, /function getMindMapSummaryTreeConnectorPath\(parentRect, childRect, side\)[\s\S]*?getMindMapRoundedOrthogonalPath\(\s*getMindMapTreeConnectorPoints\(parentRect, childRect, side\),\s*10\s*\)/,
    '父子连接线应复用统一几何并绘制真实的 10px 正交圆角路径');
assert.match(mindMap, /prepareMindMapSummaryEditorsForMeasurement\(summaries, labelLayer\);[\s\S]*?const layoutPlans = prepareMindMapSummaryLayout\(summaries\);\s*renderMindMapTreeConnectors\(\);/,
    '总结编辑器必须先恢复真实尺寸和正文，再执行避障与最终父子连线');
assert.match(mindMap, /function prepareMindMapSummaryEditorsForMeasurement[\s\S]*?body\.style\.height[\s\S]*?body\.innerHTML = renderMarkdown\(summaryContent\)/,
    '手动高度和自动正文尺寸应在首次避障测量前进入 DOM');
assert.match(mindMap, /const layoutPlans = prepareMindMapSummaryLayout\(summaries\);\s*renderMindMapTreeConnectors\(\);/,
    '父子连接线应在总结分支位移求解完成后刷新');
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
const collisionSource = mindMap.slice(
    mindMap.indexOf('function getMindMapSummaryExpandedCollisionRegion'),
    mindMap.indexOf('function getMindMapSummaryBraceCollisionGap'),
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
assert.ok(collisionSource.startsWith('function getMindMapSummaryExpandedCollisionRegion'), '应能提取总结共享碰撞函数');
assert.ok(canvasRectSource.startsWith('function getMindMapCanvasRect'), '应能提取画布坐标换算函数');
assert.ok(layoutAnchorSource.startsWith('function getMindMapSummarySelectedBranchAnchor'), '应能提取总结布局占位锚点函数');
assert.ok(cleanupSource.startsWith('function removeMindMapSummariesForNodes'), '应能提取总结成员清理函数');

const selectionNodes = {
    root: { id: 'root', children: [] },
    'left-parent': { id: 'left-parent', children: [] },
    'left-child-a': { id: 'left-child-a', children: [] },
    'left-child-b': { id: 'left-child-b', children: [] },
    'left-grandchild': { id: 'left-grandchild', children: [] },
    'left-sibling-a': { id: 'left-sibling-a', children: [] },
    'left-sibling-b': { id: 'left-sibling-b', children: [] },
    'left-sibling-c': { id: 'left-sibling-c', children: [] },
    'left-complete-root': { id: 'left-complete-root', children: [] },
    'left-complete-a': { id: 'left-complete-a', children: [] },
    'left-complete-b': { id: 'left-complete-b', children: [] },
    'left-complete-a-child': { id: 'left-complete-a-child', children: [] },
    'left-complete-b-child': { id: 'left-complete-b-child', children: [] },
};
selectionNodes['left-parent'].children = [selectionNodes['left-child-a'], selectionNodes['left-child-b']];
selectionNodes['left-child-a'].children = [selectionNodes['left-grandchild']];
selectionNodes['left-complete-root'].children = [selectionNodes['left-complete-a'], selectionNodes['left-complete-b']];
selectionNodes['left-complete-a'].children = [selectionNodes['left-complete-a-child']];
selectionNodes['left-complete-b'].children = [selectionNodes['left-complete-b-child']];
selectionNodes.root.children = [
    selectionNodes['left-parent'],
    selectionNodes['left-sibling-a'],
    selectionNodes['left-sibling-b'],
    selectionNodes['left-sibling-c'],
    selectionNodes['left-complete-root'],
];
const selectionParents = {
    'left-parent': selectionNodes.root,
    'left-child-a': selectionNodes['left-parent'],
    'left-child-b': selectionNodes['left-parent'],
    'left-grandchild': selectionNodes['left-child-a'],
    'left-sibling-a': { id: 'left-shared-parent' },
    'left-sibling-b': { id: 'left-shared-parent' },
    'left-sibling-c': { id: 'left-shared-parent' },
    'left-complete-root': selectionNodes.root,
    'left-complete-a': selectionNodes['left-complete-root'],
    'left-complete-b': selectionNodes['left-complete-root'],
    'left-complete-a-child': selectionNodes['left-complete-a'],
    'left-complete-b-child': selectionNodes['left-complete-b'],
};
const selectionContext = vm.createContext({
    state: { data: selectionNodes.root, selectedIds: new Set() },
    findNode: (_root, id) => id === 'missing' ? null : (selectionNodes[id] || { id, children: [] }),
    isDescendantOfLeft: id => id.startsWith('left-'),
    findParent: (_root, id) => selectionParents[id] || null,
    isDescendant: (_root, nodeId, targetId) => {
        const visit = node => (node.children || []).some(child => child.id === targetId || visit(child));
        return visit(selectionNodes[nodeId] || { children: [] });
    },
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
selectionContext.skippedGenerationChain = ['left-parent', 'left-grandchild'];
selectionContext.siblingDominant = ['left-sibling-a', 'left-sibling-b', 'left-sibling-c'];
selectionContext.completeSubtree = [
    'left-complete-root',
    'left-complete-a',
    'left-complete-a-child',
    'left-complete-b',
    'left-complete-b-child',
];
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapSummaryRelationProfile(parentDominant)', selectionContext))),
    { parentChildCount: 2, siblingCount: 0, orientation: 'horizontal' },
    '连续父子关系占优时应选择横向总结',
);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapSummaryRelationProfile(skippedGenerationChain)', selectionContext))),
    { parentChildCount: 0, siblingCount: 0, orientation: 'horizontal' },
    '祖先与隔代后代仍在同一条分支链上，应选择横向总结',
);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapSummaryRelationProfile(siblingDominant)', selectionContext))),
    { parentChildCount: 0, siblingCount: 3, orientation: 'vertical' },
    '兄弟关系占优时应保留纵向总结',
);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getMindMapSummaryRelationProfile(completeSubtree)', selectionContext))),
    { parentChildCount: 4, siblingCount: 1, orientation: 'vertical' },
    '完整子树即使父子关系数量占优，也应在分支外侧使用纵向总结',
);
selectionContext.overlappingSummaries = [
    { id: 'summary-ac', nodeIds: ['A', 'C'] },
    { id: 'summary-abc', nodeIds: ['A', 'B', 'C'] },
];
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext(
        '[...overlappingSummaries].sort(compareMindMapSummaryLayoutOrder).map(summary => summary.id)',
        selectionContext,
    ))),
    ['summary-abc', 'summary-ac'],
    '成员范围重叠时应按成员数量稳定分配内外轨道，不受创建顺序影响',
);

const pathContext = vm.createContext({});
vm.runInContext(`
    const state = { view: { scale: 1 } };
    const MINDMAP_SUMMARY_BRACE_OFFSET = 18;
    const MINDMAP_SUMMARY_LABEL_GAP = 22;
    const MINDMAP_SUMMARY_COLLISION_GAP = 14;
    const MINDMAP_SUMMARY_BRANCH_CLEARANCE = 14;
    const MINDMAP_SUMMARY_BRACE_STROKE_WIDTH = 2.5;
    const MINDMAP_SUMMARY_BRACE_LANE_GAP = 14;
    const MINDMAP_CARD_MIN_WIDTH = 100;
    const MINDMAP_SUMMARY_ESTIMATED_WIDTH = 180;
    const MINDMAP_SUMMARY_ESTIMATED_HEIGHT = 120;
    ${pathSource}
    ${layoutAnchorSource}
`, pathContext);
assert.equal(vm.runInContext('getMindMapSummaryBraceCollisionGap()', pathContext), 1.25,
    '默认缩放下大括号碰撞包络应等于可见描边半宽');
vm.runInContext('state.view.scale = 2', pathContext);
assert.equal(vm.runInContext('getMindMapSummaryBraceCollisionGap()', pathContext), 0.625,
    '大括号碰撞包络应按画布缩放换算为画布坐标');
vm.runInContext('state.view.scale = 1', pathContext);
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
assert.ok(shiftedVerticalEvaluation.candidate.collisionRegions.every(region =>
    verticalObstacleCard.rect.right <= region.left
    || verticalObstacleCard.rect.left >= region.right
    || verticalObstacleCard.rect.bottom <= region.top
    || verticalObstacleCard.rect.top >= region.bottom
), '移动后的纵向大括号和总结卡片真实碰撞区域应全部避开障碍卡片');
const blankSpaceObstacleCard = {
    dataset: { nodeId: 'blank-space-obstacle' },
    getClientRects: () => [{}],
    rect: { left: 390, top: 45, right: 450, bottom: 90 },
};
pathContext.document = {
    querySelectorAll: selector => selector === '.node-card' ? [blankSpaceObstacleCard] : []
};
const blankSpaceVerticalEvaluation = vm.runInContext(
    "getMindMapSummaryVerticalEvaluation(bounds, 'right', verticalEditorSize, verticalNodeIds)",
    pathContext,
);
assert.equal(blankSpaceVerticalEvaluation.cost, 0,
    '只进入成员范围空白区域、未接触总结卡片或大括号路径的障碍不得触发纵向总结外移');
const nearbyCard = {
    dataset: { nodeId: 'nearby-sibling' },
    getClientRects: () => [{}],
    rect: { left: 100, top: 260, right: 450, bottom: 360 },
};
vm.runInContext('state.view.scale = 1.5', pathContext);
pathContext.document = { querySelectorAll: selector => selector === '.node-card' ? [nearbyCard] : [] };
const nearbyVerticalEvaluation = vm.runInContext(
    "getMindMapSummaryVerticalEvaluation(bounds, 'right', verticalEditorSize, verticalNodeIds)",
    pathContext,
);
nearbyCard.rect.right = 700;
const widenedNearbyVerticalEvaluation = vm.runInContext(
    "getMindMapSummaryVerticalEvaluation(bounds, 'right', verticalEditorSize, verticalNodeIds)",
    pathContext,
);
assert.equal(nearbyVerticalEvaluation.cost, 0,
    '与大括号可见描边仍有间隙的兄弟节点不应触发避障');
assert.equal(widenedNearbyVerticalEvaluation.cost, 0,
    '兄弟节点变宽后仍不应触发避障');
assert.equal(widenedNearbyVerticalEvaluation.candidate.braceX, nearbyVerticalEvaluation.candidate.braceX,
    '大括号位置不应受未接触兄弟节点的宽度影响');
const verticalMembers = [
    {
        dataset: { nodeId: 'vertical-member-a' },
        getClientRects: () => [{}],
        rect: { left: 100, top: 50, right: 300, bottom: 140 },
    },
    {
        dataset: { nodeId: 'vertical-member-b' },
        getClientRects: () => [{}],
        rect: { left: 100, top: 160, right: 300, bottom: 250 },
    },
];
const verticalMemberSet = new Set(verticalMembers);
const verticalSelectedBranch = { contains: element => verticalMemberSet.has(element) };
const verticalSiblingUnit = {
    contains: () => false,
    parentElement: { closest: selector => selector === '.child-unit' ? verticalSelectedBranch : null },
};
const verticalSiblingCard = {
    dataset: { nodeId: 'vertical-sibling' },
    getClientRects: () => [{}],
    closest: selector => selector === '.child-unit' ? verticalSiblingUnit : null,
    rect: { left: 100, top: 260, right: 700, bottom: 340 },
};
pathContext.document = {
    getElementById(id) {
        return verticalMembers.find(card => `card-${card.dataset.nodeId}` === id) || null;
    },
    querySelectorAll(selector) {
        return selector === '.node-card' ? [...verticalMembers, verticalSiblingCard] : [];
    },
};
pathContext.verticalMemberIds = verticalMembers.map(card => card.dataset.nodeId);
pathContext.tallVerticalEditorSize = { width: 140, height: 400 };
pathContext.verticalSiblingUnit = verticalSiblingUnit;
const braceClearanceEvaluation = vm.runInContext(
    "getMindMapSummaryVerticalEvaluation(bounds, 'right', verticalEditorSize, verticalMemberIds)",
    pathContext,
);
assert.equal(braceClearanceEvaluation.cost, 0,
    '兄弟分支进入大括号视觉留白时不应横向推远总结');
assert.equal(braceClearanceEvaluation.constraints.length, 1,
    '靠近大括号端部的兄弟分支应生成纵向留白约束');
const lowerBraceEdge = Math.max(...braceClearanceEvaluation.candidate.collisionRegions
    .filter(region => region.kind === 'brace')
    .map(region => region.bottom));
const branchClearance = vm.runInContext('MINDMAP_SUMMARY_BRANCH_CLEARANCE', pathContext);
const braceClearanceShift = Math.ceil(braceClearanceEvaluation.constraints[0].deficit);
verticalSiblingCard.rect.top += braceClearanceShift;
verticalSiblingCard.rect.bottom += braceClearanceShift;
assert.ok(verticalSiblingCard.rect.top - lowerBraceEdge >= branchClearance,
    '兄弟分支避让后应与大括号可见描边保留统一视觉间距');
const clearedBraceClearanceEvaluation = vm.runInContext(
    "getMindMapSummaryVerticalEvaluation(bounds, 'right', verticalEditorSize, verticalMemberIds)",
    pathContext,
);
assert.equal(clearedBraceClearanceEvaluation.constraints.length, 0,
    '补足大括号视觉间距后布局应立即收敛');
verticalSiblingCard.rect.top = 260;
verticalSiblingCard.rect.bottom = 340;
const tallVerticalEvaluation = vm.runInContext(
    "getMindMapSummaryVerticalEvaluation(bounds, 'right', tallVerticalEditorSize, verticalMemberIds)",
    pathContext,
);
assert.equal(tallVerticalEvaluation.cost, 0,
    '纵向总结拉高后应优先保持贴近成员，不能被下方兄弟节点横向推远');
assert.equal(tallVerticalEvaluation.constraints.length, 1,
    '纵向总结与下方兄弟节点相交时应生成一个分支位移约束');
assert.equal(tallVerticalEvaluation.constraints[0].anchor, verticalSiblingUnit,
    '纵向总结应移动可分离的完整兄弟分支');
assert.equal(tallVerticalEvaluation.constraints[0].direction, 'before',
    '下方兄弟分支应整体向下避让纵向总结');
const siblingVerticalDeficit = tallVerticalEvaluation.constraints[0].deficit;
verticalSiblingCard.rect.right = 1000;
const widenedTallVerticalEvaluation = vm.runInContext(
    "getMindMapSummaryVerticalEvaluation(bounds, 'right', tallVerticalEditorSize, verticalMemberIds)",
    pathContext,
);
assert.equal(widenedTallVerticalEvaluation.cost, 0,
    '兄弟节点变宽后仍应移动兄弟分支，而不是横向推远总结');
assert.equal(widenedTallVerticalEvaluation.constraints[0].deficit, siblingVerticalDeficit,
    '兄弟节点宽度不应改变所需的纵向避让距离');
const appliedSiblingShift = Math.ceil(siblingVerticalDeficit);
verticalSiblingCard.rect.top += appliedSiblingShift;
verticalSiblingCard.rect.bottom += appliedSiblingShift;
const clearedTallVerticalEvaluation = vm.runInContext(
    "getMindMapSummaryVerticalEvaluation(bounds, 'right', tallVerticalEditorSize, verticalMemberIds)",
    pathContext,
);
assert.equal(clearedTallVerticalEvaluation.constraints.length, 0,
    '兄弟分支补足纵向缺口后应收敛，不得继续累积位移');
assert.equal(clearedTallVerticalEvaluation.candidate.braceX, 318,
    '兄弟分支避让完成后大括号应保持自然位置');
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
pathContext.firstTopLane = vm.runInContext(
    "getMindMapSummaryHorizontalBraceLane(bounds, 'top', editorSize, [])",
    pathContext,
);
pathContext.firstTopCandidate = vm.runInContext(
    "getMindMapSummaryHorizontalCandidate(bounds, 'top', editorSize, 0, firstTopLane.braceOffset)",
    pathContext,
);
pathContext.topSummaryGroups = [{
    ...pathContext.firstTopLane.track,
    outerEdge: pathContext.firstTopCandidate.editorRect.top,
}];
pathContext.secondTopLane = vm.runInContext(
    "getMindMapSummaryHorizontalBraceLane(bounds, 'top', editorSize, topSummaryGroups)",
    pathContext,
);
assert.equal(pathContext.firstTopLane.braceOffset, 0,
    '首个横向大括号应保持贴近成员范围');
assert.ok(pathContext.secondTopLane.braceOffset >= 14,
    '范围相同的第二个横向大括号应进入外侧轨道');
assert.ok(pathContext.secondTopLane.track.braceY <= pathContext.firstTopCandidate.editorRect.top - 13.9,
    '上方第二个大括号必须越过第一个总结卡片，保持括号与卡片成组排列');
pathContext.outerTopCandidate = vm.runInContext(
    "getMindMapSummaryHorizontalCandidate(bounds, 'top', editorSize, 0, secondTopLane.braceOffset)",
    pathContext,
);
assert.ok(pathContext.outerTopCandidate.braceY <= pathContext.firstTopLane.track.braceY - 14,
    '外侧轨道应同时移动横向大括号及其总结卡片锚点');
pathContext.nonOverlappingBounds = { left: 400, top: 50, right: 560, bottom: 250 };
pathContext.nonOverlappingTopLane = vm.runInContext(
    "getMindMapSummaryHorizontalBraceLane(nonOverlappingBounds, 'top', editorSize, topSummaryGroups)",
    pathContext,
);
assert.equal(pathContext.nonOverlappingTopLane.braceOffset, 0,
    '水平范围不相交的大括号应复用贴近成员的基础轨道');
pathContext.verticallySeparatedBounds = { left: 100, top: 430, right: 300, bottom: 630 };
pathContext.verticallySeparatedBottomGroup = {
    placement: 'bottom',
    left: 92,
    right: 308,
    braceY: 668,
    outerEdge: 790,
};
pathContext.verticallySeparatedGroups = [pathContext.verticallySeparatedBottomGroup];
pathContext.localBottomLane = vm.runInContext(
    "getMindMapSummaryHorizontalBraceLane(bounds, 'bottom', editorSize, verticallySeparatedGroups)",
    pathContext,
);
assert.equal(pathContext.localBottomLane.braceOffset, 0,
    '上下相隔较远的横向总结即使水平投影重合，也必须各自贴近成员范围');
pathContext.firstBottomLane = vm.runInContext(
    "getMindMapSummaryHorizontalBraceLane(bounds, 'bottom', editorSize, [])",
    pathContext,
);
pathContext.firstBottomCandidate = vm.runInContext(
    "getMindMapSummaryHorizontalCandidate(bounds, 'bottom', editorSize, 0, firstBottomLane.braceOffset)",
    pathContext,
);
pathContext.bottomSummaryGroups = [{
    ...pathContext.firstBottomLane.track,
    outerEdge: pathContext.firstBottomCandidate.editorRect.bottom,
}];
pathContext.secondBottomLane = vm.runInContext(
    "getMindMapSummaryHorizontalBraceLane(bounds, 'bottom', editorSize, bottomSummaryGroups)",
    pathContext,
);
assert.ok(pathContext.secondBottomLane.track.braceY >= pathContext.firstBottomCandidate.editorRect.bottom + 13.9,
    '下方第二个大括号必须越过第一个总结卡片，保持括号与卡片成组排列');
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
pathContext.maximumEditorSize = { width: 600, height: 600 };
pathContext.maximumTopCandidate = vm.runInContext(
    "getMindMapSummaryHorizontalCandidate(bounds, 'top', maximumEditorSize)",
    pathContext,
);
assert.equal(
    (pathContext.maximumTopCandidate.editorRect.left + pathContext.maximumTopCandidate.editorRect.right) / 2,
    (pathContext.bounds.left + pathContext.bounds.right) / 2,
    '最大尺寸总结卡片的水平中心仍必须与大括号中心一致',
);
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
    MINDMAP_SUMMARY_COLLISION_GAP: 14,
    document: {
        getElementById: id => id === 'card-selected' ? selectedCard : null,
        querySelectorAll: selector => selector === '.node-card' ? visibleLayoutCards : [],
    },
    getMindMapCanvasRect: element => element.rect,
});
vm.runInContext(`${collisionSource}\n${layoutAnchorSource}`, layoutAnchorContext);
layoutAnchorContext.selectionBounds = { top: 0, bottom: 100 };
layoutAnchorContext.selectedBranchUnit = selectedBranchUnit;
layoutAnchorContext.obstacleUnit = obstacleUnit;
layoutAnchorContext.bottomLayoutCandidate = {
    braceY: 110,
    editorRect: { left: -20, top: 120, right: 120, bottom: 300 },
};
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, bottomLayoutCandidate)[0].anchor === obstacleUnit", layoutAnchorContext),
    true,
    '总结位于成员下方时，应推动实际碰撞的障碍分支',
);
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, bottomLayoutCandidate)[0].direction", layoutAnchorContext),
    'before',
    '下方总结应在障碍分支之前留位，确保相邻卡片实际向下避让',
);
obstacleCard.rect = { left: 0, top: 120, right: 100, bottom: 145 };
layoutAnchorContext.braceCollisionCandidate = {
    braceY: 110,
    editorRect: { left: -20, top: 160, right: 120, bottom: 300 },
    collisionRect: { left: -34, top: 100, right: 134, bottom: 314 },
};
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, braceCollisionCandidate)[0].anchor === obstacleUnit", layoutAnchorContext),
    true,
    '普通卡片只与横向大括号通道重叠时，也必须触发分支避让',
);
obstacleCard.rect = { left: 0, top: -80, right: 100, bottom: 70 };
layoutAnchorContext.topLayoutCandidate = {
    braceY: 90,
    editorRect: { left: -20, top: -100, right: 120, bottom: 80 },
};
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'top', selectionBounds, topLayoutCandidate)[0].anchor === obstacleUnit", layoutAnchorContext),
    true,
    '总结位于成员上方时，应移动发生碰撞的完整障碍子树',
);
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'top', selectionBounds, topLayoutCandidate)[0].direction", layoutAnchorContext),
    'after',
    '上方总结应在障碍子树之后留白，使障碍及其后代整体上移',
);
obstacleCard.rect = { left: 0, top: 100, right: 100, bottom: 180 };
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'top', selectionBounds, topLayoutCandidate).length", layoutAnchorContext),
    0,
    '完全位于上方大括号下方的卡片不得触发布局移动',
);
const selectedDescendantUnit = {
    classList: { contains: name => name === 'child-unit' },
    contains: element => element === selectedCard,
};
const ancestorChildrenContainer = {
    classList: { contains: name => name === 'children-container' },
    children: [selectedDescendantUnit],
};
const ancestorObstacleWrapper = { children: [ancestorChildrenContainer] };
const ancestorObstacleCard = {
    dataset: { nodeId: 'ancestor-obstacle' },
    getClientRects: () => [{}],
    closest: selector => {
        if (selector === '.child-unit') return selectedBranchUnit;
        if (selector === '.node-wrapper') return ancestorObstacleWrapper;
        return null;
    },
    rect: { left: 0, top: -80, right: 100, bottom: 70 },
};
selectedBranchContents.add(ancestorObstacleCard);
visibleLayoutCards = [selectedCard, ancestorObstacleCard];
layoutAnchorContext.selectedDescendantUnit = selectedDescendantUnit;
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'top', selectionBounds, topLayoutCandidate)[0].anchor === selectedDescendantUnit", layoutAnchorContext),
    true,
    '碰撞卡片是成员祖先时，应在其直属成员后代分支边界插入间距',
);
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'top', selectionBounds, topLayoutCandidate)[0].direction", layoutAnchorContext),
    'before',
    '上方总结碰到祖先时应把成员子分支向下推离祖先',
);
ancestorObstacleCard.rect = { left: 0, top: 120, right: 100, bottom: 260 };
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, bottomLayoutCandidate)[0].anchor === selectedDescendantUnit", layoutAnchorContext),
    true,
    '下方总结碰到祖先时仍应使用直属成员后代作为位移边界',
);
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, bottomLayoutCandidate)[0].direction", layoutAnchorContext),
    'after',
    '下方总结碰到祖先时应把成员子分支向上推离祖先',
);
visibleLayoutCards = [selectedCard, obstacleCard];
obstacleCard.rect = { left: 0, top: 90, right: 100, bottom: 200 };
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, bottomLayoutCandidate)[0].distance", layoutAnchorContext),
    -10,
    '展开后的普通卡片跨过成员下边界时，必须保留负间距而不能当作无障碍',
);
layoutAnchorContext.unrelatedCandidate = {
    braceY: 110,
    editorRect: { left: 200, top: 120, right: 300, bottom: 300 },
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
    braceY: 110,
    editorRect: { left: -20, top: 120, right: 120, bottom: 300 },
};
assert.equal(
    vm.runInContext("getMindMapSummaryLayoutAnchors(['selected'], 'bottom', selectionBounds, layoutCandidate)[0].anchor === outerBranchUnit", layoutAnchorContext),
    true,
    '总结避障应移动分叉边界内的完整障碍分支，不能拆开父子节点',
);
const createShiftStyle = () => {
    const values = new Map();
    return {
        values,
        setProperty: (name, value) => values.set(name, value),
        removeProperty: name => values.delete(name),
    };
};
const createShiftUnit = () => ({
    classList: {
        values: new Set(['child-unit']),
        contains(name) { return this.values.has(name); },
        add(name) { this.values.add(name); },
        remove(name) { this.values.delete(name); },
    },
    style: createShiftStyle(),
    parentElement: null,
});
const upperSibling = createShiftUnit();
const shiftAnchor = createShiftUnit();
const lowerSibling = createShiftUnit();
const parentUnit = createShiftUnit();
const outerLowerSibling = createShiftUnit();
const innerShiftContainer = {
    classList: { contains: name => name === 'children-container' },
    children: [upperSibling, shiftAnchor, lowerSibling],
    closest: selector => selector === '.child-unit' ? parentUnit : null,
};
const outerShiftContainer = {
    classList: { contains: name => name === 'children-container' },
    children: [parentUnit, outerLowerSibling],
    closest: () => null,
};
[upperSibling, shiftAnchor, lowerSibling].forEach(unit => { unit.parentElement = innerShiftContainer; });
[parentUnit, outerLowerSibling].forEach(unit => { unit.parentElement = outerShiftContainer; });
layoutAnchorContext.shiftAnchor = shiftAnchor;
layoutAnchorContext.shiftMap = new Map();
assert.equal(
    vm.runInContext("applyMindMapSummaryBoundaryShift(shiftAnchor, 'before', 80, shiftMap)", layoutAnchorContext),
    true,
    '下方总结碰撞应生成向下的分支边界位移',
);
layoutAnchorContext.upperSibling = upperSibling;
layoutAnchorContext.lowerSibling = lowerSibling;
layoutAnchorContext.parentUnit = parentUnit;
layoutAnchorContext.outerLowerSibling = outerLowerSibling;
assert.equal(upperSibling.style.values.has('--summary-shift-y'), false,
    '分叉边界上方的无关兄弟分支不得移动');
assert.equal(shiftAnchor.style.values.get('--summary-shift-y'), '80px',
    '碰撞分支应整体向下移动实际缺口');
assert.equal(lowerSibling.style.values.get('--summary-shift-y'), '80px',
    '同层后续分支应同步移动以保持树顺序');
assert.equal(parentUnit.style.values.has('--summary-shift-y'), false,
    '包含已移动后代的祖先单元不得重复叠加相同位移');
assert.equal(outerLowerSibling.style.values.get('--summary-shift-y'), '80px',
    '祖先层后续分支应传播位移以避免父子树互相覆盖');
const upperOfLowestMember = createShiftUnit();
const lowestMemberBranch = createShiftUnit();
const lowestMemberParent = createShiftUnit();
const lowestMemberContainer = {
    classList: { contains: name => name === 'children-container' },
    children: [upperOfLowestMember, lowestMemberBranch],
    closest: selector => selector === '.child-unit' ? lowestMemberParent : null,
};
const lowestMemberOuterContainer = {
    classList: { contains: name => name === 'children-container' },
    children: [lowestMemberParent],
    closest: () => null,
};
[upperOfLowestMember, lowestMemberBranch].forEach(unit => { unit.parentElement = lowestMemberContainer; });
lowestMemberParent.parentElement = lowestMemberOuterContainer;
layoutAnchorContext.lowestMemberBranch = lowestMemberBranch;
layoutAnchorContext.lowestMemberShiftMap = new Map();
assert.equal(
    vm.runInContext("applyMindMapSummaryBoundaryShift(lowestMemberBranch, 'before', 120, lowestMemberShiftMap)", layoutAnchorContext),
    true,
    '上方总结碰到祖先时，最下面的成员分支应能向下腾出空间',
);
assert.equal(upperOfLowestMember.style.values.has('--summary-shift-y'), false,
    '最下面的成员分支向下避让时不得带动上方兄弟反向越序');
assert.equal(lowestMemberBranch.style.values.get('--summary-shift-y'), '120px',
    '最下面的成员分支及其后代应整体向下远离祖先');
assert.equal(lowestMemberParent.style.values.has('--summary-shift-y'), false,
    '成员父分支不得随子分支重复移动');
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
