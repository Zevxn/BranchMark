// SECTION Markdown 交互块运行与放大
let expandedInteractiveBlock = null;
// 用弱引用分发 iframe 消息，笔记移除后无需保留逐块的全局事件监听器。
const interactiveBlockMessageHandlers = new WeakMap();
window.addEventListener('message', event => {
    if (event.source) interactiveBlockMessageHandlers.get(event.source)?.(event);
});

function getInteractiveBlockThemeStyle() {
    const theme = getComputedStyle(document.documentElement);
    return `
        :root { color-scheme: ${theme.colorScheme}; background-color: ${theme.getPropertyValue('--card-bg')}; }
        :root[data-branchmark-expanded], :root[data-branchmark-expanded] > body {
            scrollbar-gutter: auto !important; scrollbar-width: auto !important; scrollbar-color: auto !important;
        }
        :root[data-branchmark-expanded] > body {
            padding-bottom: calc(var(--branchmark-body-padding-bottom, 0px) + var(--branchmark-bottom-spacing, 24px)) !important;
        }
        :root[data-branchmark-expanded]::-webkit-scrollbar,
        :root[data-branchmark-expanded] > body::-webkit-scrollbar { width: 0 !important; }
        *::-webkit-scrollbar { width: ${theme.getPropertyValue('--scroll-size')}; height: ${theme.getPropertyValue('--scroll-size')}; }
        *::-webkit-scrollbar-track { background: ${theme.getPropertyValue('--scroll-track')}; border-radius: 4px; }
        *::-webkit-scrollbar-thumb { background-color: ${theme.getPropertyValue('--scroll-thumb')}; border-radius: 4px; border: 2px solid transparent; background-clip: content-box; }
        *::-webkit-scrollbar-thumb:hover { background-color: ${theme.getPropertyValue('--scroll-thumb-hover')}; }
        *::-webkit-scrollbar-corner { background: transparent; }
        *::-webkit-scrollbar-button { display: none; }
    `;
}

function updateInteractiveBlockTheme() {
    const css = getInteractiveBlockThemeStyle();
    document.querySelectorAll('.interactive-block-frame').forEach(frame => {
        frame.contentWindow?.postMessage({ type: 'branchmark-interactive-theme', css }, '*');
    });
}

// iframe 与外层容器共用事件归属规则；新增导图操作只需在这里决定归属。
function getInteractiveBlockEventAction(event, context) {
    if (event.type === 'keydown' && (event.ctrlKey || event.metaKey)
        && (event.key === 's' || event.key === 'S')) return 'save';
    if (event.type === 'keydown' && event.key === 'F11' && context.nativeFullscreen
        && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) return 'fullscreen';
    if (event.type === 'keyup' && event.code === 'Space' && context.spacePressed) return 'space';
    if (event.type === 'keydown' && event.key === 'Escape' && !event.defaultPrevented && context.expanded) return 'escape';
    if (event.type === 'contextmenu') return context.owner && !context.expanded ? 'contextmenu' : '';
    if (context.owner !== 'node' || context.expanded) return '';
    if (event.type === 'keydown') {
        const active = context.activeElement;
        const typing = active && (active.isContentEditable || ['TEXTAREA', 'SELECT'].includes(active.tagName)
            || (active.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color'].includes(active.type))
            || active.closest?.('[role="textbox"], [role="combobox"], [role="spinbutton"]'));
        if (event.code === 'Space') {
            return typing ? '' : 'space';
        }
        if (context.mode !== 'IDLE' || event.defaultPrevented || event.isComposing
            || event.keyCode === 229 || context.hasSelection || event.altKey || event.shiftKey) return '';
        // 对齐主页面已有的卡片快捷键；输入状态保留控件的剪贴板、全选和撤销行为。
        if (event.ctrlKey || event.metaKey) {
            return !typing && (['a', 'c', 'v', 'x', 'z', 'y', 'f'].includes(event.key?.toLowerCase())
                || event.key === 'Enter') ? 'node-key' : '';
        }
        const control = typing || (active && (['INPUT', 'BUTTON', 'A', 'SUMMARY'].includes(active.tagName)
            || active.closest?.('[role="button"], [role="slider"]')));
        if (control) return '';
        if (event.key === 'Tab') return 'tab';
        if (['Enter', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return 'node-key';
    }
    if (context.spacePressed && (event.type === 'mousedown' || event.type === 'wheel')) return 'canvas';
    if (event.type === 'mousedown' && event.button === 0 && context.mode === 'IDLE') return 'select';
    return '';
}

function createInteractiveBlockDocument(source, owner = '', linkBridgeToken = '', hostOrigin = window.location?.origin || '') {
    // iframe 内的键盘事件不会冒泡到导图，统一转发宿主全局操作和未被控件消费的卡片快捷键。
    // 前置 doctype 保持标准模式，后续完整 HTML 或 HTML 片段均由浏览器解析。
    return `<!doctype html><script>
        (() => {
        let pending = false;
        let pendingMeasureRequestId = null;
        let forwardingSpace = false;
        let themeReady = false;
        let themeRevision = 0;
        const getEventAction = ${getInteractiveBlockEventAction.toString()};
        const sheet = document.createElement('style');
        sheet.textContent = ${JSON.stringify(getInteractiveBlockThemeStyle())};
        // 在控件源码执行前提供宿主主题，避免首次读取到默认亮色。
        document.head.appendChild(sheet);
        function reportScroll() {
            const root = document.scrollingElement;
            if (!root) return;
            parent.postMessage({ type: 'branchmark-interactive-scroll', top: scrollY,
                height: root.clientHeight, total: root.scrollHeight, viewportHeight: innerHeight }, '*');
        }
        function reportSize() {
            pending = false;
            const body = document.body;
            if (!body) return;
            const measureRequestId = pendingMeasureRequestId;
            pendingMeasureRequestId = null;
            const style = getComputedStyle(body);
            let right = 0;
            let bottom = 0;
            // 不用 documentElement.scrollHeight，它至少等于视口高度，会把空白也算成内容。
            for (const node of body.childNodes) {
                if (node.nodeType === 1 && /^(SCRIPT|STYLE|LINK|META|TITLE|TEMPLATE)$/.test(node.tagName)) continue;
                if (node.nodeType === 3 && !node.textContent.trim()) continue;
                const range = document.createRange();
                range.selectNode(node);
                const rect = node.nodeType === 1 ? node.getBoundingClientRect() : range.getBoundingClientRect();
                if (!rect.width && !rect.height) continue;
                const nodeStyle = node.nodeType === 1 ? getComputedStyle(node) : null;
                right = Math.max(right, rect.right + scrollX + (parseFloat(nodeStyle?.marginRight) || 0));
                bottom = Math.max(bottom, rect.bottom + scrollY + (parseFloat(nodeStyle?.marginBottom) || 0));
            }
            // 视口滚动条占用的空间也要算入，避免每次测量都缩窄一个滚动条宽度。
            const verticalScrollbar = Math.max(0, innerWidth - document.documentElement.clientWidth);
            const width = Math.ceil(right + (parseFloat(style.paddingRight) || 0) + (parseFloat(style.marginRight) || 0) + verticalScrollbar);
            const horizontalScrollbar = Math.max(0, innerHeight - document.documentElement.clientHeight);
            const height = Math.ceil(bottom + (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.marginBottom) || 0) + horizontalScrollbar);
            parent.postMessage({ type: 'branchmark-interactive-size', width, height,
                viewportWidth: innerWidth, measureRequestId, ready: themeReady }, '*');
            reportScroll();
        }
        function scheduleSize(measureRequestId = null) {
            if (Number.isSafeInteger(measureRequestId)) pendingMeasureRequestId = measureRequestId;
            if (pending) return;
            pending = true;
            requestAnimationFrame(reportSize);
        }
        addEventListener('DOMContentLoaded', () => {
            // 放回末尾，保持宿主样式在控件解析完成后的优先顺序。
            document.head.appendChild(sheet);
            new ResizeObserver(scheduleSize).observe(document.body);
            new MutationObserver(scheduleSize).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
            document.fonts.ready.then(scheduleSize);
            scheduleSize();
        });
        addEventListener('load', scheduleSize, true);
        addEventListener('resize', scheduleSize);
        addEventListener('scroll', reportScroll, { passive: true });
        function forwardEvent(event, capture = false) {
            const action = getEventAction(event, {
                owner: ${JSON.stringify(owner)}, mode: 'IDLE',
                nativeFullscreen: ${typeof window.__TAURI__?.core?.invoke === 'function' && !window.__DEEPCONVO_NATIVE_QUICKER_HOST__},
                expanded: document.documentElement.hasAttribute('data-branchmark-expanded'),
                spacePressed: forwardingSpace, activeElement: document.activeElement,
                hasSelection: Boolean(globalThis.getSelection?.()?.toString())
            });
            // 按动作决定事件阶段，新增卡片快捷键自动沿用控件优先规则。
            if (capture && ['tab', 'node-key', 'escape'].includes(action)) return;
            if (event.type === 'contextmenu' || ['space', 'tab', 'node-key', 'save', 'fullscreen'].includes(action)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
            if (!action || action === 'canvas') return;
            if (action === 'space') forwardingSpace = event.type === 'keydown';
            parent.postMessage({ type: 'branchmark-interactive-event', event: {
                type: event.type, key: event.key, code: event.code, button: event.button,
                ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey,
                repeat: event.repeat, clientX: event.clientX, clientY: event.clientY
            } }, '*');
        }
        addEventListener('click', event => {
            if (!event.isTrusted || event.defaultPrevented) return;
            const link = event.target?.closest?.('a[href]');
            if (!link || link.hasAttribute('download')) return;
            let target;
            try { target = new URL(link.href, document.baseURI); } catch { return; }
            if (!['http:', 'https:'].includes(target.protocol) || target.origin === ${JSON.stringify(hostOrigin)}) return;
            event.preventDefault();
            parent.postMessage({ type: 'branchmark-interactive-open-external-link', href: target.href,
                token: ${JSON.stringify(linkBridgeToken)} }, '*');
        });
        ['mousedown', 'contextmenu', 'keydown', 'keyup'].forEach(type => {
            addEventListener(type, event => {
                forwardEvent(event, true);
            }, true);
        });
        addEventListener('keydown', event => {
            forwardEvent(event);
        });
        addEventListener('message', event => {
            if (event.source !== parent) return;
            if (event.data?.type === 'branchmark-interactive-measure') scheduleSize(event.data.requestId);
            if (event.data?.type === 'branchmark-interactive-expanded') {
                const root = document.documentElement;
                // 留白位于网页自身，参与滚动范围；还原时保留控件原有的 padding。
                if (event.data.expanded === true && !root.hasAttribute('data-branchmark-expanded')) {
                    root.style.setProperty('--branchmark-body-padding-bottom', getComputedStyle(document.body).paddingBottom);
                }
                if (Number.isFinite(event.data.bottomSpacing) && event.data.bottomSpacing >= 0) {
                    root.style.setProperty('--branchmark-bottom-spacing', event.data.bottomSpacing + 'px');
                }
                root.toggleAttribute('data-branchmark-expanded', event.data.expanded === true);
                scheduleSize();
            }
            if (event.data?.type === 'branchmark-interactive-scroll-to' && Number.isFinite(event.data.top)) {
                scrollTo({ top: event.data.top, behavior: 'instant' });
                reportScroll();
            }
            if (event.data?.type === 'branchmark-interactive-theme' && typeof event.data.css === 'string') {
                sheet.textContent = event.data.css;
                const revision = ++themeRevision;
                // 等控件自己的主题消息监听器及其下一帧绘制完成后，再报告可显示的尺寸。
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    if (revision !== themeRevision) return;
                    themeReady = true;
                    scheduleSize();
                }));
            }
        });
        // 控件源码运行前移除启动脚本文本，避免它读出宿主外链桥接令牌。
        document.currentScript?.remove();
        })();
    <\/script>\n${source}`;
}

function renderInteractiveBlocks(element) {
    element.querySelectorAll('pre > code.language-interactive').forEach(code => {
        const wrapper = document.createElement('div');
        wrapper.className = 'interactive-block';
        const surface = document.createElement('dialog');
        surface.className = 'interactive-block-surface';
        surface.open = true;
        surface.setAttribute('aria-label', '交互内容');

        const toolbar = document.createElement('div');
        toolbar.className = 'interactive-block-toolbar';
        const label = document.createElement('span');
        label.innerHTML = '<i class="ri-cursor-line" aria-hidden="true"></i>交互';
        toolbar.appendChild(label);

        const expandButton = document.createElement('button');
        expandButton.type = 'button';
        expandButton.className = 'interactive-block-action interactive-block-expand';
        expandButton.title = '放大查看';
        expandButton.setAttribute('aria-label', '放大交互内容');
        expandButton.setAttribute('aria-expanded', 'false');
        expandButton.innerHTML = '<i class="ri-fullscreen-line" aria-hidden="true"></i>';

        const fullscreenButton = document.createElement('button');
        fullscreenButton.type = 'button';
        fullscreenButton.className = 'interactive-block-action interactive-block-fullscreen';
        fullscreenButton.title = '铺满应用内容区域';
        fullscreenButton.setAttribute('aria-label', '全屏预览交互内容');
        fullscreenButton.setAttribute('aria-pressed', 'false');
        fullscreenButton.innerHTML = '<i class="ri-fullscreen-line" aria-hidden="true"></i>';
        fullscreenButton.hidden = true;

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'interactive-block-action interactive-block-close';
        closeButton.title = '关闭放大视图（Esc）';
        closeButton.setAttribute('aria-label', '关闭放大视图');
        closeButton.innerHTML = '<i class="ri-close-line" aria-hidden="true"></i>';
        closeButton.hidden = true;
        toolbar.append(expandButton, fullscreenButton, closeButton);

        const frame = document.createElement('iframe');
        frame.className = 'interactive-block-frame is-loading';
        frame.title = '交互内容';
        // 仅允许交互脚本；不授予对父页面的同源访问、弹窗或顶层导航能力。
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.setAttribute('referrerpolicy', 'no-referrer');
        const linkBridgeToken = Array.from(window.crypto.getRandomValues(new Uint32Array(4)), value => value.toString(36)).join('-');
        // 异步加载期间也可能切换主题，加载完成后以页面的当前主题为准。
        frame.addEventListener('load', () => {
            frame.contentWindow?.postMessage({ type: 'branchmark-interactive-theme', css: getInteractiveBlockThemeStyle() }, '*');
        });
        const owner = code.closest('.node-card') ? 'node' : code.closest('.summary-editor') ? 'summary' : '';
        frame.srcdoc = createInteractiveBlockDocument(code.textContent, owner, linkBridgeToken, location.origin);
        const viewport = document.createElement('div');
        viewport.className = 'interactive-block-viewport';
        const scrollbar = document.createElement('div');
        scrollbar.className = 'interactive-block-scrollbar';
        scrollbar.hidden = true;
        scrollbar.tabIndex = 0;
        scrollbar.setAttribute('role', 'scrollbar');
        scrollbar.setAttribute('aria-label', '交互内容滚动');
        scrollbar.setAttribute('aria-orientation', 'vertical');
        scrollbar.setAttribute('aria-valuemin', '0');
        const thumb = document.createElement('div');
        thumb.className = 'interactive-block-scrollbar-thumb';
        scrollbar.appendChild(thumb);
        viewport.append(frame, scrollbar);
        surface.append(toolbar, viewport);
        wrapper.appendChild(surface);

        let expanded = false;
        let scrollTop = 0;
        let scrollMax = 0;
        let thumbTravel = 0;
        let dragOffset = null;
        let measureRequestId = 0;
        let pendingMeasureRequest = null;
        let pendingScrollTop = null;
        let fullscreenAnimation = null;
        function handleInteraction(event, fromFrame = false) {
            const card = wrapper.closest('.node-card, .summary-editor');
            const action = getInteractiveBlockEventAction(event, {
                owner: wrapper.isConnected && card ? (card.matches('.node-card') ? 'node' : 'summary') : '',
                expanded, mode: state.mode, spacePressed: isSpacePressed,
                nativeFullscreen: typeof window.__TAURI__?.core?.invoke === 'function' && !window.__DEEPCONVO_NATIVE_QUICKER_HOST__,
                activeElement: fromFrame ? null : document.activeElement
            });
            switch (action) {
                case 'save':
                    if (!fromFrame) event.preventDefault();
                    if (typeof syncCurrentInput === 'function') syncCurrentInput();
                    saveMindMapData(true);
                    break;
                case 'select': {
                    // iframe 获得焦点后，主页面残留的文字选区不应拦截卡片快捷键。
                    if (fromFrame) window.getSelection()?.removeAllRanges();
                    clearSelectedMindMapRelation();
                    clearSelectedMindMapSummary();
                    const id = card.dataset.nodeId;
                    if (event.ctrlKey === true) {
                        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
                        else state.selectedIds.add(id);
                    } else if (!state.selectedIds.has(id)) {
                        state.selectedIds.clear();
                        state.selectedIds.add(id);
                    }
                    updateSelection();
                    break;
                }
                case 'tab':
                case 'node-key':
                case 'fullscreen':
                    // 复用导图快捷键入口的选中节点、编辑状态等判断。
                    if (!fromFrame) event.preventDefault();
                    document.body.dispatchEvent(new KeyboardEvent('keydown', {
                        key: event.key, code: event.code, repeat: event.repeat === true,
                        ctrlKey: event.ctrlKey === true, metaKey: event.metaKey === true,
                        altKey: event.altKey === true, shiftKey: event.shiftKey === true,
                        bubbles: true, cancelable: true
                    }));
                    break;
                case 'space':
                    // 外层原事件直接冒泡；iframe 事件经同一宿主入口更新导航状态。
                    if (fromFrame) document.body.dispatchEvent(new KeyboardEvent(event.type, {
                        key: ' ', code: 'Space', repeat: event.repeat === true, bubbles: true, cancelable: true
                    }));
                    break;
                case 'contextmenu':
                    if (fromFrame) card.dispatchEvent(new MouseEvent('contextmenu', {
                        bubbles: true, cancelable: true, view: window, button: 2,
                        clientX: event.clientX, clientY: event.clientY
                    }));
                    break;
                case 'escape':
                    if (!fromFrame) event.preventDefault();
                    dismiss();
                    break;
            }
            return action;
        }
        function scrollToTop(top) {
            scrollTop = Math.max(0, Math.min(scrollMax, top));
            frame.contentWindow?.postMessage({ type: 'branchmark-interactive-scroll-to', top: scrollTop }, '*');
        }
        scrollbar.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            scrollbar.focus({ preventScroll: true });
            scrollbar.setPointerCapture(event.pointerId);
            scrollbar.classList.add('is-dragging');
            dragOffset = event.target === thumb ? event.clientY - thumb.getBoundingClientRect().top : thumb.offsetHeight / 2;
            if (event.target !== thumb) scrollToTop((event.clientY - scrollbar.getBoundingClientRect().top - dragOffset) / (thumbTravel || 1) * scrollMax);
        });
        scrollbar.addEventListener('pointermove', event => {
            if (dragOffset === null) return;
            scrollToTop((event.clientY - scrollbar.getBoundingClientRect().top - dragOffset) / (thumbTravel || 1) * scrollMax);
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => scrollbar.addEventListener(type, () => {
            dragOffset = null;
            scrollbar.classList.remove('is-dragging');
        }));
        scrollbar.addEventListener('keydown', event => {
            const positions = { ArrowUp: scrollTop - 40, ArrowDown: scrollTop + 40,
                PageUp: scrollTop - scrollbar.clientHeight, PageDown: scrollTop + scrollbar.clientHeight,
                Home: 0, End: scrollMax };
            if (!(event.key in positions)) return;
            event.preventDefault();
            scrollToTop(positions[event.key]);
        });
        scrollbar.addEventListener('wheel', event => {
            event.preventDefault();
            const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scrollbar.clientHeight : 1;
            scrollToTop(scrollTop + event.deltaY * unit);
        }, { passive: false });
        const observer = new MutationObserver(() => {
            // 源笔记重建或预览关闭后，不保留已脱离文档的放大状态。
            if (!surface.isConnected) restore(false);
        });
        const handleMessage = event => {
            if (event.source !== frame.contentWindow) return;
            if (event.data?.type === 'branchmark-interactive-open-external-link') {
                if (event.data.token !== linkBridgeToken || typeof event.data.href !== 'string') return;
                if (typeof openMarkdownExternalUrl === 'function') void openMarkdownExternalUrl(event.data.href);
                return;
            }
            if (event.data?.type === 'branchmark-interactive-event') {
                const input = event.data.event;
                if (!input || !['mousedown', 'contextmenu', 'keydown', 'keyup'].includes(input.type)) return;
                if (input.type === 'contextmenu') {
                    if (!Number.isFinite(input.clientX) || !Number.isFinite(input.clientY)) return;
                    const bounds = frame.getBoundingClientRect();
                    // iframe 坐标是未缩放的 CSS 像素，转换成宿主视口坐标。
                    input.clientX = bounds.left + input.clientX * bounds.width / (frame.clientWidth || 1);
                    input.clientY = bounds.top + input.clientY * bounds.height / (frame.clientHeight || 1);
                }
                handleInteraction(input, true);
                return;
            }
            if (expanded && event.data?.type === 'branchmark-interactive-scroll') {
                const { top, height, total, viewportHeight } = event.data;
                if (![top, height, total, viewportHeight].every(Number.isFinite) || height <= 0) return;
                scrollTop = top;
                scrollMax = Math.max(0, total - height);
                scrollbar.hidden = scrollMax <= 1;
                scrollbar.style.bottom = `${Math.max(0, viewportHeight - height)}px`;
                const trackHeight = scrollbar.clientHeight;
                const thumbHeight = Math.min(trackHeight, Math.max(28, trackHeight * height / total));
                thumbTravel = Math.max(0, trackHeight - thumbHeight);
                thumb.style.height = `${thumbHeight}px`;
                thumb.style.transform = `translateY(${scrollMax ? Math.min(1, top / scrollMax) * thumbTravel : 0}px)`;
                scrollbar.setAttribute('aria-valuemax', String(scrollMax));
                scrollbar.setAttribute('aria-valuenow', String(Math.round(top)));
            }
            if (event.data?.type === 'branchmark-interactive-size') {
                const { width, height, viewportWidth } = event.data;
                if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
                // 宽度变化后，旧测量不能覆盖新布局；请求一次基于当前栏宽的新测量。
                const currentFrameWidth = frame.clientWidth;
                const isRequestedMeasurement = pendingMeasureRequest?.id === event.data.measureRequestId
                    && pendingMeasureRequest.width === currentFrameWidth;
                if (viewportWidth !== currentFrameWidth && !isRequestedMeasurement) {
                    if (!pendingMeasureRequest || pendingMeasureRequest.width !== currentFrameWidth) {
                        pendingMeasureRequest = { id: ++measureRequestId, width: currentFrameWidth };
                        frame.contentWindow?.postMessage({ type: 'branchmark-interactive-measure',
                            requestId: pendingMeasureRequest.id }, '*');
                    }
                    return;
                }
                pendingMeasureRequest = null;
                const surfaceHeight = Math.max(120, height + toolbar.offsetHeight);
                if (expanded && !surface.classList.contains('is-fullscreen') && !fullscreenAnimation) {
                    const frameStyle = getComputedStyle(frame);
                    const sideSpacing = (parseFloat(frameStyle.marginLeft) || 0) + (parseFloat(frameStyle.marginRight) || 0);
                    surface.style.setProperty('--interactive-width', `${Math.max(320, width + sideSpacing)}px`);
                    surface.style.setProperty('--interactive-height', `${surfaceHeight}px`);
                } else if (!expanded) {
                    wrapper.style.setProperty('--interactive-inline-height', `${surfaceHeight}px`);
                }
                // 隐藏期间仍参与布局；只在主题就绪且尺寸匹配当前视口后显示。
                if (event.data.ready === true) frame.classList.remove('is-loading');
                if (!expanded) wrapper.dispatchEvent(new CustomEvent('branchmark-content-resize', { bubbles: true }));
                if (pendingScrollTop !== null) {
                    frame.contentWindow?.postMessage({ type: 'branchmark-interactive-scroll-to', top: pendingScrollTop }, '*');
                    pendingScrollTop = null;
                }
            }
        };

        function setFullscreen(fullscreen, animate = false) {
            // 连续切换从当前可见尺寸接续，不从上一动画的起点重播。
            const previousBounds = expanded && animate ? surface.getBoundingClientRect() : null;
            fullscreenAnimation?.cancel();
            fullscreenAnimation = null;
            // 仅改变同一预览窗口的尺寸，保留 iframe 和普通预览的尺寸记录。
            surface.classList.toggle('is-fullscreen', fullscreen);
            fullscreenButton.title = fullscreen ? '还原预览尺寸（Esc）' : '铺满应用内容区域';
            fullscreenButton.setAttribute('aria-label', fullscreen ? '还原预览尺寸' : '全屏预览交互内容');
            fullscreenButton.setAttribute('aria-pressed', String(fullscreen));
            fullscreenButton.innerHTML = `<i class="${fullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'}" aria-hidden="true"></i>`;
            closeButton.title = fullscreen ? '关闭放大视图' : '关闭放大视图（Esc）';
            if (!expanded) return;
            if (previousBounds) {
                const bounds = surface.getBoundingClientRect();
                const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                // 先完成布局，再用 transform 衔接尺寸，避免逐帧改变 iframe 宽高。
                const animation = surface.animate(reduceMotion
                    ? [{ opacity: 0.9 }, { opacity: 1 }]
                    : [{ transform: `scale(${previousBounds.width / bounds.width}, ${previousBounds.height / bounds.height})` },
                        { transform: 'none' }], {
                    duration: reduceMotion ? 160 : 240,
                    easing: 'cubic-bezier(0.77, 0, 0.175, 1)'
                });
                fullscreenAnimation = animation;
                animation.onfinish = () => {
                    if (fullscreenAnimation !== animation) return;
                    fullscreenAnimation = null;
                    frame.contentWindow?.postMessage({ type: 'branchmark-interactive-measure' }, '*');
                };
            }
            pendingScrollTop = scrollTop;
            frame.contentWindow?.postMessage({ type: 'branchmark-interactive-measure' }, '*');
        }

        function dismiss() {
            if (surface.classList.contains('is-fullscreen')) setFullscreen(false);
            else restore();
        }

        function restore(restoreFocus = true) {
            if (!expanded) return;
            expanded = false;
            setFullscreen(false);
            pendingScrollTop = null;
            fullscreenButton.hidden = true;
            scrollbar.hidden = true;
            frame.contentWindow?.postMessage({ type: 'branchmark-interactive-expanded', expanded: false }, '*');
            observer.disconnect();
            if (expandedInteractiveBlock?.surface === surface) expandedInteractiveBlock = null;
            surface.close();
            surface.classList.remove('is-expanded');
            surface.open = true;
            expandButton.hidden = false;
            expandButton.setAttribute('aria-expanded', 'false');
            closeButton.hidden = true;
            // 还原到笔记宽度后重新测量，文本换行可能使高度不同于放大窗口。
            frame.contentWindow?.postMessage({ type: 'branchmark-interactive-measure' }, '*');
            if (restoreFocus && expandButton.isConnected) expandButton.focus({ preventScroll: true });
        }

        expandButton.addEventListener('click', () => {
            if (!surface.isConnected || expanded || typeof surface.showModal !== 'function') return;
            expandedInteractiveBlock?.restore(false);
            // 保持 iframe 的 DOM 位置；普通 reparent 会重新加载其 browsing context。
            surface.close();
            // 先提供桌面宽度，让响应式页面重新排版，再收紧固定尺寸的小控件。
            surface.style.removeProperty('--interactive-width');
            surface.classList.add('is-expanded');
            expandButton.hidden = true;
            expandButton.setAttribute('aria-expanded', 'true');
            closeButton.hidden = false;
            fullscreenButton.hidden = false;
            surface.showModal();
            expanded = true;
            expandedInteractiveBlock = { surface, restore };
            frame.contentWindow.postMessage({ type: 'branchmark-interactive-expanded', expanded: true,
                bottomSpacing: parseFloat(getComputedStyle(frame).marginLeft) || 0 }, '*');
            frame.contentWindow.postMessage({ type: 'branchmark-interactive-measure' }, '*');
            observer.observe(document.body, { childList: true, subtree: true });
            closeButton.focus({ preventScroll: true });
        });
        fullscreenButton.addEventListener('click', () => {
            setFullscreen(!surface.classList.contains('is-fullscreen'), true);
        });
        closeButton.addEventListener('click', () => restore());
        surface.addEventListener('cancel', event => {
            event.preventDefault();
            dismiss();
        });
        surface.addEventListener('close', () => {
            if (!surface.open) restore();
        });
        surface.addEventListener('click', event => {
            if (!expanded || event.target !== surface) return;
            const bounds = surface.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right
                || event.clientY < bounds.top || event.clientY > bounds.bottom) restore();
        });

        // iframe 与工具栏统一分流：导图导航放行，其余事件留在控件内。
        ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel', 'keydown', 'keyup', 'contextmenu'].forEach(type => {
            wrapper.addEventListener(type, event => {
                if (type === 'contextmenu') event.preventDefault();
                const action = handleInteraction(event);
                if (action === 'space' || action === 'canvas' || action === 'contextmenu') return;
                event.stopPropagation();
            });
        });
        code.parentElement.replaceWith(wrapper);
        interactiveBlockMessageHandlers.set(frame.contentWindow, handleMessage);
    });
}
// !SECTION Markdown 交互块运行与放大
