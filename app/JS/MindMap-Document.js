// SECTION Markdown 文档素材与源码分块
const MINDMAP_DOCUMENT_RETAIN_AFTER_DROP_STORAGE_KEY = 'mindmap_document_retain_after_drop';
const mindMapDocumentState = {
    source: '',
    name: '文档素材',
    root: null,
    preview: null,
    dragger: null,
    scrollTop: 0,
    references: '',
    loadRequest: 0,
    retainAfterDrop: false,
};

function splitMindMapDocumentMarkdown(source) {
    const lexer = new marked.Marked({
        gfm: true,
        extensions: [{
            name: 'documentMath',
            level: 'block',
            start(text) {
                const match = /(?:^|\n) {0,3}\$\$/.exec(text);
                return match ? match.index : undefined;
            },
            tokenizer(text) {
                const match = /^ {0,3}\$\$[\s\S]+?\$\$[ \t]*(?:\n|$)/.exec(text);
                if (match) return { type: 'documentMath', raw: match[0] };
            },
        }],
    });
    const tokens = lexer.lexer(normalizeMarkdownMathDelimiters(String(source).replace(/\r\n?/g, '\n')));
    const references = Object.entries(tokens.links || {}).map(([label, link]) =>
        `[${label}]: <${link.href}>${link.title ? ` ${JSON.stringify(link.title)}` : ''}`
    ).join('\n');
    return {
        blocks: tokens.filter(token => token.type !== 'space').map(token => token.raw),
        references,
    };
}

function getMindMapDocumentSelectionMarkdown(elements) {
    const fragments = elements.map(element => element.dataset.markdownSource.replace(/^\n+|\n+$/g, '')).filter(Boolean);
    if (!fragments.length) return '';
    return fragments.join('\n\n') + (mindMapDocumentState.references ? `\n\n${mindMapDocumentState.references}` : '');
}

function getMindMapDocumentDraggedBlocks(dataTransfer) {
    const drag = mindMapDocumentState.dragger?.drag;
    return drag && dataTransfer?.getData(MINDMAP_DOCUMENT_DRAG_MIME) === drag.token ? [...drag.elements] : [];
}

function completeMindMapDocumentDrop(elements, retain) {
    if (!retain) return removeMindMapDocumentBlocks(elements);
    const state = mindMapDocumentState;
    const blocks = elements.filter(element => element.parentElement === state.preview && !element.classList.contains('is-removing'));
    if (!blocks.length) return;
    blocks.forEach(block => block.classList.add('is-used'));
    state.dragger.clearSelection();
}

async function removeMindMapDocumentBlocks(elements) {
    const state = mindMapDocumentState;
    const blocks = elements.filter(element => element.parentElement === state.preview && !element.classList.contains('is-removing'));
    if (!blocks.length) return;
    const animate = state.root.isConnected && !state.preview.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animations = [];
    state.preview.classList.add('is-removing-content');
    blocks.forEach(block => {
        block.classList.add('is-removing');
        block.draggable = false;
        if (!animate) return;
        const style = getComputedStyle(block);
        animations.push(block.animate([
            {
                height: `${block.getBoundingClientRect().height}px`, opacity: style.opacity,
                paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
                marginTop: style.marginTop, marginBottom: style.marginBottom,
                borderTopWidth: style.borderTopWidth, borderBottomWidth: style.borderBottomWidth,
            },
            { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' },
        ], { duration: 200, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {}));
    });
    state.dragger.clearSelection();
    state.source = getMindMapDocumentSelectionMarkdown(Array.from(state.preview.children).filter(block => !block.classList.contains('is-removing')));
    if (animations.length) await Promise.all(animations);
    const currentBlocks = blocks.filter(block => block.parentElement === state.preview);
    currentBlocks.forEach(block => block.remove());
    if (state.preview.querySelector('.is-removing')) return;
    state.preview.classList.remove('is-removing-content');
    if (!currentBlocks.length) return;
    if (state.root.isConnected && !state.preview.hidden) state.scrollTop = state.preview.scrollTop;
    if (state.root.querySelector('.document-source-editor').hidden) hideMindMapDocumentSourceEditor();
}

function suspendMindMapDocumentPreview() {
    const state = mindMapDocumentState;
    if ($('#mindMapLinkPreview')?.dataset.previewMode !== 'document') return;
    state.scrollTop = state.preview.scrollTop;
    state.dragger?.cancelBoxSelection();
    $('#btn-document-material')?.setAttribute('aria-expanded', 'false');
}

function openMindMapDocumentPreview() {
    const panel = $('#mindMapLinkPreview');
    if (panel.dataset.previewMode === 'document' && panel.classList.contains('is-open')) {
        closeMindMapInternalLinkPreview();
        return;
    }
    hideMindMapContentPreview();
    mindMapInternalLinkPreviewState.target = null;
    mindMapInternalLinkPreviewState.resolution = null;
    panel.dataset.previewMode = 'document';
    panel.setAttribute('aria-label', 'Markdown 文档素材');
    $('#mindMapLinkPreviewTitle').textContent = mindMapDocumentState.name;
    $('#mindMapLinkPreviewBody').replaceChildren(mindMapDocumentState.root);
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    $('#btn-document-material').setAttribute('aria-expanded', 'true');
    mindMapDocumentState.preview.scrollTop = mindMapDocumentState.scrollTop;
}

function showMindMapDocumentSourceEditor() {
    const state = mindMapDocumentState;
    state.loadRequest++;
    state.scrollTop = state.preview.scrollTop;
    const root = state.root;
    root.querySelector('.document-source-editor').hidden = false;
    root.querySelector('.document-material-empty').hidden = true;
    mindMapDocumentState.preview.hidden = true;
    const textarea = root.querySelector('textarea');
    textarea.value = mindMapDocumentState.source;
    textarea.focus();
}

function hideMindMapDocumentSourceEditor() {
    const state = mindMapDocumentState;
    state.root.querySelector('.document-source-editor').hidden = true;
    state.root.querySelector('.document-material-empty').hidden = Boolean(state.source);
    state.preview.hidden = !state.source;
    state.preview.scrollTop = state.scrollTop;
}

function renderMindMapDocumentSource(source, name = '粘贴的 Markdown') {
    if (!source.trim()) {
        showTopToast('请先粘贴 Markdown 内容');
        return false;
    }
    const parsed = splitMindMapDocumentMarkdown(source);
    if (!parsed.blocks.length) {
        showTopToast('文档中没有可预览的内容块');
        return false;
    }
    const state = mindMapDocumentState;
    state.dragger.clearSelection();
    state.source = source;
    state.name = name;
    state.references = parsed.references;
    state.scrollTop = 0;
    state.preview.replaceChildren();
    parsed.blocks.forEach(sourceBlock => {
        const block = document.createElement('div');
        block.className = 'document-markdown-block';
        block.dataset.markdownSource = sourceBlock;
        block.draggable = true;
        block.innerHTML = renderMarkdown(sourceBlock + (parsed.references ? `\n\n${parsed.references}` : ''));
        state.preview.appendChild(block);
    });
    $('#mindMapLinkPreviewTitle').textContent = name;
    hideMindMapDocumentSourceEditor();
    void processRichContent(state.preview).catch(error => {
        console.warn('[MindMap] 文档素材富内容渲染失败:', error);
    });
    return true;
}
// !SECTION Markdown 文档素材与源码分块

// SECTION 文档素材面板初始化与交互
function updateMindMapDocumentDropMode() {
    const state = mindMapDocumentState;
    const button = $('#btn-document-drop-mode');
    if (button) {
        button.textContent = state.retainAfterDrop ? '拖后保留' : '拖后移除';
        button.setAttribute('aria-pressed', String(state.retainAfterDrop));
        button.title = state.retainAfterDrop
            ? '拖入后保留素材，可再次拖入；点击切换为移除'
            : '拖入后移除素材；按住 Ctrl 拖放可临时保留；点击切换为保留';
    }
    const status = state.root?.querySelector('.document-material-status');
    if (status) {
        const count = state.dragger?.selectedElements.size || 0;
        status.textContent = count
            ? `已选 ${count} 个内容块 · 拖入脑图生成一个节点`
            : '单击选择 · Ctrl 多选 · 空白处拖动框选';
        if (!state.retainAfterDrop) status.textContent += ' · Ctrl 拖放保留';
    }
}

function initializeMindMapDocumentDropMode() {
    const button = $('#btn-document-drop-mode');
    if (!button) return;
    let hasUserChanged = false;
    updateMindMapDocumentDropMode();
    button.addEventListener('click', () => {
        hasUserChanged = true;
        mindMapDocumentState.retainAfterDrop = !mindMapDocumentState.retainAfterDrop;
        updateMindMapDocumentDropMode();
        void chrome.storage.local.set({
            [MINDMAP_DOCUMENT_RETAIN_AFTER_DROP_STORAGE_KEY]: mindMapDocumentState.retainAfterDrop,
        }).catch(error => console.warn('[MindMap] 保存文档素材拖放模式失败:', error));
    });
    return chrome.storage.local.get({ [MINDMAP_DOCUMENT_RETAIN_AFTER_DROP_STORAGE_KEY]: false })
        .then(result => {
            if (hasUserChanged) return;
            mindMapDocumentState.retainAfterDrop = result[MINDMAP_DOCUMENT_RETAIN_AFTER_DROP_STORAGE_KEY] === true;
            updateMindMapDocumentDropMode();
        }).catch(error => console.warn('[MindMap] 读取文档素材拖放模式失败:', error));
}

async function loadMindMapDocumentFile() {
    const state = mindMapDocumentState;
    const request = ++state.loadRequest;
    try {
        const isQuicker = window.__DEEPCONVO_NATIVE_QUICKER_HOST__;
        const tauriCore = !isQuicker && typeof window.__TAURI__?.core?.invoke === 'function'
            ? window.__TAURI__.core : null;
        if (!isQuicker && !tauriCore) {
            const fileInput = $('#documentMarkdownFileInput');
            fileInput.value = '';
            fileInput.click();
            return;
        }
        let result;
        if (tauriCore) {
            result = await tauriCore.invoke('read_markdown_document');
        } else {
            const quickerSubprogram = getQuickerSubprogramBridge();
            if (typeof quickerSubprogram !== 'function') throw new Error('当前 Quicker WebView2 不支持调用文件导入子程序');
            // 取消后桥接可能不返回，按钮保持可再次点击。
            result = await quickerSubprogram('DeepConvoImportMarkDown', {});
        }
        if (request !== state.loadRequest || !result) return;
        if (result.error) throw new Error(String(result.error));
        if (result.cancelled) return;
        if (result.success === false) throw new Error('文件导入子程序读取失败');
        if (typeof result.content !== 'string' || !result.content.trim()) throw new Error('文件导入子程序没有返回 Markdown content 文本');
        const filename = String(result.filename || result.path || '').split(/[\\/]/).pop();
        if (filename && !isMarkdownFile({ name: filename })) throw new Error('请选择 .md 文件');
        renderMindMapDocumentSource(result.content, filename || '加载的 Markdown');
    } catch (error) {
        if (request !== state.loadRequest) return;
        console.warn('[MindMap] 加载 Markdown 文件失败:', error);
        showTopToast(`读取 Markdown 文件失败：${error.message || '请检查 DeepConvoImportMarkDown 子程序'}`);
    }
}

function initializeMindMapDocumentPreview() {
    const state = mindMapDocumentState;
    const root = document.createElement('div');
    root.className = 'document-material-pane';
    root.innerHTML = `
        <div class="document-material-empty">
            <i class="ri-file-text-line" aria-hidden="true"></i>
            <strong>从长文档中摘取内容</strong>
            <p>粘贴 Markdown 或加载 .md 文件，<br>框选内容块后拖入思维导图。</p>
            <div class="document-material-buttons">
                <button type="button" class="document-material-button" data-document-action="paste">粘贴 Markdown</button>
                <button type="button" class="document-material-button" data-document-action="load">加载文件</button>
            </div>
        </div>
        <div class="document-source-editor" hidden>
            <label for="documentSourceTextarea">粘贴 Markdown</label>
            <textarea id="documentSourceTextarea" spellcheck="false" placeholder="在这里粘贴 Markdown 原文…"></textarea>
            <div class="document-material-buttons">
                <button type="button" class="document-material-button primary" data-document-action="preview">预览文档</button>
                <button type="button" class="document-material-button" data-document-action="cancel">取消</button>
            </div>
        </div>
        <div class="document-material-preview md-content" tabindex="0" aria-label="Markdown 内容块，单击选择，Ctrl 多选，空白处拖动框选" hidden></div>
        <div class="document-material-status" role="status">单击选择 · Ctrl 多选 · 空白处拖动框选</div>`;
    state.root = root;
    state.preview = root.querySelector('.document-material-preview');
    state.dragger = new RenderedMarkdownDragger(state.preview, {
        getMarkdown: getMindMapDocumentSelectionMarkdown,
        onSelectionChange: updateMindMapDocumentDropMode,
    });
    void initializeMindMapDocumentDropMode();
    state.preview.addEventListener('scroll', () => {
        if (!state.preview.hidden && state.root.isConnected) state.scrollTop = state.preview.scrollTop;
    });
    const fileInput = $('#documentMarkdownFileInput');
    root.addEventListener('click', event => {
        const action = event.target.closest('[data-document-action]')?.dataset.documentAction;
        if (action === 'paste') showMindMapDocumentSourceEditor();
        else if (action === 'load') void loadMindMapDocumentFile();
        else if (action === 'preview') {
            state.loadRequest++;
            renderMindMapDocumentSource(root.querySelector('textarea').value);
        } else if (action === 'cancel') hideMindMapDocumentSourceEditor();
    });
    $('#btn-document-material').addEventListener('click', openMindMapDocumentPreview);
    $('#btn-document-paste').addEventListener('click', showMindMapDocumentSourceEditor);
    $('#btn-document-load').addEventListener('click', loadMindMapDocumentFile);
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (!isMarkdownFile(file)) {
            showTopToast('请选择 .md 文件');
            return;
        }
        const request = ++state.loadRequest;
        try {
            const source = await readDroppedFileAsText(file);
            if (request === state.loadRequest) renderMindMapDocumentSource(source, file.name);
        } catch (error) {
            showTopToast(`读取 Markdown 文件失败：${error.message || '未知错误'}`);
        }
    });
    root.addEventListener('keydown', event => {
        if (event.target.closest('textarea, input')) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            state.dragger.selectAll();
        } else if (event.key === 'Escape' && state.dragger.selectedElements.size) {
            event.preventDefault();
            state.dragger.clearSelection();
        }
    });
}
// !SECTION 文档素材面板初始化与交互
