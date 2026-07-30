// 全局变量，用于存储当前加载的语言数据
let currentLocaleData = {};
let currentLang=null;

// 2. 核心加载函数
async function initI18n(selectedLang) {
    if (!selectedLang) currentLang = await chromeGet('app_lang')  || navigator.language || 'zh-CN';
    else currentLang=selectedLang
    try {
        const folderName = normalizeLocaleForPath(currentLang); // 或者 normalizeLocaleForPath(currentLang)
        
        // 1. 【关键修改】：获取扩展内部的真实绝对路径
        let targetUrl = `/locales/${folderName}/messages.json`;
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            targetUrl = chrome.runtime.getURL(`locales/${folderName}/messages.json`);
        }
        
        const response = await fetch(targetUrl);
        
        if (!response.ok) {
            throw new Error(`无法加载语言包: ${targetUrl}`);
        }
        
        currentLocaleData = await response.json();
    } catch (error) {
        console.warn("加载语言包失败，尝试回退到默认语言 zh_CN", error);
        try {
            // 回退到中文
            let fallbackUrl = `/locales/zh_CN/messages.json`;
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                fallbackUrl = chrome.runtime.getURL(`locales/zh_CN/messages.json`);
            }
            
            const fallbackResponse = await fetch(fallbackUrl);
            currentLocaleData = await fallbackResponse.json();
        } catch (fallbackError) {
            console.error("致命错误：连默认中文包都加载失败！请检查路径。", fallbackError);
        }
    }
}
// 3. 根据路径字符串获取翻译
function getI18nText(path) {
    if (!path) return '';
    const keys = path.split('.');
    let result = currentLocaleData;
    
    for (let key of keys) { // 一层一层解出key
        if (result === undefined || result === null) {
            return path; 
        }
        result = result[key];
    }
    return result || path;
}

// 4. 扫描 DOM 并替换
function renderLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.innerText = getI18nText(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = getI18nText(key);
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = getI18nText(key);
    });
}

/**
 * 标准化语言代码，用于文件路径匹配
 * 将所有的 '-' 统一转为 '_'，确保符合文件夹命名习惯
 */
function normalizeLocaleForPath(lang) {
    if (!lang) return 'zh_CN'; // 默认值
    
    // 1. 将连字符替换为下划线: zh-CN -> zh_CN
    let folder = lang.replace(/-/g, '_');
    
    // 2. 特殊处理：如果只有 'zh'，自动补全为 'zh_CN'
    if (folder === 'zh') return 'zh_CN';
    
    // 3. 特殊处理：如果只有 'en'，通常文件夹可能叫 'en' 或 'en_US'
    // 根据你实际的文件夹名来决定
    if (folder === 'en') return 'en'; 
    
    return folder;
}
window.getI18nText = getI18nText;
chrome.storage.onChanged.addListener( async(changes, namespace) => {
    if (namespace === 'local') {
        if (changes.app_lang){
            console.log('切换语言')
            await initI18n();
            renderLanguage();
        }
    }
});

/**
 * 显示顶部弹窗
 * @param {string} msg - 弹窗显示的文本内容
 * @param {number} duration - 显示时长(毫秒)，默认3000ms
 */
function showTopToast(msg, duration = 1500) {
    // 1. 创建 DOM 元素
    const toast = document.createElement('div');
    toast.innerText = msg;

    // 2. 设置基础样式
    const style = toast.style;
    style.position = 'fixed';
    style.top = '40px';    // 距离顶部 20px
    style.right = '20px';  // 【修改】固定在右侧，距离右边 20px
    // style.left = ...;   // 【删除】不再需要 left 定位
    
    // 【修改】初始状态：向右偏移 50px (或者 100% 自身宽度) 以便从右边滑过来
    style.transform = 'translate(50px, 0)'; 
    
    style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
    style.color = '#fff';
    style.padding = '10px 15px';
    style.borderRadius = '8px';
    style.fontSize = '14px';
    style.fontWeight = '500';
    style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    style.zIndex = '9999';
    style.opacity = '0'; // 初始透明
    // 保持弹性动画，视觉效果更好
    style.transition = 'all 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28)'; 
    style.pointerEvents = 'none';

    // 3. 将元素添加到页面
    document.body.appendChild(toast);

    // 4. 触发入场动画
    requestAnimationFrame(() => {
        setTimeout(() => {
            style.opacity = '1';
            // 【修改】移动到正常位置 (translateX: 0)
            style.transform = 'translate(0, 0)'; 
        }, 10);
    });

    // 5. 设置定时器销毁
    setTimeout(() => {
        // 【修改】离场动画：向右滑出并淡出
        style.opacity = '0';
        style.transform = 'translate(50px, 0)'; 
        
        // 等待 CSS 动画结束后从 DOM 中移除
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 500); 
    }, duration);
}
async function chromeGet(key){
    const result = await chrome.storage.local.get([key]);
    return result[key];
}
