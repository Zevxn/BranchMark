(function initializeStandaloneRuntime() {
    'use strict';

    const scriptUrl = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : location.href;
    const appRoot = new URL('../', scriptUrl);
    const chromePrefix = 'deepconvo-standalone:chrome:';
    const idbFallbackPrefix = 'deepconvo-standalone:idb:';
    const storageListeners = new Set();
    // Quicker 的 $quickerSync/$quickerSp 仍通过 WebView2 原生消息通道工作。
    // 安装 Chrome API 兼容层时必须保留它，否则 setVar 会在真正写回动作变量时失败。
    const quickerWebView = window.chrome && window.chrome.webview
        ? window.chrome.webview
        : null;
    const nativeQuickerBridge = window.$quickerSync
        || (typeof $quickerSync !== 'undefined' ? $quickerSync : null);

    function readNativeQuickerState() {
        if (!nativeQuickerBridge || typeof nativeQuickerBridge.getVar !== 'function') return null;
        try {
            const raw = nativeQuickerBridge.getVar('app_data_json');
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (error) {
            console.warn('[Standalone] 读取 Quicker 原生 WebView2 状态失败:', error);
            return null;
        }
    }

    const initialQuickerState = readNativeQuickerState();
    const quickerState = nativeQuickerBridge
        ? {
            version: 1,
            syncUpdatedAt: initialQuickerState && Number.isFinite(initialQuickerState.syncUpdatedAt)
                ? initialQuickerState.syncUpdatedAt
                : 0,
            chrome: initialQuickerState && typeof initialQuickerState.chrome === 'object'
                ? initialQuickerState.chrome
                : {},
            idb: initialQuickerState && typeof initialQuickerState.idb === 'object'
                ? initialQuickerState.idb
                : {},
        }
        : null;
    window.__DEEPCONVO_NATIVE_QUICKER_HOST__ = Boolean(nativeQuickerBridge);
    let databasePromise = null;

    function clone(value) {
        if (value === undefined) return undefined;
        return typeof structuredClone === 'function'
            ? structuredClone(value)
            : JSON.parse(JSON.stringify(value));
    }

    function repairCurrentMindMapSnapshot() {
        if (!quickerState) return;
        const currentFileId = quickerState.chrome.currentFileID;
        if (currentFileId == null) return;
        const referenceKey = `MindMapData.__REF__${currentFileId}-extra`;
        const savedSnapshot = quickerState.idb[referenceKey];
        if (!savedSnapshot) return;
        if (JSON.stringify(quickerState.chrome.MindMapData) === JSON.stringify(savedSnapshot)) return;

        quickerState.chrome.MindMapData = clone(savedSnapshot);
        quickerState.chrome.MindMapAction = 'open';
        persistQuickerState().catch(error => {
            console.warn('[Standalone] 修复思维导图启动快照失败:', error);
        });
    }

    // 修复升级前已经存在的“收藏项是新版、启动快照是旧版”状态。
    repairCurrentMindMapSnapshot();

    function getQuickerBucket(prefix) {
        if (!quickerState) return null;
        return prefix === chromePrefix ? quickerState.chrome : quickerState.idb;
    }

    function persistQuickerState() {
        if (!quickerState) return Promise.resolve();
        // Quicker 进程会缓存动作状态，外部同步工具替换 JSON 后不会刷新该缓存。
        // 持久化时记录跨设备时间，供 Quicker 启动层在内存与磁盘之间选择新版本。
        quickerState.syncUpdatedAt = Date.now();
        const serializedState = JSON.stringify(quickerState);
        if (nativeQuickerBridge && typeof nativeQuickerBridge.setVar === 'function') {
            try {
                return Promise.resolve(nativeQuickerBridge.setVar('app_data_json', serializedState));
            } catch (error) {
                console.warn('[Standalone] 写入 Quicker 原生 WebView2 状态失败:', error);
                return Promise.reject(error);
            }
        }
        return Promise.resolve();
    }

    function readLocalValue(prefix, key) {
        const quickerBucket = getQuickerBucket(prefix);
        if (quickerBucket) return clone(quickerBucket[key]);
        try {
            const raw = localStorage.getItem(prefix + key);
            return raw === null ? undefined : JSON.parse(raw);
        } catch (error) {
            console.warn('[Standalone] 本地数据读取失败:', key, error);
            return undefined;
        }
    }

    function writeLocalValue(prefix, key, value) {
        const quickerBucket = getQuickerBucket(prefix);
        if (quickerBucket) {
            quickerBucket[key] = clone(value);
            return persistQuickerState();
        }
        localStorage.setItem(prefix + key, JSON.stringify(value));
        return Promise.resolve();
    }

    function writeLocalValues(prefix, values) {
        const quickerBucket = getQuickerBucket(prefix);
        if (quickerBucket) {
            Object.entries(values || {}).forEach(([key, value]) => {
                quickerBucket[key] = clone(value);
            });
            return persistQuickerState();
        }
        Object.entries(values || {}).forEach(([key, value]) => {
            localStorage.setItem(prefix + key, JSON.stringify(value));
        });
        return Promise.resolve();
    }

    function removeLocalValue(prefix, key) {
        const quickerBucket = getQuickerBucket(prefix);
        if (quickerBucket) {
            delete quickerBucket[key];
            return persistQuickerState();
        }
        localStorage.removeItem(prefix + key);
        return Promise.resolve();
    }

    function listLocalValues(prefix) {
        const quickerBucket = getQuickerBucket(prefix);
        if (quickerBucket) return clone(quickerBucket);
        const data = {};
        for (let index = 0; index < localStorage.length; index++) {
            const storageKey = localStorage.key(index);
            if (!storageKey || !storageKey.startsWith(prefix)) continue;
            const key = storageKey.slice(prefix.length);
            data[key] = readLocalValue(prefix, key);
        }
        return data;
    }

    function normalizeGetResult(keys, prefix) {
        if (keys === null || keys === undefined) return listLocalValues(prefix);
        if (typeof keys === 'string') return { [keys]: readLocalValue(prefix, keys) };
        if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map(key => [key, readLocalValue(prefix, key)]));
        }
        if (typeof keys === 'object') {
            return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => {
                const value = readLocalValue(prefix, key);
                return [key, value === undefined ? clone(fallback) : value];
            }));
        }
        return {};
    }

    function withOptionalCallback(promise, callback) {
        if (typeof callback === 'function') {
            promise.then(value => callback(value)).catch(error => {
                console.error('[Standalone] Chrome API 兼容层调用失败:', error);
                callback(undefined);
            });
            return undefined;
        }
        return promise;
    }

    const storageLocal = {
        get(keys, callback) {
            return withOptionalCallback(Promise.resolve(normalizeGetResult(keys, chromePrefix)), callback);
        },
        set(values, callback) {
            const promise = Promise.resolve().then(async () => {
                const changes = {};
                Object.entries(values || {}).forEach(([key, value]) => {
                    const oldValue = readLocalValue(chromePrefix, key);
                    changes[key] = { oldValue, newValue: clone(value) };
                });
                await writeLocalValues(chromePrefix, values);
                if (Object.keys(changes).length) {
                    queueMicrotask(() => storageListeners.forEach(listener => listener(changes, 'local')));
                }
            });
            return withOptionalCallback(promise, callback);
        },
        remove(keys, callback) {
            const list = Array.isArray(keys) ? keys : [keys];
            const promise = Promise.resolve().then(async () => {
                const changes = {};
                for (const key of list.filter(Boolean)) {
                    const oldValue = readLocalValue(chromePrefix, key);
                    await removeLocalValue(chromePrefix, key);
                    changes[key] = { oldValue, newValue: undefined };
                }
                queueMicrotask(() => storageListeners.forEach(listener => listener(changes, 'local')));
            });
            return withOptionalCallback(promise, callback);
        },
        clear(callback) {
            const promise = Promise.resolve().then(async () => {
                for (const key of Object.keys(listLocalValues(chromePrefix))) {
                    await removeLocalValue(chromePrefix, key);
                }
            });
            return withOptionalCallback(promise, callback);
        }
    };

    function openDatabase() {
        if (quickerState) return Promise.resolve(null);
        if (!('indexedDB' in window)) return Promise.resolve(null);
        if (databasePromise) return databasePromise;
        databasePromise = new Promise(resolve => {
            let settled = false;
            let timer = null;
            const finish = value => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            };
            let request;
            try {
                request = indexedDB.open('DeepConvoStandalone', 1);
            } catch (error) {
                finish(null);
                return;
            }
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('keyval')) {
                    request.result.createObjectStore('keyval');
                }
            };
            request.onsuccess = () => finish(request.result);
            request.onerror = () => finish(null);
            request.onblocked = () => finish(null);
            timer = setTimeout(() => finish(null), 1200);
        });
        return databasePromise;
    }

    async function idbRead(keys) {
        const db = await openDatabase();
        const list = keys === null || keys === undefined
            ? null
            : (Array.isArray(keys) ? keys : [keys]);
        if (!db) {
            if (list === null) return listLocalValues(idbFallbackPrefix);
            return Object.fromEntries(list.map(key => [key, readLocalValue(idbFallbackPrefix, key)]));
        }
        if (list === null) {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction('keyval', 'readonly');
                const store = transaction.objectStore('keyval');
                const keyRequest = store.getAllKeys();
                const valueRequest = store.getAll();
                transaction.oncomplete = () => resolve(Object.fromEntries(keyRequest.result.map((key, index) => [key, valueRequest.result[index]])));
                transaction.onerror = () => reject(transaction.error);
            });
        }
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('keyval', 'readonly');
            const store = transaction.objectStore('keyval');
            const result = {};
            list.forEach(key => {
                const request = store.get(key);
                request.onsuccess = () => { result[key] = request.result; };
            });
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function idbWrite(values) {
        const db = await openDatabase();    // 仅在 Quicker 中使用 IndexedDB 时才会返回 null
        if (!db) {
            await writeLocalValues(idbFallbackPrefix, values);
            return;
        }
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('keyval', 'readwrite');
            const store = transaction.objectStore('keyval');
            Object.entries(values || {}).forEach(([key, value]) => store.put(clone(value), key));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function idbDelete(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        const db = await openDatabase();    // 仅在 Quicker 中使用 IndexedDB 时才会返回 null
        if (!db) {
            for (const key of list.filter(Boolean)) {
                await removeLocalValue(idbFallbackPrefix, key);
            }
            return;
        }
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('keyval', 'readwrite');
            const store = transaction.objectStore('keyval');
            list.filter(Boolean).forEach(key => store.delete(key));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function syncSavedMindMapSnapshot(values) {
        const savedMaps = Object.entries(values || {}).map(([key, value]) => {
            const match = /^MindMapData\.__REF__(.+)-extra$/.exec(key);
            return match ? { id: match[1], value } : null;
        }).filter(Boolean);
        if (!savedMaps.length) return;

        const currentFileId = readLocalValue(chromePrefix, 'currentFileID');
        const currentMap = savedMaps.find(item => String(item.id) === String(currentFileId))
            || (currentFileId == null && savedMaps.length === 1 ? savedMaps[0] : null);
        if (!currentMap) return;

        // 原版保存只更新收藏项对应的 IDB 引用，启动时读取的 MindMapData 仍是旧快照。
        // 同步两者后，重新打开动作会直接恢复刚保存的当前导图。
        await writeLocalValues(chromePrefix, {
            MindMapData: currentMap.value,
            currentFileID: currentMap.id,
            MindMapAction: 'open',
        });
    }

    async function handleRuntimeMessage(message) {
        switch (message && message.action) {
            case 'IDB_GET':
                return { success: true, data: await idbRead(message.keys) };
            case 'IDB_SET':
                await idbWrite(message.data || {});
                await syncSavedMindMapSnapshot(message.data || {});
                return { success: true };
            case 'IDB_REMOVE':
                await idbDelete(message.keys);
                return { success: true };
            case 'getSelector':
            case 'check_status':
                return { success: true, isChro: true };
            case 'OPEN_SIDE_PANEL': {
                const target = message.path ? new URL(message.path, appRoot).href : location.href;
                if (nativeQuickerBridge) location.href = target;
                else window.open(target, '_blank', 'noopener');
                return { success: true };
            }
            default:
                return { success: true, isChro: true };
        }
    }

    const runtime = {
        getURL(path) {
            return new URL(String(path || '').replace(/^\//, ''), appRoot).href;
        },
        sendMessage(message, callback) {
            return withOptionalCallback(handleRuntimeMessage(message), callback);
        },
        connect() {
            const listeners = { addListener() {}, removeListener() {} };
            return { postMessage() {}, disconnect() {}, onMessage: listeners, onDisconnect: listeners };
        },
        lastError: null
    };

    const chromeApi = {
        webview: quickerWebView,
        runtime,
        storage: {
            local: storageLocal,
            onChanged: {
                addListener(listener) { storageListeners.add(listener); },
                removeListener(listener) { storageListeners.delete(listener); },
                hasListener(listener) { return storageListeners.has(listener); }
            }
        },
        tabs: {
            query(queryInfo, callback) {
                const result = [{ id: 1, url: location.href, active: true }];
                if (typeof callback === 'function') callback(result);
                return Promise.resolve(result);
            }
        },
        downloads: {
            download(options, callback) {
                const anchor = document.createElement('a');
                anchor.href = options.url;
                anchor.download = options.filename || 'download';
                anchor.click();
                if (typeof callback === 'function') callback(Date.now());
                return Promise.resolve(Date.now());
            }
        }
    };

    window.chrome = chromeApi;
    window.__DEEPCONVO_EXPORT_QUICKER_STATE__ = persistQuickerState;
    window.__DEEP_CONVO_STANDALONE__ = true;
})();
