/**
 * 从 background 的 IndexedDB 读取数据
 * @param  {string|string[]} keys  单个 key 或 key 数组；传 null 读整个库
 * @return {Promise<Object>}        返回 { key: value, ... } 结构
 */
function idbGet(keys = null) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'IDB_GET', keys: keys },
        (res) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (res.success) {
              // 如果 keys 是单个值，返回 res.data[keys]
              // 如果 keys 是数组且长度为1，也返回 res.data[keys[0]]
              if (keys !== null && !Array.isArray(keys)) {
                  // console.log('特殊情况',res.data,res.data[keys]);
                  resolve(res.data[keys]);
              } else if (Array.isArray(keys) && keys.length === 1) {
                  resolve(res.data[keys[0]]);
              } else {
                //   console.log('特殊情况',res.data,res.data[keys]);
                  // 其他情况返回完整的 res.data
                  resolve(res.data);
              }
          } else {
              reject(new Error(res.error));
          }
        }
      );
    });
  }
/**
 * 把数据写入 background 的 IndexedDB
 * @param  {Object} data  键值对对象 { key: value, ... }
 * @return {Promise<void>}
 */
function idbSet(data) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
        { action: 'IDB_SET', data },
        (res) => {
            if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
            }
            res.success ? resolve() : reject(new Error(res.error));
        }
        );
    });
}
/**
 * 从 background 的 IndexedDB 删除指定 key
 * @param {string|string[]} keys  单个 key 或 key 数组
 * @return {Promise<void>}
 */
function idbRemove(keys) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
        { action: 'IDB_REMOVE', keys },
        (res) => {
            if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
            res.success ? resolve() : reject(new Error(res.error));
        }
        );
    });
}
const link2 = document.createElement('link');
link2.id = 'Font-awesome-link';
link2.rel = 'stylesheet';
link2.href = chrome.runtime.getURL('libs/css/all.min.css');
document.head.appendChild(link2);


async function checkUIMM0() {
    const response = await chrome.runtime.sendMessage({ action: 'getSelector' });
    if (response && response.isChro === true) {
        return true;
    }else{
        return false;
    }  
}
async function initResetGuard() {
    // 1. 获取当前侧边栏所在的窗口的激活标签页 ID
    // try {
    //     chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    //         console.log('当前标签页 ID:')
    //         if (!tabs || tabs.length === 0) return;

    //         const currentTabId = tabs[0].id;
    //         console.log('当前标签页 ID:', currentTabId);

    //         // 2. 建立长连接
    //         const port = chrome.runtime.connect({ name: 'sidepanel_reset_guard' });

    //         // 3. ★★★ 关键：立即发消息把 tabId 告诉后台
    //         port.postMessage({ tabId: currentTabId });
    //     });
    // }catch(e){
    // }
    // finally{
    //     console.log('重置守卫初始化完成');
    // }
}

let currentWebsite = null;
let currentCfg = null;
let scrollBehavior = 'smooth';
const websiteConfigs = {
    'chat.deepseek.com': {
        webName: 'DeepSeek',
        historyListSelector: 'div.ds-scroll-area',
        historyItemSelector: 'a[href]',
        selector: 'div.ds-message > div:not(.ds-markdown):not([style*="pointer-events"])',//分别是屏蔽深度思考和上传文件
        replySelector:'.ds-message > .ds-markdown',
        copySelector: 'div.ds-flex > div.ds-flex > div:nth-child(1)',
        inputSelector:'#root > div > div > div.c3ecdb44 > div._7780f2e > div > div.ds-virtual-list.ds-virtual-list--printable._2bd7b35 > div._871cbca',
        virtualSelector:'.ds-scroll-area.czx > div.ds-virtual-list > div > div > div',
        calReplyIndex: (index) => {return ~~(index/2)},
        test: () => document.querySelector('#root') && window.location.hostname.includes('chat.deepseek.com'),
        ishomePage: () => location.href==='https://chat.deepseek.com/' || location.pathname === '/',
        startIndex: 0,
        step: 1
    },
    'chatgpt.com': {
        webName: 'ChatGPT',
        historyListSelector: '#history',
        historyItemSelector: 'a[href]',
        selector: 'div[class^="user-message-bubble"]',
        // replySelector:'div[data-message-author-role="assistant"]',
        replySelector:'section[data-turn="assistant"]',
        copySelector: 'div.justify-start > div > button:nth-child(1)',
        calReplyIndex: (index) => {return index},
        test: () => document.querySelector('#thread') && window.location.hostname.includes('chatgpt.com'),
        ishomePage: () => location.href==='https://chatgpt.com/' || location.pathname === '/',
        copyDelay: 100,
        startIndex: 0,
        step: 1
    },
    'www.kimi.com': {
        webName: 'Kimi',
        historyListSelector: 'div.history-part > ul',
        historyItemSelector: 'a[href]',
        selector: 'div.user-content',
        replySelector: '.segment-assistant .segment-content-box',
        copySelector:'.segment-assistant-actions-content div.icon-button:first-of-type',
        inputSelector:'div.chat-action',
        copyDelay: 100,
        calReplyIndex: (index) => {return index},
        test: () => document.querySelector('#app') && window.location.hostname.includes('kimi.com'),
        ishomePage: () => location.href==='https://www.kimi.com/' || location.pathname === '/',
        startIndex: 0,
        step: 1
    },
    'www.doubao.com': {
        webName: '豆包',
        historyListSelector: 'div[data-empty-conversation]',
        historyItemSelector: 'a[href]',
        // selector: 'div[data-testid="message_text_content"]',
        selector: '[data-message-id].flex-row.flex.w-full.justify-end',//'div[data-message-id]',
        replySelector: '[data-message-id] .w-full:not(.justify-end)',//'div[data-message-id]',
        copySelector: 'button[data-testid="message_action_copy"]',
        copyLocationSelector: 'div[data-testid="message_action_bar"]',  // 懒加载，需要滚动到位置才能复制
        inputSelector:'div.flex-col-reverse',
        copyDelay: 200,
        calReplyIndex: (index) => {return index+1},
        test: () => document.querySelector('#chat-route-layout') && window.location.hostname.includes('doubao.com'),
        ishomePage: () => location.href==='https://www.doubao.com/' || location.pathname === '/chat/',
        startIndex: 0,
        step: 1
    },
    'metaso.cn': {
        webName: '秘塔',
        historyListSelector: 'div[class^="LeftMenu_content"]',
        historyItemSelector: 'a[href]',
        selector: '[class*="earch-title_result-title"]',
        copySelector:'[id^="search-content-container"] > div.flex-container > div.flex > button:not(.mr-2\\!)',//可能会拦截click()
        calReplyIndex: (index) => {return index},
        test: () => document.querySelector('#searchRoot') && window.location.hostname.includes('metaso.cn'),
        ishomePage: () => location.href==='https://metaso.cn/' || location.pathname === '/',
        startIndex: 0,
        step: 1
    },
    'gemini.google.com': {
        webName: 'Gemini',
        historyListSelector: 'div.chat-history-list',
        historyItemSelector: 'a[href]',
        selector: '[id^="user-query-content-"] > span',
        replySelector: 'div.markdown-main-panel',
        copySelector:'div.response-container-footer message-actions div > div > copy-button > button',//可能会拦截click()
        inputSelector:'input-container',
        copyDelay: 100,
        calReplyIndex: (index) => {return index},
        test: () => document.querySelector('#user-query-content-0') && window.location.hostname.includes('gemini.google.com'),
        ishomePage: () => location.href==='https://gemini.google.com/app?ref=www.dunling.com' || location.pathname === '/app',
        pathName: '/app',
        startIndex: 0,
        step: 1
    },
    'chatglm.cn': {
        webName: '智谱清言',
        selector: '[id^="row-question-p-"]',
        copySelector:'.shim.copy.canuse.el-tooltip__trigger.el-tooltip__trigger',
        calReplyIndex: (index) => {return index*2},
        test: () => document.querySelector('#row-question-p-0') && window.location.hostname.includes('chatglm.cn'),
        ishomePage: () => location.href==='https://chatglm.cn/main/alltoolsdetail?lang=zh' || location.pathname === '/main/alltoolsdetail',
        startIndex: 0,
        step: 1
    },
    'chat.z.ai': {
        webName: '智谱',
        selector: 'div.chat-user>div>div:nth-child(1)>div',
        copySelector:'div[id^="message-"] > div>div>div:nth-child(2)>div:nth-child(1)>button',
        calReplyIndex: (index) => {return index},
        test: () => window.location.hostname.includes('chat.z.ai'),
        ishomePage: () => location.href==='https://chat.z.ai/' || location.pathname === '/',
        startIndex: 0,
        step: 1
    },
    'grok.com': {
        webName: 'Grok',
        historyListSelector: 'div.scrollbar-gutter-stable-single > div:nth-child(7)',
        historyItemSelector: 'a[href]',
        selector: 'div[id^="response"]>div:nth-child(1)',
        copySelector:'button[aria-label="Copy"]',
        replySelector: 'div.response-content-markdown',
        calReplyIndex: (index) => {return index+1},
        test: () => document.querySelector('[id^="response-"]') && window.location.hostname.includes('grok.com'),
        ishomePage: () => location.href==='https://grok.com/' || location.pathname === '/',
        startIndex: 0,
        step: 2
    },
    'www.wenxiaobai.com': {
        webName: '问小白',
        historyListSelector: '#history-container-ID',
        historyItemSelector: 'div[data-conversation-id]',
        selector: 'div[class^="Question_question_container"]>div:nth-child(1)',
        copySelector:'div[class^="Answser_answer_right_content"] [data-sentry-component="ChatBottomButton"]',
        calReplyIndex: (index) => {return 5*index+2},
        test: () => document.querySelector('#chat_turn_container') && window.location.hostname.includes('www.wenxiaobai.com'),
        ishomePage: () => location.href==='https://www.wenxiaobai.com/' || location.pathname === '/',
        startIndex: 0,
        step: 1,
        reverseOrder:true
    },
    'yiyan.baidu.com': {
        webName: '文心一言',
        historyListSelector: 'div.newHistorySessionListWrapper',
        historyItemSelector: 'div[class^="sessionItemCardSideBar"]',
        selector: '#question_text_id',
        copySelector:'div[class^="copy__"]',
        calReplyIndex: (index) => {return index},
        test: () => document.querySelector('#question_text_id') && window.location.hostname.includes('yiyan.baidu.com'),
        ishomePage: () => location.href==='https://yiyan.baidu.com/' || location.pathname === '/',
        reverseOrder: true,
        startIndex: 0,
        step: 1
    },
    //=========================================================================
    'yuanbao.tencent.com': {
        webName: '腾讯元宝',
        historyListSelector: 'div.yb-recent-conv-list',
        historyItemSelector: 'div[data-item-id]',
        selector: '.agent-chat__list__item--human .agent-chat__bubble__content',
        copySelector:'div.agent-chat__toolbar__right > div.agent-chat__toolbar__item > div.agent-chat__toolbar__copy__icon',
        replySelector:'.agent-chat__list__item--ai .hyc-common-markdown:not(.hyc-common-markdown-style-cot)',
        copyDelay: 150,
        calReplyIndex: (index) => {return index},
        test: () => document.querySelector('#chat-content') && window.location.hostname.includes('yuanbao.tencent.com'),
        ishomePage: () => location.href==='https://yuanbao.tencent.com/chat/naQivTmsDa?yb_channel=3009&yb_dl=js' || location.pathname === '/chat/naQivTmsDa',
        startIndex: 0,
        step: 1
    },
    
    'www.qianwen.com': {
        webName: '千问',
        selector: 'div[class^="contentBox"]>div[class^="bubble"]',
        // historyListSelector: 'div.sider-scrollbar',
        copySelector:'div[class="flex items-center justify-center"]',
        replySelector:'.tongyi-markdown',
        calReplyIndex: (index) => {return index},
        test: () => document.querySelector('#tongyi-content-wrapper') && window.location.hostname.includes('qianwen.com'),
        ishomePage: () => location.href==='https://www.qianwen.com/' || location.pathname === '/',
        startIndex: 0,
        step: 1
    },

    'aistudio.google.com': {
        webName: 'AIstudio',
        historyListSelector: '.mat-expansion-panel-content-wrapper',
        historyItemSelector: 'a[href]',
        textSelector: '[id^="scrollbar-item-"]',
        selector: 'ms-chat-turn',
        copySelector:'.actions-container > * > *:nth-child(3) button.ms-button-borderless[aria-label="Open options"]',
        copyAll:true,
        test: () => window.location.hostname.includes('aistudio.google.com'),
        ishomePage: () => location.href==='https://aistudio.google.com/app/prompts/new_chat' || location.pathname === '/app/prompts/new_chat',
        useQuerySelectorAll: true,
    },

    'PreviewHtml': {
        webName: 'PreviewHtml',
        selector: 'div.question-area',
        replySelector:'.answer-area',
        calReplyIndex: (index) => {return index},
        test: () => window.location.href.includes('preview.html'),
        ishomePage: () => false,
        startIndex: 0,
        step: 1
    },
    'MindMapHtml': {
        webName: 'MindMapHtml',
        selector: '.card-header',
        calReplyIndex: (index) => {return index},
        test: () => window.location.href.includes('MindMap.html'),
        ishomePage: () => false,
        startIndex: 0,
        step: 1
    }
};
if (window.location.href.includes('preview.html')){
    currentWebsite='PreviewHtml';
    currentCfg=websiteConfigs[currentWebsite];
}else if (window.location.href.includes('MindMap.html')){
    currentWebsite='MindMapHtml';
    currentCfg=websiteConfigs[currentWebsite];
}else{
    currentCfg=websiteConfigs[window.location.hostname];
    currentWebsite=currentCfg.webName;
}

// #region 宽度配置
// let currentWeb = null;
let currentUtilCfg = null;
let widthSelector = null;
let defaultWidth = null;
let widthProperty = null;
let control_leaveTimer = null;  // 鼠标离开预览框定时器
const WIDTH_CONFIG_KEY = 'currentUtilCfg';
let currentWidthRatio = null;
let savedWidth = {};
let colorV=1;

// 滑动条配置


const webUtilConfigs = {
    'DeepSeek': {
        selector: ':root',
        sideSelector: ['#root > div > div > div > div:nth-child(1) > div:nth-child(1)'],
        codeSelector:'pre',
        test: () => window.location.hostname.includes('chat.deepseek.com'),
        widthProperty: '--message-list-max-width',
        defaultWidth: 840,
        offsetTop: 0
        
    },
    'ChatGPT': {
        selector: 'div[class*="convSearchResultHighlightRoot"] section > div > div',
        // sideSelector: ['#stage-slideover-sidebar','#stage-slideover-sidebar nav'],
        // codeSelector:'code[class^="language-"]',
        test: () => window.location.hostname.includes('chatgpt.com'),
        widthProperty: 'min-width',
        defaultWidth: 768,
        offsetTop: 0
    },
    'Kimi': {
        selector: 'div.chat-content-container > div',
        sideSelector: ['#app > div > div > div.sidebar-placeholder.not-mobile.mobile-fold > aside'],
        codeSelector:'code[class^="language-"]',
        // promptSelector:'div.chat-editor',
        test: () => window.location.hostname.includes('kimi.com'),
        widthProperty: 'max-width',
        defaultWidth: 900,
        offsetTop: 0
    },
    '豆包': {
        selector: 'div[data-observe-row] > div > div > div',
        sideSelector: ['#chat-route-layout > div > nav','#flow_chat_sidebar'],
        codeSelector:'pre code',
        test: () => window.location.hostname.includes('doubao.com'),
        widthProperty: 'max-width',
        defaultWidth: 800,
        offsetTop: 0
    },
    'Gemini':{
        selector:'.conversation-container',
        selector1: '.conversation-container .ng-star-inserted',
        sideSelector:['#app-root > main > side-navigation-v2 > bard-sidenav-container > bard-sidenav'],
        codeSelector:'pre code',
        test: () => window.location.hostname.includes('gemini.google.com'),
        widthProperty: 'max-width',
        defaultWidth: 760,
        offsetTop: 16
    },
    '智谱清言':{
        selector:'div.answer',
        codeSelector:'pre code',
        test: () => window.location.hostname.includes('chatglm.cn'),
        widthProperty: 'max-width',
        defaultWidth: 800,
        offsetTop: 0
    },
    '智谱':{
        selector:'div.flex.group',
        test: () => window.location.hostname.includes('chat.z.ai'),
        widthProperty: 'max-width',
        defaultWidth: 1000,
    },
    'Grok':{
        selector:'div[id^="response"]',
        sideSelector:['div[data-variant="sidebar"]','div[data-sidebar="sidebar"]'],
        codeSelector:'pre code',
        test: () => window.location.hostname.includes('grok.com'),
        widthProperty: 'min-width',
        defaultWidth: 768,
        offsetTop: 0
    },
    
    '问小白': {
        selector: 'div[class^="TurnCard_turn_container_inner"]',
        sideSelector:['div[class^="layout_left"]','div[class^="layout_left"] > div[class^="page_container"] '],
        test: () => window.location.hostname.includes('wenxiaobai.com'),
        widthProperty: 'max-width',
        defaultWidth: 832,
    },
    '秘塔': {
        selector: 'div[class*="MuiStack-root"][class*="Search_search-result"]',
        selector1: 'div[class^="Search_search-result"]',
        test: () => window.location.hostname.includes('metaso.cn'),
        widthProperty: 'min-width',
        defaultWidth: 662,
    },
    '文心一言': {
        selector: 'div[class^="dialogue_card_item"]>div',
        test: () => window.location.hostname.includes('yiyan.baidu.com'),
        widthProperty: 'max-width',
        defaultWidth: 780,
    },
    '通义': {
        selector: '.contentWrapper-IwOW4q > div',
        codeSelector:'pre code',
        test: () => window.location.hostname.includes('tongyi.com'),
        widthProperty: 'max-width',
        defaultWidth: 896,
        offsetTop: 0
    },
    '千问': {
        selector: 'div[class*="scrollOutWrapper"]',
        test: () => window.location.hostname.includes('www.qianwen.com'),
        widthProperty: 'max-width',
        defaultWidth: 896,
    },
    '腾讯元宝': {
        selector: '.agent-chat__list__content > div > div',
        sideSelector:['div.yb-nav__content-wrapper'],
        // codeSelector:'code[class^="language"]',
        test: () => window.location.hostname.includes('yuanbao.tencent.com'),
        widthProperty: 'max-width',
        defaultWidth: 960,
        offsetTop: 18,
    },

    'AIstudio': {
        selector:'.chat-session-content',
        sideSelector:['div.nav-content'],
        // codeSelector:'pre',
        test: () => window.location.hostname.includes('aistudio.google.com'),
        widthProperty: 'max-width',
        defaultWidth: 1000,
        // offsetTop: 1,
    },
    'PreviewHtml': {
        selector: '.markdown-container',
        test: () => window.location.href.includes('preview.html'),
        widthProperty: 'max-width',
        defaultWidth: 1000,
    },
};

// 1. 定义默认配置 (必须与 popup.js 中的默认值保持一致)
const DEFAULT_SETTINGS = {
    enableAssisFav: true,
    enableMdToc: true,
    enableScrollSmooth: true,
    showLineNumbers: true,
    enableMarkerFeature: true,
    showMarkers: true,
    enableFormulaCopy: true,
    enableAutoCollapse: true,
    collapseThreshold: 200,
    colorSaturation: 1,

    enableCustomExportName: false,
    exportUserName: 'User',
    exportAiName: 'AI',
};
// 当前的配置对象
let currentSettings = { ...DEFAULT_SETTINGS };
let yiFufei=false;
// 异步加载存储数据
(async function() {
    if (currentWebsite==='MindMapHtml') return;
    await loadSettingsFromStorage();
    initStorageChangeListener();
    // scrollBehavior=
    const result= await chrome.storage.local.get([WIDTH_CONFIG_KEY])||{};
    savedWidth = result[WIDTH_CONFIG_KEY] || {};
    // 如果存储为空，初始化默认值
    if (savedWidth===null) {
        chrome.storage.local.set({[WIDTH_CONFIG_KEY]: {}});
    }
    // 在数据加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded',async ()=>{
            await initUtils();
        });
    } else {
        await initUtils();
    }
})();

async function initUtils() {
    yiFufei=await checkUIMM0();
    init_width_control();
    initFormulaCopy();
    initHighlight();
    initResetGuard();
    setTimeout(initLineNumber, 200);
}
function loadSettingsFromStorage() {
    return new Promise((resolve) => {
        chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
            // 更新全局变量
            currentSettings = items;
            // 解决 Promise，通知调用者加载完毕
            resolve(items);
        });
    });
}
function initStorageChangeListener() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            for (let key in changes) {
                if (key in currentSettings) {
                    currentSettings[key] = changes[key].newValue;
                    // 这里可以添加逻辑，当配置变动时实时刷新页面状态
                    // 例如: updateUI(key, changes[key].newValue);
                    if (key==='enableAssisFav' && yiFufei) {
                        if (currentSettings.enableAssisFav) {
                            if(currentCfg.historyListSelector) {
                                bookmarkManager.mountToContainer(currentCfg.historyListSelector);
                            }
                        }else{
                            document.querySelector('.bookmark-manager-container.embedded-view')?.remove();
                        }
                    }
                    if (key==='showLineNumbers') {
                        if (currentSettings.showLineNumbers) {
                            initLineNumber();
                        }else{
                            hideLineNumbers();
                        }
                    }
                }
            }
            // console.log("配置已更新:", currentSettings);
        }
    });
}
async function init_width_control() {
    currentUtilCfg = webUtilConfigs[currentWebsite];
    widthSelector = currentUtilCfg.selector;
    widthProperty = currentUtilCfg.widthProperty;
    defaultWidth = currentUtilCfg.defaultWidth;
    currentWidthRatio = savedWidth[currentWebsite] || 1;
    // if (currentUtilCfg.sideSelector){       // 一般侧边栏先加载出来
    //     await waitForElement(currentUtilCfg.sideSelector)
    //     enableSidebarResizer(currentUtilCfg.sideSelector);
    // }
    if (!currentCfg.ishomePage()) {
        await waitForElement(widthSelector)
        controlWidth(Number(currentWidthRatio));
        if (currentSettings.enableMarkerFeature && yiFufei) HighlightManager.switchPage(location.href);
    }
    
}

function checkWidthInit(max = 500) {
    if (currentCfg.ishomePage() || currentWebsite==='MindMapHtml') {
        if (currentSettings.enableMarkerFeature && yiFufei) HighlightManager.switchPage(location.href);
        return
    };
    checkWidthInit.retry = (checkWidthInit.retry || 0) + 1;
    const chatContentContainers = document.querySelectorAll(widthSelector);
    if (chatContentContainers.length > 0) {
        checkWidthInit.retry = 0;            // 成功后重置
        controlWidth(Number(currentWidthRatio));
        if (currentSettings.enableMarkerFeature && yiFufei) HighlightManager.switchPage(location.href);
        return;
    }
    if (checkWidthInit.retry >= max) {
        checkWidthInit.retry = 0;            // 防内存泄漏
        console.log('递归检测失败：已达最大重试次数', max);
        return;
    }
    setTimeout(() => checkWidthInit(max), 10);
}
/**
 * 等待元素加载完成 (Promise 版本)
 * @param {string} selector - CSS 选择器
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise} - 找到元素 resolve，超时 reject
 */
function waitForElement(selector, maxRetries = 800) {
    return new Promise((resolve, reject) => {
        // 🛑 核心修改：如果是 iframe，直接忽略，不执行查找，也不报错
        if (window.self !== window.top) {
            // console.log('忽略 iframe 环境:', window.location.href); 
            // 保持 Promise 永远 pending 或者直接 resolve null，防止抛出超时错误干扰视线
            return; 
        }

        let retryCount = 0;
        const check = () => {
             const elements = document.querySelectorAll(selector);
             if (elements.length > 0) {
                //  console.log(`✅ [主页面] 成功找到元素: ${selector}, 数量: ${elements.length}`);
                 resolve(elements); 
                 return;
             }

             retryCount++;
             if (retryCount >= maxRetries) {
                //  console.log(`❌ [主页面] 超时未找到: ${selector}`);
                //  reject(new Error('Timeout finding element')); 
                 return;
             }

             setTimeout(check, 10);
         };

        //  console.log('🚀 [主页面] 开始寻找元素...');
         check();
    });
}
function controlWidth(ratio) {
    // console.log('调整宽度比例为:', ratio);
    currentWidthRatio = ratio;
    clearTimeout(control_leaveTimer);
    const animationDuration = '0.3s';
    const chatContentContainers = document.querySelectorAll(widthSelector);
    chatContentContainers.forEach(container => {
        container.style.transition = `width ${animationDuration} ease`;
        container.style.setProperty(widthProperty, `${defaultWidth*ratio}px`);
    });
    if (currentUtilCfg.selector1) {
        document.querySelectorAll(currentUtilCfg.selector1).forEach(container => {
            container.style.transition = `width ${animationDuration} ease`;
            container.style.setProperty(widthProperty, `${defaultWidth*ratio}px`);
        })
    }
    control_leaveTimer = setTimeout(() => { 
        savedWidth[currentWebsite] = ratio;
        chrome.storage.local.set({[WIDTH_CONFIG_KEY]:savedWidth});
        // console.log('✅ 宽度配置已保存:', savedWidth); // 添加日志确认保存
    }, 3000); 
}

/**
 * 通用元素检测与执行函数
 * @param {string} selector - 要检测的 CSS 选择器
 * @param {function} callback - 检测成功后要执行的函数
 * @param {number} maxRetries - 最大重试次数 (默认 500)
 * @param {number} interval - 每次检测的间隔毫秒 (默认 10ms)
 */
function ensureElementReady(selector, callback, maxRetries = 500, interval = 10) {
    let retryCount = 0; // 使用局部变量，避免全局污染
    const check = () => {
        retryCount++;
        const elements = document.querySelectorAll(selector);
        
        // 1. 检测成功
        if (elements.length > 0) {
            // 这里可以直接调用回调函数
            // 甚至可以将找到的 elements 传给回调，方便后续使用
            callback(elements); 
            return;
        }

        // 2. 达到最大重试次数，停止
        if (retryCount >= maxRetries) {
            console.log(`[超时] 未找到元素: "${selector}"，已重试 ${maxRetries} 次`);
            return;
        }

        // 3. 继续递归检测
        setTimeout(check, interval);
    };

    // 启动检测
    check();
}

// ==================================================================================
// #region行号添加 (无侵入伪元素版)
// ==================================================================================
function initLineNumber() {
    const offsetTop = webUtilConfigs[currentWebsite]?.offsetTop || 0;
    const style = document.createElement('style');
    style.id = 'line-number-style';
    style.innerHTML = `
        /* 强制代码块容器开启滚动，并限制宽度 */
        pre {
            overflow-x: auto !important; 
            overflow-y: hidden !important; 
            height: auto !important;
            max-height: none !important;
            min-height: auto !important;
            white-space: pre !important; 
            word-wrap: normal !important;
            position: relative !important;
            padding-left: 3.5em !important; 
            box-sizing: border-box !important; 
        }
        
        pre code {
            display: inline-block !important; 
            white-space: pre !important;
            min-width: 100%;
            box-sizing: border-box !important;
        }

        /* 🌟 核心魔法：使用伪元素渲染行号，避免任何 DOM 污染 🌟 */
        pre::before {
            content: attr(data-line-numbers); /* 直接读取 JS 注入的多行字符串 */
            position: absolute; 
            left: 0;
            top: 0;
            width: 3em;
            height: 100%; 
            margin-top: ${offsetTop}px;
            background-color: rgba(246, 248, 250, 0); 
            border-right: 2px solid rgba(153, 153, 153, 0.24);
            color: #999;
            text-align: right;
            padding-right: 5px;
            box-sizing: border-box;
            z-index: 10; 
            pointer-events: none; 
            user-select: none;  
            
            /* 允许换行符渲染 */
            white-space: pre !important;

            /* 使用 CSS 变量实时同步代码块的字体与间距 */
            font-family: var(--code-font-family, inherit) !important;
            font-size: var(--code-font-size, inherit) !important;
            line-height: var(--code-line-height, inherit) !important;
            padding-top: var(--code-padding-top, inherit) !important;
        }

        /* 暗色模式适配 */
        @media (prefers-color-scheme: dark) {
            pre::before {
                background-color: rgba(45, 45, 45, 0); 
                color: #666;
            }
        }
    `;

    if (!currentSettings.showLineNumbers) return;
    if (!webUtilConfigs[currentWebsite] || !webUtilConfigs[currentWebsite].codeSelector) return;
    const selector = webUtilConfigs[currentWebsite].codeSelector;

    document.head.appendChild(style);

    function updateLineNumbers(selector) {
        document.querySelectorAll(selector).forEach(block => {
            if (!block.textContent) return;

            const container = (block.tagName === 'CODE' && block.parentElement.tagName === 'PRE') 
                              ? block.parentElement 
                              : block;
            
            // 1. 同步字体与内边距样式到 CSS 变量
            // 这样做是因为 ::before 默认继承 pre 的样式，但有时候代码字体大小定义在 code 上
            const codeEl = container.querySelector('code') || container;
            const codeStyle = window.getComputedStyle(codeEl);
            const preStyle = window.getComputedStyle(container);
            
            container.style.setProperty('--code-font-family', codeStyle.fontFamily);
            container.style.setProperty('--code-font-size', codeStyle.fontSize);
            container.style.setProperty('--code-line-height', codeStyle.lineHeight);
            container.style.setProperty('--code-padding-top', preStyle.paddingTop);

            // 2. 计算纯文本行数
            let text = block.textContent;
            if (text.endsWith('\n')) text = text.slice(0, -1);
            const lineCount = text.length > 0 ? text.split('\n').length : 0;

            // 3. 构建多行字符串并通过 attribute 注入
            const prevCount = parseInt(container.getAttribute('data-line-count') || '0', 10);
            if (lineCount !== prevCount) {
                // 利用 Array 快速生成 "1\n2\n3..." 这种带换行符的字符串
                const lineNumbersStr = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
                
                container.setAttribute('data-line-numbers', lineNumbersStr); // 伪元素会直接读取这个
                container.setAttribute('data-line-count', lineCount);        // 缓存比对，防抖
            }
        });
    }

    let frameRequest = null;
    window.__lineNumberObserver = new MutationObserver(() => {
        // 因为我们不再生成真实的 DOM，所以甚至不需要写 isSelf 的过滤逻辑了！
        if (frameRequest) cancelAnimationFrame(frameRequest);
        frameRequest = requestAnimationFrame(() => updateLineNumbers(selector));
    });

    window.__lineNumberObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
    
    updateLineNumbers(selector);
}


function hideLineNumbers() {
    // 1. 停止监听 DOM 变化 (非常重要，防止 AI 正在输出时又把行号加回来)
    // 注意：你需要将 initLineNumber 中的 observer 暴露给全局，例如赋值给 window.__lineNumberObserver
    if (window.__lineNumberObserver) {
        window.__lineNumberObserver.disconnect();
        window.__lineNumberObserver = null; 
    }

    // 2. 移除所有 pre 标签上的行号数据属性
    document.querySelectorAll('pre[data-line-numbers]').forEach(pre => {
        // 移除伪元素读取的内容，伪元素会瞬间消失或清空
        pre.removeAttribute('data-line-numbers');
        pre.removeAttribute('data-line-count');
        
        // 顺手清理掉之前注入的 CSS 变量，保持 DOM 洁癖
        pre.style.removeProperty('--code-font-family');
        pre.style.removeProperty('--code-font-size');
        pre.style.removeProperty('--code-line-height');
        pre.style.removeProperty('--code-padding-top');
    });

    // 3. (可选) 移除注入的 CSS 样式表
    // 如果你在 initLineNumber 里给 style 标签加了 id，比如 style.id = 'line-number-style';
    const injectedStyle = document.getElementById('line-number-style');
    if (injectedStyle) {
        injectedStyle.remove();
    }
    
    // console.log('✅ 行号已彻底隐藏/清理完毕！');
}


// ===================================================================================
// #region公式复制
// ===================================================================================
const PROCESSED   = 'data-copy-enabled';
const LATEX_SEL   = '.katex-mathml annotation[encoding="application/x-tex"]';
const HTML_SEL    = 'span.katex-html[aria-hidden="true"]';
const HOVER_BG    = 'rgba(60, 86, 99, 0.14)';
const TRANSITION  = 'background-color .2s ease';
const isKimi = window.location.hostname.includes('kimi.com');
const isDoubao=window.location.hostname.includes('doubao.com');
const isGemini=window.location.hostname.includes('gemini.google.com');
const isQwen=window.location.hostname.includes('qianwen.com');
const isYuanbao=window.location.hostname.includes('yuanbao.tencent.com');


/* ----- 复制策略 ----- */
async function copyFormula(katexEl) {

    let latex = '';
    try {
        if (isKimi||isQwen||isYuanbao) {
            return; // Kimi 的复制逻辑在外部处理
        } else if(isGemini){
            latex = katexEl.dataset.math || '';
        }
        else if(isDoubao){
            latex = katexEl.getAttribute('copy-text') || '';
        }
        else {
            const anno = katexEl.querySelector(LATEX_SEL);
            latex = anno.textContent.trim();
        }
        await navigator.clipboard.writeText(latex);
        showTopToast('✅ 公式已复制');
    } catch (e) {
        showTopToast('❌复制失败：' + e.message);
    }
}

/* -----  enrich  ----- */
function enrichKatex(k) {
    if (k.hasAttribute(PROCESSED)) return;
    k.setAttribute(PROCESSED, '1');
    k.style.transition = TRANSITION;
    k.addEventListener('mouseenter', () => k.style.backgroundColor = HOVER_BG);
    k.addEventListener('mouseleave', () => k.style.backgroundColor = '');
    k.style.cursor = 'pointer';
    k.style.userSelect = 'none';
    k.style.padding = '5px';
    k.style.borderRadius = '5px';
    k.title = '点击复制';
    k.addEventListener('click', () => copyFormula(k));
}

/* ----- 动态监听 ----- */
// 选择所有 class 为 katex，但还没有 data-copy-enabled 属性的元素。
function initFormulaCopy() {
    if(location.href.includes('preview.html')||location.href.includes('MindMap.html')||
    !currentSettings.enableFormulaCopy) return;
    const bindKatex = () => {
        if (isDoubao) {
            document.querySelectorAll(`.math-inline:not([${PROCESSED}])`).forEach(enrichKatex);
        }else if(isGemini){
            document.querySelectorAll('.math-block:not([' + PROCESSED + '])').forEach(enrichKatex);
            document.querySelectorAll('.math-inline:not([' + PROCESSED + '])').forEach(enrichKatex);
        }
        else{
            document.querySelectorAll('.katex:not([' + PROCESSED + '])').forEach(enrichKatex);
        }
    }
    const ob = new MutationObserver(bindKatex);
    ob.observe(document.body, { childList: true, subtree: true });
    bindKatex();
    if(isKimi){
        // setTimeout(() => {
        //     const KimiMessageBox=document.querySelector("body > div.message-list-container.top")
        //     if (KimiMessageBox) KimiMessageBox.remove();//console.log('[katex-copy] 已移除 Kimi 消息列表遮挡层');
        // }, 2000);
        document.addEventListener('click', async(e) => {
            // 如果点击的是背景，且鼠标几乎没动过 (防止选中文本或拖拽时误触关闭)
            if (e.target.closest('.katex')){
                const targetKatexEl = e.target.closest('.katex');
                const replyContent = e.target.closest('.chat-content-item.chat-content-item-assistant');
                const copyBtn = replyContent.querySelector('.segment-assistant-actions > div > div:first-child');
                const katexEls = replyContent.querySelectorAll('.katex');
                const index = Array.from(katexEls).findIndex(element => element === targetKatexEl);
                // console.log('点击了第', index, '个公式');
                if (copyBtn) {
                    copyBtn.click(); // 触发复制按钮的点击事件
                    await new Promise(r => setTimeout(r, 100));
                    let text=await navigator.clipboard.readText();
                    text= convertLatexDelimiters(text);
                    const latex = getLatexByIndex(text, index);
                    await navigator.clipboard.writeText(latex);
                    showTopToast('✅ 公式已复制');
                }
            }
        },true);
    }else if(isQwen){
        document.addEventListener('click', async(e) => {
            // 如果点击的是背景，且鼠标几乎没动过 (防止选中文本或拖拽时误触关闭)
            if (e.target.closest('.katex')){
                const targetKatexEl = e.target.closest('.katex');
                const replyContent = e.target.closest('div[class^="answerItem"]');
                const copyBtn = replyContent.querySelector('div[class^="leftArea"] > div:nth-child(1) > div > div');
                const katexEls = replyContent.querySelectorAll('.katex');
                const index = Array.from(katexEls).findIndex(element => element === targetKatexEl);
                // console.log('点击了第', index, '个公式');
                if (copyBtn) {
                    copyBtn.click(); // 触发复制按钮的点击事件
                    // document.querySelector('div[role="alert-toast"]').remove();
                    await new Promise(r => setTimeout(r, 100));
                    let text=await navigator.clipboard.readText();
                    text= convertLatexDelimiters(text);
                    const latex = getLatexByIndex(text, index);
                    await navigator.clipboard.writeText(latex);
                    showTopToast('✅ 公式已复制');
                }
            }
        },true);
    }else if(isYuanbao){
        document.addEventListener('click', async(e) => {
            // 如果点击的是背景，且鼠标几乎没动过 (防止选中文本或拖拽时误触关闭)
            if (e.target.closest('.katex')){
                const targetKatexEl = e.target.closest('.katex');
                const replyContent = e.target.closest('.agent-chat__list__item__content');
                const copyBtn = replyContent.querySelector('.agent-chat__toolbar__copy__arrow-container');
                const katexEls = replyContent.querySelectorAll('.katex');
                const index = Array.from(katexEls).findIndex(element => element === targetKatexEl);
                if (copyBtn) {
                    copyBtn.click(); // 触发复制按钮的点击事件
                    await new Promise(r => setTimeout(r, 100));
                    const copyBtn1=document.querySelector('div.agent-chat__toolbar__copy__menu > div > div:nth-child(2) > li');
                    copyBtn1.click();
                    await new Promise(r => setTimeout(r, 250));     // 这里要给够时间，不然读出来是null
                    let text=await navigator.clipboard.readText();
                    text= convertLatexDelimiters(text);
                    console.log('复制的文本',text);
                    const latex = getLatexByIndex(text, index);
                    console.log('提取的公式',latex);
                    await new Promise(r => setTimeout(r, 200));
                    await navigator.clipboard.writeText(latex);
                    showTopToast(`✅ 公式已复制`);
                }
            }
        },true);
    }
}


/**
 * 提取文本中第 index 个被 $$ 或 $ 包裹的 Latex 代码
 * 
 * @param {string} text - 输入的文本内容
 * @param {number} index - 目标索引（从 0 开始）
 * @returns {string|null} - 返回 Latex 内容（不包含外层的 $），如果未找到或越界返回 null
 */
function getLatexByIndex(text, index) {
    if (typeof text !== 'string' || index < 0) {
        return null;
    }

    /**
     * 正则表达式详解：
     * 1. (?<!\\)       : 负向回顾断言，确保 $ 前面不是反斜杠 \ (处理转义)
     * 2. \$\$          : 匹配字面量 $$
     * 3. ([\s\S]*?)    : 捕获组1，非贪婪匹配任意字符（包含换行），直到遇到结束符
     * 4. \$\$          : 匹配结束的 $$
     * 5. |             : 或者
     * 6. \$            : 匹配字面量 $
     * 7. ([\s\S]*?)    : 捕获组2，非贪婪匹配任意字符
     * 8. \$            : 匹配结束的 $
     * 
     * 注意：必须先匹配 $$，后匹配 $，否则 $$ 会被识别为两个 $
     */
    const regex = /(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$|(?<!\\)\$([\s\S]*?)(?<!\\)\$/g;

    let currentMatch;
    let count = 0;

    // 循环查找匹配项
    while ((currentMatch = regex.exec(text)) !== null) {
        if (count === index) {
            // match[1] 对应 $$...$$ 的内容
            // match[2] 对应 $...$ 的内容
            // 只需要返回非 undefined 的那个即可
            return currentMatch[1] !== undefined ? currentMatch[1] : currentMatch[2];
        }
        count++;
    }

    // 如果循环结束还没找到对应 index，说明越界
    return null;
}



// #region 书签拖拽
// --- 1. 样式注入  ---
const style = document.createElement('style');
style.textContent = `
    /* ================= 基础样式 (亮色模式) ================= */
    /* --- 新增：高亮元素悬停效果 --- */
    [data-highlighted="true"] {
        transition: 
            background-color 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), 
            filter 0.2s ease, 
            box-shadow 0.4s ease;
        border-radius: 5px;
    }
    
    [data-highlighted="true"]:hover {
        filter: brightness(0.92) contrast(1.1);
    }

    /* --- 选色/删除菜单 --- */
    .hl-color-bubble {
        position: absolute; z-index: 2147483647; 
        background: #fff; border: 1px solid rgba(0,0,0,0.08);
        border-radius: 8px; padding: 6px 10px;
        filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); 
        display: none; gap: 8px; align-items: center;
        transform: translate(-50%, -100%); margin-top: -14px;
        font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1; color: #333; 
        user-select: none;
        pointer-events: auto; /* 菜单必须可点击 */
    }
    .hl-color-bubble.visible { display: flex; }
    .hl-color-bubble::after {
        content: ''; position: absolute; top: 100%; left: 50%; margin-left: -6px;
        border-width: 6px 6px 0; border-style: solid; 
        border-color: #fff transparent transparent transparent; 
    }
    .hl-color-swatch {
        width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
        border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
        transition: transform 0.1s;
    }
    .hl-color-swatch:hover { transform: scale(1.2); z-index: 2; }

    .hl-trash-icon {
        border-radius: 5px;font-size: 20px;
        width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
        cursor: pointer; color: #888; transition: all 0.2s;
    }
    .hl-trash-icon:hover { 
        transform: scale(1.2); 
        color: #ef4444;
        background-color: rgba(239, 68, 68, 0.2);
    }
    .hl-color-swatch:active, 
    .hl-trash-icon:active { transform: scale(1.1); }
    .hl-trash-icon i{font-style: normal !important;}


    
    /* --- 书签总容器 --- */
    #hl-bookmark-container {
        position: fixed; top: 0; right: 0; bottom: 0; width: 0; 
        z-index: 2147483645; overflow: visible; pointer-events: none; 
    }

    /* --- 单个书签 Wrapper --- */
    .hl-bookmark-wrapper {
        position: absolute; right: 0; height: 30px; 
        display: flex; align-items: center; justify-content: flex-end; 
        padding-right: 4px; 
        
        /* 【核心修改 1】让 wrapper 本身不响应鼠标，鼠标会穿透它 */
        pointer-events: none; 
        
        cursor: pointer;
        transform: translateY(-50%); 
        background: transparent; padding-left: 30px; 
    }

    /* --- 书签圆点 (直径15px) --- */
    .hl-bookmark-dot {
        width: 15px; height: 15px; border-radius: 50%;
        border: 1.5px solid rgba(50, 50, 50, 0.75); 
        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        flex-shrink: 0; transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
        box-sizing: border-box;
        user-select: none;
        z-index: 100000;
        
        /* 【核心修改 2】让圆点单独恢复响应鼠标，这样只有碰到圆点才算 hover */
        pointer-events: auto; 
    }
    .hl-bookmark-wrapper:hover .hl-bookmark-dot {
        transform: scale(1.4); border-color: #333; z-index: 10;
    }
    .hl-bookmark-wrapper:active .hl-bookmark-dot {
        transform: scale(1.1);
    }

    /* --- 书签内容气泡 --- */
    .hl-tooltip {
        background: #fff; color: #333;
        padding: 6px 10px; border-radius: 6px;
        font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4;
        
        /* 布局定位 */
        margin-right: 14px; opacity: 0; visibility: hidden;
        transform: translateX(-8px); 
        transition: opacity 0.2s ease, transform 0.2s ease;
        filter: drop-shadow(0 3px 6px rgba(0,0,0,0.15));
        pointer-events: none; 
        
        display: flex; align-items: center;
        user-select: none;
    }
    /* 
       原理：虽然 wrapper 设置了 pointer-events: none，但当鼠标移入 
       pointer-events: auto 的子元素 (dot) 时，
       事件会冒泡，导致 wrapper 依然会进入 :hover 状态 
    */
    .hl-bookmark-wrapper:hover .hl-tooltip {
        opacity: 1; visibility: visible; transform: translateX(0);
    }
    
    /* 内部文字 Span */
    .hl-tooltip span {
        display: block;
        max-width: 250px; 
        white-space: nowrap; 
        overflow: hidden; 
        text-overflow: ellipsis;
    }
    
    /* 气泡右侧小箭头 */
    .hl-tooltip::after {
        content: ''; position: absolute; 
        top: 50%; right: -6px; margin-top: -6px;
        border-width: 6px 0 6px 6px;
        border-style: solid;
        border-color: transparent transparent transparent #fff; 
    }

    /* ================= 暗黑模式适配 ================= */
    @media (prefers-color-scheme: dark) {
        .hl-color-bubble {
            background: #2d2d2d; border-color: #444; color: #eee;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));
        }
        .hl-color-bubble::after {
            border-color: #2d2d2d transparent transparent transparent; 
        }
        .hl-color-swatch { border-color: #444; }

        .hl-bookmark-dot {
            border-color: rgba(220, 220, 220, 0.6);
            box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        }
        .hl-bookmark-wrapper:hover .hl-bookmark-dot {
            border-color: #fff;
        }

        .hl-tooltip {
            background: #333; color: #eee;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
            border: 1px solid #444; 
        }
        .hl-tooltip::after {
            border-color: transparent transparent transparent #333;
        }
    }
    
/* --- 拖拽删除替身 (Ghost) --- */
    .hl-bookmark-ghost {
        position: fixed;
        z-index: 2147483647;
        width: 15px; height: 15px; border-radius: 50%;
        
        box-sizing: border-box;
        border: 1.5px solid rgba(50, 50, 50, 0.75); 
        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        
        pointer-events: none;
        transform: translate(-50%, -50%); 
        
        transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s;
        will-change: left, top, transform;
    }

    /* 危险状态 */
    .hl-bookmark-ghost.danger {
        background-color: #ff4757 !important;
        border-color: #fff !important;
        transform: translate(-50%, -50%) scale(1.4); 
        box-shadow: 0 0 0 4px rgba(255, 71, 87, 0.4), 0 0 20px 5px rgba(255, 71, 87, 0.6);
        z-index: 2147483649;
    }

    /* 爆炸粒子 */
    .hl-explosion-particle {
        position: fixed;
        border-radius: 50%;
        background-color: #ff4757;
        pointer-events: none;
        z-index: 2147483648; 
        will-change: transform, opacity;
        box-shadow: 0 0 4px rgba(255, 71, 87, 0.8);
    }

    /* 
       回弹动画 (超级弹簧版)
       cubic-bezier(0.3, 1.8, 0.3, 0.8)
       P1(0.3, 1.8) -> 意味着动画进行到 30% 时间时，位置已经到了 180% (严重冲过头)
       P2(0.3, 0.8) -> 然后迅速被拉回
       这会创造出非常明显的“砰-咻-咚”的弹跳感
    */
    .hl-bookmark-ghost.returning {
        transition: 
            left 0.6s cubic-bezier(0.3, 1.8, 0.3, 0.8),
            top 0.6s cubic-bezier(0.3, 1.8, 0.3, 0.8),
            /* 大小变化配合位置，稍慢一点，保持视觉连续性 */
            transform 0.5s ease-out,
            background-color 0.3s ease,
            border-color 0.3s ease,
            box-shadow 0.3s ease;
    }
    
`;
document.head.appendChild(style);
// --- 粒子爆炸逻辑 ---
const explode = (x, y) => {
    const EXPLOSION_DURATION_BASE = 5800; 
    const particleCount = 66; 
    const colors = ['#ff4757', '#ff6b81', '#ff7f50'];

    for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.className = 'hl-explosion-particle';
        const size = 4 + Math.random() * 6; 
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        document.body.appendChild(p);

        const angle = Math.random() * Math.PI * 2;
        const velocity = 60 + Math.random() * 80; 
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;
        const duration = EXPLOSION_DURATION_BASE + Math.random() * 300; 

        const anim = p.animate([
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`, opacity: 0 }
        ], {
            duration: duration,
            easing: 'cubic-bezier(0.1, 0.9, 0.2, 1)', 
        });
        anim.onfinish = () => p.remove();
    }
};
/**
 * 书签拖拽管理器 (超级弹簧回弹版)
 */
const BookmarkDragManager = (() => {
    let ghostEl = null;
    let originEl = null;
    let targetEl = null;
    
    let startX = 0, startY = 0;
    let isPressed = false;
    let isDragging = false;
    
    const DRAG_TRIGGER_DIST = 5;  
    const DELETE_THRESHOLD = 80;   // 超过这个距离即视为删除


    const createGhost = (rect, color) => {
        const ghost = document.createElement('div');
        ghost.className = 'hl-bookmark-ghost';
        ghost.style.width = '15px'; 
        ghost.style.height = '15px';
        ghost.style.left = `${rect.left + rect.width / 2}px`;
        ghost.style.top = `${rect.top + rect.height / 2}px`;
        ghost.style.backgroundColor = color;
        document.body.appendChild(ghost);
        return ghost;
    };

    const onGlobalMove = (e) => {
        if (!isPressed) return;

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        if (!isDragging) {
            const moveDist = Math.sqrt(Math.pow(clientX - startX, 2) + Math.pow(clientY - startY, 2));
            if (moveDist > DRAG_TRIGGER_DIST) {
                isDragging = true;
                const dot = originEl.querySelector('.hl-bookmark-dot');
                const rect = dot.getBoundingClientRect();
                const color = targetEl.dataset.hlColor || '#ffff0077';

                originEl.style.opacity = '0';
                originEl.style.pointerEvents = 'none'; 

                ghostEl = createGhost(rect, color);
                if (navigator.vibrate) navigator.vibrate(15);
            }
            return;
        }

        if (e.cancelable) e.preventDefault(); 

        if (ghostEl) {
            ghostEl.style.left = `${clientX}px`;
            ghostEl.style.top = `${clientY}px`;

            const distFromStart = Math.sqrt(Math.pow(clientX - startX, 2) + Math.pow(clientY - startY, 2));
            
            if (distFromStart > DELETE_THRESHOLD) {
                if (!ghostEl.classList.contains('danger')) {
                    ghostEl.classList.add('danger');
                    if (navigator.vibrate) navigator.vibrate(20); 
                }
            } else {
                ghostEl.classList.remove('danger');
            }
        }
    };

    const onGlobalUp = (e) => {
        document.removeEventListener('mousemove', onGlobalMove);
        document.removeEventListener('touchmove', onGlobalMove);
        document.removeEventListener('mouseup', onGlobalUp);
        document.removeEventListener('touchend', onGlobalUp);

        if (!isPressed) return;
        isPressed = false;

        if (!isDragging) {
            scrollToHighLight(targetEl);
            return;
        }

        isDragging = false;
        
        if (ghostEl) {
            const isDanger = ghostEl.classList.contains('danger');
            
            if (isDanger) {
                const rect = ghostEl.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;

                ghostEl.remove();
                ghostEl = null;

                explode(x, y);
                if (navigator.vibrate) navigator.vibrate([30, 50]); 

                HighlightManager.clearStyle(targetEl,false);
                if (originEl) originEl.remove();

            } else {
                // >>> ↩️ 回弹逻辑 <<<
                ghostEl.classList.remove('danger');
                ghostEl.classList.add('returning');
                
                // 强制缩放归零
                ghostEl.style.transform = 'translate(-50%, -50%) scale(1)';
                
                // 计算目标位置
                if (originEl) {
                    const dot = originEl.querySelector('.hl-bookmark-dot');
                    if (dot) {
                        const rect = dot.getBoundingClientRect();
                        // 对齐到圆心
                        ghostEl.style.left = `${rect.left + rect.width / 2}px`;
                        ghostEl.style.top = `${rect.top + rect.height / 2}px`;
                    } else {
                        ghostEl.style.left = `${startX}px`;
                        ghostEl.style.top = `${startY}px`;
                    }
                }

                // 延迟清理 (650ms 匹配 0.6s 动画)
                const tempGhost = ghostEl;
                const tempOrigin = originEl;
                
                setTimeout(() => {
                    if (tempGhost) tempGhost.remove();
                    if (tempOrigin) {
                        tempOrigin.style.opacity = '1';
                        tempOrigin.style.pointerEvents = ''; 
                    }
                }, 650); 
                
                ghostEl = null;
            }
        }
        
        originEl = null;
        targetEl = null;
    };

    return {
        bind: (wrapper, el) => {
            const start = (e) => {
                if (e.type === 'mousedown' && e.button !== 0) return;
                e.stopPropagation();

                isPressed = true;
                isDragging = false;
                originEl = wrapper;
                targetEl = el;

                startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

                document.addEventListener('mousemove', onGlobalMove, { passive: false });
                document.addEventListener('touchmove', onGlobalMove, { passive: false });
                document.addEventListener('mouseup', onGlobalUp);
                document.addEventListener('touchend', onGlobalUp);
            };

            wrapper.addEventListener('mousedown', start);
            wrapper.addEventListener('touchstart', start, { passive: false });
            wrapper.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
            });
        }
    };
})();

// #region 高亮标记
// --- 3. 核心管理器 ---
window.HighlightManager = { 
    siteKey: 'highlightData-'+window.location.hostname,
    pageKey: '', 
    siteData: {}, 
    bubbleEl: null,
    bookmarkContainerEl: null,
    currentTarget: null,
    showTimer: null,
    hideTimer: null,
    
    // 【新增】防抖保存定时器
    saveTimer: null,

    bookmarkMap: new Map(),
    
    init() {
        this.loadColors();
        this.updatePageKey(window.location.href);
        this.renderBubble();
        this.createBookmarkContainer();

        this.loadSiteData().then(async() => {
            await this.restoreHighlights();
            // console.log(this.siteData);
            setTimeout(() => this.updateBookmarks(), 500);
            if (currentWebsite==='Gemini') {
                setTimeout(async() => {
                    await this.restoreHighlights();
                    this.updateBookmarks();
                }, 2000);
            }
        });

        // const observer = new MutationObserver(() => {
        //     requestAnimationFrame(() => this.updateBookmarks());
        // });
        // observer.observe(document.body, { childList: true, subtree: true, attributes: false });

        window.addEventListener('resize', () => {
            requestAnimationFrame(() => this.updateBookmarks(false));// 窗口尺寸变化不用保存
        });
        // window.addEventListener('load', () => {
        //     this.restoreHighlights();
        //     this.updateBookmarks();
        // });
    },
    loadColors(){
        this.colors = [`rgba(255, 217, 0, ${0.5*currentSettings.colorSaturation})`, 
            `rgba(50, 255, 118, ${0.5*currentSettings.colorSaturation})`, 
            `rgba(1, 144, 253, ${0.5*currentSettings.colorSaturation})`,
            `rgba(180, 100, 255, ${0.5*currentSettings.colorSaturation})`, 
            `rgba(250, 131, 135, ${0.5*currentSettings.colorSaturation})`,
            `rgba(255, 107, 2, ${0.5*currentSettings.colorSaturation})`];
        this.defaultColor = this.colors[0];
        document.querySelectorAll('.hl-color-bubble .hl-color-swatch').forEach((swatch, index) => {
            if(this.colors[index]){
                swatch.style.backgroundColor = this.colors[index];
            }
        });
    },
    createBookmarkContainer() {
        if (document.getElementById('hl-bookmark-container')) return;
        const div = document.createElement('book-mark');
        div.id = 'hl-bookmark-container';
        document.body.appendChild(div);
        this.bookmarkContainerEl = div;
    },

    // 【核心重构】更新书签 + 实时计算存储比例
    updateBookmarks(autoSave = true) {
        if (!this.bookmarkContainerEl) return;
        
        const highlightedEls = Array.from(document.querySelectorAll(`[data-highlighted="true"]`));
        const currentActiveSet = new Set();
        
        // 1. 高度计算
        let maxElTop = 0;
        let docHeight = 0;
        const elPositions = new Map();

        highlightedEls.forEach(el => {
            if (el.offsetParent === null) return;
            const top = getAbsoluteDocTop(el);
            elPositions.set(el, top);
            if (top > maxElTop) maxElTop = top;
            currentActiveSet.add(el);
        });

        if (typeof currentContents !== 'undefined') {
            // let contentHeight=0;
            document.querySelectorAll(currentUtilCfg.selector).forEach(el=>{
                docHeight=docHeight+el.scrollHeight;
            })
        }

        // 2. 轨道参数
        const viewHeight = window.innerHeight;
        const centerY = viewHeight / 2;
        const forbiddenZoneRadius = 45; 
        const dotSafetyBuffer = 10; 
        const forbiddenTopY = centerY - forbiddenZoneRadius - dotSafetyBuffer;
        const forbiddenBottomY = centerY + forbiddenZoneRadius + dotSafetyBuffer;
        const pageMargin = 12;
        const topTrackHeight = forbiddenTopY - pageMargin;
        const bottomTrackHeight = (viewHeight - pageMargin) - forbiddenBottomY;
        const totalTrackLength = topTrackHeight + bottomTrackHeight;

        // 标记是否有数据更新
        let hasDataChange = false;
        currentActiveSet.forEach(el => {
            const absoluteTop = elPositions.get(el);
            let ratio = absoluteTop / docHeight;
            ratio = Math.max(0, Math.min(1, ratio));

            // 优先使用 dataset 缓存的选择器，避免重复计算
            let selector = el.dataset.hlSelector;
            if (!selector) {
                selector = getUniqueSelector(el);
                el.dataset.hlSelector = selector; // 写入缓存
            }

            if (selector && this.siteData[this.pageKey] && this.siteData[this.pageKey][selector]) {
                const newRatio = parseFloat(ratio.toFixed(5)); // 保留5位小数
                // 如果比例发生变化，更新内存数据并标记需要保存
                if (this.siteData[this.pageKey][selector].ratio !== newRatio) {
                    this.siteData[this.pageKey][selector].ratio = newRatio;
                    hasDataChange = true;
                }
            }
            // ===============================================

            // --- UI 渲染逻辑 ---
            const mappedPos = ratio * totalTrackLength;
            let finalTop;
            if (mappedPos <= topTrackHeight) {
                finalTop = pageMargin + mappedPos;
            } else {
                const offsetInBottom = mappedPos - topTrackHeight;
                finalTop = forbiddenBottomY + offsetInBottom;
            }
            if (this.bookmarkMap.has(el)) {
                const wrapper = this.bookmarkMap.get(el);
                wrapper.style.top = finalTop + 'px';
                const dot = wrapper.querySelector('.hl-bookmark-dot');
                if (dot) dot.style.backgroundColor = el.dataset.hlColor || this.defaultColor;
            } else {
                // === 创建新书签 ===
                const wrapper = document.createElement('mark-dot');
                wrapper.className = 'hl-bookmark-wrapper';
                wrapper.dataset.hlSelector=selector;
                wrapper.style.top = finalTop + 'px';
                
                // 1. 绑定拖拽与点击逻辑 (使用 DragManager)
                const color = el.dataset.hlColor || this.defaultColor;
                BookmarkDragManager.bind(wrapper, el); 

                // 2. 悬停红框效果
                wrapper.addEventListener('mouseenter', () => { el.style.outline = '2px solid red'; });
                wrapper.addEventListener('mouseleave', () => { el.style.outline = ''; });

                const tooltip = document.createElement('div');
                tooltip.className = 'hl-tooltip';
                const span = document.createElement('span'); 
                span.textContent = (el.innerText || '').trim().replace(/\s+/g, ' ') || '无标题';
                tooltip.appendChild(span);
                
                const dot = document.createElement('div');
                dot.className = 'hl-bookmark-dot';
                dot.style.backgroundColor = color;

                wrapper.appendChild(tooltip);
                wrapper.appendChild(dot);
                this.bookmarkContainerEl.appendChild(wrapper);
                this.bookmarkMap.set(el, wrapper);
                // console.log('添加书签', wrapper); 
            }
        });

        // 清理不存在的 DOM
        for (const [el, wrapper] of this.bookmarkMap.entries()) {
            if (!currentActiveSet.has(el)) {
                if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
                this.bookmarkMap.delete(el);
            }
        }

        this.updateHistoryDots();
        
        // 【新增】如果数据有变动，触发防抖保存
        if (hasDataChange && autoSave) {
            clearTimeout(this.saveTimer);
            this.saveTimer = setTimeout(() => {
                this.saveToStorage();
            }, 2000); // 5秒后写入硬盘，避免频繁 IO
        }
    },
    updateHistoryDots() {
        const markers=[];
        if (this.siteData[this.pageKey]){
            Object.keys(this.siteData[this.pageKey]).forEach(selector=>{
                // console.log('selector',selector);
                const selectorData=this.siteData[this.pageKey][selector];
                markers.push({[selectorData.color]:selectorData.ratio}) 
            })
        }
        // console.log(markers);
        updateColorDotsByUrl(location.href,markers);
    },

    async switchPage(newHref) {
        this.hideBubbleImmediate();
        this.updatePageKey(newHref);
        this.bookmarkMap.clear();
        this.bookmarkContainerEl.innerHTML = '';
        await this.restoreHighlights();
        this.updateBookmarks(false);
        if (currentWebsite === 'Gemini'){
            setTimeout(async() => {
                await this.restoreHighlights();
                this.updateBookmarks(false);
            }, 1500);
        }
        
    },

    updatePageKey(href) {
        try {
            const urlObj = new URL(href);
            this.pageKey = urlObj.pathname;
        } catch (e) { this.pageKey = href; }
    },

    loadSiteData() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && typeof currentWebsite) {
                if (location.href.includes('preview.html')) {
                    try {
                        const raw = sessionStorage.getItem('hl_site_' + this.siteKey);
                        this.siteData = raw ? JSON.parse(raw) : {};
                    } catch (e) { this.siteData = {}; }
                    resolve();
                } else {
                    idbGet([this.siteKey])
                        .then((result) => {
                            this.siteData = result || {}; 
                            resolve();
                        })
                        .catch(() => {
                            this.siteData = {};
                            resolve();
                        });
                }
            } else {
                try {
                    const raw = localStorage.getItem('hl_site_' + this.siteKey);
                    this.siteData = raw ? JSON.parse(raw) : {};
                } catch (e) { this.siteData = {}; }
                resolve();
            }
        });
    },

    saveToStorage() {
        if (typeof chrome !== 'undefined' && chrome.storage && typeof currentWebsite) {
            if (location.href.includes('preview.html')) {
                sessionStorage.setItem('hl_site_' + this.siteKey, JSON.stringify(this.siteData));
            } else {
                const update = {};
                update[this.siteKey] = this.siteData;
                idbSet(update);
            }
        } else {
            localStorage.setItem('hl_site_' + this.siteKey, JSON.stringify(this.siteData));
        }
    },

    // 【修改】保存时使用对象结构 {color, ratio}
    saveCurrentHighlight(el, color) {
        const selector = getUniqueSelector(el);
        if (!selector) return;
        el.dataset.hlSelector = selector;   // 缓存 selector，方便 updateBookmarks 使用

        if (!this.siteData[this.pageKey]) this.siteData[this.pageKey] = {};
        
        // 初始保存（比例设为0，updateBookmarks 会立刻修正它）
        this.siteData[this.pageKey][selector] = {
            color: color,
            ratio: 0 
        };
        
        this.saveToStorage();
        this.updateBookmarks(); // 这里会立刻重新计算并更新正确的 ratio
    },

    // 【修改】读取对象结构 - 修复异步等待问题
    async restoreHighlights() {
        const pageData = this.siteData[this.pageKey];   // 注意老pagekay不兼容
        // console.log('恢复高亮', pageData);
        // console.log('恢复高亮', this.siteData,this.pageKey,pageData);
        if (!pageData || Object.keys(pageData).length === 0) return;
        // 1. 将所有任务映射为一个 Promise 数组
        const tasks = Object.keys(pageData).map(async selector => {
            try {
                // 等待元素出现
                // console.log('恢复高亮', selector);
                await waitForElement(selector);
                const el = document.querySelector(selector);
                const entry = pageData[selector];

                // 兼容性检查：entry 必须是对象且有 color
                if (el && entry && entry.color && el.dataset.highlighted !== 'true') {
                    el.dataset.hlSelector = selector; 
                    this.applyStyle(el, entry.color, false);
                }
            } catch (error) {
                console.log(`恢复高亮失败 (${selector}):`, error);
            }
        });
        // 2. 使用 Promise.all 等待所有任务真正完成
        await Promise.all(tasks);
        // if ()
    },
    clearHighlights() {
        document.querySelectorAll('[data-highlighted="true"]').forEach(el => {
            this.clearStyle(el);
        });
        delete this.siteData[this.pageKey];
        this.saveToStorage();
        this.updateBookmarks();
    },

    removeCurrentHighlight(el,hasExplode=true) {
        const selector = getUniqueSelector(el);
        if (!selector) return;
        if (this.siteData[this.pageKey]) {
            delete this.siteData[this.pageKey][selector];
            if (Object.keys(this.siteData[this.pageKey]).length === 0) {
                delete this.siteData[this.pageKey];
            }
            this.saveToStorage();
        }
        const markerEl = document.querySelector(`mark-dot[data-hl-selector="${selector}"]`);
        if (hasExplode){
            const rect = markerEl.querySelector('.hl-bookmark-dot').getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            explode(x, y);
        }
        this.updateBookmarks();
    },
    // removeCurrentHighlight(el) {
    //     const selector = getUniqueSelector(el);
    //     if (!selector) return;
    //     if (this.siteData[this.pageKey]) {
    //         delete this.siteData[this.pageKey][selector];
    //         if (Object.keys(this.siteData[this.pageKey]).length === 0) {
    //             delete this.siteData[this.pageKey];
    //         }
    //         this.saveToStorage();
    //     }
    //     this.updateBookmarks(); 
    // },
    
    
    // 应用高亮
    applyStyle(el, color, shouldSave = true) {
        if (!el) return;
        el.style.backgroundColor = color;
        el.style.boxShadow = `0 0 0 5px ${color}`;
        el.dataset.highlighted = 'true';
        el.dataset.hlColor = color;

        if (el.dataset.hasHlEvents !== 'true') {
            el.addEventListener('mouseenter', (e) => {
                clearTimeout(this.hideTimer);
                this.startShowTimer(e.target, e.clientX);
            });
            el.addEventListener('mouseleave', () => {
                clearTimeout(this.showTimer);
                this.hideBubbleDelay();
            });
            el.dataset.hasHlEvents = 'true';
        }
        // 手动修改高亮颜色后，会自动保存高亮信息
        if (shouldSave) this.saveCurrentHighlight(el, color);
    },

    clearStyle(el,hasExplode) {
        if (!el) return;
        el.style.backgroundColor = '';
        el.style.boxShadow = '';
        el.dataset.highlighted = 'false';
        el.style.outline = ''; 
        delete el.dataset.hlColor;
        this.removeCurrentHighlight(el,hasExplode);
    },

    renderBubble() {
        if (this.bubbleEl) return;
        const div = document.createElement('div');
        div.className = 'hl-color-bubble';
        this.colors.forEach(color => {
            const span = document.createElement('span');
            span.className = 'hl-color-swatch';
            span.style.backgroundColor = color;
            span.onmousedown = (e) => { 
                e.preventDefault(); e.stopPropagation();
                if (this.currentTarget) this.applyStyle(this.currentTarget, span.style.backgroundColor, true);
            };
            div.appendChild(span);
        });

        const trash = document.createElement('span');
        trash.className = 'hl-trash-icon';
        trash.innerHTML = '<i class="ri-delete-bin-5-line"></i>';

        const handleTrash = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (this.currentTarget) {
                this.clearStyle(this.currentTarget);
                this.hideBubbleImmediate();
            }
        };
        trash.addEventListener('mousedown', handleTrash);
        trash.addEventListener('click', handleTrash);

        div.appendChild(trash);
        div.addEventListener('mouseenter', () => clearTimeout(this.hideTimer));
        div.addEventListener('mouseleave', () => this.hideBubbleDelay());
        document.body.appendChild(div);
        this.bubbleEl = div;
    },

    startShowTimer(targetEl, clientX) {
        clearTimeout(this.showTimer);
        this.showTimer = setTimeout(() => {
            this.showBubble(targetEl, clientX);
        }, 100);
    },

    showBubble(targetEl, clientX = null) {
        if (!targetEl || targetEl.dataset.highlighted !== 'true') return;
        clearTimeout(this.hideTimer);
        this.currentTarget = targetEl;

        this.bubbleEl.style.visibility = 'hidden';
        this.bubbleEl.classList.add('visible');

        const rect = targetEl.getBoundingClientRect();
        const bubbleWidth = this.bubbleEl.offsetWidth; 
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        let leftPos;
        if (clientX !== null && rect.width > bubbleWidth) {
            const halfBubble = bubbleWidth / 2;
            const minLeft = rect.left + halfBubble;
            const maxLeft = rect.right - halfBubble;
            leftPos = Math.max(minLeft, Math.min(maxLeft, clientX));
        } else {
            leftPos = rect.left + rect.width / 2;
        }

        this.bubbleEl.style.top = (rect.top + scrollTop + 5) + 'px';
        this.bubbleEl.style.left = (leftPos + scrollLeft) + 'px';
        this.bubbleEl.style.visibility = 'visible';
    },

    hideBubbleDelay() {
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => {
            this.bubbleEl.classList.remove('visible');
            this.bubbleEl.style.visibility = '';
            this.currentTarget = null;
        }, 150);
    },

    hideBubbleImmediate() {
        clearTimeout(this.showTimer);
        clearTimeout(this.hideTimer);
        if (this.bubbleEl) {
            this.bubbleEl.classList.remove('visible');
            this.bubbleEl.style.visibility = '';
        }
        this.currentTarget = null;
    }
};
function initHighlight() {
    if (currentWebsite === 'MindMapHtml' || !currentSettings.enableMarkerFeature || !yiFufei) return;
    HighlightManager.init();
    
    // --- 终极版长按逻辑：防复制冲突 + 防框选误触 + 选区检测 ---
    const titleTag = 'h1, h2, h3, h4, h5, h6';
    const contentTag1 = '.paragraph, p ,ul, ol,blockquote,section,li';
    const contentTag2 = 'div, span';

    // 【新增】交互元素黑名单
    const interactiveSelectors = 'button, a, input, textarea, [data-ai-copying]';

    let timer = null;
    let startX = 0;
    let startY = 0;
    let isLongPress = false;
    const MOVE_THRESHOLD = 10;

    // 清理函数
    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        document.removeEventListener('mousemove', moveHandler);
        // 【新增】移除拖拽监听
        document.removeEventListener('dragstart', dragStartHandler);
        // 【修复 2】清理 scroll 监听（必须使用 capture: true 以匹配添加时的参数）
        document.removeEventListener('scroll', clearTimer, true);
    };

    // 【新增】原生拖拽开始事件
    const dragStartHandler = () => {
        clearTimer(); 
    };

    // 移动检测函数
    const moveHandler = (e) => {
        const diffX = Math.abs(e.clientX - startX);
        const diffY = Math.abs(e.clientY - startY);

        if (diffX > MOVE_THRESHOLD || diffY > MOVE_THRESHOLD) {
            clearTimer();
        }
    };

    const startHandler = (e) => {
        // 1. 防干扰
        if (e.target.closest(interactiveSelectors)) {
            return;
        }

        // 2. 只响应鼠标左键
        if (e.type === 'mousedown' && e.button !== 0) return;

        // 3. 记录起始状态
        startX = e.clientX;
        startY = e.clientY;
        isLongPress = false;

        // 4. 监听移动 和 【新增】原生拖拽
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('dragstart', dragStartHandler);
        
        // 【修复 】监听滚动事件
        // 一旦页面发生滚动（无论是拖动滚动条还是鼠标滚轮），立即取消长按
        // 注意：scroll 事件在某些元素上不冒泡，建议开启 capture (true) 以捕获全局滚动
        document.addEventListener('scroll', clearTimer, true);

        // 5. 启动长按计时
        timer = setTimeout(() => {
            // 【关键修复】在触发前最后检查一次：当前是否有选中的文本？
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0 && selection.type === 'Range') {
                clearTimer();
                return;
            }

            isLongPress = true;
            clearTimer();

            // --- 业务逻辑 ---
            if (e.target.closest('book-mark') ||
                e.target.closest('.bookmark-manager-container') ||
                e.target.closest('.custom-directory-container') ||
                e.target.closest('.hl-color-bubble') ||
                e.target.closest('.ai-preview-bubble') ||
                (currentUtilCfg && !e.target.closest(currentUtilCfg.selector))) return;

            const title = e.target.closest(titleTag) || e.target.closest(contentTag1) || e.target.closest(contentTag2);

            if (title) {
                if (navigator.vibrate) navigator.vibrate(50);
                    HighlightManager.loadColors();
                if (title.dataset.highlighted === 'true') {
                    HighlightManager.showBubble(title, startX);
                } else {
                    const colorToUse = HighlightManager.defaultColor;
                    HighlightManager.applyStyle(title, colorToUse, true);
                    HighlightManager.showBubble(title, startX);
                }
            }
            // ------------------
        }, 600);
    };

    const endHandler = (e) => {
        clearTimer();
    };

    const clickHandler = (e) => {
        if (isLongPress) {
            e.preventDefault();
            e.stopPropagation();
            isLongPress = false;
        }
    };

    document.addEventListener('mousedown', startHandler, true);
    document.addEventListener('mouseup', endHandler, true);
    document.addEventListener('click', clickHandler, true);

    // 移动端兼容
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.clientX = e.touches[0].clientX;
            e.clientY = e.touches[0].clientY;
            e.button = 0;
            startHandler(e);
        }
    }, { passive: true });
    
    document.addEventListener('touchend', endHandler, { passive: true });
    
    // 移动端通常不需要特别处理滚动条点击（因为手指直接滑动屏幕），
    // 但监听 touchmove 以取消长按是必须的
    document.addEventListener('touchmove', (e) => {
        clearTimer();
    }, { passive: true });
}


// --- 2. 工具函数 ---
function getUniqueSelector(el) {
    if (!(el instanceof Element)) return;

    // 辅助函数：判断 ID 是否是一个“好”的 ID
    const isStableId = (id) => {
        if (!id) return false;
        // 1. 过滤以数字开头的 ID (避免 #\34 这种转义)
        if (/^\d/.test(id)) return false;
        // 2. 过滤包含大量连续数字的 (原逻辑)
        if (/\d{5,}/.test(id)) return false;
        // 3. 过滤 UUID/GUID 格式 (例如 xxxxxxxx-xxxx-xxxx-...)
        if (/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}/i.test(id)) return false;
        return true;
    };

    // 如果当前元素本身就有完美的 ID，直接返回
    if (isStableId(el.id)) {
        return '#' + CSS.escape(el.id);
    }

    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
        let selector = el.nodeName.toLowerCase();

        // 检查当前层级是否有可用的 ID
        if (isStableId(el.id)) {
            selector = '#' + CSS.escape(el.id);
            path.unshift(selector);
            // 找到了唯一 ID，停止向上查找，直接返回当前路径
            break; 
        } else {
            // 没有 ID 或 ID 不合法，使用 nth-of-type
            let sib = el;
            let nth = 1;
            while (sib = sib.previousElementSibling) {
                if (sib.nodeName.toLowerCase() === selector) nth++;
            }
            // 只有当不是第一个时，才添加 :nth-of-type，或者你希望总是添加也可以
            // 这里为了精确性，建议保留
            selector += `:nth-of-type(${nth})`;
        }

        path.unshift(selector);
        el = el.parentNode;
    }
    return path.join(" > ");
}

function getAbsoluteDocTop1(el) {
    let top = 0;
    let curr = el;
    while(curr) {
        if (curr.offsetTop<0) return top;
        top += curr.offsetTop;
        curr = curr.offsetParent;
    }
    return top;
}

function getAbsoluteDocTop(el) {
    els=document.querySelectorAll(currentCfg.selector);
    let top0 = els[0].getBoundingClientRect().top;
    let top1 = els[els.length-1].getBoundingClientRect().top;
    let top=el.getBoundingClientRect().top-Math.min(top0,top1); 
    // console.log('两个高度',top1,el.getBoundingClientRect().top)
    return top;
}

function scrollToHighLight(element) {
    scroll_behavior=currentSettings.enableScrollSmooth?'smooth':'auto'
    const behavior = location.hostname === 'www.kimi.com' || location.hostname === 'aistudio.google.com'? 'auto' : scroll_behavior;
    element.scrollIntoView({            // 滚动到目标元素
        behavior: behavior,
        block: 'center'          // 垂直居中显示
    });
}
// --- 长按逻辑 ---
// installLongPress(document, {
//     onLongPress: (e, target) => {
//         // 【新增修复代码】
//         // 1. 如果点击的是按钮（包括复制按钮），直接忽略
//         // 2. 如果当前元素正在被脚本标记为复制中 (data-ai-copying="1")，直接忽略
//         if (target.closest('button') || target.closest('[data-ai-copying="1"]')) {
//             return; 
//         }

//         const title = target.closest(HighlightManager.titleTag);
//         if (title) {
//             if (title.dataset.highlighted === 'true') {
//                 HighlightManager.showBubble(title);
//                 return;
//             }
//             const colorToUse = HighlightManager.defaultColor;
//             HighlightManager.applyStyle(title, colorToUse, true);
//             HighlightManager.showBubble(title);
//         }
//     }
// });


/**
 // #region 浮动编号徽章管理器 (v3.0 智能层级版)
 * 特性：
 * 1. 编号始终在视口内垂直居中
 * 2. 防止重复添加
 * 3. 智能跟随元素的 z-index，不会穿透遮罩层
 */
const BadgeManager = (() => {
    // 1. 注入样式
    const style = document.createElement('style');
    style.innerHTML = `
      .dynamic-floating-badge {
        position: fixed;
        /* 注意：这里删除了默认的 z-index: 99999，改为由 JS 动态控制 */
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        background-color: #ff4757;
        color: white;
        border-radius: 50%;
        font-weight: bold;
        font-family: Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        pointer-events: none;
        will-change: transform, opacity;
        transition: opacity 0.2s;
      }
    `;
    document.head.appendChild(style);
  
    const tasks = [];
    let isRunning = false;
  
    // 动画循环 (位置计算)
    const updatePositions = () => {
      const viewportHeight = window.innerHeight;
      tasks.forEach(task => {
        const { el, badge, offset } = task;
        
        // 元素离体检测
        if(!document.body.contains(el)) {
            badge.style.display = 'none';
            return;
        } else {
            badge.style.display = 'flex';
        }
  
        const rect = el.getBoundingClientRect();
        const visibleTop = Math.max(0, rect.top);
        const visibleBottom = Math.min(viewportHeight, rect.bottom);
  
        // 完全不可见时隐藏
        if (visibleTop >= visibleBottom) {
          badge.style.opacity = '0';
          return;
        }
  
        const visibleCenterY = (visibleTop + visibleBottom) / 2;
        badge.style.opacity = '1';
        badge.style.left = `${rect.right + offset}px`;
        badge.style.top = `${visibleCenterY}px`;
        badge.style.transform = `translate(0, -50%)`; 
      });
  
      if (tasks.length > 0) {
        requestAnimationFrame(updatePositions);
      } else {
        isRunning = false;
      }
    };
  
    const startLoop = () => {
      if (!isRunning && tasks.length > 0) {
        isRunning = true;
        updatePositions();
      }
    };
  
    return {
      add: (target, number, offset = 10) => {
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;
  
        // === 防重复检测 ===
        if (el.hasAttribute('data-badge-added')) return null;
        el.setAttribute('data-badge-added', 'true');
  
        // === 核心逻辑：计算 z-index ===
        const compStyles = window.getComputedStyle(el);
        let targetZIndex = compStyles.zIndex;
  
        // 处理 'auto' 的情况
        // 如果元素没有设置 z-index (auto)，我们给一个默认的安全值 999
        // 这样既能浮在普通文本上，又会被 z-index: 2000 的弹窗遮挡
        if (targetZIndex === 'auto') {
          targetZIndex = 999; 
        } else {
          // 如果元素明确设置了数值（比如 10），直接转换成数字
          targetZIndex = parseInt(targetZIndex, 10);
        }
  
        const badge = document.createElement('div');
        badge.className = 'dynamic-floating-badge';
        badge.innerText = number;
        
        // === 应用层级 ===
        // 我们让 badge 的层级等于元素的层级
        // 因为 badge 是后插入 DOM 的，所以同级 z-index 下，badge 会显示在 element 上面
        badge.style.zIndex = targetZIndex;
  
        document.body.appendChild(badge);
  
        tasks.push({ el, badge, offset });
        startLoop();
        
        return () => {
          badge.remove();
          el.removeAttribute('data-badge-added');
          const index = tasks.findIndex(t => t.badge === badge);
          if (index > -1) tasks.splice(index, 1);
        };
      },
      
      clearAll: () => {
        tasks.forEach(t => {
          t.badge.remove();
          t.el.removeAttribute('data-badge-added');
        });
        tasks.length = 0;
      }
    };
  })();
  
function addFloatingNumber(element, number) {
    BadgeManager.add(element, number);
}

if (location.hostname === 'www.doubao.com') {
    // 1. 注入动态样式表
    // console.log('检测到斗宝，正在注入主题适配样式...');
    const style = document.createElement('style');
    style.innerHTML = `
        html[data-theme="dark"] thead > tr { background-color: rgb(36, 38, 43) !important; }
        html[data-theme="light"] thead > tr { background-color: rgb(242, 242, 242) !important; }
    `;
    document.head.appendChild(style);

    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function updateTheme(e) {
        const theme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        console.log(`主题已切换为: ${theme}`);
    }

    // 初始化并监听
    updateTheme(darkModeMediaQuery);
    darkModeMediaQuery.addEventListener('change', updateTheme);
    setTimeout(()=>{
        document.querySelectorAll('a[href]').forEach(a=>a.setAttribute('draggable', 'true'))
    },3*1000)
    // document.querySelectorAll('div[class^="code-area"]>div[class^="header-wrapper"]>div[class^="header"]>div[class^="action"]>div[tabindex="0"]:not([data-testid])')[1]
}
// if (location.hostname === 'gemini.google.com') {
//     // 1. 定义需要切换的 class 名称
//     const DARK_CLASS = 'dark-theme';
//     const LIGHT_CLASS = 'light-theme';
//     const target = document.body;

//     // 2. 核心切换函数
//     function applyTheme(isDark) {
//         if (isDark) {
//             target.classList.add(DARK_CLASS);
//             target.classList.remove(LIGHT_CLASS);
//             // console.log('🌙 已自动切换至深色模式');
//         } else {
//             target.classList.add(LIGHT_CLASS);
//             target.classList.remove(DARK_CLASS);
//             // console.log('☀️ 已自动切换至浅色模式');
//         }
//     }

//     // 3. 检查浏览器当前主题偏好
//     const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');

//     // 4. 初始化执行一次
//     applyTheme(themeMedia.matches);

//     // 5. 监听浏览器主题实时变化（如用户在系统设置里更改了模式）
//     try {
//         // 现代浏览器支持方式
//         themeMedia.addEventListener('change', (e) => applyTheme(e.matches));
//     } catch (e) {
//         // 兼容旧版浏览器
//         themeMedia.addListener((e) => applyTheme(e.matches));
//     }
// }































/**
 * 这是一个真正的异步函数，只有后台说 "success" 了，它才会 resolve
 */
function triggerPhysicalClick(element) {
    return new Promise((resolve, reject) => {
        if (!element) {
            console.log("❌ 元素不存在");
            resolve(); // 找不到元素也resolve，防止卡死循环
            return;
        }

        const rect = element.getBoundingClientRect();
        // 确保坐标在视口内 (防止 scroll 没到位)
        if (rect.width === 0 || rect.height === 0) {
             console.log("❌ 元素不可见");
             resolve();
             return;
        }

        const x = rect.left + (rect.width / 2);
        const y = rect.top + (rect.height / 2);

        console.log(`⏳ 发送点击请求: (${x}, ${y})`);

        chrome.runtime.sendMessage({
            action: "debugger_click",
            coordinates: { x, y }
        }, (response) => {
            // 这是后台的回调
            if (chrome.runtime.lastError) {
                console.log("通信错误:", chrome.runtime.lastError);
                // 即使失败最好也 resolve，让循环继续
                resolve(); 
            } else {
                console.log("✅ 后台点击完成:", response);
                resolve(response);
            }
        });
    });
}




/**
 * 启用侧边栏拖拽调整宽度功能 (V4: React Hydration 安全版)
 * 修复了 Minified React error #418 报错，将手柄挂载至 Body
 * @param {string[]} selectorList - 需要同步宽度的选择器列表
 * @param {string} storageKey - 用于存储宽度的 LocalStorage Key
 */

// #region 侧边栏拖拽调整宽度功能
function enableSidebarResizer(selectorList, storageKey = 'user_custom_sidebar_width') {
    // 1. 获取所有目标元素
    const elements = [];
    selectorList.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) elements.push(el);
    });

    if (elements.length === 0) {
        // 静默失败或打印日志，视需求而定
        // console.warn('未找到目标元素');
        return;
    }

    // 主要操作元素
    const mainElement = elements[0];
    const MIN_WIDTH = 200;
    const MAX_WIDTH = 1200;
    const HANDLE_COLOR = '#3b82f6';
    const HANDLE_ID = 'sidebar-resize-handle-v4-safe';

    // 2. 定义统一设置宽度的函数 (仅修改样式，不修改 DOM 结构，React 通常能容忍)
    const setWidth = (width) => {
        elements.forEach(el => {
            el.style.maxWidth = 'none';
            el.style.minWidth = '0';
            el.style.flexShrink = '0'; 
            el.style.boxSizing = 'border-box';
            
            if (el === mainElement && el.nextElementSibling) {
                el.nextElementSibling.style.flexShrink = '1';
                el.nextElementSibling.style.minWidth = '0';
            }

            el.style.setProperty('width', `${width}px`, 'important');
        });
        // 宽度改变后，立即更新手柄位置
        requestAnimationFrame(updateHandlePosition);
    };

    // 3. 初始化宽度
    const savedWidth = localStorage.getItem(storageKey);
    if (savedWidth) {
        setWidth(parseInt(savedWidth, 10));
    } else {
        // 解除初始限制
        setWidth(mainElement.getBoundingClientRect().width);
    }

    // 4. 创建拖拽手柄 (挂载到 Body，避开 React)
    let handle = document.getElementById(HANDLE_ID);
    if (handle) handle.remove();

    handle = document.createElement('div');
    handle.id = HANDLE_ID;
    handle.style.cssText = `
        position: fixed; /* 使用 Fixed 定位，脱离文档流 */
        top: 0; 
        left: 0;
        width: 14px; /* 稍微宽一点便于点击 */
        height: 0px; /* 初始高度为0，稍后计算 */
        cursor: col-resize;
        z-index: 99; /* 保证最顶层 */
        display: flex;
        justify-content: center;
        user-select: none;
        touch-action: none;
        transform: translateX(-50%); /* 让手柄中心对准边缘 */
    `;

    // 视觉辅助线
    const line = document.createElement('div');
    line.style.cssText = `
        width: 2px;
        height: 100%;
        background-color: ${HANDLE_COLOR};
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none; /* 让线不阻挡鼠标事件 */
    `;
    handle.appendChild(line);
    document.body.appendChild(handle); // <--- 关键：挂载到 Body

    // 5. 核心逻辑：实时计算手柄位置
    // 因为手柄不在侧边栏内部，我们需要手动把它“贴”上去
    function updateHandlePosition() {
        if (!mainElement || !handle) return;
        
        const rect = mainElement.getBoundingClientRect();
        
        // 如果侧边栏隐藏了，手柄也隐藏
        if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(mainElement).display === 'none') {
            handle.style.display = 'none';
            return;
        } else {
            handle.style.display = 'flex';
        }

        handle.style.top = `${rect.top}px`;
        handle.style.left = `${rect.right}px`; // 紧贴右边缘
        handle.style.height = `${rect.height}px`;
    }

    // 6. 监听各种可能导致侧边栏位置变化的事件
    window.addEventListener('resize', updateHandlePosition);
    window.addEventListener('scroll', updateHandlePosition, { capture: true, passive: true });
    
    // 使用 ResizeObserver 监听侧边栏自身的尺寸变化
    const resizeObserver = new ResizeObserver(() => {
        updateHandlePosition();
    });
    resizeObserver.observe(mainElement);
    
    // 初始调用一次
    updateHandlePosition();

    // 7. 拖拽交互逻辑
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener('mouseenter', () => line.style.opacity = '1');
    handle.addEventListener('mouseleave', () => {
        if (!isResizing) line.style.opacity = '0';
    });

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = mainElement.getBoundingClientRect().width;
        
        line.style.opacity = '1';
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        requestAnimationFrame(() => {
            const currentX = e.clientX;
            const diffX = currentX - startX;
            let newWidth = startWidth + diffX;

            if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
            if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;

            setWidth(newWidth);
        });
    });

    document.addEventListener('mouseup', (e) => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            line.style.opacity = '0';
            
            const finalWidth = mainElement.getBoundingClientRect().width;
            localStorage.setItem(storageKey, finalWidth);
            // 确保松手时位置是对齐的
            updateHandlePosition();
        }
    });
}

async function cloneDeepseek(){
    // 💡 改进 1：加上 :not(.czx)，确保我们抓取的一定是本体，而不是上次生成的旧分身
    const selector = 'div[style^="--scroll-nav-page-padding"] .ds-scroll-area:not(.czx)';
    const originalElement = document.querySelector(selector);

    if (!originalElement) {
        console.error("❌ 未找到本体元素，请确认选择器是否正确。");
        return;
    }

    // console.log("⏳ 正在刷新分身数据，请稍候 0.5 秒...");

    // ================= 1. 障眼法捕获全部数据 =================
    const originalStyleText = originalElement.style.cssText;
    const originalScrollTop = originalElement.scrollTop;

    originalElement.style.setProperty('visibility', 'hidden', 'important');
    originalElement.style.setProperty('pointer-events', 'none', 'important');
    originalElement.style.setProperty('max-height', '10000px', 'important');

    // 等待本体加载新数据 (0.5秒)
    await new Promise(resolve => setTimeout(resolve, 200));

    const cloneElement = originalElement.cloneNode(true);

    if (cloneElement.id) cloneElement.removeAttribute('id');
    cloneElement.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

    // ================= 2. 配置分身 =================
    cloneElement.classList.add('czx');

    const styleId = 'czx-custom-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .czx {
                position: relative !important; 
                z-index: -2147483648 !important; 
                max-height: 10000px !important;
                overflow: visible !important;
                visibility: visible !important; 
                pointer-events: auto !important; 
            }
        `;
        document.head.appendChild(style);
    }

    // ================= 3. 瞬间恢复本体 =================
    originalElement.style.cssText = originalStyleText;
    originalElement.scrollTop = originalScrollTop;

    // ================= 4. 点击事件代理 =================
    cloneElement.addEventListener('click', function(e) {
        let current = e.target;
        let path = [];
        while (current && current !== cloneElement) {
            let index = Array.prototype.indexOf.call(current.parentNode.children, current);
            path.unshift(index);
            current = current.parentNode;
        }
        
        let targetInOriginal = originalElement;
        for (let i = 0; i < path.length; i++) {
            if (targetInOriginal.children && targetInOriginal.children[path[i]]) {
                targetInOriginal = targetInOriginal.children[path[i]];
            } else {
                targetInOriginal = null; 
                break;
            }
        }
        
        if (targetInOriginal) {
            const eventProps = { bubbles: true, cancelable: true, view: window };
            targetInOriginal.click(); 
            targetInOriginal.dispatchEvent(new MouseEvent('mousedown', eventProps));
            targetInOriginal.dispatchEvent(new MouseEvent('mouseup', eventProps));
        }
    });

    // ================= 5. 核心升级：销毁旧分身，实现刷新 =================
    // 在插入新分身之前，寻找页面中是否已经存在带有 'czx' 类的旧元素
    const oldClone = document.querySelector('.czx');
    if (oldClone) {
        oldClone.remove(); // 从 DOM 树中彻底抹除旧分身
        // console.log("♻️ 已清理旧的分身。");
    }

    // ================= 6. 插入新分身 =================
    originalElement.parentNode.insertBefore(cloneElement, originalElement.nextSibling);

    // console.log("✅ 刷新成功！已生成包含最新数据的分身。");
}
document.querySelectorAll('.ds-scroll-area.czx > div.ds-virtual-list > div > div > div')




















deleteConversations();

function deleteConversations() {
    // ================= 平台配置表 =================
    const PLATFORMS = {
        'chatgpt': {
            id: 'chatgpt',
            match: () => location.hostname.includes('chatgpt.com'),
            selectors: {
                container: '#history, nav[aria-label="Chat history"], div.overflow-y-auto',
                item: 'a[href*="/c/"]'
            },
            extractId: (item) => {
                const match = (item.getAttribute('href') || '').match(/\/c\/([a-f0-9\-]+)/i);
                return match ? match[1] : null;
            },
            deleteApi: async (selectedIds, onProgress) => {
                let successCount = 0; let failCount = 0; let successfulIds = [];
                try {
                    const sessionRes = await fetch('/api/auth/session');
                    if (!sessionRes.ok) throw new Error("无法获取 ChatGPT 登录状态");
                    const sessionData = await sessionRes.json();
                    const token = sessionData.accessToken;
                    if (!token) throw new Error("未找到 accessToken，请确保已登录");

                    for (let i = 0; i < selectedIds.length; i++) {
                        const id = selectedIds[i]; let isSuccess = false;
                        try {
                            const response = await fetch(`https://chatgpt.com/backend-api/conversation/${id}`, {
                                method: 'PATCH',
                                headers: {
                                    'authorization': `Bearer ${token}`,
                                    'content-type': 'application/json',
                                    'x-openai-target-path': `/backend-api/conversation/${id}`,
                                    'x-openai-target-route': '/backend-api/conversation/{conversation_id}'
                                },
                                body: JSON.stringify({ is_visible: false })
                            });
                            if (response.ok) {
                                successCount++; successfulIds.push(id); isSuccess = true;
                            } else failCount++;
                        } catch (err) { failCount++; }
                        if (onProgress) onProgress(id, isSuccess);
                        if (i < selectedIds.length - 1) await new Promise(r => setTimeout(r, 400));
                    }
                } catch (error) { 
                    // 这里原生的 alert 保持原样或者你也可以调用后面的 showModal
                    console.error("错误：" + error.message); 
                }
                return { successCount, failCount, successfulIds };
            }
        },
        'deepseek': {
            id: 'deepseek',
            match: () => location.hostname.includes('deepseek.com'),
            selectors: { container: '.ds-scroll-area', item: 'a[href*="/a/chat/s/"]' },
            extractId: (item) => {
                const match = (item.getAttribute('href') || '').match(/\/chat\/s\/([a-f0-9\-]+)/i);
                return match ? match[1] : null;
            },
            deleteApi: async (selectedIds, onProgress) => {
                let successCount = 0; let failCount = 0; let successfulIds = [];
                const tokenObj = JSON.parse(localStorage.getItem('userToken'));
                const token = tokenObj ? tokenObj.value : null;
                if (!token) throw new Error("未能获取 DeepSeek 登录凭证");

                for (let i = 0; i < selectedIds.length; i++) {
                    const id = selectedIds[i]; let isSuccess = false;
                    try {
                        const response = await fetch('https://chat.deepseek.com/api/v0/chat_session/delete', {
                            method: 'POST',
                            headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json', 'x-client-platform': 'web' },
                            body: JSON.stringify({ chat_session_id: id })
                        });
                        if (response.ok) {
                            successCount++; successfulIds.push(id); isSuccess = true;
                        } else failCount++;
                    } catch (err) { failCount++; }
                    if (onProgress) onProgress(id, isSuccess);
                    if (i < selectedIds.length - 1) await new Promise(r => setTimeout(r, 300));
                }
                return { successCount, failCount, successfulIds };
            }
        },
        'doubao': {
            id: 'doubao',
            match: () => location.hostname.includes('doubao.com'),
            selectors: { container: 'div[data-empty-conversation]', item: 'a[href*="/chat/"]' },
            extractId: (item) => {
                const match = (item.getAttribute('href') || '').match(/\/chat\/(\d+)/i);
                return match ? match[1] : null;
            },
            deleteApi: async (selectedIds, onProgress) => {
                const API_URL = '/im/conversation/batch_del_user_conv?device_platform=web&aid=497858';
                const payload = {
                    cmd: 4171, sequence_id: crypto.randomUUID(), channel: 2, version: "1",
                    uplink_body: { batch_delete_user_conversation_uplink_body: { conversation_id: selectedIds, delete_all: false, conversation_type: 3 } }
                };
                try {
                    const response = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json; encoding=utf-8', 'agw-js-conv': 'str', 'accept': 'application/json, text/plain, */*' },
                        body: JSON.stringify(payload)
                    });
                    if (response.ok) {
                        const resData = await response.json();
                        if (resData.status_code === 0 || !resData.status_code) {
                            selectedIds.forEach(id => onProgress && onProgress(id, true));
                            return { successCount: selectedIds.length, failCount: 0, successfulIds: selectedIds };
                        } else throw new Error(`网关业务报错: ${resData.status_code}`);
                    } else throw new Error(`HTTP请求失败: ${response.status}`);
                } catch (err) { return { successCount: 0, failCount: selectedIds.length, successfulIds: [] }; }
            }
        }
    };

    const currentPlatform = Object.values(PLATFORMS).find(p => p.match());
    if (!currentPlatform) return;

    // ================= 配置与状态 =================
    const STORAGE_KEY = `ai_batch_selected_sessions_${location.hostname}`;
    let isModeActive = false;
    let domObserver = null;
    let resizeObserver = null;

    function getSelectedIds() {
        try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
        catch { return new Set(); }
    }

    function saveSelectedIds(set) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    }

    function getElementId(item) {
        if (item.dataset.aiSessionId) return item.dataset.aiSessionId;
        const id = currentPlatform.extractId(item);
        if (id) item.dataset.aiSessionId = id;
        return id;
    }

    // ================= CSS 样式注入 =================
    const style = document.createElement('style');
    const itemSelector = currentPlatform.selectors.item; // 获取当前平台的原生选择器
    style.textContent = `
        body.ai-batch-mode ${itemSelector} { position: relative !important; padding-left: 36px !important; transition: background-color 0.2s !important; }
        body.ai-batch-mode ${itemSelector}.ai-ext-selected { background-color: rgba(255, 202, 202, 0.5) !important; }
        body.ai-batch-mode ${itemSelector}:hover { background-color: rgba(0,0,0,0.03) !important; }
        body.ai-batch-mode ${itemSelector}.ai-ext-selected:hover { background-color: rgba(252, 165, 165, 0.6) !important; }

        .ai-ext-checkbox {
            display: none !important; position: absolute; left: 10px; top: 50%; transform: translateY(-55%);
            margin: 0; z-index: 20; width: 16px; height: 16px; cursor: pointer; pointer-events: auto !important;
        }

        body.ai-batch-mode .ai-ext-checkbox { display: block !important; opacity: 1 !important; }

        .ai-ext-toolbar {
            display: none; position: fixed; flex-direction: row; align-items: center; justify-content: center;
            height: 40px; padding: 0 10px; background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(229, 231, 235, 0.9); border-radius: 10px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.15); z-index: 999999;
            transition: left 0.15s ease-out, top 0.15s ease-out, transform 0.15s ease-out;
        }
        body.ai-batch-mode .ai-ext-toolbar { display: flex; }

        .ai-ext-btn {
            width: 32px; height: 32px; border-radius: 50%; border: none; background: transparent;
            cursor: pointer; display: flex; justify-content: center; align-items: center;
            margin: 0 4px; transition: all 0.2s;
        }
        .ai-ext-btn:hover:not(:disabled) { background: #f3f4f6; }
        .ai-ext-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .ai-ext-btn svg { width: 18px; height: 18px; fill: #4b5563; }
        .ai-ext-btn.delete-btn:hover:not(:disabled) { background: #fee2e2; }
        .ai-ext-btn.delete-btn:hover:not(:disabled) svg { fill: #ef4444; }
        .ai-ext-btn.delete-btn.is-loading svg { animation: ai-spin 1s linear infinite; }

        .ai-ext-text { font-size: 13px; color: #4b5563; margin: 0 4px; font-weight: 600; font-family: ui-monospace, monospace; }
        .ai-ext-divider { width: 1px; height: 16px; background: #d1d5db; margin: 0 8px; }

        body.ai-batch-mode ${itemSelector}.ai-ext-deleting {
            opacity: 0 !important; transform: translateX(-20px) !important;
            height: 0 !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; border: 0 !important;
            overflow: hidden !important; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        @keyframes ai-spin { 100% { transform: rotate(360deg); } }

        /* ================= 模态框样式 ================= */
        .ai-ext-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.4); z-index: 9999999;
            display: flex; justify-content: center; align-items: center;
            opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0.2s;
            backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
        }
        .ai-ext-modal-overlay.ai-ext-show { opacity: 1; visibility: visible; }
        .ai-ext-modal {
            background: #ffffff; padding: 24px; border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2); max-width: 360px; width: 90%;
            transform: scale(0.95); transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .ai-ext-modal-overlay.ai-ext-show .ai-ext-modal { transform: scale(1); }
        .ai-ext-modal-title { font-size: 18px; font-weight: 600; color: #111827; margin: 0 0 12px 0; }
        .ai-ext-modal-body { font-size: 15px; color: #4b5563; margin: 0 0 24px 0; line-height: 1.5; white-space: pre-wrap; }
        .ai-ext-modal-footer { display: flex; justify-content: flex-end; gap: 12px; }
        .ai-ext-modal-btn {
            padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;
            border: none; transition: all 0.2s; outline: none;
        }
        .ai-ext-modal-btn.cancel { background: #f3f4f6; color: #374151; }
        .ai-ext-modal-btn.cancel:hover { background: #e5e7eb; }
        .ai-ext-modal-btn.confirm { background: #ef4444; color: #ffffff; }
        .ai-ext-modal-btn.confirm:hover { background: #dc2626; }
        .ai-ext-modal-btn.alert { background: #3b82f6; color: #ffffff; }
        .ai-ext-modal-btn.alert:hover { background: #2563eb; }
    `;
    document.head.appendChild(style);

    // ================= 自定义模态框逻辑 =================
    function showModal({ title, message, type = 'confirm' }) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'ai-ext-modal-overlay';

            const modal = document.createElement('div');
            modal.className = 'ai-ext-modal';

            const titleEl = document.createElement('div');
            titleEl.className = 'ai-ext-modal-title';
            titleEl.textContent = title;

            const bodyEl = document.createElement('div');
            bodyEl.className = 'ai-ext-modal-body';
            bodyEl.textContent = message;

            const footer = document.createElement('div');
            footer.className = 'ai-ext-modal-footer';

            const closeModal = (result) => {
                overlay.classList.remove('ai-ext-show');
                setTimeout(() => { overlay.remove(); resolve(result); }, 200);
            };

            if (type === 'confirm') {
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'ai-ext-modal-btn cancel';
                cancelBtn.textContent = '取消';
                cancelBtn.onclick = () => closeModal(false);

                const confirmBtn = document.createElement('button');
                confirmBtn.className = 'ai-ext-modal-btn confirm';
                confirmBtn.textContent = '删除';
                confirmBtn.onclick = () => closeModal(true);

                footer.append(cancelBtn, confirmBtn);
            } else {
                const okBtn = document.createElement('button');
                okBtn.className = 'ai-ext-modal-btn alert';
                okBtn.textContent = '我知道了';
                okBtn.onclick = () => closeModal(true);
                footer.append(okBtn);
            }

            modal.append(titleEl, bodyEl, footer);
            overlay.append(modal);
            document.body.appendChild(overlay);

            // 点击背景关闭 (仅警告框点击背景返回 true，确认框返回 false)
            overlay.onclick = () => closeModal(type === 'alert');
            modal.onclick = (e) => e.stopPropagation();

            // 触发动画
            requestAnimationFrame(() => overlay.classList.add('ai-ext-show'));
        });
    }

    // ================= 原生构建工具栏 =================
    const toolbar = document.createElement('div');
    toolbar.className = 'ai-ext-toolbar';

    const cancelBtn = document.createElement('button'); cancelBtn.className = 'ai-ext-btn cancel-btn'; cancelBtn.title = '清空选中';
    const cancelSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); cancelSvg.setAttribute('viewBox', '0 0 24 24');
    const cancelPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); cancelPath.setAttribute('d', 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z');
    cancelSvg.appendChild(cancelPath); cancelBtn.appendChild(cancelSvg);

    const countSelectedEl = document.createElement('span'); countSelectedEl.className = 'ai-ext-text selected-count'; countSelectedEl.textContent = '0';
    const divider = document.createElement('div'); divider.className = 'ai-ext-divider';
    const countTotalEl = document.createElement('span'); countTotalEl.className = 'ai-ext-text total-count'; countTotalEl.textContent = '0';

    const deleteBtn = document.createElement('button'); deleteBtn.className = 'ai-ext-btn delete-btn'; deleteBtn.title = '批量删除';
    const deleteSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); deleteSvg.setAttribute('viewBox', '0 0 24 24');
    const deletePath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); deletePath.setAttribute('d', 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z');
    deleteSvg.appendChild(deletePath); deleteBtn.appendChild(deleteSvg);

    toolbar.append(cancelBtn, countSelectedEl, divider, countTotalEl, deleteBtn);
    document.body.appendChild(toolbar);

    // ================= 核心渲染与定位逻辑 =================
    function updateToolbarPosition() {
        const scrollArea = document.querySelector(currentPlatform.selectors.container);
        let validSidebar = false;

        if (scrollArea) {
            const leftSidebar = document.querySelector('nav') || scrollArea;
            const alignRect = leftSidebar.getBoundingClientRect();

            if (alignRect.width > 0 && alignRect.height > 0 && alignRect.right > 0 && alignRect.bottom > 0) {
                let centerX = alignRect.left + alignRect.width / 2;
                centerX = Math.max(80, Math.min(centerX, window.innerWidth - 80));

                let safeTop = alignRect.bottom - 48;
                if (safeTop > window.innerHeight - 60 || safeTop <= 0) {
                    safeTop = window.innerHeight - 60;
                }

                toolbar.style.left = `${centerX}px`;
                toolbar.style.top = `${safeTop}px`;
                toolbar.style.bottom = 'auto';
                toolbar.style.transform = 'translateX(-50%)';
                validSidebar = true;
            }
        }

        if (!validSidebar) {
            toolbar.style.left = '30px';
            toolbar.style.bottom = '30px';
            toolbar.style.top = 'auto';
            toolbar.style.transform = 'none';
        }
    }

    function injectAllItems() {
        const container = document.querySelector(currentPlatform.selectors.container);
        if (!container) return;

        let hasNew = false;
        container.querySelectorAll(currentPlatform.selectors.item).forEach(item => {
            if (item.classList.contains('ai-ext-item')) return;
            const id = getElementId(item);
            if (!id) return;

            item.classList.add('ai-ext-item');
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.className = 'ai-ext-checkbox'; cb.dataset.id = id;

            cb.addEventListener('click', (e) => e.stopPropagation());
            cb.addEventListener('change', (e) => {
                const selectedIds = getSelectedIds();
                if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
                saveSelectedIds(selectedIds);
                updateUI();
            });

            item.insertBefore(cb, item.firstChild);
            hasNew = true;
        });
        if (hasNew) updateUI();
    }

    function updateUI() {
        if (!isModeActive) return;

        if (!document.body.contains(toolbar)) {
            document.body.appendChild(toolbar);
        }

        const selectedIds = getSelectedIds();
        const items = document.querySelectorAll('.ai-ext-item');

        countSelectedEl.textContent = selectedIds.size;
        countTotalEl.textContent = items.length;
        deleteBtn.disabled = selectedIds.size === 0;

        items.forEach(item => {
            const id = getElementId(item);
            if (id) {
                const cb = item.querySelector('.ai-ext-checkbox');
                if (cb) {
                    const isSelected = selectedIds.has(id);
                    if (cb.checked !== isSelected) cb.checked = isSelected;

                    if (isSelected && !item.classList.contains('ai-ext-selected')) {
                        item.classList.add('ai-ext-selected');
                    } else if (!isSelected && item.classList.contains('ai-ext-selected')) {
                        item.classList.remove('ai-ext-selected');
                    }
                }
            }
        });
        updateToolbarPosition();
    }

    function removeDomItemWithAnimation(id) {
        const checkbox = document.querySelector(`.ai-ext-checkbox[data-id="${id}"]`);
        if (checkbox) {
            const item = checkbox.closest('.ai-ext-item');
            if (item) {
                item.style.height = item.offsetHeight + 'px';
                void item.offsetHeight;
                item.classList.add('ai-ext-deleting');
                setTimeout(() => item.remove(), 400);
            }
        }
    }

    // ================= 监听器管理 =================
    function startObservers() {
        stopObservers();
        injectAllItems();
        updateUI();

        let debounceTimer = null;
        domObserver = new MutationObserver(() => {
            if (!isModeActive) return;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                injectAllItems();
                updateUI();
            }, 200);
        });
        domObserver.observe(document.body, { childList: true, subtree: true });

        let resizeTimer = null;
        resizeObserver = new ResizeObserver(() => {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => updateToolbarPosition(), 100);
        });

        resizeObserver.observe(document.body);
    }

    function stopObservers() {
        if (domObserver) domObserver.disconnect();
        if (resizeObserver) resizeObserver.disconnect();
    }

    // ================= 事件绑定 =================
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F8' || e.key === 'F2') {
            isModeActive = !isModeActive;
            document.body.classList.toggle('ai-batch-mode', isModeActive);

            if (isModeActive) {
                toolbar.style.display = 'flex';
                startObservers();
            } else {
                toolbar.style.display = 'none';
                stopObservers();
            }
        }
    });

    cancelBtn.addEventListener('click', () => {
        saveSelectedIds(new Set()); updateUI();
    });

    deleteBtn.addEventListener('click', async () => {
        const selectedIds = Array.from(getSelectedIds());
        if (selectedIds.length === 0) return;

        // 这里替换了原有的 confirm，改用我们自定义的 Promise 模态框
        const isConfirmed = await showModal({
            title: '确认删除',
            message: `确定要在当前平台删除 ${selectedIds.length} 个对话吗？\n此操作不可恢复。`,
            type: 'confirm'
        });
        if (!isConfirmed) return;

        deleteBtn.disabled = true; cancelBtn.disabled = true; deleteBtn.classList.add('is-loading');

        const result = await currentPlatform.deleteApi(selectedIds, (id, isSuccess) => {
            if (isSuccess) removeDomItemWithAnimation(id);
            updateUI();
        });

        const currentSet = getSelectedIds();
        result.successfulIds.forEach(id => currentSet.delete(id));
        saveSelectedIds(currentSet);
        updateUI();

        deleteBtn.classList.remove('is-loading'); deleteBtn.disabled = false; cancelBtn.disabled = false;
        
        // 结束后的提示也替换为了模态框
        setTimeout(async () => {
            if (typeof showTopToast === 'function') {
                showTopToast(`😊 成功删除 ${result.successCount} 个对话`);
            } else {
                await showModal({
                    title: '处理完毕',
                    message: `成功删除：${result.successCount} 个\n删除失败：${result.failCount} 个`,
                    type: 'alert'
                });
            }
            
        }, 150);
    });

};