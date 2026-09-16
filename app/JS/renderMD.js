const formulaMap = new Map();

marked.setOptions({
    breaks: true,
    gfm: true,
});

const imgStyleSheet = document.createElement('style');
// 1. 初始化 Mermaid
if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'loose',
        themeVariables: {
            fontFamily: 'var(--code-font-family)',
            fontSize: '14px'
        }
    });
}
imgStyleSheet.textContent = `
    :root[data-theme="dark"] {
            .md-content pre { color: #c9d1d9; } 
            .md-content th,
            .md-content table thead > tr,
            .md-content table thead > tr > th,
            .md-content table thead > tr > td {
                background-color: rgba(56, 56, 56, 0.25) !important;
                background-color: color-mix(in srgb, var(--bg-secondary) 25%, transparent) !important;
                border-color: #444 !important;
            }
            .md-content td { border-color: #444 !important; }
            .md-content tr:nth-child(2n) { background-color: #262626 !important; }

            .markdown-content pre code,
            .markdown-content pre .hljs {
                color: #e6e6e6 !important; /* 原为 #abb2bf，现大幅提亮 */
                background: transparent !important;
            }

            /* 2. 注释 -> 提亮灰度，防止看不见 */
            .hljs-comment, .hljs-quote { color: #8b949e !important; font-style: italic; }
            
            /* 3. 关键字 (def, import) -> 亮紫 */
            .hljs-doctag, .hljs-keyword, .hljs-formula { color: #d19a66 !important; } 
            .hljs-keyword { color: #c678dd !important; } 

            /* 4. 函数名/类名 -> 亮蓝 */
            .hljs-section, .hljs-name, .hljs-selector-tag, .hljs-deletion, .hljs-subst { color: #e06c75 !important; }
            .hljs-literal { color: #56b6c2 !important; }
            
            /* 5. 字符串 -> 亮绿 */
            .hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute, .hljs-meta .hljs-string { color: #98c379 !important; }
            
            /* 6. 属性/数字 -> 亮橙 */
            .hljs-attr, .hljs-variable, .hljs-template-variable, .hljs-type, .hljs-selector-class, .hljs-selector-attr, .hljs-selector-pseudo, .hljs-number, .hljs-params { color: #d19a66 !important; }
            
            /* 7. 函数调用/链接 -> 亮天蓝 */
            .hljs-symbol, .hljs-bullet, .hljs-link, .hljs-meta, .hljs-selector-id, .hljs-title, .hljs-function .hljs-title { color: #61aeee !important; }
            
            .hljs-emphasis { font-style: italic; }
            .hljs-strong { font-weight: bold; }
            .hljs-link { text-decoration: underline; }
    }
    pre, code,th, td {
        transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
    }
    h1, h2, h3, h4, h5, h6, p, ul, ol, li, figure, blockquote, pre {
        margin: 0;
        padding: 0;
    }
    p{margin-bottom:25px}

    /* --- Mermaid 流程图样式 --- */

    .mermaid-wrapper {
        position: relative;
        margin: 4px 0;
        border-radius: 4px;
    }
    .mermaid-container {
        display: flex;
        justify-content: center;
        width: 100%;
        overflow-x: auto; 
        padding: 10px 0;
        background: transparent;
    }

    .mermaid-container svg {
        max-width: 100%; 
        height: auto;
    }

    .node-card .mermaid-container {
        font-family: var(--code-font-family);
    }
    /* 3. 全屏/放大按钮 */
    .mermaid-fs-btn {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 24px;
        height: 24px;
        background: var(--card-bg);
        border: 1px solid var(--toolbar-border);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--text-color-secondary);
        opacity: 0;
        transition: all 0.2s;
        z-index: 10;
        user-select: none;
    }
    .mermaid-wrapper:hover .mermaid-fs-btn {
        opacity: 1;
    }
    .mermaid-fs-btn:hover {
        background: var(--btn-hover);
        color: var(--primary);
    }

    /* 4. 全屏遮罩层 */
    .mermaid-modal {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        z-index: 5000; 
        display: none;
        justify-content: center;
        align-items: center;
        opacity: 0;
        transition: opacity 0.2s;
    }
    .mermaid-modal.active {
        display: flex;
        opacity: 1;
    }

    /* --- Mermaid 全屏 - 升级版 (支持拖拽缩放) --- */

    .mermaid-modal-content {
        background: var(--card-bg);
        width: 100vw;  
        height: 100vh;
        overflow: hidden; 
        position: relative;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        cursor: grab; 
        display: flex;
        justify-content: center;
        align-items: center;
        transition: width 0.3s, height 0.3s; 
    }

    .mermaid-modal-content:active {
        cursor: grabbing; 
    }
    .mermaid-modal-content.fullscreen { width: 85vw; height: 85vh;border-radius: 8px;}

    #mermaidModalBody {
        transform-origin: 0 0; 
        pointer-events: none; 
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
    }

    #mermaidModalBody svg {
        max-width: none !important;
        max-height: none !important;
        min-width: auto !important;
        pointer-events: auto; 
        user-select: text; 
    }

    /* 7. 弹窗按钮 */
    .mermaid-btn{
        position: absolute;
        top: 10px;
        right: 10px;
        user-select: none;
    }
    .mermaid-btn button{
        width: 30px;
        height: 30px;
        background: var(--toolbar-bg);
        border: 1px solid var(--toolbar-border);
        color: var(--text-color);
        cursor: pointer;
        z-index: 100;
    }
    .mermaid-btn button:active {
        transform: scale(0.95);
    }
    .mermaid-btn button:not(.danger){
        border-radius: 5px;

    }
    .mermaid-btn button:not(.danger):hover {
        background: var(--btn-hover);
        color: var(--primary);
    }
    .mermaid-modal-close {
        border-radius: 50%;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        transition: transform 0.3s ease;
        transform-origin: center center;
    }
    
    .mermaid-modal-close:hover {
        background: #ff4d4f;
        transform: rotate(90deg);
        color: white;
    }

    :root[data-theme="dark"] {
        #mermaidModalBody svg,
        .mermaid-container svg { filter: invert(1) hue-rotate(180deg); }
        .mermaid-modal { background: rgba(0,0,0,0.8); }
        .mermaid-modal-content { background: #1e1e1e; border: 1px solid #333; }
        
        .mermaid-container div[style*="color: #ff4d4f"] {
            background: rgba(255, 77, 79, 0.1);
        }
    }


    /* 1. 让 Markdown 内容里的图片显示放大镜光标 */
    .md-content img.focus {
        cursor: zoom-in;
        transition: transform 0.2s;
    }
    .md-content img.focus:hover {
        transform: scale(1.01);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    /* 2. 全屏预览遮罩 */
    .image-preview-modal {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85); 
        z-index: 6000; 
        display: none;
        justify-content: center;
        align-items: center;
        opacity: 0;
        transition: opacity 0.25s ease;
        cursor: zoom-out; 
        backdrop-filter: blur(5px); 
    }

    .image-preview-modal.active {
        display: flex;
        opacity: 1;
    }

    /* 3. 预览的大图 */
    .image-preview-content {
        max-width: none; 
        max-height: 95vh; 
        transform-origin: center center;
        cursor: grab; 
        transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        user-select: none; 
        -webkit-user-drag: none; 
    }

    .image-preview-content.is-dragging {
        cursor: grabbing; 
        transition: none !important; 
    }


    .image-preview-tip {
        position: absolute;
        bottom: 20px;
        color: rgba(255,255,255,0.7);
        font-size: 14px;
        background: rgba(0,0,0,0.5);
        padding: 4px 12px;
        border-radius: 20px;
        pointer-events: none;
    }



    /* Markdown 元素排版 */
    .md-content h1, 
    .md-content h2, 
    .md-content h3 { border-bottom: 1px solid var(--header-border-bottom); padding-bottom: .5em; margin-top: 0.3em; font-weight: 600; color: var(--text-color); }

    .md-content h1 { font-size: 1.4rem; }
    .md-content h2 { font-size: 1.2rem; }
    .md-content h3 { font-size: 1.1rem; }
    
    .mindmap .md-content h1 { font-size: 1.1rem; }
    .mindmap .md-content h2 { font-size: 1.0rem; }
    .mindmap .md-content h3 { font-size: 0.9rem; }

    .md-content p { margin-bottom: 6px; }
    .md-content ul, .md-content ol { margin-bottom: 6px; padding-left: 24px; }
    .md-content li { margin-bottom: 4px; }

    /* Markdown 链接：沿用主题色，避免浏览器默认的高饱和蓝色和粗重下划线 */
    .md-content a {
        color: var(--primary);
        font-weight: 500;
        text-decoration-line: underline;
        text-decoration-thickness: 1px;
        text-decoration-color: currentColor;
        text-underline-offset: 0.18em;
        overflow-wrap: anywhere;
        cursor: pointer;
        transition: color 0.15s ease, background-color 0.15s ease,
            border-color 0.15s ease, transform 0.1s ease;
    }

    .md-content a:hover {
        background-color: var(--btn-hover);
        text-decoration-thickness: 2px;
    }

    .md-content a:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
        border-radius: 3px;
    }

    /* 本地文件使用附件式入口，限制继承字号，长文件名也能自然换行 */
    .md-content a.md-file-link {
        display: inline-flex;
        align-items: flex-start;
        gap: 7px;
        max-width: 100%;
        box-sizing: border-box;
        padding: 6px 9px;
        border: 1px solid var(--toolbar-border);
        border-radius: 6px;
        background-color: var(--bg-secondary);
        color: var(--text-color);
        font-size: clamp(13px, 0.92em, 15px);
        font-weight: 500;
        line-height: 1.45;
        text-decoration: none;
        vertical-align: middle;
    }

    .md-content a.md-file-link:hover {
        border-color: var(--primary);
        background-color: var(--btn-hover);
        text-decoration: none;
    }

    .md-content a.md-file-link:active {
        transform: translateY(1px);
    }

    .md-file-link-icon {
        flex: 0 0 auto;
        margin-top: 0.12em;
        color: var(--primary);
        font-size: 1.08em;
        line-height: 1.2;
    }

    .md-file-link-label {
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-word;
    }

    .md-content img { max-width: 100%; border-radius: 4px; }
    .md-content table { border-collapse: collapse; width: 100%; margin: 8px 0; display: table; }
    .md-content th, .md-content td { border: 1px solid var(--code-block-border); padding: 6px 13px; color: var(--text-color); }

    .md-content th,
    .md-content table thead > tr,
    .md-content table thead > tr > th,
    .md-content table thead > tr > td {
        background-color: rgba(241, 245, 249, 0.25) !important;
        background-color: color-mix(in srgb, var(--bg-secondary) 25%, transparent) !important;
        font-weight: 600;
    }
    .md-content tr:nth-child(2n) { background-color: rgba(127,127,127,0.05); }

    .md-content table thead > tr > th {
        text-align: center;
    }
    .md-content table tbody td {
        text-align: center;
    }


    .md-content blockquote {
        border-left: 2px solid rgb(180, 181, 182); 
        color:rgb(118, 122, 127);                 
        padding: 0 1em;                 
        margin: 8px 0;                  
    }
    /* 1. 公式基础容器 */
    .katex-html { 
        position: relative; 
        cursor: pointer; 
        transition: all 0.2s ease; 
        border-radius: 6px; 
        padding: 2px 5px; 
        user-select: none;
    }

    /* 4. 鼠标悬停效果 (点击复制提示) */
    .katex-html:hover { 
        background: color-mix(in srgb, var(--bg-secondary) 50%, transparent); 
        box-shadow: 0 0 0 1px var(--toolbar-border);
    }
    
    .katex {font-size: 1.1em !important;}


    /* 块级代码 (<pre>) */
    .md-content pre { 
        background-color: color-mix(in srgb, var(--code-block-bg) 25%, transparent);
        border-radius: 6px; 
        padding: 12px 14px; 
        overflow: auto; 
        white-space: pre;       
        tab-size: 4;            
        font-family: var(--code-font-family);
        font-size: 13.5px; 
        line-height: 1.5;
        -webkit-font-smoothing: antialiased; 
    }
    

    .md-content pre code {
        background: transparent !important; 
        padding: 0 !important;              
        border-radius: 0 !important;
        color: inherit;
        border: none;
        font-family: inherit; 
        font-size: inherit;
    }

    /* 行内代码 */
    .md-content :not(pre) > code { 
        font-family: var(--code-font-family); 
        font-size: 85%; 
        background: var(--code-inline-bg); 
        padding: 0.2em 0.4em; 
        border-radius: 4px; 
        color: var(--text-color); 
        -webkit-font-smoothing: antialiased;
    }
    /* ============================ 代码行号 =============================== */    
    .code-block-container {
        display: flex;
        position: relative;
        margin: 10px 0;
        border-radius: 6px;
        overflow: hidden;
        background-color: color-mix(in srgb, var(--code-block-bg) 25%, transparent);
        border: 1px solid var(--code-block-border);
    }

    .code-line-numbers {
        flex-shrink: 0;
        padding: 12px 8px;
        text-align: right;
        min-width: 20px;
        background-color: color-mix(in srgb, var(--code-block-bg) 25%, transparent);
        border-right: 1px solid var(--code-line-separator, var(--code-block-border));
        user-select: none;
        color: var(--text-color-secondary);
        opacity: 0.7;
        font-family: var(--code-font-family) !important;
        font-size: 13.5px !important;
        line-height: 1.5 !important;
    }
    
    .code-line-numbers span {
        display: block;
        counter-increment: line;
    }

    .code-content-wrapper {
        flex-grow: 1;
        overflow-x: auto;
        position: relative;
        background-color: color-mix(in srgb, var(--code-block-bg) 25%, transparent);
    }

    
    /* 5. 复制按钮样式 */
    .copy-code-btn {
        position: absolute;
        top: 6px;
        right: 6px;
        background: var(--card-bg); 
        border: 1px solid var(--code-block-border);
        border-radius: 4px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0; 
        transition: all 0.2s;
        z-index: 10;
        user-select: none;
    }
    
    .copy-code-btn:hover {
        background: var(--btn-hover);
        color: var(--primary);
    }

    .code-block-container:hover .copy-code-btn {
        opacity: 1;
    }

    :root[data-theme="dark"] {
        .code-line-numbers {
            background-color: color-mix(in srgb, var(--code-block-bg) 25%, transparent);
        }
        .copy-code-btn {
            background-color: #333;
            border-color: #555;
            color: #ccc;
        }
    }

    .mermaid-wrapper, .code-block-container, .katex-display {
        position: relative;
    }
`

document.head.appendChild(imgStyleSheet);


const imgModal = document.createElement('div');
imgModal.className = 'modal-img';
imgModal.innerHTML = `
    <div class="mermaid-modal" id="mermaidModal">
        <div class="mermaid-modal-content" id="mermaidModalContent">

            <div class="mermaid-btn" style="display:flex; gap:10px;">
                <button class="mermaid-modal-copy" id="btn-copy-mermaid"title="复制 PNG 图片"><i class="ri-image-fill"></i></button>
                <button class="mermaid-modal-copy" id="btn-download-svg" title="下载 SVG 图片 )"><i class="ri-download-line"></i></button>
                <button class="mermaid-modal-reset" id="btn-reset-mermaid"title="复位视图"><i class="ri-focus-3-line"></i></button>
                <button class="mermaid-modal-fullscreen" id="btn-fullmermaid"><i class="ri-fullscreen-exit-line"></i></button>
                <button class="mermaid-modal-close danger" id="btn-close-mermaid" title="关闭 (Esc)">
                    <i class="ri-close-line"></i>
                </button>
            </div>
            
            <div id="mermaidModalBody"></div>
        </div>
    </div>
    <div class="image-preview-modal" id="imagePreviewModal">
        <img src="" alt="Preview" class="image-preview-content" id="imagePreviewTarget">
    </div>
`;
/* --- 修改 richContent.js 中的 DOMContentLoaded --- */
document.addEventListener('DOMContentLoaded', () => {
    // 1. 检查页面上是否已经存在模态框
    let modal = document.querySelector('.modal-img');
    
    // 2. 如果不存在(在线模式)，则创建并添加
    if (!modal) {
        document.body.appendChild(imgModal); 
    }

    // 3. 绑定 Mermaid 模态框的按钮事件
    const closeBtn = document.querySelector('#btn-close-mermaid');
    if (closeBtn) closeBtn.onclick = closeMermaidFullscreen;

    const fullBtn = document.querySelector('#btn-fullmermaid');
    if (fullBtn) fullBtn.onclick = () => {
        const content = document.querySelector('.mermaid-modal-content');
        if (content) {
            content.classList.toggle('fullscreen');
            fullBtn.innerHTML = content.classList.contains('fullscreen') ? 
                '<i class="ri-fullscreen-line"></i>' : '<i class="ri-fullscreen-exit-line"></i>';
        }
    };

    const resetBtn = document.querySelector('#btn-reset-mermaid');
    if (resetBtn) resetBtn.onclick = (e) => { e.stopPropagation(); resetMermaidView(); };

    const copyBtn = document.querySelector('#btn-copy-mermaid');
    if (copyBtn) copyBtn.onclick = (e) => { e.stopPropagation(); copyMermaidAsPng(); };

    const dlBtn = document.querySelector('#btn-download-svg');
    if (dlBtn) dlBtn.onclick = (e) => { e.stopPropagation(); downloadMermaidSvg(); };

    // 4. 初始化图片预览
    initializeImagePreview();
});


function renderMarkdown(c) {
    if (!c) return '';
    if (typeof marked === 'undefined') return c;

    let protectedSource = c;
    const codeMap = new Map();
    const mathMap = new Map();

    // ===============================================
    // 阶段 1: 建立代码“禁飞区”
    // ===============================================
    
    // 1.1 保护代码块
    // 保持之前的正则，精准匹配缩进和变长反引号
    const codeBlockRegex = /(^|\n)([ \t]*)([`~]{3,})([\s\S]+?)\3/g;
    
    protectedSource = protectedSource.replace(codeBlockRegex, (match, prefix, indent, delimiter, code) => {
        const id = `CODE-BLOCK-${Math.random().toString(36).substr(2, 9)}`;
        codeMap.set(id, match);
        // 直接返回 ID，防止影响周围布局
        return id; 
    });

    // 1.2 保护行内代码
    protectedSource = protectedSource.replace(/(`+)([^`\n]+)\1/g, (match) => {
        const id = `CODE-INLINE-${Math.random().toString(36).substr(2, 9)}`;
        codeMap.set(id, match);
        return id;
    });

    // ===============================================
    // 阶段 2: 提取并保护 LaTeX 公式
    // ===============================================

    // 2.1 保护 $$块级公式$$
    protectedSource = protectedSource.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
        const id = `MATH-BLOCK-${Math.random().toString(36).substr(2, 9)}`;
        mathMap.set(id, match);
        // 保持无换行，防止打断 JS 代码字符串
        return id; 
    });
    
    // 2.2 保护 $行内公式$
    protectedSource = protectedSource.replace(/\$([^\$\n]+?)\$/g, (match) => {
        const id = `MATH-INLINE-${Math.random().toString(36).substr(2, 9)}`;
        mathMap.set(id, match);
        return id;
    });
    // ===============================================
    // 阶段 2.5: 解决中文+引号导致的加粗失效 (核心修复)
    // ===============================================
    // 强制将 **"文字"** 或 **文字** 转换为 <strong> 标签
    // 这个正则跳过了对边界字符性质的严格检查，只要成对就转换
    protectedSource = protectedSource.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, (match, content) => {
        return `<strong>${content}</strong>`;
    });

    // ===============================================
    // 阶段 3: 还原代码块 (在 Markdown 解析前还原)
    // ===============================================
    codeMap.forEach((code, id) => {
        protectedSource = protectedSource.split(id).join(code);
    });

    // ===============================================
    // 阶段 4: Markdown 解析
    // ===============================================
    let html = marked.parse(protectedSource);

    // ===============================================
    // 阶段 5: 还原 LaTeX 公式 (关键修复！！！)
    // ===============================================
    
    // 定义一个简单的 HTML 转义函数
    const escapeHtml = (str) => str.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[m]);

    mathMap.forEach((latex, id) => {
        // 【核心修复】使用 escapeHtml 包裹 latex
        // 这样 '$<S>$' 会变成 '$&lt;S&gt;$'
        // 浏览器渲染时显示为 '$<S>$'，KaTeX 也能读到正确内容，且不会被当做标签解析
        html = html.split(id).join(escapeHtml(latex));
    });
    
    return html;
}

const QUICKER_OPEN_PATH_OR_URL_SP = 'DeepConvoOpenPathOrUrl';
const QUICKER_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'file:', 'zotero:', 'obsidian:']);

function getMarkdownQuickerSubprogram() {
    return window.$quickerSp
        || (typeof $quickerSp !== 'undefined' ? $quickerSp : null);
}

function fileUrlToWindowsPath(fileUrl) {
    const host = decodeURIComponent(fileUrl.hostname || '');
    let path = decodeURIComponent(fileUrl.pathname || '').replace(/\//g, '\\');
    if (host && host.toLowerCase() !== 'localhost') {
        return `\\\\${host}\\${path.replace(/^\\+/, '')}`;
    }
    return path.replace(/^\\(?=[a-zA-Z]:)/, '');
}

function normalizeMarkdownLinkTarget(href) {
    const rawHref = String(href || '').trim();
    if (!rawHref) return null;
    if (rawHref.startsWith('#')) return { kind: 'internal', target: rawHref };

    let parsed;
    try {
        parsed = new URL(rawHref, document.baseURI || location.href);
    } catch {
        return null;
    }

    if (parsed.origin === location.origin && parsed.protocol !== 'file:') {
        return { kind: 'internal', target: parsed.href };
    }
    if (!QUICKER_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null;
    if (parsed.protocol === 'file:') {
        return { kind: 'file', target: fileUrlToWindowsPath(parsed) };
    }
    return { kind: 'url', target: parsed.href };
}

async function openMarkdownLinkWithQuicker(href) {
    const normalized = normalizeMarkdownLinkTarget(href);
    if (!normalized) {
        showTopToast('❌ 不支持打开该链接');
        return false;
    }
    if (normalized.kind === 'internal') {
        location.href = normalized.target;
        return true;
    }

    const quickerSubprogram = getMarkdownQuickerSubprogram();
    if (typeof quickerSubprogram !== 'function') {
        showTopToast('❌ 当前 Quicker WebView2 不支持调用打开链接子程序');
        return false;
    }

    try {
        const result = await quickerSubprogram(QUICKER_OPEN_PATH_OR_URL_SP, {
            target: normalized.target,
            kind: normalized.kind,
            originalHref: String(href || ''),
        });
        if (!result || result.cancelled || result.success === false) {
            if (result?.error) throw new Error(String(result.error));
            return false;
        }
        return true;
    } catch (error) {
        console.warn('[Markdown] Quicker 打开链接失败:', error);
        showTopToast(`❌ 打开失败：${error.message || '请检查打开链接子程序'}`);
        return false;
    }
}

// =============================================================================
// #region 富文本渲染
// =============================================================================
async function processRichContent(element) {
    if (!element) return;
    const useQuickerSubprogram = Boolean(
        window.__DEEPCONVO_NATIVE_QUICKER_HOST__ && getMarkdownQuickerSubprogram(),
    );
    element.querySelectorAll('a[href]').forEach(link => {
        const normalizedTarget = normalizeMarkdownLinkTarget(link.getAttribute('href'));
        const isLocalFile = normalizedTarget?.kind === 'file';
        link.classList.toggle('md-file-link', isLocalFile);

        if (isLocalFile && !link.dataset.fileLinkDecorated) {
            const label = document.createElement('span');
            label.className = 'md-file-link-label';
            while (link.firstChild) label.appendChild(link.firstChild);

            const icon = document.createElement('i');
            icon.className = 'ri-file-paper-2-line md-file-link-icon';
            icon.setAttribute('aria-hidden', 'true');

            link.append(icon, label);
            link.dataset.fileLinkDecorated = 'true';
        }

        if (useQuickerSubprogram) {
            link.removeAttribute('target');
            link.removeAttribute('rel');
        } else {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }

        // 防止点击链接时触发思维导图卡片的点击事件
        if (!link.dataset.linkClickBound) {
            link.addEventListener('click', async event => {
                event.stopPropagation();
                if (!useQuickerSubprogram) return;
                event.preventDefault();
                await openMarkdownLinkWithQuicker(link.getAttribute('href'));
            });

            link.dataset.linkClickBound = 'true';
        }
    });
     // ---------------------------------------------------------
    // 1. Mermaid 流程图渲染
    // ---------------------------------------------------------
    if (typeof mermaid !== 'undefined') {
        const mermaidCodes = element.querySelectorAll('code.language-mermaid');
        
        for (const block of mermaidCodes) {
            const preElement = block.parentElement;
            const rawCode = block.textContent;
            const uniqueId = 'mermaid-' + Math.random().toString(36).substr(2, 9);
            
            // --- 改动开始：创建 Wrapper 结构 ---
            
            // 1. 创建相对定位的包裹层
            const wrapper = document.createElement('div');
            wrapper.className = 'mermaid-wrapper';
            if(ENABLE_MARKDOWN_DRAG) wrapper.dataset.mdSource = "```mermaid\n" + rawCode + "\n```";
            // 2. 创建全屏按钮
            const fsBtn = document.createElement('button');
            fsBtn.className = 'mermaid-fs-btn';
            fsBtn.title = '全屏查看';
            fsBtn.innerHTML = '<i class="ri-fullscreen-line"></i>'; 
            
            // 3. 创建实际的 Mermaid 容器
            const container = document.createElement('div');
            container.className = 'mermaid-container';
            container.innerHTML = `<div id="${uniqueId}" style="color:var(--text-color-secondary)">Loading...</div>`;

            // 4. 组装 DOM
            wrapper.appendChild(fsBtn);
            wrapper.appendChild(container);
            
            // 5. 替换原有 pre
            preElement.replaceWith(wrapper);

            try {
                const { svg } = await mermaid.render(uniqueId, rawCode);
                container.innerHTML = svg;
                
                // --- 绑定全屏事件 ---
                fsBtn.onclick = (e) => {
                    e.stopPropagation(); 
                    e.preventDefault();
                    showMermaidFullscreen(svg); 
                };

                // 触发布局重算
                if (element.closest('.node-card')) {
                    if (typeof stabilizeRoot === 'function') stabilizeRoot();
                    if (typeof updateTransform === 'function') updateTransform();
                }

            } catch (error) {
                console.log('Mermaid Error', error);
                container.innerHTML = `<div style="color:#ff4d4f;font-size:12px;">渲染失败</div>`;
                fsBtn.remove(); 
            }
        }
    }
    
    // 1. KaTeX 公式渲染
    if (typeof renderMathInElement !== 'undefined') {
        try {
            renderMathInElement(element, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false}
                ],
                throwOnError: false
            });

            // --- 新增：为公式添加点击复制功能 ---
            element.querySelectorAll('.katex').forEach(katexNode => {
                if (katexNode.dataset.clickBound) return;
                
                const annotation = katexNode.querySelector('annotation[encoding="application/x-tex"]');
                if (annotation) {
                    const latexSource = annotation.textContent;
                    
                    katexNode.style.cursor = 'pointer';
                    katexNode.title = '点击复制 LaTeX 公式';
                    katexNode.classList.add('clickable-math'); 
                    
                    katexNode.addEventListener('click', (e) => {
                        e.stopPropagation(); 
                        e.preventDefault();
                        
                        copyToClipboard(latexSource);
                        showTopToast('✅ 公式已复制');
                    });
                    
                    katexNode.dataset.clickBound = "true";
                }
            });

        } catch (e) { console.log('KaTeX error', e); }
    }

    // 2. 代码高亮 + 行号 + 复制按钮
    if (typeof hljs !== 'undefined') {
        const codes = element.querySelectorAll('pre code');
        codes.forEach(block => {
            if (block.closest('.code-block-container')) return;

            if (!block.dataset.highlighted) {
                hljs.highlightElement(block);
                block.dataset.highlighted = "yes";
            }

            enhanceCodeBlock(block);
        });
    }
}

// ==========================================
// #region 图片点击预览功能 (支持缩放+拖拽)
// ==========================================
function initializeImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    const targetImg = document.getElementById('imagePreviewTarget');
    
    if (!modal || !targetImg) return;

    let state = {
        scale: 1,
        pX: 0, 
        pY: 0, 
        isDragging: false,
        startX: 0,
        startY: 0
    };

    function updateTransform() {
        targetImg.style.transform = `translate(${state.pX}px, ${state.pY}px) scale(${state.scale})`;
    }

    function openImagePreview(src) {
        targetImg.src = src;
        modal.classList.add('active');
        
        state = { scale: 1, pX: 0, pY: 0, isDragging: false, startX: 0, startY: 0 };
        targetImg.style.transform = ''; 
        targetImg.style.maxWidth = '95vw'; 
        targetImg.style.maxHeight = '95vh';
    }

    function closeImagePreview() {
        modal.classList.remove('active');
        setTimeout(() => {
            if(!modal.classList.contains('active')) targetImg.src = '';
        }, 250);
    }

    // --- 3. 全局委托监听 (打开图片) ---
    document.addEventListener('click', (e) => {
        if (isSpacePressed || document.body.classList.contains('space-mode')) {
            return;
        }
        if (e.target.tagName === 'IMG') {
            const isContentImg = e.target.closest('.md-content') || 
                                 (e.target.closest('.node-card.simple') && e.target.closest('.card-header'));
            
            if (isContentImg && !e.target.closest('.image-preview-modal')) {
                e.stopPropagation();
                e.preventDefault();
                console.log('image clicked:', e.target.closest('img'));
                if (!e.target.closest('img.focus')){
                    e.target.closest('img').classList.add('focus');
                }else{
                    console.log('open image preview:', e.target.closest('img.focus'));
                    openImagePreview(e.target.src);
                }
            }
        }else{
            document.querySelectorAll('img.focus').forEach(img=>{
                if (img) img.classList.remove('focus');
            });
        }
    });

    // --- 4. 滚轮缩放 ---
    modal.addEventListener('wheel', (e) => {
        if (!modal.classList.contains('active')) return;
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(0.1, state.scale * delta), 10); 
        
        state.scale = newScale;
        
        if (state.scale > 1) {
            targetImg.style.maxWidth = 'none';
            targetImg.style.maxHeight = 'none';
        }

        updateTransform();
    }, { passive: false });

    // --- 5. 拖拽逻辑 (Mouse Events) ---
    
    targetImg.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; 
        e.preventDefault(); 
        e.stopPropagation();

        state.isDragging = true;
        state.startX = e.clientX - state.pX; 
        state.startY = e.clientY - state.pY;
        
        targetImg.classList.add('is-dragging'); 
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.isDragging || !modal.classList.contains('active')) return;
        e.preventDefault();

        state.pX = e.clientX - state.startX;
        state.pY = e.clientY - state.startY;

        updateTransform();
    });

    window.addEventListener('mouseup', () => {
        if (state.isDragging) {
            state.isDragging = false;
            targetImg.classList.remove('is-dragging'); 
        }
    });

    // --- 6. 关闭事件 ---
    
    let modalMouseDownX = 0;
    let modalMouseDownY = 0;

    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) {
            modalMouseDownX = e.clientX;
            modalMouseDownY = e.clientY;
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            const dist = Math.hypot(e.clientX - modalMouseDownX, e.clientY - modalMouseDownY);
            if (dist < 5) closeImagePreview();
        }
    });
    
    targetImg.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        state = { scale: 1, pX: 0, pY: 0, isDragging: false, startX: 0, startY: 0 };
        targetImg.style.maxWidth = '95vw';
        targetImg.style.maxHeight = '95vh';
        updateTransform();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeImagePreview();
        }
    });
}


// ==========================================
// #region Mermaid 全屏逻辑 (支持拖拽缩放)
// ==========================================

let mermaidState = {
    scale: 1,
    tx: 0,
    ty: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0
};

function showMermaidFullscreen(svgContent) {
    const modal = document.getElementById('mermaidModal');
    const container = document.getElementById('mermaidModalContent'); 
    const body = document.getElementById('mermaidModalBody');       
    
    if (!modal || !container || !body) return;

    // 1. 注入 SVG
    body.innerHTML = svgContent;
    modal.classList.add('active');

    resetMermaidView();

    bindMermaidEvents(container, body);
    
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeMermaidFullscreen();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    
    modal.onclick = (e) => {
        if (e.target === modal) closeMermaidFullscreen();
    };
}

function closeMermaidFullscreen() {
    const modal = document.getElementById('mermaidModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            const body = document.getElementById('mermaidModalBody');
            if(body) body.innerHTML = '';
        }, 200);
    }
}

function updateMermaidTransform() {
    const body = document.getElementById('mermaidModalBody');
    if (body) {
        body.style.transform = `translate(${mermaidState.tx}px, ${mermaidState.ty}px) scale(${mermaidState.scale})`;
    }
}

function resetMermaidView() {
    mermaidState = { scale: 1, tx: 0, ty: 0, isDragging: false, startX:0, startY:0, startTx:0, startTy:0 };
    updateMermaidTransform();
}

function bindMermaidEvents(container, body) {
    
    container.onwheel = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(0.1, mermaidState.scale * delta), 10); 

        const s = newScale / mermaidState.scale;
        mermaidState.tx = mouseX - (mouseX - mermaidState.tx) * s;
        mermaidState.ty = mouseY - (mouseY - mermaidState.ty) * s;
        mermaidState.scale = newScale;

        updateMermaidTransform();
    };

    container.onmousedown = (e) => {
        if (e.button !== 0) return; 
        e.stopPropagation();
        
        mermaidState.isDragging = true;
        mermaidState.startX = e.clientX;
        mermaidState.startY = e.clientY;
        mermaidState.startTx = mermaidState.tx;
        mermaidState.startTy = mermaidState.ty;
        
        container.style.cursor = 'grabbing';
    };

    window.onmousemove = (e) => {
        if (!mermaidState.isDragging || !document.getElementById('mermaidModal').classList.contains('active')) return;
        e.preventDefault();

        const dx = e.clientX - mermaidState.startX;
        const dy = e.clientY - mermaidState.startY;

        mermaidState.tx = mermaidState.startTx + dx;
        mermaidState.ty = mermaidState.startTy + dy;

        updateMermaidTransform();
    };

    window.onmouseup = (e) => {
        if (mermaidState.isDragging) {
            mermaidState.isDragging = false;
            container.style.cursor = 'grab';
        }
    };
}





// [新增] 代码块增强函数：添加行号和结构
function enhanceCodeBlock(codeBlock) {
    const preElement = codeBlock.parentElement;
    
    // 1. 计算行数
    const codeText = codeBlock.textContent;
    const lineCount = codeText.trimEnd().split(/\r\n|\r|\n/).length || 1;
    
    // 2. 生成行号 HTML
    let lineNumbersHtml = '';
    for (let i = 1; i <= lineCount; i++) {
        lineNumbersHtml += `<span class="line-number">${i}</span>`;
    }

    // 3. 创建主容器
    const containerDiv = document.createElement('div');
    containerDiv.className = 'code-block-container';
    let lang = '';
    codeBlock.classList.forEach(cls => {
        if(cls.startsWith('language-')) lang = cls.replace('language-', '');
    });
    if(ENABLE_MARKDOWN_DRAG) containerDiv.dataset.mdSource = "```" + lang + "\n" + codeBlock.textContent + "\n```";
    
    // 4. 创建行号容器
    const lineNumDiv = document.createElement('div');
    lineNumDiv.className = 'code-line-numbers';
    lineNumDiv.innerHTML = lineNumbersHtml;

    // 5. 创建代码内容包裹器
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'code-content-wrapper';

    // 6. DOM 结构重组: container -> [lineNum, contentWrapper -> pre]
    preElement.parentNode.insertBefore(containerDiv, preElement);
    containerDiv.appendChild(lineNumDiv);
    containerDiv.appendChild(contentWrapper);
    contentWrapper.appendChild(preElement);
    
    // 7. 添加复制按钮
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-code-btn';
    copyButton.innerHTML = '<i class="ri-file-copy-line"></i>'; 
    copyButton.title = "复制代码";
    copyButton.addEventListener('click', function(e) {
        e.stopPropagation(); 
        copyToClipboard(codeBlock.textContent);
        
        const originalIcon = copyButton.innerHTML;
        const originalColor = copyButton.style.color;
        copyButton.innerHTML = '<i class="ri-check-line"></i>';
        copyButton.style.color = 'green';
        showTopToast('✅ 代码已复制');
        setTimeout(() => {
            copyButton.innerHTML = originalIcon;
            copyButton.style.color=originalColor
        }, 1500);
    });
    containerDiv.appendChild(copyButton);
}


// [新增] 简单的复制工具函数
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(err => console.log(err));
    } else {
        // 后备方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(textarea);
    }
}

// ==========================================
// #region 下载 SVG 文件
// ==========================================
function downloadMermaidSvg() {
    const container = document.getElementById('mermaidModalBody');
    const svgOriginal = container.querySelector('svg');
    
    if (!svgOriginal) {
        showTopToast('❌ 未找到图表');
        return;
    }

    // 1. 克隆并固化样式 (原理同前)
    const svgClone = svgOriginal.cloneNode(true);
    const computedStyle = window.getComputedStyle(svgOriginal);
    svgClone.style.fontFamily = computedStyle.fontFamily;
    svgClone.style.color = computedStyle.color;
    // 强制白色背景，防止在 PPT 暗色背景中看不清透明图
    svgClone.style.backgroundColor = '#ffffff'; 

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgClone);

    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // 2. 创建下载链接
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `mermaid-chart-${new Date().getTime()}.svg`;
    
    document.body.appendChild(downloadLink);
    downloadLink.click();
    
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
    
}



// ==========================================
// #region Mermaid SVG 转图片并复制功能
// ==========================================
function svgSourceToDataUrl(source) {
    // WebView2 may treat a blob: URL created under a virtual host as a
    // different origin when the SVG contains Mermaid foreignObject labels.
    // A fully encoded data URL keeps the image self-contained and the canvas
    // origin-clean, so it can be exported with toBlob().
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas 未能生成 PNG 图片'));
            }, 'image/png');
        } catch (error) {
            reject(error);
        }
    });
}

function copyMermaidAsPng() {
    const container = document.getElementById('mermaidModalBody');
    const svgOriginal = container.querySelector('svg');
    
    if (!svgOriginal) {
        showTopToast('❌ 未找到图片');
        return;
    }

    const svg = svgOriginal.cloneNode(true);
    
    const computedStyle = window.getComputedStyle(svgOriginal);
    const textColor = computedStyle.color || '#333';
    const fontFamily = computedStyle.fontFamily;
    
    svg.style.color = textColor;
    svg.style.fontFamily = fontFamily;
    svg.style.backgroundColor = 'transparent'; 

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);

    if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const img = new Image();
    const svgDataUrl = svgSourceToDataUrl(source);

    img.onload = async function() {
        try {
            const canvas = document.createElement('canvas');
            const bbox = svgOriginal.viewBox.baseVal || svgOriginal.getBoundingClientRect();
            const w = bbox.width || svgOriginal.clientWidth;
            const h = bbox.height || svgOriginal.clientHeight;

            if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
                throw new Error('图表尺寸无效');
            }

            const scale = 4;
            canvas.width = Math.ceil(w * scale);
            canvas.height = Math.ceil(h * scale);

            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, w, h);

            const blob = await canvasToPngBlob(canvas);
            if (navigator.clipboard && navigator.clipboard.write) {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                showTopToast('✅ PNG 图片已复制');
            } else {
                alert('❌ 浏览器不支持图片复制，请右键另存为。');
            }
        } catch (error) {
            console.error('[Mermaid] PNG 复制失败:', error);
            alert('❌ 复制失败: ' + (error.message || String(error)));
        }
    };
    
    img.onerror = function(error) {
        console.error('[Mermaid] SVG 加载失败:', error);
        showTopToast('❌ 转换图片失败');
    };

    img.src = svgDataUrl;
}




// ==========================================
// #region [V5.3 终极修复版] Markdown 拖拽功能 (修复表格富文本 & Ctrl多选)
// ==========================================
let ENABLE_MARKDOWN_DRAG = false; // 设置为 false 可关闭此功能
// 开关：是否在渲染时注入源码以支持高精度拖拽
if (location.href.includes('MindMap.html')) {
    ENABLE_MARKDOWN_DRAG = false;
}
class RenderedMarkdownDragger {
    constructor() {
        if (typeof ENABLE_MARKDOWN_DRAG === 'undefined' || !ENABLE_MARKDOWN_DRAG) return;
        
        // --- 配置 ---
        this.hoverClass = 'md-draggable-hover';
        this.selectedClass = 'md-selected';

        this.isEnabled = true;     // 拖拽及框选功能开关
        this.isBoxSelecting = false;
        this.isDragging = false;
        this.selectedElements = new Set(); 
        
        this.startPos = { x: 0, y: 0 };
        
        // 目标选择器 (包含常见块级元素)
        this.targetSelectors = [
            'li','ul', 'ol', 'table', 'blockquote', 
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            '.mermaid-wrapper', '.code-block-container', '.katex-display', 
            'p', 'pre'
        ];

        // 初始化 Turndown 服务
        this.turndownService = typeof TurndownService !== 'undefined' 
            ? new TurndownService({ 
                headingStyle: 'atx', 
                codeBlockStyle: 'fenced',
                bulletListMarker: '-', 
                emDelimiter: '*' 
              }) 
            : null;

        if(this.turndownService) {
            this.turndownService.keep(['sub', 'sup']); 
            
            // 【核心规则】Raw Content 
            // 用于直接输出我们在 sanitizeDomForMarkdown 中手动构建好的 Markdown 源码 (如表格、公式)
            this.turndownService.addRule('rawContent', {
                filter: (node) => node.classList.contains('turndown-raw'),
                replacement: (content, node) => {
                    // 直接返回文本内容，不进行转义
                    return node.textContent || node.innerText;
                }
            });
        }

        this.createUI();
        this.init();
    }

    createUI() {
        this.marquee = document.createElement('div');
        this.marquee.className = 'selection-marquee';
        // 蓝色系选框，符合 Ctrl 操作直觉
        this.marquee.style.border = '1px solid rgba(0, 120, 215, 0.8)';
        this.marquee.style.backgroundColor = 'rgba(0, 120, 215, 0.2)';
        document.body.appendChild(this.marquee);

        this.badge = document.createElement('div');
        this.badge.id = 'drag-badge';
        document.body.appendChild(this.badge);
    }

    init() {
        document.addEventListener('mouseover', this.handleMouseOver.bind(this));
        document.addEventListener('mouseout', this.handleMouseOut.bind(this));
        
        document.addEventListener('dragstart', this.handleDragStart.bind(this));
        
        // [优化] 增加 50ms 延迟，防止拖拽松手瞬间触发 click 事件，导致刚才拖拽的多选集合被重置
        document.addEventListener('dragend', () => { 
            setTimeout(() => { this.isDragging = false; }, 50); 
        });

        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // 使用捕获阶段 true，确保优先处理
        document.addEventListener('click', this.handleClick.bind(this), true);

        // [新增] 2. 绑定双击 Alt 键切换功能的逻辑
        let lastKeyTime = 0;
        document.addEventListener('keyup', (e) => {
            // 只检测 Alt 键 (event.key === 'Alt')
            if (e.key === 'Alt') {
                e.preventDefault();
                const now = Date.now();
                // 间隔小于 400ms 算作双击
                if (now - lastKeyTime < 400) {
                    this.toggleDraggerMode();
                    lastKeyTime = 0; // 重置，防止快速三击触发两次
                } else {
                    lastKeyTime = now;
                }
            }
        });
    }

    // ============================================================
    // 1. 交互逻辑 (Ctrl / Meta 键控制)
    // ============================================================
    // [新增] 切换模式的方法
    toggleDraggerMode() {
        this.isEnabled = !this.isEnabled;
        
        if (!this.isEnabled) {
            // 禁用时：清空当前选择、隐藏选框、移除悬停样式
            this.clearSelection();
            this.isBoxSelecting = false;
            this.marquee.style.display = 'none';
            
            // 2. 移除视觉样式
            document.querySelectorAll('.' + this.hoverClass).forEach(el => el.classList.remove(this.hoverClass));
            
            // 3. [修复核心] 移除所有元素的 draggable 属性
            // 只要 draggable="true" 存在，浏览器就会认为这是在拖拽元素，从而阻止选中文本
            const dragElements = document.querySelectorAll('[draggable="true"]');
            dragElements.forEach(el => {
                if (!el.closest('#bookmarkPanel')){
                    el.removeAttribute('draggable');
                }
            });
            
            showTopToast('🚫 选中拖拽已禁用');
        } else {
            showTopToast('✅ 选中拖拽已开启');
        }
    }
    handleMouseDown(e) {
        if (!this.isEnabled) return;
        if (e.button !== 0) return;
        if (e.target.closest('button, .mermaid-fs-btn, .copy-code-btn, a, input, textarea')) return;

        const targetBlock = this.getTarget(e);
        
        // [新增] 重置标记：假设这是一次正常的点击，除非后续发生了移动
        this.ignoreNextClick = false; 

        // 触发框选：按住 Ctrl 或 点击空白处
        if ((e.ctrlKey || e.metaKey) || !targetBlock) {
            
            // 如果是空白处直接拖拽（没按Ctrl），先清空旧选择
            if (!e.ctrlKey && !e.metaKey) {
                this.clearSelection();
            }

            e.preventDefault();
            this.isBoxSelecting = true;
            this.startPos = { x: e.pageX, y: e.pageY };
            this.updateMarquee(e.pageX, e.pageY, 0, 0);
            this.marquee.style.display = 'block';
            return;
        }
    }

    handleMouseMove(e) {
        if (!this.isBoxSelecting) return;
        e.preventDefault();
        
        const currentX = e.pageX;
        const currentY = e.pageY;
        
        // [新增] 计算移动距离。如果移动超过 3像素，则认为是在进行"框选操作"，而不是"点击"
        // 这将阻止松开鼠标时触发 click 事件导致的清空
        const dist = Math.hypot(currentX - this.startPos.x, currentY - this.startPos.y);
        if (dist > 3) {
            this.ignoreNextClick = true;
        }

        // 计算选框几何信息
        const width = Math.abs(currentX - this.startPos.x);
        const height = Math.abs(currentY - this.startPos.y);
        const left = Math.min(currentX, this.startPos.x);
        const top = Math.min(currentY, this.startPos.y);

        this.updateMarquee(left, top, width, height);
        this.detectIntersection({ left, top, width, height });
    }

    handleMouseUp(e) {
        if (this.isBoxSelecting) {
            this.isBoxSelecting = false;
            this.marquee.style.display = 'none';
        }
    }

    handleClick(e) {
        if (!this.isEnabled) return;
        if (this.isDragging) return;

        // [新增] 核心修复：如果是框选结束后的 click 事件，直接忽略，防止清空刚才选中的内容
        if (this.ignoreNextClick) {
            this.ignoreNextClick = false; // 重置状态
            this.isBoxSelecting = false;  // 确保关闭框选状态
            this.marquee.style.display = 'none';
            return;
        }

        if (this.isBoxSelecting) return;
        if (e.target.closest('button, .mermaid-fs-btn, .copy-code-btn')) return;

        const targetBlock = this.getTarget(e);

        // 1. Ctrl 多选模式
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

        // 2. 普通单选模式
        if (targetBlock) {
            const isOnlySelf = this.selectedElements.size === 1 && this.selectedElements.has(targetBlock);
            if (!isOnlySelf) {
                this.clearSelection();
                this.addToSelection(targetBlock);
            }
        } 
        // 3. 点击空白处 -> 清空
        else {
            this.clearSelection();
        }
    }

    updateMarquee(x, y, w, h) {
        this.marquee.style.left = x + 'px';
        this.marquee.style.top = y + 'px';
        this.marquee.style.width = w + 'px';
        this.marquee.style.height = h + 'px';
    }

    // ============================================================
    // 2. 核心逻辑：DOM 清洗与 Markdown 生成
    // ============================================================

    handleDragStart(e) {
        if (!this.isEnabled) return;
        const targetEl = this.getTarget(e);
        if (!targetEl) return;

        this.isDragging = true;
        let itemsToDrag = [];

        if (this.selectedElements.has(targetEl)) {
            itemsToDrag = this.getUniqueTopLevelElements(this.selectedElements);
            itemsToDrag.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
        } else {
            this.clearSelection();
            itemsToDrag = [targetEl];
        }

        const container = document.createElement('div');
        itemsToDrag.forEach(el => {
            const clone = el.cloneNode(true);
            container.appendChild(clone);
            container.appendChild(document.createTextNode('\n\n'));
        });

        this.sanitizeDomForMarkdown(container);

        let finalMarkdown = '';
        if (this.turndownService) {
            finalMarkdown = this.turndownService.turndown(container.innerHTML);
            
            // [新增] 修复标题编号后的转义问题
            // Turndown 会把 "1." 转义为 "1\."，这里用正则把反斜杠去掉
            finalMarkdown = finalMarkdown.replace(/(\d+)\\\./g, '$1.'); 
            
        } else {
            finalMarkdown = container.innerText;
        }

        if (finalMarkdown) {
            e.dataTransfer.setData('text/plain', finalMarkdown);
            e.dataTransfer.effectAllowed = 'copy';
            
            if (itemsToDrag.length >= 1) {
                this.badge.innerText = `📝 ${itemsToDrag.length} 个模块`;
                e.dataTransfer.setDragImage(this.badge, 0, 10);
            }
        }
    }

    /**
     * DOM 清洗器：将复杂的渲染组件替换为 turndown-raw 标记的 Markdown 源码
     */
    sanitizeDomForMarkdown(root) {
        // 1. 移除无关 UI 元素
        root.querySelectorAll('.code-line-numbers, .copy-code-btn, .mermaid-fs-btn, .mermaid-btn, .selection-marquee').forEach(el => el.remove());

        // 2. 修复 KaTeX 公式 (转换为 $...$)
        root.querySelectorAll('.katex').forEach(node => {
            const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
            if (annotation) {
                const tex = annotation.textContent;
                const isDisplay = node.classList.contains('katex-display') || node.closest('.katex-display');
                
                // 行内公式用 span 即可，但块级公式建议用 pre 确保隔离
                const rawNode = document.createElement(isDisplay ? 'pre' : 'span');
                rawNode.className = 'turndown-raw';
                rawNode.textContent = isDisplay ? `$$${tex}$$` : `$${tex}$`;
                
                const wrapper = node.closest('.katex-display') || node;
                if (wrapper.parentNode) wrapper.replaceWith(rawNode);
            }
        });

        // 3. 修复代码块 (还原为 ```...```)
        root.querySelectorAll('.code-block-container').forEach(container => {
            if (container.dataset.mdSource) {
                // [修复] 使用 pre 标签
                const rawNode = document.createElement('pre');
                rawNode.className = 'turndown-raw';
                // 添加前后换行，确保不与周围文本粘连
                rawNode.textContent = '\n' + container.dataset.mdSource + '\n';
                container.replaceWith(rawNode);
            }
        });

        // 4. 修复 Mermaid (还原为 ```mermaid...```)
        root.querySelectorAll('.mermaid-wrapper').forEach(wrapper => {
            if (wrapper.dataset.mdSource) {
                // [修复] 使用 pre 标签
                const rawNode = document.createElement('pre');
                rawNode.className = 'turndown-raw';
                rawNode.textContent = '\n' + wrapper.dataset.mdSource + '\n';
                wrapper.replaceWith(rawNode);
            }
        });

        // 5. 修复表格 (重点修复：保留格式)
        root.querySelectorAll('table').forEach(table => {
            // 调用新的转换函数
            const mdTable = this.convertTableToMarkdown(table);
            
            // [关键修复] 这里必须用 pre 标签，否则 innerHTML 解析时表格行的 \n 会变成空格
            const rawNode = document.createElement('pre');
            rawNode.className = 'turndown-raw';
            // 强制样式，防止有些浏览器即使在 pre 中也怪异行为（可选）
            rawNode.style.whiteSpace = 'pre-wrap'; 
            
            // 确保表格前后有空行，否则 Markdown 渲染可能异常
            rawNode.textContent = '\n' + mdTable + '\n';
            table.replaceWith(rawNode);
        });
    }

    /**
     * 【重点修复】将 HTML 表格转换为 Markdown 表格源码
     * 使用 Turndown 递归处理单元格内容，保留加粗/斜体/代码/链接格式
     */
    convertTableToMarkdown(tableEl) {
        try {
            let md = '';
            const rows = Array.from(tableEl.querySelectorAll('tr'));
            if (rows.length === 0) return '';
            
            rows.forEach((row, index) => {
                const cells = Array.from(row.querySelectorAll('th, td'));
                
                const cellTexts = cells.map(cell => {
                    // 1. 获取单元格的 Markdown 内容 (保留富文本格式!)
                    // 这里的关键是递归调用 turndown 处理单元格内部 HTML
                    let cellMd = '';
                    if (this.turndownService) {
                        cellMd = this.turndownService.turndown(cell.innerHTML);
                    } else {
                        cellMd = cell.innerText;
                    }

                    // 2. 清洗 Markdown 内容以适配表格语法
                    // - 将真实换行符替换为 HTML <br> (Markdown 表格单元格不支持换行符)
                    cellMd = cellMd.replace(/\r?\n/g, '<br>');
                    // - 转义竖线 | (防止破坏表格结构)
                    cellMd = cellMd.replace(/\|/g, '\\|');
                    
                    return cellMd.trim();
                });
                
                // 拼接当前行
                md += `| ${cellTexts.join(' | ')} |\n`;
                
                // 如果是第一行（通常作为表头），添加分隔线
                if (index === 0) {
                    const separators = cells.map(() => '---');
                    md += `| ${separators.join(' | ')} |\n`;
                }
            });
            return md;
        } catch (err) { 
            console.log('Table conversion failed', err);
            return tableEl.innerText; 
        }
    }

    // ... (其他辅助函数) ...
    detectIntersection(rect) {
        const candidates = document.querySelectorAll(this.targetSelectors.join(','));
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        
        const rectLeft = rect.left;
        const rectTop = rect.top;
        const rectRight = rectLeft + rect.width;
        const rectBottom = rectTop + rect.height;

        candidates.forEach(el => {
            if (!this.isValidContent(el)) return;
            const box = el.getBoundingClientRect();
            const elLeft = box.left + scrollX;
            const elTop = box.top + scrollY;
            const elRight = elLeft + box.width;
            const elBottom = elTop + box.height;

            const isOverlapping = !(elRight < rectLeft || elLeft > rectRight || elBottom < rectTop || elTop > rectBottom);

            if (isOverlapping) {
                this.addToSelection(el);
            } else {
                // 如果不再重叠且已选中，则移除
                if (this.selectedElements.has(el)) {
                    this.removeFromSelection(el);
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
        }
    }

    clearSelection() {
        this.selectedElements.forEach(el => el.classList.remove(this.selectedClass));
        this.selectedElements.clear();
    }

    getTarget(e) {
        // 1. 忽略功能按钮
        if (e.target.closest('.mermaid-btn, .copy-code-btn, .mermaid-fs-btn')) return null;

        // [删除] 原有的这段强制选中列表容器的代码：
        // const listContainer = e.target.closest('ul, ol');
        // if (listContainer && this.isValidContent(listContainer)) return listContainer;

        // 2. 查找匹配的块级元素
        let el = e.target.closest(this.targetSelectors.join(','));
        
        if (el && this.isValidContent(el)) {
            // [新增] 优化体验：如果选中了 p 标签，但它直接位于 li 内部，则优先选中 li
            // 这样可以避免用户只想拖拽列表项，却不小心只拖拽了里面的文字段落
            if (el.tagName === 'P' && el.parentElement && el.parentElement.tagName === 'LI') {
                 // 检查 li 是否也在我们的允许范围内（防止意外逃逸）
                 const parentLi = el.parentElement;
                 if (this.isValidContent(parentLi)) {
                     el = parentLi;
                 }
            }

            // 3. 特殊处理：表格
            // 选中表格内部任意元素 (td, tr, th...) 时，强制选中整个表格
            // 因为在 Markdown 中单独拖拽一个单元格是没有意义的
            if (['TD','TR','TH','THEAD','TBODY'].includes(el.tagName)) {
                return el.closest('table');
            }
            
            return el;
        }
        return null;
    }

    isValidContent(el) {
        return (el.closest('.md-content') || el.closest('.node-card'));
    }

    handleMouseOver(e) {
        if (!this.isEnabled) return;
        if (this.isBoxSelecting) return;
        const el = this.getTarget(e);
        if (!el) return;
        e.stopPropagation();
        if (!this.selectedElements.has(el)) el.classList.add(this.hoverClass);
        el.setAttribute('draggable', 'true');
    }

    handleMouseOut(e) {
        const el = this.getTarget(e);
        if (!el) return;
        el.classList.remove(this.hoverClass);
    }

    getUniqueTopLevelElements(elementsSet) {
        const elements = Array.from(elementsSet);
        return elements.filter(el => {
            let parent = el.parentElement;
            while (parent) {
                if (elementsSet.has(parent)) return false;
                parent = parent.parentElement;
                if (parent && parent.classList.contains('md-content')) break;
            }
            return true;
        });
    }
}
// 启动
// if (ENABLE_MARKDOWN_DRAG) {
//     if (document.readyState === 'loading') {
//         document.addEventListener('DOMContentLoaded', () => new RenderedMarkdownDragger());
//     } else {
//         new RenderedMarkdownDragger();
//     }
// }


