// 版本说明： 增加了目录预览框支持toc显示以及点击跳转的功能
const FAV_KEY = 'bookmarkData';
const REPLY_KEY = 'largeContents';
const STAR_MARKER = 'ai-star-done';   // 用于防止重复加星的弱标记
const enterHandlers = new WeakMap();
const EXTRA_THRESHOLD = 500;    // 回复内容额外加载阈值，可自定义
let filterFavMode = false;      // 是否“只看收藏”
let selectedItems = new Set();  // 当前选中项索引集合
let isInitialized = false;      // 是否初始化完成
let currentContents = [];       // 当前目录内容数组
let activeItemIndex = -1;       // 当前激活项索引
let updateInterval = null;      // 更新目录内容定时器
let currFavSet = new Set();     // 当前页面收藏索引集合，收藏会更新，URl变化也会更新

let originBgColor=null;
let originBoxShadow=null; // 用于存储原始样式，避免丢失

let directPreviewBox = null;                  // 预览框节点
let directoryContainer, directoryPanel, directoryList, historyPreviewBox,toastEl;
let directoryBtn, totalNumEl,currentNumEl,numFillEl;
let dirTimer,currentIndex;
let favBtn,rateValEl,rateFillEl;
let favTimer;
let rateState = { val: 1.0, min: 0.5, max: 2.5, step: 0.1 };
let currentUrl = location.href;

let refreshHistoryTimer=null;
let history_preview_leaveTimer = null;  // 鼠标离开预览框定时器
let item_preview_leaveTimer = null;     // 鼠标离开目录项预览框定时器
let fixedPanel = false;                 // 固定面板节点
let HistoryHasStar = false;             // 初始化加星标志
let favData=null;                       // 收藏数据;
let pageFavData=null;                      // 当前页面的收藏数据

let isJihuo = false;                    // 激活标志
const PREVIEW_MAX_LEN = 800;            // 超出截断长度，可自定义

let preview_leaveTimer = null; // 用于鼠标移入气泡的防抖缓冲

let isClickScrolling = false;   // 新增：点击滚动互斥锁
let clickScrollTimer = null;    // 新增：解锁定时器
// 网站配置
async function initDirectory() {
    favData=await idbGet(FAV_KEY);
    isJihuo = await checkUIMM3(false);
    if (isInitialized) return;
    initDirectoryUI();              // 初始化目录UI
    initDirectorEventListeners();   // 初始化目录事件监听
    isInitialized = true;
    // 初始生成目录
    setTimeout(async () => {
        currFavSet = await getCurrFavSet();  // ✅ await获取
        checkContent();
        initStarHistoryPreview();   // 不必等待，异步操作，两次读取
    },1000);
    
    setTimeout(async () => {
        if (!HistoryHasStar) initStarHistoryPreview();
        HistoryListMonitor();
    }, 3000);
}

// 用户离开页面时，浏览器会触发 beforeunload 事件，因此需要清理定时器
window.addEventListener('beforeunload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});
/**********************************************************************************************************
//#region 初始化目录UI 
**********************************************************************************************************/
function initDirectoryUI(){
  /*
    document.body（页面根容器）
    └── directoryContainer（最外层容器，class: custom-directory-container）
        ├── directoryBtn（目录按钮，class: directory-btn）
        └── directoryPanel（目录面板，class: directory-panel）
            ├── header（面板头部，class: directory-header）
            └── directoryList（目录列表容器，class: directory-list）
    */
    // 1.创建目录功能的最外层容器元素（包含按钮和面板）

    directoryContainer = document.createElement('div'); // 把对该节点的引用存进变量 directoryContainer，后面所有操作都通过这个变量来指代这个 div。
    directoryContainer.className = 'custom-directory-container';
    // 2.创建目录按钮 
    directoryBtn = document.createElement('button');
    directoryBtn.className = 'magic-btn btn-blue';
    directoryBtn.id = 'dirBtn';
    directoryBtn.innerHTML = `
        <div class="btn-content">
            <div class="layer layer-total">
                <span class="dir-num" id="totalNum">0</span>
            </div>
            <div class="layer layer-current">
                <span class="dir-num" id="currentNum">1</span>
                <div class="slider-track">
                    <div class="slider-fill" id="numFill" style="width: 20%"></div>
                </div>
            </div>
        </div>
    `;
    // 3.创建目录面板
    directoryPanel = document.createElement('div');
    directoryPanel.className = 'directory-panel';

    // 4.创建面板头部（功能区）
    const header = document.createElement('div');
    header.className = 'directory-header';
    header.innerHTML = `
        <div class="header-left">
            <div class="select-all-checkbox" data-i18n-title="chat_list.select_all_title" title="全选/取消全选">
                <div class="select-all-box"></div>
            </div>
            <span class="selection-count">
                <span data-i18n="chat_list.selected_prefix">已选</span> 
                <span class="count-number">0</span>
            </span>
        </div>
        <div class="header-right">
            <button class="copy-selected-btn" disabled="" data-i18n-title="chat_list.copy_title" title="复制">
                <i class="fas fa-copy"></i>
            </button>
            <button class="filter-fav-btn" data-i18n-title="chat_list.filter_fav_title" title="只看收藏">
                <i class="fas fa-star"></i>
            </button>
            <button class="preview-btn" data-i18n-title="chat_list.preview_title" title="预览收藏">
                <i class="fas fa-eye"></i>
            </button>
            <button class="mindMap-btn" data-i18n-title="chat_list.new_mindmap_title" title="新建思维导图">
                <i class="fa-solid fa-code-branch"></i>
            </button>
            <button class="switch-btn" data-i18n-title="chat_list.switch_panel_title" title="切换面板">
                <i class="fas fa-exchange-alt"></i>
            </button>
            <button class="refresh-btn" data-i18n-title="chat_list.refresh_title" title="刷新目录">
                <i class="fas fa-sync-alt"></i>
            </button>
        </div>
    `;
    // 5.创建目录列表容器
    directoryList = document.createElement('ul');
    directoryList.className = 'directory-list';

    // 6.组装元素并添加到页面
    directoryPanel.appendChild(header);
    directoryPanel.appendChild(directoryList);
    directoryContainer.appendChild(directoryBtn);
    directoryContainer.appendChild(directoryPanel);
    document.body.appendChild(directoryContainer);
    totalNumEl = document.getElementById('totalNum');// 绑定数量显示元素，全局生效
    currentNumEl = document.getElementById('currentNum');
    numFillEl = document.getElementById('numFill');

    // ✅ 新增：直接创建并添加到 body，不使用多余的 wrapper
    const contextMenuHTML = `
        <div class="context-menuBM" id="contextMenuAC">
            <div class="context-menu-item" data-action="copyQ">
                <i class="ri-file-copy-line"></i>
                <span class="menu-text" data-i18n="chat_list.copy_q">复制问题</span>
            </div>
            <div class="context-menu-item" data-action="copyA">
                <i class="ri-file-copy-2-line"></i>
                <span class="menu-text" data-i18n="chat_list.copy_a">复制回复</span>
            </div>
            <div class="context-menu-item" data-action="copyQA">
                <i class="ri-file-copy-2-fill"></i>
                <span class="menu-text" data-i18n="chat_list.copy_qa">同时复制</span>
            </div>

            <div class="context-menu-item" data-action="exportCanvas">
                <i class="ri-artboard-line"></i>
                <span class="menu-text" data-i18n="chat_list.export_canvas">导出 Canvas</span>
            </div>
            <div class="context-menu-item" data-action="exportMarkdown">
                <i class="ri-markdown-fill"></i>
                <span class="menu-text" data-i18n="chat_list.export_markdown">导出 Markdown</span>
            </div>
            <div class="context-menu-item" data-action="changeFolder" style="border-top: 1px solid #eee;">
                <i class="ri-folder-settings-line"></i> 
                <span class="menu-text" data-i18n="chat_list.change_folder">切换保存目录</span>
            </div>
        </div>
    `;
    // 使用临时容器解析HTML，取出真正的节点
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = contextMenuHTML;
    const realContextMenu = tempDiv.firstElementChild;
    document.body.appendChild(realContextMenu); // 挂载到 body 上
    
    // 一次性创建预览框
    directPreviewBox = document.createElement('div');
    directPreviewBox.className = 'ai-preview-bubble';
    directPreviewBox.innerHTML = '<div class="ai-preview-content"></div><div class="ai-preview-arrow"></div>';
    document.body.appendChild(directPreviewBox);

    // 【新增】气泡本身的鼠标交互与防抖
    directPreviewBox.addEventListener('mouseenter', () => {
        clearTimeout(item_preview_leaveTimer); // 鼠标进入气泡，取消隐藏定时器
    });
    directPreviewBox.addEventListener('mouseleave', () => {
        clearTimeout(item_preview_leaveTimer); // 【关键修复】离开气泡时也必须先清除积累的定时器
        item_preview_leaveTimer = setTimeout(() => {
            directPreviewBox.classList.remove('show');
        }, 300); // 延迟300ms隐藏
    });


    // 7.创建历史记录预览框
    historyPreviewBox = document.createElement('div');
    historyPreviewBox.className = 'history-preview-bubble';
    historyPreviewBox.innerHTML = `
        <div class="history-preview-content">
            <div class="directory-preview-list"></div>
        </div>
        <div class="history-preview-arrow"></div> 
    `;
    document.body.appendChild(historyPreviewBox);
    historyPreviewBox.addEventListener('mouseenter', historyPreviewShow);
    historyPreviewBox.addEventListener('mouseleave', historyPreviewHide);
    document.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!historyPreviewBox.contains(e.target)&&!e.target.dataset.previewDone) {
            historyPreviewHide();
        }
    });

    if (currentWebsite === 'ChatGPT') {
        const targetSelector = ".fixed .items-start";
        console.log('⏳ 正在全局监听等待 ChatGPT 目录容器...');
        waitForElement(targetSelector).then((targetNode) => {
            console.log('✅ 抓到了！元素出现了，立马执行...');
            
            // 1. 元素一出现，立马执行你的目录生成（毫无延迟）
            generateDirectory(true); // 直接生成目录，参数 true 表示强制刷新，不使用缓存

            // // 2. 元素已经是真实节点了，给它挂上专属的、省性能的局部监听
            // const directoryObserver = new MutationObserver(() => {
            //     generateDirectory(true);
            // });
            // directoryObserver.observe(targetNode, {
            //     childList: true
            // });
    });

    }
}



/**********************************************************************************************************
//#region 初始化事件绑定
**********************************************************************************************************/
function initDirectorEventListeners(){
    const directoryBtn = document.getElementById('dirBtn');
    const header = document.querySelector('.directory-header');
    const directoryList = document.querySelector('.directory-list');
    // 1.绑定目录按钮点击事件=========================================================
    directoryBtn.onclick = () => {
        const willOpen = !directoryPanel.classList.contains('show');
        startPanelAnimation(() => { //  按钮点击后400ms内禁用交互,其他同理
            if (willOpen) {
                // 打开面板：先隐藏按钮，再显示面板
                directoryBtn.classList.add('hide-btn');
                directoryPanel.classList.add('show'); // 立即显示面板
                document.getElementById('favBtn').classList.add('hide-btn');
            } 
        });
    };
    // 头部按钮事件==================================================================
    header.querySelector('.select-all-checkbox').onclick = toggleSelectAll;
    header.querySelector('.copy-selected-btn').onclick = copySelectedTitles;
    const filterFavBtn = header.querySelector('.filter-fav-btn');
    const previewBtn=header.querySelector('.preview-btn');
    const mindMapBtn=header.querySelector('.mindMap-btn');
    filterFavBtn.onclick = async () => {   // 收藏筛选按钮
        filterFavMode = !filterFavMode;
        await generateDirectory();      // 重新渲染
        updateSelectAllState();         // ✅ 全选框状态
    };

    previewBtn.disabled=currentWebsite==='MindMapHtml' || currentWebsite==='PreviewHtml';// 两个html没有预览按钮
    mindMapBtn.disabled=currentWebsite==='MindMapHtml'; // 思维导图页面没有新建思维导图按钮
    if (currentWebsite!=='MindMapHtml'){
        installLongPress(filterFavBtn, {
            delay: 600,
            onLongPress: () => bookmarkManager.showNewItemModal([],'','save_markdown')
        });
        mindMapBtn.onclick = async (e) => {      // 非思维导图页面才可以点击新建导图按钮
            e.stopPropagation();
            if (currentWebsite==='PreviewHtml'){
                var qaList = JSON.parse(sessionStorage.getItem('markdownPreviewData'))
            }else{
                const item=await readFavItem(location.href);
                var qaList = await buildQAList(item);
            }
            openQAdata(qaList,'新建思维导图','mindmap');
        };
        if (currentWebsite!=='PreviewHtml'){
            previewBtn.onclick = async (e) => {
                e.stopPropagation();
                const item=await readFavItem(location.href);
                const qaList = await buildQAList(item);
                openQAdata(qaList,item.name,'markdown');
            };
            installLongPress(previewBtn, {
                delay: 600,
                onLongPress: () => getMultipleQA('markdown')
            });
            installLongPress(mindMapBtn, {
                delay: 600,
                onLongPress: () => getMultipleQA('mindmap')
            });
        }
    }
    
    header.querySelector('.switch-btn').onclick = async(e) => {      // 切换面板按钮
        e.stopPropagation();        // 阻止事件冒泡，避免点击切换按钮时也触发关闭目录
        fixedPanel = false;
        directoryPanel.classList.toggle('fixed', fixedPanel);
        startPanelAnimation(() => {
            directoryPanel.classList.remove('show');
            document.getElementById('bookmarkPanel').classList.add('open');
        });
    };
    header.querySelector('.refresh-btn').onclick = async function () {      // 刷新按钮
        selectedItems.clear();
        favData=await readFav();

        await generateDirectory(true);
        const icon = this.querySelector('i');
        icon.style.animation = 'none';
        setTimeout(() => {
            icon.style.animation = 'fa-spin 1s ease-in-out';
        }, 10);
    };


    header.addEventListener('dblclick', (e) => {
        if(!e.target.closest('.select-all-checkbox')&&!e.target.closest('.header-right')){
            fixedPanel = !fixedPanel;
            directoryPanel.classList.toggle('fixed', fixedPanel);
        }
    });

    installLongPress(directoryList, {
        delay: 300,
        onLongPress: (e) =>{
            if(!e.target.closest('.directory-item')){
                e.stopPropagation();        // 阻止事件冒泡，避免点击切换按钮时也触发关闭目录
                // fixedPanel = false;
                // directoryPanel.classList.toggle('fixed', fixedPanel);
                // startPanelAnimation(() => {
                //     directoryPanel.classList.remove('show');
                //     document.getElementById('bookmarkPanel').classList.add('open');
                // });
            }
            else{
                const item = e.target.closest('.directory-item');
                const child = item.querySelector('[data-real-idx]'); // 找到子元素
                const index = child.dataset.realIdx;
                const itemContent = currentContents[index];
                const fullText = itemContent.fullText;
                navigator.clipboard.writeText(fullText).then(() => {
                    showTopToast(getI18nText('toast.copy_success'));
                    // 创建波纹效果
                    const ripple = document.createElement('div');
                    ripple.className = 'ripple-effect';

                    // 设置波纹位置和大小
                    const rect = item.getBoundingClientRect();      // 获取项目元素的位置信息
                    const size = Math.max(rect.width, rect.height);
                    const x = e.clientX - rect.left - size / 2;
                    const y = e.clientY - rect.top - size / 2;

                    ripple.style.width = ripple.style.height = size + 'px';
                    ripple.style.left = x + 'px';
                    ripple.style.top = y + 'px';

                    // 添加到当前点击的项目
                    item.style.position = 'relative';
                    item.appendChild(ripple);

                    // 动画结束后移除波纹元素
                    setTimeout(() => {
                        if (ripple.parentNode === item) {
                            item.removeChild(ripple);
                        }
                    }, 600);
                })
            }
        }
    });

    // 3.点击外部关闭===============================================================
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-ai-copying="1"]')) return;
        if (directoryPanel.classList.contains('show') && 
            !directoryContainer.contains(e.target) &&
            !e.target.closest('.star') &&           // 排除点击星星的操作
            !e.target.closest('.item-checkbox')&&   // 排除点击复选框的操作
            !e.target.closest('.mymodal')&&!fixedPanel&&  // 排除点击模态框的操作
            !e.target.closest('.context-menuBM')&&
            !e.target.closest('.ai-preview-bubble')&&
            !e.target.closest('div[style^="--scroll-nav-page-padding"]')&&
            !e.target.closest('.fixed .items-start button')
        ) {
            startPanelAnimation(() => {
                directoryPanel.classList.remove('show');
                directoryBtn.classList.remove('hide-btn');
                document.getElementById('favBtn').classList.remove('hide-btn');
            });
        }

        if (!e.target.closest('.custom-directory-container')&&!e.target.closest('.bookmark-manager-container')){
            // console.log('检测点击');
            handleUrlChange();
        }
        const contextMenu = document.getElementById('contextMenuAC');
        if (contextMenu && contextMenu.style.display !== 'none') {
            contextMenu.style.display = 'none';
        }
    },true);
    document.addEventListener('keydown', (e) => { 
        if(e.key==='Enter') {       // 首次对话时链接也会变
            handleUrlChange();
            console.log('检测回车');
            setTimeout(() => {
                handlePageChange();
            }, 500);
         }

        if (e.ctrlKey && e.key.toLowerCase() === 'q') {
            // 1. 阻止默认行为 (可选，防止与浏览器或系统快捷键冲突)
            e.preventDefault();
            // console.log(HighlightManager.siteData[HighlightManager.pageKey])
            HighlightManager.clearHighlights()
            // 2. 执行你的逻辑
        }
    }, true);
    const observeElements = (selector, callback) => {
        new MutationObserver(() => 
            document.querySelectorAll(selector).forEach(callback)
        ).observe(document.body, {childList: true, subtree: true});
    };
    let directoryDebounceTimer = null;
    // 监听对话消息变化
    observeElements(currentCfg.selector, el => {
        if (!el.dataset.observed) {
            el.dataset.observed = 'true'; // 1. 立即标记，防止重复识别

            // 2. 防抖逻辑：只要还在不断发现新元素，就清除上一次的定时器
            if (directoryDebounceTimer) clearTimeout(directoryDebounceTimer);
            
            // 3. 重新设置定时器，300ms 后没有新元素才真正执行刷新
            directoryDebounceTimer = setTimeout(() => {
                handlePageChange(); 
                // console.log('🛑 停止滚动，批量刷新目录');
            }, 200); 
        }
    });

    // 监听复制按钮变化（同理）
    observeElements(currentCfg.copySelector, el => {
        if (!el.dataset.observed) {
            el.dataset.observed = 'true'; // 立即标记

            if (directoryDebounceTimer) clearTimeout(directoryDebounceTimer);
            
            directoryDebounceTimer = setTimeout(() => {
                generateDirectory(true);
                checkWidthInit();
            }, 100);
        }
    });

    // ================================================================================================
    // #region 目录列表事件
    // ================================================================================================
    // 事件委托：鼠标进入/离开目录列表即可
    directoryList.addEventListener('mouseenter', handleEnter, true);
    directoryList.addEventListener('mouseleave', handleLeave, true);
    // 事件委托 - 处理目录项点击
    directoryList.addEventListener('click', (e) => {
        /* 星星点击 */
        e.stopPropagation();
        const star = e.target.closest('.star'); // 从真正被点到的那个元素（e.target）开始，逐级往上找，直到遇见第一个带 .star 类的祖先（或自己）。
        if (star) {
            const idx = Number(star.dataset.realIdx);
            if (currentWebsite !== 'PreviewHtml'&& currentWebsite!== 'MindMapHtml') {
                toggleFav(idx);
            }else{
                star.classList.toggle('fav');
                currFavSet.has(idx) ? currFavSet.delete(idx) : currFavSet.add(idx);
                if (filterFavMode) {            // 如果当前处于“只看收藏”模式
                    const visibleSet = getVisibleRealIdxs();
                    if (visibleSet.size === 0) {
                        filterFavMode = false;      // 退出收藏筛选
                    }
                    updateSelectAllState();        // ✅ 全选框状态
                    generateDirectory();          // 重新渲染目录列表，确保当前筛选状态下的显示正确
                }
            }
            return;
        }
    
        /* 复选框点击 */
        const chk = e.target.closest('.item-checkbox');
        if (chk) {
            const realIdx = Number(chk.dataset.realIdx);
            selectedItems.has(realIdx) ? selectedItems.delete(realIdx) : selectedItems.add(realIdx);
            updateSelectionUI();
            updateSelectAllState();  // ✅ 全选框状态
            return;
        }
    
        /* 普通行点击 = 跳转 */
        const item = e.target.closest('.directory-item');
        if (!item) return;
        // --- ✨ 新增逻辑开始 ---
        isClickScrolling = true; // 🔒 上锁
        if (clickScrollTimer) clearTimeout(clickScrollTimer);

        // 1. 立即手动设置高亮（给用户即时反馈）
        document.querySelectorAll('.directory-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        activeItemIndex = Number(item.querySelector('.item-checkbox').dataset.realIdx); // 更新当前索引记录

        // --- ✨ 新增逻辑结束 ---
        const realIdx = Number(item.querySelector('.item-checkbox').dataset.realIdx);
        const targetElement = currentContents[realIdx].element;
        
        if (targetElement) scrollToElement(targetElement, currentSettings.enableScrollSmooth?'smooth':'auto');

        
    });

    document.addEventListener('dblclick', (e) => {
        if(!e.target.closest('.custom-directory-container')&&
        !e.target.closest('.bookmark-manager-container')&&
        !e.target.closest('.card-dock-body')&&
        !e.target.closest('.node-card')&&
        !e.target.closest('.toolbar')&&
        !e.target.closest('.item-content')&&
        !directoryPanel.classList.contains('fixed')&&
        !document.querySelector('.bookmark-panel').classList.contains('fixed')){
            console.log('按钮切换显示');
            document.getElementById('dirBtn').classList.toggle('hide-btn');
            document.getElementById('favBtn').classList.toggle('hide-btn');
            if (currentWebsite=== 'MindMapHtml') {
                document.querySelector('.toolbar').classList.toggle('hide-bar');
            }
        }
    });

    if (currentWebsite && currentWebsite !== 'MindMapHtml' ) {
        window.addEventListener('scroll', function() {
            if (isClickScrolling) return; // 🔒 关键修改：如果是点击造成的滚动，直接忽略，不更新UI
            updateCurrentIndex();
            console.log('滚动事件触发，当前索引:', currentIndex);
        }, true);

        directoryBtn.addEventListener('wheel', function(e) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1 : -1;
            if (e.deltaY < 0) {
                targetIndex = Math.max(0, currentIndex - 1);
            } else{
                targetIndex = Math.min(currentContents.length - 1, currentIndex + 1);
            }
            scrollToElement(currentContents[targetIndex].element,'auto');
            console.log(`滚轮滚动，目标索引: ${targetIndex}, 当前索引: ${currentIndex}`);
            currentNumEl.innerText = targetIndex+1 < 10 ? `0${targetIndex+1}` : targetIndex+1;

            directoryBtn.classList.add('scrolling');
            currentNumEl.style.transition = 'none';
            currentNumEl.style.transform = `translateY(${delta * 4}px)`;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    currentNumEl.style.transition = 'transform 0.1s cubic-bezier(0.2,0.8,0.2,1)';
                    currentNumEl.style.transform = 'translateY(0)';
                });
            });

            clearTimeout(dirTimer);
            dirTimer = setTimeout(() => { directoryBtn.classList.remove('scrolling'); }, 500);
        });

        favBtn = document.getElementById('favBtn');
        rateValEl = document.getElementById('rateVal');
        rateFillEl = document.getElementById('rateFill');
        if (currentWidthRatio) rateState.val=currentWidthRatio;
        updateRateUI();
        favBtn.addEventListener('wheel', (e) => {
            e.preventDefault();
            favBtn.classList.add('scrolling');

            const delta = e.deltaY > 0 ? -1 : 1; 
            let nextVal = rateState.val + (delta * rateState.step);
            if (nextVal > rateState.max) nextVal = rateState.max;
            if (nextVal < rateState.min) nextVal = rateState.min;
            nextVal = Math.round(nextVal * 10) / 10;
            rateState.val = nextVal;
            controlWidth(nextVal)

            rateValEl.style.transition = 'none';
            rateValEl.style.transform = `translateY(${-delta * 2}px)`; 
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    rateValEl.style.transition = 'transform 0.1s cubic-bezier(0.2,0.8,0.2,1)';
                    rateValEl.style.transform = 'translateY(0)';
                });
            });

            updateRateUI();
            clearTimeout(favTimer);
            favTimer = setTimeout(() => { favBtn.classList.remove('scrolling'); }, 500);
        });
    }
    directoryList.addEventListener('contextmenu', (e) => {
        if (currentWebsite==='MindMapHtml') return;
        e.preventDefault();
        const item = e.target.closest('.directory-item');
        if (!item) return;
        const child = item.querySelector('[data-real-idx]');
        showContextMenuAC(e.clientX, e.clientY, currentContents[child.dataset.realIdx]);
    });
    document.getElementById('contextMenuAC').addEventListener('click', async(e) => {
        e.stopPropagation();
        const contextMenu = document.getElementById('contextMenuAC');
        const menuItem = e.target.closest('.context-menu-item');
        if (!menuItem) return;
        const action = menuItem.dataset.action;
        const targetIdx = Number(contextMenu.dataset.targetIdx);
        let qaList=[];
        let replyText='';
        let itemContent='';
        if (currentWebsite==='PreviewHtml'){
            qaList = JSON.parse(sessionStorage.getItem('markdownPreviewData'))
        }
        if (action==='copyQ'){
            itemContent = currentContents[targetIdx];
            navigator.clipboard.writeText(itemContent.fullText);
            showTopToast(getI18nText('toast.copy_success'));
        }else if(action==='copyA' || action==='copyQA'){
            replyText=currentWebsite!=='PreviewHtml'? 
                                        await getReply(targetIdx,single=true):qaList[targetIdx].answer;
            console.log('复制回复内容:',replyText);
            if (action==='copyA'){
                navigator.clipboard.writeText(replyText);
            }else{
                itemContent = currentContents[targetIdx];
                navigator.clipboard.writeText('# ' + itemContent.fullText + '\n\n' + replyText);
            }
            showTopToast(getI18nText('toast.copy_success'));
        }else if(action==='changeFolder'){
            // 1. 清除旧句柄
            await resetObsidianPath();
            
            // 2. 立即触发选择新目录 (因为句柄已空，getObsidianHandle 会自动弹窗)
            const newHandle = await getObsidianHandle();
            
            if (newHandle) {
                showTopToast(getI18nText('toast.dir_set_success'));
            }
            
            // 关闭菜单
            contextMenu.style.display = 'none';
            return;
            }
        
        else{
            qaList = currentWebsite!=='PreviewHtml'? await getMultipleQA('save_markdown'):qaList;
            if (action==='exportCanvas'){
                exportToObsidianCanvas(qaList);
            }else{
                exportToMarkdown(qaList);
            }
        }
    });
}

function showContextMenuAC(x, y, itemContent) {
    const contextMenu = document.getElementById('contextMenuAC');
    if (!contextMenu) return;

    // 防止菜单溢出屏幕右侧和底部
    contextMenu.style.display = 'flex'; // 先显示以获取尺寸
    const rect = contextMenu.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    let finalX = x;
    let finalY = y;

    if (x + rect.width > winWidth) finalX = winWidth - rect.width - 5;
    if (y + rect.height > winHeight) finalY = y - rect.height;

    contextMenu.style.top = `${finalY}px`;
    contextMenu.style.left = `${finalX}px`;
    
    // 存储当前操作项的数据，以便点击菜单项时使用
    contextMenu.dataset.targetIdx = itemContent.displayIndex - 1; 
}
/**********************************************************************************************************
// #region 双按钮交互逻辑
 **********************************************************************************************************/
function updateCurrentIndex(){
    if (currentWebsite==='DeepSeek' && document.querySelector('div[style^="--scroll-nav-page-padding"] .ds-scroll-area')) {
        const { textContent, offset } = getClosestElementToViewport(currentCfg.selector);// 寻找离视口最近的元素及其文本内容和偏移标识
        for (let i = 0; i < currentContents.length; i++) {
            if (currentContents[i].fullText === textContent) {
                currentIndex = i;
                break; // 找到后立即退出循环
            }
        }
        // console.log(`textContent: ${textContent}, matchedIndex: ${currentIndex}, offset: ${offset}`);
        currentIndex =currentIndex + offset; // 根据偏移调整索引
    }
    else if(currentWebsite === 'ChatGPT' && document.querySelector('.fixed .items-start')){
        const { textContent, offset } = getClosestElementToViewport(currentCfg.selector);// 寻找离视口最近的元素及其文本内容和偏移标识
        for (let i = 0; i < currentContents.length; i++) {
            const shortText = currentContents[i].fullText.replace(/\.{3}$/, ''); // 去掉末尾的省略号
            if (currentContents[i].fullText === textContent || textContent.startsWith(shortText)) { // ChatGPT的内容可能会被截断，所以改为 startsWith 匹配
                currentIndex = i;
                break; // 找到后立即退出循环
            }
        }
        currentIndex =currentIndex + offset; // 根据偏移调整索引
        console.log('当前索引',currentIndex,'当前问题：',textContent.substring(0,30));
    }
    else{
        currentIndex = currentContents.findIndex(item => {
            const rect = item.element?.getBoundingClientRect();
            if (!rect) return false; // 如果元素不存在，跳过当前项
            return rect.bottom > 0;
        });
    }
    
    currentIndex = currentIndex === -1 ? currentContents.length - 1 : currentIndex;
    currentNumEl.innerText = currentIndex+1 < 10 ? `0${currentIndex+1}` : currentIndex+1;
    const pct = ((currentIndex+1) / currentContents.length) * 100;
    // console.log(`currentIndex: ${currentIndex}, pct: ${pct}, total: ${currentContents.length}`);
    numFillEl.style.width = `${pct}%`;

    // activeItemIndex=currentIndex===0?currentIndex:currentIndex-1;
    AlldirectoryItem=document.querySelectorAll('.directory-item');
    // console.log('AlldirectoryItem:',currentIndex,AlldirectoryItem);
    // console.log('activeItemIndex:',activeItemIndex,currentContents.length);
    if (AlldirectoryItem.length>0 && currentContents.length>0){ // 网页加载较慢时，目录项还在是上一个页面的但是内容项还在加载
        AlldirectoryItem.forEach(el => el.classList.remove('active'));
        AlldirectoryItem[currentIndex].classList.add('active');  
    }

}
function updateRateUI() {
    rateValEl.innerText = rateState.val.toFixed(1);
    const pct = (rateState.val / rateState.max) * 100;
    rateFillEl.style.width = `${pct}%`;
};
/**
 * 找到离视口最近的元素并返回其文本内容和偏移标识
 * @param {string} selector - CSS选择器（如'.target'、'div'）
 * @returns {Object} { textContent: string, offset: number } - 返回文本内容和偏移（0/-1）
 */
function getClosestElementToViewport(selector) {
    // 1. 获取所有匹配的元素，转为数组方便操作
    const elements = Array.from(document.querySelectorAll(selector));
    let filteredElements =null;
    if (currentWebsite==='DeepSeek'){
        filteredElements = elements.filter(element => {   // 把混进来的回复元素给筛掉
            // 1. 找到第一个带data-virtual-list-item-key属性的祖先元素（包括直接父元素）
            const ancestorWithKey = element.closest('[data-virtual-list-item-key]');
            
            // 3. 有该祖先 → 检查属性值是否为偶数
            const keyValue = Number(ancestorWithKey.dataset.virtualListItemKey);
            // 若值是有效数字且为偶数 → 排除；否则保留
            return isNaN(keyValue) || keyValue % 2 !== 0;
        });
        if (filteredElements.length === 0) {
            return { textContent: '', offset: -1 }; // 无匹配元素时返回空文本+offset=-1
        }
    }else if(currentWebsite === 'ChatGPT'){
        filteredElements = Array.from(document.querySelectorAll(selector));
    }
    filteredElements.forEach(el => {
        initUniversalCollapsible(el); // 初始化折叠功能
    });

    // 2. 计算每个元素的视口位置，并存储元素和距离
    const elementInfoList = filteredElements.map(element => {
        // 获取元素的边界信息（相对于视口）
        const rect = element.getBoundingClientRect();
        // 元素顶部到视口顶部的距离（负数表示元素在视口之上）
        const topDistance = rect.top;
        return {
            element: element,
            topDistance: topDistance,
            // 距离视口的绝对距离（用于判断"最近"）
            distanceToViewport: Math.abs(topDistance)
        };
    });

    // 3. 筛选出「视口及视口之上」的元素（topDistance ≤ 0）
    const aboveOrInViewport = elementInfoList.filter(item => item.topDistance <= window.innerHeight);
    // 筛选出「视口之下」的元素（topDistance > 0）
    const belowViewport = elementInfoList.filter(item => item.topDistance > window.innerHeight);

    let targetItem;
    let offset;

    // 4. 优先处理「视口及视口之上」的元素
    if (aboveOrInViewport.length > 0) {
        // 找到距离视口最近的（绝对距离最小）
        targetItem = aboveOrInViewport.reduce((prev, curr) => {
            return curr.distanceToViewport < prev.distanceToViewport ? curr : prev;
        });
        offset = 0;
    } else {
        // 无上方元素时，找视口之下最近的
        targetItem = belowViewport.reduce((prev, curr) => {
            return curr.distanceToViewport < prev.distanceToViewport ? curr : prev;
        });
        offset = -1;
    }

    // 5. 返回结果（处理元素文本为空的情况）
    return {
        textContent: targetItem.element.textContent.trim() || '',
        offset: offset
    };
}
/**********************************************************************************************************
// #region 整页抓取
 **********************************************************************************************************/
async function getMultipleQA(action='markdown'){
    if (currentCfg.replySelector) {
        return await getMultipleQA0(action);
    }else{
        return await getMultipleQA1(action);
    }
}
async function getMultipleQA1(action='markdown'){
    isJihuo = await checkUIMM3();if (!isJihuo) {return;}
    checkContent(); // 确保 currentContents 已经更新
    // 1. 确定要处理的序列
    const qaList = [];
    let sequence = null;
    if (selectedItems.size > 0) {
        sequence = Array.from(selectedItems).sort((a, b) => a - b); 
    } else {
        sequence = Array.from({length: currentContents.length}, (_, i) => i);
    }
    
    const total = sequence.length;
    if (total === 0) {
        showTopToast(getI18nText('toast.no_export_content'));
        return;
    }

    // 2. 启动加载动画
    showLoading(total);

    try {
        for (let i = 0; i < total; i++) {
            const idx = sequence[i];
            
            // 更新进度文字（可选：截取问题前15个字显示在副标题）
            const previewText = currentContents[idx].fullText.substring(0, 15) + '...';
            updateLoading(i, total, `正在获取: ${previewText}`); // 这里显示 i，表示正在处理第 i+1 个

            let qData = currentContents[idx].fullText;
            if (currentWebsite==='ChatGPT'){
                const elements = document.querySelectorAll(currentCfg.selector);
                let el = null;
                for (const element of elements) {
                    // 获取元素相对于视口的top偏移量
                    const top = element.getBoundingClientRect().top;
                    
                    // 检查top是否大于0，找到后立即终止循环
                    if (top > 0) {
                        el = element;
                        if (el.textContent.trim().length > 0){
                            qData = el.textContent.trim();
                        };
                        break; // 找到第一个符合条件的，无需继续遍历
                    }
                }

            }
            
            // 获取回答 (注意：getReply 内部有 clipboard 操作和延时，这正是我们需要进度条的原因)
            const aData = await getReply(idx);
            
            qaList.push({
                question: qData,
                answer: aData
            });

            // 处理完一个，更新进度到 i+1
            updateLoading(i + 1, total);
        }
        
        // 3. 完成处理
        updateLoading(total, total, '处理完成，正在生成预览...');
        
    } catch (e) {
        console.log('批量获取失败', e);
        showTopToast(getI18nText('toast.process_error'));
    } finally {
        // 4. 关闭动画并打开预览
        hideLoading();
        // 延迟一点打开预览，等待遮罩消失动画
        if (action!== 'save_markdown'){
             setTimeout(() => {
                // console.log(qaList);
                const fileName=action==='mindmap'?'新建思维导图':cleanPageName();
                openQAdata(qaList, fileName,action);
             })
        }else{
            return qaList;
        }
    }
}

async function getMultipleQA0(action='markdown'){
    checkContent(); // 确保 currentContents 已经更新
    // 1. 确定要处理的序列
    const qaList = [];
    let sequence = null;
    if (selectedItems.size > 0) {
        sequence = Array.from(selectedItems).sort((a, b) => a - b); 
    } else {
        sequence = Array.from({length: currentContents.length}, (_, i) => i);
    }
    const total = sequence.length;
    for (let i = 0; i < total; i++) {
        const idx = sequence[i];

        const qData = currentContents[idx].fullText;
        
        // 获取回答 (注意：getReply 内部有 clipboard 操作和延时，这正是我们需要进度条的原因)
        isScroll=(total > 30 && i%5 === 0) ? true:false;
        const aData = await getReply(idx,false,isScroll);
        
        qaList.push({
            question: qData,
            answer: aData
        });
    }
    if (action!== 'save_markdown'){
        setTimeout(() => {
            // console.log(qaList);
            const fileName=action==='mindmap'?'新建思维导图':cleanPageName();
            openQAdata(qaList, fileName,action);
        })
    }else{
        return qaList;
    }
}

/**********************************************************************************************************
// #region 内容变化处理
 **********************************************************************************************************/
async function handleUrlChange(){
    // await new Promise(r => setTimeout(r, 120));
    if (currentContents.length === 0 && currentWebsite==='AIstudio') {
        setTimeout(async () => {
            await generateDirectory(true);return;
        }, 500);
    };
    setTimeout(async() => {
        if (currentUrl !== location.href) {
            if (currentWebsite!=='MindMapHtml') checkWidthInit();
            currentUrl = location.href;            
            // 重置状态
            selectedItems.clear();   // 清空复选框
            activeItemIndex = -1;    // 清空激活高亮
            filterFavMode = false;   // 重置收藏筛选
            
            // 更新目录
            currFavSet = await getCurrFavSet();  // ✅ await获取
            await generateDirectory(true);
            // HighlightManager.switchPage(location.href);
            setTimeout(async () => {
                checkContent();
                // console.log('🔄 刷新历史列表预览状态');
                // await initStarHistoryPreview();    // ✅ await刷新
            }, 500);
        }
    }, 200)
}
async function handlePageChange() {
    if (currentUrl !== location.href) return;// 如果url变化，直接交给handleUrlChange处理
    if (currentWebsite!=='MindMapHtml') {checkWidthInit();};
    if (currentContents.length === 0 && currentWebsite==='AIstudio') {
        setTimeout(async () => {
            await generateDirectory(true);
            return;
        }, 500);
    };

    await generateDirectory(true);    // 刷新目录，不然点开还是旧的
    setTimeout(async () => {
        await generateDirectory(true);    // 刷新目录，不然点开还是旧的
        setTimeout(async () => { 
            await generateDirectory(true);    // 刷新目录，不然点开还是旧的
            checkWidthInit();
        }, 3000);
    }, 3000);
    await initStarHistoryPreview();    // ✅ await刷新
}

function HistoryListMonitor() {
    // return;
    if (!currentCfg || !currentCfg.historyListSelector||!currentCfg.historyItemSelector||
        currentWebsite==='AIstudio') return;
    const container = getStarScanRoot();
    const observeElements = (selector, callback) => {
        new MutationObserver(() => 
            container.querySelectorAll(selector).forEach(callback)
        ).observe(container, {childList: true, subtree: true});
    };
    observeElements(currentCfg.historyItemSelector, el => {
        if (!el.dataset.observed) {
            el.dataset.observed = 'true';
            clearTimeout(refreshHistoryTimer);
            refreshHistoryTimer = setTimeout(() => {    // 防抖，防止频繁触发
                initStarHistoryPreview();
                // console.log('📝 检测到新历史记录');
            }, 200);
        }
    });
}

/**********************************************************************************************************
// #region 目录点击交互逻辑
 **********************************************************************************************************/
// 核心跳转函数,跳转的指引是元素（element），不是选择器
function scrollToElement(targetElement,scroll_behavior='smooth',block='start') {
    
    if (!targetElement) return false;
    if (currentWebsite === 'MindMapHtml') {centerTarget(targetElement.closest('.node-card')); return;}
    const behavior = currentWebsite === 'Kimi' || currentWebsite === 'AIstudio'? 'auto' : scroll_behavior;
    if ('scrollRestoration' in history) {
        // 将滚动恢复设置为手动，阻止浏览器干预
        history.scrollRestoration = 'manual';
    }

    if (currentWebsite==='DeepSeek' && 
        document.querySelector('div[style^="--scroll-nav-page-padding"] .ds-scroll-area:not(.czx)')) {
            targetElement.click();
        }
    else if(currentWebsite === 'ChatGPT' && document.querySelector('.fixed .items-start')){
        targetElement.click();
    }else{
        targetElement.scrollIntoView({            // 滚动到目标元素
            behavior: behavior,
            block: block
        });
        if(originBgColor === null || originBoxShadow === null){
            originBgColor = targetElement.style.backgroundColor;
            originBoxShadow = targetElement.style.boxShadow;
        }
        targetElement.style.transition = 'background-color 0.5s ease';
        const delayTime=currentSettings.enableScrollSmooth?1500:600;
        targetElement.style.backgroundColor = 'rgba(250, 131, 135, 0.56)';
        targetElement.style.boxShadow = '0 0 0 2px rgb(250, 131, 135)';
        setTimeout(() => {
            targetElement.style.backgroundColor = originBgColor;
            targetElement.style.boxShadow = originBoxShadow;
        }, delayTime);
    }
    clickScrollTimer = setTimeout(() => {
        isClickScrolling = false; // 🔓 解锁
    }, 200);
    updateCurrentIndex();     // 再次校准一次，防止位置微偏
    return true;
}
/**********************************************************************************************************
// #region 内容抓取
 **********************************************************************************************************/

async function getContents() {
    if (!currentCfg) return [];
    const contents = [];
    // 针对AIstudio的抓取策略
    if (currentWebsite==='AIstudio') {
        const elements = document.querySelectorAll(currentCfg.selector); // 拿全部
        const textElements = document.querySelectorAll(currentCfg.textSelector);
        var userElements = [];
        for (let i = 0; i < elements.length-1; i++){
            const el1=elements[i]
            const el2=elements[i+1]
            if (el1.querySelector('[data-turn-role="User"]') && el2.querySelector('[data-turn-role="Model"]')){
                userElements.push(el1);
            }
        }
        userElements.forEach((userEl, i) => {
            userEl.style.backgroundColor = '#4587fa32';
            userEl.style.borderRadius  = '10px';
            initUniversalCollapsible(userEl)
            // console.log(el);
            const fullText = textElements[i]?.getAttribute('aria-label')?.trim() || `项目 ${i + 1}`;
            contents.push({
                selectorIndex: i + 1,          // 第几条（从 1 起）
                displayIndex: i + 1,           // 原始序号
                element: userEl,                   // ✅ 保存「这一条」自己的 DOM
                text: fullText.substring(0, 60),
                fullText: fullText,
            });
        });
    }else if (currentWebsite==='豆包') { // 针对豆包
        const elements = document.querySelectorAll(currentCfg.selector); // 拿全部
        const replyEls = currentCfg.replySelector ? document.querySelectorAll(currentCfg.replySelector):null;
        const locationElements = document.querySelectorAll(currentCfg.copyLocationSelector);
        const maxAttempts = Math.round(elements.length/currentCfg.step);
        for (let i = 0; i < maxAttempts; i++) {
            const idx= (currentCfg.reverseOrder? elements.length-1-i : i);
            const userEl = elements[idx];
            initUniversalCollapsible(userEl)
            const fullText = userEl?.textContent?.trim() || `项目 ${i + 1}`;
            const displayText = fullText.substring(0, 60);
            contents.push({
                element: userEl,
                locationElement: locationElements[currentCfg.calReplyIndex(idx)],
                copyBtn: currentCfg.copySelector,
                replyEl: replyEls?replyEls[idx]:null,
                displayIndex: i + 1,
                text: displayText,
                fullText: fullText,
            });
        }
    }else if(currentWebsite==='DeepSeek'){
        let selector = null;
        if (document.querySelector('div[style^="--scroll-nav-page-padding"] .ds-scroll-area:not(.czx)')) {
            await cloneDeepseek();
            selector=currentCfg.virtualSelector;
        }else{
            selector=currentCfg.selector;
        }
        const rawElements = document.querySelectorAll(selector); // 拿全部
        const elements = Array.from(rawElements).filter(element => {
            // 查找最近的 div[data-virtual-list-item-key] 父元素
            const virtualListItem = element.closest('div[data-virtual-list-item-key]');
            
            // 如果找不到该父元素，保留该元素
            if (!virtualListItem) {
                return true;
            }
            
            // 检查该父元素是否包含 .ds-message > .ds-markdown 子元素
            const hasMarkdown = virtualListItem.querySelector('.ds-message > .ds-markdown');
            
            // 如果包含，则剔除该元素（返回 false）；否则保留（返回 true）
            return !hasMarkdown;
        });
        const replyEls = currentCfg.replySelector ? document.querySelectorAll(currentCfg.replySelector):null;
        const copyElements = document.querySelectorAll(currentCfg.copySelector);
        const maxAttempts = Math.round(elements.length/currentCfg.step);
        for (let i = 0; i < maxAttempts; i++) {     // i是当前尝试的次数，从0开始
            // 显示用截断文本，保存完整文本用于复制
            const idx= (currentCfg.reverseOrder? elements.length-1-i : i) *currentCfg.step;
            const userEl = elements[idx];
            const copyBtn=copyElements[currentCfg.calReplyIndex(idx)];
            initUniversalCollapsible(userEl)
            let fullText = userEl.textContent?.trim() || `项目 ${i + 1}`;
            const displayText = fullText.substring(0, 60);
            // addFloatingNumber(userEl, i+1);
            contents.push({
                element: userEl,
                copyBtn: copyBtn,// 向下取整
                replyEl: replyEls?replyEls[currentCfg.calReplyIndex(idx)]:null,
                displayIndex: i + 1,
                text: displayText,
                fullText: fullText,
            });
        }
    }else if(currentWebsite==='ChatGPT' && document.querySelector('.fixed .items-start')) { // 针对ChatGPT的虚拟加载版本
        const hoverElement = document.querySelector(".fixed .items-start");
        const observer = new MutationObserver(() => {
            const menu = hoverElement.children[1]; // 第二个子元素，也就是目录框
            if (menu) {
                // 让它存在于 DOM 中，但不可见
                menu.style.visibility = "hidden";
                menu.style.opacity = "0";
                menu.style.pointerEvents = "none";
                observer.disconnect();
            }
        });

        observer.observe(hoverElement, {
            childList: true
        });

        // 触发 mouseover，使目录框开始构建/渲染
        hoverElement.dispatchEvent(new MouseEvent("mouseover", {
            bubbles: true,
            cancelable: true,
            view: window
        }));

        // 1 秒后模拟鼠标离开，让原本的逻辑自动销毁目录框
        setTimeout(() => {
            hoverElement.dispatchEvent(new MouseEvent("mouseout", {
                bubbles: true,
                cancelable: true,
                view: window,
                relatedTarget: document.body
            }));

            hoverElement.dispatchEvent(new MouseEvent("mouseleave", {
                bubbles: false,
                cancelable: true,
                view: window,
                relatedTarget: document.body
            }));
        }, 1000);
        await new Promise(r => setTimeout(r, 250));
        const elements = hoverElement.children[0].querySelectorAll('button'); // 拿全部
        const replyEls = currentCfg.replySelector ? document.querySelectorAll(currentCfg.replySelector):null;
        const copyElements = document.querySelectorAll(currentCfg.copySelector);
        const maxAttempts = Math.round(elements.length/currentCfg.step);
        for (let i = 0; i < maxAttempts; i++) {     // i是当前尝试的次数，从0开始
            // 显示用截断文本，保存完整文本用于复制
            const idx= (currentCfg.reverseOrder? elements.length-1-i : i);
            const userEl = elements[idx];
            const copyBtn=copyElements[currentCfg.calReplyIndex(idx)];
            // initUniversalCollapsible(userEl)
            let fullText = userEl.getAttribute('aria-label')?.trim() || `项目 ${i + 1}`;
            const displayText = fullText.substring(0, 60);
            // addFloatingNumber(userEl, i+1);
            contents.push({
                element: userEl,
                copyBtn: copyBtn,// 向下取整
                replyEl: replyEls?replyEls[currentCfg.calReplyIndex(idx)]:null,
                displayIndex: i + 1,
                text: displayText,
                fullText: fullText,
            });
        }
        // console.log('GPT内容', contents);
        

    }else{
        // 通用抓取策略
        const elements = document.querySelectorAll(currentCfg.selector); // 拿全部
        const replyEls = currentCfg.replySelector ? document.querySelectorAll(currentCfg.replySelector):null;
        const copyElements = document.querySelectorAll(currentCfg.copySelector);
        const maxAttempts = Math.round(elements.length/currentCfg.step);
        
        // console.log('maxAttempts:', copyElements);
        for (let i = 0; i < maxAttempts; i++) {     // i是当前尝试的次数，从0开始
            // 显示用截断文本，保存完整文本用于复制
            const idx= (currentCfg.reverseOrder? elements.length-1-i : i) *currentCfg.step;
            const userEl = elements[idx];
            const copyBtn=copyElements[currentCfg.calReplyIndex(idx)];
            if (currentWebsite!=='Gemini' && currentWebsite!=='智谱清言' &&
                currentWebsite!=='千问') initUniversalCollapsible(userEl)
            let fullText = userEl.textContent?.trim() || `项目 ${i + 1}`;
            fullText=fullText.replace(/^You said\s*/i, '');
            fullText=fullText.replace(/^你说 \s*/i, '');
            fullText = fullText.replace(/\s*编辑  复制  分享.*$/, '');
            const displayText = fullText.substring(0, 60);
            // addFloatingNumber(userEl, i+1);
            contents.push({
                element: userEl,
                copyBtn: copyBtn,// 向下取整
                replyEl: replyEls?replyEls[currentCfg.calReplyIndex(idx)]:null,
                displayIndex: i + 1,
                text: displayText,
                fullText: fullText,
            });
        }
    }
    // console.log('getContents:', contents);
    return contents;
}

// #region 获取回复内容
async function getReply(idx,single=false,isScroll=false) {
    let reply = '';
    if (currentCfg.replySelector) {
        const replyEl=currentContents[idx].replyEl;
        // if (!replyEl) return '';
        console.log('获取回复', idx,isScroll);
        if (isScroll && currentWebsite!=='DeepSeek' && currentWebsite!=='ChatGPT'){
            scrollToElement(currentContents[idx].replyEl,'auto','center')
        }

       if(currentWebsite==='DeepSeek'){
            if (document.querySelector('div[style^="--scroll-nav-page-padding"] .ds-scroll-area:not(.czx)')){
                currentContents[idx].element.click(); // 先点击展开回复，再抓取内容
                await new Promise(r => setTimeout(r, 200));
                const elements = document.querySelectorAll(currentCfg.replySelector);
                let newReplyEl = null;
                for (const element of elements) {
                    // 获取元素相对于视口的top偏移量
                    const top = element.getBoundingClientRect().top;
                    
                    // 检查top是否大于0，找到后立即终止循环
                    if (top > 0) {
                        newReplyEl = element;
                        break; // 找到第一个符合条件的，无需继续遍历
                    }
                }
                console.log('找到的回复元素:', newReplyEl);
                reply = convertDeepSeek(newReplyEl);
            }else{
                reply = convertDeepSeek(replyEl);
            }
        }else if(currentWebsite==='ChatGPT'){
            currentContents[idx].element.click(); // 先点击展开回复，再抓取内容
            await new Promise(r => setTimeout(r, 1000));                    // 等待回复元素加载，ChatGPT的回复元素通常在问题元素之后不远处
            const elements = document.querySelectorAll(currentCfg.replySelector);
            let newReplyEl = null;
            for (const element of elements) {
                // 获取元素相对于视口的top偏移量
                const top = element.getBoundingClientRect().top;
                
                // 检查top是否大于0，找到后立即终止循环
                if (top > 0) {
                    newReplyEl = element;
                    break; // 找到第一个符合条件的，无需继续遍历
                }
            }
            reply = convertChatGPT(newReplyEl); 
        }else if(currentWebsite==='Grok'){
            reply = convertDeepSeek(replyEl); 
        }else if (currentWebsite==='Gemini'){
            reply = convertGemini(replyEl);
        }else if(currentWebsite==='Kimi'||currentWebsite==='千问'){
            reply = convertKimi(replyEl); 
        }else if(currentWebsite==='豆包'){
            reply = convertDoubao(replyEl); 
        }else{
            reply = convertYuanbao(replyEl); 
        }
        reply=correctMarkdownList(reply);
        // console.log('reply',reply)
        return reply;
    }
    if (!currentCfg || !currentCfg.copySelector) return '';
    let copyButtonEl = null;
    if (currentWebsite==='AIstudio'){
        const elements = document.querySelectorAll(currentCfg.selector); // 拿全部
        console.log('elements:',elements);
        let k=-1;
        let el3=null
        for (let i = 0; i < elements.length-2; i++){
            const el1=elements[i]
            const el2=elements[i+1]
            el3=elements[i+2]
            if (el1.querySelector('[data-turn-role="User"]') && el2.querySelector('[data-turn-role="Model"]')){
                k=k+1;
                if (el3.querySelector('[data-turn-role="Model"]')){ // 回复消息存在
                    if (k===idx){
                        break;
                    }
                }else{                  // 回复消息不存在
                    if (k===idx){
                        return '';
                    }
                }
            }
        }
        const option= el3.querySelector('button[aria-label="Open options"]');;
        option.dataset.aiCopying = '1';
        option.click();
        setTimeout(() => delete option.dataset.aiCopying, 100);
        copyButtonEl=document.querySelector('[id^="mat-menu-panel-"] > div > button:nth-child(4)');
        copyButtonEl.dataset.aiCopying = '1';
        copyButtonEl.style.backgroundColor = 'rgba(250, 131, 135, 0.56)';
        copyButtonEl.style.boxShadow = '0 0 0 2px rgb(250, 131, 135)';
        if (!single) await new Promise(r => setTimeout(r, 2000));    // 只能手动点击了
        else await new Promise(r => setTimeout(r, 200));
    }else if (currentCfg.copyLocationSelector){ // 针对豆包
        scrollToElement(currentContents[idx].locationElement,'auto','center');
        await new Promise(r => setTimeout(r, 300));    // 等待滚动
        copyButtonEl = currentContents[idx].locationElement.querySelector(currentContents[idx].copyBtn);
        console.log('copyButtonEl:',copyButtonEl);
    }else{
        copyButtonEl = currentContents[idx].copyBtn;
    }
    if (!copyButtonEl) {console.log('目标按钮未找到');showTopToast(getI18nText('toast.save_reply_fail'));;return '';}

    copyButtonEl.dataset.aiCopying = '1';
    // if (currentCfg.replySelector){
    //     scrollToElement(copyButtonEl,'auto','center');
    //     console.log(copyButtonEl)
    //     await new Promise(r => setTimeout(r,200));
    //     triggerPhysicalClick(copyButtonEl)
    // }else 
    if(currentWebsite!=='AIstudio'||single) { // 如果是其他网站或者是单点AIstudio
        await new Promise(r => setTimeout(r, 50));
        copyButtonEl.click();
    }

    await new Promise(r => setTimeout(r, currentCfg.copyDelay||50));     // 写入剪切板的缓冲时间！不然Gemini读取会错乱

    try {
        reply = await navigator.clipboard.readText();
        // console.log('剪贴板读取完毕',reply);
        // const a=document.createElement('a'); 
        // a.href=URL.createObjectURL(new Blob([JSON.stringify({reply})],{type:'application/json'})); 
        // a.download='回复内容.json'; a.click(); 
    } catch (e) {
        console.log('读取剪贴板失败:', e);
        showTopToast(getI18nText('toast.save_reply_fail'));
    } finally {
        // 延迟 0 ms 只是放事件循环末尾，可视情况再延长
        setTimeout(() => delete copyButtonEl.dataset.aiCopying, 2500);
    }
    return convertLatexDelimiters(reply);
}
// 返回当前目录里用户能看到的所有行的原始索引（Set）
function getVisibleRealIdxs() {
    const displayContents = filterFavMode
      ? currentContents.filter(item => currFavSet.has(item.displayIndex - 1))   // 选择currentContents里displayIndex-1在currFavSet里的项
      : currentContents;    // 若未开启筛选：显示所有目录项
    return new Set(displayContents.map(item => item.displayIndex - 1));// 返回displayContents里每个项的displayIndex-1（原始索引）
}


function convertLatexDelimiters(text) {
    // 1. 使用正则表达式将文本切分为数组
    // (```[\s\S]*?```) 是一个捕获组，这意味着 split 会保留代码块内容在数组中
    // 数组结构将变为：[普通文本, 代码块, 普通文本, 代码块, ...]
    const parts = text.split(/(```[\s\S]*?```)/g);

    // 2. 遍历数组，只处理偶数索引（普通文本），跳过奇数索引（代码块）
    for (let i = 0; i < parts.length; i++) {
        // i % 2 === 0 代表这是普通文本部分
        if (i % 2 === 0) {
            let segment = parts[i];

            // === 在这里执行原本的所有处理逻辑 ===

            // 1. 缩进处理：将每行开头的4个空格替换为3个空格
            segment = segment.replace(/^ {4,}/gm, '   ');

            // 2. LaTeX 替换逻辑
            // 替换 \[ 为 $$
            segment = segment.replace(/(\r\n)+\s*\\\[\s*(?:\r\n)+/g, '\r\n\r\n$$$'); 
            
            // 替换 \] 为 $$
            segment = segment.replace(/(\r\n)+\s*\\\](?:\r\n)*/g, '$$$\r\n\r\n');
            
            // 替换 \( 和 \)
            segment = segment.replace(/\\\(\s*/g, '$');
            segment = segment.replace(/\s*\\\)/g, '$');
            
            // 3. 针对 ChatGPT 的特殊处理
            if (typeof currentWebsite !== 'undefined' && currentWebsite === 'ChatGPT') {
                segment = segment.replace(/(\r\n)+\s*\[\s*(?:\r\n)+/g, '\r\n\r\n$$$');
                segment = segment.replace(/(\r\n)+\s*\](?:\r\n)*/g, '$$$\r\n\r\n');
                segment = segment.replace(/\( /g, '$');
                segment = segment.replace(/ \)/g, '$');
            }
            
            // 4. 移除 $$ 内的换行符 (确保此函数存在或在此作用域可用)
            segment = removeReturnInsideTagsRegex(segment);

            // 将处理后的片段放回数组
            parts[i] = segment;
        } 
        // else: 如果 i 是奇数，说明 parts[i] 是代码块 (```...```)，直接保留原样，不做任何修改
    }

    // 3. 将数组重新合并为字符串
    return parts.join('');
}
function removeReturnInsideTagsRegex(str) {
    // \$\$ 转义匹配 $$
    // ([\s\S]*?) 捕获中间的所有字符（包括换行），非贪婪模式
    return str.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
        // match 是完整的 "$$...\r\n...$$"
        // content 是中间捕获的 "...\r\n..."
        
        // 删除 content 中的 \r\n，然后重新包上 $$ 返回
        return '$$' + content.replace(/\r\n/g, '') + '$$';
    });
}
function correctMarkdownList(text){
    const parts = text.split(/(```[\s\S]*?```)/g);
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
            let segment = parts[i];
            segment=spaceProcess(segment);
            parts[i] = segment;
        }
    }
    return parts.join('');
}
/**
 * Markdown 无序列表缩进纠正函数
 * @param {string} mdContent - 原始 Markdown 文本
 * @returns {string} - 纠正后的 Markdown 文本
 */
function spaceProcess(mdContent) {
    const lines = mdContent.split('\n');
    const correctedLines =[];
    
    // -1: 上一行不是列表
    // 0: 一级列表
    // 1: 二级列表
    let prevLevel = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 检查是否为列表项 (匹配以任意数量空格开头，紧跟一个 * 号且后面不是 * 号的行)
        const match = line.match(/^(\s*)\*(?!\*)(.*)/);
        if (match) {
            // --- 是列表项，进行层级计算 ---
            const rawSpacesStr = match[1];
            const content = match[2].trim(); 
            const rawSpaceCount = rawSpacesStr.length;
            
            let currentLevel = 0;

            if (rawSpaceCount <= 2) {
                // 规则：空格 <= 2 -> Level 0
                currentLevel = 0;
            } else {
                // 规则：空格 > 2 -> 估算层级
                let estimatedLevel = Math.floor((rawSpaceCount + 1) / 4); // 简单估算：4空格为一级

                if (prevLevel === -1) {
                    // [Bug修正点]：如果是新列表的第一行，必须强制恢复为 0 级！
                    // 不能保留原有的 4 个或以上空格，否则 Markdown 引擎会将其渲染为缩进代码块。
                    currentLevel = 0;
                } else {
                    // 限制跳级：最多比上一级深 1 级
                    // 例如：上一行是 0 级，这一行缩进再多也只能是 1 级
                    currentLevel = Math.min(estimatedLevel, prevLevel + 1);
                }
            }

            // 生成新行
            const newIndent = ' '.repeat(currentLevel * 4);
            correctedLines.push(`${newIndent}* ${content}`);

            // 更新状态
            prevLevel = currentLevel;

        } else {
            // --- 不是列表项 ---
            
            // 将普通文本行行首的 4 个空格替换为 3 个空格，防止被意外渲染为代码块
            correctedLines.push(line.replace(/^ {4}/gm, '   '));

            // 只有当这一行是“非空文本”时，才重置状态，代表列表断开
            if (line.trim() !== '') {
                prevLevel = -1;
            }
        }
    }

    return correctedLines.join('\n');
}


/**********************************************************************************************************
// #region 收藏逻辑
 **********************************************************************************************************/
async function toggleFav(idx) {
    const url  = location.href;
    favData=await readFav();    // 从存储中读取数据
    let checkReply = false;
    let question = '';
    let reply = '';
    let findItem = Object.values(favData.items).find(item => item.url === url);
    let targetItem = Object.values(favData.items).find(item => item.url === url);
    if(!targetItem) {   // 初始化数据
        const newId = generateId();
        const newItem = {
            [newId]: {      // 用方括号动态创建属性名
                id: newId,
                name: cleanPageName(),
                url: url,
                parentId: null,
                data:[]
            }
        };
        favData.items = favData.items || {};        // 确保 items 存在
        favData.items[newId] = newItem[newId];;     // 合并旧的 items 和 新的 item
        targetItem = favData.items[newId];
    }
    const length0 = targetItem.data.length; // 先记录变更前的收藏数量
    const pos = targetItem.data.findIndex(pair => pair[0] === idx); // 找到当前 idx 在数组中的位置
    let hasFav=false;
    if (targetItem.data && targetItem.data.some(pair => pair[1] === currentContents[idx].fullText.substring(0, 500))) {hasFav=true;}

    if (!hasFav) {                   // 未收藏 → 收藏：需要抓取文本
        question = currentContents[idx].fullText.substring(0, 500) || '';
        reply = await getReply(idx,true);    // 抓取回复内容，single=true表示单条抓取，不是批量抓取
        if (reply && reply.length > EXTRA_THRESHOLD) {
            const refKey = `${targetItem.id}-${idx}-extra`;
            targetItem.data.push([idx, question, `__REF__${refKey}`]);
            checkReply = true;
        }else{
            targetItem.data.push([idx, question, reply]);                 // 新增 [idx,text]
        }
        
    } else {
        if (targetItem.data && targetItem.data[pos][2]){
            checkReply = targetItem.data[pos][2].startsWith('__REF__');
        }
        targetItem.data.splice(pos, 1);     // 已收藏 → 取消
    }
    const length1 = targetItem.data.length; // 变更后

    if (length0 === 0 && length1 === 1 && !findItem){               // 新增第一条收藏，排除收藏夹面板中收藏的项
        bookmarkManager.showNewItemModal(targetItem,reply);          // 调用bookmarkManager的方法，显示新增收藏项弹窗,同时存储和更新UI，也会更新currFavSet
        await new Promise(resolve => setTimeout(resolve, 100));
    }else if (length0 === 1 && length1 === 0) {                     // 删除最后一条收藏
        console.log('删除收藏项');
        await bookmarkManager.deleteItem(targetItem.id);            // 调用bookmarkManager的方法，删除收藏项,同时存储和更新UI，也会更新currFavSet
        await new Promise(resolve => setTimeout(resolve, 100));
    }else{
        targetItem.data.sort((a, b) => a[0] - b[0]); // 按 idx 升序排列
        await writeFav(FAV_KEY,favData);            // 写入数据
        bookmarkManager.data = favData;             // 更新 BookmarkManager 的数据
        // 更新UI
        refreshDirectoryStar(url,idx,pos===-1);     // 更新目录面板的星标状态,同时更新currFavSet
        updatehasFavBtn(url,length1 > 0);        // 控制顶部按钮 disabled
        toggleHistoryStar(url, length1 > 0);      // 更新历史列表的星标状态
        if (checkReply) {                           // 收藏的是引用回复
            const rwKey=`largeContents.__REF__${targetItem.id}-${idx}-extra`;
            console.log('rwKey',rwKey);
            if (!hasFav){        // 新建收藏
                await writeFav(rwKey,reply);
                showTopToast(getI18nText('toast.bookmark_success'));
            }else{
                idbRemove(rwKey); 
            }
        }
    }
    // console.log('toggleFavend',favData,bookmarkManager.data);
    setTimeout(async() => await initStarHistoryPreview(), 200);// ✅ await刷新历史记录预览
    if (filterFavMode) {            // 如果当前处于“只看收藏”模式
        const visibleSet = getVisibleRealIdxs();
        if (visibleSet.size === 0) {
            filterFavMode = false;      // 退出收藏筛选
        }
        updateSelectAllState();        // ✅ 全选框状态
        generateDirectory();          // 重新渲染目录列表，确保当前筛选状态下的显示正确
    }
}
// 更新受是否有收藏影响的按钮状态
function updatehasFavBtn(url,hasFav=false) {
    if (url !== location.href) return;
    // const btn = document.querySelector('.filter-fav-btn');
    document.querySelector('.filter-fav-btn').classList.toggle('active', filterFavMode);  // 控制按钮是否激活：根据 filterFavMode 状态切换激活样式，控制按钮亮不亮
    document.getElementById('totalNum').closest('.layer').classList.toggle('has-fav', hasFav);

    // if (currentWebsite!=='PreviewHtml' && currentWebsite!=='MindMapHtml'){
    //     document.querySelector('.preview-btn').disabled = !hasFav;   // 控制按钮是否禁用：当没有任何收藏项时，按钮禁用，控制能不能点击
    //     document.querySelector('.mindMap-btn').disabled = !hasFav; 
    // }
}


// 一键同步目录面板中的所有星星
function refreshDirectoryStar(url,idx,hasFav=false) {
    console.log('idx',idx)
    if (url !== location.href||idx===-1) return;
    if (idx==='all'){
        currFavSet=new Set();
        const stars = document.querySelectorAll('.star');
        stars.forEach(star => {
            star.classList.toggle('fav', false);
        });
    }else{
        currFavSet.has(idx) ? currFavSet.delete(idx) : currFavSet.add(idx);
        const innerStar = document.querySelector(`.star[data-real-idx="${idx}"]`);
        innerStar.classList.toggle('fav', hasFav);
    }
    currentContents.forEach((item,idx) => {
        item.element.classList.toggle('fav-answer', currFavSet.has(idx));  // 控制元素是否有 has-fav 类：根据 hasFav 状态切换类
    })
}


/**********************************************************************************************************
// #region 读写逻辑
 **********************************************************************************************************/
// 读取收藏数据
async function readFavItem(url){
    favData = bookmarkManager.data || await readFav();
    if (!favData || !favData.items) {
        return {}; 
    }
    const targetItem = Object.values(favData.items).find(item => item.url?.includes(url));
    return targetItem || {};
}

async function readFav(key=FAV_KEY) {
    try {
        const result = await idbGet([key]);       // 读取收藏数据
        return result;
    } catch (e) {
        console.log('[AI-Contents] 读取收藏数据失败:', e);
    }
}

// 在writeFav函数开头添加同样的检查
async function writeFav(key=FAV_KEY,Data) { 
    try {
        await idbSet({[key]: Data });

    } catch (e) {
        console.log('[AI-Contents] 写入收藏数据失败:', e);
    }
}

// 获取当前页面的收藏索引集合
async function getCurrFavSet() {
    const url = location.href;
    if (currentCfg.ishomePage()) return new Set();
    if (currentWebsite === 'PreviewHtml'&& currentWebsite === 'MindMapHtml') {
        return currFavSet;
    }else{
        const pageData = await readFavItem(url);
        if (!pageData || !pageData.data) {
            return new Set();
        }
        return new Set(pageData.data.map(pair => pair[0]));
    }
}


function generateId() { // 生成唯一ID
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 去除页面名称中的平台后缀
function cleanPageName(pageName=null) {
    if (!pageName) pageName = document.querySelector('span.conversation-title.gds-title-m')?.textContent||document.title || '';
    
    const platformSuffixes = [
        ' - DeepSeek',
        ' - 豆包', 
        ' - Kimi',
        ' - 通义',
        ' - 腾讯元宝',
        ' - 文心一言',
        ' - 秘塔',
        ' - 知乎直答',
        ' - Gemini',
        ' - 智谱清言',
        ' - Qwen',
        ' - Grok',
        ' - ChatGPT',
        ' | Google AI Studio',
    ];
    
    let cleanedName = pageName;
    for (const suffix of platformSuffixes) {
        if (cleanedName.endsWith(suffix)) {
            cleanedName = cleanedName.slice(0, -suffix.length);
            break; // 找到一个就退出
        }
    }
    return cleanedName;
}


/**********************************************************************************************************
//#region 生成目录：检测页面变化 → 更新原始数据 → 筛选要显示的内容 → 渲染目录列表 → 同步数量显示
**********************************************************************************************************/
async function checkContent(max = 100) {
    if (currentCfg.ishomePage()) return;
    checkContent.retry = (checkContent.retry || 0) + 1;

    currentContents = await getContents();
    // console.log(currentContents,`第 ${checkContent.retry} 次检测，抓取到 ${currentContents.length} 条内容`);

    if (currentContents.length > 0) {
        checkContent.retry = 0;            // 成功后重置
        generateDirectory(true);
        return;
    }

    if (checkContent.retry >= max) {
        checkContent.retry = 0;            // 防内存泄漏
        console.log('递归检测失败：已达最大重试次数', max);
        // 可选：降级处理或 reject Promise
        return;
    }

    setTimeout(() => checkContent(max), 200);
}

async function generateDirectory(forceRefresh = false) {
    if (currentWebsite==='Gemini') {
        if (document.querySelector('.conversation-title-container')) {
            document.title=document.querySelector('.conversation-title-container').textContent;
        }else{
            const root = getStarScanRoot();
            const allItems = Array.from(root.querySelectorAll(currentCfg.historyItemSelector));
            const target = allItems.find(a => location.href.includes(getUrlKey(a)));
            if (target) document.title=target.textContent;
        }
    }
    if (currentCfg.inputSelector){
        bindBottomToggle(currentCfg.inputSelector);
    }
    if (forceRefresh || currentContents.length === 0) {
        currentContents = await getContents();
    }
    if (currentWebsite!=='Kimi' && currentWebsite!=='ChatGPT') {
        bookmarkManager.mountToContainer(currentCfg.historyListSelector);
    }
    // console.log('目录生成开始',currFavSet);
    let displayContents = currentContents;                  // 默认全部
    if (filterFavMode) {                                    // 如果开启了“只看收藏”
        displayContents = currentContents.filter(
            item => currFavSet.has(item.displayIndex - 1)
        );
    }

    const fragment = document.createDocumentFragment();
    const pageData = Object.values(bookmarkManager.data.items)
            .find(item => item.url && item.url.split('?')[0] === location.href.split('?')[0]);
    displayContents.forEach((item) => {     // 遍历可见项
        const realIdx = item.displayIndex - 1;
        const li = document.createElement('li');    // 创建目录项
        li.className = 'directory-item';
        if (realIdx === activeItemIndex) li.classList.add('active');
        if (selectedItems.has(realIdx)) li.classList.add('selected');

        
        const fullText = item.fullText || item.text || '';
        let hsaFav=false;
        // 对于懒加载的网站，生成目录时依靠idx给目录加⭐不可靠
        if (pageData && pageData.data && pageData.data.some(pair => pair[1] === fullText.substring(0, 500))) {hsaFav=true;}
        li.innerHTML = `
            <div class="item-checkbox" data-real-idx="${realIdx}"></div>
            <span class="AIitem-number">${item.displayIndex}</span>
            <span class="item-text">${escapeHtml(fullText)}</span>
            <span class="star ${hsaFav?'fav':''}" data-real-idx="${realIdx}">★</span>
        `;
        fragment.appendChild(li);
        item.element.classList.toggle('fav-answer', hsaFav); // 同步DOM状态
    });

    directoryList.innerHTML = '';
    directoryList.appendChild(fragment);

    /* 后置检测：给已出现省略号的项补预览功能 */
    directoryList.querySelectorAll('.directory-item').forEach(li => {
        const textSpan = li.querySelector('.item-text');
        if (textSpan.offsetWidth < textSpan.scrollWidth) {   // 关键判断
            const fullText = textSpan.textContent;           // title 已存完整文本
            li.insertAdjacentHTML('beforeend',              // 在当前元素的内部结尾插入（作为最后一个子节点）
            `<div class="full-text-cache" style="display:none;">${escapeHtml(fullText)}</div>`);
            li.dataset.canPreview = '1';
        }
    });

    totalNumEl.innerText = currentContents.length;
    updatehasFavBtn(location.href,currFavSet.size > 0);  // 更新“只看收藏”按钮状态
    updateSelectionUI();
    
    if (currentWebsite!=='MindMapHtml') {
        setTimeout(() => {
            updateCurrentIndex();
        }, 500); 
    };
    // console.log('目录生成完成');
}
// 把 < > & " ' 转成实体字符，防止被当成 HTML 解析
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 通用的面板动画控制函数
function setPanelAnimation(animating) {
    if (animating) {
        directoryPanel.classList.add('animating');
    } else {
        directoryPanel.classList.remove('animating');
    }
}

function startPanelAnimation(callback) {
    setPanelAnimation(true);    // 添加animating类，禁用交互
    if (callback) callback();   // 执行传入的回调
    setTimeout(() => setPanelAnimation(false), 400);  // 400ms后移除animating类，恢复交互
}



/**********************************************************************************************************
// #region 问答对话打开
 **********************************************************************************************************/
/**
 * 在新标签页中打开Markdown预览
 * @param {Array<Object>} qaData - 问答数据数组
 * @param {string} options.pageTitle - 可选：页面标题
 * ① 直接在预览页面打开
 * ② 从网页中获取数据，然后打开预览页面
 * ③ 在思维导图页面将问答数据加载到卡片坞
 * ④ 从网页中获取数据，然后在新建思维导图页面加载
 */

async function openQAdata(qaData,fileName='AI对话记录',action='markdown',sidebar,href='') {
    // 参数验证
    if (!Array.isArray(qaData) || (qaData.length === 0 && action ==='markdown')) {
        showTopToast(getI18nText('toast.no_bookmark_page'),2500);
        return false;
    }
    // if (!isJihuo) {showTopToast('⚠️ 仅限付费用户使用~',2500);return;}
    isJihuo = await checkUIMM3();if (!isJihuo) {return;}

    // 数据预处理
    const processedData = qaData.map((item, index) => {
        if (!item.question || !item.answer) {
            console.log(`[MarkdownPreview] 数据项 ${index} 缺少 question 或 answer 字段`);
        }
        return {
            question: String(item.question || ''),
            answer: String(item.answer || '')
        };
    });
    try {
        // 打开预览窗口
        let win=null;
        if (action === 'markdown'){
            if (location.href.includes('preview.html')&&!sidebar) { // 如果已经打开了preview.html，并且不是打开侧边栏
                try{
                    renderDialogue(qaData,fileName,href);     // 如果已经打开了preview.html，直接渲染
                    // document.title = fileName;
                    // sessionStorage.setItem('previewPageTitle', fileName);
                }catch(e){
                    console.log('[MarkdownPreview] 渲染问答对话失败:', e);
                }
            }else{
                await chrome.storage.local.set({ 'markdownPreviewData': processedData,'previewPageTitle': fileName,'markdownHref':location.href});// 防止刷新后数据丢失
                if (sidebar) {
                    chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL',path:'HTML/preview.html?view=sidepanel'});
                }else{
                    const previewUrl = chrome.runtime.getURL('HTML/preview.html');
                    win = window.open(previewUrl, '_blank');
                    if (!win) {
                        console.log('[MarkdownPreview] 弹窗被浏览器阻止');
                        return false;
                    }
                }
                
            }
        }else if(action ==='mindmap'){  // 将问答数据加载到思维导图的卡片坞
            if (location.href.includes('MindMap.html')) {
                try{
                    updateDockData(qaData);     // 如果已经打开了MindMap.html，直接渲染
                }catch(e){
                    console.log('[newMindMap] 渲染问答对话失败:', e);
                }
            }else{
                await chrome.storage.local.set({ 'DockData': processedData, 'currentFileID': null, 'MindMapAction': 'new' ,'fileName':fileName});// 防止刷新后数据丢失
                if (sidebar) {
                    chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL',path:'HTML/MindMap.html?view=sidepanel'});
                }else{
                    const previewUrl = chrome.runtime.getURL('HTML/MindMap.html');
                    win = window.open(previewUrl, '_blank');
                    if (!win) {
                        console.log('[newMindMap] 弹窗被浏览器阻止');
                        return false;
                    }
                }
                
            }
        }
        return true;

    } catch (error) {
        console.log('[openQAdata] 打开预览失败:', error);
        
        // 特定错误处理
        if (error.name === 'QuotaExceededError') {
            alert('数据太大，无法预览。请减少内容或分批预览。');
        } else if (error.name === 'SecurityError') {
            alert('安全限制：无法在当前上下文中打开预览。');
        }
    }
}


/**
 * 组装当前页面收藏为问答数组
 * @returns {Promise<Array<{question:string, answer:string}>>}
 */
async function buildQAList(targetItem) {
    if (!targetItem || !targetItem.data || targetItem.data.length === 0) return [];
    console.log('buildQAList',targetItem);
    // 2. 并发把每条收藏转换成 {question, answer}
    const qaPromises = targetItem.data.map(async ([idx, q, a]) => {
        let answer = a || '';
        // 3. 识别引用链接
        if (answer.startsWith('__REF__')) {
            const refKey = `largeContents.__REF__${targetItem.id}-${idx}-extra`;
            try {
                answer = await idbGet([refKey]) || ''; // 兼容两种存储路径
            } catch (e) {
                console.log('[buildQAList] 读取引用失败:', refKey, e);
                answer = '';
            }
        }
        return { question: q || '', answer};
    });

    return Promise.all(qaPromises);
}



/**********************************************************************************************************
// #region 气泡预览逻辑
 **********************************************************************************************************/
function generateToC(headings) {
    const ul = document.createElement('ul');
    ul.className = 'ai-toc-list';
    
    // 【关键修复 1】动态寻找当前内容里的最小层级（例如最小是H3，就把H3当作一级标题展示）
    let minLevel = 6;
    headings.forEach(h => {
        const level = parseInt(h.tagName.substring(1));
        if (level < minLevel) minLevel = level;
    });

    headings.forEach(h => {
        const originalLevel = parseInt(h.tagName.substring(1)); 
        // 将层级拉平，无论模型怎么偷懒，最外层永远靠左显示，拒绝大片空白
        const level = originalLevel - minLevel + 1; 
        
        const li = document.createElement('li');
        li.className = `toc-item toc-level-${Math.min(level, 6)}`;
        li.textContent = h.textContent;
        li.title = h.textContent; // 超出截断时，原生的提示
        
        // 绑定点击事件进行页面内滚动定位
        li.onclick = (e) => {
            e.stopPropagation();
            scrollToElement(h, currentSettings.enableScrollSmooth ? 'smooth' : 'auto', 'start');
        };
        ul.appendChild(li);
    });
    return ul;
}

// 覆写原有的鼠标移入事件
function handleEnter(e) {
    if (directoryPanel.classList.contains('animating')) return;
    
    const item = e.target.closest('.directory-item');   
    if (!item) return;

    // 【关键修复 2】防止鼠标在目录项的子元素(文本/checkbox)间移动时重复触发渲染
    if (e.relatedTarget && item.contains(e.relatedTarget)) return;

    // 绝对清除上一次的隐藏定时器
    clearTimeout(item_preview_leaveTimer);

    const contentBox = directPreviewBox.querySelector('.ai-preview-content');
    
    const realIdx = Number(item.querySelector('.item-checkbox').dataset.realIdx);
    let replyEl = null;

    const realElements=Array.from(document.querySelectorAll(currentCfg.selector));
    let hoverElement = null;    // 悬停目录项对应的元素
    for (let i = 0; i < realElements.length; i++) {
        if (realElements[i].textContent.trim() === currentContents[realIdx].fullText) {
            hoverElement = realElements[i];
            break; // 找到后立即退出循环
        }
    }
    if (hoverElement){
        const replyElements = document.querySelectorAll(currentCfg.replySelector);   // 抓取加载出来的所有回复元素
        const bottom = hoverElement.getBoundingClientRect().bottom;             // 悬停元素的底部坐标
        for (const element of replyElements) {
            // 获取元素相对于视口的top偏移量
            const top = element.getBoundingClientRect().top;                    // 回复元素的顶部坐标
            const gap= top - bottom;
            // 检查top是否大于0，找到后立即终止循环
            if (gap < 80 && gap > 0) {
                replyEl = element;
                break; // 找到第一个符合条件的，无需继续遍历
            }
        }
    }

    let hasToc = false;
    let tocElement = null;
    
    // 检查是否有 H 标签
    if (currentSettings.enableMdToc === true && replyEl) {
        const headings = replyEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const filteredHeadings = Array.from(headings).filter(el => !el.classList.contains('sr-only') );
        if (filteredHeadings.length > 0) {
            hasToc = true;
            tocElement = generateToC(filteredHeadings);
        }
    }

    if (hasToc) {
        contentBox.innerHTML = '';
        contentBox.appendChild(tocElement);
    } else {
        // 降级逻辑：显示完整问题 (只有超长截断时才弹气泡)
        if (!item.dataset.canPreview) {
            directPreviewBox.classList.remove('show'); // 发现不需要显示，主动关掉残留的气泡
            return; 
        }
        const fullTextEl = item.querySelector('.full-text-cache');
        if (!fullTextEl) return;
        contentBox.textContent = fullTextEl.textContent;
    }

    directPreviewBox.classList.add('show');
    void directPreviewBox.offsetHeight;               
    placeBubble(item.getBoundingClientRect());
}

// 覆写原有的鼠标离开事件
function handleLeave(e) {
    const item = e.target.closest('.directory-item');
    if (!item) return;

    // 【关键修复 3】防止鼠标在目录项的子元素内部滑动时错误触发离开事件
    if (e.relatedTarget && item.contains(e.relatedTarget)) return;

    // 【关键修复 4】必须先 clearTimeout！防止多重定时器叠加导致气泡闪退消失
    clearTimeout(item_preview_leaveTimer);
    
    item_preview_leaveTimer = setTimeout(() => {
        directPreviewBox.classList.remove('show');
    }, 300);
}
function placeBubble(itemRect) {
    const panelRect = directoryPanel.getBoundingClientRect();
    const gap = 8;
    const pad = 8;

    /* 水平 */
    const left = panelRect.left - directPreviewBox.offsetWidth - gap;

    /* 垂直理想值 */
    let top = itemRect.top + (itemRect.height - directPreviewBox.offsetHeight) / 2;
    const maxTop = window.innerHeight - directPreviewBox.offsetHeight - pad;
    const minTop = pad;
    top = Math.max(minTop, Math.min(maxTop, top));

    /* 三角形偏移：让箭头始终对准当前项中线 */
    const arrowOffset = (itemRect.top + itemRect.height / 2) - (top + directPreviewBox.offsetHeight / 2)-8;   // 修正箭头半径 4 px
    const arrow = directPreviewBox.querySelector('.ai-preview-arrow');
    arrow.style.transform = `translateY(${arrowOffset}px)`;

    /* 应用 */
    directPreviewBox.style.left = left + 'px';
    directPreviewBox.style.top  = top + 'px';
}



// 更新目录按钮上显示的条目数量
function updateDirectoryCount() {
}
/**********************************************************************************************************
// #region 全选按钮逻辑
 **********************************************************************************************************/
// 切换当前可见目录项的全选 / 全不选状态
function toggleSelectAll() {
    // 1. 当前用户能看到的行（受收藏筛选影响）
    const visibleSet = getVisibleRealIdxs();
  
    // 2. 这些行是否已经全部选中？
    const allVisibleSelected = [...visibleSet].every(idx => selectedItems.has(idx));// 可见项是否全部选中
  
    // 3. 切换：全选 ↔ 全不选
    if (allVisibleSelected) {
        // 如果可见项全部选中，点击全选按钮后取消选择所有可见项
        visibleSet.forEach(idx => selectedItems.delete(idx));
    } else {
        // 否则，选择所有可见项
      visibleSet.forEach(idx => selectedItems.add(idx));
    }
  
    // 4. 刷新 UI
    updateSelectionUI();    // 更新所有可见目录项的选中状态（如复选框、高亮样式等）
    updateSelectAllState(); // 更新全选复选框状态（受收藏筛选影响）
  }


function updateSelectionUI() {
    const selectionCount = document.querySelector('.selection-count .count-number');
    const copyBtn        = document.querySelector('.copy-selected-btn');
    const selectAllBox   = document.querySelector('.select-all-checkbox');

    /* 1. 更新顶部文案 & 按钮 */
    if (selectionCount) selectionCount.textContent = `${selectedItems.size}`;
    if (copyBtn)        copyBtn.disabled = selectedItems.size === 0;

    /* 2. 全选框状态 */
    if (selectAllBox && currentContents.length) {
        selectAllBox.classList.toggle('checked', selectedItems.size === currentContents.length);
    }

    /* 3. 逐行按「原始索引」回显选中 */
    document.querySelectorAll('.directory-item').forEach(tr => {
        const realIdx = Number(tr.querySelector('.item-checkbox').dataset.realIdx);
        tr.classList.toggle('selected', selectedItems.has(realIdx));
    });
}

// 更新「全选」复选框状态
function updateSelectAllState() {
    const visibleSet = getVisibleRealIdxs();
    const selectAllCheckbox = document.querySelector('.select-all-checkbox');
    if (!visibleSet.size) {                  // 空列表
        selectAllCheckbox.classList.remove('checked');
        return;
    }
    const allVisibleSelected = [...visibleSet].every(idx => selectedItems.has(idx));    // 可见项是否处于全选
    selectAllCheckbox.classList.toggle('checked', allVisibleSelected);
}

/**********************************************************************************************************
// #region 复制功能
 **********************************************************************************************************/
function copySelectedTitles() {
    if (selectedItems.size === 0) return;

    // 按显示顺序排序
    const sortedIndexes = Array.from(selectedItems).sort((a, b) => a - b);

    // 获取完整文本（不截断）
    const selectedTitles = sortedIndexes.map(index => {
        const item = currentContents[index];
        const fullText = item.fullText || getFullText(item) || '';
        return `${index + 1}. ${fullText}`;
    }).join('\n');

    navigator.clipboard.writeText(selectedTitles).then(() => {
        showCopySuccess();
        showTopToast(getI18nText('toast.copied_clipboard'));
    }).catch(err => {
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = selectedTitles;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showCopySuccess();
    });
}

// 获取完整文本（不截断）
function getFullText(item) {
    if (!currentCfg) return item.text;
    try {
        // console.log('item', item);
        if (currentCfg.useQuerySelectorAll) {
            const elements = document.querySelectorAll(currentCfg.selector);
            const index = currentCfg.reverseOrder ? elements.length - item.selectorIndex : item.selectorIndex - 1;
            const element = elements[index];
            return element?.textContent?.trim() || item.text;
        } else {
            const element = item.element;
            return element?.textContent?.trim() || item.text;
        }
    } catch (error) {
        return item.text;
    }
}

function showCopySuccess() {
    const copyBtn = document.querySelector('.copy-selected-btn');
    copyBtn.style.background = '#2bde73b5';

    setTimeout(() => {
        copyBtn.style.background = '';
    }, 2000);
}

/*********************************************************************************
// #region 历史列表加星
 * 1. 扫描范围：websiteConfigs 里当前站点对应的 historyListSelector（无配置则退化成 body）
 * 2. 文本定位：递归找真正包含文本的 Text 节点，保证星星紧贴文字，无多余空格
 * 3. 性能：一次遍历 + 哈希查询，O(n) ；实时事件仅对单条链接操作
 *********************************************************************************/

// 获取扫描根节点
function getStarScanRoot() {
    if (location.href==='https://www.kimi.com/chat/history') return document.querySelector('div.group-list-container'); // Kimi 历史列表特殊处理
    if (location.href==='https://aistudio.google.com/app/library') return document.querySelector('tbody[role="rowgroup"]'); // Kimi 历史列表特殊处理

    // 优先用配置里的 historyListSelector，找不到就退化成 body
    return (currentCfg && currentCfg.historyListSelector && document.querySelector(currentCfg.historyListSelector))
        ? document.querySelector(currentCfg.historyListSelector)
        : document.body;
}

// 递归找到「文本完全等于 target」的最深 Text 节点
function findExactTextNode(el, target) {
    for (const n of el.childNodes) {
        if (n.nodeType === Node.TEXT_NODE && n.textContent.trim() === target)
            return n;
        if (n.nodeType === Node.ELEMENT_NODE) {
            const t = findExactTextNode(n, target);
            if (t) return t;
        }
    }
    return null;
}

function addStarToLink(a,hasFavdata=true) {
    if (a.dataset.aiStarDone) return;          // 已加过⭐的不用管
    const icon=hasFavdata ? '⭐' : '❤️';
    const rawText = a.textContent.trim();      // 原始文本
    if (!rawText) return;
    const textNode = findExactTextNode(a, rawText); // 定位到真正存放文本的 Text 节点
    if (!textNode) return;
    textNode.textContent = icon + rawText;     // 加星星
    a.dataset.aiStarDone = '1';
}

function removeStarFromLink(a) {
    if (!a.dataset.aiStarDone) return;         // 本来就没星
    const currentText = a.textContent.trim();
    const rawText = currentText.replace(/^(⭐|❤️)/, '');
    const textNode = findExactTextNode(a, currentText); // 查找当前包含⭐的文本
    if (!textNode) return;
    textNode.textContent = rawText;
    delete a.dataset.aiStarDone;
}

// 切换历史列表的收藏星标
function toggleHistoryStar(url, isAdd,hasData=true) {
    const root = getStarScanRoot();
    const allItems = Array.from(root.querySelectorAll(currentCfg.historyItemSelector));
    const target = allItems.find(a => url.includes(getUrlKey(a)));
    if (target) isAdd ? addStarToLink(target,hasData): removeStarFromLink(target);
}
async function checkUIMM3(notifty=true) {
    const response = await chrome.runtime.sendMessage({ action: 'getSelector' });
    if (response && response.isChro === true) {
        return true;
    }else{
        if (notifty) showTopToast(getI18nText('toast.pro_only'),2500)
        return false;
    }  
}
// 获取链接的唯一标识
function getUrlKey(a) {
    if (!a.closest(currentCfg.historyListSelector)) return null; // 不在扫描范围内，返回 '?????????'
    let match=null;
    if (a.href){
        match=a.href.split('?')[0];
    }else{
        match=a.dataset.key||a.dataset.conversationId||a.dataset.itemId;
    }
    if (currentWebsite==='Gemini') match=match.replace(/\?ref=www\.dunling\.com$/, '');
    return match;
}
/******************************************************************************************
 // #region 历史列表预览
 ******************************************************************************************/
async function initStarHistoryPreview() {
    await initEmbedPreview();
    if (currentCfg && !currentCfg.historyItemSelector)  return;
    const root = getStarScanRoot();
    if (!root) return;
    isJihuo = await checkUIMM3(false);if (!isJihuo) {return;}
    const currentfavData = bookmarkManager.data || await readFav();
    const hostItems = Object.values(currentfavData.items).filter(item => item.url && item.url.includes(location.hostname));
    const highlightData=HighlightManager?.siteData||await idbGet(['highlightData-'+window.location.hostname]);
    const temphighlightData=JSON.parse(JSON.stringify(highlightData));
    
    const historyItems = root.querySelectorAll(currentCfg.historyItemSelector);
    // console.log('historyItems',historyItems);
    historyItems.forEach(a => {
        const urlKey=getUrlKey(a);
        const pageData = Object.values(hostItems).find(item => item.url?.includes(urlKey));
        const isFav = pageData && pageData.url;
        const hasFavdata = pageData && pageData.data && pageData.data.length > 0;
        const titleEl=location.href === 'https://www.kimi.com/chat/history'?a.querySelector('span.title'):a; // Kimi 历史列表特殊处理
        isFav ? addStarToLink(titleEl,hasFavdata) : removeStarFromLink(titleEl);
        if (hasFavdata && !a.dataset.previewDone) {
            const handleEnterWrapper = () => handleMouseEnter(a);   // 绑定事件时，确保 a 是当前元素
            a.addEventListener('mouseenter', handleEnterWrapper);
            a.addEventListener('mouseleave', historyPreviewHide);
            a.dataset.previewDone = '1';
        }

        if(temphighlightData && currentSettings.enableMarkerFeature && currentSettings.showMarkers){
            // console.log('temphighlightData',temphighlightData);
            const matchedPathname = Object.keys(temphighlightData).find(pathname => 
                new URL(pathname, `https://${location.hostname}`).href.includes(urlKey)
            );
            if (matchedPathname) {
                const pageData = temphighlightData[matchedPathname]; // 这才是真正的数据
                const markers = [];
                
                Object.values(pageData).forEach(selectorData => {
                    markers.push({[selectorData.color]: selectorData.ratio});
                });
                updateColorDots(a, markers);
                // console.log('更新颜色标记:', markers);
                delete temphighlightData.matchedPathname;
            }
        }
        a.style.borderRadius = '6px'; // 确保圆角效果
    });
}

async function initEmbedPreview() {
    const currentfavData = bookmarkManager.data || await readFav();
    const hostItems = Object.values(currentfavData.items).filter(item => item.url && item.url.includes(location.hostname));
    const highlightData=HighlightManager?.siteData||await idbGet(['highlightData-'+window.location.hostname]);
    const temphighlightData=JSON.parse(JSON.stringify(highlightData));
    
    const historyItems = document.querySelectorAll('.embedded-view .item-content[data-type="item"]');
    historyItems.forEach(a => {
        const id=a.dataset.id;
        const pageData = Object.values(hostItems).find(item => item.id===id);
        const hasFavdata = pageData && pageData.data && pageData.data.length > 0;

        if (hasFavdata && !a.dataset.previewDone) {
            const handleEnterWrapper = () => handleMouseEnter(a);   // 绑定事件时，确保 a 是当前元素
            a.addEventListener('mouseenter', handleEnterWrapper);
            a.addEventListener('mouseleave', historyPreviewHide);
            a.dataset.previewDone = '1';
        }

        if(temphighlightData && currentSettings.enableMarkerFeature && currentSettings.showMarkers){
            // console.log('temphighlightData',pageData);
            const matchedPathname = Object.keys(temphighlightData).find(pathname => 
                new URL(pathname, `https://${location.hostname}`).href===pageData?.url
            );
            if (matchedPathname) {
                const pageData = temphighlightData[matchedPathname]; // 这才是真正的数据
                const markers = [];
                
                Object.values(pageData).forEach(selectorData => {
                    markers.push({[selectorData.color]: selectorData.ratio});
                });
                updateColorDots(a, markers);
                // console.log('更新颜色标记:', markers);
                delete temphighlightData.matchedPathname;
            }
        }
    });
}

// 1 气泡显示/隐藏逻辑
function historyPreviewShow(){ 
    clearTimeout(history_preview_leaveTimer); //清除定时器是为了防止在延迟时间内鼠标又返回气泡时，旧的隐藏操作还在执行，从而造成气泡闪烁或意外消失。
    historyPreviewBox.style.pointerEvents = 'auto'; 
    historyPreviewBox.style.visibility = 'visible'; 
    historyPreviewBox.style.opacity = 1; 
};
function historyPreviewHide(){ 
    history_preview_leaveTimer = setTimeout(() => { 
        historyPreviewBox.style.pointerEvents = 'none'; 
        historyPreviewBox.style.visibility = 'hidden'; 
        historyPreviewBox.style.opacity = 0; 
    }, 200); 
};

// 替换原有的 place 函数（约 1253 行）
function place(rect) {
    const pad = 8, gap = 8; // gap 增加一点，给箭头留位置
    const boxW = historyPreviewBox.offsetWidth, boxH = historyPreviewBox.offsetHeight;
    
    // --- ✨ 修改1：气泡定位到目标右侧 ---
    // 原逻辑: let left = rect.left - boxW - gap; (在左侧)
    // 新逻辑: 在右侧 = 目标右边界 + 间距
    let left = rect.right + gap;

    // 垂直方向逻辑保持不变（自动贴边处理）
    let top = rect.top + (rect.height - boxH) / 2;
    // 屏幕边缘检测
    const minTop = pad;
    const maxTop = window.innerHeight - boxH - pad;
    // 修正后的气泡 Top 值
    const finalTop = Math.max(minTop, Math.min(maxTop, top));
    
    // 如果右边超出屏幕（极少情况），可保留原逻辑或做防溢出处理，这里按要求强制在右侧
    if (left + boxW > window.innerWidth) {
       // 如果右边放不下，被迫放左边，这里暂不处理，假设空间足够
    }

    historyPreviewBox.style.left = `${left + window.scrollX}px`;
    historyPreviewBox.style.top = `${finalTop + window.scrollY}px`;

    // --- ✨ 修改2：计算箭头位置，使其始终对准目标中心 ---
    const arrow = historyPreviewBox.querySelector('.history-preview-arrow');
    if (arrow) {
        // 目标中心 Y 坐标
        const targetCenterY = rect.top + rect.height / 2;
        // 气泡顶部 Y 坐标
        const bubbleTopY = finalTop;
        
        // 箭头相对于气泡顶部的偏移量 = 目标中心 - 气泡顶部
        const arrowOffset = targetCenterY - bubbleTopY;
        
        arrow.style.top = `${arrowOffset}px`;
    }
};

// 7. 自动滚动函数
function performAutoScroll(targetIndex) {
    // console.log('开始自动滚动到索引:', targetIndex);
    
    const maxAttempts = 30; // 增加尝试次数
    let attempts = 0;
    
    const tryScroll = () => {
        attempts++;
        
        // 检查目录是否已初始化且有内容
        if (isInitialized && currentContents && currentContents.length > 0) {
            // console.log('目录已初始化，内容数量:', currentContents.length);
            
            if (currentContents[targetIndex]) {
                const targetElement = currentContents[targetIndex].element;
                
                if (targetElement) {
                    scrollToElement(targetElement, currentSettings.enableScrollSmooth?'smooth':'auto');
                    // console.log('自动滚动完成');
                    
                    // 移除旧的激活状态
                    document.querySelectorAll('.directory-item.active').forEach(el => 
                        el.classList.remove('active'));
                    
                    // 更新新的激活状态
                    const directoryItems = document.querySelectorAll('.directory-item');
                    if (directoryItems[targetIndex]) {
                        directoryItems[targetIndex].classList.add('active');
                        activeItemIndex = targetIndex;
                    }

                    return true;
                } else {
                    console.log('未找到目标元素');
                }
            } else {
                console.log('目标索引无效:', targetIndex, '内容长度:', currentContents.length);
            }
        } else {
            console.log('目录未就绪，尝试次数:', attempts, '初始化:', isInitialized, '内容:', currentContents?.length);
        }
        
        // 继续尝试
        if (attempts < maxAttempts) {
            setTimeout(tryScroll, 300);
        } else {
            console.log('自动滚动失败：超过最大尝试次数');
        }
    };
    
    // 开始尝试
    tryScroll();}

async function handleMouseEnter(a) {
    const urlKey=getUrlKey(a);
    let pageData=null;
    if (urlKey){
        pageData = await readFavItem(urlKey);     // 实时更新历史列表预览框里的数据
    }else{
        pageData = bookmarkManager.data.items[a.dataset.id];
    }
    // console.log('处理鼠标进入:', urlKey);
    const thisfavData = pageData ? pageData.data : [];
    if (!thisfavData) return;
    const renderRow = ([idx, txt]) =>
    `<div class="history-preview-item" data-index="${idx}">
        <span class="history-preview-item-number">${idx + 1}</span>
        <span class="history-preview-item-text">${escapeHtml(txt)}</span>
    </div>`;
    
    const previewList = historyPreviewBox.querySelector('.directory-preview-list');
    previewList.innerHTML = thisfavData
        .map((pair) => renderRow(pair))
        .join('');

    historyPreviewBox.querySelectorAll('.history-preview-item').forEach(row => {
        row.addEventListener('mouseenter', () => {
            row.style.background = '#f8f9fa';
            row.style.borderLeftColor = '#007cba';
        });
        row.addEventListener('mouseleave', () => {
            row.style.background = '';
            row.style.borderLeftColor = 'transparent';
        });
        row.addEventListener('click',(e) => {
            let delay=0;
            const clickUrl=pageData.url || pageData.Allurl;
            if (location.href!==clickUrl) {
                // spaNavigate(clickUrl)
                a.click();
                delay=300;
            } // 点击外部链接时，延迟500ms，等待页面跳转完成
            handleRowClick(e,delay);
        });
    });
    place(a.getBoundingClientRect());
    historyPreviewShow();
}
function handleRowClick(e,delay) {
    e.preventDefault();     // 阻止默认跳转行为
    e.stopPropagation();    // 阻止事件冒泡，避免触发父元素的点击事件
    
    const row = e.currentTarget;
    const targetUrl = row.dataset.href;
    const itemIndex = parseInt(row.dataset.index);
    
    // console.log('点击预览项，准备跳转:', { targetUrl, itemIndex });
    setTimeout(() => {
        performAutoScroll(itemIndex);
    }, delay);
    // historyPreviewHide();     // 关闭预览气泡
}


// --- AI-Contents.js --------
let loadingModalEl = null;
let loadingFillEl = null;
let loadingSubtitleEl = null;
let loadingNumEl = null;
let loadingPercentEl = null;

function initLoadingModal() {
    if (document.getElementById('ai-loading-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'ai-loading-modal';
    
    modal.innerHTML = `
        <div class="loading-card">
            <div class="reactor-box">
                <div class="particles-layer" id="particlesLayer"></div>
                <div class="reactor-ring-outer"></div>
                <div class="reactor-ring-inner"></div>
                <!-- 这里的 Core 是发光的 -->
                <div class="reactor-core"></div>
            </div>
            
            <div class="text-area">
                <div class="loading-title">数据获取中……</div>
                <div class="loading-subtitle" id="loadingSubtitle">GATHERING RESOURCES...</div>
                
                <div class="progress-container">
                    <div class="progress-bar-fill" id="loadingFill"></div>
                </div>
                
                <div class="progress-text">
                    <span id="loadingNum">0/0</span>
                    <span id="loadingPercent">0%</span>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    loadingModalEl = modal;
    loadingFillEl = modal.querySelector('#loadingFill');
    loadingSubtitleEl = modal.querySelector('#loadingSubtitle');
    loadingNumEl = modal.querySelector('#loadingNum');
    loadingPercentEl = modal.querySelector('#loadingPercent');
}

// 聚能版粒子生成器
function spawnParticles() {
    const layer = document.getElementById('particlesLayer');
    if (!layer) return;
    
    layer.innerHTML = '';
    const particleCount = 35; // 粒子数量
    
    // 能量颜色：亮白、金黄、橙红
    const colors = ['#ffffff', '#ffeb3b', '#ff5722'];
    
    for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        
        // 1. 角度
        const angle = Math.random() * 360 + 'deg';
        p.style.setProperty('--angle', angle);
        
        // 2. 颜色 & 发光
        const color = colors[Math.floor(Math.random() * colors.length)];
        p.style.backgroundColor = color;
        p.style.boxShadow = `0 0 4px ${color}`; // 微光
        
        // 3. 形状：稍微拉长的光束
        const width = Math.random() * 2 + 1 + 'px';
        const height = Math.random() * 8 + 2 + 'px'; // 长度不一
        p.style.width = width;
        p.style.height = height;
        
        // 4. 动画参数
        p.style.animationName = 'gather-particle';
        const duration = Math.random() * 1.0 + 0.6 + 's'; // 速度快一点，有吸入感
        p.style.animationDuration = duration;
        p.style.animationTimingFunction = 'ease-in'; // 加速吸入
        p.style.animationIterationCount = 'infinite';
        p.style.animationDelay = Math.random() * 2 + 's';
        
        layer.appendChild(p);
    }
}

// 保持不变
function showLoading(total) {
    if (!loadingModalEl) initLoadingModal();
    spawnParticles();
    
    loadingFillEl.style.width = '0%';
    loadingNumEl.innerText = `0/${total}`;
    loadingPercentEl.innerText = '0%';
    loadingSubtitleEl.innerText = '数据获取中……';
    
    loadingModalEl.classList.add('active');
    document.body.style.overflow = 'hidden'; 
}

function updateLoading(current, total, text = null) {
    if (!loadingModalEl) return;
    const percentage = Math.round((current / total) * 100);
    
    loadingFillEl.style.width = `${percentage}%`;
    loadingNumEl.innerText = `${current}/${total}`;
    loadingPercentEl.innerText = `${percentage}%`;
    
    if (text) {
        loadingSubtitleEl.innerText = text.toUpperCase();
    }
}

function hideLoading() {
    if (!loadingModalEl) return;
    setTimeout(() => {
        loadingModalEl.classList.remove('active');
        document.body.style.overflow = ''; 
        setTimeout(() => { loadingFillEl.style.width = '0%'; }, 200);
    }, 100);
}

// #region 消息折叠函数
/**
 * 终极折叠函数 (支持蒙版动态过渡动画 + 丝滑高度 + 完美按钮)
 * @param {HTMLElement} container - 目标消息容器
 * @param {number} limitHeight - 限制高度 (px)
 */
function initUniversalCollapsible(container) {
    if (!container||!currentSettings.enableAutoCollapse||currentWebsite==='MindMapHtml') return;
    if (container.classList.contains('js-collapse-ready')) return;
    limitHeight=currentSettings.collapseThreshold;

    // --- 2. 测量与初始化 ---
    const realHeight = container.scrollHeight;
    if (realHeight <= limitHeight) return;

    // 基础设置
    container.classList.add('js-collapse-ready');
    container.classList.add('is-collapsed-state'); // 初始添加折叠状态类

    // 设置初始高度
    container.style.maxHeight = `${limitHeight}px`;

    // --- 3. 创建按钮 ---
    const btn = document.createElement('div');
    btn.className = 'js-contrast-btn';
    btn.innerHTML = `<svg class="js-contrast-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

    // --- 4. 动画控制逻辑 ---
    let isCollapsed = true;
    let isAnimating = false;

    btn.onclick = (e) => {
        e.stopPropagation();
        if (isAnimating) return;
        isAnimating = true;

        isCollapsed = !isCollapsed;

        if (!isCollapsed) {
            // === 展开过程 ===
            container.classList.add('is-expanded'); // 旋转图标
            
            // 1. 立即移除折叠状态类 -> 触发 --mask-stop 变量从 60% 变到 120% 的 CSS 动画
            //    这会让蒙版像卷帘一样“滑”下去，而不是突然消失
            container.classList.remove('is-collapsed-state');

            // 2. 同时触发高度动画
            container.style.maxHeight = `${container.scrollHeight}px`;
            
            setTimeout(() => {
                container.style.maxHeight = 'none'; // 解除高度限制
                isAnimating = false;
            }, 300);

        } else {
            // === 折叠过程 ===
            container.classList.remove('is-expanded');

            // 1. 锁定当前高度
            container.style.maxHeight = `${container.scrollHeight}px`;
            void container.offsetHeight; // 强制重排

            // 2. 立即添加折叠状态类 -> 触发 --mask-stop 变量从 120% 变回 60%
            //    蒙版会平滑地从底部浮现上来
            container.classList.add('is-collapsed-state');

            // 3. 触发高度折叠
            container.style.maxHeight = `${limitHeight}px`;

            setTimeout(() => {
                isAnimating = false;
            }, 300);
        }
    };

    container.appendChild(btn);
}
// =============================================================================================================
// #region 历史列表标记函数
// =============================================================================================================
async function updateColorDotsByUrl(url, markers){
    const root = getStarScanRoot();
    const allItems = Array.from(root.querySelectorAll(currentCfg.historyItemSelector));
    const target = allItems.find(a => url.includes(getUrlKey(a)));
    updateColorDots(target,markers);

    const pageData = Object.values(bookmarkManager.data.items)
                    .find(item => item.url && item.url.split('?')[0] === url.split('?')[0]);
    if(pageData){
        console.log
        const item = Array.from(document.querySelectorAll('.embedded-view .item-content[data-type="item"]'))
                    .find(item => item.dataset.id === pageData.id);
        updateColorDots(item,markers);
    }

}


/**
 * 为指定元素动态更新下方的彩点
 * @param {string} selector - CSS 选择器
 * @param {Object} markers - 彩点信息，键为颜色，值为 0-1 的比例
 */
function updateColorDots(target, markers) {
    // return;
    // console.log('更新彩点:');
    if (!currentSettings.showMarkers || !currentSettings.enableMarkerFeature) return;
    if (!target) {
        return;
    }

    // 1. 清理旧容器
    const oldContainer = target.querySelector('.dynamic-dots-container');
    if (oldContainer) {
        oldContainer.remove();
    }

    // 2. 关键修复：强制目标元素不要剪裁子元素，并设置定位基准
    const style = window.getComputedStyle(target);
    target.style.position = (style.position === 'static') ? 'relative' : style.position;
    
    // 如果是行内元素 a，必须转为 inline-block 才能正确计算尺寸
    if (style.display === 'inline') {
        target.style.display = 'inline-block';
    }

    // 3. 创建容器
    const container = document.createElement('div');
    container.className = 'dynamic-dots-container';
    
    Object.assign(container.style, {
        position: 'absolute',
        left: '0',
        width: '100%',
        bottom: '-6px', // 使用负值，确保点在元素底边的下方
        height: '5px',
        pointerEvents: 'none',
        zIndex: '99999' // 确保在最上层
    });
    const offsetTop=currentWebsite==='AIstudio'?'-3px':'-6px';
    // 4. 【新增】创建贯穿横线
    if (markers.length > 0) {
        const line = document.createElement('div');
        line.className = 'dots-center-line';
        Object.assign(line.style, {
            position: 'absolute',
            left: '0',
            width: '100%',
            height: '0px',            // 线条粗细
            borderTop: '1px dashed rgba(102, 102, 102, 0.54)', // 虚线
            top: offsetTop,
            zIndex: '-1'              // 确保线条在圆点下方
        });
        container.appendChild(line);    // 增加贯穿线
    }


    // 4. 遍历数据

    // 圆点尺寸常量
    const dotContentWidth = 4; // 内部宽度
    const borderWidth = 1;     // 单侧边框
    const totalDiameter = dotContentWidth + borderWidth * 2; // 总直径 6px
    const radius = totalDiameter / 2; // 半径 3px
    markers.forEach(obj => {
        const [color, ratio] = Object.entries(obj)[0];
        const dot = document.createElement('div');
        Object.assign(dot.style, {
            position: 'absolute',
            boxSizing: 'content-box',       // 确保在所有网页大小一致
            width: `${dotContentWidth}px`,
            height: `${dotContentWidth}px`,
            backgroundColor: color,
            borderRadius: '50%',
            border: `${borderWidth}px solid rgb(78, 78, 78)`,
            // 使用数学公式修正定位，防止左右溢出：
            // 比例位置在 [radius] 到 [100% - radius] 之间滑动
            left: `calc(${radius}px + ${ratio * 100}% - ${totalDiameter * ratio}px)`,// Position = R + (W - D) × ratio
            transform: 'translate(-50%,-50%)', // 居中对齐计算出的位置
            boxShadow: '0 0 2px rgba(0,0,0,0.2)',
            zIndex: '2',
            top: offsetTop,
        });
        container.appendChild(dot);
    });

    target.appendChild(container);
    // console.log("彩点添加成功");
}

  /**
 * 为指定底部元素绑定“双击上下键”的显隐控制
 * @param {string} selector - 目标容器的 CSS 选择器 (如 '#app-footer', '.input-box')
 * @param {number} speed - (可选) 动画速度，单位毫秒，默认 300ms
 */
  function bindBottomToggle(selector) {
    const element = document.querySelector(selector);
    if (!element || element.classList.contains('toggle-hidden')){
        return;
    }else{
        element.classList.add('toggle-hidden');
    }

    // 2. 定义状态变量
    let isHidden = true;

    // 3. 监听键盘事件
    document.addEventListener('keydown', (event) => {
        // 检测是否按下了 F9
        if (event.key === 'F9') {
            
            // 阻止 F9 可能触发的浏览器默认行为（视浏览器而定）
            event.preventDefault();
            console.log('F9 键被按下，切换底部元素显隐');   // 隐藏输入框

            if (isHidden) {
                element.style.display = 'none';
                isHidden = false; // 更新状态
            } else {
                element.style.display = '';
                isHidden = true; // 更新状态
            }
        }
    });
}


// #region 辅助函数
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

function generateCanvasId() {
    return Array.from({length: 16}, () => 
        Math.floor(Math.random() * 16).toString(16)
    ).join('');
}
// #region 导出功能实现 (改造版)

/**
 * ① 导出为 Markdown 文件
 * 逻辑：优先尝试写入 Obsidian 目录，失败则降级为浏览器下载
 */
async function exportToMarkdown(qaData) {
    if (!qaData || qaData.length === 0) {
        showTopToast(getI18nText('toast.no_export_data'));
        return;
    }

    // 1. 过滤逻辑：确定要导出的最终数据列表
    let targetData = qaData;
    if (selectedItems.size > 0 && selectedItems.size < qaData.length) {
        const sortedIndices = Array.from(selectedItems).sort((a, b) => a - b);
        targetData = sortedIndices.map(idx => qaData[idx]).filter(item => item);
    }

    if (targetData.length === 0) {
        showTopToast(getI18nText('toast.no_filter_data'));
        return;
    }

    try {
        let markdownContent = "";

        // 2. 遍历拼接
        targetData.forEach((item) => {
            const qStr = item.question || '';
            const aStr = item.answer || '';
            if (currentSettings.enableCustomExportName) {
                let userStr = currentSettings.exportUserName || 'User';
                let aiStr = currentSettings.exportAiName;
                if (!aiStr || aiStr.trim() === 'auto') aiStr = currentCfg.webName;
                markdownContent += `# ${userStr}\n\n## ${qStr}\n\n# ${aiStr}\n\n${aStr}\n\n---\n\n`;
            } else {
                markdownContent += `# ${qStr}\n\n${aStr}\n\n---\n\n`;
            }
        });
        
        // 3. 生成文件名 (清理非法字符)
        const baseName = cleanPageName();
        // 将 Windows/Unix 文件名非法字符替换为下划线
        const safeName = baseName.replace(/[\\/:*?"<>|]/g, '_').trim();
        const timeStr = new Date().toISOString().slice(0, 10); 
        const fileName = `${safeName}_${timeStr}.md`;

        // 4. 尝试直接写入文件系统
        showTopToast(getI18nText('toast.saving'));
        const isSaved = await saveFileDirectly(fileName, markdownContent, 'text/markdown');

        if (isSaved) {
            showTopToast(`${getI18nText('toast.save_obsidian')}${fileName}`);

        } else {
            // 5. 降级方案：普通下载
            downloadFile(markdownContent, fileName, 'text/markdown');
            showTopToast(getI18nText('toast.download_fallback'));

        }

    } catch (e) {
        console.log('Markdown 导出失败', e);
        showTopToast(getI18nText('toast.export_error'));
    }
}

/**
 * ② 导出为 Obsidian Canvas 文件
 * 逻辑：优先尝试写入 Obsidian 目录，失败则降级为浏览器下载
 */
async function exportToObsidianCanvas(qaData) {
    if (!qaData || qaData.length === 0) {
        showTopToast(getI18nText('toast.no_export_data'));
        return;
    }

    // --- 布局配置变量 ---
    const COLS_PER_ROW = 3;
    const CARD_WIDTH = 750;
    const CARD_HEIGHT = 800;
    const CARD_GAP = 40;

    // 1. 过滤逻辑
    let targetData = qaData;
    if (selectedItems.size > 0 && selectedItems.size < qaData.length) {
        const sortedIndices = Array.from(selectedItems).sort((a, b) => a - b);
        targetData = sortedIndices.map(idx => qaData[idx]).filter(item => item);
    }

    if (targetData.length === 0) {
        showTopToast(getI18nText('toast.no_filter_data'));
        return;
    }

    try {
        const nodes = [];
        const colorPalette = ["1", "2", "3", "4", "5", "6"];

        // 2. 遍历生成节点
        targetData.forEach((item, index) => {
            const qStr = item.question || '';
            const aStr = item.answer || '';
            
            const colIndex = index % COLS_PER_ROW; 
            const rowIndex = Math.floor(index / COLS_PER_ROW);

            const x = colIndex * (CARD_WIDTH + CARD_GAP);
            const y = rowIndex * (CARD_HEIGHT + CARD_GAP);

            const node = {
                "id": generateCanvasId(), // 确保你的代码中有 generateCanvasId 函数
                "x": x,
                "y": y,
                "width": CARD_WIDTH,
                "height": CARD_HEIGHT,
                "color": colorPalette[index % colorPalette.length], 
                "type": "text",
                "text": `# ${qStr}\n\n${aStr}`
            };

            nodes.push(node);
        });

        // 3. 构建最终 JSON
        const canvasData = {
            "nodes": nodes,
            "edges": [] 
        };

        // 4. 生成文件名
        const baseName = cleanPageName();
        const safeName = baseName.replace(/[\\/:*?"<>|]/g, '_').trim();
        const timeStr = new Date().toISOString().slice(0, 10);
        const fileName = `${safeName}_${timeStr}.canvas`;
        const jsonString = JSON.stringify(canvasData, null, 2);
        
        // 5. 尝试直接写入文件系统
        const isSaved = await saveFileDirectly(fileName, jsonString, 'application/json');
        if (isSaved) {
            showTopToast(`${getI18nText('toast.save_obsidian_map')}${fileName}`);
        } else {
            // 6. 降级方案：普通下载
            downloadFile(jsonString, fileName, 'application/json');
            showTopToast(getI18nText('toast.download_fallback'));
        }

    } catch (e) {
        console.log('Canvas 导出失败', e);
        showTopToast(getI18nText('toast.export_error'));
    }
}
// #endregion




// #region File System Access API 核心逻辑
// =========================================================================


/**
 * 验证并请求权限 (优化版：死磕旧句柄，尽量不弹文件选择框)
 */
async function verifyPermission(handle, readWrite) {
    const options = {};
    if (readWrite) {
        options.mode = 'readwrite';
    }

    // 1. 先查询当前状态
    // 状态可能是: 'granted' (已授权), 'prompt' (需要确认), 'denied' (被拒)
    const queryResult = await handle.queryPermission(options);

    // 2. 如果已经是 granted，直接通过
    if (queryResult === 'granted') {
        return true;
    }

    // 3. 如果是 prompt (页面刷新后通常是这个状态)，或者 denied
    // 此时请求 requestPermission 会触发浏览器的"小气泡"确认，而不是"文件选择框"
    if (queryResult === 'prompt' || queryResult === 'denied') {
        console.log('权限需确认，正在请求...');
        // 注意：这里必须由用户点击事件触发（你现在的点击保存流程符合这个要求）
        const requestResult = await handle.requestPermission(options);
        return requestResult === 'granted';
    }

    return false;
}

/**
 * 获取 Obsidian 仓库目录句柄 (逻辑修复版)
 */
async function getObsidianHandle() {
    const KEY_HANDLE = 'obsidian_dir_handle'; 
    
    // 1. 尝试从 IndexedDB 读取旧句柄
    // 注意：FileSystemHandle 必须存在 IDB 里，不能存 LocalStorage
    let dirHandle = await localHandleGet(KEY_HANDLE);

    if (dirHandle) {
        console.log('检测到历史目录句柄，尝试复用...');
        
        // 2. 关键点：这里会尝试唤醒句柄
        // 如果需要确认，浏览器会弹一个小气泡（只需点一次允许），而不是弹大文件框
        const isPermitted = await verifyPermission(dirHandle, true);
        
        if (isPermitted) {
            console.log('✅ 历史句柄复用成功！');
            return dirHandle; // 直接返回，不再往下执行 showDirectoryPicker
        } else {
            console.log('❌ 历史句柄权限被用户拒绝，将重新选择目录');
        }
    }

    // 3. 只有在 (没有旧句柄) OR (旧句柄被用户明确拒绝/失效) 时，才弹大框
    try {
        console.log('正在打开系统目录选择器...');
        dirHandle = await window.showDirectoryPicker({
            id: 'obsidian-vault', // 浏览器记住上次路径的功能
            mode: 'readwrite',
            startIn: 'documents'
        });
        
        // 4. 保存新句柄
        await localHandleSet(KEY_HANDLE, dirHandle);
        return dirHandle;
    } catch (error) {
        // 用户点了取消，或者浏览器不支持
        if (error.name === 'AbortError') {
            console.log('用户取消了目录选择');
        } else {
            console.log('获取目录失败:', error);
            showTopToast(getI18nText('toast.dir_fail'));
        }
        return null; // 返回空，外层函数会降级为普通下载
    }
}

// ... saveFileDirectly 函数保持不变 ...
// #endregion

/**
 * 核心写入函数：将内容保存到本地文件
 * @param {string} filename 文件名 (如 "Note.md")
 * @param {string} content 文件内容
 * @param {string} mimeType MIME类型 (可选，仅用于兼容性参考)
 * @returns {Promise<boolean>} 成功返回 true，失败或不支持返回 false
 */
async function saveFileDirectly(filename, content, mimeType) {
    // 0. 特性检测：不支持 API 则降级
    if (!window.showDirectoryPicker) {
        console.log('当前浏览器不支持 File System Access API，降级为下载模式');
        return false;
    }

    try {
        // 1. 获取目录句柄
        const dirHandle = await getObsidianHandle();
        if (!dirHandle) return false; // 用户取消或失败

        // 2. 创建或获取文件句柄 (create: true 表示如果不存在则创建)
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        
        // 3. 创建写入流 (FileSystemWritableFileStream)
        const writable = await fileHandle.createWritable();
        
        // 4. 写入内容
        await writable.write(content);
        
        // 5. 关闭文件
        await writable.close();
        
        return true;
    } catch (error) {
        console.log('文件直接写入失败:', error);
        // 如果是因为用户拒绝权限等原因，不要这里弹窗，返回false让外层降级下载
        if (error.name === 'NotAllowedError') {
             showTopToast(getI18nText('toast.write_denied'));
        } else {
             showTopToast(`${getI18nText('toast.write_error')}${error.message}`);
        }
        return false;
    }
}
// #endregion

// #region 专用于文件句柄的本地 IndexedDB (不走 Background)
// 必须直接在 Content Script 操作 IDB，才能正确存储 FileSystemHandle

const LOCAL_DB_NAME = 'AI_File_Handle_DB';
const LOCAL_STORE_NAME = 'handles';

function openLocalDB() {
    return new Promise((resolve, reject) => {
        // 打开属于当前网页源(Origin)的 IndexedDB
        const request = indexedDB.open(LOCAL_DB_NAME, 1);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            // 如果不存在 store 则创建
            if (!db.objectStoreNames.contains(LOCAL_STORE_NAME)) {
                db.createObjectStore(LOCAL_STORE_NAME);
            }
        };
        
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(new Error('Local IDB open failed'));
    });
}

/**
 * 专门用于读取本地的文件句柄
 */
async function localHandleGet(key) {
    try {
        const db = await openLocalDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(LOCAL_STORE_NAME, 'readonly');
            const store = transaction.objectStore(LOCAL_STORE_NAME);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.log('Local IDB Get Error:', e);
        return null;
    }
}

/**
 * 专门用于存储本地的文件句柄
 */
async function localHandleSet(key, value) {
    try {
        const db = await openLocalDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(LOCAL_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(LOCAL_STORE_NAME);
            const request = store.put(value, key);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.log('Local IDB Set Error:', e);
        return false;
    }
}

/**
 * 重置保存目录 (清除 IDB 中的句柄)
 */
async function resetObsidianPath() {
    const KEY_HANDLE = 'obsidian_dir_handle';
    // 将其设置为 null 或者 undefined，下次读取时就会判定为不存在
    await localHandleSet(KEY_HANDLE, null); 
}
// #endregion