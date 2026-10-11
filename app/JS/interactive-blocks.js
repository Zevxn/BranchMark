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

function createInteractiveBlockDocument(source) {
    // iframe 内的键盘事件不会冒泡到导图，只转发未被组件消费的 Esc。
    // 前置 doctype 保持标准模式，后续完整 HTML 或 HTML 片段均由浏览器解析。
    return `<!doctype html><script>
        (() => {
        let pending = false;
        const sheet = document.createElement('style');
        sheet.textContent = ${JSON.stringify(getInteractiveBlockThemeStyle())};
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
            parent.postMessage({ type: 'branchmark-interactive-size', width, height, viewportWidth: innerWidth }, '*');
            reportScroll();
        }
        function scheduleSize() {
            if (pending) return;
            pending = true;
            requestAnimationFrame(reportSize);
        }
        addEventListener('DOMContentLoaded', () => {
            document.head.appendChild(sheet);
            new ResizeObserver(scheduleSize).observe(document.body);
            new MutationObserver(scheduleSize).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
            document.fonts.ready.then(scheduleSize);
            scheduleSize();
        });
        addEventListener('load', scheduleSize, true);
        addEventListener('resize', scheduleSize);
        addEventListener('scroll', reportScroll, { passive: true });
        addEventListener('message', event => {
            if (event.source !== parent) return;
            if (event.data?.type === 'branchmark-interactive-measure') scheduleSize();
            if (event.data?.type === 'branchmark-interactive-expanded') {
                document.documentElement.toggleAttribute('data-branchmark-expanded', event.data.expanded === true);
                scheduleSize();
            }
            if (event.data?.type === 'branchmark-interactive-scroll-to' && Number.isFinite(event.data.top)) {
                scrollTo({ top: event.data.top, behavior: 'instant' });
                reportScroll();
            }
            if (event.data?.type === 'branchmark-interactive-theme' && typeof event.data.css === 'string') {
                sheet.textContent = event.data.css;
            }
        });
        addEventListener('keydown', event => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
                parent.postMessage({ type: 'branchmark-interactive-escape' }, '*');
            }
        });
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

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'interactive-block-action interactive-block-close';
        closeButton.title = '关闭放大视图（Esc）';
        closeButton.setAttribute('aria-label', '关闭放大视图');
        closeButton.innerHTML = '<i class="ri-close-line" aria-hidden="true"></i>';
        closeButton.hidden = true;
        toolbar.append(expandButton, closeButton);

        const frame = document.createElement('iframe');
        frame.className = 'interactive-block-frame';
        frame.title = '交互内容';
        // 仅允许交互脚本；不授予对父页面的同源访问、弹窗或顶层导航能力。
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.setAttribute('referrerpolicy', 'no-referrer');
        // 异步加载期间也可能切换主题，加载完成后以页面的当前主题为准。
        frame.addEventListener('load', () => {
            frame.contentWindow?.postMessage({ type: 'branchmark-interactive-theme', css: getInteractiveBlockThemeStyle() }, '*');
        });
        frame.srcdoc = createInteractiveBlockDocument(code.textContent);
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
            if (event.data?.type === 'branchmark-interactive-escape') restore();
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
                // 放大或还原前排队的旧测量不能覆盖新视口的布局。
                if (viewportWidth !== frame.clientWidth) return;
                const surfaceHeight = Math.max(120, height + toolbar.offsetHeight);
                if (expanded) {
                    const frameStyle = getComputedStyle(frame);
                    const sideSpacing = (parseFloat(frameStyle.marginLeft) || 0) + (parseFloat(frameStyle.marginRight) || 0);
                    surface.style.setProperty('--interactive-width', `${Math.max(320, width + sideSpacing)}px`);
                    surface.style.setProperty('--interactive-height', `${surfaceHeight}px`);
                } else {
                    wrapper.style.setProperty('--interactive-inline-height', `${surfaceHeight}px`);
                }
            }
        };

        function restore(restoreFocus = true) {
            if (!expanded) return;
            expanded = false;
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
            surface.showModal();
            expanded = true;
            expandedInteractiveBlock = { surface, restore };
            frame.contentWindow.postMessage({ type: 'branchmark-interactive-expanded', expanded: true }, '*');
            frame.contentWindow.postMessage({ type: 'branchmark-interactive-measure' }, '*');
            observer.observe(document.body, { childList: true, subtree: true });
            closeButton.focus({ preventScroll: true });
        });
        closeButton.addEventListener('click', () => restore());
        surface.addEventListener('cancel', event => {
            event.preventDefault();
            restore();
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

        // 工具按钮与容器空白处也不能触发导图拖拽、缩放、编辑或全局快捷键。
        ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel', 'contextmenu', 'keydown', 'keyup'].forEach(type => {
            wrapper.addEventListener(type, event => {
                if (type === 'keydown' && event.key === 'Escape' && expanded) {
                    event.preventDefault();
                    restore();
                }
                event.stopPropagation();
            });
        });
        code.parentElement.replaceWith(wrapper);
        interactiveBlockMessageHandlers.set(frame.contentWindow, handleMessage);
    });
}
// !SECTION Markdown 交互块运行与放大
