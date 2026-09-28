(function initializeStandaloneRuntime() {
    'use strict';

    // SECTION 宿主环境与 Quicker 状态初始化
    const scriptUrl = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : location.href;
    const appRoot = new URL('../', scriptUrl);              // 由自身 URL 反推应用根目录
    const chromePrefix = 'deepconvo-standalone:chrome:';    // 用于模拟 chrome.storage.local 时读写的数据
    const idbFallbackPrefix = 'deepconvo-standalone:idb:';  // 用于 IndexedDB 不可用时，改用 localStorage 保存的数据
    const storageListeners = new Set();
    // Quicker 的 $quickerSync/$quickerSp 仍通过 WebView2 原生消息通道工作。
    // 安装 Chrome API 兼容层时必须保留它，否则 setVar 会在真正写回动作变量时失败。
    const quickerWebView = window.chrome && window.chrome.webview   // 如果当前环境提供 window.chrome.webview，就保存这个 WebView2 接口
        ? window.chrome.webview
        : null;
    const nativeQuickerBridge = window.$quickerSync   // 尝试取得 Quicker 的数据同步接口 $quickerSync
        || (typeof $quickerSync !== 'undefined' ? $quickerSync : null);

    function readNativeQuickerState() {     // 读取 Quicker 保存的数据
        if (!nativeQuickerBridge || typeof nativeQuickerBridge.getVar !== 'function') return null;
        try {
            const raw = nativeQuickerBridge.getVar('app_data_json');
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (error) {
            console.warn('[Standalone] 读取 Quicker 原生 WebView2 状态失败:', error);
            return null;
        }
    }

    const initialQuickerState = readNativeQuickerState();   // 把刚从 Quicker 读取的数据整理成 shim 内部统一使用的状态结构
    const quickerState = nativeQuickerBridge
        ? {
            version: 1,     // 状态数据的结构版本
            // 数据最后同步时间
            syncUpdatedAt: initialQuickerState && Number.isFinite(initialQuickerState.syncUpdatedAt)
                ? initialQuickerState.syncUpdatedAt
                : 0,
            // 保存模拟 chrome.storage.local 的数据
            chrome: initialQuickerState && typeof initialQuickerState.chrome === 'object'
                ? initialQuickerState.chrome     // 读取模拟 chrome.storage.local 的数据
                : {},
            // 保存模拟 IndexedDB 的数据
            idb: initialQuickerState && typeof initialQuickerState.idb === 'object'
                ? initialQuickerState.idb        // 读取模拟 IndexedDB 的数据
                : {},
        }
        : null;
    const tauriCore = !nativeQuickerBridge
        && window.__TAURI__?.core
        && typeof window.__TAURI__.core.invoke === 'function'
        ? window.__TAURI__.core
        : null;
    window.__DEEPCONVO_NATIVE_QUICKER_HOST__ = Boolean(nativeQuickerBridge);    // 前是否检测到 Quicker 原生接口
    let databasePromise = null;
    let tauriStorageData = null;
    let tauriStorageLoadPromise = null;
    let tauriStorageWriteQueue = Promise.resolve();

    // !SECTION 宿主环境与 Quicker 状态初始化
    // SECTION Quicker 状态与本地存储适配
    // 复制数据，避免直接修改原始数据
    function clone(value) {
        if (value === undefined) return undefined;
        return typeof structuredClone === 'function'
            ? structuredClone(value)
            : JSON.parse(JSON.stringify(value));
    }

    // 修复启动快照
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

    function getQuickerBucket(prefix) {     // 选择 Quicker 中的数据区
        if (!quickerState) return null;
        return prefix === chromePrefix ? quickerState.chrome : quickerState.idb;
    }

    // 把当前内存中的 quickerState 整体序列化成 JSON，然后通过 Quicker 提供的 $quickerSync.setVar() 写回动作变量 app_data_json，实现状态持久化
    function persistQuickerState() {        // 持久化 Quicker 状态
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
    // SECTION 通用数据读取
    function readBrowserLocalValue(prefix, key) {
        try {
            const raw = localStorage.getItem(prefix + key);
            return raw === null ? undefined : JSON.parse(raw);
        } catch (error) {
            console.warn('[Standalone] 本地数据读取失败:', key, error);
            return undefined;
        }
    }

    function getTauriStorageBucket(prefix) {
        if (!tauriStorageData) return null;
        if (prefix === chromePrefix) return tauriStorageData.chrome;
        if (prefix === idbFallbackPrefix) return tauriStorageData.idb;
        return null;
    }

    function readLocalValue(prefix, key) {
        const quickerBucket = getQuickerBucket(prefix);
        // Quicker 模式 → 从对应数据区读取 key，然后返回复制值
        if (quickerBucket) return clone(quickerBucket[key]);
        if (tauriCore) return clone(getTauriStorageBucket(prefix)?.[key]);
        // 浏览器模式：从 localStorage 读取 key，然后返回复制值
        return readBrowserLocalValue(prefix, key);
    }
    // !SECTION 通用数据读取
    // SECTION 通用数据写入
    function writeLocalValues(prefix, values) {
        const quickerBucket = getQuickerBucket(prefix);
        // Quicker 模式 → 写入 quickerState 中对应的数据区 → 保存整个 app_data_json
        if (quickerBucket) {
            Object.entries(values || {}).forEach(([key, value]) => {
                quickerBucket[key] = clone(value);
            });
            return persistQuickerState();
        }
        if (tauriCore) {
            const bucketName = prefix === chromePrefix ? 'chrome' : 'idb';
            return updateTauriStorage(bucketName, values);
        }
        // 浏览器模式  → 写入 localStorage，键名为 prefix + key
        Object.entries(values || {}).forEach(([key, value]) => {
            localStorage.setItem(prefix + key, JSON.stringify(value));
        });
        return Promise.resolve();
    }
    // !SECTION 通用数据写入
    // SECTION 通用数据删除
    function removeLocalValue(prefix, key) {
        const quickerBucket = getQuickerBucket(prefix);
        // Quicker 模式 → 从对应数据区删除 key，然后把状态写回 Quicker
        if (quickerBucket) {
            delete quickerBucket[key];
            return persistQuickerState();
        }
        if (tauriCore) {
            const bucketName = prefix === chromePrefix ? 'chrome' : 'idb';
            return updateTauriStorage(bucketName, null, [key]);
        }
        // 浏览器模式  → 删除名为 prefix + key 的 localStorage 项
        localStorage.removeItem(prefix + key);
        return Promise.resolve();
    }
    // !SECTION 通用数据删除
    function listLocalValues(prefix) {
        const quickerBucket = getQuickerBucket(prefix);
        // Quicker 模式：复制并返回 chrome 或 idb 数据区。
        if (quickerBucket) return clone(quickerBucket);
        if (tauriCore) return clone(getTauriStorageBucket(prefix) || {});
        return listBrowserLocalValues(prefix);
    }

    function listBrowserLocalValues(prefix) {
        // 浏览器模式：遍历 localStorage，只取以 prefix 开头的键，去掉前缀后组成一个对象
        const data = {};
        for (let index = 0; index < localStorage.length; index++) {
            const storageKey = localStorage.key(index);
            if (!storageKey || !storageKey.startsWith(prefix)) continue;
            const key = storageKey.slice(prefix.length);
            data[key] = readBrowserLocalValue(prefix, key);
        }
        return data;
    }

    // SECTION Tauri 文件存储适配
    function normalizeTauriStorageDocument(document) {
        if (!document || typeof document !== 'object' || Array.isArray(document)
            || document.version !== 1
            || !document.chrome || typeof document.chrome !== 'object' || Array.isArray(document.chrome)
            || !document.idb || typeof document.idb !== 'object' || Array.isArray(document.idb)) {
            throw new Error('Tauri 导图数据文件格式无效；原文件已保留。');
        }
        return {
            version: 1,
            chrome: clone(document.chrome),
            idb: clone(document.idb),
        };
    }

    async function readLegacyTauriStorageDocument() {
        const indexedDbValues = await readIndexedDbValues(null);
        if (indexedDbValues === null && 'indexedDB' in window) {
            throw new Error('无法读取当前 WebView2 的 IndexedDB；迁移未完成，旧数据保持不变。');
        }
        const fallbackValues = listBrowserLocalValues(idbFallbackPrefix);
        return normalizeTauriStorageDocument({
            version: 1,
            chrome: listBrowserLocalValues(chromePrefix),
            idb: { ...fallbackValues, ...(indexedDbValues || {}) },
        });
    }

    function ensureTauriStorageLoaded() {
        if (!tauriCore) return Promise.resolve(null);
        if (tauriStorageData) return Promise.resolve(tauriStorageData);
        if (!tauriStorageLoadPromise) {
            tauriStorageLoadPromise = (async () => {
                const savedDocument = await tauriCore.invoke('read_storage_data');
                if (savedDocument) {
                    tauriStorageData = normalizeTauriStorageDocument(savedDocument);
                    return tauriStorageData;
                }

                const legacyDocument = await readLegacyTauriStorageDocument();
                const migratedDocument = await tauriCore.invoke('write_storage_data', {
                    data: legacyDocument,
                    ifMissing: true,
                });
                tauriStorageData = normalizeTauriStorageDocument(migratedDocument);
                return tauriStorageData;
            })().catch(error => {
                tauriStorageLoadPromise = null;
                throw error;
            });
        }
        return tauriStorageLoadPromise;
    }

    async function waitForTauriStorage() {
        await ensureTauriStorageLoaded();
        await tauriStorageWriteQueue;
        return tauriStorageData;
    }

    function updateTauriStorage(bucketName, values, removedKeys = []) {
        const operation = tauriStorageWriteQueue.then(async () => {
            await ensureTauriStorageLoaded();
            const nextDocument = clone(tauriStorageData);
            const bucket = nextDocument[bucketName];
            Object.entries(values || {}).forEach(([key, value]) => {
                bucket[key] = clone(value);
            });
            removedKeys.filter(Boolean).forEach(key => delete bucket[key]);

            const savedDocument = await tauriCore.invoke('write_storage_data', {
                data: nextDocument,
                ifMissing: false,
            });
            tauriStorageData = normalizeTauriStorageDocument(savedDocument);
        });
        tauriStorageWriteQueue = operation.catch(() => {});
        return operation;
    }
    // !SECTION Tauri 文件存储适配

    // 统一 get 的不同参数格式，返回一个对象
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

    // !SECTION Quicker 状态与本地存储适配
    // SECTION IndexedDB 访问与 localStorage 回退
    // SECTION 打开数据库
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
    // !SECTION 打开数据库
    // SECTION 读取indexedDB数据
    async function readIndexedDbValues(keys) {
        const db = await openDatabase();
        if (!db) return null;

        const list = keys === null || keys === undefined
            ? null
            : (Array.isArray(keys) ? keys : [keys]);
        if (list === null) {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction('keyval', 'readonly');
                const store = transaction.objectStore('keyval');
                const keyRequest = store.getAllKeys();
                const valueRequest = store.getAll();
                transaction.oncomplete = () => resolve(Object.fromEntries(
                    keyRequest.result.map((key, index) => [key, valueRequest.result[index]]),
                ));
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

    async function idbRead(keys) {
        if (tauriCore) {
            const storage = await waitForTauriStorage();
            const list = keys === null || keys === undefined
                ? null
                : (Array.isArray(keys) ? keys : [keys]);
            if (list === null) return clone(storage.idb);
            return Object.fromEntries(list.map(key => [key, clone(storage.idb[key])]));
        }

        const db = await openDatabase();    // Quicker 中使用 IndexedDB 时会返回 null
        const list = keys === null || keys === undefined
            ? null
            : (Array.isArray(keys) ? keys : [keys]);
        if (!db) {
            if (list === null) return listLocalValues(idbFallbackPrefix);   // 未指定键时，读取全部数据
            return Object.fromEntries(list.map(key => [key, readLocalValue(idbFallbackPrefix, key)]));   // 指定键时，读取指定键
        }
        return readIndexedDbValues(keys);
    }
    // !SECTION 读取indexedDB数据
    // SECTION 写入indexedDB数据
    async function idbWrite(values) {
        if (tauriCore) {
            await updateTauriStorage('idb', values);
            return;
        }
        const db = await openDatabase();    // Quicker 中使用 IndexedDB 时会返回 null
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
    // !SECTION 写入indexedDB数据
    // SECTION 删除indexedDB数据
    async function idbDelete(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        if (tauriCore) {
            await updateTauriStorage('idb', null, list);
            return;
        }
        const db = await openDatabase();    // Quicker 中使用 IndexedDB 时会返回 null
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
    // !SECTION 删除indexedDB数据
    // !SECTION IndexedDB 访问与 localStorage 回退
    // SECTION 导图快照同步与 Runtime 消息处理
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

    // !SECTION 导图快照同步与 Runtime 消息处理
    // SECTION Chrome API 兼容与全局安装
    const runtime = {
        getURL(path) {  // 把应用内的相对路径转换成完整 URL
            return new URL(String(path || '').replace(/^\//, ''), appRoot).href;
        },
        sendMessage(message, callback) {    // 把消息交给 handleRuntimeMessage() 处理，并同时支持回调和 Promise 两种用法。
            return withOptionalCallback(handleRuntimeMessage(message), callback);
        },
        connect() { // 返回一个空的连接对象。它提供 postMessage、disconnect 和事件监听接口
            const listeners = { addListener() {}, removeListener() {} };
            return { postMessage() {}, disconnect() {}, onMessage: listeners, onDisconnect: listeners };
        },
        lastError: null
    };

    const storageLocal = {
        get(keys, callback) {
            const promise = (async () => {
                await waitForTauriStorage();
                return normalizeGetResult(keys, chromePrefix);
            })();
            return withOptionalCallback(promise, callback);
        },
        set(values, callback) {
            const promise = Promise.resolve().then(async () => {
                await waitForTauriStorage();
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
                await waitForTauriStorage();
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
                await waitForTauriStorage();
                for (const key of Object.keys(listLocalValues(chromePrefix))) {
                    await removeLocalValue(chromePrefix, key);
                }
            });
            return withOptionalCallback(promise, callback);
        }
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

    // !SECTION Chrome API 兼容与全局安装
    window.chrome = chromeApi;
    window.__DEEPCONVO_EXPORT_QUICKER_STATE__ = persistQuickerState;
    window.__DEEP_CONVO_STANDALONE__ = true;
})();
