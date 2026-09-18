// SECTION 基础配置与界面设置

const generateNodeId = () => Math.random().toString(36).substr(2, 9);
const generateFileId = () => 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
const $ = (sel) => document.querySelector(sel);
if (typeof chrome.storage === 'undefined') {throw new Error('');}
if (typeof marked !== 'undefined') marked.use({ breaks: true, gfm: true });

const MINDMAP_THEME_STORAGE_KEY = 'mindmap_theme';
const MINDMAP_CARD_TOOLBAR_HOVER_STORAGE_KEY = 'mindmap_card_toolbar_hover';
const MINDMAP_CARD_CONTENT_HOVER_STORAGE_KEY = 'mindmap_card_content_hover';
const MINDMAP_DOCUMENT_OUTLINE_STORAGE_KEY = 'mindmap_document_outline';
const MINDMAP_NODE_STATS_VISIBLE_STORAGE_KEY = 'mindmap_node_stats_visible';
const MINDMAP_CARD_MIN_WIDTH = 100;
const mindMapSettings = {
    cardToolbarHover: true,
    cardContentHover: true,
    documentOutline: true,
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

function applyMindMapCardContentHover(enabled) {
    mindMapSettings.cardContentHover = enabled !== false;
    document.documentElement.dataset.cardContentHover = String(mindMapSettings.cardContentHover);
    const toggle = $('#settingCardContentHoverToggle');
    if (toggle) toggle.checked = mindMapSettings.cardContentHover;
    const value = $('#settingCardContentHoverValue');
    if (value) value.textContent = mindMapSettings.cardContentHover ? '悬停时预览' : '悬停时隐藏';
    hideMindMapContentPreview();
}

function applyMindMapDocumentOutline(enabled) {
    mindMapSettings.documentOutline = enabled !== false;
    document.documentElement.dataset.documentOutline = String(mindMapSettings.documentOutline);
    const toggle = $('#settingDocumentOutlineToggle');
    if (toggle) toggle.checked = mindMapSettings.documentOutline;
    const value = $('#settingDocumentOutlineValue');
    if (value) value.textContent = mindMapSettings.documentOutline ? '达到阈值时显示' : '隐藏长文档目录';
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
        [MINDMAP_CARD_CONTENT_HOVER_STORAGE_KEY]: true,
        [MINDMAP_DOCUMENT_OUTLINE_STORAGE_KEY]: true,
        [MINDMAP_NODE_STATS_VISIBLE_STORAGE_KEY]: true,
    });
    const savedTheme = result && result[MINDMAP_THEME_STORAGE_KEY];
    applyMindMapTheme(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : systemTheme);
    applyMindMapCardToolbarHover(result?.[MINDMAP_CARD_TOOLBAR_HOVER_STORAGE_KEY] !== false);
    applyMindMapCardContentHover(result?.[MINDMAP_CARD_CONTENT_HOVER_STORAGE_KEY] !== false);
    applyMindMapDocumentOutline(result?.[MINDMAP_DOCUMENT_OUTLINE_STORAGE_KEY] !== false);
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
    $('#settingCardContentHoverToggle')?.addEventListener('change', async event => {
        const enabled = event.currentTarget.checked;
        applyMindMapCardContentHover(enabled);
        await chrome.storage.local.set({ [MINDMAP_CARD_CONTENT_HOVER_STORAGE_KEY]: enabled });
    });
    $('#settingDocumentOutlineToggle')?.addEventListener('change', async event => {
        const enabled = event.currentTarget.checked;
        applyMindMapDocumentOutline(enabled);
        await chrome.storage.local.set({ [MINDMAP_DOCUMENT_OUTLINE_STORAGE_KEY]: enabled });
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

// !SECTION 基础配置与界面设置

// SECTION 数据导入与应用状态

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
        commitCurrentMindMapTabEdits();
        const importResult = importMindMapWorkbookIntoCurrent(mindMapWorkbook, imported);
        importResult.resetTabIds.forEach(tabId => mindMapTabRuntime.delete(tabId));
        loadActiveMindMapTab({ resetHistory: true });
        persistMindMapWorkbookSession(false);
        saveStorage();
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
    id: 'root', topic: '主题', content: '',
    widthMode: 'auto', heightMode: 'auto', children: [], relations: [], summaries: [],
    foldedLeft: false, foldedRight: false
};
const MINDMAP_TABS_VERSION = 'tabs-v1';
const MINDMAP_INTERNAL_LINK_PROTOCOL = 'mindmap:';
const MINDMAP_INTERNAL_LINK_VERSION = '1';

// SECTION 导图内链接数据

function getMindMapWorkbookDocumentId(snapshot = null, options = {}) {
    const candidates = [
        snapshot?.documentId,
        options.documentId,
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('currentFileID') : '',
    ];
    const existingId = candidates
        .map(value => String(value || '').trim())
        .find(Boolean);
    if (existingId) return existingId;
    if (typeof generateFileId === 'function') return generateFileId();
    return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseMindMapInternalLink(href) {
    const rawHref = String(href || '').trim();
    if (!rawHref) return null;

    let parsed;
    try {
        parsed = href instanceof URL ? href : new URL(rawHref);
    } catch {
        return null;
    }

    if (parsed.protocol !== MINDMAP_INTERNAL_LINK_PROTOCOL || parsed.hostname !== 'card') {
        return null;
    }

    const version = parsed.searchParams.get('v') || MINDMAP_INTERNAL_LINK_VERSION;
    const documentId = parsed.searchParams.get('doc') || '';
    const tabId = parsed.searchParams.get('tab') || '';
    const nodeId = parsed.searchParams.get('node') || '';
    if (version !== MINDMAP_INTERNAL_LINK_VERSION || !documentId || !tabId || !nodeId) {
        return null;
    }

    return {
        kind: 'mindmap-card',
        version,
        documentId,
        tabId,
        nodeId,
        href: parsed.href,
    };
}

function createMindMapInternalLinkHref(nodeId, tabId = null, documentId = null) {
    const normalizedNodeId = String(nodeId || '').trim();
    const normalizedTabId = String(tabId || mindMapWorkbook?.activeTabId || '').trim();
    const normalizedDocumentId = String(
        documentId || mindMapWorkbook?.documentId || '',
    ).trim();
    if (!normalizedNodeId || !normalizedTabId || !normalizedDocumentId) return '';

    const params = new URLSearchParams({
        v: MINDMAP_INTERNAL_LINK_VERSION,
        doc: normalizedDocumentId,
        tab: normalizedTabId,
        node: normalizedNodeId,
    });
    return `${MINDMAP_INTERNAL_LINK_PROTOCOL}//card?${params.toString()}`;
}

function findMindMapNodeInTree(root, nodeId) {
    if (!root || nodeId === undefined || nodeId === null) return null;
    if (String(root.id) === String(nodeId)) return root;
    for (const child of Array.isArray(root.children) ? root.children : []) {
        const found = findMindMapNodeInTree(child, nodeId);
        if (found) return found;
    }
    return null;
}

function resolveMindMapInternalLink(targetOrHref) {
    const target = typeof targetOrHref === 'string'
        ? parseMindMapInternalLink(targetOrHref)
        : targetOrHref;
    if (!target?.documentId || !target.tabId || !target.nodeId) {
        return { target: null, tab: null, node: null, reason: 'invalid' };
    }

    if (target.documentId !== mindMapWorkbook?.documentId) {
        return { target, tab: null, node: null, reason: 'document' };
    }

    const tab = mindMapWorkbook.tabs.find(item => item.id === target.tabId) || null;
    if (!tab) return { target, tab: null, node: null, reason: 'tab' };
    const node = findMindMapNodeInTree(tab.data, target.nodeId);
    if (!node) return { target, tab, node: null, reason: 'node' };
    return { target, tab, node, reason: null };
}

function rewriteMindMapInternalLinksInText(text, options = {}) {
    const sourceDocumentId = String(options.sourceDocumentId || '').trim();
    const destinationDocumentId = String(
        options.destinationDocumentId || sourceDocumentId,
    ).trim();
    if (!sourceDocumentId || !destinationDocumentId) return String(text || '');

    const sourceTabId = options.sourceTabId ? String(options.sourceTabId) : null;
    const tabIdMap = options.tabIdMap instanceof Map ? options.tabIdMap : new Map();
    const nodeIdMap = options.nodeIdMap instanceof Map ? options.nodeIdMap : new Map();

    return String(text || '').replace(/mindmap:\/\/card\?[^\s)]+/g, href => {
        const target = parseMindMapInternalLink(href);
        if (!target || target.documentId !== sourceDocumentId) return href;
        if (sourceTabId && target.tabId !== sourceTabId) return href;

        const nextTabId = tabIdMap.get(target.tabId) || target.tabId;
        const nextNodeId = nodeIdMap.get(target.nodeId) || target.nodeId;
        if (
            nextTabId === target.tabId
            && nextNodeId === target.nodeId
            && destinationDocumentId === target.documentId
        ) {
            return href;
        }
        return createMindMapInternalLinkHref(nextNodeId, nextTabId, destinationDocumentId);
    });
}

function rewriteMindMapInternalLinksInTree(root, options = {}) {
    if (!root || typeof root !== 'object') return root;
    if (typeof root.content === 'string') {
        root.content = rewriteMindMapInternalLinksInText(root.content, options);
    }
    (Array.isArray(root.children) ? root.children : []).forEach(child => {
        rewriteMindMapInternalLinksInTree(child, options);
    });
    return root;
}

function getMindMapInternalLinkForNode(nodeId, tabId = null) {
    const normalizedTabId = String(tabId || mindMapWorkbook?.activeTabId || '').trim();
    const tab = mindMapWorkbook?.tabs?.find(item => item.id === normalizedTabId);
    if (!tab || !findMindMapNodeInTree(tab.data, nodeId)) return '';
    return createMindMapInternalLinkHref(nodeId, normalizedTabId, mindMapWorkbook.documentId);
}

async function copyMindMapInternalLink(nodeId, showToast = true) {
    if (typeof syncActiveMindMapTab === 'function') syncActiveMindMapTab(false);
    const href = getMindMapInternalLinkForNode(nodeId);
    if (!href) {
        if (showToast) showTopToast('❌ 无法生成导图内链接');
        return false;
    }

    try {
        await navigator.clipboard.writeText(href);
        if (showToast) showTopToast('🔗 导图内链接已复制');
        return true;
    } catch (error) {
        console.warn('[MindMap] 复制导图内链接失败:', error);
        if (showToast) showTopToast('❌ 复制失败，请检查剪贴板权限');
        return false;
    }
}

// !SECTION 导图内链接数据

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
    const documentId = getMindMapWorkbookDocumentId(snapshot, options);
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
        return { version: MINDMAP_TABS_VERSION, documentId, activeTabId, tabs };
    }

    const hasLegacyData = isMindMapNodeData(snapshot?.data) || isMindMapNodeData(snapshot);
    if (!hasLegacyData) {
        if (!allowEmpty) throw new Error('思维导图节点格式不正确');
        const tab = createMindMapTab('页面 1');
        return {
            version: MINDMAP_TABS_VERSION,
            documentId,
            activeTabId: tab.id,
            tabs: [tab]
        };
    }

    const normalized = normalizeImportedMindMap(snapshot);
    const tab = createMindMapTab(getLegacyMindMapTabName(snapshot, fallbackName), normalized);
    return {
        version: MINDMAP_TABS_VERSION,
        documentId,
        activeTabId: tab.id,
        tabs: [tab]
    };
}

function isMindMapTabRootOnly(tab) {
    return Boolean(tab?.data
        && Array.isArray(tab.data.children)
        && tab.data.children.length === 0);
}

function getUniqueMindMapTabNameFromNames(baseName, names) {
    const base = String(baseName || '').trim() || '页面';
    if (!names.has(base)) return base;
    let index = 2;
    while (names.has(`${base} ${index}`)) index++;
    return `${base} ${index}`;
}

function cloneImportedMindMapTab(sourceTab, usedNames) {
    const rootTopic = String(sourceTab?.data?.topic || '').trim();
    const name = getUniqueMindMapTabNameFromNames(rootTopic || sourceTab?.name, usedNames);
    const cloned = createMindMapTab(
        name,
        cloneMindMapValue({
            data: sourceTab.data,
            view: sourceTab.view,
            scrollMap: sourceTab.scrollMap,
        }),
    );
    usedNames.add(cloned.name);
    return cloned;
}

function rewriteImportedMindMapTabLinks(clonedTab, sourceDocumentId, destinationDocumentId, tabIdMap) {
    if (!clonedTab?.data) return;
    rewriteMindMapInternalLinksInTree(clonedTab.data, {
        sourceDocumentId,
        destinationDocumentId,
        tabIdMap,
    });
}

function importMindMapWorkbookIntoCurrent(workbook, importedWorkbook) {
    const currentTabIndex = workbook.tabs.findIndex(tab => tab.id === workbook.activeTabId);
    const currentTab = workbook.tabs[currentTabIndex] || workbook.tabs[0];
    const importedTabs = Array.isArray(importedWorkbook?.tabs) ? importedWorkbook.tabs : [];
    const importedActiveTab = importedTabs.find(tab => tab.id === importedWorkbook.activeTabId)
        || importedTabs[0];
    if (currentTabIndex < 0 || !currentTab || !importedActiveTab) {
        throw new Error('导入工作簿缺少可用页面');
    }

    const resetTabIds = [];
    const usedNames = new Set(workbook.tabs.map(tab => tab.name));
    const sourceDocumentId = String(importedWorkbook.documentId || '').trim();
    const destinationDocumentId = String(workbook.documentId || '').trim();

    if (isMindMapTabRootOnly(currentTab)) {
        usedNames.delete(currentTab.name);
        const replacement = cloneImportedMindMapTab(importedActiveTab, usedNames);
        replacement.id = currentTab.id;
        workbook.tabs[currentTabIndex] = replacement;
        workbook.activeTabId = replacement.id;
        resetTabIds.push(replacement.id);

        const importedTabMap = new Map([[importedActiveTab.id, replacement]]);
        const extraTabs = importedTabs
            .filter(tab => tab !== importedActiveTab)
            .map(tab => {
                const cloned = cloneImportedMindMapTab(tab, usedNames);
                importedTabMap.set(tab.id, cloned);
                return cloned;
            });
        workbook.tabs.splice(currentTabIndex + 1, 0, ...extraTabs);
        const tabIdMap = new Map(
            Array.from(importedTabMap.entries(), ([sourceTabId, clonedTab]) => [sourceTabId, clonedTab.id]),
        );
        importedTabMap.forEach((clonedTab, sourceTabId) => {
            rewriteImportedMindMapTabLinks(
                clonedTab,
                sourceDocumentId,
                destinationDocumentId,
                tabIdMap,
            );
        });
        return { activeTabId: replacement.id, resetTabIds };
    }

    const importedTabMap = new Map();
    const appendedTabs = importedTabs.map(tab => {
        const cloned = cloneImportedMindMapTab(tab, usedNames);
        importedTabMap.set(tab, cloned);
        return cloned;
    });
    workbook.tabs.push(...appendedTabs);
    const tabIdMap = new Map(
        Array.from(importedTabMap.entries(), ([sourceTab, clonedTab]) => [sourceTab.id, clonedTab.id]),
    );
    importedTabMap.forEach((clonedTab, sourceTab) => {
        rewriteImportedMindMapTabLinks(
            clonedTab,
            sourceDocumentId,
            destinationDocumentId,
            tabIdMap,
        );
    });
    const activeTab = importedTabMap.get(importedActiveTab) || appendedTabs[0];
    workbook.activeTabId = activeTab.id;
    resetTabIds.push(activeTab.id);
    return { activeTabId: activeTab.id, resetTabIds };
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
const MINDMAP_CONTENT_PREVIEW_MIN_HEIGHT = 200; // 预览最小可读高度
const MINDMAP_CONTENT_PREVIEW_MIN_WIDTH = 400;  // 预览最小可读宽度
const MINDMAP_DOCUMENT_OUTLINE_MIN_LENGTH = 1200;
const MINDMAP_DOCUMENT_OUTLINE_MIN_HEADINGS = 4;
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

// !SECTION 数据导入与应用状态

/*===============================================================================================
// SECTION 数据持久化与多页面管理
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

function getMindMapSaveName() {
    const rootTopic = String(state?.data?.topic || '').trim();
    if (rootTopic) return rootTopic;
    const tabName = String(getActiveMindMapTab()?.name || '').trim();
    return tabName || String(pageTitle || '').trim() || '思维导图';
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
        documentId: mindMapWorkbook.documentId,
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
    if (!workbook.documentId) workbook.documentId = getMindMapWorkbookDocumentId(workbook);
    mindMapWorkbook = workbook;
    mindMapTabRuntime.clear();
    loadActiveMindMapTab({ resetHistory: true });
}

async function updateState(MindMapData,newCurrentFileID,pageTitle,otherPageOpen=false){       // 思维导图页面加载思维导图文件
    if (!otherPageOpen) await saveMindMapData(true,false);  // 询问保存当前文件
    document.title = pageTitle;
    replaceMindMapWorkbook(normalizeMindMapWorkbookSnapshot(MindMapData, pageTitle, {
        documentId: newCurrentFileID,
    }));
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
    const bookmarkItems = bookmarkManager.data?.items || {};
    const isExist = Object.prototype.hasOwnProperty.call(bookmarkItems, currentFileID);
    if (!isExist){
        const newId = generateFileId();
        const targetItem = {
            id: newId,
            name: getMindMapSaveName(),
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
        documentId: generateFileId(),
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
    const names = new Set(mindMapWorkbook.tabs.map(tab => tab.name));
    return getUniqueMindMapTabNameFromNames(baseName, names);
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

// !SECTION 数据持久化与多页面管理

// SECTION 应用初始化

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
// SECTION 事件绑定与全局快捷键
 ==============================================================================================*/
    initializeMapClickEvents(); // 初始化点击事件
    initializeMapMouseEvents(); // 初始化鼠标事件
    initializeMindMapContentPreview(); // 折叠/便利贴的全文预览与标准卡片的长文档目录
    initializeMindMapInternalLinkPreview(); // 导图内链接点击后的固定预览
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
                // 情况 A：便利贴模式 (Simple Mode)
                // 允许默认行为（即允许插入换行符），不要调用 preventDefault()
                
                // 关键：必须阻止冒泡！
                // 否则这个 Enter 会冒泡到 window，触发全局的 "创建兄弟节点" 快捷键
                e.stopPropagation(); 
            } else {
                // 情况 B：标准卡片模式 (Standard Mode)
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
        if (activeEl?.closest?.('.card-content-preview, .mindmap-link-preview')) return;

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

    // !SECTION 事件绑定与全局快捷键

});

// !SECTION 应用初始化
