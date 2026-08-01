const generateNodeId = () => Math.random().toString(36).substr(2, 9);
const generateFileId = () => 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
const $ = (sel) => document.querySelector(sel);
if (typeof chrome.storage === 'undefined') {throw new Error('');}
if (typeof marked !== 'undefined') marked.use({ breaks: true, gfm: true });

const MINDMAP_THEME_STORAGE_KEY = 'mindmap_theme';

function getMindMapExportBaseName() {
    const title = String(document.title || sessionStorage.getItem('pageTitle') || '').trim();
    const safeTitle = title
        .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
        .replace(/[.\s]+$/g, '')
        .trim();
    return safeTitle || '思维导图';
}

function applyMindMapTheme(theme) {
    const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = normalizedTheme;
    const themeButton = $('#btn-theme-toggle');
    const themeIcon = themeButton?.querySelector('i');
    const switchingToDark = normalizedTheme === 'light';
    if (themeIcon) themeIcon.className = switchingToDark ? 'ri-moon-line' : 'ri-sun-line';
    if (themeButton) {
        themeButton.title = switchingToDark ? '切换到暗色模式' : '切换到亮色模式';
        themeButton.setAttribute('aria-pressed', String(normalizedTheme === 'dark'));
    }
}

function notifyQuickerTheme(theme) {
    const webView = window.chrome && window.chrome.webview;
    if (window.__DEEPCONVO_LEGACY_QUICKER_HOST__ &&
        webView && typeof webView.postMessage === 'function') {
        webView.postMessage(`DEEPCONVO_THEME:${theme}`);
    }
}

async function initializeMindMapTheme() {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const result = await chrome.storage.local.get(MINDMAP_THEME_STORAGE_KEY);
    const savedTheme = result && result[MINDMAP_THEME_STORAGE_KEY];
    applyMindMapTheme(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : systemTheme);

    const themeButton = $('#btn-theme-toggle');
    if (!themeButton) return;
    themeButton.onclick = async () => {
        const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyMindMapTheme(nextTheme);
        await chrome.storage.local.set({ [MINDMAP_THEME_STORAGE_KEY]: nextTheme });
        notifyQuickerTheme(nextTheme);
    };
}

function showMindMapImportFeedback(message) {
    if (typeof showTopToast === 'function') showTopToast(message);
    else window.alert(message);
}

function applyImportedMindMap(content) {
    try {
        const imported = JSON.parse(content);
        if (!imported || !imported.data) throw new Error('文件中没有思维导图数据');
        state.data = imported.data;
        state.view = imported.view || state.view;
        state.history = [];
        state.historyIndex = -1;
        sessionStorage.removeItem('currentFileID');
        recordHistory();
        renderTree();
        showMindMapImportFeedback('✅ 思维导图导入成功');
    } catch (error) {
        console.error('[MindMap] 导入思维导图失败:', error);
        showMindMapImportFeedback(`❌ 导入失败：${error.message || '文件格式不正确'}`);
    }
}

function initializeMindMapImport() {
    const openButton = $('#btn-open');
    const quickerWebView = window.chrome && window.chrome.webview;
    if (!openButton || !window.__DEEPCONVO_LEGACY_QUICKER_HOST__ || !quickerWebView ||
        typeof quickerWebView.postMessage !== 'function' ||
        typeof quickerWebView.addEventListener !== 'function') {
        if (openButton) openButton.onclick = () => $('#fileInput').click();
        return;
    }

    openButton.onclick = () => quickerWebView.postMessage('DEEPCONVO_IMPORT_REQUEST');
    quickerWebView.addEventListener('message', event => {
        let payload = event.data;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); }
            catch { return; }
        }
        if (!payload || payload.type !== 'DEEPCONVO_IMPORT_RESULT' || payload.cancelled) return;
        if (payload.error) {
            showMindMapImportFeedback(`❌ 导入失败：${payload.error}`);
            return;
        }
        applyImportedMindMap(payload.content);
    });
}

const defaultTreeData = {
    id: 'root', topic: 'MindMap', content: '## 主题',
    widthMode: 'auto', heightMode: 'auto', children: [],
    foldedLeft: false, foldedRight: false
};
let dockData = JSON.parse(sessionStorage.getItem('DockData'))||[]; // 初始为空数组
let saveData = JSON.parse(sessionStorage.getItem('MindMapData'))||{};
let pageTitle = sessionStorage.getItem('pageTitle')||'AI思维导图';
document.title = pageTitle;
let state = {
    data: saveData.data || JSON.parse(JSON.stringify(defaultTreeData)),
    view: saveData.view || {"tx":window.innerWidth/2,"ty":window.innerHeight/2,"scale":1},
    scrollMap: new Map(Object.entries(saveData.scrollMap || {})),
    selectedIds: new Set(), history: [], historyIndex: -1,
    mode: 'IDLE', dockCollapsed: false, activeDockIndex: -1,
    editingNode: null, isReadOnly: false,
    startPos: {x:0,y:0}, viewStart: {x:0,y:0},
    drag: { source: null, nodeId: null, data: null, title: '', targetId: null, dropType: null },
    resize: { node: null, dir: '', startW: 0, startH: 0, mx: 0, my: 0 },
    rainbowMode: false 
};
const CARD_BG='95%';
let isUndoRedo = false;
let saveTimer = null;
// --- 新增：记录空格键状态 ---
let isSpacePressed = false;
let isSyncingEditor = false;
let isSyncingPreview = false;
let rootObserver = null;

document.addEventListener('keydown', (e) => {
    // 1. 判断当前焦点是否在输入框、文本域或可编辑元素(如节点标题)内
    const activeEl = document.activeElement;
    const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
    );

    // 2. 处理空格键
    if (e.code === 'Space') {
        // 如果正在打字，直接返回，允许输入空格
        if (isTyping) return;

        // 【核心修复】：
        // 必须在检查 !e.repeat 之前调用 preventDefault
        // 这样才能阻止长按时的连续滚动行为
        e.preventDefault(); 
        
        if (!e.repeat) {
            isSpacePressed = true;
            document.body.classList.add('space-mode');
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        isSpacePressed = false;
        document.body.classList.remove('space-mode'); // [新增] 移除全局样式类
        document.body.classList.remove('is-dragging'); // [新增] 防止松开空格时手型卡住
    }
});
chrome.storage.onChanged.addListener(async(changes, namespace) => {
    if (namespace === 'local' && changes.MindMapData && location.href.endsWith('view=sidepanel')) {
        const MindMapData=await readmapData('MindMapData');
        const id = await readmapData('currentFileID');
        const fileName = await readmapData('fileName');
        await updateState(MindMapData,id,fileName);
    }
});
/*===============================================================================================
// #region 补丁函数
 ==============================================================================================*/
let action=null;
let saveToCloudTimer = null;

async function readmapData(key=FAV_KEY) {
    try {
        const result = await chrome.storage.local.get([key]);       // 读取收藏数据
        return result[key];
    } catch (e) {
        console.log('[MindMap] 读取思维导图数据失败:', e);
    }
}
async function updateState(MindMapData,newCurrentFileID,pageTitle,otherPageOpen=false){       // 思维导图页面加载思维导图文件
    if (!otherPageOpen) await saveMindMapData(true,false);  // 询问保存当前文件
    document.title = pageTitle;
    state.data = MindMapData.data || defaultTreeData;
    state.view = MindMapData.view || {tx:window.innerWidth/2,ty:window.innerHeight/2,scale:1};
    state.scrollMap = new Map(Object.entries(MindMapData.scrollMap || {}));
    state.history=[];
    state.historyIndex=-1;
    recordHistory();
    renderTree();
    sessionStorage.setItem('currentFileID', newCurrentFileID);
    sessionStorage.setItem('MindMapData', JSON.stringify(MindMapData));
    sessionStorage.setItem('pageTitle', pageTitle);
}

function updateDockData(qaData) {           // 思维导图页面加载卡片坞数据
    dockData = qaData;
    renderDock();
    sessionStorage.setItem('DockData', JSON.stringify(dockData));
}

async function saveMindMapData(isForce=false,notify=true){           // 保存
    if (bookmarkManager){
        if (!isForce) return;
        saveGlobalScrolls(); 
        const saveData={data:state.data,view:state.view,scrollMap: Object.fromEntries(state.scrollMap)}
        const currentFileID = sessionStorage.getItem('currentFileID');
        // console.log('currentFileID',currentFileID)
        const isExist = Object.prototype.hasOwnProperty.call(bookmarkManager.data.items, currentFileID);
        if (!isExist){
            const newId = generateFileId();
            const targetItem = {
                id: newId,
                name: document.querySelector('#card-root > div.card-header').textContent.trim(),
                parentId: null,
                data:`MindMapData.__REF__${newId}-extra`
            };
            bookmarkManager.showNewItemModal(targetItem,saveData,'save_mindmap');
        }else{
            idbSet({[`MindMapData.__REF__${currentFileID}-extra`]:saveData})
            if (notify) showTopToast('✅ 保存成功！');
        }
    };
}
function newMindMap(){      // 新建思维导图
    saveMindMapData(true);  // 询问保存
    new_MindMap();          // 新建
}

function new_MindMap(){
    document.title = '新建思维导图';
    sessionStorage.setItem('pageTitle', '新建思维导图');
    state.data = JSON.parse(JSON.stringify(defaultTreeData));   // 深拷贝
    state.view = {tx:window.innerWidth/2,ty:window.innerHeight/2,scale:1};
    state.history=[];
    state.historyIndex=-1;
    recordHistory();
    renderTree();
    sessionStorage.removeItem('currentFileID');
}
// ===============================================================================================
document.addEventListener('DOMContentLoaded', () => {
    (async () => {
        const isMapInitialized = sessionStorage.getItem('isMapInitialized');
        console.log('MindMap 初始化',isMapInitialized);
        if (isMapInitialized!=='MindMap-true') {
            console.log('MindMap 初始化');
            action = await readmapData('MindMapAction') || null;    // 读取动作
            const pageTitle = await readmapData('fileName');
            if (action ==='new') {  // 将选中的收藏聊天数据加载到卡片坞，新建思维导图
                (async () => {
                    dockData = await readmapData('DockData') || [];
                    console.log('卡片坞数据：',dockData)
                    renderDock();   // 确保数据加载后再渲染
                    new_MindMap();
                    sessionStorage.setItem('DockData', JSON.stringify(dockData));
                })(); 
            }else if (action ==='open') {
                (async () => {
                    const MindMapData=await readmapData('MindMapData');
                    const currentFileID = await readmapData('currentFileID');
                    console.log('MindMapData',MindMapData)
                    updateState(MindMapData,currentFileID,pageTitle,true);
                    sessionStorage.setItem('MindMapData', JSON.stringify(MindMapData));
                    sessionStorage.setItem('currentFileID', currentFileID);
                })();
            }else{
                recordHistory(); 
                renderTree(); 
                renderDock();
            }
            sessionStorage.setItem('pageTitle', pageTitle);
            sessionStorage.setItem('isMapInitialized', 'MindMap-true');
        }else{
            recordHistory(); 
            renderTree(); 
            renderDock();
        }

    })();

/*===============================================================================================
// #region 事件绑定
 ==============================================================================================*/
    initializeMapClickEvents(); // 初始化点击事件
    initializeMapMouseEvents(); // 初始化鼠标事件
    initializeMapContextMenu(); // 初始化右键菜单
    initializeNativeDragDrop(); // 初始化原生拖拽
    initializeEditorToolbar();  // 初始化md编辑器
    initializeMapToolbar();     // 初始化思维导图工具栏
    initializeEditorContextMenu(); // 初始化md编辑器右键菜单

    $('#dock-body').addEventListener('wheel', (e) => { 
        e.stopPropagation(); e.currentTarget.scrollLeft += e.deltaY; 
    });

    document.addEventListener('paste', (e) => {
        // 1. 判断是否正在编辑节点标题
        if (e.target.classList.contains('node-topic')) {
            // 2. 阻止浏览器默认的“带样式粘贴”行为
            e.preventDefault();

            // 3. 获取剪贴板中的纯文本数据
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');

            // 4. 使用 execCommand 插入文本
            // 这样做的好处是：浏览器会自动处理光标位置，并且支持 Ctrl+Z 撤销
            document.execCommand('insertText', false, text);
        }
    });
    document.addEventListener('focusout', (e) => { 
        if(e.target.classList.contains('node-topic')) { 
            const c = e.target.closest('.node-card'); 
            if(c) { 
                const n = findNode(state.data, c.dataset.nodeId); 
                // 1. 获取新文本
                const newText = e.target.textContent;

                // 2. 核心修复：实时切换 class
                // 如果没字了，加上 topic-empty；有字了，移除 topic-empty
                if (!newText || newText.trim() === '') {
                    c.classList.add('topic-empty');
                } else {
                    c.classList.remove('topic-empty');
                }

                // 3. 原有的保存逻辑
                if(n && n.topic !== newText) {
                    n.topic = newText; 
                    recordHistory(); 
                } 
            } 
        } 
    });
    // --- 修复后的代码 ---
    document.addEventListener('keydown', (e) => { 
        // 判断当前事件源是否为节点标题，且按下的是 Enter 键
        if(e.target.classList.contains('node-topic') && e.key==='Enter') { 
            
            // 1. 获取当前所在的卡片 DOM
            const card = e.target.closest('.node-card');
            const isSimple = card && card.classList.contains('simple');

            if (isSimple) {
                // ==========================================
                // 情况 A：便利贴模式 (Simple Mode)
                // ==========================================
                // 允许默认行为（即允许插入换行符），不要调用 preventDefault()
                
                // 关键：必须阻止冒泡！
                // 否则这个 Enter 会冒泡到 window，触发全局的 "创建兄弟节点" 快捷键
                e.stopPropagation(); 
            } else {
                // ==========================================
                // 情况 B：标准卡片模式 (Standard Mode)
                // ==========================================
                // 阻止默认换行，改为“完成编辑”
                e.preventDefault(); 
                e.stopPropagation(); 
                e.target.blur(); // 失去焦点，触发保存
            }
        }
    });

    /* --- MindMap.js 中的键盘监听部分 --- */

    window.addEventListener('keydown', (e) => {
        // 1. 状态检测
        const activeEl = document.activeElement;
        
        // 是否正在输入 (Input/Textarea/ContentEditable)
        const isInput = activeEl && (
            activeEl.tagName === 'INPUT' || 
            activeEl.tagName === 'TEXTAREA' || 
            activeEl.isContentEditable
        );

        // 是否打开了编辑器模态框
        const isModalActive = document.getElementById('editorModal').classList.contains('active');

        // 是否有文本被选中 (关键修复：防止复制文字时触发节点复制)
        const hasSelection = window.getSelection() && window.getSelection().toString().length > 0;

        // ▼▼▼ 优先处理：全局保存 (Ctrl + S) ▼▼▼
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (typeof syncCurrentInput === 'function') syncCurrentInput(); 
            saveMindMapData(true);
            return;
        }

        // ▼▼▼ 编辑器格式化快捷键 (仅在输入状态下生效) ▼▼▼
        if (isInput) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { 
                e.preventDefault(); insertTextFormat('**', '**'); return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { 
                e.preventDefault(); insertTextFormat('*', '*'); return;
            }
        }

        // ▼▼▼ 核心修复：阻断逻辑 ▼▼▼
        // 如果满足以下任一条件，直接返回，【不执行】后面的节点操作：
        // 1. 正在打字 (isInput) -> 让浏览器处理文字输入、文字复制粘贴
        // 2. 模态框开着 (isModalActive) -> 让编辑器处理复制粘贴
        // 3. 页面上有文字被选中 (hasSelection) -> 让浏览器复制选中的文字
        if (isInput || isModalActive || hasSelection) {
            return; 
        }

        // ▼▼▼ 下面是纯粹的“脑图节点操作” ▼▼▼
        
        // 复制节点 (Ctrl + C)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            e.preventDefault(); copySelectedNodes(); return;
        }

        // 粘贴节点 (Ctrl + V)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            e.preventDefault(); pasteNodesToSelection(); return;
        }

        // 剪切节点 (Ctrl + X)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
            e.preventDefault(); cutSelectedNodes(); return;
        }

        // 撤销 (Ctrl + Z)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault(); undo(); return;
        }

        // 重做 (Ctrl + Y)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault(); redo(); return;
        }

        // 新建子节点 (Tab)
        if (e.key === 'Tab') { 
            e.preventDefault(); $('#btn-add-child').click(); return;
        }

        // 新建同级节点 (Enter)
        if (e.key === 'Enter') { 
            e.preventDefault(); 
            if (activeEl.classList.contains('node-topic')) return; // 双重保险
            $('#btn-add-sibling').click(); 
            return;
        }

        // 删除节点 (Delete)
        if (e.key === 'Delete') { 
            e.preventDefault(); $('#btn-delete').click(); return;
        }
    });

    // recordHistory(); renderTree(); renderDock();
});
// =============================================================================
// #region 工具栏事件
// =============================================================================

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
            state.selectedIds.clear(); state.selectedIds.add(newNode.id); 
            recordHistory(); updateChildrenDOM(n.id); 
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
            state.selectedIds.clear(); state.selectedIds.add(newNode.id); 
            recordHistory(); updateChildrenDOM(p.id); 
        } 
    };
    $('#btn-delete').onclick=()=>{ 
        syncCurrentInput(); 
        const parents=new Set(); 
        state.selectedIds.forEach(id=>{
            if(id!==state.data.id){
                const p=findParent(state.data,id);
                if(p){ p.children=p.children.filter(c=>c.id!==id); parents.add(p.id); }
            }
        }); 
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
            
            // 遍历选中节点应用颜色
            let hasChanged = false;
            state.selectedIds.forEach(id => { 
                const n = findNode(state.data, id); 
                // 只有颜色真的变了才刷新，优化性能
                if(n) { 
                    n.color = color; 
                    updateNodeDOM(n.id); 
                    hasChanged = true;
                } 
            });

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
        
        // 视觉反馈：按钮高亮
        const btn = $('#btn-rainbow');
        if (state.rainbowMode) {
            btn.classList.add('primary'); // 借用 primary 样式表示激活
            btn.style.color = '#fff';     // 确保文字白色
        } else {
            btn.classList.remove('primary');
            btn.style.color = '';
        }

        // 禁用/启用手动颜色按钮，避免冲突
        $('#btn-color').disabled = state.rainbowMode || state.selectedIds.size === 0;
        updateTreeStyle(); 
        // renderTree(); // 重新渲染，应用颜色
    };

    $('#btn-center').onclick=()=>{ state.view={tx:window.innerWidth / 2,ty:window.innerHeight / 2,scale:1}; updateTransform(); saveStorage(); };
    $('#btn-new').onclick=()=>{newMindMap();}
    $('#btn-save').onclick=()=>{saveMindMapData(true);}
    $('#btn-export').onclick=()=>{ 
        const a=document.createElement('a');
        const url=URL.createObjectURL(new Blob([JSON.stringify({version:'v36-final-fix',data:state.data,view:state.view})],{type:'application/json'}));
        a.href=url;
        a.download=`${getMindMapExportBaseName()}.json`;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(url),0);
    };
    $('#fileInput').onchange=(e)=>{ 
        const f=e.target.files[0]; 
        if(!f)return; 
        const r=new FileReader(); 
        r.onload=(ev)=>{ 
            try{
                const j=JSON.parse(ev.target.result);
                 if(j.data){
                    state.data=j.data;
                    state.view=j.view||state.view;
                    state.history=[];
                    state.historyIndex=-1;
                    sessionStorage.removeItem('currentFileID');
                    recordHistory();
                    renderTree();
                }
            }catch(e){
                alert('Error');
            } e.target.value=''; 
        };
        r.readAsText(f);
    };
    initializeMindMapImport();
    $('#btn-export-canvas').onclick = () => {
        exportToCanvas();
    };
    $('#btn-export-vertical').onclick = () => {
        exportToVerticalCanvas();
    };
    $('#btn-change-folder').onclick = async() => {
        await resetObsidianPath();
        // 2. 立即触发选择新目录 (因为句柄已空，getObsidianHandle 会自动弹窗)
        const newHandle = await getObsidianHandle();
        if (newHandle) {
            showTopToast('✅ 新目录设置成功！');
        }
        // 关闭菜单
        return;
    };
    initializeMindMapTheme();
}

// =============================================================================
// #region 右键菜单
// =============================================================================
function initializeMapContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    
    // 1. 监听右键点击 (呼出菜单)
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.bookmark-manager-container')) return;
        if (!e.target.closest('.node-card')) return;

        const expandItem=contextMenu.querySelector('.menu-item[data-action="expand"]');
        const collapseItem=contextMenu.querySelector('.menu-item[data-action="collapse"]');
        const toStandardItem=contextMenu.querySelector('.menu-item[data-action="to-standard"]');
        const toSimpleItem=contextMenu.querySelector('.menu-item[data-action="to-simple"]');
        const card = e.target.closest('.node-card');
        const node = findNode(state.data, card.dataset.nodeId);

        if (!card) {
            contextMenu.classList.remove('active');
            return;
        }
        const menuWidth = 140;
        let menuHeight = 410;
        if (node.isSimple){     // 便利贴模式
            toStandardItem.style.display='block';
            toSimpleItem.style.display='none';
            expandItem.style.display='none';
            collapseItem.style.display='none';
            menuHeight=287;
        }else{                  // 标准卡片模式
            if (node.contentCollapsed){ // 折叠状态
                toStandardItem.style.display='none';
                toSimpleItem.style.display='none';
                collapseItem.style.display='none';
                expandItem.style.display=card.classList.contains('has-content')?'block':'none';
                menuHeight=card.classList.contains('has-content')?287:247;
            }else{      // 展开状态
                if (card.classList.contains('topic-empty')){
                    toStandardItem.style.display='none';
                    toSimpleItem.style.display='none';
                    expandItem.style.display='none';
                    collapseItem.style.display='none';
                    menuHeight=247;
                }else{
                    toStandardItem.style.display='none';
                    toSimpleItem.style.display='block';
                    expandItem.style.display='none';
                    collapseItem.style.display=card.classList.contains('has-content')?'block':'none';
                    menuHeight=card.classList.contains('has-content')?319:287;
                }
                
            }
        }

        e.preventDefault();

        // 选中逻辑
        const nodeId = card.dataset.nodeId;
        if (!state.selectedIds.has(nodeId)) {
            state.selectedIds.clear();
            state.selectedIds.add(nodeId);
            updateSelection();
        }

        // 位置计算
        let x = e.clientX;
        let y = e.clientY;


        if (x + menuWidth > window.innerWidth) x -= menuWidth;
        if (y + menuHeight > window.innerHeight) y -= menuHeight;

        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.classList.add('active');
    });

    // 2. 菜单动作处理
    contextMenu.addEventListener('click', (e) => {
        // 如果点击的是自定义颜色的 Input 或 按钮容器，不触发这里的主逻辑
        if (e.target.closest('.custom-color-btn') || e.target.tagName === 'INPUT') return;

        const item = e.target.closest('.menu-item');
        const swatch = e.target.closest('.color-swatch'); // 【修改】使用新类名

        if ((!item && !swatch) || (item && item.classList.contains('has-submenu'))) return;

        let action = item ? item.dataset.action : null;
        let colorVal = null;

        if (swatch) {
            action = 'set-color';
            colorVal = swatch.dataset.color; // 【修改】使用 data-val
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
                    if (!node.contentCollapsed && node.content) { node.contentCollapsed = true; hasChange = true; updateNodeDOM(node.id); }
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

// =============================================================================
// #region 编辑器右键菜单
// =============================================================================
function initializeEditorContextMenu() {
    const menu = document.getElementById('editorContextMenu');
    const textarea = document.getElementById('editorTextarea');
    // 定义存储 Key (与上传模块保持一致)
    const IMG_STORAGE_KEY = 'MindMap_ImgBB_Key'; 

    if (!menu || !textarea) return;

    let savedSelection = { start: 0, end: 0 };
    let savedTextSnapshot = '';
    let ctxMenuTextSnapshot = null;

    // --- 1. 监听右键呼出 ---
    textarea.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        savedSelection.start = textarea.selectionStart;
        savedSelection.end = textarea.selectionEnd;
        savedTextSnapshot = textarea.value;
        textarea.focus({ preventScroll: true });

        let x = e.clientX, y = e.clientY;
        const w = 180, h = 283; 
        if (x + w > window.innerWidth) x -= w;
        if (y + h > window.innerHeight) y -= h;

        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.classList.add('active');
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
                    document.execCommand('delete');
                    textarea.dispatchEvent(new Event('input'));
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
                        document.execCommand('insertText', false, text);
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
                        document.execCommand('insertText', false, text);
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
            textarea.value = ctxMenuTextSnapshot;
            textarea.setSelectionRange(savedSelection.start, savedSelection.end);
            insertTextFormat(`<span style="color:${e.target.value}">`, '</span>', false);
        });
        customInput.addEventListener('change', (e) => {
            menu.classList.remove('active');
            textarea.value = ctxMenuTextSnapshot || savedTextSnapshot;
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
// =============================================================================
// #region 鼠标点击事件
// =============================================================================
function initializeMapClickEvents() {
    const openEditor = (node, readOnly=false) => {
        syncCurrentInput(); state.editingNode=node; state.isReadOnly=readOnly;
        $('#editorModal').classList.add('active'); $('#modalWin').className=readOnly?'modal-win narrow':'modal-win';
        $('#modalTopicInput').value=node.topic; $('#modalTopicInput').disabled=readOnly;
        $('#editorTextarea').value=node.content||''; $('#editorTextarea').parentElement.style.display=readOnly?'none':'flex';
        $('#previewContent').innerHTML=renderMarkdown(node.content); processRichContent($('#previewContent'));
        $('#btn-close-modal').innerText=readOnly?'关闭':'完成';
    };
    document.addEventListener('click', (e) => {
        const t = e.target;
        if(!t.closest('#btn-color') && !t.closest('.color-popup')) $('#colorPopup').classList.remove('show');
        const foldBtn = t.closest('.fold-btn');
        if(foldBtn) {
            const action = foldBtn.dataset.action;
            if(action === 'fold-root-left') {
                state.data.foldedLeft = !state.data.foldedLeft; recordHistory(); renderTree(); return;
            }
            if(action === 'fold-root-right') {
                state.data.foldedRight = !state.data.foldedRight; recordHistory(); renderTree(); return;
            }
            if(action === 'fold') {
                syncCurrentInput();
                const n = findNode(state.data, foldBtn.closest('.node-card').dataset.nodeId);
                n.folded = !n.folded; recordHistory(); updateChildrenDOM(n.id); return;
            }
        }
        if(t.dataset.action === 'toggle-simple') {
            syncCurrentInput();
            const n = findNode(state.data, t.closest('.node-card').dataset.nodeId);
            
            n.isSimple = !n.isSimple;
            
            // --- 关键修复：防止高度爆炸 ---
            if (n.isSimple) {
                // 如果切为便利贴，强制改为手动高度模式，并给一个初始值(例如 220px)
                // 这样长文本就会被限制住，出现滚动条，而不是撑满屏幕
                n.heightMode = 'auto';
                n.widthMode = 'manual'; // 建议同时也锁宽度，体验更好
                if (!n.width) n.width = 400; // 默认宽度
                if (!n.bodyHeight) n.bodyHeight = 220; // 默认高度
            } else {
                // 切回标准模式，恢复自动
                n.heightMode = 'auto';
                n.widthMode = 'auto';
            }
            
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
            n.widthMode='auto'; n.heightMode='auto'; recordHistory(); updateNodeDOM(n.id); return;
        }
        if(t.closest('#dock-handle')) { state.dockCollapsed = !state.dockCollapsed; renderDock(); }
    });
    document.addEventListener('dblclick', (e) => {
        const t = e.target;
        
        // --- 修复：支持 Dock 卡片双击 ---
        const dockCard = t.closest('.dock-card');
        if(dockCard) {
            const idx = parseInt(dockCard.dataset.index);
            openEditor({ topic: dockData[idx].question, content: dockData[idx].answer }, true);
            return;
        }

        // --- 修复：便利贴模式下，双击底部(b)、右下角(br)、左下角(bl) 均可自适应高度 ---
        // 检查是否点击了调整手柄
        if (t.classList.contains('resize-b') || 
        t.classList.contains('resize-br') || 
        t.classList.contains('resize-bl') || 
        t.classList.contains('resize-r') || 
        t.classList.contains('resize-l')) {
            const card = t.closest('.node-card');
            if (card) {
                const n = findNode(state.data, card.dataset.nodeId);
                if (n) {
                    // 1. 如果点击的是【高度】相关手柄 (底部、左下角、右下角) -> 重置高度
                    if (t.classList.contains('resize-b') || t.classList.contains('resize-br') || t.classList.contains('resize-bl')) {
                        n.heightMode = 'auto';
                    }
                     // 2. 如果点击的是【宽度】相关手柄 (侧边、左下角、右下角) -> 仅标准卡片重置宽度
                    if (t.classList.contains('resize-r') || t.classList.contains('resize-l') || t.classList.contains('resize-br') || t.classList.contains('resize-bl')) {
                        if (!n.isSimple) {
                            // 标准卡片：双击侧边或角标，重置宽度为自适应
                            n.widthMode = 'auto';
                        }
                    }
                    
                    recordHistory();
                    updateNodeDOM(n.id);
                    
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
            }
        }

        // --- 修复：双击卡片打开编辑 ---
        const header = t.closest('.card-header');
        if(header && !t.closest('.header-tools') && !t.classList.contains('node-topic')) {
            const n = findNode(state.data, header.closest('.node-card').dataset.nodeId);
            // 便利贴模式也可以双击打开编辑器 (可选)
            if (n) openEditor(n); 
            return;
        }
        const body = t.closest('.card-body');
        if(body) {
            const n = findNode(state.data, body.closest('.node-card').dataset.nodeId);
            openEditor(n); 
            return;
        }
    });

}


// =============================================================================
// #region 鼠标事件监听初始化
// =============================================================================
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
            const scrollable = e.target.closest('.card-body') || 
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

    // #region 鼠标按下事件
    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; 
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
           e.target.closest('.toolbar') || 
           e.target.closest('.color-popup') || 
           e.target.closest('#contextMenu') || 
           e.target.closest('#editorContextMenu') ||
           e.target.closest('.fold-btn') ||    // 新增
           e.target.closest('.header-tools')   // 新增
        ) return;
        if (e.target.closest('.bookmark-manager-container')) return;
        state.startPos = {x:e.clientX, y:e.clientY}; state.viewStart = {x:state.view.tx, y:state.view.ty};

        if(e.target.classList.contains('resize-handle')) {
            const c = e.target.closest('.node-card');
            const n = findNode(state.data, c.dataset.nodeId);
            const body = c.querySelector('.card-body');
            
            state.mode = 'RESIZING';
            state.resize = { 
                node: n, 
                dir: e.target.dataset.resize, 
                handleEl: e.target,
                startW: c.offsetWidth, 
                
                // ▼▼▼ 核心修复：如果没有 body，就用卡片自身的高度作为起点！▼▼▼
                startH: body ? body.offsetHeight : c.offsetHeight, 
                // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
                
                mx: e.clientX, 
                my: e.clientY,
                startViewTy: state.view.ty
            };
            
            c.classList.add('no-trans');
            e.stopPropagation(); 
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
                    state.mode = 'PANNING';
                    e.preventDefault(); 
                    
                    // --- 优化 1：仅在确实有选中节点时才更新 DOM，减少重排 ---
                    if (state.selectedIds.size > 0) {
                        state.selectedIds.clear(); 
                        updateSelection(); 
                    }

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

    // #region 鼠标移动事件
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
            const s = state.view.scale;
            
            // 1. 计算新的尺寸值
            let newWidth = null;
            let newHeight = null;

            // --- A. 计算宽度 ---
            if(state.resize.dir.includes('w')) { 
                const card = document.getElementById(`card-${n.id}`);
                const isLeftCard = card && card.classList.contains('left-side');
                let delta = e.clientX - state.resize.mx;
                if(isLeftCard) delta = -delta; 
                
                newWidth = state.resize.startW + (delta / s);
                newWidth = Math.max(120, Math.min(600, newWidth)); // 限制范围
            }
            
            // --- B. 计算高度 ---
            if(state.resize.dir.includes('h')) { 
                const delta = e.clientY - state.resize.my;
                const isSimple = n.isSimple;
                const maxHeightLimit = isSimple ? 400 : 800;
                
                newHeight = state.resize.startH + (delta * 2 / s);
                newHeight = Math.max(50, Math.min(maxHeightLimit, newHeight));
            }

            // 2. 定义应用尺寸的函数 (复用逻辑)
            const applySizeToNode = (targetNode, w, h) => {
                const targetCard = document.getElementById(`card-${targetNode.id}`);
                if (!targetCard) return;

                // 应用宽度
                if (w !== null) {
                    targetNode.width = w;
                    targetNode.widthMode = 'manual';
                    targetCard.style.width = w + 'px';
                }

                // 应用高度
                if (h !== null) {
                    // 检查类型是否匹配 (仅同类型卡片同步高度)
                    // 标准卡片 vs 便利贴，由于结构不同，高度含义不同，互相同步会造成视觉错乱
                    // 因此：标准卡片只同步标准卡片，便利贴只同步便利贴
                    if (targetNode.isSimple === n.isSimple) {
                        targetNode.bodyHeight = h;
                        targetNode.heightMode = 'manual';
                        
                        if (!targetNode.isSimple) {
                            // 标准模式：改 Body 高度
                            const b = targetCard.querySelector('.card-body'); 
                            if (b) {
                                b.style.height = h + 'px';
                                targetCard.style.height = 'auto'; // 确保卡片本身自适应
                            }
                        } else {
                            // 便利贴模式：改 Card 高度
                            targetCard.style.height = h + 'px';
                        }
                    }
                }
            };

            // 3. 应用到当前操作的节点
            applySizeToNode(n, newWidth, newHeight);

            // 4. 同步应用到其他选中的节点
            if (state.selectedIds.size > 1) {
                state.selectedIds.forEach(id => {
                    if (id === n.id) return; // 跳过自己
                    const targetNode = findNode(state.data, id);
                    if (targetNode) {
                        applySizeToNode(targetNode, newWidth, newHeight);
                    }
                });
                // =========================================================
                // ▼▼▼ 【核心新增】视图补偿逻辑：让光标像磁铁一样吸住把手 ▼▼▼
                // =========================================================
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
                // =========================================================
                // ▲▲▲ 新增结束 ▲▲▲
                // =========================================================
            }
            

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
    document.addEventListener('mouseup', onMouseUp);
}

// ==========================================================================
// #region md编辑器
// ==========================================================================
function initializeEditorToolbar() {
    $('#editorModal').onmousedown = (e) => { if(e.target===$('#editorModal')) $('#btn-close-modal').click(); };
    $('#editorTextarea').oninput = (e) => { $('#previewContent').innerHTML=renderMarkdown(e.target.value); processRichContent($('#previewContent')); };
    $('#btn-fullscreen').onclick = () => $('#modalWin').classList.toggle('fullscreen');
    const editor = $('#editorTextarea'), preview = $('#previewContent');

    editor.addEventListener('scroll', () => { if(!isSyncingEditor) { isSyncingPreview=true; const p=editor.scrollTop/(editor.scrollHeight-editor.clientHeight); preview.scrollTop=p*(preview.scrollHeight-preview.clientHeight); setTimeout(()=>isSyncingPreview=false,10); } });
    preview.addEventListener('scroll', () => { if(!isSyncingPreview) { isSyncingEditor=true; const p=preview.scrollTop/(preview.scrollHeight-preview.clientHeight); editor.scrollTop=p*(editor.scrollHeight-editor.clientHeight); setTimeout(()=>isSyncingEditor=false,10); } });
    $('#btn-close-modal').onclick = () => {
        if(!state.isReadOnly && state.editingNode) {
            const t = $('#modalTopicInput').value;
            const c = $('#editorTextarea').value;
            
            // 检查是否有变化
            const topicChanged = state.editingNode.topic !== t;
            const contentChanged = state.editingNode.content !== c;

            if(topicChanged || contentChanged) { 
                state.editingNode.topic = t; 
                state.editingNode.content = c; 
                recordHistory(); 
                
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
        $('#editorModal').classList.remove('active'); 
        state.editingNode = null;
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

    // 点击按钮切换菜单显示
    toggleBtn.onclick = (e) => {
        e.stopPropagation(); // 防止冒泡
        e.preventDefault();  // 防止焦点丢失
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
        const textarea = $('#editorTextarea');
        
        // 1. 建立快照：仅在拖拽开始的第一刻记录“干净”的文本和选区
        if (!colorDragSnapshot) {
            colorDragSnapshot = {
                text: textarea.value,
                start: textarea.selectionStart,
                end: textarea.selectionEnd,
                scrollTop: textarea.scrollTop
            };
        }

        // 2. ▼▼▼ 关键修复：每次预览前，先强制还原到干净状态 ▼▼▼
        textarea.value = colorDragSnapshot.text;
        textarea.setSelectionRange(colorDragSnapshot.start, colorDragSnapshot.end);
        
        // 3. 在干净的文本上应用颜色 (预览模式)
        insertTextFormat(`<span style="color:${e.target.value}">`, '</span>', false);

        // 4. 保持滚动位置，防止跳动
        textarea.scrollTop = colorDragSnapshot.scrollTop;
    };
    
    $('#editorCustomColor').onchange = (e) => {
         $('#editorColorMenu').classList.remove('show');
        
        const textarea = $('#editorTextarea');
        
        // 5. 提交前，再次回滚到干净状态，确保 execCommand 的历史记录是基于原始文本的
        if (colorDragSnapshot) {
            textarea.value = colorDragSnapshot.text;
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
            
            const content = $('#editorTextarea').value;
            
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



// ===================================================================================================================================================
// #region 全局函数定义
// ===================================================================================================================================================
// #region md源码编辑

function insertTextFormat(prefix, suffix, restoreFocus = true) {
    const textarea = $('#editorTextarea');
    
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
        document.execCommand('insertText', false, replacement);
        textarea.setSelectionRange(start, newEnd);
    } else {
        // 预览模式
        textarea.value = text.substring(0, start) + replacement + text.substring(end);
        textarea.selectionStart = start;
        textarea.selectionEnd = newEnd;
    }

    // 5. 恢复滚动
    textarea.scrollTop = oldScrollTop;

    // 6. 触发预览更新
    textarea.dispatchEvent(new Event('input'));

    setTimeout(() => {
        isSyncingPreview = false;
        isSyncingEditor = false;
    }, 100);
};

// 通用的应用颜色函数
function applyCustomColorToSelection (color, isFinalStep) {
    saveGlobalScrolls();
    
    // 1. 更新数据和视图 (预览阶段 & 提交阶段都会执行)
    state.selectedIds.forEach(id => {
        const n = findNode(state.data, id);
        // 只有当颜色真的不同时才更新DOM，避免拖动时的性能浪费
        if (n && n.color !== color) {
            n.color = color;
            updateNodeDOM(n.id);
        }
    });

    // 2. 关键修复：只要是最终步骤 (change事件)，强制检查并记录历史
    // 我们不再依赖上面的 if (n.color !== color) 判断，
    // 因为 input 事件可能已经提前把数据改掉了，导致这里判断为 false。
    // recordHistory() 内部会自动对比数据是否真的变了，所以这里强制调用是安全的。
    if (isFinalStep) {
        recordHistory();
    }
};


function onMouseUp(e) {
    if(state.mode==='IDLE') return;
    if(state.mode==='DRAGGING') {
        if(state.drag.targetId && state.drag.dropType) {
            let newDir = undefined;
            if(state.drag.targetId === state.data.id) {
                const rr = document.getElementById(`card-${state.data.id}`).getBoundingClientRect();
                newDir = (e.clientX < rr.left+rr.width/2) ? 'left' : 'right';
            }

            if(state.drag.source==='node') {
                const nodes = state.selectedIds.has(state.drag.nodeId) ? Array.from(state.selectedIds) : [state.drag.nodeId];
                let changed = false;
                const parentsToUpdate = new Set();
                const isCopy = e.ctrlKey || e.altKey;

                nodes.forEach(id => {
                    if(id!==state.drag.targetId && !isDescendant(state.data, id, state.drag.targetId)) {
                        const p = findParent(state.data, id), t = findNode(state.data, state.drag.targetId), tp = findParent(state.data, state.drag.targetId);
                        if(p) {
                            if(isCopy) {
                                const cloned = deepCopyNode(findNode(state.data, id));
                                if(state.drag.targetId === state.data.id) cloned.dir = newDir;
                                else {
                                    if(state.drag.dropType !== 'CHILD') {
                                        const sibling = findNode(state.data, state.drag.targetId);
                                        cloned.dir = sibling.dir; 
                                    } else delete cloned.dir;
                                }
                                
                                if(state.drag.dropType==='CHILD') { 
                                    if(!t.children)t.children=[]; t.children.push(cloned); t.folded=false; 
                                    parentsToUpdate.add(t.id); 
                                } else { 
                                    const ti=tp.children.findIndex(c=>c.id===state.drag.targetId); 
                                    tp.children.splice(state.drag.dropType==='BEFORE'?ti:ti+1, 0, cloned); 
                                    parentsToUpdate.add(tp.id); 
                                }
                                changed = true;
                            } else {
                                const idx = p.children.findIndex(c=>c.id===id);
                                if(idx>-1) {
                                    const [mv] = p.children.splice(idx,1);
                                    if(state.drag.targetId === state.data.id) mv.dir = newDir;
                                    else {
                                        if(state.drag.dropType !== 'CHILD') {
                                            const sibling = findNode(state.data, state.drag.targetId);
                                            mv.dir = sibling.dir;
                                        } else delete mv.dir; 
                                    }

                                    parentsToUpdate.add(p.id);
                                    if(state.drag.dropType==='CHILD') { if(!t.children)t.children=[]; t.children.push(mv); t.folded=false; parentsToUpdate.add(t.id); }
                                    else { const ti=tp.children.findIndex(c=>c.id===state.drag.targetId); tp.children.splice(state.drag.dropType==='BEFORE'?ti:ti+1, 0, mv); parentsToUpdate.add(tp.id); }
                                    changed = true;
                                }
                            }
                        }
                    }
                });
                if(changed) { recordHistory(); parentsToUpdate.forEach(pid => updateChildrenDOM(pid)); } else renderTree();
            } else {
                let target = findNode(state.data, state.drag.targetId);
                let parent = findParent(state.data, state.drag.targetId);
                const newNode = {id:generateNodeId(), topic:state.drag.data.question, content:state.drag.data.answer, widthMode:'auto', heightMode:'auto'};
                
                if(state.drag.dropType === 'CHILD') {
                    if(state.drag.targetId === state.data.id) newNode.dir = newDir;
                    else delete newNode.dir;
                    
                    if(!target.children) target.children = [];
                    target.children.push(newNode);
                    target.folded = false;
                    recordHistory(); updateChildrenDOM(target.id);
                } else {
                    const idx = parent.children.findIndex(c => c.id === state.drag.targetId);
                    // 修复：Dock 兄弟节点继承方向
                    const sibling = findNode(state.data, state.drag.targetId);
                    newNode.dir = sibling.dir;
                    
                    parent.children.splice(state.drag.dropType === 'BEFORE' ? idx : idx + 1, 0, newNode);
                    recordHistory(); updateChildrenDOM(parent.id);
                }
                // 判断：没按 Ctrl 且有选中的 Dock 索引
                if (!e.ctrlKey && state.activeDockIndex !== -1) {
                    // 1. 找到对应的 DOM 元素
                    const cardToRemove = document.querySelector(`.dock-card[data-index="${state.activeDockIndex}"]`);
                    let delaytime=0;
                    if (cardToRemove) {
                        // 2. 【动画阶段】添加退出类，触发 CSS transition (变窄、变透明)
                        if (dockData.length > 1){
                            cardToRemove.classList.add('exiting');
                            delaytime=300;
                        }

                        // 3. 【延迟执行】等待 300ms 动画播放完毕
                        setTimeout(() => {
                            // --- A. 数据层操作 ---
                            dockData.splice(state.activeDockIndex, 1);
                            sessionStorage.setItem('DockData', JSON.stringify(dockData));

                            // --- B. 视图层操作 (关键修复) ---
                            // 动画播完了，物理移除 DOM 节点
                            cardToRemove.remove();

                            // --- C. 索引重置 (就是你提到的那个逻辑) ---
                            // 因为我们删了一个 DOM，后面的兄弟节点索引都乱了，必须手动修回来
                            // 这样做的好处是：不需要 renderDock()，不会重置滚动条位置！
                            const remainingCards = document.querySelectorAll('.dock-card');
                            remainingCards.forEach((card, i) => {
                                card.dataset.index = i; 
                            });

                            // --- D. 边界处理 ---
                            if (dockData.length === 0) {
                                document.getElementById('dock-container').style.display = 'none';
                            }
                            
                            // 重置状态
                            state.activeDockIndex = -1;
                        }, delaytime); 
                    } else {
                        // 容错处理
                        dockData.splice(state.activeDockIndex, 1);
                        sessionStorage.setItem('DockData', JSON.stringify(dockData));
                        renderDock();
                        state.activeDockIndex = -1;
                    }
                }
            }
        } else renderTree();
    }
    else if(state.mode==='SELECTING') {
        const b = $('#selRect').getBoundingClientRect();
        if(b.width>5) {
            document.querySelectorAll('.node-card').forEach(el=>{
                const r=el.getBoundingClientRect();
                if(!(r.right<b.left || r.left>b.right || r.bottom<b.top || r.top>b.bottom)) state.selectedIds.add(el.dataset.nodeId);
            });
            updateSelection();
        }
        $('#selRect').style.display='none';
    }
    else if(state.mode==='RESIZING') {
        const card = document.getElementById(`card-${state.resize.node.id}`);
        if(card) card.classList.remove('no-trans');
        state.resize.node=null;
        recordHistory();
        stabilizeRoot(); // <--- 【核心修改】在这里加上它！
    }
    else if(state.mode==='PANNING' && Math.hypot(e.clientX-state.startPos.x, e.clientY-state.startPos.y)<5) { state.selectedIds.clear(); updateSelection(); }

    state.mode = 'IDLE'; $('#ghostNode').style.display='none'; $('#insertLine').style.display='none'; 
    document.body.classList.remove('is-dragging'); // [新增] 移除抓取手势样式
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    document.querySelectorAll('.is-dragging-original').forEach(el => el.classList.remove('is-dragging-original'));
    updateTransform();
};

function syncCurrentInput() {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.classList.contains('node-topic')) {
        const card = activeEl.closest('.node-card');
        if(card) {
            const node = findNode(state.data, card.dataset.nodeId);
            if(node && node.topic !== activeEl.innerText) node.topic = activeEl.innerText;
        }
    }
};


// ==========================================
// #region 存储相关
// ==========================================
function saveGlobalScrolls() {
    document.querySelectorAll('.card-body').forEach(el => {
        const card = el.closest('.node-card');
        if(card) state.scrollMap.set(card.dataset.nodeId, el.scrollTop);
    });
};

function restoreGlobalScrolls() {
    const restore = () => {
        document.querySelectorAll('.card-body').forEach(el => {
            const card = el.closest('.node-card');
            if(card && state.scrollMap.has(card.dataset.nodeId)) {
                el.scrollTop = state.scrollMap.get(card.dataset.nodeId);
            }
        });
    };
    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 50);
};

function saveStorage() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveGlobalScrolls(); 
        const saveData={data:state.data,view:state.view,scrollMap: Object.fromEntries(state.scrollMap)}
        sessionStorage.setItem('MindMapData', JSON.stringify(saveData));
        console.log('MindMap 操作保存');
    }, 2000);
    const currentFileID = sessionStorage.getItem('currentFileID');
    if (currentFileID){
        clearTimeout(saveToCloudTimer);
        saveToCloudTimer = setTimeout(() => {
            saveMindMapData(true,false);
        },60*1000)
    }
    
};

function recordHistory() {
    if(isUndoRedo) return;
    const s = JSON.stringify(state.data);
    if(state.historyIndex === -1 || s !== state.history[state.historyIndex]) {
        if(state.historyIndex < state.history.length - 1) state.history.splice(state.historyIndex + 1);
        state.history.push(s); state.historyIndex++;
        if(state.history.length > 50) { state.history.shift(); state.historyIndex--; }
        saveStorage(); updateToolbar();
    }
};

function restoreHistory() {
    isUndoRedo = true; 
    const prevDataStr = state.history[state.historyIndex];
    const prevData = JSON.parse(prevDataStr);
    
    // --- 智能防抖优化 ---
    // 计算：如果当前结构和历史结构只有 "color" 属性不同，则不重建 DOM
    // 我们通过正则把 color 字段去掉后对比字符串来实现快速检查
    const currentStrNoColor = JSON.stringify(state.data).replace(/"color":".*?",/g, '');
    const prevStrNoColor = prevDataStr.replace(/"color":".*?",/g, '');

    const isStructureSame = currentStrNoColor === prevStrNoColor;

    // 更新数据
    state.data = prevData;
    state.selectedIds.clear(); 
    
    if (isStructureSame) {
        // 情况 A：仅颜色变化 -> 使用无损更新
        updateTreeStyle(); 
        updateSelection(); // 恢复选中框
    } else {
        // 情况 B：结构变化 (增删节点/改文字) -> 必须重建
        renderTree(); 
    }

    updateToolbar(); 
    saveStorage();
    setTimeout(() => isUndoRedo = false, 0);
};
function undo() { if(state.historyIndex > 0) { state.historyIndex--; restoreHistory(); } };
function redo() { if(state.historyIndex < state.history.length - 1) { state.historyIndex++; restoreHistory(); } };





function createNodeHTML(node, isLeft, inheritedColor = null) {
    const isSelected = state.selectedIds.has(node.id);
    const isRoot = node.id === state.data.id;
    const isSimple = !!node.isSimple && !isRoot;
    const isTopicEmpty = !node.topic || node.topic.trim() === ''; 
    
    // --- 颜色逻辑修复 ---
    // 优先级：彩虹模式(计算值) > 手动设置颜色 > 默认无色
    let displayColor = node.color; 
    if (state.rainbowMode) {
        if (isRoot) displayColor = ''; 
        else if (inheritedColor) displayColor = inheritedColor; 
    }

    const hasContent = !!node.content;
    const hasChildren = node.children && node.children.length > 0;
    // const cardClass = `node-card ${isSelected?'selected':''} ${hasContent?'has-content':''} ${isSimple?'simple':''} ${isLeft?'left-side':''} ${isRoot?'is-root':''}`;
    const cardClass = `node-card ${isSelected?'selected':''} ${hasContent?'has-content':''} ${isSimple?'simple':''} ${isLeft?'left-side':''} ${isRoot?'is-root':''} ${isTopicEmpty?'topic-empty':''}`;
    // --- 尺寸样式 ---
    let cardStyle = '';
    
    // 宽度
    if (!node.contentCollapsed && node.widthMode === 'manual' && node.width) {
        cardStyle += `width:${node.width}px; `;
    } else {
        cardStyle += `width:fit-content; `; // 标准模式自动宽度
    }

    // 高度
    let bodyHeightStyle = '';
    if (isSimple) {
        // 便利贴：高度在 Card 上
        if (node.heightMode === 'manual' && node.bodyHeight) {
            cardStyle += `height:${node.bodyHeight}px; `;
        } else {
            // 配合 CSS max-height: 400px;
            cardStyle += `height:auto; `;
        }
    } else {
        // 标准卡片：高度在 Body 上
        bodyHeightStyle = node.heightMode==='manual' && node.bodyHeight ? `height:${node.bodyHeight}px;` : 'height:auto;';
    }

    // --- 颜色样式应用 ---
    let headerStyle = '';
    let bodyBgStyle = '';
    const safeColor = displayColor || 'var(--node-default-color)';
    cardStyle += `--node-color: ${safeColor}; `
    if (displayColor) {
        // 取 90% 的卡片底色(通常是白) + 10% 的选中颜色进行混合
        // 兼容性：Chrome 111+ 支持，扩展环境没问题
        const mixRatio = isSimple ? '15%' : 'var(--bg-mix-ratio)';
        const lightBg = `color-mix(in srgb, ${displayColor}, var(--card-bg) ${mixRatio})`;

        if (isSimple) {
            // 【便利贴模式】
            // 背景变淡，边框变深(原色)，文字用默认色
            cardStyle += `background:${lightBg} !important; border-color:${displayColor}; color:var(--text-color);`; 
        } else {
            // 【标准卡片模式】
            // 1. 整个卡片背景变淡 (这样 Body 就有颜色了)
            cardStyle += `background-color:${lightBg}; border-color:${displayColor};`;
            
            // 2. 头部保持实色 (深色背景)，文字变白(或由CSS控制反色)
            headerStyle = `background:${displayColor} !important; border-bottom-color:rgba(0,0,0,0.1);`;
            
            // 3. 强制 Body 透明，以便显示出 Card 的淡色背景
            bodyBgStyle = 'background: transparent !important;';
        }
    }

    const bodyContent = (hasContent && !node.contentCollapsed) ? renderMarkdown(node.content) : '';
    const toggleIcon = isSimple ? 'ri-layout-top-2-line' : 'ri-sticky-note-line';
    const toggleTitle = isSimple ? '切换回标准卡片' : '切换为便利贴模式';

    let childrenHTML = '';
    if(hasChildren && !node.folded) {
        childrenHTML = `<div class="children-container ${isLeft?'left-side':''}" id="children-${node.id}">
            ${node.children.map(child => {
                let nextColor = null;
                if (state.rainbowMode) {
                     if (isRoot) {
                        const hue = getStableHue(child.id);
                        nextColor = `hsl(${hue}, 85%, 88%)`;
                    } else {
                        if (displayColor) nextColor = darkenHSL(displayColor, 5);
                    }
                }
                return `<div class="child-unit ${isLeft?'left-side':''}"><div class="child-cross-line"></div>${createNodeHTML(child, isLeft, nextColor)}</div>`;
            }).join('')}
        </div>`;
    }

    // 修复：确保左侧节点也有正确的 Resize 手柄 (左边 resize-l, 左下角 resize-bl)
    const resizeHandles = (!node.contentCollapsed || isSimple) ? (
        isLeft ? 
        `<div class="resize-handle resize-l" data-resize="w"></div><div class="resize-handle resize-b" data-resize="h"></div><div class="resize-handle resize-bl" data-resize="wh"></div>` :
        `<div class="resize-handle resize-r" data-resize="w"></div><div class="resize-handle resize-b" data-resize="h"></div><div class="resize-handle resize-br" data-resize="wh"></div>`
    ) : '';

    const foldBtn = (!isRoot && hasChildren) ? 
        `<div class="fold-btn ${!node.folded?'has-children':''} ${isLeft?'left-side':''}" data-action="fold"><i class="${node.folded?'ri-add-line':'ri-subtract-line'}"></i></div>` : '';

    const dataColorAttr = (state.rainbowMode && displayColor) ? `data-rainbow-color="${displayColor}"` : '';

    // 注意：便利贴模式下 header 必须包含内容以便显示和拖拽
    return `<div class="node-wrapper ${isLeft?'left-side':''}" id="wrapper-${node.id}">
        <div class="${cardClass}" style="${cardStyle}" data-node-id="${node.id}" id="card-${node.id}" ${dataColorAttr}>
            <div class="card-header" style="${headerStyle}">
                <div class="topic-wrapper">
                    ${hasContent &&  node.contentCollapsed ? '<i class="ri-file-list-2-line content-indicator"></i>' : ''}
                    <span class="node-topic" contenteditable="true">${escapeHtml(node.topic)}</span>
                </div>
                
                <div class="header-tools">
                    ${!isRoot ? `<i class="tool-icon ${toggleIcon}" data-action="toggle-simple" title="${toggleTitle}"></i>` : ''}
                    ${hasContent && !node.contentCollapsed && !isSimple ? `<i class="ri-aspect-ratio-line tool-icon" data-action="auto-height" title="自适应尺寸"></i>` : ''}
                    ${hasContent && !isSimple ? `<i class="tool-icon ${node.contentCollapsed?'ri-arrow-down-s-line':'ri-arrow-up-s-line'}" data-action="toggle-content"></i>` : ''}
                </div>
            </div>
            ${hasContent && !node.contentCollapsed && !isSimple ? `<div class="card-body md-content" style="${bodyHeightStyle} ${bodyBgStyle}">${bodyContent}</div>` : ''}
            ${resizeHandles}
            ${foldBtn}
        </div>
        ${childrenHTML}
    </div>`;
}
function renderTree() {
    saveGlobalScrolls();
    const root = state.data;
    const leftKids = (root.children || []).filter(c => c.dir === 'left');
    const rightKids = (root.children || []).filter(c => c.dir !== 'left');
    // 注意：我们需要获取所有子节点的总数来计算色相分布，或者简单地让左边和右边各自计算
    // 为了颜色统一，我们在 map 时重新计算正确的 index 或者传递颜色
    
    // 这里其实不需要改太多，因为 Root 调用 createNodeHTML 时，
    // 上面的新逻辑会在内部处理 children 的 map。
    // 但是！renderTree 这里是手动 map 了 leftKids 和 rightKids，
    // 这意味着我们跳过了 Root 内部的 createNodeHTML 里的 children 生成逻辑。
    // 所以我们需要在这里手动计算颜色！

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = createNodeHTML(root, false); // Root 没颜色
    const rootCardEl = tempDiv.querySelector('.node-card');
    
    // ... (中间 fold-btn 逻辑保持不变) ...
    if(leftKids.length > 0) {
        const btn = document.createElement('div');
        btn.className = `fold-btn root-left ${!root.foldedLeft?'has-children':''}`;
        btn.dataset.action = 'fold-root-left';
        btn.innerHTML = `<i class="${root.foldedLeft?'ri-add-line':'ri-subtract-line'}"></i>`;
        rootCardEl.appendChild(btn);
    }
    if(rightKids.length > 0) {
        const btn = document.createElement('div');
        btn.className = `fold-btn root-right ${!root.foldedRight?'has-children':''}`;
        btn.dataset.action = 'fold-root-right';
        btn.innerHTML = `<i class="${root.foldedRight?'ri-add-line':'ri-subtract-line'}"></i>`;
        rootCardEl.appendChild(btn);
    }
    const rootCard = rootCardEl.outerHTML;

    const leftHTML = (leftKids.length > 0 && !root.foldedLeft) ? 
        `<div class="children-container left-side">${leftKids.map(c => {
            // ▼▼▼ 修改：直接根据 ID 获取固定颜色 ▼▼▼
            const hue = state.rainbowMode ? getStableHue(c.id) : 0;
            const color = state.rainbowMode ? `hsl(${hue}, 85%, 88%)` : null;
            
            return `<div class="child-unit left-side"><div class="child-cross-line"></div>${createNodeHTML(c, true, color)}</div>`;
        }).join('')}</div>` : '';
    
    const rightHTML = (rightKids.length > 0 && !root.foldedRight) ? 
        `<div class="children-container">${rightKids.map(c => {
            // ▼▼▼ 修改：直接根据 ID 获取固定颜色 ▼▼▼
            const hue = state.rainbowMode ? getStableHue(c.id) : 0;
            const color = state.rainbowMode ? `hsl(${hue}, 85%, 88%)` : null;

            return `<div class="child-unit"><div class="child-cross-line"></div>${createNodeHTML(c, false, color)}</div>`;
        }).join('')}</div>` : '';

    $('#tree-root').innerHTML = `<div class="root-wrapper" style="display:flex; align-items:center;">${leftHTML}${rootCard}${rightHTML}</div>`;
    // --- 新增：初始化内容指纹，防止首次操作抖动 ---
    document.querySelectorAll('.node-card').forEach(el => {
        const n = findNode(state.data, el.dataset.nodeId);
        if(n) el.dataset.contentHash = n.content || '';
    });
    // ... (后续 stabilizeRoot 等保持不变) ...
    stabilizeRoot();
    $('#tree-root').querySelectorAll('.card-body').forEach(processRichContent);
    restoreGlobalScrolls();
    updateTransform(); 
    if (window.rootObserver) {
        window.rootObserver.disconnect();
    }

    // 2. 创建新的监听器
    // 只要根节点的 DOM 尺寸发生任何自然变化（字体加载、图片加载），就自动归位
    window.rootObserver = new ResizeObserver(entries => {
        // 使用 requestAnimationFrame 避免 "ResizeObserver loop limit exceeded" 错误
        requestAnimationFrame(() => {
            stabilizeRoot();
        });
    });

    // 3. 开始监听根节点包装器
    const rootWrapper = document.querySelector('.root-wrapper');
    if (rootWrapper) {
        window.rootObserver.observe(rootWrapper);
    }
    
    updateToolbar();
};

function isDescendantOfLeft(id) {
    let curr = findNode(state.data, id);
    while(curr) {
        const p = findParent(state.data, curr.id);
        if(!p) return false; 
        if(p.id === state.data.id) return curr.dir === 'left';
        curr = p;
    }
    return false;
};

function updateChildrenDOM(nodeId) {
    if(nodeId === state.data.id) { renderTree(); return; }

    saveGlobalScrolls();
    const node = findNode(state.data, nodeId);
    const wrapper = document.getElementById(`wrapper-${nodeId}`);
    const isLeft = isDescendantOfLeft(nodeId);
    
    if(!wrapper) { renderTree(); return; }

    // --- ▼▼▼ 修正：从 data 属性读取 HSL 颜色 ▼▼▼ ---
    let childBaseColor = null;
    if (state.rainbowMode) {
        const parentCard = document.getElementById(`card-${nodeId}`);
        if (parentCard && parentCard.dataset.rainbowColor) {
            // 读取父级的 HSL
            const parentHsl = parentCard.dataset.rainbowColor;
            // 关键：因为是传给子节点，所以要先降低一次亮度！
            childBaseColor = darkenHSL(parentHsl, 5);
        }
    }
    // ----------------------------------------------

    const oldCont = wrapper.querySelector('.children-container');
    if(oldCont) oldCont.remove();

    const card = document.getElementById(`card-${nodeId}`);
    let foldBtn = card.querySelector('.fold-btn');
    
    if(node.children && node.children.length > 0) {
        if(!foldBtn) {
            foldBtn = document.createElement('div');
            foldBtn.className = `fold-btn ${!node.folded?'has-children':''} ${isLeft?'left-side':''}`;
            foldBtn.dataset.action = 'fold';
            foldBtn.innerHTML = `<i class="${node.folded?'ri-add-line':'ri-subtract-line'}"></i>`;
            card.appendChild(foldBtn);
        } else {
            foldBtn.className = `fold-btn ${!node.folded?'has-children':''} ${isLeft?'left-side':''}`;
            foldBtn.innerHTML = `<i class="${node.folded?'ri-add-line':'ri-subtract-line'}"></i>`;
        }
        if(!node.folded) {
            const childrenHTML = `<div class="children-container ${isLeft?'left-side':''}" id="children-${node.id}">
                ${node.children.map(child => `
                    <div class="child-unit ${isLeft?'left-side':''}">
                        <div class="child-cross-line"></div>
                        ${createNodeHTML(child, isLeft, childBaseColor)} 
                    </div>
                `).join('')}
            </div>`;
            
            wrapper.insertAdjacentHTML('beforeend', childrenHTML);
            const newCont = wrapper.querySelector('.children-container');
            newCont.querySelectorAll('.card-body').forEach(processRichContent);
        }
    } else if(foldBtn) { foldBtn.remove(); }
    
    stabilizeRoot();
    restoreGlobalScrolls();
};

function updateNodeDOM(nodeId) {
    if(nodeId === state.data.id) { renderTree(); return; }
    
    saveGlobalScrolls();
    const node = findNode(state.data, nodeId);
    const card = document.getElementById(`card-${nodeId}`); 
    if(!node || !card) return;
    
    // 1. 生成新虚拟节点
    let selfColor = null;
    if (state.rainbowMode && card.dataset.rainbowColor) {
        selfColor = card.dataset.rainbowColor;
    }
    const isLeft = isDescendantOfLeft(node.id);
    const temp = document.createElement('div');
    temp.innerHTML = createNodeHTML(node, isLeft, selfColor); 
    const newCard = temp.querySelector('.node-card'); 

    // 2. 检查结构变化
    const oldSimple = card.classList.contains('simple');
    const newSimple = newCard.classList.contains('simple');
    const oldHasBody = !!card.querySelector('.card-body');
    const newHasBody = !!newCard.querySelector('.card-body');

    if (oldSimple !== newSimple || oldHasBody !== newHasBody) {
         // 结构大变，直接替换 DOM
         const parent = card.parentElement;
         const childrenCont = parent.querySelector('.children-container');
         parent.replaceChild(newCard, card);
         if(childrenCont) parent.appendChild(childrenCont); 
         newCard.querySelectorAll('.card-body').forEach(processRichContent);
         
         const finalCard = document.getElementById(`card-${nodeId}`);
         if(finalCard) finalCard.dataset.contentHash = node.content || '';
    } 
    else {
         // --- 仅样式同步 (修复颜色更新) ---
         
         // A. 同步容器属性 (包含便利贴的 background)
         card.className = newCard.className;
         card.style.cssText = newCard.style.cssText; // 这里会同步 background: color !important
         if(newCard.dataset.rainbowColor) card.dataset.rainbowColor = newCard.dataset.rainbowColor;

         // B. 同步头部样式 (包含标准卡片的 background)
         const oldHeader = card.querySelector('.card-header');
         const newHeader = newCard.querySelector('.card-header');
         if (oldHeader && newHeader) {
             // 关键：同步 style.cssText 会把 headerStyle (背景色) 拷过去
             oldHeader.style.cssText = newHeader.style.cssText;
             oldHeader.className = newHeader.className;
             
            //  if (oldHeader.innerHTML !== newHeader.innerHTML) {
            //      const oldTopic = oldHeader.querySelector('.node-topic').innerText;
            //      if (oldTopic !== node.topic) {
            //         oldHeader.querySelector('.node-topic').innerText = node.topic;
            //      }
            //  }
             // 核心修复：如果 HTML 结构不一致（意味着可能有脏 DOM 标签），且当前没有在该节点打字，
             // 则强制用“干净”的 HTML 替换整个 Header 内容。
            if (oldHeader.innerHTML !== newHeader.innerHTML) {
                // 检查当前焦点是否在当前卡片内 (防止打字时被强制替换导致断触)
                const isActive = document.activeElement && document.activeElement.closest('.node-card') === card;
                
                if (!isActive) {
                    // 没在编辑：直接替换整个 innerHTML，清洗掉 contenteditable 产生的 <br> 和 <div>
                    oldHeader.innerHTML = newHeader.innerHTML;
                } else {
                    // 正在编辑：退回旧逻辑，只更新文本，保留光标位置
                    const oldTopic = oldHeader.querySelector('.node-topic').innerText;
                    if (oldTopic !== node.topic) {
                    oldHeader.querySelector('.node-topic').innerText = node.topic;
                    }
                }
            }
         }

         // C. 同步 Body 内容
         if (newHasBody) { 
             const oldBody = card.querySelector('.card-body');
             const newBody = newCard.querySelector('.card-body');
             const lastContent = card.dataset.contentHash; 
             
             if (lastContent !== node.content) {
                 oldBody.innerHTML = newBody.innerHTML;
                 oldBody.style.cssText = newBody.style.cssText;
                 processRichContent(oldBody);
                 card.dataset.contentHash = node.content || '';
             } else {
                 oldBody.style.cssText = newBody.style.cssText;
             }
         }
    }
    const finalCard = document.getElementById(`card-${nodeId}`);
    if (finalCard) {
        // 获取最新的节点数据
        const finalNode = findNode(state.data, nodeId);
        if (finalNode) {
            if (!finalNode.topic || finalNode.topic.trim() === '') {
                finalCard.classList.add('topic-empty');
            } else {
                finalCard.classList.remove('topic-empty');
            }
        }
    }
    stabilizeRoot();
    restoreGlobalScrolls();
}
// 修复：暴力清除高亮后重新添加，防止高亮卡死
function updateSelection() {
    document.querySelectorAll('.node-card.selected').forEach(el => el.classList.remove('selected'));
    state.selectedIds.forEach(id => {
        const el = document.querySelector(`.node-card[data-node-id="${id}"]`);
        if(el) el.classList.add('selected');
    });
    updateToolbar();
};

function renderDock() {
    // const container = $('#dock-container');
    const container = document.getElementById('dock-container');
    if (dockData.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    $('#dock-body').innerHTML = ''; // 清空旧内容
    $('#dock-body').innerHTML = dockData.map((item, idx) => `
        <div class="dock-card ${state.activeDockIndex===idx?'active':''}" data-index="${idx}">
            <div class="dock-title">${escapeHtml(item.question)}</div>
            <div class="dock-desc md-content">${renderMarkdown(item.answer)}</div>
        </div>
    `).join('');
    $('#dock-body').querySelectorAll('.dock-desc').forEach(processRichContent);
    const arrow = $('#dock-arrow');
    if (state.dockCollapsed) { container.classList.add('collapsed'); arrow.className = 'ri-arrow-up-s-line'; }
    else { container.classList.remove('collapsed'); arrow.className = 'ri-arrow-down-s-line'; }
};

function updateTransform() {
    $('#canvas-layer').style.transform = `translate(${state.view.tx}px, ${state.view.ty}px) scale(${state.view.scale})`;
    $('#app').className = state.mode==='PANNING'?'cursor-grabbing':(state.mode==='SELECTING'?'cursor-crosshair':'cursor-grab');
};

function updateToolbar() {
    const hasSel = state.selectedIds.size > 0;
    $('#btn-add-child').disabled = !hasSel; $('#btn-add-sibling').disabled = !hasSel; $('#btn-delete').disabled = !hasSel;
    $('#btn-undo').disabled = state.historyIndex <= 0; $('#btn-redo').disabled = state.historyIndex >= state.history.length - 1;
    $('#btn-color').disabled = !hasSel;
    $('#btn-color').disabled = !hasSel || state.rainbowMode; 
};

function findNode(r,id) {
    if(r.id===id)return r;
    if(r.children)for(let c of r.children){const res=findNode(c,id);if(res)return res}
    return null;
};
function findParent(r,id) {
    if(!r.children)return null;
    for(let c of r.children){
        if(c.id===id)return r;
        const res=findParent(c,id);
        if(res)return res;
    }
    return null;
};
function isDescendant(r,nid,tid) {
    const n=findNode(r,nid);
    if(!n)return false;
    const chk=nd=>{
        if(!nd.children)return false;
        for(let c of nd.children){
            if(c.id===tid)return true;
            if(chk(c))return true;
        }
        return false;
    };
    return chk(n);
};
function deepCopyNode(node) {
    const newNode = JSON.parse(JSON.stringify(node));
    const map = (n) => { n.id = generateNodeId(); if(n.children) n.children.forEach(map); };
    map(newNode); return newNode;
};

// ---防止 XSS 和 HTML 渲染的转义函数---
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- 核心修复：强制钉死根节点位置 ---
function stabilizeRoot() {
    const treeRoot = document.getElementById('tree-root');
    if (!treeRoot) return;
    
    // 找到根节点卡片
    const rootCard = treeRoot.querySelector('.node-card.is-root');
    if (!rootCard) return;
    
    // 计算根节点中心点相对于容器左上角的距离
    const cx = rootCard.offsetLeft + rootCard.offsetWidth / 2;
    const cy = rootCard.offsetTop + rootCard.offsetHeight / 2;
    
    // 既然根节点被 Flexbox 挤到了 (cx, cy)，我们就把容器反向平移 (-cx, -cy)
    // 这样根节点的中心就永远对准了 Canvas 的 (0,0) 点
    treeRoot.style.transform = `translate(-${cx}px, -${cy}px)`;
}
// --- 颜色处理辅助函数：降低 HSL 亮度 ---
function darkenHSL(hslStr, amount) {
    if (!hslStr || !hslStr.startsWith('hsl')) return hslStr;
    // 正则匹配 hsl(h, s%, l%) 中的 l
    return hslStr.replace(/,\s*(\d+)%\)/, (match, l) => {
        // 每次降低 amount% 的亮度，最低不低于 25%（防止变成全黑看不清字）
        const newL = Math.max(25, parseInt(l) - amount);
        return `, ${newL}%)`;
    });
}
// --- 颜色处理辅助函数：根据字符串生成固定色相 ---
// --- 颜色处理辅助函数：根据字符串生成固定且差异明显的色相 ---
function getStableHue(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // 关键修复：不再返回 0-360 的连续值，而是映射到手动挑选的“高辨识度色盘”
    // 这些色相是经过挑选的，彼此之间视觉差异最大化
    const distinctHues = [
        0,   // 正红
        30,  // 鲜橙
        50,  // 金黄 (避开难看的柠檬黄)
        80,  // 嫩绿
        120, // 正绿
        160, // 青绿
        190, // 亮青
        220, // 天蓝
        260, // 正蓝
        290, // 蓝紫
        320, // 洋红
        340  // 玫红
    ];

    // 取绝对值
    hash = Math.abs(hash);
    
    // 取余数，映射到数组下标
    return distinctHues[hash % distinctHues.length];
}
function centerTarget(el) {
    // 1. 获取目标元素
    console.log("尝试居中元素：", el);
    if (!el) { console.log("未找到目标元素"); return; }

    // 1. 获取尺寸
    const rect = el.getBoundingClientRect();
    const elCX = rect.left + rect.width / 2;
    const elCY = rect.top + rect.height / 2;

    // 2. 计算目标位置（屏幕中心，Y轴稍微偏上 15% 以避开Dock）
    const winCX = window.innerWidth / 2;
    const winCY = window.innerHeight * 0.40; 

    // 3. 计算位移差
    const diffX = winCX - elCX;
    const diffY = winCY - elCY;

    // 4. 更新坐标（强制取整，防止小数导致渲染模糊）
    state.view.tx = Math.round(state.view.tx + diffX);
    state.view.ty = Math.round(state.view.ty + diffY);

    // 5. 应用平滑过渡
    const canvas = document.getElementById('canvas-layer');
    canvas.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
    updateTransform();
    
    // 6. 动画结束后移除 transition，避免拖拽延迟
    setTimeout(() => {
        canvas.style.transition = '';
        if (typeof saveStorage === 'function') saveStorage();
    }, 320);
}


// ==========================================
// #region 新增：无损样式更新 (防止抖动)
// ==========================================
function updateTreeStyle(node = state.data, parentIsRoot = true, inheritedColor = null) {
    const isRoot = node.id === state.data.id;
    
    // --- 1. 计算当前节点应该显示的颜色 ---
    let displayColor = node.color; 

    if (state.rainbowMode) {
        if (isRoot) {
            displayColor = null; 
        } else if (inheritedColor) {
            displayColor = inheritedColor; 
        }
    }

    // --- 2. 找到 DOM 并应用样式 ---
    const card = document.getElementById(`card-${node.id}`);
    if (card) {
        if(displayColor) card.dataset.rainbowColor = displayColor;
        else delete card.dataset.rainbowColor;

        // 【核心修改】：计算淡色背景
        let lightBg = '';
        if (displayColor) {
            const mixRatio = node.isSimple ? '15%' : 'var(--bg-mix-ratio)';
            lightBg = `color-mix(in srgb, ${displayColor}, var(--card-bg) ${mixRatio})`;
        }

        if (node.isSimple) {
            // --- 便利贴模式 ---
            // 背景设为淡色，边框设为原色
            card.style.background = lightBg || ''; 
            card.style.borderColor = displayColor || '';
            
            // 确保文字颜色适配（可选）
            if(displayColor) card.style.color = 'var(--text-color)'; 
        } else {
            // --- 标准模式 ---
            // 1. 卡片外壳背景设为淡色 (这样Body透出来的就是淡色)
            card.style.backgroundColor = lightBg || '';
            card.style.borderColor = displayColor || '';

            // 2. 头部保持实色深色
            const header = card.querySelector('.card-header');
            if (header) {
                header.style.background = displayColor || '';
                header.style.borderBottomColor = displayColor ? 'rgba(0,0,0,0.1)' : '';
            }

            // 3. 【关键】强制 Body 透明，否则它会挡住卡片的淡色背景
            const body = card.querySelector('.card-body');
            if (body) {
                // 如果有颜色，Body 必须透明；没颜色则恢复默认(可能由CSS控制)
                body.style.background = displayColor ? 'transparent' : '';
            }
        }
    }

    // --- 3. 递归处理子节点 ---
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
            let nextColor = null;
            if (state.rainbowMode) {
                if (isRoot) {
                    const hue = getStableHue(child.id);
                    nextColor = `hsl(${hue}, 85%, 88%)`;
                } else {
                    if (displayColor) {
                        nextColor = darkenHSL(displayColor, 5);
                    }
                }
            }
            updateTreeStyle(child, false, nextColor);
        });
    }
}


// ==========================================
// #region 剪贴板功能 (复制/粘贴)
// ==========================================
const CUSTOM_MIME_TYPE = 'web text/x-mindmap-data';
const CLIPBOARD_SIGN = "MindMap_Node_Data_v1";

/**
 * 递归重生成节点 ID (用于粘贴时防止 ID 冲突)
 */
function renewNodeIds(node) {
    node.id = generateNodeId();
    // 重置一些状态
    node.folded = false; // 粘贴进来的节点默认展开
    // 确保样式模式兼容
    if (!node.widthMode) node.widthMode = 'auto';
    if (!node.heightMode) node.heightMode = 'auto';
    
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => renewNodeIds(child));
    }
    return node;
}

/* MindMap.js 底部 */

/**
 * 执行复制逻辑 (精准重组版 - 支持静默模式)
 * @param {boolean} showToast - 是否显示提示 (默认为 true)
 * @returns {Promise<boolean>} - 返回是否复制成功
 */
async function copySelectedNodes(showToast = true) {
    if (state.selectedIds.size === 0) return false;

    // 1. 建立映射表与克隆 (精准快照)
    const selectedMap = new Map();
    state.selectedIds.forEach(id => {
        const originalNode = findNode(state.data, id);
        if (originalNode) {
            const clone = deepCopyNode(originalNode);
            clone.children = []; // 清空孩子，稍后根据选中状态重组
            selectedMap.set(id, clone);
        }
    });

    const roots = [];

    // 2. 重新构建关系 (认祖归宗)
    selectedMap.forEach((clone, id) => {
        const originalParent = findParent(state.data, id);
        if (originalParent && selectedMap.has(originalParent.id)) {
            // 父亲也被选中了，加入父亲的孩子列表
            const parentClone = selectedMap.get(originalParent.id);
            parentClone.children.push(clone);
        } else {
            // 父亲没被选中，我是顶层
            roots.push(clone);
        }
    });

    if (roots.length === 0) return false;

    // 3. 写入剪贴板
    const clipboardDataObj = {
        signature: CLIPBOARD_SIGN,
        nodes: roots
    };

    const jsonString = JSON.stringify(clipboardDataObj);

    // --- 3. 写入剪贴板 (使用 ClipboardItem) ---
    try {
        // 创建私有数据 Blob
        const customBlob = new Blob([jsonString], { type: CUSTOM_MIME_TYPE });
        
        // 创建普通文本 Blob (作为掩护)
        // 用户在记事本粘贴时，只会看到这个字符串，而不是一大坨 JSON
        const plainTextBlob = new Blob([`[MindMap Nodes: ${roots.length} items]`], { type: 'text/plain' });

        // 构造 ClipboardItem
        // 注意：键名必须包含定义的 MIME Type
        const item = new ClipboardItem({
            [CUSTOM_MIME_TYPE]: customBlob,
            'text/plain': plainTextBlob 
        });

        await navigator.clipboard.write([item]);

        if (showToast) {
            showTopToast(`📝 已复制 ${selectedMap.size} 个节点`);
        }
        return true;
    } catch (err) {
        console.log('私有格式复制失败，尝试回退到普通文本模式:', err);
        // 兼容性降级：如果浏览器不支持自定义 MIME，回退到以前的明文 JSON 方式
        try {
            await navigator.clipboard.writeText(jsonString);
            if (showToast) showTopToast(`📝 已复制 ${selectedMap.size} 个节点`);
            return true;
        } catch (e2) {
            if (showToast) showTopToast('❌ 复制失败');
            return false;
        }
    }
}

/**
 * 执行剪切逻辑 (复制 + 删除)
 */
async function cutSelectedNodes() {
    if (state.selectedIds.size === 0) return;

    // 1. 先执行复制 (开启静默模式，不弹窗)
    const copySuccess = await copySelectedNodes(false);

    // 2. 如果复制成功，则执行删除
    if (copySuccess) {
        // 直接调用工具栏已有的删除按钮逻辑，复用其 robust 的删除算法
        // 注意：删除按钮的逻辑会处理 state.selectedIds 并记录历史
        const deleteBtn = document.getElementById('btn-delete');
        if (deleteBtn) {
            deleteBtn.click();
            showTopToast('✂️ 已剪切节点');
        }
    }
}

/* MindMap.js */

/**
 * 执行粘贴逻辑 (修复版：正确统计粘贴总数)
 */
async function pasteNodesToSelection() {
    // 1. 确定粘贴目标
    let targetId = state.data.id;
    if (state.selectedIds.size === 1) {
        targetId = Array.from(state.selectedIds)[0];
    } else if (state.selectedIds.size > 1) {
        showTopToast('⚠️ 请只选中一个节点作为粘贴目标');
        return;
    }

    const targetNode = findNode(state.data, targetId);
    if (!targetNode) return;

    let nodesToPaste = [];
    let isMindMapData = false;

    try {
        // --- 2. 尝试读取剪贴板 (优先尝试私有格式) ---
        // (保持原有的读取逻辑不变)
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                if (item.types.includes(CUSTOM_MIME_TYPE)) {
                    const blob = await item.getType(CUSTOM_MIME_TYPE);
                    const text = await blob.text();
                    const json = JSON.parse(text);
                    if (json && json.signature === CLIPBOARD_SIGN && Array.isArray(json.nodes)) {
                        nodesToPaste = json.nodes;
                        isMindMapData = true;
                        break;
                    }
                }
            }
        } catch(e) { /* 读取失败或不支持，忽略 */ }

        // 回退到纯文本读取
        if (!isMindMapData) {
            const text = await navigator.clipboard.readText();
            if (text) {
                try {
                    const json = JSON.parse(text);
                    if (json && json.signature === CLIPBOARD_SIGN && Array.isArray(json.nodes)) {
                        nodesToPaste = json.nodes;
                        isMindMapData = true;
                    }
                } catch (e) {
                    // 普通文本处理
                    if (!text.startsWith('[MindMap Nodes:')) {
                        nodesToPaste = [{
                            id: generateNodeId(),
                            topic: text.length > 20 ? text.substring(0, 20) + '...' : text,
                            content: text,
                            widthMode: 'auto',
                            heightMode: 'auto'
                        }];
                    } else {
                        showTopToast('⚠️ 无法识别节点数据');
                        return;
                    }
                }
            }
        }

        // --- 3. 执行粘贴 ---
        if (nodesToPaste.length > 0) {
            if (!targetNode.children) targetNode.children = [];
            const isRoot = targetNode.id === state.data.id;

            // ▼▼▼ 新增：递归计算节点总数 ▼▼▼
            let totalCount = 0;
            const countNodes = (list) => {
                if (!list) return;
                list.forEach(node => {
                    totalCount++; // 自己算一个
                    if (node.children && node.children.length > 0) {
                        countNodes(node.children); // 递归算孩子
                    }
                });
            };
            countNodes(nodesToPaste);
            // ▲▲▲ 新增结束 ▲▲▲

            nodesToPaste.forEach(node => {
                const newNode = renewNodeIds(node); // 重生成 ID
                if (isRoot) newNode.dir = 'right';
                else delete newNode.dir;
                targetNode.children.push(newNode);
            });

            targetNode.folded = false;
            recordHistory();
            updateChildrenDOM(targetNode.id);
            
            // 选中新粘贴的顶层节点 (保持界面整洁，只高亮顶层即可)
            state.selectedIds.clear();
            nodesToPaste.forEach(n => state.selectedIds.add(n.id));
            updateSelection();
            
            // 使用计算出的总数进行提示
            showTopToast(`📋 已粘贴 ${totalCount} 个节点`);
        }

    } catch (err) {
        console.log('粘贴过程出错:', err);
        // showTopToast('❌ 无法读取剪贴板');
    }
}





// ==========================================
// #region 图片上传功能 (ImgBB)
// ==========================================

function initializeImageUpload() {
    const textarea = document.getElementById('editorTextarea');
    const settingsBtn = document.getElementById('btn-img-settings');
    // 定义存储的 Key
    const STORAGE_KEY = 'MindMap_ImgBB_Key';

    // 1. 设置按钮点击事件
    if (settingsBtn) {
        settingsBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            let currentKey = '';
            try {
                // [修改] 从 chrome.storage.local 读取
                const result = await chrome.storage.local.get([STORAGE_KEY]);
                currentKey = result[STORAGE_KEY] || '';
            } catch (err) {
                console.log('读取 API Key 失败', err);
            }

            const newKey = prompt('请输入 ImgBB API Key:\n(申请地址: https://api.imgbb.com/)', currentKey);
            
            if (newKey !== null) {
                // [修改] 写入 chrome.storage.local
                await chrome.storage.local.set({ [STORAGE_KEY]: newKey.trim() });
                showTopToast('✅ API Key 已保存');
            }
        };
    }

    // 2. 监听粘贴事件
    textarea.addEventListener('paste', async (e) => {
        // 获取剪贴板中的条目
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let imageFile = null;

        // 查找图片文件
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                imageFile = item.getAsFile();
                break;
            }
        }

        // 如果没有图片，允许默认行为（粘贴文本）
        if (!imageFile) return;

        // 阻止默认粘贴行为
        e.preventDefault();

        // [修改] 从 chrome.storage.local 读取 API Key
        // 注意：因为外层函数已经是 async (e)，这里直接 await 即可
        let apiKey = '';
        try {
            const result = await chrome.storage.local.get([STORAGE_KEY]);
            apiKey = result[STORAGE_KEY];
        } catch (err) {
            console.log('存储读取错误', err);
        }

        if (!apiKey) {
            alert('请先点击工具栏的【图片设置】按钮配置 ImgBB API Key 才能上传图片。');
            return;
        }

        // 3. 插入占位符
        const uniqueId = Date.now(); 
        const placeholder = `![⏳ 图片上传中...-${uniqueId}]()`;
        
        insertTextToEditor(textarea, placeholder);

        try {
            // 4. 执行上传 (逻辑不变)
            const imageUrl = await uploadToImgBB(imageFile, apiKey);
            
            // 5. 上传成功：替换占位符
            const finalMarkdown = `![image](${imageUrl})`;
            replaceTextInEditor(textarea, placeholder, finalMarkdown);
            
            showTopToast('✅ 图片上传成功');

        } catch (err) {
            console.log(err);
            // 6. 上传失败
            const errorText = `[❌ 图片上传失败: ${err.message}]`;
            replaceTextInEditor(textarea, placeholder, errorText);
            alert('图片上传失败: ' + err.message);
        }
    });
}
/**
 * 上传图片到 ImgBB
 */
async function uploadToImgBB(file, apiKey) {
    const formData = new FormData();
    formData.append('key', apiKey);
    formData.append('image', file);

    const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
        throw new Error(json.error ? json.error.message : '网络请求错误');
    }

    return json.data.url;
}

/**
 * 辅助：在光标处插入文本 (兼容撤销/重做)
 */
function insertTextToEditor(textarea, text) {
    if (document.execCommand) {
        // 使用 execCommand 支持浏览器原生撤销
        textarea.focus();
        document.execCommand('insertText', false, text);
    } else {
        // 降级方案
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        textarea.value = val.substring(0, start) + text + val.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }
    // 触发 input 事件以更新预览
    textarea.dispatchEvent(new Event('input')); 
}

/**
 * 辅助：全局替换文本 (用于异步回调后的替换)
 */
function replaceTextInEditor(textarea, originalText, newText) {
    // 由于是异步回调，光标可能已经移动，所以这里采用简单的全文替换策略
    // 只要 uniqueId 足够唯一，就不会误伤
    const val = textarea.value;
    if (val.includes(originalText)) {
        // 保存当前滚动位置
        const scrollTop = textarea.scrollTop;
        const selectionStart = textarea.selectionStart;
        
        // 替换
        textarea.value = val.replace(originalText, newText);
        
        // 恢复状态
        textarea.scrollTop = scrollTop;
        // 如果光标在替换区域之后，需要调整光标位置 (可选优化，简单起见可忽略)
        
        // 触发 input 事件以更新预览
        textarea.dispatchEvent(new Event('input'));
        
        // 如果正在同步预览，强制刷新一次
        if(typeof processRichContent === 'function') {
            const preview = document.getElementById('previewContent');
            if(preview) {
                preview.innerHTML = renderMarkdown(textarea.value);
                processRichContent(preview);
            }
        }
    }
}





// =============================================================================
// #region 新增：原生文字拖拽支持 (已增强：支持兄弟节点插入)
// =============================================================================
function initializeNativeDragDrop() {
    const app = document.getElementById('app');
    const insertLine = document.getElementById('insertLine'); // 复用现有的插入线元素

    // 1. 拖拽进入/悬停 (视觉反馈：高亮或显示插入线)
    app.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        
        const card = e.target.closest('.node-card');
        if (!card) {
            // 如果不在卡片上，清除所有状态
            document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
            if(insertLine) insertLine.style.display = 'none';
            return;
        }

        // 根节点只能作为父节点添加子节点，不支持兄弟插入
        const isRoot = card.dataset.nodeId === state.data.id;
        const rect = card.getBoundingClientRect();
        const ry = e.clientY - rect.top; // 鼠标在卡片内的 Y 坐标

        // 清除旧状态
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        if(insertLine) insertLine.style.display = 'none';

        // 设置拖拽效果
        e.dataTransfer.dropEffect = 'copy';

        // 判定逻辑
        if (!isRoot && ry < rect.height * 0.25) {
            // --- 上方区域：插入上方兄弟 ---
            insertLine.style.display = 'block';
            insertLine.style.left = rect.left + 'px';
            insertLine.style.top = (rect.top - 4) + 'px';
            insertLine.style.width = rect.width + 'px';
            card.dataset.dragState = 'BEFORE'; // 临时标记状态
        } 
        else if (!isRoot && ry > rect.height * 0.75) {
            // --- 下方区域：插入下方兄弟 ---
            insertLine.style.display = 'block';
            insertLine.style.left = rect.left + 'px';
            insertLine.style.top = (rect.bottom + 2) + 'px';
            insertLine.style.width = rect.width + 'px';
            card.dataset.dragState = 'AFTER';
        } 
        else {
            // --- 中间区域 或 根节点：添加子节点 ---
            card.classList.add('drop-target');
            card.dataset.dragState = 'CHILD';
        }
    });

    // 2. 拖拽离开 (清除样式)
    app.addEventListener('dragleave', (e) => {
        const card = e.target.closest('.node-card');
        // 只有当真正离开这个元素时才移除 (避免子元素触发)
        if (card && !card.contains(e.relatedTarget)) {
            card.classList.remove('drop-target');
            delete card.dataset.dragState;
        }
        // 如果离开了整个 app 区域，隐藏线
        if (e.target.id === 'app') {
            if(insertLine) insertLine.style.display = 'none';
        }
    });

    // 3. 放置 (核心逻辑)
    app.addEventListener('drop', (e) => {
        e.preventDefault();
        
        // 清除所有高亮和辅助线
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        if(insertLine) insertLine.style.display = 'none';

        const card = e.target.closest('.node-card');
        if (!card) return;

        // 获取拖拽的纯文本数据
        const text = e.dataTransfer.getData('text/plain');
        if (!text || !text.trim()) return;

        // 获取放置类型 (依赖 dragover 时计算的状态，或者重新计算)
        // 为了稳健性，这里建议重新计算一次，防止 dragover 状态未及时更新
        const isRoot = card.dataset.nodeId === state.data.id;
        const rect = card.getBoundingClientRect();
        const ry = e.clientY - rect.top;
        
        let dropType = 'CHILD';
        if (!isRoot) {
            if (ry < rect.height * 0.25) dropType = 'BEFORE';
            else if (ry > rect.height * 0.75) dropType = 'AFTER';
        }

        const targetId = card.dataset.nodeId;
        const targetNode = findNode(state.data, targetId);
        
        if (targetNode) {
            // 构造新节点
            const [header, body] = extractMarkdownHeader(text);
            const newNode = {
                id: generateNodeId(),
                topic: header,
                content: body,
                isSimple: false,
                heightMode: 'auto',
                widthMode: 'auto',
                width: 360,
                children: []
            };

            // --- 分支 A: 添加子节点 ---
            if (dropType === 'CHILD') {
                // 处理根节点的方向逻辑
                if (targetId === state.data.id) {
                    const rRect = card.getBoundingClientRect();
                    newNode.dir = (e.clientX < rRect.left + rRect.width / 2) ? 'left' : 'right';
                } else {
                    // 如果不是根节点，且有方向属性（比如在 Dock 或其他特定逻辑下），可以继承
                    // 这里通常不需要处理，因为子节点方向由布局算法自动处理
                    delete newNode.dir;
                }

                if (!targetNode.children) targetNode.children = [];
                targetNode.children.push(newNode);
                targetNode.folded = false; 
                
                recordHistory();
                updateChildrenDOM(targetId);
            } 
            // --- 分支 B: 添加兄弟节点 ---
            else {
                const parent = findParent(state.data, targetId);
                if (parent) {
                    // 1. 继承方向 (重要：保持在同一侧)
                    newNode.dir = targetNode.dir;

                    // 2. 找到插入位置
                    const index = parent.children.findIndex(c => c.id === targetId);
                    
                    if (index !== -1) {
                        const insertIndex = (dropType === 'BEFORE') ? index : index + 1;
                        parent.children.splice(insertIndex, 0, newNode);
                        
                        recordHistory();
                        updateChildrenDOM(parent.id);
                    }
                }
            }
        }
        
        // 清理临时属性
        delete card.dataset.dragState;
    });
}
/**
 * 提取 Markdown 标题：
 * 1. 识别首行是否为 "# " 开头
 * 2. 去掉开头的 "# "
 * 3. 如果标题两边包含 "**"，也一并去掉
 * @param {string} text - 输入的字符串
 * @returns {Array<string>} - [处理后的标题, 剩余内容]
 */
function extractMarkdownHeader(text) {
    if (!text) return ["", ""];

    // 1. 定位第一行
    const newlineIndex = text.indexOf('\n');
    const endOfFirstLine = newlineIndex === -1 ? text.length : newlineIndex;

    // 获取第一行并去掉可能的 Windows 回车符 \r
    let firstLine = text.substring(0, endOfFirstLine);
    if (firstLine.endsWith('\r')) {
        firstLine = firstLine.slice(0, -1);
    }

    const formulaPattern = /\$.*\$/;

    if (formulaPattern.test(firstLine)) {
        return ["", text];
    }

    // 2. 正则：匹配行首 # 加空格
    const headerPattern = /^#+ /;

    if (headerPattern.test(firstLine)) {
        // 【步骤 A】：去掉开头的 # 和空格
        let cleanTitle = firstLine.replace(headerPattern, '');

        // 【步骤 B】：去掉所有的加粗符号 **
        if (cleanTitle.includes('**')) {
            cleanTitle = cleanTitle.replace(/\*\*/g, '');
        }
        
        // 去除两端空格
        cleanTitle = cleanTitle.trim();

        // 准备剩余内容
        const restStartIndex = newlineIndex === -1 ? text.length : newlineIndex + 1;
        const restContent = text.substring(restStartIndex);

        return [cleanTitle, restContent];
    } else {
        return ["", text];
    }
}

// ==========================================
// #region Canvas 导出
// ==========================================
    // 辅助：RGB 转 Hex (Obsidian Canvas 需要 Hex 颜色)
/**
 * @param {string} rgb - RGB 颜色字符串，如 "rgb(255, 0, 0)"
 * @param {number} saturation - 饱和度系数 (默认 1)
 *    0: 完全灰色 (黑白)
 *    1: 原始颜色 (无变化)
 *    >1: 提高饱和度 (例如 2 是双倍饱和度)
 */
function rgbToHex (rgb, saturation = 4) {
    if (!rgb || rgb === 'rgba(0, 0, 0, 0)' || rgb === 'transparent') return null;
    
    // 如果已经是 Hex，直接返回（不做饱和度处理，因为函数名是rgbToHex）
    if (rgb.startsWith('#')) return rgb;

    // 处理 rgb(r, g, b)
    const sep = rgb.indexOf(",") > -1 ? "," : " ";
    const rgbArr = rgb.substr(4).split(")")[0].split(sep);
    
    // 1. 先转为数字类型
    let r = +rgbArr[0],
        g = +rgbArr[1],
        b = +rgbArr[2];

    // 2. 调整饱和度算法 (如果系数不是 1)
    if (saturation !== 1) {
        // 计算亮度 (Luma)，使用人眼感知的加权公式: 0.299R + 0.587G + 0.114B
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // 公式: 目标颜色 = 灰度 + (原色 - 灰度) * 饱和度系数
        r = gray + (r - gray) * saturation;
        g = gray + (g - gray) * saturation;
        b = gray + (b - gray) * saturation;

        // 修正数值范围 (0 - 255) 并取整
        r = Math.max(0, Math.min(255, Math.round(r)));
        g = Math.max(0, Math.min(255, Math.round(g)));
        b = Math.max(0, Math.min(255, Math.round(b)));
    }
    
    // 3. 转为 16 进制字符串
    let rHex = r.toString(16),
        gHex = g.toString(16),
        bHex = b.toString(16);
    
    if (rHex.length == 1) rHex = "0" + rHex;
    if (gHex.length == 1) gHex = "0" + gHex;
    if (bHex.length == 1) bHex = "0" + bHex;
    
    return "#" + rHex + gHex + bHex;
};
async function exportToCanvas() {
    const nodes = [];
    const edges = [];
    const rootId = state.data.id;
    
    // 获取根节点的 DOM 用于计算相对坐标原点
    const rootCard = document.getElementById(`card-${rootId}`);
    if (!rootCard) {
        showTopToast('❌ 无法找到根节点，导出失败');
        return;
    }
    
    // 获取根节点的绝对位置，作为 Canvas 的 (0,0) 参考点
    // 这样导出的 Canvas 内容会大致居中
    const rootRect = rootCard.getBoundingClientRect();
    const currentScale = state.view.scale;
    const EXPORT_SCALE = 1.35; // 用户要求的 1.25 倍间距缩放

    // 递归遍历函数
    const traverse = (node, parentId) => {
        const el = document.getElementById(`card-${node.id}`);
        if (!el) return;

        // 1. 计算几何尺寸与位置
        const rect = el.getBoundingClientRect();

        // 核心公式：(当前屏幕坐标 - 根节点屏幕坐标) / 当前缩放比例 * 1.25
        const x = Math.round(((rect.left - rootRect.left) / currentScale) * EXPORT_SCALE);
        const y = Math.round(((rect.top - rootRect.top) / currentScale) * EXPORT_SCALE);
        const width = Math.round((rect.width / currentScale) * EXPORT_SCALE);
        const height = Math.round((rect.height / currentScale) * EXPORT_SCALE);

        // 2. 获取颜色
        // 优先读取实际渲染的背景色（解决彩虹模式颜色不在 node.data 里的问题）
        let colorHex = null;
        if (node.isSimple) {
            // 便利贴模式：颜色在 card 上
            const bg = window.getComputedStyle(el).backgroundColor;
            colorHex = rgbToHex(bg);
        } else {
            // 标准模式：颜色在 header 上
            const header = el.querySelector('.card-header');
            if (header) {
                const bg = window.getComputedStyle(header).backgroundColor;
                colorHex = rgbToHex(bg);
            }
        }
        // 如果是默认白色/透明，不传 color 字段给 Obsidian
        if (colorHex === '#ffffff') colorHex = null;

        // 3. 构建节点内容
        // 标题加粗，内容换行
        let textContent = node.topic.length>0? `# ${node.topic}\n\n` : '';
        if (node.content) {
            textContent += `${node.content}`;
        }

        // 添加节点
        nodes.push({
            id: node.id,
            type: 'text',
            text: textContent,
            x: x,
            y: y,
            width: width,
            height: height,
            color: colorHex ? colorHex : undefined // 仅当有颜色时添加
        });

        // 4. 构建连线 (Edge)
        if (parentId) {
            // 判断连线方向
            // 如果节点在根节点的左侧体系内 (isDescendantOfLeft 是现有函数)，则 父左->子右
            // 否则 父右->子左
            const isLeft = isDescendantOfLeft(node.id);
            
            edges.push({
                id: generateNodeId(), // 生成唯一的 Edge ID
                fromNode: parentId,
                fromSide: isLeft ? 'left' : 'right',
                toNode: node.id,
                toSide: isLeft ? 'right' : 'left',
                color: colorHex ? colorHex : undefined // 线条颜色跟随节点
            });
        }

        // 递归子节点
        if (node.children && node.children.length > 0) {
            // 注意：因为是 DOM 遍历，不需要处理 folded，
            // 但如果节点被折叠了，DOM 可能不存在或位置不对。
            // 这里我们假设导出时希望导出完整数据，或者只导出可见数据。
            // 如果只想导出可见的，加上 if(!node.folded) check。
            // 既然是生成文件，通常导出所有数据比较好，但要考虑 DOM 是否渲染。
            // 你的 MindMap 实现中，折叠的节点是不渲染 DOM 的。
            // 为了保证有坐标，必须只导出“未折叠”的节点，或者临时强制计算（太复杂）。
            // 策略：只导出当前可见的节点。
            
            if (!node.folded) {
                node.children.forEach(child => traverse(child, node.id));
            }
        }
    };

    // 开始遍历
    traverse(state.data, null);

    // 生成 JSON 字符串
    const canvasData = {
        nodes: nodes,
        edges: edges
    };
    const fileName = `${getMindMapExportBaseName()}.canvas`;
    const jsonString = JSON.stringify(canvasData, null, 2);
    
    const isSaved = await saveFileDirectly(fileName, jsonString, 'application/json');
    if (isSaved) {
        showTopToast(`✅ 导图已保存到 Obsidian: ${fileName}`);
    } else {
        // 6. 降级方案：普通下载
        downloadFile(jsonString, fileName, 'application/json');
        showTopToast(`✅ 已下载文件 (API 不可用或被拒绝)`);
    }
}


// ==========================================
// #region 竖向 Canvas
// ==========================================


async function exportToVerticalCanvas() {
    // 1. 常量与配置
    const EXPORT_SCALE = 1.35;  // 保持和横向导出一致的缩放倍率
    const GAP_X = 40;           // 兄弟节点之间的水平间距 (Canvas坐标系)
    const GAP_Y = 150;          // 父子层级之间的垂直间距 (Canvas坐标系)
    const currentScale = state.view.scale; // 当前视图缩放比
    
    const nodes = [];
    const edges = [];

    // 2. 第一步：构建虚拟树 & 获取真实 DOM 尺寸
    // 这一步解决了"尺寸变了"的问题，直接读 DOM
    const buildVirtualTree = (node) => {
        const el = document.getElementById(`card-${node.id}`);
        // 如果节点折叠了或者找不到 DOM，给个默认值（防止报错）
        let realW = 200, realH = 100;
        let colorHex = null;

        if (el) {
            const rect = el.getBoundingClientRect();
            // 核心修复：完全照搬原版导出的尺寸计算公式
            realW = Math.round((rect.width / currentScale) * EXPORT_SCALE);
            realH = Math.round((rect.height / currentScale) * EXPORT_SCALE);

            // 读取颜色
            if (node.isSimple) {
                colorHex = rgbToHex(window.getComputedStyle(el).backgroundColor);
            } else {
                const header = el.querySelector('.card-header');
                if (header) colorHex = rgbToHex(window.getComputedStyle(header).backgroundColor);
            }
            if (colorHex === '#ffffff') colorHex = null;
        }

        const vNode = {
            id: node.id,
            topic: node.topic,
            content: node.content,
            width: realW,
            height: realH,
            color: colorHex,
            children: [],
            // 下面两个属性用于布局计算
            x: 0,
            y: 0,
            subtreeWidth: 0 // 子树总宽度
        };

        // 处理子节点顺序：左侧分支在前，右侧分支在后
        if (node.children && node.children.length > 0 && !node.folded) {
            const lefts = node.children.filter(c => c.dir === 'left');
            const rights = node.children.filter(c => c.dir !== 'left');
            const sorted = [...lefts, ...rights];
            vNode.children = sorted.map(child => buildVirtualTree(child));
        }

        return vNode;
    };

    // 3. 第二步：计算子树宽度 (后序遍历 - 自底向上)
    // 计算每个节点及其所有子孙节点并排在一起需要多宽
    const calculateSubtreeWidth = (vNode) => {
        if (vNode.children.length === 0) {
            vNode.subtreeWidth = vNode.width;
        } else {
            // 先递归算孩子
            vNode.children.forEach(calculateSubtreeWidth);
            
            // 孩子的总宽度 = 所有孩子的 subtreeWidth 之和 + 间隙
            const childrenTotalW = vNode.children.reduce((sum, child) => sum + child.subtreeWidth, 0) 
                                 + (vNode.children.length - 1) * GAP_X;
            
            // 自己的 subtreeWidth = max(自己宽, 孩子总宽)
            vNode.subtreeWidth = Math.max(vNode.width, childrenTotalW);
        }
    };

    // 4. 第三步：计算最终坐标 (前序遍历 - 自顶向下)
    // 解决了"位置乱"的问题，父节点永远居中于子节点上方
    const calculateCoordinates = (vNode, startX, currentY) => {
        vNode.y = currentY;

        // 核心布局逻辑：
        // 当前节点要在分配给它的 startX ~ startX + subtreeWidth 这个范围内居中
        // 公式：startX + (总宽/2) - (自己宽/2)
        vNode.x = startX + (vNode.subtreeWidth / 2) - (vNode.width / 2);

        // 如果有孩子，算出孩子们的起始 X
        if (vNode.children.length > 0) {
            const childrenTotalW = vNode.children.reduce((sum, c) => sum + c.subtreeWidth, 0) 
                                 + (vNode.children.length - 1) * GAP_X;
            
            // 孩子们的整体也要在 currentArea 居中
            // 孩子起始 X = startX + (父总宽 - 孩总宽) / 2
            let childStartX = startX + (vNode.subtreeWidth - childrenTotalW) / 2;
            
            const nextY = currentY + vNode.height + GAP_Y;

            vNode.children.forEach(child => {
                calculateCoordinates(child, childStartX, nextY);
                // 移动游标，下一个孩子紧挨着
                childStartX += child.subtreeWidth + GAP_X;
            });
        }
    };

    // 5. 第四步：生成 Canvas 数据
    const generateJson = (vNode, parentId = null) => {
        let textContent =vNode.topic.length>0? `# ${vNode.topic}\n\n`:'';
        if (vNode.content) textContent += `${vNode.content}`;

        nodes.push({
            id: vNode.id,
            type: 'text',
            text: textContent,
            x: Math.round(vNode.x),
            y: Math.round(vNode.y),
            width: vNode.width,
            height: vNode.height,
            color: vNode.color
        });

        if (parentId) {
            edges.push({
                id: 'edge-' + Math.random().toString(36).substr(2, 9),
                fromNode: parentId,
                fromSide: 'bottom', // 父节点底部
                toNode: vNode.id,
                toSide: 'top',      // 子节点顶部
                color: vNode.color // 线条颜色跟随子节点
            });
        }

        vNode.children.forEach(child => generateJson(child, vNode.id));
    };

    // --- 执行 ---
    const rootId = state.data.id;
    // 1. 构建树
    const vRoot = buildVirtualTree(state.data);
    
    // 2. 计算宽度
    calculateSubtreeWidth(vRoot);
    
    // 3. 计算坐标 (从 0,0 开始)
    calculateCoordinates(vRoot, 0, 0);
    
    // 4. 生成数据
    generateJson(vRoot);

    // 5. 导出文件
    const canvasData = { nodes, edges };
    const fileName=`${getMindMapExportBaseName()}_Vertical.canvas`;
    const jsonString = JSON.stringify(canvasData, null, 2);

    const isSaved = await saveFileDirectly(fileName, jsonString, 'application/json');
    if (isSaved) {
        showTopToast(`✅ 导图已保存到 Obsidian: ${fileName}`);
    } else {
        // 6. 降级方案：普通下载
        downloadFile(jsonString, fileName, 'application/json');
        showTopToast(`✅ 已下载文件 (API 不可用或被拒绝)`);
    }
}
