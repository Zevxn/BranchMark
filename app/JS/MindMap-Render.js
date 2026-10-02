// SECTION 选择样式与拖拽提交

function applyColorToMindMapSelection(color) {
    let changed = false;
    state.selectedIds.forEach(id => {
        const node = findNode(state.data, id);
        if (node && node.color !== color) {
            node.color = color;
            updateNodeDOM(node.id);
            changed = true;
        }
    });
    const summary = getMindMapSummaryById(state.selectedSummaryId);
    if (summary && summary.color !== color) {
        summary.color = color;
        scheduleRenderMindMapSummaries();
        changed = true;
    }
    return changed;
}

// 通用的应用颜色函数
function applyCustomColorToSelection (color, isFinalStep) {
    saveGlobalScrolls();
    applyColorToMindMapSelection(color);

    // 2. 关键修复：只要是最终步骤 (change事件)，强制检查并记录历史
    // 我们不再依赖上面的 if (n.color !== color) 判断，
    // 因为 input 事件可能已经提前把数据改掉了，导致这里判断为 false。
    // recordHistory() 内部会自动对比数据是否真的变了，所以这里强制调用是安全的。
    if (isFinalStep) {
        recordHistory();
    }
    restoreGlobalScrolls();
};


function onMouseUp(e) {
    if(state.mode==='IDLE') return;
    if(state.mode==='DRAGGING') {
        if(state.drag.targetId && state.drag.dropType) {
            let newDir = undefined;
            if(state.drag.targetId === state.data.id) {
                const rr = document.getElementById(`card-${state.data.id}`).getBoundingClientRect();
                newDir = (e.clientX < rr.left+rr.width/2) ? 'left' : 'right';
            }

            if(state.drag.source==='node') {
                const selectedNodes = state.selectedIds.has(state.drag.nodeId) ? Array.from(state.selectedIds) : [state.drag.nodeId];
                const nodes = getMindMapDragProcessingOrder(selectedNodes, state.drag.dropType);
                let changed = false;
                const parentsToUpdate = new Set();
                const isCopy = e.ctrlKey || e.altKey;

                nodes.forEach(id => {
                    if(id!==state.drag.targetId && !isDescendant(state.data, id, state.drag.targetId)) {
                        const p = findParent(state.data, id), t = findNode(state.data, state.drag.targetId), tp = findParent(state.data, state.drag.targetId);
                        if(p) {
                            if(isCopy) {
                                const cloned = deepCopyNode(findNode(state.data, id));
                                if(state.drag.targetId === state.data.id) cloned.dir = newDir;
                                else {
                                    if(state.drag.dropType !== 'CHILD') {
                                        const sibling = findNode(state.data, state.drag.targetId);
                                        cloned.dir = sibling.dir; 
                                    } else delete cloned.dir;
                                }
                                
                                if(state.drag.dropType==='CHILD') { 
                                    if(!t.children)t.children=[]; t.children.push(cloned); t.folded=false; 
                                    parentsToUpdate.add(t.id); 
                                } else { 
                                    const ti=tp.children.findIndex(c=>c.id===state.drag.targetId); 
                                    tp.children.splice(state.drag.dropType==='BEFORE'?ti:ti+1, 0, cloned); 
                                    parentsToUpdate.add(tp.id); 
                                }
                                invalidateMindMapNodeIndex();
                                changed = true;
                            } else {
                                const idx = p.children.findIndex(c=>c.id===id);
                                if(idx>-1) {
                                    const [mv] = p.children.splice(idx,1);
                                    invalidateMindMapNodeIndex();
                                    if(state.drag.targetId === state.data.id) mv.dir = newDir;
                                    else {
                                        if(state.drag.dropType !== 'CHILD') {
                                            const sibling = findNode(state.data, state.drag.targetId);
                                            mv.dir = sibling.dir;
                                        } else delete mv.dir; 
                                    }

                                    parentsToUpdate.add(p.id);
                                    if(state.drag.dropType==='CHILD') { if(!t.children)t.children=[]; t.children.push(mv); t.folded=false; parentsToUpdate.add(t.id); }
                                    else { const ti=tp.children.findIndex(c=>c.id===state.drag.targetId); tp.children.splice(state.drag.dropType==='BEFORE'?ti:ti+1, 0, mv); parentsToUpdate.add(tp.id); }
                                    invalidateMindMapNodeIndex();
                                    changed = true;
                                }
                            }
                        }
                    }
                });
                if(changed) { recordHistory(); parentsToUpdate.forEach(pid => updateChildrenDOM(pid)); } else renderTree();
            } else {
                let target = findNode(state.data, state.drag.targetId);
                let parent = findParent(state.data, state.drag.targetId);
                const newNode = {id:generateNodeId(), topic:state.drag.data.question, content:state.drag.data.answer, widthMode:'auto', heightMode:'auto'};
                
                if(state.drag.dropType === 'CHILD') {
                    if(state.drag.targetId === state.data.id) newNode.dir = newDir;
                    else delete newNode.dir;
                    
                    if(!target.children) target.children = [];
                    target.children.push(newNode);
                    invalidateMindMapNodeIndex();
                    target.folded = false;
                    recordHistory(); updateChildrenDOM(target.id);
                } else {
                    const idx = parent.children.findIndex(c => c.id === state.drag.targetId);
                    // 修复：Dock 兄弟节点继承方向
                    const sibling = findNode(state.data, state.drag.targetId);
                    newNode.dir = sibling.dir;
                    
                    parent.children.splice(state.drag.dropType === 'BEFORE' ? idx : idx + 1, 0, newNode);
                    invalidateMindMapNodeIndex();
                    recordHistory(); updateChildrenDOM(parent.id);
                }
                // 判断：没按 Ctrl 且有选中的 Dock 索引
                if (!e.ctrlKey && state.activeDockIndex !== -1) {
                    // 1. 找到对应的 DOM 元素
                    const cardToRemove = document.querySelector(`.dock-card[data-index="${state.activeDockIndex}"]`);
                    let delaytime=0;
                    if (cardToRemove) {
                        // 2. 【动画阶段】添加退出类，触发 CSS transition (变窄、变透明)
                        if (dockData.length > 1){
                            cardToRemove.classList.add('exiting');
                            delaytime=300;
                        }

                        // 3. 【延迟执行】等待 300ms 动画播放完毕
                        setTimeout(() => {
                            // --- A. 数据层操作 ---
                            dockData.splice(state.activeDockIndex, 1);
                            sessionStorage.setItem('DockData', JSON.stringify(dockData));

                            // --- B. 视图层操作 (关键修复) ---
                            // 动画播完了，物理移除 DOM 节点
                            cardToRemove.remove();

                            // --- C. 索引重置 (就是你提到的那个逻辑) ---
                            // 因为我们删了一个 DOM，后面的兄弟节点索引都乱了，必须手动修回来
                            // 这样做的好处是：不需要 renderDock()，不会重置滚动条位置！
                            const remainingCards = document.querySelectorAll('.dock-card');
                            remainingCards.forEach((card, i) => {
                                card.dataset.index = i; 
                            });

                            // --- D. 边界处理 ---
                            if (dockData.length === 0) {
                                document.getElementById('dock-container').style.display = 'none';
                            }
                            
                            // 重置状态
                            state.activeDockIndex = -1;
                        }, delaytime); 
                    } else {
                        // 容错处理
                        dockData.splice(state.activeDockIndex, 1);
                        sessionStorage.setItem('DockData', JSON.stringify(dockData));
                        renderDock();
                        state.activeDockIndex = -1;
                    }
                }
            }
        } else renderTree();
    }
    else if(state.mode==='SELECTING') {
        const b = $('#selRect').getBoundingClientRect();
        if(b.width>5) {
            document.querySelectorAll('.node-card').forEach(el=>{
                const r=el.getBoundingClientRect();
                if(!(r.right<b.left || r.left>b.right || r.bottom<b.top || r.top>b.bottom)) state.selectedIds.add(el.dataset.nodeId);
            });
            updateSelection();
        }
        $('#selRect').style.display='none';
    }
    else if(state.mode==='RESIZING') {
        const card = state.resize.element || getMindMapResizableElement(state.resize.node, state.resize.kind || 'node');
        if(card) card.classList.remove('no-trans');
        state.resize.node=null;
        recordHistory();
        stabilizeRoot(); // <--- 【核心修改】在这里加上它！
        scheduleRenderMindMapRelations();
        scheduleRenderMindMapSummaries();
    }
    else if(state.mode==='PANNING' && Math.hypot(e.clientX-state.startPos.x, e.clientY-state.startPos.y)<5) { state.selectedIds.clear(); updateSelection(); }

    state.mode = 'IDLE'; $('#ghostNode').style.display='none'; $('#insertLine').style.display='none'; 
    document.body.classList.remove('is-dragging'); // [新增] 移除抓取手势样式
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    document.querySelectorAll('.is-dragging-original').forEach(el => el.classList.remove('is-dragging-original'));
    updateTransform();
};

function syncCurrentInput() {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.classList.contains('node-topic')) {
        const card = activeEl.closest('.node-card');
        if(card) {
            const node = findNode(state.data, card.dataset.nodeId);
            if(node && node.topic !== activeEl.innerText) node.topic = activeEl.innerText;
        }
    }
};

function commitMindMapInlineEditor() {
    syncCurrentInput();
    const activeEl = document.activeElement;
    if (activeEl?.matches('.node-topic, .summary-topic')) {
        activeEl.blur();
    }
}

// !SECTION 选择样式与拖拽提交
// SECTION 存储与历史记录
function saveGlobalScrolls() {
    state.scrollMap = new Map(Object.entries(sanitizeMindMapScrollMap(state.scrollMap, state.data)));
    document.querySelectorAll('.card-body').forEach(el => {
        const card = el.closest('.node-card');
        if (!card) return;
        const nodeId = card.dataset.nodeId;
        const scrollTop = Number(el.scrollTop);
        if (Number.isFinite(scrollTop) && scrollTop > 0) state.scrollMap.set(nodeId, scrollTop);
        else state.scrollMap.delete(nodeId);
    });
};

function restoreGlobalScrolls() {
    const restore = () => {
        document.querySelectorAll('.card-body').forEach(el => {
            const card = el.closest('.node-card');
            if(card && state.scrollMap.has(card.dataset.nodeId)) {
                el.scrollTop = state.scrollMap.get(card.dataset.nodeId);
            }
        });
    };
    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 50);
};

function saveStorage() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        persistMindMapWorkbookSession();
        console.log('MindMap 操作保存');
    }, 2000);
    const currentFileID = sessionStorage.getItem('currentFileID');
    if (currentFileID){
        clearTimeout(saveToCloudTimer);
        saveToCloudTimer = setTimeout(() => {
            saveMindMapData(true,false);
        },20*1000)
    }
    
};

function recordHistory() {
    if(isUndoRedo) return;
    const s = JSON.stringify(state.data);
    if(state.historyIndex === -1 || s !== state.history[state.historyIndex]) {
        if(state.historyIndex < state.history.length - 1) state.history.splice(state.historyIndex + 1);
        state.history.push(s); state.historyIndex++;
        if(state.history.length > 50) { state.history.shift(); state.historyIndex--; }
        saveStorage(); updateToolbar();
    }
};

function restoreHistory() {
    isUndoRedo = true; 
    const prevDataStr = state.history[state.historyIndex];
    const prevData = JSON.parse(prevDataStr);
    
    // --- 智能防抖优化 ---
    // 计算：如果当前结构和历史结构只有 "color" 属性不同，则不重建 DOM
    // 我们通过正则把 color 字段去掉后对比字符串来实现快速检查
    const currentStrNoColor = JSON.stringify(state.data).replace(/"color":".*?",/g, '');
    const prevStrNoColor = prevDataStr.replace(/"color":".*?",/g, '');

    const isStructureSame = currentStrNoColor === prevStrNoColor;

    // 更新数据
    state.data = prevData;
    state.selectedIds.clear(); 
    state.selectedRelationId = null;
    state.selectedSummaryId = null;
    closeMindMapRelationEditor();
    
    if (isStructureSame) {
        // 情况 A：仅颜色变化 -> 使用无损更新
        updateTreeStyle(); 
        updateSelection(); // 恢复选中框
    } else {
        // 情况 B：结构变化 (增删节点/改文字) -> 必须重建
        renderTree(); 
    }

    updateToolbar(); 
    saveStorage();
    setTimeout(() => isUndoRedo = false, 0);
};
function undo() { if(state.historyIndex > 0) { state.historyIndex--; restoreHistory(); } };
function redo() { if(state.historyIndex < state.history.length - 1) { state.historyIndex++; restoreHistory(); } };

// !SECTION 存储与历史记录
// SECTION 节点渲染与视图更新
function isTemporarilyCollapsed(node) {
    return Boolean(
        state.compactView &&
        node &&
        !node.isSimple &&
        node.content &&
        node.topic &&
        node.topic.trim()
    );
}

function getMindMapResizeHandlesHTML() {
    return '<div class="resize-handle resize-l" data-resize="w"></div>'
        + '<div class="resize-handle resize-r" data-resize="w"></div>'
        + '<div class="resize-handle resize-b" data-resize="h"></div>'
        + '<div class="resize-handle resize-bl" data-resize="wh"></div>'
        + '<div class="resize-handle resize-br" data-resize="wh"></div>';
}

function createMindMapNodeContentBodyHTML(content, style = '') {
    return `<div class="card-body md-content" style="${style}">${renderMarkdown(content)}</div>`;
}

function toggleMindMapEntitySimpleMode(entity) {
    entity.isSimple = !entity.isSimple;
    entity.heightMode = 'auto';
    if (entity.isSimple) {
        entity.widthMode = 'manual';
        if (!entity.width) entity.width = 400;
        if (!entity.bodyHeight) entity.bodyHeight = 220;
    } else {
        entity.widthMode = 'auto';
    }
}

function getMindMapResizableElement(target, kind = 'node') {
    if (!target) return null;
    return kind === 'summary'
        ? document.querySelector(`.summary-editor[data-summary-id="${target.id}"]`)
        : document.getElementById(`card-${target.id}`);
}

function getMindMapResizeTarget(element) {
    const summaryEditor = element?.closest('.summary-editor');
    if (summaryEditor) {
        const summary = getMindMapSummaryById(summaryEditor.dataset.summaryId);
        return summary ? { entity: summary, kind: 'summary' } : null;
    }
    const card = element?.closest('.node-card');
    if (!card) return null;
    const node = findNode(state.data, card.dataset.nodeId);
    return node ? { entity: node, kind: 'node' } : null;
}

function autoFitMindMapEntity(target, kind = 'node', direction = 'wh') {
    if (!target) return;
    // 双击手柄会触发局部 DOM 更新，先同步未失焦的 topic，避免新输入被旧数据覆盖。
    syncCurrentInput();
    if (direction.includes('w')) target.widthMode = 'auto';
    if (direction.includes('h')) target.heightMode = 'auto';
    recordHistory();
    if (kind === 'summary') scheduleRenderMindMapSummaries();
    else updateNodeDOM(target.id);
}

function beginMindMapResize(event, target, kind, element) {
    if (!target || !element) return;
    const heightElement = getMindMapEntityHeightElement(target, kind, element);
    const body = heightElement === element ? null : heightElement;
    const minWidth = getMindMapEntityMinWidth(element);
    const minHeight = getMindMapEntityMinHeight(target, kind, element);
    state.mode = 'RESIZING';
    state.resize = {
        node: target,
        kind,
        element,
        dir: event.target.dataset.resize,
        handleEl: event.target,
        startW: element.offsetWidth,
        startH: body ? body.offsetHeight : element.offsetHeight,
        minWidth,
        minHeight,
        widthPointerFactor: getMindMapResizePointerFactor(kind, element, 'width'),
        heightPointerFactor: getMindMapResizePointerFactor(kind, element, 'height'),
        heightPointerDirection: getMindMapResizeHeightDirection(kind, element),
        mx: event.clientX,
        my: event.clientY,
        startViewTy: state.view.ty
    };
    element.classList.add('no-trans');
    event.preventDefault();
    event.stopPropagation();
}

function getMindMapResizePointerFactor(kind, element, axis) {
    if (kind !== 'summary' || !element?.classList.contains('horizontal')) {
        return axis === 'height' ? 2 : 1;
    }
    // 横向总结卡片以 X 轴中心定位，宽度每增加 2px，右侧手柄只移动 1px；
    // 高度则由靠近括号的一侧锚定，手柄与高度保持 1:1。
    return axis === 'width' ? 2 : 1;
}

function getMindMapResizeHeightDirection(kind, element) {
    // 顶部总结卡片的底边与括号锚定，因此把高度手柄放在自由的顶边；
    // 向上拖动（负 delta）应增加高度。
    return kind === 'summary'
        && element?.classList.contains('horizontal')
        && element.classList.contains('placement-top')
        ? -1
        : 1;
}

function getMindMapEntityHeightElement(target, kind, element) {
    if (!target || !element || target.isSimple) return element;
    return element.querySelector(kind === 'summary' ? '.summary-card-body' : '.card-body') || element;
}

function getMindMapEntityMinHeight(target, kind, element) {
    const heightElement = getMindMapEntityHeightElement(target, kind, element);
    const minHeight = Number.parseFloat(window.getComputedStyle(heightElement).minHeight);
    return Number.isFinite(minHeight) ? minHeight : 0;
}

function getMindMapEntityMinWidth(element) {
    const minWidth = Number.parseFloat(window.getComputedStyle(element).minWidth);
    return Number.isFinite(minWidth) ? minWidth : MINDMAP_CARD_MIN_WIDTH;
}

function applyMindMapEntitySize(target, kind, width, height, sourceIsSimple) {
    const element = getMindMapResizableElement(target, kind);
    if (!element) return;
    if (width !== null) {
        const safeWidth = Math.max(getMindMapEntityMinWidth(element), width);
        target.width = safeWidth;
        target.widthMode = 'manual';
        element.style.width = `${safeWidth}px`;
    }
    if (height === null || Boolean(target.isSimple) !== Boolean(sourceIsSimple)) return;
    const safeHeight = Math.max(getMindMapEntityMinHeight(target, kind, element), height);
    target.bodyHeight = safeHeight;
    target.heightMode = 'manual';
    if (target.isSimple) {
        element.style.height = `${safeHeight}px`;
        return;
    }
    const body = element.querySelector(kind === 'summary' ? '.summary-card-body' : '.card-body');
    if (body) body.style.height = `${safeHeight}px`;
    element.style.height = 'auto';
}

function createNodeHTML(node, isLeft, inheritedColor = null, includeChildren = true) {
    const isSelected = state.selectedIds.has(node.id);
    const isRoot = node.id === state.data.id;
    const isSimple = !!node.isSimple && !isRoot;
    const isTopicEmpty = !node.topic || node.topic.trim() === ''; 
    
    // --- 颜色逻辑修复 ---
    // 优先级：彩虹模式(计算值) > 手动设置颜色 > 默认无色
    let displayColor = node.color; 
    if (state.rainbowMode) {
        if (isRoot) displayColor = ''; 
        else if (inheritedColor) displayColor = inheritedColor; 
    }

    const hasContent = !!node.content;
    const hasChildren = node.children && node.children.length > 0;
    const areChildrenVisible = !node.folded || isMapNodeTemporarilyExpanded(node.id);
    const isCompactCollapsed = isTemporarilyCollapsed(node);
    const isContentCollapsed = Boolean(node.contentCollapsed || isCompactCollapsed);
    const relationCount = getMindMapRelatedCardItems(node.id).length;
    // const cardClass = `node-card ${isSelected?'selected':''} ${hasContent?'has-content':''} ${isSimple?'simple':''} ${isLeft?'left-side':''} ${isRoot?'is-root':''}`;
    const cardClass = `node-card ${isSelected?'selected':''} ${hasContent?'has-content':''} ${isContentCollapsed?'content-collapsed':''} ${isSimple?'simple':''} ${isLeft?'left-side':''} ${isRoot?'is-root':''} ${isTopicEmpty?'topic-empty':''}`;
    // --- 尺寸样式 ---
    let cardStyle = '';
    
    // 宽度
    if (!isContentCollapsed && node.widthMode === 'manual' && node.width) {
        cardStyle += `width:${node.width}px; `;
    } else {
        cardStyle += `width:fit-content; `; // 标准模式自动宽度
    }

    // 高度
    let bodyHeightStyle = '';
    if (isSimple) {
        // 便利贴：高度在 Card 上
        if (node.heightMode === 'manual' && node.bodyHeight) {
            cardStyle += `height:${node.bodyHeight}px; `;
        } else {
            // 配合 CSS max-height: 400px;
            cardStyle += `height:auto; `;
        }
    } else {
        // 标准卡片：高度在 Body 上
        bodyHeightStyle = node.heightMode==='manual' && node.bodyHeight ? `height:${node.bodyHeight}px;` : 'height:auto;';
    }

    // --- 颜色样式应用 ---
    let headerStyle = '';
    let bodyBgStyle = '';
    const safeColor = displayColor || 'var(--node-default-color)';
    cardStyle += `--node-color: ${safeColor}; `
    if (displayColor) {
        // 取 90% 的卡片底色(通常是白) + 10% 的选中颜色进行混合
        // 兼容性：Chrome 111+ 支持，扩展环境没问题
        const mixRatio = isSimple ? '15%' : 'var(--bg-mix-ratio)';
        const lightBg = `color-mix(in srgb, ${displayColor}, var(--card-bg) ${mixRatio})`;

        if (isSimple) {
            // 【便利贴模式】
            // 背景变淡，边框变深(原色)，文字用默认色
            cardStyle += `background:${lightBg} !important; border-color:${displayColor}; color:var(--text-color);`; 
        } else {
            // 【标准卡片模式】
            // 1. 整个卡片背景变淡 (这样 Body 就有颜色了)
            cardStyle += `background-color:${lightBg}; border-color:${displayColor};`;
            
            // 2. 头部保持实色 (深色背景)，文字变白(或由CSS控制反色)
            headerStyle = `background:${displayColor} !important; border-bottom-color:rgba(0,0,0,0.1);`;
            
            // 3. 强制 Body 透明，以便显示出 Card 的淡色背景
            bodyBgStyle = 'background: transparent !important;';
        }
    }

    const bodyContent = (hasContent && !isContentCollapsed && !isSimple)
        ? createMindMapNodeContentBodyHTML(node.content, `${bodyHeightStyle} ${bodyBgStyle}`)
        : '';
    const toggleIcon = isSimple ? 'ri-layout-top-2-line' : 'ri-sticky-note-line';
    const toggleTitle = isSimple ? '切换回标准卡片' : '切换为便利贴模式';
    const hasFloatingTools = relationCount > 0
        || !isRoot
        || (hasContent && !isContentCollapsed && !isSimple)
        || (hasContent && !isSimple && !isCompactCollapsed);

    let childrenHTML = '';
    // 单卡更新只生成当前卡片；折叠按钮仍按真实子节点与展开状态生成。
    if(includeChildren && hasChildren && areChildrenVisible) {
        childrenHTML = `<div class="children-container ${isLeft?'left-side':''}" id="children-${node.id}">
            ${node.children.map(child => {
                let nextColor = null;
                if (state.rainbowMode) {
                     if (isRoot) {
                        const hue = getStableHue(child.id);
                        nextColor = `hsl(${hue}, 85%, 88%)`;
                    } else {
                        if (displayColor) nextColor = darkenHSL(displayColor, 5);
                    }
                }
                return `<div class="child-unit ${isLeft?'left-side':''}"><div class="child-cross-line"></div>${createNodeHTML(child, isLeft, nextColor)}</div>`;
            }).join('')}
        </div>`;
    }

    // 修复：确保左侧节点也有正确的 Resize 手柄 (左边 resize-l, 左下角 resize-bl)
    const resizeHandles = (isSimple || (hasContent && !isContentCollapsed))
        ? getMindMapResizeHandlesHTML()
        : '';

    const foldBtn = (!isRoot && hasChildren) ? 
        `<div class="fold-btn ${areChildrenVisible?'has-children':''} ${isLeft?'left-side':''}" data-action="fold"><i class="${areChildrenVisible?'ri-subtract-line':'ri-add-line'}"></i></div>` : '';

    const dataColorAttr = (state.rainbowMode && displayColor) ? `data-rainbow-color="${displayColor}"` : '';

    // 注意：便利贴模式下 header 必须包含内容以便显示和拖拽
    return `<div class="node-wrapper ${isLeft?'left-side':''}" id="wrapper-${node.id}">
        <div class="${cardClass}" style="${cardStyle}" data-node-id="${node.id}" id="card-${node.id}" ${dataColorAttr}>
            <div class="card-header" style="${headerStyle}">
                <div class="topic-wrapper">
                    ${hasContent && isContentCollapsed ? '<i class="ri-file-list-2-line content-indicator"></i>' : ''}
                    <span class="node-topic" contenteditable="true">${escapeHtml(node.topic)}</span>
                </div>
            </div>
            ${hasFloatingTools ? `<div class="header-tools card-floating-tools">
                <button class="tool-icon relation-navigation-trigger" type="button" data-action="navigate-relation" title="查看关联卡片（${relationCount}）" aria-label="查看关联卡片" ${relationCount > 0 ? '' : 'hidden'}><i class="ri-links-line" aria-hidden="true"></i></button>
                ${!isRoot ? `<i class="tool-icon ${toggleIcon}" data-action="toggle-simple" title="${toggleTitle}"></i>` : ''}
                ${hasContent && !isContentCollapsed && !isSimple ? `<i class="ri-aspect-ratio-line tool-icon" data-action="auto-height" title="自适应尺寸"></i>` : ''}
                ${hasContent && !isSimple && !isCompactCollapsed ? `<i class="tool-icon ${node.contentCollapsed?'ri-arrow-down-s-line':'ri-arrow-up-s-line'}" data-action="toggle-content"></i>` : ''}
            </div>` : ''}
            ${bodyContent}
            ${resizeHandles}
            ${foldBtn}
        </div>
        ${childrenHTML}
    </div>`;
}
function renderTree() {
    hideMindMapContentPreview();
    closeMindMapRelationNavigationMenu();
    if (skipNextGlobalScrollCapture) skipNextGlobalScrollCapture = false;
    else saveGlobalScrolls();
    const root = state.data;
    const leftKids = (root.children || []).filter(c => c.dir === 'left');
    const rightKids = (root.children || []).filter(c => c.dir !== 'left');
    const isLeftVisible = !root.foldedLeft || isMapRootDirectionTemporarilyExpanded('left');
    const isRightVisible = !root.foldedRight || isMapRootDirectionTemporarilyExpanded('right');
    // 左右分支在下方分别生成，根卡片无需重复生成整棵子树。
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = createNodeHTML(root, false, null, false); // Root 没颜色
    const rootCardEl = tempDiv.querySelector('.node-card');
    
    // ... (中间 fold-btn 逻辑保持不变) ...
    if(leftKids.length > 0) {
        const btn = document.createElement('div');
        btn.className = `fold-btn root-left ${isLeftVisible?'has-children':''}`;
        btn.dataset.action = 'fold-root-left';
        btn.innerHTML = `<i class="${isLeftVisible?'ri-subtract-line':'ri-add-line'}"></i>`;
        rootCardEl.appendChild(btn);
    }
    if(rightKids.length > 0) {
        const btn = document.createElement('div');
        btn.className = `fold-btn root-right ${isRightVisible?'has-children':''}`;
        btn.dataset.action = 'fold-root-right';
        btn.innerHTML = `<i class="${isRightVisible?'ri-subtract-line':'ri-add-line'}"></i>`;
        rootCardEl.appendChild(btn);
    }
    const rootCard = rootCardEl.outerHTML;

    const leftHTML = (leftKids.length > 0 && isLeftVisible) ?
        `<div class="children-container left-side">${leftKids.map(c => {
            // ▼▼▼ 修改：直接根据 ID 获取固定颜色 ▼▼▼
            const hue = state.rainbowMode ? getStableHue(c.id) : 0;
            const color = state.rainbowMode ? `hsl(${hue}, 85%, 88%)` : null;
            
            return `<div class="child-unit left-side"><div class="child-cross-line"></div>${createNodeHTML(c, true, color)}</div>`;
        }).join('')}</div>` : '';
    
    const rightHTML = (rightKids.length > 0 && isRightVisible) ?
        `<div class="children-container">${rightKids.map(c => {
            // ▼▼▼ 修改：直接根据 ID 获取固定颜色 ▼▼▼
            const hue = state.rainbowMode ? getStableHue(c.id) : 0;
            const color = state.rainbowMode ? `hsl(${hue}, 85%, 88%)` : null;

            return `<div class="child-unit"><div class="child-cross-line"></div>${createNodeHTML(c, false, color)}</div>`;
        }).join('')}</div>` : '';

    $('#tree-root').innerHTML = `<div class="root-wrapper" style="display:flex; align-items:center;">${leftHTML}${rootCard}${rightHTML}</div>`;
    // --- 新增：初始化内容指纹，防止首次操作抖动 ---
    document.querySelectorAll('.node-card').forEach(el => {
        const n = findNode(state.data, el.dataset.nodeId);
        if(n) el.dataset.contentHash = n.content || '';
    });
    $('#tree-root').querySelectorAll('.card-body').forEach(processRichContent);
    // 同步内容处理完成后再测量，避免使用公式、高亮处理前的卡片尺寸。
    stabilizeRoot();
    restoreGlobalScrolls();
    updateTransform(); 
    scheduleRenderMindMapRelations();
    scheduleRenderMindMapSummaries();
    if (window.rootObserver) {
        window.rootObserver.disconnect();
    }

    // 2. 创建新的监听器
    // 只要根节点的 DOM 尺寸发生任何自然变化（字体加载、图片加载），就自动归位
    window.rootObserver = new ResizeObserver(() => {
        // 仅调整 transform，不改变被观察元素的尺寸，可在本次绘制前直接归位。
        stabilizeRoot();
        scheduleRenderMindMapRelations();
        scheduleRenderMindMapSummaries();
    });

    // 3. 开始监听根节点包装器
    const rootWrapper = document.querySelector('.root-wrapper');
    if (rootWrapper) {
        window.rootObserver.observe(rootWrapper);
    }
    
    updateToolbar();
    refreshVisibleMapSearchResults();
};

function isDescendantOfLeft(id) {
    const index = getMindMapNodeIndex();
    if (!index.hasDuplicateIds && !Number.isNaN(id)) return index.branchById.get(id) === 'left';
    // 旧数据可能包含重复 ID，此时保留原有查找与父链判断规则。
    let curr = findNode(state.data, id);
    while(curr) {
        const p = findParent(state.data, curr.id);
        if(!p) return false; 
        if(p.id === state.data.id) return curr.dir === 'left';
        curr = p;
    }
    return false;
};

function updateChildrenDOM(nodeId) {
    if(nodeId === state.data.id) { renderTree(); return; }

    saveGlobalScrolls();
    const node = findNode(state.data, nodeId);
    const wrapper = document.getElementById(`wrapper-${nodeId}`);
    const isLeft = isDescendantOfLeft(nodeId);
    
    if(!wrapper) { renderTree(); return; }

    // --- ▼▼▼ 修正：从 data 属性读取 HSL 颜色 ▼▼▼ ---
    let childBaseColor = null;
    if (state.rainbowMode) {
        const parentCard = document.getElementById(`card-${nodeId}`);
        if (parentCard && parentCard.dataset.rainbowColor) {
            // 读取父级的 HSL
            const parentHsl = parentCard.dataset.rainbowColor;
            // 关键：因为是传给子节点，所以要先降低一次亮度！
            childBaseColor = darkenHSL(parentHsl, 5);
        }
    }
    // ----------------------------------------------

    const oldCont = wrapper.querySelector('.children-container');
    if(oldCont) oldCont.remove();

    const card = document.getElementById(`card-${nodeId}`);
    let foldBtn = card.querySelector('.fold-btn');
    const areChildrenVisible = !node.folded || isMapNodeTemporarilyExpanded(node.id);
    
    if(node.children && node.children.length > 0) {
        if(!foldBtn) {
            foldBtn = document.createElement('div');
            foldBtn.className = `fold-btn ${areChildrenVisible?'has-children':''} ${isLeft?'left-side':''}`;
            foldBtn.dataset.action = 'fold';
            foldBtn.innerHTML = `<i class="${areChildrenVisible?'ri-subtract-line':'ri-add-line'}"></i>`;
            card.appendChild(foldBtn);
        } else {
            foldBtn.className = `fold-btn ${areChildrenVisible?'has-children':''} ${isLeft?'left-side':''}`;
            foldBtn.innerHTML = `<i class="${areChildrenVisible?'ri-subtract-line':'ri-add-line'}"></i>`;
        }
        if(areChildrenVisible) {
            const childrenHTML = `<div class="children-container ${isLeft?'left-side':''}" id="children-${node.id}">
                ${node.children.map(child => `
                    <div class="child-unit ${isLeft?'left-side':''}">
                        <div class="child-cross-line"></div>
                        ${createNodeHTML(child, isLeft, childBaseColor)} 
                    </div>
                `).join('')}
            </div>`;
            
            wrapper.insertAdjacentHTML('beforeend', childrenHTML);
            const newCont = wrapper.querySelector('.children-container');
            newCont.querySelectorAll('.card-body').forEach(processRichContent);
        }
    } else if(foldBtn) { foldBtn.remove(); }
    
    stabilizeRoot();
    restoreGlobalScrolls();
    scheduleRenderMindMapRelations();
    scheduleRenderMindMapSummaries();
    updateMindMapNodeStats();
    refreshVisibleMapSearchResults();
};

function updateNodeDOM(nodeId) {
    if (mindMapContentPreviewState.card?.dataset.nodeId === nodeId) hideMindMapContentPreview();
    if(nodeId === state.data.id) { renderTree(); return; }
    
    saveGlobalScrolls();
    const node = findNode(state.data, nodeId);
    const card = document.getElementById(`card-${nodeId}`); 
    if(!node || !card) return;
    
    // 1. 生成新虚拟节点
    let selfColor = null;
    if (state.rainbowMode && card.dataset.rainbowColor) {
        selfColor = card.dataset.rainbowColor;
    }
    const isLeft = isDescendantOfLeft(node.id);
    const temp = document.createElement('div');
    temp.innerHTML = createNodeHTML(node, isLeft, selfColor, false);
    const newCard = temp.querySelector('.node-card'); 

    // 2. 检查结构变化
    const oldSimple = card.classList.contains('simple');
    const newSimple = newCard.classList.contains('simple');
    const oldHasBody = !!card.querySelector('.card-body');
    const newHasBody = !!newCard.querySelector('.card-body');

    if (oldSimple !== newSimple || oldHasBody !== newHasBody) {
         // 结构大变，直接替换 DOM
         const parent = card.parentElement;
         const childrenCont = parent.querySelector('.children-container');
         parent.replaceChild(newCard, card);
         if(childrenCont) parent.appendChild(childrenCont); 
         newCard.querySelectorAll('.card-body').forEach(processRichContent);
         
         const finalCard = document.getElementById(`card-${nodeId}`);
         if(finalCard) finalCard.dataset.contentHash = node.content || '';
    } 
    else {
         // --- 仅样式同步 (修复颜色更新) ---
         
         // A. 同步容器属性 (包含便利贴的 background)
         card.className = newCard.className;
         card.style.cssText = newCard.style.cssText; // 这里会同步 background: color !important
         if(newCard.dataset.rainbowColor) card.dataset.rainbowColor = newCard.dataset.rainbowColor;

         // B. 同步头部样式 (包含标准卡片的 background)
         const oldHeader = card.querySelector('.card-header');
         const newHeader = newCard.querySelector('.card-header');
         if (oldHeader && newHeader) {
             // 关键：同步 style.cssText 会把 headerStyle (背景色) 拷过去
             oldHeader.style.cssText = newHeader.style.cssText;
             oldHeader.className = newHeader.className;
             
            //  if (oldHeader.innerHTML !== newHeader.innerHTML) {
            //      const oldTopic = oldHeader.querySelector('.node-topic').innerText;
            //      if (oldTopic !== node.topic) {
            //         oldHeader.querySelector('.node-topic').innerText = node.topic;
            //      }
            //  }
             // 核心修复：如果 HTML 结构不一致（意味着可能有脏 DOM 标签），且当前没有在该节点打字，
             // 则强制用“干净”的 HTML 替换整个 Header 内容。
            if (oldHeader.innerHTML !== newHeader.innerHTML) {
                // 检查当前焦点是否在当前卡片内 (防止打字时被强制替换导致断触)
                const isActive = document.activeElement && document.activeElement.closest('.node-card') === card;
                
                if (!isActive) {
                    // 没在编辑：直接替换整个 innerHTML，清洗掉 contenteditable 产生的 <br> 和 <div>
                    oldHeader.innerHTML = newHeader.innerHTML;
                } else {
                    // 正在编辑：退回旧逻辑，只更新文本，保留光标位置
                    const oldTopic = oldHeader.querySelector('.node-topic').innerText;
                    if (oldTopic !== node.topic) {
                    oldHeader.querySelector('.node-topic').innerText = node.topic;
                    }
                }
            }
         }

         // C. 同步 Body 内容
         if (newHasBody) { 
             const oldBody = card.querySelector('.card-body');
             const newBody = newCard.querySelector('.card-body');
             const lastContent = card.dataset.contentHash; 
             
             if (lastContent !== node.content) {
                 oldBody.innerHTML = newBody.innerHTML;
                 oldBody.style.cssText = newBody.style.cssText;
                 processRichContent(oldBody);
                 card.dataset.contentHash = node.content || '';
             } else {
                 oldBody.style.cssText = newBody.style.cssText;
             }
         }
    }
    const finalCard = document.getElementById(`card-${nodeId}`);
    if (finalCard) {
        // 获取最新的节点数据
        const finalNode = findNode(state.data, nodeId);
        if (finalNode) {
            if (!finalNode.topic || finalNode.topic.trim() === '') {
                finalCard.classList.add('topic-empty');
            } else {
                finalCard.classList.remove('topic-empty');
            }
        }
    }
    stabilizeRoot();
    restoreGlobalScrolls();
    scheduleRenderMindMapRelations();
    scheduleRenderMindMapSummaries();
}
// 修复：暴力清除高亮后重新添加，防止高亮卡死
function updateSelection() {
    document.querySelectorAll('.node-card.selected').forEach(el => el.classList.remove('selected'));
    state.selectedIds.forEach(id => {
        const el = document.querySelector(`.node-card[data-node-id="${id}"]`);
        if(el) el.classList.add('selected');
    });
    updateMindMapSummaryMemberHighlights();
    updateMindMapSummarySelectionAction();
    updateToolbar();
};

function updateMindMapSummaryMemberHighlights() {
    document.querySelectorAll('.node-card.summary-member').forEach(card => {
        card.classList.remove('summary-member');
    });
    const summary = getMindMapSummaryById(state.selectedSummaryId);
    if (!summary || !Array.isArray(summary.nodeIds)) return;
    summary.nodeIds.forEach(nodeId => {
        document.getElementById(`card-${nodeId}`)?.classList.add('summary-member');
    });
}

function renderDock() {
    // const container = $('#dock-container');
    const container = document.getElementById('dock-container');
    if (dockData.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    $('#dock-body').innerHTML = ''; // 清空旧内容
    $('#dock-body').innerHTML = dockData.map((item, idx) => `
        <div class="dock-card ${state.activeDockIndex===idx?'active':''}" data-index="${idx}">
            <div class="dock-title">${escapeHtml(item.question)}</div>
            <div class="dock-desc md-content">${renderMarkdown(item.answer)}</div>
        </div>
    `).join('');
    $('#dock-body').querySelectorAll('.dock-desc').forEach(processRichContent);
    const arrow = $('#dock-arrow');
    if (state.dockCollapsed) { container.classList.add('collapsed'); arrow.className = 'ri-arrow-up-s-line'; }
    else { container.classList.remove('collapsed'); arrow.className = 'ri-arrow-down-s-line'; }
};

function updateTransform() {
    $('#canvas-layer').style.transform = `translate(${state.view.tx}px, ${state.view.ty}px) scale(${state.view.scale})`;
    $('#app').className = state.mode==='PANNING'?'cursor-grabbing':(state.mode==='SELECTING'?'cursor-crosshair':'cursor-grab');
    updateMindMapSummarySelectionAction();
};

function updateToolbar() {
    const hasSel = state.selectedIds.size > 0;
    const hasRelation = Boolean(state.selectedRelationId);
    const hasSummary = Boolean(state.selectedSummaryId);
    $('#btn-add-child').disabled = !hasSel;
    $('#btn-add-sibling').disabled = !hasSel;
    $('#btn-add-relation').disabled = state.selectedIds.size !== 2;
    $('#btn-add-summary').disabled = !getMindMapSummarySelection();
    $('#btn-delete').disabled = !hasSel && !hasRelation && !hasSummary;
    $('#btn-delete').title = hasRelation ? '删除关联' : (hasSummary ? '删除总结' : '删除卡片');
    $('#btn-undo').disabled = state.historyIndex <= 0; $('#btn-redo').disabled = state.historyIndex >= state.history.length - 1;
    $('#btn-color').disabled = (!hasSel && !hasSummary) || (hasSel && state.rainbowMode);
    $('#btn-color').title = hasSummary ? '设置总结颜色' : '设置卡片颜色';

    const compactButton = $('#btn-compact-view');
    if (compactButton) {
        compactButton.classList.toggle('primary', state.compactView);
        compactButton.setAttribute('aria-pressed', String(state.compactView));
        compactButton.title = state.compactView
            ? '退出精简视图'
            : '开启精简视图，仅本次运行有效';
        compactButton.querySelector('i').className = state.compactView
            ? 'ri-menu-unfold-line'
            : 'ri-menu-fold-line';
    }
    updateMindMapNodeStats();
};

function getMindMapNodeStats() {
    const total = getMindMapNodeIndex().nodeById.size;
    if (state.selectedIds.size !== 1) return { total, children: null, siblings: null };

    const nodeId = Array.from(state.selectedIds)[0];
    const node = findNode(state.data, nodeId);
    if (!node) return { total, children: null, siblings: null };
    const parent = findParent(state.data, nodeId);
    return {
        total,
        children: Array.isArray(node.children) ? node.children.length : 0,
        siblings: parent && Array.isArray(parent.children) ? Math.max(0, parent.children.length - 1) : 0
    };
}

function updateMindMapNodeStats() {
    const totalElement = $('#nodeStatsTotal');
    const childrenElement = $('#nodeStatsChildren');
    const siblingsElement = $('#nodeStatsSiblings');
    if (!totalElement || !childrenElement || !siblingsElement) return;
    const stats = getMindMapNodeStats();
    totalElement.textContent = String(stats.total);
    childrenElement.textContent = stats.children === null ? '—' : String(stats.children);
    siblingsElement.textContent = stats.siblings === null ? '—' : String(stats.siblings);
}

// SECTION 节点查询索引
let cachedMindMapNodeIndex = null;

function invalidateMindMapNodeIndex() {
    cachedMindMapNodeIndex = null;
}

function getMindMapNodeIndex() {
    const root = state.data;
    // 根对象替换覆盖导入、撤销/重做及页面切换；原地增删和移动需显式失效。
    if (cachedMindMapNodeIndex?.root === root) return cachedMindMapNodeIndex;

    const nodeById = new Map();
    const parentById = new Map();
    const branchById = new Map();
    let hasDuplicateIds = false;
    const pending = [{ node: root, parent: null, branch: null }];
    while (pending.length > 0) {
        const { node, parent, branch } = pending.pop();
        if (nodeById.has(node.id)) {
            hasDuplicateIds = true;
        } else {
            nodeById.set(node.id, node);
            branchById.set(node.id, branch);
        }
        if (parent && !parentById.has(node.id)) parentById.set(node.id, parent);
        const children = node.children || [];
        // 反向压栈保持原有深度优先顺序，不受折叠或搜索临时展开状态影响。
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];
            pending.push({
                node: child,
                parent: node,
                branch: parent ? branch : (child.dir === 'left' ? 'left' : 'right')
            });
        }
    }
    cachedMindMapNodeIndex = { root, nodeById, parentById, branchById, hasDuplicateIds };
    return cachedMindMapNodeIndex;
}

function findNode(r,id) {
    if (r === state.data && !Number.isNaN(id)) {
        const index = getMindMapNodeIndex();
        if (!index.hasDuplicateIds) return index.nodeById.get(id) || null;
    }
    if(r.id===id)return r;
    if(r.children)for(let c of r.children){const res=findNode(c,id);if(res)return res}
    return null;
};
function findParent(r,id) {
    if (r === state.data && !Number.isNaN(id)) {
        const index = getMindMapNodeIndex();
        if (!index.hasDuplicateIds) return index.parentById.get(id) || null;
    }
    if(!r.children)return null;
    for(let c of r.children){
        if(c.id===id)return r;
        const res=findParent(c,id);
        if(res)return res;
    }
    return null;
};
// !SECTION 节点查询索引
function isDescendant(r,nid,tid) {
    const n=findNode(r,nid);
    if(!n)return false;
    const chk=nd=>{
        if(!nd.children)return false;
        for(let c of nd.children){
            if(c.id===tid)return true;
            if(chk(c))return true;
        }
        return false;
    };
    return chk(n);
};
function deepCopyNode(node) {
    const newNode = JSON.parse(JSON.stringify(node));
    const nodeIdMap = new Map();
    const map = (n) => {
        const previousId = n.id;
        n.id = generateNodeId();
        if (previousId !== undefined && previousId !== null) {
            nodeIdMap.set(String(previousId), String(n.id));
        }
        if (n.children) n.children.forEach(map);
    };
    map(newNode);

    const workbook = typeof mindMapWorkbook !== 'undefined' ? mindMapWorkbook : null;
    if (
        workbook?.documentId
        && workbook.activeTabId
        && typeof rewriteMindMapInternalLinksInTree === 'function'
    ) {
        rewriteMindMapInternalLinksInTree(newNode, {
            sourceDocumentId: workbook.documentId,
            destinationDocumentId: workbook.documentId,
            sourceTabId: workbook.activeTabId,
            nodeIdMap,
        });
    }
    return newNode;
};

// ---防止 XSS 和 HTML 渲染的转义函数---
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- 核心修复：强制钉死根节点位置 ---
function stabilizeRoot() {
    const treeRoot = document.getElementById('tree-root');
    if (!treeRoot) return;
    
    // 找到根节点卡片
    const rootCard = treeRoot.querySelector('.node-card.is-root');
    if (!rootCard) return;
    
    // 计算根节点中心点相对于容器左上角的距离
    const cx = rootCard.offsetLeft + rootCard.offsetWidth / 2;
    const cy = rootCard.offsetTop + rootCard.offsetHeight / 2;
    
    // 既然根节点被 Flexbox 挤到了 (cx, cy)，我们就把容器反向平移 (-cx, -cy)
    // 这样根节点的中心就永远对准了 Canvas 的 (0,0) 点
    treeRoot.style.transform = `translate(-${cx}px, -${cy}px)`;
}
// --- 颜色处理辅助函数：降低 HSL 亮度 ---
function darkenHSL(hslStr, amount) {
    if (!hslStr || !hslStr.startsWith('hsl')) return hslStr;
    // 正则匹配 hsl(h, s%, l%) 中的 l
    return hslStr.replace(/,\s*(\d+)%\)/, (match, l) => {
        // 每次降低 amount% 的亮度，最低不低于 25%（防止变成全黑看不清字）
        const newL = Math.max(25, parseInt(l) - amount);
        return `, ${newL}%)`;
    });
}
// --- 颜色处理辅助函数：根据字符串生成固定色相 ---
// --- 颜色处理辅助函数：根据字符串生成固定且差异明显的色相 ---
function getStableHue(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // 关键修复：不再返回 0-360 的连续值，而是映射到手动挑选的“高辨识度色盘”
    // 这些色相是经过挑选的，彼此之间视觉差异最大化
    const distinctHues = [
        0,   // 正红
        30,  // 鲜橙
        50,  // 金黄 (避开难看的柠檬黄)
        80,  // 嫩绿
        120, // 正绿
        160, // 青绿
        190, // 亮青
        220, // 天蓝
        260, // 正蓝
        290, // 蓝紫
        320, // 洋红
        340  // 玫红
    ];

    // 取绝对值
    hash = Math.abs(hash);
    
    // 取余数，映射到数组下标
    return distinctHues[hash % distinctHues.length];
}
// 无损样式更新（防止抖动）
function updateTreeStyle(node = state.data, parentIsRoot = true, inheritedColor = null) {
    const isRoot = node.id === state.data.id;
    
    // --- 1. 计算当前节点应该显示的颜色 ---
    let displayColor = node.color; 

    if (state.rainbowMode) {
        if (isRoot) {
            displayColor = null; 
        } else if (inheritedColor) {
            displayColor = inheritedColor; 
        }
    }

    // --- 2. 找到 DOM 并应用样式 ---
    const card = document.getElementById(`card-${node.id}`);
    if (card) {
        if(displayColor) card.dataset.rainbowColor = displayColor;
        else delete card.dataset.rainbowColor;

        // 【核心修改】：计算淡色背景
        let lightBg = '';
        if (displayColor) {
            const mixRatio = node.isSimple ? '15%' : 'var(--bg-mix-ratio)';
            lightBg = `color-mix(in srgb, ${displayColor}, var(--card-bg) ${mixRatio})`;
        }

        if (node.isSimple) {
            // --- 便利贴模式 ---
            // 背景设为淡色，边框设为原色
            card.style.background = lightBg || ''; 
            card.style.borderColor = displayColor || '';
            
            // 确保文字颜色适配（可选）
            if(displayColor) card.style.color = 'var(--text-color)'; 
        } else {
            // --- 标准模式 ---
            // 1. 卡片外壳背景设为淡色 (这样Body透出来的就是淡色)
            card.style.backgroundColor = lightBg || '';
            card.style.borderColor = displayColor || '';

            // 2. 头部保持实色深色
            const header = card.querySelector('.card-header');
            if (header) {
                header.style.background = displayColor || '';
                header.style.borderBottomColor = displayColor ? 'rgba(0,0,0,0.1)' : '';
            }

            // 3. 【关键】强制 Body 透明，否则它会挡住卡片的淡色背景
            const body = card.querySelector('.card-body');
            if (body) {
                // 如果有颜色，Body 必须透明；没颜色则恢复默认(可能由CSS控制)
                body.style.background = displayColor ? 'transparent' : '';
            }
        }
    }

    // --- 3. 递归处理子节点 ---
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
            let nextColor = null;
            if (state.rainbowMode) {
                if (isRoot) {
                    const hue = getStableHue(child.id);
                    nextColor = `hsl(${hue}, 85%, 88%)`;
                } else {
                    if (displayColor) {
                        nextColor = darkenHSL(displayColor, 5);
                    }
                }
            }
            updateTreeStyle(child, false, nextColor);
        });
    }
}

// !SECTION 节点渲染与视图更新

