/**
 * Standalone storage helpers used by MindMap.js and BookMarks.js.
 *
 * The Chrome-like runtime is provided by standalone-shim.js. In Quicker it
 * persists through $quickerSync; in a normal browser it uses IndexedDB with a
 * localStorage fallback.
 */
function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response || response.success === false) {
                reject(new Error(response?.error || '数据读写失败'));
                return;
            }
            resolve(response);
        });
    });
}

async function idbGet(keys = null) {
    const response = await sendRuntimeMessage({ action: 'IDB_GET', keys });
    if (keys !== null && !Array.isArray(keys)) return response.data[keys];
    if (Array.isArray(keys) && keys.length === 1) return response.data[keys[0]];
    return response.data;
}

async function idbSet(data) {
    await sendRuntimeMessage({ action: 'IDB_SET', data });
}

async function idbRemove(keys) {
    await sendRuntimeMessage({ action: 'IDB_REMOVE', keys });
}
