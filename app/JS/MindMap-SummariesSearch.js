// SECTION 多卡片总结
const MINDMAP_SUMMARY_SVG_NS = 'http://www.w3.org/2000/svg';
const MINDMAP_SUMMARY_MIN_NODES = 2;
const MINDMAP_SUMMARY_BRACE_OFFSET = 18;
const MINDMAP_SUMMARY_LABEL_GAP = 22;
const MINDMAP_SUMMARY_COLLISION_GAP = 14;
const MINDMAP_SUMMARY_BRANCH_CLEARANCE = 14;
// 与 MindMap.html 中 .summary-brace 的 stroke-width 保持一致。
const MINDMAP_SUMMARY_BRACE_STROKE_WIDTH = 2.5;
const MINDMAP_SUMMARY_BRACE_LANE_GAP = 14;
const MINDMAP_SUMMARY_ESTIMATED_WIDTH = 180;
const MINDMAP_SUMMARY_ESTIMATED_HEIGHT = 120;
const MINDMAP_SUMMARY_LAYOUT_MAX_STEPS = 240;
let summaryRenderFrame = null;

function getMindMapSummaries() {
    return Array.isArray(state.data?.summaries) ? state.data.summaries : [];
}

function ensureMindMapSummaries() {
    if (!Array.isArray(state.data.summaries)) state.data.summaries = [];
    return state.data.summaries;
}

function getMindMapSummaryContent(summary) {
    const content = typeof summary?.content === 'string' ? summary.content : summary?.text;
    return String(content ?? '');
}

function setMindMapSummaryContent(summary, content) {
    if (!summary) return;
    summary.content = String(content ?? '');
    delete summary.text;
}

function getMindMapSummaryById(summaryId) {
    return getMindMapSummaries().find(summary => summary.id === summaryId) || null;
}

function getMindMapNodeBranchSide(nodeId) {
    if (!nodeId || nodeId === state.data.id || !findNode(state.data, nodeId)) return null;
    return isDescendantOfLeft(nodeId) ? 'left' : 'right';
}

function getMindMapSummarySelection(nodeIds = state.selectedIds) {
    const ids = Array.from(new Set(nodeIds || []));
    if (ids.length < MINDMAP_SUMMARY_MIN_NODES) return null;
    const sides = new Set();
    for (const nodeId of ids) {
        const side = getMindMapNodeBranchSide(nodeId);
        if (!side) return null;
        sides.add(side);
    }
    if (sides.size !== 1) return null;
    return { nodeIds: ids, side: Array.from(sides)[0] };
}

function isMindMapSummaryCompleteSubtree(nodeIds) {
    const selectedIds = new Set(nodeIds || []);
    if (selectedIds.size < MINDMAP_SUMMARY_MIN_NODES) return false;

    const selectedRoots = Array.from(selectedIds).filter(nodeId => {
        const parent = findParent(state.data, nodeId);
        return !parent || !selectedIds.has(parent.id);
    });
    if (selectedRoots.length !== 1) return false;

    const subtreeRoot = findNode(state.data, selectedRoots[0]);
    if (!subtreeRoot) return false;
    const subtreeIds = new Set();
    const visit = node => {
        if (!node || subtreeIds.has(node.id)) return;
        subtreeIds.add(node.id);
        (node.children || []).forEach(visit);
    };
    visit(subtreeRoot);
    return subtreeIds.size === selectedIds.size
        && Array.from(subtreeIds).every(nodeId => selectedIds.has(nodeId));
}

function getMindMapSummaryRelationProfile(nodeIds) {
    const ids = Array.from(new Set(nodeIds || []));
    const selectedIds = new Set(ids);
    const siblingsByParent = new Map();
    let parentChildCount = 0;

    ids.forEach(nodeId => {
        const parent = findParent(state.data, nodeId);
        if (!parent) return;
        if (selectedIds.has(parent.id)) {
            parentChildCount++;
        }
        const siblings = siblingsByParent.get(parent.id) || [];
        siblings.push(nodeId);
        siblingsByParent.set(parent.id, siblings);
    });

    let siblingCount = 0;
    siblingsByParent.forEach(siblings => {
        siblingCount += siblings.length * (siblings.length - 1) / 2;
    });
    const isCompleteSubtree = isMindMapSummaryCompleteSubtree(ids);
    const isSingleChain = !isCompleteSubtree
        && ids.every((nodeId, index) => ids.slice(index + 1).every(otherId =>
            isDescendant(state.data, nodeId, otherId)
            || isDescendant(state.data, otherId, nodeId)
        ));
    return {
        parentChildCount,
        siblingCount,
        orientation: isCompleteSubtree
            ? 'vertical'
            : (isSingleChain || parentChildCount > siblingCount ? 'horizontal' : 'vertical')
    };
}

function compareMindMapSummaryLayoutOrder(left, right) {
    const memberCountDifference = (right?.nodeIds?.length || 0) - (left?.nodeIds?.length || 0);
    if (memberCountDifference !== 0) return memberCountDifference;
    const leftSignature = Array.from(new Set(left?.nodeIds || [])).sort().join('|');
    const rightSignature = Array.from(new Set(right?.nodeIds || [])).sort().join('|');
    return leftSignature.localeCompare(rightSignature)
        || String(left?.id || '').localeCompare(String(right?.id || ''));
}

function getMindMapSummaryBracePath(bounds, side, braceX = null) {
    const direction = side === 'left' ? -1 : 1;
    const x = Number.isFinite(braceX)
        ? braceX
        : (side === 'left' ? bounds.left - MINDMAP_SUMMARY_BRACE_OFFSET : bounds.right + MINDMAP_SUMMARY_BRACE_OFFSET);
    const top = bounds.top - 8;
    const bottom = bounds.bottom + 8;
    const middle = (top + bottom) / 2;
    const height = Math.max(80, bottom - top);
    const shoulder = Math.min(22, height * 0.18);
    const depth = Math.min(18, Math.max(12, height * 0.08));
    const outerX = x + direction * depth;
    const tipX = x + direction * depth * 1.55;
    const round = value => Math.round(value * 10) / 10;

    return [
        `M ${round(x)} ${round(top)}`,
        `C ${round(outerX)} ${round(top)}, ${round(outerX)} ${round(top + 4)}, ${round(outerX)} ${round(top + shoulder)}`,
        `L ${round(outerX)} ${round(middle - shoulder)}`,
        `C ${round(outerX)} ${round(middle - 5)}, ${round(tipX)} ${round(middle - 4)}, ${round(tipX)} ${round(middle)}`,
        `C ${round(tipX)} ${round(middle + 4)}, ${round(outerX)} ${round(middle + 5)}, ${round(outerX)} ${round(middle + shoulder)}`,
        `L ${round(outerX)} ${round(bottom - shoulder)}`,
        `C ${round(outerX)} ${round(bottom - 4)}, ${round(outerX)} ${round(bottom)}, ${round(x)} ${round(bottom)}`
    ].join(' ');
}

function getMindMapSummaryHorizontalBracePath(bounds, placement, braceY = null) {
    const direction = placement === 'top' ? -1 : 1;
    const y = Number.isFinite(braceY)
        ? braceY
        : (placement === 'top'
            ? bounds.top - MINDMAP_SUMMARY_BRACE_OFFSET
            : bounds.bottom + MINDMAP_SUMMARY_BRACE_OFFSET);
    const left = bounds.left - 8;
    const right = bounds.right + 8;
    const middle = (left + right) / 2;
    const width = Math.max(80, right - left);
    const shoulder = Math.min(22, width * 0.18);
    const depth = Math.min(18, Math.max(12, width * 0.08));
    const outerY = y + direction * depth;
    const tipY = y + direction * depth * 1.55;
    const round = value => Math.round(value * 10) / 10;

    return [
        `M ${round(left)} ${round(y)}`,
        `C ${round(left)} ${round(outerY)}, ${round(left + 4)} ${round(outerY)}, ${round(left + shoulder)} ${round(outerY)}`,
        `L ${round(middle - shoulder)} ${round(outerY)}`,
        `C ${round(middle - 5)} ${round(outerY)}, ${round(middle - 4)} ${round(tipY)}, ${round(middle)} ${round(tipY)}`,
        `C ${round(middle + 4)} ${round(tipY)}, ${round(middle + 5)} ${round(outerY)}, ${round(middle + shoulder)} ${round(outerY)}`,
        `L ${round(right - shoulder)} ${round(outerY)}`,
        `C ${round(right - 4)} ${round(outerY)}, ${round(right)} ${round(outerY)}, ${round(right)} ${round(y)}`
    ].join(' ');
}

function getMindMapSummaryExpandedCollisionRegion(rect) {
    return {
        kind: 'editor',
        left: rect.left - MINDMAP_SUMMARY_COLLISION_GAP,
        right: rect.right + MINDMAP_SUMMARY_COLLISION_GAP,
        top: rect.top - MINDMAP_SUMMARY_COLLISION_GAP,
        bottom: rect.bottom + MINDMAP_SUMMARY_COLLISION_GAP
    };
}

function getMindMapSummaryCandidateCollisionRegions(candidate) {
    if (Array.isArray(candidate?.collisionRegions)) return candidate.collisionRegions;
    if (candidate?.collisionRect) return [candidate.collisionRect];
    if (candidate?.editorRect) return [getMindMapSummaryExpandedCollisionRegion(candidate.editorRect)];
    return [];
}

function getMindMapSummaryIntersectingRegions(rect, candidate) {
    if (!rect) return [];
    return getMindMapSummaryCandidateCollisionRegions(candidate).filter(region =>
        rect.left < region.right
        && rect.right > region.left
        && rect.top < region.bottom
        && rect.bottom > region.top
    );
}

function getMindMapSummaryBraceCollisionGap() {
    const canvasScale = Math.max(0.05, Number(state.view?.scale) || 1);
    return MINDMAP_SUMMARY_BRACE_STROKE_WIDTH / 2 / canvasScale;
}

function appendMindMapSummaryCollisionCurveSegments(segments, from, control1, control2, to, steps = 8) {
    const collisionGap = getMindMapSummaryBraceCollisionGap();
    const pointAt = t => {
        const inverse = 1 - t;
        return {
            x: inverse ** 3 * from.x
                + 3 * inverse ** 2 * t * control1.x
                + 3 * inverse * t ** 2 * control2.x
                + t ** 3 * to.x,
            y: inverse ** 3 * from.y
                + 3 * inverse ** 2 * t * control1.y
                + 3 * inverse * t ** 2 * control2.y
                + t ** 3 * to.y
        };
    };
    let previous = from;
    for (let index = 1; index <= steps; index++) {
        const next = pointAt(index / steps);
        segments.push({
            kind: 'brace',
            left: Math.min(previous.x, next.x) - collisionGap,
            right: Math.max(previous.x, next.x) + collisionGap,
            top: Math.min(previous.y, next.y) - collisionGap,
            bottom: Math.max(previous.y, next.y) + collisionGap
        });
        previous = next;
    }
}

function appendMindMapSummaryCollisionLineSegment(segments, from, to) {
    const collisionGap = getMindMapSummaryBraceCollisionGap();
    segments.push({
        kind: 'brace',
        left: Math.min(from.x, to.x) - collisionGap,
        right: Math.max(from.x, to.x) + collisionGap,
        top: Math.min(from.y, to.y) - collisionGap,
        bottom: Math.max(from.y, to.y) + collisionGap
    });
}

function getMindMapSummaryVerticalBraceCollisionRegions(bounds, side, braceX) {
    const direction = side === 'left' ? -1 : 1;
    const top = bounds.top - 8;
    const bottom = bounds.bottom + 8;
    const middle = (top + bottom) / 2;
    const height = Math.max(80, bottom - top);
    const shoulder = Math.min(22, height * 0.18);
    const depth = Math.min(18, Math.max(12, height * 0.08));
    const outerX = braceX + direction * depth;
    const tipX = braceX + direction * depth * 1.55;
    const segments = [];

    appendMindMapSummaryCollisionCurveSegments(
        segments,
        { x: braceX, y: top },
        { x: outerX, y: top },
        { x: outerX, y: top + 4 },
        { x: outerX, y: top + shoulder }
    );
    appendMindMapSummaryCollisionLineSegment(
        segments,
        { x: outerX, y: top + shoulder },
        { x: outerX, y: middle - shoulder }
    );
    appendMindMapSummaryCollisionCurveSegments(
        segments,
        { x: outerX, y: middle - shoulder },
        { x: outerX, y: middle - 5 },
        { x: tipX, y: middle - 4 },
        { x: tipX, y: middle }
    );
    appendMindMapSummaryCollisionCurveSegments(
        segments,
        { x: tipX, y: middle },
        { x: tipX, y: middle + 4 },
        { x: outerX, y: middle + 5 },
        { x: outerX, y: middle + shoulder }
    );
    appendMindMapSummaryCollisionLineSegment(
        segments,
        { x: outerX, y: middle + shoulder },
        { x: outerX, y: bottom - shoulder }
    );
    appendMindMapSummaryCollisionCurveSegments(
        segments,
        { x: outerX, y: bottom - shoulder },
        { x: outerX, y: bottom - 4 },
        { x: outerX, y: bottom },
        { x: braceX, y: bottom }
    );
    return segments;
}

function getMindMapSummaryHorizontalBraceCollisionRegions(bounds, placement, braceY) {
    const direction = placement === 'top' ? -1 : 1;
    const left = bounds.left - 8;
    const right = bounds.right + 8;
    const middle = (left + right) / 2;
    const width = Math.max(80, right - left);
    const shoulder = Math.min(22, width * 0.18);
    const depth = Math.min(18, Math.max(12, width * 0.08));
    const outerY = braceY + direction * depth;
    const tipY = braceY + direction * depth * 1.55;
    const segments = [];

    appendMindMapSummaryCollisionCurveSegments(
        segments,
        { x: left, y: braceY },
        { x: left, y: outerY },
        { x: left + 4, y: outerY },
        { x: left + shoulder, y: outerY }
    );
    appendMindMapSummaryCollisionLineSegment(
        segments,
        { x: left + shoulder, y: outerY },
        { x: middle - shoulder, y: outerY }
    );
    appendMindMapSummaryCollisionCurveSegments(
        segments,
        { x: middle - shoulder, y: outerY },
        { x: middle - 5, y: outerY },
        { x: middle - 4, y: tipY },
        { x: middle, y: tipY }
    );
    appendMindMapSummaryCollisionCurveSegments(
        segments,
        { x: middle, y: tipY },
        { x: middle + 4, y: tipY },
        { x: middle + 5, y: outerY },
        { x: middle + shoulder, y: outerY }
    );
    appendMindMapSummaryCollisionLineSegment(
        segments,
        { x: middle + shoulder, y: outerY },
        { x: right - shoulder, y: outerY }
    );
    appendMindMapSummaryCollisionCurveSegments(
        segments,
        { x: right - shoulder, y: outerY },
        { x: right - 4, y: outerY },
        { x: right, y: outerY },
        { x: right, y: braceY }
    );
    return segments;
}

function getMindMapSummaryHorizontalPlacement(bounds, rootRect) {
    const rootCenterY = rootRect
        ? rootRect.top + rootRect.height / 2
        : (bounds.top + bounds.bottom) / 2;
    if (bounds.bottom <= rootCenterY) return { placement: 'top', region: 'top' };
    if (bounds.top >= rootCenterY) return { placement: 'bottom', region: 'bottom' };
    const selectionCenterY = (bounds.top + bounds.bottom) / 2;
    return {
        placement: selectionCenterY <= rootCenterY ? 'top' : 'bottom',
        region: 'middle'
    };
}

function getMindMapSummaryHorizontalBraceY(bounds, placement) {
    return placement === 'top'
        ? bounds.top - MINDMAP_SUMMARY_BRACE_OFFSET
        : bounds.bottom + MINDMAP_SUMMARY_BRACE_OFFSET;
}

function getMindMapSummaryHorizontalCandidate(
    bounds,
    placement,
    editorSize,
    labelOffset = 0,
    braceOffset = 0
) {
    const width = Math.max(80, bounds.right - bounds.left + 16);
    const depth = Math.min(18, Math.max(12, width * 0.08));
    const direction = placement === 'top' ? -1 : 1;
    const braceY = getMindMapSummaryHorizontalBraceY(bounds, placement)
        + direction * Math.max(0, Number(braceOffset) || 0);
    const labelY = braceY + direction * (depth * 1.55 + MINDMAP_SUMMARY_LABEL_GAP + labelOffset);
    const centerX = (bounds.left + bounds.right) / 2;
    const editorWidth = Math.max(MINDMAP_CARD_MIN_WIDTH, editorSize?.width || MINDMAP_SUMMARY_ESTIMATED_WIDTH);
    const editorHeight = Math.max(60, editorSize?.height || MINDMAP_SUMMARY_ESTIMATED_HEIGHT);
    const editorRect = {
        left: centerX - editorWidth / 2,
        right: centerX + editorWidth / 2,
        top: placement === 'top' ? labelY - editorHeight : labelY,
        bottom: placement === 'top' ? labelY : labelY + editorHeight
    };
    const collisionRegions = [
        getMindMapSummaryExpandedCollisionRegion(editorRect),
        ...getMindMapSummaryHorizontalBraceCollisionRegions(bounds, placement, braceY)
    ];
    const footprint = {
        left: Math.min(bounds.left - 8, editorRect.left) - MINDMAP_SUMMARY_COLLISION_GAP,
        right: Math.max(bounds.right + 8, editorRect.right) + MINDMAP_SUMMARY_COLLISION_GAP
    };
    const collisionRect = {
        left: footprint.left,
        right: footprint.right,
        top: placement === 'top'
            ? editorRect.top - MINDMAP_SUMMARY_COLLISION_GAP
            : bounds.bottom,
        bottom: placement === 'top'
        ? bounds.top
        : editorRect.bottom + MINDMAP_SUMMARY_COLLISION_GAP
    };
    const requiredSpace = placement === 'top'
        ? bounds.top - editorRect.top + MINDMAP_SUMMARY_COLLISION_GAP
        : editorRect.bottom - bounds.bottom + MINDMAP_SUMMARY_COLLISION_GAP;
    return {
        braceY,
        labelY,
        editorRect,
        footprint,
        collisionRect,
        collisionRegions,
        requiredSpace,
        braceOffset
    };
}

function getMindMapSummaryHorizontalBraceLane(bounds, placement, editorSize, occupiedGroups = []) {
    const direction = placement === 'top' ? -1 : 1;
    const left = bounds.left - 8;
    const right = bounds.right + 8;
    const baseBraceY = getMindMapSummaryHorizontalBraceY(bounds, placement);
    let braceOffset = 0;
    let braceY = baseBraceY;

    for (let index = 0; index <= occupiedGroups.length; index++) {
        const naturalCandidate = getMindMapSummaryHorizontalCandidate(
            bounds,
            placement,
            editorSize,
            0,
            braceOffset
        );
        const candidateTop = Math.min(naturalCandidate.braceY, naturalCandidate.editorRect.top);
        const candidateBottom = Math.max(naturalCandidate.braceY, naturalCandidate.editorRect.bottom);
        let outwardShift = 0;
        occupiedGroups.forEach(group => {
            if (group.placement !== placement
                || right <= group.left
                || left >= group.right) {
                return;
            }
            const outerEdge = Number.isFinite(group.outerEdge) ? group.outerEdge : group.braceY;
            const groupTop = Math.min(group.braceY, outerEdge);
            const groupBottom = Math.max(group.braceY, outerEdge);
            const overlapsVertically = candidateTop < groupBottom + MINDMAP_SUMMARY_COLLISION_GAP
                && candidateBottom > groupTop - MINDMAP_SUMMARY_COLLISION_GAP;
            // 水平投影相交并不代表两个总结属于同一局部区域。只有“大括号+卡片”
            // 的自然纵向占用也相交时才分配外侧轨道，避免把上方分支的总结推到下方。
            if (!overlapsVertically) return;
            const targetBraceY = placement === 'top'
                ? outerEdge - MINDMAP_SUMMARY_BRACE_LANE_GAP
                : outerEdge + MINDMAP_SUMMARY_BRACE_LANE_GAP;
            const requiredShift = placement === 'top'
                ? braceY - targetBraceY
                : targetBraceY - braceY;
            outwardShift = Math.max(outwardShift, requiredShift);
        });
        if (outwardShift <= 0) break;
        braceOffset += outwardShift;
        braceY = baseBraceY + direction * braceOffset;
    }
    return {
        braceOffset,
        track: { placement, left, right, braceY }
    };
}

function getMindMapSummaryVerticalCandidate(bounds, side, editorSize, braceOffset = 0) {
    const direction = side === 'left' ? -1 : 1;
    const baseBraceX = side === 'left'
        ? bounds.left - MINDMAP_SUMMARY_BRACE_OFFSET
        : bounds.right + MINDMAP_SUMMARY_BRACE_OFFSET;
    const braceX = baseBraceX + direction * braceOffset;
    const height = Math.max(80, bounds.bottom - bounds.top + 16);
    const depth = Math.min(18, Math.max(12, height * 0.08));
    const labelX = braceX + direction * (depth * 1.55 + MINDMAP_SUMMARY_LABEL_GAP);
    const labelY = (bounds.top + bounds.bottom) / 2;
    const editorWidth = Math.max(MINDMAP_CARD_MIN_WIDTH, editorSize?.width || MINDMAP_SUMMARY_ESTIMATED_WIDTH);
    const editorHeight = Math.max(60, editorSize?.height || MINDMAP_SUMMARY_ESTIMATED_HEIGHT);
    const editorRect = {
        left: side === 'left' ? labelX - editorWidth : labelX,
        right: side === 'left' ? labelX : labelX + editorWidth,
        top: labelY - editorHeight / 2,
        bottom: labelY + editorHeight / 2
    };
    const collisionRegions = [
        getMindMapSummaryExpandedCollisionRegion(editorRect),
        ...getMindMapSummaryVerticalBraceCollisionRegions(bounds, side, braceX)
    ];
    const braceOuterX = braceX + direction * depth * 1.55;
    const collisionRect = {
        left: Math.min(braceX, braceOuterX, editorRect.left) - MINDMAP_SUMMARY_COLLISION_GAP,
        right: Math.max(braceX, braceOuterX, editorRect.right) + MINDMAP_SUMMARY_COLLISION_GAP,
        top: Math.min(bounds.top - 8, editorRect.top) - MINDMAP_SUMMARY_COLLISION_GAP,
        bottom: Math.max(bounds.bottom + 8, editorRect.bottom) + MINDMAP_SUMMARY_COLLISION_GAP
    };
    return { braceX, labelX, labelY, editorRect, collisionRect, collisionRegions, braceOffset };
}

function getMindMapSummaryVisibleObstacles(nodeIds) {
    const selectedIds = new Set(nodeIds || []);
    return Array.from(document.querySelectorAll('.node-card'))
        .filter(card => !selectedIds.has(card.dataset.nodeId) && card.getClientRects().length > 0)
        .map(card => ({ card, rect: getMindMapCanvasRect(card) }));
}

function getMindMapSummaryVerticalEvaluation(bounds, side, editorSize, nodeIds, occupiedRects = []) {
    const selectedCards = Array.from(new Set(nodeIds || []))
        .map(nodeId => document.getElementById(`card-${nodeId}`))
        .filter(Boolean);
    const visibleObstacles = getMindMapSummaryVisibleObstacles(nodeIds);
    const occupiedObstacles = (occupiedRects || []).map(rect => ({ card: null, rect }));
    let braceOffset = 0;
    let candidate = getMindMapSummaryVerticalCandidate(bounds, side, editorSize, braceOffset);
    let constraints = [];
    for (let index = 0; index <= visibleObstacles.length + occupiedObstacles.length; index++) {
        let outwardShift = 0;
        const movableConstraints = [];
        visibleObstacles.forEach(obstacle => {
            const constraint = getMindMapSummaryVerticalObstacleConstraint(
                obstacle,
                selectedCards,
                bounds,
                candidate
            );
            if (constraint) {
                // 可分离的树节点交给外层布局迭代器纵向移动；这里不再把它
                // 当作横向障碍，否则节点越宽，总结就会被推得越远。
                movableConstraints.push(constraint);
                return;
            }
            getMindMapSummaryIntersectingRegions(obstacle.rect, candidate).forEach(region => {
                outwardShift = Math.max(outwardShift, side === 'left'
                    ? region.right - obstacle.rect.left
                    : obstacle.rect.right - region.left);
            });
        });
        occupiedObstacles.forEach(obstacle => {
            getMindMapSummaryIntersectingRegions(obstacle.rect, candidate).forEach(region => {
                outwardShift = Math.max(outwardShift, side === 'left'
                    ? region.right - obstacle.rect.left
                    : obstacle.rect.right - region.left);
            });
        });
        if (outwardShift <= 0) {
            constraints = mergeMindMapSummaryVerticalConstraints(movableConstraints);
            break;
        }
        braceOffset += outwardShift;
        candidate = getMindMapSummaryVerticalCandidate(bounds, side, editorSize, braceOffset);
    }
    return {
        orientation: 'vertical',
        placement: side,
        region: 'side',
        candidate,
        constraints,
        cost: braceOffset
    };
}

function getMindMapSummaryCollisionOffset(candidate, placement, occupiedRects) {
    let offset = 0;
    (occupiedRects || []).forEach(rect => {
        const overlapsHorizontally = candidate.editorRect.left < rect.right + MINDMAP_SUMMARY_COLLISION_GAP
            && candidate.editorRect.right > rect.left - MINDMAP_SUMMARY_COLLISION_GAP;
        if (!overlapsHorizontally) return;
        if (placement === 'top') {
            if (candidate.editorRect.top < rect.bottom + MINDMAP_SUMMARY_COLLISION_GAP
                && candidate.editorRect.bottom > rect.top - MINDMAP_SUMMARY_COLLISION_GAP) {
                offset = Math.max(offset, candidate.editorRect.bottom - rect.top + MINDMAP_SUMMARY_COLLISION_GAP);
            }
        } else if (candidate.editorRect.top < rect.bottom + MINDMAP_SUMMARY_COLLISION_GAP
            && candidate.editorRect.bottom > rect.top - MINDMAP_SUMMARY_COLLISION_GAP) {
            offset = Math.max(offset, rect.bottom - candidate.editorRect.top + MINDMAP_SUMMARY_COLLISION_GAP);
        }
    });
    return offset;
}

function getMindMapSummaryCollisionFreeHorizontalCandidate(
    bounds,
    placement,
    editorSize,
    obstacleRects,
    initialLabelOffset = 0,
    braceOffset = 0
) {
    const obstacles = Array.isArray(obstacleRects) ? obstacleRects : [];
    const initialOffset = Math.max(0, Number(initialLabelOffset) || 0);
    let labelOffset = initialOffset;
    let candidate = getMindMapSummaryHorizontalCandidate(
        bounds,
        placement,
        editorSize,
        labelOffset,
        braceOffset
    );
    for (let index = 0; index <= obstacles.length; index++) {
        const collisionOffset = getMindMapSummaryCollisionOffset(candidate, placement, obstacles);
        if (collisionOffset <= 0) break;
        labelOffset += collisionOffset;
        candidate = getMindMapSummaryHorizontalCandidate(
            bounds,
            placement,
            editorSize,
            labelOffset,
            braceOffset
        );
    }
    return {
        candidate,
        labelOffset,
        shifted: labelOffset > initialOffset
    };
}

function getMindMapSummaryGeometry(summary, layoutPlan = null) {
    const selection = getMindMapSummarySelection(summary?.nodeIds || []);
    if (!selection) return null;
    const cardRects = selection.nodeIds
        .map(nodeId => document.getElementById(`card-${nodeId}`))
        .filter(card => card && card.getClientRects().length > 0)
        .map(card => getMindMapCanvasRect(card));
    if (cardRects.length < MINDMAP_SUMMARY_MIN_NODES) return null;

    const bounds = {
        left: Math.min(...cardRects.map(rect => rect.left)),
        top: Math.min(...cardRects.map(rect => rect.top)),
        right: Math.max(...cardRects.map(rect => rect.right)),
        bottom: Math.max(...cardRects.map(rect => rect.bottom))
    };
    const orientation = layoutPlan?.orientation
        || getMindMapSummaryRelationProfile(selection.nodeIds).orientation;
    if (orientation === 'horizontal') {
        const rootCard = document.getElementById(`card-${state.data.id}`);
        const rootRect = rootCard ? getMindMapCanvasRect(rootCard) : null;
        const placementState = getMindMapSummaryHorizontalPlacement(bounds, rootRect);
        const placement = layoutPlan?.placement || placementState.placement;
        const region = layoutPlan?.region || 'local';
        const width = Math.max(80, bounds.right - bounds.left + 16);
        const depth = Math.min(18, Math.max(12, width * 0.08));
        const braceY = Number.isFinite(layoutPlan?.braceY)
            ? layoutPlan.braceY
            : getMindMapSummaryHorizontalBraceY(bounds, placement);
        const direction = placement === 'top' ? -1 : 1;
        const labelOffset = layoutPlan?.labelOffset || 0;
        return {
            bounds,
            side: selection.side,
            orientation,
            placement,
            region,
            braceY,
            path: getMindMapSummaryHorizontalBracePath(bounds, placement, braceY),
            labelX: (bounds.left + bounds.right) / 2,
            labelY: braceY + direction * (depth * 1.55 + MINDMAP_SUMMARY_LABEL_GAP + labelOffset)
        };
    }
    const direction = selection.side === 'left' ? -1 : 1;
    const braceX = Number.isFinite(layoutPlan?.braceX)
        ? layoutPlan.braceX
        : (selection.side === 'left'
            ? bounds.left - MINDMAP_SUMMARY_BRACE_OFFSET
            : bounds.right + MINDMAP_SUMMARY_BRACE_OFFSET);
    const height = Math.max(80, bounds.bottom - bounds.top + 16);
    const depth = Math.min(18, Math.max(12, height * 0.08));
    return {
        bounds,
        side: selection.side,
        orientation,
        placement: selection.side,
        region: 'side',
        path: getMindMapSummaryBracePath(bounds, selection.side, braceX),
        labelX: braceX + direction * (depth * 1.55 + MINDMAP_SUMMARY_LABEL_GAP),
        labelY: (bounds.top + bounds.bottom) / 2
    };
}

function selectMindMapSummary(summaryId) {
    if (!getMindMapSummaryById(summaryId)) return;
    clearSelectedMindMapRelation();
    state.selectedSummaryId = summaryId;
    state.selectedIds.clear();
    updateSelection();
    scheduleRenderMindMapSummaries();
}

function clearSelectedMindMapSummary() {
    if (!state.selectedSummaryId) return;
    state.selectedSummaryId = null;
    updateMindMapSummaryMemberHighlights();
    scheduleRenderMindMapSummaries();
    updateToolbar();
}

function deleteSelectedMindMapSummary() {
    const summaryId = state.selectedSummaryId;
    if (!summaryId || !Array.isArray(state.data.summaries)) return;
    const previousLength = state.data.summaries.length;
    state.data.summaries = state.data.summaries.filter(summary => summary.id !== summaryId);
    state.selectedSummaryId = null;
    if (state.data.summaries.length !== previousLength) {
        recordHistory();
        if (typeof showTopToast === 'function') showTopToast('🗑️ 已删除卡片总结');
    }
    scheduleRenderMindMapSummaries();
    updateToolbar();
}

function removeMindMapSummariesForNodes(nodeIds) {
    if (!nodeIds || nodeIds.size === 0 || !Array.isArray(state.data.summaries)) return false;
    let changed = false;
    const retained = [];
    state.data.summaries.forEach(summary => {
        const previousIds = Array.isArray(summary.nodeIds) ? summary.nodeIds : [];
        const remainingIds = Array.from(new Set(previousIds.filter(nodeId => !nodeIds.has(nodeId))));
        if (remainingIds.length !== previousIds.length) changed = true;
        if (remainingIds.length >= MINDMAP_SUMMARY_MIN_NODES) {
            summary.nodeIds = remainingIds;
            retained.push(summary);
        } else {
            changed = true;
            if (state.selectedSummaryId === summary.id) state.selectedSummaryId = null;
        }
    });
    if (changed) state.data.summaries = retained;
    return changed;
}

function hasDuplicateMindMapSummary(nodeIds) {
    const signature = Array.from(nodeIds).sort().join('|');
    return getMindMapSummaries().some(summary =>
        Array.from(new Set(summary.nodeIds || [])).sort().join('|') === signature
    );
}

function addSummaryForSelectedCards() {
    const selection = getMindMapSummarySelection();
    if (!selection) {
        if (typeof showTopToast === 'function') showTopToast('⚠️ 请选择同一侧的至少两张卡片');
        return;
    }
    if (hasDuplicateMindMapSummary(selection.nodeIds)) {
        if (typeof showTopToast === 'function') showTopToast('⚠️ 这些卡片已经有一个总结');
        return;
    }

    const summary = {
        id: `summary_${generateNodeId()}`,
        nodeIds: selection.nodeIds,
        topic: '总结',
        content: '',
        side: selection.side,
        color: '',
        isSimple: false,
        widthMode: 'auto',
        heightMode: 'auto'
    };
    ensureMindMapSummaries().push(summary);
    state.selectedRelationId = null;
    closeMindMapRelationEditor();
    state.selectedSummaryId = summary.id;
    state.selectedIds.clear();
    recordHistory();
    updateSelection();
    scheduleRenderMindMapSummaries();
    requestAnimationFrame(() => {
        openMindMapEditor(summary, false, true);
    });
}

function createMindMapSummaryEditor(summaryId) {
    const editor = document.createElement('div');
    editor.className = 'summary-editor';
    editor.dataset.summaryId = summaryId;

    const header = document.createElement('div');
    header.className = 'summary-card-header';
    const title = document.createElement('span');
    title.className = 'summary-card-title';
    const titleIcon = document.createElement('i');
    titleIcon.className = 'ri-braces-line';
    const topic = document.createElement('span');
    topic.className = 'summary-topic';
    topic.contentEditable = 'true';
    topic.setAttribute('role', 'textbox');
    topic.setAttribute('aria-label', '总结标题');
    title.append(titleIcon, topic);
    const tools = document.createElement('div');
    tools.className = 'summary-tools card-floating-tools';
    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'summary-tool summary-mode-toggle';
    toggleButton.dataset.summaryAction = 'toggle-simple';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'summary-tool summary-delete';
    deleteButton.title = '删除总结';
    deleteButton.setAttribute('aria-label', '删除总结');
    deleteButton.innerHTML = '<i class="ri-delete-bin-line"></i>';
    const body = document.createElement('div');
    body.className = 'summary-card-body md-content';
    tools.append(toggleButton, deleteButton);
    header.appendChild(title);
    editor.append(header, body, tools);
    editor.insertAdjacentHTML('beforeend', getMindMapResizeHandlesHTML());

    editor.addEventListener('mousedown', event => {
        const handle = event.target.closest('.resize-handle');
        if (handle) {
            const summary = getMindMapSummaryById(editor.dataset.summaryId);
            if (summary) beginMindMapResize(event, summary, 'summary', editor);
        }
        event.stopPropagation();
    });
    editor.addEventListener('dblclick', event => {
        const handle = event.target.closest('.resize-handle');
        const summary = getMindMapSummaryById(editor.dataset.summaryId);
        if (!summary) return;
        if (handle) autoFitMindMapEntity(summary, 'summary', handle.dataset.resize);
        else if (!event.target.closest('.summary-topic, .summary-tools')) openMindMapEditor(summary);
        else return;
        event.preventDefault();
        event.stopPropagation();
    });
    editor.addEventListener('click', () => selectMindMapSummary(editor.dataset.summaryId));
    topic.addEventListener('focus', () => selectMindMapSummary(editor.dataset.summaryId));
    topic.addEventListener('input', () => {
        const summary = getMindMapSummaryById(editor.dataset.summaryId);
        if (summary) summary.topic = topic.innerText.slice(0, 200);
    });
    topic.addEventListener('blur', () => {
        recordHistory();
        scheduleRenderMindMapSummaries();
    });
    topic.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) {
            event.preventDefault();
            topic.blur();
        }
    });
    toggleButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const summary = getMindMapSummaryById(editor.dataset.summaryId);
        if (!summary) return;
        toggleMindMapEntitySimpleMode(summary);
        state.selectedSummaryId = summary.id;
        recordHistory();
        scheduleRenderMindMapSummaries();
        requestAnimationFrame(() => topic.focus());
    });
    deleteButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        state.selectedSummaryId = editor.dataset.summaryId;
        deleteSelectedMindMapSummary();
    });
    return editor;
}

function updateMindMapSummarySelectionAction() {
    const action = $('#summarySelectionAction');
    if (!action) return;
    const selection = getMindMapSummarySelection();
    if (!selection) {
        action.style.display = 'none';
        return;
    }
    const rects = selection.nodeIds
        .map(nodeId => document.getElementById(`card-${nodeId}`)?.getBoundingClientRect())
        .filter(Boolean);
    if (rects.length < MINDMAP_SUMMARY_MIN_NODES) {
        action.style.display = 'none';
        return;
    }
    const left = Math.min(...rects.map(rect => rect.left));
    const right = Math.max(...rects.map(rect => rect.right));
    const top = Math.min(...rects.map(rect => rect.top));
    action.style.display = 'flex';
    const actionLeft = Math.max(8, Math.min(window.innerWidth - action.offsetWidth - 8, (left + right - action.offsetWidth) / 2));
    const actionTop = Math.max(8, Math.min(window.innerHeight - action.offsetHeight - 8, top - action.offsetHeight - 10));
    action.style.left = `${Math.round(actionLeft)}px`;
    action.style.top = `${Math.round(actionTop)}px`;
}

function clearMindMapSummaryBranchShifts() {
    document.querySelectorAll('.child-unit.summary-shifted').forEach(unit => {
        unit.classList.remove('summary-shifted');
        unit.style.removeProperty('--summary-shift-y');
    });
}

function getMindMapSummaryDescendantSeparationAnchor(obstacleCard, selectedCards, placement) {
    const obstacleWrapper = obstacleCard?.closest?.('.node-wrapper');
    if (!obstacleWrapper) return null;
    const childrenContainer = Array.from(obstacleWrapper.children || [])
        .find(child => child.classList?.contains('children-container'));
    if (!childrenContainer) return null;
    const selectedUnits = Array.from(childrenContainer.children || []).filter(unit =>
        unit.classList?.contains('child-unit')
        && selectedCards.some(selectedCard => unit.contains(selectedCard))
    );
    if (selectedUnits.length === 0) return null;
    return {
        // 障碍本身是成员祖先时，必须把成员子分支向总结的反方向推离祖先：
        // 上方总结把成员及其后续兄弟下移，下方总结把成员及其前置兄弟上移。
        // 旧方向会缩短成员与祖先的距离，使迭代缺口越来越大，最终让子树越过父节点。
        anchor: placement === 'top' ? selectedUnits[0] : selectedUnits[selectedUnits.length - 1],
        direction: placement === 'top' ? 'before' : 'after'
    };
}

function getMindMapSummarySeparationAnchor(obstacleCard, selectedCards) {
    let unit = obstacleCard?.closest?.('.child-unit') || null;
    let outermostSeparateUnit = null;
    while (unit && !selectedCards.some(selectedCard => unit.contains(selectedCard))) {
        // 持续提升到“障碍分支”和“成员分支”分叉处的下一层。这个单元
        // 包含完整障碍子树，同时不会把共同祖先及其无关后代拆开。
        outermostSeparateUnit = unit;
        unit = unit.parentElement?.closest('.child-unit') || null;
    }
    return outermostSeparateUnit;
}

function getMindMapSummaryVerticalObstacleConstraint(obstacle, selectedCards, bounds, candidate) {
    if (!obstacle?.rect || !obstacle?.card || selectedCards.length === 0) return null;

    // 只移动成员范围之外的完整分支，避免改变夹在总结成员之间的树顺序。
    // 范围内节点、祖先节点和其他总结卡片继续由横向外移兜底处理。
    const isAbove = obstacle.rect.bottom <= bounds.top;
    const isBelow = obstacle.rect.top >= bounds.bottom;
    if (!isAbove && !isBelow) return null;

    const anchor = getMindMapSummarySeparationAnchor(obstacle.card, selectedCards);
    if (!anchor) return null;
    const direction = isBelow ? 'before' : 'after';
    const nearbyRegions = getMindMapSummaryCandidateCollisionRegions(candidate).filter(region => {
        const clearance = region.kind === 'brace' ? MINDMAP_SUMMARY_BRANCH_CLEARANCE : 0;
        const overlapsHorizontally = obstacle.rect.left < region.right
            && obstacle.rect.right > region.left;
        if (!overlapsHorizontally) return false;
        return isBelow
            ? obstacle.rect.top < region.bottom + clearance && obstacle.rect.bottom > region.top
            : obstacle.rect.bottom > region.top - clearance && obstacle.rect.top < region.bottom;
    });
    if (nearbyRegions.length === 0) return null;
    const deficit = Math.max(0, ...nearbyRegions.map(region => {
        const clearance = region.kind === 'brace' ? MINDMAP_SUMMARY_BRANCH_CLEARANCE : 0;
        return isBelow
            ? region.bottom + clearance - obstacle.rect.top
            : obstacle.rect.bottom - region.top + clearance;
    }));
    if (deficit <= 0) return null;
    return {
        anchor,
        obstacle: obstacle.card,
        direction,
        deficit
    };
}

function mergeMindMapSummaryVerticalConstraints(constraints) {
    const constraintsByAnchor = new Map();
    (constraints || []).forEach(constraint => {
        if (!constraint?.anchor || constraint.deficit <= 0) return;
        const existing = constraintsByAnchor.get(constraint.anchor);
        if (!existing || constraint.deficit > existing.deficit) {
            constraintsByAnchor.set(constraint.anchor, constraint);
        }
    });
    const merged = Array.from(constraintsByAnchor.values());
    return merged.filter(constraint => !merged.some(other =>
        other !== constraint
        && other.anchor.contains?.(constraint.anchor)
    ));
}

function getMindMapSummaryLayoutAnchors(nodeIds, placement, bounds, candidate = null) {
    const selectedIds = new Set(nodeIds || []);
    const selectedCards = Array.from(selectedIds)
        .map(nodeId => document.getElementById(`card-${nodeId}`))
        .filter(Boolean);
    if (selectedCards.length === 0 || !candidate?.editorRect) return [];

    const obstaclesByAnchor = new Map();
    document.querySelectorAll('.node-card').forEach(card => {
        if (selectedIds.has(card.dataset.nodeId) || card.getClientRects().length === 0) return;
        const rect = getMindMapCanvasRect(card);
        if (placement === 'top' && rect.top >= candidate.braceY) return;
        if (placement === 'bottom' && rect.bottom <= candidate.braceY) return;
        if (getMindMapSummaryIntersectingRegions(rect, candidate).length === 0) return;

        let anchor = getMindMapSummarySeparationAnchor(card, selectedCards);
        let direction = placement === 'top' ? 'after' : 'before';
        if (!anchor) {
            const descendantBoundary = getMindMapSummaryDescendantSeparationAnchor(
                card,
                selectedCards,
                placement
            );
            anchor = descendantBoundary?.anchor || null;
            direction = descendantBoundary?.direction || direction;
        }
        const distance = placement === 'top'
            ? bounds.top - rect.bottom
            : rect.top - bounds.bottom;
        const key = anchor || card;
        const existing = obstaclesByAnchor.get(key);
        if (!existing || distance < existing.distance) {
            obstaclesByAnchor.set(key, {
                anchor,
                obstacle: card,
                direction,
                distance
            });
        }
    });
    const obstacles = Array.from(obstaclesByAnchor.values());
    return obstacles.filter(candidate => !candidate.anchor
        || !obstacles.some(other =>
            other !== candidate
            && other.anchor
            && other.anchor.contains(candidate.anchor)
        ));
}

function addMindMapSummaryUnitShift(unit, deltaY, shiftByUnit) {
    if (!unit || !Number.isFinite(deltaY) || Math.abs(deltaY) < 0.5) return false;
    const nextShift = (shiftByUnit.get(unit) || 0) + deltaY;
    shiftByUnit.set(unit, nextShift);
    unit.style.setProperty('--summary-shift-y', `${Math.round(nextShift)}px`);
    unit.classList.add('summary-shifted');
    return true;
}

function getMindMapSummaryDirectChildUnits(container) {
    return Array.from(container?.children || [])
        .filter(child => child.classList?.contains('child-unit'));
}

function applyMindMapSummaryBoundaryShift(anchor, direction, distance, shiftByUnit) {
    const magnitude = Math.max(0, Math.ceil(Number(distance) || 0));
    if (!anchor || magnitude <= 0 || !['before', 'after'].includes(direction)) return false;
    const deltaY = direction === 'before' ? magnitude : -magnitude;
    let currentUnit = anchor;
    let isInitialBoundary = true;
    let changed = false;

    while (currentUnit) {
        const container = currentUnit.parentElement;
        if (!container?.classList?.contains('children-container')) break;
        const siblings = getMindMapSummaryDirectChildUnits(container);
        const index = siblings.indexOf(currentUnit);
        if (index < 0) break;

        // 初始层移动碰撞分支及同方向的兄弟；向上逐层传播时只移动
        // 外侧兄弟，当前祖先单元已经包含被移动的后代，不能重复平移。
        const targets = direction === 'before'
            ? siblings.slice(index + (isInitialBoundary ? 0 : 1))
            : siblings.slice(0, index + (isInitialBoundary ? 1 : 0));
        targets.forEach(unit => {
            changed = addMindMapSummaryUnitShift(unit, deltaY, shiftByUnit) || changed;
        });

        currentUnit = container.closest('.child-unit');
        isInitialBoundary = false;
    }
    return changed;
}

function getMindMapSummaryTreeConnectorPath(parentRect, childRect, side) {
    return getMindMapRoundedOrthogonalPath(
        getMindMapTreeConnectorPoints(parentRect, childRect, side),
        10
    );
}

function renderMindMapTreeConnectors() {
    const layer = document.getElementById('tree-connector-layer');
    const treeRoot = document.getElementById('tree-root');
    if (!layer || !treeRoot) return;
    layer.replaceChildren();
    treeRoot.classList.add('tree-connectors-active');

    document.querySelectorAll('.node-card').forEach(card => {
        const nodeId = card.dataset.nodeId;
        if (!nodeId || nodeId === state.data.id || card.getClientRects().length === 0) return;
        const parent = findParent(state.data, nodeId);
        const parentCard = parent ? document.getElementById(`card-${parent.id}`) : null;
        if (!parentCard || parentCard.getClientRects().length === 0) return;
        const side = getMindMapNodeBranchSide(nodeId);
        if (!side) return;
        const path = document.createElementNS(MINDMAP_SUMMARY_SVG_NS, 'path');
        path.classList.add('tree-connector');
        path.dataset.nodeId = nodeId;
        path.setAttribute('d', getMindMapSummaryTreeConnectorPath(
            getMindMapCanvasRect(parentCard),
            getMindMapCanvasRect(card),
            side
        ));
        layer.appendChild(path);
    });
}

function getMindMapSummaryEditorCanvasSize(summaryId) {
    const editor = document.querySelector(`.summary-editor[data-summary-id="${summaryId}"]`);
    if (!editor || editor.getClientRects().length === 0) {
        return {
            width: MINDMAP_SUMMARY_ESTIMATED_WIDTH,
            height: MINDMAP_SUMMARY_ESTIMATED_HEIGHT
        };
    }
    const rect = getMindMapCanvasRect(editor);
    return {
        width: Math.max(MINDMAP_CARD_MIN_WIDTH, rect.width),
        height: Math.max(60, rect.height)
    };
}

function prepareMindMapSummaryLayout(summaries) {
    clearMindMapSummaryBranchShifts();
    const fixedLayouts = new Map();
    const shiftByUnit = new Map();
    const orderedSummaries = [...summaries].sort(compareMindMapSummaryLayoutOrder);
    orderedSummaries.forEach(summary => {
        const geometry = getMindMapSummaryGeometry(summary);
        if (!geometry) return;
        fixedLayouts.set(summary.id, {
            orientation: geometry.orientation,
            placement: geometry.orientation === 'horizontal' ? geometry.placement : geometry.side
        });
    });

    const evaluateLayouts = () => {
        const evaluations = [];
        const occupiedSummaryRects = [];
        const occupiedHorizontalSummaryGroups = [];
        orderedSummaries.forEach(summary => {
            const fixed = fixedLayouts.get(summary.id);
            const geometry = getMindMapSummaryGeometry(summary, fixed);
            if (!geometry || !fixed) return;
            const editorSize = getMindMapSummaryEditorCanvasSize(summary.id);
            if (fixed.orientation === 'vertical') {
                const evaluation = getMindMapSummaryVerticalEvaluation(
                    geometry.bounds,
                    geometry.side,
                    editorSize,
                    summary.nodeIds,
                    occupiedSummaryRects
                );
                evaluations.push({ summary, geometry, ...evaluation });
                occupiedSummaryRects.push(evaluation.candidate.editorRect);
                return;
            }

            const braceLane = getMindMapSummaryHorizontalBraceLane(
                geometry.bounds,
                fixed.placement,
                editorSize,
                occupiedHorizontalSummaryGroups
            );
            const collisionResult = getMindMapSummaryCollisionFreeHorizontalCandidate(
                geometry.bounds,
                fixed.placement,
                editorSize,
                occupiedSummaryRects,
                0,
                braceLane.braceOffset
            );
            const anchors = getMindMapSummaryLayoutAnchors(
                summary.nodeIds,
                fixed.placement,
                geometry.bounds,
                collisionResult.candidate
            );
            evaluations.push({
                summary,
                geometry,
                orientation: 'horizontal',
                placement: fixed.placement,
                region: 'local',
                labelOffset: collisionResult.labelOffset,
                candidate: collisionResult.candidate,
                anchors
            });
            occupiedSummaryRects.push(collisionResult.candidate.editorRect);
            occupiedHorizontalSummaryGroups.push({
                ...braceLane.track,
                braceY: collisionResult.candidate.braceY,
                outerEdge: fixed.placement === 'top'
                    ? collisionResult.candidate.editorRect.top
                    : collisionResult.candidate.editorRect.bottom
            });
        });
        return evaluations;
    };

    let evaluations = [];
    for (let step = 0; step < MINDMAP_SUMMARY_LAYOUT_MAX_STEPS; step++) {
        evaluations = evaluateLayouts();
        let nextConstraint = null;
        evaluations.forEach(evaluation => {
            if (evaluation.orientation === 'vertical') {
                (evaluation.constraints || []).forEach(({ anchor, direction, deficit }) => {
                    if (!anchor || deficit <= 0) return;
                    if (!nextConstraint || deficit > nextConstraint.deficit) {
                        nextConstraint = { anchor, direction, deficit };
                    }
                });
                return;
            }
            evaluation.anchors.forEach(({ anchor, direction, distance }) => {
                if (!anchor) return;
                const deficit = Math.max(0, evaluation.candidate.requiredSpace - distance);
                if (deficit <= 0) return;
                if (!nextConstraint || deficit > nextConstraint.deficit) {
                    nextConstraint = { anchor, direction, deficit };
                }
            });
        });
        if (!nextConstraint) break;
        const changed = applyMindMapSummaryBoundaryShift(
            nextConstraint.anchor,
            nextConstraint.direction,
            nextConstraint.deficit,
            shiftByUnit
        );
        if (!changed) break;
    }
    evaluations = evaluateLayouts();

    const plans = new Map();
    evaluations.forEach(evaluation => {
        if (evaluation.orientation === 'vertical') {
            plans.set(evaluation.summary.id, {
                orientation: 'vertical',
                placement: evaluation.geometry.side,
                region: 'side',
                braceX: evaluation.candidate.braceX
            });
            return;
        }
        plans.set(evaluation.summary.id, {
            orientation: 'horizontal',
            placement: evaluation.placement,
            region: 'local',
            braceY: evaluation.candidate.braceY,
            labelOffset: evaluation.labelOffset
        });
    });
    if (shiftByUnit.size > 0) scheduleRenderMindMapRelations();
    return plans;
}

function prepareMindMapSummaryEditorsForMeasurement(summaries, labelLayer) {
    summaries.forEach(summary => {
        let editor = labelLayer.querySelector(`.summary-editor[data-summary-id="${summary.id}"]`);
        if (!editor) {
            editor = createMindMapSummaryEditor(summary.id);
            labelLayer.appendChild(editor);
        }
        const isSimple = Boolean(summary.isSimple);
        const summaryTopic = String(summary.topic ?? '总结').slice(0, 200);
        const summaryContent = getMindMapSummaryContent(summary);
        const topic = editor.querySelector('.summary-topic');
        const body = editor.querySelector('.summary-card-body');
        editor.classList.toggle('simple', isSimple);
        editor.classList.toggle('topic-empty', !summaryTopic.trim());
        editor.classList.toggle('has-content', Boolean(summaryContent));
        editor.style.width = summary.widthMode === 'manual' && summary.width ? `${summary.width}px` : '';
        editor.style.height = isSimple && summary.heightMode === 'manual' && summary.bodyHeight
            ? `${summary.bodyHeight}px`
            : '';
        body.style.height = !isSimple && summary.heightMode === 'manual' && summary.bodyHeight
            ? `${summary.bodyHeight}px`
            : '';
        if (document.activeElement !== topic && topic.innerText !== summaryTopic) topic.textContent = summaryTopic;
        if (body.dataset.summaryContent !== summaryContent) {
            body.innerHTML = renderMarkdown(summaryContent);
            body.dataset.summaryContent = summaryContent;
            processRichContent(body);
        }
    });
}

function renderMindMapSummaries() {
    summaryRenderFrame = null;
    // 缩放过程由指针事件直接控制总结卡片尺寸。此时若执行避障重排，
    // ResizeObserver 与手柄会同时改写位置，造成临界尺寸附近疯狂跳动。
    // 鼠标松开后 onMouseUp 会再安排一次最终布局。
    if (state.mode === 'RESIZING' && state.resize?.kind === 'summary') return;
    const braceLayer = $('#summary-brace-layer');
    const labelLayer = $('#summary-label-layer');
    if (!braceLayer || !labelLayer) return;
    braceLayer.replaceChildren();

    const summaries = getMindMapSummaries();
    if (state.selectedSummaryId && !summaries.some(summary => summary.id === state.selectedSummaryId)) {
        state.selectedSummaryId = null;
    }
    updateMindMapSummaryMemberHighlights();
    // 编辑器必须先按持久化尺寸和正文完成 DOM 初始化，避障求解器才能拿到
    // 真实矩形；先用估算高度布局、下一帧再补测会必然残留大卡片重叠。
    prepareMindMapSummaryEditorsForMeasurement(summaries, labelLayer);
    const visibleSummaryIds = new Set();
    const layoutPlans = prepareMindMapSummaryLayout(summaries);
    renderMindMapTreeConnectors();
    let shouldRemeasureLayout = false;
    summaries.forEach(summary => {
        const geometry = getMindMapSummaryGeometry(summary, layoutPlans.get(summary.id));
        if (!geometry) return;
        visibleSummaryIds.add(summary.id);

        const path = document.createElementNS(MINDMAP_SUMMARY_SVG_NS, 'path');
        path.classList.add('summary-brace');
        path.classList.toggle('active', summary.id === state.selectedSummaryId);
        path.dataset.summaryId = summary.id;
        path.setAttribute('d', geometry.path);
        if (/^#[0-9a-f]{6}$/i.test(summary.color || '')) {
            path.style.setProperty('--summary-color', summary.color);
        }
        braceLayer.appendChild(path);

        const editor = labelLayer.querySelector(`.summary-editor[data-summary-id="${summary.id}"]`);
        if (!editor) return;
        editor.classList.toggle('left-side', geometry.orientation === 'vertical' && geometry.side === 'left');
        editor.classList.toggle('horizontal', geometry.orientation === 'horizontal');
        editor.classList.toggle('placement-top', geometry.orientation === 'horizontal' && geometry.placement === 'top');
        editor.classList.toggle('placement-bottom', geometry.orientation === 'horizontal' && geometry.placement === 'bottom');
        editor.classList.toggle('active', summary.id === state.selectedSummaryId);
        editor.classList.toggle('simple', Boolean(summary.isSimple));
        editor.style.left = `${geometry.labelX}px`;
        editor.style.top = `${geometry.labelY}px`;
        if (/^#[0-9a-f]{6}$/i.test(summary.color || '')) {
            editor.style.setProperty('--summary-accent', summary.color);
            editor.classList.add('has-color');
        } else {
            editor.style.removeProperty('--summary-accent');
            editor.classList.remove('has-color');
        }
        editor.style.width = summary.widthMode === 'manual' && summary.width ? `${summary.width}px` : '';
        editor.style.height = summary.isSimple && summary.heightMode === 'manual' && summary.bodyHeight
            ? `${summary.bodyHeight}px`
            : '';
        const topic = editor.querySelector('.summary-topic');
        const body = editor.querySelector('.summary-card-body');
        const toggleButton = editor.querySelector('[data-summary-action="toggle-simple"]');
        const isSimple = Boolean(summary.isSimple);
        const toggleTitle = isSimple ? '切换回卡片模式' : '切换为便利贴模式';
        toggleButton.title = toggleTitle;
        toggleButton.setAttribute('aria-label', toggleTitle);
        toggleButton.setAttribute('aria-pressed', String(isSimple));
        toggleButton.innerHTML = `<i class="${isSimple ? 'ri-layout-top-2-line' : 'ri-sticky-note-line'}"></i>`;
        body.style.height = !isSimple && summary.heightMode === 'manual' && summary.bodyHeight
            ? `${summary.bodyHeight}px`
            : '';
        const summaryTopic = String(summary.topic ?? '总结').slice(0, 200);
        if (document.activeElement !== topic && topic.innerText !== summaryTopic) topic.textContent = summaryTopic;
        const wasTopicEmpty = editor.classList.contains('topic-empty');
        const isTopicEmpty = document.activeElement !== topic && !summaryTopic.trim();
        editor.classList.toggle('topic-empty', isTopicEmpty);
        if (wasTopicEmpty !== isTopicEmpty && geometry.orientation === 'horizontal') {
            shouldRemeasureLayout = true;
        }
        const summaryContent = getMindMapSummaryContent(summary);
        editor.classList.toggle('has-content', Boolean(summaryContent));
        if (body.dataset.summaryContent !== summaryContent) {
            body.innerHTML = renderMarkdown(summaryContent);
            body.dataset.summaryContent = summaryContent;
            processRichContent(body);
            if (geometry.orientation === 'horizontal') shouldRemeasureLayout = true;
        }
    });

    labelLayer.querySelectorAll('.summary-editor').forEach(editor => {
        if (!visibleSummaryIds.has(editor.dataset.summaryId)) editor.remove();
    });
    updateMindMapSummarySelectionAction();
    updateToolbar();
    if (shouldRemeasureLayout) scheduleRenderMindMapSummaries();
}

function scheduleRenderMindMapSummaries() {
    if (summaryRenderFrame !== null) return;
    summaryRenderFrame = requestAnimationFrame(renderMindMapSummaries);
}

function initializeMindMapSummaries() {
    const action = $('#summarySelectionAction');
    if (!$('#summary-brace-layer') || !$('#summary-label-layer') || !action) return;
    action.addEventListener('mousedown', event => event.stopPropagation());
    action.addEventListener('click', addSummaryForSelectedCards);
    window.addEventListener('resize', scheduleRenderMindMapSummaries);
    scheduleRenderMindMapSummaries();
}

// !SECTION 多卡片总结

// SECTION 搜索定位
function normalizeMapSearchText(value) {
    const text = String(value ?? '');
    const normalized = typeof text.normalize === 'function' ? text.normalize('NFKC') : text;
    return normalized.toLowerCase();
}

function stripMarkdownForSearch(value) {
    return String(value ?? '')
        .replace(/```[\s\S]*?```/g, block => block.replace(/```[^\n]*\n?|```/g, ' '))
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/(^|\s)[#>*_~`|+-]+(?=\s|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function makeMapSearchSnippet(content, terms) {
    const plainText = stripMarkdownForSearch(content);
    if (!plainText) return '';

    const normalized = normalizeMapSearchText(plainText);
    const firstMatch = terms.reduce((best, term) => {
        const index = normalized.indexOf(term);
        return index >= 0 && (best < 0 || index < best) ? index : best;
    }, -1);
    const start = Math.max(0, firstMatch < 0 ? 0 : firstMatch - 32);
    const snippet = plainText.slice(start, start + 108);
    return `${start > 0 ? '…' : ''}${snippet}${start + 108 < plainText.length ? '…' : ''}`;
}

function collectMapSearchResults(root, query, allowedNodeIds = null) {
    const terms = normalizeMapSearchText(query).trim().split(/[\s\u3000]+/u).filter(Boolean);
    if (!root || terms.length === 0) return [];

    const results = [];
    let treeOrder = 0;
    const visit = (node, ancestors) => {
        if (!node) return;
        const topic = String(node.topic ?? '').trim();
        const content = String(node.content ?? '');
        const normalizedTopic = normalizeMapSearchText(topic);
        const normalizedContent = normalizeMapSearchText(stripMarkdownForSearch(content));
        const searchableText = `${normalizedTopic}\n${normalizedContent}`;

        const isAllowed = !allowedNodeIds || allowedNodeIds.has(node.id);
        if (isAllowed && terms.every(term => searchableText.includes(term))) {
            const titleMatches = terms.filter(term => normalizedTopic.includes(term)).length;
            const titleRank = titleMatches === terms.length ? 0 : titleMatches > 0 ? 1 : 2;
            const route = [...ancestors, node];
            const rootChild = route.length > 1 ? route[1] : null;
            results.push({
                id: node.id,
                topic: topic || '未命名卡片',
                snippet: makeMapSearchSnippet(content, terms),
                path: ancestors.map(item => String(item.topic ?? '').trim()).filter(Boolean),
                pathIds: ancestors.map(item => item.id),
                rootDirection: rootChild ? (rootChild.dir === 'left' ? 'left' : 'right') : null,
                titleRank,
                treeOrder: treeOrder++
            });
        } else {
            treeOrder++;
        }

        (node.children || []).forEach(child => visit(child, [...ancestors, node]));
    };

    visit(root, []);
    return results.sort((a, b) => a.titleRank - b.titleRank || a.treeOrder - b.treeOrder);
}

function getRenderedMapSearchNodeIds() {
    return new Set(Array.from(
        document.querySelectorAll('#tree-root .node-card[data-node-id]'),
        card => card.dataset.nodeId
    ));
}

function getMapSearchTextMatches(text, terms) {
    // 保留原文偏移，让全角字符、组合字符和兼容字形也能按搜索规则高亮。
    const normalized = normalizeMapSearchText(text);
    const offsets = [];
    const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
    for (const { segment, index } of segments) {
        const value = normalizeMapSearchText(segment);
        for (let i = 0; i < value.length; i++) {
            offsets.push({ start: index, end: index + segment.length });
        }
    }
    const matches = [];
    for (const term of new Set(terms)) {
        if (!term) continue;
        let index = normalized.indexOf(term);
        while (index !== -1) {
            matches.push({ start: offsets[index].start, end: offsets[index + term.length - 1].end });
            index = normalized.indexOf(term, index + 1);
        }
    }
    return matches;
}

function clearMapSearchHighlights() {
    globalThis.CSS?.highlights?.delete('mindmap-search');
}

function updateMapSearchHighlights() {
    if (!globalThis.CSS?.highlights || typeof Highlight === 'undefined') return;
    clearMapSearchHighlights();
    if (!isMapSearchOpen()) return;
    const terms = normalizeMapSearchText(mapSearchState.query).trim().split(/[\s\u3000]+/u).filter(Boolean);
    if (terms.length === 0) return;

    const highlight = new Highlight();
    const selector = '#tree-root .node-topic, #tree-root .card-body, '
        + '#mapSearchResults .map-search-result-title, #mapSearchResults .map-search-result-snippet';
    document.querySelectorAll(selector).forEach(element => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let text = '';
        let previousBlock = null;
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.parentElement.closest('script, style, #tree-root button, svg, .katex, .mermaid-wrapper, .code-line-numbers, [hidden]')) {
                text += '\n';
                continue;
            }
            const block = node.parentElement.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote');
            if (nodes.length > 0 && block !== previousBlock) text += '\n';
            previousBlock = block;
            nodes.push({ node, start: text.length, end: text.length + node.length });
            text += node.data;
        }
        getMapSearchTextMatches(text, terms).forEach(match => {
            const start = nodes.find(item => item.start <= match.start && item.end > match.start);
            const end = nodes.find(item => item.start < match.end && item.end >= match.end);
            if (!start || !end) return;
            const range = document.createRange();
            range.setStart(start.node, match.start - start.start);
            range.setEnd(end.node, match.end - end.start);
            highlight.add(range);
        });
    });
    CSS.highlights.set('mindmap-search', highlight);
}

function isMapSearchOpen() {
    return Boolean($('#mapSearchPanel')?.classList.contains('active'));
}

function isMapNodeTemporarilyExpanded(nodeId) {
    return mapSearchState.revealedNodeIds.has(nodeId);
}

function isMapRootDirectionTemporarilyExpanded(direction) {
    return mapSearchState.revealedRootDirections.has(direction);
}

function clearMapSearchReveal() {
    const hadReveal = mapSearchState.revealedNodeIds.size > 0
        || mapSearchState.revealedRootDirections.size > 0;
    mapSearchState.revealedNodeIds.clear();
    mapSearchState.revealedRootDirections.clear();
    return hadReveal;
}

function syncMapSearchScopeButton() {
    const scopeButton = $('#btn-search-scope');
    if (scopeButton) {
        const allTabs = mapSearchState.allTabs;
        scopeButton.textContent = allTabs ? '全部 Tab' : '当前 Tab';
        scopeButton.classList.toggle('active', allTabs);
        scopeButton.setAttribute('aria-pressed', String(allTabs));
        scopeButton.title = allTabs
            ? '当前搜索全部 Tab，点击仅搜索当前 Tab'
            : '当前搜索当前 Tab，点击搜索全部 Tab';
        scopeButton.setAttribute('aria-label', allTabs ? '仅搜索当前 Tab' : '搜索全部 Tab');
    }
    const button = $('#btn-search-visible');
    if (!button) return;
    const visibleOnly = isMapSearchVisibleOnly();
    button.disabled = mapSearchState.allTabs;
    button.classList.toggle('active', visibleOnly);
    button.setAttribute('aria-pressed', String(visibleOnly));
    const label = mapSearchState.allTabs
        ? '仅搜索未折叠卡片仅当前 Tab 可用'
        : visibleOnly ? '搜索全部卡片' : '仅搜索未折叠卡片';
    button.title = label;
    button.setAttribute('aria-label', label);
}

function isMapSearchVisibleOnly() {
    return mapSearchState.visibleOnly && !mapSearchState.allTabs;
}

function refreshVisibleMapSearchResults() {
    if (!isMapSearchVisibleOnly() || !isMapSearchOpen()) return;
    executeMapSearch(mapSearchState.query);
}

function renderMapSearchResults() {
    const container = $('#mapSearchResults');
    const count = $('#mapSearchCount');
    const previousButton = $('#btn-search-prev');
    const nextButton = $('#btn-search-next');
    if (!container || !count) return;

    const total = mapSearchState.results.length;
    const current = total > 0 ? mapSearchState.activeIndex + 1 : 0;
    count.textContent = `${current}/${total}`;
    if (previousButton) previousButton.disabled = total === 0;
    if (nextButton) nextButton.disabled = total === 0;
    container.replaceChildren();

    if (!mapSearchState.query.trim()) {
        const empty = document.createElement('div');
        empty.className = 'map-search-empty';
        empty.textContent = '输入关键词，搜索卡片标题和正文';
        container.appendChild(empty);
        return;
    }
    if (total === 0) {
        const empty = document.createElement('div');
        empty.className = 'map-search-empty';
        empty.textContent = isMapSearchVisibleOnly()
            ? '当前未折叠卡片中没有匹配结果'
            : '没有找到匹配的卡片';
        container.appendChild(empty);
        return;
    }

    mapSearchState.results.forEach((result, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `map-search-result${index === mapSearchState.activeIndex ? ' active' : ''}`;
        button.dataset.searchIndex = String(index);
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(index === mapSearchState.activeIndex));

        const title = document.createElement('span');
        title.className = 'map-search-result-title';
        title.textContent = result.topic;
        button.appendChild(title);

        const resultPath = mapSearchState.allTabs ? [result.tabName, ...result.path] : result.path;
        if (resultPath.length > 0) {
            const path = document.createElement('span');
            path.className = 'map-search-result-path';
            path.textContent = resultPath.join(' › ');
            button.appendChild(path);
        }
        if (result.snippet) {
            const snippet = document.createElement('span');
            snippet.className = 'map-search-result-snippet';
            snippet.textContent = result.snippet;
            button.appendChild(snippet);
        }
        container.appendChild(button);
    });
}

function executeMapSearch(query) {
    mapSearchState.query = String(query ?? '');
    const allowedNodeIds = isMapSearchVisibleOnly() ? getRenderedMapSearchNodeIds() : null;
    const tabs = mapSearchState.allTabs ? mindMapWorkbook.tabs : [getActiveMindMapTab()];
    mapSearchState.results = tabs.filter(Boolean).flatMap(tab => {
        // 当前页必须使用实时数据，避免撤销或编辑替换根对象后搜索旧快照。
        const root = tab.id === mindMapWorkbook.activeTabId ? state.data : tab.data;
        return collectMapSearchResults(root, mapSearchState.query, allowedNodeIds)
            .map(result => ({ ...result, tabId: tab.id, tabName: tab.name }));
    });
    mapSearchState.activeIndex = mapSearchState.results.length > 0 ? 0 : -1;
    mapSearchState.hasLocated = false;
    // 输入中的新关键词（包括无结果）不应收起已定位结果临时展开的路径。
    // 真正定位另一条结果时会在 locateMapSearchResult 中切换临时展开状态。
    renderMapSearchResults();
    updateMapSearchHighlights();
}

function getMapSearchClipboardQuery(value) {
    const query = String(value ?? '').trim();
    const characterCount = Array.from(query).length;
    return characterCount > 0 && characterCount <= MAP_SEARCH_CLIPBOARD_MAX_CHARS ? query : '';
}

async function readMapSearchClipboardText() {
    if (!navigator.clipboard) return '';
    try {
        if (typeof navigator.clipboard.readText === 'function') {
            const text = await navigator.clipboard.readText();
            if (text) return text;
        }
    } catch (_) {
        // 部分 WebView2 对 readText 支持不稳定，继续尝试 ClipboardItem 回退。
    }

    try {
        if (typeof navigator.clipboard.read !== 'function') return '';
        const items = await navigator.clipboard.read();
        for (const item of items) {
            if (!item.types.includes('text/plain')) continue;
            return await (await item.getType('text/plain')).text();
        }
    } catch (_) {
        // 保留空字符串，搜索框仍可正常手动输入。
    }
    return '';
}

async function applyMapSearchClipboardQuery(input, initialValue, requestId) {
    try {
        const query = getMapSearchClipboardQuery(await readMapSearchClipboardText());
        const canApply = query
            && requestId === mapSearchState.clipboardRequestId
            && isMapSearchOpen()
            && input.value === initialValue;
        if (!canApply) return;
        input.value = query;
        executeMapSearch(query);
    } catch (_) {
        // WebView2 或浏览器未授予剪贴板读取权限时，保留当前搜索词和正常聚焦行为。
    }
}

function cancelMapSearchPendingFocus() {
    mapSearchState.focusRequestId += 1;
    if (mapSearchState.focusTimer) clearTimeout(mapSearchState.focusTimer);
    mapSearchState.focusTimer = null;
}

function focusMapSearchInput(input) {
    if (!input) return;
    cancelMapSearchPendingFocus();
    const requestId = mapSearchState.focusRequestId;
    const applyFocus = () => {
        if (requestId !== mapSearchState.focusRequestId || !input.isConnected || !isMapSearchOpen()) return;
        input.focus({ preventScroll: true });
        input.select();
    };
    applyFocus();
    // 先覆盖普通浏览器的下一帧布局，再覆盖 WebView2 完成 visibility 过渡后的焦点时序。
    requestAnimationFrame(applyFocus);
    mapSearchState.focusTimer = setTimeout(() => {
        mapSearchState.focusTimer = null;
        if (document.activeElement !== input) applyFocus();
    }, 180);
}

function openMapSearch({ prefillFromClipboard = false } = {}) {
    const panel = $('#mapSearchPanel');
    const input = $('#mapSearchInput');
    if (!panel || !input) return;
    const initialValue = input.value;
    const requestId = ++mapSearchState.clipboardRequestId;
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
    $('#btn-search')?.setAttribute('aria-expanded', 'true');
    executeMapSearch(input.value);
    focusMapSearchInput(input);
    if (prefillFromClipboard) {
        void applyMapSearchClipboardQuery(input, initialValue, requestId);
    }
}

function closeMapSearch() {
    const panel = $('#mapSearchPanel');
    if (!panel) return;
    cancelMapSearchPendingFocus();
    mapSearchState.clipboardRequestId += 1;
    if (panel.contains(document.activeElement)) document.activeElement.blur();
    panel.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
    $('#btn-search')?.setAttribute('aria-expanded', 'false');
    clearMapSearchHighlights();
    document.querySelector('.node-card.search-active')?.classList.remove('search-active');
}

function resetMapSearch({ preserveSearch = false } = {}) {
    clearMapSearchHighlights();
    clearMapSearchReveal();
    if (mapSearchState.pulseTimer) clearTimeout(mapSearchState.pulseTimer);
    mapSearchState.pulseTimer = null;
    if (preserveSearch) {
        // 切换页面只清除旧页的临时展开与异步请求，保留关键词和结果位置。
        cancelMapSearchPendingFocus();
        mapSearchState.clipboardRequestId += 1;
        return;
    }
    mapSearchState.query = '';
    mapSearchState.results = [];
    mapSearchState.activeIndex = -1;
    mapSearchState.hasLocated = false;
    mapSearchState.allTabs = false;
    mapSearchState.visibleOnly = false;
    const input = $('#mapSearchInput');
    if (input) input.value = '';
    syncMapSearchScopeButton();
    closeMapSearch();
    renderMapSearchResults();
}

function centerMapNodeInVisibleArea(card) {
    const cardRect = card.getBoundingClientRect();
    const panel = $('#mapSearchPanel');
    const panelRect = isMapSearchOpen() && panel ? panel.getBoundingClientRect() : null;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;

    if (panelRect && panelRect.width < window.innerWidth * 0.55) {
        targetX = Math.max(80, panelRect.left / 2);
    } else if (panelRect) {
        const spaceBelow = window.innerHeight - panelRect.bottom;
        if (spaceBelow > 100) targetY = panelRect.bottom + spaceBelow / 2;
    }

    state.view.tx += targetX - (cardRect.left + cardRect.width / 2);
    state.view.ty += targetY - (cardRect.top + cardRect.height / 2);
    updateTransform();
}

function pulseMapSearchTarget(card) {
    if (mapSearchState.pulseTimer) clearTimeout(mapSearchState.pulseTimer);
    document.querySelector('.node-card.search-active')?.classList.remove('search-active');
    void card.offsetWidth;
    card.classList.add('search-active');
    mapSearchState.pulseTimer = setTimeout(() => {
        card.classList.remove('search-active');
        mapSearchState.pulseTimer = null;
    }, 1050);
}

function locateMapSearchResult(index) {
    const result = mapSearchState.results[index];
    if (!result) return;

    if (result.tabId !== mindMapWorkbook.activeTabId
        && !activateMindMapTab(result.tabId, { preserveSearch: true })) {
        executeMapSearch(mapSearchState.query);
        return;
    }
    mapSearchState.activeIndex = index;
    mapSearchState.hasLocated = true;
    if (!isMapSearchVisibleOnly()) {
        clearMapSearchReveal();
        result.pathIds.forEach(id => {
            if (id !== state.data.id) mapSearchState.revealedNodeIds.add(id);
        });
        if (result.rootDirection) mapSearchState.revealedRootDirections.add(result.rootDirection);
        renderTree();
    }

    state.selectedRelationId = null;
    state.selectedSummaryId = null;
    closeMindMapRelationEditor();
    state.selectedIds.clear();
    state.selectedIds.add(result.id);
    updateSelection();
    renderMapSearchResults();
    $('#mapSearchResults')?.querySelector(`[data-search-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });

    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (mindMapWorkbook.activeTabId !== result.tabId
            || mapSearchState.results[mapSearchState.activeIndex] !== result) return;
        const card = document.getElementById(`card-${result.id}`);
        if (!card) return;
        centerMapNodeInVisibleArea(card);
        pulseMapSearchTarget(card);
    }));
}

function navigateMapSearch(direction) {
    const total = mapSearchState.results.length;
    if (total === 0) return;
    const nextIndex = mapSearchState.hasLocated
        ? (mapSearchState.activeIndex + direction + total) % total
        : (direction < 0 ? total - 1 : 0);
    locateMapSearchResult(nextIndex);
}

function initializeMapSearch() {
    const panel = $('#mapSearchPanel');
    const input = $('#mapSearchInput');
    const results = $('#mapSearchResults');
    if (!panel || !input || !results) return;

    $('#btn-search').onclick = () => {
        if (isMapSearchOpen()) closeMapSearch();
        else openMapSearch();
    };
    $('#btn-search-close').onclick = closeMapSearch;
    $('#btn-search-prev').onclick = () => navigateMapSearch(-1);
    $('#btn-search-next').onclick = () => navigateMapSearch(1);
    $('#btn-search-scope').onclick = () => {
        mapSearchState.allTabs = !mapSearchState.allTabs;
        syncMapSearchScopeButton();
        executeMapSearch(input.value);
    };
    document.addEventListener('mousedown', event => {
        if (!isMapSearchOpen() || event.target === input || event.target.closest('#btn-search')) return;
        cancelMapSearchPendingFocus();
    }, true);
    $('#btn-search-visible').onclick = () => {
        if (mapSearchState.allTabs) return;
        mapSearchState.visibleOnly = !mapSearchState.visibleOnly;
        syncMapSearchScopeButton();
        executeMapSearch(input.value);
    };
    syncMapSearchScopeButton();

    // 原生高亮只设置 Range；监听重绘和正文异步渲染，不改动可编辑标题的 DOM。
    const highlightObserver = new MutationObserver(updateMapSearchHighlights);
    highlightObserver.observe($('#tree-root'), { childList: true, characterData: true, subtree: true });
    highlightObserver.observe(results, { childList: true, subtree: true });

    input.addEventListener('input', () => executeMapSearch(input.value));
    input.addEventListener('paste', event => {
        const clipboard = event.clipboardData;
        const customText = clipboard?.getData(CUSTOM_MIME_TYPE);
        const plainText = clipboard?.getData('text/plain');
        const text = customText || plainText;
        if (!text) return;

        try {
            const nodes = getMindMapClipboardNodes(JSON.parse(text));
            if (!nodes) return;
            event.preventDefault();
            pasteMindMapNodesToSelection(nodes);
        } catch (_) {
            // 私有剪贴板格式在部分浏览器只暴露占位文本，回退到既有异步读取流程。
            if (plainText?.startsWith('[MindMap Nodes:')) {
                event.preventDefault();
                void pasteNodesToSelection();
            }
        }
    });
    results.addEventListener('click', (event) => {
        const item = event.target.closest('[data-search-index]');
        if (item) locateMapSearchResult(Number(item.dataset.searchIndex));
    });
    panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeMapSearch();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            navigateMapSearch(event.shiftKey ? -1 : 1);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            navigateMapSearch(event.key === 'ArrowDown' ? 1 : -1);
        }
    });
    panel.addEventListener('mousedown', event => event.stopPropagation());
}

// !SECTION 搜索定位

