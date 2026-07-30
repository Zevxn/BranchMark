const DRAG_CONFIG = {
    'chat.deepseek.com': {
        targetSelectors: [
            'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'blockquote', 'table', 
            '.md-code-block', '.katex-display' 
        ],
        ignoreSelectors:'button, input, textarea, .ds-icon, .ds-atom-button, textarea',
        rootSelector: '.ds-markdown',
        scrollerSelector: 'div.ds-scroll-area[style*="--message-list-max-width"]',
        processor: convertDeepSeek,
    },
    'grok.com': {
        targetSelectors: [
            'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'ul', 'ol', 'blockquote', 'table', 
            '.md-code-block', '.katex-display' 
        ],
        ignoreSelectors:'button, input, textarea, .ds-icon, .ds-atom-button, textarea',
        rootSelector: 'div.response-content-markdown',
        scrollerSelector: 'div.scrollbar-gutter-stable',
        processor: convertDeepSeek,
    },
    'gemini.google.com': {
        targetSelectors: [
            'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'ul', 'ol', 'blockquote', 'table', 
            'div.code-block', '.math-block' 
        ],
        ignoreSelectors:'button, input, textarea, a, textarea',
        rootSelector: 'div.markdown-main-panel',
        scrollerSelector: '#chat-history > infinite-scroller',
        processor: convertGemini,
    },
    'chatgpt.com': {
        targetSelectors: [
            'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'ul', 'ol', 'blockquote', 'table', 
            'pre', '.katex' 
        ],
        ignoreSelectors:'button, input, textarea, a, textarea',
        rootSelector: 'div[data-message-author-role="assistant"]',
        scrollerSelector: 'div[data-scroll-root]',
        processor: convertChatGPT,
    },
    'www.kimi.com': {
        targetSelectors: [
            'p', 'h1:not(.title)', 'h2', 'h3', 'h4', 'h5', 'h6',//h1.title 是kimi深度研究时的顶部标题，复制时会被误选中
            'ul', 'ol', 'blockquote', 'table', '.paragraph','pre'
        ],
        ignoreSelectors:'button, input, a, textarea,.chat-input-editor-container, .k1-research, .thinking-container',
        rootSelector: '.segment-assistant .segment-content-box',
        scrollerSelector: '#chat-container > div.layout-content-main > div > div > div',
        processor: convertKimi,
    },
    'www.doubao.com': {
        targetSelectors: [
            'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'ul', 'ol', 'blockquote', 'table', '.paragraph-element',
            'pre','[data-custom-copy-text]','[class^="container-"]>[class^="container-"]:not(.md-box-root)'
        ],
        ignoreSelectors:'button, input, textarea, a, textarea',
        rootSelector: 'div[data-message-id]',
        scrollerSelector: 'div[data-testid="message-list"]',
        processor: convertDoubao,
    },
    'yuanbao.tencent.com': {
        targetSelectors: [
            'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'ul', 'ol', 'blockquote', 'table', '.ybc-p','.paragraph','pre','.katex'
        ],
        ignoreSelectors:'button, input, textarea, a, textarea',
        rootSelector: '.hyc-common-markdown',
        scrollerSelector: '#chat-content > div > div.agent-chat__list__content-wrapper',
        processor: convertYuanbao,
    },
    'www.qianwen.com': {
        targetSelectors: [
            'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'ul', 'ol', 'blockquote', 'table', '.paragraph',
            'pre'
        ],
        ignoreSelectors:'button, input, textarea, a, textarea',
        rootSelector: '.tongyi-markdown',
        scrollerSelector: 'div.message-list-scroll-container',
        processor: convertKimi,
    },
    'preview.html': {
        targetSelectors: [
            'li','ul', 'ol', 'table', 'blockquote', 
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            '.mermaid-wrapper', '.code-block-container', '.katex-display', 
            'p', 'pre'
        ],
        ignoreSelectors:'button, input, textarea, a, textarea',
        rootSelector: '.md-content',
        scrollerSelector: 'body',
        processor: convertPreview,
    }
}

const ENABLE_DS_DRAG = true;
const LOCAL = location.href.includes('preview.html')?'preview.html':location.hostname;
const LOCAL_CONFIG = DRAG_CONFIG[LOCAL];
class MarkDownDragger {
    constructor() {
        if (typeof ENABLE_DS_DRAG === 'undefined' || !ENABLE_DS_DRAG) return;

        // --- 配置 ---
        this.hoverClass = 'md-draggable-hover';
        this.selectedClass = 'md-selected'; 
        
        // 状态位
        this.isEnabled = location.href.includes('preview.html')?true:false;
        this.isBoxSelecting = false;
        this.isDragging = false;
        this.ignoreNextClick = false;
        
        // 数据存储
        this.selectedElements = new Set();
        this.startPos = { x: 0, y: 0 };
        this.currentMousePos = { x: 0, y: 0 };

        // 滚动修正相关
        this.scrollParent = null;
        this.startScrollPos = { top: 0, left: 0 };
        this._boundHandleScroll = this.handleScroll.bind(this);

        // 目标选择器
        this.targetSelectors = LOCAL_CONFIG.targetSelectors;

        // 限制交互生效的根容器类名
        this.rootSelector = LOCAL_CONFIG.rootSelector;
        
        // DeepSeek 滚动容器
        this.scrollerSelector = LOCAL_CONFIG.scrollerSelector;

        this.createUI();
        this.init();
    }

    // ============================================================
    // #region 1. UI 初始化
    // ============================================================
    createUI() {
        if (!document.querySelector('.selection-marquee')) {
            this.marquee = document.createElement('div');
            this.marquee.className = 'selection-marquee';
            this.marquee.style.position = 'absolute';
            this.marquee.style.zIndex = '9999';
            this.marquee.style.display = 'none';
            this.marquee.style.border = '1px solid rgba(59, 130, 246, 0.8)';
            this.marquee.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            this.marquee.style.pointerEvents = 'none'; 
            document.body.appendChild(this.marquee);
        } else {
            this.marquee = document.querySelector('.selection-marquee');
        }

        if (!document.getElementById('drag-badge')) {
            this.badge = document.createElement('div');
            this.badge.id = 'drag-badge';
            this.badge.style.position = 'absolute';
            this.badge.style.top = '-999px';
            this.badge.style.padding = '6px 12px';
            this.badge.style.background = '#3b82f6';
            this.badge.style.color = '#fff';
            this.badge.style.borderRadius = '4px';
            this.badge.style.fontWeight = 'bold';
            this.badge.style.fontSize = '14px';
            document.body.appendChild(this.badge);
        } else {
            this.badge = document.getElementById('drag-badge');
        }
        this.createContextMenu();
    }
    createContextMenu() {
        if (document.getElementById('md-context-menu')) {
            this.contextMenu = document.getElementById('md-context-menu');
            return;
        }

        this.contextMenu = document.createElement('div');
        this.contextMenu.id = 'md-context-menu';
        
        // 菜单样式
        Object.assign(this.contextMenu.style, {
            display: 'none',
            position: 'fixed',
            zIndex: '10000',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            padding: '4px 0',
            minWidth: '160px',
            fontSize: '14px',
            color: '#374151',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        });

        // 菜单项模板
        const createItem = (icon, text, onClick) => {
            const item = document.createElement('div');
            item.innerHTML = `${icon}  ${text}`;
            Object.assign(item.style, {
                padding: '6px 8px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            });
            
            item.onmouseenter = () => item.style.backgroundColor = '#f3f4f6';
            item.onmouseleave = () => item.style.backgroundColor = 'transparent';
            item.onclick = (e) => {
                e.stopPropagation(); // 防止冒泡触发 document click 关闭菜单
                this.hideContextMenu();
                onClick();
            };
            return item;
        };

        // 选项 1: 复制 Markdown
        const btnMd = createItem('<i class="ri-markdown-fill"></i>',getI18nText('chat_list.copy_markdown'), () => {
            if (this.tempActionData) {
                this.copyToClipboard(this.tempActionData.markdown, this.tempActionData.count, 'markdown');
            }
        });

        // 选项 2: 复制 Word 格式
        const btnWord = createItem('<i class="ri-file-word-2-fill"></i>', getI18nText('chat_list.copy_word'), () => {
            if (this.tempActionData) {
                this.copyToClipboard(this.tempActionData.markdown, this.tempActionData.count, 'word');
            }
        });

        // 选项 3: 新建思维导图
        const btnMind = createItem('<i class="fa-solid fa-code-branch"></i>', getI18nText('chat_list.new_mindmap'), () => {
            if (this.tempActionData) {
                // const qaData=[{question: '',answer:this.tempActionData.markdown}];
                openQAdata([], '新建思维导图', 'mindmap', true, '');
            }
        });

        this.contextMenu.appendChild(btnMd);
        this.contextMenu.appendChild(btnWord);
        this.contextMenu.appendChild(btnMind);
        document.body.appendChild(this.contextMenu);
    }

    init() {
        document.addEventListener('mouseover', this.handleMouseOver.bind(this));
        document.addEventListener('mouseout', this.handleMouseOut.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        document.addEventListener('click', this.handleClick.bind(this), true); 
        document.addEventListener('dragstart', this.handleDragStart.bind(this));
        
        // [新增] 监听键盘事件 (Ctrl+C)
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        
        // [新增] 监听右键菜单事件
        document.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        // [新增] 点击页面任意位置关闭菜单
        document.addEventListener('click', (e) => {
            this.hideContextMenu();
            // 原有的 handleClick 逻辑保留在 true 捕获阶段或者这里处理
        }, true);
        
        // [新增] 滚动时也关闭菜单
        document.addEventListener('scroll', () => this.hideContextMenu(), true);

        document.addEventListener('dragend', () => { 
            setTimeout(() => { this.isDragging = false; }, 50); 
        });

        this.lastKeyTime = 0; 
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Alt' || e.key === 'alt') {
                e.preventDefault(); 
                const now = Date.now();
                if (now - this.lastKeyTime < 400) {
                    this.toggleDraggerMode();
                    this.lastKeyTime = 0; 
                } else {
                    this.lastKeyTime = now;
                }
            }
        });
    }

    // ============================================================
    // #region 2. 交互逻辑
    // ============================================================
    
    // [新增] 核心 Markdown 生成逻辑（从 handleDragStart 提取）
    // targetEl: 如果传入，且当前不在选中列表里，则单独选中它进行生成
    generateMarkdown(targetEl = null) {
        let itemsToDrag = [];

        // 逻辑：如果有指定目标，且目标不在当前选区中，则只处理该目标
        if (targetEl && !this.selectedElements.has(targetEl)) {
            // 临时只处理这一个元素，不清除之前的选区（如果仅仅是右键复制的话），
            // 或者根据需求，右键未选中的元素时，是否应该清除其他选区？
            // 这里采用：如果右键点击未选中的，则仅复制该元素，保持选区不变（灵活）
            // 或者：按照 handleClick 逻辑，变为单选。这里为了复制方便，我们构造临时数组。
            itemsToDrag = [targetEl];
        } else if (this.selectedElements.size > 0) {
            // 处理当前选区
            itemsToDrag = this.getUniqueSortedElements();
        } else if (targetEl) {
            itemsToDrag = [targetEl];
        } else {
            return null; // 无内容
        }
        console.log('选中的目标元素：', itemsToDrag);
        if (itemsToDrag.length === 0) return null;

        const container = document.createElement('div');
        itemsToDrag.forEach(el => {
            const clone = el.cloneNode(true);
            container.appendChild(clone);
            container.appendChild(document.createTextNode('\n\n')); 
        });

        let finalMarkdown = LOCAL_CONFIG.processor(container);
        if (finalMarkdown) {
            finalMarkdown = finalMarkdown.replace(/(\d+)\\\./g, '$1.'); 
            if (typeof correctMarkdownList === 'function') {
                finalMarkdown = correctMarkdownList(finalMarkdown);
            }
        }
        
        return {
            markdown: finalMarkdown,
            count: itemsToDrag.length
        };
    }

    // [新增] 处理 Ctrl+C
    async handleKeyDown(e) {
        if (!this.isEnabled) return;
        
        // 检测 Ctrl+C 或 Cmd+C
        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
            // 只有当有选区时才拦截，否则让用户正常复制普通文本
            if (this.selectedElements.size > 0) {
                const result = this.generateMarkdown();
                if (result && result.markdown) {
                    e.preventDefault(); // 阻止浏览器默认复制
                    e.stopPropagation();
                    await this.copyToClipboard(result.markdown, result.count);
                }
            }
        }
    }
    // #region 右键事件
    // [修改] 处理右键菜单
    async handleContextMenu(e) {
        if (!this.isEnabled) return;
        
        const targetEl = this.getTarget(e);
        
        // 如果没有命中目标，隐藏菜单并返回（允许默认菜单）
        if (!targetEl) {
            this.hideContextMenu();
            return;
        }

        e.preventDefault(); // 阻止默认浏览器菜单

        // 检查点击的目标是否是当前选区的一部分
        const isAlreadySelected = this.isElementInSelection(targetEl);
        let result = null;

        if (isAlreadySelected) {
            // 情况A：点击选区内 -> 准备复制整个选区
            result = this.generateMarkdown(null);
        } else {
            // 情况B：点击选区外 -> 选中新元素，准备复制新元素
            this.clearSelection();
            this.addToSelection(targetEl);
            result = this.generateMarkdown(targetEl);
        }

        if (result && result.markdown) {
            // 暂存数据供菜单点击使用
            this.tempActionData = result;
            // 显示菜单
            this.showContextMenu(e.clientX, e.clientY);
        }
    }
    // [新增] 显示菜单
    showContextMenu(x, y) {
        if (!this.contextMenu) return;
        
        // 防止菜单溢出屏幕
        const menuWidth = 160;
        const menuHeight = 80;
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let posX = x;
        let posY = y;

        if (x + menuWidth > winWidth) posX = x - menuWidth;
        if (y + menuHeight > winHeight) posY = y - menuHeight;

        this.contextMenu.style.left = posX + 'px';
        this.contextMenu.style.top = posY + 'px';
        this.contextMenu.style.display = 'block';
    }

    // [新增] 隐藏菜单
    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }
    }

    // [修改] 统一剪贴板写入，支持 type 参数 ('markdown' | 'word')
    async copyToClipboard(text, count, type = 'markdown') {
        try {
            if (type === 'word') {
                // 现有的 Word 复制逻辑 (HTML + MathML)
                await copyMarkdownAsWordToClipboard(text);
                showTopToast(getI18nText('toast.copy_word_success').replace('{count}', count));
            } else {
                // 纯文本 Markdown 复制
                await navigator.clipboard.writeText(text);
                showTopToast(getI18nText('toast.copy_md_success').replace('{count}', count));
            }
        } catch (err) {
            console.error('复制失败:', err);
            showTopToast(getI18nText('toast.copy_fail'));
        }
    }

    // [新增] 辅助判断：target 是否属于当前选区（自身在集合中，或者祖先在集合中）
    isElementInSelection(target) {
        if (this.selectedElements.size === 0) return false;
        if (this.selectedElements.has(target)) return true;

        // 遍历所有已选元素，检查 target 是否是它们的后代
        for (const selectedEl of this.selectedElements) {
            if (selectedEl.contains(target)) {
                return true;
            }
        }
        return false;
    }

    toggleDraggerMode() {
        this.isEnabled = !this.isEnabled;
        if (!this.isEnabled) {
            this.clearSelection();
            this.isBoxSelecting = false;
            this.marquee.style.display = 'none';
            document.body.style.cursor = ''; // 【新增】禁用时强制恢复光标
            document.querySelectorAll('.' + this.hoverClass).forEach(el => el.classList.remove(this.hoverClass));
            document.querySelectorAll('[draggable="true"]').forEach(el => {
                if (el.closest(this.rootSelector)) el.removeAttribute('draggable');
            });
            showTopToast(getI18nText('toast.block_mode_disabled'));
        } else {
            showTopToast(getI18nText('toast.block_mode_enabled'));

        }
    }

    getTarget(e) {
        // if (e.target.closest('.thinking-container')) console.log('点击了思考容器，已阻止选中');
        if (e.target.closest(LOCAL_CONFIG.ignoreSelectors)) return null;
        const mdContainer = e.target.closest(this.rootSelector);
        if (!mdContainer) return null;

        let el = e.target.closest(this.targetSelectors.join(','));
        if (el) {
            if (el.tagName === 'P' && el.parentElement && el.parentElement.tagName === 'LI') {
                el = el.parentElement;
            }
            if (['TD','TR','TH','THEAD','TBODY'].includes(el.tagName)) {
                return el.closest('table');
            }
            if (mdContainer.contains(el)) return el;
        }
        return null;
    }

    handleMouseOver(e) {
        if (!this.isEnabled || this.isBoxSelecting) return;
        const el = this.getTarget(e);
        if (!el || this.selectedElements.has(el)) return;

        const currentHovers = document.querySelectorAll('.' + this.hoverClass);
        currentHovers.forEach(hoveredEl => {
            if (hoveredEl !== el) {
                hoveredEl.classList.remove(this.hoverClass);
            }
        });

        if (el.classList.contains(this.hoverClass)) return;
        e.stopPropagation();
        el.classList.add(this.hoverClass);
        el.setAttribute('draggable', 'true');
    }

    handleMouseOut(e) {
        const el = this.getTarget(e);
        if (!el) return;
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;
        el.classList.remove(this.hoverClass);
    }

    getScrollParent(node) {
        if (!node) return document.documentElement;
        let parent = node.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') return parent;
            parent = parent.parentElement;
        }
        return document.documentElement;
    }

    // ============================================================
    // #region 选框更新逻辑 (整合滚动 + 边界限制)
    // ============================================================
    updateBoxSelection() {
        if (!this.isBoxSelecting || !this.scrollParent) return;

        const scrollDeltaX = this.scrollParent.scrollLeft - this.startScrollPos.left;
        const scrollDeltaY = this.scrollParent.scrollTop - this.startScrollPos.top;

        const rawStartX = this.startPos.x - scrollDeltaX;
        const rawStartY = this.startPos.y - scrollDeltaY;
        const rawCurrentX = this.currentMousePos.x;
        const rawCurrentY = this.currentMousePos.y;

        if (Math.hypot(rawCurrentX - rawStartX, rawCurrentY - rawStartY) < 3) return;
        this.ignoreNextClick = true;

        const boxLeft = Math.min(rawStartX, rawCurrentX);
        const boxRight = Math.max(rawStartX, rawCurrentX);
        const boxTop = Math.min(rawStartY, rawCurrentY);
        const boxBottom = Math.max(rawStartY, rawCurrentY);
        const logicalWidth = boxRight - boxLeft;
        const logicalHeight = boxBottom - boxTop;

        const containerRect = this.scrollParent.getBoundingClientRect();
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;

        const containerLimit = {
            left: containerRect.left + scrollX,
            top: containerRect.top + scrollY,
            right: containerRect.right + scrollX,
            bottom: containerRect.bottom + scrollY
        };

        const clampedLeft = Math.max(boxLeft, containerLimit.left);
        const clampedTop = Math.max(boxTop, containerLimit.top);
        const clampedRight = Math.min(boxRight, containerLimit.right);
        const clampedBottom = Math.min(boxBottom, containerLimit.bottom);

        const visualWidth = clampedRight - clampedLeft;
        const visualHeight = clampedBottom - clampedTop;

        if (visualWidth <= 0 || visualHeight <= 0) {
            this.marquee.style.display = 'none';
        } else {
            this.marquee.style.display = 'block';
            this.updateMarquee(clampedLeft, clampedTop, visualWidth, visualHeight);
        }

        this.detectIntersection({ // 碰撞检测
            left: boxLeft, 
            top: boxTop, 
            width: logicalWidth, 
            height: logicalHeight 
        });
    }

    handleScroll(e) {
        if (this.isBoxSelecting) {
            requestAnimationFrame(() => this.updateBoxSelection());
        }
    }

    // ============================================================
    // #region 鼠标事件
    // ============================================================

    handleMouseDown(e) {
        if (!this.isEnabled || e.button !== 0 || e.target.closest('.bookmark-manager-container') || e.target.closest('textarea')) return;
        if (e.target.closest('button, a, input, [role="button"], .chat-input')) return;

        const targetBlock = this.getTarget(e);
        this.ignoreNextClick = false;

        if ((e.ctrlKey || e.metaKey) || !targetBlock) {
            // [修改] 选区逻辑分支
            if (!e.ctrlKey && !e.metaKey && !e.target.closest('#md-context-menu')) {
                // --- 单选模式 (Single Mode) ---
                this.clearSelection();
                this.isMultiSelect = false;
                this.initialSelection = new Set(); // 空快照
            } else {
                // --- 多选模式 (Multi Mode) ---
                this.isMultiSelect = true;
                this.initialSelection = new Set(this.selectedElements); // [关键] 拍下当前选区的快照
            }

            e.preventDefault();
            this.isBoxSelecting = true;
            
            // ... (光标样式代码保持不变) ...
            document.body.style.cursor = 'crosshair';

            this.startPos = { x: e.pageX, y: e.pageY };
            this.currentMousePos = { x: e.pageX, y: e.pageY };
            
            const specificScroller = document.querySelector(this.scrollerSelector);
            this.scrollParent = specificScroller || this.getScrollParent(targetBlock || e.target);

            if (this.scrollParent) {
                this.startScrollPos = { top: this.scrollParent.scrollTop, left: this.scrollParent.scrollLeft };
                this.scrollParent.addEventListener('scroll', this._boundHandleScroll, { passive: true });
            }
            this.updateMarquee(e.pageX, e.pageY, 0, 0);
            this.marquee.style.display = 'block';
        }
    }

    handleMouseMove(e) {
        this.currentMousePos = { x: e.pageX, y: e.pageY };

        if (this.isBoxSelecting) {
            e.preventDefault();
            this.updateBoxSelection();
            return;
        }

        if (this.isEnabled && !this.isDragging) {
            const target = this.getTarget(e);
            if (!target) {
                const stuckElements = document.querySelectorAll('.' + this.hoverClass);
                if (stuckElements.length > 0) {
                    stuckElements.forEach(el => el.classList.remove(this.hoverClass));
                }
            }
        }
    }

    handleMouseUp(e) {
        if (this.isBoxSelecting) {
            this.isBoxSelecting = false;
            this.marquee.style.display = 'none';
            document.body.style.cursor = '';
            if (this.scrollParent) {
                this.scrollParent.removeEventListener('scroll', this._boundHandleScroll);
                this.scrollParent = null;
            }
        }
    }
    
    handleClick(e) {
        if (!this.isEnabled || this.isDragging) return;
        // console.log('点击右键菜单',e.target.closest('#md-context-menu'))
        if (e.target.closest('#md-context-menu')) return;
        if (this.ignoreNextClick) {
            this.ignoreNextClick = false;
            return;
        }

        const targetBlock = this.getTarget(e);
        
        if (e.ctrlKey || e.metaKey) {
            if (targetBlock) {
                if (this.selectedElements.has(targetBlock)) {
                    this.removeFromSelection(targetBlock);
                } else {
                    this.addToSelection(targetBlock);
                }
            }
            return;
        }

        if (targetBlock) {
            const isOnlySelf = this.selectedElements.size === 1 && this.selectedElements.has(targetBlock);
            if (!isOnlySelf) {
                this.clearSelection();
                this.addToSelection(targetBlock);
            }
        } else {
            this.clearSelection();
        }
    }

    updateMarquee(x, y, w, h) {
        this.marquee.style.left = x + 'px';
        this.marquee.style.top = y + 'px';
        this.marquee.style.width = w + 'px';
        this.marquee.style.height = h + 'px';
    }

    // #region 碰撞检测
    detectIntersection(rect) {
        const candidates = document.querySelectorAll(`${this.rootSelector} ${this.targetSelectors.join(', ' + this.rootSelector + ' ')}`);
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        
        // 缓存矩形边界，减少重复计算
        const rLeft = rect.left;
        const rRight = rect.left + rect.width;
        const rTop = rect.top;
        const rBottom = rect.top + rect.height;

        candidates.forEach(el => {
            if (el.tagName === 'P' && el.parentElement.tagName === 'LI') return;
            if (el.closest(LOCAL_CONFIG.ignoreSelectors)) return;

            const box = el.getBoundingClientRect();
            const elLeft = box.left + scrollX;
            const elRight = elLeft + box.width;
            const elTop = box.top + scrollY;
            const elBottom = elTop + box.height;

            // 碰撞检测
            const isOverlapping = !(elRight < rLeft || elLeft > rRight || elBottom < rTop || elTop > rBottom);

            if (isOverlapping) {
                // 如果重叠，无脑加入
                this.addToSelection(el);
            } else {
                // [关键修复] 如果不重叠，看情况移除
                if (this.isMultiSelect) {
                    // 多选模式下：只有“不在初始快照里”的元素（即本次临时框中又划走的）才移除
                    // 以前选中的（在 initialSelection 里的），即使不在框里，也保留
                    if (!this.initialSelection.has(el)) {
                        this.removeFromSelection(el);
                    }
                } else {
                    // 单选模式下：不在框里就移除
                    if (this.selectedElements.has(el)) this.removeFromSelection(el);
                }
            }
        });
    }
    addToSelection(el) {
        if (!this.selectedElements.has(el)) {
            this.selectedElements.add(el);
            el.classList.add(this.selectedClass);
            el.setAttribute('draggable', 'true');
        }
    }

    removeFromSelection(el) {
        if (this.selectedElements.has(el)) {
            this.selectedElements.delete(el);
            el.classList.remove(this.selectedClass);
            el.classList.remove(this.hoverClass); 
        }
    }

    clearSelection() {
        this.selectedElements.forEach(el => {
            el.classList.remove(this.selectedClass);
        });
        this.selectedElements.clear();
    }

    getUniqueSortedElements() {
        const elements = Array.from(this.selectedElements);
        const uniqueElements = elements.filter(el => {
            let parent = el.parentElement;
            while (parent) {
                if (this.selectedElements.has(parent)) return false;
                if (parent.matches && parent.matches(this.rootSelector)) break;
                parent = parent.parentElement;
            }
            return true;
        });
        return uniqueElements.sort((a, b) => 
            (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1
        );
    }

    // ============================================================
    // #region 3. 核心逻辑：拖拽与发送 (JSON 包装)
    // ============================================================
    handleDragStart(e) {
        if (!this.isEnabled || e.target.closest('.bookmark-manager-container')) return;
        const targetEl = this.getTarget(e);
        console.log('targetEl',targetEl)
        if (!targetEl) return;
        this.isDragging = true;
        
        // 拖拽前如果目标不在选中区，则重置选中区为目标
        if (!this.selectedElements.has(targetEl)) {
            this.clearSelection();
            this.addToSelection(targetEl);
        }

        const result = this.generateMarkdown();
        if (result && result.markdown) {
            e.dataTransfer.setData('text/plain', result.markdown);
            e.dataTransfer.effectAllowed = 'copy';

            if (result.count > 0) {
                this.badge.innerText = `📝 ${result.count} 个块`;
                e.dataTransfer.setDragImage(this.badge, 0, 0);
            }
        }
    }
}

// 启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initDrag());
} else {
    initDrag()
}
async function initDrag(){
    const jiHuo=await checkUIMM3(false)
    await initI18n();
    if (LOCAL_CONFIG && jiHuo) new MarkDownDragger();
}




// #region md提取函数 
/**
 * 将指定选择器的 HTML 转换为 Markdown
 * @param {string} selector - CSS 选择器 (例如 "#content", ".article-body")
 * @returns {string} - 转换后的 Markdown 文本。如果没找到元素返回 null。
 */


function convertGemini(element){
    // 1. 克隆节点，避免修改原页面
    const clone = element.cloneNode(true);

    // ==========================================
    // [新增] 阶段一：修复表格内块级元素导致的断行 Bug
    // ==========================================
    clone.querySelectorAll('td, th').forEach(cell => {
        // 1. 将块级元素转换为内联元素
        cell.querySelectorAll('p, div, ul, li').forEach(block => {
            const span = document.createElement('span');
            span.innerHTML = block.innerHTML + ' '; 
            block.replaceWith(span);
        });

        // 2. [关键修复]：处理 <br> 标签，防止其生成 Markdown 换行符
        cell.querySelectorAll('br').forEach(br => {
            br.replaceWith(document.createTextNode('<br>'));
        });

        // 3. 清理 HTML 源码自带的换行和回车符
        cell.innerHTML = cell.innerHTML.replace(/[\r\n]+/g, ' ');
    });

    // ==========================================
    // 阶段二：数学公式预处理（防止被当做空标签丢弃）
    // ==========================================
    clone.querySelectorAll('.math-inline').forEach(node => {
        if (node.hasAttribute('data-math')) {
            node.innerHTML = 'LATEX_INLINE_PLACEHOLDER'; 
        }
    });

    clone.querySelectorAll('.math-block').forEach(node => {
        if (node.hasAttribute('data-math')) {
            node.innerHTML = 'LATEX_BLOCK_PLACEHOLDER';
        }
    });

    // ==========================================
    // [新增] 阶段二点五：提取并转移代码块的语言类型
    // ==========================================
    // 必须在“阶段三”删除 .code-block-decoration 之前执行！
    clone.querySelectorAll('.code-block').forEach(codeBlock => {
        // 查找包含语言名称的 span (例如 <span>CSS</span>)
        const langSpan = codeBlock.querySelector('.code-block-decoration > span');
        const codeElement = codeBlock.querySelector('pre code');
        
        if (langSpan && codeElement) {
            // 获取语言并转为小写 (如 "CSS" -> "css", "C++" -> "c++")
            const langName = langSpan.textContent.trim().toLowerCase();
            // 把语言存入自定义属性 data-language 中
            codeElement.setAttribute('data-language', langName);
        }
    });

    // ==========================================
    // 阶段三：常规清理与格式化
    // ==========================================
    const ignoreSelectors = [
        'script', 'style', 'svg', 'noscript', 'iframe',
        '.line-number-gutter', '.code-block-decoration', '.table-footer',
        'sources-carousel-inline', 
        'source-footnote', 
        '.katex-html', '.katex-mathml', '.katex', 'a[href]'
    ];
    
    ignoreSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // ==========================================
    // 阶段四：Turndown 配置与规则
    // ==========================================
    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        emDelimiter: '*'
    });

    if (typeof turndownPluginGfm !== 'undefined') {
        turndownService.use(turndownPluginGfm.gfm);
    }

    turndownService.addRule('mathBlock', {
        filter: function (node) {
            return node.nodeType === 1 && node.classList && node.classList.contains('math-block') && node.hasAttribute('data-math');
        },
        replacement: function (content, node) {
            const latex = node.getAttribute('data-math');
            return '\n\n$$' + latex + '$$\n\n';
        }
    });

    turndownService.addRule('mathInline', {
        filter: function (node) {
            return node.nodeType === 1 && node.classList && node.classList.contains('math-inline') && node.hasAttribute('data-math');
        },
        replacement: function (content, node) {
            const latex = node.getAttribute('data-math');
            return '$' + latex + '$';
        }
    });

    // --- 规则：代码块 (Code Block) ---
    turndownService.addRule('cleanCodeBlock', {
        filter: 'pre',
        replacement: function (content, node) {
            const codeEl = node.querySelector('code');
            let lang = '';
            
            if (codeEl) {
                lang = codeEl.getAttribute('data-language') || '';
                
                if (!lang) {
                    const className = codeEl.getAttribute('class') || '';
                    lang = (className.match(/language-([a-zA-Z0-9+#-]+)/) || [])[1] || '';
                }
                if (lang==='代码段') lang = 'mermaid';
                if (lang==='matlab') lang = '';
            }

            // 获取代码内容
            let codeContent = codeEl ? codeEl.textContent : node.textContent;
            
            // 【关键修复】：不用 .trim()，而是用正则仅去掉开头和结尾的“纯换行符”
            // 这样能完美保留第一行的正常空格/Tab缩进
            codeContent = codeContent.replace(/^[\r\n]+|[\r\n]+$/g, '');
            
            return '\n\n```' + lang + '\n' + codeContent + '\n```\n\n';
        }
    });

    // ==========================================
    // 阶段五：执行转换与后处理
    // ==========================================
    let markdown = turndownService.turndown(clone);

    // 修复 1: 暴力去除 ``` 和 $$ 前面的所有缩进空格
    markdown = markdown.replace(/^[ \t]+(```|\$\$)/gm, '$1');
    
    // 修复 2: 清理连续过多的换行，让排版更紧凑美观
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    return markdown;
}

function convertChatGPT(htmlContent) {
    // 1. 初始化 DOM 环境：克隆节点，避免修改原页面
    let root = htmlContent.cloneNode(true);

    // ==========================================
    // 阶段一：表格解包与防断裂修复
    // ==========================================
    // 1.1 移除 ChatGPT 特有的 .tableContainer 包裹层
    root.querySelectorAll('div[class*="tableContainer"]').forEach(container => {
        if (container.querySelector('table') && container.parentNode) {
            container.parentNode.insertBefore(container.querySelector('table'), container);
            // 稍后在阶段三统一删除空 container
        }
    });

    // 1.2 防止表格断裂：将块级元素转为内联，并保护换行
    root.querySelectorAll('td, th').forEach(cell => {
        cell.querySelectorAll('p, div, ul, li').forEach(block => {
            const span = document.createElement('span');
            span.innerHTML = block.innerHTML + ' ';
            block.replaceWith(span);
        });
        // 将 <br> 转为纯文本，防止 Turndown 生成真实换行导致表格断裂
        cell.querySelectorAll('br').forEach(br => {
            br.replaceWith(document.createTextNode('<br>'));
        });
        cell.innerHTML = cell.innerHTML.replace(/[\r\n]+/g, ' ');
    });

    // ==========================================
    // 阶段二：数学公式提取与数据暂存 (State Stashing)
    // ==========================================
    // 寻找 KaTeX 源码标签
    const annotations = root.querySelectorAll('annotation[encoding="application/x-tex"]');
    annotations.forEach(annotation => {
        const latex = annotation.textContent.trim();
        if (!latex) return;

        // 确定是行内还是行间
        const mathNode = annotation.closest('.katex');
        const displayNode = mathNode ? mathNode.closest('.katex-display') : null;
        
        let isBlock = false;
        const mathTag = annotation.closest('math');
        if (mathTag && mathTag.getAttribute('display') === 'block') isBlock = true;
        if (latex.includes('\\begin{aligned}')) isBlock = true;
        if (displayNode) isBlock = true;

        // 确定最外层要替换的节点
        const targetNode = displayNode || mathNode;

        if (targetNode && targetNode.parentNode) {
            // [核心架构]：不依赖 Turndown 解析，直接把公式存入属性
            const placeholder = document.createElement(isBlock ? 'div' : 'span');
            placeholder.className = isBlock ? 'math-block' : 'math-inline';
            placeholder.setAttribute('data-math', latex);
            placeholder.textContent = isBlock ? 'LATEX_BLOCK_PLACEHOLDER' : 'LATEX_INLINE_PLACEHOLDER';
            
            targetNode.parentNode.replaceChild(placeholder, targetNode);
        }
    });

    // ==========================================
    // 阶段二点五：代码块语言提取与缩进保护
    // ==========================================
    root.querySelectorAll('pre').forEach(pre => {
        const codeEl = pre.querySelector('code');
        if (!codeEl) return;

        // 1. 提取语言类型
        let lang = '';
        const langMatch = codeEl.className.match(/language-([a-zA-Z0-9_\-]+)/);
        if (langMatch) {
            lang = langMatch[1]; // 旧版 UI
        } else {
            // 新版 UI：向上寻找包裹层，提取标题栏
            const codeContainer = pre.closest('.bg-token-bg-elevated-secondary, .border-radius-3xl');
            if (codeContainer) {
                const langLabel = codeContainer.querySelector('.text-token-text-primary, .text-token-text-secondary');
                if (langLabel) lang = langLabel.textContent.trim().toLowerCase();
            }
        }
        
        // [核心架构]：把语言锁进 data-language，防止后续清理误删
        if (lang) {
            codeEl.setAttribute('data-language', lang);
        }

        // 2. 核心修复：把 DOM 里的 <br> 转为真实换行 \n
        codeEl.querySelectorAll('br').forEach(br => {
            br.replaceWith('\n'); 
        });
    });

    // ==========================================
    // 阶段三：无脑大扫除 (Cleanup)
    // ==========================================
    // 移除了元数据后，现在可以放心地把没用的 UI 元素全部删掉
    const ignoreSelectors = [
        'button', 'svg', '.icon', '.sr-only.select-none',
        '[aria-label="复制"]', '.sticky', 'a[href]', 
        'div[class*="tableContainer"]' // 移除第一步中被掏空的壳
    ];
    ignoreSelectors.forEach(sel => {
        root.querySelectorAll(sel).forEach(el => el.remove());
    });

    // ==========================================
    // 阶段四：Turndown 强行接管规则
    // ==========================================
    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        hr: '---'
    });

    if (typeof turndownPluginGfm !== 'undefined') {
        turndownService.use(turndownPluginGfm.gfm);
    }

    // --- 接管规则：行间数学公式 ---
    turndownService.addRule('mathBlock', {
        filter: function (node) {
            return node.classList && node.classList.contains('math-block') && node.hasAttribute('data-math');
        },
        replacement: function (content, node) {
            return '\n\n$$' + node.getAttribute('data-math') + '$$\n\n';
        }
    });

    // --- 接管规则：行内数学公式 ---
    turndownService.addRule('mathInline', {
        filter: function (node) {
            return node.classList && node.classList.contains('math-inline') && node.hasAttribute('data-math');
        },
        replacement: function (content, node) {
            return '$' + node.getAttribute('data-math') + '$';
        }
    });

    // --- 接管规则：代码块 ---
    turndownService.addRule('cleanCodeBlock', {
        filter: 'pre',
        replacement: function (content, node) {
            const codeEl = node.querySelector('code');
            let lang = '';
            let codeContent = '';

            if (codeEl) {
                // 直接从属性读取语言，绝不丢失
                lang = codeEl.getAttribute('data-language') || '';
                // 直接提取文本（阶段 2.5 已经把 br 换成了 \n）
                codeContent = codeEl.textContent;
            } else {
                codeContent = node.textContent;
            }

            // 完美保留缩进：仅去掉首尾纯换行
            codeContent = codeContent.replace(/^[\r\n]+|[\r\n]+$/g, '');
            
            return '\n\n```' + lang + '\n' + codeContent + '\n```\n\n';
        }
    });

    // ==========================================
    // 阶段五：执行转换与最终整形
    // ==========================================
    let markdown = turndownService.turndown(root);

    // 修复 1: 暴力去除 ``` 和 $$ 前面的所有缩进空格
   markdown = markdown.replace(/^[ \t]+(```|\$\$)/gm, '$1');
    
    // 修复 2: 清理连续过多的换行
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    // 修复 3: ChatGPT 特殊处理，修复 Turndown 可能错误转义的 $ 符号
    markdown = markdown.replace(/\\(\$)/g, '$');
    markdown=markdown.replace(/\\\*\\\*/g, '**');

    return markdown.trim();
}

function convertKimi(element){
    // 1. 克隆节点，避免修改原页面
    const clone = element.cloneNode(true);

    // 移除干扰元素
    const ignoreSelectors = [
        'script', 'style', 'svg', 'noscript', 'iframe','.toolcall-web_search','.toolcall-title-container',
        '.line-number-gutter','.linenumber','.table-actions', '.segment-code-header','a[href]','.rag-tag',
        '.toolcall-container', '.k1-research','.search-plus','header .header-content'
    ];
    ignoreSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });
    // ==========================================
    // 【新增修复】预处理表格，防止多行文本破坏 Markdown 语法
    // ==========================================
    clone.querySelectorAll('th, td').forEach(cell => {
        // 将 HTML 的 <br> 标签替换为字面量的 '<br>' 字符串
        // 这样 Markdown 表格渲染时既能保持多行视觉效果，又不会产生真实的 \n 打断 |...|...| 结构
        cell.querySelectorAll('br').forEach(br => {
            br.replaceWith(document.createTextNode('<br>'));
        });
        
        // 预防性清理：移除单元格内原本存在的真实换行符（\n 或 \r）
        // 避免一些格式化良好的 HTML 源码自带换行打断表格
        cell.innerHTML = cell.innerHTML.replace(/\r?\n/g, '');
    });

    // ==========================================
    // 阶段四：Turndown 配置与规则
    // ==========================================

    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        emDelimiter: '*'
    });

    if (typeof turndownPluginGfm !== 'undefined') {
        turndownService.use(turndownPluginGfm.gfm);
    }
    // --- 规则：代码块 (Code Block) ---
    turndownService.addRule('cleanCodeBlock', {
        filter: 'pre',
        replacement: function (content, node) {
            const codeEl = node.querySelector('code');
            const lang = (codeEl?.className.match(/language-(\w+)/) || [])[1] || '';
            // 确保内容本身也去除了首尾空白
            const codeContent = (codeEl ? codeEl.textContent : node.textContent).trim();
            
            // 【关键】使用 \n\n``` 强制另起一段，防止接在前面的文本后面
            return '\n\n```' + lang + '\n' + codeContent + '\n```\n\n';
        }
    });

    let markdown = turndownService.turndown(clone);
    // 修复 1: 暴力去除 ``` 和 $$ 前面的所有缩进空格
    markdown = markdown.replace(/^[ \t]+(```|\$\$)/gm, '$1');
    return markdown;
}

function convertDeepSeek(element) {
    // 1. 克隆节点 (防止污染原页面)
    const clone = element.cloneNode(true);

    // ==========================================
    // 阶段一：暴力预处理 (Pre-processing)
    // 核心目标：在 Turndown 看到复杂的 DOM 之前，把公式变成简单的占位符
    // ==========================================

    // 1. 找到所有包含 LaTeX 源码的节点
    // 你的源文件中，源码都在 <annotation encoding="application/x-tex"> 中
    const annotations = clone.querySelectorAll('annotation[encoding="application/x-tex"]');

    annotations.forEach(annotation => {
        const latex = annotation.textContent.trim();
        if (!latex) return;

        // 2. 向上寻找最外层的 KaTeX 容器
        // 关键点：我们要找到这一团公式的“树根”，然后把它连根拔起
        const mathmlNode = annotation.closest('.katex-mathml');
        const katexNode = mathmlNode ? mathmlNode.closest('.katex') : null;
        
        if (!katexNode) return; // 没找到结构，跳过

        // 3. 判断是“行间”还是“行内”
        // 检查 katexNode 的父级是不是 .katex-display
        const displayNode = katexNode.closest('.katex-display');
        
        let targetNode = katexNode;
        let isBlock = false;

        if (displayNode) {
            targetNode = displayNode; // 如果是行间公式，我们要替换掉最外层的 display
            isBlock = true;
        }

        // 4. 创建一个干净的“标记节点”
        // 我们用 span 并加上特殊的 class，这样 Turndown 就能轻易识别
        const marker = document.createElement('span');
        marker.className = isBlock ? 'is-math-block' : 'is-math-inline';
        marker.setAttribute('data-tex', latex);
        marker.textContent = `[MATH]`; // 调试用，最终会被替换

        // 5. 替换！
        // 这一步会直接把 .katex-html, .katex-mathml 等所有复杂的 HTML 结构移除
        // 只留在这个干净的 marker
        if (targetNode.parentNode) {
            targetNode.parentNode.replaceChild(marker, targetNode);
        }
    });

    // ==========================================
    // 阶段二：代码块清理 (保持原逻辑)
    // ==========================================
    clone.querySelectorAll('.md-code-block').forEach(block => {
        const banner = block.querySelector('.md-code-block-banner');
        let lang = '';
        if (banner) lang = banner.textContent.replace(/复制|下载/g, '').trim().toLowerCase();
        if (lang === '图表代码全屏') lang = 'mermaid';
        
        const pre = block.querySelector('pre');
        if (pre) {
            pre.querySelectorAll('.line-number-gutter').forEach(el => el.remove());
            const codeContent = pre.textContent;

            const newPre = document.createElement('pre');
            const newCode = document.createElement('code');
            if (lang) newCode.className = `language-${lang}`;
            newCode.textContent = codeContent;
            newPre.appendChild(newCode);

            block.replaceWith(newPre);
        }
    });
    // [新增修复] 处理表格内的换行符 <br>
    // 原因：Markdown 表格不支持换行，<br> 会导致表格结构错乱
    clone.querySelectorAll('td br, th br').forEach(br => {
        br.replaceWith(document.createTextNode(' '));
    });

    // ==========================================
    // 阶段三：常规 DOM 清理
    // ==========================================
    // 移除干扰元素 (此时公式已经是 .is-math-* 了，可以放心删 katex 残留)
    const ignoreSelectors = [
        '.ds-scroll-area__gutters', // 滚动条相关
        '.ds-icon', '.ds-atom-button', 'style', 'script','.line-number-gutter',
        'span.text-secondary.select-none','button[type="button"]','a[href]'
    ];
    ignoreSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // 表格滚动容器修复
    clone.querySelectorAll('.ds-scroll-area').forEach(container => {
        const table = container.querySelector('table');
        if (table) container.parentNode.insertBefore(table, container);
        container.remove();
    });

    // ==========================================
    // 阶段四：Turndown 转换
    // ==========================================
    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        emDelimiter: '*'
    });

    if (typeof turndownPluginGfm !== 'undefined') {
        turndownService.use(turndownPluginGfm.gfm);
    }

    // --- 规则：自定义处理我们的 Math Marker ---

    // 1. 行间公式 Block Math
    turndownService.addRule('mathBlock', {
        filter: function (node) {
            return node.nodeName === 'SPAN' && node.classList.contains('is-math-block');
        },
        replacement: function (content, node) {
            const tex = node.getAttribute('data-tex');
            // 返回 LaTeX，包裹在 $$ 中
            // 关键：前后加换行符确保它是独立的块
            return '\n\n$$' + tex + '$$\n\n';
        }
    });

    // 2. 行内公式 Inline Math
    turndownService.addRule('mathInline', {
        filter: function (node) {
            return node.nodeName === 'SPAN' && node.classList.contains('is-math-inline');
        },
        replacement: function (content, node) {
            const tex = node.getAttribute('data-tex');
            // 返回 LaTeX，包裹在 $ 中
            return '$' + tex + '$';
        }
    });

    // 执行转换
    let markdown = turndownService.turndown(clone);

    // ==========================================
    // 阶段五：文本清洗
    // ==========================================
    
    // 修复可能的换行过多
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    
    // 修复代码块缩进
    markdown = markdown.replace(/^[ \t]+```/gm, '```');

    // 修复可能的转义符（如果 Turndown 自作聪明转义了 $）
    // 通常上面的 rule 会直接输出字符串，不会被转义，但以防万一：
    markdown = markdown.replace(/\\(\$)/g, '$');

    return markdown;
}

function convertDoubao(element) {
    // 1. 克隆节点，避免修改原页面
    // 如果传入的是字符串，先转为 DOM
    let clone = element.cloneNode(true);

    // ==========================================
    // 阶段一：预处理数学公式 (Pre-process Math)
    // ==========================================
    
    // 你的 HTML 中，所有公式都有 class "math-inline"，无论它是行内还是行间
    // 且源码保存在 data-custom-copy-text 属性中
    const mathNodes = clone.querySelectorAll('.math-inline');

    mathNodes.forEach(node => {
        // 1. 提取 LaTeX
        // data-custom-copy-text 格式通常为: \( ... \)
        let rawTex = node.getAttribute('copy-text') || '';
        
        // 如果属性不存在，尝试兜底找 annotation (虽然你的文件中 data 属性很全)
        if (!rawTex) {
            const annotation = node.querySelector('annotation');
            if (annotation) rawTex = annotation.textContent;
        }

        // 去除 \( 和 \) 包裹
        let tex = rawTex.replace(/^\\\(/, '').replace(/\\\)$/, '').trim();
        // 处理可能的 HTML 实体转义 (如 < 变成 &lt;)
        tex = tex.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

        if (!tex) return;

        // 2. 判定行间公式 (Block Math)
        // 依据：节点的前后兄弟元素是否为 "md-box-line-break"
        let isBlock = false;
        
        const prev = node.previousElementSibling;
        const next = node.nextElementSibling;
        
        // 检查 helper：是否为换行占位符
        const isBreakLine = (el) => el && el.classList.contains('md-box-line-break');

        // 如果前后都是换行 div，或者是段落中唯一的元素，视为行间公式
        if ((isBreakLine(prev) && isBreakLine(next)) || 
            (node.parentNode.textContent.trim() === node.textContent.trim() && node.parentNode.tagName === 'DIV')) {
            isBlock = true;
        }

        // 3. 替换为自定义标记节点
        // 这一步将复杂的 katex 结构直接销毁，替换为简单的 span
        const marker = document.createElement('span');
        marker.className = 'custom-math-token';
        marker.setAttribute('data-tex', tex);
        marker.setAttribute('data-type', isBlock ? 'block' : 'inline');
        // 调试用文本
        marker.textContent = `[MATH:${tex}]`;

        node.parentNode.replaceChild(marker, node);
    });

    // ==========================================
    // 阶段二：清理干扰元素
    // ==========================================

    // 1. 移除所有的 md-box-line-break
    // 公式判定完后，这些空行 div 在 Markdown 中已经是多余的了，Turndown 会自己处理块级元素的换行
    const ignoreSelectors = [
        '.md-box-line-break', 'style', 'script','div[class^="header-wrapper"]',
        '.line-number-gutter','div[class^="hover-mask"]','a[href]'
    ];
    ignoreSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });
    // 2. 移除 header 里的自动隐藏类等干扰 (可选，视情况而定)
    // 你的 h1, h2 标签本身结构是标准的，Turndown 能识别，不需要特殊处理

    // 3. 处理表格滚动容器 (防止表格被 div 吃掉)
    clone.querySelectorAll('.table-scroll-container-Gyf4hQ, .mdbox-table-scroll-container').forEach(container => {
        const table = container.querySelector('table');
        if (table) {
            container.parentNode.replaceChild(table, container);
        }
    });

    // ==========================================
    // 阶段三：Turndown 转换
    // ==========================================

    const turndownService = new TurndownService({
        headingStyle: 'atx',      // # H1
        hr: '---',
        bulletListMarker: '-',    // - list
        codeBlockStyle: 'fenced', // ```
        emDelimiter: '*'          // *italic*
    });

    // 启用 GFM 插件以支持表格
    if (typeof turndownPluginGfm !== 'undefined') {
        turndownService.use(turndownPluginGfm.gfm);
    }

    // --- 规则：处理我们在阶段一生成的 Math Token ---
    turndownService.addRule('customMath', {
        filter: (node) => {
            return node.nodeName === 'SPAN' && node.classList.contains('custom-math-token');
        },
        replacement: (content, node) => {
            const tex = node.getAttribute('data-tex');
            const type = node.getAttribute('data-type');

            if (type === 'block') {
                // 行间公式：前后换行 + $$
                return '\n\n$$' + tex + '$$\n\n';
            } else {
                // 行内公式：$
                return '$' + tex + '$';
            }
        }
    });

    // --- 规则：清理多余的 div 容器 ---
    // 你的内容被包裹在很多 <div class="paragraph-pP9ZLC"> 中
    // 我们希望这些 div 被视作普通段落处理（或者忽略 div 标签保留内容）
    turndownService.addRule('ignoreDivsKeepContent', {
        filter: ['div'],
        replacement: function (content, node) {
            // 如果 div 是空的，返回空
            if (!content.trim()) return '';
            // 否则返回内容并换行
            return '\n\n' + content + '\n\n';
        }
    });

    let markdown = turndownService.turndown(clone);

    // ==========================================
    // 阶段四：文本清洗 (Regex Post-processing)
    // ==========================================

    // 1. 修复多重换行
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    // 2. 修复可能的转义字符 (Turndown 可能会转义公式内的字符，但因为我们直接返回了字符串，通常没事)
    // 这里的 data-custom-copy-text 里的内容通常已经是 clean 的 LaTeX

    return markdown.trim();
}
function convertYuanbao(element) {
    // 1. 克隆节点，避免修改原页面
    const clone = element.cloneNode(true);

    // ==========================================
    // 阶段三：常规清理与格式化
    // ==========================================

    // 扁平化表格单元格
    clone.querySelectorAll('th, td').forEach(cell => {
        const blocks = cell.querySelectorAll('.ybc-p, .paragraph');
        blocks.forEach(block => {
            const replacement = document.createElement('span');
            replacement.innerHTML = block.innerHTML + ' ';
            block.parentNode.replaceChild(replacement, block);
        });
    });

    // 语义还原：处理段落
    clone.querySelectorAll('.ybc-p, .paragraph').forEach(el => {
        const p = document.createElement('p');
        p.innerHTML = el.innerHTML;
        el.parentNode.replaceChild(p, el);
    });

    // 移除干扰元素
    const ignoreSelectors = [
        'script', 'style', 'svg', 'noscript', 'iframe',
        '.line-number-gutter','a[href]',
        '.ybc-li-component__dot-wp','.hyc-common-markdown__ref-list'
    ];
    ignoreSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // ==========================================
    // 阶段四：Turndown 配置与规则
    // ==========================================

    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        emDelimiter: '*'
    });

    if (typeof turndownPluginGfm !== 'undefined') {
        turndownService.use(turndownPluginGfm.gfm);
    }

    // --- 规则：代码块 (Code Block) ---
    turndownService.addRule('cleanCodeBlock', {
        filter: 'pre',
        replacement: function (content, node) {
            const codeEl = node.querySelector('code');
            const lang = (codeEl?.className.match(/language-(\w+)/) || [])[1] || '';
            // 确保内容本身也去除了首尾空白
            const codeContent = (codeEl ? codeEl.textContent : node.textContent).trim();
            
            // 【关键】使用 \n\n``` 强制另起一段，防止接在前面的文本后面
            return '\n\n```' + lang + '\n' + codeContent + '\n```\n\n';
        }
    });
    // ==========================================
    // 阶段三：执行转换
    // ==========================================
    
    let markdown = turndownService.turndown(clone);
    // 修复 1: 暴力去除 ``` 和 $$ 前面的所有缩进空格
    markdown = markdown.replace(/^[ \t]+(```|\$\$)/gm, '$1');

    return markdown;

}


/**
 * 转换主函数
 */
function convertPreview(htmlContent) {
    let root = htmlContent.cloneNode(true);
    const turndownService = new TurndownService({ 
        headingStyle: 'atx', 
        codeBlockStyle: 'fenced' 
    });
    root.querySelectorAll('th, td').forEach(cell => {
        // 将 HTML 的 <br> 标签替换为字面量的 '<br>' 字符串
        // 这样 Markdown 表格渲染时既能保持多行视觉效果，又不会产生真实的 \n 打断 |...|...| 结构
        cell.querySelectorAll('br').forEach(br => {
            br.replaceWith(document.createTextNode('<br>'));
        });
        
        // 预防性清理：移除单元格内原本存在的真实换行符（\n 或 \r）
        // 避免一些格式化良好的 HTML 源码自带换行打断表格
        cell.innerHTML = cell.innerHTML.replace(/\r?\n/g, '');
    });

    // 加载 GFM 插件处理基础表格逻辑
    turndownService.use(turndownPluginGfm.gfm);

    // 2. 【核心修复】注册 Raw 保护规则
    // 这一步模仿了你提供的脚本，确保所有 class 为 turndown-raw 的元素不被转义
    turndownService.addRule('rawContent', {
        filter: (node) => node.classList.contains('turndown-raw'),
        replacement: (content, node) => {
            // 关键点：直接返回 node 的原始文本，跳过 turndown 的转义逻辑
            return node.textContent || node.innerText;
        }
    });

    // 1. 移除无关 UI
    root.querySelectorAll('.code-line-numbers, .copy-code-btn, .mermaid-fs-btn, .mermaid-btn, .selection-marquee').forEach(el => el.remove());

    // 2. 修复 KaTeX 公式 (模仿脚本中的 sanitizeDomForMarkdown 逻辑)
    root.querySelectorAll('.katex-mathml').forEach(mathmlNode => {
        const annotation = mathmlNode.querySelector('annotation[encoding="application/x-tex"]');
        if (!annotation) return;
        
        const tex = annotation.textContent;
        const mathNode = mathmlNode.querySelector('math');
        // 判断块级公式
        const isDisplay = (mathNode && mathNode.getAttribute('display') === 'block') || 
                          !!mathmlNode.closest('.katex-display');

        const wrapper = mathmlNode.closest('.katex') || mathmlNode;

        // 创建 raw 节点
        const rawNode = document.createElement(isDisplay ? 'pre' : 'span');
        rawNode.className = 'turndown-raw';
        
        // 赋予源码内容，addRule 会保证这里的文本原样输出
        rawNode.textContent = isDisplay ? `\n\n$$${tex}$$\n\n` : `$${tex}$`;

        wrapper.replaceWith(rawNode);
    });

    // 3. 修复代码块与 Mermaid (使用 dataset.mdSource)
    root.querySelectorAll('.code-block-container, .mermaid-wrapper').forEach(container => {
        if (container.dataset.mdSource) {
            const rawNode = document.createElement('pre');
            rawNode.className = 'turndown-raw';
            rawNode.textContent = '\n' + container.dataset.mdSource + '\n';
            container.replaceWith(rawNode);
        }
    });

    return turndownService.turndown(root.innerHTML);
}

/**
 * 处理 Markdown 中的 LaTeX 公式并转换为 MathML
 * @param {string} text - 原始 Markdown
 * @returns {string} - 处理完公式的文本
 */
function renderMath(text) {
    if (typeof katex === 'undefined') return text;
  
    const options = {
      output: 'mathml', // 关键：强制输出为 MathML，Word 才能识别
      throwOnError: false // 容错：公式写错时不报错，显示原码
    };
  
    // 1. 处理块级公式 $$...$$
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
      // 💡 顺手修复：块级公式应设置为 displayMode: true，否则 Word 里不会居中放大显示
      return katex.renderToString(formula, { ...options, displayMode: true });
    });
  
    // 2. 处理行内公式 $...$
    text = text.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
      const mathml = katex.renderToString(formula, { ...options, displayMode: false });
      // 💡 关键修复：在行内公式后追加一个零宽空格，防止 Word 吞噬后面的常规空格
      return mathml + '&#8203;'; 
    });
  
    return text;
}
  
/**
 * 核心功能函数：支持公式的 Markdown 转 Word
 */
async function copyMarkdownAsWordToClipboard(markdownStr) {
    if (typeof marked === 'undefined') throw new Error('Marked 未加载');

    try {
        // --- 步骤 A: 先处理公式 ---
        // 我们必须在 marked 解析前处理公式，否则 marked 会把公式里的 _ 解析成斜体
        const mathProcessedStr = renderMath(markdownStr);

        // --- 步骤 B: 再转换为 HTML ---
        const bodyHtml = marked.parse(mathProcessedStr);

        // --- 步骤 C: 包装 HTML ---
        // 注意：增加了 MathML 的命名空间 xmlns:m
        const fullHtml = `
        <!DOCTYPE html>
        <html 
            xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word'
            xmlns:m='http://schemas.microsoft.com/office/2004/12/omml'
        >
        <head>
            <meta charset="utf-8">
            <title>Markdown to Word</title>
            <style>
            body { font-family: 'Calibri', sans-serif; }
            
            /* 让公式在 Word 里稍微好看一点的 hack */
            math { font-family: 'Cambria Math', serif; }
            
            table { border-collapse: collapse; width: 100%; margin: 10px 0; }
            td, th { border: 1px solid #000; padding: 5px; }
            img { max-width: 100%; }
            </style>
        </head>
        <body>
            ${bodyHtml}
        </body>
        </html>
        `;

        // --- 步骤 D: 写入剪贴板 ---
        const clipboardData = new ClipboardItem({
        'text/html': new Blob([fullHtml], { type: 'text/html' }),
        'text/plain': new Blob([markdownStr], { type: 'text/plain' })
        });

        await navigator.clipboard.write([clipboardData]);
        console.log('✅ 带公式的内容已复制！');
        return true;

    } catch (err) {
        console.error('复制失败:', err);
        throw err;
    }
}



