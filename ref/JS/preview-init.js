/* --- START OF FILE preview-init.js --- */
let isSpacePressed = false;

/*===============================================================================================
// #region 渲染问答对话
 ==============================================================================================*/
function renderDialogue(qaData,pageTitle='AI对话记录',href='') {
    sessionStorage.setItem('markdownPreviewData', JSON.stringify(qaData));
    sessionStorage.setItem('previewPageTitle', pageTitle);
    sessionStorage.setItem('markdownHref', href);
    document.title = pageTitle;
    document.querySelector("#pageTitle").textContent = pageTitle;
    const container = document.getElementById('dialogueContainer');
    container.innerHTML = '';

    qaData.forEach((qa, index) => {
        const qaPair = document.createElement('div');
        qaPair.className = 'qa-pair';

        
        // 1. 创建包裹层
        const questionWrapper = document.createElement('div');
        questionWrapper.className = 'question-wrapper';
        
        // 2. 将 number 和 area 并列放置
        questionWrapper.innerHTML = `
            <div class="question-number">${index + 1}</div>
            <div class="question-area">
                <div class="question-text">${escapeHtml(qa.question)}</div>
            </div>
        `;
        
        
        const answerArea = document.createElement('div');
        answerArea.className = 'answer-area';
        answerArea.innerHTML = `
            <div class="answer-number">${index + 1}</div>
            <div class="md-content" id="answerContent-${index}"></div>
            <div class="gradient-mask"></div>
            <div class="read-more-hint">点击展开阅读更多</div>
        `;
        
        qaPair.appendChild(questionWrapper);
        qaPair.appendChild(answerArea);
        container.appendChild(qaPair);
        
        processAndRenderAnswer(qa.answer, index);
    });
}


/* --- 修改后的 processAndRenderAnswer 函数 (KaTeX 版) --- */
function processAndRenderAnswer(markdownSource, index) {
    const answerElement = document.getElementById(`answerContent-${index}`);

    // 2. 【解析阶段】解析 Markdown 为 HTML
    answerElement.innerHTML = renderMarkdown(markdownSource || '');
    try {
        processRichContent(answerElement)
    } catch (error) {
        console.log('Markdown 渲染流程错误:', error);
        answerElement.innerHTML = `<p style="color: red;">渲染错误: ${error.message}</p>`;
    }
}


function escapeHtml(unsafe) {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}




// #region 加载数据
async function loadPreviewData() {
    // 1. 【新增】检查是否是导出的离线文件
    if (window.__IS_EXPORTED_FILE__ && window.__EXPORTED_DATA__) {
        console.log('Detected offline mode, loading embedded data.');
        return [window.__EXPORTED_DATA__, window.__EXPORTED_TITLE__];
    }
    let isMdInitialized = sessionStorage.getItem('isMdInitialized');
    console.log('isMdInitialized', isMdInitialized);
    const dataId = 'markdownPreviewData';
    if (isMdInitialized!== 'true') {
        const data = new Promise(resolve => chrome.storage.local.get(dataId, result => resolve(result[dataId])));
        const qaData = await data;
        const {'previewPageTitle':pageTitle} = await chrome.storage.local.get('previewPageTitle');
        const {'markdownHref':href}=await chrome.storage.local.get('markdownHref');
        if(qaData) {
            sessionStorage.setItem('isMdInitialized', 'true');
            return [qaData,pageTitle,href];
        }
    } 
    const qaData = sessionStorage.getItem(dataId);  // 刷新时从这里加载数据
    const pageTitle = sessionStorage.getItem('previewPageTitle');
    return [qaData ? JSON.parse(qaData) : null,pageTitle];
}

async function initializePreviewApp() {
    if (window.__IS_EXPORTED_FILE__) {
        if (typeof rebindOfflineEvents === 'function') {
            rebindOfflineEvents();
        }
        // 2. 【新增】初始化离线导航按钮
        initOfflineNavigationBtn();
        console.log('检测到离线模式：跳过渲染流程，使用预渲染内容。');
        // 离线模式下，HTML 已经包含了渲染好的 DOM，无需再次 renderDialogue
        // 这样即使缺少 utils.js 也不会报错，且页面加载瞬间完成
        return;
    }
    if (typeof marked === 'undefined' || typeof hljs === 'undefined') {
        console.log('Libs not loaded');
        return;
    }
    const [qaData,pageTitle,href]= await loadPreviewData();
    console.log('Loaded preview data from chrome.storage.local', qaData);
    if (!qaData) {
        document.getElementById('dialogueContainer').innerHTML = '<div style="color: #e53e3e; padding: 20px;">未找到预览数据</div>';
        return;
    }
    renderDialogue(qaData,pageTitle,href);
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initializePreviewApp, 100);

    // 折叠逻辑
    const container = document.getElementById('dialogueContainer');
    if (container) {
        container.addEventListener('click', function(e) {
            if (e.target.closest('.answer-number') || e.target.closest('.read-more-hint')) {
                e.stopPropagation();
                e.preventDefault();
                const parentNode = e.target.closest('.answer-area');
                const markdownContent = parentNode.querySelector('.md-content');
                const height = markdownContent.scrollHeight;
                if (!parentNode.classList.contains('collapsed')){   
                    markdownContent.style.maxHeight = height + 'px';
                    markdownContent.offsetHeight;                
                    markdownContent.style.maxHeight  = '80px';   
                    parentNode.classList.add('collapsed');
                } else {                                              
                    markdownContent.style.maxHeight  = height + 'px';
                    markdownContent.offsetHeight;
                    parentNode.classList.remove('collapsed');
                    setTimeout(() => { if (!parentNode.classList.contains('collapsed')) markdownContent.style.maxHeight = 'none'; }, 800);
                }
            }
        });
    }
     if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, namespace) => {
        console.log('onChanged', changes, namespace, location.href);
        if (namespace === 'local' && changes.markdownPreviewData && location.href.endsWith('view=sidepanel')) {
            // sessionStorage.removeItem('isMdInitialized')
            // initializePreviewApp();
            const newData = changes.markdownPreviewData.newValue;
            const newPageTitle = changes.previewPageTitle.newValue;
            renderDialogue(newData,newPageTitle);
        }
    });
     }


    // window.addEventListener('keydown', (e) => {
    //     if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    //         document.querySelector("body > div.bookmark-manager-container").style.display = "none";
    //         document.querySelector("body > div.custom-directory-container").style.display = "none";
    //     }
    // })

    // document.addEventListener('dblclick', (e) => {
    //     document.querySelector("body > div.bookmark-manager-container").style.display = "block";
    //     document.querySelector("body > div.custom-directory-container").style.display = "block";
    // })
});

function showTopToast(msg, duration = 1500) {
    // 1. 创建 DOM 元素
    const toast = document.createElement('div');
    toast.innerText = msg;

    // 2. 设置基础样式
    const style = toast.style;
    style.position = 'fixed';
    style.top = '40px';    // 距离顶部 20px
    style.right = '20px';  // 【修改】固定在右侧，距离右边 20px
    // style.left = ...;   // 【删除】不再需要 left 定位
    
    // 【修改】初始状态：向右偏移 50px (或者 100% 自身宽度) 以便从右边滑过来
    style.transform = 'translate(50px, 0)'; 
    
    style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
    style.color = '#fff';
    style.padding = '10px 15px';
    style.borderRadius = '8px';
    style.fontSize = '14px';
    style.fontWeight = '500';
    style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    style.zIndex = '9999';
    style.opacity = '0'; // 初始透明
    // 保持弹性动画，视觉效果更好
    style.transition = 'all 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28)'; 
    style.pointerEvents = 'none';

    // 3. 将元素添加到页面
    document.body.appendChild(toast);

    // 4. 触发入场动画
    requestAnimationFrame(() => {
        setTimeout(() => {
            style.opacity = '1';
            // 【修改】移动到正常位置 (translateX: 0)
            style.transform = 'translate(0, 0)'; 
        }, 10);
    });

    // 5. 设置定时器销毁
    setTimeout(() => {
        // 【修改】离场动画：向右滑出并淡出
        style.opacity = '0';
        style.transform = 'translate(50px, 0)'; 
        
        // 等待 CSS 动画结束后从 DOM 中移除
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 500); 
    }, duration);
}

/* ===============================================================================================
//   #region 导出逻辑
   ============================================================================================== */

async function downloadPage() {
    // 1. 先保存原始标题
    const originalTitle = document.title;
    // 2. 获取正确的文件名用于保存
    const pageTitle = sessionStorage.getItem('previewPageTitle') || 'AI对话记录';
    
    // 3. 修改页面标题提示用户（这一步会改变当前 DOM）
    document.title = "正在打包...";
    
    try {
        // 4. 传入正确的标题给导出函数
        const htmlContent = await exportSingleHtmlFile(pageTitle);
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // 文件名使用保存的标题
        const fileName = `${pageTitle}_${new Date().toISOString().slice(0,10)}.html`;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.log("导出失败:", err);
        alert("导出失败：" + err.message);
    } finally {
        // 5. 恢复当前页面标题
        document.title = originalTitle;
    }
}


/* ===============================================================================================
   #region 导出/打包逻辑 (修复 KaTeX 字体缺失 + Emoji + 标题修复版)
   ============================================================================================== */

async function exportSingleHtmlFile(correctTitle) {
    // 白名单配置
    const allowedFiles = [
        'katex.min.css', 'atom-one-light.min.css', 'remixicon.css',
        'mermaid.min.js', 'marked.min.js', 'katex.min.js', 
        'auto-render.min.js', 'highlight.min.js',
        'renderMD.js', 'preview-init.js' 
    ];

    // 1. 克隆 DOM
    const docClone = document.documentElement.cloneNode(true);

    // 2. 强制修正克隆体内的标题
    const titleTag = docClone.querySelector('title');
    if (titleTag) {
        titleTag.textContent = correctTitle;
    } else {
        const newTitle = document.createElement('title');
        newTitle.textContent = correctTitle;
        docClone.querySelector('head').appendChild(newTitle);
    }

    // 3. 注入 Emoji 图标 (📜)
    const oldIcons = docClone.querySelectorAll('link[rel*="icon"]');
    oldIcons.forEach(el => el.remove());
    const iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    iconLink.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📜</text></svg>`;
    docClone.querySelector('head').appendChild(iconLink);

    // 4. 清理 UI
    ['.bookmark-manager-container', '.custom-directory-container', '#ai-content-toolbar', '.offline-nav-container']
        .forEach(s => { const el = docClone.querySelector(s); if(el) el.remove(); });

    // 5. 【核心修改】内联 CSS 并处理字体文件
    const linkTags = Array.from(docClone.querySelectorAll('link[rel="stylesheet"]'));
    
    for (const link of linkTags) {
        const fileName = link.getAttribute('href').split('/').pop();
        
        if (allowedFiles.includes(fileName)) {
            try {
                // A. 获取 CSS 文本
                const res = await fetch(link.href);
                let cssText = await res.text();

                // B. 【新增】检测 CSS 中的 url() 引用，将字体转为 Base64
                // 匹配 url('...') 或 url("...") 或 url(...)，且通常字体都在 fonts/ 目录下
                // 正则说明：匹配 url( 后面非引号非括号的内容 )
                const urlRegex = /url\s*\((?:'|")?([^'"\)]+)(?:'|")?\)/g;
                let match;
                const fontPromises = [];
                const replacements = [];

                // 扫描所有 url(...)
                while ((match = urlRegex.exec(cssText)) !== null) {
                    const originalUrlStr = match[0]; // e.g. url('fonts/KaTeX_Main.woff2')
                    const relativePath = match[1];   // e.g. fonts/KaTeX_Main.woff2

                    // 只处理字体文件，且排除已经是 data: 的
                    if (!relativePath.startsWith('data:') && /\.(woff2|woff|ttf|otf|eot)$/.test(relativePath)) {
                        
                        // 计算绝对路径 (基于当前 css 文件的路径)
                        const fontAbsUrl = new URL(relativePath, link.href).href;
                        
                        // 创建一个异步任务去下载并转码
                        const task = fetch(fontAbsUrl)
                            .then(fontRes => fontRes.blob())
                            .then(blob => new Promise((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve({
                                    original: originalUrlStr, 
                                    base64: `url('${reader.result}')` // data:font/woff2;base64,....
                                });
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            }))
                            .catch(err => {
                                console.log('字体打包失败:', fontAbsUrl, err);
                                return null;
                            });
                        
                        fontPromises.push(task);
                    }
                }

                // 等待所有字体下载完成
                if (fontPromises.length > 0) {
                    const results = await Promise.all(fontPromises);
                    // 执行替换
                    results.forEach(item => {
                        if (item) {
                            // 使用 split().join() 进行全局替换，比 replace() 更安全（防止正则特殊字符）
                            cssText = cssText.split(item.original).join(item.base64);
                        }
                    });
                }

                // C. 创建 style 标签替换原 link
                const style = document.createElement('style');
                style.textContent = cssText;
                link.replaceWith(style);

            } catch(e) {
                console.log('CSS处理失败:', fileName, e);
            }
        } else { 
            link.remove(); 
        }
    }

    // 6. 内联 JS
    for (const script of Array.from(docClone.querySelectorAll('script[src]'))) {
        const src = script.getAttribute('src');
        const fileName = src.split('/').pop();
        if (allowedFiles.includes(fileName)) {
            try {
                const res = await fetch(script.src);
                let jsText = await res.text();
                jsText = jsText.replace(/<\/script>/g, '<\\/script>');
                const newScript = document.createElement('script');
                newScript.textContent = jsText;
                newScript.removeAttribute('src');
                script.replaceWith(newScript);
            } catch(e) {}
        } else { script.remove(); }
    }

    // 7. 注入数据
    const currentData = sessionStorage.getItem('markdownPreviewData');
    if (currentData) {
        const safeData = currentData.replace(/<\/script>/g, '<\\/script>');
        const dataScript = document.createElement('script');
        dataScript.textContent = `
            window.__EXPORTED_DATA__ = ${safeData};
            window.__EXPORTED_TITLE__ = "${correctTitle.replace(/"/g, '\\"')}";
            window.__IS_EXPORTED_FILE__ = true;
        `;
        docClone.querySelector('head').prepend(dataScript);
    }

    return `<!DOCTYPE html>\n${docClone.outerHTML}`;
}

// 快捷键监听
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        downloadPage();
    }
});


/* --- 在文件末尾新增此函数：用于离线模式下的事件“复活” --- */
function rebindOfflineEvents() {
    console.log('正在恢复离线文件交互事件...');

    // 1. 恢复 Mermaid 流程图右上角的“全屏”按钮
    document.querySelectorAll('.mermaid-fs-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            // 找到对应的 SVG 容器
            const container = btn.nextElementSibling; 
            if (container) {
                showMermaidFullscreen(container.innerHTML);
            }
        };
    });

    // 2. 恢复代码块的“复制”按钮
    document.querySelectorAll('.copy-code-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            // 找到对应的代码文本
            const codeBlock = btn.parentElement.querySelector('pre code');
            if (codeBlock) {
                navigator.clipboard.writeText(codeBlock.textContent);
                
                // 简单的点击反馈
                const originalIcon = btn.innerHTML;
                btn.innerHTML = '<i class="ri-check-line"></i>';
                btn.style.color = 'green';
                if(typeof showTopToast === 'function') showTopToast('✅ 代码已复制');
                setTimeout(() => { 
                    btn.innerHTML = originalIcon; 
                    btn.style.color = '';
                }, 1500);
            }
        };
    });

    // 3. 恢复 KaTeX 公式的点击复制
    document.querySelectorAll('.katex').forEach(katexNode => {
        const annotation = katexNode.querySelector('annotation[encoding="application/x-tex"]');
        if (annotation) {
            katexNode.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                navigator.clipboard.writeText(annotation.textContent);
                if(typeof showTopToast === 'function') showTopToast('✅ 公式已复制');
            };
        }
    });
}


/* ===============================================================================================
//   #region 离线模式 - 独立导航按钮
   ============================================================================================== */

function initOfflineNavigationBtn() {
    const targets = document.querySelectorAll('.qa-pair');
    const totalCount = targets.length;
    if (totalCount === 0) return;

    // 1. 动态注入 CSS
    const styleId = 'offline-nav-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* --- 容器：垂直居中，紧贴右侧 --- */
            .offline-nav-container {
                position: fixed;
                right: 5px;
                top: 50%;
                transform: translateY(-50%);
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                user-select: none;
                transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease;
                padding-left: 15px; 
            }

            /* --- 隐藏状态：向右滑入 --- */
            .offline-nav-container.minimized {
                /* 向右移动，保留一小条(10px)在屏幕内，或者完全移出靠hover/双击恢复 */
                transform: translate(calc(100% - 10px), -50%);
                opacity: 0.5;
            }

            /* --- 悬停恢复 (依然保留，防止用户双击后找不到) --- */
            .offline-nav-container.minimized:hover {
                transform: translate(0, -50%);
                opacity: 1;
            }

            /* --- 魔法按钮 --- */
            .magic-btn {
                width: 45px;
                height: 45px;
                border: none;
                padding: 0;
                cursor: pointer;
                border-radius: 12px; /* 四周圆角 */
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
                display: flex;
                justify-content: center;
                align-items: center;
                transition: all 0.3s ease;
                overflow: hidden;
                
                /* 基础蓝色 */
                background: rgba(41, 162, 255, 0.9);
            }

            /* --- 【修复】悬停时不要变色 --- */
            .magic-btn:hover {
                /* 保持背景色不变，或者只改透明度 */
                background: rgba(41, 162, 255, 1); 
                
                /* 只保留轻微放大效果作为反馈 */
                transform: scale(1.05); 
                box-shadow: 0 8px 25px rgba(41, 162, 255, 0.4);
            }
            
            .magic-btn.scrolling { transform: scale(0.95); }

            .btn-content { position: relative; width: 100%; height: 100%; }
            .layer {
                position: absolute; inset: 0;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                transition: all 0.3s ease;
            }

            .dir-num {
                font-size: 18px; font-weight: 700; color: #fff;
                line-height: 1;
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            }

            .layer-total { opacity: 1; transform: scale(1); }
            .layer-current { opacity: 0; transform: translateY(10px) scale(0.8); }

            .magic-btn:hover .layer-total { opacity: 0; transform: scale(0.5); }
            .magic-btn:hover .layer-current { opacity: 1; transform: translateY(0) scale(1); }

            .slider-track {
                width: 28px; height: 4px; background: rgba(0,0,0,0.2);
                border-radius: 2px; margin-top: 4px; position: relative; overflow: hidden;
            }
            .slider-fill {
                position: absolute; top: 0; bottom: 0; left: 0;
                background: #ffd32a; border-radius: 2px;
            }
        `;
        document.head.appendChild(style);
    }

    // 2. 注入 HTML
    const btnHtml = `
    <div class="offline-nav-container" id="navContainer" title="滚轮切换 | 双击页面显/隐">
        <button class="magic-btn" id="offlineNavBtn">
            <div class="btn-content">
                <div class="layer layer-total">
                    <span class="dir-num">${formatNum(totalCount)}</span>
                </div>
                <div class="layer layer-current">
                    <span class="dir-num" id="offCurrNum">01</span>
                    <div class="slider-track">
                        <div class="slider-fill" id="offFill" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        </button>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', btnHtml);

    // 3. 逻辑绑定
    const container = document.getElementById('navContainer');
    const btn = document.getElementById('offlineNavBtn');
    const currNumEl = document.getElementById('offCurrNum');
    const fillEl = document.getElementById('offFill');

    let currentIndex = 0;
    let isHoverScrolling = false;
    let scrollTimer = null;
    let animFrame = null;

    const updateUI = (index) => {
        index = Math.max(0, Math.min(index, totalCount - 1));
        currentIndex = index;
        currNumEl.textContent = formatNum(index + 1);
        const percent = ((index + 1) / totalCount) * 100;
        fillEl.style.width = `${percent}%`;
    };
    updateUI(0);

    // --- 交互 1: 双击页面任意位置 -> 切换显隐 (Toggle) ---
    document.addEventListener('dblclick', (e) => {
        // 【核心修复】使用 toggle 而不是 add
        // 这样双击可以隐藏，再次双击可以显示回来
        container.classList.toggle('minimized');
    });

    // --- 交互 2: 鼠标悬停边缘恢复 (保留作为备用) ---
    container.addEventListener('mouseenter', () => {
        if (container.classList.contains('minimized')) {
            container.classList.remove('minimized');
        }
    });

    // --- 交互 3: 页面滚动监听 ---
    window.addEventListener('scroll', () => {
        if (isHoverScrolling) return;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = requestAnimationFrame(() => {
            let activeIdx = 0;
            let minDiff = Infinity;
            const viewBase = window.innerHeight * 0.3; 
            for (let i = 0; i < totalCount; i++) {
                const rect = targets[i].getBoundingClientRect();
                const diff = Math.abs(rect.top - viewBase);
                if (diff < minDiff) {
                    minDiff = diff;
                    activeIdx = i;
                }
            }
            if (activeIdx !== currentIndex) updateUI(activeIdx);
        });
    }, { passive: true });

    // --- 交互 4: 滚轮控制 ---
    btn.addEventListener('wheel', (e) => {
        e.preventDefault(); e.stopPropagation();
        isHoverScrolling = true;
        btn.classList.add('scrolling');

        const direction = e.deltaY > 0 ? 1 : -1;
        let nextIndex = currentIndex + direction;
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= totalCount) nextIndex = totalCount - 1;

        if (nextIndex !== currentIndex) {
            updateUI(nextIndex);
            targets[nextIndex].scrollIntoView({ behavior: 'auto', block: 'start' });
            
            currNumEl.style.transition = 'none';
            currNumEl.style.transform = `translateY(${direction * 4}px)`;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    currNumEl.style.transition = 'transform 0.1s ease';
                    currNumEl.style.transform = 'translateY(0)';
                });
            });
        }
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            isHoverScrolling = false;
            btn.classList.remove('scrolling');
        }, 500);
    }, { passive: false });

    // --- 交互 5: 点击回到顶部 ---
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        targets[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function formatNum(num) {
    return num < 10 ? `0${num}` : num;
}