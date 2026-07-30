importScripts('static/sync-core.js');
importScripts('static/idb-storage.js');
const syncManager = new NutstoreSync();

// ✅ 新增计数器锁
let syncLockCount = 0;

// ✅ 辅助函数：操作锁
function acquireLock() {
    syncLockCount++;
    // console.log(`🔒 锁定: ${syncLockCount}`);
}

function releaseLock() {
    // 保持原有的2秒延迟，防止事件滞后
    setTimeout(() => {
        if (syncLockCount > 0) syncLockCount--;
        // console.log(`🔓 解锁: ${syncLockCount}`);
    }, 2000);
}

function isSyncLocked() {
    return syncLockCount > 0;
}

let syncLock = Promise.resolve();

// 核心配置：需要同步的键名或前缀
const SYNC_KEYS = [
  'bookmarkData', 
  'shortcutsData',
  'shortcutCategories', 
  'highlightData-',         // 包含短横线的前缀，完全支持
  'largeContents.__REF__',  // 包含点号的前缀，完全支持
  'MindMapData.__REF__'
];

/*===============================================================================================
// #region 初始化与更新检测 (合并版)
 ==============================================================================================*/
const handleStartupOrInstall = async (details = null) => {
    const manifest = chrome.runtime.getManifest();
    const currentVersion = manifest.version;
    
    // 1. 获取存储中的旧版本号
    const data = await chrome.storage.local.get('lastRunVersion');
    const lastRunVersion = data.lastRunVersion;

    // 2. 判断是否需要弹窗 (逻辑：存储的版本 != 当前Manifest版本)
    // 这种情况涵盖了：全新安装、自动更新、以及“禁用后启用且版本已变”的情况
    // if (lastRunVersion !== currentVersion) {
    if (!lastRunVersion) {
        console.log(`🚀 版本变更: ${lastRunVersion} -> ${currentVersion}`);
        
        // 如果不是 undefined (说明是更新，不是全新安装)，或者是全新安装也想弹
        // 这里根据你的需求，通常全新安装(undefined)也弹，更新也弹
        openUpdatePage(); 

        // 更新本地存储的版本号
        await chrome.storage.local.set({ lastRunVersion: currentVersion });
    }

    // 3. 执行原本的初始化逻辑 (只在真正安装/更新事件触发时执行，或者你可以根据需要调整)
    if (details) {
        console.log('✅ 插件核心初始化，同步模式:', SYNC_KEYS);
        await chrome.alarms.create('autoDownloadCheck', { periodInMinutes: 5 });
        
        // 初始化 fileVersions
        const Versions = await chrome.storage.local.get('fileVersions');
        if (!Versions.fileVersions) {
            await chrome.storage.local.set({fileVersions:{}});
        }
        await chrome.storage.local.set({
            autoSync: true,
            lastSyncTime: 0,
            lastSyncEtag: null,
            pendingChanges: false,
            pendingKeys: [],
            initializedDownload: false
        });
    }
};

// 监听安装/更新事件 (浏览器触发)
chrome.runtime.onInstalled.addListener(async (details) => {
    await handleStartupOrInstall(details);
    await syncAndCleanReferences();
    // validatePlan();
});

// 监听启动事件 (浏览器打开 或 插件被“启用”时触发)
chrome.runtime.onStartup.addListener(async () => {
    // 稍微延迟，确保环境就绪
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 这里也检查一下版本，防止 update 事件在浏览器关闭期间被漏掉
    await handleStartupOrInstall(null); // 传 null 表示这不是 install 事件，只做版本检查
    
    // 原本的启动逻辑
    await new Promise(resolve => setTimeout(resolve, 2000));
    await checkAndDownload();
    await syncAndCleanReferences();
    // await validateDeviceStatus();
    // await validatePlan();
    // setupAlarm(); 
    // refreshToken();
});

// 辅助函数
function openUpdatePage() {
    chrome.tabs.create({
        url: 'https://deepconvo.pages.dev/', 
        active: true
    });
    
}

// background.js

// const DEFAULT_SIDEBAR_PATH = 'HTML/popup.html?type=sidebar'; // 记得带上之前的自适应参数

// chrome.runtime.onConnect.addListener((port) => {
//     // 只处理重置守卫的连接
//     if (port.name === 'sidepanel_reset_guard') {
        
//         let targetTabId = null; // 用于临时存储这个连接对应的 Tab ID

//         // 1. 监听侧边栏发来的第一条消息（握手），获取 tabId
//         port.onMessage.addListener((msg) => {
//             if (msg.tabId) {
//                 targetTabId = msg.tabId;
//                 // console.log(`已绑定侧边栏重置守卫: Tab ${targetTabId}`);
//             }
//         });

//         // 2. 监听断开事件（用户关闭侧边栏 或 切换页面导致销毁）
//         port.onDisconnect.addListener(() => {
//             // 只有当我们成功获取到了 tabId 才执行重置
//             if (targetTabId !== null) {
//                 console.log(`侧边栏关闭，重置 Tab ${targetTabId} 为默认视图`);
                
//                 // 执行重置逻辑
//                 chrome.sidePanel.setOptions({
//                     tabId: targetTabId,
//                     path: DEFAULT_SIDEBAR_PATH,
//                     enabled: true
//                 });
//             }
//         });
//     }
// });


/*===============================================================================================
// #region 监听数据变化
 ==============================================================================================*/
// changes：变化的键值对；areaName：变化的存储区域（如 'local'、'sync'）。
idbStorage.onChanged.addListener(async (changes) => {
    console.log('✅ onChanged 触发,欲同步:', changes);
    if (isSyncLocked()) {
        console.log('⚠️ 忽略 onChanged 事件，因为正在同步 (锁计数: ' + syncLockCount + ')');
        return;
    } 
    if(!await updateWebDAVStatus()) return;
    const changedKeys = [];
    const Versions = await chrome.storage.local.get('fileVersions');
    const currentVersions = Versions.fileVersions || {};
    for (const [key, change] of Object.entries(changes)) {  // 遍历所有变化的键值对
        // 核心匹配逻辑：支持精确匹配或前缀匹配
        const shouldSync = SYNC_KEYS.some(pattern => {  // NOTE: 短路求值（找到第一个满足条件的元素后，立即停止遍历，不再检查后续元素）
            const match = (key === pattern) || key.startsWith(pattern);
            if (match) {
                const action = change.newValue === undefined ? '删除' : '修改';
                console.log(`✅ 检测到${action}: "${key}" (模式: "${pattern}")`);
                if (action === '修改'){
                    currentVersions[key] = Date.now();
                }else{
                    delete currentVersions[key];
                }
            }
            return match;
        });
        
        if (shouldSync) {
            changedKeys.push(key);
        }
    }
    await chrome.storage.local.set({['fileVersions']:currentVersions});
    if (changedKeys.length === 0) return;

    console.log(`📤 检测到 ${changedKeys.length} 个键需要同步:`, changedKeys);
    
    // 更新待上传列表（原子操作）
    const meta = await chrome.storage.local.get('pendingKeys');
    const existingPending = meta.pendingKeys || [];
    const allPendingKeys = Array.from(new Set([...existingPending, ...changedKeys]));// 合待上传的键和现在改变的键
    
    await chrome.storage.local.set({
        pendingChanges: true,
        pendingKeys: allPendingKeys
    });
    
    const config = await chrome.storage.local.get('autoSync');
    if (config.autoSync) {
        await chrome.alarms.clear('debouncedUpload');   // 清除之前的上传定时器（防止重复）
        if (allStartWith(changedKeys,'highlightData-')){
            await chrome.alarms.create('debouncedUpload', { when: Date.now() + 60*1000 }); //创建一个新的定时器，1分钟后触发上传任务（防抖机制）。
        }else{
            // 防抖：3秒后执行上传
            await chrome.alarms.create('debouncedUpload', { when: Date.now() + 10*1000 }); //创建一个新的定时器，5秒后触发上传任务（防抖机制）。
            console.log('⏰ 已创建延迟上传任务');
        }
        
    }
});
function allStartWith(list, prefix) {
    const lowerPrefix = prefix.toLowerCase();
    return list.every(item => 
        String(item).toLowerCase().startsWith(lowerPrefix)
    );
}

/**
 * 提取引用并清理本地存储中不再使用的 key
 * @param {Object} json - 完整的源数据对象
 */
async function syncAndCleanReferences() {
    // 1. 提取 JSON 中所有有效的引用 (Source of Truth)
    const {"bookmarkData":bookmarkData}= await idbStorage.get('bookmarkData');
    if (!bookmarkData || !bookmarkData.items) return;
    const validRefs = new Set(); // 使用 Set 提高查找效率
    const items = bookmarkData.items;

    // 辅助函数：规范化引用字符串（自动补全前缀）
    const normalizeRef = (str) => {
        if (str.startsWith('MindMapData.') || str.startsWith('largeContents.')) {
            return str;
        }
        // 如果没有前缀，默认加上 largeContents.
        return 'largeContents.' + str;
    };

    for (const key in items) {
        const item = items[key];
        const data = item.data;

        if (!data) continue;

        // 情况 A: data 是字符串
        if (typeof data === 'string') {
            if (data.includes('__REF__')) {
                validRefs.add(normalizeRef(data));
            }
        } 
        // 情况 B: data 是数组 (对话列表)
        else if (Array.isArray(data)) {
            data.forEach(row => {
                // 检查数组第3项 (索引2)
                if (row.length > 2) {
                    const refString = row[2];
                    if (typeof refString === 'string' && refString.includes('__REF__')) {
                        validRefs.add(normalizeRef(refString));
                    }
                }
            });
        }
    }

    console.log(`有效引用数量: ${validRefs.size}`);

    // 2. 获取本地存储的所有数据
    // 定义需要检查的前缀模式
    const REF_KEYS = ['largeContents.__REF__', 'MindMapData.__REF__'];
    
    try {
        const allData = await idbStorage.get(null);
        
        // 筛选出本地存储中属于引用类型的 keys
        const localKeys = Object.keys(allData).filter(key => 
            REF_KEYS.some(pattern => key.startsWith(pattern))
        );

        // 3. 对比找出需要删除的 keys
        // 如果 localKey 不在 validRefs 中，说明它已经是僵尸数据
        const removeKeys = localKeys.filter(key => !validRefs.has(key));

        // 4. 执行删除操作
        if (removeKeys.length > 0) {
            console.log('发现待清理的过期引用:', removeKeys);
            await idbStorage.remove(removeKeys);
            console.log(`成功清理了 ${removeKeys.length} 个过期引用。`);
            for (const key of removeKeys) {
                try {
                    await syncManager.deleteKey(key);  // 同步删除云端
                    console.log(`🗑️ 云端清理: ${key}`);
                } catch (e) {
                    console.log(`⚠️ 云端删除失败 ${key}:`, e);
                }
            }
        } else {
            console.log('本地存储很干净，无需清理。');
        }

        return {
            validCount: validRefs.size,
            removedCount: removeKeys.length,
            removedKeys: removeKeys
        };

    } catch (error) {
        console.log('存储同步过程中发生错误:', error);
    }
}

// 使用示例：
// 假设 sourceData 是你的 JSON 变量
// await syncAndCleanReferences(sourceData);
/*===============================================================================================
// #region 定时器处理
 ==============================================================================================*/
// 形象理解：闹钟响了，看是哪个闹钟
chrome.alarms.onAlarm.addListener(async (alarm) => {
    const config = await chrome.storage.local.get(['autoSync', 'nutstore_credentials']);
    if (!config.nutstore_credentials) return;

    // 串行化执行，防止并发
    syncLock = syncLock.then(async () => {
        try {
            if (alarm.name === 'debouncedUpload' && config.autoSync) {
                const meta = await chrome.storage.local.get(['pendingChanges', 'pendingKeys']);
                if (meta.pendingChanges && meta.pendingKeys?.length > 0) {
                    console.log('🚀 执行延迟上传任务');
                    await handleUpload(meta.pendingKeys);
                }
            } else if (alarm.name === 'autoDownloadCheck' && config.autoSync) {
                console.log('🔄 执行自动下载检查');
                await checkAndDownload();
            }
        } catch (error) {
            console.log('❌ 定时任务失败:', error);
        } 
    });
});

/*===============================================================================================
// #region 检查下载
 ==============================================================================================*/
async function checkAndDownload() {
    console.log(new Date());
    console.log('[自动检查] 开始检测云端变化...');
    
    const meta = await chrome.storage.local.get(['pendingChanges']);
    const Versions = await chrome.storage.local.get('fileVersions');
    
    if (meta.pendingChanges) {
        console.log('[自动检查] 本地有待上传，跳过下载');
        return;
    }

    try {
        acquireLock(); // ✅ 加锁
        // 自动下载云端有但本地没有的文件，还有更新的文件
        const remoteFiles = await syncManager.listRemoteFiles();
        // console.log('[自动检查] 远程文件列表:', remoteFiles);
        // console.log('[自动检查] 本地版本记录:', Versions.fileVersions);
        // 1️⃣ 收集云端所有键名
        const remoteKeys = new Set(remoteFiles.map(f => f.key));
        if (remoteFiles.length === 0) {
            console.log('[自动检查] 云端无文件');
            return;
        }

        // 找出需要下载到本地的数据=======================================================
        const filesToDownload = [];
        for (const remoteFile of remoteFiles) {
            const localVersion = Versions.fileVersions?.[remoteFile.key];   // 本地数据版本
            const isUpdated = !localVersion || remoteFile.lastModified > (localVersion + 5000);
            if (isUpdated) {
                filesToDownload.push(remoteFile);
            }
        }

        // 找出本地有但云端没有的键，这些键需要删除========================================
        const allLocalData = await idbStorage.get(null);
        const allLocalKeys = Object.keys(allLocalData);
        const localTrackedKeys = allLocalKeys.filter(key =>
            SYNC_KEYS.some(pattern => key === pattern || key.startsWith(pattern))
        );
        const keysToDelete = localTrackedKeys.filter(key => {
            // 1. 如果云端文件列表中存在该 Key，说明没删，保留
            if (remoteKeys.has(key)) return false;

            // 2. 如果云端没有，检查本地是否有版本记录
            // Versions.fileVersions[key] 存在，说明它是从云端下载过的老文件，现在云端没了 -> 说明被删了 -> 本地也要删
            // Versions.fileVersions[key] 不存在，说明它是本地新建的，还没同步上去 -> 不是删除 -> 本地保留
            const isSyncedBefore = Versions.fileVersions && Versions.fileVersions[key] !== undefined;
            
            return isSyncedBefore;
        });
        console.log('本地键:', localTrackedKeys);
        console.log('云端键:', remoteKeys);
        
        if (keysToDelete.length > 0) {
            console.log(`[自动检查] 发现 ${keysToDelete.length} 个文件在云端已删除:`, keysToDelete);
            
            // 删除本地数据和版本记录
            await idbStorage.remove(keysToDelete);
            
            const currentVersions = { ...Versions.fileVersions };
            keysToDelete.forEach(key => delete currentVersions[key]);
            await chrome.storage.local.set({ fileVersions: currentVersions });
        }
        if (filesToDownload.length > 0) {
            console.log(`[自动检查] 发现 ${filesToDownload.length} 个新文件`);
            await handleDownload(filesToDownload);
        }
        return { 
            success: true, 
            downloaded: filesToDownload.length,
            deleted: keysToDelete.length
        };
    } catch (error) {
        console.log('[自动检查] 失败:', error);
    } finally {
        releaseLock(); // ✅ 解锁（带延迟）
    }
}

/*===============================================================================================
// #region 消息处理
 ==============================================================================================*/
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'sync_upload' || msg.action === 'sync_download') {
        (async () => {
            try {
                acquireLock(); // ✅ 加锁
                const result = msg.action === 'sync_upload' 
                ? await handleUpload(null,true) 
                : await handleDownload(null,true);
                
                // ✅ 确保总是返回 success 字段
                sendResponse(result);
            } catch (error) {
                console.log('❌ 消息处理失败:', error);
                sendResponse({ success: false, error: error.message });
            } finally {
                releaseLock(); // ✅ 解锁
            }
        })();
        return true; // 保持异步响应
    }else if (msg.action === 'manul_sync'){
        (async () => {
            try {
                acquireLock(); // ✅ 加锁
                const result = await checkAndDownload();
                // ✅ 确保总是返回 success 字段
                sendResponse(result);
            } catch (error) {
                console.log('❌ 消息处理失败:', error);
                sendResponse({ success: false, error: error.message });
            } finally {
                releaseLock(); // ✅ 解锁
            }
        })();
        return true; // 保持异步响应
    }else if(msg.action?.startsWith('IDB_')) {
        (async () => {
            try {
                if (msg.action === 'IDB_GET') {
                    const data = await idbStorage.get(msg.keys);
                    sendResponse({ success: true, data });
                    // console.log('IDB_GET:', data);
                } else if (msg.action === 'IDB_SET'){
                    await idbStorage.set(msg.data);
                    sendResponse({ success: true });
                    // console.log('IDB_SET:', msg.data);
                } else{
                    await idbStorage.remove(msg.keys);   // 支持 string | string[]
                    sendResponse({ success: true });
                    // console.log('IDB_REMOVE:', msg.keys);
                }
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
            return true; // 保持异步响应
    }else if (msg.action === 'check_status') {
        // console.log('未知消息:', msg);
        createElements().then(sendResponse);
        return true; 
    }else if (msg.action === 'getSelector') {
        // console.log('未知消息:', msg);
        createSelector().then(sendResponse);
        return true; 
    }else if(msg.action === 'OPEN_SIDE_PANEL'){
        if (!sender.tab) return;
        chrome.sidePanel.setOptions({
            tabId: sender.tab.id,
            path: msg.path, // 例如 'chat.html' 或 'notes.html'
            enabled: true
        });
        chrome.sidePanel.open({ tabId: sender.tab.id });
        sendResponse({ success: true });
    }
});

/*===============================================================================================
// #region 上传处理
===============================================================================================*/
async function handleUpload(pendingKeys,isNotify=false) {
    if(!await updateWebDAVStatus()) {return};
    console.log('📤 开始上传任务...');
    try {
        acquireLock();
        await syncManager.ensureFolderExists();
        // 考虑人为调用时不带参数的情况
        if (!pendingKeys || pendingKeys.length === 0) {
            console.log('📤 待处理列表为空，重新计算...');
            const allData = await idbStorage.get(null);
            console.log('📤 所有键:', Object.keys(allData));
            pendingKeys = Object.keys(allData).filter(key => 
                SYNC_KEYS.some(pattern => key === pattern || key.startsWith(pattern))
            );
        }

        console.log('📤 待处理键列表:', pendingKeys);
        const Versions = await chrome.storage.local.get('fileVersions');
        const currentVersions = Versions.fileVersions || {};
        console.log('📤 本地版本:', currentVersions);
        let uploadCount = 0, deleteCount = 0;
        for (const key of pendingKeys) {
            try {
                const data = await idbStorage.get(key);
                const value = data[key];
                console.log(`📤 处理键 "${key}":`, value === undefined ? '【删除】' : '【上传】');
                
                // 情况1: 键已不存在 → 删除云端文件
                if (value === undefined) {
                    await syncManager.deleteKey(key);
                    deleteCount++;
                }
                // 情况2: 值是删除标记对象 → 删除云端文件并清理本地
                else if (value && value._deleted === true) {
                    await syncManager.deleteKey(key);
                    await idbStorage.remove(key);
                    deleteCount++;
                }
                // 情况3: 正常数据 → 上传
                else {
                    await syncManager.uploadKey(key, value, currentVersions[key]||Date.now());
                    uploadCount++;
                }
            } catch (error) {
                console.log(`❌ 处理 "${key}" 失败:`, error);
            }
        }
        if (isNotify) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: '上传成功',
                message: `上传 ${uploadCount} 项, 删除 ${deleteCount} 项`
            });
        }
        console.log(`📤 上传完成: 上传 ${uploadCount} 项, 删除 ${deleteCount} 项`);
        // ✅ 清理 pending 状态
        await chrome.storage.local.set({
            lastSyncTime: Date.now(),
            pendingChanges: false,
            pendingKeys: [],
        });
        
        // ✅ 兼容 popup 的返回值
        return { 
            success: true, 
            keyCount: uploadCount + deleteCount,
            uploaded: uploadCount,
            deleted: deleteCount
        };
    } catch (error) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '上传失败',
            message: error.message
        });
        console.log('❌ 上传任务致命错误:', error);
        throw error;
    }finally {
        releaseLock();
    }
}

/*===============================================================================================
// #region 下载处理
 ==============================================================================================*/
async function handleDownload(filesToDownload,isNotify=false) {
    if(!await updateWebDAVStatus()) return;
    try {
        acquireLock(); // ✅ 加锁
        if (!filesToDownload) { // 手动下载的情况
            filesToDownload = await syncManager.listRemoteFiles();
        }
        
        let successCount = 0;
        const syncData = {};
        for (const fileInfo of filesToDownload) {
        try {
            const value = await syncManager.downloadKey(fileInfo.key);
            
            if (value !== null) {
                syncData[fileInfo.key] = value;
                successCount++;
                console.log(`⬇️ 成功: "${fileInfo.key}"`);
            }
        } catch (error) {
            console.log(`⬇️ 失败 "${fileInfo.key}":`, error);
        }
        }

        if (successCount > 0) {
            await idbStorage.set(syncData);
            // console.log('⬇️ 写入本地存储:', syncData);
            // console.log('⬇️ 写入本地存储:', syncData.bookmarkData);
            // console.log('⬇️ 写入本地存储:', await idbStorage.get('bookmarkData'));
        }
        
        const Versions = await chrome.storage.local.get('fileVersions');
        const currentVersions = Versions.fileVersions || {};
        filesToDownload.forEach(f => currentVersions[f.key] = f.lastModified);
        await chrome.storage.local.set({
            lastSyncTime: Date.now(),
            pendingChanges: false,
            pendingKeys: [],
            fileVersions: currentVersions
        });
        if (isNotify) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: '下载成功',
                message: `${successCount}项收藏数据已从云端下载`
            });
        }
        console.log(`⬇️ 下载完成: 成功 ${successCount} 项`);

        return { success: true, keyCount: successCount, data: syncData };
    } catch (error) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '下载失败',
            message: error.message
        });
        console.log('⬇️ 下载任务致命错误:', error);
        throw error;
    } finally {
        releaseLock(); // ✅ 解锁
    }
}
async function createElements() {
    return { isChro: true };
    try {
        const cacheKey = 'user_plan_cache';
        const { [cacheKey]: cachedData } = await chrome.storage.local.get(cacheKey);

        if (!cachedData || !cachedData.uid) {
            return { isChro: false };
        }

        // ★★★ 改动：加上 await 调用 Web Crypto API
        const statusStr = cachedData.isChro ? 'chrome' : 'edge';
        const isValid = await verifySignature(cachedData.uid, statusStr, cachedData.signature);

        if (isValid && cachedData.isChro) {
            return { isChro: true };
        } else {
            return { isChro: false };
        }

    } catch (e) {
        console.log('Check Error:', e);
        return { isChro: false };
    }
}
async function createSelector() {
    return { isChro: true };
    try {
        const cacheKey = 'user_plan_cache';
        const { [cacheKey]: cachedData } = await chrome.storage.local.get(cacheKey);

        if (!cachedData || !cachedData.uid) {
            return { isChro: false };
        }

        // ★★★ 改动：加上 await 调用 Web Crypto API
        const statusStr = cachedData.isChro ? 'chrome' : 'edge';
        const isValid = await verifySignature(cachedData.uid, statusStr, cachedData.signature);

        if (isValid && cachedData.isChro) {
            return { isChro: true };
        } else {
            return { isChro: false };
        }

    } catch (e) {
        console.log('Check Error:', e);
        return { isChro: false };
    }
}
async function updateWebDAVStatus() {
    return true
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
            return true
        } else {
            return false
        }

    } catch (e) {
        console.log('Check Error:', e);
        return false
    }
}

// ===================================================================================
// #region Offscreen 处理图片消息
// ===================================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PROCESS_AND_DOWNLOAD') {
        console.log('[Background] 收到待处理图片，启动 Offscreen...');

        handleImageProcessing(message.base64, message.filename);
    }
});

async function handleImageProcessing(base64String, originalFilename) {
    // 1. 创建 Offscreen
    await setupOffscreenDocument('HTML/offscreen.html');

    // 2. 发送给 Offscreen 运算
    chrome.runtime.sendMessage({
        type: 'PROCESS_IMAGE',
        dataUrl: base64String 
    }, (response) => {
        if (response && response.success) {
            console.log('[Background] ✅ 去水印成功，开始下载');
            
            // 3. 下载处理后的图片
            chrome.downloads.download({
                url: response.dataUrl,
                filename: originalFilename, // 使用原文件名
                conflictAction: 'overwrite'
            });
        } else {
            console.log('[Background] ❌ 算法处理失败，下载原图');
            chrome.downloads.download({ url: base64String, filename: originalFilename });
        }
    });
}

// 通用 Offscreen 创建代码
let creating; 
async function setupOffscreenDocument(path) {
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });
    if (existingContexts.length > 0) return;
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: ['BLOBS'],
            justification: 'Watermark processing',
        });
        await creating;
        creating = null;
    }
}



// background.js
// #region 模拟点击
// 用于记录自动断开的定时器
let detachTimer = null;
// 记录当前附身的 Tab ID
let currentAttachedTabId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "debugger_click") {
        const tabId = sender.tab.id;
        const { x, y } = request.coordinates;

        // 核心逻辑函数
        const runClickSequence = () => {
            // 1. 发送按下指令
            chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
                type: "mousePressed", x: x, y: y, button: "left", clickCount: 1
            }, () => {
                // 2. 稍微延时松开 (给网页脚本一点反应时间)
                setTimeout(() => {
                    chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
                        type: "mouseReleased", x: x, y: y, button: "left", clickCount: 1
                    }, () => {
                        console.log("✅ 物理点击模拟成功");
                        
                        // 【关键策略】点击完成后，不要立即断开！
                        // 而是重置定时器，2秒后如果没有新操作再断开。
                        // 这样既保证了剪切板Promise能执行完，也能支持连续点击。
                        scheduleDetach(tabId);
                        
                        sendResponse({ status: "success" });
                    });
                }, 50); 
            });
        };

        // 检查当前是否已经连接
        if (currentAttachedTabId === tabId) {
            // 如果已经连着，直接点，并重置断开倒计时
            clearTimeout(detachTimer);
            runClickSequence();
        } else {
            // 如果没连或者连的是别的标签，先建立连接
            chrome.debugger.attach({ tabId }, "1.3", () => {
                if (chrome.runtime.lastError) {
                    // 容错处理：如果浏览器认为已经连接（虽然我们变量没记），通过错误信息判断
                    if (chrome.runtime.lastError.message.includes("attached")) {
                        currentAttachedTabId = tabId;
                        runClickSequence(); 
                    } else {
                        console.log("Attach error:", chrome.runtime.lastError.message);
                        sendResponse({ status: "error" });
                    }
                } else {
                    currentAttachedTabId = tabId;
                    runClickSequence();
                }
            });
        }

        return true; // 保持异步消息通道
    }
});

// 管理断开连接的函数
function scheduleDetach(tabId) {
    // 清除旧的定时器
    if (detachTimer) clearTimeout(detachTimer);

    // 设置新的定时器：2秒后断开
    detachTimer = setTimeout(() => {
        chrome.debugger.detach({ tabId }, () => {
            if (chrome.runtime.lastError) {
                console.log("Detach ignored:", chrome.runtime.lastError.message);
            }
            console.log("🔌 闲置超时，自动断开 Debugger");
            currentAttachedTabId = null;
        });
    }, 2000); // 2秒延时，足够大多数网页完成 clipboard 写入
}



// ========================================================================================================
// #region 验证签名
// ========================================================================================================
// importScripts('../libs/supabase.js'); 

// const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
//     auth: {
//         storage: ChromeStorageAdapter,
//         autoRefreshToken: false, // 必须关闭
//         persistSession: true,
//         detectSessionInUrl: false,
//         storageKey: 'supabase.auth.token'
//     }
// });

// let isRefreshingAuth = false;

// chrome.alarms.onAlarm.addListener(async (alarm) => {
//     if (alarm.name === 'refresh_token_heartbeat') {
//         // console.log('⏰ 后台唤醒：准备检查 Session...');
//         await refreshToken();
//     }
// });

// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.action === 'trigger_keep_alive') {
//         // 不需要 await，让它后台跑就行，直接给 Popup 回复
//         // console.log('🔄 后台：收到触发请求，立即执行刷新...',new Date().toLocaleString());
//         refreshToken(); 
//         sendResponse({ status: 'ok' });
//     }
// });
// supabaseClient.auth.onAuthStateChange(async (event, session) => {
//     console.log(`⚡️ [Auth变更] 事件: ${event}`);

//     if (session?.refresh_token) {
//         // 只要有新 Session，立刻锁死到硬盘！
//         // 使用 await 确保写入完成前脚本不被杀掉
//         const tokenString = JSON.stringify(session);
//         await chrome.storage.local.set({ 'supabase.auth.token': tokenString });
//         // console.log('💾 [Auth变更] 新 Token 已写入硬盘');
//     } else if (event === 'SIGNED_OUT') {
//         await chrome.storage.local.remove('supabase.auth.token');
//         console.log('🗑 [Auth变更] 本地 Token 已清理');
//     }
// });

// function setupAlarm() {
//     chrome.alarms.get('refresh_token_heartbeat', (alarm) => {
//         if (!alarm) {
//             // 45分钟检查一次，留出15分钟的冗余
//             chrome.alarms.create('refresh_token_heartbeat', { periodInMinutes: 45 });
//         }
//     });
// }

// async function refreshToken() {
//     // 防重入锁
//     if (isRefreshingAuth) return;
//     try {
//         isRefreshingAuth = true;
//         // console.log('🔄 [启动检查] 正在恢复会话...');

//         // 1. 读取硬盘
//         const { 'supabase.auth.token': rawData } = await chrome.storage.local.get('supabase.auth.token');
        
//         if (!rawData) {
//             // console.log('⚪️ [启动检查] 未登录');
//             return;
//         }

//         // 2. 解析 Session
//         let sessionObj = null;
//         try {
//             sessionObj = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
//         } catch (e) {
//             // console.error('❌ Token 格式损坏，清理数据');
//             await chrome.storage.local.remove('supabase.auth.token');
//             return;
//         }

//         if (!sessionObj?.refresh_token) return;

//         // 3. 检查 Access Token 是否过期 (预判)
//         // expires_at 是秒级时间戳。即使本地时间不准，留出缓冲空间通常也够用。
//         const now = Math.floor(Date.now() / 1000);
//         // 如果剩余有效期少于 600 秒 (10分钟)，或者已经过期，标记为需要刷新
//         const isExpiredOrClose = (sessionObj.expires_at - now) < 600;

//         // 4. 尝试恢复 Session
//         // 注意：由于 autoRefreshToken: false，如果 Token 已过期，setSession 可能会报错 'JWT expired'
//         const { error: setSessionError } = await supabaseClient.auth.setSession(sessionObj);

//         // 5. 决定是否需要刷新
//         // 即使 setSession 失败(JWT过期)，只要不是 Refresh Token 无效，我们都应该尝试刷新
//         let needRefresh = isExpiredOrClose;

//         if (setSessionError) {
//             // console.warn('⚠️ [启动检查] setSession 警告:', setSessionError.message);
            
//             // 关键逻辑修正：不要因为 JWT 过期就退出！
//             if (setSessionError.message.includes('JWT expired')) {
//                 // console.log('⚠️ Token 已过期，准备强制刷新...');
//                 needRefresh = true; 
//             } else {
//                 // 如果是其他严重错误（如 Invalid Refresh Token），则真的无法挽回了
//                 console.log('🔥 令牌彻底无效，执行登出');
//                 await supabaseClient.auth.signOut();
//                 // chrome.action.setBadgeText({ text: '!' });
//                 // chrome.action.setBadgeBackgroundColor({ color: '#F00' });
//                 return;
//             }
//         }

//         // 6. 执行刷新 (如果需要)
//         if (needRefresh) {
//             // console.log('⏳ 执行 Token 刷新...');
//             // 使用 refreshSession，它会利用内部存储的 refresh_token (即使 setSession 报错，通常 refresh_token 还在内存中)
//             // 或者我们可以显式传递 (取决于 SDK 版本，但通常调用无参即可)
//             const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession();

//             if (refreshError) {
//                 // console.error('❌ 刷新失败:', refreshError.message);
//                 // 只有在这里刷新也失败了，才证明 Refresh Token 真的过期或被吊销了
//                 await supabaseClient.auth.signOut();
//                 // chrome.action.setBadgeText({ text: '!' });
//                 // chrome.action.setBadgeBackgroundColor({ color: '#F00' });
//             } else {
//                 // console.log('✅ Token 刷新成功');
//                 // chrome.action.setBadgeText({ text: '' });
//                 // onAuthStateChange 会自动触发并保存新 Token 到 storage，无需手动保存
//             }
//         } else {
//             // console.log('✅ 会话状态良好，无需刷新');
//             // chrome.action.setBadgeText({ text: '' });
//         }

//     } catch (e) {
//         console.error('系统级异常:', e);
//     } finally {
//         isRefreshingAuth = false;
//     }
// }
// async function validateDeviceStatus() {
//     const cacheKey = 'user_plan_cache';
//     const lastRegKey = 'last_device_reg_time';
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
//             // console.log('设备自动退出！')
//             await supabaseClient.auth.signOut();
//             await chrome.storage.local.remove([cacheKey,lastRegKey]);
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

// async function validatePlan() {    // 加载会员计划
//     const cacheKey = 'user_plan_cache';
//     const now = Date.now();
//     const { data: { user } } = await supabaseClient.auth.getUser();
//     if (!user) {
//         await chrome.storage.local.remove(cacheKey);
//         return;
//     }
//     const uid = user.id;
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
//     // 4. 生成防篡改签名
//     const statusStr = isChro ? 'chrome' : 'edge';
//     const signature = await generateSignature(uid, statusStr);  // 在idb-storage中定义的

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
//     // console.log('检查会员是否过期',isChro, isTrial)
// }