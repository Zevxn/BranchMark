(function() {
    const params = new URLSearchParams(window.location.search);
    console.log(params)
    if (params.get('type') === 'sidebar') {
        document.body.classList.add('sidebar-mode');
    }
})();
// =============================================================================
// GLOBAL CONFIG: MemFire / Supabase
// =============================================================================
const $ = s => document.querySelector(s);
// Toast 工具
const toastEl = $('#toast');
let toastTimer = null;
function showToast(msg) {
    toastEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> ${msg}`;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastEl.classList.remove('show');
    }, 1000);
}
document.addEventListener('DOMContentLoaded', async () => {
    // --- Tab 切换逻辑 ---
    const tabs = document.querySelectorAll('.nav-item:not(.sidebar-bottom-link)');
    const views = document.querySelectorAll('.tab-view');
    let {activeTab:activeTab} = await chrome.storage.local.get('activeTab');
    if (!activeTab) {
        activeTab = 'tab-commands'; // 默认激活第一个 Tab
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', async() => {
            tabs.forEach(t => t.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            tab.classList.add('active');
            const targetId = tab.dataset.tab;
            document.getElementById(targetId).classList.add('active');
            chrome.storage.local.set({ activeTab: targetId });
        });
        if (tab.dataset.tab === activeTab) {
            tab.click();
        }
    });
    await initCmdModal();
    await initPromptManager(); // ★★★ 启动提示词管理模块 ★★★
    await initWebDavSync();    // ★★★ 启动 WebDAV 同步模块 ★★★
    await initSettingManager(); // ★★★ 启动设置模块 ★★★
    // await initAuth();          // ★★★ 启动 Auth 模块 ★★★
    renderLanguage();
});



    

//=======================================================================================================
// #region WebDAV 同步逻辑
//=======================================================================================================
async function initWebDavSync() {
    const SYNC_KEYS = ['bookmarkData', 'shortcutsData', 'shortcutCategories','highlightData-','largeContents.__REF__', 'MindMapData.__REF__'];
    const loginSection = $('#loginSection');
    const syncSection = $('#syncSection');
    const sumInfo = $('#sumInfo');
    const mapInfo = $('#mapInfo');
    const qaInfo = $('#qaInfo');
    const fullInfo = $('#fullInfo');
    const localInfo = $('#localInfo');
    const keyInfo = $('#keyInfo');
    const syncStatus = $('#syncStatus');
    const username = $('#username');
    const password = $('#password');
    const loginBtn = $('#loginBtn');
    const uploadBtn = $('#uploadBtn');
    const syncBtn = $('#syncBtn');
    const downloadBtn = $('#downloadBtn');
    const logoutBtn = $('#logoutBtn');
    const autoSyncToggle = $('#autoSyncToggle');
    // --- 监听输入，实时保存 ---
    username.addEventListener('input', saveWebDavInputState);
    password.addEventListener('input', saveWebDavInputState);

    // --- 初始化时，尝试恢复 ---
    restoreWebDavInputState();

    try {
        // 检查登录状态
        const result = await chrome.storage.local.get('nutstore_credentials');
        if (result.nutstore_credentials) {
            loginSection.classList.add('hidden');
            syncSection.classList.remove('hidden');
        }
        // 加载自动同步配置
        const config = await chrome.storage.local.get('autoSync');
        autoSyncToggle.checked = config.autoSync !== false; // 默认开启
        
        // 更新状态显示
        await updateSyncStatus();
        await updateKeyInfo();
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: error.name,
            message: error.message
        });
    }

    async function testConnection(authString) {
        try {
        const response = await fetch('https://dav.jianguoyun.com/dav/', {
            method: 'PROPFIND',
            headers: {
            'Authorization': `Basic ${authString}`,
            'Depth': '0'
            }
        });
        return response.ok;
        } catch (error) {
        console.error('连接测试失败:', error);
        return false;
        }
    }
//===============================================================================================
// #region 同步信息更新
//==============================================================================================*/
    async function updateSyncStatus() {
        try {
            const meta = await chrome.storage.local.get(['lastSyncTime', 'pendingChanges']);
            
            let statusText = '';
            if (meta.pendingChanges) {
                // statusText = '⚠️ 有待上传的更改';
                statusText = getI18nText('sync.status_pending_upload');
            } else if (meta.lastSyncTime) {
                // statusText = `✅ 已同步: ${new Date(meta.lastSyncTime).toLocaleString()}`;
                statusText = `${getI18nText('sync.status_synced')}${new Date(meta.lastSyncTime).toLocaleString()}`
            } else {
                // statusText = '❌ 尚未同步';
                statusText = getI18nText('sync.status_not_synced');
            }
            syncStatus.textContent = statusText;
            syncStatus.removeAttribute('data-i18n'); // 移除 i18n 标记，防止后续被误杀
        } catch (error) {
            console.error('更新同步状态失败:', error);
            // syncStatus.textContent = '状态获取失败';
            syncStatus.textContent = getI18nText('sync.status_fetch_failed');
        }
    }
    async function updateKeyInfo() {
        try {
            const allData = await idbStorage.get(null);
            const keys = Object.keys(allData).filter(key => SYNC_KEYS.some(pattern => key === pattern || key.startsWith(pattern)));
            const targetKeys = keys.filter(key => key.startsWith('largeContents.'));

            const mapCount = keys.filter(key => key.startsWith('MindMapData.__REF__')).length;
            const qaCount = targetKeys.filter(k => (k.match(/-/g) || []).length === 2).length;
            const fullCount = targetKeys.filter(k => (k.match(/-/g) || []).length === 1).length;
            const localCount = keys.filter(key => key.startsWith('highlightData')).length;
            const shortcutCount = allData.shortcutsData? allData.shortcutsData.length : 0;
            sumInfo.textContent = `${keys.length}`;
            mapInfo.textContent = `${mapCount}`;
            qaInfo.textContent = `${qaCount}`;
            fullInfo.textContent = `${fullCount}`;
            localInfo.textContent = `${localCount}`;
            keyInfo.textContent = `${shortcutCount}`;

            sumInfo.style.color = keys.length > 0 ? '#10b981' : '#64748b';
            mapInfo.style.color = mapCount > 0? '#10b981' : '#64748b';
            qaInfo.style.color = qaCount > 0? '#10b981' : '#64748b';
            fullInfo.style.color = fullCount > 0? '#10b981' : '#64748b';
            localInfo.style.color = localCount > 0? '#10b981' : '#64748b';
            keyInfo.style.color = shortcutCount > 0? '#10b981' : '#64748b';


        } catch (error) {
            console.error('更新键信息失败:', error);
            sumInfo.textContent = '检测失败';
            sumInfo.style.color = '#ef4444';
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: error.name,
                message: error.message
            });
        }
    }
    $('[data-tab="tab-sync"]').addEventListener('click', async() => {
        await updateSyncStatus();
        await updateKeyInfo();
    })

    loginBtn.addEventListener('click', async () => {
        // if (!await checkProPermission()){showToast(getI18nText('toast.pro_only')); return;}
        if (!username.value || !password.value) { alert('请输入账号和密码'); return; }
        try {
            loginBtn.disabled = true; 
            loginBtn.textContent = '登录中...';
            const davUser = username.value.trim();
            const davPass = password.value.trim();
            const authString = btoa(`${davUser}:${davPass}`);
            if (!await testConnection(authString)) throw new Error('无法连接到坚果云');
            // const { data: { user: memUser } } = await supabaseClient.auth.getUser();
            // if (memUser) {  // 如果当前已经登录了 MemFire，立即把这个坚果云账号同步上去
            //     console.log('🔗 更新云端绑定的坚果云账号:', davUser);
            //     const { error } = await supabaseClient.rpc('update_webdav_binding', {
            //         p_webdav_email: davUser
            //     });
            //     if (error) console.error('绑定更新失败:', error);
            // }
            await chrome.storage.local.set({ nutstore_credentials: authString });
            await chrome.storage.local.remove('temp_webdav_input'); //登录成功了，清除临时填写的密码缓存，防止泄露
            loginSection.classList.add('hidden'); 
            syncSection.classList.remove('hidden');
            if (!(await chrome.storage.local.get('initializedDownload')).initializedDownload) {
                await chrome.runtime.sendMessage({ action: 'sync_download', isNotify: true });
                await chrome.storage.local.set({initializedDownload: true});
            }
        } catch (error) { 
            alert(`登录失败: ${error.message}`); 
        } 
        finally { 
            loginBtn.disabled = false; loginBtn.textContent = '连接服务器'; 
        }
    });
    autoSyncToggle.addEventListener('change', async (e) => {
        await chrome.storage.local.set({ autoSync: e.target.checked });
        
        if (e.target.checked) {
            chrome.alarms.create('autoSyncCheck', { periodInMinutes: 5 });
        } else {
            chrome.alarms.clear('autoSyncCheck');
        }
    });
//===============================================================================================
// #region 上传
// ==============================================================================================
    uploadBtn.addEventListener('click', async () => {
        if(!await updateUIStatus()) return;
        setButtonLoading('uploadBtn', true, getI18nText('sync.btn_uploading'));
        try {
            console.log('🚀 用户触发上传');
            const response = await chrome.runtime.sendMessage({ action: 'sync_upload' });
            
            if (response.success) {
                // 这里可以根据需要简短显示结果，因为空间有限
                document.querySelector('#uploadBtn .btn-text-content').textContent = getI18nText('sync.load_success');
                setTimeout(() => {
                    setButtonLoading('uploadBtn', false, getI18nText('sync.btn_upload'));
                }, 1000);
            } else {
                throw new Error(response.error || '未知错误');
            }
        } catch (error) {
            console.error('上传失败:', error);
            document.querySelector('#uploadBtn .btn-text-content').textContent = getI18nText('sync.load_fail');
        } finally {
            await updateSyncStatus();
            await updateKeyInfo();
            
        }
    });
//===============================================================================================
// #region 下载
// ==============================================================================================
    downloadBtn.addEventListener('click', async () => {
        if(!await updateUIStatus()) return;
        if (!confirm('⚠️ 下载会覆盖本地，确定？')) return;
        setButtonLoading('downloadBtn', true, getI18nText('sync.btn_downloading'));
        try {
            console.log('🚀 用户触发强制下载');
            const response = await chrome.runtime.sendMessage({ 
                action: 'sync_download',
                isNotify: true 
            });
            
            if (response.success) {
                document.querySelector('#downloadBtn .btn-text-content').textContent = getI18nText('sync.load_success');
                setTimeout(() => {
                    setButtonLoading('downloadBtn', false, getI18nText('sync.btn_download'));
                }, 1000);
            } else {
                throw new Error(response.error || '未知错误');
            }
        } catch (error) {
            console.error('下载失败:', error);
            document.querySelector('#downloadBtn .btn-text-content').textContent = getI18nText('sync.load_fail');
        } finally {
            await updateSyncStatus();
            await updateKeyInfo();
        }
    });
//===============================================================================================
// #region 检查云端更新
// ==============================================================================================
    syncBtn.addEventListener('click', async () => {
        if(!await updateUIStatus()) return;
        setButtonLoading('syncBtn', true, getI18nText('sync.btn_checking'));
        try {
            console.log('🚀 手动同步');
            const response = await chrome.runtime.sendMessage({ action: 'manul_sync' });
            
            if (response.success) {
                // 如果有下载或删除，显示具体数字；否则显示已最新
                if (response.downloaded > 0 || response.deleted > 0) {
                    const updateResult = getI18nText('sync.status_update_result')
                        .replace('{add}', response.downloaded)
                        .replace('{del}', response.deleted);
                    document.querySelector('#syncBtn .btn-text-content').textContent = updateResult;
                } else {
                    document.querySelector('#syncBtn .btn-text-content').textContent = getI18nText('sync.status_up_to_date');
                    // 如果没有更新，顺便清理一下状态
                    await chrome.storage.local.set({
                        lastSyncTime: Date.now(),
                        pendingChanges: false,
                        pendingKeys: [],
                    });
                }
                setTimeout(() => {
                    setButtonLoading('syncBtn', false, getI18nText('sync.btn_check_update'));
                }, 1000);
            } else {
                throw new Error(response.error || '未知错误');
            }
        } catch (error) {
            console.error('同步失败:', error);
            document.querySelector('#syncBtn .btn-text-content').textContent = getI18nText('sync.load_fail');
        } finally {
            await updateSyncStatus();
            await updateKeyInfo();          
        }
    });
    logoutBtn.addEventListener('click', async () => { await chrome.storage.local.remove('nutstore_credentials'); location.reload(); });

    function setButtonLoading(btnId, isLoading, text = null) {
        const btn = document.getElementById(btnId); const textSpan = btn.querySelector('.btn-text-content');
        if (isLoading) { btn.classList.add('is-loading'); if(text) textSpan.textContent = text; } 
        else { btn.classList.remove('is-loading'); if(text) textSpan.textContent = text; }
    }

    /*💾 实时保存 WebDAV 输入状态*/
    function saveWebDavInputState() {
        const state = {
            user: $('#username').value,
            pass: $('#password').value,
            timestamp: Date.now()
        };
        chrome.storage.local.set({ 'temp_webdav_input': state });
    }

    /* 🔄 恢复 WebDAV 输入状态*/
    async function restoreWebDavInputState() {
        // 如果已经登录成功了，就没必要恢复输入框了
        const creds = await chrome.storage.local.get('nutstore_credentials');
        if (creds.nutstore_credentials) return;

        const data = await chrome.storage.local.get('temp_webdav_input');
        const state = data.temp_webdav_input;

        // 缓存有效期 10 分钟
        if (state && (Date.now() - state.timestamp < 10 * 60 * 1000)) {
            // console.log('🔄 恢复 WebDAV 输入框内容');
            const elUser = $('#username');
            const elPass = $('#password');
            if (elUser) elUser.value = state.user || '';
            if (elPass) elPass.value = state.pass || '';
        }
    }

    /* 🧹 清除 WebDAV 临时缓存 (登录成功后)*/
    async function clearWebDavInputState() {
        await chrome.storage.local.remove('temp_webdav_input');
    }

}


async function updateUIStatus() {
    return true;
    try {
        const cacheKey = 'user_plan_cache';
        const { [cacheKey]: cachedData } = await chrome.storage.local.get(cacheKey);

        if (!cachedData || !cachedData.uid) {
            return false;
        }

        // ★★★ 改动：加上 await 调用 Web Crypto API
        const statusStr = cachedData.isChro ? 'chrome' : 'edge';
        const isValid = await verifySignature(cachedData.uid, statusStr, cachedData.signature);

        if (isValid && cachedData.isChro) {
            return true;
        } else {
            return false;
        }

    } catch (e) {
        console.error('Check Error:', e);
        return false;
    }
}

/* 获取简单的设备名称 (用于后台识别) */
function getDeviceName() {
    const platform = navigator.platform || 'Unknown';
    return `Chrome Extension on ${platform}`;
}


// =======================================================================================================
// #region 提示词管理
// =======================================================================================================
async function initPromptManager() {
    // --- DOM 引用 ---
    const cmdListEl = $('#cmdList');
    const addCmdBtn = $('#addCmdBtn');
    const inputCmdBtn = $('#inputCmdBtn');
    const outputCmdBtn = $('#outputCmdBtn');
    const fileInput = $('#fileInput');
    const cmdSearch = $('#cmdSearch');
    
    // 分类 DOM
    const categoryListEl = $('#categoryList');
    const addCategoryBtn = $('#addCategoryBtn');

    // 模态框 DOM
    const editKey = $('#editKey');
    const editValue = $('#editValue');
    const editCategory = $('#editCategory'); // 新增
    const autoSendToggle = $('#autoSendToggle'); // 新增：获取开关元素
    const modalSave = $('#modalSave');

    // 上下文菜单 DOM
    const ctxMenu = $('#contextMenu');
    const ctxRename = $('#ctxRename');
    const ctxDelete = $('#ctxDelete');
    let ctxTargetId = null; // 当前右键选中的分类ID

    // 分类模态框 DOM
    const catModalOverlay = $('#catModalOverlay');
    const catModalTitle = $('#catModalTitle');
    const catRenameContainer = $('#catRenameContainer');
    const catDeleteContainer = $('#catDeleteContainer');
    const cmdDeleteContainer = $('#cmdDeleteContainer'); 
    const catNameInput = $('#catNameInput');
    const catModalCancel = $('#catModalCancel');
    const catModalConfirm = $('#catModalConfirm');


    // ★★★ 新增：导出模态框引用 ★★★
    const exportModalOverlay = $('#exportModalOverlay');
    const exportAllCheck = $('#exportAllCheck');
    const exportListContainer = $('#exportListContainer');
    const exportConfirmBtn = $('#exportConfirmBtn');
    const exportCancelBtn = $('#exportCancelBtn');

    // 临时变量，用于存储当前正在操作的分类信息
    let currentCatAction = null;    // { type: 'rename'|'delete', id: '...' }
    // let currentEditingId = null;    // 当前正在编辑的指令ID，null表示新建
    let allCommands = [];           // 存储所有指令
    let allCategories = [];         // 存储所有分类: {id, name, order}
    let activeCategoryId = 'all';   // 当前选中的分类ID

    // ★★★ 新增：多选状态管理 ★★★
    let selectedIds = new Set(); // 存储选中指令的 ID
    let lastSelectedId = null;   // 用于 Shift 连选
    let originalItem=null;

    // --- 初始化 ---
    await loadData();    
    // --- 事件监听 ---
    addCmdBtn.addEventListener('click', () => openModal(null, allCategories,activeCategoryId));
    cmdSearch.addEventListener('input', () => renderMainList());
    // chrome.storage.onChanged.addListener((changes, namespace) => {
    //     if (namespace === 'local' && changes.shortcutsData) {
    //         loadData();
    //     }
    // });
    // ★★★ 新增：支持鼠标滚轮横向滚动 ★★★
    categoryListEl.addEventListener('wheel', (e) => {
        // 只有当存在垂直滚动量时才处理
        if (e.deltaY !== 0) {
            // 1. 阻止浏览器默认的垂直滚动页面行为
            e.preventDefault();
            
            // 2. 将滚轮的垂直移动量 (deltaY) 加到容器的水平滚动位置 (scrollLeft) 上
            // 这样向下滚动滚轮 = 向右滑动胶囊
            categoryListEl.scrollLeft += e.deltaY;
        }
    }, { passive: false }); // ★ 重要：必须设为 false 才能使用 preventDefault 拦截滚动


    // 保存指令 (新建/编辑)
    modalSave.addEventListener('click', () => {
        const key = editKey.value.trim(); 
        const value = editValue.value;
        const catId = editCategory.value;
        const autoSend = autoSendToggle.checked;

        if (!key) { alert('请输入触发关键词'); return; }
        const currentEditingId=localStorage.getItem('currentEditingId');
        if (currentEditingId && originalItem) {     // 编辑指令========================================
            console.log('currentEditingId',currentEditingId);
            if (originalItem.key == key && originalItem.value == value &&
                originalItem.categoryId == catId  && originalItem.autoSend===autoSend) {
                closeModal();
                setTimeout(() => {originalItem=null}, 2000);
                return;
            }
            const idx = allCommands.findIndex(c => c.id === currentEditingId);
            if (idx > -1) { 
                allCommands[idx].key = key; 
                allCommands[idx].value = value;
                allCommands[idx].categoryId = catId; // 更新分类
                allCommands[idx].autoSend = autoSend;
                allCommands[idx]=preprocessShortcut(allCommands[idx])
            }
        } else {     // 新建指令========================================================================
            allCommands.push({ 
                id: Date.now().toString(36), 
                key: key, 
                value: value,
                autoSend:autoSend,
                active: true,
                usageCount: 0,
                createdAt: new Date().toLocaleString(),
                categoryId: catId // 新建时设置分类
            }); 
        }
        saveData(); 
        closeModal();
    });

    // =========================================================================================================
    // #region 导出逻辑 (修改版)
    // =========================================================================================================

    // 1. 点击导出按钮 -> 打开模态框
    outputCmdBtn.onclick = () => {
        renderExportList();
        exportModalOverlay.classList.remove('hidden');
    };

    // 2. 关闭导出模态框
    function closeExportModal() {
        exportModalOverlay.classList.add('hidden');
    }
    
    exportCancelBtn.onclick = closeExportModal;
    exportModalOverlay.addEventListener('click', (e) => { 
        if (e.target === exportModalOverlay) closeExportModal(); 
    });

    // 3. 渲染导出分类列表
    function renderExportList() {
        exportListContainer.innerHTML = '';
        exportAllCheck.checked = true; // 默认全选状态

        // A. 添加 "无分类" 选项 (如果有未分类的指令)
        const hasUncategorized = allCommands.some(c => !c.categoryId);
        if (hasUncategorized) {
            addExportOption('', '无分类 (未归档)', true);
        }

        // B. 添加所有用户分类
        allCategories.forEach(cat => {
            addExportOption(cat.id, cat.name, true);
        });
    }

    // 辅助：添加单个选项
    function addExportOption(id, name, isChecked) {
        const label = document.createElement('label');
        label.className = 'export-item';
        label.innerHTML = `
            <input type="checkbox" class="export-cat-checkbox" value="${id}" ${isChecked ? 'checked' : ''}>
            <span>${escapeHtml(name)}</span>
        `;
        // 监听单个点击，更新全选按钮的状态
        label.querySelector('input').addEventListener('change', updateSelectAllStatus);
        exportListContainer.appendChild(label);
    }

    // 4. 全选/反选 逻辑
    exportAllCheck.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const checkboxes = exportListContainer.querySelectorAll('.export-cat-checkbox');
        checkboxes.forEach(box => box.checked = isChecked);
    });

    function updateSelectAllStatus() {
        const checkboxes = Array.from(exportListContainer.querySelectorAll('.export-cat-checkbox'));
        const allChecked = checkboxes.every(box => box.checked);
        const someChecked = checkboxes.some(box => box.checked);
        exportAllCheck.checked = allChecked;
        // 可选：设置 indeterminate 状态
        exportAllCheck.indeterminate = someChecked && !allChecked;
    }

    // 5. 确认导出
    exportConfirmBtn.onclick = () => {
        // 获取选中的分类ID
        const checkboxes = exportListContainer.querySelectorAll('.export-cat-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(box => box.value);

        if (selectedIds.length === 0) {
            alert('请至少选择一个分类进行导出');
            return;
        }

        // 筛选数据
        // 1. 筛选分类：只包含被选中的分类对象
        const catsToExport = allCategories.filter(cat => selectedIds.includes(cat.id));

        // 2. 筛选指令：指令的分类ID在选中列表中，或者 (指令无分类 且 选中了空字符串)
        const cmdsToExport = allCommands.filter(cmd => {
            const cId = cmd.categoryId || ''; // 将 null/undefined 转为空字符串统一比较
            return selectedIds.includes(cId);
        });

        // 执行导出
        const exportData = { 
            allCommands: cmdsToExport, 
            allCategories: catsToExport 
        };

        const a = document.createElement('a'); 
        a.href = URL.createObjectURL(
            new Blob([JSON.stringify(exportData, null, 2)], {type:'application/json'})
        ); 
        
        // 生成包含日期的文件名
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `快捷指令备份_${dateStr}.json`; 
        a.click();
        
        closeExportModal();
        showToast(getI18nText('toast.export_cmds_success').replace('{length}', cmdsToExport.length));
    };


    // 导入
    fileInput.onchange = (e) =>{ 
        const f=e.target.files[0]; 
        if(!f)return; 
        const r=new FileReader(); 
        r.onload=(ev)=>{ 
            try{
                const j=JSON.parse(ev.target.result);
                const importedCmds = j.allCommands || (Array.isArray(j) ? j : []);
                const importedCats = j.allCategories || [];

                // 1. 处理分类导入
                if(importedCats.length) {
                    const nameSet = new Set(allCategories.map(c => c.name));
                    importedCats.forEach(cat => {
                        // 过滤掉旧版备份可能产生的 id='default'
                        // if (cat.id === 'default') return; 

                        if(!nameSet.has(cat.name) && !allCategories.some(c => c.id === cat.id)) {
                            allCategories.push(cat);
                        }
                    });
                }

                // 2. 处理指令导入
                if(importedCmds.length){
                    const idSet = new Set(allCommands.map(item => item.id));
                    importedCmds.forEach(cmd=>{
                        if(!idSet.has(cmd.id)) {
                            // ★★★ 修改：如果分类不存在或为 default，则设为空 ★★★
                            const targetCatExists = cmd.categoryId && allCategories.some(c => c.id === cmd.categoryId);
                            
                            if (!cmd.categoryId || !targetCatExists) {
                                cmd.categoryId = ''; // 归为无分类
                            }
                            allCommands.push(cmd);
                        }
                    });
                }
                
                renderCategories();
                renderMainList();
                saveData(true);
                // alert(`导入成功！\n新增 ${importedCmds.length} 条指令`);
                showToast(getI18nText('toast.import_cmds_success').replace('{length}', importedCmds.length));
            }catch(e){
                console.error(e);
                alert('文件格式错误');
            } e.target.value=''; 
        };
        r.readAsText(f);
    };
    inputCmdBtn.onclick=()=>fileInput.click();
    
    // Tab 激活时刷新
    $('[data-tab="tab-commands"]').addEventListener('click', async() => {
        if (allCommands.length) await loadData();
    })

    // #region--- 数据加载与保存 ---
    async function loadData() {
        const result = await idbStorage.get(['shortcutsData', 'shortcutCategories']);
        allCommands = result.shortcutsData || [];
        allCategories = result.shortcutCategories || [];
        await chrome.storage.local.set({shortcutCategories: allCategories});    // 同步过来时可能没有分类
        await chrome.storage.local.set({shortcutsData: allCommands});   // 更新指令缓存

        const savedId = await chrome.storage.local.get('activeCatId');
        activeCategoryId = savedId.activeCatId || 'all';

        // ★★★ 数据清洗 ★★★
        // 确保所有指令都有 categoryId 字段，如果没有（旧数据），设为空字符串
        let needSaveCmds = false;
        allCommands.forEach(cmd => {
            if (cmd.categoryId === undefined || cmd.categoryId === null) {
                cmd.categoryId = ''; // 标记为无分类
                needSaveCmds = true;
            }
            // ★★★ 保险措施：如果因为某些原因 ID 丢失，补一个 ★★★
            if (!cmd.id) cmd.id = Date.now().toString(36) + Math.random().toString(36).substr(2);
        });

        if (needSaveCmds) {
            await saveData(false); 
        }
        
        renderCategories();
        renderMainList();
    }

    async function saveData(saveCats = false) {
        // 保存指令
        allCommands=preprocessShortcuts(allCommands);
        allCommands=preprocessEnKey(allCommands);
        chrome.runtime.sendMessage({ action: 'IDB_SET', data:{'shortcutsData': allCommands}})
        await chrome.storage.local.set({shortcutsData: allCommands});
        
        // 保存分类 (仅当需要时)
        if (saveCats) {
            chrome.runtime.sendMessage({ action: 'IDB_SET', data:{'shortcutCategories': allCategories}})
            await chrome.storage.local.set({shortcutCategories: allCategories});
        }
        
        renderMainList();
    }

    // =========================================================================================================
    // #region 指令列表
    // =========================================================================================================

    
    // 如果用户不小心把元素拖到了父容器的空白处松手，也要处理（防止不保存）
    // 通常只要 dropEffect 是 move，浏览器就不会报错，
    // 而实际的排序已经在 dragover 中通过 insertBefore 完成了，
    // 所以这里的 drop 主要是为了兜底（可选，但建议加上）
    cmdListEl.addEventListener('drop', (e) => {
        e.preventDefault();
        // 触发一次保存，确保万无一失
        if(draggedCmdEl) {
             // 这里复用原本 item drop 的逻辑，重新计算排序并保存
             // 为简单起见，这里可以手动触发一下 saveData，或者依赖 item 的 drop 冒泡
             // 由于 item 的 drop 有 e.stopPropagation()，所以这里主要处理“没点中 item”的情况
             saveData(); 
        }
    });

    function renderMainList() {
        const filterText = cmdSearch.value.toLowerCase();
        
        // 1. 筛选逻辑
        let displayList = allCommands.filter(item => {
            // 搜索过滤
            const matchSearch = item.key.toLowerCase().includes(filterText) || item.value.toLowerCase().includes(filterText);
            if (!matchSearch) return false;

            // 分类过滤
            if (activeCategoryId === 'all') return true; // 全部显示所有
            return item.categoryId === activeCategoryId;
        });

        renderCommands(displayList);
    }

    // --- 渲染 DOM (复用原有逻辑并修改) ---
    function renderCommands(list) {
        cmdListEl.innerHTML = '';
        if (list.length === 0) {
            cmdListEl.innerHTML = `<div style="text-align:center; color:var(--text-sub); margin-top:20px; font-size:12px;">该分类下暂无指令</div>`;
            return;
        }
        list.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'cmd-item';
            el.setAttribute('draggable', true); 
            // 存储真实 ID 到 DOM，方便后续排序提取
            el.dataset.cmdId = item.id;
            
            if (!item.active) el.style.opacity = '0.6';
            
            let catName = '';
            if (item.categoryId) {
                const cat = allCategories.find(c => c.id === item.categoryId);
                if (cat) catName = cat.name;
            }
            el.innerHTML = `
                <div class="cmd-drag-handle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </div>
                <div class="cmd-badge" style="opacity:${item.active ? 1 : 0.5}">${escapeHtml(item.key)}</div>
                
                <div class="cmd-content" style="opacity:${item.active ? 1 : 0.5}">
                    <div class="cmd-text">${escapeHtml(item.value)}</div>
                    ${catName ? `<span style="font-size:10px; background:var(--bg-sidebar); padding:2px 6px; border-radius:4px; margin-left:6px; color:var(--text-sub); border:1px solid var(--border); white-space:nowrap;">${catName}</span>` : ''}
                </div>
                
                <div class="cmd-actions">
                    <button class="icon-btn toggle-btn ${item.active ? 'active' : ''}" title="${item.active ? '已启用' : '已禁用'}">
                       ${item.active ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>'}
                    </button>
                    <button class="icon-btn edit-btn" title="编辑"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                    <button class="icon-btn danger delete-btn" title="删除"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div>
            `;
            
            // 事件绑定保持不变...
            // 1. 绑定 Click 事件 (多选逻辑)
            el.addEventListener('click', (e) => {
                // 排除按钮和拖拽手柄
                if (e.target.closest('button') || e.target.closest('.cmd-drag-handle')) return;

                const isMulti = e.ctrlKey || e.metaKey;
                const isRange = e.shiftKey;

                if (isMulti || isRange) {
                    // --- 进入多选模式 ---
                    if (isRange) {
                        // Shift 连选逻辑
                        console.log('Shift 连选', item.id, lastSelectedId);
                        if (!lastSelectedId) {
                            lastSelectedId = item.id;
                            selectedIds.add(item.id);
                        }else{
                            const currentIndex = list.findIndex(c => c.id === item.id);
                            const lastIndex = list.findIndex(c => c.id === lastSelectedId);
                            if (currentIndex !== -1 && lastIndex !== -1) {
                                const start = Math.min(currentIndex, lastIndex);
                                const end = Math.max(currentIndex, lastIndex);
                                if (!isMulti) selectedIds.clear(); // 如果只按 Shift，清除之前的
                                for (let i = start; i <= end; i++) {
                                    selectedIds.add(list[i].id);
                                }
                            } 
                        }

                    } else {
                        // Ctrl 加选/减选
                        if (selectedIds.has(item.id)) selectedIds.delete(item.id);
                        else selectedIds.add(item.id);
                        lastSelectedId = item.id;
                    }
                    updateSelectionVisuals(); // 刷新视觉
                } else {
                    // --- 普通单击模式 ---
                    // 如果当前是多选状态，单击会取消多选；否则执行复制
                    if (selectedIds.size > 0) {
                        lastSelectedId = null;
                        selectedIds.clear();
                        updateSelectionVisuals();
                        // 这里你可以选择：清空选择后是否继续执行复制？
                        // 现在的逻辑是：如果刚才在多选，单击只取消选择，不复制。再次单击才复制。
                        // 这样能防止误操作。
                        return; 
                    }
                    
                    // 原有复制逻辑
                    el.classList.add('copied-success');
                    setTimeout(() => el.classList.remove('copied-success'), 300);
                    navigator.clipboard.writeText(item.value).then(() => showToast(getI18nText('toast.copied')));
                }
            });

            // 2. ★★★ 新增：绑定右键菜单 ★★★
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation(); // 防止冒泡到分类栏

                // 如果右键点的不是已选中的，则切换为单选当前
                if (!selectedIds.has(item.id)) {
                    selectedIds.clear();
                    selectedIds.add(item.id);
                    updateSelectionVisuals();
                }
                
                console.log('Shift 连选结果', selectedIds);
                // 显示右键菜单 (逻辑稍后定义)
                showCommandContextMenu(e); 
            });
            el.addEventListener('dblclick', (e) => {
                if (e.target.closest('button') || e.target.closest('.cmd-drag-handle')) return;
                localStorage.setItem('currentEditingId', item.id)
                originalItem=item;
                openModal(item, allCategories,activeCategoryId);
            });
            el.querySelector('.toggle-btn').addEventListener('click', (e) => {
                e.stopPropagation(); item.active = !item.active; saveData();
            });
            el.querySelector('.edit-btn').addEventListener('click', (e) => { 
                e.stopPropagation(); 
                localStorage.setItem('currentEditingId', item.id)
                originalItem=item;
                openModal(item, allCategories,activeCategoryId); 
            });
            el.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation(); openCatModal('delete_cmd', item.id);
            });
            // ★★★ 调用新的拖拽绑定逻辑 ★★★
            addDragEvents(el, item.id); 
            cmdListEl.appendChild(el);
        });
    }

    function updateSelectionVisuals() {
        const items = document.querySelectorAll('.cmd-item');
        items.forEach(el => {
            const id = el.dataset.cmdId;
            if (selectedIds.has(id)) el.classList.add('selected');
            else el.classList.remove('selected');
        });
    }
    // 显示指令右键菜单
    function showCommandContextMenu(e) {
        // 隐藏 "重命名" (指令暂不支持/不需要右键重命名，通常双击编辑)
        ctxRename.style.display = 'none';
        ctxMenu.querySelector('.ctx-divider').style.display='none';
        ctxDelete.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> 删除指令`;

        // 标记当前是在操作指令 (复用 ctxTargetId 变量，或者引入新变量)
        ctxTargetId = 'BATCH_CMD_OP'; 

        // 计算位置 (复用原有逻辑)
        const menuWidth = 140; 
        const menuHeight = 40; // 只有一项
        let x = e.clientX; let y = e.clientY;
        if (x + menuWidth > window.innerWidth) x -= menuWidth;
        if (y + menuHeight > window.innerHeight) y -= menuHeight;
        
        ctxMenu.style.left = `${x}px`;
        ctxMenu.style.top = `${y}px`;
        ctxMenu.classList.add('visible');
    }
    function addDragEvents(el, id) {
        // 1. Drag Start (开始拖拽)
        el.addEventListener('dragstart', (e) => {
            // 如果当前拖拽的元素不在选区内，重置选区为当前元素 (单拖)
            if (!selectedIds.has(id)) {
                selectedIds.clear();
                selectedIds.add(id);
                updateSelectionVisuals();
            }
            draggedCmdEl = el;
            
            // 设定数据
            e.dataTransfer.effectAllowed = 'move';

            e.dataTransfer.setData('text/plain', id); 
            e.dataTransfer.setData('application/x-cmd-id', id);
              // ★★★ 核心：判断是单选还是多选，传递不同数据 ★★★
            if (selectedIds.size > 1) {
                // 传递批量 ID
                const batchData = { ids: Array.from(selectedIds) };
                e.dataTransfer.setData('application/json-batch-cmds', JSON.stringify(batchData));
                
                // 可选：设置自定义 Ghost Image 显示 "选中 N 项"
                // 如果不加这段，浏览器默认会显示当前被拖拽的那一个卡片
                if (e.dataTransfer.setDragImage) {
                const badge = document.createElement('div');
                badge.style.background = '#ef4444'; 
                badge.style.color='white'; 
                badge.style.padding='4px 8px'; 
                badge.style.borderRadius='4px';
                badge.style.position='absolute'; 
                badge.style.top='-100px';
                badge.innerText = `批量移动 ${selectedIds.size} 项`;
                document.body.appendChild(badge);
                e.dataTransfer.setDragImage(badge, 0, 0);
                setTimeout(()=>document.body.removeChild(badge), 0);
                }
            } else {
                // 单个拖拽 (保持原有逻辑兼容)
                e.dataTransfer.setData('text/plain', id); 
                e.dataTransfer.setData('application/x-cmd-id', id);
                if (e.dataTransfer.setDragImage) {
                    const rect = el.getBoundingClientRect();
                    const offsetX = e.clientX - rect.left;
                    const offsetY = e.clientY - rect.top;

                    // 1. 克隆当前元素
                    const clone = el.cloneNode(true);
                    
                    // 2. 设置样式使其脱离文档流并完全显示，但用户不可见（移出屏幕）
                    clone.style.position = "absolute";
                    clone.style.top = "-9999px"; 
                    clone.style.left = "-9999px";
                    clone.style.zIndex = "9999";
                    clone.style.width = `${rect.width}px`; // 强制保持原有宽度
                    clone.style.height = `${rect.height}px`; // 强制保持原有高度
                    clone.style.opacity = "1"; // 确保完全不透明
                    clone.classList.remove('active'); // 可选：移除激活状态样式
                    
                    // 3. 必须添加到 body 才能被浏览器渲染为图片
                    document.body.appendChild(clone);

                    // 4. 设置为拖拽图像
                    e.dataTransfer.setDragImage(clone, offsetX, offsetY);

                    // 5. 稍微延迟后清理克隆元素 (setTimeout 0 确保浏览器有时间捕获图像)
                    setTimeout(() => {
                        document.body.removeChild(clone);
                    }, 0);
                }
            }


            // 延迟变形：将变身虚线框的操作推迟 20ms
            setTimeout(() => {
                el.classList.add('sort-placeholder'); 
                el.classList.add('dragging');         
            }, 20);
        });
        
        // 2. Drag End (拖拽结束)
        el.addEventListener('dragend', () => {
            el.classList.remove('sort-placeholder');
            el.classList.remove('dragging');
            draggedCmdEl = null;
            isAnimating = false;
            
            // 清理残余样式
            document.querySelectorAll('.cmd-item').forEach(item => { 
                item.style.transition = '';
                item.style.transform = '';
            });
        });

        // ★★★ 核心修复 B：解决光标闪烁禁止符的问题 ★★★
        
        // 新增：Drag Enter (进入元素时立即声明所有权)
        // 很多时候光标闪烁是因为 dragenter 没有阻止默认行为
        el.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        // 3. Drag Over (执行纵向流体动画)
        el.addEventListener('dragover', (e) => {
            // 1. 第一优先级：阻止默认行为，防止光标变禁止符
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'move';

            // 2. 业务逻辑判断
            if (!draggedCmdEl || draggedCmdEl === el || isAnimating) return;

            const rect = el.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const isTop = e.clientY < midY; 

            // 抖动检测
            if (isTop && el.previousElementSibling === draggedCmdEl) return;
            if (!isTop && el.nextElementSibling === draggedCmdEl) return;

            // 执行动画
            performFlipAnimation(cmdListEl, () => {
                if (isTop) {
                    cmdListEl.insertBefore(draggedCmdEl, el);
                } else {
                    cmdListEl.insertBefore(draggedCmdEl, el.nextSibling);
                }
            });
        });

        // 4. Drop (保存排序)
        el.addEventListener('drop', (e) => {
            e.stopPropagation(); // 阻止冒泡，防止触发父容器的兜底 drop
            if (!draggedCmdEl) return; 

            // 收集当前 DOM 顺序
            const domIds = Array.from(cmdListEl.children).map(child => child.dataset.cmdId);
            
            // 重新排列数据数组
            let activeSubset = []; 
            let hiddenSubset = []; 
            const visibleIdSet = new Set(domIds);
            
            allCommands.forEach(cmd => {
                if (visibleIdSet.has(cmd.id)) { /* 稍后处理 */ } 
                else { hiddenSubset.push(cmd); }
            });

            domIds.forEach(id => {
                const cmd = allCommands.find(c => c.id === id);
                if (cmd) activeSubset.push(cmd);
            });
            
            allCommands = [...activeSubset, ...hiddenSubset];
            saveData(); 
        });
    }

    // ★★★ 修改开始：指令列表容器的拖拽逻辑 (支持排序 + 外部文本导入) ★★★
    
    // 1. Drag Enter: 必须阻止默认行为，否则 drop 不会触发
    cmdListEl.addEventListener('dragenter', (e) => {
        e.preventDefault();
        // 如果是内部指令拖拽，忽略
        if (draggedCmdEl) return;
        
        // 如果是外部文本，添加高亮样式
        if (e.dataTransfer.types.includes('text/plain')) {
            cmdListEl.classList.add('drag-over-active');
        }
    });

    // 2. Drag Over: 处理悬停样式和光标
    cmdListEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        
        // 情况A: 内部指令排序
        if (draggedCmdEl) {
            e.dataTransfer.dropEffect = 'move';
            return; 
        }

        // 情况B: 外部文本拖入
        if (e.dataTransfer.types.includes('text/plain')) {
            e.dataTransfer.dropEffect = 'copy'; // 显示“复制”光标
            cmdListEl.classList.add('drag-over-active'); // 确保样式存在
        }
    });

    // 3. Drag Leave: 离开时移除高亮
    cmdListEl.addEventListener('dragleave', (e) => {
        e.preventDefault();
        // 防止鼠标经过子元素时误触发 leave (关键)
        if (cmdListEl.contains(e.relatedTarget)) return;
        
        cmdListEl.classList.remove('drag-over-active');
    });

    // 4. Drop: 处理放下逻辑
    cmdListEl.addEventListener('drop', (e) => {
        e.preventDefault();
        cmdListEl.classList.remove('drag-over-active'); // 移除高亮
        
        // 情况A: 内部指令排序 (原本的逻辑)
        if(draggedCmdEl) {
             // 触发保存排序
             saveData(); 
             return;
        }

        // 情况B: 外部文本放下 -> 新建指令
        const droppedText = e.dataTransfer.getData('text/plain');
        if (droppedText && droppedText.trim()) {
            console.log('检测到文本拖入:', droppedText);
            // 打开新建模态框，并自动填入内容
            // 参数: item=null(新建), categories, activeCat, text(填充内容)
            openModal(null, allCategories, activeCategoryId, droppedText);
        }
    });
    // ★★★ 修改结束 ★★★

    function escapeHtml(text) { if (!text) return ''; return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
    

     // =======================================================================================================================
    // #region 分类栏
    // =======================================================================================================================
    
    let draggedPillEl = null; 
    let draggedCmdEl = null;    // 指令拖拽对象
    let dragSrcCatIndex = -1; 
    let isAnimating = false; // 动画防抖锁
    categoryListEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });

    /**
     * 核心动画函数：负责记录位置、移动DOM、应用反向变换、播放动画
     * 优化版：更符合物理直觉的缓动曲线 + 允许动画中断（提升跟手度）
     */
    function performFlipAnimation(container, domChangeCallback) {
        if (isAnimating) return;
        isAnimating = true;

        // 1. [First] 记录位置
        const children = Array.from(container.children);
        const positions = new Map();
        children.forEach(el => {
            const rect = el.getBoundingClientRect();
            positions.set(el, { left: rect.left, top: rect.top });
        });

        // 2. [DOM Update] 执行 DOM 移动
        domChangeCallback();

        // 3. [Last & Invert] 计算位置差
        const animations = [];
        Array.from(container.children).forEach(el => {
            if (!positions.has(el)) return;
            // 忽略正在拖拽的那个“坑位”元素，它不需要动画，应该瞬间移动
            if (el.classList.contains('dragging') || el.classList.contains('sort-dragging')) return;

            const oldPos = positions.get(el);
            const newRect = el.getBoundingClientRect();
            
            const deltaX = oldPos.left - newRect.left;
            const deltaY = oldPos.top - newRect.top;

            // 只要有位移就加入动画队列
            if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
                // 关键点：在计算下一帧动画前，先消除 transition，瞬间应用位移（Invert）
                el.style.transition = 'none';
                el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                animations.push(el);
            }
        });

        // 4. [Play] 播放动画
        if (animations.length > 0) {
            // 强制浏览器重排 (Reflow)，确保上面的 transform 已经生效
            container.offsetHeight; 

            requestAnimationFrame(() => {
                animations.forEach(el => {
                    // 优化点 1：调整动画时间为 0.3s (更从容)
                    // 优化点 2：使用 cubic-bezier(0.2, 0, 0, 1) (类似 iOS 的 Quint 曲线，启动快，停止时极慢，非常有质感)
                    el.style.transition = 'transform 0.35s cubic-bezier(0.2, 0, 0, 1)';
                    
                    // 移除 transform，让元素平滑归位
                    el.style.transform = '';
                });
            });

            // 优化点 3：缩短锁定时间。
            // 之前是 200ms 动画锁 200ms，必须等动画播完才能再次排序。
            // 现在改为 350ms 动画，但 80ms 后就释放锁。
            // 效果：如果你拖拽很快，新的排序指令会打断旧的动画，让元素直接去新的位置，感觉极其灵敏跟手。
            setTimeout(() => {
                isAnimating = false;
                // 注意：这里不再暴力清除 transition，让 CSS 自然完成剩余的微小位移
                // 只有当元素完全停止后，通常不需要手动清理，下次 FLIP 会覆盖
            }, 80); 

            // 保险机制：动画结束后清理样式 (防止残留)
            setTimeout(() => {
                    animations.forEach(el => {
                        // 只有当元素当前没有 transform 时才清理，避免打断连续动画
                        if(el.style.transform === '') {
                        el.style.transition = '';
                        }
                    });
            }, 350);

        } else {
            isAnimating = false;
        }
    }
    

    function renderCategories() {
        categoryListEl.innerHTML = '';
        
        // 1. "全部" 胶囊
        const allPill = document.createElement('div');
        allPill.className = `cat-pill ${activeCategoryId === 'all' ? 'active' : ''}`;
        allPill.textContent = getI18nText("commands.all_pill");
        allPill.dataset.id = 'all';
        allPill.onclick = () => switchCategory(allPill.dataset.id);
        allPill.oncontextmenu = (e) => { e.preventDefault(); }; 
        setupPillDragDrop(allPill); 
        categoryListEl.appendChild(allPill);

        allPill.ondblclick = () => {
            console.log('双击');
            if (allPill.dataset.id === 'all') {
                allPill.textContent = getI18nText("commands.modal_no_category");
                allPill.dataset.id = '';
                activeCategoryId = '';
                switchCategory('');
            }else {
                allPill.textContent = getI18nText("commands.all_pill");
                allPill.dataset.id = 'all';
                activeCategoryId = 'all';
                switchCategory('all');
            }
        }

        // 2. 用户分类
        allCategories.forEach((cat, index) => {
            const pill = document.createElement('div');
            pill.className = `cat-pill ${activeCategoryId === cat.id ? 'active' : ''}`;
            pill.textContent = cat.name;
            pill.dataset.id = cat.id;
            pill.setAttribute('draggable', 'true'); 

            pill.onclick = () => switchCategory(cat.id);
            pill.oncontextmenu = (e) => {
                e.preventDefault();
                showContextMenu(e, cat.id);
            };

            setupPillEvents(pill, index);
            categoryListEl.appendChild(pill);
        });
    }

        // --- 用户分类胶囊的事件 (最终修复版) ---
    function setupPillEvents(pill, index) {
        // 1. 开始拖拽
        pill.addEventListener('dragstart', (e) => {
            dragSrcCatIndex = index;
            draggedPillEl = pill; 
            
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('type', 'category-sort'); 
            
            // ★★★ 核心修复：使用克隆节点作为拖拽镜像，防止滚动遮挡 ★★★
            if (e.dataTransfer.setDragImage) {
                const rect = pill.getBoundingClientRect();
                const offsetX = e.clientX - rect.left;
                const offsetY = e.clientY - rect.top;
                // 1. 克隆
                const clone = pill.cloneNode(true);
                // 2. 样式重置，确保克隆体在 body 中看起来和原位置一样，且完整显示
                clone.style.position = "absolute";
                clone.style.top = "-9999px";
                clone.style.left = "-9999px";
                clone.style.width = `${rect.width}px`; 
                clone.style.height = `${rect.height}px`;
                clone.style.opacity = "1";
                // 确保背景色正确 (防止透明)
                clone.style.backgroundColor = getComputedStyle(pill).backgroundColor || 'var(--bg-body)';
                
                // 3. 添加到 DOM
                document.body.appendChild(clone);
                // 4. 设置镜像
                e.dataTransfer.setDragImage(clone, offsetX, offsetY);
                // 5. 清理
                setTimeout(() => {
                    document.body.removeChild(clone);
                }, 0);
            }
            // 延迟变虚线框
            setTimeout(() => pill.classList.add('sort-dragging'), 20);
        });

        // 2. 拖拽结束
        pill.addEventListener('dragend', () => {
            pill.classList.remove('sort-dragging');
            dragSrcCatIndex = -1;
            draggedPillEl = null;
            isAnimating = false;
            
            // 清理样式
            Array.from(categoryListEl.children).forEach(el => {
                el.style.transition = '';
                el.style.transform = '';
                el.classList.remove('drag-target');
            });
        });

        // 3. 进入时抢占事件 (防闪烁)
        pill.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        // 4. 拖拽悬停 (排序 + 归类高亮)
        pill.addEventListener('dragover', (e) => {
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'move';
            
            // === 情况 A: 分类排序 (拖的是胶囊) ===
            if (dragSrcCatIndex !== -1 && draggedPillEl) {
                if (draggedPillEl === pill) return; 
                if (isAnimating) return;

                const rect = pill.getBoundingClientRect();
                const midX = rect.left + rect.width / 2;
                const isLeft = e.clientX < midX;

                if (isLeft && pill.previousElementSibling === draggedPillEl) return;
                if (!isLeft && pill.nextElementSibling === draggedPillEl) return;

                performFlipAnimation(categoryListEl, () => {
                    if (isLeft) {
                        categoryListEl.insertBefore(draggedPillEl, pill);
                    } else {
                        categoryListEl.insertBefore(draggedPillEl, pill.nextSibling);
                    }
                });
                return;
            }

            // === 情况 B: 指令归类 (拖的是指令) ===
            // ★★★ 核心修复在这里 ★★★
            // 只要 (没有在拖拽分类) 且 (全局变量 draggedCmdEl 存在)，就说明是在拖指令
            if (dragSrcCatIndex === -1 && draggedCmdEl) {
                pill.classList.add('drag-target'); // 加上变绿的类
            }
        });

        // 5. 离开时移除高亮
        pill.addEventListener('dragleave', (e) => {
            // 只有当真正离开元素范围时才移除，而不是进入子元素时
            if (pill.contains(e.relatedTarget)) return; 
            pill.classList.remove('drag-target');
        });

        // 6. 放置 (Drop)
        pill.addEventListener('drop', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            pill.classList.remove('drag-target');
            const targetCatId = pill.dataset.id;

            // --- A. 批量归类逻辑 ---
            const batchJson = e.dataTransfer.getData('application/json-batch-cmds');
            if (batchJson) {
                try {
                    const { ids } = JSON.parse(batchJson);
                    if (Array.isArray(ids) && ids.length > 0) {
                        let movedCount = 0;
                        allCommands.forEach(cmd => {
                            if (ids.includes(cmd.id) && cmd.categoryId !== targetCatId) {
                                cmd.categoryId = targetCatId;
                                movedCount++;
                            }
                        });

                        if (movedCount > 0) {
                            await saveData();
                            // showToast(`已将 ${movedCount} 项移至 "${pill.textContent}"`);
                            showToast(getI18nText('toast.move_items_to')
                                .replace('{count}', movedCount)
                                .replace('{name}', pill.textContent));
                            selectedIds.clear(); // 移动后清除选中状态
                            updateSelectionVisuals(); // 更新视觉
                            
                            // 只有当不在“全部”视图，且当前视图不是目标视图时，才需要刷新列表移出项目
                            if (activeCategoryId !== 'all' && activeCategoryId !== targetCatId) {
                                renderMainList();
                            }
                        }
                    }
                } catch (err) { 
                    console.error('批量归类解析失败', err); 
                }
                return; // 批量处理完直接返回
            }

            // --- B. 分类排序逻辑 (拖的是胶囊) ---
            if (dragSrcCatIndex !== -1) {
                const newOrderArray = [];
                Array.from(categoryListEl.children).forEach(dom => {
                    const id = dom.dataset.id;
                    if (id === 'all') return;
                    const catData = allCategories.find(c => c.id === id);
                    if (catData) newOrderArray.push(catData);
                });
                allCategories = newOrderArray;
                await saveData(true);
                return;
            }

            // --- C. 单个指令归类逻辑 ---
            const draggedCmdId = e.dataTransfer.getData('application/x-cmd-id');
            // 兼容性：如果 dataTransfer 没拿到，尝试用全局变量（同窗口拖拽）
            const finalCmdId = draggedCmdId || (draggedCmdEl ? draggedCmdEl.dataset.cmdId : null);

            if (finalCmdId) {
                const cmd = allCommands.find(c => c.id === finalCmdId);
                // 只有当分类确实改变了才保存
                if (cmd && cmd.categoryId !== targetCatId) {
                    cmd.categoryId = targetCatId;
                    await saveData(); 
                    // showToast(`已移动到 "${pill.textContent}"`);
                    showToast(getI18nText('toast.moved_to').replace('{name}', pill.textContent));
                    
                    // 如果当前是在"该原分类"视图下，移动后要刷新列表
                    if (activeCategoryId !== 'all' && activeCategoryId !== targetCatId) {
                        renderMainList();
                    }
                }
            }
        });
    }



   // --- "全部" 胶囊的专用事件 (只接收指令，不参与排序) ---
   // 保持不变，只要确认 dragSrcCatIndex check 存在即可
    // --- "全部" 胶囊的专用事件 (支持批量移出分类) ---
    function setupPillDragDrop(pillElement) {
        pillElement.addEventListener('dragover', (e) => {
            if (dragSrcCatIndex !== -1) return; // 拒绝分类排序拖到这里
            e.preventDefault();
            pillElement.classList.add('drag-target');
            e.dataTransfer.dropEffect = 'move'; 
        });
        
        pillElement.addEventListener('dragleave', (e) => {
            if (pillElement.contains(e.relatedTarget)) return;
            pillElement.classList.remove('drag-target');
        });

        pillElement.addEventListener('drop', async (e) => {
            if (dragSrcCatIndex !== -1) return; // 拒绝分类排序
            e.preventDefault();
            pillElement.classList.remove('drag-target');
            
            // --- A. 批量移出分类 (设为未分类) ---
            const batchJson = e.dataTransfer.getData('application/json-batch-cmds');
            if (batchJson) {
                try {
                    const { ids } = JSON.parse(batchJson);
                    if (Array.isArray(ids) && ids.length > 0) {
                        let movedCount = 0;
                        allCommands.forEach(cmd => {
                            // 将所有选中的指令 categoryId 设为空字符串（即无分类）
                            if (ids.includes(cmd.id) && cmd.categoryId !== '') {
                                cmd.categoryId = ''; 
                                movedCount++;
                            }
                        });

                        if (movedCount > 0) {
                            await saveData();
                            // showToast(`已将 ${movedCount} 项移出分类`);
                            showToast(getI18nText('toast.move_items_out').replace('{count}', movedCount));
                            selectedIds.clear();
                            updateSelectionVisuals();
                            
                            // 如果当前在某个特定分类视图下，移出后需要刷新列表
                            if (activeCategoryId !== 'all') {
                                renderMainList();
                            }
                        }
                    }
                } catch (err) { console.error(err); }
                return;
            }

            // --- B. 单个移出分类 ---
            const draggedCmdId = e.dataTransfer.getData('application/x-cmd-id');
            const finalCmdId = draggedCmdId || (draggedCmdEl ? draggedCmdEl.dataset.cmdId : null);

            if (finalCmdId) {
                const cmd = allCommands.find(c => c.id === finalCmdId);
                if (cmd && cmd.categoryId !== '') {
                    cmd.categoryId = ''; // 设为空
                    await saveData();
                    showToast(getI18nText('toast.moved_out'));
                    if (activeCategoryId !== 'all') renderMainList();
                }
            }
        });
    }


    // --- 分类切换逻辑 ---
    function switchCategory(id) {
        activeCategoryId = id;
        document.querySelectorAll('.cat-pill').forEach(pill => {
            if (pill.dataset.id === id) pill.classList.add('active');
            else pill.classList.toggle('active',false);
        });
        renderMainList();   // 更新列表
        chrome.storage.local.set({ 'activeCatId': id });
    }


    // #region 分类栏右键逻辑
    function showContextMenu(e, catId) {
        ctxRename.style.display = 'flex'; 
        ctxMenu.querySelector('.ctx-divider').style.display='block';
        ctxDelete.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> 删除分类`;

        ctxTargetId = catId;
        console.log('显示菜单', catId);
        ctxDelete.style.display = 'flex';
        ctxDelete.previousElementSibling.style.display = 'block';

        // 2. 计算位置 (防止溢出屏幕)
        const menuWidth = 100;
        const menuHeight = 80;
        let x = e.clientX;
        let y = e.clientY;

        if (x + menuWidth > window.innerWidth) x -= menuWidth;
        if (y + menuHeight > window.innerHeight) y -= menuHeight;

        ctxMenu.style.left = `${x}px`;
        ctxMenu.style.top = `${y}px`;
        
        // 3. 显示
        ctxMenu.classList.add('visible');
    }

    // 隐藏菜单
    function hideContextMenu() {
        ctxMenu.classList.remove('visible');
        ctxTargetId = null;
    }

    // 全局点击关闭菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.ctx-menu')) hideContextMenu();
        if (!e.target.closest('.cmd-item')&&
            !e.target.closest('.modal-card')&&
            !e.target.closest('.ctx-menu')) {
            selectedIds.clear(); // 点击空白处时清除选中
            lastSelectedId = null;
            updateSelectionVisuals();
        };
    });
    // 滚动时也关闭，防止菜单漂浮
    categoryListEl.addEventListener('scroll', hideContextMenu);

    // --- 菜单项点击事件 ---
    ctxRename.addEventListener('click', () => {
        const targetId = ctxTargetId; // 1. 先把 ID 存下来
        hideContextMenu();            // 2. 再关闭菜单 (这会清空 ctxTargetId)
        if (targetId) openCatModal('rename', targetId); // 3. 使用存下来的 ID
    });

    // 修改 ctxDelete 的点击事件
    ctxDelete.addEventListener('click', () => {
        const target = ctxTargetId; // 获取刚才存的标记
        hideContextMenu();

        if (target === 'BATCH_CMD_OP') {
            // 打开批量删除模态框
            openCatModal('delete_cmd_batch');
        } else if (target) {
            // 原有的分类删除逻辑
            openCatModal('delete', target);
        }
    });

    // --- 分类模态框逻辑 ---
    function openCatModal(type, catId = null) {
        currentCatAction = { type, id: catId };
        catModalOverlay.classList.remove('hidden');
        
        // 重置状态
        catRenameContainer.classList.add('hidden');
        catDeleteContainer.classList.add('hidden');
        cmdDeleteContainer.classList.add('hidden');
        catNameInput.value = '';
        catModalConfirm.classList.remove('danger-btn');

        if (type === 'create') {
            catModalTitle.textContent = '新建分类';
            catRenameContainer.classList.remove('hidden');
            catNameInput.placeholder = "输入分类名称 (支持 Emoji)";
            setTimeout(() => catNameInput.focus(), 100);
            
        } else if (type === 'rename') {
            const cat = allCategories.find(c => c.id === catId);
            if (!cat) return closeCatModal();
            catModalTitle.textContent = '重命名分类';
            catRenameContainer.classList.remove('hidden');
            catNameInput.value = cat.name;
            setTimeout(() => catNameInput.focus(), 100);
            
        } else if (type === 'delete') {
            catModalTitle.textContent = '删除分类';
            catDeleteContainer.classList.remove('hidden');
            // catModalConfirm.classList.add('danger-btn'); // 可选：红色按钮
        }
        else if (type === 'delete_cmd') {
            catModalTitle.textContent = '删除指令';
            cmdDeleteContainer.classList.remove('hidden');
            // catModalConfirm.classList.add('danger-btn'); 
        }
        else if (type === 'delete_cmd_batch') {
            catModalTitle.textContent = '批量删除';
            cmdDeleteContainer.classList.remove('hidden');
            
            // 动态修改提示文案
            const p1 = cmdDeleteContainer.querySelector('p:nth-child(1)');
            const p2 = cmdDeleteContainer.querySelector('p:nth-child(2)');
            p1.textContent = `确定要删除选中的 ${selectedIds.size} 条指令吗？`;
            p2.textContent = '此操作无法撤销。';
            
            // catModalConfirm.classList.add('danger-btn'); 
        } 
        // 原有的单个删除 (双击删除按钮触发)
        else if (type === 'delete_cmd') {
            catModalTitle.textContent = '删除指令';
            cmdDeleteContainer.classList.remove('hidden');
            const p1 = cmdDeleteContainer.querySelector('p:nth-child(1)');
            p1.textContent = `确定要删除此指令吗？`; // 恢复文案
        }

    }

    function closeCatModal() {
        catModalOverlay.classList.add('hidden');
        currentCatAction = null;
    }

    catModalCancel.addEventListener('click', closeCatModal);
    catModalOverlay.addEventListener('click', (e) => { if (e.target === catModalOverlay) closeCatModal(); });

    // 确认按钮逻辑 (修复版)
    catModalConfirm.addEventListener('click', async () => {
        if (!currentCatAction) return;
        const { type, id } = currentCatAction;
        
        if (type === 'create') {
            const name = catNameInput.value.trim();
            if (name) {
                const newCat = { id: 'cat_' + Date.now(), name: name };
                allCategories.push(newCat);
                await saveData(true);
                renderCategories();
                // 滚动到最右
                setTimeout(() => categoryListEl.scrollTo({ left: categoryListEl.scrollWidth, behavior: 'smooth' }), 100);
            }
        } 
        else if (type === 'rename') {
            const cat = allCategories.find(c => c.id === id);
            const newName = catNameInput.value.trim();
            if (cat && newName && newName !== cat.name) {
                cat.name = newName;
                await saveData(true);
                renderCategories();
            }
        } 
        else if (type === 'delete') {
            allCategories = allCategories.filter(c => c.id !== id);
            allCommands.forEach(cmd => { if(cmd.categoryId === id) cmd.categoryId = ''; });
            if(activeCategoryId === id) activeCategoryId = 'all';
            await saveData(true);
            renderCategories();
            renderMainList();
        }else if (type === 'delete_cmd') {
            allCommands = allCommands.filter(c => c.id !== id);
            await saveData(); // 不需要 saveCats
        }else if (type === 'delete_cmd_batch') {
            // 过滤掉所有在 selectedIds 里的指令
            console.log('批量删除', selectedIds);
            allCommands = allCommands.filter(c => !selectedIds.has(c.id));
            selectedIds.clear();
            await saveData(); // 保存并刷新
            showToast(getI18nText('toast.delete_success'));
        }
        else if (type === 'delete_cmd') {
            // 原有的单删逻辑
            allCommands = allCommands.filter(c => c.id !== id);
            await saveData();
        }
        closeCatModal();
    });

    // ★★★ 绑定新建按钮到模态框 ★★★
    addCategoryBtn.onclick = () => openCatModal('create');

}




/**
 // #region 通用设置
 */
async function initSettingManager() {
    initLangSetting();
    const $ = (selector) => document.querySelector(selector);

    // 定义配置项映射：DOM ID Selector <-> Storage Key <-> 默认值
    const settingsConfig = {
        // 开关类 (Checkbox)
        toggles: [
            // 基础设置
            { id: '#setting-assistant-fav', key: 'enableAssisFav',   def: true },
            { id: '#setting-markdown-toc', key: 'enableMdToc',   def: true },
            { id: '#setting-scroll-smooth', key: 'enableScrollSmooth',   def: true },
            { id: '#setting-line-numbers', key: 'showLineNumbers',   def: true },
            { id: '#setting-formula-copy', key: 'enableFormulaCopy', def: true },
            { id: '#setting-shortcut-grab', key: 'enableShortcutGrab', def: true },
            { id: '#setting-shortcut-pinyin', key: 'enablePinyinWake', def: true },
            { id: '#setting-shortcut-preview', key: 'enableShortcutPreview', def: true },
            { id: '#setting-shortcut-number', key: 'enableShortcutNumber', def: true },
            { id: '#setting-shortcut-enter', key: 'enableShortcutEnter', def: false },
            { id: '#showMarkers',          key: 'showMarkers',       def: true },       // 定位标注 (子级)
            { 
                id: '#enableCustomExportName',  
                key: 'enableCustomExportName',  
                def: false, 
                targetId: ['#sub-setting-export-names'] 
            },
            // 定位标注 (父级 - 控制 #sub-setting-markers)
            { 
                id: '#enableMarkerFeature', 
                key: 'enableMarkerFeature', 
                def: true, 
                targetId: ['#sub-setting-markers','#sub-setting-colors'] // 关联的子菜单 ID
            },

            // 自动折叠 (父级 - 控制 #sub-setting-collapse)
            { 
                id: '#enableAutoCollapse',  
                key: 'enableAutoCollapse',  
                def: true, 
                targetId: ['#sub-setting-collapse'] // 关联的子菜单 ID
            }
        ],
        // 滑块类 (Range Input)
        sliders: [// 依次是滑块id，显示数值id，存储key，默认值
            // 折叠阈值 (注意 ID 变化)
            { id: '#collapseThreshold',      valId: '#collapseThresholdValue', key: 'collapseThreshold', def: 200 },
            // 唤醒阈值
            { id: '#setting-cn-threshold',   valId: '#val-cn-threshold',       key: 'cnWakeThreshold',   def: 2 },
            { id: '#setting-pin-threshold',   valId: '#val-pin-threshold',       key: 'pinWakeThreshold',   def: 2 },
            { id: '#setting-en-threshold',   valId: '#val-en-threshold',       key: 'enWakeThreshold',   def: 2 },
            { id: '#setting-width-threshold',   valId: '#val-width-threshold', key: 'suggestionBoxWidth',   def: 320 },
            // 定位标注颜色饱和度 (子级)
            { id: '#setting-color-saturation',   valId: '#color-saturation-value', key: 'colorSaturation',   def: 1 }
        ],

        // --- 新增：文本输入框类 ---
        texts: [
            { id: '#setting-export-user-name', key: 'exportUserName', def: 'User' },
            { id: '#setting-export-ai-name', key: 'exportAiName', def: 'AI' }
        ]
    };

    // 1. 准备默认值并从 Storage 加载
    const defaultValues = {};
    [...settingsConfig.toggles, ...settingsConfig.sliders, ...(settingsConfig.texts || [])].forEach(item => {
        defaultValues[item.key] = item.def;
    });

    chrome.storage.local.get(defaultValues, (items) => {
        // --- 初始化开关状态 ---
        settingsConfig.toggles.forEach(item => {
            const el = $(item.id);
            if (el) {
                el.checked = items[item.key];
                
                // 如果该开关控制子菜单，初始化子菜单的展开状态
                if (item.targetId) {
                    item.targetId.forEach(tid => {
                        toggleSubSettings(tid, items[item.key]);
                    });
                }
            }
        });

        // --- 初始化滑块状态 ---
        settingsConfig.sliders.forEach(item => {
            const rangeEl = $(item.id);
            const textEl = $(item.valId);
            if (rangeEl && textEl) {
                rangeEl.value = items[item.key];
                textEl.textContent = items[item.key];
            }
        });

        // --- 新增：初始化文本框状态 ---
        if (settingsConfig.texts) {
            settingsConfig.texts.forEach(item => {
                const el = $(item.id);
                if (el) {
                    el.value = items[item.key];
                }
            });
        }
    });

    // 2. 绑定事件监听
    
    // --- 处理开关 (Checkbox) ---
    settingsConfig.toggles.forEach(item => {
        const el = $(item.id);
        if (!el) return;

        el.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            
            // 保存到 Storage
            saveSetting(item.key, isChecked);

            // 如果配置了 targetId，则触发折叠动画
            if (item.targetId) {
                item.targetId.forEach(tid => {
                    toggleSubSettings(tid, isChecked);
                });
            }
        });
    });

    // --- 处理滑块 (Range Input) ---
    settingsConfig.sliders.forEach(item => {
        const rangeEl = $(item.id);
        const textEl = $(item.valId);
        if (!rangeEl) return;

        // 'input' 事件：拖动时实时更新数字显示 (UI反馈)
        rangeEl.addEventListener('input', (e) => {
            if (textEl) textEl.textContent = e.target.value;
        });

        // 'change' 事件：拖动结束时保存数据 (减少IO操作)
        rangeEl.addEventListener('change', (e) => {
            // 使用 parseFloat 以支持小数，这对整数滑块（如200）也同样适用
            const val = parseFloat(e.target.value); 
            saveSetting(item.key, val);
        });
    });


    // --- 新增：处理文本框 (Text Input) ---
    if (settingsConfig.texts) {
        settingsConfig.texts.forEach(item => {
            const el = $(item.id);
            if (!el) return;

            // 当输入框失去焦点或按下回车时触发保存 (避免频繁写入)
            el.addEventListener('change', (e) => {
                // 使用 trim() 去除首尾空格，如果为空则恢复默认值
                let val = e.target.value.trim();
                if (!val) {
                    val = item.def;
                    e.target.value = val;
                }
                saveSetting(item.key, val);
            });
        });
    }

    /**
     * 辅助函数：保存设置
     */
    function saveSetting(key, value) {
        chrome.storage.local.set({ [key]: value }, () => {
            // console.log(`Setting saved: ${key} = ${value}`);
        });
        
        // 如果需要即时生效（通知 content script），可以在这里 sendMessage
    }

    /**
     * 辅助函数：切换子设置菜单的可见性 (使用 expanded 类触发 CSS 动画)
     * @param {string} selector - 子菜单的 CSS 选择器 (如 #sub-setting-markers)
     * @param {boolean} show - 是否展开
     */
    function toggleSubSettings(selector, show) {
        const container = $(selector);
        if (container) {
            if (show) {
                container.classList.add('expanded');
            } else {
                container.classList.remove('expanded');
            }
        }
    }
}

async function initLangSetting(){
    // === 自定义语言下拉框逻辑 ===
    const langWrapper = document.getElementById('langSelectWrapper');
    const langTrigger = document.getElementById('langSelectTrigger');
    const langText = document.getElementById('langSelectText');
    const langOptionsBox = document.getElementById('langSelectOptions');
    const langOptions = document.querySelectorAll('#langSelectOptions .custom-select-option');

    if (langWrapper) {
        // 1. 初始化当前选中的语言
        const activeLang = await chromeGet('app_lang') || navigator.language || 'zh-CN';
        console.log('app_lang',activeLang)
        // 找到对应的选项并设置初始状态
        langOptions.forEach(opt => {
            if (opt.dataset.value === activeLang) {
                opt.classList.add('selected');
                langText.textContent = opt.textContent; // 回显文字
            } else {
                opt.classList.remove('selected');
            }
        });

        // 2. 切换展开/收起
        langTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = langOptionsBox.classList.contains('open');
            if (isOpen) {
                closeLangSelect();
            } else {
                langOptionsBox.classList.add('open');
                langTrigger.classList.add('active');
            }
        });

        // 3. 点击选项
        langOptions.forEach(opt => {
            opt.addEventListener('click', async(e) => {
                e.stopPropagation();
                const selectedValue = opt.dataset.value;
                // 仅当改变时刷新
                await chrome.storage.local.set({'app_lang': selectedValue })
                langOptions.forEach(opt => {
                    if (opt.dataset.value === selectedValue) {
                        opt.classList.add('selected');
                        langText.textContent = opt.textContent; // 回显文字
                    } else {
                        opt.classList.remove('selected');
                    }
                });
                closeLangSelect();
            });
        });

        // 4. 点击外部关闭
        document.addEventListener('click', (e) => {
            if (!langWrapper.contains(e.target)) {
                closeLangSelect();
            }
        });

        function closeLangSelect() {
            langOptionsBox.classList.remove('open');
            langTrigger.classList.remove('active');
        }
    }
}




/*=======================================================================================================
// #region 用户认证
=========================================================================================================*/

// const cacheKey = 'user_plan_cache';
// const lastRegKey = 'last_device_reg_time';
// const SECRET_SALT = "MemFire_WebDAV_Pro_2024_#$@!";
// // const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
// const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
//     auth: {
//         storage: ChromeStorageAdapter,
//         autoRefreshToken: false,
//         persistSession: true,
//         detectSessionInUrl: false,
//         storageKey: 'supabase.auth.token'
//     }
// });

// let _isVerifiedYJHY = false; // 内存缓存


// async function initAuth() {
//     // console.log('🚀 初始化 MemFire Auth');
    
//     // 登录相关DOM
//     const elAuthForm = $('#auth-form');
//     const elUserProfile = $('#user-profile');   // 已登录状态
//     const elEmail = $('#user-email');           // 登录邮箱
//     const elPass = $('#user-pass');             // 登录密码
//     const elAuthMsg = $('#auth-error-msg');     // 错误信息显示
    
//     const btnLogin = $('#btn-login');           // 登录按钮 
//     const btnSignup = $('#btn-signup');         // 注册按钮
//     const btnLogout = $('#btn-user-logout');    // 登出按钮
//     const btnUpgrade = $('#btn-upgrade');       // 会员升级按钮
    
//     const elProfileEmail = $('#profile-email');  // 登录后个人资料邮箱显示

//     // 注册相关 DOM
//     const elStep1 = $('#step-1-input');         // 输入邮箱密码区域
//     const elStep2 = $('#step-2-verify');        // 输入验证码区域
//     const elVerifyEmailDisplay = $('#verify-email-display'); // 提示区域
//     const elOtpCode = $('#otp-code');                        // 验证码输入框 
//     const btnConfirmVerify = $('#btn-confirm-verify');       // 确认注册按钮
//     const btnCancelVerify = $('#btn-cancel-verify');         // 取消注册按钮

//     // 重置密码相关 DOM
//     const btnForgot = $('#btn-forgot-pass');            // 忘记密码按钮
//     const viewResetEmail = $('#step-reset-email');      // 重置密码输入邮箱界面
//     const viewResetConfirm = $('#step-reset-confirm');  // 重置密码输入验证码界面

//     const inputResetEmail = $('#reset-email-input');    // 重置密码邮箱输入框
//     const inputResetOtp = $('#reset-otp-code');         // 验证码输入框
//     const inputNewPass = $('#reset-new-pass');          // 新密码输入框

//     const btnResetSend = $('#btn-reset-send');          // 发送验证码按钮
//     const btnResetSubmit = $('#btn-reset-submit');      // 提交新密码按钮
//     const btnResetCancel1 = $('#btn-reset-cancel-1');   // 输入邮箱时取消重置按钮
//     const btnResetCancel2 = $('#btn-reset-cancel-2');   // 输入验证码取消重置按钮
//     const inputLicense = $('#input-license-key');
//     const btnRedeem = $('#btn-redeem');
//     const elRedeemMsg = $('#redeem-msg');
//     let manul_loaded_plan = false;
//     const VIEWS = ['step-1-input', 'step-2-verify', 'step-reset-email', 'step-reset-confirm'];
//     const showAuthMsg = (text,isNormal=false) => {
//         elAuthMsg.textContent = text; 
//         elAuthMsg.style.display = 'block';
//         elAuthMsg.style.color = isNormal? '#10b981' : '#eb1d1d';
//     };
    
//     // 临时变量，存一下刚才填的邮箱
//     let tempRegEmail = ''; 
//     let tempResetEmail = '';
//     // 2. 初始化 Supabase
//     if (typeof supabase === 'undefined') {console.error('❌ Supabase 库未加载'); return;}
//     await restoreAuthState();
//     const { data: { session } } = await supabaseClient.auth.getSession();
//     if (session) {
//         handleLoginSuccess(session.user);
//         console.log('✅ 检测到已登录');
//     }else{
//         console.log('登录失效，尝试自动登录...');
//         const result=await chrome.storage.local.get(cacheKey);
//         if(result[cacheKey]){
//             const {email:email}=await chrome.storage.local.get('email');
//             const {password:password}=await chrome.storage.local.get('password');
//             if (email && password){
//                 await performLogin(email, password); // 执行登录流程
//             }
//         }else{
//             console.log('未找到缓存，登录失败');
//         }
//     }

//     // 登录/注册输入邮箱时
//     elEmail.addEventListener('input', (e) => { saveAuthState('step-1-input', e.target.value);});
//     // 重置密码输入邮箱时
//     inputResetEmail.addEventListener('input', (e) => { saveAuthState('step-reset-email', e.target.value); });
//     // --- 辅助：显示错误信息 ---
//     // $('[data-tab="tab-user"]').addEventListener('click', async() => {
//     //     if (!manul_loaded_plan) {
//     //         if (session) {
//     //             await loadPlan(session.user.id,true);
//     //             await chrome.runtime.sendMessage({ action: 'trigger_keep_alive' });
//     //         }
//     //         manul_loaded_plan = true;
//     //     }
//     // })
//     // #region 注册==========================================================================
//     btnSignup.addEventListener('click', async () => {
//         const email = elEmail.value.trim();
//         const password = elPass.value;

//         // if (!email || !password) return showAuthMsg('请填写邮箱和密码');
//         if (!email || !password) return showAuthMsg(getI18nText('auth.fill_email_pass'));
//         // if (password.length < 6) return showAuthMsg('密码至少6位');
//         if (password.length < 6) return showAuthMsg(getI18nText('auth.pass_min_length'));

//         // showAuthMsg('正在请求注册...', true);
//         showAuthMsg(getI18nText('auth.requesting_signup'), true);
//         btnLogin.disabled = true; 
//         btnSignup.disabled = true;

//         // 1. 调用注册接口
//         const { data, error } = await supabaseClient.auth.signUp({ email, password});
//         if (error) {showAuthMsg(getI18nText('auth.signup_failed') + error.message);btnLogin.disabled = false;  btnSignup.disabled = false; return; }
        
//         // 如果返回了 user，但 identities 是空的，说明触发了隐私保护，其实用户已存在
//         if (data.user && data.user.identities && data.user.identities.length === 0) {
//             // showAuthMsg('该邮箱已注册！请直接点击登录。');
//             showAuthMsg(getI18nText('auth.email_registered'));
//             btnLogin.classList.add('shake'); setTimeout(() => btnLogin.classList.remove('shake'), 500); // 震动一下登录按钮，提示用户去点
//             btnLogin.disabled = false; btnSignup.disabled = false;  // 恢复按钮
//             return; // ⛔️ 拦截，不跳转验证码界面
//         }

//         // 4. 真·新用户处理
//         if (data.session) {handleLoginSuccess(data.user);} // 如果已认证，就直接登录
//         else {
//             // 正常流程：切换到验证码界面
//             tempRegEmail = email;               // 保存邮箱到临时变量
//             elVerifyEmailDisplay.textContent = email;
            
//             // 优化一下提示文案
//             // showAuthMsg('验证码已发至邮箱，请查收', true);
//             showAuthMsg(getI18nText('auth.code_sent'), true);
//             elStep1.classList.add('hidden'); elStep2.classList.remove('hidden');
            
//             elOtpCode.value = ''; // 清空之前的输入
//             elOtpCode.focus();
//             saveAuthState('step-2-verify', email);
//         }
//     });

//     // 确认验证码 (第二步) ---
//     btnConfirmVerify.addEventListener('click', async () => {
//         const code = elOtpCode.value.trim();
//         if (!code || code.length !== 6) return showAuthMsg(getI18nText('auth.enter_6_digit_code'));

//         btnConfirmVerify.textContent = '验证中...';
//         btnConfirmVerify.disabled = true;

//         // 3. 调用验证接口
//         const { data, error } = await supabaseClient.auth.verifyOtp({
//             email: tempRegEmail,   // 从临时变量中获取邮箱
//             token: code,           // 验证码
//             type: 'signup'         // 类型是注册验证
//         });

//         if (error) {
//             // showAuthMsg('验证失败: ' + error.message);
//             showAuthMsg(getI18nText('auth.verify_failed') + error.message);
//             btnConfirmVerify.textContent = '确认注册';
//             btnConfirmVerify.disabled = false;
//         } else {
//             // 4. 验证成功！Supabase 会自动返回 session
//             // showAuthMsg('注册成功！', true);
//             showAuthMsg(getI18nText('auth.signup_success'), true);
//             // 恢复 UI 状态以便下次使用
//             elStep1.classList.remove('hidden');
//             elStep2.classList.add('hidden');
//             btnConfirmVerify.textContent = '确认注册';
//             btnConfirmVerify.disabled = false;
            
//             // 进入登录后界面
//             handleLoginSuccess(data.user);
//         }
//     });

//     // --- 新增功能：返回/取消验证 ---
//     btnCancelVerify.addEventListener('click', () => {
//         elStep2.classList.add('hidden');
//         elStep1.classList.remove('hidden');
//         btnLogin.disabled = false; 
//         btnSignup.disabled = false;
//         showAuthMsg('');
//         saveAuthState('step-1-input', elEmail.value); // 返回首页，记录首页状态
//     });

//     // #region登录 ==============================================================================
//     btnLogin.addEventListener('click', async () => {
//         const email = elEmail.value.trim();
//         const password = elPass.value;
//         await performLogin(email, password);
//         await chrome.storage.local.set({'email': email,'password': password});
//     });

//     async function performLogin(email, password) {
//         // if (!email || !password) return showAuthMsg('请填写邮箱和密码');
//         if (!email || !password) return showAuthMsg(getI18nText('auth.fill_email_pass'));
        
//         btnLogin.disabled = true; btnSignup.disabled = true;
//         // showAuthMsg('登录中...',true);
//         showAuthMsg(getI18nText('auth.logging_in'), true);

//         const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
//         if (error) {
//             // showAuthMsg('登录失败: ' + error.message);
//             showAuthMsg(getI18nText('auth.login_failed') + error.message);
//             btnLogin.disabled = false; btnSignup.disabled = false;
//         } else {
//             await chrome.storage.local.set({ 
//                 'supabase.auth.token': JSON.stringify(data.session) 
//             });
//             handleLoginSuccess(data.user);
//         }
//     }

//     // --- 功能：退出登录 ---
//     btnLogout.addEventListener('click', async () => {
//        await performLogout();
//     });

//     // --- 功能：处理登录成功 UI 切换 ---
//     async function handleLoginSuccess(user) {
//         // 1. 立即更新 UI (无需等待网络)
//         // chrome.action.setBadgeText({ text: '' });
//         elAuthForm.style.display = 'none';
//         elUserProfile.style.display = 'block';
//         elUserProfile.classList.remove('hidden'); 
//         elProfileEmail.textContent = user.email;

//         // 2. 清除认证流程的临时缓存
//         clearAuthState(); 

//         try {
//             // 登录时自动登记设备，每24小时登记一次
//             const HEARTBEAT_INTERVAL = 24 * 60 * 60 * 1000; // 24小时
//             const { [lastRegKey]: lastTime } = await chrome.storage.local.get(lastRegKey);
//             const now = Date.now();

//             if (!lastTime || (now - lastTime > HEARTBEAT_INTERVAL)) {
//                 // console.log('📡 发起设备心跳登记...');
//                 const deviceId = await getDeviceId();
//                 const deviceName = getDeviceName();
//                                 const { error } = await supabaseClient.rpc('register_device', {
//                     p_device_id: deviceId,
//                     p_device_name: deviceName
//                 });

//                 if (error) console.error('设备登记失败:', error);
//                 else {
//                     // console.log('✅ 设备心跳成功');
//                     await chrome.storage.local.set({ [lastRegKey]: now }); // 也要 await
//                 }
//             } else {
//                 // console.log('zzz 设备心跳跳过');
//             }
            
//         } catch (e) {
//             console.error('设备逻辑错误', e);
//         }

//         loadPlan(user.id);
//     }

//     // --- 功能：升级/购买 (弹出二维码) ---
//     const qrOverlay = $('#qrModalOverlay');
//     const closeQrBtn = $('#closeQrBtn');

//     btnUpgrade.addEventListener('click', async () => {
//         const { data: { user } } = await supabaseClient.auth.getUser();
//         if (!user) return alert('请先登录');
        
//         // Show the QR Modal
//         qrOverlay.classList.remove('hidden');
//     });

//     // Close Button Logic
//     closeQrBtn.addEventListener('click', () => {
//         qrOverlay.classList.add('hidden');
//     });

//     // Click outside to close
//     qrOverlay.addEventListener('click', (e) => {
//         if (e.target === qrOverlay) {
//             qrOverlay.classList.add('hidden');
//         }
//     });

//     // --- 事件：激活码兑换 ---
//     btnRedeem.addEventListener('click', async () => {
//         const code = inputLicense.value.trim();
//         if (!code) {
//             elRedeemMsg.textContent = '请输入激活码';
//             elRedeemMsg.style.color = 'red';
//             return;
//         }

//         btnRedeem.disabled = true;
//         btnRedeem.textContent = '...';
//         elRedeemMsg.textContent = '';

//         try {
//             // 调用我们刚才写的 Postgres 函数 (RPC)
//             const { data, error } = await supabaseClient.rpc('redeem_activation_code', {
//                 p_code: code
//             });

//             if (error) throw error;

//             // data 是后端返回的 JSONB 对象: { success: true, message: '...' }
//             if (data && data.success) {
//                 elRedeemMsg.textContent = '✅ ' + data.message;
//                 elRedeemMsg.style.color = '#10b981'; // 绿色
//                 inputLicense.value = ''; // 清空输入框
                
//                 // 立即刷新会员状态，让界面变成 Pro
//                 const { data: { user } } = await supabaseClient.auth.getUser();
//                 if(user) loadPlan(user.id, true); // 强制刷新
                
//             } else {
//                 // 业务逻辑错误 (如码被使用、无效码)
//                 elRedeemMsg.textContent = '❌ ' + (data ? data.message : '兑换失败');
//                 elRedeemMsg.style.color = '#ef4444'; // 红色
//             }

//         } catch (err) {
//             console.error('兑换出错:', err);
//             elRedeemMsg.textContent = '❌ 网络或系统错误';
//             elRedeemMsg.style.color = '#ef4444';
//         } finally {
//             btnRedeem.disabled = false;
//             btnRedeem.textContent = '激活码兑换';
//         }
//     });

//     // #region 重置密码 =============================================================================
//     btnForgot.addEventListener('click', () => {
//         // 隐藏登录页，显示重置页 Step A
//         elStep1.classList.add('hidden');
//         viewResetEmail.classList.remove('hidden');
//         showAuthMsg(''); // 清空旧错误
//         saveAuthState('step-reset-email', inputResetEmail.value);
//     });

//     // --- 事件：点击“发送验证码” ---
//     btnResetSend.addEventListener('click', async () => {
//         const email = inputResetEmail.value.trim();
//         // if (!email) return showAuthMsg('请输入邮箱');
//         if (!email) return showAuthMsg(getI18nText('auth.enter_email'));

//         btnResetSend.disabled = true;
//         showAuthMsg(getI18nText('auth.sending'), true);

//         // 调用 Supabase 重置接口
//         const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email);
//         btnResetSend.disabled = false;

//         if (error) {
//             // 为了安全，有时候系统即便没找到邮箱也不会报错（防止被扫号）
//             // 但如果 MemFire 没开保护，这里会报 User not found
//             // showAuthMsg('发送失败: ' + error.message);
//             showAuthMsg(getI18nText('auth.send_failed') + error.message);
//         } else {
//             // 发送成功，跳转 Step B
//             tempResetEmail = email;
//             viewResetEmail.classList.add('hidden');
//             viewResetConfirm.classList.remove('hidden');
//             showAuthMsg('');
//             inputResetOtp.focus();
//             saveAuthState('step-reset-confirm', email);
//         }
//     });

//     // --- 事件：提交“确认修改密码” ---
//     btnResetSubmit.addEventListener('click', async () => {
//         const otp = inputResetOtp.value.trim();
//         const newPass = inputNewPass.value;

//         if (!otp || otp.length !== 6) return showAuthMsg(getI18nText('auth.code_format_error'));
//         if (!newPass || newPass.length < 6) return showAuthMsg(getI18nText('auth.new_pass_min_length'));

//         btnResetSubmit.disabled = true;
//         btnResetSubmit.textContent = '修改中...';

//         // 验证成功后，Supabase 会自动登录该用户并返回 session
//         const { data, error } = await supabaseClient.auth.verifyOtp({
//             email: tempResetEmail,
//             token: otp,
//             type: 'recovery' // ★★★ 关键：这是重置密码专用的类型
//         });

//         if (error) {
//             // showAuthMsg('验证失败: ' + error.message);
//             showAuthMsg(getI18nText('auth.verify_failed') + error.message);
//             btnResetSubmit.disabled = false;
//             btnResetSubmit.textContent = '确认修改';
//             return;
//         }

//         // 2. 验证通过后（此时已登录），立即更新密码
//         const { error: updateError } = await supabaseClient.auth.updateUser({ 
//             password: newPass 
//         });

//         if (updateError) {
//             // showAuthMsg('密码更新失败: ' + updateError.message);
//             showAuthMsg(getI18nText('auth.pass_update_failed') + updateError.message);
//             btnResetSubmit.disabled = false;
//             btnResetSubmit.textContent = '确认修改';
//         } else {
//             alert('✅ 密码修改成功！已为您自动登录。');   // 修改成功！
//             viewResetConfirm.classList.add('hidden');   // 隐藏重置界面
//             handleLoginSuccess(data.user);              // 这里 data.user 是 verifyOtp 返回的，直接用它初始化界面
//         }
//     });
//     // --- 事件：返回按钮 ---
//     const closeResetView = () => {
//         viewResetEmail.classList.add('hidden');
//         viewResetConfirm.classList.add('hidden');
//         elStep1.classList.remove('hidden'); // 回到登录页
//         showAuthMsg('');
//         saveAuthState('step-1-input', elEmail.value); // 返回首页
//     };
//     btnResetCancel1.addEventListener('click', closeResetView);
//     btnResetCancel2.addEventListener('click', closeResetView);
//     // #region 状态保存 =============================================================================
//     /**
//      * 保存当前状态
//      * @param {string} viewId - 当前显示的界面 ID
//      * @param {string} email - 当前操作的邮箱
//      */
//     async function saveAuthState(viewId, email) {
//         await chrome.storage.local.set({
//             temp_auth_state: {
//                 view: viewId,
//                 email: email || '',
//                 timestamp: Date.now() // 存个时间戳，防止恢复太久之前的状态
//             }
//         });
//     }

//     /* 清除状态 (成功后调用)*/
//     async function clearAuthState() {await chrome.storage.local.remove('temp_auth_state');}

//     /*尝试恢复状态 (初始化时调用*/
//     async function restoreAuthState() {
//         const data = await chrome.storage.local.get('temp_auth_state');
//         const state = data.temp_auth_state;
        
//         // 如果没有存档，或者存档超过 10 分钟，就不恢复了
//         if (!state || (Date.now() - state.timestamp > 10 * 60 * 1000)) return;
//         // console.log('🔄 恢复上次未完成的界面:', state.view);

//         // 1. 隐藏所有界面，显示目标界面
//         VIEWS.forEach(id => {
//             const el = document.getElementById(id);
//             if (el) el.classList.add('hidden');
//         });
//         const targetEl = document.getElementById(state.view);
//         if (targetEl) targetEl.classList.remove('hidden');

//         // 2. 回填数据 & 恢复变量
//         if (state.email) {
//             // 根据不同界面回填不同输入框
//             if (state.view === 'step-1-input') $('#user-email').value = state.email;
//             if (state.view === 'step-2-verify') {
//                 $('#verify-email-display').textContent = state.email;
//                 tempRegEmail = state.email; // 恢复全局变量
//             }
//             if (state.view === 'step-reset-email') $('#reset-email-input').value = state.email;
//             if (state.view === 'step-reset-confirm') {
//                 tempResetEmail = state.email; // 恢复全局变量
//             }
//         }
//     }
// }
// // #region 认证模块==============================================================================
// async function loadPlan(uid,isForce=false) {    // 加载会员计划
//     const now = Date.now();
//     // 1. 先尝试从本地读取上次保存的 UI 状态，立即渲染
//     if (!isForce) {
//         const { [cacheKey]: cachedData } = await chrome.storage.local.get(cacheKey);
//         const FETCH_INTERVAL = 5 * 60 * 1000; // 5分钟自动检查一次
//         if (cachedData) {
//             if (now - cachedData.timestamp < FETCH_INTERVAL){
//                 const statusStr = cachedData.isChro ? 'chrome' : 'edge';
//                 const isValid = await verifySignature(uid, statusStr, cachedData.signature);
//                 if (isValid) {
//                     // console.log('⚡️ 缓存签名校验通过');
//                     _isVerifiedYJHY = cachedData.isChro; // 更新内存变量
//                     updatePlanUI(cachedData.isChro,cachedData.expire_at,cachedData.isTrial);
//                     return; 
//                 } else {
//                     // console.warn('⚠️ 缓存签名校验失败！可能是有人篡改了 Storage');
//                     _isVerifiedYJHY = false;// 校验失败，强制设为 Free，并继续往下走去查云端
//                 }
//             } 
//         } 
//         $('#profile-badge').textContent = '加载中...';
//     }
//     const isDeviceValid = await validateDeviceStatus(); // 检查设备是否在云端登记
//     if (!isDeviceValid) return;
//     const { data } = await supabaseClient
//         .from('user_meta')
//         .select('plan, webdav_account, expire_at')
//         .eq('id', uid)
//         .single();
//     let isChro = false;
//     let isTrial = false; // 新增标记

//     if (data) {
//         // 情况A: 真正的 Pro (可能是永久，也可能带期限)
//         if (data.plan === 'Pro') {
//             if (data.expire_at) {
//                 const expireDate = new Date(data.expire_at);
//                 isChro = expireDate > new Date();
//             } else {
//                 isChro = true; // 永久 Pro
//             }
//         }
//         // 情况B: 新的 Trial 状态 (专门给新版插件用的)
//         else if (data.plan === 'Trial') {
//             if (data.expire_at) {
//                 const expireDate = new Date(data.expire_at);
//                 // 只有没过期才算 Pro 权限
//                 if (expireDate > new Date()) {
//                     isChro = true;
//                     isTrial = true; // 标记为试用
//                 }
//             }
//         }
//     }
//     const localDavUser = await getLocalWebDavUser(); // 确保你有这个辅助函数
//     // console.log('🔍 本地坚果云账号:', localDavUser,'云端登记账号',data.webdav_account);
//     if (isChro && data.webdav_account && localDavUser) {// 只有当 (是 Pro) 且 (云端有记录) 且 (本地已登录) 时才检查
//         if (localDavUser !== data.webdav_account) {
//             await performLogout(); // 异步执行登出
//             alert('⚠️ 安全警告\n\n检测到您的坚果云账号与云端绑定的不一致。\n(可能您的账号在其他设备更改了绑定)\n\n当前账号已强制退出，请重新登录。');
//             $('#logoutBtn').click();    // 同时退出坚果云
//             return; // 终止后续逻辑
//         }
//     }
//     // 4. 生成防篡改签名
//     const statusStr = isChro ? 'chrome' : 'edge';
//     const signature = await generateSignature(uid, statusStr);
//     _isVerifiedYJHY = isChro;

//     // 4. 生成防篡改签名
//     // console.log('🛡 会员状态:', isChro, '| 设备状态:', isDeviceValid);
//     await chrome.storage.local.set({
//         [cacheKey]: {
//             uid: uid,
//             isChro: isChro,
//             isTrial: isTrial,
//             signature: signature,
//             timestamp: now,
//             expire_at: data ? data.expire_at : null
//         }
//     });
//     // 更新 UI
//     updatePlanUI(isChro, data ? data.expire_at : null, isTrial);
// }
// async function getLocalWebDavUser() {
//     const res = await chrome.storage.local.get('nutstore_credentials');
//     if (!res.nutstore_credentials) return null;
//     try {
//         const decoded = atob(res.nutstore_credentials);
//         return decoded.split(':')[0]; // 返回邮箱部分
//     } catch (e) { return null; }
// }
// // 增加 isTrial 参数
// function updatePlanUI(isChro, expireAtStr = null, isTrial = false) {
//     const badge = $('#profile-badge');
//     const btnUpgrade = $('#btn-upgrade');
//     const activateSection = $('.activate-section');
//     const crownIcon = $('.crown-icon');

//     // 1. 判断逻辑
//     // 永久会员 = 是 Pro 且 无过期时间 且 不是 Trial 类型
//     const isPermanent = isChro && !expireAtStr && !isTrial;

//     // 2. 设置徽章文本
//     if (isPermanent) {
//         badge.textContent = '👑 Pro 永久会员';
//         badge.classList.add('pro');
//         badge.style.fontSize = ''; 
//     } else if (isChro) {
//         // 这里包含两种情况：plan='Pro'但有时间，或者 plan='Trial'
//         // 统称为试用或限时会员
//         const dateObj = new Date(expireAtStr);
//         const dateStr = `${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
        
//         // 文案可以区分一下，也可以统一
//         badge.textContent =  `Pro 体验 (有效期至 ${dateStr})`;
            
//         badge.classList.add('pro');
//         badge.style.fontSize = '10px';
//     } else {
//         badge.textContent = 'Free 免费版';
//         badge.classList.remove('pro');
//         badge.style.fontSize = ''; 
//     }

//     // 3. 控制升级模块 (逻辑不变：不是永久的都要显示升级)
//     if (isPermanent) {
//         btnUpgrade.style.display = 'none';
//         activateSection.style.display = 'none';
//     } else {
//         btnUpgrade.style.display = 'flex';
//         activateSection.style.display = 'block';
//     }

//     crownIcon.style.display = isChro ? 'block' : 'none';
// }
// /* 🔒 核心权限检查 返回 true 表示通过，false 表示拦截*/
// async function checkProPermission() {
//     // 1. 第一层：检查本地缓存
//     if (_isVerifiedYJHY === true) {
//         return true;
//     }
//     // 2. 第二层：如果没有缓存（或缓存是Free），再去查云端 ===
//     // console.log('🔄 [Network] 本地无缓存，正在请求云端...');
//     const { data: { user } } = await supabaseClient.auth.getUser();
    
//     if (!user) {
//         alert('请先在“账户”页面登录账号');
//         document.querySelector('.nav-item[data-tab="tab-user"]').click();
//         return false;
//     }
//     await loadPlan(user.id, false);     
//     if (_isVerifiedYJHY === true) { return true;}

//     if (isChro) {
//         return true;
//     } else {
//         if(confirm('🔒 该功能仅限 Pro 永久会员使用。\n\n一次付费，永久解锁。\n是否立即开通？')) {
//             document.querySelector('.nav-item[data-tab="tab-user"]').click();
//         }
//         return false;
//     }
// }
// async function validateDeviceStatus() {
//     try {
//         const { data: { user } } = await supabaseClient.auth.getUser();
//         if (!user) return false;
//         const deviceId = await getDeviceId();
//         // 只查 ID，数据量极小
//         const { data } = await supabaseClient
//             .from('user_devices')
//             .select('id')
//             .eq('user_id', user.id)
//             .eq('device_id', deviceId)
//             .single();

//         // 3. 更新缓存
//         const isValid = !!data;
//         if (!isValid) {
//             // 被踢了：执行登出清理
//             console.log('设备自动退出！');
//             await performLogout();
//             alert('登录设备超出数量限制！')
//             return false;
//         }

//         return true;

//     } catch (e) {
//         console.error('设备检查失败', e);
//         // 网络错误时，为了不影响用户使用，通常选择“默认放行”或“默认拦截”
//         // 这里建议默认放行，或者返回上一次的缓存
//         return true; 
//     }
// }
// async function performLogout() {
//     await supabaseClient.auth.signOut();
//     const { error } = await supabaseClient.auth.signOut();
//     if (error) {
//         console.log("退出登录失败:", error.message);
//     } else {
//         console.log("已成功退出登录");
//         await chrome.storage.local.remove([cacheKey,lastRegKey]);
//         await chrome.storage.local.remove('supabase.auth.token');
//         await chrome.storage.local.remove(['email','password']);
//         location.reload();  //  重新加载（刷新）当前页面
//     }
// }
