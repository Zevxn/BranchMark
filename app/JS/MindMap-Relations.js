// SECTION 卡片关联
const MINDMAP_RELATION_SVG_NS = 'http://www.w3.org/2000/svg';
const MINDMAP_RELATION_DIRECTIONS = new Set(['none', 'forward', 'reverse']);
const MINDMAP_RELATION_LINE_STYLES = new Set(['dashed', 'solid']);
const MINDMAP_RELATION_ROUTING_PADDING = 18;
const MINDMAP_RELATION_SOURCE_CLEARANCE = 28;
const MINDMAP_RELATION_TARGET_APPROACH = 32;    // 最后一次转弯阈值
const MINDMAP_RELATION_ARROW_SIZE = 12;
const MINDMAP_RELATION_FOLD_BUTTON_PADDING = 6;
const MINDMAP_RELATION_OBSTACLE_EDGE_PENALTY = 36;
const MINDMAP_RELATION_CHANNEL_DEVIATION_PENALTY = 48;
const MINDMAP_RELATION_TERMINAL_ALIGNMENT_PENALTY = 48;
const MINDMAP_RELATION_LANE_GAP = 12;
const MINDMAP_RELATION_TURN_PENALTY = 28;
const MINDMAP_RELATION_VISIBLE_TURN_PENALTY = MINDMAP_RELATION_SOURCE_CLEARANCE
    + MINDMAP_RELATION_TARGET_APPROACH
    + MINDMAP_RELATION_LANE_GAP * 2;
const MINDMAP_RELATION_CROSSING_PENALTY = 300;
const MINDMAP_RELATION_TREE_CROSSING_PENALTY = 160;
const MINDMAP_RELATION_OVERLAP_PENALTY = 720;
const MINDMAP_RELATION_PARALLEL_CLEARANCE = 10;
const MINDMAP_RELATION_PORT_PAIR_CANDIDATES = 4;
const MINDMAP_RELATION_PORT_DEVIATION_PENALTY = 0.2;
let relationRenderFrame = null;
let relationRenderVersion = 0;
let relationRouteCache = { key: '', routes: new Map() };

function getMindMapRelations() {
    return Array.isArray(state.data?.relations) ? state.data.relations : [];
}

function ensureMindMapRelations() {
    if (!Array.isArray(state.data.relations)) state.data.relations = [];
    return state.data.relations;
}

function getMindMapRelationById(relationId) {
    return getMindMapRelations().find(relation => relation.id === relationId) || null;
}

function getMindMapRelationDirection(relation) {
    return MINDMAP_RELATION_DIRECTIONS.has(relation?.direction) ? relation.direction : 'none';
}

function getMindMapRelationLineStyle(relation) {
    return MINDMAP_RELATION_LINE_STYLES.has(relation?.lineStyle) ? relation.lineStyle : 'dashed';
}

function getMindMapRelationColor(relation) {
    const color = String(relation?.color || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(color) ? color : '';
}

function getMindMapRelationLabel(relation) {
    return String(relation?.label || '').slice(0, 80);
}

function getMindMapRelatedCardItems(nodeId) {
    return getMindMapRelations().flatMap(relation => {
        let targetId = null;
        if (relation.sourceId === nodeId) targetId = relation.targetId;
        else if (relation.targetId === nodeId) targetId = relation.sourceId;
        if (!targetId) return [];
        const targetNode = findNode(state.data, targetId);
        if (!targetNode) return [];
        const topic = String(targetNode.topic || '').replace(/\s+/g, ' ').trim();
        return [{
            relationId: relation.id,
            targetId,
            topic: topic || '未命名卡片',
            label: getMindMapRelationLabel(relation).trim()
        }];
    });
}

function getMindMapNodePath(nodeId) {
    const path = [];
    let current = findNode(state.data, nodeId);
    while (current) {
        path.unshift(current);
        if (current.id === state.data.id) return path;
        current = findParent(state.data, current.id);
    }
    return [];
}

function closeMindMapRelationNavigationMenu() {
    const menu = $('#relationNavigationMenu');
    if (!menu) return;
    menu.classList.remove('active');
    menu.setAttribute('aria-hidden', 'true');
    menu.dataset.sourceNodeId = '';
}

function positionMindMapRelationNavigationMenu(anchor) {
    const menu = $('#relationNavigationMenu');
    if (!menu || !anchor) return;
    const anchorRect = anchor.getBoundingClientRect();
    const margin = 10;
    const width = menu.offsetWidth || 300;
    const height = menu.offsetHeight || 240;
    let left = anchorRect.left + anchorRect.width / 2 - width / 2;
    let top = anchorRect.bottom + 8;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    if (top + height > window.innerHeight - margin) {
        top = Math.max(margin, anchorRect.top - height - 8);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function openMindMapRelationNavigationMenu(nodeId, anchor) {
    const menu = $('#relationNavigationMenu');
    const list = $('#relationNavigationList');
    const count = $('#relationNavigationCount');
    if (!menu || !list || !count) return;
    const items = getMindMapRelatedCardItems(nodeId);
    if (items.length === 0) {
        closeMindMapRelationNavigationMenu();
        return;
    }

    list.replaceChildren();
    items.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'relation-navigation-item';
        button.dataset.targetNodeId = item.targetId;
        button.setAttribute('role', 'menuitem');

        const title = document.createElement('span');
        title.className = 'relation-navigation-item-title';
        title.textContent = item.topic;
        button.appendChild(title);

        const details = [];
        if (item.label) details.push(item.label);
        if (!document.getElementById(`card-${item.targetId}`)) details.push('当前已折叠');
        if (details.length > 0) {
            const meta = document.createElement('span');
            meta.className = 'relation-navigation-item-meta';
            meta.textContent = details.join(' · ');
            button.appendChild(meta);
        }
        list.appendChild(button);
    });

    count.textContent = String(items.length);
    menu.dataset.sourceNodeId = nodeId;
    menu.classList.add('active');
    menu.setAttribute('aria-hidden', 'false');
    positionMindMapRelationNavigationMenu(anchor);
}

function syncMindMapRelationNavigationButtons() {
    document.querySelectorAll('[data-action="navigate-relation"]').forEach(button => {
        const nodeId = button.closest('.node-card')?.dataset.nodeId;
        const count = nodeId ? getMindMapRelatedCardItems(nodeId).length : 0;
        button.hidden = count === 0;
        button.title = count > 0 ? `查看关联卡片（${count}）` : '查看关联卡片';
    });
}

function jumpToMindMapRelatedCard(targetId) {
    const targetNode = findNode(state.data, targetId);
    if (!targetNode) return;
    closeMindMapRelationNavigationMenu();

    if (!document.getElementById(`card-${targetId}`)) {
        const path = getMindMapNodePath(targetId);
        if (path.length === 0) return;
        clearMapSearchReveal();
        path.slice(1, -1).forEach(node => mapSearchState.revealedNodeIds.add(node.id));
        const rootChild = path[1];
        if (rootChild) {
            mapSearchState.revealedRootDirections.add(rootChild.dir === 'left' ? 'left' : 'right');
        }
        renderTree();
    }

    clearSelectedMindMapRelation();
    clearSelectedMindMapSummary();
    state.selectedIds.clear();
    state.selectedIds.add(targetId);
    updateSelection();

    requestAnimationFrame(() => requestAnimationFrame(() => {
        const card = document.getElementById(`card-${targetId}`);
        if (!card) return;
        centerMapNodeInVisibleArea(card);
        pulseMapSearchTarget(card);
    }));
}

function getMindMapNodeLabel(nodeId) {
    const node = findNode(state.data, nodeId);
    const label = String(node?.topic || '').replace(/\s+/g, ' ').trim();
    return label || '未命名卡片';
}

function closeMindMapRelationEditor() {
    const panel = $('#relationEditor');
    if (!panel) return;
    panel.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
}

function commitMindMapRelationEditor() {
    const panel = $('#relationEditor');
    const relation = getMindMapRelationById(state.selectedRelationId);
    if (!panel?.classList.contains('active') || !relation) return;
    const labelInput = $('#relationLabelInput');
    if (labelInput) relation.label = labelInput.value.slice(0, 80);
    recordHistory();
}

function syncMindMapRelationEditor(relation) {
    const panel = $('#relationEditor');
    if (!panel || !relation) return;
    const sourceLabel = getMindMapNodeLabel(relation.sourceId);
    const targetLabel = getMindMapNodeLabel(relation.targetId);
    $('#relationEditorTitle').textContent = `${sourceLabel}  ·  ${targetLabel}`;
    $('#relationLabelInput').value = getMindMapRelationLabel(relation);

    const direction = getMindMapRelationDirection(relation);
    panel.querySelectorAll('[data-relation-direction]').forEach(button => {
        const active = button.dataset.relationDirection === direction;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        if (button.dataset.relationDirection === 'forward') button.title = `${sourceLabel} → ${targetLabel}`;
        if (button.dataset.relationDirection === 'reverse') button.title = `${targetLabel} → ${sourceLabel}`;
    });

    const lineStyle = getMindMapRelationLineStyle(relation);
    panel.querySelectorAll('[data-relation-style]').forEach(button => {
        const active = button.dataset.relationStyle === lineStyle;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });

    const color = getMindMapRelationColor(relation);
    panel.querySelectorAll('[data-relation-color]').forEach(button => {
        const active = button.dataset.relationColor === color;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    if (color) $('#relationCustomColor').value = color;
}

function positionMindMapRelationEditor(clientPoint) {
    const panel = $('#relationEditor');
    if (!panel) return;
    if (!clientPoint) {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        return;
    }
    const width = panel.offsetWidth || 320;
    const height = panel.offsetHeight || 330;
    const left = Math.max(10, Math.min(clientPoint.x + 12, window.innerWidth - width - 10));
    const top = Math.max(10, Math.min(clientPoint.y + 12, window.innerHeight - height - 10));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
}

function openMindMapRelationEditor(relationId, clientPoint) {
    const relation = getMindMapRelationById(relationId);
    const panel = $('#relationEditor');
    if (!relation || !panel) return;
    syncMindMapRelationEditor(relation);
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
    positionMindMapRelationEditor(clientPoint);
}

function updateSelectedMindMapRelation(property, value, shouldRecord = true) {
    const relation = getMindMapRelationById(state.selectedRelationId);
    if (!relation) return;
    relation[property] = value;
    syncMindMapRelationEditor(relation);
    scheduleRenderMindMapRelations();
    if (shouldRecord) recordHistory();
}

function collectMindMapNodeIds(node, targetSet = new Set()) {
    if (!node) return targetSet;
    targetSet.add(node.id);
    (node.children || []).forEach(child => collectMindMapNodeIds(child, targetSet));
    return targetSet;
}

function getMindMapNodeTreeOrder() {
    const order = new Map();
    let index = 0;
    const visit = node => {
        if (!node) return;
        order.set(node.id, index++);
        (node.children || []).forEach(visit);
    };
    visit(state.data);
    return order;
}

function sortMindMapNodeIdsByTreeOrder(nodeIds) {
    const order = getMindMapNodeTreeOrder();
    return Array.from(new Set(nodeIds || []))
        .map((id, selectionIndex) => ({
            id,
            selectionIndex,
            treeIndex: order.get(id) ?? Number.MAX_SAFE_INTEGER
        }))
        .sort((left, right) => left.treeIndex - right.treeIndex || left.selectionIndex - right.selectionIndex)
        .map(item => item.id);
}

function getMindMapDragProcessingOrder(nodeIds, dropType) {
    const orderedNodes = sortMindMapNodeIdsByTreeOrder(nodeIds);
    // “插入到目标后方”时，后处理的节点会更靠近目标；反向处理可保持最终显示顺序。
    return dropType === 'AFTER' ? [...orderedNodes].reverse() : orderedNodes;
}

function removeMindMapRelationsForNodes(nodeIds) {
    if (!nodeIds || nodeIds.size === 0 || !Array.isArray(state.data.relations)) return false;
    const previousLength = state.data.relations.length;
    state.data.relations = state.data.relations.filter(relation =>
        !nodeIds.has(relation.sourceId) && !nodeIds.has(relation.targetId)
    );
    if (state.selectedRelationId && !state.data.relations.some(item => item.id === state.selectedRelationId)) {
        state.selectedRelationId = null;
        closeMindMapRelationEditor();
    }
    const changed = state.data.relations.length !== previousLength;
    if (changed) {
        closeMindMapRelationNavigationMenu();
        syncMindMapRelationNavigationButtons();
    }
    return changed;
}

function isDuplicateMindMapRelation(sourceId, targetId) {
    return getMindMapRelations().some(relation =>
        (relation.sourceId === sourceId && relation.targetId === targetId)
        || (relation.sourceId === targetId && relation.targetId === sourceId)
    );
}

function addRelationBetweenSelectedCards(clientPoint = null) {
    if (state.selectedIds.size !== 2) return;
    const [sourceId, targetId] = Array.from(state.selectedIds);
    if (sourceId === targetId || !findNode(state.data, sourceId) || !findNode(state.data, targetId)) return;
    if (isDuplicateMindMapRelation(sourceId, targetId)) {
        if (typeof showTopToast === 'function') showTopToast('⚠️ 这两张卡片已经有关联');
        return;
    }

    const relation = {
        id: `relation_${generateNodeId()}`,
        sourceId,
        targetId,
        label: '',
        direction: 'none',
        lineStyle: 'dashed',
        color: ''
    };
    ensureMindMapRelations().push(relation);
    state.selectedRelationId = relation.id;
    state.selectedSummaryId = null;
    state.selectedIds.clear();
    recordHistory();
    updateSelection();
    syncMindMapRelationNavigationButtons();
    scheduleRenderMindMapRelations();
    openMindMapRelationEditor(relation.id, clientPoint);
    if (typeof showTopToast === 'function') showTopToast('🔗 已建立卡片关联');
}

function deleteSelectedMindMapRelation() {
    const relationId = state.selectedRelationId;
    if (!relationId || !Array.isArray(state.data.relations)) return;
    const previousLength = state.data.relations.length;
    state.data.relations = state.data.relations.filter(relation => relation.id !== relationId);
    state.selectedRelationId = null;
    state.selectedSummaryId = null;
    closeMindMapRelationEditor();
    if (state.data.relations.length !== previousLength) {
        closeMindMapRelationNavigationMenu();
        syncMindMapRelationNavigationButtons();
        recordHistory();
        if (typeof showTopToast === 'function') showTopToast('🗑️ 已删除卡片关联');
    }
    scheduleRenderMindMapRelations();
    updateToolbar();
}

function clearSelectedMindMapRelation() {
    if (!state.selectedRelationId) return;
    commitMindMapRelationEditor();
    state.selectedRelationId = null;
    closeMindMapRelationEditor();
    syncMindMapRelationSelection();
    updateToolbar();
}

function selectMindMapRelation(relationId, clientPoint) {
    if (!getMindMapRelations().some(relation => relation.id === relationId)) return;
    if (state.selectedRelationId && state.selectedRelationId !== relationId) commitMindMapRelationEditor();
    state.selectedRelationId = relationId;
    state.selectedSummaryId = null;
    state.selectedIds.clear();
    updateSelection();
    syncMindMapRelationSelection();
    openMindMapRelationEditor(relationId, clientPoint);
}

function syncMindMapRelationSelection() {
    // 选中状态只影响样式，不必清空 SVG 或重新寻路。
    $('#relation-layer')?.querySelectorAll('.relation-group').forEach(group => {
        group.classList.toggle('selected', group.dataset.relationId === state.selectedRelationId);
    });
}

function getMindMapRelationPath(
    sourceRect,
    targetRect,
    view = state.view,
    sourcePortContext = null,
    targetPortContext = null
) {
    const sourceCenter = {
        x: sourceRect.left + sourceRect.width / 2,
        y: sourceRect.top + sourceRect.height / 2
    };
    const targetCenter = {
        x: targetRect.left + targetRect.width / 2,
        y: targetRect.top + targetRect.height / 2
    };
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const scale = view.scale || 1;
    const toCanvasPoint = point => ({
        x: (point.x - view.tx) / scale,
        y: (point.y - view.ty) / scale
    });

    let sourcePoint;
    let targetPoint;
    if (horizontal) {
        const sourceSide = dx >= 0 ? 'right' : 'left';
        const targetSide = dx >= 0 ? 'left' : 'right';
        sourcePoint = {
            x: sourceSide === 'right' ? sourceRect.right : sourceRect.left,
            y: getMindMapRelationPreferredAlong(
                sourceRect,
                sourceSide,
                targetRect,
                sourcePortContext
            )
        };
        targetPoint = {
            x: targetSide === 'left' ? targetRect.left : targetRect.right,
            y: getMindMapRelationPreferredAlong(
                targetRect,
                targetSide,
                sourceRect,
                targetPortContext
            )
        };
    } else {
        sourcePoint = { x: sourceCenter.x, y: dy >= 0 ? sourceRect.bottom : sourceRect.top };
        targetPoint = { x: targetCenter.x, y: dy >= 0 ? targetRect.top : targetRect.bottom };
    }

    const from = toCanvasPoint(sourcePoint);
    const to = toCanvasPoint(targetPoint);
    const distance = horizontal ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y);
    const curve = Math.max(42, distance * 0.42);
    let control1;
    let control2;
    if (horizontal) {
        const direction = to.x >= from.x ? 1 : -1;
        control1 = { x: from.x + direction * curve, y: from.y };
        control2 = { x: to.x - direction * curve, y: to.y };
    } else {
        const direction = to.y >= from.y ? 1 : -1;
        control1 = { x: from.x, y: from.y + direction * curve };
        control2 = { x: to.x, y: to.y - direction * curve };
    }

    const round = value => Math.round(value * 10) / 10;
    return `M ${round(from.x)} ${round(from.y)} C ${round(control1.x)} ${round(control1.y)}, ${round(control2.x)} ${round(control2.y)}, ${round(to.x)} ${round(to.y)}`;
}

function getMindMapCanvasRect(element, view = state.view) {
    const rect = element.getBoundingClientRect();
    const canvasLayer = document.getElementById('canvas-layer');
    const canvasRect = canvasLayer?.getBoundingClientRect();
    const fallbackScale = view.scale || 1;
    const scaleX = canvasLayer?.offsetWidth && canvasRect?.width
        ? canvasRect.width / canvasLayer.offsetWidth
        : fallbackScale;
    const scaleY = canvasLayer?.offsetHeight && canvasRect?.height
        ? canvasRect.height / canvasLayer.offsetHeight
        : fallbackScale;
    const canvasLeft = canvasRect?.left ?? view.tx;
    const canvasTop = canvasRect?.top ?? view.ty;
    const left = (rect.left - canvasLeft) / scaleX;
    const top = (rect.top - canvasTop) / scaleY;
    const width = rect.width / scaleX;
    const height = rect.height / scaleY;
    return {
        id: element.dataset.nodeId,
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height
    };
}

function expandMindMapRelationObstacle(rect, padding = MINDMAP_RELATION_ROUTING_PADDING) {
    return {
        id: rect.id,
        left: rect.left - padding,
        top: rect.top - padding,
        right: rect.right + padding,
        bottom: rect.bottom + padding
    };
}

function getMindMapRelationSideVector(side) {
    if (side === 'left') return { x: -1, y: 0 };
    if (side === 'right') return { x: 1, y: 0 };
    if (side === 'top') return { x: 0, y: -1 };
    return { x: 0, y: 1 };
}

function clampMindMapRelationPort(value, min, max) {
    if (min > max) return (min + max) / 2;
    return Math.max(min, Math.min(value, max));
}

function getMindMapRelationPort(
    rect,
    side,
    laneOffset = 0,
    padding = MINDMAP_RELATION_ROUTING_PADDING,
    preferredAlong = null
) {
    const horizontalSide = side === 'left' || side === 'right';
    const edgeLength = horizontalSide ? rect.height : rect.width;
    const inset = Math.min(12, edgeLength / 4);
    const centerAlong = horizontalSide ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    const desiredAlong = Number.isFinite(preferredAlong) ? preferredAlong : centerAlong;
    const along = horizontalSide
        ? clampMindMapRelationPort(desiredAlong + laneOffset, rect.top + inset, rect.bottom - inset)
        : clampMindMapRelationPort(desiredAlong + laneOffset, rect.left + inset, rect.right - inset);
    const port = horizontalSide
        ? { x: side === 'left' ? rect.left : rect.right, y: along }
        : { x: along, y: side === 'top' ? rect.top : rect.bottom };
    const vector = getMindMapRelationSideVector(side);
    return {
        port,
        routePoint: {
            x: port.x + vector.x * padding,
            y: port.y + vector.y * padding
        }
    };
}

function getMindMapRelationReservedSides(nodeId) {
    const reservedSides = new Set();
    if (nodeId === state.data.id) {
        const children = state.data.children || [];
        if (children.some(child => child.dir === 'left')) reservedSides.add('left');
        if (children.some(child => child.dir !== 'left')) reservedSides.add('right');
        return reservedSides;
    }
    reservedSides.add(isDescendantOfLeft(nodeId) ? 'right' : 'left');
    return reservedSides;
}

function getMindMapRelationPortContext(nodeId) {
    const node = findNode(state.data, nodeId);
    if (!node) return null;
    if (nodeId === state.data.id) {
        const childSides = [];
        const children = node.children || [];
        if (children.some(child => child.dir === 'left')) childSides.push('left');
        if (children.some(child => child.dir !== 'left')) childSides.push('right');
        return { branchSide: 'root', hasChildren: childSides.length > 0, childSides };
    }

    return {
        branchSide: getMindMapNodeBranchSide(nodeId),
        hasChildren: Boolean(node.children?.length)
    };
}

function isMindMapRelationSideOccupied(side, portContext) {
    if (!portContext || (side !== 'left' && side !== 'right')) return false;
    if (portContext.branchSide === 'root') {
        return portContext.childSides?.includes(side) || false;
    }

    const childSide = portContext.branchSide === 'left' ? 'left' : 'right';
    const parentSide = childSide === 'left' ? 'right' : 'left';
    return side === parentSide || (side === childSide && portContext.hasChildren);
}

function getMindMapRelationPortUsage(side, portCandidate, reservedSides, portContext) {
    const usesStructuralAnchor = portCandidate?.kinds?.includes('center');
    if (reservedSides.has(side)) {
        const internalNodeParentQuarter = !usesStructuralAnchor
            && portContext?.branchSide !== 'root'
            && portContext?.hasChildren;
        return internalNodeParentQuarter ? 'free' : 'reserved';
    }
    if (isMindMapRelationSideOccupied(side, portContext)) return 'occupied';
    return 'free';
}

function getMindMapRelationPortReuseCost(rect, side, portCandidate, reservedSides, portContext) {
    const reusesInternalParentSide = reservedSides.has(side)
        && !portCandidate?.kinds?.includes('center')
        && portContext?.branchSide !== 'root'
        && portContext?.hasChildren;
    return reusesInternalParentSide ? Math.max(rect.width, rect.height) : 0;
}

function getMindMapRelationPreferredAlong(rect, side, otherRect, portContext = null) {
    const horizontalSide = side === 'left' || side === 'right';
    const centerAlong = horizontalSide ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    if (!horizontalSide || !otherRect || !isMindMapRelationSideOccupied(side, portContext)) {
        return centerAlong;
    }

    const otherCenterY = otherRect.top + otherRect.height / 2;
    if (otherCenterY < centerAlong) return rect.top + rect.height / 4;
    if (otherCenterY > centerAlong) return rect.top + rect.height * 3 / 4;
    return centerAlong;
}

function getMindMapRelationPortCandidates(
    rect,
    side,
    otherRect,
    padding,
    portContext = null,
    assignedAlong = null
) {
    const horizontalSide = side === 'left' || side === 'right';
    const start = horizontalSide ? rect.top : rect.left;
    const length = horizontalSide ? rect.height : rect.width;
    const centerAlong = start + length / 2;
    const preferredAlong = getMindMapRelationPreferredAlong(rect, side, otherRect, portContext);
    const allowQuarterPorts = horizontalSide && isMindMapRelationSideOccupied(side, portContext);
    const rawCandidates = Number.isFinite(assignedAlong)
        ? [{ kind: 'assigned', along: assignedAlong, preferred: true }]
        : [
            { kind: 'preferred', along: preferredAlong, preferred: true },
            { kind: 'center', along: centerAlong },
            ...(allowQuarterPorts ? [
                { kind: 'quarter-start', along: start + length / 4 },
                { kind: 'quarter-end', along: start + length * 3 / 4 }
            ] : [])
        ];
    const candidates = [];

    rawCandidates.forEach(rawCandidate => {
        const port = getMindMapRelationPort(rect, side, 0, padding, rawCandidate.along);
        const actualAlong = horizontalSide ? port.port.y : port.port.x;
        const existing = candidates.find(candidate => Math.abs(candidate.along - actualAlong) < 0.1);
        if (existing) {
            if (!existing.kinds.includes(rawCandidate.kind)) existing.kinds.push(rawCandidate.kind);
            existing.preferred = existing.preferred || Boolean(rawCandidate.preferred);
            return;
        }
        candidates.push({
            ...port,
            along: actualAlong,
            kinds: [rawCandidate.kind],
            preferred: Boolean(rawCandidate.preferred),
            deviationPenalty: Math.abs(actualAlong - preferredAlong)
                * MINDMAP_RELATION_PORT_DEVIATION_PENALTY
        });
    });

    return candidates;
}

function selectMindMapRelationPortPairCandidates(candidates) {
    const compareCandidates = (left, right) => left.reservedPortCount - right.reservedPortCount
        || left.occupiedPortCount - right.occupiedPortCount
        || left.estimate - right.estimate;
    const sorted = [...candidates].sort(compareCandidates);
    if (sorted.length <= MINDMAP_RELATION_PORT_PAIR_CANDIDATES) return sorted;

    // 每个端口占用层级至少保留一个代表，避免某一侧的空闲四分位候选
    // 将中心端口回退方案全部挤出；其余名额再按同层几何代价补齐。
    const selected = [];
    const selectedUsageLevels = new Set();
    sorted.forEach(candidate => {
        if (selected.length >= MINDMAP_RELATION_PORT_PAIR_CANDIDATES) return;
        const usageLevel = `${candidate.reservedPortCount}:${candidate.occupiedPortCount}`;
        if (selectedUsageLevels.has(usageLevel)) return;
        selectedUsageLevels.add(usageLevel);
        selected.push(candidate);
    });
    sorted.forEach(candidate => {
        if (selected.length >= MINDMAP_RELATION_PORT_PAIR_CANDIDATES) return;
        if (!selected.includes(candidate)) selected.push(candidate);
    });
    return selected.sort(compareCandidates);
}

function getMindMapRelationSideCandidates(
    sourceRect,
    targetRect,
    sourceReservedSides = new Set(),
    targetReservedSides = new Set(),
    sourcePortContext = null,
    targetPortContext = null,
    terminalObstacles = [],
    sourcePortAssignment = null,
    targetPortAssignment = null
) {
    const sides = ['left', 'right', 'top', 'bottom'];
    const sourceSides = sourcePortAssignment?.side ? [sourcePortAssignment.side] : sides;
    const targetSides = targetPortAssignment?.side ? [targetPortAssignment.side] : sides;
    const sourceCenter = { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 };
    const targetCenter = { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const sidePairCandidates = [];
    const sourceTerminalObstacles = terminalObstacles.filter(obstacle => obstacle.id !== sourceRect.id);
    const targetTerminalObstacles = terminalObstacles.filter(obstacle => obstacle.id !== targetRect.id);

    sourceSides.forEach(sourceSide => {
        targetSides.forEach(targetSide => {
            const sourcePorts = getMindMapRelationPortCandidates(
                sourceRect,
                sourceSide,
                targetRect,
                MINDMAP_RELATION_SOURCE_CLEARANCE,
                sourcePortContext,
                sourcePortAssignment?.along
            ).filter(candidate => isMindMapRelationSegmentClear(
                candidate.port,
                candidate.routePoint,
                sourceTerminalObstacles
            ));
            const targetPorts = getMindMapRelationPortCandidates(
                targetRect,
                targetSide,
                sourceRect,
                MINDMAP_RELATION_TARGET_APPROACH,
                targetPortContext,
                targetPortAssignment?.along
            ).filter(candidate => isMindMapRelationSegmentClear(
                candidate.port,
                candidate.routePoint,
                targetTerminalObstacles
            ));
            const sourceVector = getMindMapRelationSideVector(sourceSide);
            const targetVector = getMindMapRelationSideVector(targetSide);
            const sourceAlignment = (sourceVector.x * dx + sourceVector.y * dy) / distance;
            const targetAlignment = (targetVector.x * -dx + targetVector.y * -dy) / distance;
            const alignmentPenalty = (2 - sourceAlignment - targetAlignment) * 100;
            const portPairs = [];
            sourcePorts.forEach(sourcePort => {
                targetPorts.forEach(targetPort => {
                    const sourcePortUsage = getMindMapRelationPortUsage(
                        sourceSide,
                        sourcePort,
                        sourceReservedSides,
                        sourcePortContext
                    );
                    const targetPortUsage = getMindMapRelationPortUsage(
                        targetSide,
                        targetPort,
                        targetReservedSides,
                        targetPortContext
                    );
                    const reservedPortCount = Number(sourcePortUsage === 'reserved')
                        + Number(targetPortUsage === 'reserved');
                    const occupiedPortCount = Number(sourcePortUsage === 'occupied')
                        + Number(targetPortUsage === 'occupied');
                    const portReuseCost = getMindMapRelationPortReuseCost(
                        sourceRect,
                        sourceSide,
                        sourcePort,
                        sourceReservedSides,
                        sourcePortContext
                    ) + getMindMapRelationPortReuseCost(
                        targetRect,
                        targetSide,
                        targetPort,
                        targetReservedSides,
                        targetPortContext
                    );
                    const estimatedDistance = Math.abs(sourcePort.routePoint.x - targetPort.routePoint.x)
                        + Math.abs(sourcePort.routePoint.y - targetPort.routePoint.y);
                    const portDeviationPenalty = sourcePort.deviationPenalty + targetPort.deviationPenalty;
                    portPairs.push({
                        sourceSide,
                        targetSide,
                        sourcePort,
                        targetPort,
                        estimatedDistance,
                        alignmentPenalty,
                        sourcePortUsage,
                        targetPortUsage,
                        reservedPortCount,
                        occupiedPortCount,
                        portReuseCost,
                        portDeviationPenalty,
                        estimate: estimatedDistance
                            + alignmentPenalty
                            + portReuseCost
                            + portDeviationPenalty
                    });
                });
            });
            const selectedPortPairs = selectMindMapRelationPortPairCandidates(portPairs);
            sidePairCandidates.push({
                estimate: selectedPortPairs[0]?.estimate ?? Number.POSITIVE_INFINITY,
                candidates: selectedPortPairs
            });
        });
    });

    return sidePairCandidates
        // 端口是有拓扑语义的资源，不能让一条较短的路线用距离优势“买走”
        // 已被树结构占用的中心点。逐级尝试空闲、子树共享、父线保留端口；
        // 只有较优层级完全不可达时，才回退到下一层级。
        .flatMap(group => group.candidates)
        .sort((left, right) => left.reservedPortCount - right.reservedPortCount
            || left.occupiedPortCount - right.occupiedPortCount
            || left.estimate - right.estimate);
}

function isMindMapRelationPointInsideObstacle(point, obstacle, epsilon = 0.1) {
    return point.x > obstacle.left + epsilon
        && point.x < obstacle.right - epsilon
        && point.y > obstacle.top + epsilon
        && point.y < obstacle.bottom - epsilon;
}

function isMindMapRelationSegmentClear(from, to, obstacles) {
    const epsilon = 0.1;
    if (Math.abs(from.y - to.y) < epsilon) {
        const y = from.y;
        const minX = Math.min(from.x, to.x);
        const maxX = Math.max(from.x, to.x);
        return !obstacles.some(obstacle =>
            y > obstacle.top + epsilon
            && y < obstacle.bottom - epsilon
            && Math.max(minX, obstacle.left) < Math.min(maxX, obstacle.right) - epsilon
        );
    }
    if (Math.abs(from.x - to.x) < epsilon) {
        const x = from.x;
        const minY = Math.min(from.y, to.y);
        const maxY = Math.max(from.y, to.y);
        return !obstacles.some(obstacle =>
            x > obstacle.left + epsilon
            && x < obstacle.right - epsilon
            && Math.max(minY, obstacle.top) < Math.min(maxY, obstacle.bottom) - epsilon
        );
    }
    return false;
}

function getMindMapRelationObstacleEdgePenalty(from, to, obstacles) {
    const epsilon = 0.1;
    const horizontal = Math.abs(from.y - to.y) < epsilon;
    const segmentMin = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
    const segmentMax = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
    const followsObstacleEdge = obstacles.some(obstacle => {
        const coordinate = horizontal ? from.y : from.x;
        const onEdge = horizontal
            ? Math.abs(coordinate - obstacle.top) < epsilon || Math.abs(coordinate - obstacle.bottom) < epsilon
            : Math.abs(coordinate - obstacle.left) < epsilon || Math.abs(coordinate - obstacle.right) < epsilon;
        if (!onEdge) return false;
        const obstacleMin = horizontal ? obstacle.left : obstacle.top;
        const obstacleMax = horizontal ? obstacle.right : obstacle.bottom;
        return Math.max(segmentMin, obstacleMin) < Math.min(segmentMax, obstacleMax) - epsilon;
    });
    return followsObstacleEdge ? MINDMAP_RELATION_OBSTACLE_EDGE_PENALTY : 0;
}

function getMindMapRelationChannelDeviationPenalty(from, to, preferredChannels) {
    const epsilon = 0.1;
    const horizontal = Math.abs(from.y - to.y) < epsilon;
    const segmentMin = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
    const segmentMax = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
    const matchingChannels = preferredChannels.filter(channel => {
        if (channel.axis !== (horizontal ? 'y' : 'x')) return false;
        const channelMin = Number.isFinite(channel.min) ? channel.min : -Infinity;
        const channelMax = Number.isFinite(channel.max) ? channel.max : Infinity;
        return Math.max(segmentMin, channelMin) < Math.min(segmentMax, channelMax) - epsilon;
    });
    if (matchingChannels.length === 0) return 0;
    const coordinate = horizontal ? from.y : from.x;
    if (matchingChannels.some(channel => Math.abs(coordinate - channel.coordinate) < epsilon)) return 0;
    const nearPreferredChannel = matchingChannels.some(channel =>
        Math.abs(coordinate - channel.coordinate) <= MINDMAP_RELATION_ROUTING_PADDING * 2
    );
    return nearPreferredChannel ? MINDMAP_RELATION_CHANNEL_DEVIATION_PENALTY : 0;
}

function getMindMapRelationTerminalAlignmentPenalty(
    from,
    to,
    end,
    terminalDirection,
    preferredChannels,
    isContinuingDirection = false
) {
    const epsilon = 0.1;
    const horizontal = Math.abs(from.y - to.y) < epsilon;
    const moveDirection = horizontal ? 1 : 2;
    if (!terminalDirection || moveDirection !== terminalDirection) return 0;

    const coordinate = horizontal ? from.y : from.x;
    const segmentFrom = horizontal ? from.x : from.y;
    const segmentTo = horizontal ? to.x : to.y;
    const leavesPreferredChannel = isContinuingDirection && preferredChannels.some(channel => {
        if (channel.axis !== (horizontal ? 'y' : 'x')) return false;
        if (Math.abs(coordinate - channel.coordinate) >= epsilon) return false;
        const channelMin = Number.isFinite(channel.min) ? channel.min : -Infinity;
        const channelMax = Number.isFinite(channel.max) ? channel.max : Infinity;
        const fromInside = segmentFrom >= channelMin - epsilon && segmentFrom <= channelMax + epsilon;
        const toOutside = segmentTo < channelMin - epsilon || segmentTo > channelMax + epsilon;
        return fromInside && toOutside;
    });
    // 网格中的障碍边界会把一条直线拆成许多小边。对连续小边重复计罚会迫使
    // 路线过早横移到目标列，并在沿途障碍之间蛇形穿梭；每段直线只计一次。
    if (isContinuingDirection && !leavesPreferredChannel) return 0;

    const targetCoordinate = horizontal ? end.y : end.x;
    if (Math.abs(coordinate - targetCoordinate) < epsilon) return 0;

    const segmentMin = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
    const segmentMax = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
    const followsPreferredChannel = preferredChannels.some(channel => {
        if (channel.axis !== (horizontal ? 'y' : 'x')) return false;
        if (Math.abs(coordinate - channel.coordinate) >= epsilon) return false;
        const channelMin = Number.isFinite(channel.min) ? channel.min : -Infinity;
        const channelMax = Number.isFinite(channel.max) ? channel.max : Infinity;
        return Math.max(segmentMin, channelMin) < Math.min(segmentMax, channelMax) - epsilon;
    });
    return followsPreferredChannel ? 0 : MINDMAP_RELATION_TERMINAL_ALIGNMENT_PENALTY;
}

function getMindMapRelationSegmentInteractionPenalty(from, to, occupiedSegments, routeTerminals = []) {
    const epsilon = 0.1;
    const horizontal = Math.abs(from.y - to.y) < epsilon;
    let penalty = 0;
    const countedCrossings = new Set();
    occupiedSegments.forEach(segment => {
        const occupiedHorizontal = Math.abs(segment.from.y - segment.to.y) < epsilon;
        const structuralTreeSegment = segment.kind === 'tree';
        if (horizontal === occupiedHorizontal) {
            const parallelDistance = horizontal
                ? Math.abs(from.y - segment.from.y)
                : Math.abs(from.x - segment.from.x);
            if (parallelDistance >= MINDMAP_RELATION_PARALLEL_CLEARANCE) return;
            const currentMin = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
            const currentMax = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
            const occupiedMin = horizontal ? Math.min(segment.from.x, segment.to.x) : Math.min(segment.from.y, segment.to.y);
            const occupiedMax = horizontal ? Math.max(segment.from.x, segment.to.x) : Math.max(segment.from.y, segment.to.y);
            const overlap = Math.min(currentMax, occupiedMax) - Math.max(currentMin, occupiedMin);
            if (overlap > epsilon) {
                const clearanceDeficit = MINDMAP_RELATION_PARALLEL_CLEARANCE - parallelDistance;
                penalty += MINDMAP_RELATION_OVERLAP_PENALTY + overlap * 6 + clearanceDeficit * 12;
            }
            return;
        }

        const horizontalSegment = horizontal ? { from, to } : segment;
        const verticalSegment = horizontal ? segment : { from, to };
        const horizontalMin = Math.min(horizontalSegment.from.x, horizontalSegment.to.x);
        const horizontalMax = Math.max(horizontalSegment.from.x, horizontalSegment.to.x);
        const verticalMin = Math.min(verticalSegment.from.y, verticalSegment.to.y);
        const verticalMax = Math.max(verticalSegment.from.y, verticalSegment.to.y);
        const crossingX = verticalSegment.from.x;
        const crossingY = horizontalSegment.from.y;
        const intersects = crossingX >= horizontalMin - epsilon
            && crossingX <= horizontalMax + epsilon
            && crossingY >= verticalMin - epsilon
            && crossingY <= verticalMax + epsilon;
        if (!intersects) return;
        const sharedTerminal = routeTerminals.some(point =>
            Math.hypot(crossingX - point.x, crossingY - point.y) <= epsilon
        ) && [segment.from, segment.to].some(point =>
            Math.hypot(crossingX - point.x, crossingY - point.y) <= epsilon
        );
        if (sharedTerminal) return;
        const crossingAtFrom = Math.hypot(crossingX - from.x, crossingY - from.y) <= epsilon;
        const fromIsRouteTerminal = routeTerminals.some(point =>
            Math.hypot(from.x - point.x, from.y - point.y) <= epsilon
        );
        // 占用线坐标会被加入寻路网格，同一个交点通常分别位于前后两条小边的
        // 终点和起点。只在抵达交点时计费，避免把一次视觉交叉重复算成两次。
        if (crossingAtFrom && !fromIsRouteTerminal) return;

        // 多个父子边会复用同一段可见树干；同一位置只算一次视觉交叉，避免按子节点数
        // 重复放大树线代价。单次树线交叉可以接受，但两次树线交叉应比一次关系线交叉更差。
        const crossingKey = `${structuralTreeSegment ? 'tree' : 'relation'}:${crossingX.toFixed(1)}:${crossingY.toFixed(1)}`;
        if (countedCrossings.has(crossingKey)) return;
        countedCrossings.add(crossingKey);
        penalty += structuralTreeSegment
            ? MINDMAP_RELATION_TREE_CROSSING_PENALTY
            : MINDMAP_RELATION_CROSSING_PENALTY;
    });
    return penalty;
}

function pushMindMapRelationQueue(queue, item) {
    queue.push(item);
    let index = queue.length - 1;
    while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (queue[parent].priority <= item.priority) break;
        queue[index] = queue[parent];
        index = parent;
    }
    queue[index] = item;
}

function popMindMapRelationQueue(queue) {
    if (queue.length === 0) return null;
    const first = queue[0];
    const last = queue.pop();
    if (queue.length === 0) return first;
    let index = 0;
    while (true) {
        let child = index * 2 + 1;
        if (child >= queue.length) break;
        if (child + 1 < queue.length && queue[child + 1].priority < queue[child].priority) child++;
        if (queue[child].priority >= last.priority) break;
        queue[index] = queue[child];
        index = child;
    }
    queue[index] = last;
    return first;
}

function createMindMapRelationSegmentIndex(occupiedSegments) {
    const horizontalSegments = new Map();
    const verticalSegments = new Map();
    return (horizontal, coordinate) => {
        const cache = horizontal ? horizontalSegments : verticalSegments;
        if (cache.has(coordinate)) return cache.get(coordinate);
        // 保留原顺序与完整线段；只排除不可能交叉或进入平行安全走廊的线段。
        const segments = occupiedSegments.filter(segment => {
            const occupiedHorizontal = Math.abs(segment.from.y - segment.to.y) < 0.1;
            if (horizontal === occupiedHorizontal) {
                const occupiedCoordinate = horizontal ? segment.from.y : segment.from.x;
                return Math.abs(coordinate - occupiedCoordinate) < MINDMAP_RELATION_PARALLEL_CLEARANCE;
            }
            const start = horizontal ? segment.from.y : segment.from.x;
            const end = horizontal ? segment.to.y : segment.to.x;
            return coordinate >= Math.min(start, end) - 0.1
                && coordinate <= Math.max(start, end) + 0.1;
        });
        cache.set(coordinate, segments);
        return segments;
    };
}

function finishMindMapRelationRouting(iterator) {
    let step = iterator.next();
    while (!step.done) step = iterator.next();
    return step.value;
}

async function runMindMapRelationRoutingInSlices(iterator, isCurrent) {
    let sliceStarted = performance.now();
    while (isCurrent()) {
        const step = iterator.next();
        if (step.done) return step.value;
        // Promise 微任务不会让浏览器处理输入；通过新任务真正让出主线程。
        if (performance.now() - sliceStarted >= 6) {
            await new Promise(resolve => setTimeout(resolve, 0));
            sliceStarted = performance.now();
        }
    }
    iterator.return();
    return null;
}

function findMindMapOrthogonalRoute(...args) {
    return finishMindMapRelationRouting(findMindMapOrthogonalRouteSteps(...args));
}

function* findMindMapOrthogonalRouteSteps(
    start,
    end,
    obstacles,
    occupiedSegments = [],
    preferredChannels = [],
    terminalDirection = 0,
    bounds = null,
    getOccupiedSegments = createMindMapRelationSegmentIndex(occupiedSegments)
) {
    const round = value => Math.round(value * 10) / 10;
    const xs = [start.x, end.x];
    const ys = [start.y, end.y];
    preferredChannels.forEach(channel => {
        if (channel.axis === 'x') {
            xs.push(channel.coordinate);
            if (Number.isFinite(channel.min)) ys.push(channel.min);
            if (Number.isFinite(channel.max)) ys.push(channel.max);
        }
        if (channel.axis === 'y') {
            ys.push(channel.coordinate);
            if (Number.isFinite(channel.min)) xs.push(channel.min);
            if (Number.isFinite(channel.max)) xs.push(channel.max);
        }
    });
    obstacles.forEach(obstacle => {
        xs.push(obstacle.left, obstacle.right);
        ys.push(obstacle.top, obstacle.bottom);
    });
    occupiedSegments.forEach(segment => {
        if (Math.abs(segment.from.x - segment.to.x) < 0.1) {
            xs.push(segment.from.x - MINDMAP_RELATION_LANE_GAP, segment.from.x + MINDMAP_RELATION_LANE_GAP);
            const minY = Math.min(segment.from.y, segment.to.y);
            const maxY = Math.max(segment.from.y, segment.to.y);
            ys.push(minY, maxY, minY - MINDMAP_RELATION_LANE_GAP, maxY + MINDMAP_RELATION_LANE_GAP);
        } else {
            ys.push(segment.from.y - MINDMAP_RELATION_LANE_GAP, segment.from.y + MINDMAP_RELATION_LANE_GAP);
            const minX = Math.min(segment.from.x, segment.to.x);
            const maxX = Math.max(segment.from.x, segment.to.x);
            xs.push(minX, maxX, minX - MINDMAP_RELATION_LANE_GAP, maxX + MINDMAP_RELATION_LANE_GAP);
        }
    });
    if (obstacles.length > 0) {
        xs.push(Math.min(...obstacles.map(item => item.left)) - MINDMAP_RELATION_LANE_GAP);
        xs.push(Math.max(...obstacles.map(item => item.right)) + MINDMAP_RELATION_LANE_GAP);
        ys.push(Math.min(...obstacles.map(item => item.top)) - MINDMAP_RELATION_LANE_GAP);
        ys.push(Math.max(...obstacles.map(item => item.bottom)) + MINDMAP_RELATION_LANE_GAP);
    }

    if (bounds) {
        xs.push(bounds.left, bounds.right);
        ys.push(bounds.top, bounds.bottom);
    }

    const xValues = Array.from(new Set(xs
        .filter(value => !bounds || (value >= bounds.left - 0.1 && value <= bounds.right + 0.1))
        .map(round))).sort((a, b) => a - b);
    const yValues = Array.from(new Set(ys
        .filter(value => !bounds || (value >= bounds.top - 0.1 && value <= bounds.bottom + 0.1))
        .map(round))).sort((a, b) => a - b);
    const startX = xValues.indexOf(round(start.x));
    const startY = yValues.indexOf(round(start.y));
    const endX = xValues.indexOf(round(end.x));
    const endY = yValues.indexOf(round(end.y));
    if (startX < 0 || startY < 0 || endX < 0 || endY < 0) return null;

    const queue = [];
    const distances = new Map();
    const parents = new Map();
    // 同一有向几何边会由不同的入场方向反复访问，其固定代价只计算一次。
    // 交叉计费与行进方向有关，因此正反向边分别缓存；转弯和进场代价仍实时计算。
    const edgeCache = new Map();
    const blockedPoints = new Map();
    const routeTerminals = [start, end];
    const startKey = (startY * xValues.length + startX) * 3;
    distances.set(startKey, 0);
    pushMindMapRelationQueue(queue, {
        xIndex: startX,
        yIndex: startY,
        direction: 0,
        cost: 0,
        priority: Math.abs(start.x - end.x) + Math.abs(start.y - end.y),
        key: startKey
    });

    let completed = null;
    let visitedCount = 0;
    while (queue.length > 0) {
        // 单个端口候选也可能很复杂，在寻路内部提供可恢复的暂停点。
        if ((++visitedCount & 127) === 0) yield;
        const current = popMindMapRelationQueue(queue);
        if (current.cost !== distances.get(current.key)) continue;
        if (current.xIndex === endX && current.yIndex === endY) {
            completed = current;
            break;
        }

        const moves = [
            { xIndex: current.xIndex - 1, yIndex: current.yIndex, direction: 1 },
            { xIndex: current.xIndex + 1, yIndex: current.yIndex, direction: 1 },
            { xIndex: current.xIndex, yIndex: current.yIndex - 1, direction: 2 },
            { xIndex: current.xIndex, yIndex: current.yIndex + 1, direction: 2 }
        ];
        moves.forEach((move, moveIndex) => {
            if (move.xIndex < 0 || move.xIndex >= xValues.length || move.yIndex < 0 || move.yIndex >= yValues.length) return;
            const edgeKey = (current.yIndex * xValues.length + current.xIndex) * 4 + moveIndex;
            let edge = edgeCache.get(edgeKey);
            if (edge === null) return;
            if (!edge) {
                const from = { x: xValues[current.xIndex], y: yValues[current.yIndex] };
                const to = { x: xValues[move.xIndex], y: yValues[move.yIndex] };
                const pointKey = move.yIndex * xValues.length + move.xIndex;
                let blocked = blockedPoints.get(pointKey);
                if (blocked === undefined) {
                    blocked = obstacles.some(obstacle => isMindMapRelationPointInsideObstacle(to, obstacle));
                    blockedPoints.set(pointKey, blocked);
                }
                if (blocked || !isMindMapRelationSegmentClear(from, to, obstacles)) {
                    edgeCache.set(edgeKey, null);
                    return;
                }
                const horizontal = Math.abs(from.y - to.y) < 0.1;
                edge = {
                    from,
                    to,
                    length: Math.abs(to.x - from.x) + Math.abs(to.y - from.y),
                    interactionPenalty: getMindMapRelationSegmentInteractionPenalty(
                        from,
                        to,
                        getOccupiedSegments(horizontal, horizontal ? from.y : from.x),
                        routeTerminals
                    ),
                    obstacleEdgePenalty: getMindMapRelationObstacleEdgePenalty(from, to, obstacles),
                    channelDeviationPenalty: getMindMapRelationChannelDeviationPenalty(from, to, preferredChannels)
                };
                edgeCache.set(edgeKey, edge);
            }
            const { from, to, length, interactionPenalty, obstacleEdgePenalty, channelDeviationPenalty } = edge;
            const turnPenalty = current.direction !== 0 && current.direction !== move.direction
                ? MINDMAP_RELATION_TURN_PENALTY
                : 0;
            const terminalAlignmentPenalty = getMindMapRelationTerminalAlignmentPenalty(
                from,
                to,
                end,
                terminalDirection,
                preferredChannels,
                current.direction === move.direction
            );
            const nextCost = current.cost
                + length
                + turnPenalty
                + interactionPenalty
                + obstacleEdgePenalty
                + channelDeviationPenalty
                + terminalAlignmentPenalty;
            const nextKey = (move.yIndex * xValues.length + move.xIndex) * 3 + move.direction;
            if (nextCost >= (distances.get(nextKey) ?? Infinity)) return;
            distances.set(nextKey, nextCost);
            parents.set(nextKey, current.key);
            const heuristic = Math.abs(to.x - end.x) + Math.abs(to.y - end.y);
            pushMindMapRelationQueue(queue, {
                ...move,
                cost: nextCost,
                priority: nextCost + heuristic,
                key: nextKey
            });
        });
    }

    if (!completed) return null;
    const points = [];
    let key = completed.key;
    while (key !== undefined) {
        const pointIndex = Math.floor(key / 3);
        const xIndex = pointIndex % xValues.length;
        const yIndex = Math.floor(pointIndex / xValues.length);
        points.push({ x: xValues[xIndex], y: yValues[yIndex] });
        key = parents.get(key);
    }
    points.reverse();
    return { points: simplifyMindMapRelationPoints(points), cost: completed.cost };
}

function simplifyMindMapRelationPoints(points) {
    const simplified = [];
    points.forEach(point => {
        const last = simplified[simplified.length - 1];
        if (last && Math.abs(last.x - point.x) < 0.1 && Math.abs(last.y - point.y) < 0.1) return;
        if (simplified.length >= 2) {
            const previous = simplified[simplified.length - 2];
            const collinearX = Math.abs(previous.x - last.x) < 0.1 && Math.abs(last.x - point.x) < 0.1;
            const collinearY = Math.abs(previous.y - last.y) < 0.1 && Math.abs(last.y - point.y) < 0.1;
            if (collinearX || collinearY) {
                simplified[simplified.length - 1] = point;
                return;
            }
        }
        simplified.push(point);
    });
    return simplified;
}

function getMindMapRelationTurnCount(points) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    let turns = 0;
    for (let index = 1; index < points.length - 1; index++) {
        const previous = points[index - 1];
        const current = points[index];
        const next = points[index + 1];
        const incomingHorizontal = Math.abs(previous.y - current.y) < 0.1;
        const outgoingHorizontal = Math.abs(current.y - next.y) < 0.1;
        if (incomingHorizontal !== outgoingHorizontal) turns++;
    }
    return turns;
}

function getMindMapRelationSegments(points, kind = 'relation') {
    const segments = [];
    for (let index = 1; index < points.length; index++) {
        const from = points[index - 1];
        const to = points[index];
        if (Math.hypot(to.x - from.x, to.y - from.y) < 0.1) continue;
        segments.push({ from, to, kind });
    }
    return segments;
}

function getMindMapTreeConnectorPoints(parentRect, childRect, side) {
    const startX = side === 'left' ? parentRect.left : parentRect.right;
    const endX = side === 'left' ? childRect.right : childRect.left;
    const startY = (parentRect.top + parentRect.bottom) / 2;
    const endY = (childRect.top + childRect.bottom) / 2;
    const middleX = (startX + endX) / 2;
    return [
        { x: startX, y: startY },
        { x: middleX, y: startY },
        { x: middleX, y: endY },
        { x: endX, y: endY }
    ];
}

function getMindMapRelationTreeSegments(cardRects) {
    const segments = [];
    cardRects.forEach((childRect, nodeId) => {
        if (!nodeId || nodeId === state.data.id) return;
        const parent = findParent(state.data, nodeId);
        const parentRect = parent ? cardRects.get(parent.id) : null;
        const side = getMindMapNodeBranchSide(nodeId);
        if (!parentRect || !side) return;
        segments.push(...getMindMapRelationSegments(
            getMindMapTreeConnectorPoints(parentRect, childRect, side),
            'tree'
        ));
    });
    return segments;
}

function getMindMapRelationCornerCurve(previous, current, next, radius) {
    const incomingLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y);
    if (incomingLength < 0.1 || outgoingLength < 0.1) return null;

    const incoming = {
        x: (current.x - previous.x) / incomingLength,
        y: (current.y - previous.y) / incomingLength
    };
    const outgoing = {
        x: (next.x - current.x) / outgoingLength,
        y: (next.y - current.y) / outgoingLength
    };
    const dot = Math.max(-1, Math.min(1, incoming.x * outgoing.x + incoming.y * outgoing.y));
    const turnAngle = Math.acos(dot);
    if (turnAngle < 0.01 || Math.PI - turnAngle < 0.01) return null;

    const tangentDistance = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    const tangentHalfAngle = Math.tan(turnAngle / 2);
    if (!Number.isFinite(tangentHalfAngle) || Math.abs(tangentHalfAngle) < 0.001) return null;
    const circleRadius = tangentDistance / tangentHalfAngle;
    const handleLength = Math.min(
        tangentDistance,
        Math.abs((4 / 3) * circleRadius * Math.tan(turnAngle / 4))
    );
    const before = {
        x: current.x - incoming.x * tangentDistance,
        y: current.y - incoming.y * tangentDistance
    };
    const after = {
        x: current.x + outgoing.x * tangentDistance,
        y: current.y + outgoing.y * tangentDistance
    };
    return {
        before,
        after,
        control1: {
            x: before.x + incoming.x * handleLength,
            y: before.y + incoming.y * handleLength
        },
        control2: {
            x: after.x - outgoing.x * handleLength,
            y: after.y - outgoing.y * handleLength
        }
    };
}

function getMindMapRoundedOrthogonalPath(points, radius = 16) {
    if (!points || points.length < 2) return '';
    const round = value => Math.round(value * 10) / 10;
    const pointText = point => `${round(point.x)} ${round(point.y)}`;
    let path = `M ${pointText(points[0])}`;
    for (let index = 1; index < points.length - 1; index++) {
        const previous = points[index - 1];
        const current = points[index];
        const next = points[index + 1];
        const curve = getMindMapRelationCornerCurve(previous, current, next, radius);
        if (!curve) {
            path += ` L ${pointText(current)}`;
            continue;
        }
        path += ` L ${pointText(curve.before)}`;
        path += ` C ${pointText(curve.control1)}, ${pointText(curve.control2)}, ${pointText(curve.after)}`;
    }
    path += ` L ${pointText(points[points.length - 1])}`;
    return path;
}

function routeMindMapRelation(...args) {
    return finishMindMapRelationRouting(routeMindMapRelationSteps(...args));
}

function* routeMindMapRelationSteps(
    sourceRect,
    targetRect,
    obstacles,
    occupiedSegments,
    preferredChannels = [],
    portAssignment = null
) {
    const candidates = getMindMapRelationSideCandidates(
        sourceRect,
        targetRect,
        getMindMapRelationReservedSides(sourceRect.id),
        getMindMapRelationReservedSides(targetRect.id),
        getMindMapRelationPortContext(sourceRect.id),
        getMindMapRelationPortContext(targetRect.id),
        obstacles,
        portAssignment?.source,
        portAssignment?.target
    );
    const centerDistance = Math.hypot(
        (targetRect.left + targetRect.width / 2) - (sourceRect.left + sourceRect.width / 2),
        (targetRect.top + targetRect.height / 2) - (sourceRect.top + sourceRect.height / 2)
    );
    const routingMargin = Math.max(120, Math.min(320, centerDistance * 0.2));
    const baseRoutingBounds = {
        left: Math.min(sourceRect.left, targetRect.left) - routingMargin,
        right: Math.max(sourceRect.right, targetRect.right) + routingMargin,
        top: Math.min(sourceRect.top, targetRect.top) - routingMargin,
        bottom: Math.max(sourceRect.bottom, targetRect.bottom) + routingMargin
    };
    const getObstacleContentBounds = obstacle => {
        const padding = String(obstacle.id || '').startsWith('fold-button:')
            ? MINDMAP_RELATION_FOLD_BUTTON_PADDING
            : MINDMAP_RELATION_ROUTING_PADDING;
        return {
            left: obstacle.left + padding,
            right: obstacle.right - padding,
            top: obstacle.top + padding,
            bottom: obstacle.bottom - padding
        };
    };
    const horizontalBlockers = obstacles.filter(obstacle => {
        const contentBounds = getObstacleContentBounds(obstacle);
        return contentBounds.bottom >= Math.min(sourceRect.top, targetRect.top)
            && contentBounds.top <= Math.max(sourceRect.bottom, targetRect.bottom)
            && contentBounds.right >= baseRoutingBounds.left
            && contentBounds.left <= baseRoutingBounds.right;
    });
    const verticalBlockers = obstacles.filter(obstacle => {
        const contentBounds = getObstacleContentBounds(obstacle);
        return contentBounds.right >= Math.min(sourceRect.left, targetRect.left)
            && contentBounds.left <= Math.max(sourceRect.right, targetRect.right)
            && contentBounds.bottom >= baseRoutingBounds.top
            && contentBounds.top <= baseRoutingBounds.bottom;
    });
    const routingBounds = {
        left: Math.min(
            baseRoutingBounds.left,
            ...horizontalBlockers.map(obstacle => obstacle.left - MINDMAP_RELATION_LANE_GAP)
        ),
        right: Math.max(
            baseRoutingBounds.right,
            ...horizontalBlockers.map(obstacle => obstacle.right + MINDMAP_RELATION_LANE_GAP)
        ),
        top: Math.min(
            baseRoutingBounds.top,
            ...verticalBlockers.map(obstacle => obstacle.top - MINDMAP_RELATION_LANE_GAP)
        ),
        bottom: Math.max(
            baseRoutingBounds.bottom,
            ...verticalBlockers.map(obstacle => obstacle.bottom + MINDMAP_RELATION_LANE_GAP)
        )
    };
    const nearbyRelationSegments = portAssignment ? occupiedSegments.filter(segment => {
        if (segment.kind === 'tree') return false;
        const left = Math.min(segment.from.x, segment.to.x);
        const right = Math.max(segment.from.x, segment.to.x);
        const top = Math.min(segment.from.y, segment.to.y);
        const bottom = Math.max(segment.from.y, segment.to.y);
        return right >= routingBounds.left
            && left <= routingBounds.right
            && bottom >= routingBounds.top
            && top <= routingBounds.bottom;
    }) : [];
    nearbyRelationSegments.forEach(segment => {
        routingBounds.left = Math.min(
            routingBounds.left,
            Math.min(segment.from.x, segment.to.x) - MINDMAP_RELATION_LANE_GAP
        );
        routingBounds.right = Math.max(
            routingBounds.right,
            Math.max(segment.from.x, segment.to.x) + MINDMAP_RELATION_LANE_GAP
        );
        routingBounds.top = Math.min(
            routingBounds.top,
            Math.min(segment.from.y, segment.to.y) - MINDMAP_RELATION_LANE_GAP
        );
        routingBounds.bottom = Math.max(
            routingBounds.bottom,
            Math.max(segment.from.y, segment.to.y) + MINDMAP_RELATION_LANE_GAP
        );
    });
    const routingObstacles = obstacles.filter(obstacle =>
        obstacle.right >= routingBounds.left
        && obstacle.left <= routingBounds.right
        && obstacle.bottom >= routingBounds.top
        && obstacle.top <= routingBounds.bottom
    );
    const routingChannels = preferredChannels.filter(channel =>
        channel.axis === 'x'
            ? channel.coordinate >= routingBounds.left && channel.coordinate <= routingBounds.right
            : channel.coordinate >= routingBounds.top && channel.coordinate <= routingBounds.bottom
    );
    const routingOccupiedSegments = occupiedSegments.filter(segment => {
        const left = Math.min(segment.from.x, segment.to.x);
        const right = Math.max(segment.from.x, segment.to.x);
        const top = Math.min(segment.from.y, segment.to.y);
        const bottom = Math.max(segment.from.y, segment.to.y);
        return right >= routingBounds.left
            && left <= routingBounds.right
            && bottom >= routingBounds.top
            && top <= routingBounds.bottom;
    });
    // 同一条路线的端口候选使用相同占用线段，按行/列的筛选结果可共同复用。
    const getOccupiedSegments = createMindMapRelationSegmentIndex(routingOccupiedSegments);
    const findBestRoute = function* (searchBounds) {
        let bestRoute = null;
        for (const candidate of candidates) {
            if (bestRoute && (
                candidate.reservedPortCount > bestRoute.reservedPortCount
                || (
                    candidate.reservedPortCount === bestRoute.reservedPortCount
                    && candidate.occupiedPortCount > bestRoute.occupiedPortCount
                )
            )) break;
            const route = yield* findMindMapOrthogonalRouteSteps(
                candidate.sourcePort.routePoint,
                candidate.targetPort.routePoint,
                routingObstacles,
                routingOccupiedSegments,
                routingChannels,
                candidate.targetSide === 'left' || candidate.targetSide === 'right' ? 1 : 2,
                searchBounds,
                getOccupiedSegments
            );
            yield;
            if (!route) continue;
            const points = simplifyMindMapRelationPoints([
                candidate.sourcePort.port,
                candidate.sourcePort.routePoint,
                ...route.points,
                candidate.targetPort.routePoint,
                candidate.targetPort.port
            ]);
            const terminalTurnPenalty = Math.max(
                0,
                getMindMapRelationTurnCount(points) - getMindMapRelationTurnCount(route.points)
            ) * MINDMAP_RELATION_TURN_PENALTY;
            const visibleTurnPenalty = getMindMapRelationTurnCount(points)
                * (MINDMAP_RELATION_VISIBLE_TURN_PENALTY - MINDMAP_RELATION_TURN_PENALTY);
            const totalCost = route.cost
                + candidate.alignmentPenalty
                + candidate.portDeviationPenalty
                + candidate.estimatedDistance * 0.06
                + candidate.portReuseCost
                + terminalTurnPenalty
                + visibleTurnPenalty;
            if (bestRoute && bestRoute.cost <= totalCost) continue;
            bestRoute = {
                cost: totalCost,
                points,
                path: getMindMapRoundedOrthogonalPath(points),
                sourceSide: candidate.sourceSide,
                targetSide: candidate.targetSide,
                reservedPortCount: candidate.reservedPortCount,
                occupiedPortCount: candidate.occupiedPortCount
            };
        }
        return bestRoute;
    };

    // 只按源、目标之间真正挡路的卡片扩展局部窗口：既允许路线绕过中间兄弟，
    // 又避免位于端点范围之外的超宽兄弟把自己的远端边界变成绕行车道。
    return (yield* findBestRoute(routingBounds)) || (yield* findBestRoute(null));
}

function getMindMapRelationFoldCorridors(cardRects) {
    const corridors = [];
    document.querySelectorAll('.fold-btn').forEach((button, index) => {
        if (button.getClientRects().length === 0) return;
        const ownerId = button.closest('.node-card')?.dataset.nodeId;
        const ownerNode = ownerId ? findNode(state.data, ownerId) : null;
        if (!ownerNode?.children?.length) return;

        const isLeft = button.classList.contains('left-side') || button.classList.contains('root-left');
        const childIds = ownerId === state.data.id
            ? ownerNode.children.filter(child => (child.dir === 'left') === isLeft).map(child => child.id)
            : ownerNode.children.map(child => child.id);
        const childRects = childIds.map(id => cardRects.get(id)).filter(Boolean);
        if (childRects.length === 0) return;

        const buttonRect = getMindMapCanvasRect(button);
        const childBoundary = isLeft
            ? Math.max(...childRects.map(rect => rect.right))
            : Math.min(...childRects.map(rect => rect.left));
        const buttonBoundary = isLeft ? buttonRect.left : buttonRect.right;
        const gap = isLeft ? buttonBoundary - childBoundary : childBoundary - buttonBoundary;
        if (gap < MINDMAP_RELATION_FOLD_BUTTON_PADDING * 2 + 2) return;

        const neighborIds = childRects
            .filter(rect => Math.abs((isLeft ? rect.right : rect.left) - childBoundary) < 0.5)
            .map(rect => rect.id);
        const ownerRect = cardRects.get(ownerId);
        const verticalRects = [buttonRect, ...childRects, ...(ownerRect ? [ownerRect] : [])];
        corridors.push({
            id: `fold-corridor:${ownerId}:${index}`,
            ownerId,
            axis: 'x',
            coordinate: (buttonBoundary + childBoundary) / 2,
            gapMin: Math.min(buttonBoundary, childBoundary),
            gapMax: Math.max(buttonBoundary, childBoundary),
            triggerMin: buttonRect.top - MINDMAP_RELATION_ROUTING_PADDING,
            triggerMax: buttonRect.bottom + MINDMAP_RELATION_ROUTING_PADDING,
            min: Math.min(...verticalRects.map(rect => rect.top)) - MINDMAP_RELATION_ROUTING_PADDING,
            max: Math.max(...verticalRects.map(rect => rect.bottom)) + MINDMAP_RELATION_ROUTING_PADDING,
            side: isLeft ? 'left' : 'right',
            neighborIds
        });
    });
    return corridors;
}

function getMindMapRelationRouteFoldCorridors(route, corridors = []) {
    if (!route?.points?.length || corridors.length === 0) return [];
    const epsilon = 0.1;
    const segments = getMindMapRelationSegments(route.points);

    return corridors.filter(corridor => corridor.axis === 'x' && segments.some(segment => {
        const horizontal = Math.abs(segment.from.y - segment.to.y) < epsilon;
        if (horizontal) {
            const y = segment.from.y;
            if (y < corridor.triggerMin - epsilon || y > corridor.triggerMax + epsilon) return false;
            const minX = Math.min(segment.from.x, segment.to.x);
            const maxX = Math.max(segment.from.x, segment.to.x);
            return minX <= corridor.coordinate + epsilon && maxX >= corridor.coordinate - epsilon;
        }

        const x = segment.from.x;
        const minY = Math.min(segment.from.y, segment.to.y);
        const maxY = Math.max(segment.from.y, segment.to.y);
        const overlapsVerticalRange = Math.max(minY, corridor.triggerMin)
            <= Math.min(maxY, corridor.triggerMax) + epsilon;
        const insideFoldGap = x >= corridor.gapMin - epsilon && x <= corridor.gapMax + epsilon;
        return overlapsVerticalRange && insideFoldGap;
    }));
}

function getMindMapRelationRoutingKey(relations, cardRects, controlObstacles = [], preferredChannels = []) {
    const geometry = Array.from(cardRects.values()).map(rect => {
        const portContext = getMindMapRelationPortContext(rect.id);
        return [
            rect.id,
            Math.round(rect.left * 10),
            Math.round(rect.top * 10),
            Math.round(rect.right * 10),
            Math.round(rect.bottom * 10),
            [...getMindMapRelationReservedSides(rect.id)].sort(),
            findParent(state.data, rect.id)?.id || '',
            portContext?.branchSide || '',
            Boolean(portContext?.hasChildren),
            [...(portContext?.childSides || [])].sort()
        ];
    });
    const relationState = relations.map(relation => [
        relation.id,
        relation.sourceId,
        relation.targetId,
        getMindMapRelationDirection(relation)
    ]);
    const controlGeometry = controlObstacles.map(obstacle => [
        obstacle.id,
        Math.round(obstacle.left * 10),
        Math.round(obstacle.top * 10),
        Math.round(obstacle.right * 10),
        Math.round(obstacle.bottom * 10)
    ]);
    const channelGeometry = preferredChannels.map(channel => [
        channel.id,
        channel.axis,
        Math.round(channel.coordinate * 10),
        Math.round(channel.gapMin * 10),
        Math.round(channel.gapMax * 10),
        Math.round(channel.triggerMin * 10),
        Math.round(channel.triggerMax * 10),
        Math.round(channel.min * 10),
        Math.round(channel.max * 10),
        channel.side,
        channel.ownerId,
        channel.neighborIds
    ]);
    return JSON.stringify([geometry, controlGeometry, channelGeometry, relationState]);
}

function getMindMapRelationPortPlan(relations, cardRects, routes) {
    const endpointGroups = new Map();
    const relationIndexes = new Map(relations.map((relation, index) => [relation.id, index]));
    const addEndpoint = (relationId, role, nodeId, otherId, side) => {
        const rect = cardRects.get(nodeId);
        const otherRect = cardRects.get(otherId);
        if (!rect || !otherRect || !side) return;
        const horizontalSide = side === 'left' || side === 'right';
        const otherAlong = horizontalSide
            ? otherRect.top + otherRect.height / 2
            : otherRect.left + otherRect.width / 2;
        const alongStart = horizontalSide ? rect.top : rect.left;
        const alongEnd = horizontalSide ? rect.bottom : rect.right;
        const otherAlongStart = horizontalSide ? otherRect.top : otherRect.left;
        const otherAlongEnd = horizontalSide ? otherRect.bottom : otherRect.right;
        const alongGap = otherAlongEnd < alongStart
            ? alongStart - otherAlongEnd
            : (otherAlongStart > alongEnd ? otherAlongStart - alongEnd : 0);
        // 嵌套顺序只由连接边方向上的区间距离决定。卡片在垂直于边方向上的
        // 宽度或横向偏移不应改变谁先占内侧车道，否则宽卡片会被误判为远线。
        const nestingDistance = alongGap;
        const key = `${nodeId}:${side}`;
        if (!endpointGroups.has(key)) endpointGroups.set(key, []);
        endpointGroups.get(key).push({
            relationId,
            role,
            nodeId,
            side,
            otherAlong,
            nestingDistance
        });
    };

    relations.forEach(relation => {
        const route = routes.get(relation.id);
        if (!route) return;
        const direction = getMindMapRelationDirection(relation);
        const sourceId = direction === 'reverse' ? relation.targetId : relation.sourceId;
        const targetId = direction === 'reverse' ? relation.sourceId : relation.targetId;
        addEndpoint(relation.id, 'source', sourceId, targetId, route.sourceSide);
        addEndpoint(relation.id, 'target', targetId, sourceId, route.targetSide);
    });

    const assignments = new Map();
    const routeFollowers = new Map(relations.map(relation => [relation.id, new Set()]));
    const routeIndegrees = new Map(relations.map(relation => [relation.id, 0]));
    endpointGroups.forEach(group => {
        if (group.length < 2) return;
        const { nodeId, side } = group[0];
        const rect = cardRects.get(nodeId);
        if (!rect) return;
        const horizontalSide = side === 'left' || side === 'right';
        const start = horizontalSide ? rect.top : rect.left;
        const length = horizontalSide ? rect.height : rect.width;
        const minAlong = start;
        const maxAlong = start + length;
        const centerAlong = start + length / 2;
        const getEndpointRegion = endpoint => endpoint.otherAlong < minAlong
            ? 0
            : (endpoint.otherAlong > maxAlong ? 2 : 1);
        group.sort((left, right) => getEndpointRegion(left) - getEndpointRegion(right)
            || (getEndpointRegion(left) === 1
                ? left.otherAlong - right.otherAlong
                : right.otherAlong - left.otherAlong)
            || String(left.relationId).localeCompare(String(right.relationId))
            || left.role.localeCompare(right.role));

        const nearToFar = [...group].sort((left, right) =>
            left.nestingDistance - right.nestingDistance
            || relationIndexes.get(left.relationId) - relationIndexes.get(right.relationId));
        nearToFar.forEach((endpoint, index) => {
            const follower = nearToFar[index + 1];
            if (!follower || endpoint.relationId === follower.relationId) return;
            const followers = routeFollowers.get(endpoint.relationId);
            if (followers.has(follower.relationId)) return;
            followers.add(follower.relationId);
            routeIndegrees.set(follower.relationId, routeIndegrees.get(follower.relationId) + 1);
        });

        let positions = group.map((_, index) =>
            minAlong + (index + 1) / (group.length + 1) * (maxAlong - minAlong)
        );
        const portContext = getMindMapRelationPortContext(nodeId);
        const centerReserved = getMindMapRelationReservedSides(nodeId).has(side)
            || isMindMapRelationSideOccupied(side, portContext);
        if (centerReserved) {
            const centerClearance = MINDMAP_RELATION_ARROW_SIZE / 2 + 2;
            const nearestDistance = Math.min(...positions.map(position => Math.abs(position - centerAlong)));
            if (nearestDistance < centerClearance) {
                const shiftMagnitude = centerClearance - nearestDistance;
                const averageOtherAlong = group.reduce((sum, endpoint) => sum + endpoint.otherAlong, 0)
                    / group.length;
                const preferredShift = averageOtherAlong >= centerAlong ? shiftMagnitude : -shiftMagnitude;
                const canShift = shift => positions[0] + shift >= minAlong
                    && positions[positions.length - 1] + shift <= maxAlong;
                const shift = canShift(preferredShift)
                    ? preferredShift
                    : (canShift(-preferredShift) ? -preferredShift : 0);
                positions = positions.map(position => position + shift);
            }
        }

        group.forEach((endpoint, index) => {
            const relationAssignment = assignments.get(endpoint.relationId) || {};
            relationAssignment[endpoint.role] = { side, along: positions[index] };
            assignments.set(endpoint.relationId, relationAssignment);
        });
    });

    const ready = relations
        .filter(relation => routeIndegrees.get(relation.id) === 0)
        .map(relation => relation.id);
    const relationOrder = [];
    const sortReady = () => ready.sort((left, right) => relationIndexes.get(left) - relationIndexes.get(right));
    sortReady();
    while (ready.length > 0) {
        const relationId = ready.shift();
        relationOrder.push(relationId);
        routeFollowers.get(relationId).forEach(followerId => {
            const nextIndegree = routeIndegrees.get(followerId) - 1;
            routeIndegrees.set(followerId, nextIndegree);
            if (nextIndegree === 0) {
                ready.push(followerId);
                sortReady();
            }
        });
    }
    if (relationOrder.length < relations.length) {
        relations.forEach(relation => {
            if (!relationOrder.includes(relation.id)) relationOrder.push(relation.id);
        });
    }
    return { assignments, relationOrder };
}

function buildMindMapRelationRoutes(...args) {
    return finishMindMapRelationRouting(buildMindMapRelationRoutesSteps(...args));
}

function buildMindMapRelationRoutesAsync(relations, cardRects, controlObstacles, preferredChannels, isCurrent) {
    return runMindMapRelationRoutingInSlices(
        buildMindMapRelationRoutesSteps(relations, cardRects, controlObstacles, preferredChannels),
        isCurrent
    );
}

function* buildMindMapRelationRoutesSteps(relations, cardRects, controlObstacles = [], preferredChannels = []) {
    const cacheKey = getMindMapRelationRoutingKey(relations, cardRects, controlObstacles, preferredChannels);
    if (cacheKey === relationRouteCache.key) return relationRouteCache.routes;

    const cardObstacles = new Map(Array.from(cardRects.entries()).map(([id, rect]) => [
        id,
        expandMindMapRelationObstacle(rect)
    ]));
    preferredChannels.forEach(channel => {
        channel.neighborIds.forEach(nodeId => {
            const obstacle = cardObstacles.get(nodeId);
            const cardRect = cardRects.get(nodeId);
            if (!obstacle || !cardRect || channel.axis !== 'x') return;
            if (channel.side === 'right') {
                obstacle.left = Math.max(
                    obstacle.left,
                    Math.min(cardRect.left, channel.coordinate + MINDMAP_RELATION_FOLD_BUTTON_PADDING)
                );
            } else {
                obstacle.right = Math.min(
                    obstacle.right,
                    Math.max(cardRect.right, channel.coordinate - MINDMAP_RELATION_FOLD_BUTTON_PADDING)
                );
            }
        });
    });
    const obstacles = [
        ...cardObstacles.values(),
        ...controlObstacles
    ];
    const treeSegments = getMindMapRelationTreeSegments(cardRects);
    const buildRoute = function* (
        relation,
        occupiedSegments,
        portAssignment = null
    ) {
        const direction = getMindMapRelationDirection(relation);
        const sourceId = direction === 'reverse' ? relation.targetId : relation.sourceId;
        const targetId = direction === 'reverse' ? relation.sourceId : relation.targetId;
        const sourceRect = cardRects.get(sourceId);
        const targetRect = cardRects.get(targetId);
        if (!sourceRect || !targetRect) return null;
        const naturalRoute = yield* routeMindMapRelationSteps(
            sourceRect,
            targetRect,
            obstacles,
            occupiedSegments,
            [],
            portAssignment
        );
        if (!naturalRoute) return null;
        const relationChannels = getMindMapRelationRouteFoldCorridors(naturalRoute, preferredChannels);
        return relationChannels.length > 0
            ? (yield* routeMindMapRelationSteps(
                sourceRect,
                targetRect,
                obstacles,
                occupiedSegments,
                relationChannels,
                portAssignment
            )) || naturalRoute
            : naturalRoute;
    };
    const buildPass = function* (
        portAssignments = null,
        relationOrder = null,
        includeRelationOccupancy = true
    ) {
        const occupiedSegments = [...treeSegments];
        const routes = new Map();
        const relationsById = new Map(relations.map(relation => [relation.id, relation]));
        const orderedRelations = relationOrder
            ? relationOrder.map(relationId => relationsById.get(relationId)).filter(Boolean)
            : relations;
        for (const relation of orderedRelations) {
            const portAssignment = portAssignments?.get(relation.id) || null;
            const route = (yield* buildRoute(
                relation,
                occupiedSegments,
                portAssignment
            )) || (portAssignment
                ? (yield* buildRoute(relation, occupiedSegments, null))
                : null);
            if (!route) continue;
            routes.set(relation.id, route);
            if (includeRelationOccupancy) {
                occupiedSegments.push(...getMindMapRelationSegments(route.points));
            }
            yield;
        }
        return routes;
    };

    // 预规划只负责确定每条关系天然应连接哪一侧。此阶段若让先处理的关系占道，
    // 后续关系会在端口尚未均分前被挤到其他边，最终规划也无法再纠正选边结果。
    const naturalRoutes = yield* buildPass(null, null, false);
    const portPlan = getMindMapRelationPortPlan(relations, cardRects, naturalRoutes);
    const routes = relations.length > 1
        ? yield* buildPass(portPlan.assignments, portPlan.relationOrder, true)
        : naturalRoutes;
    relationRouteCache = { key: cacheKey, routes };
    return routes;
}

async function renderMindMapRelations() {
    relationRenderFrame = null;
    const renderVersion = ++relationRenderVersion;
    const layer = $('#relation-layer');
    if (!layer) return;

    const relations = getMindMapRelations();
    if (state.selectedRelationId && !relations.some(relation => relation.id === state.selectedRelationId)) {
        state.selectedRelationId = null;
        closeMindMapRelationEditor();
    }

    if (relations.length === 0) {
        layer.replaceChildren();
        return;
    }

    const cardRects = new Map();
    document.querySelectorAll('.node-card').forEach(card => {
        const rect = getMindMapCanvasRect(card);
        if (rect.id) cardRects.set(rect.id, rect);
    });
    const foldButtonCorridors = getMindMapRelationFoldCorridors(cardRects);
    const foldButtonObstacles = Array.from(document.querySelectorAll('.fold-btn'))
        .filter(button => button.getClientRects().length > 0)
        .map((button, index) => {
            const rect = getMindMapCanvasRect(button);
            const cardId = button.closest('.node-card')?.dataset.nodeId || 'unknown';
            return expandMindMapRelationObstacle(
                { ...rect, id: `fold-button:${cardId}:${index}` },
                MINDMAP_RELATION_FOLD_BUTTON_PADDING
            );
        });
    const routes = await buildMindMapRelationRoutesAsync(
        relations,
        cardRects,
        foldButtonObstacles,
        foldButtonCorridors,
        () => renderVersion === relationRenderVersion
    );
    if (!routes || renderVersion !== relationRenderVersion) return;

    // 样式/方向编辑时保留当前线路，待新结果完成后在同一任务中替换。
    // 卡片布局变化时仍由调度入口立即清除旧线，避免显示旧位置。
    layer.replaceChildren();
    const defs = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'defs');
    layer.appendChild(defs);
    relations.forEach((relation, index) => {
        const sourceCard = document.getElementById(`card-${relation.sourceId}`);
        const targetCard = document.getElementById(`card-${relation.targetId}`);
        if (!sourceCard || !targetCard) return;

        const direction = getMindMapRelationDirection(relation);
        const relationColor = getMindMapRelationColor(relation);
        const route = routes.get(relation.id);
        const fromCard = direction === 'reverse' ? targetCard : sourceCard;
        const toCard = direction === 'reverse' ? sourceCard : targetCard;
        const pathData = route?.path || getMindMapRelationPath(
            fromCard.getBoundingClientRect(),
            toCard.getBoundingClientRect(),
            state.view,
            getMindMapRelationPortContext(fromCard.dataset.nodeId),
            getMindMapRelationPortContext(toCard.dataset.nodeId)
        );
        const group = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'g');
        group.classList.add('relation-group');
        group.classList.toggle('routed', Boolean(route));
        group.classList.toggle('solid', getMindMapRelationLineStyle(relation) === 'solid');
        group.classList.toggle('selected', relation.id === state.selectedRelationId);
        group.dataset.relationId = relation.id;
        group.style.setProperty('--relation-color', relationColor || 'var(--text-color-secondary)');

        const visiblePath = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'path');
        visiblePath.classList.add('relation-line');
        visiblePath.setAttribute('d', pathData);
        if (direction !== 'none') {
            const markerId = `relation-arrow-${index}`;
            const marker = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'marker');
            marker.setAttribute('id', markerId);
            marker.setAttribute('viewBox', `0 0 ${MINDMAP_RELATION_ARROW_SIZE} ${MINDMAP_RELATION_ARROW_SIZE}`);
            marker.setAttribute('markerWidth', String(MINDMAP_RELATION_ARROW_SIZE));
            marker.setAttribute('markerHeight', String(MINDMAP_RELATION_ARROW_SIZE));
            marker.setAttribute('refX', String(MINDMAP_RELATION_ARROW_SIZE - 1));
            marker.setAttribute('refY', String(MINDMAP_RELATION_ARROW_SIZE / 2));
            marker.setAttribute('orient', 'auto');
            marker.setAttribute('markerUnits', 'userSpaceOnUse');
            const arrow = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'path');
            arrow.setAttribute('d', `M 0 0 L ${MINDMAP_RELATION_ARROW_SIZE} ${MINDMAP_RELATION_ARROW_SIZE / 2} L 0 ${MINDMAP_RELATION_ARROW_SIZE} Z`);
            arrow.style.fill = relationColor || 'var(--text-color-secondary)';
            marker.appendChild(arrow);
            defs.appendChild(marker);
            visiblePath.setAttribute('marker-end', `url(#${markerId})`);
        }
        group.appendChild(visiblePath);

        const hitPath = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'path');
        hitPath.classList.add('relation-hit');
        hitPath.dataset.relationId = relation.id;
        hitPath.setAttribute('d', pathData);
        group.appendChild(hitPath);
        layer.appendChild(group);

        const label = getMindMapRelationLabel(relation).trim();
        if (label) {
            const labelElement = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'text');
            labelElement.classList.add('relation-label');
            labelElement.textContent = label;
            try {
                const midpoint = visiblePath.getPointAtLength(visiblePath.getTotalLength() / 2);
                labelElement.setAttribute('x', String(midpoint.x));
                labelElement.setAttribute('y', String(midpoint.y - 10));
            } catch (error) {
                console.warn('[MindMap] 无法计算关联标签位置:', error);
            }
            group.appendChild(labelElement);
        }
    });
}

function scheduleRenderMindMapRelations(cardsChanged = false) {
    // 任意新请求都使正在分批执行的旧任务失效，不能回写旧布局的线路。
    relationRenderVersion++;
    // 卡片布局更新后先移除旧线，避免首帧出现指向旧位置或已折叠节点的线。
    if (cardsChanged) $('#relation-layer')?.replaceChildren();
    if (relationRenderFrame !== null) return;
    // rAF 在绘制前执行：第一帧只安排下一帧，让浏览器先绘制卡片，
    // 再测量最新布局并寻路。两帧之间的更新仍合并到这次绘制中。
    relationRenderFrame = requestAnimationFrame(() => {
        relationRenderFrame = requestAnimationFrame(renderMindMapRelations);
    });
}

function initializeMindMapRelations() {
    const layer = $('#relation-layer');
    const panel = $('#relationEditor');
    const navigationMenu = $('#relationNavigationMenu');
    const navigationList = $('#relationNavigationList');
    if (!layer || !panel || !navigationMenu || !navigationList) return;
    layer.addEventListener('mousedown', event => {
        if (event.button !== 0) return;
        const hitPath = event.target.closest('.relation-hit');
        if (!hitPath) return;
        event.preventDefault();
        event.stopPropagation();
        selectMindMapRelation(hitPath.dataset.relationId, { x: event.clientX, y: event.clientY });
    });
    panel.addEventListener('mousedown', event => event.stopPropagation());
    navigationMenu.addEventListener('mousedown', event => event.stopPropagation());
    navigationList.addEventListener('click', event => {
        const item = event.target.closest('[data-target-node-id]');
        if (item) jumpToMindMapRelatedCard(item.dataset.targetNodeId);
    });
    $('#btn-relation-navigation-close').addEventListener('click', closeMindMapRelationNavigationMenu);
    document.addEventListener('wheel', event => {
        if (!event.target.closest('#relationNavigationMenu')) closeMindMapRelationNavigationMenu();
    }, { passive: true });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeMindMapRelationNavigationMenu();
    });
    $('#btn-relation-editor-close').addEventListener('click', clearSelectedMindMapRelation);
    $('#btn-delete-relation').addEventListener('click', deleteSelectedMindMapRelation);

    const labelInput = $('#relationLabelInput');
    labelInput.addEventListener('input', () => {
        const relation = getMindMapRelationById(state.selectedRelationId);
        if (!relation) return;
        relation.label = labelInput.value.slice(0, 80);
        scheduleRenderMindMapRelations();
    });
    labelInput.addEventListener('change', recordHistory);
    labelInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            labelInput.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            clearSelectedMindMapRelation();
        }
    });

    panel.querySelectorAll('[data-relation-direction]').forEach(button => {
        button.addEventListener('click', () => {
            updateSelectedMindMapRelation('direction', button.dataset.relationDirection);
        });
    });
    panel.querySelectorAll('[data-relation-style]').forEach(button => {
        button.addEventListener('click', () => {
            updateSelectedMindMapRelation('lineStyle', button.dataset.relationStyle);
        });
    });
    panel.querySelectorAll('[data-relation-color]').forEach(button => {
        button.addEventListener('click', () => {
            updateSelectedMindMapRelation('color', button.dataset.relationColor);
        });
    });
    const customColor = $('#relationCustomColor');
    customColor.addEventListener('input', () => {
        updateSelectedMindMapRelation('color', customColor.value.toLowerCase(), false);
    });
    customColor.addEventListener('change', recordHistory);
    panel.addEventListener('keydown', event => {
        if (event.key === 'Escape' && event.target !== labelInput) {
            event.preventDefault();
            clearSelectedMindMapRelation();
        }
    });
    scheduleRenderMindMapRelations();
    syncMindMapRelationNavigationButtons();
}

function getCanvasRelationSides(sourceNode, targetNode) {
    const sourceCenter = { x: sourceNode.x + sourceNode.width / 2, y: sourceNode.y + sourceNode.height / 2 };
    const targetCenter = { x: targetNode.x + targetNode.width / 2, y: targetNode.y + targetNode.height / 2 };
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0
            ? { fromSide: 'right', toSide: 'left' }
            : { fromSide: 'left', toSide: 'right' };
    }
    return dy >= 0
        ? { fromSide: 'bottom', toSide: 'top' }
        : { fromSide: 'top', toSide: 'bottom' };
}

function appendMindMapRelationsToCanvas(canvasNodes, canvasEdges) {
    const nodeMap = new Map(canvasNodes.map(node => [node.id, node]));
    getMindMapRelations().forEach(relation => {
        const direction = getMindMapRelationDirection(relation);
        const fromNodeId = direction === 'reverse' ? relation.targetId : relation.sourceId;
        const toNodeId = direction === 'reverse' ? relation.sourceId : relation.targetId;
        const sourceNode = nodeMap.get(fromNodeId);
        const targetNode = nodeMap.get(toNodeId);
        if (!sourceNode || !targetNode) return;
        const sides = getCanvasRelationSides(sourceNode, targetNode);
        const edge = {
            id: relation.id,
            fromNode: fromNodeId,
            fromSide: sides.fromSide,
            fromEnd: 'none',
            toNode: toNodeId,
            toSide: sides.toSide,
            toEnd: direction === 'none' ? 'none' : 'arrow'
        };
        const label = getMindMapRelationLabel(relation).trim();
        const color = getMindMapRelationColor(relation);
        if (label) edge.label = label;
        if (color) edge.color = color;
        canvasEdges.push(edge);
    });
}

// !SECTION 卡片关联

