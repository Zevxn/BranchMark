async function chromeGet(key) {
    try {
        const result = await chrome.storage.local.get([key]);       // 读取收藏数据
        return result[key];
    } catch (e) {
        console.log('[MindMap] 读取思维导图数据失败:', e);
    }
}

// --- 保持你的原始 installLongPress 函数不变 ---
function installLongPress(el, { delay = 600, onLongPress } = {}) {
    let timer = null;
    let didLong = false;

    const clear = () => {
        if (timer) { clearTimeout(timer); timer = null; }
    };

    el.addEventListener('mousedown', e => {
        didLong = false;
        
        const clientX = e.clientX;
        const clientY = e.clientY;

        timer = setTimeout(() => {
            didLong = true;
            
            let targetEl = document.elementFromPoint(clientX, clientY);
            if (!targetEl) targetEl = e.target;
            
            e.currentEl = targetEl; 
            
            onLongPress(e, targetEl); 
        }, delay);
    });

    el.addEventListener('mouseup', clear);
    el.addEventListener('mouseleave', clear); 

    el.addEventListener('mousemove', (e) => {
        // 简单的防抖，如果移动超过 5px 则取消长按
        // 这里可以加上逻辑，为了简单起见暂时不加或者你自己保留原样
    });

    el.addEventListener('click', e => {
        if (didLong) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

// --- 安全策略工具 ---
const myPolicy = window.trustedTypes && window.trustedTypes.createPolicy ? 
    window.trustedTypes.createPolicy('bookmark-policy', { createHTML: s => s }) : null;

// 安全赋值函数
function setSafeHTML(element, html) {
    if (myPolicy) {
        element.innerHTML = myPolicy.createHTML(html);
    } else {
        element.innerHTML = html;
    }
}
/**********************************************************************************************************
// #region 创建UI容器
***********************************************************************************************************/
const uiContainer = document.createElement('div');
uiContainer.className = 'bookmark-manager-container';
uiContainer.innerHTML = `
    <button class="magic-btn btn-red" id="favBtn" style="overflow: hidden;">
        <div class="btn-content">
            <div class="layer layer-icon">
                <svg class="star-svg" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
            </div>
            <div class="layer layer-rate">
                <span class="rate-num" id="rateVal">1.0</span>
                <div class="slider-track">
                    <div class="slider-fill" id="rateFill" style="width: 20%"></div>
                </div>
            </div>
        </div>
    </button>
    <div class="bookmark-panel" id="bookmarkPanel">
        <div class="panel-header">
            <div class="panel-actions">
                <button id="newFolderBtn" data-i18n-title="bookmarks.new_folder_title" title="新建文件夹">
                    <i class="fa-solid fa-folder-plus"></i>
                </button>

                <button id="searchBtn" data-i18n-title="bookmarks.search_title" title="搜索">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>

                <button id="refreshFavBtn" data-i18n-title="bookmarks.refresh_title" title="刷新页面">
                    <i class="fas fa-sync-alt"></i>
                </button>
                <button id="fullScreenBtn" data-i18n-title="bookmarks.fullscreen_title" title="宽屏显示">
                    <i class="fa-solid fa-expand"></i>
                </button>
                <button id="viewToggleBtn" data-i18n-title="bookmarks.toggle_view_title" title="切换视图">
                    <i class="fa-solid fa-list"></i>
                </button>
                
            </div>
        </div>

        <div class="search-bar-row" id="searchBarRow">
            <div class="search-input-group">
                <input type="text" class="search-input" id="searchInput" data-i18n-placeholder="bookmarks.search_placeholder" placeholder="搜索名称或链接..." autocomplete="off">
                <i class="fa-solid fa-arrow-right search-action-icon" id="doSearchIcon" data-i18n-title="bookmarks.search_title" title="搜索"></i>
            </div>
        </div>

        <div class="breadcrumb" id="breadcrumb">
            <span class="breadcrumb-item" data-id="root" data-i18n="bookmarks.root_dir">根目录</span>
        </div>

        <div class="panel-content" id="panelContent">
            <div class="selection-box" id="selectionBox"></div>
            <div class="tree-container" id="treeContainer"></div>
        </div>
    </div>

    <div class="context-menuBM" id="contextMenuBM">
        <div class="context-menu-item" data-action="rename">
            <i class="fa-regular fa-pen-to-square"></i>
            <span class="menu-text" data-i18n="bookmarks.ctx_rename">重命名</span>
        </div>
        <div class="context-menu-item" data-action="newFolder">
            <i class="fa-solid fa-folder-plus"></i>
            <span class="menu-text" data-i18n="bookmarks.ctx_new_folder">新建文件夹</span>
        </div>
        <div class="context-menu-item" data-action="open">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
            <span class="menu-text" data-i18n="bookmarks.ctx_open_link">打开链接</span>
        </div>
        <div class="context-menu-item danger" data-action="delete">
            <i class="fa-regular fa-trash-can"></i>
            <span class="menu-text" data-i18n="bookmarks.ctx_delete">删除</span>
        </div>
        <div style="height:1px; background:#eee; margin:2px 0;" id="context-menu-bar"></div>
        <div class="context-menu-item" data-action="move">
            <i class="fa-solid fa-share-from-square"></i>
            <span class="menu-text" data-i18n="bookmarks.ctx_move">移动到...</span>
            <i class="fa-solid fa-chevron-down" style="font-size: 10px; margin-left: auto;"></i>
            <div class="dropdown-menu move-dropdown-menu" id="contextMoveMenu"></div>
        </div>
    </div>

    <div class="mymodal" id="renameModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" data-i18n="bookmarks.modal_rename_title">重命名</h3>
            </div>
            <div class="bookmark-modal-body">
                <div class="form-group">
                    <label for="renameInput" data-i18n="bookmarks.modal_rename_label">名称</label>
                    <input type="text" id="renameInput" autofocus>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="cancelRenameBtn" data-i18n="common.cancel">取消</button>
                <button class="btn btn-primary" id="confirmRenameBtn" data-i18n="common.confirm">确定</button>
            </div>
        </div>
    </div>

    <div class="mymodal" id="newFolderModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" data-i18n="bookmarks.modal_new_folder_title">新建文件夹</h3>
            </div>
            <div class="bookmark-modal-body">
                <div class="form-group">
                    <label for="newFolderNameInput" data-i18n="bookmarks.modal_new_folder_label">文件夹名称</label>
                    <input type="text" id="newFolderNameInput" data-i18n-placeholder="bookmarks.modal_new_folder_placeholder" placeholder="输入文件夹名称" autofocus>
                </div>
                <div class="form-group">
                    <label data-i18n="bookmarks.modal_location">位置</label>
                    <div class="custom-dropdown" id="folderDropdown">
                        <div class="dropdown-display">
                            <span class="dropdown-text" data-i18n="bookmarks.root_dir">根目录</span>
                            <svg class="dropdown-arrow" width="16" height="16" viewBox="0 0 24 24" fill="#94a3b8">
                                <path d="M7 10l5 5 5-5z"/>
                            </svg>
                        </div>
                        <div class="dropdown-menu" id="folderDropdownMenu"></div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="cancelNewFolderBtn" data-i18n="common.cancel">取消</button>
                <button class="btn btn-primary" id="confirmNewFolderBtn" data-i18n="common.create">创建</button>
            </div>
        </div>
    </div>

    <div class="mymodal" id="newItemModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" data-i18n="bookmarks.modal_new_item_title">新建收藏</h3>
            </div>
            <div class="bookmark-modal-body">
                <div class="form-group">
                    <label for="newItemNameInput" data-i18n="bookmarks.modal_new_item_label">收藏名称</label>
                    <input type="text" id="newItemNameInput" data-i18n-placeholder="bookmarks.modal_new_item_placeholder" placeholder="输入收藏名称" autofocus>
                </div>
                <div class="form-group">
                    <label for="newItemUrlInput" data-i18n="bookmarks.modal_url_label">链接地址</label>
                    <input type="url" id="newItemUrlInput" placeholder="https://example.com">
                </div>
                <div class="form-group">
                    <label data-i18n="bookmarks.modal_location">位置</label>
                    <div class="custom-dropdown" id="itemDropdown">
                        <div class="dropdown-display">
                            <span class="dropdown-text" data-i18n="bookmarks.root_dir">根目录</span>
                            <svg class="dropdown-arrow" width="16" height="16" viewBox="0 0 24 24" fill="#94a3b8">
                                <path d="M7 10l5 5 5-5z"/>
                            </svg>
                        </div>
                        <div class="dropdown-menu" id="itemDropdownMenu"></div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="cancelNewItemBtn" data-i18n="common.cancel">取消</button>
                <button class="btn btn-primary" id="confirmNewItemBtn" data-i18n="common.create">创建</button>
            </div>
        </div>
    </div>

    <div class="mymodal" id="deleteModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" data-i18n="bookmarks.modal_delete_title">确认删除</h3>
            </div>
            <div class="bookmark-modal-body">
                <p id="deleteConfirmText" data-i18n="bookmarks.modal_delete_desc">确定要删除选中的项目吗？</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="cancelDeleteBtn" data-i18n="common.cancel">取消</button>
                <button class="btn btn-danger" id="confirmDeleteBtn" data-i18n="common.delete">删除</button>
            </div>
        </div>
    </div>
    <div class="drag-hint" id="dragHint"></div>
`;

/**********************************************************************************************************
// #region 创建主管理类
***********************************************************************************************************/
class myBookmarkManager {
    constructor() {
        this.data = {
            folders: {},
            items: {},
            rootOrder: []
        };
        this.viewMode = 'list'; // <--- 新增：默认为列表模式
        this.indexData=[];
        this.replyData='';
        this.action='';

        this.currentFolderId = 'root';
        this.selectedIds = [];
        this.expandedFolders = new Set();
        this.draggedId = null;
        this.draggedElement = null;
        this.dragPosition = null;
        this.selectionWithCtrl = false;

        // 框选相关
        this.isSelecting = false;
        this.dragStartOffset = 0;
        this.selectionStart = { x: 0, y: 0 };
        this.selectionBox = document.getElementById('selectionBox');
        this.justFinishedSelecting = false;
        this.lastMouseDownTime = 0;
        this.autoScrollTimer = null; // 用于存储自动滚动的定时器

        this.initializedDropdowns = new Set();

        this.initialized = false; // 新增标记
        this.fixedPanel = false;

        this.activeFilter = null; // 当前激活的筛选类型
        this.searchKeyword = '';
        this.visibleIds = new Set(); // 存储筛选后应该显示的 ID 集合
        this.filterCollapsedIds = new Set(); 

        // === 新增：拖拽自动展开相关的状态 ===
        this.autoExpandedFolderId = null; // 记录哪个文件夹是因为拖拽而临时展开的
        this.autoExpandTimer = null;      // 记录展开的延时定时器
        this.isFufei=false;
        this.dragHistoryItem=null;

        this.embeddedCurrentId = 'root'; // 嵌入面板当前的目录ID
        this.embeddedVisibleIds = new Set(); // 嵌入面板的筛选结果缓存
        this.embeddedExpandedFolders = new Set();
        this.localEmptyFolders = new Set();
        this.embedded=false;
        this.rootDir='根目录';
        this.isSelfChange = true;
    }

    async initialize() {
        this.rootDir=getI18nText('bookmarks.root_dir');
        await this.loadFromStorage();
        this.render();
        this.initializeEventListeners();
        this.initialized = true;
        // 检测到书签数据改变后自动更新面板
        chrome.storage.onChanged.addListener( async(changes, namespace) => {
            if (namespace === 'local') {
                if (changes.changeTime && this.isSelfChange) {
                    await this.loadFromStorage();
                    this.render();
                    this.isSelfChange = true;
                }
            }
        });
    }
/**********************************************************************************************************
// #region 读写数据
***********************************************************************************************************/
    async loadFromStorage() {
        try {
            const savedData=await idbGet('bookmarkData');
            const savedExpanded=await chromeGet('expandedFolders');
            const savedFolderId=await chromeGet('currentFolderId');
            const isInitializedData=await chromeGet('isInitializedData');
            const savedViewMode = await chromeGet('viewMode');
            const localExpanded = localStorage.getItem('embeddedExpandedFolders');
            const localEmpty = localStorage.getItem('localEmptyFolders');
            if (localExpanded) this.embeddedExpandedFolders = new Set(JSON.parse(localExpanded));
            if (localEmpty) this.localEmptyFolders = new Set(JSON.parse(localEmpty));

            if (savedData) {
                this.data = savedData;
                if (!isInitializedData) await chrome.storage.local.set({'isInitializedData': true});
                // ======== 【新增游离节点数据修补/打捞逻辑】 ========
                const allChildren = new Set();
                this.data.rootOrder.forEach(id => allChildren.add(id));
                Object.values(this.data.folders).forEach(f => {
                    if(f.children) f.children.forEach(id => allChildren.add(id));
                });
                
                // 1. 打捞游离的文件夹
                Object.keys(this.data.folders).forEach(id => {
                    if (!allChildren.has(id)) {
                        this.data.folders[id].parentId = 'root';
                        this.data.rootOrder.push(id);
                    }
                });
                // 2. 打捞游离的文件
                Object.keys(this.data.items).forEach(id => {
                    if (!allChildren.has(id)) {
                        this.data.items[id].parentId = 'root';
                        this.data.rootOrder.push(id);
                    }
                });
                // ===================================================
            }else{
                if (!isInitializedData){
                    this.data = {
                        folders: {},
                        items: {},
                        rootOrder: []
                    };
                    await idbSet({'bookmarkData': this.data});
                    await chrome.storage.local.set({'isInitializedData': true});
                    console.log('初始化信息已经保存！！');
                    }
                }
            if (savedExpanded) this.expandedFolders = new Set(savedExpanded);
            if (savedViewMode) this.viewMode = savedViewMode;
            this.isFufei=await this.checkUIMM2(false);
            // if (savedFolderId !== null) this.currentFolderId = savedFolderId || 'root';
        } catch (e) {
            console.log('[BookmarkManager] 加载数据失败', e);
            // 如果加载失败，也初始化默认数据
            // this.data = {
            //     folders: {},
            //     items: {},
            //     rootOrder: []
            // };
        }
    }

    async saveToStorage() {
        try {
            this.isSelfChange = false;
            await idbSet({
                'bookmarkData': this.data,
            });
            await chrome.storage.local.set({
                'expandedFolders': [...this.expandedFolders],
                'currentFolderId': this.currentFolderId,
                'changeTime': Date.now()
            });
        } catch (e) {
            console.log('[BookmarkManager] 保存数据失败', e);
        }
    }

/**********************************************************************************************************
// #region 初始化事件监听器
***********************************************************************************************************/
    initializeEventListeners() {
        // 打开面板
        document.addEventListener('keydown', async(e) => {
            if (e.ctrlKey && e.key === 'g') {
                e.preventDefault();
                await this.togglePanel();
            }
        });

        document.getElementById('favBtn').addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.togglePanel();
        });
        document.querySelector('.panel-header').addEventListener('dblclick', async (e) => {
            if (!e.target.closest('button')){
                e.stopPropagation();
                this.fixedPanel = !this.fixedPanel;
                document.querySelector('.bookmark-panel').classList.toggle('fixed', this.fixedPanel);
            };
        });
        document.getElementById('breadcrumb').addEventListener('dblclick', (e) => {
            if (!e.target.closest('.breadcrumb-item')) {
                e.stopPropagation();
                this.fixedPanel = !this.fixedPanel;
                document.querySelector('.bookmark-panel').classList.toggle('fixed', this.fixedPanel);
            }
        });

        document.getElementById('newFolderBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showNewFolderModal(this.currentFolderId);
        });

        document.getElementById('refreshFavBtn').addEventListener('click', async(e) => {
            e.stopPropagation();
            this.data=await idbGet('bookmarkData'); // 重新加载数据
            console.log(this.data);
            Object.entries(this.data.items).forEach(([key, value]) => { // 遍历所有项目,防止没有parentId的情况
                if (value && !value.hasOwnProperty('parentId')) {
                    this.data.items[key].parentId = 'root';
                    this.data.rootOrder.push(key);
                }
            });
            this.currentFolderId = document.querySelector('.bookmark-panel .breadcrumb-item:last-child')?.getAttribute('data-id') || 'root'; 
            this.render();
            const icon = e.target.querySelector('i'); // e.currentTarget === 按钮
            icon.style.animation = 'none';
            setTimeout(() => {
                icon.style.animation = 'fa-spin 1s ease-in-out';
            }, 10);
        });
        document.getElementById('fullScreenBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelector('.bookmark-panel').classList.toggle('wider');

        });
        installLongPress(document.getElementById('fullScreenBtn'), {
            delay: 600,
            onLongPress: () => document.querySelector('.bookmark-panel').classList.toggle('full')
        });        
        // document.getElementById('previewFavBtn').addEventListener('click', (e) => {
        //     e.stopPropagation();
        //     console.log('预览',this.selectedIds);
        //     this.open_MultipleQA(this.selectedIds,'markdown');
        // });
        
        // document.getElementById('mindMapBtn').addEventListener('click', (e) => {
        //     e.stopPropagation();
        //     console.log('预览',this.selectedIds);
        //     this.open_MultipleQA(this.selectedIds,'mindmap');
        // });

        // document.getElementById('deleteSelectedBtn').addEventListener('click', (e) => {
        //     e.stopPropagation();
        //     if (this.selectedIds.length > 0) {
        //         this.showDeleteModal(this.selectedIds);
        //     }
        // });

        document.getElementById('viewToggleBtn').addEventListener('click', async (e) => {
            e.stopPropagation();
            // 切换状态
            this.viewMode = this.viewMode === 'list' ? 'grid' : 'list';
            await this.saveToStorage(); // 保存偏好
            await chrome.storage.local.set({
                'viewMode': this.viewMode, // <--- 新增：保存视图模式
            });
            this.render(); // 重绘
        });

        // 面包屑事件监听
        document.getElementById('breadcrumb').addEventListener('click', (e) => {
            if (e.target.classList.contains('breadcrumb-item')) {
                e.stopPropagation();
                const folderId = e.target.dataset.id;
                this.navigateTo(folderId);
                // console.log(`面包屑点击进入 ${this.data.folders[this.currentFolderId]?.name ?? '根目录'}`);
            }
        });

        // 模态框
        this.initializeModalListeners();

        // 树形结构事件委托
        this.initializeTreeEventDelegation();

        // 右键菜单
        this.initializeContextMenu();
        this.initializeSearch();



/**********************************************************************************************************
// #region 全局点击事件监听
***********************************************************************************************************/
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menuBM')) this.hideContextMenu();
            const now = Date.now();
            if (this.isSelecting || this.justFinishedSelecting || (now - this.lastMouseDownTime < 300)) {
                return;
            }

            const display = e.target.closest('.dropdown-display');
            if (display) {
                e.stopPropagation();
                const dropdown = display.closest('.custom-dropdown');
                const menu = dropdown.querySelector('.dropdown-menu');

                const isOpen = menu.classList.contains('show');

                document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
                document.querySelectorAll('.dropdown-display').forEach(d => d.classList.remove('open'));

                if (!isOpen) {
                    menu.classList.add('show');
                    display.classList.add('open');
                }
            } else {
                if (!e.target.closest('.dropdown-menu') && !e.target.closest('.context-menuBM')) {
                    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
                    document.querySelectorAll('.dropdown-display').forEach(d => d.classList.remove('open'));
                }
            }
        });

        // 只要在空白处按下鼠标就关闭面板
        document.addEventListener('mousedown', (e) => {
            const panel = document.getElementById('bookmarkPanel');
            const toggle = document.getElementById('favBtn');

            if (panel.classList.contains('open') &&
                !panel.contains(e.target) &&
                !toggle.contains(e.target) &&
                !e.target.closest('.mymodal')&&
                !e.target.closest('.context-menuBM')&&
                !this.fixedPanel) {
                this.togglePanel();
            }
        });

        // 框选功能
        const panelContent = document.getElementById('panelContent');
        const treeContainer = document.getElementById('treeContainer');
        this.initializeSelectionBox(panelContent,treeContainer);
    }

/**********************************************************************************************************
// #region 模态框事件监听器
***********************************************************************************************************/
    initializeModalListeners() {
        const modals = ['renameModal', 'newFolderModal', 'newItemModal', 'deleteModal'];
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            let mouseDownOnBackground = false;

            // 记录鼠标是否在背景上按下
            modal.addEventListener('mousedown', (e) => {
                mouseDownOnBackground = (e.target === modal);
            });

            // 点击事件：必须按下和释放都在背景上才关闭
            modal.addEventListener('click', (e) => {
                // 只有当点击的是背景层，且鼠标按下时也是背景层，才关闭
                if (e.target === modal && mouseDownOnBackground) {
                    this.hideModal(modalId);
                };
                
            });

            // 鼠标释放后重置标志
            modal.addEventListener('mouseup', (e) => {
                setTimeout(() => { mouseDownOnBackground = false; }, 0);
            });

            // 鼠标离开模态框时也重置
            modal.addEventListener('mouseleave', (e) => {
                mouseDownOnBackground = false;
            });
        });

        // 以下是原有按钮事件，保持不变
        document.getElementById('cancelRenameBtn').addEventListener('click', () => this.hideModal('renameModal'));
        document.getElementById('confirmRenameBtn').addEventListener('click', async () => await this.confirmRename());

        document.getElementById('cancelNewFolderBtn').addEventListener('click', () => this.hideModal('newFolderModal'));
        document.getElementById('confirmNewFolderBtn').addEventListener('click', async () => await this.confirmNewFolder());

        document.getElementById('cancelNewItemBtn').addEventListener('click', () => this.hideModal('newItemModal'));
        document.getElementById('confirmNewItemBtn').addEventListener('click', async () => await this.confirmNewItem());

        document.getElementById('cancelDeleteBtn').addEventListener('click', () => this.hideModal('deleteModal'));
        document.getElementById('confirmDeleteBtn').addEventListener('click', async () => await this.confirmDelete());

        document.querySelectorAll('.modal-content input').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const modal = e.target.closest('.mymodal');
                    const confirmBtn = modal.querySelector('.btn-primary, .btn-danger');
                    if (confirmBtn) confirmBtn.click();
                }
            });
        });
    }
/**********************************************************************************************************
// #region 树状结构事件委托
***********************************************************************************************************/
    initializeTreeEventDelegation() {
        const container = document.getElementById('panelContent');
        
        
        container.addEventListener('dblclick', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const itemContent = e.target.closest('.item-content');
            if (itemContent){
                const icon = e.target.closest('.folder-icon');
                if(icon) return;

                const type = itemContent.dataset.type;
                const id = itemContent.dataset.id;
                const fileName = itemContent.querySelector('.item-text').textContent;
                if (type === 'item') {
                    // if (!this.isFufei) {showTopToast('⚠️ 仅限付费用户使用~',2500);return;};
                    this.isFufei=await this.checkUIMM2(true);if (!this.isFufei) {return;};
                    const item = this.data.items[id];
                    if (item.data.length===0){              // 没有问答记录时，直接打开链接
                        window.open(item.url, '_blank');    // 只有收藏页面才可能为空，并且有链接
                    }
                    if (item.type==='mindmap'){
                        await this.openMindMap(id,fileName);
                    }else{
                        const action=location.href.includes('MindMap.html')?'mindmap':'markdown';
                        this.open_MultipleQA([id],action);
                    }
                        
                }else if(type === 'folder'){
                    // this.toggleFolder(id);
                    // console.log(`双击进入 ${this.data.folders[this.currentFolderId]?.name ?? '根目录'}`)
                    this.navigateTo(id);
                }
            }else{
                // this.toggleDictionaryPanel();
            }

        });
        
        container.addEventListener('click', (e) => {
            if (this.justFinishedSelecting) return;
            if (e.target.closest('.item-actions button')) return;

            const itemContent = e.target.closest('.item-content');
            if (!itemContent) {
                if (!e.ctrlKey) {
                    this.clearSelection();
                }
                return;
            }

            const id = itemContent.dataset.id;
            const type = itemContent.dataset.type;
            const mainTreeContainer = document.getElementById('treeContainer');
            if (e.ctrlKey) {
                this.toggleSelection(id);
            } else {
                if(type === 'folder' && e.target.closest('.item-icon') && this.viewMode==='list'){
                    const icon = e.target.closest('.folder-icon');
                    // 这一行保留：视觉上立即切换图标方向
                    // icon.classList.toggle('collapsed');
                    
                    // 防止误触面包屑导航逻辑（保持当前路径不变）
                    this.currentFolderId = document.querySelector('.breadcrumb-item:last-child')?.getAttribute('data-id') || 'root'; 
                    
                    // 调用刚才更新过的 toggleFolder 逻辑
                    this.toggleFolder(id, mainTreeContainer);
                    console.log(`单击切换文件夹 ${this.data.folders[id].name}的折叠状态`);
                } else {
                    this.selectItem(id);
                    if (type === 'folder') {this.currentFolderId = id}else{this.currentFolderId = 'root'}
                }
            }
            e.stopPropagation();
        });
        // 右侧按钮点击事件
        container.addEventListener('click', async(e) => {
            const button = e.target.closest('.item-actions button');
            if (!button) {
                this.hideContextMenu();
                return;
            };

            e.stopPropagation();
            const action = button.dataset.action;
            const id = button.dataset.id;
            // 调用公共方法
            switch(action) {
                case 'rename':
                    this.showRenameModal(id);
                    break;
                case 'newFolder':
                    this.showNewFolderModal(id);
                    break;
                case 'delete':
                    this.showDeleteModal([id]);
                    break;
                case 'open':
                    const item = this.data.items[id];
                    if (item) {
                        if (item.type === 'mindmap') { await this.openMindMap(id, item.name, true); }
                        else { window.open(item.url || item.Allurl, '_blank'); }
                    }
                    break;
                // 如果有其他自定义按钮逻辑，加在这里
            }
        });
        

        /**********************************************************************************************************
        // #region 拖拽事件监听
        ***********************************************************************************************************/
        this.containerContext(container);
        this.containerDragstart(container);
        this.containerDragend(container);
        this.containerDragover(document.querySelector('#bookmarkPanel'));
        this.containerDrop(container);
        this.breadcrumbDrop(document.querySelector('#breadcrumb'))

        document.addEventListener('drop', async(e) => {
            // 清理样式
            document.querySelectorAll('.drag-over-top, .drag-over-middle, .drag-over-bottom').forEach(el => {
                el.classList.remove('drag-over-top', 'drag-over-middle', 'drag-over-bottom');
            });
        })
        

    }
    // --- 新增辅助方法：清除定时器 ---
    _clearAutoExpandTimer() {
        if (this.autoExpandTimer) {
            clearTimeout(this.autoExpandTimer);
            this.autoExpandTimer = null;
        }
    }
    breadcrumbDrop(breadcrumb){
        breadcrumb.addEventListener('drop', async(e) => {
            e.preventDefault();
            e.stopPropagation();
            const breadItem=e.target.closest('.breadcrumb-item');
            console.log(breadItem)
            if (!breadItem) return;
            let targetId = breadItem.dataset.id;
            
            let draggedId=null;
            if (this.draggedMultipleIds){
                draggedId = this.draggedMultipleIds[0];
            }else if(this.dragHistoryItem && targetId){
                draggedId=await this.confirmNewItem(true,this.dragHistoryItem.textContent.trim(),
                                this.dragHistoryItem.href || this.dragHistoryItem.getAttribute('href'),'root')   // 先加入根目录但不渲染
                console.log('draggedId',draggedId)
                this.draggedMultipleIds=[draggedId];    // 加入可拖拽列表
            }
            if (this.canDrop(draggedId, targetId)) {
                this.moveMultipleItems(this.draggedMultipleIds, targetId, this.dragPosition).catch(console.error);
            }
            // 清理样式
            this.dragPosition = null;
            this.dragHistoryItem=null;
            this.draggedMultipleIds = null;
        })
    }
    containerContext(container){
        container.addEventListener('contextmenu', (e) => {
            const itemContent = e.target.closest('.item-content');
            e.preventDefault();
            if (itemContent) {
                const id = itemContent.dataset.id;
                const type = itemContent.dataset.type;
                if (!this.selectedIds.includes(id)) {
                    this.selectItem(id);
                }
                this.showContextMenu(e.clientX, e.clientY, id, type);
            }else{
                console.log('右击空白处')
                const bookmarkContainer=e.target.closest('.bookmark-manager-container')
                const id =bookmarkContainer.querySelector('.breadcrumb-item:last-child').getAttribute('data-id'); 
                const type = 'empty';
                this.showContextMenu(e.clientX, e.clientY, id, type);
            }
        });
    }
    containerDragstart(container){
        container.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            const historyItem=e.target.closest(currentCfg.historyItemSelector);
            if (currentWebsite==='腾讯元宝') {
                historyItem.setAttribute('href', 'https://yuanbao.tencent.com/chat/naQivTmsDa/'+historyItem.dataset.itemId);
            }
            if (historyItem && historyItem.getAttribute('href')){
                this.dragHistoryItem=historyItem;
                return
            }
            const itemContent = e.target.closest('.item-content');
            if (!itemContent) return;
            this.dragStartOffset = e.clientY - itemContent.getBoundingClientRect().top;

            // 获取被拖拽的ID
            const draggedId = itemContent.dataset.id;

            // 如果当前有多个选中项，且拖拽的是其中之一，则移动所有选中项
            if (this.selectedIds.length > 1 && this.selectedIds.includes(draggedId)) {
                // 移动所有选中项
                this.draggedMultipleIds = [...this.selectedIds];
            } else {
                // 只移动单个项
                this.draggedMultipleIds = [draggedId];
            }

            this.draggedElement = itemContent.closest('.tree-item');
            this.draggedElement.classList.add('dragging');

            const type = itemContent.dataset.type;
            if (type === 'item') {
                const item = this.data.items[draggedId];
                if (item && item.url) {
                    e.dataTransfer.setData('text/uri-list', item.url);
                    e.dataTransfer.setData('text/plain', item.url);
                }
            }

            e.dataTransfer.setData('text/plain', draggedId);
            e.dataTransfer.effectAllowed = 'move';

            // const hint = document.getElementById('dragHint');
            // hint.textContent = `移动 ${this.draggedMultipleIds.length} 个项目`;
            // hint.classList.add('show');
        });
    }
    containerDragend(container){
        container.addEventListener('dragend', (e) => {
            const itemContent = e.target.closest('.item-content');
            
            // 确保清除定时器
            this._clearAutoExpandTimer();

            // === 修复逻辑 C：拖拽结束（含取消），如果没有Drop进去，恢复原状 ===
            if (this.autoExpandedFolderId) {
                // 只折叠该文件夹，不重绘
                this._toggleFolderState(this.autoExpandedFolderId, false);
                this.autoExpandedFolderId = null;
            }

            if (!itemContent) return;

            e.stopPropagation();
            // ... (原有清理逻辑) ...
            if (this.draggedElement) {
                this.draggedElement.classList.remove('dragging');
            }
            this.draggedMultipleIds = null;
            this.draggedElement = null;
            this.dragPosition = null;

            document.querySelectorAll('.drag-over-top, .drag-over-middle, .drag-over-bottom').forEach(el => {
                el.classList.remove('drag-over-top', 'drag-over-middle', 'drag-over-bottom');
            });
        });
    }
    containerDragover(container){
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const breadItem=e.target.closest('.breadcrumb-item');
            if (breadItem){
                document.querySelectorAll('.drag-over-middle').forEach(el => {
                    if (el !== breadItem) {
                        el.classList.remove('drag-over-middle');
                    }
                });
                breadItem.classList.add('drag-over-middle');
                this.dragPosition = 'middle';
                return;
            }
            const itemContent = e.target.closest('.item-content');

            if (((!itemContent && !breadItem )|| (!this.draggedMultipleIds && !this.dragHistoryItem))) return;
            const targetId = itemContent.dataset.id;
            const targetType = itemContent.dataset.type;
            let draggedId=null;
            if (this.draggedMultipleIds) {
                draggedId = this.draggedMultipleIds[0];
                if (!this.canDrop(draggedId, targetId)) return;
            }

            const targetElement = itemContent.closest('.tree-item');
            const rect = itemContent.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const height = rect.height;

            // === 修复逻辑 A：检测是否离开了“自动展开的文件夹” ===
            if (this.autoExpandedFolderId && this.autoExpandedFolderId !== targetId) {
                const isMovingToChild = this.isDescendant(this.autoExpandedFolderId, targetId);
                
                if (!isMovingToChild) {
                    // 离开时，只操作 DOM 折叠它，不重新渲染
                    this._toggleFolderState(this.autoExpandedFolderId, false);
                    this.autoExpandedFolderId = null;
                }
            }
            

            // ... (中间的清理样式代码保持不变) ...
            document.querySelectorAll('.drag-over-top, .drag-over-middle, .drag-over-bottom').forEach(el => {
                if (el !== targetElement) {
                    el.classList.remove('drag-over-top', 'drag-over-middle', 'drag-over-bottom');
                }
            });

            let position = 'middle';
            if (targetType === 'folder') {
                if (y < height * 0.3) {
                    position = 'top';
                    targetElement.classList.add('drag-over-top');
                    targetElement.classList.remove('drag-over-middle', 'drag-over-bottom');
                    this._clearAutoExpandTimer();
                } else if (y > height * 0.7) {
                    position = 'bottom';
                    targetElement.classList.add('drag-over-bottom');
                    targetElement.classList.remove('drag-over-top', 'drag-over-middle');
                    this._clearAutoExpandTimer();
                } else {
                    position = 'middle';
                    targetElement.classList.add('drag-over-middle');
                    targetElement.classList.remove('drag-over-top', 'drag-over-bottom');

                    // === 修复逻辑 B：防抖自动展开 ===
                    // 检查状态：如果逻辑上还没展开
                    if (!this.expandedFolders.has(targetId)) {
                        if (!this.autoExpandTimer) {
                            this.autoExpandTimer = setTimeout(() => {
                                // 核心修改：使用 DOM 操作代替 render()
                                this._toggleFolderState(targetId, true);
                                
                                this.autoExpandedFolderId = targetId; 
                                this.autoExpandTimer = null;
                            }, 600); 
                        }
                    }
                }
            } else {
                // Item 类型
                this._clearAutoExpandTimer();
                // ... (Item 的位置判断逻辑保持不变) ...
                if (y < height * 0.5) {
                    position = 'top';
                    targetElement.classList.add('drag-over-top');
                    targetElement.classList.remove('drag-over-bottom', 'drag-over-middle');
                } else {
                    position = 'bottom';
                    targetElement.classList.add('drag-over-bottom');
                    targetElement.classList.remove('drag-over-top', 'drag-over-middle');
                }
            }
            this.dragPosition = position;
        });
    }
    containerDrop(container){
        container.addEventListener('drop', async(e) => {
            e.preventDefault();
            e.stopPropagation();
            // 无论drop成功与否，都要清除定时器
            this._clearAutoExpandTimer();
            console.log('鼠标释放')

            // 如果成功 Drop 进去了，我们希望文件夹保持展开（方便用户看到拖进去的东西）
            // 所以将 autoExpandedFolderId 清空，这样 dragend 就不会去折叠它了
            this.autoExpandedFolderId = null;
            const itemContent = e.target.closest('.item-content');
            const targetId = itemContent?.dataset.id;
            let draggedId=null;
            if (this.draggedMultipleIds){
                draggedId = this.draggedMultipleIds[0];
            }else if(this.dragHistoryItem && targetId){
                draggedId=await this.confirmNewItem(true,this.dragHistoryItem.textContent.trim(),
                                this.dragHistoryItem.href || this.dragHistoryItem.getAttribute('href'),'root')   // 先加入根目录但不渲染
                this.draggedMultipleIds=[draggedId];    // 加入可拖拽列表
            }
            
            if (this.canDrop(draggedId, targetId)) {
                this.moveMultipleItems(this.draggedMultipleIds, targetId, this.dragPosition).catch(console.error);
            }

            this.dragPosition = null;
            this.dragHistoryItem=null;
            this.draggedMultipleIds = null;
        });
    }

/**********************************************************************************************************
// #region 搜索功能
***********************************************************************************************************/
    initializeSearch(){
        const searchBtn = document.getElementById('searchBtn');
        const searchBarRow = document.getElementById('searchBarRow');
        const searchInput = document.getElementById('searchInput');
        const doSearchIcon = document.getElementById('doSearchIcon');

        // 1. 点击搜索按钮：切换搜索框显示
        searchBtn.addEventListener('click', async(e) => {
            e.stopPropagation();
            // if (!this.isFufei) {showTopToast('⚠️ 仅限付费用户使用~',2500);return;};
            // this.isFufei=await this.checkUIMM2(true);if (!this.isFufei) {return;};
            const isOpening = !searchBarRow.classList.contains('show');
            searchBarRow.classList.toggle('show');
            searchBtn.classList.toggle('active', isOpening);
            
            if (isOpening) {
                setTimeout(() => searchInput.focus(), 100); // 聚焦输入框
            } else {
                // 如果关闭搜索框，是否要自动清除搜索？
                // 通常不需要，用户可能只想收起框但保持结果。
                // 如果想关闭即清除，取消下面注释：
                /*
                this.searchKeyword = '';
                searchInput.value = '';
                this.applyFilter();
                */
            }
        });

        // 2. 执行搜索的方法
        const performSearch = () => {
            const val = searchInput.value.trim();
            this.searchKeyword = val;
            this.applyFilter(); // 执行逻辑
        };

        // 3. 回车搜索
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
        
        // 4. 点击右侧箭头搜索
        doSearchIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            performSearch();
        });
        
        // 5. 防止点击搜索框时关闭面板
        searchBarRow.addEventListener('click', (e) => e.stopPropagation());

        installLongPress(searchBtn, {
            delay: 600,
            onLongPress: () => {
                searchBarRow.classList.toggle('show',false);
                searchBtn.classList.toggle('active', false);
                this.searchKeyword = '';
                searchInput.value = '';
                this.applyFilter();
            }
        });
    }
    
    applyFilter() {
        this.filterCollapsedIds.clear(); 
        this.visibleIds.clear();
        
        // 检查是否有活跃的过滤条件
        const hasFilter = !!this.activeFilter;
        const hasSearch = this.searchKeyword && this.searchKeyword.trim() !== '';

        // 如果既没筛选也没搜索，恢复默认视图
        if (!hasFilter && !hasSearch) {
            this.render();
            // 确保移除空状态提示，显示原有内容
            return;
        }

        const currentHost = window.location.hostname;
        const lowerKeyword = hasSearch ? this.searchKeyword.toLowerCase().trim() : '';

        // 遍历所有 Item
        Object.values(this.data.items).forEach(item => {
            // 1. 检查类型筛选匹配
            const matchFilter = hasFilter ? this.checkItemMatch(item, currentHost) : true;
            
            // 2. 检查搜索关键词匹配 (匹配名称 或 URL)
            let matchSearch = true;
            if (hasSearch) {
                const name = (item.name || '').toLowerCase();
                const url = (item.url || item.Allurl || '').toLowerCase();
                matchSearch = name.includes(lowerKeyword) || url.includes(lowerKeyword);
            }

            // 3. 同时满足才算命中
            if (matchFilter && matchSearch) {
                this.visibleIds.add(item.id);

                // 递归添加父文件夹
                let parentId = item.parentId;
                while (parentId && parentId !== 'root') {
                    this.visibleIds.add(parentId);
                    if (this.data.folders[parentId]) {
                        parentId = this.data.folders[parentId].parentId;
                    } else {
                        break;
                    }
                }
            }
        });
        if (hasSearch) {
            Object.values(this.data.folders).forEach(folder => {
                // 如果有“类型筛选”(如只看思维导图)，通常不应该显示空文件夹，
                // 但如果用户明确搜索了文件夹名字，我们应该显示它。
                // 这里设定：如果有 activeFilter，则忽略文件夹搜索(除非你希望文件夹也受类型限制，但文件夹没有类型)
                // 或者策略改为：只要名字匹配就显示 (更符合直觉)
                
                const name = (folder.name || '').toLowerCase();
                
                // 只有当名字包含关键词，且(没有类型筛选 或 类型筛选允许显示文件夹)时
                // 简单起见，这里让搜索关键词拥有最高优先级：只要名字匹配就显示
                if (name.includes(lowerKeyword)) {
                    this.visibleIds.add(folder.id);
                    this._addParentPathToVisible(folder.parentId); // 使用辅助函数添加路径
                }
            });
        }

        // 渲染树（渲染函数会根据 visibleIds 过滤）
        this.render();
    }
    // [新增] 辅助函数：递归将父级文件夹加入 visibleIds，确保路径可见
    _addParentPathToVisible(parentId) {
        let currentId = parentId;
        while (currentId && currentId !== 'root') {
            // 如果已经在集合里，可以提前结束(优化性能)
            if (this.visibleIds.has(currentId)) break; 
            
            this.visibleIds.add(currentId);
            
            if (this.data.folders[currentId]) {
                currentId = this.data.folders[currentId].parentId;
            } else {
                break;
            }
        }
    }

    // 判断单个项目是否符合筛选条件
    checkItemMatch(item, currentHost) {
        switch (this.activeFilter) {
            case 'mindmap':
                return item.type === 'mindmap';
            case 'markdown':
                return item.type === 'markdown';
            case 'page':
                // 排除 mindmap 和 markdown，剩余的视为普通页面
                return item.type !== 'mindmap' && item.type !== 'markdown' && item.data.length > 0;
            case 'link':
                return item.data.length===0;
            case 'site':
                // 检查 url 或 Allurl 是否包含当前域名
                const url = item.url || item.Allurl || '';
                return url.includes(currentHost);
            default:
                return true;
        }
    }



/**********************************************************************************************************
// #region 右键菜单
***********************************************************************************************************/
    initializeContextMenu() {
        const menu = document.getElementById('contextMenuBM');

        menu.addEventListener('click', async(e) => {
            e.stopPropagation();
            // 注意：因为下拉菜单在 item 内部，点击下拉项也会冒泡到 item
            // 所以我们需要区分点击的是“主按钮”还是“下拉项”
            console.log('右键菜单点击')
            const menuItem = e.target.closest('.context-menu-item');
            if (!menuItem) return;

            const action = menuItem.dataset.action;
            const targetId = menuItem.dataset.targetId;
            const item = this.data.items[targetId];

            switch(action) {
                case 'rename':
                    this.showRenameModal(targetId);
                    this.hideContextMenu();
                    break;
                case 'delete':
                    if (this.selectedIds.length > 0) {
                        this.showDeleteModal(this.selectedIds);
                    }
                    this.hideContextMenu();
                    break;
                case 'newFolder':
                    this.showNewFolderModal(targetId);
                    this.hideContextMenu();
                    const embeddedTree=document.querySelector('.embedded-tree-content');
                    if (embeddedTree){
                        if (parseInt(menu.style.left) <= embeddedTree.getBoundingClientRect().right) {
                            this.embedded=true;console.log('新建嵌入文件夹')        // 表明是嵌入面板中点击的右键
                        }  
                    }
                    break;
                case 'open':
                    if (item.type==='mindmap') {await this.openMindMap(targetId,item.name,true)}
                    else{window.open(item.url || item.Allurl, '_blank');}
                    this.hideContextMenu();
                    break;
                // --- 新增：移动菜单展开逻辑 ---
                case 'move':
                    // 1. 获取相关元素
                    const moveMenu = document.getElementById('contextMoveMenu');
                    const moveBtn = menu.querySelector('[data-action="move"]'); // 获取移动按钮本身
                    const isShown = moveMenu.classList.contains('show');
                    
                    // 2. 先隐藏所有其他可能（如果有）
                    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
                    
                    if (!isShown) {
                        // 3. 生成内容
                        this.renderMoveToMenu(targetId, moveMenu);
                        
                        // 4. 先重置样式（默认向下、向左对齐）以便测量
                        moveMenu.style.top = '100%';
                        moveMenu.style.bottom = 'auto';
                        moveMenu.style.left = '0';
                        moveMenu.style.right = 'auto';
                        
                        // 5. 显示出来（此时浏览器会计算尺寸）
                        moveMenu.classList.add('show');

                        // 6. === 核心：边界检测与位置修正 ===
                        const menuRect = moveMenu.getBoundingClientRect();
                        const viewportHeight = window.innerHeight;
                        const viewportWidth = window.innerWidth;

                        // [垂直方向检测]：如果菜单底部超出了视口高度
                        if (menuRect.bottom > viewportHeight) {
                            // 改为向上弹出
                            moveMenu.style.top = 'auto';
                            moveMenu.style.bottom = '100%';
                            // 微调 margin，让它离按钮有一点间隙
                            moveMenu.style.marginBottom = '5px';
                            moveMenu.style.marginTop = '0';
                        } else {
                            // 保持向下，重置 margin
                            moveMenu.style.marginBottom = '0';
                            moveMenu.style.marginTop = '5px';
                        }

                        // [水平方向检测]：如果菜单右侧超出了视口宽度
                        // 因为你的面板在右侧，右键菜单很可能紧贴右边缘
                        if (menuRect.right > viewportWidth) {
                            // 改为右对齐（即菜单往左延伸）
                            moveMenu.style.left = 'auto';
                            moveMenu.style.right = '0';
                        }
                        
                    } else {
                        moveMenu.classList.remove('show');
                    }
                    break;
            }
            
            // 对于非 move 操作，关闭菜单
            if (action !== 'move') {
                this.hideContextMenu();
            }
        });
    }
    showContextMenu(x, y, targetId, type) {
        const menu = document.getElementById('contextMenuBM');
        const moveMenu = document.getElementById('contextMoveMenu');
        if (moveMenu) moveMenu.classList.remove('show');
        menu.style.display = 'block';

        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.dataset.targetId = targetId;
        });
        const targetItem = this.data.items[targetId];
        const renameItem = menu.querySelector('[data-action="rename"]');
        const deleteItem = menu.querySelector('[data-action="delete"]');
        const bar=menu.querySelector('#context-menu-bar');

        const openItem = menu.querySelector('[data-action="open"]');
        const newFolderItem = menu.querySelector('[data-action="newFolder"]');
        const moveItem = menu.querySelector('[data-action="move"]');
        // 将 targetId 绑定到 Move 按钮上，方便后续读取
        moveItem.dataset.targetId = targetId;

        if (type === 'folder'||type === 'empty') {
            newFolderItem.style.display = 'flex';
            openItem.style.display = 'none';
            if (type === 'folder'){
                moveItem.style.display = 'flex';
                renameItem.style.display = 'flex';
                deleteItem.style.display = 'flex';
                bar.style.display = 'flex';
            }else{
                moveItem.style.display = 'none';
                renameItem.style.display = 'none';
                deleteItem.style.display = 'none';
                bar.style.display = 'none';                
            }
        }else {
            newFolderItem.style.display = 'none';
            openItem.style.display = 'flex';
            openItem.querySelector('.menu-text').textContent = targetItem.type==='mindmap'? getI18nText('bookmarks.ctx_tabview') : getI18nText('bookmarks.ctx_open_link');
            moveItem.style.display = 'flex';
            renameItem.style.display = 'flex';
            deleteItem.style.display = 'flex';
            bar.style.display = 'flex';
        }

        // 根据精简后的实际菜单尺寸进行边界校正。
        const menuRect = menu.getBoundingClientRect();
        const maxX = Math.max(0, window.innerWidth - menuRect.width);
        const maxY = Math.max(0, window.innerHeight - menuRect.height);
        menu.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
        menu.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
        
    }

    hideContextMenu() {
        document.getElementById('contextMenuBM').style.display = 'none';
    }
/**********************************************************************************************************
// #region 下拉菜单
***********************************************************************************************************/
    initializeCustomDropdown(dropdownId, modalId) {
        const dropdown = document.getElementById(dropdownId);
        const display = dropdown.querySelector('.dropdown-display');
        const menu = dropdown.querySelector('.dropdown-menu');
        const textElement = display.querySelector('.dropdown-text');

        menu.innerHTML = '';
        const handleClick = (folderId, displayName) => {
            textElement.innerHTML = displayName;
            dropdown.dataset.selectedValue = folderId;
            menu.classList.remove('show');
            display.classList.remove('open');
            this.renderSelectedItem(dropdown.querySelector(`[data-value="${folderId}"]`));
        };

        // 2. 定义过滤逻辑：模态框通常显示所有文件夹
        // (filterFn 返回 true 表示显示该文件夹)
        const filterFn = (folderId) => true;

        // 3. 调用通用渲染函数 (复用右键菜单的渲染逻辑)
        // 这里的 '📂 根目录' 参数决定了是否显示根节点
        this.renderTreeToContainer(menu, filterFn, handleClick, `📂 ${this.rootDir}`);
        
        // 4. 视觉状态同步：高亮当前选中的项目
        const currentVal = dropdown.dataset.selectedValue || 'root';
        const selectedItem = menu.querySelector(`[data-value="${currentVal}"]`);
        this.renderSelectedItem(selectedItem)
    }

    renderSelectedItem(selectedItem) {  // 新增：高亮选中项
        if (!selectedItem) return;
        if (selectedItem) {
            document.querySelectorAll('.dropdown-menu .dropdown-item').forEach(item => {
                item.classList.remove('selected');
            })
            // 给选中的项添加一点背景色，方便识别
            selectedItem.classList.add('selected');
        }
    }

    async togglePanel() {
        const panel = document.getElementById('bookmarkPanel');
        const toggle = document.getElementById('favBtn');
        panel.classList.toggle('open');
        toggle.classList.toggle('hide-btn');
    }

    navigateTo(folderId) {
        this.currentFolderId = folderId;
        this.render();
        this.clearSelection();
        this.currentFolderId = folderId;
    }
/**********************************************************************************************************
// #region 渲染面包屑导航和收藏夹树
***********************************************************************************************************/
    render() {
        this.renderBreadcrumb();
        this.renderTree();
        this.renderEmbed();
    }
    async renderEmbed(){
        const embeddedBreadcrumb=document.querySelector('.embedded-breadcrumb');
        if (embeddedBreadcrumb) this.renderEmbeddedView(embeddedBreadcrumb,document.querySelector('.embedded-tree-content'))
    }

    renderBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        const parts = [];

        let currentId = this.currentFolderId;
        while (currentId !== 'root' && currentId) {
            const folder = this.data.folders[currentId];
            if (folder) {
                parts.unshift({ id: currentId, name: folder.name });
                currentId = folder.parentId;
            } else {
                break;
            }
        }
        let html = `<span class="breadcrumb-item" data-id="root" data-i18n="bookmarks.root_dir">${this.rootDir}</span>`;
        parts.forEach(part => {
            html += `<span class="breadcrumb-separator">/</span>
                    <span class="breadcrumb-item" data-id="${part.id}">${part.name}</span>`;
        });

        breadcrumb.innerHTML = html;
    }

    renderTree() {
        const container = document.getElementById('treeContainer');
        const viewBtnIcon = document.querySelector('#viewToggleBtn i');
        // 1. 更新按钮图标
        if (viewBtnIcon) {
            viewBtnIcon.className = this.viewMode === 'grid' ? 'fa-solid fa-border-all' : 'fa-solid fa-list';
        }

        // --- 新增：检测是否处于筛选/搜索模式且无结果 ---
        const isFiltering = this.activeFilter || (this.searchKeyword && this.searchKeyword.trim() !== '');
        
        // 如果正在筛选，但 visibleIds 为空（且不是因为还没有 items，而是没匹配到）
        // 注意：visibleIds 只存 ID，如果筛选结果为0，它就是空的
        if (isFiltering && this.visibleIds.size === 0) {
            let msg = '没有找到匹配的内容';
            if (this.activeFilter && this.searchKeyword) msg = '没有符合当前筛选和搜索条件的内容';
            else if (this.activeFilter) msg = '当前筛选条件下没有内容';
            else if (this.searchKeyword) msg = `没有找到包含 "${this.searchKeyword}" 的内容`;

            container.innerHTML = `
                <div class="empty-result-state">
                    <i class="fa-regular fa-folder-open"></i>
                    <p>${msg}</p>
                    <span class="reset-filter-link" id="resetFilterBtn">清除条件</span>
                </div>
            `;
            
            // 绑定清除按钮事件
            container.querySelector('#resetFilterBtn').addEventListener('click', () => {
                this.clearAllFilters();
            });
            return;
        }
        // ---------------------------------------------

        const children = this.getChildren(this.currentFolderId);
        
        // 原有的空文件夹处理（仅在非筛选模式下生效，或者筛选模式下确实该文件夹为空且不在路径上）
        // 但由于我们上面的 applyFilter 逻辑，如果 visibleIds 有值，这里就会渲染出来
        
        if (children.length === 0 && !isFiltering) {
             // ... 原有的 empty-state 代码 (暂无收藏内容) ...
             container.classList.remove('grid-view');
             container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                    </svg>
                    <p style="margin-bottom: 12px" data-i18n="bookmarks.no_bookmark">${getI18nText('bookmarks.no_bookmark')}</p>
                    <button class="btn btn-primary" data-action="create-first-folder" data-i18n="bookmarks.first_folder">${getI18nText('bookmarks.first_folder')}</button>
                </div>
            `;
             // ... 绑定事件 ...
             const btn = container.querySelector('[data-action="create-first-folder"]');
             if (btn) {      
                 btn.addEventListener('click', (e) => {
                     this.showNewFolderModal(this.currentFolderId);
                 });
             }
             return;
        }

        let html = '';
        if (this.viewMode === 'grid') {
            // --- 网格模式 ---
            container.classList.add('grid-view'); // 添加 CSS Grid 类
            
            // 网格模式下，只渲染当前层级的 children，不需要递归 renderFolderContent
            // 也不显示 "展开/折叠" 的小三角，文件夹仅作为导航入口
            
            // 先渲染文件夹
            const folders = children.filter(id => this.data.folders[id]);
            folders.forEach(folderId => {
                // 筛选模式下检查可见性
                if (isFiltering && !this.visibleIds.has(folderId)) return;
                html += this.renderGridNode(folderId, 'folder'); // 调用新的网格渲染辅助函数
            });

            // 再渲染文件
            const items = children.filter(id => this.data.items[id]);
            items.forEach(itemId => {
                if (isFiltering && !this.visibleIds.has(itemId)) return;
                html += this.renderGridNode(itemId, 'item');
            });

        } else {
            // --- 列表模式 (原有逻辑) ---
            container.classList.remove('grid-view');
            
            const folders = children.filter(id => this.data.folders[id]);
            folders.forEach(folderId => {
                html += this.renderFolderNode(folderId); // 原有函数
            });

            const items = children.filter(id => this.data.items[id]);
            items.forEach(itemId => {
                html += this.renderItemNode(itemId); // 原有函数
            });
        }

        // 再次兜底：如果当前文件夹有子项，但都被筛选过滤掉了（html为空），显示空状态
        if (html === '' && isFiltering) {
             container.innerHTML = `
                <div class="empty-result-state">
                    <p>此文件夹下没有匹配内容</p>
                </div>
            `;
        } else {
            container.innerHTML = html;
            this.addOverflowTooltips(container);
        }
    }

    clearAllFilters() {
        this.activeFilter = null;
        // 清除搜索
        this.searchKeyword = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('searchBarRow').classList.remove('show');
        document.getElementById('searchBtn').classList.remove('active');
        
        this.applyFilter();
    }

/**********************************************************************************************************
// #region 新增内容渲染
***********************************************************************************************************/
    renderFolderContent(folderId) {
        const children = this.getChildren(folderId);
        if (children.length === 0) return '';

        let html = '';
        const folders = children.filter(id => this.data.folders[id]);
        const items = children.filter(id => this.data.items[id]);

        folders.forEach(childFolderId => {
            html += this.renderFolderNode(childFolderId);
        });

        items.forEach(itemId => {
            html += this.renderItemNode(itemId);
        });

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        this.addOverflowTooltips(tempDiv);
        return tempDiv.innerHTML;
    }
    /* ============== 增量更新原子函数 ============== */
    renderFolderNode(folderId) {
        // 1. 检查筛选状态
        const isFiltering = this.activeFilter || (this.searchKeyword && this.searchKeyword.trim() !== '');
        
        // 2. 筛选模式下的可见性检查
        if (isFiltering && !this.visibleIds.has(folderId)) {
            return ''; 
        }

        const folder = this.data.folders[folderId];
        
        // === 3. 核心修复：决定展开状态 ===
        let isExpanded;
        if (isFiltering) {
            // 筛选模式：默认展开 (true)，除非它在“被手动折叠集合”中
            isExpanded = !this.filterCollapsedIds.has(folderId);
        } else {
            // 普通模式：读取持久化的展开状态
            isExpanded = this.expandedFolders.has(folderId);
        }

        const childCount = this.getChildren(folderId).length;
        const isSelected = this.selectedIds.includes(folderId);
        
        return `
            <div class="tree-item folder ${isSelected ? 'selected' : ''}" data-id="${folderId}" data-type="folder">
                <div class="item-content" data-id="${folderId}" data-type="folder" draggable="true">
                    <!-- 根据 isExpanded 决定图标方向 -->
                    <div class="item-icon folder-icon ${isExpanded ? '' : 'collapsed'}"></div>
                    <span class="item-text">${folder.name}</span>
                    <div class="item-actions">
                        <button data-action="rename" data-id="${folderId}" data-i18n-title="bookmarks.ctx_rename" title="重命名">
                            <i class="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button data-action="newFolder" data-id="${folderId}" data-i18n-title="bookmarks.ctx_new_folder" title="新建子文件夹">
                            <i class="fa-solid fa-folder-plus"></i>
                        </button>
                        <button class="danger" data-action="delete" data-id="${folderId}" data-i18n-title="bookmarks.ctx_delete" title="删除">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </div>
                <!-- 根据 isExpanded 决定子级是否显示 -->
                <div class="children ${isExpanded ? 'expanded' : ''}" data-id="${folderId}">
                    ${childCount > 0 ? this.renderFolderContent(folderId) : ''}
                </div>
            </div>
        `;
    }
    renderItemNode(itemId) {
        // --- 修改开始：同时检查筛选和搜索状态 ---
        const isFiltering = this.activeFilter || (this.searchKeyword && this.searchKeyword.trim() !== '');
        
        if (isFiltering && !this.visibleIds.has(itemId)) {
            return '';
        }
        // --- 修改结束 ---

        const item = this.data.items[itemId];
        const isSelected = this.selectedIds.includes(itemId);
        let iconHtml=null;
        if (item.type==='markdown'){
            iconHtml='📜';
        }else if(item.type==='mindmap'){
            iconHtml='🧠';
        }else{
            if(item.data.length>0){
                iconHtml='⭐';
            }else{
                iconHtml='❤️';
            }
        }
        return `
            <div class="tree-item item ${isSelected ? 'selected' : ''}" data-id="${itemId}" data-type="item">
                <div class="item-content" data-id="${itemId}" data-type="item" draggable="true">
                    <div class="item-icon">
                        ${iconHtml}
                    </div>
                    <span class="item-text">${item.name}</span>
                    <div class="item-actions">
                        <button data-action="rename" data-id="${itemId}" data-i18n-title="bookmarks.ctx_rename" title="重命名">
                            <i class="fa-regular fa-pen-to-square"></i>
                        </button>
                        ${item.type!='mindmap' ? `
                            <button data-action="open" data-id="${itemId}" data-i18n-title="bookmarks.ctx_open_link" title="打开链接">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                            </button>
                        ` :`<button data-action="open" data-id="${itemId}" data-i18n-title="bookmarks.ctx_tabview" title="新窗口打开">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                            </button>`}
                        <button class="danger" data-action="delete" data-id="${itemId}" data-i18n-title="bookmarks.ctx_delete" title="删除">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderNode(id) { // ① 返回单个节点 HTML
        const f = this.data.folders[id], i = this.data.items[id];
        if (f) return this.viewMode==='list'?this.renderFolderNode(id):this.renderGridNode(id,'folder');
        if (i) return this.viewMode==='list'?this.renderItemNode(id):this.renderGridNode(id,'item');
        return '';
    }
    renderInsertNode(id, parentId = 'root') { // ② 新增节点插到合适位置
        // 1. [基础修复] 精确获取主面板当前显示的 ID
        const mainBreadcrumb = document.getElementById('breadcrumb');
        const mainCurrentId = mainBreadcrumb?.querySelector('.breadcrumb-item:last-child')?.getAttribute('data-id') || 'root';
        this.currentFolderId = mainCurrentId; 

        // 2. [刷新逻辑] 如果是从空变有 (0->1)，且目标是当前视图，直接重绘
        const children = this.getChildren(parentId); 
        const isEmptyFolder = children.length === 1; 
        
        if (isEmptyFolder) {
            // 如果是主面板当前文件夹，或嵌入面板当前文件夹
            if (parentId === mainCurrentId || (this.embeddedCurrentId && parentId === this.embeddedCurrentId)) {
                this.render();
                // 额外刷新嵌入视图，确保"暂无内容"消失
                if (this.embeddedCurrentId && parentId === this.embeddedCurrentId) {
                    const embedBread = document.querySelector('.embedded-breadcrumb');
                    const embedContent = document.querySelector('.embedded-tree-content');
                    if (embedBread && embedContent) this.renderEmbeddedView(embedBread, embedContent);
                }
                return;
            }
        }

        // 3. [核心逻辑] 预计算：是否匹配当前站点
        const item = this.data.items[id];
        const isItem = !!item;
        const currentHost = window.location.hostname;
        
        // 判定该项目是否属于当前站点 (仅针对 item，文件夹默认允许)
        let matchesSite = true;
        if (isItem) {
            const url = item.url || item.Allurl || '';
            matchesSite = url.includes(currentHost);
        }

        // 4. [核心逻辑] 预生成 HTML
        // HTML_Normal: 用于主面板 (受全局筛选影响)
        const htmlNormal = this.renderNode(id);
        
        // HTML_Force: 用于嵌入面板 (如果匹配站点，强制生成，忽略主面板筛选)
        let htmlForce = htmlNormal;
        
        // 如果主面板正在筛选(导致 htmlNormal 为空)，但该项目匹配当前站点，我们需要"伪造"可见性来生成 HTML
        const isFiltering = this.activeFilter || (this.searchKeyword && this.searchKeyword.trim() !== '');
        if (isFiltering && !htmlNormal && matchesSite) {
            this.visibleIds.add(id); // 临时加入可见列表
            htmlForce = this.renderNode(id);
            this.visibleIds.delete(id); // 恢复原状
        }

        // 5. 收集目标容器
        const targets = [];
        // [A] 主面板根视图
        if (parentId === mainCurrentId) {
            const mainTree = document.getElementById('treeContainer');
            if (mainTree) targets.push(mainTree);
        }
        // [B] 嵌入面板根视图
        if (this.embeddedCurrentId && parentId === this.embeddedCurrentId) {
            const embedContent = document.querySelector('.embedded-tree-content');
            if (embedContent) {
                const inner = embedContent.querySelector('.embedded-items-container') || embedContent;
                targets.push(inner);
            }
        }
        // [C] 已展开的子文件夹
        if (parentId !== 'root') {
            const childContainers = document.querySelectorAll(`.children[data-id="${parentId}"]`);
            childContainers.forEach(el => targets.push(el));
        }

        const uniqueTargets = [...new Set(targets)]; 

        // 6. 遍历插入
        uniqueTargets.forEach(cnt => {
            // 移除空状态
            const emptyState = cnt.querySelector('.empty-state, .empty-result-state');
            if (emptyState) emptyState.remove();

            // === 判断当前容器是否属于嵌入面板 ===
            const isEmbedCnt = cnt.closest('.embedded-tree-content');

            // === [关键修复] 嵌入面板的特殊插入逻辑 ===
            if (isEmbedCnt) {
                // 如果是 Item 且不匹配当前站点，坚决不显示
                if (isItem && !matchesSite) {
                    return; 
                }
                // 如果匹配，使用强制生成的 HTML (防止因主面板筛选而导致空白)
                if (htmlForce) {
                    cnt.insertAdjacentHTML('beforeend', htmlForce);
                }
            } 
            // === 主面板插入逻辑 ===
            else {
                // 如果是 embedded=true (显式要求嵌入操作)，则不操作主面板
                // 但通常 embedded 默认为 false，我们只通过容器类型判断
                if (htmlNormal) {
                    cnt.insertAdjacentHTML('beforeend', htmlNormal);
                }
            }

            // [视觉优化] 强制展开子菜单
            // if (cnt.classList.contains('children')) {
            //     cnt.classList.add('expanded');
            //     const parentItem = cnt.closest('.tree-item');
            //     if (parentItem) {
            //         const icon = parentItem.querySelector('.folder-icon');
            //         if (icon) icon.classList.remove('collapsed');
            //     }
            // }
        });
    }
    renderDeleteNode(id) {                                // ③ 删除节点
        document.querySelectorAll(`.tree-item[data-id="${id}"]`).forEach(el=>{
            el.remove();
        });
        
    }
    renderRenameNode(id, newName) {                      // ④ 重命名节点
        document.querySelectorAll(`.tree-item[data-id="${id}"] .item-text`).forEach(el=>{
            el.textContent = newName;
            this.addOverflowTooltips(el.closest('.tree-container'));
        });
        
    }
    /* ⑤ 移动专用：只重绘两个文件夹的内容 */
    refreshOneFolder(folderId) {
        console.log('移动了节点');
        const cnt = document.querySelector(`.children[data-id="${folderId}"]`);
        if (!cnt) return;
        // cnt.innerHTML = this.renderFolderContent(folderId); // 已有函数，复用
        cnt.insertAdjacentHTML('beforeend', this.renderFolderContent(folderId));
        console.log(this.renderFolderContent(folderId));
        this.addOverflowTooltips(cnt);
    }

    /**
     * [还原] 切换文件夹折叠状态 (仅限主面板/侧边栏)
     * @param {string} folderId 
     */
    toggleFolder(folderId) {
        // 1. 固定操作主面板容器
        const scope = document.getElementById('treeContainer');
        if (!scope) return;

        // 2. 判断当前主面板的模式
        const isFiltering = this.activeFilter || (this.searchKeyword && this.searchKeyword.trim() !== '');
        let isNowExpanded = false;

        if (isFiltering) {
            // === 筛选模式 (操作 filterCollapsedIds) ===
            // 这是一个临时状态集合
            if (this.filterCollapsedIds.has(folderId)) {
                this.filterCollapsedIds.delete(folderId); // 移除 = 展开
                isNowExpanded = true;
            } else {
                this.filterCollapsedIds.add(folderId);    // 添加 = 折叠
                isNowExpanded = false;
            }
        } else {
            // === 普通模式 (操作 expandedFolders) ===
            // 这是一个持久化状态集合
            if (this.expandedFolders.has(folderId)) {
                this.expandedFolders.delete(folderId);
                isNowExpanded = false;
            } else {
                this.expandedFolders.add(folderId);
                isNowExpanded = true;
            }
            // 保存到本地存储
            chrome.storage.local.set({ 'expandedFolders': [...this.expandedFolders] });
        }

        // 3. 更新 UI (调用通用的 DOM 更新函数)
        this._toggleFolderState(folderId, isNowExpanded, scope);
    }
    // 折叠文件夹时渲染————删除所有子项
    renderMultiDelete(folderId) {
        const children = this.getChildren(folderId);
        children.forEach(id => {
            if (this.data.folders[id] && this.expandedFolders.has(folderId)) {
                this.renderMultiDelete(id);
            }else{
                this.renderDeleteNode(id);
            }
        });
    }
    // === 新增辅助方法：只操作 DOM，不重绘整个树 ===
    /**
     * [修改] 只操作 DOM，不重绘整个树
     * @param {string} folderId 
     * @param {boolean} isExpanded 
     * @param {HTMLElement} scopeElement - [新增] 限定查找范围的容器
     */
    _toggleFolderState(folderId, isExpanded, scopeElement = document) {
        // 使用 scopeElement 而不是 document，确保只操作当前面板
        const folderEl = scopeElement.querySelector(`.tree-item[data-id="${folderId}"]`);
        
        if (!folderEl) return; // 如果在当前范围内没找到（比如在筛选模式下该文件夹被隐藏），直接返回

        const childrenContainer = folderEl.querySelector(`.children[data-id="${folderId}"]`);
        const icon = folderEl.querySelector('.folder-icon');

        if (isExpanded) {
            // --- 展开逻辑 ---
            // 注意：这里我们只更新 UI，状态的持久化在调用层处理
            if (icon) icon.classList.remove('collapsed');
            
            if (childrenContainer) {
                if (!childrenContainer.innerHTML.trim()) {
                    // 如果内容为空，需要重新渲染内容
                    // 注意：renderFolderContent 可能会依赖 visibleIds，确保调用上下文正确
                    // 简单起见，这里直接渲染，但在嵌入模式下可能需要特殊处理
                    // 鉴于嵌入模式默认已经生成了结构，这里通常只需要切换 class
                    childrenContainer.innerHTML = this.renderFolderContent(folderId);
                }
                childrenContainer.classList.add('expanded');
            }
        } else {
            // --- 折叠逻辑 ---
            if (icon) icon.classList.add('collapsed');
            if (childrenContainer) childrenContainer.classList.remove('expanded');
        }
    }

    showModal(modalId) {
        document.body.classList.add('modal-open');  // 添加模糊标记
        document.getElementById(modalId).classList.add('show');
    }
    
    hideModal(modalId) {
        document.body.classList.remove('modal-open');  // 移除模糊标记
        document.getElementById(modalId).classList.remove('show');
        setTimeout(()=>{this.embedded=false;},500);
    }
    // 新增：渲染网格/卡片节点
    renderGridNode(id, type) {
        // 必须检查当前是否处于筛选/搜索模式，且该 ID 是否在可见集合中
        const isFiltering = this.activeFilter || (this.searchKeyword && this.searchKeyword.trim() !== '');
        
        if (isFiltering && !this.visibleIds.has(id)) {
            return ''; // 如果不匹配，不渲染
        }
        const isSelected = this.selectedIds.includes(id);
        let name = '';
        let iconHtml = '';

        if (type === 'folder') {
            const folder = this.data.folders[id];
            name = folder.name;
            iconHtml = '📂'; // 简单起见，或者用 SVG
        } else {
            const item = this.data.items[id];
            name = item.name;
            if (item.type==='markdown'){
                iconHtml='📜';
            }else if(item.type==='mindmap'){
                iconHtml='🧠';
            }else{
                if(item.data.length>0){
                    iconHtml='⭐';
                }else{
                     iconHtml='❤️';
                }
            }
        }

        // 注意：这里使用 item-content 类是为了复用你原有的 click/dblclick/drag 事件监听
        // 但是我们不添加 item-actions (编辑/删除按钮)，因为网格里放不下，后续靠右键菜单
        return `
            <div class="tree-item grid-item ${isSelected ? 'selected' : ''}" data-id="${id}" data-type="${type}">
                <div class="item-content" data-id="${id}" data-type="${type}" draggable="true" style="flex-direction:column; padding:0; border:none; background:transparent;">
                    <div class="item-icon" style="margin:0; width:auto; height:auto; font-size:32px; margin-bottom:8px;">
                        ${iconHtml}
                    </div>
                    <span class="item-text" title="${name}">${name}</span>
                </div>
            </div>
        `;
    }
/**********************************************************************************************************
// #region 渲染移动菜单
***********************************************************************************************************/
    renderMoveToMenu(sourceId, container) {
        const sourceItem = this.data.folders[sourceId] || this.data.items[sourceId];
        if (!sourceItem) return;

        // 定义过滤逻辑 (复杂的移动限制)
        const filterFn = (folder) => {
            // 1. 不能是自己
            const isSelf = (sourceId === folder.id);
            // 2. 不能是当前父文件夹 (原地不动)
            const isParent = (sourceItem.parentId === folder.id);
            // 3. 如果源是文件夹，不能移动到自己的子孙里
            let isChild = false;
            if (this.data.folders[sourceId]) {
                isChild = this.isDescendant(sourceId, folder.id); 
            }
            return !isSelf && !isParent && !isChild;
        };

        // 定义点击回调
        const handleClick = async (targetFolderId) => {
            console.log(`执行移动: ${sourceId} -> ${targetFolderId}`);
            let idsToMove = [sourceId];
            if (this.selectedIds.includes(sourceId)) {
                idsToMove = [...this.selectedIds];
            }

            try {
                for (const id of idsToMove) {
                    await this.moveItem(id, targetFolderId, 'middle');
                }
                await this.saveToStorage();
                this.render();
                this.hideContextMenu(); // 移动完成后关闭右键菜单
            } catch (err) {
                console.log('移动失败', err);
            }
        };

        // 如果已经在根目录，就不显示"根目录"选项
        const rootName = sourceItem.parentId === 'root' ? null : `📂 ${this.rootDir}`;

        this.renderTreeToContainer(container, filterFn, handleClick, rootName, sourceId);
    }

/**********************************************************************************************************
// #region 通用树形菜单渲染
***********************************************************************************************************/
    /**
     * @param {HTMLElement} container - 容器元素
     * @param {Function} filterFn - 过滤函数 (folder) => boolean
     * @param {Function} clickCallback - 点击回调 (folderId, displayName) => void
     * @param {string|null} rootName - 根目录名称，传 null 则不显示
     */
    renderTreeToContainer(container, filterFn, clickCallback, rootName = `📂 ${this.rootDir}`, skipFolderId = null) {
        container.innerHTML = '';

        if (rootName) {
            const rootItem = document.createElement('div');
            rootItem.className = 'dropdown-item';
            rootItem.dataset.value = 'root';
            rootItem.innerHTML = `<span class="tree-unit"></span><span class="folder-label">${rootName}</span>`;
            
            rootItem.addEventListener('click', (e) => {
                e.stopPropagation();
                clickCallback('root', rootName);
            });
            container.appendChild(rootItem);
        }

        const generateOptions = (parentId, depthGuides) => {
            const childrenIds = this.getChildren(parentId);
            
            // 【核心修复】：不要在这里 filterFn 过滤掉节点！否则它的子文件夹就断代了。仅过滤出存在的 folder 即可。
            const allFolders = childrenIds
                .map(id => this.data.folders[id])
                .filter(folder => folder);

            allFolders.forEach((folder, index) => {
                const isLast = index === allFolders.length - 1;
                const isFirstItem = (parentId === 'root' && index === 0);
                
                // 判断是否允许被选中移动进去
                const canSelect = filterFn(folder);

                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.dataset.value = folder.id;
                
                // 【新增视觉反馈】：如果不允许移动，将其置灰，不可点击
                if (!canSelect) {
                    item.style.opacity = '0.5';
                    item.style.cursor = 'not-allowed';
                    item.style.background = 'transparent';
                }
                
                let html = '';
                depthGuides.forEach(hasLine => {
                    html += `<span class="tree-unit ${hasLine ? 'vertical' : ''}"></span>`;
                });
                
                const markerType = isLast ? 'last' : 'branch';
                const firstClass = isFirstItem ? 'is-first' : '';
                
                html += `<span class="tree-unit ${markerType} ${firstClass}"></span>`;
                html += `<span class="folder-label">📂 ${folder.name}</span>`;
                
                item.innerHTML = html;
                
                if (canSelect) {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        clickCallback(folder.id, `📂 ${folder.name}`);
                    });
                } else {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation(); // 阻止冒泡，不执行移动
                    });
                }
                
                container.appendChild(item);

                // 【优化】：如果是正在移动的那个文件夹本身，就别遍历它的子项了（防无限循环，且界面更清爽）
                if (folder.id !== skipFolderId) {
                    const nextGuides = [...depthGuides, !isLast];
                    generateOptions(folder.id, nextGuides);
                }
            });
        };

        generateOptions('root', []);
        
        if (container.children.length === 0) {
            container.innerHTML = '<div style="padding:12px;color:#94a3b8;font-size:12px;text-align:center;">无文件夹</div>';
        }
    }
/**********************************************************************************************************
// #region 数据打开逻辑
***********************************************************************************************************/
    async open_MultipleQA(selectedIds,action,sidebar=false) {
        try {
            const selectedItems = selectedIds
                                .filter(id => this.data.items.hasOwnProperty(id))
                                .filter(id => this.data.items[id].type !== 'mindmap')
                                .map(id => this.data.items[id])
                                // .reverse(); // 反转数组
            
            // 并发执行所有 buildQAList
            const fileName = selectedItems[0].name;
            const qaPromises = selectedItems.map(async item => {
                if (item.type === 'markdown') {
                    return await idbGet(item.data);
                } else {
                    return buildQAList(item); // 对于其他类型，调用 buildQAList
                }
            });
            const qaResults = await Promise.all(qaPromises);
            
            // 将二维数组扁平化
            const QAList = qaResults.flat();
            if (QAList.length === 0) {
                showTopToast(getI18nText('toast.no_bookmark'));
            }else{
                const item0=this.data.items[selectedIds[0]];
                openQAdata(QAList,fileName,action,sidebar,item0.url||item0.Allurl||'');
                // console.log('成功打开多项目');
            }
        } catch (error) {
            console.log('预览多项目失败:', error);
        }
    }
    async openMindMap(id,fileName,newTab=false, sidebar=false,options = {}){    // 打开思维导图
        // if (!this.isFufei) {showTopToast('⚠️ 仅限付费用户使用~',2500);return;};
        this.isFufei=await this.checkUIMM2(true);if (!this.isFufei) {return;};
        const refkey=`MindMapData.__REF__${id}-extra`;
        const MindMapData = await idbGet([refkey]) || {};
        try {
            // 打开预览窗口
            let win=null;
            await chrome.storage.local.set({'MindMapData': MindMapData, 'currentFileID': id,'MindMapAction':'open','fileName':fileName});// 防止刷新后数据丢失
            if (currentWebsite === 'MindMapHtml' && !newTab ) {
                try{
                    await updateState(MindMapData,id,fileName);     // 如果已经打开了MindMap.html，直接渲染
                    console.log('就地渲染思维导图');
                }catch(e){
                    console.log('[openMindMap] 渲染问答对话失败:', e);
                }
            }else{
                if (sidebar) {
                    chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL',path:'HTML/MindMap.html?view=sidepanel'});
                }else{
                    const previewUrl = options.previewUrl || chrome.runtime.getURL('HTML/MindMap.html');
                    win = window.open(previewUrl, '_blank','noopener=yes');
                }
                // if (!win) {
                //     console.log('[openMindMap] 弹窗被浏览器阻止');
                //     return false;
                // }
            }
            return true;
        } catch (error) {
            console.log('[openMindMap] 打开预览失败:', error);
            
            // 特定错误处理
            if (error.name === 'QuotaExceededError') {
                alert('数据太大，无法预览。请减少内容或分批预览。');
            } else if (error.name === 'SecurityError') {
                alert('安全限制：无法在当前上下文中打开预览。');
            }
        }
    }
/**********************************************************************************************************
// #region 重命名
***********************************************************************************************************/
    showRenameModal(id) {
        const item = this.data.folders[id] || this.data.items[id];
        document.getElementById('renameInput').value = item.name;
        document.getElementById('renameModal').dataset.id = id;
        this.showModal('renameModal');
        document.getElementById('renameInput').focus();
        document.getElementById('renameInput').select();
    }

    async confirmRename() {
        const id = document.getElementById('renameModal').dataset.id;
        const newName = document.getElementById('renameInput').value.trim();

        if (newName) {
            if (this.data.folders[id]) {
                this.data.folders[id].name = newName;
            } else if (this.data.items[id]) {
                this.data.items[id].name = newName;
            }
            await this.saveToStorage(); 
            // this.render();
            this.renderRenameNode(id, newName);
        }

        this.hideModal('renameModal');
    }


/**********************************************************************************************************
// #region 新建文件夹
***********************************************************************************************************/
    showNewFolderModal(parentId = 'root') {
        // console.log(this.data.folders[parentId]);
        document.getElementById('newFolderNameInput').value = '';
        this.initializeCustomDropdown('folderDropdown', 'newFolderModal');

        const dropdown = document.getElementById('folderDropdown');
        const text = dropdown.querySelector('.dropdown-text');
        // console.log(this.data.folders[parentId]);
        dropdown.dataset.selectedValue = parentId;
        this.renderSelectedItem(document.querySelector(`.dropdown-menu .dropdown-item[data-value="${parentId}"]`))
        console.log('parentId',parentId)
        text.innerHTML ='📂 ' + (parentId ? this.data.folders[parentId]?.name || this.rootDir : this.rootDir);

        this.showModal('newFolderModal');
        document.getElementById('newFolderNameInput').focus();
    }
    async confirmNewFolder() {
        const name = document.getElementById('newFolderNameInput').value.trim();
        if (!name) {
            this.hideModal('newFolderModal');
            return;
        }

        const dropdown = document.getElementById('folderDropdown');
        const parentId = dropdown.dataset.selectedValue || 'root';

        const folderId = this.generateId();
        this.data.folders[folderId] = {
            id: folderId,
            name: name,
            parentId: parentId,
            children: []
        };

        if (parentId !== 'root') {
            console.log('选中父文件夹',parentId);
            this.data.folders[parentId].children.push(folderId);
            // document.querySelector(`.children[data-id="${parentId}"]`).classList.add('expanded');// 新建文件夹后自动展开父文件夹
            // document.querySelector(`.item-content[data-id="${parentId}"] .item-icon.folder-icon`).classList.remove('collapsed');
        } else {
            this.data.rootOrder.push(folderId);
        }
        // ======== 【新增这一块】 ======== 
        // 让它在所有视图的缓存里都占据一席之地
        if (this.visibleIds) this.visibleIds.add(folderId);
        if (this.embeddedVisibleIds) this.embeddedVisibleIds.add(folderId);
        // ===============================
        await this.saveToStorage(); 
        console.log('confirmNewFolder 所在文件夹的id',parentId);
        this.renderInsertNode(folderId, parentId);
        if (this.embedded || true){
            this.localEmptyFolders.add(folderId)
            localStorage.setItem('localEmptyFolders', JSON.stringify([...this.localEmptyFolders]))
        }
        this.hideModal('newFolderModal');

    }
/**********************************************************************************************************
// #region 新建收藏
***********************************************************************************************************/
    showNewItemModal(indexdata,reply,action='',parentId = 'root') {
        this.indexData=indexdata;   // 实例内部调用都是空值
        this.replyData=reply;       // 实例内部调用都是空值
        this.action=action;         // 实例内部调用都是空值

        document.getElementById('newItemNameInput').value = this.indexData.name||cleanPageName();
        const href=currentWebsite==='PreviewHtml'?sessionStorage.getItem('markdownHref'):location.href;//.split('?')[0];
        document.getElementById('newItemUrlInput').value = href;
        this.initializeCustomDropdown('itemDropdown', 'newItemModal');

        const dropdown = document.getElementById('itemDropdown');
        const text = dropdown.querySelector('.dropdown-text');

        dropdown.dataset.selectedValue = parentId;
        text.innerHTML ='📂 ' + (parentId ? this.data.folders[parentId]?.name || this.rootDir : this.rootDir);

        if (action==='save_mindmap'){ // 收藏项为思维导图时，隐藏url输入框
            document.querySelector('#newItemModal > div > div.bookmark-modal-body').children[1].style.display = 'none';
            document.querySelector('#newItemModal .modal-header h3').textContent = '保存当前思维导图';
            document.querySelector('#newItemModal .bookmark-modal-body div:first-child label').textContent = '思维导图名称';
        }else if(action==='save_markdown'){ // 收藏项为普通收藏时，显示url输入框
            document.querySelector('#newItemModal .modal-header h3').textContent = '保存当前所有对话';
            document.querySelector('#newItemModal .bookmark-modal-body div:first-child label').textContent = '对话名称';
        }
        this.showModal('newItemModal');
        document.getElementById('newItemNameInput').focus();
    }

    async confirmNewItem(isAuto=false,name=null,url=null,dropdownValue=null) {
        await this.loadFromStorage(); // 加载数据以检查重复项
        if(!isAuto){
            name = document.getElementById('newItemNameInput').value.trim();
            url = document.getElementById('newItemUrlInput').value.trim();
            const dropdown = document.getElementById('itemDropdown');
            dropdownValue = dropdown.dataset.selectedValue;
        } 

        if (!name || !url) {
            alert('请填写完整信息');
            return;
        }
        let targetItem = Object.values(this.data.items).find(item => item.url === url);
        if(targetItem && this.action!=='save_markdown') {
            alert('收藏项已存在');
            return null;
        }   

        const itemId = this.indexData.id||this.generateId();
        if (this.action==='save_mindmap'){
            this.data.items[itemId] = {
                id: itemId,
                name: name,
                type:'mindmap',
                parentId: dropdownValue,
                data:this.indexData.data||[] 
            };
            document.title = name;
            sessionStorage.setItem('pageTitle', name);
        }else if (this.action==='save_markdown'){
            this.data.items[itemId] = {
                id: itemId,
                name: name,
                type:'markdown',
                Allurl: url,
                parentId: dropdownValue,
                data:`largeContents.__REF__${itemId}-extra`
            };
        }else{
            this.data.items[itemId] = {
                id: itemId,
                name: name,
                url: url,
                type:'fav',
                parentId: dropdownValue,
                data:this.indexData.data||[]                // 数据格式为[[index,question,reply]]
            };
        }

        console.log('confirmNewItem 调用-this.data.items[itemId]',this.data.items[itemId]);
        if (dropdownValue !== 'root') {
            this.data.folders[dropdownValue].children.push(itemId);
            // document.querySelector(`.children[data-id="${dropdownValue}"]`).classList.add('expanded');// 新建收藏后自动展开父文件夹
            // document.querySelector(`.item-content[data-id="${dropdownValue}"] .item-icon.folder-icon`).classList.remove('collapsed');
        } else {
            this.data.rootOrder.push(itemId);
        }
        // ======== 【新增这一块】 ========
        if (this.visibleIds) this.visibleIds.add(itemId);
        // 判断它是否符合嵌入视图展示条件（当前站点网址匹配）
        if (this.embeddedVisibleIds && (!url || url.includes(window.location.hostname))) {
            this.embeddedVisibleIds.add(itemId);
        }
        // ===============================
        if (!isAuto){
            await this.saveToStorage(); // ✅ 等待保存完成
            this.renderInsertNode(itemId, dropdownValue);
        }
        
        this.hideModal('newItemModal');
        if (this.action==='save_mindmap'){
            await idbSet({[`MindMapData.__REF__${itemId}-extra`]:this.replyData});
            sessionStorage.setItem('currentFileID', itemId);
            console.log('confirmNewItem 调用-this.data.items[itemId]',this.replyData);
        }else if (this.action==='save_markdown'){    // 只有脑图页面才有保存思维导图的动作
            if (location.href.includes('preview.html')){
                var QAList=JSON.parse(sessionStorage.getItem('markdownPreviewData'));
            }else{
                var QAList=location.href.includes('aistudio.google.com')
                            ?await getMultipleQA1('save_markdown')
                            :await getMultipleQA('save_markdown');
            }
            await idbSet({[`largeContents.__REF__${itemId}-extra`]:QAList})
            console.log('confirmNewItem 调用-this.data.items[itemId]',QAList);
            showTopToast(getI18nText('toast.save_success'));
        }else{
            toggleHistoryStar(url, true,this.data.items[itemId].data.length>0);          // 更新历史列表的星标状态
            updatehasFavBtn(url,this.data.items[itemId].data.length>0);              // 控制顶部按钮 disabled
            refreshDirectoryStar(url,this.indexData.data?.[0]?.[0] ?? -1,true);       // 更新目录面板的星标状态
            setTimeout(async() => await initStarHistoryPreview(), 200);     // ✅ await刷新历史记录预览
            if(this.replyData && this.indexData.data[0][2].startsWith('__REF__')) {
                await idbSet({[`largeContents.__REF__${itemId}-${this.indexData.data[0][0]}-extra`]:this.replyData})
                showTopToast(getI18nText('toast.bookmark_success'));
            }
        }
        this.action=null;
        return itemId
    }

    findFolderIdByPath(path) {
        if (path === this.rootDir) return 'root';

        const pathParts = path.split('/').filter(p => p.trim());
        let currentParent = null;

        for (let i = 0; i < pathParts.length; i++) {
            const children = this.getChildren(currentParent);
            const folder = children.find(id => this.data.folders[id]?.name === pathParts[i].trim());
            if (folder) {
                currentParent = folder;
            } else {
                return 'root';
            }
        }

        return currentParent;
    }

/**********************************************************************************************************
// #region 删除
***********************************************************************************************************/
    showDeleteModal(ids) {
        const isMultiple = Array.isArray(ids) && ids.length > 1;
        const itemName = isMultiple ?
            `${ids.length}个项目` :
            (this.data.folders[ids[0]] || this.data.items[ids[0]])?.name || '';

        const type = isMultiple ? '项目' : (this.data.folders[ids[0]] ? '文件夹' : '项目');

        document.getElementById('deleteConfirmText').textContent =
            `确定要删除${type} "${itemName}" 吗？${type === '文件夹' ? '文件夹内的所有内容也将被删除。' : ''}`;
        document.getElementById('deleteModal').dataset.ids = JSON.stringify(ids);
        this.showModal('deleteModal');
    }
    async confirmDelete() {
        const ids = JSON.parse(document.getElementById('deleteModal').dataset.ids || '[]');
        for (const id of ids) {
            await this.deleteItem(id);
        }
        this.hideModal('deleteModal');
        this.clearSelection();
        this.currentFolderId=document.querySelector('.breadcrumb-item:last-child').getAttribute('data-id'); 
        const children = this.getChildren(this.currentFolderId);    // 获取当前文件夹的子项，只渲染当前文件夹的子项
        if (children.length === 0) this.render();    // 如果当前文件夹为空，则重新渲染整个目录

    }

    updateData(data) {
        this.data = data;
    }
    async deleteItem(id) {
        const folder = this.data.folders[id];
        console.log('deleteItem',this.data);
        if (folder) {
            const children = [...folder.children];
            for (const childId of children) {
                if (this.data.folders[childId]) {
                    await this.deleteItem(childId); // 等待删除完成，递归删除子文件夹
                } else {
                    delete this.data.items[childId];
                }
            };

            if (folder.parentId !== 'root') {
                console.log('删除子文件夹',folder.parentId);
                this.data.folders[folder.parentId].children =
                    this.data.folders[folder.parentId].children.filter(cid => cid !== id);
            } else {
                this.data.rootOrder = this.data.rootOrder.filter(cid => cid !== id);
            }

            delete this.data.folders[id];
            this.expandedFolders.delete(id);
            await this.saveToStorage();
        } else if (this.data.items[id]) {
            const item = this.data.items[id];
            const url=item.url;
            if (item.parentId !== 'root'&&item.parentId!==null) {
                this.data.folders[item.parentId].children =
                    this.data.folders[item.parentId].children.filter(cid => cid !== id);
            } else {
                this.data.rootOrder = this.data.rootOrder.filter(cid => cid !== id);
            }

            if (item.type==='mindmap'){
                await idbRemove(`MindMapData.__REF__${id}-extra`);
                console.log(`已清理 ${item.data}`);
            }else if(item.type==='markdown'){
                await idbRemove(`largeContents.__REF__${id}-extra`);
                console.log(`已清理 ${item.data}`);
            }else{
                toggleHistoryStar(url, false);   // 更新历史列表的星标状态
                updatehasFavBtn(url,false);           // 控制顶部按钮 disabled
                refreshDirectoryStar(url,'all',false); 
                // 清理收藏项之外的回复数据

                console.log('删除收藏项',item.data);
                for (let favData of item.data){
                    console.log(favData);
                    if (favData[2].startsWith(`__REF__id`)){
                        await idbRemove(`largeContents.${favData[2]}`);
                        console.log(`已清理 ${favData[2]}`);
                    }
                }
            }
            
            delete this.data.items[id];     // 属性不存在，则静默返回 true，不会抛出任何错误。
            await this.saveToStorage();
        }
        // this.render();
        this.renderDeleteNode(id);
    }

/**********************************************************************************************************
// #region 多选拖拽
***********************************************************************************************************/
    async moveMultipleItems(itemIds, targetId, position) {
        // 按当前显示顺序排序，确保移动后顺序正确
        const container = document.getElementById('treeContainer');
        // 如果是嵌入模式，尝试从嵌入容器获取，防止找不到元素
        const contextContainer = container || document.querySelector('.embedded-tree-content');
        
        const visibleItems = Array.from(contextContainer.querySelectorAll('.tree-item'));
        const sortedIds = itemIds.sort((a, b) => {
            const indexA = visibleItems.findIndex(el => el.dataset.id === a);
            const indexB = visibleItems.findIndex(el => el.dataset.id === b);
            return indexA - indexB;
        });

        // ✅ 1. 记录原始目标 ID，防止在循环中丢失
        const originalTargetId = targetId;

        // 移动所有项目
        for (let i = 0; i < sortedIds.length; i++) {
            const id = sortedIds[i];
            
            // 每次循环初始化为原始参数
            let currentTargetId = originalTargetId; 
            let itemPosition = position;

            // ✅ 2. 只有在“排序模式”（非 middle）下，才需要修改目标为上一个元素
            if (i > 0) {
                if (position !== 'middle') {
                    // 排序模式：跟随在上一个移动的元素后面
                    itemPosition = 'bottom';
                    currentTargetId = sortedIds[i-1]; 
                } else {
                    // 嵌入模式（middle）：目标永远保持为原始目标（文件夹），位置保持 middle
                    currentTargetId = originalTargetId;
                    itemPosition = 'middle';
                }
            }

            // 下面这段逻辑是处理跨层级排序时的父子判断，保持不变，
            // 但需要把里面的 targetId 替换为 currentTargetId
            if (position !== 'middle' && this.getParentId(id) === this.getParentId(currentTargetId)) {
                let children=[];
                if (this.data.folders[id] && this.data.items[currentTargetId]) {
                    children=this.getChildren(this.data.items[currentTargetId].parentId);
                    if (children.some(id => id in this.data.folders)){
                        // 找到目标目录里最后一个folder
                        const lastFolder = children.findLast(id => id in this.data.folders);
                        if(lastFolder) currentTargetId = lastFolder;
                        itemPosition='bottom';
                    }  
                } else if(this.data.items[id] && this.data.folders[currentTargetId]){
                    children=this.getChildren(this.data.folders[currentTargetId].parentId);
                    if (children.some(id => id in this.data.items)){
                        // 找到目标目录里第一个item
                        const firstItem = children.find(id => id in this.data.items); 
                        if(firstItem) currentTargetId = firstItem;     
                        itemPosition='top';
                    }  
                }
            }

            if (id !== currentTargetId){
                // ✅ 3. 使用计算出的 currentTargetId 执行移动
                await this.moveItem(id, currentTargetId, itemPosition); 
            }
        }
        
        await this.saveToStorage();
        
        // 防止拖拽过程中改变当前文件夹导致渲染错乱，重新获取一下面包屑的ID
        const breadcrumbLast = document.querySelector('.breadcrumb-item:last-child');
        if (breadcrumbLast) {
            this.currentFolderId = breadcrumbLast.getAttribute('data-id');
        }
        
        this.render();
    }

    canDrop(draggedId, targetId) {
        if (!draggedId || !targetId || draggedId === targetId) return false;

        const draggedType = this.data.folders[draggedId] ? 'folder' : 'item';
        const targetType = this.data.folders[targetId] ? 'folder' : 'item';

        if (draggedType === 'folder') {
            if (this.isDescendant(draggedId, targetId)) return false;   // 子
        }

        return true;
    }
    getParentId(id) {
        // 检查是否是文件夹
        if (this.data.folders[id]) {
            return this.data.folders[id].parentId || 'root';
        }
        // 检查是否是项目
        if (this.data.items[id]) {
            return this.data.items[id].parentId || 'root';
        }
    }
    isDescendant(draggedId, targetId) {
        const children = this.getChildren(draggedId);
        if (children.includes(targetId)) return true;
        if  (draggedId === targetId) return true;

        for (const childId of children) {
            const child = this.data.folders[childId];
            if (child && this.isDescendant(childId, targetId)) {
                return true;
            }
        }
        return false;
    }


    async moveItem(draggedId, targetId, position) {
        const draggedType = this.data.folders[draggedId] ? 'folder' : 'item';
        // 如果 targetId 是 'root'，我们也将其视为 folder 类型，但后续逻辑会特殊处理
        const targetType = (targetId === 'root' || this.data.folders[targetId]) ? 'folder' : 'item';

        const draggedItem = draggedType === 'folder' ?          // 被拖动的项目
            this.data.folders[draggedId] : this.data.items[draggedId];

        if (!draggedItem) return;

        const oldParentId = draggedItem.parentId;
        // 1. 将被拖动项目从旧的父文件夹或根目录中移除
        // if (oldParentId !== 'root') {       
        //     this.data.folders[oldParentId].children =
        //         this.data.folders[oldParentId].children.filter(id => id !== draggedId);
        // } else {
        //     this.data.rootOrder = this.data.rootOrder.filter(id => id !== draggedId);
        // }
        // 【增强旧父节点判断，防止旧父节点不存在导致 throw error 引起后续中断】
        if (oldParentId && oldParentId !== 'root' && this.data.folders[oldParentId]) {       
            this.data.folders[oldParentId].children =
                this.data.folders[oldParentId].children.filter(id => id !== draggedId);
        } else if (oldParentId === 'root' || !oldParentId) {
            this.data.rootOrder = this.data.rootOrder.filter(id => id !== draggedId);
        }

        // 2. 添加到新位置
        if (targetId === 'root') {
            // === 修复点：专门处理移动到根目录 ===
            console.log('移动到根目录');
            draggedItem.parentId = 'root';
            // 右键移动操作默认追加到根目录末尾
            this.data.rootOrder.push(draggedId);
        } 
        else if (position === 'middle' && targetType === 'folder') {         // 移动到目标的内部
            console.log('移动到目标的内部');
            draggedItem.parentId = targetId;
            this.data.folders[targetId].children.push(draggedId);
            this.expandedFolders.add(targetId);
        } else {
            // 移动到目标的“之前”或“之后”（排序操作）
            const targetParentId = targetType === 'folder' ?            // 移动到目标的父文件夹
                this.data.folders[targetId].parentId : this.data.items[targetId]?.parentId;
            
            // 容错：如果目标没有父ID，视为根目录
            const finalParentId = targetParentId || 'root';
            draggedItem.parentId = finalParentId;      // 修改被拖拽项目的父ID

            let targetIndex;
            
            if (finalParentId !== 'root') {
                const children = this.data.folders[finalParentId].children;
                targetIndex = children.indexOf(targetId);
                 if (position === 'bottom') {
                        targetIndex += 1;
                    }
                children.splice(targetIndex, 0, draggedId);
            } else {
                targetIndex = this.data.rootOrder.indexOf(targetId);
                if (position === 'bottom') {
                        targetIndex += 1;
                    }
                this.data.rootOrder.splice(targetIndex, 0, draggedId);
            }
        }

        // 3. 兜底检测（防止循环引用或数据异常）
        Object.keys(this.data.folders).forEach(folderId => {   
            const folder = this.data.folders[folderId];
            const index = folder.children.indexOf(folder.id);
            if (index !== -1) {
                folder.children.splice(index, 1);
            }
            if (folder.parentId === folder.id) {
                folder.parentId = 'root';
                this.data.rootOrder.push(folderId);
            }
        });
    }

    getChildren(parentId) {
        if (parentId === 'root') {
            return [...this.data.rootOrder];
        }
        const folder = this.data.folders[parentId];
        return folder ? folder.children : [];
    }

    generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
/**********************************************************************************************************
// #region 框选功能
***********************************************************************************************************/
    initializeSelectionBox(panelContent,treeContainer) {
        
        let mouseDownOnPanel = false;
        
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // 1. 开始框选
        panelContent.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            // 忽略交互元素
            const clickedOnInteractive = e.target.closest('.item-content, .item-actions, .breadcrumb');
            if (clickedOnInteractive) return;
            const localBox = panelContent.parentElement.querySelector('.selection-box');
            if (localBox) {
                this.selectionBox = localBox; // 将实例的 selectionBox 指向当前面板的框
            }
            e.preventDefault();
            
            this.lastMouseDownTime = Date.now();
            this.justFinishedSelecting = false;
            
            // 记录起始点
            const rect = panelContent.getBoundingClientRect();
            const startX = e.clientX - rect.left + panelContent.scrollLeft;
            const startY = e.clientY - rect.top + panelContent.scrollTop;

            this.startSelection(startX, startY);
            mouseDownOnPanel = true;
            
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        // 2. 移动鼠标
        document.addEventListener('mousemove', (e) => {
            if (!this.isSelecting || !mouseDownOnPanel) return;
            e.preventDefault();

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.updateSelectionState(panelContent, treeContainer);
            this.handleAutoScroll(panelContent, treeContainer);
        });

        // 3. 结束框选
        const endSelection = (e) => {
            if (!this.isSelecting || !mouseDownOnPanel) return;

            if (this.autoScrollTimer) {
                cancelAnimationFrame(this.autoScrollTimer);
                this.autoScrollTimer = null;
            }

            this.isSelecting = false;
            this.selectionWithCtrl = false;
            this.justFinishedSelecting = true;
            mouseDownOnPanel = false;

            const width = parseFloat(this.selectionBox.style.width || 0);
            const height = parseFloat(this.selectionBox.style.height || 0);
            if (width < 5 && height < 5) {
                this.clearSelection();
            }

            setTimeout(() => {
                this.selectionBox.style.display = 'none';
                this.selectionBox.style.width = '0';
                this.selectionBox.style.height = '0';
                this.justFinishedSelecting = false;
            }, 100);
        };

        document.addEventListener('mouseup', endSelection);
        document.addEventListener('mouseleave', (e) => {
             if (e.target === document.body) endSelection(e);
        });
    }
        // --- 核心修复：基于最后一个元素的精准高度限制 ---
    updateSelectionState(panelContent, treeContainer) {
        if (!this.isSelecting) return;

        const panelRect = panelContent.getBoundingClientRect();
        
        // 计算当前鼠标位置
        const currentX = this.lastMouseX - panelRect.left + panelContent.scrollLeft;
        let currentY = this.lastMouseY - panelRect.top + panelContent.scrollTop;

        // 【关键修改】计算允许的最大 Y 值
        // 我们不依赖容器的 scrollHeight，而是直接找 treeContainer 里的最后一个元素
        // 这样可以精确地停在内容结束的地方，多 1px 都不要，防止撑大容器
        let maxAllowedY = panelContent.scrollHeight; // 默认值
        
        if (treeContainer.lastElementChild) {
            const lastItem = treeContainer.lastElementChild;
            const lastItemRect = lastItem.getBoundingClientRect();
            // 计算最后一个元素的底部相对于 panel 内容顶部的绝对位置
            // 相对底部 = (元素视口底部 - 容器视口顶部) + 容器已滚动距离
            const relativeBottom = (lastItemRect.bottom - panelRect.top) + panelContent.scrollTop;
            
            // 额外给 5px 的容错空间，确保能完全包裹边框
            maxAllowedY = relativeBottom + 5;
        }

        // 应用限制
        if (currentY > maxAllowedY) currentY = maxAllowedY;
        if (currentY < 0) currentY = 0;

        // 计算矩形
        const left = Math.min(this.selectionStart.x, currentX);
        const top = Math.min(this.selectionStart.y, currentY);
        const width = Math.abs(currentX - this.selectionStart.x);
        const height = Math.abs(currentY - this.selectionStart.y);

        // 更新 DOM
        this.selectionBox.style.left = left + 'px';
        this.selectionBox.style.top = top + 'px';
        this.selectionBox.style.width = width + 'px';
        this.selectionBox.style.height = height + 'px';
        this.selectionBox.style.display = 'block';

        // 碰撞检测
        this.checkSelectionCollision(left, top, left + width, top + height, panelRect, panelContent);
    }

    // --- 自动滚动逻辑 (保持不变) ---
    handleAutoScroll(panelContent, treeContainer) {
        if (this.autoScrollTimer) {
            cancelAnimationFrame(this.autoScrollTimer);
            this.autoScrollTimer = null;
        }

        const panelRect = panelContent.getBoundingClientRect();
        const mouseClientY = this.lastMouseY;
        
        const threshold = 40; 
        const maxSpeed = 15;
        let scrollAmount = 0;

        if (mouseClientY > panelRect.bottom - threshold) {
            const intensity = (mouseClientY - (panelRect.bottom - threshold)) / threshold;
            scrollAmount = maxSpeed * Math.min(intensity, 1);
        } else if (mouseClientY < panelRect.top + threshold) {
            const intensity = ((panelRect.top + threshold) - mouseClientY) / threshold;
            scrollAmount = -maxSpeed * Math.min(intensity, 1);
        }

        if (scrollAmount !== 0) {
            panelContent.scrollTop += scrollAmount;
            this.updateSelectionState(panelContent, treeContainer);
            this.autoScrollTimer = requestAnimationFrame(() => {
                if (this.isSelecting) {
                    this.handleAutoScroll(panelContent, treeContainer);
                }
            });
        }
    }

    // --- 碰撞检测 (保持不变) ---
    checkSelectionCollision(selLeft, selTop, selRight, selBottom, panelRect, panelContent) {
        const items = document.querySelectorAll('.tree-item');
        const idsInBox = new Set();
        const scrollTop = panelContent.scrollTop;
        const panelTop = panelRect.top;

        items.forEach(item => {
            if (item.offsetParent === null) return; 

            const content = item.querySelector('.item-content');
            if (!content) return;

            const itemRect = item.getBoundingClientRect();
            const contentRect = content.getBoundingClientRect();

            const itemContentTop = contentRect.top - panelTop + scrollTop;
            const itemContentBottom = contentRect.bottom - panelTop + scrollTop;
            const itemLeft = itemRect.left - panelRect.left + panelContent.scrollLeft;
            const itemRight = itemRect.right - panelRect.left + panelContent.scrollLeft;

            const hasOverlap = selRight > itemLeft &&
                            selLeft < itemRight &&
                            selBottom > itemContentTop &&
                            selTop < itemContentBottom;

            if (hasOverlap) {
                idsInBox.add(item.dataset.id);
            }
        });

        if (!this.selectionWithCtrl) {
            const toRemove = this.selectedIds.filter(id => !idsInBox.has(id));
            toRemove.forEach(id => this.removeFromSelection(id));
            idsInBox.forEach(id => this.addToSelection(id));
        } else {
            idsInBox.forEach(id => this.addToSelection(id));
        }
    }

    startSelection(x, y) {
        this.isSelecting = true;
        this.selectionStart = { x, y };
        if (!this.selectionWithCtrl) {
            this.clearSelection();
        }
    }

    toggleSelection(id) {
        if (this.selectedIds.includes(id)) {
            this.removeFromSelection(id);
        } else {
            this.addToSelection(id);
        }
    }

    addToSelection(id) {
        if (!this.selectedIds.includes(id)) {
            this.selectedIds.push(id);
            document.querySelectorAll(`.tree-item[data-id="${id}"]`).forEach(item=>{
                item.classList.add('selected');
            });
            this.updateDeleteButton();
        }
    }

    removeFromSelection(id) {
        const index = this.selectedIds.indexOf(id);
        if (index > -1) {
            this.selectedIds.splice(index, 1);
            document.querySelectorAll(`.tree-item[data-id="${id}"]`).forEach(item=>{
                item.classList.remove('selected');
            });
            this.updateDeleteButton();
        }
    }

    clearSelection() {
        this.selectedIds.forEach(id => {
            document.querySelectorAll(`[data-id="${id}"]`).forEach(item=>{
                item.classList.remove('selected');
            });
        });
        this.selectedIds = [];
        this.updateDeleteButton();
    }

    selectItem(id) {
        this.clearSelection();
        this.addToSelection(id);
    }

    updateDeleteButton() {
        // const btn = document.getElementById('deleteSelectedBtn');
        // btn.disabled = this.selectedIds.length === 0;
        // const previewBtn = document.getElementById('previewFavBtn');
        // previewBtn.disabled = !this.hasIntersection(this.data.items, this.selectedIds);
        // const mindMapBtn = document.getElementById('mindMapBtn');
        // mindMapBtn.disabled = !this.hasIntersection(this.data.items, this.selectedIds);
        // document.querySelector('.selection-fav-count').innerHTML = `已选<br>${this.selectedIds.length}`;
    }
    hasIntersection(obj, arr) {
        const objKeys = new Set(Object.keys(obj));
        return arr.some(id => objKeys.has(id) && obj[id].type!=='mindmap');
    }

    // 检测文本溢出并添加悬浮提示
    addOverflowTooltips(container) {
        requestAnimationFrame(() => {
            const itemTexts = container.querySelectorAll('.item-text');
            itemTexts.forEach(textEl => {
                textEl.removeAttribute('title');
                if (textEl.scrollWidth > textEl.clientWidth + 1) {
                    const itemContent = textEl.closest('.item-content');
                    if (itemContent) {
                        const itemId = itemContent.dataset.id;
                        const item = this.data.folders[itemId] || this.data.items[itemId];
                        if (item) {
                            textEl.title = item.name;
                        }
                    }
                }
            });
        });
    }
    async checkUIMM2(notify=true) {
        const response = await chrome.runtime.sendMessage({ action: 'getSelector' });
        if (response && response.isChro === true) {
            return true;
        }else{
            if (notify) showTopToast(getI18nText('toast.pro_only'),2500)
            return false;
        }
    }
    /**********************************************************************************************************
    // #region 嵌入式渲染模块
    ***********************************************************************************************************/
    
    /**
     * 在指定容器上方嵌入完整的书签管理面板
     * @param {string} targetSelector 目标容器选择器
     */
    /**
     * 在指定容器上方嵌入书签面板
     */
    async mountToContainer(targetSelector) {
        if (!currentCfg.historyListSelector) return;
        if(!this.isFufei || !currentSettings.enableAssisFav) return;
        if (document.querySelector('.bookmark-manager-container.embedded-view')) return;
        await waitForElement(targetSelector,1000)
        const targetElement = document.querySelector(targetSelector);
        if (!targetElement) return;

        // 1. 创建容器
        const embedContainer = document.createElement('div');
        embedContainer.className = 'bookmark-manager-container embedded-view';
        
        // 2. 构建 HTML 结构 (面包屑 + 内容区)
        // 我们去掉顶部的 .panel-header (包含刷新按钮那些)，只保留面包屑和树
        const htmlStructure = `
            <div class="breadcrumb embedded-breadcrumb"></div>
            
            <div class="panel-content embedded-tree-content">
                <div class="selection-box" id="embeddedSelectionBox"></div> 
                <div class="embedded-items-container"></div> 
            </div>
        `;
        
        // 使用安全赋值 (如果你定义了 setSafeHTML) 或者 innerHTML
        if (typeof setSafeHTML === 'function') {
            setSafeHTML(embedContainer, htmlStructure);
        } else {
            embedContainer.innerHTML = htmlStructure;
        }

        // 3. 插入到页面
        targetElement.insertAdjacentElement('beforebegin', embedContainer);

        // 4. 获取引用
        const breadcrumbEl = embedContainer.querySelector('.embedded-breadcrumb');
        const treeContentEl = embedContainer.querySelector('.embedded-tree-content');
        treeContentEl.style.position = 'relative';

        // 5. 渲染数据 (默认从当前路径开始)
        this.renderEmbeddedView(breadcrumbEl, treeContentEl);

        // 6. 绑定事件
        this.bindEmbeddedEvents(breadcrumbEl, treeContentEl);

        this.initializeSelectionBox(treeContentEl,treeContentEl);   // 初始化框选功能
        
        // 初始化拖拽功能
        this.containerDragstart(embedContainer.parentElement);
        this.containerDragend(embedContainer.parentElement); 
        this.containerDragover(embedContainer.parentElement);       
        this.containerDrop(embedContainer.parentElement);
        this.breadcrumbDrop(breadcrumbEl);
        console.log('嵌入式面板加载完成');
    }

    /**
     * [更新] 渲染嵌入视图
     * 1. 自动筛选当前站点
     * 2. 默认保持折叠状态
     */
    /**
     * [重写] 渲染嵌入视图 (状态完全隔离)
     */
    async renderEmbeddedView(breadcrumbEl, treeContentEl) {
        // --- 1. 渲染面包屑 (使用 embeddedCurrentId) ---
        const parts = [];
        let currentId = this.embeddedCurrentId; // 使用嵌入面板的独立路径
        let depth = 0;
        
        while (currentId !== 'root' && currentId && this.data.folders[currentId] && depth < 20) {
            const folder = this.data.folders[currentId];
            parts.unshift({ id: currentId, name: folder.name });
            currentId = folder.parentId;
            depth++;
        }
        
        let breadHtml = `<span class="breadcrumb-item" data-id="root" data-i18n="bookmarks.root_dir">${this.rootDir}</span>`;
        parts.forEach(part => {
            breadHtml += `<span class="breadcrumb-separator">/</span><span class="breadcrumb-item" data-id="${part.id}">${part.name}</span>`;
        });
        
        if (typeof setSafeHTML === 'function') setSafeHTML(breadcrumbEl, breadHtml);
        else breadcrumbEl.innerHTML = breadHtml;

        // --- 2. 渲染列表 (快照技术：劫持全局状态) ---
        
        // A. 备份主面板的所有状态
        const globalCurrentId = this.currentFolderId;
        const globalFilter = this.activeFilter;
        const globalKeyword = this.searchKeyword;
        const globalVisibleIds = new Set(this.visibleIds);
        const globalCollapsed = new Set(this.filterCollapsedIds);

        // B. 切换到“嵌入模式”状态
        this.currentFolderId = this.embeddedCurrentId; // 劫持导航：让渲染器画嵌入面板的层级
        this.activeFilter = 'site';                    // 劫持模式：开启筛选模式逻辑
        this.searchKeyword = '';                       
        
        // C. 计算并应用筛选 (只保留当前站点数据)
        const siteMatches = this.calculateSiteMatches();
        this.visibleIds = siteMatches;
        this.embeddedVisibleIds = siteMatches; // 存下来给 toggleEmbeddedFolder 用

        // D. [关键] 强制默认折叠
        // 筛选模式下，逻辑通常是“默认展开”。为了“默认折叠”，
        // 我们需要把所有可见的文件夹ID都加入 filterCollapsedIds。
        // 这样 renderFolderNode 就会给它们加上 'collapsed' 类。
        siteMatches.forEach(id => {
            if (this.data.folders[id]) {
                // 如果这个 ID 不在“已展开集合”中，就让它折叠
                if (!this.embeddedExpandedFolders.has(id)) {
                    this.filterCollapsedIds.add(id);
                }
            }
        });

        try {
            // E. 检查当前层级是否有内容
            // 劫持了 currentFolderId 后，getChildren 会取 embeddedCurrentId 下的子元素
            // 然后 renderFolderNode 会根据 visibleIds 过滤
            const children = this.getChildren(this.embeddedCurrentId);
            const hasVisibleChildren = children.some(id => siteMatches.has(id));

            if (!hasVisibleChildren && this.embeddedCurrentId === 'root') {
                // 如果根目录都没东西，说明真的没收藏
                const emptyHtml = `<div class="empty-result-state" style="padding:40px 0;text-align:center;color:#94a3b8;"><p data-i18n="bookmarks.no_bookmark_for_site">${getI18nText('bookmarks.no_bookmark_for_site')}</p></div>`;
                if (typeof setSafeHTML === 'function') setSafeHTML(treeContentEl, emptyHtml);
                else treeContentEl.innerHTML = emptyHtml;
            } else if (!hasVisibleChildren) {
                // 如果是进入了某个空文件夹
                const emptyHtml = `<div class="empty-result-state" style="padding:20px;text-align:center;color:#94a3b8;"><p data-i18n="bookmarks.no_match_in_folder">${getI18nText('bookmarks.no_match_in_folder')}</p></div>`;
                if (typeof setSafeHTML === 'function') setSafeHTML(treeContentEl, emptyHtml);
                else treeContentEl.innerHTML = emptyHtml;
            } else {
                // F. 执行渲染 (复用核心方法)
                const itemsContainer = treeContentEl.querySelector('.embedded-items-container');
            
                // 如果找到了就渲染进内部容器，没找到(兼容旧逻辑)才渲染进外层
                this.renderToElement(itemsContainer || treeContentEl);
            }
        } catch (e) {
            console.error('嵌入视图渲染异常:', e);
        } finally {
            // G. [关键] 立即恢复主面板状态 (无痕操作)
            this.currentFolderId = globalCurrentId;
            this.activeFilter = globalFilter;
            this.searchKeyword = globalKeyword;
            this.visibleIds = globalVisibleIds;
            this.filterCollapsedIds = globalCollapsed;
            await initEmbedPreview();
        }
    }
    /**
     * [重写] 嵌入面板专用折叠/展开
     */
    async toggleEmbeddedFolder(folderId, uiContainer) {
        const folderEl = uiContainer.querySelector(`.tree-item[data-id="${folderId}"]`);
        if (!folderEl) return;
        
        const icon = folderEl.querySelector('.folder-icon');
        const childrenContainer = folderEl.querySelector(`.children[data-id="${folderId}"]`);
        
        const isCollapsed = icon.classList.contains('collapsed');
        
        if (isCollapsed) {
            // === 展开 ===
            icon.classList.remove('collapsed');
            this.embeddedExpandedFolders.add(folderId);

            if (childrenContainer) {
                // 如果内容为空（第一次展开），需要动态渲染子项
                if (!childrenContainer.innerHTML.trim()) {
                    // [关键] 再次劫持全局状态，确保渲染出来的子项是经过筛选的
                    const globalFilter = this.activeFilter;
                    const globalVisibleIds = this.visibleIds;

                    try {
                        this.activeFilter = 'site';
                        this.visibleIds = this.embeddedVisibleIds; // 使用之前计算好的缓存
                        
                        // 生成子项 HTML
                        const html = this.renderFolderContent(folderId);
                        
                        if (typeof setSafeHTML === 'function') setSafeHTML(childrenContainer, html);
                        else childrenContainer.innerHTML = html;
                        
                    } finally {
                        this.activeFilter = globalFilter;
                        this.visibleIds = globalVisibleIds;
                    }
                }
                childrenContainer.classList.add('expanded');
            }
        } else {
            // === 折叠 ===
            icon.classList.add('collapsed');
            this.embeddedExpandedFolders.delete(folderId);
            if (childrenContainer) childrenContainer.classList.remove('expanded');
        }
        localStorage.setItem('embeddedExpandedFolders', JSON.stringify([...this.embeddedExpandedFolders]))
        await initEmbedPreview();
    }
    /**
     * [更新] 绑定嵌入面板事件 (修复交互逻辑)
     */
    bindEmbeddedEvents(breadcrumbEl, treeContentEl) {
        // 1. 面包屑点击 -> 独立导航
        breadcrumbEl.addEventListener('click', (e) => {
            const item = e.target.closest('.breadcrumb-item');
            if (item) {
                const id = item.dataset.id;
                this.embeddedCurrentId = id; // 更新嵌入面板的 ID
                this.renderEmbeddedView(breadcrumbEl, treeContentEl); // 重新渲染
            }
        });

        // 2. 列表点击 -> 选中 或 展开
        treeContentEl.addEventListener('click', async(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (this.justFinishedSelecting) return;
            if (!e.target.closest('.context-menuBM')) this.hideContextMenu();

            const itemContent = e.target.closest('.item-content');
            const id = itemContent.dataset.id;
            const type = itemContent.dataset.type;
            // 场景A: 点击文件夹图标 -> 仅展开/折叠 (不进入，不选中)
            if (type === 'folder' && e.target.closest('.folder-icon')) {
                this.toggleEmbeddedFolder(id, treeContentEl);
                return;
            }
            if (e.ctrlKey) {
                this.toggleSelection(id);
            }else{
                this.selectItem(id)
            }

            // 场景B: 点击行 -> 仅选中
            const treeItem = itemContent.closest('.tree-item');
            if (treeItem) {
                const item = this.data.items[treeItem.dataset.id];
                if (item){
                    const click_url=item.url||item.Allurl;
                    if (location.href.split('?')[0]===click_url.split('?')[0]) return;
                    let target=null;
                    if (currentWebsite==='Gemini'){
                        target = await findTargetInGeminiSidebar(click_url, currentCfg.historyItemSelector)
                    }else{
                        const allItems = Array.from(document.querySelectorAll(currentCfg.historyItemSelector));
                        target = allItems.find(a => click_url.includes(getUrlKey(a)));
                    }
                    
                    if (target){
                        target.click();
                    }else{
                        const currentMessage=document.querySelector(currentCfg.selector);
                        spaNavigate(click_url);
                        // setTimeout(()=>{
                        //     if (currentMessage === document.querySelector(currentCfg.selector)){
                        //         spaNavigate(click_url,'ClICK_JUMP')
                        //     }
                        // },500)
                    }
                    
                }
            }
            // 这里不更新 this.selectedIds，或者你可以专门搞一个 this.embeddedSelectedIds
            // 防止右键删除时误删主面板选中的东西
        });

        // 3. 列表双击 -> 进入文件夹 或 打开
        treeContentEl.addEventListener('dblclick', (e) => {
            // 忽略图标双击
            if (e.target.closest('.folder-icon')) return;

            const itemContent = e.target.closest('.item-content');
            if (!itemContent) return;

            const id = itemContent.dataset.id;
            const type = itemContent.dataset.type;

            if (type === 'folder') {
                // [关键] 更新嵌入面板的 ID，而不是主面板的
                this.embeddedCurrentId = id;
                this.renderEmbeddedView(breadcrumbEl, treeContentEl);
            }
        });

        this.containerContext(treeContentEl);
    }

    /**
     * 将当前目录渲染到指定 DOM 节点中
     * (完全复用 renderFolderNode 和 renderItemNode)
     */
    renderToElement(containerElement) {
        const children = this.getChildren(this.currentFolderId);
        let html = '';

        if (this.viewMode === 'grid') {
            containerElement.classList.add('tree-container', 'grid-view'); // 复用 CSS 类
            children.forEach(id => {
               // 复用 renderGridNode
               html += this.data.folders[id] ? this.renderGridNode(id, 'folder') : this.renderGridNode(id, 'item');
            });
        } else {
            containerElement.classList.add('tree-container'); // 复用 CSS 类
            containerElement.classList.remove('grid-view');
            
            children.forEach(id => {
                if (this.data.folders[id]) {
                    html += this.renderFolderNode(id); // 复用现有方法
                }
            });
            children.forEach(id => {
                if (this.data.items[id]) {
                    html += this.renderItemNode(id);   // 复用现有方法
                }
            });
        }

        // 使用安全方式赋值
        setSafeHTML(containerElement, html);
    }

    /**
     * [新增] 计算当前站点匹配的 ID 集合
     * @returns {Set} 包含所有匹配项及其父文件夹 ID 的集合
     */
    calculateSiteMatches() {
        const currentHost = window.location.hostname;
        const matchedIds = new Set();

        // 1. [原有逻辑] 遍历所有 Item 寻找匹配
        Object.values(this.data.items).forEach(item => {
            const url = item.url || item.Allurl || '';
            if (url.includes(currentHost)) {
                matchedIds.add(item.id);

                // 递归添加父文件夹，确保路径可见
                let parentId = item.parentId;
                while (parentId && parentId !== 'root') {
                    matchedIds.add(parentId);
                    if (this.data.folders[parentId]) {
                        parentId = this.data.folders[parentId].parentId;
                    } else {
                        break;
                    }
                }
            }
        });

        // 2. [新增] 总是包含根目录，允许存放在最外层
        matchedIds.add('root');

        // 3. [新增] 将符合路径条件的“空文件夹”也加进去
        // 逻辑：如果一个文件夹是空的，且它的父级已经在 matchedIds 里（说明父级匹配了域名或就是root），
        // 那么这个空文件夹也应该显示，以便用户存东西进去。
        Object.values(this.data.folders).forEach(folder => {
            // 判断是否为空文件夹 (没有子文件 且 没有子文件夹)
            const isEmpty = (!folder.children || folder.children.length === 0);

            if (isEmpty) {
                // 如果它的父级已经在可见列表中 (比如父级是 root，或者父级里有匹配项)
                if (matchedIds.has(folder.parentId)) {
                    matchedIds.add(folder.id);
                }
            }
        });
        
        return matchedIds;
    }

    
}


// =========================================================
// #region [安全校验模块]
// =========================================================

let bookmarkManager = null;
(async function() {
    try {
        // const isFufei = await checkUIMM1();
        // console.log("BookmarkManager 激活状态:", isFufei);
        const isFufei = true;
        
        if (isFufei) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', async() => {
                    await initializeApp();
                });
            } else {
                await initializeApp();
            }
        } else {
            console.log("%c用户关闭了激活窗口，插件暂不运行", "color:gray");
        }
    } catch (e) {
        console.log("Plugin init error:", e);
    }

})();

// 核心流程控制
async function checkUIMM1() {
    try {
        // 向 Background 发送消息
        const response = await chrome.runtime.sendMessage({ 
            action: 'check_status' 
        });
        if (response && response.isChro === true) {
            return true;
        }else{
            // showTopToast('仅限付费用户使用')
            return false;
        }
        
    } catch (e) {
        // 发生错误（如插件被禁用/卸载），默认为 false
        console.log('Pro check failed:', e);
        return false;
    }
}
async function initializeApp() {
    console.log("正在初始化 BookmarkManager...");
    document.body.appendChild(uiContainer);
    bookmarkManager = new myBookmarkManager();
    await initI18n();
    await bookmarkManager.initialize();
    bookmarkManager.mountToContainer(currentCfg.historyListSelector);
    renderLanguage();
    // if (!location.href.endsWith('preview.html') && !location.href.endsWith('MindMap.html')){
    //     await initPrompt();
    // }
    console.log("BookmarkManager 初始化完成");
}



function spaNavigate(url,action='SPA_JUMP') {
    // 直接发送消息给 window，navigator.js 会收到
    window.postMessage({ action: action, url: url }, "*");
}



/**
 * 在 Gemini 侧边栏中静默查找特定链接
 * @param {string} click_url - 需要查找的目标链接
 * @param {string} historyItemSelector - 侧边栏每一项的选择器 (例如 'a' 或 'a[href^="/app/"]')
 * @returns {Promise<Element|null>} - 找到的 DOM 元素，没找到返回 null
 */
async function findTargetInGeminiSidebar(click_url, historyItemSelector = 'a') {
    // 1. 定义容器选择器
    const containerSelector = 'side-navigation-content > div > div > infinite-scroller';
    
    const realContainer = document.querySelector(containerSelector);
    if (!realContainer) {
        console.log("找不到 Gemini 侧边栏容器");
        return null;
    }

    // --- 准备工作：记录原始位置 & 背景色 ---
    const startScrollTop = realContainer.scrollTop;
    console.log(`开始查找目标: ${click_url}`);

    // 获取背景色防止重影
    function getSolidBackgroundColor(el) {
        let current = el;
        while (current) {
            const style = window.getComputedStyle(current);
            const color = style.backgroundColor;
            if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
                return color;
            }
            current = current.parentElement;
        }
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches 
            ? '#131314' : '#ffffff';
    }
    const solidBg = getSolidBackgroundColor(realContainer);

    // --- 施展“替身术” (视觉冻结) ---
    const rect = realContainer.getBoundingClientRect();
    const fakeContainer = realContainer.cloneNode(true);
    
    Object.assign(fakeContainer.style, {
        position: 'fixed',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: '99999',
        overflow: 'hidden',
        backgroundColor: solidBg,
        pointerEvents: 'auto', 
        margin: '0',
        boxSizing: 'border-box'
    });

    // 提示信息
    const tip = document.createElement('div');
    tip.textContent = "正在查找历史记录...";
    Object.assign(tip.style, {
        position: 'absolute', bottom: '10px', right: '10px',
        background: 'rgba(0,0,0,0.7)', color: '#fff',
        padding: '5px 10px', borderRadius: '4px', fontSize: '12px',
        pointerEvents: 'none'
    });
    fakeContainer.appendChild(tip);

    document.body.appendChild(fakeContainer);
    
    // 同步画面
    fakeContainer.scrollTop = startScrollTop;

    // --- 开始查找循环 ---
    let foundTarget = null;
    let previousHeight = 0;
    let noChangeCount = 0;
    const maxLoops = 100; // 防止无限循环
    let loopCount = 0;

    try {
        while (loopCount < maxLoops) {
            loopCount++;

            // --- 核心步骤 1: 立即搜寻目标 ---
            // 注意：这里必须在 realContainer 下面找，而不是 document，缩小范围
            const allItems = Array.from(realContainer.querySelectorAll(historyItemSelector));
            const target = allItems.find(a => click_url.includes(getUrlKey(a)));

            if (target) {
                console.log("✅ 找到目标元素:", target);
                foundTarget = target;
                break; // 【关键】找到了立马跳出循环
            }

            // --- 核心步骤 2: 检查是否到底 (没得加载了) ---
            const currentHeight = realContainer.scrollHeight;
            if (Math.abs(currentHeight - previousHeight) < 5) {
                noChangeCount++;
                if (noChangeCount >= 5) { 
                    console.log("❌ 滚动到底部仍未找到目标");
                    break; 
                }
            } else {
                noChangeCount = 0;
                previousHeight = currentHeight;
                tip.textContent = `检索中...`;
            }

            // --- 核心步骤 3: 滚动加载下一页 ---
            // 滚到底部
            realContainer.scrollTop = realContainer.scrollHeight;

            // 等待加载 (Gemini 比较慢，建议 600ms)
            await new Promise(r => setTimeout(r, 600));
        }

    } catch (e) {
        console.error("查找过程中出错:", e);
    } finally {
        // --- 收尾工作 (无论是否找到都会执行) ---
        
        // 1. 还原真身位置
        realContainer.scrollTop = startScrollTop;
        
        // 2. 确保渲染一帧
        await new Promise(r => requestAnimationFrame(r));

        // 3. 移除替身
        fakeContainer.remove();
        // console.log("视觉冻结解除，回归原位");
    }

    return foundTarget;
}

// --- 调用示例 ---
// 假设你要找的链接是 https://gemini.google.com/app/123456
// const targetElement = await findTargetInGeminiSidebar(
//     "https://gemini.google.com/app/123456", 
//     "a" // 或者更精确的选择器，如 'a[href^="/app/"]'
// );

// if (targetElement) {
//     // 找到了！可以做你想做的事，比如模拟点击
//     // targetElement.click(); 
// }



// 阅读代码，检查逻辑。为什么会出现folders里有id的文件夹，但却不渲染，检查是否存在使得父文件夹的children里没有子id，而folers里却有该id的逻辑漏洞；其次在嵌入面板中新建的文件夹，随后执行了渲染，但并没有出现，并且只在主面板中出现！只有刷新页面才会在嵌入面板中出现！
