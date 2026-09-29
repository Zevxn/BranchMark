/**
 * Helpers shared by the bookmark panel and the mind-map exporter.
 *
 * Website scraping, conversation navigation, highlighting and side-panel code
 * from the browser extension are intentionally not part of the standalone app.
 */

function cleanPageName(pageName = null) {
    const value = pageName || document.title || 'BranchMark';
    return String(value).trim() || 'BranchMark';
}

async function buildQAList(targetItem) {
    if (!targetItem || !Array.isArray(targetItem.data)) return [];
    return Promise.all(targetItem.data.map(async ([index, question, storedAnswer]) => {
        let answer = storedAnswer || '';
        if (typeof answer === 'string' && answer.startsWith('__REF__')) {
            const refKey = `largeContents.__REF__${targetItem.id}-${index}-extra`;
            try {
                answer = await idbGet([refKey]) || '';
            } catch (error) {
                console.warn('[Bookmarks] 读取大文本引用失败:', refKey, error);
                answer = '';
            }
        }
        return { question: question || '', answer };
    }));
}

async function openQAdata(qaData, fileName = 'AI对话记录', action = 'mindmap') {
    if (!Array.isArray(qaData) || qaData.length === 0) {
        showTopToast(getI18nText('toast.no_bookmark_page'), 2500);
        return false;
    }
    if (action !== 'mindmap') {
        console.warn('[Bookmarks] 独立思维导图不提供 Markdown 预览页面');
        return false;
    }

    const processedData = qaData.map(item => ({
        question: String(item?.question || ''),
        answer: String(item?.answer || ''),
    }));

    if (typeof updateDockData === 'function') {
        updateDockData(processedData);
        return true;
    }

    await chrome.storage.local.set({
        DockData: processedData,
        currentFileID: null,
        MindMapAction: 'new',
        fileName,
    });
    return true;
}

function downloadFile(content, filename, mimeType) {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(url);
    }, 100);
}

const FILE_HANDLE_DB_NAME = 'AI_File_Handle_DB';
const FILE_HANDLE_STORE_NAME = 'handles';
const OBSIDIAN_HANDLE_KEY = 'obsidian_dir_handle';
const QUICKER_EXPORT_DIRECTORY_KEY = 'obsidian_export_directory';
const QUICKER_SELECT_EXPORT_DIRECTORY_SP = 'DeepConvoSelectExportFolder';
const QUICKER_SAVE_EXPORT_FILE_SP = 'DeepConvoSaveExportFile';

function getQuickerSubprogramBridge() {
    return window.$quickerSp
        || (typeof $quickerSp !== 'undefined' ? $quickerSp : null);
}

function isNativeQuickerExport() {
    return Boolean(window.__DEEPCONVO_NATIVE_QUICKER_HOST__ && getQuickerSubprogramBridge());
}

async function readQuickerExportDirectory() {
    const result = await chrome.storage.local.get(QUICKER_EXPORT_DIRECTORY_KEY);
    return String(result?.[QUICKER_EXPORT_DIRECTORY_KEY] || '').trim();
}

async function selectQuickerExportDirectory(storageKey = QUICKER_EXPORT_DIRECTORY_KEY) {
    const quickerSubprogram = getQuickerSubprogramBridge();
    if (typeof quickerSubprogram !== 'function') return null;
    try {
        const result = await quickerSubprogram(QUICKER_SELECT_EXPORT_DIRECTORY_SP, {});
        if (!result || result.cancelled || result.success === false) return null;
        if (result.error) throw new Error(String(result.error));

        const directoryPath = String(result.directoryPath || '').trim();
        if (!directoryPath) throw new Error('选择目录子程序没有返回 directoryPath');
        if (storageKey) await chrome.storage.local.set({ [storageKey]: directoryPath });
        return directoryPath;
    } catch (error) {
        console.warn('[Export] Quicker 选择保存目录失败:', error);
        showTopToast(`❌ 选择保存目录失败：${error.message || '请检查目录选择子程序'}`);
        return null;
    }
}

function openFileHandleDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(FILE_HANDLE_DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(FILE_HANDLE_STORE_NAME)) {
                request.result.createObjectStore(FILE_HANDLE_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('目录句柄数据库打开失败'));
    });
}

async function readFileHandle(key) {
    try {
        const database = await openFileHandleDatabase();
        return await new Promise((resolve, reject) => {
            const request = database
                .transaction(FILE_HANDLE_STORE_NAME, 'readonly')
                .objectStore(FILE_HANDLE_STORE_NAME)
                .get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.warn('[Export] 读取目录句柄失败:', error);
        return null;
    }
}

async function writeFileHandle(key, value) {
    try {
        const database = await openFileHandleDatabase();
        await new Promise((resolve, reject) => {
            const request = database
                .transaction(FILE_HANDLE_STORE_NAME, 'readwrite')
                .objectStore(FILE_HANDLE_STORE_NAME)
                .put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
        return true;
    } catch (error) {
        console.warn('[Export] 保存目录句柄失败:', error);
        return false;
    }
}

async function verifyPermission(handle, readWrite = false) {
    const options = readWrite ? { mode: 'readwrite' } : {};
    if (await handle.queryPermission(options) === 'granted') return true;
    return await handle.requestPermission(options) === 'granted';
}

async function selectAndPersistObsidianHandle(actionLabel) {
    try {
        const directoryHandle = await window.showDirectoryPicker({
            id: 'obsidian-vault',
            mode: 'readwrite',
            startIn: 'documents',
        });
        await writeFileHandle(OBSIDIAN_HANDLE_KEY, directoryHandle);
        return directoryHandle;
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.warn(`[Export] ${actionLabel}失败:`, error);
            showTopToast(getI18nText('toast.dir_fail'));
        }
        return null;
    }
}

async function getObsidianHandle() {
    if (typeof window.showDirectoryPicker !== 'function') return null;

    let directoryHandle = await readFileHandle(OBSIDIAN_HANDLE_KEY);
    if (directoryHandle) {
        try {
            if (await verifyPermission(directoryHandle, true)) return directoryHandle;
        } catch (error) {
            console.warn('[Export] 旧目录句柄已失效:', error);
        }
    }

    return selectAndPersistObsidianHandle('选择保存目录');
}

async function resetObsidianPath() {
    if (isNativeQuickerExport()) {
        await chrome.storage.local.remove(QUICKER_EXPORT_DIRECTORY_KEY);
        return;
    }
    await writeFileHandle(OBSIDIAN_HANDLE_KEY, null);
}

async function changeObsidianPath() {
    if (isNativeQuickerExport()) return await selectQuickerExportDirectory();
    if (typeof window.showDirectoryPicker !== 'function') {
        showTopToast(getI18nText('toast.dir_fail'));
        return null;
    }
    return selectAndPersistObsidianHandle('切换保存目录');
}

async function saveFileDirectly(filename, content) {
    if (isNativeQuickerExport()) {
        try {
            let directoryPath = await readQuickerExportDirectory();
            if (!directoryPath) directoryPath = await selectQuickerExportDirectory();
            if (!directoryPath) return false;

            const result = await getQuickerSubprogramBridge()(QUICKER_SAVE_EXPORT_FILE_SP, {
                directoryPath,
                filename,
                content,
            });
            if (!result || result.cancelled || result.success === false) {
                if (result?.error) throw new Error(String(result.error));
                return false;
            }
            return true;
        } catch (error) {
            console.warn('[Export] Quicker 写入导出文件失败:', error);
            showTopToast(`❌ 写入文件失败：${error.message || '请检查文件保存子程序'}`);
            return false;
        }
    }

    if (typeof window.showDirectoryPicker !== 'function') return false;
    try {
        const directoryHandle = await getObsidianHandle();
        if (!directoryHandle) return false;
        const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return true;
    } catch (error) {
        console.warn('[Export] 写入文件失败:', error);
        if (error?.name === 'NotAllowedError') {
            showTopToast(getI18nText('toast.write_denied'));
        } else {
            showTopToast(`${getI18nText('toast.write_error')}${error?.message || ''}`);
        }
        return false;
    }
}

// SECTION JSON 脑图目录选择与文件导出
function getMindMapJsonExportTauriCore() {
    const core = window.__TAURI__?.core;
    return !isNativeQuickerExport() && typeof core?.invoke === 'function' ? core : null;
}

async function chooseMindMapJsonExportDirectory() {
    if (isNativeQuickerExport()) {
        return selectQuickerExportDirectory(null);
    }
    const core = getMindMapJsonExportTauriCore();
    if (core) return core.invoke('choose_json_export_directory');
    if (typeof window.showDirectoryPicker !== 'function') return null;
    try {
        return await window.showDirectoryPicker({
            id: 'mindmap-json-export',
            mode: 'readwrite',
            startIn: 'documents',
        });
    } catch (error) {
        if (error?.name === 'AbortError') return null;
        throw error;
    }
}

async function saveMindMapJsonFile(filename, content) {
    const core = getMindMapJsonExportTauriCore();
    if (isNativeQuickerExport() || core) {
        const directoryPath = await chooseMindMapJsonExportDirectory();
        if (!directoryPath) return false;
        if (core) {
            const args = { directoryPath, filename, content, overwrite: false };
            if (await core.invoke('write_mindmap_json', args)) return true;
            if (!await confirmMindMapJsonOverwrite(filename)) return false;
            return core.invoke('write_mindmap_json', { ...args, overwrite: true });
        }
        const result = await getQuickerSubprogramBridge()(QUICKER_SAVE_EXPORT_FILE_SP, {
            directoryPath,
            filename,
            content,
            confirmOverwrite: true,
        });
        if (result?.error) throw new Error(String(result.error));
        if (result?.cancelled) return false;
        if (result?.success !== true) throw new Error('保存动作未成功写入 JSON 文件');
        return true;
    }

    if (typeof window.showDirectoryPicker !== 'function') {
        downloadFile(content, filename, 'application/json');
        return true;
    }
    const directoryHandle = await chooseMindMapJsonExportDirectory();
    if (!directoryHandle) return false;

    let fileHandle;
    try {
        fileHandle = await directoryHandle.getFileHandle(filename);
    } catch (error) {
        if (error?.name !== 'NotFoundError') throw error;
    }
    if (fileHandle && !await confirmMindMapJsonOverwrite(filename)) return false;
    if (!fileHandle) fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    try {
        await writable.write(content);
        await writable.close();
    } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
    }
    return true;
}
// !SECTION JSON 脑图目录选择与文件导出


document.addEventListener('dblclick', (e) => {
    if(!e.target.closest('.bookmark-manager-container')&&
    !e.target.closest('.card-dock-body')&&
    !e.target.closest('.node-card')&&
    !e.target.closest('.toolbar')&&
    !e.target.closest('.item-content')&&
    !document.querySelector('.bookmark-panel').classList.contains('fixed')){
        document.getElementById('favBtn').classList.toggle('hide-btn');
        document.querySelector('.toolbar').classList.toggle('hide-bar');
    }
});
