/**
 * Helpers shared by the bookmark panel and the mind-map exporter.
 *
 * Website scraping, conversation navigation, highlighting and side-panel code
 * from the browser extension are intentionally not part of the standalone app.
 */

function cleanPageName(pageName = null) {
    const value = pageName || document.title || 'AI思维导图';
    return String(value).trim() || 'AI思维导图';
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

    try {
        directoryHandle = await window.showDirectoryPicker({
            id: 'obsidian-vault',
            mode: 'readwrite',
            startIn: 'documents',
        });
        await writeFileHandle(OBSIDIAN_HANDLE_KEY, directoryHandle);
        return directoryHandle;
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.warn('[Export] 选择保存目录失败:', error);
            showTopToast(getI18nText('toast.dir_fail'));
        }
        return null;
    }
}

async function resetObsidianPath() {
    await writeFileHandle(OBSIDIAN_HANDLE_KEY, null);
}

async function saveFileDirectly(filename, content) {
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
