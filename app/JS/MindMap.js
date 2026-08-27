const generateNodeId = () => Math.random().toString(36).substr(2, 9);
const generateFileId = () => 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
const $ = (sel) => document.querySelector(sel);
if (typeof chrome.storage === 'undefined') {throw new Error('');}
if (typeof marked !== 'undefined') marked.use({ breaks: true, gfm: true });

const MINDMAP_THEME_STORAGE_KEY = 'mindmap_theme';
const MINDMAP_CARD_TOOLBAR_HOVER_STORAGE_KEY = 'mindmap_card_toolbar_hover';
const MINDMAP_NODE_STATS_VISIBLE_STORAGE_KEY = 'mindmap_node_stats_visible';
const MINDMAP_CARD_MIN_WIDTH = 100;
const mindMapSettings = {
    cardToolbarHover: true,
    nodeStatsVisible: true,
};

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
    const themeToggle = $('#settingThemeToggle');
    if (themeToggle) themeToggle.checked = normalizedTheme === 'dark';
    const themeValue = $('#settingThemeValue');
    if (themeValue) themeValue.textContent = normalizedTheme === 'dark' ? '当前为暗色' : '当前为亮色';
}

function applyMindMapCardToolbarHover(enabled) {
    mindMapSettings.cardToolbarHover = enabled !== false;
    document.documentElement.dataset.cardToolbarHover = String(mindMapSettings.cardToolbarHover);
    const toggle = $('#settingCardToolbarHoverToggle');
    if (toggle) toggle.checked = mindMapSettings.cardToolbarHover;
    const value = $('#settingCardToolbarHoverValue');
    if (value) value.textContent = mindMapSettings.cardToolbarHover ? '悬停时显示' : '悬停时隐藏';
    hideMindMapContentPreview();
}

function applyMindMapNodeStatsVisibility(visible) {
    mindMapSettings.nodeStatsVisible = visible !== false;
    const nodeStats = $('#nodeStats');
    if (nodeStats) nodeStats.hidden = !mindMapSettings.nodeStatsVisible;
    const toggle = $('#settingNodeStatsToggle');
    if (toggle) toggle.checked = mindMapSettings.nodeStatsVisible;
    const value = $('#settingNodeStatsValue');
    if (value) value.textContent = mindMapSettings.nodeStatsVisible ? '显示节点统计' : '隐藏节点统计';
}

function positionMindMapSettingsPopover() {
    const button = $('#btn-settings');
    const popover = $('#mindMapSettingsPopover');
    if (!button || !popover?.classList.contains('is-open')) return;
    const margin = 12;
    const gap = 8;
    const buttonRect = button.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const left = Math.min(
        Math.max(buttonRect.right - popoverRect.width, margin),
        Math.max(margin, window.innerWidth - popoverRect.width - margin),
    );
    const preferredTop = buttonRect.bottom + gap;
    const top = preferredTop + popoverRect.height <= window.innerHeight - margin
        ? preferredTop
        : Math.max(margin, buttonRect.top - popoverRect.height - gap);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
}

function setMindMapSettingsPopoverOpen(open) {
    const button = $('#btn-settings');
    const popover = $('#mindMapSettingsPopover');
    if (!button || !popover) return;
    popover.classList.toggle('is-open', open);
    popover.setAttribute('aria-hidden', String(!open));
    button.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(positionMindMapSettingsPopover);
}

async function initializeMindMapTheme() {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const result = await chrome.storage.local.get({
        [MINDMAP_THEME_STORAGE_KEY]: systemTheme,
        [MINDMAP_CARD_TOOLBAR_HOVER_STORAGE_KEY]: true,
        [MINDMAP_NODE_STATS_VISIBLE_STORAGE_KEY]: true,
    });
    const savedTheme = result && result[MINDMAP_THEME_STORAGE_KEY];
    applyMindMapTheme(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : systemTheme);
    applyMindMapCardToolbarHover(result?.[MINDMAP_CARD_TOOLBAR_HOVER_STORAGE_KEY] !== false);
    applyMindMapNodeStatsVisibility(result?.[MINDMAP_NODE_STATS_VISIBLE_STORAGE_KEY] !== false);

    const settingsButton = $('#btn-settings');
    const settingsPopover = $('#mindMapSettingsPopover');
    settingsButton?.addEventListener('click', event => {
        event.stopPropagation();
        setMindMapSettingsPopoverOpen(!settingsPopover?.classList.contains('is-open'));
    });
    settingsPopover?.addEventListener('click', event => event.stopPropagation());

    $('#settingThemeToggle')?.addEventListener('change', async event => {
        const nextTheme = event.currentTarget.checked ? 'dark' : 'light';
        applyMindMapTheme(nextTheme);
        await chrome.storage.local.set({ [MINDMAP_THEME_STORAGE_KEY]: nextTheme });
    });
    $('#settingCardToolbarHoverToggle')?.addEventListener('change', async event => {
        const enabled = event.currentTarget.checked;
        applyMindMapCardToolbarHover(enabled);
        await chrome.storage.local.set({ [MINDMAP_CARD_TOOLBAR_HOVER_STORAGE_KEY]: enabled });
    });
    $('#settingNodeStatsToggle')?.addEventListener('change', async event => {
        const visible = event.currentTarget.checked;
        applyMindMapNodeStatsVisibility(visible);
        await chrome.storage.local.set({ [MINDMAP_NODE_STATS_VISIBLE_STORAGE_KEY]: visible });
    });
    document.addEventListener('pointerdown', event => {
        if (event.target.closest('#btn-settings, #mindMapSettingsPopover')) return;
        setMindMapSettingsPopoverOpen(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && settingsPopover?.classList.contains('is-open')) {
            setMindMapSettingsPopoverOpen(false);
            settingsButton?.focus();
        }
    });
    window.addEventListener('resize', () => {
        if (settingsPopover?.classList.contains('is-open')) positionMindMapSettingsPopover();
    });
}

function showMindMapImportFeedback(message) {
    if (typeof showTopToast === 'function') showTopToast(message);
    else window.alert(message);
}

function isMindMapNodeData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return typeof value.id === 'string'
        || typeof value.topic === 'string'
        || typeof value.content === 'string'
        || Array.isArray(value.children);
}

function normalizeImportedMindMapTree(node) {
    if (!isMindMapNodeData(node)) {
        throw new Error('思维导图节点格式不正确');
    }

    if (!Array.isArray(node.children)) node.children = [];
    node.children.forEach(normalizeImportedMindMapTree);
    return node;
}

function normalizeImportedMindMap(imported) {
    if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
        throw new Error('文件格式不正确');
    }

    // 兼容两种格式：完整存档 { data, view, ... }，以及直接导出的根节点 data。
    const isSavedSnapshot = isMindMapNodeData(imported.data);
    const data = normalizeImportedMindMapTree(isSavedSnapshot ? imported.data : imported);

    // 根节点的扩展数据在纯 data 文件中通常不存在，补齐默认值以复用现有卡片、关联线和总结逻辑。
    if (!Array.isArray(data.relations)) data.relations = [];
    if (!Array.isArray(data.summaries)) data.summaries = [];
    if (typeof data.foldedLeft !== 'boolean') data.foldedLeft = false;
    if (typeof data.foldedRight !== 'boolean') data.foldedRight = false;

    return {
        data,
        view: isSavedSnapshot ? imported.view : null,
        scrollMap: isSavedSnapshot ? imported.scrollMap : null
    };
}

function applyImportedMindMap(content) {
    try {
        const imported = normalizeMindMapWorkbookSnapshot(
            JSON.parse(content),
            '导入页面',
            { allowEmpty: false }
        );
        replaceMindMapWorkbook(imported);
        sessionStorage.removeItem('currentFileID');
        persistMindMapWorkbookSession();
        showMindMapImportFeedback('✅ 思维导图导入成功');
    } catch (error) {
        console.error('[MindMap] 导入思维导图失败:', error);
        showMindMapImportFeedback(`❌ 导入失败：${error.message || '文件格式不正确'}`);
    }
}

function initializeMindMapImport() {
    const openButton = $('#btn-open');
    const fileInput = $('#fileInput');
    const quickerSubprogram = window.$quickerSp
        || (typeof $quickerSp !== 'undefined' ? $quickerSp : null);

    if (openButton && window.__DEEPCONVO_NATIVE_QUICKER_HOST__) {
        openButton.onclick = async () => {
            if (typeof quickerSubprogram !== 'function') {
                showMindMapImportFeedback('❌ 当前 Quicker WebView2 不支持调用导入子程序');
                return;
            }

            try {
                // Quicker 宿主不可靠地支持网页文件选择器，交给动作的原生模块选择并读取文件。
                // 不要在等待期间禁用按钮：部分 Quicker 版本在取消文件选择后不会完成
                // $quickerSp 返回的 Promise，若依赖 finally 恢复，按钮会永久不可点击。
                const result = await quickerSubprogram('DeepConvoImportMindMap', {});
                if (!result || result.cancelled || result.success === false) return;
                if (result.error) throw new Error(String(result.error));
                if (typeof result.content !== 'string' || !result.content.trim()) {
                    throw new Error('导入子程序没有返回 content 文本');
                }
                applyImportedMindMap(result.content);
            } catch (error) {
                console.error('[MindMap] Quicker 导入子程序执行失败:', error);
                showMindMapImportFeedback(
                    `❌ 导入失败：${error.message || '请检查 DeepConvoImportMindMap 子程序'}`,
                );
            }
        };
        return;
    }

    if (openButton) {
        openButton.onclick = () => {
            if (!fileInput) {
                showMindMapImportFeedback('❌ 找不到文件选择控件');
                return;
            }
            // 普通浏览器必须在用户点击的同步调用栈内打开选择器。
            fileInput.value = '';
            try {
                if (typeof fileInput.showPicker === 'function') {
                    fileInput.showPicker();
                    return;
                }
                fileInput.click();
            } catch (error) {
                console.warn('[MindMap] showPicker 打开失败，尝试 click 回退:', error);
                try {
                    fileInput.click();
                } catch (fallbackError) {
                    console.error('[MindMap] 无法打开文件选择窗口:', fallbackError);
                    showMindMapImportFeedback('❌ 无法打开文件选择窗口');
                }
            }
        };
    }
}

const defaultTreeData = {
    id: 'root', topic: 'MindMap', content: '## 主题',
    widthMode: 'auto', heightMode: 'auto', children: [], relations: [], summaries: [],
    foldedLeft: false, foldedRight: false
};
const MINDMAP_TABS_VERSION = 'tabs-v1';

function cloneMindMapValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function collectMindMapScrollNodeIds(node, target = new Set()) {
    if (!node || typeof node !== 'object') return target;
    if (node.id !== undefined && node.id !== null) target.add(String(node.id));
    (Array.isArray(node.children) ? node.children : []).forEach(child => {
        collectMindMapScrollNodeIds(child, target);
    });
    return target;
}

function sanitizeMindMapScrollMap(scrollMap, data) {
    const validNodeIds = collectMindMapScrollNodeIds(data);
    const entries = scrollMap instanceof Map
        ? Array.from(scrollMap.entries())
        : Object.entries(scrollMap && typeof scrollMap === 'object' ? scrollMap : {});
    return Object.fromEntries(entries.flatMap(([nodeId, rawScrollTop]) => {
        const normalizedNodeId = String(nodeId);
        const scrollTop = Number(rawScrollTop);
        return validNodeIds.has(normalizedNodeId) && Number.isFinite(scrollTop) && scrollTop > 0
            ? [[normalizedNodeId, scrollTop]]
            : [];
    }));
}

function createMindMapTab(name = '页面 1', snapshot = null) {
    const data = snapshot?.data
        ? normalizeImportedMindMapTree(snapshot.data)
        : cloneMindMapValue(defaultTreeData);
    if (!Array.isArray(data.relations)) data.relations = [];
    if (!Array.isArray(data.summaries)) data.summaries = [];
    if (typeof data.foldedLeft !== 'boolean') data.foldedLeft = false;
    if (typeof data.foldedRight !== 'boolean') data.foldedRight = false;
    return {
        id: `tab_${generateNodeId()}`,
        name: String(name || '').trim() || '未命名页面',
        data,
        view: snapshot?.view || { tx: window.innerWidth / 2, ty: window.innerHeight / 2, scale: 1 },
        scrollMap: sanitizeMindMapScrollMap(snapshot?.scrollMap, data)
    };
}

function getLegacyMindMapTabName(snapshot, fallbackName = '') {
    const fileName = String(fallbackName || '').trim();
    if (fileName && fileName !== 'AI思维导图' && fileName !== '新建思维导图') return fileName;
    const rootName = String(snapshot?.data?.topic || snapshot?.topic || '').trim();
    return rootName || '页面 1';
}

function normalizeMindMapWorkbookSnapshot(snapshot, fallbackName = '页面 1', options = {}) {
    const allowEmpty = options.allowEmpty !== false;
    const isWorkbook = snapshot
        && typeof snapshot === 'object'
        && !Array.isArray(snapshot)
        && Array.isArray(snapshot.tabs);

    if (isWorkbook) {
        const tabs = snapshot.tabs.map((tab, index) => {
            const normalized = normalizeImportedMindMap(tab);
            const normalizedTab = createMindMapTab(tab.name || `页面 ${index + 1}`, normalized);
            if (typeof tab.id === 'string' && tab.id.trim()) normalizedTab.id = tab.id;
            return normalizedTab;
        });
        if (tabs.length === 0) tabs.push(createMindMapTab('页面 1'));
        const activeTabId = tabs.some(tab => tab.id === snapshot.activeTabId)
            ? snapshot.activeTabId
            : tabs[0].id;
        return { version: MINDMAP_TABS_VERSION, activeTabId, tabs };
    }

    const hasLegacyData = isMindMapNodeData(snapshot?.data) || isMindMapNodeData(snapshot);
    if (!hasLegacyData) {
        if (!allowEmpty) throw new Error('思维导图节点格式不正确');
        const tab = createMindMapTab('页面 1');
        return { version: MINDMAP_TABS_VERSION, activeTabId: tab.id, tabs: [tab] };
    }

    const normalized = normalizeImportedMindMap(snapshot);
    const tab = createMindMapTab(getLegacyMindMapTabName(snapshot, fallbackName), normalized);
    return { version: MINDMAP_TABS_VERSION, activeTabId: tab.id, tabs: [tab] };
}

let dockData = JSON.parse(sessionStorage.getItem('DockData'))||[]; // 初始为空数组
let saveData = JSON.parse(sessionStorage.getItem('MindMapData'))||{};
let pageTitle = sessionStorage.getItem('pageTitle')||'AI思维导图';
document.title = pageTitle;
let mindMapWorkbook = normalizeMindMapWorkbookSnapshot(saveData, pageTitle);
let initialMindMapTab = mindMapWorkbook.tabs.find(tab => tab.id === mindMapWorkbook.activeTabId)
    || mindMapWorkbook.tabs[0];
const mindMapTabRuntime = new Map();
let state = {
    data: initialMindMapTab.data,
    view: initialMindMapTab.view,
    scrollMap: new Map(Object.entries(initialMindMapTab.scrollMap || {})),
    selectedIds: new Set(), selectedRelationId: null, selectedSummaryId: null, history: [], historyIndex: -1,
    mode: 'IDLE', dockCollapsed: false, activeDockIndex: -1,
    editingNode: null, editingEntityKind: 'node', isReadOnly: false,
    startPos: {x:0,y:0}, viewStart: {x:0,y:0},
    drag: { source: null, nodeId: null, data: null, title: '', targetId: null, dropType: null },
    resize: { node: null, dir: '', startW: 0, startH: 0, mx: 0, my: 0 },
    rainbowMode: false,
    compactView: false
};
const mapSearchState = {
    query: '',
    results: [],
    activeIndex: -1,
    hasLocated: false,
    visibleOnly: false,
    revealedNodeIds: new Set(),
    revealedRootDirections: new Set(),
    pulseTimer: null,
    clipboardRequestId: 0,
    focusRequestId: 0,
    focusTimer: null
};
const MAP_SEARCH_CLIPBOARD_MAX_CHARS = 15;
const CARD_BG='95%';
const MINDMAP_CONTENT_PREVIEW_GAP = 12;
const MINDMAP_CONTENT_PREVIEW_MARGIN = 12;
const MINDMAP_CONTENT_PREVIEW_ARROW_INSET = 8;
const MINDMAP_CONTENT_PREVIEW_ARROW_CORNER_CLEARANCE = 24;
const MINDMAP_CONTENT_PREVIEW_BOTTOM_COMFORT_HEIGHT = 160;
const MINDMAP_CONTENT_PREVIEW_MIN_HEIGHT = 52;
const MINDMAP_CONTENT_PREVIEW_MIN_WIDTH = 120;
const mindMapContentPreviewState = {
    card: null,
    el: null,
    showTimer: null,
    hideTimer: null,
};
let isUndoRedo = false;
let saveTimer = null;
let skipNextGlobalScrollCapture = false;
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

function getActiveMindMapTab() {
    return mindMapWorkbook.tabs.find(tab => tab.id === mindMapWorkbook.activeTabId)
        || mindMapWorkbook.tabs[0]
        || null;
}

function syncActiveMindMapTab(captureScroll = true) {
    const tab = getActiveMindMapTab();
    if (!tab) return null;
    if (captureScroll) saveGlobalScrolls();
    tab.data = state.data;
    tab.view = state.view;
    tab.scrollMap = sanitizeMindMapScrollMap(state.scrollMap, state.data);
    state.scrollMap = new Map(Object.entries(tab.scrollMap));
    mindMapTabRuntime.set(tab.id, {
        history: [...state.history],
        historyIndex: state.historyIndex
    });
    return tab;
}

function getMindMapWorkbookSnapshot(captureScroll = true) {
    syncActiveMindMapTab(captureScroll);
    return {
        version: MINDMAP_TABS_VERSION,
        activeTabId: mindMapWorkbook.activeTabId,
        tabs: mindMapWorkbook.tabs.map(tab => {
            const scrollMap = sanitizeMindMapScrollMap(tab.scrollMap, tab.data);
            tab.scrollMap = scrollMap;
            return {
                id: tab.id,
                name: tab.name,
                data: tab.data,
                view: tab.view,
                ...(Object.keys(scrollMap).length > 0 ? { scrollMap } : {})
            };
        })
    };
}

function persistMindMapWorkbookSession(captureScroll = true) {
    const snapshot = getMindMapWorkbookSnapshot(captureScroll);
    sessionStorage.setItem('MindMapData', JSON.stringify(snapshot));
    return snapshot;
}

function resetMindMapTabTransientState() {
    state.selectedIds.clear();
    state.selectedRelationId = null;
    state.selectedSummaryId = null;
    state.editingNode = null;
    state.editingEntityKind = 'node';
    state.isReadOnly = false;
    state.mode = 'IDLE';
    closeMindMapRelationEditor();
    closeMindMapRelationNavigationMenu();
    $('#editorModal')?.classList.remove('active');
    resetMapSearch();
}

function loadActiveMindMapTab(options = {}) {
    const tab = getActiveMindMapTab();
    if (!tab) return false;
    const runtime = options.resetHistory ? null : mindMapTabRuntime.get(tab.id);
    state.data = tab.data;
    state.view = tab.view || { tx: window.innerWidth / 2, ty: window.innerHeight / 2, scale: 1 };
    state.scrollMap = new Map(Object.entries(sanitizeMindMapScrollMap(tab.scrollMap, tab.data)));
    state.history = runtime?.history?.length
        ? [...runtime.history]
        : [JSON.stringify(tab.data)];
    state.historyIndex = runtime?.history?.length
        ? Math.min(runtime.historyIndex, runtime.history.length - 1)
        : 0;
    mindMapTabRuntime.set(tab.id, {
        history: [...state.history],
        historyIndex: state.historyIndex
    });
    resetMindMapTabTransientState();
    skipNextGlobalScrollCapture = true;
    renderTree();
    renderMindMapTabs();
    return true;
}

function replaceMindMapWorkbook(workbook) {
    mindMapWorkbook = workbook;
    mindMapTabRuntime.clear();
    loadActiveMindMapTab({ resetHistory: true });
}

async function updateState(MindMapData,newCurrentFileID,pageTitle,otherPageOpen=false){       // 思维导图页面加载思维导图文件
    if (!otherPageOpen) await saveMindMapData(true,false);  // 询问保存当前文件
    document.title = pageTitle;
    replaceMindMapWorkbook(normalizeMindMapWorkbookSnapshot(MindMapData, pageTitle));
    sessionStorage.setItem('currentFileID', newCurrentFileID);
    persistMindMapWorkbookSession(false);
    sessionStorage.setItem('pageTitle', pageTitle);
}

function updateDockData(qaData) {           // 思维导图页面加载卡片坞数据
    dockData = qaData;
    renderDock();
    sessionStorage.setItem('DockData', JSON.stringify(dockData));
}

async function saveMindMapData(isForce=false,notify=true){           // 保存
    if (!bookmarkManager || !isForce) return false;
    const saveData = getMindMapWorkbookSnapshot();
    const currentFileID = sessionStorage.getItem('currentFileID');
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
        return false;
    }

    try {
        await idbSet({[`MindMapData.__REF__${currentFileID}-extra`]:saveData});
        sessionStorage.setItem('MindMapData', JSON.stringify(saveData));
        if (notify) showTopToast('✅ 保存成功！');
        return true;
    } catch (error) {
        console.error('[MindMap] 保存思维导图失败:', error);
        if (notify) showTopToast(`❌ 保存失败：${error.message || '数据未能写入'}`);
        return false;
    }
}
async function newMindMap(){      // 新建思维导图
    await saveMindMapData(true);  // 询问保存
    new_MindMap();          // 新建
}

function new_MindMap(){
    document.title = '新建思维导图';
    sessionStorage.setItem('pageTitle', '新建思维导图');
    const tab = createMindMapTab('页面 1');
    replaceMindMapWorkbook({
        version: MINDMAP_TABS_VERSION,
        activeTabId: tab.id,
        tabs: [tab]
    });
    persistMindMapWorkbookSession(false);
    sessionStorage.removeItem('currentFileID');
}

let mindMapTabContextTargetId = null;
let draggedMindMapTabId = null;
let mindMapTabRenameTargetId = null;
let mindMapTabDeleteTargetId = null;
let mindMapTabModalReturnFocus = null;

function getUniqueMindMapTabName(baseName) {
    const base = String(baseName || '').trim() || '页面';
    const names = new Set(mindMapWorkbook.tabs.map(tab => tab.name));
    if (!names.has(base)) return base;
    let index = 2;
    while (names.has(`${base} ${index}`)) index++;
    return `${base} ${index}`;
}

function getNextMindMapTabName() {
    let index = 1;
    const names = new Set(mindMapWorkbook.tabs.map(tab => tab.name));
    while (names.has(`页面 ${index}`)) index++;
    return `页面 ${index}`;
}

function commitCurrentMindMapTabEdits() {
    const editorModal = $('#editorModal');
    if (editorModal?.classList.contains('active')) $('#btn-close-modal')?.click();
    syncCurrentInput();
    if ($('#relationEditor')?.classList.contains('active')) commitMindMapRelationEditor();
    syncActiveMindMapTab();
}

function scrollActiveMindMapTabIntoView() {
    requestAnimationFrame(() => {
        document.querySelector('.mindmap-tab.active')?.scrollIntoView({
            block: 'nearest',
            inline: 'nearest'
        });
    });
}

function activateMindMapTab(tabId, options = {}) {
    if (!mindMapWorkbook.tabs.some(tab => tab.id === tabId)) return false;
    if (mindMapWorkbook.activeTabId === tabId && !options.force) return true;
    if (!options.skipCurrentSync) commitCurrentMindMapTabEdits();
    mindMapWorkbook.activeTabId = tabId;
    loadActiveMindMapTab();
    persistMindMapWorkbookSession(false);
    saveStorage();
    scrollActiveMindMapTabIntoView();
    return true;
}

function addMindMapTab() {
    commitCurrentMindMapTabEdits();
    const tab = createMindMapTab(getNextMindMapTabName());
    mindMapWorkbook.tabs.push(tab);
    mindMapWorkbook.activeTabId = tab.id;
    loadActiveMindMapTab({ resetHistory: true });
    persistMindMapWorkbookSession(false);
    saveStorage();
    scrollActiveMindMapTabIntoView();
}

function showMindMapTabModal(modal) {
    if (!modal) return;
    mindMapTabModalReturnFocus = document.activeElement;
    document.body.classList.add('modal-open');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
}

function hideMindMapTabModal(modal) {
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.mymodal.show')) document.body.classList.remove('modal-open');
    if (mindMapTabModalReturnFocus?.isConnected) mindMapTabModalReturnFocus.focus();
    mindMapTabModalReturnFocus = null;
}

function cancelMindMapTabRename() {
    mindMapTabRenameTargetId = null;
    const error = $('#mindMapTabRenameError');
    if (error) error.textContent = '';
    hideMindMapTabModal($('#mindMapTabRenameModal'));
}

function renameMindMapTab(tabId) {
    const tab = mindMapWorkbook.tabs.find(item => item.id === tabId);
    if (!tab) return;
    const modal = $('#mindMapTabRenameModal');
    const input = $('#mindMapTabRenameInput');
    const error = $('#mindMapTabRenameError');
    if (!modal || !input) return;
    mindMapTabRenameTargetId = tabId;
    input.value = tab.name;
    if (error) error.textContent = '';
    showMindMapTabModal(modal);
    requestAnimationFrame(() => {
        input.focus();
        input.select();
    });
}

function confirmMindMapTabRename() {
    const tab = mindMapWorkbook.tabs.find(item => item.id === mindMapTabRenameTargetId);
    const input = $('#mindMapTabRenameInput');
    const error = $('#mindMapTabRenameError');
    if (!tab || !input) {
        cancelMindMapTabRename();
        return;
    }
    const normalizedName = input.value.trim();
    if (!normalizedName) {
        if (error) error.textContent = '页面名称不能为空';
        input.focus();
        return;
    }
    if (normalizedName === tab.name) {
        cancelMindMapTabRename();
        return;
    }
    tab.name = normalizedName.slice(0, 80);
    renderMindMapTabs();
    persistMindMapWorkbookSession();
    saveStorage();
    cancelMindMapTabRename();
}

function duplicateMindMapTab(tabId) {
    const sourceIndex = mindMapWorkbook.tabs.findIndex(tab => tab.id === tabId);
    if (sourceIndex < 0) return;
    if (mindMapWorkbook.activeTabId === tabId) commitCurrentMindMapTabEdits();
    const source = mindMapWorkbook.tabs[sourceIndex];
    const duplicate = createMindMapTab(
        getUniqueMindMapTabName(`${source.name} 副本`),
        cloneMindMapValue({ data: source.data, view: source.view, scrollMap: source.scrollMap })
    );
    mindMapWorkbook.tabs.splice(sourceIndex + 1, 0, duplicate);
    mindMapWorkbook.activeTabId = duplicate.id;
    loadActiveMindMapTab({ resetHistory: true });
    persistMindMapWorkbookSession(false);
    saveStorage();
    scrollActiveMindMapTabIntoView();
}

function getMindMapSubtreeSourceSide(root, nodeId) {
    if (!root || root.id === nodeId) return null;
    const rootChild = (root.children || []).find(child => findNode(child, nodeId));
    return rootChild?.dir === 'left' ? 'left' : 'right';
}

function buildMindMapTabDataFromNode(root, nodeId) {
    const sourceNode = root ? findNode(root, nodeId) : null;
    if (!sourceNode) return null;

    const data = cloneMindMapValue(sourceNode);
    const subtreeIds = collectMindMapNodeIds(data);
    const sourceSide = getMindMapSubtreeSourceSide(root, nodeId);
    data.relations = (root.relations || [])
        .filter(relation => subtreeIds.has(relation.sourceId) && subtreeIds.has(relation.targetId))
        .map(cloneMindMapValue);
    data.summaries = (root.summaries || [])
        .filter(summary => Array.isArray(summary.nodeIds)
            && summary.nodeIds.length >= MINDMAP_SUMMARY_MIN_NODES
            && summary.nodeIds.every(id => subtreeIds.has(id)))
        .map(summary => {
            const clonedSummary = cloneMindMapValue(summary);
            if (sourceSide) clonedSummary.side = sourceSide;
            return clonedSummary;
        });

    delete data.dir;
    data.folded = false;
    data.foldedLeft = false;
    data.foldedRight = false;
    if (sourceSide) {
        (data.children || []).forEach(child => {
            child.dir = sourceSide;
        });
    }
    return data;
}

function createMindMapTabFromSelectedNode() {
    if (state.selectedIds.size !== 1) {
        if (typeof showTopToast === 'function') showTopToast('⚠️ 请选择一张卡片');
        return false;
    }

    const nodeId = Array.from(state.selectedIds)[0];
    commitCurrentMindMapTabEdits();
    const sourceNode = findNode(state.data, nodeId);
    const data = buildMindMapTabDataFromNode(state.data, nodeId);
    if (!sourceNode || !data) return false;

    const baseName = String(sourceNode.topic || '').trim().slice(0, 80) || '未命名页面';
    const tab = createMindMapTab(getUniqueMindMapTabName(baseName), { data });
    mindMapWorkbook.tabs.push(tab);
    mindMapWorkbook.activeTabId = tab.id;
    loadActiveMindMapTab({ resetHistory: true });
    persistMindMapWorkbookSession(false);
    saveStorage();
    scrollActiveMindMapTabIntoView();
    if (typeof showTopToast === 'function') showTopToast('✅ 已从所选节点创建新页面');
    return true;
}

function deleteMindMapTab(tabId) {
    if (mindMapWorkbook.tabs.length <= 1) {
        showTopToast('⚠️ 至少需要保留一个页面');
        return;
    }
    const index = mindMapWorkbook.tabs.findIndex(tab => tab.id === tabId);
    if (index < 0) return;
    const tab = mindMapWorkbook.tabs[index];
    const modal = $('#mindMapTabDeleteModal');
    const text = $('#mindMapTabDeleteText');
    if (!modal || !text) return;
    mindMapTabDeleteTargetId = tabId;
    text.textContent = `确定删除页面“${tab.name}”吗？此操作无法撤销。`;
    showMindMapTabModal(modal);
    requestAnimationFrame(() => $('#cancelMindMapTabDelete')?.focus());
}

function cancelMindMapTabDelete() {
    mindMapTabDeleteTargetId = null;
    hideMindMapTabModal($('#mindMapTabDeleteModal'));
}

function confirmMindMapTabDelete() {
    const tabId = mindMapTabDeleteTargetId;
    const index = mindMapWorkbook.tabs.findIndex(tab => tab.id === tabId);
    if (index < 0 || mindMapWorkbook.tabs.length <= 1) {
        cancelMindMapTabDelete();
        return;
    }

    const isActive = mindMapWorkbook.activeTabId === tabId;
    if (isActive) commitCurrentMindMapTabEdits();
    mindMapWorkbook.tabs.splice(index, 1);
    mindMapTabRuntime.delete(tabId);
    if (isActive) {
        const nextTab = mindMapWorkbook.tabs[Math.min(index, mindMapWorkbook.tabs.length - 1)];
        mindMapWorkbook.activeTabId = nextTab.id;
        loadActiveMindMapTab();
    } else {
        renderMindMapTabs();
    }
    persistMindMapWorkbookSession(false);
    saveStorage();
    cancelMindMapTabDelete();
}

function reorderMindMapTab(sourceId, targetId, insertAfter = false) {
    if (!sourceId || sourceId === targetId) return;
    const sourceIndex = mindMapWorkbook.tabs.findIndex(tab => tab.id === sourceId);
    if (sourceIndex < 0) return;
    const [sourceTab] = mindMapWorkbook.tabs.splice(sourceIndex, 1);
    const targetIndex = mindMapWorkbook.tabs.findIndex(tab => tab.id === targetId);
    if (targetIndex < 0) {
        mindMapWorkbook.tabs.splice(sourceIndex, 0, sourceTab);
        return;
    }
    mindMapWorkbook.tabs.splice(targetIndex + (insertAfter ? 1 : 0), 0, sourceTab);
    renderMindMapTabs();
    persistMindMapWorkbookSession();
    saveStorage();
}

function renderMindMapTabs() {
    const list = $('#mindMapTabList');
    if (!list) return;
    list.replaceChildren();
    mindMapWorkbook.tabs.forEach(tab => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mindmap-tab';
        button.dataset.tabId = tab.id;
        button.draggable = true;
        button.title = tab.name;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(tab.id === mindMapWorkbook.activeTabId));
        button.classList.toggle('active', tab.id === mindMapWorkbook.activeTabId);
        const label = document.createElement('span');
        label.className = 'mindmap-tab-label';
        label.textContent = tab.name;
        button.appendChild(label);
        list.appendChild(button);
    });
}

function clearMindMapTabDropIndicators() {
    document.querySelectorAll('.mindmap-tab.drop-before, .mindmap-tab.drop-after').forEach(tab => {
        tab.classList.remove('drop-before', 'drop-after');
    });
}

function setMindMapTabDropIndicator(tab, position) {
    if (!tab) return;
    const className = position === 'after' ? 'drop-after' : 'drop-before';
    if (tab.classList.contains(className)) return;
    clearMindMapTabDropIndicators();
    tab.classList.add(className);
}

function initializeMindMapTabs() {
    const list = $('#mindMapTabList');
    const addButton = $('#btn-add-mindmap-tab');
    const menu = $('#mindMapTabMenu');
    const renameModal = $('#mindMapTabRenameModal');
    const deleteModal = $('#mindMapTabDeleteModal');
    if (!list || !addButton || !menu || !renameModal || !deleteModal) return;
    renderMindMapTabs();
    addButton.addEventListener('click', addMindMapTab);
    list.addEventListener('wheel', event => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        event.preventDefault();
        list.scrollLeft += event.deltaY;
    }, { passive: false });
    list.addEventListener('click', event => {
        const tab = event.target.closest('.mindmap-tab');
        if (tab) activateMindMapTab(tab.dataset.tabId);
    });
    list.addEventListener('dblclick', event => {
        const tab = event.target.closest('.mindmap-tab');
        if (tab) renameMindMapTab(tab.dataset.tabId);
    });
    list.addEventListener('contextmenu', event => {
        const tab = event.target.closest('.mindmap-tab');
        if (!tab) return;
        event.preventDefault();
        mindMapTabContextTargetId = tab.dataset.tabId;
        positionMindMapContextMenu(menu, event.clientX, event.clientY);
        menu.querySelector('[data-tab-action="delete"]').classList.toggle(
            'disabled',
            mindMapWorkbook.tabs.length <= 1
        );
    });
    list.addEventListener('dragstart', event => {
        const tab = event.target.closest('.mindmap-tab');
        if (!tab) return;
        draggedMindMapTabId = tab.dataset.tabId;
        tab.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedMindMapTabId);
    });
    list.addEventListener('dragover', event => {
        const tab = event.target.closest('.mindmap-tab');
        if (!tab || !draggedMindMapTabId || tab.dataset.tabId === draggedMindMapTabId) return;
        event.preventDefault();
        const rect = tab.getBoundingClientRect();
        setMindMapTabDropIndicator(
            tab,
            event.clientX >= rect.left + rect.width / 2 ? 'after' : 'before'
        );
    });
    list.addEventListener('drop', event => {
        const tab = event.target.closest('.mindmap-tab');
        if (!tab || !draggedMindMapTabId) return;
        event.preventDefault();
        const rect = tab.getBoundingClientRect();
        reorderMindMapTab(draggedMindMapTabId, tab.dataset.tabId, event.clientX >= rect.left + rect.width / 2);
        clearMindMapTabDropIndicators();
    });
    list.addEventListener('dragend', () => {
        draggedMindMapTabId = null;
        document.querySelectorAll('.mindmap-tab.dragging').forEach(tab => tab.classList.remove('dragging'));
        clearMindMapTabDropIndicators();
    });
    menu.addEventListener('click', event => {
        const actionItem = event.target.closest('[data-tab-action]');
        if (!actionItem || actionItem.classList.contains('disabled')) return;
        const tabId = mindMapTabContextTargetId;
        menu.classList.remove('active');
        if (actionItem.dataset.tabAction === 'rename') renameMindMapTab(tabId);
        if (actionItem.dataset.tabAction === 'duplicate') duplicateMindMapTab(tabId);
        if (actionItem.dataset.tabAction === 'delete') deleteMindMapTab(tabId);
    });
    document.addEventListener('mousedown', event => {
        if (!event.target.closest('#mindMapTabMenu')) menu.classList.remove('active');
    });
    $('#cancelMindMapTabRename').addEventListener('click', cancelMindMapTabRename);
    $('#confirmMindMapTabRename').addEventListener('click', confirmMindMapTabRename);
    $('#cancelMindMapTabDelete').addEventListener('click', cancelMindMapTabDelete);
    $('#confirmMindMapTabDelete').addEventListener('click', confirmMindMapTabDelete);
    $('#mindMapTabRenameInput').addEventListener('input', () => {
        $('#mindMapTabRenameError').textContent = '';
    });
    $('#mindMapTabRenameInput').addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            confirmMindMapTabRename();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancelMindMapTabRename();
        }
    });
    [renameModal, deleteModal].forEach(modal => {
        modal.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key !== 'Escape') return;
            event.preventDefault();
            if (modal === renameModal) cancelMindMapTabRename();
            else cancelMindMapTabDelete();
        });
        modal.addEventListener('mousedown', event => {
            if (event.target === modal) modal.dataset.backdropPressed = 'true';
        });
        modal.addEventListener('click', event => {
            const shouldClose = event.target === modal && modal.dataset.backdropPressed === 'true';
            delete modal.dataset.backdropPressed;
            if (!shouldClose) return;
            if (modal === renameModal) cancelMindMapTabRename();
            else cancelMindMapTabDelete();
        });
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (renameModal.classList.contains('show')) {
            event.preventDefault();
            event.stopPropagation();
            cancelMindMapTabRename();
        } else if (deleteModal.classList.contains('show')) {
            event.preventDefault();
            event.stopPropagation();
            cancelMindMapTabDelete();
        }
    });
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
    initializeMindMapContentPreview(); // 折叠/便利贴卡片的悬停正文预览
    initializeMapContextMenu(); // 初始化右键菜单
    initializeNativeDragDrop(); // 初始化原生拖拽
    initializeEditorToolbar();  // 初始化md编辑器
    initializeMapToolbar();     // 初始化思维导图工具栏
    initializeMapSearch();      // 初始化搜索定位
    initializeMindMapRelations(); // 初始化卡片关联线
    initializeMindMapSummaries(); // 初始化多卡片总结
    initializeMindMapTabs(); // 初始化多页面 Tab
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
        if(e.target.classList.contains('node-topic') && e.key==='Enter' && !(e.ctrlKey || e.metaKey)) {
            
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

        // 预览气泡内的文字应完整保留浏览器原生快捷键（尤其是复制与全选）。
        if (activeEl?.closest?.('.card-content-preview')) return;

        // 搜索定位优先于浏览器页面查找，但编辑器打开时仍保留编辑器自身行为。
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !isModalActive) {
            e.preventDefault();
            openMapSearch({ prefillFromClipboard: true });
            return;
        }

        // ▼▼▼ 优先处理：全局保存 (Ctrl + S) ▼▼▼
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (typeof syncCurrentInput === 'function') syncCurrentInput(); 
            saveMindMapData(true);
            return;
        }

        // 编辑模式快捷键优先于输入状态拦截，Esc 会复用“完成”按钮的保存与关闭逻辑。
        if (isModalActive && e.key === 'Escape') {
            e.preventDefault();
            $('#btn-close-modal').click();
            return;
        }

        if (isMapSearchOpen()) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeMapSearch();
                return;
            }
            // 搜索输入框保留文字快捷键；焦点离开后，画布仍可执行粘贴等节点操作。
            if (activeEl === $('#mapSearchInput')) return;
        }

        // Ctrl+Enter：从画布或标题进入当前单选卡片/总结的 Markdown 源码编辑。
        if (!isModalActive && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const canOpenEditor = !isInput || activeEl.classList.contains('node-topic') || activeEl.classList.contains('summary-topic');
            const summary = getMindMapSummaryById(state.selectedSummaryId);
            if (canOpenEditor && (summary || state.selectedIds.size === 1)) {
                e.preventDefault();
                syncCurrentInput();
                const node = summary || findNode(state.data, Array.from(state.selectedIds)[0]);
                if (node) openMindMapEditor(node, false, true);
            }
            return;
        }

        // Ctrl+A：仅在画布状态全选脑图卡片，输入框内仍保留原生文字全选。
        if (!isModalActive && !isInput && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            selectAllMindMapNodes();
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

        // 方向键：按画布实际方向在父子和同侧兄弟之间移动单选卡片。
        if (
            state.mode === 'IDLE'
            && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
            && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
            && state.selectedIds.size === 1
        ) {
            e.preventDefault();
            moveMindMapSelectionByArrow(e.key);
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
            e.preventDefault();
            if (state.selectedRelationId) deleteSelectedMindMapRelation();
            else if (state.selectedSummaryId) deleteSelectedMindMapSummary();
            else $('#btn-delete').click();
            return;
        }
    });

    // recordHistory(); renderTree(); renderDock();
});
// =============================================================================
// #region 工具栏事件
// =============================================================================

function focusMindMapNodeTopic(nodeId) {
    requestAnimationFrame(() => {
        const topic = document.getElementById(`card-${nodeId}`)?.querySelector('.node-topic');
        if (!topic) return;
        topic.focus();
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(topic);
        selection.removeAllRanges();
        selection.addRange(range);
    });
}

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
            focusMindMapNodeTopic(newNode.id);
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
            focusMindMapNodeTopic(newNode.id);
        } 
    };
    $('#btn-add-relation').onclick = event => addRelationBetweenSelectedCards({
        x: event.clientX,
        y: event.clientY
    });
    $('#btn-add-summary').onclick = addSummaryForSelectedCards;
    $('#btn-delete').onclick=()=>{ 
        syncCurrentInput(); 
        if(state.selectedRelationId) {
            deleteSelectedMindMapRelation();
            return;
        }
        if(state.selectedSummaryId) {
            deleteSelectedMindMapSummary();
            return;
        }
        const parents=new Set(); 
        const deletedNodeIds = new Set();
        state.selectedIds.forEach(id=>{
            if(id!==state.data.id){
                collectMindMapNodeIds(findNode(state.data,id), deletedNodeIds);
                const p=findParent(state.data,id);
                if(p){ p.children=p.children.filter(c=>c.id!==id); parents.add(p.id); }
            }
        }); 
        removeMindMapRelationsForNodes(deletedNodeIds);
        removeMindMapSummariesForNodes(deletedNodeIds);
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
            
            const hasChanged = applyColorToMindMapSelection(color);

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
        updateToolbar();
        updateTreeStyle(); 
        // renderTree(); // 重新渲染，应用颜色
    };

    $('#btn-compact-view').onclick = () => {
        syncCurrentInput();
        state.compactView = !state.compactView;
        renderTree();
    };

    $('#btn-center').onclick=()=>{ state.view={tx:window.innerWidth / 2,ty:window.innerHeight / 2,scale:1}; updateTransform(); saveStorage(); };
    $('#btn-new').onclick=()=>{void newMindMap();}
    $('#btn-save').onclick=()=>{void saveMindMapData(true);}
    $('#btn-export').onclick=()=>{ 
        const a=document.createElement('a');
        const url=URL.createObjectURL(new Blob([JSON.stringify(getMindMapWorkbookSnapshot())],{type:'application/json'}));
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
            applyImportedMindMap(ev.target.result);
            e.target.value='';
        };
        r.onerror=()=>{
            showMindMapImportFeedback('❌ 导入失败：无法读取文件');
            e.target.value='';
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
        const newDirectory = await changeObsidianPath();
        if (newDirectory) {
            showTopToast('✅ 新目录设置成功！');
        }
    };
    initializeMindMapTheme();
}

// =============================================================================
// #region 右键菜单
// =============================================================================
function getMindMapOverlayViewportBottom(viewportHeight, tabTop, margin = 0) {
    const viewportBottom = Math.max(margin, viewportHeight - margin);
    if (!Number.isFinite(tabTop) || tabTop <= 0 || tabTop >= viewportHeight) return viewportBottom;
    return Math.max(margin, Math.min(viewportBottom, tabTop - margin));
}

function getMindMapUsableViewportBottom(margin = 0) {
    const tabBar = document.getElementById('mindMapTabs');
    const tabRect = tabBar?.getClientRects().length ? tabBar.getBoundingClientRect() : null;
    return getMindMapOverlayViewportBottom(
        window.innerHeight,
        tabRect?.top,
        margin,
    );
}

function getMindMapContextSubmenuSize(submenu) {
    if (!submenu) return { width: 0, height: 0 };
    const previousDisplay = submenu.style.display;
    const previousVisibility = submenu.style.visibility;
    submenu.style.display = 'block';
    submenu.style.visibility = 'hidden';
    const { width, height } = submenu.getBoundingClientRect();
    submenu.style.display = previousDisplay;
    submenu.style.visibility = previousVisibility;
    return { width, height };
}

function positionMindMapContextMenu(menu, clientX, clientY) {
    const viewportMargin = 8;
    const viewportBottom = getMindMapUsableViewportBottom(viewportMargin);
    const submenu = menu.querySelector('.menu-item.has-submenu > .submenu');
    menu.classList.remove('submenu-opens-left');
    menu.style.removeProperty('max-height');
    menu.style.removeProperty('overflow-y');
    if (submenu) {
        submenu.style.top = '';
        submenu.style.bottom = '';
        submenu.style.removeProperty('max-height');
        submenu.style.removeProperty('overflow-y');
    }
    menu.classList.add('active');

    const menuWidth = menu.offsetWidth;
    const availableMenuHeight = Math.max(0, viewportBottom - viewportMargin);
    if (menu.offsetHeight > availableMenuHeight) {
        menu.style.setProperty('max-height', `${availableMenuHeight}px`);
        menu.style.setProperty('overflow-y', 'auto', 'important');
    }
    const menuHeight = menu.offsetHeight;
    const x = Math.min(
        Math.max(Number.isFinite(clientX) ? clientX : viewportMargin, viewportMargin),
        Math.max(viewportMargin, window.innerWidth - menuWidth - viewportMargin)
    );
    const y = Math.min(
        Math.max(Number.isFinite(clientY) ? clientY : viewportMargin, viewportMargin),
        Math.max(viewportMargin, viewportBottom - menuHeight)
    );
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    if (!submenu) return;
    let { width: submenuWidth, height: submenuHeight } = getMindMapContextSubmenuSize(submenu);
    if (submenuHeight > availableMenuHeight) {
        submenu.style.setProperty('max-height', `${availableMenuHeight}px`);
        submenu.style.setProperty('overflow-y', 'auto');
        submenuHeight = availableMenuHeight;
    }
    const menuRect = menu.getBoundingClientRect();
    const opensRight = menuRect.right + 4 + submenuWidth <= window.innerWidth - viewportMargin;
    const opensLeft = menuRect.left - 4 - submenuWidth >= viewportMargin;
    if (!opensRight && (opensLeft || menuRect.left > window.innerWidth - menuRect.right)) {
        menu.classList.add('submenu-opens-left');
    }

    const parentRect = submenu.parentElement.getBoundingClientRect();
    const preferredTop = parentRect.top - 40;
    const top = Math.min(
        Math.max(preferredTop, viewportMargin),
        Math.max(viewportMargin, viewportBottom - submenuHeight)
    );
    submenu.style.top = `${top - parentRect.top}px`;
    submenu.style.bottom = 'auto';
}

function initializeMapContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    let contextTargetKind = 'node';
    let contextTargetId = null;

    const resetActionVisibility = () => {
        contextMenu.querySelectorAll(':scope > .menu-item[data-action]').forEach(item => {
            item.style.display = '';
        });
    };
    const setActionVisibility = (action, visible) => {
        const item = contextMenu.querySelector(`:scope > .menu-item[data-action="${action}"]`);
        if (item) item.style.display = visible ? '' : 'none';
    };
    const setDeleteLabel = label => {
        const item = contextMenu.querySelector(':scope > .menu-item[data-action="delete"]');
        if (!item) return;
        const icon = item.querySelector('i');
        item.replaceChildren();
        if (icon) item.appendChild(icon);
        item.append(` ${label}`);
    };
    
    // 1. 监听右键点击 (呼出菜单)
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.bookmark-manager-container')) return;
        const summaryEditor = e.target.closest('.summary-editor');
        const card = e.target.closest('.node-card');
        if (!summaryEditor && !card) return;

        e.preventDefault();
        resetActionVisibility();

        const expandItem=contextMenu.querySelector('.menu-item[data-action="expand"]');
        const collapseItem=contextMenu.querySelector('.menu-item[data-action="collapse"]');
        const toStandardItem=contextMenu.querySelector('.menu-item[data-action="to-standard"]');
        const toSimpleItem=contextMenu.querySelector('.menu-item[data-action="to-simple"]');
        const addRelationItem=contextMenu.querySelector('.menu-item[data-action="add-relation"]');
        const createTabItem=contextMenu.querySelector('.menu-item[data-action="create-tab-from-node"]');

        if (summaryEditor) {
            const summary = getMindMapSummaryById(summaryEditor.dataset.summaryId);
            if (!summary) {
                contextMenu.classList.remove('active');
                return;
            }
            contextTargetKind = 'summary';
            contextTargetId = summary.id;
            selectMindMapSummary(summary.id);
            setDeleteLabel('删除总结');
            ['cut', 'copy', 'paste', 'add-relation', 'create-tab-from-node', 'expand', 'collapse']
                .forEach(action => setActionVisibility(action, false));
            toStandardItem.style.display = summary.isSimple ? '' : 'none';
            toSimpleItem.style.display = summary.isSimple ? 'none' : '';
            positionMindMapContextMenu(contextMenu, e.clientX, e.clientY);
            return;
        }

        contextTargetKind = 'node';
        contextTargetId = card.dataset.nodeId;
        setDeleteLabel('删除节点');
        clearSelectedMindMapRelation();
        clearSelectedMindMapSummary();
        const node = findNode(state.data, card.dataset.nodeId);
        const isCompactCollapsed = isTemporarilyCollapsed(node);

        if (!node) {
            contextMenu.classList.remove('active');
            return;
        }
        if (node.isSimple){     // 便利贴模式
            toStandardItem.style.display='block';
            toSimpleItem.style.display='none';
            expandItem.style.display='none';
            collapseItem.style.display='none';
        }else if (isCompactCollapsed){ // 临时精简视图不允许暗中修改持久折叠状态
            toStandardItem.style.display='none';
            toSimpleItem.style.display='none';
            expandItem.style.display='none';
            collapseItem.style.display='none';
        }else{                  // 标准卡片模式
            if (node.contentCollapsed){ // 折叠状态
                toStandardItem.style.display='none';
                toSimpleItem.style.display='none';
                collapseItem.style.display='none';
                expandItem.style.display=card.classList.contains('has-content')?'block':'none';
            }else{      // 展开状态
                if (card.classList.contains('topic-empty')){
                    toStandardItem.style.display='none';
                    toSimpleItem.style.display='none';
                    expandItem.style.display='none';
                    collapseItem.style.display='none';
                }else{
                    toStandardItem.style.display='none';
                    toSimpleItem.style.display='block';
                    expandItem.style.display='none';
                    collapseItem.style.display=card.classList.contains('has-content')?'block':'none';
                }
                
            }
        }

        // 选中逻辑
        const nodeId = card.dataset.nodeId;
        if (!state.selectedIds.has(nodeId)) {
            state.selectedIds.clear();
            state.selectedIds.add(nodeId);
            updateSelection();
        }

        // 右击双选中的任一卡片时保留双选，并提供与工具栏一致的关联入口。
        const canAddRelation = state.selectedIds.size === 2;
        addRelationItem.style.display = canAddRelation ? '' : 'none';
        createTabItem.style.display = state.selectedIds.size === 1 ? '' : 'none';
        positionMindMapContextMenu(contextMenu, e.clientX, e.clientY);
    });

    // 2. 菜单动作处理
    contextMenu.addEventListener('click', (e) => {
        // 如果点击的是自定义颜色的 Input 或 按钮容器，不触发这里的主逻辑
        if (e.target.closest('.custom-color-btn') || e.target.tagName === 'INPUT') return;

        const item = e.target.closest('.menu-item');
        const swatch = e.target.closest('.color-swatch'); // 【修改】使用新类名

        if ((!item && !swatch) || (!swatch && item && item.classList.contains('has-submenu'))) return;

        let action = item ? item.dataset.action : null;
        let colorVal = null;

        if (swatch) {
            action = 'set-color';
            colorVal = swatch.dataset.color; // 【修改】使用 data-val
        }
        if (contextTargetKind === 'summary') {
            const summary = getMindMapSummaryById(contextTargetId);
            if (!summary) {
                contextMenu.classList.remove('active');
                return;
            }
            if (action === 'copy-md') {
                navigator.clipboard.writeText(summary.content || '');
                showTopToast('✅ Markdown内容已复制！');
            } else if (action === 'delete') {
                state.selectedSummaryId = summary.id;
                deleteSelectedMindMapSummary();
            } else if (action === 'auto-fit') {
                autoFitMindMapEntity(summary, 'summary');
            } else if (
                (action === 'to-simple' && !summary.isSimple)
                || (action === 'to-standard' && summary.isSimple)
            ) {
                toggleMindMapEntitySimpleMode(summary);
                recordHistory();
                scheduleRenderMindMapSummaries();
            } else if (action === 'set-color' && applyColorToMindMapSelection(colorVal)) {
                recordHistory();
            }
            contextMenu.classList.remove('active');
            return;
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
        if (action === 'add-relation') {
            addRelationBetweenSelectedCards({ x: e.clientX, y: e.clientY });
            contextMenu.classList.remove('active');
            return;
        }
        if (action === 'create-tab-from-node') {
            createMindMapTabFromSelectedNode();
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

        positionMindMapContextMenu(menu, e.clientX, e.clientY);
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
function selectAllMindMapNodes() {
    clearSelectedMindMapRelation();
    clearSelectedMindMapSummary();
    state.selectedIds.clear();
    collectMindMapNodeIds(state.data).forEach(nodeId => state.selectedIds.add(nodeId));
    window.getSelection()?.removeAllRanges();
    updateSelection();
}

function getVisibleMindMapNodeCard(nodeId) {
    const card = nodeId ? document.getElementById(`card-${nodeId}`) : null;
    return card && card.getClientRects().length > 0 ? card : null;
}

function getMindMapClosestVisibleNodeId(nodeIds, referenceNodeId) {
    const referenceCard = getVisibleMindMapNodeCard(referenceNodeId);
    const referenceRect = referenceCard?.getBoundingClientRect();
    const referenceY = referenceRect ? referenceRect.top + referenceRect.height / 2 : 0;
    let closestId = null;
    let closestDistance = Infinity;

    (nodeIds || []).forEach(nodeId => {
        const card = getVisibleMindMapNodeCard(nodeId);
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const distance = referenceRect ? Math.abs(rect.top + rect.height / 2 - referenceY) : 0;
        if (distance < closestDistance) {
            closestId = nodeId;
            closestDistance = distance;
        }
    });
    return closestId;
}

function getMindMapKeyboardNavigationTarget(nodeId, key) {
    const node = findNode(state.data, nodeId);
    if (!node) return null;

    if (key === 'ArrowUp' || key === 'ArrowDown') {
        const parent = findParent(state.data, nodeId);
        if (!parent) return null;
        const branchSide = getMindMapNodeBranchSide(nodeId);
        const siblings = (parent.children || []).filter(sibling => {
            if (!getVisibleMindMapNodeCard(sibling.id)) return false;
            return parent.id !== state.data.id || getMindMapNodeBranchSide(sibling.id) === branchSide;
        });
        const index = siblings.findIndex(sibling => sibling.id === nodeId);
        const targetIndex = index + (key === 'ArrowUp' ? -1 : 1);
        return index >= 0 && targetIndex >= 0 && targetIndex < siblings.length
            ? siblings[targetIndex].id
            : null;
    }

    if (node.id === state.data.id) {
        const targetSide = key === 'ArrowLeft' ? 'left' : (key === 'ArrowRight' ? 'right' : null);
        if (!targetSide) return null;
        const children = (node.children || [])
            .filter(child => getMindMapNodeBranchSide(child.id) === targetSide)
            .map(child => child.id);
        return getMindMapClosestVisibleNodeId(children, node.id);
    }

    const branchSide = getMindMapNodeBranchSide(nodeId);
    const towardRoot = (branchSide === 'right' && key === 'ArrowLeft')
        || (branchSide === 'left' && key === 'ArrowRight');
    if (towardRoot) return findParent(state.data, nodeId)?.id || null;

    const awayFromRoot = (branchSide === 'right' && key === 'ArrowRight')
        || (branchSide === 'left' && key === 'ArrowLeft');
    if (!awayFromRoot) return null;
    return getMindMapClosestVisibleNodeId((node.children || []).map(child => child.id), node.id);
}

function keepMindMapKeyboardSelectionVisible(card) {
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const toolbarRect = document.querySelector('.toolbar')?.getBoundingClientRect();
    const margin = 24;
    const viewport = {
        left: margin,
        top: Math.max(margin, (toolbarRect?.bottom || 0) + 12),
        right: window.innerWidth - margin,
        bottom: window.innerHeight - margin
    };
    let dx = 0;
    let dy = 0;
    if (rect.left < viewport.left) dx = viewport.left - rect.left;
    else if (rect.right > viewport.right) dx = viewport.right - rect.right;
    if (rect.top < viewport.top) dy = viewport.top - rect.top;
    else if (rect.bottom > viewport.bottom) dy = viewport.bottom - rect.bottom;
    if (!dx && !dy) return;
    state.view.tx += dx;
    state.view.ty += dy;
    updateTransform();
}

function moveMindMapSelectionByArrow(key) {
    if (state.selectedIds.size !== 1) return false;
    const currentId = Array.from(state.selectedIds)[0];
    const targetId = getMindMapKeyboardNavigationTarget(currentId, key);
    if (!targetId || targetId === currentId) return false;

    clearSelectedMindMapRelation();
    clearSelectedMindMapSummary();
    state.selectedIds.clear();
    state.selectedIds.add(targetId);
    window.getSelection()?.removeAllRanges();
    updateSelection();
    keepMindMapKeyboardSelectionVisible(getVisibleMindMapNodeCard(targetId));
    return true;
}

function openMindMapEditor(node, readOnly = false, focusSource = false) {
    if (!node) return;
    const entityKind = getMindMapSummaryById(node.id) === node ? 'summary' : 'node';
    syncCurrentInput();
    state.editingNode = node;
    state.editingEntityKind = entityKind;
    state.isReadOnly = readOnly;
    $('#editorModal').classList.add('active');
    $('#modalWin').className = readOnly ? 'modal-win narrow' : 'modal-win';
    $('#modalTopicInput').value = entityKind === 'summary' ? (node.topic ?? '总结') : (node.topic || '');
    $('#modalTopicInput').disabled = readOnly;
    const sourceEditor = $('#editorTextarea');
    const content = entityKind === 'summary' ? getMindMapSummaryContent(node) : (node.content || '');
    sourceEditor.value = content;
    sourceEditor.parentElement.style.display = readOnly ? 'none' : 'flex';
    $('#previewContent').innerHTML = renderMarkdown(content);
    processRichContent($('#previewContent'));
    $('#btn-close-modal').innerText = readOnly ? '关闭' : '完成';
    if (focusSource && !readOnly) {
        sourceEditor.focus();
        sourceEditor.setSelectionRange(sourceEditor.value.length, sourceEditor.value.length);
    }
}

function initializeMapClickEvents() {
    document.addEventListener('click', (e) => {
        const t = e.target;
        if(!t.closest('#btn-color') && !t.closest('.color-popup')) $('#colorPopup').classList.remove('show');
        if (!t.closest('[data-action="navigate-relation"]') && !t.closest('#relationNavigationMenu')) {
            closeMindMapRelationNavigationMenu();
        }
        const foldBtn = t.closest('.fold-btn');
        if(foldBtn) {
            const action = foldBtn.dataset.action;
            if(action === 'fold-root-left') {
                mapSearchState.revealedRootDirections.delete('left');
                state.data.foldedLeft = !state.data.foldedLeft; recordHistory(); renderTree(); return;
            }
            if(action === 'fold-root-right') {
                mapSearchState.revealedRootDirections.delete('right');
                state.data.foldedRight = !state.data.foldedRight; recordHistory(); renderTree(); return;
            }
            if(action === 'fold') {
                syncCurrentInput();
                const n = findNode(state.data, foldBtn.closest('.node-card').dataset.nodeId);
                mapSearchState.revealedNodeIds.delete(n.id);
                n.folded = !n.folded; recordHistory(); updateChildrenDOM(n.id); return;
            }
        }
        const relationNavigationTrigger = t.closest('[data-action="navigate-relation"]');
        if(relationNavigationTrigger) {
            const card = relationNavigationTrigger.closest('.node-card');
            if (card) openMindMapRelationNavigationMenu(card.dataset.nodeId, relationNavigationTrigger);
            return;
        }
        if(t.dataset.action === 'toggle-simple') {
            syncCurrentInput();
            const n = findNode(state.data, t.closest('.node-card').dataset.nodeId);
            toggleMindMapEntitySimpleMode(n);
            
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
            autoFitMindMapEntity(n, 'node', 'wh');
            return;
        }
        if(t.closest('#dock-handle')) { state.dockCollapsed = !state.dockCollapsed; renderDock(); }
    });
    document.addEventListener('dblclick', (e) => {
        const t = e.target;
        
        // --- 修复：支持 Dock 卡片双击 ---
        const dockCard = t.closest('.dock-card');
        if(dockCard) {
            const idx = parseInt(dockCard.dataset.index);
            openMindMapEditor({ topic: dockData[idx].question, content: dockData[idx].answer }, true);
            return;
        }

        // 普通卡片与总结卡片共用双击手柄自适应；便利贴不再排除宽度重置。
        const resizeHandle = t.closest('.resize-handle');
        if (resizeHandle) {
            const resizeTarget = getMindMapResizeTarget(resizeHandle);
            if (resizeTarget) {
                autoFitMindMapEntity(resizeTarget.entity, resizeTarget.kind, resizeHandle.dataset.resize);
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        // --- 修复：双击卡片打开编辑 ---
        const header = t.closest('.card-header');
        if(header && !t.closest('.header-tools') && !t.classList.contains('node-topic')) {
            const n = findNode(state.data, header.closest('.node-card').dataset.nodeId);
            // 便利贴模式也可以双击打开编辑器 (可选)
            if (n) openMindMapEditor(n);
            return;
        }
        const body = t.closest('.card-body');
        if(body) {
            const n = findNode(state.data, body.closest('.node-card').dataset.nodeId);
            openMindMapEditor(n);
            return;
        }
    });

}


// =============================================================================
// #region 鼠标事件监听初始化
// =============================================================================
function clampMindMapContentPreview(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

function getMindMapRectOverlapArea(first, second) {
    const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    return width * height;
}

function getMindMapContentPreviewArrowMetrics(placement, cardRect, previewRect) {
    const isVerticalPlacement = placement === 'bottom' || placement === 'top';
    const target = isVerticalPlacement
        ? cardRect.left + cardRect.width / 2 - previewRect.left
        : cardRect.top + cardRect.height / 2 - previewRect.top;
    const edgeLength = isVerticalPlacement ? previewRect.width : previewRect.height;
    const offset = clampMindMapContentPreview(
        target,
        MINDMAP_CONTENT_PREVIEW_ARROW_INSET,
        edgeLength - MINDMAP_CONTENT_PREVIEW_ARROW_INSET,
    );
    return {
        offset,
        alignmentError: Math.abs(target - offset),
        edgeClearance: Math.min(offset, Math.max(0, edgeLength - offset)),
    };
}

function getMindMapContentPreviewArrowOffset(placement, cardRect, previewRect) {
    return getMindMapContentPreviewArrowMetrics(placement, cardRect, previewRect).offset;
}

function getMindMapContentPreviewAvailableContentHeight(placement, previewRect, contentRect, viewport) {
    const availableOuterHeight = placement === 'bottom'
        ? Math.max(0, viewport.bottom - previewRect.top)
        : placement === 'top'
            ? Math.max(0, previewRect.bottom - viewport.top)
            : Math.max(0, viewport.bottom - viewport.top);
    const outerChromeHeight = Math.max(0, previewRect.height - contentRect.height);
    return Math.max(0, availableOuterHeight - outerChromeHeight);
}

function getMindMapContentPreviewPlacement(cardRect, previewRect, viewport, occupiedRects = [], allowTop = false) {
    const previewWidth = previewRect.width;
    const previewHeight = previewRect.height;
    const cardCenterX = cardRect.left + cardRect.width / 2;
    const cardCenterY = cardRect.top + cardRect.height / 2;
    const viewportHeight = Math.max(0, viewport.bottom - viewport.top);
    const sideHeight = Math.min(
        previewHeight,
        Math.max(MINDMAP_CONTENT_PREVIEW_MIN_HEIGHT, viewportHeight),
    );
    const buildSideCandidate = (placement, availableWidth) => {
        const sideWidth = Math.min(previewWidth, Math.max(0, availableWidth));
        const horizontalFits = sideWidth >= MINDMAP_CONTENT_PREVIEW_MIN_WIDTH;
        const left = placement === 'right'
            ? cardRect.right + MINDMAP_CONTENT_PREVIEW_GAP
            : cardRect.left - MINDMAP_CONTENT_PREVIEW_GAP - sideWidth;
        const top = clampMindMapContentPreview(
            cardCenterY - sideHeight / 2,
            viewport.top,
            viewport.bottom - sideHeight,
        );
        const rect = {
            left,
            top,
            right: left + sideWidth,
            bottom: top + sideHeight,
        };
        const overlap = occupiedRects.reduce((total, occupied) => total + getMindMapRectOverlapArea(rect, occupied), 0);
        const arrow = getMindMapContentPreviewArrowMetrics(placement, cardRect, {
            left,
            top,
            width: sideWidth,
            height: sideHeight,
        });
        return {
            placement,
            left,
            top,
            maxHeight: sideHeight,
            maxWidth: sideWidth,
            availableHeight: viewportHeight,
            horizontalFits,
            fullyVisible: horizontalFits && rect.top >= viewport.top && rect.bottom <= viewport.bottom,
            overlap,
            arrowOffset: arrow.offset,
            arrowAlignmentError: arrow.alignmentError,
            arrowEdgeClearance: arrow.edgeClearance,
        };
    };

    const buildVerticalCandidate = placement => {
        const availableHeight = placement === 'top'
            ? Math.max(0, cardRect.top - MINDMAP_CONTENT_PREVIEW_GAP - viewport.top)
            : Math.max(0, viewport.bottom - cardRect.bottom - MINDMAP_CONTENT_PREVIEW_GAP);
        const candidateWidth = Math.min(previewWidth, Math.max(0, viewport.right - viewport.left));
        const candidateHeight = Math.min(
            previewHeight,
            Math.max(MINDMAP_CONTENT_PREVIEW_MIN_HEIGHT, availableHeight),
        );
        const left = clampMindMapContentPreview(
            cardCenterX - candidateWidth / 2,
            viewport.left,
            viewport.right - candidateWidth,
        );
        const top = placement === 'top'
            ? cardRect.top - MINDMAP_CONTENT_PREVIEW_GAP - candidateHeight
            : cardRect.bottom + MINDMAP_CONTENT_PREVIEW_GAP;
        const rect = {
            left,
            top,
            right: left + candidateWidth,
            bottom: top + candidateHeight,
        };
        const arrow = getMindMapContentPreviewArrowMetrics(placement, cardRect, {
            left,
            top,
            width: candidateWidth,
            height: candidateHeight,
        });
        return {
            placement,
            left,
            top,
            maxHeight: candidateHeight,
            maxWidth: candidateWidth,
            availableHeight,
            horizontalFits: candidateWidth >= MINDMAP_CONTENT_PREVIEW_MIN_WIDTH,
            verticallyUsable: availableHeight >= MINDMAP_CONTENT_PREVIEW_MIN_HEIGHT,
            fullyVisible: rect.top >= viewport.top && rect.bottom <= viewport.bottom,
            overlap: occupiedRects.reduce(
                (total, occupied) => total + getMindMapRectOverlapArea(rect, occupied),
                0,
            ),
            arrowOffset: arrow.offset,
            arrowAlignmentError: arrow.alignmentError,
            arrowEdgeClearance: arrow.edgeClearance,
        };
    };
    const bottomCandidate = buildVerticalCandidate('bottom');
    const topCandidate = allowTop ? buildVerticalCandidate('top') : null;
    const rightAvailableWidth = viewport.right - cardRect.right - MINDMAP_CONTENT_PREVIEW_GAP;
    const leftAvailableWidth = cardRect.left - MINDMAP_CONTENT_PREVIEW_GAP - viewport.left;
    const sideCandidates = [
        buildSideCandidate('right', rightAvailableWidth),
        buildSideCandidate('left', leftAvailableWidth),
    ];
    const horizontalCandidates = sideCandidates.filter(candidate => candidate.horizontalFits);
    const usableTopCandidates = topCandidate?.verticallyUsable && topCandidate.horizontalFits
        ? [topCandidate]
        : [];
    // 卡片工具栏启用时不使用上方；关闭悬停工具栏后，上方与其他方向一起按可见性和遮挡面积择优。
    const eligibleCandidates = horizontalCandidates.length > 0
        ? [...horizontalCandidates, bottomCandidate, ...usableTopCandidates]
        : [bottomCandidate, ...usableTopCandidates];
    const selected = eligibleCandidates.reduce((best, candidate) => {
        if (!best) return candidate;
        const candidateArrowAligned = candidate.arrowAlignmentError <= 1;
        const bestArrowAligned = best.arrowAlignmentError <= 1;
        if (candidateArrowAligned !== bestArrowAligned) return candidateArrowAligned ? candidate : best;
        if (candidate.fullyVisible !== best.fullyVisible) return candidate.fullyVisible ? candidate : best;
        const candidateIsCrampedBottom = candidate.placement === 'bottom'
            && candidate.availableHeight < MINDMAP_CONTENT_PREVIEW_BOTTOM_COMFORT_HEIGHT;
        const bestIsCrampedBottom = best.placement === 'bottom'
            && best.availableHeight < MINDMAP_CONTENT_PREVIEW_BOTTOM_COMFORT_HEIGHT;
        // 下方只剩狭窄走廊时，优先选择可读的左右（或上方）候选；不能因为下方恰好无重叠就塞进 Tab 栏前的缝隙。
        if (candidateIsCrampedBottom !== bestIsCrampedBottom) {
            return candidateIsCrampedBottom ? best : candidate;
        }
        const candidateArrowComfortable = candidate.arrowEdgeClearance >= MINDMAP_CONTENT_PREVIEW_ARROW_CORNER_CLEARANCE;
        const bestArrowComfortable = best.arrowEdgeClearance >= MINDMAP_CONTENT_PREVIEW_ARROW_CORNER_CLEARANCE;
        if (candidateArrowComfortable !== bestArrowComfortable) return candidateArrowComfortable ? candidate : best;
        if (candidate.arrowAlignmentError !== best.arrowAlignmentError) {
            return candidate.arrowAlignmentError < best.arrowAlignmentError ? candidate : best;
        }
        return candidate.overlap < best.overlap ? candidate : best;
    }, null);

    return selected;
}

function clearMindMapContentPreviewTimer(name) {
    if (mindMapContentPreviewState[name]) {
        clearTimeout(mindMapContentPreviewState[name]);
        mindMapContentPreviewState[name] = null;
    }
}

function hideMindMapContentPreview() {
    clearMindMapContentPreviewTimer('showTimer');
    clearMindMapContentPreviewTimer('hideTimer');
    mindMapContentPreviewState.el?.remove();
    mindMapContentPreviewState.el = null;
    mindMapContentPreviewState.card = null;
}

function scheduleMindMapContentPreviewHide() {
    clearMindMapContentPreviewTimer('showTimer');
    clearMindMapContentPreviewTimer('hideTimer');
    mindMapContentPreviewState.hideTimer = setTimeout(() => {
        const card = mindMapContentPreviewState.card;
        const preview = mindMapContentPreviewState.el;
        if (card?.matches(':hover') || preview?.matches(':hover')) return;
        hideMindMapContentPreview();
    }, 260);
}

function getMindMapContentPreviewViewport() {
    const toolbarRect = document.querySelector('.toolbar')?.getBoundingClientRect();
    const toolbarBottom = toolbarRect && toolbarRect.bottom > 0 ? toolbarRect.bottom + MINDMAP_CONTENT_PREVIEW_MARGIN : 0;
    return {
        left: MINDMAP_CONTENT_PREVIEW_MARGIN,
        top: Math.max(MINDMAP_CONTENT_PREVIEW_MARGIN, toolbarBottom),
        right: window.innerWidth - MINDMAP_CONTENT_PREVIEW_MARGIN,
        bottom: getMindMapUsableViewportBottom(MINDMAP_CONTENT_PREVIEW_MARGIN),
    };
}

function getMindMapContentPreviewOccupiedRects(sourceCard) {
    return Array.from(document.querySelectorAll('.node-card, .summary-editor, .card-floating-tools, .card-dock-container, .toolbar, .mindmap-tabs, .map-search-panel, .mindmap-settings-popover'))
        .filter(element => {
            if (element === sourceCard || element.getClientRects().length === 0) return false;
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden';
        })
        .map(element => element.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
}

function fitMindMapContentPreviewToViewport(preview, previewContent, card, placement, viewport) {
    if (!preview?.isConnected || !previewContent || !card?.isConnected) return;

    // 使用真实排版尺寸扣除外框厚度，避免“正文高度刚好、外框仍越界”。
    for (let pass = 0; pass < 2; pass += 1) {
        const previewRect = preview.getBoundingClientRect();
        const contentRect = previewContent.getBoundingClientRect();
        const availableContentHeight = getMindMapContentPreviewAvailableContentHeight(
            placement.placement,
            previewRect,
            contentRect,
            viewport,
        );
        const maxContentHeight = Math.min(placement.maxHeight, availableContentHeight);
        previewContent.style.minHeight = `${Math.min(MINDMAP_CONTENT_PREVIEW_MIN_HEIGHT, maxContentHeight)}px`;
        previewContent.style.maxHeight = `${maxContentHeight}px`;

        const resizedRect = preview.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const desiredLeft = placement.placement === 'right'
            ? cardRect.right + MINDMAP_CONTENT_PREVIEW_GAP
            : placement.placement === 'left'
                ? cardRect.left - MINDMAP_CONTENT_PREVIEW_GAP - resizedRect.width
                : cardRect.left + cardRect.width / 2 - resizedRect.width / 2;
        const correctedLeft = clampMindMapContentPreview(
            desiredLeft,
            viewport.left,
            viewport.right - resizedRect.width,
        );
        preview.style.left = `${correctedLeft}px`;
        if (placement.placement === 'top') {
            preview.style.top = `${clampMindMapContentPreview(
                cardRect.top - MINDMAP_CONTENT_PREVIEW_GAP - resizedRect.height,
                viewport.top,
                viewport.bottom - resizedRect.height,
            )}px`;
        } else if (placement.placement !== 'bottom') {
            const cardCenterY = cardRect.top + cardRect.height / 2;
            preview.style.top = `${clampMindMapContentPreview(
                cardCenterY - resizedRect.height / 2,
                viewport.top,
                viewport.bottom - resizedRect.height,
            )}px`;
        }
    }

    const actualArrowOffset = getMindMapContentPreviewArrowOffset(
        placement.placement,
        card.getBoundingClientRect(),
        preview.getBoundingClientRect(),
    );
    preview.style.setProperty('--preview-arrow-offset', `${actualArrowOffset}px`);
}

function positionMindMapContentPreview(preview, previewContent, card, resetNaturalSize = false) {
    if (!preview?.isConnected || !previewContent || !card?.isConnected) return null;
    if (resetNaturalSize) {
        // 富内容（特别是 Mermaid）渲染后必须先恢复自然尺寸，再重新比较四个方向。
        preview.style.removeProperty('max-width');
        previewContent.style.removeProperty('min-height');
        previewContent.style.removeProperty('max-height');
    }

    const viewport = getMindMapContentPreviewViewport();
    const placement = getMindMapContentPreviewPlacement(
        card.getBoundingClientRect(),
        preview.getBoundingClientRect(),
        viewport,
        getMindMapContentPreviewOccupiedRects(card),
        !mindMapSettings.cardToolbarHover,
    );
    preview.dataset.placement = placement.placement;
    preview.style.maxWidth = `${placement.maxWidth}px`;
    previewContent.style.maxHeight = `${placement.maxHeight}px`;
    preview.style.left = `${placement.left}px`;
    preview.style.top = `${placement.top}px`;
    fitMindMapContentPreviewToViewport(preview, previewContent, card, placement, viewport);
    return placement;
}

function canShowMindMapContentPreview(card) {
    if (!card?.isConnected) return false;
    const node = findNode(state.data, card.dataset.nodeId);
    return Boolean(String(node?.content || '').trim())
        && (card.classList.contains('simple') || !card.querySelector('.card-body'));
}

function showMindMapContentPreview(card) {
    clearMindMapContentPreviewTimer('showTimer');
    clearMindMapContentPreviewTimer('hideTimer');
    if (!canShowMindMapContentPreview(card)) return;
    if (mindMapContentPreviewState.card === card && mindMapContentPreviewState.el) return;

    hideMindMapContentPreview();
    const node = findNode(state.data, card.dataset.nodeId);
    const preview = document.createElement('div');
    preview.className = `card-content-preview${card.classList.contains('simple') ? ' simple-preview' : ''}`;
    preview.dataset.placement = 'bottom';
    preview.tabIndex = 0;
    preview.setAttribute('aria-label', `${node.topic || '卡片'}的内容预览`);
    // 与普通卡片共用 card-body/md-content 结构和 Markdown 渲染路径，确保样式及富内容一致。
    preview.innerHTML = createMindMapNodeContentBodyHTML(node.content);
    const previewContent = preview.firstElementChild;
    preview.addEventListener('pointerenter', () => clearMindMapContentPreviewTimer('hideTimer'));
    preview.addEventListener('pointerleave', event => {
        if (!card.contains(event.relatedTarget)) scheduleMindMapContentPreviewHide();
    });
    preview.addEventListener('pointerdown', () => preview.focus());
    preview.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            const range = document.createRange();
            range.selectNodeContents(preview);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            event.preventDefault();
        }
    });
    document.body.appendChild(preview);
    const processRichContentResult = processRichContent(previewContent);
    // 长内容绝不能因富内容布局或浏览器恢复行为而从中间开始显示。
    const resetPreviewScrollTop = () => {
        if (preview.isConnected) previewContent.scrollTop = 0;
    };
    resetPreviewScrollTop();
    requestAnimationFrame(resetPreviewScrollTop);
    setTimeout(resetPreviewScrollTop, 0);

    positionMindMapContentPreview(preview, previewContent, card);
    preview.classList.add('is-visible');
    mindMapContentPreviewState.card = card;
    mindMapContentPreviewState.el = preview;
    Promise.resolve(processRichContentResult).then(() => {
        requestAnimationFrame(() => {
            if (!preview.isConnected) return;
            positionMindMapContentPreview(preview, previewContent, card, true);
            requestAnimationFrame(() => {
                if (!preview.isConnected) return;
                positionMindMapContentPreview(preview, previewContent, card, true);
                resetPreviewScrollTop();
            });
        });
    });
}

function scheduleMindMapContentPreviewShow(card) {
    clearMindMapContentPreviewTimer('hideTimer');
    if (!canShowMindMapContentPreview(card) || mindMapContentPreviewState.card === card) return;
    clearMindMapContentPreviewTimer('showTimer');
    mindMapContentPreviewState.showTimer = setTimeout(() => {
        if (card.matches(':hover')) showMindMapContentPreview(card);
    }, 30);
}

function initializeMindMapContentPreview() {
    document.addEventListener('pointerover', event => {
        const card = event.target.closest('.node-card');
        if (!card || card.contains(event.relatedTarget)) return;
        scheduleMindMapContentPreviewShow(card);
    });
    document.addEventListener('pointerout', event => {
        const card = event.target.closest('.node-card');
        const preview = mindMapContentPreviewState.el;
        if (!card || card.contains(event.relatedTarget) || preview?.contains(event.relatedTarget)) return;
        scheduleMindMapContentPreviewHide();
    });
    window.addEventListener('resize', hideMindMapContentPreview);
}

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
        // 预览气泡位于画布外；在其中选择、复制文字时不能触发画布平移或卡片操作。
        if (e.target.closest('.card-content-preview')) return;
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
           e.target.closest('.mymodal') ||
           e.target.closest('.toolbar') || 
           e.target.closest('.mindmap-settings-popover') ||
           e.target.closest('.color-popup') || 
           e.target.closest('#contextMenu') || 
           e.target.closest('#editorContextMenu') ||
           e.target.closest('.mindmap-tabs') ||
           e.target.closest('#mindMapTabMenu') ||
           e.target.closest('.map-search-panel') ||
           e.target.closest('.relation-hit') ||
           e.target.closest('.summary-editor') ||
           e.target.closest('.summary-selection-action') ||
           e.target.closest('.fold-btn') ||    // 新增
           e.target.closest('.header-tools')   // 新增
        ) return;
        if (e.target.closest('.bookmark-manager-container')) return;
        clearSelectedMindMapRelation();
        clearSelectedMindMapSummary();
        state.startPos = {x:e.clientX, y:e.clientY}; state.viewStart = {x:state.view.tx, y:state.view.ty};

        if(e.target.classList.contains('resize-handle')) {
            const c = e.target.closest('.node-card');
            const n = findNode(state.data, c.dataset.nodeId);
            beginMindMapResize(e, n, 'node', c);
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
                    // 点击空白画布时提交并退出内联编辑，避免 :focus-within 让悬浮工具栏残留。
                    commitMindMapInlineEditor();
                    state.mode = 'PANNING';
                    e.preventDefault(); 

                    // 画布按下时先保留卡片选中；只有无位移单击才在 onMouseUp 中清除。

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
            const resizeKind = state.resize.kind || 'node';
            const s = state.view.scale;
            
            // 1. 计算新的尺寸值
            let newWidth = null;
            let newHeight = null;

            // --- A. 计算宽度 ---
            if(state.resize.dir.includes('w')) { 
                const card = state.resize.element || getMindMapResizableElement(n, resizeKind);
                const isLeftCard = card && card.classList.contains('left-side');
                let delta = e.clientX - state.resize.mx;
                if(isLeftCard) delta = -delta; 
                
                const rawWidth = state.resize.startW + (delta * state.resize.widthPointerFactor / s);
                newWidth = Math.max(state.resize.minWidth, Math.min(600, rawWidth)); // 限制范围
            }
            
            // --- B. 计算高度 ---
            if(state.resize.dir.includes('h')) { 
                const delta = (e.clientY - state.resize.my) * state.resize.heightPointerDirection;
                const isSimple = n.isSimple;
                const maxHeightLimit = isSimple ? 400 : 800;
                const rawHeight = state.resize.startH + (delta * state.resize.heightPointerFactor / s);
                newHeight = Math.max(state.resize.minHeight, Math.min(maxHeightLimit, rawHeight));
            }

            // 3. 应用到当前操作的节点
            applyMindMapEntitySize(n, resizeKind, newWidth, newHeight, n.isSimple);

            // 4. 同步应用到其他选中的节点
            if (resizeKind === 'node' && state.selectedIds.size > 1) {
                state.selectedIds.forEach(id => {
                    if (id === n.id) return; // 跳过自己
                    const targetNode = findNode(state.data, id);
                    if (targetNode) {
                        applyMindMapEntitySize(targetNode, 'node', newWidth, newHeight, n.isSimple);
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
            // 总结卡片已经直接更新当前 DOM；拖拽期间再次执行布局规划会改写它的
            // transform/位置，让手柄脱离光标。节点缩放仍需实时刷新关联的总结括号。
            if (resizeKind !== 'summary') scheduleRenderMindMapSummaries();

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
            const editingKind = state.editingEntityKind || 'node';
            const previousContent = editingKind === 'summary'
                ? getMindMapSummaryContent(state.editingNode)
                : (state.editingNode.content || '');
            
            // 检查是否有变化
            const topicChanged = state.editingNode.topic !== t;
            const contentChanged = previousContent !== c;

            if(topicChanged || contentChanged) { 
                state.editingNode.topic = t; 
                if (editingKind === 'summary') setMindMapSummaryContent(state.editingNode, c);
                else state.editingNode.content = c;
                recordHistory(); 

                if (editingKind === 'summary') {
                    scheduleRenderMindMapSummaries();
                } else {

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
        }
        $('#editorModal').classList.remove('active'); 
        state.editingNode = null;
        state.editingEntityKind = 'node';
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

// =============================================================================
// #region 卡片关联
// =============================================================================
const MINDMAP_RELATION_SVG_NS = 'http://www.w3.org/2000/svg';
const MINDMAP_RELATION_DIRECTIONS = new Set(['none', 'forward', 'reverse']);
const MINDMAP_RELATION_LINE_STYLES = new Set(['dashed', 'solid']);
const MINDMAP_RELATION_ROUTING_PADDING = 18;
const MINDMAP_RELATION_SOURCE_CLEARANCE = 28;
const MINDMAP_RELATION_TARGET_APPROACH = 32;    // 最后一次转弯阈值
const MINDMAP_RELATION_ARROW_SIZE = 12;
const MINDMAP_RELATION_FOLD_BUTTON_PADDING = 6;
const MINDMAP_RELATION_OBSTACLE_EDGE_PENALTY = 36;
const MINDMAP_RELATION_CHANNEL_DEVIATION_PENALTY = 48;
const MINDMAP_RELATION_TERMINAL_ALIGNMENT_PENALTY = 48;
const MINDMAP_RELATION_LANE_GAP = 12;
const MINDMAP_RELATION_TURN_PENALTY = 28;
const MINDMAP_RELATION_CROSSING_PENALTY = 420;
const MINDMAP_RELATION_OVERLAP_PENALTY = 720;
const MINDMAP_RELATION_RESERVED_SIDE_PENALTY = 1200;
const MINDMAP_RELATION_ROUTE_CANDIDATES = 12;
const MINDMAP_RELATION_PORT_PAIR_CANDIDATES = 4;
const MINDMAP_RELATION_PORT_DEVIATION_PENALTY = 0.2;
let relationRenderFrame = null;
let relationRouteCache = { key: '', routes: new Map() };

function getMindMapRelations() {
    return Array.isArray(state.data?.relations) ? state.data.relations : [];
}

function ensureMindMapRelations() {
    if (!Array.isArray(state.data.relations)) state.data.relations = [];
    return state.data.relations;
}

function getMindMapRelationById(relationId) {
    return getMindMapRelations().find(relation => relation.id === relationId) || null;
}

function getMindMapRelationDirection(relation) {
    return MINDMAP_RELATION_DIRECTIONS.has(relation?.direction) ? relation.direction : 'none';
}

function getMindMapRelationLineStyle(relation) {
    return MINDMAP_RELATION_LINE_STYLES.has(relation?.lineStyle) ? relation.lineStyle : 'dashed';
}

function getMindMapRelationColor(relation) {
    const color = String(relation?.color || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(color) ? color : '';
}

function getMindMapRelationLabel(relation) {
    return String(relation?.label || '').slice(0, 80);
}

function getMindMapRelatedCardItems(nodeId) {
    return getMindMapRelations().flatMap(relation => {
        let targetId = null;
        if (relation.sourceId === nodeId) targetId = relation.targetId;
        else if (relation.targetId === nodeId) targetId = relation.sourceId;
        if (!targetId) return [];
        const targetNode = findNode(state.data, targetId);
        if (!targetNode) return [];
        const topic = String(targetNode.topic || '').replace(/\s+/g, ' ').trim();
        return [{
            relationId: relation.id,
            targetId,
            topic: topic || '未命名卡片',
            label: getMindMapRelationLabel(relation).trim()
        }];
    });
}

function getMindMapNodePath(nodeId) {
    const path = [];
    let current = findNode(state.data, nodeId);
    while (current) {
        path.unshift(current);
        if (current.id === state.data.id) return path;
        current = findParent(state.data, current.id);
    }
    return [];
}

function closeMindMapRelationNavigationMenu() {
    const menu = $('#relationNavigationMenu');
    if (!menu) return;
    menu.classList.remove('active');
    menu.setAttribute('aria-hidden', 'true');
    menu.dataset.sourceNodeId = '';
}

function positionMindMapRelationNavigationMenu(anchor) {
    const menu = $('#relationNavigationMenu');
    if (!menu || !anchor) return;
    const anchorRect = anchor.getBoundingClientRect();
    const margin = 10;
    const width = menu.offsetWidth || 300;
    const height = menu.offsetHeight || 240;
    let left = anchorRect.left + anchorRect.width / 2 - width / 2;
    let top = anchorRect.bottom + 8;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    if (top + height > window.innerHeight - margin) {
        top = Math.max(margin, anchorRect.top - height - 8);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function openMindMapRelationNavigationMenu(nodeId, anchor) {
    const menu = $('#relationNavigationMenu');
    const list = $('#relationNavigationList');
    const count = $('#relationNavigationCount');
    if (!menu || !list || !count) return;
    const items = getMindMapRelatedCardItems(nodeId);
    if (items.length === 0) {
        closeMindMapRelationNavigationMenu();
        return;
    }

    list.replaceChildren();
    items.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'relation-navigation-item';
        button.dataset.targetNodeId = item.targetId;
        button.setAttribute('role', 'menuitem');

        const title = document.createElement('span');
        title.className = 'relation-navigation-item-title';
        title.textContent = item.topic;
        button.appendChild(title);

        const details = [];
        if (item.label) details.push(item.label);
        if (!document.getElementById(`card-${item.targetId}`)) details.push('当前已折叠');
        if (details.length > 0) {
            const meta = document.createElement('span');
            meta.className = 'relation-navigation-item-meta';
            meta.textContent = details.join(' · ');
            button.appendChild(meta);
        }
        list.appendChild(button);
    });

    count.textContent = String(items.length);
    menu.dataset.sourceNodeId = nodeId;
    menu.classList.add('active');
    menu.setAttribute('aria-hidden', 'false');
    positionMindMapRelationNavigationMenu(anchor);
}

function syncMindMapRelationNavigationButtons() {
    document.querySelectorAll('[data-action="navigate-relation"]').forEach(button => {
        const nodeId = button.closest('.node-card')?.dataset.nodeId;
        const count = nodeId ? getMindMapRelatedCardItems(nodeId).length : 0;
        button.hidden = count === 0;
        button.title = count > 0 ? `查看关联卡片（${count}）` : '查看关联卡片';
    });
}

function jumpToMindMapRelatedCard(targetId) {
    const targetNode = findNode(state.data, targetId);
    if (!targetNode) return;
    closeMindMapRelationNavigationMenu();

    if (!document.getElementById(`card-${targetId}`)) {
        const path = getMindMapNodePath(targetId);
        if (path.length === 0) return;
        clearMapSearchReveal();
        path.slice(1, -1).forEach(node => mapSearchState.revealedNodeIds.add(node.id));
        const rootChild = path[1];
        if (rootChild) {
            mapSearchState.revealedRootDirections.add(rootChild.dir === 'left' ? 'left' : 'right');
        }
        renderTree();
    }

    clearSelectedMindMapRelation();
    clearSelectedMindMapSummary();
    state.selectedIds.clear();
    state.selectedIds.add(targetId);
    updateSelection();

    requestAnimationFrame(() => requestAnimationFrame(() => {
        const card = document.getElementById(`card-${targetId}`);
        if (!card) return;
        centerMapNodeInVisibleArea(card);
        pulseMapSearchTarget(card);
    }));
}

function getMindMapNodeLabel(nodeId) {
    const node = findNode(state.data, nodeId);
    const label = String(node?.topic || '').replace(/\s+/g, ' ').trim();
    return label || '未命名卡片';
}

function closeMindMapRelationEditor() {
    const panel = $('#relationEditor');
    if (!panel) return;
    panel.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
}

function commitMindMapRelationEditor() {
    const panel = $('#relationEditor');
    const relation = getMindMapRelationById(state.selectedRelationId);
    if (!panel?.classList.contains('active') || !relation) return;
    const labelInput = $('#relationLabelInput');
    if (labelInput) relation.label = labelInput.value.slice(0, 80);
    recordHistory();
}

function syncMindMapRelationEditor(relation) {
    const panel = $('#relationEditor');
    if (!panel || !relation) return;
    const sourceLabel = getMindMapNodeLabel(relation.sourceId);
    const targetLabel = getMindMapNodeLabel(relation.targetId);
    $('#relationEditorTitle').textContent = `${sourceLabel}  ·  ${targetLabel}`;
    $('#relationLabelInput').value = getMindMapRelationLabel(relation);

    const direction = getMindMapRelationDirection(relation);
    panel.querySelectorAll('[data-relation-direction]').forEach(button => {
        const active = button.dataset.relationDirection === direction;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        if (button.dataset.relationDirection === 'forward') button.title = `${sourceLabel} → ${targetLabel}`;
        if (button.dataset.relationDirection === 'reverse') button.title = `${targetLabel} → ${sourceLabel}`;
    });

    const lineStyle = getMindMapRelationLineStyle(relation);
    panel.querySelectorAll('[data-relation-style]').forEach(button => {
        const active = button.dataset.relationStyle === lineStyle;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });

    const color = getMindMapRelationColor(relation);
    panel.querySelectorAll('[data-relation-color]').forEach(button => {
        const active = button.dataset.relationColor === color;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    if (color) $('#relationCustomColor').value = color;
}

function positionMindMapRelationEditor(clientPoint) {
    const panel = $('#relationEditor');
    if (!panel) return;
    if (!clientPoint) {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        return;
    }
    const width = panel.offsetWidth || 320;
    const height = panel.offsetHeight || 330;
    const left = Math.max(10, Math.min(clientPoint.x + 12, window.innerWidth - width - 10));
    const top = Math.max(10, Math.min(clientPoint.y + 12, window.innerHeight - height - 10));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
}

function openMindMapRelationEditor(relationId, clientPoint) {
    const relation = getMindMapRelationById(relationId);
    const panel = $('#relationEditor');
    if (!relation || !panel) return;
    syncMindMapRelationEditor(relation);
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
    positionMindMapRelationEditor(clientPoint);
}

function updateSelectedMindMapRelation(property, value, shouldRecord = true) {
    const relation = getMindMapRelationById(state.selectedRelationId);
    if (!relation) return;
    relation[property] = value;
    syncMindMapRelationEditor(relation);
    scheduleRenderMindMapRelations();
    if (shouldRecord) recordHistory();
}

function collectMindMapNodeIds(node, targetSet = new Set()) {
    if (!node) return targetSet;
    targetSet.add(node.id);
    (node.children || []).forEach(child => collectMindMapNodeIds(child, targetSet));
    return targetSet;
}

function getMindMapNodeTreeOrder() {
    const order = new Map();
    let index = 0;
    const visit = node => {
        if (!node) return;
        order.set(node.id, index++);
        (node.children || []).forEach(visit);
    };
    visit(state.data);
    return order;
}

function sortMindMapNodeIdsByTreeOrder(nodeIds) {
    const order = getMindMapNodeTreeOrder();
    return Array.from(new Set(nodeIds || []))
        .map((id, selectionIndex) => ({
            id,
            selectionIndex,
            treeIndex: order.get(id) ?? Number.MAX_SAFE_INTEGER
        }))
        .sort((left, right) => left.treeIndex - right.treeIndex || left.selectionIndex - right.selectionIndex)
        .map(item => item.id);
}

function getMindMapDragProcessingOrder(nodeIds, dropType) {
    const orderedNodes = sortMindMapNodeIdsByTreeOrder(nodeIds);
    // “插入到目标后方”时，后处理的节点会更靠近目标；反向处理可保持最终显示顺序。
    return dropType === 'AFTER' ? [...orderedNodes].reverse() : orderedNodes;
}

function removeMindMapRelationsForNodes(nodeIds) {
    if (!nodeIds || nodeIds.size === 0 || !Array.isArray(state.data.relations)) return false;
    const previousLength = state.data.relations.length;
    state.data.relations = state.data.relations.filter(relation =>
        !nodeIds.has(relation.sourceId) && !nodeIds.has(relation.targetId)
    );
    if (state.selectedRelationId && !state.data.relations.some(item => item.id === state.selectedRelationId)) {
        state.selectedRelationId = null;
        closeMindMapRelationEditor();
    }
    const changed = state.data.relations.length !== previousLength;
    if (changed) {
        closeMindMapRelationNavigationMenu();
        syncMindMapRelationNavigationButtons();
    }
    return changed;
}

function isDuplicateMindMapRelation(sourceId, targetId) {
    return getMindMapRelations().some(relation =>
        (relation.sourceId === sourceId && relation.targetId === targetId)
        || (relation.sourceId === targetId && relation.targetId === sourceId)
    );
}

function addRelationBetweenSelectedCards(clientPoint = null) {
    if (state.selectedIds.size !== 2) return;
    const [sourceId, targetId] = Array.from(state.selectedIds);
    if (sourceId === targetId || !findNode(state.data, sourceId) || !findNode(state.data, targetId)) return;
    if (isDuplicateMindMapRelation(sourceId, targetId)) {
        if (typeof showTopToast === 'function') showTopToast('⚠️ 这两张卡片已经有关联');
        return;
    }

    const relation = {
        id: `relation_${generateNodeId()}`,
        sourceId,
        targetId,
        label: '',
        direction: 'none',
        lineStyle: 'dashed',
        color: ''
    };
    ensureMindMapRelations().push(relation);
    state.selectedRelationId = relation.id;
    state.selectedSummaryId = null;
    state.selectedIds.clear();
    recordHistory();
    updateSelection();
    syncMindMapRelationNavigationButtons();
    scheduleRenderMindMapRelations();
    openMindMapRelationEditor(relation.id, clientPoint);
    if (typeof showTopToast === 'function') showTopToast('🔗 已建立卡片关联');
}

function deleteSelectedMindMapRelation() {
    const relationId = state.selectedRelationId;
    if (!relationId || !Array.isArray(state.data.relations)) return;
    const previousLength = state.data.relations.length;
    state.data.relations = state.data.relations.filter(relation => relation.id !== relationId);
    state.selectedRelationId = null;
    state.selectedSummaryId = null;
    closeMindMapRelationEditor();
    if (state.data.relations.length !== previousLength) {
        closeMindMapRelationNavigationMenu();
        syncMindMapRelationNavigationButtons();
        recordHistory();
        if (typeof showTopToast === 'function') showTopToast('🗑️ 已删除卡片关联');
    }
    scheduleRenderMindMapRelations();
    updateToolbar();
}

function clearSelectedMindMapRelation() {
    if (!state.selectedRelationId) return;
    commitMindMapRelationEditor();
    state.selectedRelationId = null;
    closeMindMapRelationEditor();
    scheduleRenderMindMapRelations();
    updateToolbar();
}

function selectMindMapRelation(relationId, clientPoint) {
    if (!getMindMapRelations().some(relation => relation.id === relationId)) return;
    if (state.selectedRelationId && state.selectedRelationId !== relationId) commitMindMapRelationEditor();
    state.selectedRelationId = relationId;
    state.selectedSummaryId = null;
    state.selectedIds.clear();
    updateSelection();
    scheduleRenderMindMapRelations();
    openMindMapRelationEditor(relationId, clientPoint);
}

function getMindMapRelationPath(
    sourceRect,
    targetRect,
    view = state.view,
    sourcePortContext = null,
    targetPortContext = null
) {
    const sourceCenter = {
        x: sourceRect.left + sourceRect.width / 2,
        y: sourceRect.top + sourceRect.height / 2
    };
    const targetCenter = {
        x: targetRect.left + targetRect.width / 2,
        y: targetRect.top + targetRect.height / 2
    };
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const scale = view.scale || 1;
    const toCanvasPoint = point => ({
        x: (point.x - view.tx) / scale,
        y: (point.y - view.ty) / scale
    });

    let sourcePoint;
    let targetPoint;
    if (horizontal) {
        const sourceSide = dx >= 0 ? 'right' : 'left';
        const targetSide = dx >= 0 ? 'left' : 'right';
        sourcePoint = {
            x: sourceSide === 'right' ? sourceRect.right : sourceRect.left,
            y: getMindMapRelationPreferredAlong(
                sourceRect,
                sourceSide,
                targetRect,
                sourcePortContext
            )
        };
        targetPoint = {
            x: targetSide === 'left' ? targetRect.left : targetRect.right,
            y: getMindMapRelationPreferredAlong(
                targetRect,
                targetSide,
                sourceRect,
                targetPortContext
            )
        };
    } else {
        sourcePoint = { x: sourceCenter.x, y: dy >= 0 ? sourceRect.bottom : sourceRect.top };
        targetPoint = { x: targetCenter.x, y: dy >= 0 ? targetRect.top : targetRect.bottom };
    }

    const from = toCanvasPoint(sourcePoint);
    const to = toCanvasPoint(targetPoint);
    const distance = horizontal ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y);
    const curve = Math.max(42, distance * 0.42);
    let control1;
    let control2;
    if (horizontal) {
        const direction = to.x >= from.x ? 1 : -1;
        control1 = { x: from.x + direction * curve, y: from.y };
        control2 = { x: to.x - direction * curve, y: to.y };
    } else {
        const direction = to.y >= from.y ? 1 : -1;
        control1 = { x: from.x, y: from.y + direction * curve };
        control2 = { x: to.x, y: to.y - direction * curve };
    }

    const round = value => Math.round(value * 10) / 10;
    return `M ${round(from.x)} ${round(from.y)} C ${round(control1.x)} ${round(control1.y)}, ${round(control2.x)} ${round(control2.y)}, ${round(to.x)} ${round(to.y)}`;
}

function getMindMapCanvasRect(element, view = state.view) {
    const rect = element.getBoundingClientRect();
    const canvasLayer = document.getElementById('canvas-layer');
    const canvasRect = canvasLayer?.getBoundingClientRect();
    const fallbackScale = view.scale || 1;
    const scaleX = canvasLayer?.offsetWidth && canvasRect?.width
        ? canvasRect.width / canvasLayer.offsetWidth
        : fallbackScale;
    const scaleY = canvasLayer?.offsetHeight && canvasRect?.height
        ? canvasRect.height / canvasLayer.offsetHeight
        : fallbackScale;
    const canvasLeft = canvasRect?.left ?? view.tx;
    const canvasTop = canvasRect?.top ?? view.ty;
    const left = (rect.left - canvasLeft) / scaleX;
    const top = (rect.top - canvasTop) / scaleY;
    const width = rect.width / scaleX;
    const height = rect.height / scaleY;
    return {
        id: element.dataset.nodeId,
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height
    };
}

function expandMindMapRelationObstacle(rect, padding = MINDMAP_RELATION_ROUTING_PADDING) {
    return {
        id: rect.id,
        left: rect.left - padding,
        top: rect.top - padding,
        right: rect.right + padding,
        bottom: rect.bottom + padding
    };
}

function getMindMapRelationSideVector(side) {
    if (side === 'left') return { x: -1, y: 0 };
    if (side === 'right') return { x: 1, y: 0 };
    if (side === 'top') return { x: 0, y: -1 };
    return { x: 0, y: 1 };
}

function clampMindMapRelationPort(value, min, max) {
    if (min > max) return (min + max) / 2;
    return Math.max(min, Math.min(value, max));
}

function getMindMapRelationPort(
    rect,
    side,
    laneOffset = 0,
    padding = MINDMAP_RELATION_ROUTING_PADDING,
    preferredAlong = null
) {
    const horizontalSide = side === 'left' || side === 'right';
    const edgeLength = horizontalSide ? rect.height : rect.width;
    const inset = Math.min(12, edgeLength / 4);
    const centerAlong = horizontalSide ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    const desiredAlong = Number.isFinite(preferredAlong) ? preferredAlong : centerAlong;
    const along = horizontalSide
        ? clampMindMapRelationPort(desiredAlong + laneOffset, rect.top + inset, rect.bottom - inset)
        : clampMindMapRelationPort(desiredAlong + laneOffset, rect.left + inset, rect.right - inset);
    const port = horizontalSide
        ? { x: side === 'left' ? rect.left : rect.right, y: along }
        : { x: along, y: side === 'top' ? rect.top : rect.bottom };
    const vector = getMindMapRelationSideVector(side);
    return {
        port,
        routePoint: {
            x: port.x + vector.x * padding,
            y: port.y + vector.y * padding
        }
    };
}

function getMindMapRelationReservedSides(nodeId) {
    const reservedSides = new Set();
    if (nodeId === state.data.id) {
        const children = state.data.children || [];
        if (children.some(child => child.dir === 'left')) reservedSides.add('left');
        if (children.some(child => child.dir !== 'left')) reservedSides.add('right');
        return reservedSides;
    }
    reservedSides.add(isDescendantOfLeft(nodeId) ? 'right' : 'left');
    return reservedSides;
}

function getMindMapRelationPortContext(nodeId) {
    const node = findNode(state.data, nodeId);
    if (!node) return null;
    if (nodeId === state.data.id) {
        const childSides = [];
        const children = node.children || [];
        if (children.some(child => child.dir === 'left')) childSides.push('left');
        if (children.some(child => child.dir !== 'left')) childSides.push('right');
        return { branchSide: 'root', hasChildren: childSides.length > 0, childSides };
    }

    return {
        branchSide: getMindMapNodeBranchSide(nodeId),
        hasChildren: Boolean(node.children?.length)
    };
}

function isMindMapRelationSideOccupied(side, portContext) {
    if (!portContext || (side !== 'left' && side !== 'right')) return false;
    if (portContext.branchSide === 'root') {
        return portContext.childSides?.includes(side) || false;
    }

    const childSide = portContext.branchSide === 'left' ? 'left' : 'right';
    const parentSide = childSide === 'left' ? 'right' : 'left';
    return side === parentSide || (side === childSide && portContext.hasChildren);
}

function getMindMapRelationPreferredAlong(rect, side, otherRect, portContext = null) {
    const horizontalSide = side === 'left' || side === 'right';
    const centerAlong = horizontalSide ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    if (!horizontalSide || !otherRect || !isMindMapRelationSideOccupied(side, portContext)) {
        return centerAlong;
    }

    const otherCenterY = otherRect.top + otherRect.height / 2;
    if (otherCenterY < centerAlong) return rect.top + rect.height / 4;
    if (otherCenterY > centerAlong) return rect.top + rect.height * 3 / 4;
    return centerAlong;
}

function getMindMapRelationPortCandidates(
    rect,
    side,
    otherRect,
    padding,
    portContext = null
) {
    const horizontalSide = side === 'left' || side === 'right';
    const start = horizontalSide ? rect.top : rect.left;
    const length = horizontalSide ? rect.height : rect.width;
    const centerAlong = start + length / 2;
    const preferredAlong = getMindMapRelationPreferredAlong(rect, side, otherRect, portContext);
    const allowQuarterPorts = horizontalSide && isMindMapRelationSideOccupied(side, portContext);
    const rawCandidates = [
        { kind: 'preferred', along: preferredAlong, preferred: true },
        { kind: 'center', along: centerAlong },
        ...(allowQuarterPorts ? [
            { kind: 'quarter-start', along: start + length / 4 },
            { kind: 'quarter-end', along: start + length * 3 / 4 }
        ] : [])
    ];
    const candidates = [];

    rawCandidates.forEach(rawCandidate => {
        const port = getMindMapRelationPort(rect, side, 0, padding, rawCandidate.along);
        const actualAlong = horizontalSide ? port.port.y : port.port.x;
        const existing = candidates.find(candidate => Math.abs(candidate.along - actualAlong) < 0.1);
        if (existing) {
            if (!existing.kinds.includes(rawCandidate.kind)) existing.kinds.push(rawCandidate.kind);
            existing.preferred = existing.preferred || Boolean(rawCandidate.preferred);
            return;
        }
        candidates.push({
            ...port,
            along: actualAlong,
            kinds: [rawCandidate.kind],
            preferred: Boolean(rawCandidate.preferred),
            deviationPenalty: Math.abs(actualAlong - preferredAlong)
                * MINDMAP_RELATION_PORT_DEVIATION_PENALTY
        });
    });

    return candidates;
}

function selectMindMapRelationPortPairCandidates(candidates) {
    if (candidates.length <= MINDMAP_RELATION_PORT_PAIR_CANDIDATES) {
        return candidates.sort((left, right) => left.estimate - right.estimate);
    }

    const sorted = [...candidates].sort((left, right) => left.estimate - right.estimate);
    const preferred = sorted.find(candidate =>
        candidate.sourcePort.preferred && candidate.targetPort.preferred
    );
    const selected = preferred ? [preferred] : [];
    sorted.forEach(candidate => {
        if (selected.length >= MINDMAP_RELATION_PORT_PAIR_CANDIDATES) return;
        if (!selected.includes(candidate)) selected.push(candidate);
    });
    return selected.sort((left, right) => left.estimate - right.estimate);
}

function getMindMapRelationSideCandidates(
    sourceRect,
    targetRect,
    sourceReservedSides = new Set(),
    targetReservedSides = new Set(),
    sourcePortContext = null,
    targetPortContext = null,
    terminalObstacles = []
) {
    const sides = ['left', 'right', 'top', 'bottom'];
    const sourceCenter = { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 };
    const targetCenter = { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const sidePairCandidates = [];
    const sourceTerminalObstacles = terminalObstacles.filter(obstacle => obstacle.id !== sourceRect.id);
    const targetTerminalObstacles = terminalObstacles.filter(obstacle => obstacle.id !== targetRect.id);

    sides.forEach(sourceSide => {
        sides.forEach(targetSide => {
            const sourcePorts = getMindMapRelationPortCandidates(
                sourceRect,
                sourceSide,
                targetRect,
                MINDMAP_RELATION_SOURCE_CLEARANCE,
                sourcePortContext
            ).filter(candidate => isMindMapRelationSegmentClear(
                candidate.port,
                candidate.routePoint,
                sourceTerminalObstacles
            ));
            const targetPorts = getMindMapRelationPortCandidates(
                targetRect,
                targetSide,
                sourceRect,
                MINDMAP_RELATION_TARGET_APPROACH,
                targetPortContext
            ).filter(candidate => isMindMapRelationSegmentClear(
                candidate.port,
                candidate.routePoint,
                targetTerminalObstacles
            ));
            const sourceVector = getMindMapRelationSideVector(sourceSide);
            const targetVector = getMindMapRelationSideVector(targetSide);
            const sourceAlignment = (sourceVector.x * dx + sourceVector.y * dy) / distance;
            const targetAlignment = (targetVector.x * -dx + targetVector.y * -dy) / distance;
            const alignmentPenalty = (2 - sourceAlignment - targetAlignment) * 100;
            const reservedSidePenalty = (sourceReservedSides.has(sourceSide) ? MINDMAP_RELATION_RESERVED_SIDE_PENALTY : 0)
                + (targetReservedSides.has(targetSide) ? MINDMAP_RELATION_RESERVED_SIDE_PENALTY : 0);
            const portPairs = [];
            sourcePorts.forEach(sourcePort => {
                targetPorts.forEach(targetPort => {
                    const estimatedDistance = Math.abs(sourcePort.routePoint.x - targetPort.routePoint.x)
                        + Math.abs(sourcePort.routePoint.y - targetPort.routePoint.y);
                    const portDeviationPenalty = sourcePort.deviationPenalty + targetPort.deviationPenalty;
                    portPairs.push({
                        sourceSide,
                        targetSide,
                        sourcePort,
                        targetPort,
                        estimatedDistance,
                        alignmentPenalty,
                        reservedSidePenalty,
                        portDeviationPenalty,
                        estimate: estimatedDistance
                            + alignmentPenalty
                            + reservedSidePenalty
                            + portDeviationPenalty
                    });
                });
            });
            const selectedPortPairs = selectMindMapRelationPortPairCandidates(portPairs);
            sidePairCandidates.push({
                estimate: selectedPortPairs[0]?.estimate ?? Number.POSITIVE_INFINITY,
                candidates: selectedPortPairs
            });
        });
    });

    return sidePairCandidates
        .sort((left, right) => left.estimate - right.estimate)
        .slice(0, MINDMAP_RELATION_ROUTE_CANDIDATES)
        .flatMap(group => group.candidates);
}

function isMindMapRelationPointInsideObstacle(point, obstacle, epsilon = 0.1) {
    return point.x > obstacle.left + epsilon
        && point.x < obstacle.right - epsilon
        && point.y > obstacle.top + epsilon
        && point.y < obstacle.bottom - epsilon;
}

function isMindMapRelationSegmentClear(from, to, obstacles) {
    const epsilon = 0.1;
    if (Math.abs(from.y - to.y) < epsilon) {
        const y = from.y;
        const minX = Math.min(from.x, to.x);
        const maxX = Math.max(from.x, to.x);
        return !obstacles.some(obstacle =>
            y > obstacle.top + epsilon
            && y < obstacle.bottom - epsilon
            && Math.max(minX, obstacle.left) < Math.min(maxX, obstacle.right) - epsilon
        );
    }
    if (Math.abs(from.x - to.x) < epsilon) {
        const x = from.x;
        const minY = Math.min(from.y, to.y);
        const maxY = Math.max(from.y, to.y);
        return !obstacles.some(obstacle =>
            x > obstacle.left + epsilon
            && x < obstacle.right - epsilon
            && Math.max(minY, obstacle.top) < Math.min(maxY, obstacle.bottom) - epsilon
        );
    }
    return false;
}

function getMindMapRelationObstacleEdgePenalty(from, to, obstacles) {
    const epsilon = 0.1;
    const horizontal = Math.abs(from.y - to.y) < epsilon;
    const segmentMin = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
    const segmentMax = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
    const followsObstacleEdge = obstacles.some(obstacle => {
        const coordinate = horizontal ? from.y : from.x;
        const onEdge = horizontal
            ? Math.abs(coordinate - obstacle.top) < epsilon || Math.abs(coordinate - obstacle.bottom) < epsilon
            : Math.abs(coordinate - obstacle.left) < epsilon || Math.abs(coordinate - obstacle.right) < epsilon;
        if (!onEdge) return false;
        const obstacleMin = horizontal ? obstacle.left : obstacle.top;
        const obstacleMax = horizontal ? obstacle.right : obstacle.bottom;
        return Math.max(segmentMin, obstacleMin) < Math.min(segmentMax, obstacleMax) - epsilon;
    });
    return followsObstacleEdge ? MINDMAP_RELATION_OBSTACLE_EDGE_PENALTY : 0;
}

function getMindMapRelationChannelDeviationPenalty(from, to, preferredChannels) {
    const epsilon = 0.1;
    const horizontal = Math.abs(from.y - to.y) < epsilon;
    const segmentMin = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
    const segmentMax = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
    const matchingChannels = preferredChannels.filter(channel => {
        if (channel.axis !== (horizontal ? 'y' : 'x')) return false;
        const channelMin = Number.isFinite(channel.min) ? channel.min : -Infinity;
        const channelMax = Number.isFinite(channel.max) ? channel.max : Infinity;
        return Math.max(segmentMin, channelMin) < Math.min(segmentMax, channelMax) - epsilon;
    });
    if (matchingChannels.length === 0) return 0;
    const coordinate = horizontal ? from.y : from.x;
    if (matchingChannels.some(channel => Math.abs(coordinate - channel.coordinate) < epsilon)) return 0;
    const nearPreferredChannel = matchingChannels.some(channel =>
        Math.abs(coordinate - channel.coordinate) <= MINDMAP_RELATION_ROUTING_PADDING * 2
    );
    return nearPreferredChannel ? MINDMAP_RELATION_CHANNEL_DEVIATION_PENALTY : 0;
}

function getMindMapRelationTerminalAlignmentPenalty(
    from,
    to,
    end,
    terminalDirection,
    preferredChannels
) {
    const epsilon = 0.1;
    const horizontal = Math.abs(from.y - to.y) < epsilon;
    const moveDirection = horizontal ? 1 : 2;
    if (!terminalDirection || moveDirection !== terminalDirection) return 0;

    const coordinate = horizontal ? from.y : from.x;
    const targetCoordinate = horizontal ? end.y : end.x;
    if (Math.abs(coordinate - targetCoordinate) < epsilon) return 0;

    const segmentMin = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
    const segmentMax = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
    const followsPreferredChannel = preferredChannels.some(channel => {
        if (channel.axis !== (horizontal ? 'y' : 'x')) return false;
        if (Math.abs(coordinate - channel.coordinate) >= epsilon) return false;
        const channelMin = Number.isFinite(channel.min) ? channel.min : -Infinity;
        const channelMax = Number.isFinite(channel.max) ? channel.max : Infinity;
        return Math.max(segmentMin, channelMin) < Math.min(segmentMax, channelMax) - epsilon;
    });
    return followsPreferredChannel ? 0 : MINDMAP_RELATION_TERMINAL_ALIGNMENT_PENALTY;
}

function getMindMapRelationSegmentInteractionPenalty(from, to, occupiedSegments, routeTerminals = []) {
    const epsilon = 0.1;
    const horizontal = Math.abs(from.y - to.y) < epsilon;
    let penalty = 0;
    occupiedSegments.forEach(segment => {
        const occupiedHorizontal = Math.abs(segment.from.y - segment.to.y) < epsilon;
        if (horizontal === occupiedHorizontal) {
            const sameLine = horizontal
                ? Math.abs(from.y - segment.from.y) < epsilon
                : Math.abs(from.x - segment.from.x) < epsilon;
            if (!sameLine) return;
            const currentMin = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
            const currentMax = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
            const occupiedMin = horizontal ? Math.min(segment.from.x, segment.to.x) : Math.min(segment.from.y, segment.to.y);
            const occupiedMax = horizontal ? Math.max(segment.from.x, segment.to.x) : Math.max(segment.from.y, segment.to.y);
            const overlap = Math.min(currentMax, occupiedMax) - Math.max(currentMin, occupiedMin);
            if (overlap > epsilon) penalty += MINDMAP_RELATION_OVERLAP_PENALTY + overlap * 6;
            return;
        }

        const horizontalSegment = horizontal ? { from, to } : segment;
        const verticalSegment = horizontal ? segment : { from, to };
        const horizontalMin = Math.min(horizontalSegment.from.x, horizontalSegment.to.x);
        const horizontalMax = Math.max(horizontalSegment.from.x, horizontalSegment.to.x);
        const verticalMin = Math.min(verticalSegment.from.y, verticalSegment.to.y);
        const verticalMax = Math.max(verticalSegment.from.y, verticalSegment.to.y);
        const crossingX = verticalSegment.from.x;
        const crossingY = horizontalSegment.from.y;
        const intersects = crossingX >= horizontalMin - epsilon
            && crossingX <= horizontalMax + epsilon
            && crossingY >= verticalMin - epsilon
            && crossingY <= verticalMax + epsilon;
        const nearTerminal = routeTerminals.some(point =>
            Math.hypot(crossingX - point.x, crossingY - point.y) <= MINDMAP_RELATION_LANE_GAP * 1.5
        );
        if (intersects && !nearTerminal) penalty += MINDMAP_RELATION_CROSSING_PENALTY;
    });
    return penalty;
}

function pushMindMapRelationQueue(queue, item) {
    queue.push(item);
    let index = queue.length - 1;
    while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (queue[parent].priority <= item.priority) break;
        queue[index] = queue[parent];
        index = parent;
    }
    queue[index] = item;
}

function popMindMapRelationQueue(queue) {
    if (queue.length === 0) return null;
    const first = queue[0];
    const last = queue.pop();
    if (queue.length === 0) return first;
    let index = 0;
    while (true) {
        let child = index * 2 + 1;
        if (child >= queue.length) break;
        if (child + 1 < queue.length && queue[child + 1].priority < queue[child].priority) child++;
        if (queue[child].priority >= last.priority) break;
        queue[index] = queue[child];
        index = child;
    }
    queue[index] = last;
    return first;
}

function findMindMapOrthogonalRoute(
    start,
    end,
    obstacles,
    occupiedSegments = [],
    preferredChannels = [],
    terminalDirection = 0
) {
    const round = value => Math.round(value * 10) / 10;
    const xs = [start.x, end.x];
    const ys = [start.y, end.y];
    preferredChannels.forEach(channel => {
        if (channel.axis === 'x') {
            xs.push(channel.coordinate);
            if (Number.isFinite(channel.min)) ys.push(channel.min);
            if (Number.isFinite(channel.max)) ys.push(channel.max);
        }
        if (channel.axis === 'y') {
            ys.push(channel.coordinate);
            if (Number.isFinite(channel.min)) xs.push(channel.min);
            if (Number.isFinite(channel.max)) xs.push(channel.max);
        }
    });
    obstacles.forEach(obstacle => {
        xs.push(obstacle.left, obstacle.right);
        ys.push(obstacle.top, obstacle.bottom);
    });
    occupiedSegments.forEach(segment => {
        if (Math.abs(segment.from.x - segment.to.x) < 0.1) {
            xs.push(segment.from.x - MINDMAP_RELATION_LANE_GAP, segment.from.x + MINDMAP_RELATION_LANE_GAP);
            const minY = Math.min(segment.from.y, segment.to.y);
            const maxY = Math.max(segment.from.y, segment.to.y);
            ys.push(minY, maxY, minY - MINDMAP_RELATION_LANE_GAP, maxY + MINDMAP_RELATION_LANE_GAP);
        } else {
            ys.push(segment.from.y - MINDMAP_RELATION_LANE_GAP, segment.from.y + MINDMAP_RELATION_LANE_GAP);
            const minX = Math.min(segment.from.x, segment.to.x);
            const maxX = Math.max(segment.from.x, segment.to.x);
            xs.push(minX, maxX, minX - MINDMAP_RELATION_LANE_GAP, maxX + MINDMAP_RELATION_LANE_GAP);
        }
    });
    if (obstacles.length > 0) {
        xs.push(Math.min(...obstacles.map(item => item.left)) - MINDMAP_RELATION_LANE_GAP);
        xs.push(Math.max(...obstacles.map(item => item.right)) + MINDMAP_RELATION_LANE_GAP);
        ys.push(Math.min(...obstacles.map(item => item.top)) - MINDMAP_RELATION_LANE_GAP);
        ys.push(Math.max(...obstacles.map(item => item.bottom)) + MINDMAP_RELATION_LANE_GAP);
    }

    const xValues = Array.from(new Set(xs.map(round))).sort((a, b) => a - b);
    const yValues = Array.from(new Set(ys.map(round))).sort((a, b) => a - b);
    const startX = xValues.indexOf(round(start.x));
    const startY = yValues.indexOf(round(start.y));
    const endX = xValues.indexOf(round(end.x));
    const endY = yValues.indexOf(round(end.y));
    if (startX < 0 || startY < 0 || endX < 0 || endY < 0) return null;

    const queue = [];
    const distances = new Map();
    const parents = new Map();
    const startKey = `${startX},${startY},0`;
    distances.set(startKey, 0);
    pushMindMapRelationQueue(queue, {
        xIndex: startX,
        yIndex: startY,
        direction: 0,
        cost: 0,
        priority: Math.abs(start.x - end.x) + Math.abs(start.y - end.y),
        key: startKey
    });

    let completed = null;
    while (queue.length > 0) {
        const current = popMindMapRelationQueue(queue);
        if (current.cost !== distances.get(current.key)) continue;
        if (current.xIndex === endX && current.yIndex === endY) {
            completed = current;
            break;
        }

        const moves = [
            { xIndex: current.xIndex - 1, yIndex: current.yIndex, direction: 1 },
            { xIndex: current.xIndex + 1, yIndex: current.yIndex, direction: 1 },
            { xIndex: current.xIndex, yIndex: current.yIndex - 1, direction: 2 },
            { xIndex: current.xIndex, yIndex: current.yIndex + 1, direction: 2 }
        ];
        moves.forEach(move => {
            if (move.xIndex < 0 || move.xIndex >= xValues.length || move.yIndex < 0 || move.yIndex >= yValues.length) return;
            const from = { x: xValues[current.xIndex], y: yValues[current.yIndex] };
            const to = { x: xValues[move.xIndex], y: yValues[move.yIndex] };
            if (obstacles.some(obstacle => isMindMapRelationPointInsideObstacle(to, obstacle))) return;
            if (!isMindMapRelationSegmentClear(from, to, obstacles)) return;
            const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
            const turnPenalty = current.direction !== 0 && current.direction !== move.direction
                ? MINDMAP_RELATION_TURN_PENALTY
                : 0;
            const interactionPenalty = getMindMapRelationSegmentInteractionPenalty(from, to, occupiedSegments, [start, end]);
            const obstacleEdgePenalty = getMindMapRelationObstacleEdgePenalty(from, to, obstacles);
            const channelDeviationPenalty = getMindMapRelationChannelDeviationPenalty(from, to, preferredChannels);
            const terminalAlignmentPenalty = getMindMapRelationTerminalAlignmentPenalty(
                from,
                to,
                end,
                terminalDirection,
                preferredChannels
            );
            const nextCost = current.cost
                + length
                + turnPenalty
                + interactionPenalty
                + obstacleEdgePenalty
                + channelDeviationPenalty
                + terminalAlignmentPenalty;
            const nextKey = `${move.xIndex},${move.yIndex},${move.direction}`;
            if (nextCost >= (distances.get(nextKey) ?? Infinity)) return;
            distances.set(nextKey, nextCost);
            parents.set(nextKey, current.key);
            const heuristic = Math.abs(to.x - end.x) + Math.abs(to.y - end.y);
            pushMindMapRelationQueue(queue, {
                ...move,
                cost: nextCost,
                priority: nextCost + heuristic,
                key: nextKey
            });
        });
    }

    if (!completed) return null;
    const points = [];
    let key = completed.key;
    while (key) {
        const [xIndex, yIndex] = key.split(',').map(Number);
        points.push({ x: xValues[xIndex], y: yValues[yIndex] });
        key = parents.get(key);
    }
    points.reverse();
    return { points: simplifyMindMapRelationPoints(points), cost: completed.cost };
}

function simplifyMindMapRelationPoints(points) {
    const simplified = [];
    points.forEach(point => {
        const last = simplified[simplified.length - 1];
        if (last && Math.abs(last.x - point.x) < 0.1 && Math.abs(last.y - point.y) < 0.1) return;
        if (simplified.length >= 2) {
            const previous = simplified[simplified.length - 2];
            const collinearX = Math.abs(previous.x - last.x) < 0.1 && Math.abs(last.x - point.x) < 0.1;
            const collinearY = Math.abs(previous.y - last.y) < 0.1 && Math.abs(last.y - point.y) < 0.1;
            if (collinearX || collinearY) {
                simplified[simplified.length - 1] = point;
                return;
            }
        }
        simplified.push(point);
    });
    return simplified;
}

function getMindMapRelationSegments(points) {
    const segments = [];
    for (let index = 1; index < points.length; index++) {
        segments.push({ from: points[index - 1], to: points[index] });
    }
    return segments;
}

function getMindMapRelationCornerCurve(previous, current, next, radius) {
    const incomingLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y);
    if (incomingLength < 0.1 || outgoingLength < 0.1) return null;

    const incoming = {
        x: (current.x - previous.x) / incomingLength,
        y: (current.y - previous.y) / incomingLength
    };
    const outgoing = {
        x: (next.x - current.x) / outgoingLength,
        y: (next.y - current.y) / outgoingLength
    };
    const dot = Math.max(-1, Math.min(1, incoming.x * outgoing.x + incoming.y * outgoing.y));
    const turnAngle = Math.acos(dot);
    if (turnAngle < 0.01 || Math.PI - turnAngle < 0.01) return null;

    const tangentDistance = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    const tangentHalfAngle = Math.tan(turnAngle / 2);
    if (!Number.isFinite(tangentHalfAngle) || Math.abs(tangentHalfAngle) < 0.001) return null;
    const circleRadius = tangentDistance / tangentHalfAngle;
    const handleLength = Math.min(
        tangentDistance,
        Math.abs((4 / 3) * circleRadius * Math.tan(turnAngle / 4))
    );
    const before = {
        x: current.x - incoming.x * tangentDistance,
        y: current.y - incoming.y * tangentDistance
    };
    const after = {
        x: current.x + outgoing.x * tangentDistance,
        y: current.y + outgoing.y * tangentDistance
    };
    return {
        before,
        after,
        control1: {
            x: before.x + incoming.x * handleLength,
            y: before.y + incoming.y * handleLength
        },
        control2: {
            x: after.x - outgoing.x * handleLength,
            y: after.y - outgoing.y * handleLength
        }
    };
}

function getMindMapRoundedOrthogonalPath(points, radius = 16) {
    if (!points || points.length < 2) return '';
    const round = value => Math.round(value * 10) / 10;
    const pointText = point => `${round(point.x)} ${round(point.y)}`;
    let path = `M ${pointText(points[0])}`;
    for (let index = 1; index < points.length - 1; index++) {
        const previous = points[index - 1];
        const current = points[index];
        const next = points[index + 1];
        const curve = getMindMapRelationCornerCurve(previous, current, next, radius);
        if (!curve) {
            path += ` L ${pointText(current)}`;
            continue;
        }
        path += ` L ${pointText(curve.before)}`;
        path += ` C ${pointText(curve.control1)}, ${pointText(curve.control2)}, ${pointText(curve.after)}`;
    }
    path += ` L ${pointText(points[points.length - 1])}`;
    return path;
}

function routeMindMapRelation(sourceRect, targetRect, obstacles, occupiedSegments, preferredChannels = []) {
    const candidates = getMindMapRelationSideCandidates(
        sourceRect,
        targetRect,
        getMindMapRelationReservedSides(sourceRect.id),
        getMindMapRelationReservedSides(targetRect.id),
        getMindMapRelationPortContext(sourceRect.id),
        getMindMapRelationPortContext(targetRect.id),
        obstacles
    );
    const centerDistance = Math.hypot(
        (targetRect.left + targetRect.width / 2) - (sourceRect.left + sourceRect.width / 2),
        (targetRect.top + targetRect.height / 2) - (sourceRect.top + sourceRect.height / 2)
    );
    const routingMargin = Math.max(120, Math.min(320, centerDistance * 0.2));
    const routingBounds = {
        left: Math.min(sourceRect.left, targetRect.left) - routingMargin,
        right: Math.max(sourceRect.right, targetRect.right) + routingMargin,
        top: Math.min(sourceRect.top, targetRect.top) - routingMargin,
        bottom: Math.max(sourceRect.bottom, targetRect.bottom) + routingMargin
    };
    const routingObstacles = obstacles.filter(obstacle =>
        obstacle.right >= routingBounds.left
        && obstacle.left <= routingBounds.right
        && obstacle.bottom >= routingBounds.top
        && obstacle.top <= routingBounds.bottom
    );
    const routingChannels = preferredChannels.filter(channel =>
        channel.axis === 'x'
            ? channel.coordinate >= routingBounds.left && channel.coordinate <= routingBounds.right
            : channel.coordinate >= routingBounds.top && channel.coordinate <= routingBounds.bottom
    );
    let bestRoute = null;

    candidates.forEach(candidate => {
        const route = findMindMapOrthogonalRoute(
            candidate.sourcePort.routePoint,
            candidate.targetPort.routePoint,
            routingObstacles,
            occupiedSegments,
            routingChannels,
            candidate.targetSide === 'left' || candidate.targetSide === 'right' ? 1 : 2
        );
        if (!route) return;
        const totalCost = route.cost
            + candidate.alignmentPenalty
            + candidate.reservedSidePenalty
            + candidate.portDeviationPenalty
            + candidate.estimatedDistance * 0.06;
        if (bestRoute && bestRoute.cost <= totalCost) return;
        const points = simplifyMindMapRelationPoints([
            candidate.sourcePort.port,
            candidate.sourcePort.routePoint,
            ...route.points,
            candidate.targetPort.routePoint,
            candidate.targetPort.port
        ]);
        bestRoute = {
            cost: totalCost,
            points,
            path: getMindMapRoundedOrthogonalPath(points),
            sourceSide: candidate.sourceSide,
            targetSide: candidate.targetSide
        };
    });

    return bestRoute;
}

function getMindMapRelationFoldCorridors(cardRects) {
    const corridors = [];
    document.querySelectorAll('.fold-btn').forEach((button, index) => {
        if (button.getClientRects().length === 0) return;
        const ownerId = button.closest('.node-card')?.dataset.nodeId;
        const ownerNode = ownerId ? findNode(state.data, ownerId) : null;
        if (!ownerNode?.children?.length) return;

        const isLeft = button.classList.contains('left-side') || button.classList.contains('root-left');
        const childIds = ownerId === state.data.id
            ? ownerNode.children.filter(child => (child.dir === 'left') === isLeft).map(child => child.id)
            : ownerNode.children.map(child => child.id);
        const childRects = childIds.map(id => cardRects.get(id)).filter(Boolean);
        if (childRects.length === 0) return;

        const buttonRect = getMindMapCanvasRect(button);
        const childBoundary = isLeft
            ? Math.max(...childRects.map(rect => rect.right))
            : Math.min(...childRects.map(rect => rect.left));
        const buttonBoundary = isLeft ? buttonRect.left : buttonRect.right;
        const gap = isLeft ? buttonBoundary - childBoundary : childBoundary - buttonBoundary;
        if (gap < MINDMAP_RELATION_FOLD_BUTTON_PADDING * 2 + 2) return;

        const neighborIds = childRects
            .filter(rect => Math.abs((isLeft ? rect.right : rect.left) - childBoundary) < 0.5)
            .map(rect => rect.id);
        const ownerRect = cardRects.get(ownerId);
        const verticalRects = [buttonRect, ...childRects, ...(ownerRect ? [ownerRect] : [])];
        corridors.push({
            id: `fold-corridor:${ownerId}:${index}`,
            ownerId,
            axis: 'x',
            coordinate: (buttonBoundary + childBoundary) / 2,
            gapMin: Math.min(buttonBoundary, childBoundary),
            gapMax: Math.max(buttonBoundary, childBoundary),
            triggerMin: buttonRect.top - MINDMAP_RELATION_ROUTING_PADDING,
            triggerMax: buttonRect.bottom + MINDMAP_RELATION_ROUTING_PADDING,
            min: Math.min(...verticalRects.map(rect => rect.top)) - MINDMAP_RELATION_ROUTING_PADDING,
            max: Math.max(...verticalRects.map(rect => rect.bottom)) + MINDMAP_RELATION_ROUTING_PADDING,
            side: isLeft ? 'left' : 'right',
            neighborIds
        });
    });
    return corridors;
}

function getMindMapRelationRouteFoldCorridors(route, corridors = []) {
    if (!route?.points?.length || corridors.length === 0) return [];
    const epsilon = 0.1;
    const segments = getMindMapRelationSegments(route.points);

    return corridors.filter(corridor => corridor.axis === 'x' && segments.some(segment => {
        const horizontal = Math.abs(segment.from.y - segment.to.y) < epsilon;
        if (horizontal) {
            const y = segment.from.y;
            if (y < corridor.triggerMin - epsilon || y > corridor.triggerMax + epsilon) return false;
            const minX = Math.min(segment.from.x, segment.to.x);
            const maxX = Math.max(segment.from.x, segment.to.x);
            return minX <= corridor.coordinate + epsilon && maxX >= corridor.coordinate - epsilon;
        }

        const x = segment.from.x;
        const minY = Math.min(segment.from.y, segment.to.y);
        const maxY = Math.max(segment.from.y, segment.to.y);
        const overlapsVerticalRange = Math.max(minY, corridor.triggerMin)
            <= Math.min(maxY, corridor.triggerMax) + epsilon;
        const insideFoldGap = x >= corridor.gapMin - epsilon && x <= corridor.gapMax + epsilon;
        return overlapsVerticalRange && insideFoldGap;
    }));
}

function getMindMapRelationRoutingKey(relations, cardRects, controlObstacles = [], preferredChannels = []) {
    const geometry = Array.from(cardRects.values()).map(rect => [
        rect.id,
        Math.round(rect.left * 10),
        Math.round(rect.top * 10),
        Math.round(rect.right * 10),
        Math.round(rect.bottom * 10)
    ]);
    const relationState = relations.map(relation => [
        relation.id,
        relation.sourceId,
        relation.targetId,
        getMindMapRelationDirection(relation)
    ]);
    const controlGeometry = controlObstacles.map(obstacle => [
        obstacle.id,
        Math.round(obstacle.left * 10),
        Math.round(obstacle.top * 10),
        Math.round(obstacle.right * 10),
        Math.round(obstacle.bottom * 10)
    ]);
    const channelGeometry = preferredChannels.map(channel => [
        channel.id,
        channel.axis,
        Math.round(channel.coordinate * 10),
        Math.round(channel.gapMin * 10),
        Math.round(channel.gapMax * 10),
        Math.round(channel.triggerMin * 10),
        Math.round(channel.triggerMax * 10),
        Math.round(channel.min * 10),
        Math.round(channel.max * 10),
        channel.side,
        channel.ownerId,
        channel.neighborIds
    ]);
    return JSON.stringify([geometry, controlGeometry, channelGeometry, relationState]);
}

function buildMindMapRelationRoutes(relations, cardRects, controlObstacles = [], preferredChannels = []) {
    const cacheKey = getMindMapRelationRoutingKey(relations, cardRects, controlObstacles, preferredChannels);
    if (cacheKey === relationRouteCache.key) return relationRouteCache.routes;

    const cardObstacles = new Map(Array.from(cardRects.entries()).map(([id, rect]) => [
        id,
        expandMindMapRelationObstacle(rect)
    ]));
    preferredChannels.forEach(channel => {
        channel.neighborIds.forEach(nodeId => {
            const obstacle = cardObstacles.get(nodeId);
            const cardRect = cardRects.get(nodeId);
            if (!obstacle || !cardRect || channel.axis !== 'x') return;
            if (channel.side === 'right') {
                obstacle.left = Math.max(
                    obstacle.left,
                    Math.min(cardRect.left, channel.coordinate + MINDMAP_RELATION_FOLD_BUTTON_PADDING)
                );
            } else {
                obstacle.right = Math.min(
                    obstacle.right,
                    Math.max(cardRect.right, channel.coordinate - MINDMAP_RELATION_FOLD_BUTTON_PADDING)
                );
            }
        });
    });
    const obstacles = [
        ...cardObstacles.values(),
        ...controlObstacles
    ];
    const occupiedSegments = [];
    const routes = new Map();
    relations.forEach(relation => {
        const direction = getMindMapRelationDirection(relation);
        const sourceId = direction === 'reverse' ? relation.targetId : relation.sourceId;
        const targetId = direction === 'reverse' ? relation.sourceId : relation.targetId;
        const sourceRect = cardRects.get(sourceId);
        const targetRect = cardRects.get(targetId);
        if (!sourceRect || !targetRect) return;
        const naturalRoute = routeMindMapRelation(
            sourceRect,
            targetRect,
            obstacles,
            occupiedSegments,
            []
        );
        if (!naturalRoute) return;
        const relationChannels = getMindMapRelationRouteFoldCorridors(naturalRoute, preferredChannels);
        const route = relationChannels.length > 0
            ? routeMindMapRelation(
                sourceRect,
                targetRect,
                obstacles,
                occupiedSegments,
                relationChannels
            ) || naturalRoute
            : naturalRoute;
        if (!route) return;
        routes.set(relation.id, route);
        occupiedSegments.push(...getMindMapRelationSegments(route.points));
    });
    relationRouteCache = { key: cacheKey, routes };
    return routes;
}

function renderMindMapRelations() {
    relationRenderFrame = null;
    const layer = $('#relation-layer');
    if (!layer) return;
    layer.replaceChildren();

    const relations = getMindMapRelations();
    if (state.selectedRelationId && !relations.some(relation => relation.id === state.selectedRelationId)) {
        state.selectedRelationId = null;
        closeMindMapRelationEditor();
    }

    const defs = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'defs');
    layer.appendChild(defs);
    const cardRects = new Map();
    document.querySelectorAll('.node-card').forEach(card => {
        const rect = getMindMapCanvasRect(card);
        if (rect.id) cardRects.set(rect.id, rect);
    });
    const foldButtonCorridors = getMindMapRelationFoldCorridors(cardRects);
    const foldButtonObstacles = Array.from(document.querySelectorAll('.fold-btn'))
        .filter(button => button.getClientRects().length > 0)
        .map((button, index) => {
            const rect = getMindMapCanvasRect(button);
            const cardId = button.closest('.node-card')?.dataset.nodeId || 'unknown';
            return expandMindMapRelationObstacle(
                { ...rect, id: `fold-button:${cardId}:${index}` },
                MINDMAP_RELATION_FOLD_BUTTON_PADDING
            );
        });
    const routes = buildMindMapRelationRoutes(
        relations,
        cardRects,
        foldButtonObstacles,
        foldButtonCorridors
    );

    relations.forEach((relation, index) => {
        const sourceCard = document.getElementById(`card-${relation.sourceId}`);
        const targetCard = document.getElementById(`card-${relation.targetId}`);
        if (!sourceCard || !targetCard) return;

        const direction = getMindMapRelationDirection(relation);
        const relationColor = getMindMapRelationColor(relation);
        const route = routes.get(relation.id);
        const fromCard = direction === 'reverse' ? targetCard : sourceCard;
        const toCard = direction === 'reverse' ? sourceCard : targetCard;
        const pathData = route?.path || getMindMapRelationPath(
            fromCard.getBoundingClientRect(),
            toCard.getBoundingClientRect(),
            state.view,
            getMindMapRelationPortContext(fromCard.dataset.nodeId),
            getMindMapRelationPortContext(toCard.dataset.nodeId)
        );
        const group = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'g');
        group.classList.add('relation-group');
        group.classList.toggle('routed', Boolean(route));
        group.classList.toggle('solid', getMindMapRelationLineStyle(relation) === 'solid');
        group.classList.toggle('selected', relation.id === state.selectedRelationId);
        group.dataset.relationId = relation.id;
        group.style.setProperty('--relation-color', relationColor || 'var(--text-color-secondary)');

        const visiblePath = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'path');
        visiblePath.classList.add('relation-line');
        visiblePath.setAttribute('d', pathData);
        if (direction !== 'none') {
            const markerId = `relation-arrow-${index}`;
            const marker = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'marker');
            marker.setAttribute('id', markerId);
            marker.setAttribute('viewBox', `0 0 ${MINDMAP_RELATION_ARROW_SIZE} ${MINDMAP_RELATION_ARROW_SIZE}`);
            marker.setAttribute('markerWidth', String(MINDMAP_RELATION_ARROW_SIZE));
            marker.setAttribute('markerHeight', String(MINDMAP_RELATION_ARROW_SIZE));
            marker.setAttribute('refX', String(MINDMAP_RELATION_ARROW_SIZE - 1));
            marker.setAttribute('refY', String(MINDMAP_RELATION_ARROW_SIZE / 2));
            marker.setAttribute('orient', 'auto');
            marker.setAttribute('markerUnits', 'userSpaceOnUse');
            const arrow = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'path');
            arrow.setAttribute('d', `M 0 0 L ${MINDMAP_RELATION_ARROW_SIZE} ${MINDMAP_RELATION_ARROW_SIZE / 2} L 0 ${MINDMAP_RELATION_ARROW_SIZE} Z`);
            arrow.style.fill = relationColor || 'var(--text-color-secondary)';
            marker.appendChild(arrow);
            defs.appendChild(marker);
            visiblePath.setAttribute('marker-end', `url(#${markerId})`);
        }
        group.appendChild(visiblePath);

        const hitPath = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'path');
        hitPath.classList.add('relation-hit');
        hitPath.dataset.relationId = relation.id;
        hitPath.setAttribute('d', pathData);
        group.appendChild(hitPath);
        layer.appendChild(group);

        const label = getMindMapRelationLabel(relation).trim();
        if (label) {
            const labelElement = document.createElementNS(MINDMAP_RELATION_SVG_NS, 'text');
            labelElement.classList.add('relation-label');
            labelElement.textContent = label;
            try {
                const midpoint = visiblePath.getPointAtLength(visiblePath.getTotalLength() / 2);
                labelElement.setAttribute('x', String(midpoint.x));
                labelElement.setAttribute('y', String(midpoint.y - 10));
            } catch (error) {
                console.warn('[MindMap] 无法计算关联标签位置:', error);
            }
            group.appendChild(labelElement);
        }
    });
}

function scheduleRenderMindMapRelations() {
    if (relationRenderFrame !== null) return;
    relationRenderFrame = requestAnimationFrame(renderMindMapRelations);
}

function initializeMindMapRelations() {
    const layer = $('#relation-layer');
    const panel = $('#relationEditor');
    const navigationMenu = $('#relationNavigationMenu');
    const navigationList = $('#relationNavigationList');
    if (!layer || !panel || !navigationMenu || !navigationList) return;
    layer.addEventListener('mousedown', event => {
        if (event.button !== 0) return;
        const hitPath = event.target.closest('.relation-hit');
        if (!hitPath) return;
        event.preventDefault();
        event.stopPropagation();
        selectMindMapRelation(hitPath.dataset.relationId, { x: event.clientX, y: event.clientY });
    });
    panel.addEventListener('mousedown', event => event.stopPropagation());
    navigationMenu.addEventListener('mousedown', event => event.stopPropagation());
    navigationList.addEventListener('click', event => {
        const item = event.target.closest('[data-target-node-id]');
        if (item) jumpToMindMapRelatedCard(item.dataset.targetNodeId);
    });
    $('#btn-relation-navigation-close').addEventListener('click', closeMindMapRelationNavigationMenu);
    document.addEventListener('wheel', event => {
        if (!event.target.closest('#relationNavigationMenu')) closeMindMapRelationNavigationMenu();
    }, { passive: true });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeMindMapRelationNavigationMenu();
    });
    $('#btn-relation-editor-close').addEventListener('click', clearSelectedMindMapRelation);
    $('#btn-delete-relation').addEventListener('click', deleteSelectedMindMapRelation);

    const labelInput = $('#relationLabelInput');
    labelInput.addEventListener('input', () => {
        const relation = getMindMapRelationById(state.selectedRelationId);
        if (!relation) return;
        relation.label = labelInput.value.slice(0, 80);
        scheduleRenderMindMapRelations();
    });
    labelInput.addEventListener('change', recordHistory);
    labelInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            labelInput.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            clearSelectedMindMapRelation();
        }
    });

    panel.querySelectorAll('[data-relation-direction]').forEach(button => {
        button.addEventListener('click', () => {
            updateSelectedMindMapRelation('direction', button.dataset.relationDirection);
        });
    });
    panel.querySelectorAll('[data-relation-style]').forEach(button => {
        button.addEventListener('click', () => {
            updateSelectedMindMapRelation('lineStyle', button.dataset.relationStyle);
        });
    });
    panel.querySelectorAll('[data-relation-color]').forEach(button => {
        button.addEventListener('click', () => {
            updateSelectedMindMapRelation('color', button.dataset.relationColor);
        });
    });
    const customColor = $('#relationCustomColor');
    customColor.addEventListener('input', () => {
        updateSelectedMindMapRelation('color', customColor.value.toLowerCase(), false);
    });
    customColor.addEventListener('change', recordHistory);
    panel.addEventListener('keydown', event => {
        if (event.key === 'Escape' && event.target !== labelInput) {
            event.preventDefault();
            clearSelectedMindMapRelation();
        }
    });
    scheduleRenderMindMapRelations();
    syncMindMapRelationNavigationButtons();
}

function getCanvasRelationSides(sourceNode, targetNode) {
    const sourceCenter = { x: sourceNode.x + sourceNode.width / 2, y: sourceNode.y + sourceNode.height / 2 };
    const targetCenter = { x: targetNode.x + targetNode.width / 2, y: targetNode.y + targetNode.height / 2 };
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0
            ? { fromSide: 'right', toSide: 'left' }
            : { fromSide: 'left', toSide: 'right' };
    }
    return dy >= 0
        ? { fromSide: 'bottom', toSide: 'top' }
        : { fromSide: 'top', toSide: 'bottom' };
}

function appendMindMapRelationsToCanvas(canvasNodes, canvasEdges) {
    const nodeMap = new Map(canvasNodes.map(node => [node.id, node]));
    getMindMapRelations().forEach(relation => {
        const direction = getMindMapRelationDirection(relation);
        const fromNodeId = direction === 'reverse' ? relation.targetId : relation.sourceId;
        const toNodeId = direction === 'reverse' ? relation.sourceId : relation.targetId;
        const sourceNode = nodeMap.get(fromNodeId);
        const targetNode = nodeMap.get(toNodeId);
        if (!sourceNode || !targetNode) return;
        const sides = getCanvasRelationSides(sourceNode, targetNode);
        const edge = {
            id: relation.id,
            fromNode: fromNodeId,
            fromSide: sides.fromSide,
            fromEnd: 'none',
            toNode: toNodeId,
            toSide: sides.toSide,
            toEnd: direction === 'none' ? 'none' : 'arrow'
        };
        const label = getMindMapRelationLabel(relation).trim();
        const color = getMindMapRelationColor(relation);
        if (label) edge.label = label;
        if (color) edge.color = color;
        canvasEdges.push(edge);
    });
}
// #endregion

// =============================================================================
// #region 多卡片总结
// =============================================================================
const MINDMAP_SUMMARY_SVG_NS = 'http://www.w3.org/2000/svg';
const MINDMAP_SUMMARY_MIN_NODES = 2;
const MINDMAP_SUMMARY_TEXT_LIMIT = 2000;
const MINDMAP_SUMMARY_BRACE_OFFSET = 18;
const MINDMAP_SUMMARY_LABEL_GAP = 22;
const MINDMAP_SUMMARY_COLLISION_GAP = 14;
const MINDMAP_SUMMARY_BRACE_LANE_GAP = 14;
const MINDMAP_SUMMARY_ESTIMATED_WIDTH = 180;
const MINDMAP_SUMMARY_ESTIMATED_HEIGHT = 120;
const MINDMAP_SUMMARY_LAYOUT_MAX_STEPS = 240;
let summaryRenderFrame = null;

function getMindMapSummaries() {
    return Array.isArray(state.data?.summaries) ? state.data.summaries : [];
}

function ensureMindMapSummaries() {
    if (!Array.isArray(state.data.summaries)) state.data.summaries = [];
    return state.data.summaries;
}

function getMindMapSummaryContent(summary) {
    const content = typeof summary?.content === 'string' ? summary.content : summary?.text;
    return String(content || '').slice(0, MINDMAP_SUMMARY_TEXT_LIMIT);
}

function setMindMapSummaryContent(summary, content) {
    if (!summary) return;
    summary.content = String(content || '').slice(0, MINDMAP_SUMMARY_TEXT_LIMIT);
    delete summary.text;
}

function getMindMapSummaryById(summaryId) {
    return getMindMapSummaries().find(summary => summary.id === summaryId) || null;
}

function getMindMapNodeBranchSide(nodeId) {
    if (!nodeId || nodeId === state.data.id || !findNode(state.data, nodeId)) return null;
    return isDescendantOfLeft(nodeId) ? 'left' : 'right';
}

function getMindMapSummarySelection(nodeIds = state.selectedIds) {
    const ids = Array.from(new Set(nodeIds || []));
    if (ids.length < MINDMAP_SUMMARY_MIN_NODES) return null;
    const sides = new Set();
    for (const nodeId of ids) {
        const side = getMindMapNodeBranchSide(nodeId);
        if (!side) return null;
        sides.add(side);
    }
    if (sides.size !== 1) return null;
    return { nodeIds: ids, side: Array.from(sides)[0] };
}

function isMindMapSummaryCompleteSubtree(nodeIds) {
    const selectedIds = new Set(nodeIds || []);
    if (selectedIds.size < MINDMAP_SUMMARY_MIN_NODES) return false;

    const selectedRoots = Array.from(selectedIds).filter(nodeId => {
        const parent = findParent(state.data, nodeId);
        return !parent || !selectedIds.has(parent.id);
    });
    if (selectedRoots.length !== 1) return false;

    const subtreeRoot = findNode(state.data, selectedRoots[0]);
    if (!subtreeRoot) return false;
    const subtreeIds = new Set();
    const visit = node => {
        if (!node || subtreeIds.has(node.id)) return;
        subtreeIds.add(node.id);
        (node.children || []).forEach(visit);
    };
    visit(subtreeRoot);
    return subtreeIds.size === selectedIds.size
        && Array.from(subtreeIds).every(nodeId => selectedIds.has(nodeId));
}

function getMindMapSummaryRelationProfile(nodeIds) {
    const ids = Array.from(new Set(nodeIds || []));
    const selectedIds = new Set(ids);
    const siblingsByParent = new Map();
    let parentChildCount = 0;

    ids.forEach(nodeId => {
        const parent = findParent(state.data, nodeId);
        if (!parent) return;
        if (selectedIds.has(parent.id)) {
            parentChildCount++;
        }
        const siblings = siblingsByParent.get(parent.id) || [];
        siblings.push(nodeId);
        siblingsByParent.set(parent.id, siblings);
    });

    let siblingCount = 0;
    siblingsByParent.forEach(siblings => {
        siblingCount += siblings.length * (siblings.length - 1) / 2;
    });
    const isCompleteSubtree = isMindMapSummaryCompleteSubtree(ids);
    const isSingleChain = !isCompleteSubtree
        && ids.every((nodeId, index) => ids.slice(index + 1).every(otherId =>
            isDescendant(state.data, nodeId, otherId)
            || isDescendant(state.data, otherId, nodeId)
        ));
    return {
        parentChildCount,
        siblingCount,
        orientation: isCompleteSubtree
            ? 'vertical'
            : (isSingleChain || parentChildCount > siblingCount ? 'horizontal' : 'vertical')
    };
}

function compareMindMapSummaryLayoutOrder(left, right) {
    const memberCountDifference = (right?.nodeIds?.length || 0) - (left?.nodeIds?.length || 0);
    if (memberCountDifference !== 0) return memberCountDifference;
    const leftSignature = Array.from(new Set(left?.nodeIds || [])).sort().join('|');
    const rightSignature = Array.from(new Set(right?.nodeIds || [])).sort().join('|');
    return leftSignature.localeCompare(rightSignature)
        || String(left?.id || '').localeCompare(String(right?.id || ''));
}

function getMindMapSummaryBracePath(bounds, side, braceX = null) {
    const direction = side === 'left' ? -1 : 1;
    const x = Number.isFinite(braceX)
        ? braceX
        : (side === 'left' ? bounds.left - MINDMAP_SUMMARY_BRACE_OFFSET : bounds.right + MINDMAP_SUMMARY_BRACE_OFFSET);
    const top = bounds.top - 8;
    const bottom = bounds.bottom + 8;
    const middle = (top + bottom) / 2;
    const height = Math.max(80, bottom - top);
    const shoulder = Math.min(22, height * 0.18);
    const depth = Math.min(18, Math.max(12, height * 0.08));
    const outerX = x + direction * depth;
    const tipX = x + direction * depth * 1.55;
    const round = value => Math.round(value * 10) / 10;

    return [
        `M ${round(x)} ${round(top)}`,
        `C ${round(outerX)} ${round(top)}, ${round(outerX)} ${round(top + 4)}, ${round(outerX)} ${round(top + shoulder)}`,
        `L ${round(outerX)} ${round(middle - shoulder)}`,
        `C ${round(outerX)} ${round(middle - 5)}, ${round(tipX)} ${round(middle - 4)}, ${round(tipX)} ${round(middle)}`,
        `C ${round(tipX)} ${round(middle + 4)}, ${round(outerX)} ${round(middle + 5)}, ${round(outerX)} ${round(middle + shoulder)}`,
        `L ${round(outerX)} ${round(bottom - shoulder)}`,
        `C ${round(outerX)} ${round(bottom - 4)}, ${round(outerX)} ${round(bottom)}, ${round(x)} ${round(bottom)}`
    ].join(' ');
}

function getMindMapSummaryHorizontalBracePath(bounds, placement, braceY = null) {
    const direction = placement === 'top' ? -1 : 1;
    const y = Number.isFinite(braceY)
        ? braceY
        : (placement === 'top'
            ? bounds.top - MINDMAP_SUMMARY_BRACE_OFFSET
            : bounds.bottom + MINDMAP_SUMMARY_BRACE_OFFSET);
    const left = bounds.left - 8;
    const right = bounds.right + 8;
    const middle = (left + right) / 2;
    const width = Math.max(80, right - left);
    const shoulder = Math.min(22, width * 0.18);
    const depth = Math.min(18, Math.max(12, width * 0.08));
    const outerY = y + direction * depth;
    const tipY = y + direction * depth * 1.55;
    const round = value => Math.round(value * 10) / 10;

    return [
        `M ${round(left)} ${round(y)}`,
        `C ${round(left)} ${round(outerY)}, ${round(left + 4)} ${round(outerY)}, ${round(left + shoulder)} ${round(outerY)}`,
        `L ${round(middle - shoulder)} ${round(outerY)}`,
        `C ${round(middle - 5)} ${round(outerY)}, ${round(middle - 4)} ${round(tipY)}, ${round(middle)} ${round(tipY)}`,
        `C ${round(middle + 4)} ${round(tipY)}, ${round(middle + 5)} ${round(outerY)}, ${round(middle + shoulder)} ${round(outerY)}`,
        `L ${round(right - shoulder)} ${round(outerY)}`,
        `C ${round(right - 4)} ${round(outerY)}, ${round(right)} ${round(outerY)}, ${round(right)} ${round(y)}`
    ].join(' ');
}

function getMindMapSummaryHorizontalPlacement(bounds, rootRect) {
    const rootCenterY = rootRect
        ? rootRect.top + rootRect.height / 2
        : (bounds.top + bounds.bottom) / 2;
    if (bounds.bottom <= rootCenterY) return { placement: 'top', region: 'top' };
    if (bounds.top >= rootCenterY) return { placement: 'bottom', region: 'bottom' };
    const selectionCenterY = (bounds.top + bounds.bottom) / 2;
    return {
        placement: selectionCenterY <= rootCenterY ? 'top' : 'bottom',
        region: 'middle'
    };
}

function getMindMapSummaryHorizontalBraceY(bounds, placement) {
    return placement === 'top'
        ? bounds.top - MINDMAP_SUMMARY_BRACE_OFFSET
        : bounds.bottom + MINDMAP_SUMMARY_BRACE_OFFSET;
}

function getMindMapSummaryHorizontalCandidate(
    bounds,
    placement,
    editorSize,
    labelOffset = 0,
    braceOffset = 0
) {
    const width = Math.max(80, bounds.right - bounds.left + 16);
    const depth = Math.min(18, Math.max(12, width * 0.08));
    const direction = placement === 'top' ? -1 : 1;
    const braceY = getMindMapSummaryHorizontalBraceY(bounds, placement)
        + direction * Math.max(0, Number(braceOffset) || 0);
    const labelY = braceY + direction * (depth * 1.55 + MINDMAP_SUMMARY_LABEL_GAP + labelOffset);
    const centerX = (bounds.left + bounds.right) / 2;
    const editorWidth = Math.max(MINDMAP_CARD_MIN_WIDTH, editorSize?.width || MINDMAP_SUMMARY_ESTIMATED_WIDTH);
    const editorHeight = Math.max(60, editorSize?.height || MINDMAP_SUMMARY_ESTIMATED_HEIGHT);
    const editorRect = {
        left: centerX - editorWidth / 2,
        right: centerX + editorWidth / 2,
        top: placement === 'top' ? labelY - editorHeight : labelY,
        bottom: placement === 'top' ? labelY : labelY + editorHeight
    };
    const footprint = {
        left: Math.min(bounds.left - 8, editorRect.left) - MINDMAP_SUMMARY_COLLISION_GAP,
        right: Math.max(bounds.right + 8, editorRect.right) + MINDMAP_SUMMARY_COLLISION_GAP
    };
    const collisionRect = {
        left: footprint.left,
        right: footprint.right,
        top: placement === 'top'
            ? editorRect.top - MINDMAP_SUMMARY_COLLISION_GAP
            : bounds.bottom,
        bottom: placement === 'top'
            ? bounds.top
            : editorRect.bottom + MINDMAP_SUMMARY_COLLISION_GAP
    };
    const requiredSpace = placement === 'top'
        ? bounds.top - editorRect.top + MINDMAP_SUMMARY_COLLISION_GAP
        : editorRect.bottom - bounds.bottom + MINDMAP_SUMMARY_COLLISION_GAP;
    return { braceY, labelY, editorRect, footprint, collisionRect, requiredSpace, braceOffset };
}

function getMindMapSummaryHorizontalBraceLane(bounds, placement, editorSize, occupiedGroups = []) {
    const direction = placement === 'top' ? -1 : 1;
    const left = bounds.left - 8;
    const right = bounds.right + 8;
    const baseBraceY = getMindMapSummaryHorizontalBraceY(bounds, placement);
    let braceOffset = 0;
    let braceY = baseBraceY;

    for (let index = 0; index <= occupiedGroups.length; index++) {
        const naturalCandidate = getMindMapSummaryHorizontalCandidate(
            bounds,
            placement,
            editorSize,
            0,
            braceOffset
        );
        const candidateTop = Math.min(naturalCandidate.braceY, naturalCandidate.editorRect.top);
        const candidateBottom = Math.max(naturalCandidate.braceY, naturalCandidate.editorRect.bottom);
        let outwardShift = 0;
        occupiedGroups.forEach(group => {
            if (group.placement !== placement
                || right <= group.left
                || left >= group.right) {
                return;
            }
            const outerEdge = Number.isFinite(group.outerEdge) ? group.outerEdge : group.braceY;
            const groupTop = Math.min(group.braceY, outerEdge);
            const groupBottom = Math.max(group.braceY, outerEdge);
            const overlapsVertically = candidateTop < groupBottom + MINDMAP_SUMMARY_COLLISION_GAP
                && candidateBottom > groupTop - MINDMAP_SUMMARY_COLLISION_GAP;
            // 水平投影相交并不代表两个总结属于同一局部区域。只有“大括号+卡片”
            // 的自然纵向占用也相交时才分配外侧轨道，避免把上方分支的总结推到下方。
            if (!overlapsVertically) return;
            const targetBraceY = placement === 'top'
                ? outerEdge - MINDMAP_SUMMARY_BRACE_LANE_GAP
                : outerEdge + MINDMAP_SUMMARY_BRACE_LANE_GAP;
            const requiredShift = placement === 'top'
                ? braceY - targetBraceY
                : targetBraceY - braceY;
            outwardShift = Math.max(outwardShift, requiredShift);
        });
        if (outwardShift <= 0) break;
        braceOffset += outwardShift;
        braceY = baseBraceY + direction * braceOffset;
    }
    return {
        braceOffset,
        track: { placement, left, right, braceY }
    };
}

function getMindMapSummaryVerticalCandidate(bounds, side, editorSize, braceOffset = 0) {
    const direction = side === 'left' ? -1 : 1;
    const baseBraceX = side === 'left'
        ? bounds.left - MINDMAP_SUMMARY_BRACE_OFFSET
        : bounds.right + MINDMAP_SUMMARY_BRACE_OFFSET;
    const braceX = baseBraceX + direction * braceOffset;
    const height = Math.max(80, bounds.bottom - bounds.top + 16);
    const depth = Math.min(18, Math.max(12, height * 0.08));
    const labelX = braceX + direction * (depth * 1.55 + MINDMAP_SUMMARY_LABEL_GAP);
    const labelY = (bounds.top + bounds.bottom) / 2;
    const editorWidth = Math.max(MINDMAP_CARD_MIN_WIDTH, editorSize?.width || MINDMAP_SUMMARY_ESTIMATED_WIDTH);
    const editorHeight = Math.max(60, editorSize?.height || MINDMAP_SUMMARY_ESTIMATED_HEIGHT);
    const editorRect = {
        left: side === 'left' ? labelX - editorWidth : labelX,
        right: side === 'left' ? labelX : labelX + editorWidth,
        top: labelY - editorHeight / 2,
        bottom: labelY + editorHeight / 2
    };
    const braceOuterX = braceX + direction * depth * 1.55;
    const collisionRect = {
        left: Math.min(braceX, braceOuterX, editorRect.left) - MINDMAP_SUMMARY_COLLISION_GAP,
        right: Math.max(braceX, braceOuterX, editorRect.right) + MINDMAP_SUMMARY_COLLISION_GAP,
        top: Math.min(bounds.top - 8, editorRect.top) - MINDMAP_SUMMARY_COLLISION_GAP,
        bottom: Math.max(bounds.bottom + 8, editorRect.bottom) + MINDMAP_SUMMARY_COLLISION_GAP
    };
    return { braceX, labelX, labelY, editorRect, collisionRect, braceOffset };
}

function getMindMapSummaryVisibleObstacleRects(nodeIds) {
    const selectedIds = new Set(nodeIds || []);
    return Array.from(document.querySelectorAll('.node-card'))
        .filter(card => !selectedIds.has(card.dataset.nodeId) && card.getClientRects().length > 0)
        .map(card => getMindMapCanvasRect(card));
}

function getMindMapSummaryVerticalEvaluation(bounds, side, editorSize, nodeIds, occupiedRects = []) {
    const obstacles = [
        ...getMindMapSummaryVisibleObstacleRects(nodeIds),
        ...(occupiedRects || [])
    ];
    let braceOffset = 0;
    let candidate = getMindMapSummaryVerticalCandidate(bounds, side, editorSize, braceOffset);
    for (let index = 0; index <= obstacles.length; index++) {
        let outwardShift = 0;
        obstacles.forEach(rect => {
            const intersects = rect.left < candidate.collisionRect.right
                && rect.right > candidate.collisionRect.left
                && rect.top < candidate.collisionRect.bottom
                && rect.bottom > candidate.collisionRect.top;
            if (!intersects) return;
            outwardShift = Math.max(outwardShift, side === 'left'
                ? candidate.collisionRect.right - rect.left
                : rect.right - candidate.collisionRect.left);
        });
        if (outwardShift <= 0) break;
        braceOffset += outwardShift;
        candidate = getMindMapSummaryVerticalCandidate(bounds, side, editorSize, braceOffset);
    }
    return {
        orientation: 'vertical',
        placement: side,
        region: 'side',
        candidate,
        cost: braceOffset
    };
}

function getMindMapSummaryCollisionOffset(candidate, placement, occupiedRects) {
    let offset = 0;
    (occupiedRects || []).forEach(rect => {
        const overlapsHorizontally = candidate.editorRect.left < rect.right + MINDMAP_SUMMARY_COLLISION_GAP
            && candidate.editorRect.right > rect.left - MINDMAP_SUMMARY_COLLISION_GAP;
        if (!overlapsHorizontally) return;
        if (placement === 'top') {
            if (candidate.editorRect.top < rect.bottom + MINDMAP_SUMMARY_COLLISION_GAP
                && candidate.editorRect.bottom > rect.top - MINDMAP_SUMMARY_COLLISION_GAP) {
                offset = Math.max(offset, candidate.editorRect.bottom - rect.top + MINDMAP_SUMMARY_COLLISION_GAP);
            }
        } else if (candidate.editorRect.top < rect.bottom + MINDMAP_SUMMARY_COLLISION_GAP
            && candidate.editorRect.bottom > rect.top - MINDMAP_SUMMARY_COLLISION_GAP) {
            offset = Math.max(offset, rect.bottom - candidate.editorRect.top + MINDMAP_SUMMARY_COLLISION_GAP);
        }
    });
    return offset;
}

function getMindMapSummaryCollisionFreeHorizontalCandidate(
    bounds,
    placement,
    editorSize,
    obstacleRects,
    initialLabelOffset = 0,
    braceOffset = 0
) {
    const obstacles = Array.isArray(obstacleRects) ? obstacleRects : [];
    const initialOffset = Math.max(0, Number(initialLabelOffset) || 0);
    let labelOffset = initialOffset;
    let candidate = getMindMapSummaryHorizontalCandidate(
        bounds,
        placement,
        editorSize,
        labelOffset,
        braceOffset
    );
    for (let index = 0; index <= obstacles.length; index++) {
        const collisionOffset = getMindMapSummaryCollisionOffset(candidate, placement, obstacles);
        if (collisionOffset <= 0) break;
        labelOffset += collisionOffset;
        candidate = getMindMapSummaryHorizontalCandidate(
            bounds,
            placement,
            editorSize,
            labelOffset,
            braceOffset
        );
    }
    return {
        candidate,
        labelOffset,
        shifted: labelOffset > initialOffset
    };
}

function getMindMapSummaryLayoutDeficit(requiredSpace, anchors) {
    if (!anchors || anchors.length === 0) {
        return { availableSpace: Number.POSITIVE_INFINITY, deficit: 0 };
    }
    const availableSpace = Math.min(...anchors.map(anchor => anchor.distance));
    return {
        availableSpace,
        deficit: Math.max(0, requiredSpace - availableSpace)
    };
}

function getMindMapSummaryGeometry(summary, layoutPlan = null) {
    const selection = getMindMapSummarySelection(summary?.nodeIds || []);
    if (!selection) return null;
    const cardRects = selection.nodeIds
        .map(nodeId => document.getElementById(`card-${nodeId}`))
        .filter(card => card && card.getClientRects().length > 0)
        .map(card => getMindMapCanvasRect(card));
    if (cardRects.length < MINDMAP_SUMMARY_MIN_NODES) return null;

    const bounds = {
        left: Math.min(...cardRects.map(rect => rect.left)),
        top: Math.min(...cardRects.map(rect => rect.top)),
        right: Math.max(...cardRects.map(rect => rect.right)),
        bottom: Math.max(...cardRects.map(rect => rect.bottom))
    };
    const orientation = layoutPlan?.orientation
        || getMindMapSummaryRelationProfile(selection.nodeIds).orientation;
    if (orientation === 'horizontal') {
        const rootCard = document.getElementById(`card-${state.data.id}`);
        const rootRect = rootCard ? getMindMapCanvasRect(rootCard) : null;
        const placementState = getMindMapSummaryHorizontalPlacement(bounds, rootRect);
        const placement = layoutPlan?.placement || placementState.placement;
        const region = layoutPlan?.region || 'local';
        const width = Math.max(80, bounds.right - bounds.left + 16);
        const depth = Math.min(18, Math.max(12, width * 0.08));
        const braceY = Number.isFinite(layoutPlan?.braceY)
            ? layoutPlan.braceY
            : getMindMapSummaryHorizontalBraceY(bounds, placement);
        const direction = placement === 'top' ? -1 : 1;
        const labelOffset = layoutPlan?.labelOffset || 0;
        return {
            bounds,
            side: selection.side,
            orientation,
            placement,
            region,
            braceY,
            path: getMindMapSummaryHorizontalBracePath(bounds, placement, braceY),
            labelX: (bounds.left + bounds.right) / 2,
            labelY: braceY + direction * (depth * 1.55 + MINDMAP_SUMMARY_LABEL_GAP + labelOffset)
        };
    }
    const direction = selection.side === 'left' ? -1 : 1;
    const braceX = Number.isFinite(layoutPlan?.braceX)
        ? layoutPlan.braceX
        : (selection.side === 'left'
            ? bounds.left - MINDMAP_SUMMARY_BRACE_OFFSET
            : bounds.right + MINDMAP_SUMMARY_BRACE_OFFSET);
    const height = Math.max(80, bounds.bottom - bounds.top + 16);
    const depth = Math.min(18, Math.max(12, height * 0.08));
    return {
        bounds,
        side: selection.side,
        orientation,
        placement: selection.side,
        region: 'side',
        path: getMindMapSummaryBracePath(bounds, selection.side, braceX),
        labelX: braceX + direction * (depth * 1.55 + MINDMAP_SUMMARY_LABEL_GAP),
        labelY: (bounds.top + bounds.bottom) / 2
    };
}

function selectMindMapSummary(summaryId) {
    if (!getMindMapSummaryById(summaryId)) return;
    clearSelectedMindMapRelation();
    state.selectedSummaryId = summaryId;
    state.selectedIds.clear();
    updateSelection();
    scheduleRenderMindMapSummaries();
}

function clearSelectedMindMapSummary() {
    if (!state.selectedSummaryId) return;
    state.selectedSummaryId = null;
    updateMindMapSummaryMemberHighlights();
    scheduleRenderMindMapSummaries();
    updateToolbar();
}

function deleteSelectedMindMapSummary() {
    const summaryId = state.selectedSummaryId;
    if (!summaryId || !Array.isArray(state.data.summaries)) return;
    const previousLength = state.data.summaries.length;
    state.data.summaries = state.data.summaries.filter(summary => summary.id !== summaryId);
    state.selectedSummaryId = null;
    if (state.data.summaries.length !== previousLength) {
        recordHistory();
        if (typeof showTopToast === 'function') showTopToast('🗑️ 已删除卡片总结');
    }
    scheduleRenderMindMapSummaries();
    updateToolbar();
}

function removeMindMapSummariesForNodes(nodeIds) {
    if (!nodeIds || nodeIds.size === 0 || !Array.isArray(state.data.summaries)) return false;
    let changed = false;
    const retained = [];
    state.data.summaries.forEach(summary => {
        const previousIds = Array.isArray(summary.nodeIds) ? summary.nodeIds : [];
        const remainingIds = Array.from(new Set(previousIds.filter(nodeId => !nodeIds.has(nodeId))));
        if (remainingIds.length !== previousIds.length) changed = true;
        if (remainingIds.length >= MINDMAP_SUMMARY_MIN_NODES) {
            summary.nodeIds = remainingIds;
            retained.push(summary);
        } else {
            changed = true;
            if (state.selectedSummaryId === summary.id) state.selectedSummaryId = null;
        }
    });
    if (changed) state.data.summaries = retained;
    return changed;
}

function hasDuplicateMindMapSummary(nodeIds) {
    const signature = Array.from(nodeIds).sort().join('|');
    return getMindMapSummaries().some(summary =>
        Array.from(new Set(summary.nodeIds || [])).sort().join('|') === signature
    );
}

function addSummaryForSelectedCards() {
    const selection = getMindMapSummarySelection();
    if (!selection) {
        if (typeof showTopToast === 'function') showTopToast('⚠️ 请选择同一侧的至少两张卡片');
        return;
    }
    if (hasDuplicateMindMapSummary(selection.nodeIds)) {
        if (typeof showTopToast === 'function') showTopToast('⚠️ 这些卡片已经有一个总结');
        return;
    }

    const summary = {
        id: `summary_${generateNodeId()}`,
        nodeIds: selection.nodeIds,
        topic: '总结',
        content: '',
        side: selection.side,
        color: '',
        isSimple: false,
        widthMode: 'auto',
        heightMode: 'auto'
    };
    ensureMindMapSummaries().push(summary);
    state.selectedRelationId = null;
    closeMindMapRelationEditor();
    state.selectedSummaryId = summary.id;
    state.selectedIds.clear();
    recordHistory();
    updateSelection();
    scheduleRenderMindMapSummaries();
    requestAnimationFrame(() => {
        openMindMapEditor(summary, false, true);
    });
}

function createMindMapSummaryEditor(summaryId) {
    const editor = document.createElement('div');
    editor.className = 'summary-editor';
    editor.dataset.summaryId = summaryId;

    const header = document.createElement('div');
    header.className = 'summary-card-header';
    const title = document.createElement('span');
    title.className = 'summary-card-title';
    const titleIcon = document.createElement('i');
    titleIcon.className = 'ri-braces-line';
    const topic = document.createElement('span');
    topic.className = 'summary-topic';
    topic.contentEditable = 'true';
    topic.setAttribute('role', 'textbox');
    topic.setAttribute('aria-label', '总结标题');
    title.append(titleIcon, topic);
    const tools = document.createElement('div');
    tools.className = 'summary-tools card-floating-tools';
    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'summary-tool summary-mode-toggle';
    toggleButton.dataset.summaryAction = 'toggle-simple';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'summary-tool summary-delete';
    deleteButton.title = '删除总结';
    deleteButton.setAttribute('aria-label', '删除总结');
    deleteButton.innerHTML = '<i class="ri-delete-bin-line"></i>';
    const body = document.createElement('div');
    body.className = 'summary-card-body md-content';
    tools.append(toggleButton, deleteButton);
    header.appendChild(title);
    editor.append(header, body, tools);
    editor.insertAdjacentHTML('beforeend', getMindMapResizeHandlesHTML());

    editor.addEventListener('mousedown', event => {
        const handle = event.target.closest('.resize-handle');
        if (handle) {
            const summary = getMindMapSummaryById(editor.dataset.summaryId);
            if (summary) beginMindMapResize(event, summary, 'summary', editor);
        }
        event.stopPropagation();
    });
    editor.addEventListener('dblclick', event => {
        const handle = event.target.closest('.resize-handle');
        const summary = getMindMapSummaryById(editor.dataset.summaryId);
        if (!summary) return;
        if (handle) autoFitMindMapEntity(summary, 'summary', handle.dataset.resize);
        else if (!event.target.closest('.summary-topic, .summary-tools')) openMindMapEditor(summary);
        else return;
        event.preventDefault();
        event.stopPropagation();
    });
    editor.addEventListener('click', () => selectMindMapSummary(editor.dataset.summaryId));
    topic.addEventListener('focus', () => selectMindMapSummary(editor.dataset.summaryId));
    topic.addEventListener('input', () => {
        const summary = getMindMapSummaryById(editor.dataset.summaryId);
        if (summary) summary.topic = topic.innerText.slice(0, 200);
    });
    topic.addEventListener('blur', () => {
        recordHistory();
        scheduleRenderMindMapSummaries();
    });
    topic.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) {
            event.preventDefault();
            topic.blur();
        }
    });
    toggleButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const summary = getMindMapSummaryById(editor.dataset.summaryId);
        if (!summary) return;
        toggleMindMapEntitySimpleMode(summary);
        state.selectedSummaryId = summary.id;
        recordHistory();
        scheduleRenderMindMapSummaries();
        requestAnimationFrame(() => topic.focus());
    });
    deleteButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        state.selectedSummaryId = editor.dataset.summaryId;
        deleteSelectedMindMapSummary();
    });
    return editor;
}

function updateMindMapSummarySelectionAction() {
    const action = $('#summarySelectionAction');
    if (!action) return;
    const selection = getMindMapSummarySelection();
    if (!selection) {
        action.style.display = 'none';
        return;
    }
    const rects = selection.nodeIds
        .map(nodeId => document.getElementById(`card-${nodeId}`)?.getBoundingClientRect())
        .filter(Boolean);
    if (rects.length < MINDMAP_SUMMARY_MIN_NODES) {
        action.style.display = 'none';
        return;
    }
    const left = Math.min(...rects.map(rect => rect.left));
    const right = Math.max(...rects.map(rect => rect.right));
    const top = Math.min(...rects.map(rect => rect.top));
    action.style.display = 'flex';
    const actionLeft = Math.max(8, Math.min(window.innerWidth - action.offsetWidth - 8, (left + right - action.offsetWidth) / 2));
    const actionTop = Math.max(8, Math.min(window.innerHeight - action.offsetHeight - 8, top - action.offsetHeight - 10));
    action.style.left = `${Math.round(actionLeft)}px`;
    action.style.top = `${Math.round(actionTop)}px`;
}

function clearMindMapSummaryBranchShifts() {
    document.querySelectorAll('.child-unit.summary-shifted').forEach(unit => {
        unit.classList.remove('summary-shifted');
        unit.style.removeProperty('--summary-shift-y');
    });
}

function getMindMapSummarySelectedBranchAnchor(selectedCards) {
    const ancestorChains = selectedCards.map(card => {
        const chain = [];
        let unit = card.closest('.child-unit');
        while (unit) {
            chain.push(unit);
            unit = unit.parentElement?.closest('.child-unit') || null;
        }
        return chain;
    }).filter(chain => chain.length > 0);
    if (ancestorChains.length !== selectedCards.length || ancestorChains.length === 0) return null;
    return ancestorChains[0].find(unit => ancestorChains.every(chain => chain.includes(unit))) || null;
}

function getMindMapSummaryDescendantSeparationAnchor(obstacleCard, selectedCards, placement) {
    const obstacleWrapper = obstacleCard?.closest?.('.node-wrapper');
    if (!obstacleWrapper) return null;
    const childrenContainer = Array.from(obstacleWrapper.children || [])
        .find(child => child.classList?.contains('children-container'));
    if (!childrenContainer) return null;
    const selectedUnits = Array.from(childrenContainer.children || []).filter(unit =>
        unit.classList?.contains('child-unit')
        && selectedCards.some(selectedCard => unit.contains(selectedCard))
    );
    if (selectedUnits.length === 0) return null;
    return {
        // 障碍本身是成员祖先时，应把成员子分支推离祖先卡片：
        // 上方总结将成员上移，下方总结将成员下移。
        anchor: placement === 'top' ? selectedUnits[selectedUnits.length - 1] : selectedUnits[0],
        direction: placement === 'top' ? 'after' : 'before'
    };
}

function getMindMapSummarySeparationAnchor(obstacleCard, selectedCards) {
    let unit = obstacleCard?.closest?.('.child-unit') || null;
    let outermostSeparateUnit = null;
    while (unit && !selectedCards.some(selectedCard => unit.contains(selectedCard))) {
        // 持续提升到“障碍分支”和“成员分支”分叉处的下一层。这个单元
        // 包含完整障碍子树，同时不会把共同祖先及其无关后代拆开。
        outermostSeparateUnit = unit;
        unit = unit.parentElement?.closest('.child-unit') || null;
    }
    return outermostSeparateUnit;
}

function getMindMapSummaryLayoutAnchors(nodeIds, placement, bounds, candidate = null) {
    const selectedIds = new Set(nodeIds || []);
    const selectedCards = Array.from(selectedIds)
        .map(nodeId => document.getElementById(`card-${nodeId}`))
        .filter(Boolean);
    if (selectedCards.length === 0 || !candidate?.editorRect) return [];

    const obstaclesByAnchor = new Map();
    document.querySelectorAll('.node-card').forEach(card => {
        if (selectedIds.has(card.dataset.nodeId) || card.getClientRects().length === 0) return;
        const rect = getMindMapCanvasRect(card);
        if (placement === 'top' && rect.top >= candidate.braceY) return;
        if (placement === 'bottom' && rect.bottom <= candidate.braceY) return;
        const collisionRect = candidate.collisionRect || {
            left: candidate.editorRect.left - MINDMAP_SUMMARY_COLLISION_GAP,
            right: candidate.editorRect.right + MINDMAP_SUMMARY_COLLISION_GAP,
            top: candidate.editorRect.top - MINDMAP_SUMMARY_COLLISION_GAP,
            bottom: candidate.editorRect.bottom + MINDMAP_SUMMARY_COLLISION_GAP
        };
        const intersects = rect.left < collisionRect.right
            && rect.right > collisionRect.left
            && rect.top < collisionRect.bottom
            && rect.bottom > collisionRect.top;
        if (!intersects) return;

        let anchor = getMindMapSummarySeparationAnchor(card, selectedCards);
        let direction = placement === 'top' ? 'after' : 'before';
        if (!anchor) {
            const descendantBoundary = getMindMapSummaryDescendantSeparationAnchor(
                card,
                selectedCards,
                placement
            );
            anchor = descendantBoundary?.anchor || null;
            direction = descendantBoundary?.direction || direction;
        }
        const distance = placement === 'top'
            ? bounds.top - rect.bottom
            : rect.top - bounds.bottom;
        const key = anchor || card;
        const existing = obstaclesByAnchor.get(key);
        if (!existing || distance < existing.distance) {
            obstaclesByAnchor.set(key, {
                anchor,
                obstacle: card,
                direction,
                distance
            });
        }
    });
    const obstacles = Array.from(obstaclesByAnchor.values());
    return obstacles.filter(candidate => !candidate.anchor
        || !obstacles.some(other =>
            other !== candidate
            && other.anchor
            && other.anchor.contains(candidate.anchor)
        ));
}

function addMindMapSummaryUnitShift(unit, deltaY, shiftByUnit) {
    if (!unit || !Number.isFinite(deltaY) || Math.abs(deltaY) < 0.5) return false;
    const nextShift = (shiftByUnit.get(unit) || 0) + deltaY;
    shiftByUnit.set(unit, nextShift);
    unit.style.setProperty('--summary-shift-y', `${Math.round(nextShift)}px`);
    unit.classList.add('summary-shifted');
    return true;
}

function getMindMapSummaryDirectChildUnits(container) {
    return Array.from(container?.children || [])
        .filter(child => child.classList?.contains('child-unit'));
}

function applyMindMapSummaryBoundaryShift(anchor, direction, distance, shiftByUnit) {
    const magnitude = Math.max(0, Math.ceil(Number(distance) || 0));
    if (!anchor || magnitude <= 0 || !['before', 'after'].includes(direction)) return false;
    const deltaY = direction === 'before' ? magnitude : -magnitude;
    let currentUnit = anchor;
    let isInitialBoundary = true;
    let changed = false;

    while (currentUnit) {
        const container = currentUnit.parentElement;
        if (!container?.classList?.contains('children-container')) break;
        const siblings = getMindMapSummaryDirectChildUnits(container);
        const index = siblings.indexOf(currentUnit);
        if (index < 0) break;

        // 初始层移动碰撞分支及同方向的兄弟；向上逐层传播时只移动
        // 外侧兄弟，当前祖先单元已经包含被移动的后代，不能重复平移。
        const targets = direction === 'before'
            ? siblings.slice(index + (isInitialBoundary ? 0 : 1))
            : siblings.slice(0, index + (isInitialBoundary ? 1 : 0));
        targets.forEach(unit => {
            changed = addMindMapSummaryUnitShift(unit, deltaY, shiftByUnit) || changed;
        });

        currentUnit = container.closest('.child-unit');
        isInitialBoundary = false;
    }
    return changed;
}

function getMindMapSummaryTreeConnectorPath(parentRect, childRect, side) {
    const startX = side === 'left' ? parentRect.left : parentRect.right;
    const endX = side === 'left' ? childRect.right : childRect.left;
    const startY = (parentRect.top + parentRect.bottom) / 2;
    const endY = (childRect.top + childRect.bottom) / 2;
    const middleX = (startX + endX) / 2;
    return getMindMapRoundedOrthogonalPath([
        { x: startX, y: startY },
        { x: middleX, y: startY },
        { x: middleX, y: endY },
        { x: endX, y: endY }
    ], 10);
}

function renderMindMapTreeConnectors() {
    const layer = document.getElementById('tree-connector-layer');
    const treeRoot = document.getElementById('tree-root');
    if (!layer || !treeRoot) return;
    layer.replaceChildren();
    treeRoot.classList.add('tree-connectors-active');

    document.querySelectorAll('.node-card').forEach(card => {
        const nodeId = card.dataset.nodeId;
        if (!nodeId || nodeId === state.data.id || card.getClientRects().length === 0) return;
        const parent = findParent(state.data, nodeId);
        const parentCard = parent ? document.getElementById(`card-${parent.id}`) : null;
        if (!parentCard || parentCard.getClientRects().length === 0) return;
        const side = getMindMapNodeBranchSide(nodeId);
        if (!side) return;
        const path = document.createElementNS(MINDMAP_SUMMARY_SVG_NS, 'path');
        path.classList.add('tree-connector');
        path.dataset.nodeId = nodeId;
        path.setAttribute('d', getMindMapSummaryTreeConnectorPath(
            getMindMapCanvasRect(parentCard),
            getMindMapCanvasRect(card),
            side
        ));
        layer.appendChild(path);
    });
}

function getMindMapSummaryEditorCanvasSize(summaryId) {
    const editor = document.querySelector(`.summary-editor[data-summary-id="${summaryId}"]`);
    if (!editor || editor.getClientRects().length === 0) {
        return {
            width: MINDMAP_SUMMARY_ESTIMATED_WIDTH,
            height: MINDMAP_SUMMARY_ESTIMATED_HEIGHT
        };
    }
    const rect = getMindMapCanvasRect(editor);
    return {
        width: Math.max(MINDMAP_CARD_MIN_WIDTH, rect.width),
        height: Math.max(60, rect.height)
    };
}

function prepareMindMapSummaryLayout(summaries) {
    clearMindMapSummaryBranchShifts();
    const fixedLayouts = new Map();
    const shiftByUnit = new Map();
    const orderedSummaries = [...summaries].sort(compareMindMapSummaryLayoutOrder);
    orderedSummaries.forEach(summary => {
        const geometry = getMindMapSummaryGeometry(summary);
        if (!geometry) return;
        fixedLayouts.set(summary.id, {
            orientation: geometry.orientation,
            placement: geometry.orientation === 'horizontal' ? geometry.placement : geometry.side
        });
    });

    const evaluateLayouts = () => {
        const evaluations = [];
        const occupiedSummaryRects = [];
        const occupiedHorizontalSummaryGroups = [];
        orderedSummaries.forEach(summary => {
            const fixed = fixedLayouts.get(summary.id);
            const geometry = getMindMapSummaryGeometry(summary, fixed);
            if (!geometry || !fixed) return;
            const editorSize = getMindMapSummaryEditorCanvasSize(summary.id);
            if (fixed.orientation === 'vertical') {
                const evaluation = getMindMapSummaryVerticalEvaluation(
                    geometry.bounds,
                    geometry.side,
                    editorSize,
                    summary.nodeIds,
                    occupiedSummaryRects
                );
                evaluations.push({ summary, geometry, ...evaluation });
                occupiedSummaryRects.push(evaluation.candidate.editorRect);
                return;
            }

            const braceLane = getMindMapSummaryHorizontalBraceLane(
                geometry.bounds,
                fixed.placement,
                editorSize,
                occupiedHorizontalSummaryGroups
            );
            const collisionResult = getMindMapSummaryCollisionFreeHorizontalCandidate(
                geometry.bounds,
                fixed.placement,
                editorSize,
                occupiedSummaryRects,
                0,
                braceLane.braceOffset
            );
            const anchors = getMindMapSummaryLayoutAnchors(
                summary.nodeIds,
                fixed.placement,
                geometry.bounds,
                collisionResult.candidate
            );
            evaluations.push({
                summary,
                geometry,
                orientation: 'horizontal',
                placement: fixed.placement,
                region: 'local',
                labelOffset: collisionResult.labelOffset,
                candidate: collisionResult.candidate,
                anchors
            });
            occupiedSummaryRects.push(collisionResult.candidate.editorRect);
            occupiedHorizontalSummaryGroups.push({
                ...braceLane.track,
                braceY: collisionResult.candidate.braceY,
                outerEdge: fixed.placement === 'top'
                    ? collisionResult.candidate.editorRect.top
                    : collisionResult.candidate.editorRect.bottom
            });
        });
        return evaluations;
    };

    let evaluations = [];
    for (let step = 0; step < MINDMAP_SUMMARY_LAYOUT_MAX_STEPS; step++) {
        evaluations = evaluateLayouts();
        let nextConstraint = null;
        evaluations.forEach(evaluation => {
            if (evaluation.orientation !== 'horizontal') return;
            evaluation.anchors.forEach(({ anchor, direction, distance }) => {
                if (!anchor) return;
                const deficit = Math.max(0, evaluation.candidate.requiredSpace - distance);
                if (deficit <= 0) return;
                if (!nextConstraint || deficit > nextConstraint.deficit) {
                    nextConstraint = { anchor, direction, deficit };
                }
            });
        });
        if (!nextConstraint) break;
        const changed = applyMindMapSummaryBoundaryShift(
            nextConstraint.anchor,
            nextConstraint.direction,
            nextConstraint.deficit,
            shiftByUnit
        );
        if (!changed) break;
    }
    evaluations = evaluateLayouts();

    const plans = new Map();
    evaluations.forEach(evaluation => {
        if (evaluation.orientation === 'vertical') {
            plans.set(evaluation.summary.id, {
                orientation: 'vertical',
                placement: evaluation.geometry.side,
                region: 'side',
                braceX: evaluation.candidate.braceX
            });
            return;
        }
        plans.set(evaluation.summary.id, {
            orientation: 'horizontal',
            placement: evaluation.placement,
            region: 'local',
            braceY: evaluation.candidate.braceY,
            labelOffset: evaluation.labelOffset
        });
    });
    if (shiftByUnit.size > 0) scheduleRenderMindMapRelations();
    return plans;
}

function prepareMindMapSummaryEditorsForMeasurement(summaries, labelLayer) {
    summaries.forEach(summary => {
        let editor = labelLayer.querySelector(`.summary-editor[data-summary-id="${summary.id}"]`);
        if (!editor) {
            editor = createMindMapSummaryEditor(summary.id);
            labelLayer.appendChild(editor);
        }
        const isSimple = Boolean(summary.isSimple);
        const summaryTopic = String(summary.topic ?? '总结').slice(0, 200);
        const summaryContent = getMindMapSummaryContent(summary);
        const topic = editor.querySelector('.summary-topic');
        const body = editor.querySelector('.summary-card-body');
        editor.classList.toggle('simple', isSimple);
        editor.classList.toggle('topic-empty', !summaryTopic.trim());
        editor.classList.toggle('has-content', Boolean(summaryContent));
        editor.style.width = summary.widthMode === 'manual' && summary.width ? `${summary.width}px` : '';
        editor.style.height = isSimple && summary.heightMode === 'manual' && summary.bodyHeight
            ? `${summary.bodyHeight}px`
            : '';
        body.style.height = !isSimple && summary.heightMode === 'manual' && summary.bodyHeight
            ? `${summary.bodyHeight}px`
            : '';
        if (document.activeElement !== topic && topic.innerText !== summaryTopic) topic.textContent = summaryTopic;
        if (body.dataset.summaryContent !== summaryContent) {
            body.innerHTML = renderMarkdown(summaryContent);
            body.dataset.summaryContent = summaryContent;
            processRichContent(body);
        }
    });
}

function renderMindMapSummaries() {
    summaryRenderFrame = null;
    // 缩放过程由指针事件直接控制总结卡片尺寸。此时若执行避障重排，
    // ResizeObserver 与手柄会同时改写位置，造成临界尺寸附近疯狂跳动。
    // 鼠标松开后 onMouseUp 会再安排一次最终布局。
    if (state.mode === 'RESIZING' && state.resize?.kind === 'summary') return;
    const braceLayer = $('#summary-brace-layer');
    const labelLayer = $('#summary-label-layer');
    if (!braceLayer || !labelLayer) return;
    braceLayer.replaceChildren();

    const summaries = getMindMapSummaries();
    if (state.selectedSummaryId && !summaries.some(summary => summary.id === state.selectedSummaryId)) {
        state.selectedSummaryId = null;
    }
    updateMindMapSummaryMemberHighlights();
    // 编辑器必须先按持久化尺寸和正文完成 DOM 初始化，避障求解器才能拿到
    // 真实矩形；先用估算高度布局、下一帧再补测会必然残留大卡片重叠。
    prepareMindMapSummaryEditorsForMeasurement(summaries, labelLayer);
    const visibleSummaryIds = new Set();
    const layoutPlans = prepareMindMapSummaryLayout(summaries);
    renderMindMapTreeConnectors();
    let shouldRemeasureLayout = false;
    summaries.forEach(summary => {
        const geometry = getMindMapSummaryGeometry(summary, layoutPlans.get(summary.id));
        if (!geometry) return;
        visibleSummaryIds.add(summary.id);

        const path = document.createElementNS(MINDMAP_SUMMARY_SVG_NS, 'path');
        path.classList.add('summary-brace');
        path.classList.toggle('active', summary.id === state.selectedSummaryId);
        path.dataset.summaryId = summary.id;
        path.setAttribute('d', geometry.path);
        if (/^#[0-9a-f]{6}$/i.test(summary.color || '')) {
            path.style.setProperty('--summary-color', summary.color);
        }
        braceLayer.appendChild(path);

        const editor = labelLayer.querySelector(`.summary-editor[data-summary-id="${summary.id}"]`);
        if (!editor) return;
        editor.classList.toggle('left-side', geometry.orientation === 'vertical' && geometry.side === 'left');
        editor.classList.toggle('horizontal', geometry.orientation === 'horizontal');
        editor.classList.toggle('placement-top', geometry.orientation === 'horizontal' && geometry.placement === 'top');
        editor.classList.toggle('placement-bottom', geometry.orientation === 'horizontal' && geometry.placement === 'bottom');
        editor.classList.toggle('active', summary.id === state.selectedSummaryId);
        editor.classList.toggle('simple', Boolean(summary.isSimple));
        editor.style.left = `${geometry.labelX}px`;
        editor.style.top = `${geometry.labelY}px`;
        if (/^#[0-9a-f]{6}$/i.test(summary.color || '')) {
            editor.style.setProperty('--summary-accent', summary.color);
            editor.classList.add('has-color');
        } else {
            editor.style.removeProperty('--summary-accent');
            editor.classList.remove('has-color');
        }
        editor.style.width = summary.widthMode === 'manual' && summary.width ? `${summary.width}px` : '';
        editor.style.height = summary.isSimple && summary.heightMode === 'manual' && summary.bodyHeight
            ? `${summary.bodyHeight}px`
            : '';
        const topic = editor.querySelector('.summary-topic');
        const body = editor.querySelector('.summary-card-body');
        const toggleButton = editor.querySelector('[data-summary-action="toggle-simple"]');
        const isSimple = Boolean(summary.isSimple);
        const toggleTitle = isSimple ? '切换回卡片模式' : '切换为便利贴模式';
        toggleButton.title = toggleTitle;
        toggleButton.setAttribute('aria-label', toggleTitle);
        toggleButton.setAttribute('aria-pressed', String(isSimple));
        toggleButton.innerHTML = `<i class="${isSimple ? 'ri-layout-top-2-line' : 'ri-sticky-note-line'}"></i>`;
        body.style.height = !isSimple && summary.heightMode === 'manual' && summary.bodyHeight
            ? `${summary.bodyHeight}px`
            : '';
        const summaryTopic = String(summary.topic ?? '总结').slice(0, 200);
        if (document.activeElement !== topic && topic.innerText !== summaryTopic) topic.textContent = summaryTopic;
        const wasTopicEmpty = editor.classList.contains('topic-empty');
        const isTopicEmpty = document.activeElement !== topic && !summaryTopic.trim();
        editor.classList.toggle('topic-empty', isTopicEmpty);
        if (wasTopicEmpty !== isTopicEmpty && geometry.orientation === 'horizontal') {
            shouldRemeasureLayout = true;
        }
        const summaryContent = getMindMapSummaryContent(summary);
        editor.classList.toggle('has-content', Boolean(summaryContent));
        if (body.dataset.summaryContent !== summaryContent) {
            body.innerHTML = renderMarkdown(summaryContent);
            body.dataset.summaryContent = summaryContent;
            processRichContent(body);
            if (geometry.orientation === 'horizontal') shouldRemeasureLayout = true;
        }
    });

    labelLayer.querySelectorAll('.summary-editor').forEach(editor => {
        if (!visibleSummaryIds.has(editor.dataset.summaryId)) editor.remove();
    });
    updateMindMapSummarySelectionAction();
    updateToolbar();
    if (shouldRemeasureLayout) scheduleRenderMindMapSummaries();
}

function scheduleRenderMindMapSummaries() {
    if (summaryRenderFrame !== null) return;
    summaryRenderFrame = requestAnimationFrame(renderMindMapSummaries);
}

function initializeMindMapSummaries() {
    const action = $('#summarySelectionAction');
    if (!$('#summary-brace-layer') || !$('#summary-label-layer') || !action) return;
    action.addEventListener('mousedown', event => event.stopPropagation());
    action.addEventListener('click', addSummaryForSelectedCards);
    window.addEventListener('resize', scheduleRenderMindMapSummaries);
    scheduleRenderMindMapSummaries();
}
// #endregion

// =============================================================================
// #region 搜索定位
// =============================================================================
function normalizeMapSearchText(value) {
    const text = String(value ?? '');
    const normalized = typeof text.normalize === 'function' ? text.normalize('NFKC') : text;
    return normalized.toLowerCase();
}

function stripMarkdownForSearch(value) {
    return String(value ?? '')
        .replace(/```[\s\S]*?```/g, block => block.replace(/```[^\n]*\n?|```/g, ' '))
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/(^|\s)[#>*_~`|+-]+(?=\s|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function makeMapSearchSnippet(content, terms) {
    const plainText = stripMarkdownForSearch(content);
    if (!plainText) return '';

    const normalized = normalizeMapSearchText(plainText);
    const firstMatch = terms.reduce((best, term) => {
        const index = normalized.indexOf(term);
        return index >= 0 && (best < 0 || index < best) ? index : best;
    }, -1);
    const start = Math.max(0, firstMatch < 0 ? 0 : firstMatch - 32);
    const snippet = plainText.slice(start, start + 108);
    return `${start > 0 ? '…' : ''}${snippet}${start + 108 < plainText.length ? '…' : ''}`;
}

function collectMapSearchResults(root, query, allowedNodeIds = null) {
    const terms = normalizeMapSearchText(query).trim().split(/[\s\u3000]+/u).filter(Boolean);
    if (!root || terms.length === 0) return [];

    const results = [];
    let treeOrder = 0;
    const visit = (node, ancestors) => {
        if (!node) return;
        const topic = String(node.topic ?? '').trim();
        const content = String(node.content ?? '');
        const normalizedTopic = normalizeMapSearchText(topic);
        const normalizedContent = normalizeMapSearchText(stripMarkdownForSearch(content));
        const searchableText = `${normalizedTopic}\n${normalizedContent}`;

        const isAllowed = !allowedNodeIds || allowedNodeIds.has(node.id);
        if (isAllowed && terms.every(term => searchableText.includes(term))) {
            const titleMatches = terms.filter(term => normalizedTopic.includes(term)).length;
            const titleRank = titleMatches === terms.length ? 0 : titleMatches > 0 ? 1 : 2;
            const route = [...ancestors, node];
            const rootChild = route.length > 1 ? route[1] : null;
            results.push({
                id: node.id,
                topic: topic || '未命名卡片',
                snippet: makeMapSearchSnippet(content, terms),
                path: ancestors.map(item => String(item.topic ?? '').trim()).filter(Boolean),
                pathIds: ancestors.map(item => item.id),
                rootDirection: rootChild ? (rootChild.dir === 'left' ? 'left' : 'right') : null,
                titleRank,
                treeOrder: treeOrder++
            });
        } else {
            treeOrder++;
        }

        (node.children || []).forEach(child => visit(child, [...ancestors, node]));
    };

    visit(root, []);
    return results.sort((a, b) => a.titleRank - b.titleRank || a.treeOrder - b.treeOrder);
}

function getRenderedMapSearchNodeIds() {
    return new Set(Array.from(
        document.querySelectorAll('#tree-root .node-card[data-node-id]'),
        card => card.dataset.nodeId
    ));
}

function isMapSearchOpen() {
    return Boolean($('#mapSearchPanel')?.classList.contains('active'));
}

function isMapNodeTemporarilyExpanded(nodeId) {
    return mapSearchState.revealedNodeIds.has(nodeId);
}

function isMapRootDirectionTemporarilyExpanded(direction) {
    return mapSearchState.revealedRootDirections.has(direction);
}

function clearMapSearchReveal() {
    const hadReveal = mapSearchState.revealedNodeIds.size > 0
        || mapSearchState.revealedRootDirections.size > 0;
    mapSearchState.revealedNodeIds.clear();
    mapSearchState.revealedRootDirections.clear();
    return hadReveal;
}

function syncMapSearchScopeButton() {
    const button = $('#btn-search-visible');
    if (!button) return;
    const visibleOnly = mapSearchState.visibleOnly;
    button.classList.toggle('active', visibleOnly);
    button.setAttribute('aria-pressed', String(visibleOnly));
    const label = visibleOnly ? '搜索全部卡片' : '仅搜索未折叠卡片';
    button.title = label;
    button.setAttribute('aria-label', label);
}

function refreshVisibleMapSearchResults() {
    if (!mapSearchState.visibleOnly || !isMapSearchOpen()) return;
    executeMapSearch(mapSearchState.query);
}

function renderMapSearchResults() {
    const container = $('#mapSearchResults');
    const count = $('#mapSearchCount');
    const previousButton = $('#btn-search-prev');
    const nextButton = $('#btn-search-next');
    if (!container || !count) return;

    const total = mapSearchState.results.length;
    const current = total > 0 ? mapSearchState.activeIndex + 1 : 0;
    count.textContent = `${current}/${total}`;
    if (previousButton) previousButton.disabled = total === 0;
    if (nextButton) nextButton.disabled = total === 0;
    container.replaceChildren();

    if (!mapSearchState.query.trim()) {
        const empty = document.createElement('div');
        empty.className = 'map-search-empty';
        empty.textContent = '输入关键词，搜索卡片标题和正文';
        container.appendChild(empty);
        return;
    }
    if (total === 0) {
        const empty = document.createElement('div');
        empty.className = 'map-search-empty';
        empty.textContent = mapSearchState.visibleOnly
            ? '当前未折叠卡片中没有匹配结果'
            : '没有找到匹配的卡片';
        container.appendChild(empty);
        return;
    }

    mapSearchState.results.forEach((result, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `map-search-result${index === mapSearchState.activeIndex ? ' active' : ''}`;
        button.dataset.searchIndex = String(index);
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(index === mapSearchState.activeIndex));

        const title = document.createElement('span');
        title.className = 'map-search-result-title';
        title.textContent = result.topic;
        button.appendChild(title);

        if (result.path.length > 0) {
            const path = document.createElement('span');
            path.className = 'map-search-result-path';
            path.textContent = result.path.join(' › ');
            button.appendChild(path);
        }
        if (result.snippet) {
            const snippet = document.createElement('span');
            snippet.className = 'map-search-result-snippet';
            snippet.textContent = result.snippet;
            button.appendChild(snippet);
        }
        container.appendChild(button);
    });
}

function executeMapSearch(query) {
    mapSearchState.query = String(query ?? '');
    const allowedNodeIds = mapSearchState.visibleOnly ? getRenderedMapSearchNodeIds() : null;
    mapSearchState.results = collectMapSearchResults(state.data, mapSearchState.query, allowedNodeIds);
    mapSearchState.activeIndex = mapSearchState.results.length > 0 ? 0 : -1;
    mapSearchState.hasLocated = false;
    // 输入中的新关键词（包括无结果）不应收起已定位结果临时展开的路径。
    // 真正定位另一条结果时会在 locateMapSearchResult 中切换临时展开状态。
    renderMapSearchResults();
}

function getMapSearchClipboardQuery(value) {
    const query = String(value ?? '').trim();
    const characterCount = Array.from(query).length;
    return characterCount > 0 && characterCount <= MAP_SEARCH_CLIPBOARD_MAX_CHARS ? query : '';
}

async function readMapSearchClipboardText() {
    if (!navigator.clipboard) return '';
    try {
        if (typeof navigator.clipboard.readText === 'function') {
            const text = await navigator.clipboard.readText();
            if (text) return text;
        }
    } catch (_) {
        // 部分 WebView2 对 readText 支持不稳定，继续尝试 ClipboardItem 回退。
    }

    try {
        if (typeof navigator.clipboard.read !== 'function') return '';
        const items = await navigator.clipboard.read();
        for (const item of items) {
            if (!item.types.includes('text/plain')) continue;
            return await (await item.getType('text/plain')).text();
        }
    } catch (_) {
        // 保留空字符串，搜索框仍可正常手动输入。
    }
    return '';
}

async function applyMapSearchClipboardQuery(input, initialValue, requestId) {
    try {
        const query = getMapSearchClipboardQuery(await readMapSearchClipboardText());
        const canApply = query
            && requestId === mapSearchState.clipboardRequestId
            && isMapSearchOpen()
            && input.value === initialValue;
        if (!canApply) return;
        input.value = query;
        executeMapSearch(query);
    } catch (_) {
        // WebView2 或浏览器未授予剪贴板读取权限时，保留当前搜索词和正常聚焦行为。
    }
}

function cancelMapSearchPendingFocus() {
    mapSearchState.focusRequestId += 1;
    if (mapSearchState.focusTimer) clearTimeout(mapSearchState.focusTimer);
    mapSearchState.focusTimer = null;
}

function focusMapSearchInput(input) {
    if (!input) return;
    cancelMapSearchPendingFocus();
    const requestId = mapSearchState.focusRequestId;
    const applyFocus = () => {
        if (requestId !== mapSearchState.focusRequestId || !input.isConnected || !isMapSearchOpen()) return;
        input.focus({ preventScroll: true });
        input.select();
    };
    applyFocus();
    // 先覆盖普通浏览器的下一帧布局，再覆盖 WebView2 完成 visibility 过渡后的焦点时序。
    requestAnimationFrame(applyFocus);
    mapSearchState.focusTimer = setTimeout(() => {
        mapSearchState.focusTimer = null;
        if (document.activeElement !== input) applyFocus();
    }, 180);
}

function openMapSearch({ prefillFromClipboard = false } = {}) {
    const panel = $('#mapSearchPanel');
    const input = $('#mapSearchInput');
    if (!panel || !input) return;
    const initialValue = input.value;
    const requestId = ++mapSearchState.clipboardRequestId;
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
    executeMapSearch(input.value);
    focusMapSearchInput(input);
    if (prefillFromClipboard) {
        void applyMapSearchClipboardQuery(input, initialValue, requestId);
    }
}

function closeMapSearch() {
    const panel = $('#mapSearchPanel');
    if (!panel) return;
    cancelMapSearchPendingFocus();
    mapSearchState.clipboardRequestId += 1;
    if (panel.contains(document.activeElement)) document.activeElement.blur();
    panel.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
    document.querySelector('.node-card.search-active')?.classList.remove('search-active');
}

function resetMapSearch() {
    clearMapSearchReveal();
    if (mapSearchState.pulseTimer) clearTimeout(mapSearchState.pulseTimer);
    mapSearchState.pulseTimer = null;
    mapSearchState.query = '';
    mapSearchState.results = [];
    mapSearchState.activeIndex = -1;
    mapSearchState.hasLocated = false;
    mapSearchState.visibleOnly = false;
    const input = $('#mapSearchInput');
    if (input) input.value = '';
    syncMapSearchScopeButton();
    closeMapSearch();
    renderMapSearchResults();
}

function centerMapNodeInVisibleArea(card) {
    const cardRect = card.getBoundingClientRect();
    const panel = $('#mapSearchPanel');
    const panelRect = isMapSearchOpen() && panel ? panel.getBoundingClientRect() : null;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;

    if (panelRect && panelRect.width < window.innerWidth * 0.55) {
        targetX = Math.max(80, panelRect.left / 2);
    } else if (panelRect) {
        const spaceBelow = window.innerHeight - panelRect.bottom;
        if (spaceBelow > 100) targetY = panelRect.bottom + spaceBelow / 2;
    }

    state.view.tx += targetX - (cardRect.left + cardRect.width / 2);
    state.view.ty += targetY - (cardRect.top + cardRect.height / 2);
    updateTransform();
}

function pulseMapSearchTarget(card) {
    if (mapSearchState.pulseTimer) clearTimeout(mapSearchState.pulseTimer);
    document.querySelector('.node-card.search-active')?.classList.remove('search-active');
    void card.offsetWidth;
    card.classList.add('search-active');
    mapSearchState.pulseTimer = setTimeout(() => {
        card.classList.remove('search-active');
        mapSearchState.pulseTimer = null;
    }, 1050);
}

function locateMapSearchResult(index) {
    const result = mapSearchState.results[index];
    if (!result) return;

    mapSearchState.activeIndex = index;
    mapSearchState.hasLocated = true;
    if (!mapSearchState.visibleOnly) {
        clearMapSearchReveal();
        result.pathIds.forEach(id => {
            if (id !== state.data.id) mapSearchState.revealedNodeIds.add(id);
        });
        if (result.rootDirection) mapSearchState.revealedRootDirections.add(result.rootDirection);
        renderTree();
    }

    state.selectedRelationId = null;
    state.selectedSummaryId = null;
    closeMindMapRelationEditor();
    state.selectedIds.clear();
    state.selectedIds.add(result.id);
    updateSelection();
    renderMapSearchResults();
    $('#mapSearchResults')?.querySelector(`[data-search-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });

    requestAnimationFrame(() => requestAnimationFrame(() => {
        const card = document.getElementById(`card-${result.id}`);
        if (!card) return;
        centerMapNodeInVisibleArea(card);
        pulseMapSearchTarget(card);
    }));
}

function navigateMapSearch(direction) {
    const total = mapSearchState.results.length;
    if (total === 0) return;
    const nextIndex = mapSearchState.hasLocated
        ? (mapSearchState.activeIndex + direction + total) % total
        : (direction < 0 ? total - 1 : 0);
    locateMapSearchResult(nextIndex);
}

function initializeMapSearch() {
    const panel = $('#mapSearchPanel');
    const input = $('#mapSearchInput');
    const results = $('#mapSearchResults');
    if (!panel || !input || !results) return;

    $('#btn-search').onclick = () => openMapSearch();
    $('#btn-search-close').onclick = closeMapSearch;
    $('#btn-search-prev').onclick = () => navigateMapSearch(-1);
    $('#btn-search-next').onclick = () => navigateMapSearch(1);
    document.addEventListener('mousedown', event => {
        if (!isMapSearchOpen() || event.target === input || event.target.closest('#btn-search')) return;
        cancelMapSearchPendingFocus();
    }, true);
    $('#btn-search-visible').onclick = () => {
        mapSearchState.visibleOnly = !mapSearchState.visibleOnly;
        syncMapSearchScopeButton();
        executeMapSearch(input.value);
    };
    syncMapSearchScopeButton();

    input.addEventListener('input', () => executeMapSearch(input.value));
    input.addEventListener('paste', event => {
        const clipboard = event.clipboardData;
        const customText = clipboard?.getData(CUSTOM_MIME_TYPE);
        const plainText = clipboard?.getData('text/plain');
        const text = customText || plainText;
        if (!text) return;

        try {
            const nodes = getMindMapClipboardNodes(JSON.parse(text));
            if (!nodes) return;
            event.preventDefault();
            pasteMindMapNodesToSelection(nodes);
        } catch (_) {
            // 私有剪贴板格式在部分浏览器只暴露占位文本，回退到既有异步读取流程。
            if (plainText?.startsWith('[MindMap Nodes:')) {
                event.preventDefault();
                void pasteNodesToSelection();
            }
        }
    });
    results.addEventListener('click', (event) => {
        const item = event.target.closest('[data-search-index]');
        if (item) locateMapSearchResult(Number(item.dataset.searchIndex));
    });
    panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeMapSearch();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            navigateMapSearch(event.shiftKey ? -1 : 1);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            navigateMapSearch(event.key === 'ArrowDown' ? 1 : -1);
        }
    });
    panel.addEventListener('mousedown', event => event.stopPropagation());
}
// #endregion

function applyColorToMindMapSelection(color) {
    let changed = false;
    state.selectedIds.forEach(id => {
        const node = findNode(state.data, id);
        if (node && node.color !== color) {
            node.color = color;
            updateNodeDOM(node.id);
            changed = true;
        }
    });
    const summary = getMindMapSummaryById(state.selectedSummaryId);
    if (summary && summary.color !== color) {
        summary.color = color;
        scheduleRenderMindMapSummaries();
        changed = true;
    }
    return changed;
}

// 通用的应用颜色函数
function applyCustomColorToSelection (color, isFinalStep) {
    saveGlobalScrolls();
    applyColorToMindMapSelection(color);

    // 2. 关键修复：只要是最终步骤 (change事件)，强制检查并记录历史
    // 我们不再依赖上面的 if (n.color !== color) 判断，
    // 因为 input 事件可能已经提前把数据改掉了，导致这里判断为 false。
    // recordHistory() 内部会自动对比数据是否真的变了，所以这里强制调用是安全的。
    if (isFinalStep) {
        recordHistory();
    }
    restoreGlobalScrolls();
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
                const selectedNodes = state.selectedIds.has(state.drag.nodeId) ? Array.from(state.selectedIds) : [state.drag.nodeId];
                const nodes = getMindMapDragProcessingOrder(selectedNodes, state.drag.dropType);
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
        const card = state.resize.element || getMindMapResizableElement(state.resize.node, state.resize.kind || 'node');
        if(card) card.classList.remove('no-trans');
        state.resize.node=null;
        recordHistory();
        stabilizeRoot(); // <--- 【核心修改】在这里加上它！
        scheduleRenderMindMapRelations();
        scheduleRenderMindMapSummaries();
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

function commitMindMapInlineEditor() {
    syncCurrentInput();
    const activeEl = document.activeElement;
    if (activeEl?.matches('.node-topic, .summary-topic')) {
        activeEl.blur();
    }
}


// ==========================================
// #region 存储相关
// ==========================================
function saveGlobalScrolls() {
    state.scrollMap = new Map(Object.entries(sanitizeMindMapScrollMap(state.scrollMap, state.data)));
    document.querySelectorAll('.card-body').forEach(el => {
        const card = el.closest('.node-card');
        if (!card) return;
        const nodeId = card.dataset.nodeId;
        const scrollTop = Number(el.scrollTop);
        if (Number.isFinite(scrollTop) && scrollTop > 0) state.scrollMap.set(nodeId, scrollTop);
        else state.scrollMap.delete(nodeId);
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
        persistMindMapWorkbookSession();
        console.log('MindMap 操作保存');
    }, 2000);
    const currentFileID = sessionStorage.getItem('currentFileID');
    if (currentFileID){
        clearTimeout(saveToCloudTimer);
        saveToCloudTimer = setTimeout(() => {
            saveMindMapData(true,false);
        },20*1000)
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
    state.selectedRelationId = null;
    state.selectedSummaryId = null;
    closeMindMapRelationEditor();
    
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





function isTemporarilyCollapsed(node) {
    return Boolean(
        state.compactView &&
        node &&
        !node.isSimple &&
        node.content &&
        node.topic &&
        node.topic.trim()
    );
}

function getMindMapResizeHandlesHTML() {
    return '<div class="resize-handle resize-l" data-resize="w"></div>'
        + '<div class="resize-handle resize-r" data-resize="w"></div>'
        + '<div class="resize-handle resize-b" data-resize="h"></div>'
        + '<div class="resize-handle resize-bl" data-resize="wh"></div>'
        + '<div class="resize-handle resize-br" data-resize="wh"></div>';
}

function createMindMapNodeContentBodyHTML(content, style = '') {
    return `<div class="card-body md-content" style="${style}">${renderMarkdown(content)}</div>`;
}

function toggleMindMapEntitySimpleMode(entity) {
    entity.isSimple = !entity.isSimple;
    entity.heightMode = 'auto';
    if (entity.isSimple) {
        entity.widthMode = 'manual';
        if (!entity.width) entity.width = 400;
        if (!entity.bodyHeight) entity.bodyHeight = 220;
    } else {
        entity.widthMode = 'auto';
    }
}

function getMindMapResizableElement(target, kind = 'node') {
    if (!target) return null;
    return kind === 'summary'
        ? document.querySelector(`.summary-editor[data-summary-id="${target.id}"]`)
        : document.getElementById(`card-${target.id}`);
}

function getMindMapResizeTarget(element) {
    const summaryEditor = element?.closest('.summary-editor');
    if (summaryEditor) {
        const summary = getMindMapSummaryById(summaryEditor.dataset.summaryId);
        return summary ? { entity: summary, kind: 'summary' } : null;
    }
    const card = element?.closest('.node-card');
    if (!card) return null;
    const node = findNode(state.data, card.dataset.nodeId);
    return node ? { entity: node, kind: 'node' } : null;
}

function autoFitMindMapEntity(target, kind = 'node', direction = 'wh') {
    if (!target) return;
    // 双击手柄会触发局部 DOM 更新，先同步未失焦的 topic，避免新输入被旧数据覆盖。
    syncCurrentInput();
    if (direction.includes('w')) target.widthMode = 'auto';
    if (direction.includes('h')) target.heightMode = 'auto';
    recordHistory();
    if (kind === 'summary') scheduleRenderMindMapSummaries();
    else updateNodeDOM(target.id);
}

function beginMindMapResize(event, target, kind, element) {
    if (!target || !element) return;
    const heightElement = getMindMapEntityHeightElement(target, kind, element);
    const body = heightElement === element ? null : heightElement;
    const minWidth = getMindMapEntityMinWidth(element);
    const minHeight = getMindMapEntityMinHeight(target, kind, element);
    state.mode = 'RESIZING';
    state.resize = {
        node: target,
        kind,
        element,
        dir: event.target.dataset.resize,
        handleEl: event.target,
        startW: element.offsetWidth,
        startH: body ? body.offsetHeight : element.offsetHeight,
        minWidth,
        minHeight,
        widthPointerFactor: getMindMapResizePointerFactor(kind, element, 'width'),
        heightPointerFactor: getMindMapResizePointerFactor(kind, element, 'height'),
        heightPointerDirection: getMindMapResizeHeightDirection(kind, element),
        mx: event.clientX,
        my: event.clientY,
        startViewTy: state.view.ty
    };
    element.classList.add('no-trans');
    event.preventDefault();
    event.stopPropagation();
}

function getMindMapResizePointerFactor(kind, element, axis) {
    if (kind !== 'summary' || !element?.classList.contains('horizontal')) {
        return axis === 'height' ? 2 : 1;
    }
    // 横向总结卡片以 X 轴中心定位，宽度每增加 2px，右侧手柄只移动 1px；
    // 高度则由靠近括号的一侧锚定，手柄与高度保持 1:1。
    return axis === 'width' ? 2 : 1;
}

function getMindMapResizeHeightDirection(kind, element) {
    // 顶部总结卡片的底边与括号锚定，因此把高度手柄放在自由的顶边；
    // 向上拖动（负 delta）应增加高度。
    return kind === 'summary'
        && element?.classList.contains('horizontal')
        && element.classList.contains('placement-top')
        ? -1
        : 1;
}

function getMindMapEntityHeightElement(target, kind, element) {
    if (!target || !element || target.isSimple) return element;
    return element.querySelector(kind === 'summary' ? '.summary-card-body' : '.card-body') || element;
}

function getMindMapEntityMinHeight(target, kind, element) {
    const heightElement = getMindMapEntityHeightElement(target, kind, element);
    const minHeight = Number.parseFloat(window.getComputedStyle(heightElement).minHeight);
    return Number.isFinite(minHeight) ? minHeight : 0;
}

function getMindMapEntityMinWidth(element) {
    const minWidth = Number.parseFloat(window.getComputedStyle(element).minWidth);
    return Number.isFinite(minWidth) ? minWidth : MINDMAP_CARD_MIN_WIDTH;
}

function applyMindMapEntitySize(target, kind, width, height, sourceIsSimple) {
    const element = getMindMapResizableElement(target, kind);
    if (!element) return;
    if (width !== null) {
        const safeWidth = Math.max(getMindMapEntityMinWidth(element), width);
        target.width = safeWidth;
        target.widthMode = 'manual';
        element.style.width = `${safeWidth}px`;
    }
    if (height === null || Boolean(target.isSimple) !== Boolean(sourceIsSimple)) return;
    const safeHeight = Math.max(getMindMapEntityMinHeight(target, kind, element), height);
    target.bodyHeight = safeHeight;
    target.heightMode = 'manual';
    if (target.isSimple) {
        element.style.height = `${safeHeight}px`;
        return;
    }
    const body = element.querySelector(kind === 'summary' ? '.summary-card-body' : '.card-body');
    if (body) body.style.height = `${safeHeight}px`;
    element.style.height = 'auto';
}

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
    const areChildrenVisible = !node.folded || isMapNodeTemporarilyExpanded(node.id);
    const isCompactCollapsed = isTemporarilyCollapsed(node);
    const isContentCollapsed = Boolean(node.contentCollapsed || isCompactCollapsed);
    const relationCount = getMindMapRelatedCardItems(node.id).length;
    // const cardClass = `node-card ${isSelected?'selected':''} ${hasContent?'has-content':''} ${isSimple?'simple':''} ${isLeft?'left-side':''} ${isRoot?'is-root':''}`;
    const cardClass = `node-card ${isSelected?'selected':''} ${hasContent?'has-content':''} ${isContentCollapsed?'content-collapsed':''} ${isSimple?'simple':''} ${isLeft?'left-side':''} ${isRoot?'is-root':''} ${isTopicEmpty?'topic-empty':''}`;
    // --- 尺寸样式 ---
    let cardStyle = '';
    
    // 宽度
    if (!isContentCollapsed && node.widthMode === 'manual' && node.width) {
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

    const bodyContent = (hasContent && !isContentCollapsed && !isSimple)
        ? createMindMapNodeContentBodyHTML(node.content, `${bodyHeightStyle} ${bodyBgStyle}`)
        : '';
    const toggleIcon = isSimple ? 'ri-layout-top-2-line' : 'ri-sticky-note-line';
    const toggleTitle = isSimple ? '切换回标准卡片' : '切换为便利贴模式';

    let childrenHTML = '';
    if(hasChildren && areChildrenVisible) {
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
    const resizeHandles = (isSimple || (hasContent && !isContentCollapsed))
        ? getMindMapResizeHandlesHTML()
        : '';

    const foldBtn = (!isRoot && hasChildren) ? 
        `<div class="fold-btn ${areChildrenVisible?'has-children':''} ${isLeft?'left-side':''}" data-action="fold"><i class="${areChildrenVisible?'ri-subtract-line':'ri-add-line'}"></i></div>` : '';

    const dataColorAttr = (state.rainbowMode && displayColor) ? `data-rainbow-color="${displayColor}"` : '';

    // 注意：便利贴模式下 header 必须包含内容以便显示和拖拽
    return `<div class="node-wrapper ${isLeft?'left-side':''}" id="wrapper-${node.id}">
        <div class="${cardClass}" style="${cardStyle}" data-node-id="${node.id}" id="card-${node.id}" ${dataColorAttr}>
            <div class="card-header" style="${headerStyle}">
                <div class="topic-wrapper">
                    ${hasContent && isContentCollapsed ? '<i class="ri-file-list-2-line content-indicator"></i>' : ''}
                    <span class="node-topic" contenteditable="true">${escapeHtml(node.topic)}</span>
                </div>
            </div>
            <div class="header-tools card-floating-tools">
                <button class="tool-icon relation-navigation-trigger" type="button" data-action="navigate-relation" title="查看关联卡片（${relationCount}）" aria-label="查看关联卡片" ${relationCount > 0 ? '' : 'hidden'}><i class="ri-links-line" aria-hidden="true"></i></button>
                ${!isRoot ? `<i class="tool-icon ${toggleIcon}" data-action="toggle-simple" title="${toggleTitle}"></i>` : ''}
                ${hasContent && !isContentCollapsed && !isSimple ? `<i class="ri-aspect-ratio-line tool-icon" data-action="auto-height" title="自适应尺寸"></i>` : ''}
                ${hasContent && !isSimple && !isCompactCollapsed ? `<i class="tool-icon ${node.contentCollapsed?'ri-arrow-down-s-line':'ri-arrow-up-s-line'}" data-action="toggle-content"></i>` : ''}
            </div>
            ${bodyContent}
            ${resizeHandles}
            ${foldBtn}
        </div>
        ${childrenHTML}
    </div>`;
}
function renderTree() {
    hideMindMapContentPreview();
    closeMindMapRelationNavigationMenu();
    if (skipNextGlobalScrollCapture) skipNextGlobalScrollCapture = false;
    else saveGlobalScrolls();
    const root = state.data;
    const leftKids = (root.children || []).filter(c => c.dir === 'left');
    const rightKids = (root.children || []).filter(c => c.dir !== 'left');
    const isLeftVisible = !root.foldedLeft || isMapRootDirectionTemporarilyExpanded('left');
    const isRightVisible = !root.foldedRight || isMapRootDirectionTemporarilyExpanded('right');
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
        btn.className = `fold-btn root-left ${isLeftVisible?'has-children':''}`;
        btn.dataset.action = 'fold-root-left';
        btn.innerHTML = `<i class="${isLeftVisible?'ri-subtract-line':'ri-add-line'}"></i>`;
        rootCardEl.appendChild(btn);
    }
    if(rightKids.length > 0) {
        const btn = document.createElement('div');
        btn.className = `fold-btn root-right ${isRightVisible?'has-children':''}`;
        btn.dataset.action = 'fold-root-right';
        btn.innerHTML = `<i class="${isRightVisible?'ri-subtract-line':'ri-add-line'}"></i>`;
        rootCardEl.appendChild(btn);
    }
    const rootCard = rootCardEl.outerHTML;

    const leftHTML = (leftKids.length > 0 && isLeftVisible) ?
        `<div class="children-container left-side">${leftKids.map(c => {
            // ▼▼▼ 修改：直接根据 ID 获取固定颜色 ▼▼▼
            const hue = state.rainbowMode ? getStableHue(c.id) : 0;
            const color = state.rainbowMode ? `hsl(${hue}, 85%, 88%)` : null;
            
            return `<div class="child-unit left-side"><div class="child-cross-line"></div>${createNodeHTML(c, true, color)}</div>`;
        }).join('')}</div>` : '';
    
    const rightHTML = (rightKids.length > 0 && isRightVisible) ?
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
    scheduleRenderMindMapRelations();
    scheduleRenderMindMapSummaries();
    if (window.rootObserver) {
        window.rootObserver.disconnect();
    }

    // 2. 创建新的监听器
    // 只要根节点的 DOM 尺寸发生任何自然变化（字体加载、图片加载），就自动归位
    window.rootObserver = new ResizeObserver(entries => {
        // 使用 requestAnimationFrame 避免 "ResizeObserver loop limit exceeded" 错误
        requestAnimationFrame(() => {
            stabilizeRoot();
            scheduleRenderMindMapRelations();
            scheduleRenderMindMapSummaries();
        });
    });

    // 3. 开始监听根节点包装器
    const rootWrapper = document.querySelector('.root-wrapper');
    if (rootWrapper) {
        window.rootObserver.observe(rootWrapper);
    }
    
    updateToolbar();
    refreshVisibleMapSearchResults();
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
    const areChildrenVisible = !node.folded || isMapNodeTemporarilyExpanded(node.id);
    
    if(node.children && node.children.length > 0) {
        if(!foldBtn) {
            foldBtn = document.createElement('div');
            foldBtn.className = `fold-btn ${areChildrenVisible?'has-children':''} ${isLeft?'left-side':''}`;
            foldBtn.dataset.action = 'fold';
            foldBtn.innerHTML = `<i class="${areChildrenVisible?'ri-subtract-line':'ri-add-line'}"></i>`;
            card.appendChild(foldBtn);
        } else {
            foldBtn.className = `fold-btn ${areChildrenVisible?'has-children':''} ${isLeft?'left-side':''}`;
            foldBtn.innerHTML = `<i class="${areChildrenVisible?'ri-subtract-line':'ri-add-line'}"></i>`;
        }
        if(areChildrenVisible) {
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
    scheduleRenderMindMapRelations();
    scheduleRenderMindMapSummaries();
    updateMindMapNodeStats();
    refreshVisibleMapSearchResults();
};

function updateNodeDOM(nodeId) {
    if (mindMapContentPreviewState.card?.dataset.nodeId === nodeId) hideMindMapContentPreview();
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
    scheduleRenderMindMapRelations();
    scheduleRenderMindMapSummaries();
}
// 修复：暴力清除高亮后重新添加，防止高亮卡死
function updateSelection() {
    document.querySelectorAll('.node-card.selected').forEach(el => el.classList.remove('selected'));
    state.selectedIds.forEach(id => {
        const el = document.querySelector(`.node-card[data-node-id="${id}"]`);
        if(el) el.classList.add('selected');
    });
    updateMindMapSummaryMemberHighlights();
    updateMindMapSummarySelectionAction();
    updateToolbar();
};

function updateMindMapSummaryMemberHighlights() {
    document.querySelectorAll('.node-card.summary-member').forEach(card => {
        card.classList.remove('summary-member');
    });
    const summary = getMindMapSummaryById(state.selectedSummaryId);
    if (!summary || !Array.isArray(summary.nodeIds)) return;
    summary.nodeIds.forEach(nodeId => {
        document.getElementById(`card-${nodeId}`)?.classList.add('summary-member');
    });
}

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
    updateMindMapSummarySelectionAction();
};

function updateToolbar() {
    const hasSel = state.selectedIds.size > 0;
    const hasRelation = Boolean(state.selectedRelationId);
    const hasSummary = Boolean(state.selectedSummaryId);
    $('#btn-add-child').disabled = !hasSel;
    $('#btn-add-sibling').disabled = !hasSel;
    $('#btn-add-relation').disabled = state.selectedIds.size !== 2;
    $('#btn-add-summary').disabled = !getMindMapSummarySelection();
    $('#btn-delete').disabled = !hasSel && !hasRelation && !hasSummary;
    $('#btn-delete').title = hasRelation ? '删除关联' : (hasSummary ? '删除总结' : '删除卡片');
    $('#btn-undo').disabled = state.historyIndex <= 0; $('#btn-redo').disabled = state.historyIndex >= state.history.length - 1;
    $('#btn-color').disabled = (!hasSel && !hasSummary) || (hasSel && state.rainbowMode);
    $('#btn-color').title = hasSummary ? '设置总结颜色' : '设置卡片颜色';

    const compactButton = $('#btn-compact-view');
    if (compactButton) {
        compactButton.classList.toggle('primary', state.compactView);
        compactButton.setAttribute('aria-pressed', String(state.compactView));
        compactButton.title = state.compactView
            ? '退出精简视图'
            : '开启精简视图，仅本次运行有效';
        compactButton.querySelector('i').className = state.compactView
            ? 'ri-menu-unfold-line'
            : 'ri-menu-fold-line';
    }
    updateMindMapNodeStats();
};

function getMindMapNodeStats() {
    const total = collectMindMapNodeIds(state.data).size;
    if (state.selectedIds.size !== 1) return { total, children: null, siblings: null };

    const nodeId = Array.from(state.selectedIds)[0];
    const node = findNode(state.data, nodeId);
    if (!node) return { total, children: null, siblings: null };
    const parent = findParent(state.data, nodeId);
    return {
        total,
        children: Array.isArray(node.children) ? node.children.length : 0,
        siblings: parent && Array.isArray(parent.children) ? Math.max(0, parent.children.length - 1) : 0
    };
}

function updateMindMapNodeStats() {
    const totalElement = $('#nodeStatsTotal');
    const childrenElement = $('#nodeStatsChildren');
    const siblingsElement = $('#nodeStatsSiblings');
    if (!totalElement || !childrenElement || !siblingsElement) return;
    const stats = getMindMapNodeStats();
    totalElement.textContent = String(stats.total);
    childrenElement.textContent = stats.children === null ? '—' : String(stats.children);
    siblingsElement.textContent = stats.siblings === null ? '—' : String(stats.siblings);
}

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

function getMindMapClipboardNodes(json) {
    if (json && json.signature === CLIPBOARD_SIGN && Array.isArray(json.nodes)) {
        return json.nodes;
    }

    try {
        // 导入文件与剪贴板共用格式识别：完整存档和纯 data 树都作为一棵待粘贴的子树。
        const node = JSON.parse(JSON.stringify(normalizeImportedMindMap(json).data));
        // 关联线和总结属于整张图的数据，不能跟随根节点成为子卡片属性。
        delete node.relations;
        delete node.summaries;
        delete node.foldedLeft;
        delete node.foldedRight;
        return [node];
    } catch (error) {
        return null;
    }
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

function pasteMindMapNodesToSelection(nodesToPaste) {
    if (!Array.isArray(nodesToPaste) || nodesToPaste.length === 0) return false;

    let targetId = state.data.id;
    if (state.selectedIds.size === 1) {
        targetId = Array.from(state.selectedIds)[0];
    } else if (state.selectedIds.size > 1) {
        showTopToast('⚠️ 请只选中一个节点作为粘贴目标');
        return false;
    }

    const targetNode = findNode(state.data, targetId);
    if (!targetNode) return false;

    if (!targetNode.children) targetNode.children = [];
    const isRoot = targetNode.id === state.data.id;

    let totalCount = 0;
    const countNodes = list => {
        list.forEach(node => {
            totalCount++;
            if (node.children?.length) countNodes(node.children);
        });
    };
    countNodes(nodesToPaste);

    nodesToPaste.forEach(node => {
        const newNode = renewNodeIds(node); // 重生成 ID
        if (isRoot) newNode.dir = 'right';
        else delete newNode.dir;
        targetNode.children.push(newNode);
    });

    targetNode.folded = false;
    recordHistory();
    updateChildrenDOM(targetNode.id);
    state.selectedIds.clear();
    nodesToPaste.forEach(node => state.selectedIds.add(node.id));
    updateSelection();
    showTopToast(`📋 已粘贴 ${totalCount} 个节点`);
    return true;
}

/**
 * 执行粘贴逻辑 (修复版：正确统计粘贴总数)
 */
function parseMindMapPlainText(value) {
    const text = String(value ?? '').replace(/\r\n?/g, '\n');
    if (!text.trim()) return null;

    const firstLineBreak = text.indexOf('\n');
    const firstLine = firstLineBreak < 0 ? text : text.slice(0, firstLineBreak);
    const content = firstLineBreak < 0 ? '' : text.slice(firstLineBreak + 1);
    const headingMatch = firstLine.match(/^#{1,6}[ \t]+(.+)$/);

    return {
        text,
        firstLine,
        topic: headingMatch
            ? headingMatch[1].replace(/\*\*/g, '').trim()
            : firstLine.trim(),
        content,
        isMarkdownHeading: Boolean(headingMatch)
    };
}

function createMindMapNodeFromPlainText(value) {
    const parsed = parseMindMapPlainText(value);
    if (!parsed) return null;

    return {
        topic: parsed.topic,
        content: parsed.content,
        widthMode: 'auto',
        heightMode: 'auto'
    };
}

async function pasteNodesToSelection() {
    let nodesToPaste = [];
    let isMindMapData = false;

    try {
        // 优先读取私有剪贴板格式。
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                if (!item.types.includes(CUSTOM_MIME_TYPE)) continue;
                const text = await (await item.getType(CUSTOM_MIME_TYPE)).text();
                const clipboardNodes = getMindMapClipboardNodes(JSON.parse(text));
                if (!clipboardNodes) continue;
                nodesToPaste = clipboardNodes;
                isMindMapData = true;
                break;
            }
        } catch (_) { /* 读取失败或不支持时回退到纯文本 */ }

        if (!isMindMapData) {
            const text = await navigator.clipboard.readText();
            if (text) {
                try {
                    const clipboardNodes = getMindMapClipboardNodes(JSON.parse(text));
                    if (clipboardNodes) {
                        nodesToPaste = clipboardNodes;
                        isMindMapData = true;
                    }
                } catch (_) { /* 无法解析 JSON 时按普通文本处理 */ }

                if (!isMindMapData) {
                    if (text.startsWith('[MindMap Nodes:')) {
                        showTopToast('⚠️ 无法识别节点数据');
                        return;
                    }
                    const plainTextNode = createMindMapNodeFromPlainText(text);
                    nodesToPaste = plainTextNode ? [plainTextNode] : [];
                }
            }
        }

        pasteMindMapNodesToSelection(nodesToPaste);
    } catch (err) {
        console.log('粘贴过程出错:', err);
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
// #region 原生文字与 Markdown 文件拖拽支持
// =============================================================================
function isMarkdownFile(file) {
    return Boolean(file && typeof file.name === 'string' && /\.md$/i.test(file.name));
}

function replaceLegacyMathDelimiters(text) {
    return text
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, expression) => '$$' + expression + '$$')
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, expression) => '$' + expression + '$');
}

function normalizeMathOutsideInlineCode(text) {
    let result = '';
    let cursor = 0;

    while (cursor < text.length) {
        const openingIndex = text.indexOf('`', cursor);
        if (openingIndex === -1) {
            result += replaceLegacyMathDelimiters(text.slice(cursor));
            break;
        }

        let runLength = 1;
        while (text[openingIndex + runLength] === '`') runLength += 1;
        const delimiter = '`'.repeat(runLength);
        const closingIndex = text.indexOf(delimiter, openingIndex + runLength);

        result += replaceLegacyMathDelimiters(text.slice(cursor, openingIndex));
        if (closingIndex === -1) {
            result += text.slice(openingIndex);
            break;
        }

        const codeEnd = closingIndex + runLength;
        result += text.slice(openingIndex, codeEnd);
        cursor = codeEnd;
    }

    return result;
}

function normalizeMarkdownMathDelimiters(markdown) {
    if (typeof markdown !== 'string' || !markdown) return markdown || '';

    let result = '';
    let proseBuffer = '';
    let cursor = 0;
    let fenceCharacter = '';
    let fenceLength = 0;

    const flushProse = () => {
        result += normalizeMathOutsideInlineCode(proseBuffer);
        proseBuffer = '';
    };

    while (cursor < markdown.length) {
        const newlineIndex = markdown.indexOf('\n', cursor);
        const lineEnd = newlineIndex === -1 ? markdown.length : newlineIndex + 1;
        const line = markdown.slice(cursor, lineEnd);
        const lineWithoutEnding = line.endsWith('\n') ? line.slice(0, -1) : line;

        if (!fenceCharacter) {
            const openingFence = lineWithoutEnding.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
            if (openingFence) {
                flushProse();
                fenceCharacter = openingFence[1][0];
                fenceLength = openingFence[1].length;
                result += line;
            } else {
                proseBuffer += line;
            }
        } else {
            result += line;
            const closingFence = lineWithoutEnding.match(/^[ \t]{0,3}(`+|~+)[ \t]*\r?$/);
            if (closingFence && closingFence[1][0] === fenceCharacter && closingFence[1].length >= fenceLength) {
                fenceCharacter = '';
                fenceLength = 0;
            }
        }

        cursor = lineEnd;
    }

    flushProse();
    return result;
}

function readDroppedFileAsText(file) {
    if (file && typeof file.text === 'function') {
        return file.text();
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error || new Error('无法读取 Markdown 文件'));
        reader.readAsText(file);
    });
}

async function readDroppedMarkdownFiles(dataTransfer) {
    const markdownFiles = Array.from(dataTransfer?.files || []).filter(isMarkdownFile);
    return Promise.all(markdownFiles.map(async file => {
        const content = await readDroppedFileAsText(file);
        return {
            topic: file.name.replace(/\.md$/i, ''),
            content: normalizeMarkdownMathDelimiters(content)
        };
    }));
}

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
    app.addEventListener('drop', async (e) => {
        e.preventDefault();
        
        // 清除所有高亮和辅助线
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        if(insertLine) insertLine.style.display = 'none';

        const card = e.target.closest('.node-card');
        if (!card) return;

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
        let nodePayloads = [];
        let isMarkdownDrop = false;

        try {
            nodePayloads = await readDroppedMarkdownFiles(e.dataTransfer);
            isMarkdownDrop = nodePayloads.length > 0;
        } catch (error) {
            showTopToast(`❌ Markdown 文件读取失败：${error.message || '未知错误'}`);
            delete card.dataset.dragState;
            return;
        }

        if (!isMarkdownDrop) {
            // 资源管理器拖入的非 Markdown 文件不应退化为“文件路径文字”节点。
            if (e.dataTransfer?.files?.length) {
                delete card.dataset.dragState;
                return;
            }

            const text = e.dataTransfer?.getData('text/plain') || '';
            if (!text.trim()) {
                delete card.dataset.dragState;
                return;
            }

            const [header, body] = extractMarkdownHeader(normalizeMarkdownMathDelimiters(text));
            nodePayloads = [{ topic: header, content: body }];
        }

        const targetNode = findNode(state.data, targetId);
        
        if (targetNode) {
            // 文件拖拽可一次创建多个节点；文字拖拽仍只创建一个节点。
            const newNodes = nodePayloads.map(({ topic, content }) => ({
                id: generateNodeId(),
                topic,
                content,
                isSimple: false,
                heightMode: 'auto',
                widthMode: 'auto',
                width: 360,
                children: []
            }));

            // --- 分支 A: 添加子节点 ---
            if (dropType === 'CHILD') {
                // 处理根节点的方向逻辑
                if (targetId === state.data.id) {
                    const rRect = card.getBoundingClientRect();
                    const direction = (e.clientX < rRect.left + rRect.width / 2) ? 'left' : 'right';
                    newNodes.forEach(node => { node.dir = direction; });
                } else {
                    // 如果不是根节点，且有方向属性（比如在 Dock 或其他特定逻辑下），可以继承
                    // 这里通常不需要处理，因为子节点方向由布局算法自动处理
                    newNodes.forEach(node => { delete node.dir; });
                }

                if (!targetNode.children) targetNode.children = [];
                targetNode.children.push(...newNodes);
                targetNode.folded = false; 
                
                recordHistory();
                updateChildrenDOM(targetId);
            } 
            // --- 分支 B: 添加兄弟节点 ---
            else {
                const parent = findParent(state.data, targetId);
                if (parent) {
                    // 1. 继承方向 (重要：保持在同一侧)
                    newNodes.forEach(node => { node.dir = targetNode.dir; });

                    // 2. 找到插入位置
                    const index = parent.children.findIndex(c => c.id === targetId);
                    
                    if (index !== -1) {
                        const insertIndex = (dropType === 'BEFORE') ? index : index + 1;
                        parent.children.splice(insertIndex, 0, ...newNodes);
                        
                        recordHistory();
                        updateChildrenDOM(parent.id);
                    }
                }
            }

            if (isMarkdownDrop) {
                showTopToast(`✅ 已从 ${newNodes.length} 个 Markdown 文件创建节点`);
            }
        }
        
        // 清理临时属性
        delete card.dataset.dragState;
    });
}
/**
 * 提取 Markdown 标题：
 * 1. 识别首行是否为 1～6 个 "#" 加空白开头
 * 2. 去掉开头的 Markdown 标题标记
 * 3. 如果标题两边包含 "**"，也一并去掉
 * @param {string} text - 输入的字符串
 * @returns {Array<string>} - [处理后的标题, 剩余内容]
 */
function extractMarkdownHeader(text) {
    const parsed = parseMindMapPlainText(text);
    if (!parsed) return ["", ""];

    const formulaPattern = /\$.*\$/;
    if (formulaPattern.test(parsed.firstLine)) {
        return ["", parsed.text];
    }

    return parsed.isMarkdownHeading
        ? [parsed.topic, parsed.content]
        : ["", parsed.text];
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

async function writeMindMapCanvasExport(canvasData, fileName) {
    const jsonString = JSON.stringify(canvasData, null, 2);
    const isSaved = await saveFileDirectly(fileName, jsonString);
    if (isSaved) {
        showTopToast(`✅ 导图已保存到 Obsidian: ${fileName}`);
        return true;
    }

    downloadFile(jsonString, fileName, 'application/json');
    showTopToast(`✅ 已下载文件 (API 不可用或被拒绝)`);
    return false;
}

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
    appendMindMapRelationsToCanvas(nodes, edges);

    // 生成 JSON 字符串
    const canvasData = {
        nodes: nodes,
        edges: edges
    };
    const fileName = `${getMindMapExportBaseName()}.canvas`;
    await writeMindMapCanvasExport(canvasData, fileName);
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
    appendMindMapRelationsToCanvas(nodes, edges);

    // 5. 导出文件
    const canvasData = { nodes, edges };
    const fileName=`${getMindMapExportBaseName()}_Vertical.canvas`;
    await writeMindMapCanvasExport(canvasData, fileName);
}
