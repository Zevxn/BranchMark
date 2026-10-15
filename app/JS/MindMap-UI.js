
// SECTION 节点工具栏与文件操作

function focusMindMapNodeTopic(nodeId) {
    requestAnimationFrame(() => {
        const topic = document.getElementById(`card-${nodeId}`)?.querySelector('.node-topic');
        if (!topic) return;
        topic.focus();
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(topic);
        selection.removeAllRanges();
        selection.addRange(range);
    });
}

function initializeMapToolbar() {
    $('#btn-undo').onclick=undo; 
    $('#btn-redo').onclick=redo;
    $('#btn-add-child').onclick=()=>{ 
        syncCurrentInput(); 
        if(state.selectedIds.size!==1)return; const id=Array.from(state.selectedIds)[0], n=findNode(state.data,id); 
        if(n){ 
            if(!n.children)n.children=[]; n.folded=false; 
            const newNode = {id:generateNodeId(), topic:'New', widthMode:'auto', heightMode:'auto'};
            if(n.id === state.data.id) newNode.dir = 'right';
            n.children.push(newNode); 
            invalidateMindMapNodeIndex();
            state.selectedIds.clear(); state.selectedIds.add(newNode.id); 
            recordHistory(); updateChildrenDOM(n.id);
            focusMindMapNodeTopic(newNode.id);
        } 
    };
    $('#btn-add-sibling').onclick=()=>{ 
        syncCurrentInput(); 
        if(state.selectedIds.size!==1) return; 
        const id=Array.from(state.selectedIds)[0]; 
        if(id===state.data.id) return; 
        const p=findParent(state.data,id); 
        if(p){ 
            const newNode = {id:generateNodeId(), topic:'Sibling', widthMode:'auto', heightMode:'auto'};
            const sibling = findNode(state.data, id);
            newNode.dir = sibling.dir;
            p.children.push(newNode); 
            invalidateMindMapNodeIndex();
            state.selectedIds.clear(); state.selectedIds.add(newNode.id); 
            recordHistory(); updateChildrenDOM(p.id);
            focusMindMapNodeTopic(newNode.id);
        } 
    };
    $('#btn-add-relation').onclick = event => addRelationBetweenSelectedCards({
        x: event.clientX,
        y: event.clientY
    });
    $('#btn-add-summary').onclick = addSummaryForSelectedCards;
    $('#btn-delete').onclick=()=>{ 
        syncCurrentInput(); 
        if(state.selectedRelationId) {
            deleteSelectedMindMapRelation();
            return;
        }
        if(state.selectedSummaryId) {
            deleteSelectedMindMapSummary();
            return;
        }
        const parents=new Set(); 
        const deletedNodeIds = new Set();
        state.selectedIds.forEach(id=>{
            if(id!==state.data.id){
                collectMindMapNodeIds(findNode(state.data,id), deletedNodeIds);
                const p=findParent(state.data,id);
                if(p){
                    p.children=p.children.filter(c=>c.id!==id);
                    invalidateMindMapNodeIndex();
                    parents.add(p.id);
                }
            }
        }); 
        removeMindMapRelationsForNodes(deletedNodeIds);
        removeMindMapSummariesForNodes(deletedNodeIds);
        state.selectedIds.clear(); recordHistory(); parents.forEach(pid=>updateChildrenDOM(pid)); 
    };

    $('#btn-color').onclick = (e) => { 
        e.stopPropagation(); // 阻止冒泡
        const popup = $('#colorPopup');
        const btn = $('#btn-color');
        
        // 动态计算位置（确保弹窗紧贴按钮下方）
        if (!popup.classList.contains('show')) {
            const rect = btn.getBoundingClientRect();
            popup.style.left = (rect.left + rect.width / 2) + 'px';
            popup.style.top = (rect.bottom + 6) + 'px'; 
        }
        popup.classList.toggle('show'); 
    };

    /* --- 色块点击事件 (修复版) --- */
    document.querySelectorAll('.color-swatch').forEach(el => {
        // 使用 onclick 绑定，并确保处理事件对象 e
        el.onclick = (e) => {
            e.stopPropagation(); // 关键：防止点击穿透或冒泡关闭弹窗
            e.preventDefault();  // 关键：防止可能的默认行为

            saveGlobalScrolls();
            const color = el.dataset.color;
            
            const hasChanged = applyColorToMindMapSelection(color);

            if(hasChanged) recordHistory();
            
            // 关闭弹窗
            $('#colorPopup').classList.remove('show');
            restoreGlobalScrolls();
        };
    })
    const tbInput = document.getElementById('toolbarCustomColor');
    if (tbInput) {
        tbInput.addEventListener('input', (e) => {
            applyCustomColorToSelection(e.target.value, false);
        });
        
        tbInput.addEventListener('change', (e) => {
            applyCustomColorToSelection(e.target.value, true);
            document.getElementById('colorPopup').classList.remove('show');
            
            // ▼▼▼ 补全：手动移除焦点 ▼▼▼
            e.target.blur(); 
        });

        tbInput.addEventListener('click', (e) => e.stopPropagation());
    }

    $('#btn-rainbow').onclick = () => {
        state.rainbowMode = !state.rainbowMode; // 切换状态

        // 禁用/启用手动颜色按钮，避免冲突
        updateToolbar();
        updateTreeStyle(); 
        // renderTree(); // 重新渲染，应用颜色
    };

    $('#btn-compact-view').onclick = () => {
        syncCurrentInput();
        state.compactView = !state.compactView;
        renderTree();
    };

    $('#btn-center').onclick=()=>{ state.view={tx:window.innerWidth / 2,ty:window.innerHeight / 2,scale:1}; updateTransform(); saveStorage(); };
    $('#btn-new').onclick=()=>{void newMindMap();}
    $('#btn-save').onclick=()=>{void saveMindMapData(true);}
    const exportButton = $('#btn-export');
    exportButton.onclick = async () => {
        if (exportButton.disabled) return;
        // 部分 Quicker 目录动作取消后不结束 Promise，保留再次点击的入口。
        exportButton.disabled = !isNativeQuickerExport();
        try {
            const filename = `${getMindMapExportBaseName()}.json`;
            const content = JSON.stringify(getMindMapWorkbookSnapshot());
            if (await saveMindMapJsonFile(filename, content)) {
                showTopToast(`✅ 脑图已导出：${filename}`);
            }
        } catch (error) {
            console.warn('[Export] JSON 脑图导出失败:', error);
            showTopToast(`❌ 导出失败：${error.message || '无法写入文件'}`);
        } finally {
            exportButton.disabled = false;
        }
    };
    $('#fileInput').onchange=(e)=>{ 
        const f=e.target.files[0]; 
        if(!f)return; 
        const r=new FileReader(); 
        r.onload=(ev)=>{ 
            applyImportedMindMap(ev.target.result);
            e.target.value='';
        };
        r.onerror=()=>{
            showMindMapImportFeedback('❌ 导入失败：无法读取文件');
            e.target.value='';
        };
        r.readAsText(f);
    };
    initializeMindMapImport();

    const obsidianButton = $('#btn-obsidian');
    const obsidianMenu = $('#obsidianMenu');
    const setObsidianMenuOpen = open => {
        obsidianMenu.classList.toggle('is-open', open);
        obsidianMenu.setAttribute('aria-hidden', String(!open));
        obsidianButton.setAttribute('aria-expanded', String(open));
        if (!open) return;
        const rect = obsidianButton.getBoundingClientRect();
        obsidianMenu.style.left = Math.min(
            Math.max(12, rect.left + (rect.width - obsidianMenu.offsetWidth) / 2),
            Math.max(12, window.innerWidth - obsidianMenu.offsetWidth - 12),
        ) + 'px';
        obsidianMenu.style.top = Math.max(12, Math.min(
            rect.bottom + 14, window.innerHeight - obsidianMenu.offsetHeight - 12,
        )) + 'px';
        obsidianMenu.querySelector('button').focus();
    };
    obsidianButton.onclick = () => setObsidianMenuOpen(!obsidianMenu.classList.contains('is-open'));
    obsidianMenu.addEventListener('click', event => {
        if (!event.target.closest('button')) return;
        setObsidianMenuOpen(false);
        obsidianButton.focus();
    }, true);
    document.addEventListener('pointerdown', event => {
        if (!event.target.closest('#btn-obsidian, #obsidianMenu')) setObsidianMenuOpen(false);
    });
    [obsidianButton, obsidianMenu].forEach(element => element.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        // 保留按钮的键盘操作，避免 Enter、Tab、空格触发画布快捷键。
        event.stopPropagation();
        if (event.key === 'Escape') {
            setObsidianMenuOpen(false);
            obsidianButton.focus();
        }
    }));
    obsidianMenu.addEventListener('focusout', event => {
        if (!obsidianMenu.contains(event.relatedTarget) && event.relatedTarget !== obsidianButton) {
            setObsidianMenuOpen(false);
        }
    });
    window.addEventListener('resize', () => setObsidianMenuOpen(false));
    $('.toolbar').addEventListener('scroll', () => setObsidianMenuOpen(false));

    $('#btn-export-canvas').onclick = () => {
        exportToCanvas();
    };
    $('#btn-export-vertical').onclick = () => {
        exportToVerticalCanvas();
    };
    $('#btn-change-folder').onclick = async() => {
        const newDirectory = await changeObsidianPath();
        if (newDirectory) {
            showTopToast('✅ 新目录设置成功！');
        }
    };
    initializeMindMapTheme();
}

// !SECTION 节点工具栏与文件操作

// SECTION 画布右键菜单
function getMindMapOverlayViewportBottom(viewportHeight, tabTop, margin = 0) {
    const viewportBottom = Math.max(margin, viewportHeight - margin);
    if (!Number.isFinite(tabTop) || tabTop <= 0 || tabTop >= viewportHeight) return viewportBottom;
    return Math.max(margin, Math.min(viewportBottom, tabTop - margin));
}

function getMindMapUsableViewportBottom(margin = 0) {
    const tabBar = document.getElementById('mindMapTabs');
    const tabRect = tabBar?.getClientRects().length ? tabBar.getBoundingClientRect() : null;
    return getMindMapOverlayViewportBottom(
        window.innerHeight,
        tabRect?.top,
        margin,
    );
}

function getMindMapContextSubmenuSize(submenu) {
    if (!submenu) return { width: 0, height: 0 };
    const previousDisplay = submenu.style.display;
    const previousVisibility = submenu.style.visibility;
    submenu.style.display = 'block';
    submenu.style.visibility = 'hidden';
    const { width, height } = submenu.getBoundingClientRect();
    submenu.style.display = previousDisplay;
    submenu.style.visibility = previousVisibility;
    return { width, height };
}

function positionMindMapContextMenu(menu, clientX, clientY) {
    const viewportMargin = 8;
    const viewportBottom = getMindMapUsableViewportBottom(viewportMargin);
    const submenu = menu.querySelector('.menu-item.has-submenu > .submenu');
    menu.classList.remove('submenu-opens-left');
    menu.style.removeProperty('max-height');
    menu.style.removeProperty('overflow-y');
    if (submenu) {
        submenu.style.top = '';
        submenu.style.bottom = '';
        submenu.style.removeProperty('max-height');
        submenu.style.removeProperty('overflow-y');
    }
    menu.classList.add('active');

    const menuWidth = menu.offsetWidth;
    const availableMenuHeight = Math.max(0, viewportBottom - viewportMargin);
    if (menu.offsetHeight > availableMenuHeight) {
        menu.style.setProperty('max-height', `${availableMenuHeight}px`);
        menu.style.setProperty('overflow-y', 'auto', 'important');
    }
    const menuHeight = menu.offsetHeight;
    const x = Math.min(
        Math.max(Number.isFinite(clientX) ? clientX : viewportMargin, viewportMargin),
        Math.max(viewportMargin, window.innerWidth - menuWidth - viewportMargin)
    );
    const y = Math.min(
        Math.max(Number.isFinite(clientY) ? clientY : viewportMargin, viewportMargin),
        Math.max(viewportMargin, viewportBottom - menuHeight)
    );
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    if (!submenu) return;
    let { width: submenuWidth, height: submenuHeight } = getMindMapContextSubmenuSize(submenu);
    if (submenuHeight > availableMenuHeight) {
        submenu.style.setProperty('max-height', `${availableMenuHeight}px`);
        submenu.style.setProperty('overflow-y', 'auto');
        submenuHeight = availableMenuHeight;
    }
    const menuRect = menu.getBoundingClientRect();
    const opensRight = menuRect.right + 4 + submenuWidth <= window.innerWidth - viewportMargin;
    const opensLeft = menuRect.left - 4 - submenuWidth >= viewportMargin;
    if (!opensRight && (opensLeft || menuRect.left > window.innerWidth - menuRect.right)) {
        menu.classList.add('submenu-opens-left');
    }

    const parentRect = submenu.parentElement.getBoundingClientRect();
    const preferredTop = parentRect.top - 40;
    const top = Math.min(
        Math.max(preferredTop, viewportMargin),
        Math.max(viewportMargin, viewportBottom - submenuHeight)
    );
    submenu.style.top = `${top - parentRect.top}px`;
    submenu.style.bottom = 'auto';
}

// SECTION 交互学习提示词设置与复制
const DEFAULT_INTERACTIVE_LEARNING_PROMPT = `根据上述内容设计交互学习控件。这个交互控件将嵌入 BranchMark 思维导图的笔记中，请提供源代码，并遵守以下规范：

【视觉融合】
- 使用简洁的工具型界面，减少装饰性标题、渐变、发光和重复卡片嵌套。
- html、body 和最外层容器背景透明，不设置整页深蓝色或其他固定背景。
- 内部面板使用中性灰，仅通过轻微底色和细边框区分层级。
- 强调色用于曲线、选中状态和关键数值，避免大面积铺色。
- 所有文字、边框、面板和图表颜色统一通过 CSS 变量管理。
- 滑块采用简约扁平化 UI，细长的深灰色无描边圆角轨道
- 图表优先使用 SVG，保证导图缩放后仍清晰；如使用 Canvas，需适配高分屏，并预留根据宿主缩放比例提高绘制分辨率、重新绘图的能力。

【亮暗主题】
- 嵌入时服从宿主主题，不自行固定 color-scheme，也不只根据操作系统主题判断。
- 在 DOMContentLoaded 后，通过
  getComputedStyle(document.documentElement).colorScheme
  读取宿主提供的 light 或 dark，并设置控件自己的主题变量。
- 监听来自 parent 的 branchmark-interactive-theme 消息，
  在 requestAnimationFrame 中重新读取 color-scheme，更新主题。
- Canvas、SVG、坐标轴、网格线、提示框也必须同步主题；
  切换主题时保留输入值和交互状态。
- 独立打开 HTML 时，才使用 prefers-color-scheme 作为主题依据。

【参考颜色】
亮色：正文 #24292e，次要文字 #666666，
面板 #f6f8fa，边框 #e1e4e8，强调色 #007bff。
暗色：正文 #e0e0e0，次要文字 #aaaaaa，
面板 #303030，边框 #444444，强调色 #4dabf7。
(除上述参考颜色外，可根据内容需要选用其他颜色，让交互控件更直观、美观但不花里胡哨。例如：绿色 #51cf66、橙色 #ffa94d、蓝紫色 #818cf8、青色 #22b8cf、玫红色 #f783ac。)

【嵌入布局】
- 宽度跟随容器，内容自然撑高。
- 不使用固定页面高度或 100vh/min-height:100vh 撑满页面。
- 窄窗口合理换行，宽窗口恢复多栏布局。
- 输出自包含 HTML，包含所需 CSS 和 JavaScript。`;

function applyInteractivePromptSetting(value) {
    const prompt = typeof value === 'string' ? value.trim() : '';
    mindMapSettings.interactivePrompt = prompt === DEFAULT_INTERACTIVE_LEARNING_PROMPT ? '' : prompt;
    $('#settingInteractivePromptValue').textContent = mindMapSettings.interactivePrompt ? '已自定义' : '默认';
}

function initializeInteractivePromptSettings() {
    const modal = $('#interactivePromptSettingsModal');
    const content = modal.querySelector('.modal-content');
    const body = modal.querySelector('.bookmark-modal-body');
    const input = $('#interactivePromptInput');
    const resizer = $('#interactivePromptResize');
    const error = $('#interactivePromptError');
    const saveButton = $('#saveInteractivePrompt');
    let resizeStart = null;

    const setInputHeight = height => {
        // 计入被正文滚动区裁切的高度，确保手柄和底部按钮始终留在窗口内。
        const overhead = content.offsetHeight - input.offsetHeight + body.scrollHeight - body.clientHeight;
        const max = Math.max(0, window.innerHeight - 32 - overhead);
        input.style.height = `${Math.min(max, Math.max(Math.min(120, max), height))}px`;
    };
    const finishResize = event => {
        if (!resizeStart || (event && event.pointerId !== resizeStart.pointerId)) return;
        const { pointerId } = resizeStart;
        resizeStart = null;
        if (resizer.hasPointerCapture(pointerId)) resizer.releasePointerCapture(pointerId);
    };
    const close = () => {
        finishResize();
        hideMindMapTabModal(modal);
    };

    resizer.addEventListener('pointerdown', event => {
        if (event.button !== 0 || resizeStart) return;
        event.preventDefault();
        resizeStart = { pointerId: event.pointerId, y: event.clientY, height: input.offsetHeight };
        resizer.setPointerCapture(event.pointerId);
    });
    resizer.addEventListener('pointermove', event => {
        if (!resizeStart || event.pointerId !== resizeStart.pointerId) return;
        // 居中弹窗上下各变化一半，文本框高度需按底部手柄位移的两倍调整。
        setInputHeight(resizeStart.height + 2 * (event.clientY - resizeStart.y));
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
        resizer.addEventListener(type, finishResize);
    });
    resizer.addEventListener('keydown', event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        setInputHeight(input.offsetHeight + (event.key === 'ArrowDown' ? 1 : -1) * (event.shiftKey ? 40 : 16));
    });
    window.addEventListener('resize', () => {
        if (modal.classList.contains('show')) setInputHeight(input.offsetHeight);
    });

    $('#btn-edit-interactive-prompt').onclick = () => {
        input.value = mindMapSettings.interactivePrompt || DEFAULT_INTERACTIVE_LEARNING_PROMPT;
        error.textContent = '';
        setMindMapSettingsPopoverOpen(false);
        // 关闭弹窗后返回仍可见的设置按钮。
        $('#btn-settings').focus();
        showMindMapTabModal(modal);
        setInputHeight(input.offsetHeight);
        requestAnimationFrame(() => input.focus());
    };
    $('#cancelInteractivePrompt').onclick = close;
    $('#resetInteractivePrompt').onclick = () => {
        input.value = DEFAULT_INTERACTIVE_LEARNING_PROMPT;
        error.textContent = '';
        input.focus();
    };
    input.addEventListener('input', () => { error.textContent = ''; });
    saveButton.onclick = async () => {
        if (saveButton.disabled || !modal.classList.contains('show')) return;
        const prompt = input.value.trim();
        if (!prompt) {
            error.textContent = '提示词不能为空。';
            input.focus();
            return;
        }
        saveButton.disabled = true;
        error.textContent = '';
        try {
            await chrome.storage.local.set({
                [MINDMAP_INTERACTIVE_PROMPT_STORAGE_KEY]: prompt === DEFAULT_INTERACTIVE_LEARNING_PROMPT ? '' : prompt
            });
            applyInteractivePromptSetting(prompt);
            close();
            showTopToast('✅ 交互提示词已保存');
        } catch (err) {
            console.warn('[MindMap] 保存交互提示词失败:', err);
            error.textContent = '保存失败，请重试。';
        } finally {
            saveButton.disabled = false;
        }
    };
    modal.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        } else if (event.key === 'Tab') {
            const controls = Array.from(modal.querySelectorAll('textarea, button')).filter(control => !control.disabled);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });
    modal.addEventListener('mousedown', event => {
        event.stopPropagation();
        modal.dataset.backdropPressed = event.target === modal ? 'true' : 'false';
    });
    modal.addEventListener('click', event => {
        const shouldClose = event.target === modal && modal.dataset.backdropPressed === 'true';
        delete modal.dataset.backdropPressed;
        if (shouldClose) close();
    });
}

async function copyInteractiveLearningPrompt(markdown) {
    const prompt = `${markdown}\n\n${mindMapSettings.interactivePrompt || DEFAULT_INTERACTIVE_LEARNING_PROMPT}`;
    try {
        await navigator.clipboard.writeText(prompt);
        showTopToast('✅ 交互学习提示词已复制！');
    } catch (error) {
        console.warn('[MindMap] 复制交互学习提示词失败:', error);
        showTopToast('❌ 复制提示词失败，请重试');
    }
}
// !SECTION 交互学习提示词设置与复制

function initializeMapContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    let contextTargetKind = 'node';
    let contextTargetId = null;

    const resetActionVisibility = () => {
        contextMenu.querySelectorAll(':scope > .menu-item[data-action]').forEach(item => {
            item.style.display = '';
        });
    };
    const setActionVisibility = (action, visible) => {
        const item = contextMenu.querySelector(`:scope > .menu-item[data-action="${action}"]`);
        if (item) item.style.display = visible ? '' : 'none';
    };
    const setDeleteLabel = label => {
        const item = contextMenu.querySelector(':scope > .menu-item[data-action="delete"]');
        if (!item) return;
        const icon = item.querySelector('i');
        item.replaceChildren();
        if (icon) item.appendChild(icon);
        item.append(` ${label}`);
    };
    
    // 1. 监听右键点击 (呼出菜单)
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.bookmark-manager-container')) return;
        const summaryEditor = e.target.closest('.summary-editor');
        const card = e.target.closest('.node-card');
        if (!summaryEditor && !card) return;

        e.preventDefault();
        resetActionVisibility();

        const expandItem=contextMenu.querySelector('.menu-item[data-action="expand"]');
        const collapseItem=contextMenu.querySelector('.menu-item[data-action="collapse"]');
        const toStandardItem=contextMenu.querySelector('.menu-item[data-action="to-standard"]');
        const toSimpleItem=contextMenu.querySelector('.menu-item[data-action="to-simple"]');
        const addRelationItem=contextMenu.querySelector('.menu-item[data-action="add-relation"]');
        const createTabItem=contextMenu.querySelector('.menu-item[data-action="create-tab-from-node"]');

        if (summaryEditor) {
            const summary = getMindMapSummaryById(summaryEditor.dataset.summaryId);
            if (!summary) {
                contextMenu.classList.remove('active');
                return;
            }
            contextTargetKind = 'summary';
            contextTargetId = summary.id;
            selectMindMapSummary(summary.id);
            setDeleteLabel('删除总结');
            ['cut', 'copy', 'paste', 'copy-mindmap-link', 'add-relation', 'split-read', 'create-tab-from-node', 'expand', 'collapse']
                .forEach(action => setActionVisibility(action, false));
            toStandardItem.style.display = summary.isSimple ? '' : 'none';
            toSimpleItem.style.display = summary.isSimple ? 'none' : '';
            positionMindMapContextMenu(contextMenu, e.clientX, e.clientY);
            return;
        }

        contextTargetKind = 'node';
        contextTargetId = card.dataset.nodeId;
        setDeleteLabel('删除节点');
        clearSelectedMindMapRelation();
        clearSelectedMindMapSummary();
        const node = findNode(state.data, card.dataset.nodeId);
        const isCompactCollapsed = isTemporarilyCollapsed(node);

        if (!node) {
            contextMenu.classList.remove('active');
            return;
        }
        if (node.isSimple){     // 便利贴模式
            toStandardItem.style.display='block';
            toSimpleItem.style.display='none';
            expandItem.style.display='none';
            collapseItem.style.display='none';
        }else if (isCompactCollapsed){ // 临时精简视图不允许暗中修改持久折叠状态
            toStandardItem.style.display='none';
            toSimpleItem.style.display='none';
            expandItem.style.display='none';
            collapseItem.style.display='none';
        }else{                  // 标准卡片模式
            if (node.contentCollapsed){ // 折叠状态
                toStandardItem.style.display='none';
                toSimpleItem.style.display='none';
                collapseItem.style.display='none';
                expandItem.style.display=card.classList.contains('has-content')?'block':'none';
            }else{      // 展开状态
                if (card.classList.contains('topic-empty')){
                    toStandardItem.style.display='none';
                    toSimpleItem.style.display='none';
                    expandItem.style.display='none';
                    collapseItem.style.display='none';
                }else{
                    toStandardItem.style.display='none';
                    toSimpleItem.style.display='block';
                    expandItem.style.display='none';
                    collapseItem.style.display=card.classList.contains('has-content')?'block':'none';
                }
                
            }
        }

        // 选中逻辑
        const nodeId = card.dataset.nodeId;
        if (!state.selectedIds.has(nodeId)) {
            state.selectedIds.clear();
            state.selectedIds.add(nodeId);
            updateSelection();
        }

        // 右击双选中的任一卡片时保留双选，并提供与工具栏一致的关联入口。
        const canAddRelation = state.selectedIds.size === 2;
        addRelationItem.style.display = canAddRelation ? '' : 'none';
        setActionVisibility('split-read', state.selectedIds.size >= 2 && state.selectedIds.size <= 4);
        setActionVisibility('paste', state.selectedIds.size === 1);
        createTabItem.style.display = state.selectedIds.size === 1 ? '' : 'none';
        setActionVisibility('copy-mindmap-link', true);
        positionMindMapContextMenu(contextMenu, e.clientX, e.clientY);
    });

    // 2. 菜单动作处理
    contextMenu.addEventListener('click', (e) => {
        // 如果点击的是自定义颜色的 Input 或 按钮容器，不触发这里的主逻辑
        if (e.target.closest('.custom-color-btn') || e.target.tagName === 'INPUT') return;

        const item = e.target.closest('.menu-item');
        const swatch = e.target.closest('.color-swatch'); // 【修改】使用新类名

        if ((!item && !swatch) || (!swatch && item && item.classList.contains('has-submenu'))) return;

        let action = item ? item.dataset.action : null;
        let colorVal = null;

        if (swatch) {
            action = 'set-color';
            colorVal = swatch.dataset.color; // 【修改】使用 data-val
        }
        if (action === 'copy-interactive-prompt') {
            const target = contextTargetKind === 'summary'
                ? getMindMapSummaryById(contextTargetId)
                : findNode(state.data, contextTargetId);
            contextMenu.classList.remove('active');
            if (target) void copyInteractiveLearningPrompt(target.content || target.topic || '');
            return;
        }
        if (contextTargetKind === 'summary') {
            const summary = getMindMapSummaryById(contextTargetId);
            if (!summary) {
                contextMenu.classList.remove('active');
                return;
            }
            if (action === 'copy-md') {
                navigator.clipboard.writeText(summary.content || '');
                showTopToast('✅ Markdown内容已复制！');
            } else if (action === 'delete') {
                state.selectedSummaryId = summary.id;
                deleteSelectedMindMapSummary();
            } else if (action === 'auto-fit') {
                autoFitMindMapEntity(summary, 'summary');
            } else if (
                (action === 'to-simple' && !summary.isSimple)
                || (action === 'to-standard' && summary.isSimple)
            ) {
                toggleMindMapEntitySimpleMode(summary);
                recordHistory();
                scheduleRenderMindMapSummaries();
            } else if (action === 'set-color' && applyColorToMindMapSelection(colorVal)) {
                recordHistory();
            }
            contextMenu.classList.remove('active');
            return;
        }
        // 复制粘贴操作不需要进入下面的 forEach 循环，因为它们自己会处理 state.selectedIds
        if (action === 'cut') {
            cutSelectedNodes();
            contextMenu.classList.remove('active');
            return;
        }
        if (action === 'copy') {
            copySelectedNodes(true);
            contextMenu.classList.remove('active');
            return;
        }
        if (action === 'paste') {
            pasteNodesToSelection();
            contextMenu.classList.remove('active');
            return;
        }
        if (action === 'copy-mindmap-link') {
            void copyMindMapInternalLink(contextTargetId);
            contextMenu.classList.remove('active');
            return;
        }
        if (action === 'add-relation') {
            addRelationBetweenSelectedCards({ x: e.clientX, y: e.clientY });
            contextMenu.classList.remove('active');
            return;
        }
        if (action === 'split-read') {
            contextMenu.classList.remove('active');
            openMindMapSplitReader();
            return;
        }
        if (action === 'create-tab-from-node') {
            createMindMapTabFromSelectedNode();
            contextMenu.classList.remove('active');
            return;
        }
        if (action === 'delete') {
            $('#btn-delete').click();
        }
        
        if (action === 'copy-md') {
            // console.log('复制markdown内容');
            const id = state.selectedIds.size === 1 ? Array.from(state.selectedIds)[0] : null;
            if (!id) return;
            const node = findNode(state.data, id);
            if (!node) return;
            const markdown = node.content || '';
            navigator.clipboard.writeText(markdown);
            showTopToast('✅ Markdown内容已复制！');
            contextMenu.classList.remove('active');
        }

        let hasChange = false;
        
        // 批量操作
        state.selectedIds.forEach(id => {
            const node = findNode(state.data, id);
            if (!node) return;

            switch (action) {
                case 'expand': 
                    if (node.contentCollapsed) { node.contentCollapsed = false; hasChange = true; updateNodeDOM(node.id); }
                    break;
                case 'collapse': 
                    if (!node.contentCollapsed && node.content && node.topic?.trim()) { node.contentCollapsed = true; hasChange = true; updateNodeDOM(node.id); }
                    break;
                case 'to-standard': 
                    if (node.isSimple) { node.isSimple = false; if (node.heightMode === 'manual' && node.bodyHeight < 60) node.heightMode = 'auto'; hasChange = true; updateNodeDOM(node.id); }
                    break;
                case 'to-simple': 
                    // if (node.id !== state.data.id && !node.isSimple) { node.isSimple = true; node.heightMode = 'auto'; node.widthMode = 'auto'; hasChange = true; updateNodeDOM(node.id); }
                    // break;
                    if (node.id !== state.data.id && !node.isSimple) { 
                        node.isSimple = true; 
                        // 同样应用高度限制
                        node.heightMode = 'manual'; 
                        node.bodyHeight = 220; // 默认高度
                        node.widthMode = 'manual';
                        node.width = 240;      // 默认宽度
                        hasChange = true; 
                        updateNodeDOM(node.id); 
                    }
                    break;
                case 'auto-fit': 
                    node.widthMode = 'auto'; node.heightMode = 'auto'; delete node.width; delete node.bodyHeight; hasChange = true; updateNodeDOM(node.id);
                    break;
                case 'set-color': 
                    if (node.color !== colorVal) { node.color = colorVal; hasChange = true; updateNodeDOM(node.id); }
                    break;
            }
        });

        contextMenu.classList.remove('active');

        if (hasChange) {
            recordHistory();
            stabilizeRoot();
        }
    });

    // 3. 自定义颜色 Input 处理 (脑图版)
    const ctxInput = document.getElementById('ctxCustomColor');
    if (ctxInput) {
        // 阻止冒泡，防止菜单关闭
        ctxInput.addEventListener('click', (e) => e.stopPropagation());
        ctxInput.addEventListener('mousedown', (e) => e.stopPropagation());

        // 实时预览 (Input)
        ctxInput.addEventListener('input', (e) => {
            applyCustomColorToSelection(e.target.value, false);
        });

        // 确认选择 (Change) - 关闭菜单
        ctxInput.addEventListener('change', (e) => {
            applyCustomColorToSelection(e.target.value, true);
            contextMenu.classList.remove('active');
            e.target.blur(); // 移除焦点
        });
    }

    // 4. 全局关闭逻辑
    // 使用 mousedown 关闭，体验更灵敏
    document.addEventListener('mousedown', (e) => {
        if (contextMenu.classList.contains('active') && !e.target.closest('#contextMenu')) {
            contextMenu.classList.remove('active');
        }
    });
    
    document.addEventListener('wheel', () => {
        if (contextMenu.classList.contains('active')) contextMenu.classList.remove('active');
    });
}

// !SECTION 画布右键菜单

// SECTION Markdown 编辑器右键菜单
function initializeEditorContextMenu() {
    const menu = document.getElementById('editorContextMenu');
    const textarea = getMindMapSourceEditor();
    // 定义存储 Key (与上传模块保持一致)
    const IMG_STORAGE_KEY = 'MindMap_ImgBB_Key'; 

    if (!menu || !textarea) return;

    let savedSelection = { start: 0, end: 0 };
    let savedTextSnapshot = '';
    let savedEditorState = null;
    let ctxMenuTextSnapshot = null;

    // --- 1. 监听右键呼出 ---
    textarea.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        savedSelection.start = textarea.selectionStart;
        savedSelection.end = textarea.selectionEnd;
        savedTextSnapshot = textarea.value;
        savedEditorState = textarea.view?.state;
        textarea.focus({ preventScroll: true });

        positionMindMapContextMenu(menu, e.clientX, e.clientY);
    });

    // --- 2. 辅助：执行动作 ---
    const executeAction = (actionCallback) => {
        textarea.focus({ preventScroll: true });
        // 恢复选区
        textarea.setSelectionRange(savedSelection.start, savedSelection.end);
        actionCallback();
        menu.classList.remove('active');
    };

    // --- 3. 剪贴板处理 (核心修改部分) ---
    const handleClipboard = async (cmd) => {
        // 先关闭菜单，视觉上更流畅
        menu.classList.remove('active');
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(savedSelection.start, savedSelection.end);

        if (cmd === 'copy' || cmd === 'cut') {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selectedText = textarea.value.substring(start, end);
            if (!selectedText) return;

            try {
                await navigator.clipboard.writeText(selectedText);
                if (cmd === 'cut') {
                    replaceMindMapEditorSelection(textarea, '');
                }
            } catch (err) { console.log('Clipboard write failed:', err); }
        } 
        else if (cmd === 'paste') {
            try {
                // ▼▼▼ 修改开始：尝试读取剪贴板对象 (图片优先) ▼▼▼
                const clipboardItems = await navigator.clipboard.read();
                let hasHandledImage = false;

                for (const item of clipboardItems) {
                    // 检查是否有图片类型
                    const imageType = item.types.find(type => type.startsWith('image/'));
                    
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        
                        // --- 这里复用图片上传逻辑 ---
                        
                        // 1. 读取 API Key
                        let apiKey = '';
                        try {
                            const result = await chrome.storage.local.get([IMG_STORAGE_KEY]);
                            apiKey = result[IMG_STORAGE_KEY];
                        } catch (e) { console.log(e); }

                        if (!apiKey) {
                            alert('请先点击工具栏的【图片设置】按钮配置 ImgBB API Key。');
                            return; 
                        }

                        // 2. 插入占位符
                        const uniqueId = Date.now();
                        const placeholder = `![⏳ 图片上传中...-${uniqueId}]()`;
                        insertTextToEditor(textarea, placeholder);

                        // 3. 异步上传
                        uploadToImgBB(blob, apiKey)
                            .then(url => {
                                const finalMarkdown = `![image](${url})`;
                                replaceTextInEditor(textarea, placeholder, finalMarkdown);
                                showTopToast('✅ 图片粘贴上传成功');
                            })
                            .catch(err => {
                                const errorText = `[❌ 上传失败: ${err.message}]`;
                                replaceTextInEditor(textarea, placeholder, errorText);
                                alert('上传失败: ' + err.message);
                            });

                        hasHandledImage = true;
                        break; // 处理完一张图就退出，防止重复
                    }
                }

                // 如果剪贴板里没有图片，或者浏览器不支持 read() 图片，
                // 则尝试读取纯文本 (Fallback)
                if (!hasHandledImage) {
                     // 有些浏览器 read() 读取文本会比较麻烦，为了稳妥，
                     // 如果没处理图片，我们显式调用一次 readText
                     const text = await navigator.clipboard.readText();
                     if (text) {
                        replaceMindMapEditorSelection(textarea, text);
                        showTopToast('✅ 文本粘贴成功1');
                     }
                }
                // ▲▲▲ 修改结束 ▲▲▲

            } catch (err) {
                // 如果没有权限读取 ClipboardItem (比如 Firefox 默认限制)，
                // 或者其他错误，回退到纯文本读取
                try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        replaceMindMapEditorSelection(textarea, text);
                        showTopToast('✅ 文本粘贴成功2');
                    }
                } catch (e2) {
                    alert('无法读取剪贴板，请尝试使用 Ctrl+V 快捷键');
                }
            }
        }
    };

    // --- 4. 监听菜单点击 ---
    menu.addEventListener('click', (e) => {
        // 排除自定义颜色输入框
        if (e.target.closest('.custom-color-btn') || e.target.tagName === 'INPUT') return;

        const item = e.target.closest('.menu-item');
        const swatch = e.target.closest('.editor-swatch');

        if ((!item && !swatch) || (item && item.classList.contains('has-submenu'))) return;

        e.stopPropagation();

        if (swatch) {
            executeAction(() => insertTextFormat(`<span style="color:${swatch.dataset.val}">`, '</span>'));
        } 
        else if (item) {
            const cmd = item.dataset.cmd;
            if (['cut', 'copy', 'paste'].includes(cmd)) {
                handleClipboard(cmd);
            } else if (cmd === 'insert-mindmap-link') {
                executeAction(() => { void insertMindMapLinkFromClipboard(); });
            } else {
                executeAction(() => {
                    if (cmd === 'bold') insertTextFormat('**', '**');
                    if (cmd === 'italic') insertTextFormat('*', '*');
                    if (cmd === 'highlight') insertTextFormat('<mark>', '</mark>');
                });
            }
        }
    });

    // --- 5. 自定义颜色逻辑 ---
    const customInput = document.getElementById('editorCtxCustomColor');
    if (customInput) {
        customInput.addEventListener('click', (e) => e.stopPropagation());
        customInput.addEventListener('mousedown', (e) => e.stopPropagation());
        customInput.addEventListener('input', (e) => {
            if (!ctxMenuTextSnapshot) ctxMenuTextSnapshot = savedTextSnapshot;
            restoreMindMapSourceEditorSnapshot(textarea, ctxMenuTextSnapshot, savedEditorState);
            textarea.setSelectionRange(savedSelection.start, savedSelection.end);
            insertTextFormat(`<span style="color:${e.target.value}">`, '</span>', false);
        });
        customInput.addEventListener('change', (e) => {
            menu.classList.remove('active');
            restoreMindMapSourceEditorSnapshot(textarea, ctxMenuTextSnapshot || savedTextSnapshot, savedEditorState);
            textarea.setSelectionRange(savedSelection.start, savedSelection.end);
            insertTextFormat(`<span style="color:${e.target.value}">`, '</span>', true);
            e.target.blur();
            ctxMenuTextSnapshot = null;
        });
    }

    // --- 6. 全局关闭 ---
    document.addEventListener('mousedown', (e) => {
        if (menu.classList.contains('active') && !e.target.closest('#editorContextMenu') && e.target.tagName !== 'INPUT') {
            menu.classList.remove('active');
        }
    });
}

// !SECTION Markdown 编辑器右键菜单

// SECTION 节点选择与键盘导航
function selectAllMindMapNodes() {
    clearSelectedMindMapRelation();
    clearSelectedMindMapSummary();
    state.selectedIds.clear();
    collectMindMapNodeIds(state.data).forEach(nodeId => state.selectedIds.add(nodeId));
    window.getSelection()?.removeAllRanges();
    updateSelection();
}

function getVisibleMindMapNodeCard(nodeId) {
    const card = nodeId ? document.getElementById(`card-${nodeId}`) : null;
    return card && card.getClientRects().length > 0 ? card : null;
}

function getMindMapClosestVisibleNodeId(nodeIds, referenceNodeId) {
    const referenceCard = getVisibleMindMapNodeCard(referenceNodeId);
    const referenceRect = referenceCard?.getBoundingClientRect();
    const referenceY = referenceRect ? referenceRect.top + referenceRect.height / 2 : 0;
    let closestId = null;
    let closestDistance = Infinity;

    (nodeIds || []).forEach(nodeId => {
        const card = getVisibleMindMapNodeCard(nodeId);
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const distance = referenceRect ? Math.abs(rect.top + rect.height / 2 - referenceY) : 0;
        if (distance < closestDistance) {
            closestId = nodeId;
            closestDistance = distance;
        }
    });
    return closestId;
}

function getMindMapKeyboardNavigationTarget(nodeId, key) {
    const node = findNode(state.data, nodeId);
    if (!node) return null;

    if (key === 'ArrowUp' || key === 'ArrowDown') {
        const parent = findParent(state.data, nodeId);
        if (!parent) return null;
        const branchSide = getMindMapNodeBranchSide(nodeId);
        const siblings = (parent.children || []).filter(sibling => {
            if (!getVisibleMindMapNodeCard(sibling.id)) return false;
            return parent.id !== state.data.id || getMindMapNodeBranchSide(sibling.id) === branchSide;
        });
        const index = siblings.findIndex(sibling => sibling.id === nodeId);
        const targetIndex = index + (key === 'ArrowUp' ? -1 : 1);
        return index >= 0 && targetIndex >= 0 && targetIndex < siblings.length
            ? siblings[targetIndex].id
            : null;
    }

    if (node.id === state.data.id) {
        const targetSide = key === 'ArrowLeft' ? 'left' : (key === 'ArrowRight' ? 'right' : null);
        if (!targetSide) return null;
        const children = (node.children || [])
            .filter(child => getMindMapNodeBranchSide(child.id) === targetSide)
            .map(child => child.id);
        return getMindMapClosestVisibleNodeId(children, node.id);
    }

    const branchSide = getMindMapNodeBranchSide(nodeId);
    const towardRoot = (branchSide === 'right' && key === 'ArrowLeft')
        || (branchSide === 'left' && key === 'ArrowRight');
    if (towardRoot) return findParent(state.data, nodeId)?.id || null;

    const awayFromRoot = (branchSide === 'right' && key === 'ArrowRight')
        || (branchSide === 'left' && key === 'ArrowLeft');
    if (!awayFromRoot) return null;
    return getMindMapClosestVisibleNodeId((node.children || []).map(child => child.id), node.id);
}

function keepMindMapKeyboardSelectionVisible(card) {
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const toolbarRect = document.querySelector('.toolbar')?.getBoundingClientRect();
    const margin = 24;
    const viewport = {
        left: margin,
        top: Math.max(margin, (toolbarRect?.bottom || 0) + 12),
        right: window.innerWidth - margin,
        bottom: window.innerHeight - margin
    };
    let dx = 0;
    let dy = 0;
    if (rect.left < viewport.left) dx = viewport.left - rect.left;
    else if (rect.right > viewport.right) dx = viewport.right - rect.right;
    if (rect.top < viewport.top) dy = viewport.top - rect.top;
    else if (rect.bottom > viewport.bottom) dy = viewport.bottom - rect.bottom;
    if (!dx && !dy) return;
    state.view.tx += dx;
    state.view.ty += dy;
    updateTransform();
}

function moveMindMapSelectionByArrow(key) {
    if (state.selectedIds.size !== 1) return false;
    const currentId = Array.from(state.selectedIds)[0];
    const targetId = getMindMapKeyboardNavigationTarget(currentId, key);
    if (!targetId || targetId === currentId) return false;

    clearSelectedMindMapRelation();
    clearSelectedMindMapSummary();
    state.selectedIds.clear();
    state.selectedIds.add(targetId);
    window.getSelection()?.removeAllRanges();
    updateSelection();
    keepMindMapKeyboardSelectionVisible(getVisibleMindMapNodeCard(targetId));
    return true;
}

function openMindMapEditor(node, readOnly = false, focusSource = false) {
    if (!node) return;
    if (isMindMapSplitReaderOpen()) closeMindMapInternalLinkPreview();
    const entityKind = getMindMapSummaryById(node.id) === node ? 'summary' : 'node';
    syncCurrentInput();
    state.editingNode = node;
    state.editingEntityKind = entityKind;
    state.isReadOnly = readOnly;
    $('#editorModal').classList.add('active');
    $('#modalWin').className = readOnly ? 'modal-win narrow' : 'modal-win';
    $('#modalTopicInput').value = entityKind === 'summary' ? (node.topic ?? '总结') : (node.topic || '');
    $('#modalTopicInput').disabled = readOnly;
    const sourceEditor = getMindMapSourceEditor();
    const content = entityKind === 'summary' ? getMindMapSummaryContent(node) : (node.content || '');
    loadMindMapSourceEditor(content);
    $('#editorTextarea').parentElement.style.display = readOnly ? 'none' : 'flex';
    $('#previewContent').innerHTML = renderMarkdown(content);
    processRichContent($('#previewContent'));
    $('#btn-close-modal').innerText = readOnly ? '关闭' : '完成';
    if (focusSource && !readOnly) {
        sourceEditor.focus();
        sourceEditor.setSelectionRange(sourceEditor.value.length, sourceEditor.value.length);
        sourceEditor.view?.dispatch({ scrollIntoView: true });
    }
}

function initializeMapClickEvents() {
    document.addEventListener('click', (e) => {
        const t = e.target;
        if(!t.closest('#btn-color') && !t.closest('.color-popup')) $('#colorPopup').classList.remove('show');
        if (!t.closest('[data-action="navigate-relation"]') && !t.closest('#relationNavigationMenu')) {
            closeMindMapRelationNavigationMenu();
        }
        const contentPreviewTrigger = t.closest('[data-action="preview-content"]');
        if (contentPreviewTrigger) {
            const card = contentPreviewTrigger.closest('.node-card');
            if (!card || !findNode(state.data, card.dataset.nodeId)) return;
            syncCurrentInput();
            syncActiveMindMapTab(false);
            openMindMapInternalLinkPreview({
                documentId: mindMapWorkbook.documentId,
                tabId: mindMapWorkbook.activeTabId,
                nodeId: card.dataset.nodeId,
            });
            e.stopPropagation();
            return;
        }
        const foldBtn = t.closest('.fold-btn');
        if(foldBtn) {
            const action = foldBtn.dataset.action;
            if(action === 'fold-root-left') {
                mapSearchState.revealedRootDirections.delete('left');
                state.data.foldedLeft = !state.data.foldedLeft; recordHistory(); renderTree(); return;
            }
            if(action === 'fold-root-right') {
                mapSearchState.revealedRootDirections.delete('right');
                state.data.foldedRight = !state.data.foldedRight; recordHistory(); renderTree(); return;
            }
            if(action === 'fold') {
                syncCurrentInput();
                const n = findNode(state.data, foldBtn.closest('.node-card').dataset.nodeId);
                mapSearchState.revealedNodeIds.delete(n.id);
                n.folded = !n.folded; recordHistory(); updateChildrenDOM(n.id); return;
            }
        }
        const relationNavigationTrigger = t.closest('[data-action="navigate-relation"]');
        if(relationNavigationTrigger) {
            const card = relationNavigationTrigger.closest('.node-card');
            if (card) openMindMapRelationNavigationMenu(card.dataset.nodeId, relationNavigationTrigger);
            return;
        }
        if(t.dataset.action === 'toggle-simple') {
            syncCurrentInput();
            const n = findNode(state.data, t.closest('.node-card').dataset.nodeId);
            toggleMindMapEntitySimpleMode(n);
            
            recordHistory(); 
            updateNodeDOM(n.id); 
            return;
        }

        if(t.dataset.action==='toggle-content') {
            syncCurrentInput();
            const n = findNode(state.data, t.closest('.node-card').dataset.nodeId);
            n.contentCollapsed = !n.contentCollapsed; recordHistory(); updateNodeDOM(n.id); return;
        }
        if(t.dataset.action==='auto-height') {
            syncCurrentInput();
            const n = findNode(state.data, t.closest('.node-card').dataset.nodeId);
            autoFitMindMapEntity(n, 'node', 'wh');
            return;
        }
        if(t.closest('#dock-handle')) { state.dockCollapsed = !state.dockCollapsed; renderDock(); }
    });
    document.addEventListener('dblclick', (e) => {
        const t = e.target;
        if (t.closest('[data-action="preview-content"]')) return;
        if (t.closest('.md-content a')) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        const splitPane = t.closest('.split-reader-pane');
        if (splitPane) {
            if (t.closest('button, input, textarea, select')) return;
            const node = findNode(state.data, splitPane.dataset.nodeId);
            if (node) openMindMapEditor(node, false, true);
            return;
        }
        
        // --- 修复：支持 Dock 卡片双击 ---
        const dockCard = t.closest('.dock-card');
        if(dockCard) {
            const idx = parseInt(dockCard.dataset.index);
            openMindMapEditor({ topic: dockData[idx].question, content: dockData[idx].answer }, true);
            return;
        }

        // 普通卡片与总结卡片共用双击手柄自适应；便利贴不再排除宽度重置。
        const resizeHandle = t.closest('.resize-handle');
        if (resizeHandle) {
            const resizeTarget = getMindMapResizeTarget(resizeHandle);
            if (resizeTarget) {
                autoFitMindMapEntity(resizeTarget.entity, resizeTarget.kind, resizeHandle.dataset.resize);
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        // --- 修复：双击卡片打开编辑 ---
        const header = t.closest('.card-header');
        if(header && !t.closest('.header-tools') && !t.classList.contains('node-topic')) {
            const n = findNode(state.data, header.closest('.node-card').dataset.nodeId);
            // 便利贴模式也可以双击打开编辑器 (可选)
            if (n) openMindMapEditor(n);
            return;
        }
        const body = t.closest('.card-body');
        if(body) {
            const n = findNode(state.data, body.closest('.node-card').dataset.nodeId);
            openMindMapEditor(n);
            return;
        }
    });

}

// !SECTION 节点选择与键盘导航

// SECTION 分屏阅读
const MINDMAP_SPLIT_READER_WIDTHS_KEY = 'mindmap_split_reader_widths';
const mindMapSplitReaderState = {
    nodes: [],
    layout: 'columns',
    ratios: { columns: {}, rows: {} },
    returnFocus: null,
    drag: null,
};

function isMindMapSplitReaderOpen() {
    return Boolean($('#mindMapSplitReader')?.classList.contains('active'));
}

// 在可用空间内保留各栏最小尺寸；窄窗口按实际空间等比分配。
function getMindMapSplitReaderSizes(ratios, available, minimum) {
    const total = ratios.reduce((sum, value) => sum + value, 0);
    const min = Math.min(minimum, available / ratios.length);
    const remaining = Math.max(0, available - min * ratios.length);
    const slack = ratios.map(value => Math.max(0, available * value / total - min));
    const slackTotal = slack.reduce((sum, value) => sum + value, 0);
    return slack.map(value => min + (slackTotal ? remaining * value / slackTotal : remaining / ratios.length));
}

function applyMindMapSplitReaderLayout() {
    if (!isMindMapSplitReaderOpen()) return;
    const reader = $('#mindMapSplitReader');
    const grid = $('#splitReaderGrid');
    const { nodes, layout, ratios } = mindMapSplitReaderState;
    const columns = layout === 'columns';
    const available = Math.max(0, (columns ? grid.clientWidth : grid.clientHeight) - (nodes.length - 1) * 10);
    const weights = ratios[layout][nodes.length] || nodes.map(() => 1 / nodes.length);
    const sizes = getMindMapSplitReaderSizes(weights, available, columns ? 280 : 120);
    const tracks = sizes.map(size => `${size}px`).join(' 10px ');
    reader.dataset.layout = layout;
    grid.style.gridTemplateColumns = columns ? tracks : 'minmax(0, 1fr)';
    grid.style.gridTemplateRows = columns ? 'minmax(0, 1fr)' : tracks;
    const layoutButton = $('#btn-split-reader-layout');
    layoutButton.innerHTML = `<i class="${columns ? 'ri-layout-row-line' : 'ri-layout-column-line'}" aria-hidden="true"></i>`;
    layoutButton.title = columns ? '切换为上下排列' : '切换为左右排列';
    layoutButton.setAttribute('aria-label', layoutButton.title);
    grid.querySelectorAll('.split-reader-resizer').forEach((handle, index) => {
        const pair = sizes[index] + sizes[index + 1];
        const min = Math.min(columns ? 280 : 120, pair / 2);
        handle.setAttribute('aria-orientation', columns ? 'vertical' : 'horizontal');
        handle.setAttribute('aria-valuemin', String(pair ? Math.round(min / pair * 100) : 0));
        handle.setAttribute('aria-valuemax', String(pair ? Math.round((pair - min) / pair * 100) : 100));
        handle.setAttribute('aria-valuenow', String(pair ? Math.round(sizes[index] / pair * 100) : 50));
    });
}

function saveMindMapSplitReaderWidths() {
    if (mindMapSplitReaderState.layout !== 'columns') return;
    void chrome.storage.local.set({ [MINDMAP_SPLIT_READER_WIDTHS_KEY]: mindMapSplitReaderState.ratios.columns })
        .catch(error => console.warn('[MindMap] 保存分屏宽度失败:', error));
}

function resizeMindMapSplitReaderPair(index, delta, initialSizes) {
    const { layout, nodes, ratios } = mindMapSplitReaderState;
    const columns = layout === 'columns';
    const sizes = initialSizes || Array.from($('#splitReaderGrid').querySelectorAll('.split-reader-pane'), pane => {
        const rect = pane.getBoundingClientRect();
        return columns ? rect.width : rect.height;
    });
    const pair = sizes[index] + sizes[index + 1];
    const min = Math.min(columns ? 280 : 120, pair / 2);
    const first = Math.max(min, Math.min(pair - min, sizes[index] + delta));
    const next = [...sizes];
    next[index] = first;
    next[index + 1] = pair - first;
    const total = next.reduce((sum, size) => sum + size, 0);
    if (total <= 0) return;
    ratios[layout][nodes.length] = next.map(size => size / total);
    applyMindMapSplitReaderLayout();
}

function finishMindMapSplitReaderResize() {
    const drag = mindMapSplitReaderState.drag;
    if (!drag) return;
    mindMapSplitReaderState.drag = null;
    $('#mindMapSplitReader').classList.remove('is-resizing');
    if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
    saveMindMapSplitReaderWidths();
}

function closeMindMapSplitReader(restoreFocus = true) {
    if (!isMindMapSplitReaderOpen()) return;
    finishMindMapSplitReaderResize();
    closeMindMapInternalLinkPreview();
    const reader = $('#mindMapSplitReader');
    reader.classList.remove('active');
    reader.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('split-reader-open');
    $('#splitReaderGrid').replaceChildren();
    const returnFocus = mindMapSplitReaderState.returnFocus;
    mindMapSplitReaderState.nodes = [];
    mindMapSplitReaderState.returnFocus = null;
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}

function updateMindMapSplitReaderNode(node, contentChanged) {
    if (!isMindMapSplitReaderOpen()) return null;
    const pane = Array.from($('#splitReaderGrid').querySelectorAll('.split-reader-pane'))
        .find(element => element.dataset.nodeId === node.id);
    if (!pane) return null;
    const title = pane.querySelector('.split-reader-title');
    title.textContent = String(node.topic || '').trim() || '未命名卡片';
    title.title = title.textContent;
    pane.querySelector('.split-reader-pane-head').hidden = !String(node.topic || '').trim();
    const body = pane.querySelector('.split-reader-content');
    if (contentChanged) {
        const scrollTop = body.scrollTop;
        body.innerHTML = String(node.content || '').trim()
            ? renderMarkdown(node.content)
            : '<p class="split-reader-empty">这张卡片暂无正文内容。</p>';
        body.scrollTop = scrollTop;
        void processRichContent(body).then(() => {
            if (body.isConnected) body.scrollTop = scrollTop;
        }).catch(error => console.warn('[MindMap] 分屏内容渲染失败:', error));
    }
    return body;
}

function openMindMapSplitReader() {
    const ids = Array.from(state.selectedIds);
    if (ids.length < 2 || ids.length > 4) return;
    const nodes = ids.map(id => findNode(state.data, id));
    if (nodes.some(node => !node)) return;
    mindMapSplitReaderState.returnFocus = document.activeElement;
    commitMindMapInlineEditor();
    mindMapSplitReaderState.nodes = nodes;
    mindMapSplitReaderState.layout = window.innerWidth < nodes.length * 280 + (nodes.length - 1) * 10 + 24 ? 'rows' : 'columns';
    isSpacePressed = false;
    document.body.classList.remove('space-mode');
    hideMindMapContentPreview();
    closeMindMapInternalLinkPreview();
    closeMapSearch();
    const grid = $('#splitReaderGrid');
    grid.replaceChildren();
    nodes.forEach((node, index) => {
        if (index > 0) {
            const handle = document.createElement('div');
            handle.className = 'split-reader-resizer';
            handle.tabIndex = 0;
            handle.dataset.index = String(index - 1);
            handle.setAttribute('role', 'separator');
            handle.setAttribute('aria-label', `调整第 ${index} 栏与第 ${index + 1} 栏的大小`);
            grid.appendChild(handle);
        }
        const pane = document.createElement('section');
        pane.className = 'split-reader-pane';
        pane.dataset.nodeId = node.id;
        const title = document.createElement('h2');
        title.className = 'split-reader-title';
        title.id = `split-reader-title-${index}`;
        title.textContent = String(node.topic || '').trim() || '未命名卡片';
        title.title = title.textContent;
        const body = document.createElement('div');
        body.className = 'split-reader-content md-content';
        body.tabIndex = 0;
        body.setAttribute('aria-labelledby', title.id);
        body.innerHTML = String(node.content || '').trim()
            ? renderMarkdown(node.content)
            : '<p class="split-reader-empty">这张卡片暂无正文内容。</p>';
        const header = document.createElement('div');
        header.className = 'split-reader-pane-head';
        header.hidden = !String(node.topic || '').trim();
        header.appendChild(title);
        pane.append(header, body);
        grid.appendChild(pane);
    });
    $('#splitReaderHeading').innerHTML = `分屏阅读 <span class="split-reader-count">${nodes.length} 张卡片</span>`;
    const reader = $('#mindMapSplitReader');
    reader.classList.add('active');
    reader.setAttribute('aria-hidden', 'false');
    document.body.classList.add('split-reader-open');
    applyMindMapSplitReaderLayout();
    grid.querySelectorAll('.split-reader-content').forEach(body => {
        void processRichContent(body).catch(error => console.warn('[MindMap] 分屏内容渲染失败:', error));
    });
    $('#btn-split-reader-close').focus({ preventScroll: true });
}

function initializeMindMapSplitReader() {
    const grid = $('#splitReaderGrid');
    $('#btn-split-reader-close').onclick = () => closeMindMapSplitReader();
    $('#btn-split-reader-layout').onclick = () => {
        finishMindMapSplitReaderResize();
        mindMapSplitReaderState.layout = mindMapSplitReaderState.layout === 'columns' ? 'rows' : 'columns';
        applyMindMapSplitReaderLayout();
    };
    grid.addEventListener('pointerdown', event => {
        const handle = event.target.closest('.split-reader-resizer');
        if (!handle || event.button !== 0 || mindMapSplitReaderState.drag) return;
        event.preventDefault();
        handle.focus();
        const columns = mindMapSplitReaderState.layout === 'columns';
        mindMapSplitReaderState.drag = {
            handle, pointerId: event.pointerId, index: Number(handle.dataset.index),
            start: columns ? event.clientX : event.clientY,
            sizes: Array.from(grid.querySelectorAll('.split-reader-pane'), pane => {
                const rect = pane.getBoundingClientRect();
                return columns ? rect.width : rect.height;
            }),
        };
        handle.setPointerCapture(event.pointerId);
        $('#mindMapSplitReader').classList.add('is-resizing');
    });
    grid.addEventListener('pointermove', event => {
        const drag = mindMapSplitReaderState.drag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const position = mindMapSplitReaderState.layout === 'columns' ? event.clientX : event.clientY;
        resizeMindMapSplitReaderPair(drag.index, position - drag.start, drag.sizes);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
        grid.addEventListener(type, event => {
            if (mindMapSplitReaderState.drag?.pointerId === event.pointerId) finishMindMapSplitReaderResize();
        });
    });
    grid.addEventListener('keydown', event => {
        const handle = event.target.closest('.split-reader-resizer');
        if (!handle) return;
        const columns = mindMapSplitReaderState.layout === 'columns';
        const keys = columns ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        resizeMindMapSplitReaderPair(Number(handle.dataset.index), (event.key === keys[0] ? -1 : 1) * (event.shiftKey ? 40 : 16));
        saveMindMapSplitReaderWidths();
    });
    document.addEventListener('keydown', event => {
        if (!isMindMapSplitReaderOpen() || event.defaultPrevented || $('#editorModal')?.classList.contains('active')) return;
        // 图片和流程图先处理自己的 Esc，保留底层分屏。
        if ($('#imagePreviewModal')?.classList.contains('active') || $('#mermaidModal')?.classList.contains('active')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if ($('#mindMapLinkPreview')?.classList.contains('is-open')) {
                closeMindMapInternalLinkPreview();
                $('#btn-split-reader-close').focus({ preventScroll: true });
            } else closeMindMapSplitReader();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a'
            && $('#mindMapSplitReader').contains(document.activeElement)) {
            const range = document.createRange();
            range.selectNodeContents(document.activeElement.closest('.split-reader-content') || grid);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            event.preventDefault();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            void saveMindMapData(true);
        } else if (event.key === 'Tab') {
            const scopes = [$('#mindMapSplitReader')];
            if ($('#mindMapLinkPreview')?.classList.contains('is-open')) scopes.push($('#mindMapLinkPreview'));
            const focusable = scopes.flatMap(scope => Array.from(scope.querySelectorAll('button, a[href], [tabindex="0"]')))
                .filter(element => !element.disabled && element.getClientRects().length > 0);
            const index = focusable.indexOf(document.activeElement);
            const next = index < 0 ? (event.shiftKey ? focusable.length - 1 : 0)
                : (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
            event.preventDefault();
            event.stopPropagation();
            focusable[next]?.focus();
        }
    }, { capture: true });
    new ResizeObserver(() => {
        finishMindMapSplitReaderResize();
        applyMindMapSplitReaderLayout();
    }).observe(grid);
    chrome.storage.local.get({ [MINDMAP_SPLIT_READER_WIDTHS_KEY]: {} }).then(result => {
        const saved = result?.[MINDMAP_SPLIT_READER_WIDTHS_KEY];
        [2, 3, 4].forEach(count => {
            const weights = saved?.[count];
            if (!mindMapSplitReaderState.ratios.columns[count] && Array.isArray(weights) && weights.length === count
                && weights.every(value => Number.isFinite(value) && value > 0 && value <= 1)) {
                mindMapSplitReaderState.ratios.columns[count] = weights;
            }
        });
        applyMindMapSplitReaderLayout();
    }).catch(error => console.warn('[MindMap] 读取分屏宽度失败:', error));
}
// !SECTION 分屏阅读

// SECTION 内容预览与鼠标交互
function clampMindMapContentPreview(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

function getMindMapRectOverlapArea(first, second) {
    const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    return width * height;
}

function getMindMapContentPreviewArrowMetrics(placement, cardRect, previewRect) {
    const isVerticalPlacement = placement === 'bottom' || placement === 'top';
    const target = isVerticalPlacement
        ? cardRect.left + cardRect.width / 2 - previewRect.left
        : cardRect.top + cardRect.height / 2 - previewRect.top;
    const edgeLength = isVerticalPlacement ? previewRect.width : previewRect.height;
    const offset = clampMindMapContentPreview(
        target,
        MINDMAP_CONTENT_PREVIEW_ARROW_INSET,
        edgeLength - MINDMAP_CONTENT_PREVIEW_ARROW_INSET,
    );
    return {
        offset,
        alignmentError: Math.abs(target - offset),
        edgeClearance: Math.min(offset, Math.max(0, edgeLength - offset)),
    };
}

function getMindMapContentPreviewArrowOffset(placement, cardRect, previewRect) {
    return getMindMapContentPreviewArrowMetrics(placement, cardRect, previewRect).offset;
}

function getMindMapContentPreviewAvailableContentHeight(placement, previewRect, contentRect, viewport) {
    const availableOuterHeight = placement === 'bottom'
        ? Math.max(0, viewport.bottom - previewRect.top)
        : placement === 'top'
            ? Math.max(0, previewRect.bottom - viewport.top)
            : Math.max(0, viewport.bottom - viewport.top);
    const outerChromeHeight = Math.max(0, previewRect.height - contentRect.height);
    return Math.max(0, availableOuterHeight - outerChromeHeight);
}

function getMindMapContentPreviewPlacement(cardRect, previewRect, viewport, occupiedRects = [], allowTop = false) {
    const previewWidth = previewRect.width;
    const previewHeight = previewRect.height;
    const cardCenterX = cardRect.left + cardRect.width / 2;
    const cardCenterY = cardRect.top + cardRect.height / 2;
    const viewportHeight = Math.max(0, viewport.bottom - viewport.top);
    const sideHeight = Math.min(
        previewHeight,
        Math.max(MINDMAP_CONTENT_PREVIEW_MIN_HEIGHT, viewportHeight),
    );
    const buildSideCandidate = (placement, availableWidth) => {
        const sideWidth = Math.min(previewWidth, Math.max(0, availableWidth));
        const horizontalFits = sideWidth >= MINDMAP_CONTENT_PREVIEW_MIN_WIDTH;
        const left = placement === 'right'
            ? cardRect.right + MINDMAP_CONTENT_PREVIEW_GAP
            : cardRect.left - MINDMAP_CONTENT_PREVIEW_GAP - sideWidth;
        const top = clampMindMapContentPreview(
            cardCenterY - sideHeight / 2,
            viewport.top,
            viewport.bottom - sideHeight,
        );
        const rect = {
            left,
            top,
            right: left + sideWidth,
            bottom: top + sideHeight,
        };
        const overlap = occupiedRects.reduce((total, occupied) => total + getMindMapRectOverlapArea(rect, occupied), 0);
        const arrow = getMindMapContentPreviewArrowMetrics(placement, cardRect, {
            left,
            top,
            width: sideWidth,
            height: sideHeight,
        });
        return {
            placement,
            left,
            top,
            maxHeight: sideHeight,
            maxWidth: sideWidth,
            availableHeight: viewportHeight,
            horizontalFits,
            fullyVisible: horizontalFits && rect.top >= viewport.top && rect.bottom <= viewport.bottom,
            overlap,
            arrowOffset: arrow.offset,
            arrowAlignmentError: arrow.alignmentError,
            arrowEdgeClearance: arrow.edgeClearance,
        };
    };

    const buildVerticalCandidate = placement => {
        const availableHeight = placement === 'top'
            ? Math.max(0, cardRect.top - MINDMAP_CONTENT_PREVIEW_GAP - viewport.top)
            : Math.max(0, viewport.bottom - cardRect.bottom - MINDMAP_CONTENT_PREVIEW_GAP);
        const candidateWidth = Math.min(previewWidth, Math.max(0, viewport.right - viewport.left));
        const candidateHeight = Math.min(
            previewHeight,
            Math.max(MINDMAP_CONTENT_PREVIEW_MIN_HEIGHT, availableHeight),
        );
        const left = clampMindMapContentPreview(
            cardCenterX - candidateWidth / 2,
            viewport.left,
            viewport.right - candidateWidth,
        );
        const top = placement === 'top'
            ? cardRect.top - MINDMAP_CONTENT_PREVIEW_GAP - candidateHeight
            : cardRect.bottom + MINDMAP_CONTENT_PREVIEW_GAP;
        const rect = {
            left,
            top,
            right: left + candidateWidth,
            bottom: top + candidateHeight,
        };
        const arrow = getMindMapContentPreviewArrowMetrics(placement, cardRect, {
            left,
            top,
            width: candidateWidth,
            height: candidateHeight,
        });
        return {
            placement,
            left,
            top,
            maxHeight: candidateHeight,
            maxWidth: candidateWidth,
            availableHeight,
            horizontalFits: candidateWidth >= MINDMAP_CONTENT_PREVIEW_MIN_WIDTH,
            verticallyUsable: availableHeight >= MINDMAP_CONTENT_PREVIEW_MIN_HEIGHT,
            fullyVisible: rect.top >= viewport.top && rect.bottom <= viewport.bottom,
            overlap: occupiedRects.reduce(
                (total, occupied) => total + getMindMapRectOverlapArea(rect, occupied),
                0,
            ),
            arrowOffset: arrow.offset,
            arrowAlignmentError: arrow.alignmentError,
            arrowEdgeClearance: arrow.edgeClearance,
        };
    };
    const bottomCandidate = buildVerticalCandidate('bottom');
    const topCandidate = allowTop ? buildVerticalCandidate('top') : null;
    const rightAvailableWidth = viewport.right - cardRect.right - MINDMAP_CONTENT_PREVIEW_GAP;
    const leftAvailableWidth = cardRect.left - MINDMAP_CONTENT_PREVIEW_GAP - viewport.left;
    const sideCandidates = [
        buildSideCandidate('right', rightAvailableWidth),
        buildSideCandidate('left', leftAvailableWidth),
    ];
    const horizontalCandidates = sideCandidates.filter(candidate => candidate.horizontalFits);
    const usableTopCandidates = topCandidate?.verticallyUsable && topCandidate.horizontalFits
        ? [topCandidate]
        : [];
    // 卡片工具栏启用时不使用上方；关闭悬停工具栏后，上方与其他方向一起按可见性和遮挡面积择优。
    const eligibleCandidates = horizontalCandidates.length > 0
        ? [...horizontalCandidates, bottomCandidate, ...usableTopCandidates]
        : [bottomCandidate, ...usableTopCandidates];
    const selected = eligibleCandidates.reduce((best, candidate) => {
        if (!best) return candidate;
        const candidateArrowAligned = candidate.arrowAlignmentError <= 1;
        const bestArrowAligned = best.arrowAlignmentError <= 1;
        if (candidateArrowAligned !== bestArrowAligned) return candidateArrowAligned ? candidate : best;
        if (candidate.fullyVisible !== best.fullyVisible) return candidate.fullyVisible ? candidate : best;
        const candidateIsCrampedBottom = candidate.placement === 'bottom'
            && candidate.availableHeight < MINDMAP_CONTENT_PREVIEW_BOTTOM_COMFORT_HEIGHT;
        const bestIsCrampedBottom = best.placement === 'bottom'
            && best.availableHeight < MINDMAP_CONTENT_PREVIEW_BOTTOM_COMFORT_HEIGHT;
        // 下方只剩狭窄走廊时，优先选择可读的左右（或上方）候选；不能因为下方恰好无重叠就塞进 Tab 栏前的缝隙。
        if (candidateIsCrampedBottom !== bestIsCrampedBottom) {
            return candidateIsCrampedBottom ? best : candidate;
        }
        const candidateArrowComfortable = candidate.arrowEdgeClearance >= MINDMAP_CONTENT_PREVIEW_ARROW_CORNER_CLEARANCE;
        const bestArrowComfortable = best.arrowEdgeClearance >= MINDMAP_CONTENT_PREVIEW_ARROW_CORNER_CLEARANCE;
        if (candidateArrowComfortable !== bestArrowComfortable) return candidateArrowComfortable ? candidate : best;
        if (candidate.arrowAlignmentError !== best.arrowAlignmentError) {
            return candidate.arrowAlignmentError < best.arrowAlignmentError ? candidate : best;
        }
        return candidate.overlap < best.overlap ? candidate : best;
    }, null);

    return selected;
}

function clearMindMapContentPreviewTimer(name) {
    if (mindMapContentPreviewState[name]) {
        clearTimeout(mindMapContentPreviewState[name]);
        mindMapContentPreviewState[name] = null;
    }
}

function hideMindMapContentPreview() {
    clearMindMapContentPreviewTimer('showTimer');
    clearMindMapContentPreviewTimer('hideTimer');
    mindMapContentPreviewState.el?.remove();
    mindMapContentPreviewState.el = null;
    mindMapContentPreviewState.card = null;
}

function scheduleMindMapContentPreviewHide() {
    clearMindMapContentPreviewTimer('showTimer');
    clearMindMapContentPreviewTimer('hideTimer');
    mindMapContentPreviewState.hideTimer = setTimeout(() => {
        const card = mindMapContentPreviewState.card;
        const preview = mindMapContentPreviewState.el;
        if (card?.matches(':hover') || preview?.matches(':hover')) return;
        hideMindMapContentPreview();
    }, 260);
}

function getMindMapContentPreviewViewport() {
    const toolbarRect = document.querySelector('.toolbar')?.getBoundingClientRect();
    const toolbarBottom = toolbarRect && toolbarRect.bottom > 0 ? toolbarRect.bottom + MINDMAP_CONTENT_PREVIEW_MARGIN : 0;
    return {
        left: MINDMAP_CONTENT_PREVIEW_MARGIN,
        top: Math.max(MINDMAP_CONTENT_PREVIEW_MARGIN, toolbarBottom),
        right: window.innerWidth - MINDMAP_CONTENT_PREVIEW_MARGIN,
        bottom: getMindMapUsableViewportBottom(MINDMAP_CONTENT_PREVIEW_MARGIN),
    };
}

function getMindMapContentPreviewOccupiedRects(sourceCard) {
    return Array.from(document.querySelectorAll('.node-card, .summary-editor, .card-floating-tools, .card-dock-container, .toolbar, .mindmap-tabs, .map-search-panel, .mindmap-settings-popover'))
        .filter(element => {
            if (element === sourceCard || element.getClientRects().length === 0) return false;
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden';
        })
        .map(element => element.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
}

function fitMindMapContentPreviewToViewport(preview, previewContent, card, placement, viewport) {
    if (!preview?.isConnected || !previewContent || !card?.isConnected) return;

    // 使用真实排版尺寸扣除外框厚度，避免“正文高度刚好、外框仍越界”。
    for (let pass = 0; pass < 2; pass += 1) {
        const previewRect = preview.getBoundingClientRect();
        const contentRect = previewContent.getBoundingClientRect();
        const availableContentHeight = getMindMapContentPreviewAvailableContentHeight(
            placement.placement,
            previewRect,
            contentRect,
            viewport,
        );
        const maxContentHeight = Math.min(placement.maxHeight, availableContentHeight);
        previewContent.style.minHeight = `${Math.min(MINDMAP_CONTENT_PREVIEW_MIN_HEIGHT, maxContentHeight)}px`;
        previewContent.style.maxHeight = `${maxContentHeight}px`;

        const resizedRect = preview.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const desiredLeft = placement.placement === 'right'
            ? cardRect.right + MINDMAP_CONTENT_PREVIEW_GAP
            : placement.placement === 'left'
                ? cardRect.left - MINDMAP_CONTENT_PREVIEW_GAP - resizedRect.width
                : cardRect.left + cardRect.width / 2 - resizedRect.width / 2;
        const correctedLeft = clampMindMapContentPreview(
            desiredLeft,
            viewport.left,
            viewport.right - resizedRect.width,
        );
        preview.style.left = `${correctedLeft}px`;
        if (placement.placement === 'top') {
            preview.style.top = `${clampMindMapContentPreview(
                cardRect.top - MINDMAP_CONTENT_PREVIEW_GAP - resizedRect.height,
                viewport.top,
                viewport.bottom - resizedRect.height,
            )}px`;
        } else if (placement.placement !== 'bottom') {
            const cardCenterY = cardRect.top + cardRect.height / 2;
            preview.style.top = `${clampMindMapContentPreview(
                cardCenterY - resizedRect.height / 2,
                viewport.top,
                viewport.bottom - resizedRect.height,
            )}px`;
        }
    }

    const actualArrowOffset = getMindMapContentPreviewArrowOffset(
        placement.placement,
        card.getBoundingClientRect(),
        preview.getBoundingClientRect(),
    );
    preview.style.setProperty('--preview-arrow-offset', `${actualArrowOffset}px`);
}

function positionMindMapContentPreview(preview, previewContent, card, resetNaturalSize = false) {
    if (!preview?.isConnected || !previewContent || !card?.isConnected) return null;
    if (resetNaturalSize) {
        // 富内容（特别是 Mermaid）渲染后必须先恢复自然尺寸，再重新比较四个方向。
        preview.style.removeProperty('max-width');
        previewContent.style.removeProperty('min-height');
        previewContent.style.removeProperty('max-height');
    }

    const viewport = getMindMapContentPreviewViewport();
    const placement = getMindMapContentPreviewPlacement(
        card.getBoundingClientRect(),
        preview.getBoundingClientRect(),
        viewport,
        getMindMapContentPreviewOccupiedRects(card),
        !mindMapSettings.cardToolbarHover,
    );
    preview.dataset.placement = placement.placement;
    preview.style.maxWidth = `${placement.maxWidth}px`;
    previewContent.style.maxHeight = `${placement.maxHeight}px`;
    preview.style.left = `${placement.left}px`;
    preview.style.top = `${placement.top}px`;
    fitMindMapContentPreviewToViewport(preview, previewContent, card, placement, viewport);
    return placement;
}

function getMindMapDocumentOutline(content, body) {
    const source = String(content || '').trim();
    if (source.length < MINDMAP_DOCUMENT_OUTLINE_MIN_LENGTH || !body) return [];
    // 以最终渲染出的标题为唯一真值，避免数学块、分隔线与 Markdown 预处理导致误判。
    const headings = Array.from(body.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .map(element => ({
            element,
            level: Number(element.tagName.slice(1)),
            text: String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
        }))
        .filter(heading => heading.text);
    return headings.length >= MINDMAP_DOCUMENT_OUTLINE_MIN_HEADINGS ? headings : [];
}

function getMindMapLayoutOffsetTop(element) {
    let top = 0;
    let current = element;
    while (current) {
        top += Number(current.offsetTop) || 0;
        current = current.offsetParent;
    }
    return top;
}

function getMindMapHeadingScrollTop(body, target, inset = 8) {
    if (!body || !target) return 0;
    // offsetTop 是未经画布 transform 缩放的布局坐标，可直接与 scrollTop 配合。
    const desiredTop = getMindMapLayoutOffsetTop(target) - getMindMapLayoutOffsetTop(body) - inset;
    const maxScrollTop = Math.max(0, (Number(body.scrollHeight) || 0) - (Number(body.clientHeight) || 0));
    return Math.min(maxScrollTop, Math.max(0, desiredTop));
}

function getMindMapContentPreviewDescriptor(card) {
    if (!card?.isConnected) return null;
    const node = findNode(state.data, card.dataset.nodeId);
    if (!String(node?.content || '').trim()) return null;

    const body = card.querySelector('.card-body');
    if (card.classList.contains('simple') || !body) {
        if ($('#mindMapLinkPreview')?.classList.contains('is-open')) return null;
        return mindMapSettings.cardContentHover ? { mode: 'content', node, headings: [] } : null;
    }

    if (!mindMapSettings.documentOutline) return null;
    const headings = getMindMapDocumentOutline(node.content, body);
    return headings.length > 0 ? { mode: 'outline', node, headings } : null;
}

function createMindMapDocumentOutlineHTML(headings) {
    const baseLevel = Math.min(...headings.map(heading => heading.level));
    return `<nav class="card-body card-document-outline" aria-label="文档目录">
        <div class="card-document-outline-header">
            <span><i class="ri-list-check-2" aria-hidden="true"></i> 文档目录</span>
            <span>${headings.length} 个标题</span>
        </div>
        <ol>${headings.map((heading, index) => `
            <li style="--outline-depth:${heading.level - baseLevel}">
                <button type="button" data-heading-index="${index}" title="${escapeHtml(heading.text)}">
                    <span class="card-document-outline-level">H${heading.level}</span>
                    <span class="card-document-outline-text">${escapeHtml(heading.text)}</span>
                </button>
            </li>`).join('')}
        </ol>
    </nav>`;
}

function canShowMindMapContentPreview(card) {
    return Boolean(getMindMapContentPreviewDescriptor(card));
}

function showMindMapContentPreview(card) {
    clearMindMapContentPreviewTimer('showTimer');
    clearMindMapContentPreviewTimer('hideTimer');
    const descriptor = getMindMapContentPreviewDescriptor(card);
    if (!descriptor) return;
    if (mindMapContentPreviewState.card === card && mindMapContentPreviewState.el) return;

    hideMindMapContentPreview();
    const { mode, node, headings } = descriptor;
    const preview = document.createElement('div');
    preview.className = `card-content-preview${card.classList.contains('simple') ? ' simple-preview' : ''}${mode === 'outline' ? ' outline-preview' : ''}`;
    preview.dataset.placement = 'bottom';
    preview.tabIndex = 0;
    preview.setAttribute('aria-label', `${node.topic || '卡片'}的${mode === 'outline' ? '文档目录' : '内容预览'}`);
    // 全文沿用卡片 Markdown 渲染路径；目录只复用同一气泡外层与定位逻辑。
    preview.innerHTML = mode === 'outline'
        ? createMindMapDocumentOutlineHTML(headings)
        : createMindMapNodeContentBodyHTML(node.content);
    const previewContent = preview.firstElementChild;
    preview.addEventListener('pointerenter', () => clearMindMapContentPreviewTimer('hideTimer'));
    preview.addEventListener('pointerleave', event => {
        if (!card.contains(event.relatedTarget)) scheduleMindMapContentPreviewHide();
    });
    preview.addEventListener('pointerdown', () => preview.focus());
    if (mode === 'outline') {
        preview.addEventListener('click', event => {
            const trigger = event.target.closest('[data-heading-index]');
            if (!trigger) return;
            const body = card.querySelector('.card-body');
            const target = headings[Number(trigger.dataset.headingIndex)]?.element;
            if (!body || !target || !body.contains(target)) return;

            const targetTop = getMindMapHeadingScrollTop(body, target);
            body.scrollTo({ top: targetTop, behavior: 'smooth' });
            target.classList.remove('mindmap-outline-target');
            void target.offsetWidth;
            target.classList.add('mindmap-outline-target');
            setTimeout(() => target.classList.remove('mindmap-outline-target'), 1400);
            event.preventDefault();
            event.stopPropagation();
        });
    }
    preview.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            const range = document.createRange();
            range.selectNodeContents(preview);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            event.preventDefault();
        }
    });
    document.body.appendChild(preview);
    const processRichContentResult = mode === 'content' ? processRichContent(previewContent) : null;
    // 长内容绝不能因富内容布局或浏览器恢复行为而从中间开始显示。
    const resetPreviewScrollTop = () => {
        if (preview.isConnected) previewContent.scrollTop = 0;
    };
    resetPreviewScrollTop();
    requestAnimationFrame(resetPreviewScrollTop);
    setTimeout(resetPreviewScrollTop, 0);

    positionMindMapContentPreview(preview, previewContent, card);
    preview.classList.add('is-visible');
    mindMapContentPreviewState.card = card;
    mindMapContentPreviewState.el = preview;
    Promise.resolve(processRichContentResult).then(() => {
        requestAnimationFrame(() => {
            if (!preview.isConnected) return;
            positionMindMapContentPreview(preview, previewContent, card, true);
            requestAnimationFrame(() => {
                if (!preview.isConnected) return;
                positionMindMapContentPreview(preview, previewContent, card, true);
                resetPreviewScrollTop();
            });
        });
    });
}

function scheduleMindMapContentPreviewShow(card) {
    clearMindMapContentPreviewTimer('hideTimer');
    if (!canShowMindMapContentPreview(card) || mindMapContentPreviewState.card === card) return;
    clearMindMapContentPreviewTimer('showTimer');
    mindMapContentPreviewState.showTimer = setTimeout(() => {
        if (card.matches(':hover')) showMindMapContentPreview(card);
    }, 30);
}

function initializeMindMapContentPreview() {
    document.addEventListener('pointerover', event => {
        const card = event.target.closest('.node-card');
        if (!card || card.contains(event.relatedTarget)) return;
        scheduleMindMapContentPreviewShow(card);
    });
    document.addEventListener('pointerout', event => {
        const card = event.target.closest('.node-card');
        const preview = mindMapContentPreviewState.el;
        if (!card || card.contains(event.relatedTarget) || preview?.contains(event.relatedTarget)) return;
        scheduleMindMapContentPreviewHide();
    });
    window.addEventListener('resize', hideMindMapContentPreview);
}

function initializeMapMouseEvents() {
    // --- 新增变量：用于性能优化的节流阀 ---
    let rafId = null; 
    let lastDropTarget = null; // 缓存上一次的放置目标，避免全局 querySelectorAll
    $('#app').addEventListener('wheel', (e) => {
        // --- 1. 判断是否处于“强制导航模式” ---
        // 只要按下了 空格、Shift 或 Ctrl/Meta，就视为用户想操作脑图视图
        const isGlobalNav = isSpacePressed || e.shiftKey || e.ctrlKey || e.metaKey;

        // --- 2. 内部滚动检查 ---
        // 只有在【没有】按下任何导航键时，才检查鼠标是否在卡片滚动区
        if (!isGlobalNav) {
            const scrollable = e.target.closest('.card-body, .summary-card-body') || 
                               (e.target.closest('.node-card.simple') && e.target.closest('.card-header'));
            
            // 如果在这些区域内，且内容确实溢出，则允许默认滚动
            if(scrollable && scrollable.scrollHeight > scrollable.clientHeight) { 
                e.stopPropagation(); 
                return; 
            }
        }

        // --- 3. 执行脑图操作 ---
        e.preventDefault(); // 关键：阻止浏览器默认的 Ctrl+滚轮 缩放页面行为
        
        // 场景 A: [Ctrl] + 滚轮 -> 水平平移 (你的新需求)
        if (e.ctrlKey || e.metaKey) {
            state.view.tx -= e.deltaY;
        } 
        // 场景 B: [Shift] + 滚轮 -> 垂直平移 (保持标准习惯)
        else if (e.shiftKey) {
            state.view.ty -= e.deltaY;
        } 
        // 场景 C: [空格] + 滚轮  或者  [无按键] -> 缩放
        // (原来的空格是水平平移，现在你希望空格是缩放，所以让它落入这里的逻辑)
        else {
            // 计算缩放比例
            const f = e.deltaY > 0 ? 0.9 : 1.1;
            const ns = Math.min(Math.max(0.1, state.view.scale * f), 5);
            
            // 以鼠标为中心进行缩放计算
            state.view.tx = Math.round(e.clientX - (e.clientX - state.view.tx) * (ns/state.view.scale));
            state.view.ty = Math.round(e.clientY - (e.clientY - state.view.ty) * (ns/state.view.scale));
            state.view.scale = ns;
        }
        updateTransform(); 
        saveStorage();
        
    }, {passive:false});

    // SECTION 鼠标按下事件
    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; 
        // 预览气泡位于画布外；在其中选择、复制文字时不能触发画布平移或卡片操作。
        if (e.target.closest('.card-content-preview, .mindmap-link-preview, .md-content a, [data-action="preview-content"]')) return;
         // ▼▼▼ [新增功能] 空格键按下时，强制进入平移模式 (优先级最高) ▼▼▼
        if (isSpacePressed) {
            state.mode = 'PANNING';
            state.startPos = {x: e.clientX, y: e.clientY}; 
            state.viewStart = {x: state.view.tx, y: state.view.ty};
            
            document.body.classList.add('is-dragging'); // 配合 CSS 改变光标为 grabbing
            
            // 关键：阻止默认行为（防止选中节点文字）
            e.preventDefault(); 
            // 关键：直接返回，不执行后面的节点选中、拖拽判断
            return;
        }
        if(state.mode!=='IDLE') return;
        if(e.target.closest('.modal-mask') || 
           e.target.closest('.mymodal') ||
           e.target.closest('.toolbar') || 
           e.target.closest('.mindmap-settings-popover') ||
           e.target.closest('.color-popup') || 
           e.target.closest('#contextMenu') || 
           e.target.closest('#editorContextMenu') ||
           e.target.closest('.mindmap-tabs') ||
           e.target.closest('#mindMapTabMenu') ||
           e.target.closest('.map-search-panel') ||
           e.target.closest('.relation-hit') ||
           e.target.closest('.summary-editor') ||
           e.target.closest('.mindmap-selection-actions') ||
           e.target.closest('.fold-btn') ||    // 新增
           e.target.closest('.header-tools')   // 新增
        ) return;
        if (e.target.closest('.bookmark-manager-container')) return;
        clearSelectedMindMapRelation();
        clearSelectedMindMapSummary();
        state.startPos = {x:e.clientX, y:e.clientY}; state.viewStart = {x:state.view.tx, y:state.view.ty};

        if(e.target.classList.contains('resize-handle')) {
            const c = e.target.closest('.node-card');
            const n = findNode(state.data, c.dataset.nodeId);
            beginMindMapResize(e, n, 'node', c);
            return;
        }

        const card = e.target.closest('.node-card');
        if(card) {
            const id = card.dataset.nodeId;
            // 排除按钮和折叠钮
            if(!e.target.closest('.header-tools') && !e.target.closest('.fold-btn')) {
                
                // ▼▼▼ 关键修复：判断点击的是不是输入框本身 ▼▼▼
                const isEditingText = e.target.classList.contains('node-topic');
                
                if(e.button===0) {
                    // 如果正在点击文字进行编辑，不要触发拖拽逻辑！
                    if (isEditingText) {
                        return; // 直接返回，允许原生光标行为
                    }

                    // 只有点在文字以外的空白处，才触发选中和拖拽
                    if(e.ctrlKey) { 
                        if(state.selectedIds.has(id)) state.selectedIds.delete(id); 
                        else state.selectedIds.add(id); 
                    } else if(!state.selectedIds.has(id)) { 
                        state.selectedIds.clear(); state.selectedIds.add(id); 
                    }
                    updateSelection();
                    
                    // 只要点的不是 fold-btn 和 tools，Header 的任何位置（除文字外）都可以拖拽
                    if(e.target.closest('.card-header')) {
                        state.mode = 'PRE_DRAG_NODE'; 
                        state.drag.source='node'; 
                        state.drag.nodeId=id; 
                        state.drag.title=findNode(state.data, id).topic;
                    }
                }
                return;
            }
        }

        const dc = e.target.closest('.dock-card');
        if(dc) {
            const idx = parseInt(dc.dataset.index);
            state.activeDockIndex = idx;
            document.querySelectorAll('.dock-card').forEach(el => el.classList.remove('active'));
            dc.classList.add('active');
            if(e.button===0) { state.mode = 'PRE_DRAG_DOCK'; state.drag.source='dock'; state.drag.data=dockData[idx]; state.drag.title=dockData[idx].question; }
            return;
        }


        if(!e.target.closest('.card-dock-container')) {
            if(e.button===0) {
                if(e.ctrlKey) { 
                    state.mode = 'SELECTING'; 
                    $('#selRect').style.display='block'; 
                    $('#selRect').style.width='0'; 
                    $('#selRect').style.height='0'; 
                }
                else { 
                    // 点击空白画布时提交并退出内联编辑，避免 :focus-within 让悬浮工具栏残留。
                    commitMindMapInlineEditor();
                    state.mode = 'PANNING';
                    e.preventDefault(); 

                    // 画布按下时先保留卡片选中；只有无位移单击才在 onMouseUp 中清除。

                    // --- 优化 2：【关键修复】不要重新渲染整个 Dock ---
                    // 仅仅是通过 DOM 操作移除 .active 类，开销几乎为 0
                    if (state.activeDockIndex !== -1) {
                        state.activeDockIndex = -1; 
                        const activeCard = document.querySelector('.dock-card.active');
                        if (activeCard) activeCard.classList.remove('active');
                    }
                    // 修复：清除文字选中
                    if(window.getSelection) window.getSelection().removeAllRanges();
                }
                updateTransform(); 
            }
        }
    });

    // !SECTION 鼠标按下事件
    // SECTION 鼠标移动事件
    document.addEventListener('mousemove', (e) => {
        if(state.mode==='IDLE') return;
        if(e.buttons===0) { onMouseUp(e); return; }
        const dx = e.clientX - state.startPos.x, dy = e.clientY - state.startPos.y;

        if(state.mode==='PANNING') { state.view.tx = Math.round(state.viewStart.x + dx); state.view.ty = Math.round(state.viewStart.y + dy); updateTransform(); }
        else if(state.mode==='SELECTING') {
            const l=dx<0?e.clientX:state.startPos.x, t=dy<0?e.clientY:state.startPos.y;
            const r=$('#selRect'); r.style.left=l+'px'; r.style.top=t+'px'; r.style.width=Math.abs(dx)+'px'; r.style.height=Math.abs(dy)+'px';
        }
        else if(state.mode==='RESIZING') {
            const n = state.resize.node; // 当前正在操作的主节点
            const resizeKind = state.resize.kind || 'node';
            const s = state.view.scale;
            
            // 1. 计算新的尺寸值
            let newWidth = null;
            let newHeight = null;

            // --- A. 计算宽度 ---
            if(state.resize.dir.includes('w')) { 
                const card = state.resize.element || getMindMapResizableElement(n, resizeKind);
                const isLeftCard = card && card.classList.contains('left-side');
                let delta = e.clientX - state.resize.mx;
                if(isLeftCard) delta = -delta; 
                
                const rawWidth = state.resize.startW + (delta * state.resize.widthPointerFactor / s);
                newWidth = Math.max(state.resize.minWidth, Math.min(600, rawWidth)); // 限制范围
            }
            
            // --- B. 计算高度 ---
            if(state.resize.dir.includes('h')) { 
                const delta = (e.clientY - state.resize.my) * state.resize.heightPointerDirection;
                const isSimple = n.isSimple;
                const maxHeightLimit = isSimple ? 400 : 800;
                const rawHeight = state.resize.startH + (delta * state.resize.heightPointerFactor / s);
                newHeight = Math.max(state.resize.minHeight, Math.min(maxHeightLimit, rawHeight));
            }

            // 3. 应用到当前操作的节点
            applyMindMapEntitySize(n, resizeKind, newWidth, newHeight, n.isSimple);

            // 4. 同步应用到其他选中的节点
            if (resizeKind === 'node' && state.selectedIds.size > 1) {
                state.selectedIds.forEach(id => {
                    if (id === n.id) return; // 跳过自己
                    const targetNode = findNode(state.data, id);
                    if (targetNode) {
                        applyMindMapEntitySize(targetNode, 'node', newWidth, newHeight, n.isSimple);
                    }
                });
                // ▼▼▼ 【核心新增】视图补偿逻辑：让光标像磁铁一样吸住把手 ▼▼▼
                const handle = state.resize.handleEl;
                if (handle) {
                    // 1. 获取把手在当前屏幕上的新位置 (此时尺寸已变，Flex布局可能导致它跑偏)
                    const hRect = handle.getBoundingClientRect();
                    
                    // 2. 计算把手中心点
                    const hCenterX = hRect.left + hRect.width / 2;
                    const hCenterY = hRect.top + hRect.height / 2;

                    // 3. 计算“漂移量”：把手当前位置 减去 鼠标当前位置
                    const driftX = hCenterX - e.clientX;
                    const driftY = hCenterY - e.clientY;

                    // 4. 反向补偿：如果把手向右飘了(driftX>0)，就把画布向左移(tx减小)
                    // 这样视觉上把手就不动了，紧紧跟随鼠标
                    if (driftX !== 0 || driftY !== 0) {
                        state.view.tx -= driftX;
                        state.view.ty -= driftY;
                        updateTransform(); // 立即应用新的画布位置
                    }
                }
                // ▲▲▲ 新增结束 ▲▲▲
            }
            // 总结卡片已经直接更新当前 DOM；拖拽期间再次执行布局规划会改写它的
            // transform/位置，让手柄脱离光标。节点缩放仍需实时刷新关联的总结括号。
            if (resizeKind !== 'summary') scheduleRenderMindMapSummaries();

            // stabilizeRoot();
        }
        else if(state.mode==='PRE_DRAG_NODE' || state.mode==='PRE_DRAG_DOCK') {
            if(Math.hypot(dx, dy) > 5) {
                state.mode = 'DRAGGING';
                $('#app').className = 'cursor-grabbing';
                const g = $('#ghostNode'); g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; g.style.display = 'flex';
                $('#ghostTitle').innerText = state.drag.title;
                if(state.drag.source==='node') {
                    $('#ghostIcon').className='ri-drag-move-line';
                    const c = state.selectedIds.size;
                    $('#ghostCount').style.display = (c>1 && state.selectedIds.has(state.drag.nodeId)) ? 'inline-block' : 'none';
                    if($('#ghostCount').style.display!=='none') $('#ghostCount').innerText = `+${c-1}`;
                    const orig = document.querySelector(`.node-card[data-node-id="${state.drag.nodeId}"]`);
                    if(orig) orig.classList.add('is-dragging-original');
                } else {
                    $('#ghostIcon').className='ri-add-box-line'; $('#ghostCount').style.display='none';
                }
            }
        }
        else if(state.mode==='DRAGGING') {
            $('#ghostNode').style.left = e.clientX + 'px'; 
            $('#ghostNode').style.top = e.clientY + 'px';
            
            if (state.drag.source !== 'node') {     // --- 可选优化：根据是否按 Ctrl 改变图标 ---
                // 如果按住 Ctrl 显示“加号(复制)”，否则显示“箭头(移动)”
                const iconClass = e.ctrlKey ? 'ri-add-box-line' : 'ri-arrow-right-line';
                $('#ghostIcon').className = iconClass;
            }
            $('#insertLine').style.display='none';
            document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
            state.drag.targetId=null; state.drag.dropType=null;

            const el = document.elementFromPoint(e.clientX, e.clientY);
            const c = el ? el.closest('.node-card') : null;
            
            if(!c) {
                const rootEl = document.getElementById(`card-${state.data.id}`);
                if(rootEl) {
                    const rRect = rootEl.getBoundingClientRect();
                    if(Math.hypot(e.clientX-(rRect.left+rRect.width/2), e.clientY-(rRect.top+rRect.height/2)) < 200) {
                        state.drag.targetId = state.data.id; state.drag.dropType = 'CHILD'; rootEl.classList.add('drop-target');
                        return;
                    }
                }
            }

            if(c) {
                const tid = c.dataset.nodeId;
                let valid = true;
                if(state.drag.source==='node') { if(tid===state.drag.nodeId || isDescendant(state.data, state.drag.nodeId, tid)) valid=false; }
                if(valid) {
                    state.drag.targetId=tid;
                    const rect = c.getBoundingClientRect();
                    
                    if(tid === state.data.id) { 
                        state.drag.dropType='CHILD'; c.classList.add('drop-target'); 
                    } else {
                        const ry = e.clientY - rect.top;
                        if(ry < rect.height*0.25) { state.drag.dropType='BEFORE'; const l=$('#insertLine'); l.style.display='block'; l.style.left=rect.left+'px'; l.style.top=(rect.top-4)+'px'; l.style.width=rect.width+'px'; }
                        else if(ry > rect.height*0.75) { state.drag.dropType='AFTER'; const l=$('#insertLine'); l.style.display='block'; l.style.left=rect.left+'px'; l.style.top=(rect.bottom+2)+'px'; l.style.width=rect.width+'px'; }
                        else { state.drag.dropType='CHILD'; c.classList.add('drop-target'); }
                    }
                }
            }
        }
    });

    // !SECTION 鼠标移动事件

    document.addEventListener('mouseup', onMouseUp);
}

// !SECTION 内容预览与鼠标交互

// SECTION 导图内链接预览
const mindMapInternalLinkPreviewState = {
    target: null,
    resolution: null,
};

function closeMindMapInternalLinkPreview() {
    const panel = $('#mindMapLinkPreview');
    if (!panel) return;
    suspendMindMapDocumentPreview();
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    mindMapInternalLinkPreviewState.target = null;
    mindMapInternalLinkPreviewState.resolution = null;
}

function closeMindMapInvalidLinkPreview() {
    const target = mindMapInternalLinkPreviewState.target;
    if (!target) return;
    // 当前页以运行中的树为准，撤销/重做后 Tab 快照可能尚未同步。
    const node = target.documentId === mindMapWorkbook.documentId
        && (target.tabId === mindMapWorkbook.activeTabId
            ? findNode(state.data, target.nodeId)
            : resolveMindMapInternalLink(target).node);
    if (!node) closeMindMapInternalLinkPreview();
}

function getMindMapInternalLinkPreviewError(resolution) {
    if (resolution?.reason === 'document') return '该链接属于其他导图，当前页面无法预览。';
    if (resolution?.reason === 'tab') return '链接指向的页面已不存在。';
    if (resolution?.reason === 'node') return '链接指向的卡片已不存在。';
    return '链接格式无效，无法预览。';
}

function isSameMindMapInternalLinkTarget(left, right) {
    if (!left || !right) return false;
    return left.documentId === right.documentId
        && left.tabId === right.tabId
        && left.nodeId === right.nodeId;
}

// SECTION 导图内链接预览宽度调整
function initializeMindMapInternalLinkPreviewResizer() {
    const panel = $('#mindMapLinkPreview');
    const resizer = $('#mindMapLinkPreviewResizer');
    if (!panel || !resizer) return;

    let preferredWidth = null;
    let hasUserAdjustedWidth = false;
    let activePointerId = null;
    let dragStartX = 0;
    let dragStartWidth = 0;

    function getMaxWidth() {
        // 左侧留 12px 边距，右侧预留 14px 手柄和 45px 书签按钮。
        return Math.max(0, window.innerWidth - 71);
    }

    function getWidthLimits() {
        const max = getMaxWidth();
        return { min: Math.min(280, max), max };
    }

    function clampWidth(width) {
        const limits = getWidthLimits();
        return Math.min(limits.max, Math.max(limits.min, width));
    }

    function updateResizerValue(width) {
        const limits = getWidthLimits();
        resizer.setAttribute('aria-valuenow', String(Math.round(width)));
        resizer.setAttribute('aria-valuemin', String(Math.round(limits.min)));
        resizer.setAttribute('aria-valuemax', String(Math.round(limits.max)));
        resizer.setAttribute('aria-valuetext', `预览区宽度 ${Math.round(width)} 像素`);
    }

    function applyPreferredWidth() {
        if (preferredWidth !== null) panel.style.width = `${clampWidth(preferredWidth)}px`;
        updateResizerValue(panel.getBoundingClientRect().width);
    }

    function setPreferredWidth(width) {
        hasUserAdjustedWidth = true;
        preferredWidth = clampWidth(width);
        panel.style.width = `${preferredWidth}px`;
        updateResizerValue(preferredWidth);
    }

    function savePreferredWidth() {
        void chrome.storage.local.set({ [MINDMAP_INTERNAL_LINK_PREVIEW_WIDTH_STORAGE_KEY]: preferredWidth })
            .catch(error => console.warn('[MindMap] 保存导图内链接预览宽度失败:', error));
    }

    function finishResize(event) {
        if (activePointerId === null || (event && event.pointerId !== activePointerId)) return;
        activePointerId = null;
        panel.classList.remove('is-resizing');
        if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
        if (preferredWidth !== null) savePreferredWidth();
    }

    resizer.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        activePointerId = event.pointerId;
        dragStartX = event.clientX;
        dragStartWidth = panel.getBoundingClientRect().width;
        panel.classList.add('is-resizing');
        resizer.setPointerCapture(event.pointerId);
    });
    resizer.addEventListener('pointermove', event => {
        if (event.pointerId !== activePointerId) return;
        setPreferredWidth(dragStartWidth + event.clientX - dragStartX);
    });
    resizer.addEventListener('pointerup', finishResize);
    resizer.addEventListener('pointercancel', finishResize);
    resizer.addEventListener('lostpointercapture', finishResize);
    resizer.addEventListener('keydown', event => {
        const step = event.shiftKey ? 40 : 16;
        const currentWidth = panel.getBoundingClientRect().width;
        let nextWidth;
        if (event.key === 'ArrowRight') nextWidth = currentWidth + step;
        else if (event.key === 'ArrowLeft') nextWidth = currentWidth - step;
        else if (event.key === 'Home') nextWidth = getWidthLimits().min;
        else if (event.key === 'End') nextWidth = getWidthLimits().max;
        else return;

        event.preventDefault();
        hasUserAdjustedWidth = true;
        setPreferredWidth(nextWidth);
        savePreferredWidth();
    });

    window.addEventListener('resize', applyPreferredWidth);
    chrome.storage.local.get({ [MINDMAP_INTERNAL_LINK_PREVIEW_WIDTH_STORAGE_KEY]: null })
        .then(result => {
            const savedWidth = Number(result?.[MINDMAP_INTERNAL_LINK_PREVIEW_WIDTH_STORAGE_KEY]);
            if (!hasUserAdjustedWidth && Number.isFinite(savedWidth) && savedWidth > 0) {
                preferredWidth = savedWidth;
                applyPreferredWidth();
            } else {
                updateResizerValue(panel.getBoundingClientRect().width);
            }
        })
        .catch(error => console.warn('[MindMap] 读取导图内链接预览宽度失败:', error));
}
// !SECTION 导图内链接预览宽度调整

function openMindMapInternalLinkPreview(targetOrHref) {
    const panel = $('#mindMapLinkPreview');
    if (!panel) return false;

    const target = typeof targetOrHref === 'string'
        ? parseMindMapInternalLink(targetOrHref)
        : targetOrHref;
    if (panel.classList.contains('is-open')
        && isSameMindMapInternalLinkTarget(mindMapInternalLinkPreviewState.target, target)) {
        closeMindMapInternalLinkPreview();
        return true;
    }
    const resolution = resolveMindMapInternalLink(target);
    suspendMindMapDocumentPreview();
    panel.dataset.previewMode = 'link';
    panel.setAttribute('aria-label', '卡片内容预览');
    const title = $('#mindMapLinkPreviewTitle');
    const body = $('#mindMapLinkPreviewBody');
    const jumpButton = $('#btn-mindmap-link-jump');
    if (!title || !body || !jumpButton) return false;

    hideMindMapContentPreview();
    mindMapInternalLinkPreviewState.target = resolution.target;
    mindMapInternalLinkPreviewState.resolution = resolution;
    body.replaceChildren();
    body.scrollTop = 0;

    if (resolution.node && resolution.tab) {
        title.textContent = String(resolution.node.topic || '').trim() || '未命名卡片';
        jumpButton.disabled = false;

        const content = String(resolution.node.content || '').trim();
        if (content) {
            const contentBody = document.createElement('div');
            contentBody.className = 'mindmap-link-preview-markdown md-content';
            contentBody.innerHTML = renderMarkdown(content);
            body.appendChild(contentBody);
            void processRichContent(contentBody);
        } else {
            const empty = document.createElement('div');
            empty.className = 'mindmap-link-preview-empty';
            empty.textContent = '这张卡片暂无正文内容。';
            body.appendChild(empty);
        }
    } else {
        title.textContent = '无法预览链接';
        jumpButton.disabled = true;
        const error = document.createElement('div');
        error.className = 'mindmap-link-preview-error';
        error.textContent = getMindMapInternalLinkPreviewError(resolution);
        body.appendChild(error);
    }

    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    return true;
}

function jumpToMindMapInternalLinkTarget() {
    const { target, resolution } = mindMapInternalLinkPreviewState;
    if (!target || !resolution?.node || !resolution.tab) {
        showTopToast('❌ 链接目标不可用');
        return false;
    }

    const shouldSwitchTab = mindMapWorkbook.activeTabId !== target.tabId;
    closeMindMapSplitReader(false);
    closeMindMapInternalLinkPreview();
    if (shouldSwitchTab && !activateMindMapTab(target.tabId)) {
        showTopToast('❌ 无法打开链接所在页面');
        return false;
    }

    const locate = () => {
        if (typeof jumpToMindMapRelatedCard === 'function') {
            jumpToMindMapRelatedCard(target.nodeId);
        }
    };
    if (shouldSwitchTab) requestAnimationFrame(() => requestAnimationFrame(locate));
    else locate();
    return true;
}

function initializeMindMapInternalLinkPreview() {
    initializeMindMapInternalLinkPreviewResizer();
    $('#btn-mindmap-link-close')?.addEventListener('click', closeMindMapInternalLinkPreview);
    $('#btn-mindmap-link-jump')?.addEventListener('click', jumpToMindMapInternalLinkTarget);
    document.addEventListener('keydown', event => {
        if (!event.defaultPrevented && event.key === 'Escape' && $('#mindMapLinkPreview')?.classList.contains('is-open')) {
            event.preventDefault();
            closeMindMapInternalLinkPreview();
        }
    });
}

// !SECTION 导图内链接预览

// SECTION Markdown 编辑器
function insertMindMapLinkIntoEditor(href) {
    const editor = getMindMapSourceEditor();
    const target = parseMindMapInternalLink(href);
    if (!editor || !target) {
        showTopToast('⚠️ 剪贴板中没有有效的导图内链接');
        return false;
    }

    const targetResolution = resolveMindMapInternalLink(target);
    if (!targetResolution.node) {
        showTopToast('⚠️ 该链接不属于当前导图，或目标卡片已删除');
        return false;
    }

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.slice(start, end).replace(/\r?\n/g, ' ').trim();
    if (!selectedText) {
        showTopToast('⚠️ 请先选中要添加链接的文字');
        return false;
    }

    const replacement = `[${selectedText.replace(/\]/g, '\\\]')}](${target.href || href})`;
    const oldScrollTop = editor.scrollTop;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(start, end);
    replaceMindMapEditorSelection(editor, replacement);
    editor.setSelectionRange(start, start + replacement.length);
    editor.scrollTop = oldScrollTop;
    notifyMindMapSourceEditorInput(editor);
    showTopToast(`🔗 已为“${selectedText}”添加导图内链接`);
    return true;
}

async function insertMindMapLinkFromClipboard() {
    try {
        const href = await navigator.clipboard.readText();
        return insertMindMapLinkIntoEditor(href);
    } catch (error) {
        console.warn('[MindMap] 读取导图内链接失败:', error);
        showTopToast('❌ 无法读取剪贴板中的导图内链接');
        return false;
    }
}

// SECTION Markdown 编辑器预览区宽度调整
function initializeEditorPreviewResizer() {
    const modalBody = $('#editorModal .modal-body');
    const previewPane = $('#editorModal .preview-pane');
    const resizer = $('#editorPreviewResizer');
    if (!modalBody || !previewPane || !resizer) return;

    let preferredWidth = null;
    let activePointerId = null;
    let dragStartX = 0;
    let dragStartWidth = 0;

    function getAvailableWidth() {
        return Math.max(0, modalBody.clientWidth - resizer.offsetWidth);
    }

    function getWidthLimits() {
        const availableWidth = getAvailableWidth();
        const minEditorWidth = Math.min(280, availableWidth * 0.35);
        const minPreviewWidth = Math.min(240, availableWidth * 0.3);
        return {
            min: minPreviewWidth,
            max: Math.max(minPreviewWidth, availableWidth - minEditorWidth),
        };
    }

    function clampWidth(width) {
        const limits = getWidthLimits();
        return Math.min(limits.max, Math.max(limits.min, width));
    }

    function updateResizerValue(width) {
        const availableWidth = getAvailableWidth();
        const limits = getWidthLimits();
        const percentage = availableWidth > 0 ? Math.round((width / availableWidth) * 100) : 50;
        resizer.setAttribute('aria-valuenow', String(percentage));
        resizer.setAttribute('aria-valuemin', String(Math.round((limits.min / Math.max(availableWidth, 1)) * 100)));
        resizer.setAttribute('aria-valuemax', String(Math.round((limits.max / Math.max(availableWidth, 1)) * 100)));
        resizer.setAttribute('aria-valuetext', `预览区宽度 ${Math.round(width)} 像素`);
    }

    function applyPreferredWidth() {
        if (modalBody.clientWidth <= 0) return;
        if (preferredWidth === null) {
            previewPane.style.removeProperty('flex-basis');
            updateResizerValue(previewPane.getBoundingClientRect().width);
            return;
        }

        const width = clampWidth(preferredWidth);
        previewPane.style.flexBasis = `${width}px`;
        updateResizerValue(width);
    }

    function setPreviewWidth(width) {
        if (modalBody.clientWidth <= 0) return;
        preferredWidth = clampWidth(width);
        previewPane.style.flexBasis = `${preferredWidth}px`;
        updateResizerValue(preferredWidth);
    }

    function savePreferredWidth() {
        void chrome.storage.local.set({ [MINDMAP_EDITOR_PREVIEW_WIDTH_STORAGE_KEY]: preferredWidth })
            .catch(error => console.warn('[MindMap] 保存预览区宽度失败:', error));
    }

    function finishResize(event) {
        if (activePointerId === null || (event && event.pointerId !== activePointerId)) return;
        activePointerId = null;
        modalBody.classList.remove('is-resizing-preview');
        if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
        if (preferredWidth !== null) savePreferredWidth();
    }

    resizer.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        activePointerId = event.pointerId;
        dragStartX = event.clientX;
        dragStartWidth = previewPane.getBoundingClientRect().width;
        modalBody.classList.add('is-resizing-preview');
        resizer.setPointerCapture(event.pointerId);
    });
    resizer.addEventListener('pointermove', event => {
        if (event.pointerId !== activePointerId) return;
        setPreviewWidth(dragStartWidth - (event.clientX - dragStartX));
    });
    resizer.addEventListener('pointerup', finishResize);
    resizer.addEventListener('pointercancel', finishResize);
    resizer.addEventListener('lostpointercapture', finishResize);
    resizer.addEventListener('keydown', event => {
        const step = event.shiftKey ? 40 : 16;
        const currentWidth = previewPane.getBoundingClientRect().width;
        let nextWidth;
        if (event.key === 'ArrowLeft') nextWidth = currentWidth + step;
        else if (event.key === 'ArrowRight') nextWidth = currentWidth - step;
        else if (event.key === 'Home') nextWidth = getWidthLimits().min;
        else if (event.key === 'End') nextWidth = getWidthLimits().max;
        else return;

        event.preventDefault();
        setPreviewWidth(nextWidth);
        preferredWidth = clampWidth(nextWidth);
        savePreferredWidth();
    });

    const resizeObserver = new ResizeObserver(applyPreferredWidth);
    resizeObserver.observe(modalBody);
    window.addEventListener('resize', applyPreferredWidth);

    chrome.storage.local.get({ [MINDMAP_EDITOR_PREVIEW_WIDTH_STORAGE_KEY]: null })
        .then(result => {
            const savedWidth = Number(result?.[MINDMAP_EDITOR_PREVIEW_WIDTH_STORAGE_KEY]);
            if (Number.isFinite(savedWidth) && savedWidth > 0) preferredWidth = savedWidth;
            applyPreferredWidth();
        })
        .catch(error => console.warn('[MindMap] 读取预览区宽度设置失败:', error));
}
// !SECTION Markdown 编辑器预览区宽度调整

function initializeEditorToolbar() {
    initializeMindMapSourceEditor();
    initializeEditorPreviewResizer();
    $('#editorModal').onmousedown = (e) => { if(e.target===$('#editorModal')) $('#btn-close-modal').click(); };
    $('#btn-fullscreen').onclick = () => $('#modalWin').classList.toggle('fullscreen');
    const editor = getMindMapSourceEditor(), preview = $('#previewContent');
    editor.addEventListener('input', () => { preview.innerHTML = renderMarkdown(editor.value); processRichContent(preview); });

    editor.addEventListener('paste', event => {
        const pastedText = event.clipboardData?.getData('text/plain') || '';
        if (!parseMindMapInternalLink(pastedText)) return;
        if (editor.selectionStart === editor.selectionEnd) return;
        event.preventDefault();
        insertMindMapLinkIntoEditor(pastedText);
    });
    editor.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            void insertMindMapLinkFromClipboard();
        }
    });
    $('#btn-insert-mindmap-link')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void insertMindMapLinkFromClipboard();
    });

    editor.addEventListener('scroll', () => { if(!isSyncingEditor) { isSyncingPreview=true; const p=editor.scrollTop/Math.max(1,editor.scrollHeight-editor.clientHeight); preview.scrollTop=p*(preview.scrollHeight-preview.clientHeight); setTimeout(()=>isSyncingPreview=false,10); } });
    preview.addEventListener('scroll', () => { if(!isSyncingPreview) { isSyncingEditor=true; const p=preview.scrollTop/Math.max(1,preview.scrollHeight-preview.clientHeight); editor.scrollTop=p*(editor.scrollHeight-editor.clientHeight); setTimeout(()=>isSyncingEditor=false,10); } });
    $('#btn-close-modal').onclick = () => {
        let splitReaderBody = null;
        if(!state.isReadOnly && state.editingNode) {
            const t = $('#modalTopicInput').value;
            const c = getMindMapSourceEditor().value;
            const editingKind = state.editingEntityKind || 'node';
            const previousContent = editingKind === 'summary'
                ? getMindMapSummaryContent(state.editingNode)
                : (state.editingNode.content || '');
            
            // 检查是否有变化
            const topicChanged = state.editingNode.topic !== t;
            const contentChanged = previousContent !== c;

            if(topicChanged || contentChanged) { 
                state.editingNode.topic = t; 
                if (editingKind === 'summary') setMindMapSummaryContent(state.editingNode, c);
                else state.editingNode.content = c;
                recordHistory(); 

                if (editingKind === 'summary') {
                    scheduleRenderMindMapSummaries();
                } else {

                    // 核心修复逻辑：
                    // 1. 如果内容(Content)变了，因为涉及到 body 的增删和图标的显示隐藏，必须重建 DOM。
                    // 2. 如果仅仅是标题(Topic)变了，为了性能可以直接修改文字，但为了保险起见，建议统一调用 updateNodeDOM，
                    //    或者像下面这样区分处理：

                    if (contentChanged) {
                        // 内容变了（包括删除干净、从无到有），必须更新结构
                        updateNodeDOM(state.editingNode.id);
                    } else if (topicChanged) {
                        // 只有标题变了，简单更新文字即可（避免闪烁）
                        const card = document.getElementById(`card-${state.editingNode.id}`);
                        if(card) card.querySelector('.node-topic').innerText = t;
                        updateNodeDOM(state.editingNode.id);
                    }
                }
            }
            splitReaderBody = updateMindMapSplitReaderNode(state.editingNode, contentChanged);
        }
        $('#editorModal').classList.remove('active'); 
        setCodeMenuOpen(false);
        state.editingNode = null;
        state.editingEntityKind = 'node';
        splitReaderBody?.focus({ preventScroll: true });
    };
    
    
    
    // 绑定按钮事件（保持不变，注意 e.preventDefault 防止按钮抢焦点）
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault(); // 关键：防止点击按钮导致 textarea 失去焦点
            e.stopPropagation();
            const cmd = btn.dataset.cmd;
            if(cmd === 'bold') insertTextFormat('**', '**');
            if(cmd === 'italic') insertTextFormat('*', '*');
            if(cmd === 'highlight') insertTextFormat('<mark>', '</mark>');
        };
    });

    // --- 1. 颜色菜单交互逻辑 ---

    const colorMenu = $('#editorColorMenu');
    const toggleBtn = $('#btn-toggle-color');
    const codeMenu = $('#editorCodeMenu');
    const codeButton = $('#btn-insert-code-block');
    const codeLanguages = [
        ['Python', 'python'], ['Mermaid', 'mermaid'], ['Interactive', 'interactive'],
        ['MATLAB', 'matlab'], ['JavaScript', 'javascript'], ['TypeScript', 'typescript'],
        ['HTML', 'html'], ['CSS', 'css'], ['JSON', 'json'], ['SQL', 'sql'],
        ['Bash', 'bash'], ['PowerShell', 'powershell'], ['C', 'c'], ['C++', 'cpp'],
        ['Java', 'java'], ['Go', 'go'], ['Rust', 'rust'], ['YAML', 'yaml'],
        ['XML', 'xml'], ['纯文本', '']
    ];

    function setCodeMenuOpen(open) {
        codeMenu.classList.toggle('show', open);
        codeButton.setAttribute('aria-expanded', String(open));
        if (open) {
            colorMenu.classList.remove('show');
            codeMenu.scrollTop = 0;
        }
    }

    codeLanguages.forEach(([label, language]) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.textContent = label;
        item.setAttribute('role', 'menuitem');
        item.tabIndex = -1;
        item.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            setCodeMenuOpen(false);
            insertEditorCodeBlock(language);
        };
        codeMenu.appendChild(item);
    });

    codeButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setCodeMenuOpen(!codeMenu.classList.contains('show'));
    };
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.editor-code-dropdown')) setCodeMenuOpen(false);
    });
    document.addEventListener('keydown', (event) => {
        if (!codeMenu.classList.contains('show')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            setCodeMenuOpen(false);
            codeButton.focus({ preventScroll: true });
            return;
        }
        if (event.key === 'Tab') {
            setCodeMenuOpen(false);
            return;
        }
        if (!event.target.closest('.editor-code-dropdown')) return;
        const items = Array.from(codeMenu.children);
        const index = items.indexOf(document.activeElement);
        let next;
        if (event.key === 'ArrowDown') next = (index + 1) % items.length;
        if (event.key === 'ArrowUp') next = (index <= 0 ? items.length : index) - 1;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = items.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        items[next].focus({ preventScroll: true });
        items[next].scrollIntoView({ block: 'nearest' });
    }, true);

    // 点击按钮切换菜单显示
    toggleBtn.onclick = (e) => {
        e.stopPropagation(); // 防止冒泡
        e.preventDefault();  // 防止焦点丢失
        setCodeMenuOpen(false);
        const isShow = colorMenu.classList.contains('show');
        
        // 关闭其他可能存在的弹窗（可选）
        document.querySelectorAll('.show').forEach(el => el.classList.remove('show'));
        
        if (!isShow) {
            colorMenu.classList.add('show');
        }
    };

    // 点击空白处关闭菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.color-dropdown-wrapper')) {
            colorMenu.classList.remove('show');
        }
    });

    // --- 2. 预设颜色点击事件 ---
    document.querySelectorAll('.editor-swatch').forEach(swatch => {
        swatch.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const color = swatch.dataset.val;
            // 调用我们之前写好的防跳动插入函数
            insertTextFormat(`<span style="color:${color}">`, '</span>');
            
            // 选完后关闭菜单
            colorMenu.classList.remove('show');
        };
    });

    // --- 3. 自定义颜色选择器事件 ---
// --- 3. 自定义颜色选择器事件 (完美防抖防嵌套版) ---
    let colorDragSnapshot = null;

    $('#editorCustomColor').oninput = (e) => {
        const textarea = getMindMapSourceEditor();
        
        // 1. 建立快照：仅在拖拽开始的第一刻记录“干净”的文本和选区
        if (!colorDragSnapshot) {
            colorDragSnapshot = {
                text: textarea.value,
                editorState: textarea.view?.state,
                start: textarea.selectionStart,
                end: textarea.selectionEnd,
                scrollTop: textarea.scrollTop
            };
        }

        // 2. ▼▼▼ 关键修复：每次预览前，先强制还原到干净状态 ▼▼▼
        restoreMindMapSourceEditorSnapshot(textarea, colorDragSnapshot.text, colorDragSnapshot.editorState);
        textarea.setSelectionRange(colorDragSnapshot.start, colorDragSnapshot.end);
        
        // 3. 在干净的文本上应用颜色 (预览模式)
        insertTextFormat(`<span style="color:${e.target.value}">`, '</span>', false);

        // 4. 保持滚动位置，防止跳动
        textarea.scrollTop = colorDragSnapshot.scrollTop;
    };
    
    $('#editorCustomColor').onchange = (e) => {
         $('#editorColorMenu').classList.remove('show');
        
        const textarea = getMindMapSourceEditor();
        
        // 5. 提交前恢复原始文本，确保正式替换可以完整撤销。
        if (colorDragSnapshot) {
            restoreMindMapSourceEditorSnapshot(textarea, colorDragSnapshot.text, colorDragSnapshot.editorState);
            textarea.setSelectionRange(colorDragSnapshot.start, colorDragSnapshot.end);
            textarea.scrollTop = colorDragSnapshot.scrollTop;
            colorDragSnapshot = null; // 释放快照
        }

        // 6. 正式提交 (记录历史)
        insertTextFormat(`<span style="color:${e.target.value}">`, '</span>', true); 
        
        e.target.blur();
    };

    // 防止自定义选择器点击时冒泡导致菜单立刻关闭
    $('#editorCustomColor').onclick = (e) => {
        e.stopPropagation();
    };

    // --- 1. 防止工具栏抢夺焦点（解决选中消失问题） ---
    const toolbar = document.querySelector('.editor-toolbar');
    if (toolbar) {
        toolbar.addEventListener('mousedown', (e) => {
            // 关键：只有当点击的不是 input（比如原生取色器）时，才阻止默认行为
            // 因为阻止 input 的 mousedown 可能会导致无法弹出取色盘
            if (e.target.tagName !== 'INPUT') {
                e.preventDefault();
            }
        });
    }

    const btnCopyMd = $('#btn-copy-md');
    if (btnCopyMd) {
        btnCopyMd.onclick = async (e) => {
            // 防止按钮获取焦点导致编辑器失焦（可选）
            e.preventDefault(); 
            
            const content = getMindMapSourceEditor().value;
            
            if (!content) {
                showTopToast('⚠️ 内容为空，无需复制');
                return;
            }

            try {
                await navigator.clipboard.writeText(content);
                showTopToast('✅ Markdown内容已复制！');
                
                // 视觉反馈：按钮闪烁一下
                const originalIcon = btnCopyMd.innerHTML;
                btnCopyMd.innerHTML = '<i class="ri-check-line" style="color:var(--primary-color)"></i>';
                setTimeout(() => {
                    btnCopyMd.innerHTML = originalIcon;
                }, 1000);

            } catch (err) {
                console.log('复制失败:', err);
                showTopToast('❌ 复制失败，请手动复制');
            }
        };
    }
    // ▲▲▲ [新增结束] ▲▲▲
    initializeImageUpload(); 
}



// Markdown 源码格式化

function insertEditorCodeBlock(language) {
    const textarea = getMindMapSourceEditor();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selection = text.slice(start, end);
    const oldScrollTop = textarea.scrollTop;
    // 源码含有反引号时，使用更长的围栏，避免提前结束代码块。
    const fenceLength = Math.max(3, ...(selection.match(/`+/g) || []).map(run => run.length + 1));
    const fence = '`'.repeat(fenceLength);
    const prefix = (start > 0 && text[start - 1] !== '\n' ? '\n' : '') + fence + language + '\n';
    const suffix = (selection.endsWith('\n') ? '' : '\n') + fence
        + (end < text.length && text[end] !== '\n' ? '\n' : '');

    isSyncingPreview = true;
    isSyncingEditor = true;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(start, end);
    replaceMindMapEditorSelection(textarea, prefix + selection + suffix);
    const contentStart = start + prefix.length;
    textarea.setSelectionRange(contentStart, contentStart + selection.length);
    notifyMindMapSourceEditorInput(textarea);
    textarea.scrollTop = oldScrollTop;
    setTimeout(() => {
        isSyncingPreview = false;
        isSyncingEditor = false;
    }, 100);
}

function insertTextFormat(prefix, suffix, restoreFocus = true) {
    const textarea = getMindMapSourceEditor();
    
    // 1. 记录状态
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const oldScrollTop = textarea.scrollTop;
    const text = textarea.value;
    
    if (start === end && prefix !== '') return; 

    // 2. 锁定同步
    isSyncingPreview = true; 
    isSyncingEditor = true;

    const selection = text.substring(start, end);
    let replacement = '';
    let newEnd = end;

    // --- 3. 智能判断 (核心修复：支持多行匹配) ---
    const isWrapped = selection.startsWith(prefix) && selection.endsWith(suffix);
    const isHtmlTag = prefix.startsWith('<') && suffix.startsWith('</');

    if (isWrapped) {
        // 解包
        replacement = selection.substring(prefix.length, selection.length - suffix.length);
        newEnd = start + replacement.length;
    } 
    // ▼▼▼ 修复点：使用 [\s\S] 替代 . 以支持多行文本的颜色替换 ▼▼▼
    else if (isHtmlTag && selection.match(/^<span style="color:[\s\S]*?">[\s\S]*<\/span>$/)) {
        // 颜色替换：剥离旧颜色（支持多行）
        const rawText = selection.replace(/^<span style="color:[\s\S]*?">/, '').replace(/<\/span>$/, '');
        replacement = prefix + rawText + suffix;
        newEnd = start + replacement.length;
    } else {
        // 包裹
        replacement = prefix + selection + suffix;
        newEnd = start + replacement.length;
    }

    // --- 4. 执行替换 ---
    if (restoreFocus) {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(start, end);
        replaceMindMapEditorSelection(textarea, replacement);
        textarea.setSelectionRange(start, newEnd);
    } else {
        // 预览模式
        textarea.value = text.substring(0, start) + replacement + text.substring(end);
        textarea.setSelectionRange(start, newEnd);
    }

    // 5. 恢复滚动
    textarea.scrollTop = oldScrollTop;

    // 6. 触发预览更新
    notifyMindMapSourceEditorInput(textarea);

    setTimeout(() => {
        isSyncingPreview = false;
        isSyncingEditor = false;
    }, 100);
};

// !SECTION Markdown 编辑器

