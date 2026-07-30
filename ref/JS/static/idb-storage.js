// idb-storage.js
const DB_NAME = 'chromeLocalStorage';
const STORE   = 'kv';
const VERSION = 1;
// 1. 新增：存储监听回调函数的集合
const changeListeners = new Set();

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);   // key = string, value = any
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// 工具：事务包装
function txWrap(mode, fn) {
  return openDB().then(db => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const ret = fn(store);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(ret);
      tx.onerror    = () => reject(tx.error);
    });
  });
}

// 2. 新增：内部通知函数
function notifyChanges(changes) {
  if (Object.keys(changes).length === 0) return;
  // 模拟 chrome.storage.onChanged 的行为
  changeListeners.forEach(cb => {
    try {
      cb(changes, 'local');
    } catch (err) {
      console.log('[idb-storage] Listener error:', err);
    }
  });
}

// 导出对象
const idbStorage = {
    get(keys = null) {
        return txWrap('readonly', store => {
        return new Promise(res => {
            if (keys === null) {                // 读全部
            const all = {};
            store.openCursor().onsuccess = e => {
                const c = e.target.result;
                if (c) { all[c.key] = c.value; c.continue(); }
                else   { res(all); }
            };
            } else {                              // 读指定
            const keyArr = Array.isArray(keys) ? keys : [keys];
            const out = {};
            let left = keyArr.length;
            keyArr.forEach(k => {
                store.get(k).onsuccess = e => {
                out[k] = e.target.result;
                if (--left === 0) res(out);
                };
            });
            }
        });
        });
    },

    set(items) {
        // 3. 修改：写入成功后触发通知
        return txWrap('readwrite', store => {
            Object.entries(items).forEach(([k, v]) => store.put(v, k));
        }).then(() => {
            // 构造 changes 对象
            const changes = {};
            Object.entries(items).forEach(([k, v]) => {
                // 为了性能，这里不读取 oldValue，只提供 newValue
                // background.js 的同步逻辑只需要 newValue 来判断是 '修改' 还是 '删除'
                changes[k] = { newValue: v }; 
            });
            notifyChanges(changes);
        });
    },

    remove(keys) {
        // 4. 修改：删除成功后触发通知
        const keyArr = Array.isArray(keys) ? keys : [keys];
        return txWrap('readwrite', store => {
            keyArr.forEach(k => store.delete(k));
        }).then(() => {
            // 构造 changes 对象
            const changes = {};
            keyArr.forEach(k => {
                // newValue 为 undefined 代表删除
                changes[k] = { newValue: undefined };
            });
            notifyChanges(changes);
        });
    },

    // 5. 修改：改为事件订阅模式，不再轮询
    onChanged: {
        addListener(cb) {
        changeListeners.add(cb);
        },
        removeListener(cb) {
        changeListeners.delete(cb);
        }
    }
};

// 全局暴露
if (typeof module !== 'undefined') module.exports = idbStorage;
else if (typeof window !== 'undefined') window.idbStorage = idbStorage;
else self.idbStorage = idbStorage;

const ChromeStorageAdapter = {
    getItem: (key) => {
        return new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => {
                // 兼容性处理：如果是 JSON 字符串就返回，如果是对象也返回
                // Supabase SDK 内部会尝试 JSON.parse，所以我们最好返回字符串
                const val = result[key];
                if (!val) resolve(null);
                else if (typeof val === 'object') resolve(JSON.stringify(val)); 
                else resolve(val);
            });
        });
    },
    setItem: (key, value) => {
        return new Promise((resolve) => {
            // ⚠️ 强制：不管 SDK 传什么，我们都存为 JSON 字符串
            // 这样能保证硬盘里的数据格式永远是统一的 string
            const valToStore = typeof value === 'string' ? value : JSON.stringify(value);
            chrome.storage.local.set({ [key]: valToStore }, resolve);
        });
    },
    removeItem: (key) => {
        return new Promise((resolve) => chrome.storage.local.remove(key, resolve));
    },
};

/* 如果没有，就生成一个存到本地 */
async function getDeviceId() {
    const key = 'this_device_id';
    const result = await chrome.storage.local.get(key);
    
    if (result[key]) {
        return result[key];
    } else {
        // 生成一个随机ID (简单版UUID)
        const newId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
        await chrome.storage.local.set({ [key]: newId });
        return newId;
    }
}

// #region 会员状态验证====================================================================
const SECRET_KEY_STRING = "Y1ilpz9Rjx_dNBvkrM5Y7E3A3ni_XGdB3Q!@#$"; 
const SUPABASE_URL = 'https://d4orcl0g91htqli3ut90.baseapi.memfiredb.com'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImV4cCI6MzM0MTY2NTYyMCwiaWF0IjoxNzY0ODY1NjIwLCJpc3MiOiJzdXBhYmFzZSJ9.eKAPmmkRcRXA_0mFk22yuN0-cZbqESfEDH74CRdg7Dw'
const PAYMENT_LINK = 'https://xhslink.com/m/6XvDalCai6D '; // 你的面包多商品链接

async function checkProStatusAsync() {
    try {
        const cacheKey = 'user_plan_cache';
        const { [cacheKey]: cachedData } = await chrome.storage.local.get(cacheKey);

        if (!cachedData || !cachedData.uid) {
            return { isPro: false };
        }

        // ★★★ 改动：加上 await 调用 Web Crypto API
        const statusStr = cachedData.isPro ? 'PRO' : 'FREE';
        const isValid = await verifySignature(cachedData.uid, statusStr, cachedData.signature);

        if (isValid && cachedData.isPro) {
            return { isPro: true };
        } else {
            return { isPro: false };
        }

    } catch (e) {
        console.log('Check Error:', e);
        return { isPro: false };
    }
}
/**
 * 辅助：将字符串转为 Uint8Array
 */
function str2buf(str) {
    return new TextEncoder().encode(str);
}

/**
 * 辅助：将 ArrayBuffer 转为 Hex 字符串 (方便存入 Storage)
 */
function buf2hex(buffer) {
    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * 核心：导入密钥 (从字符串生成 CryptoKey 对象)
 */
async function getSecretKey() {
    return crypto.subtle.importKey(
        "raw", 
        str2buf(SECRET_KEY_STRING), 
        { name: "HMAC", hash: "SHA-256" }, 
        false, 
        ["sign", "verify"]
    );
}

/**
 * 🔒 生成签名 (HMAC-SHA256)
 * @param {string} uid 用户ID
 * @param {string} status 状态 (PRO/FREE)
 * @returns {Promise<string>} Hex格式的签名
 */
async function generateSignature(uid, status) {
    const key = await getSecretKey();
    const data = str2buf(`${uid}:${status}`); // 使用冒号分隔防止拼接攻击
    
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        data
    );
    
    return buf2hex(signature);
}

/**
 * 🔓 验证签名
 * @param {string} uid 
 * @param {string} status 
 * @param {string} hexSignature 
 * @returns {Promise<boolean>}
 */
async function verifySignature(uid, status, hexSignature) {
    if (!uid || !status || !hexSignature) return false;

    const key = await getSecretKey();
    const data = str2buf(`${uid}:${status}`);
    
    // 将 Hex 签名转回 ArrayBuffer
    const signatureToCheck = new Uint8Array(
        hexSignature.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    );

    const isValid = await crypto.subtle.verify(
        "HMAC",
        key,
        signatureToCheck,
        data
    );
    
    return isValid;
}


