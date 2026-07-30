const promptSelector={
    'chat.deepseek.com': 'textarea',
    'chatgpt.com': 'div[contenteditable="true"]',
    'www.kimi.com': 'div.chat-editor',
    'www.doubao.com': 'textarea',
    'metaso.cn': 'form[class^="search-consult-textarea_search-consult-input-wrapper"]',
    'gemini.google.com':'div.text-input-field' ,
    'chatglm.cn': '#search-input-box',
    'chat.z.ai': 'div.messageInputContainer',
    'grok.com': 'div[dir="ltr"]',
    'www.wenxiaobai.com': 'div[class^="MsgInput_input_container"]',
    'yiyan.baidu.com': 'div[class^="inputWrapper"]',
    'yuanbao.tencent.com':'div.agent-dialogue__content--common__input-box',
    'www.qianwen.com': 'div[class^="inputOutWrap"]',
    'aistudio.google.com': 'div.prompt-box-container',
}
// 定义需要按住 Ctrl/Cmd + Enter 才能发送的网站域名片段
const MODIFIER_SEND_SITES = [
    'aistudio.google.com'
    // 你可以在这里继续添加...
];
const link1 = document.createElement('link');
link1.id = 'Remix-icon-link';
link1.rel = 'stylesheet';
link1.href = chrome.runtime.getURL('libs/remixicon.css');
document.head.appendChild(link1);
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
async function checkUIMM() {
    const response = await chrome.runtime.sendMessage({ action: 'check_status' });
    if (response && response.isChro === true) {
        return true;
    }else{
        return false;
    }  
}


const COMMON_SETTINGS = {
    enableShortcutGrab: true,
    enablePinyinWake: true,         // 拼音简写唤醒控制
    enableShortcutPreview: true,    // 快捷键预览
    enableShortcutNumber: true,     // 快捷键数字
    enableShortcutEnter: true,      // 快捷键回车
    cnWakeThreshold: 2,
    enWakeThreshold: 2,
    pinWakeThreshold: 2,
    suggestionBoxWidth: 320
};

// --- START OF FILE common.js ---
let commonSettings = { ...COMMON_SETTINGS };
let shortcuts = [];
let allCategories = [];
let isComposing = false;

// --- UI 状态 ---
let suggestionBox = null;      
let activeMatches = [];        
let selectedIndex = 0;         
let currentInputTarget = null; // 记录当前输入框

// 【新增】按键导航定时器变量
let navTimer = null;
let navInterval = null;
let cursorRect = null;
// 定义一个全局变量用于存储幽灵层
let ghostBox = null;
(async function() {
    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initPrompt);
        } else {
            initPrompt();
        }
    } catch (e) {
        console.log("Plugin init error:", e);
    }
})();

async function initPrompt() {
    // 1. 先加载配置 (改用 Promise 确保顺序)
    const settings = await new Promise(resolve => {
        chrome.storage.local.get(COMMON_SETTINGS, resolve);
    });
    commonSettings = { ...COMMON_SETTINGS, ...settings };   // 合并配置
    // 如果当前脚本运行在 iframe 内部（如邮箱登录框）
    if (window.self !== window.top) {
        // 将提示框宽度调小，防止超出小窗边界
        // 你可以根据需要调整这个数值，比如 200 或 220
        commonSettings.suggestionBoxWidth = 300; 
        // console.log('iframe 内部，调整提示框宽度为：', commonSettings.suggestionBoxWidth);
    }
    
    // 2. 加载并处理数据
    const result1 = await chrome.storage.local.get('shortcutsData');
    shortcuts = preprocessShortcuts(result1.shortcutsData || []);
    const result2 = await chrome.storage.local.get('shortcutCategories');
    allCategories = result2.shortcutCategories || [];
    // console.log('Shortcuts and Categories loaded:', allCategories);
    await initCmdModal();       // 初始化快捷指令模态框
    // 3. 创建 UI
    if (await checkUIMM()){
        injectStyles();
        createSuggestionBox();
        initPromptListeners();
        if (!location.href.includes('feishu.cn'))initPromptGrab();
    }
};
// 【修复】监听器现在也需要调用预处理
chrome.storage.onChanged.addListener( async(changes, namespace) => {
    if (namespace === 'local') {
        if (changes.shortcutsData) {
            // 关键：这里必须重新进行拼音处理！
            shortcuts = changes.shortcutsData.newValue || [];
            // console.log('Shortcuts updated via storage change');
        }else if(changes.shortcutCategories){
            allCategories = changes.shortcutCategories.newValue || [];
        }
        // 更新配置
        for (let key in changes) {
            if (key in commonSettings) {
                commonSettings[key] = changes[key].newValue;
            }
        }
    }
});


// #region 拼音匹配

// --- 辅助函数：改进版拼音匹配详情 (最终完美融合版：偏移修复 + 全拼支持 + 英文精确) ---
function getPinyinMatchDetail(input, item) {
    const pinyinList=item._pinyinList;
    const initialList=item._initialList
    if (!input || !pinyinList || !initialList) return { isMatch: false, count: 0, wordCount: 0, matchIndex: -1 };

    const lowerInput = input.toLowerCase();
    
    // 1. 归一化输入：zh->z, ch->c, sh->s
    const fuzzyInput = lowerInput
        .replace(/zh/g, 'z')
        .replace(/ch/g, 'c')
        .replace(/sh/g, 's');

    // 2. 构建 1对1 搜索字符串 (用于中文缩写：zwrs)
    const searchString = item._searchString;
    
    // 3. 原始字符串 (用于英文精确：docheight)
    const rawString = item._rawString;

    // --- 策略 A: 尝试【精确输入】(只针对英文 / 无多字符声母的情况) ---
    // 【关键安全锁】：只有当字符串长度和列表长度一致时(说明没有zh/ch/sh这种)，才允许精确匹配。
    // 否则 zhwrs (len 5) 匹配 wr (index 2) 会导致中文高亮偏移。
    if (rawString.length === initialList.length) {          // 没有zh/ch/sh这种时才相等
        const exactIndex = rawString.indexOf(lowerInput);
        if (exactIndex !== -1) {
            return { 
                isMatch: true, 
                count: input.length,       
                wordCount: input.length,   
                matchIndex: exactIndex     
            }; 
        }
    }

    // --- 策略 B: 尝试【模糊首字母】(针对中文缩写：wr -> 文润) ---
    // 场景：key="中文润色"(zwrs), input="wr" -> index 1
    const fuzzyIndex = searchString.indexOf(fuzzyInput);
    if (fuzzyIndex !== -1) {
        return { 
            isMatch: true, 
            count: input.length,          
            wordCount: fuzzyInput.length, // 匹配字数 (z->1)
            matchIndex: fuzzyIndex        
        }; 
    }

    // --- 策略 C: 【全拼/混合匹配】(针对全拼：zhongwen) ---
    // 预处理拼音列表 (zh -> z)
    const fuzzyPinyins = item._fuzzyPinyins;
    const fuzzyInits = item._fuzzyInits;

    // 尝试从每一个字开始匹配
    for (let startIndex = 0; startIndex < fuzzyPinyins.length; startIndex++) {
        let tempInput = fuzzyInput; 
        let currentWordCount = 0;
        
        for (let i = startIndex; i < fuzzyPinyins.length; i++) {
            if (tempInput.length === 0) break;

            const p = fuzzyPinyins[i]; // 全拼
            const init = fuzzyInits[i]; // 首字母

            if (tempInput.startsWith(p)) {
                tempInput = tempInput.substring(p.length);
                currentWordCount++;
            } else if (tempInput.startsWith(init)) {
                tempInput = tempInput.substring(init.length);
                currentWordCount++;
            } else {
                break; 
            }
        }

        if (tempInput.length === 0 && currentWordCount > 0) {
            return { 
                isMatch: true, 
                count: input.length,       
                wordCount: currentWordCount, 
                matchIndex: startIndex     
            };
        }
    }
    
    return { isMatch: false, count: 0, wordCount: 0, matchIndex: -1 };
}
// -------------------------------------------------------------
// #region 1. 样式与 DOM
// -------------------------------------------------------------
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        #ai-shortcut-suggestion-box, #ai-ghost-preview, .hud-wrapper {
            /*原有变量...*/
            --ai-bg: #ffffff;
            --ai-border: #e5e7eb;
            --ai-text-main: #1f2937;
            --ai-text-sub: #9ca3af;
            --ai-hover-bg: #f3f4f6;
            --ai-selected-bg: #eff6ff;
            --ai-selected-text: #2563eb;
            --ai-highlight: #ec4899;
            --ai-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            --ai-scroll-thumb: #d1d5db;
            --ai-scroll-thumb-hover: #9ca3af;
            
            /* 【新增】编号背景色变量 */
            --ai-index-bg: #e6e6e8;
            --ai-index-text: #6b7280;
        }
        @media (prefers-color-scheme: dark) {
            #ai-shortcut-suggestion-box, #ai-ghost-preview, .hud-wrapper {
                --ai-bg: #1f2937;
                --ai-border: #374151;
                --ai-text-main: #f3f4f6;
                --ai-text-sub: #9ca3af;
                --ai-hover-bg: #374151;
                --ai-selected-bg: #374151;
                --ai-selected-text: #60a5fa;
                --ai-highlight: #f472b6;
                --ai-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
                --ai-scroll-thumb: #4b5563;
                --ai-scroll-thumb-hover: #6b7280;

                /* 【新增】暗色模式下的编号颜色 */
                --ai-index-bg: #434e62;
                --ai-index-text: #b5bdcb;
            }
        }

        #ai-shortcut-suggestion-box {
            position: fixed;
            z-index: 2147483647;
            background: var(--ai-bg);
            border: 1px solid var(--ai-border);
            border-radius: 8px; /*稍微圆润一点*/
            box-shadow: var(--ai-shadow);
            width: ${commonSettings.suggestionBoxWidth}px;
            max-height: 250px;
            overflow-y: auto;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px;
            color: var(--ai-text-main);
            padding: 6px; /* 增加一点内边距 */
            white-space: normal;
        }

        /* ... 滚动条样式保持不变 ... */
        #ai-shortcut-suggestion-box::-webkit-scrollbar { width: 6px; height: 6px; }
        #ai-shortcut-suggestion-box::-webkit-scrollbar-button { display: none; }
        #ai-shortcut-suggestion-box::-webkit-scrollbar-track { background: transparent; }
        #ai-shortcut-suggestion-box::-webkit-scrollbar-thumb { background: var(--ai-scroll-thumb); border-radius: 3px; }
        #ai-shortcut-suggestion-box::-webkit-scrollbar-thumb:hover { background: var(--ai-scroll-thumb-hover); }

        .ai-shortcut-item {
            padding: 8px 8px; /* 上下稍微宽松一点 */
            cursor: pointer;
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 5px; /* 【修改】减小文字和编号之间的间距 (原8px) */
            transition: background-color 0.1s;
            box-sizing: border-box;
            line-height: 1.5 ;  /* 强制重置行高，推荐 1.2 ~ 1.5 之间 */
        }
        .ai-shortcut-item.selected {
            background-color: var(--ai-selected-bg);
        }
        .ai-shortcut-item:hover {
            background-color: var(--ai-hover-bg);
        }

        /* --- 【核心修改】圆形编号样式 --- */
        .ai-shortcut-index {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 18px;            /* 固定宽度 */
            height: 18px;           /* 固定高度，与宽一致形成正圆 */
            border-radius: 50%;     /* 圆形 */
            background-color: var(--ai-index-bg);
            color: var(--ai-index-text);
            font-size: 11px;        /* 字体改小一点以适应圆圈 */
            font-weight: 700;       /* 加粗 */
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; /* 无衬线字体 */
            flex-shrink: 0;
            margin-right: 2px;      /* 微调与后面文字的距离 */
        }
        
        /* 选中状态下：编号变成“品牌色背景+白字”，类似徽章 */
        .ai-shortcut-item.selected .ai-shortcut-index {
            background-color: var(--ai-selected-text); 
            color: #ffffff; 
            opacity: 1;
        }

        .ai-shortcut-key-wrap {
            font-weight: 600; /* 稍微减重一点点，更精致 */
            color: var(--ai-text-main);
            flex-shrink: 0;
            font-size: 14px;
        }
        .ai-shortcut-item.selected .ai-shortcut-key-wrap {
            color: var(--ai-selected-text);
        }
        .ai-shortcut-preview {
            font-size: 12px;
            color: var(--ai-text-sub);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex-grow: 1;
            opacity: 0.8;
            margin-left: 4px; /* 预览文字稍微离远一点点 */
        }
        .ai-shortcut-match-hint {
            color: var(--ai-highlight);
        }

        /* --- 幽灵层核心样式重置 --- */
        #ai-ghost-preview {
            position: fixed;
            z-index: 2147483646; 
            pointer-events: none; /* 点击穿透 */
            background: transparent !important;
            color: transparent;   /* 容器文字透明，只显示内部的 span */
            margin: 0 !important;
            overflow: hidden;     /* 【解决溢出】把超出边框的幽灵文字切掉 */
            
            /* 关键：默认属性，具体值全靠 JS 复制 */
            white-space: pre;     
            word-wrap: normal;
            display: block;       /* 永远 Block，千万别用 Flex */
        }

        #ai-ghost-preview .ghost-text {
            color: #9ca3af; /* 灰色 */
            opacity: 0.6;
        }

        #ai-ghost-preview .invisible-text {
            opacity: 0;
            visibility: hidden;
        }
    `;
    document.head.appendChild(style);
}

function createSuggestionBox() {
    if (document.getElementById('ai-shortcut-suggestion-box')) return;
    suggestionBox = document.createElement('div');
    suggestionBox.id = 'ai-shortcut-suggestion-box';
    document.body.appendChild(suggestionBox);
    suggestionBox.addEventListener('mousedown', (e) => e.preventDefault());
    suggestionBox.addEventListener('click', (e) => {
        const item = e.target.closest('.ai-shortcut-item');
        if (item) {
            const index = parseInt(item.dataset.index);
            confirmSelection(index);
        }
    });
    createGhostBox();
}


let resizeTimer = null;
// 【新增】输入防抖计时器
let inputDebounceTimer = null;
// ==========================================================================================================
// #region 2. 监听逻辑
// ==========================================================================================================
function initPromptListeners() {
    window.addEventListener('resize', () => {
        // 如果没有正在交互的输入框，或者没有匹配项，直接忽略
        if (!currentInputTarget || activeMatches.length === 0) return;

        // 防抖：停止调整窗口 100ms 后再执行重绘，节省性能
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // 1. 重新渲染建议框 (会重新计算坐标)
            if (suggestionBox && suggestionBox.style.display !== 'none') {
                renderSuggestions(currentInputTarget);
            }

            // 2. 重新渲染幽灵文字 (会重新计算坐标)
            // 只有当幽灵文字当前是显示状态时才更新
            if (ghostBox && ghostBox.style.display !== 'none') {
                // 获取当前选中的建议文本
                const currentMatch = activeMatches[selectedIndex];
                if (currentMatch) {
                    updateGhost(currentInputTarget, currentMatch.value);
                }
            }
        }, 50); // 50-100ms 的延迟人眼几乎无感
    });
    window.addEventListener('compositionstart', () => { isComposing = true; }, true);
    window.addEventListener('compositionend', (e) => { 
        isComposing = false; 
        setTimeout(() => handleInput(e.target), 0);
    }, true);
    window.addEventListener('input', (e) => {
        if (isComposing) return;// 如果正在输入中文（选词阶段），不处理
        // 清除上一次的计时器（如果在等待期间又按键了，就取消上一次的任务）
        if (inputDebounceTimer) clearTimeout(inputDebounceTimer);

        // 设置新的计时器，100ms 后执行（时间可调，80-150ms 体验较好）
        inputDebounceTimer = setTimeout(() => {
            handleInput(e.target);
        }, 20);
    }, true);
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') {
            if (!isComposing) {
                // 同样的防抖逻辑
                if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
                inputDebounceTimer = setTimeout(() => {
                    handleInput(e.target);
                }, 20);
            }
        }
    }, true);
    window.addEventListener('blur', () => {
        setTimeout(hideSuggestions, 200);
    }, true);

    window.addEventListener('keydown', async(e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        const isBoxVisible = activeMatches.length > 0 && suggestionBox && suggestionBox.style.display !== 'none';

        if (isBoxVisible) {
            // --- 上下键导航 (定时器版) ---
             // 检查按键是否是 '1' 到 '9' 之间的数字
            if (commonSettings.enableShortcutNumber){
                // 【修改】检查按键是否是 '1' 到 '9' 之间的数字，或者 '空格'
                // 1. 定义按键类型
                const isSpace =false;// (e.key === ' ' || e.code === 'Space');
                const isNumber = (e.key >= '1' && e.key <= '9');

                // 2. 【核心冲突解决】
                // 只有同时满足以下条件才拦截：
                // A. 是数字键 或 空格键
                // B. 此时没有在使用输入法 (!isComposing) -> 关键！防止拦截中文选词
                if ((isNumber || isSpace) && !isComposing) {
                    
                    // 3. 计算目标索引
                    // 空格键 -> 等同于按 "1" -> 选中第 0 项
                    // 数字键 -> "1"对应0, "2"对应1...
                    const targetIndex = isSpace ? 0 : parseInt(e.key) - 1;
                    
                    // 4. 只有当索引有效时才执行，防止报错
                    if (targetIndex < activeMatches.length) {
                        e.preventDefault();  // 阻止输入空格/数字
                        e.stopPropagation(); // 阻止事件冒泡
                        await confirmSelection(targetIndex);
                        return; // 结束，防止后续逻辑（如盲打检测）被触发
                    }
                }
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();

                // 如果是系统自动触发的重复事件，直接忽略（我们用自己的定时器接管）
                if (e.repeat) return;

                const direction = e.key === 'ArrowUp' ? -1 : 1;

                // 1. 立即执行一次
                moveSelection(direction);

                // 2. 启动长按逻辑
                // 先清除可能存在的旧定时器
                clearTimeout(navTimer);
                clearInterval(navInterval);

                // 延迟 300ms 后开始连续切换 (模拟系统延迟)
                navTimer = setTimeout(() => {
                    // 每 80ms 切换一次 (速度可调：越小越快)
                    navInterval = setInterval(() => {
                        moveSelection(direction);
                    }, 80);
                }, 300);
                
                return;
            }

            if ((e.key === 'Enter' && commonSettings.enableShortcutEnter )|| e.key === 'Tab') { 
                e.preventDefault(); 
                e.stopPropagation(); 
                await confirmSelection(selectedIndex); 
                return; 
            }
            
            if (e.key === 'Enter' && !commonSettings.enableShortcutEnter ){
                hideSuggestions();
            }

            if (e.key === 'Escape') { 
                e.preventDefault(); 
                hideSuggestions(); 
                return; 
            }
        }

        // 空格/Tab 盲打触发逻辑 (保持不变)
        const isTriggerKey = (e.code === 'Space' || e.key === ' ' || e.key === 'Tab');
        if (isTriggerKey) {
            if (isComposing) return;
            const target = e.target;
            if (!target) return;
            const textBefore = getTextBeforeCursor(target);
            if (!textBefore) return;
            const lowerTextBefore = textBefore.toLowerCase();
            const exactMatch = shortcuts.find(item => item.active && lowerTextBefore.endsWith(item.key.toLowerCase()));
            if (exactMatch) {
                e.preventDefault(); e.stopPropagation();
                await performReplacement(target, exactMatch.value, exactMatch.key.length);
                hideSuggestions();
            }
        }
    }, true);

    // 【新增】监听按键抬起，停止连续切换
    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // 清除定时器，停止滚动
            clearTimeout(navTimer);
            clearInterval(navInterval);
        }
    }, true);
    document.addEventListener('click', (e) => {
        if (suggestionBox && !suggestionBox.contains(e.target) && e.target !== currentInputTarget) {
            hideSuggestions();
        }
    });
}

// #region 处理输入
function handleInput(target) {
    if (!target) return;
    currentInputTarget = target; 
    addScrollListener(target);
    const textBefore = getTextBeforeCursor(target);
    if (!textBefore || textBefore.trim().length === 0) { 
        hideSuggestions(); 
        return; 
    }

    const MAX_BUFFER_LEN = 15; 
    const tailText = textBefore.slice(-MAX_BUFFER_LEN); 
    const lowerTail = tailText.toLowerCase();
    // console.log('handleInput:', lowerTail );
    // 1. 初始长度拦截
    // 注意：这里依然使用 enWakeThreshold 来拦截过短的英文输入(如只输入一个'a')，
    // 防止性能浪费。只有当输入长度达标后，才进入内部的拼音匹配。
    const isChineseLast = /[\u4e00-\u9fa5]/.test(tailText.slice(-1));
    const inputThreshold = isChineseLast 
        ? (commonSettings.cnWakeThreshold || 1) 
        : (commonSettings.enWakeThreshold || 2);

    if (tailText.trim().length < inputThreshold) {
        hideSuggestions();
        return;
    }

    activeMatches = [];

    shortcuts.forEach(item => {
        if (!item.active) return;
        
        const key = item.key;
        const lowerKey = key.toLowerCase();
        
        let score = 0;
        let matchedLen = 0; 
        let hlStart = 0; 
        let hlEnd = 0;      

        const maxProbeLen = Math.min(tailText.length, 15); 

        for (let len = maxProbeLen; len >= inputThreshold; len--) {
            const candidateInput = lowerTail.slice(-len); 
            
            // --- A. 字面量匹配 ---
            const index = lowerKey.indexOf(candidateInput); // 查找用户输入在关键词中的位置
            if (index > -1) {
                const currentScore = index === 0 ? 100 : 60;
                if(currentScore > score) {
                    score = currentScore;
                    matchedLen = len;
                    hlStart = index;
                    hlEnd = index + len;
                }
            }

            // --- B. 拼音匹配 ---
            if (commonSettings.enablePinyinWake && item._pinyinList && score < 80 && len>=commonSettings.pinWakeThreshold) {
                const res = getPinyinMatchDetail(candidateInput, item);
                
                if (res.isMatch) {
                    // 【核心修复】
                    // 无论输入的是英文还是中文，拼音匹配出的 wordCount 含义是“匹配了几个汉字”。
                    // 所以这里必须强制与“中文唤醒阈值”进行比较。
                    // 修复前：使用了 inputThreshold (可能是2)，导致 cn=1 时输入 zh(2字符) 匹配 中(1字) 被拦截。
                    // 修复后：直接用 cnWakeThreshold (1)，1 < 1 为 false，保留匹配。
                    const cnThreshold = commonSettings.cnWakeThreshold || 1;
                    
                    if (res.wordCount < cnThreshold) {
                        continue; // 匹配的汉字太少，不显示
                    }

                    const currentScore = res.matchIndex === 0 ? 80 : 70;
                    if (score < currentScore) {
                        score = currentScore;
                        matchedLen = len;        
                        hlStart = res.matchIndex; 
                        hlEnd = res.matchIndex + res.wordCount; 
                    }
                }
            }
        }

        if (score > 0) {
            activeMatches.push({
                ...item,
                score: score,
                matchLen: matchedLen,     
                highlightStart: hlStart, 
                highlightEnd: hlEnd      
            });
        }
    });

    activeMatches.sort((a, b) => {
        // 1. 优先按匹配分数降序
        if (b.score !== a.score) return b.score - a.score;
        
        // 2. 【新增】分数相同，按使用次数降序 (使用次数多的排前面)
        const countA = a.usageCount || 0;
        const countB = b.usageCount || 0;
        if (countA !== countB) return countB - countA;

        // 3. 次数相同，按匹配长度 (越长的通常越精确)
        if (b.matchLen !== a.matchLen) return b.matchLen - a.matchLen;
        
        // 4. 最后按 Key 长度 (短的排前面，符合直觉)
        return a.key.length - b.key.length;
    });

    if (activeMatches.length > 0) {
        selectedIndex = 0;
        renderSuggestions(target);
    } else {
        hideSuggestions();
    }
}
// -------------------------------------------------------------
// #region 3. UI 渲染
// -------------------------------------------------------------
function renderSuggestions(target) {
    if (!suggestionBox) return;
    suggestionBox.style.width = `${commonSettings.suggestionBoxWidth}px`;

    suggestionBox.innerHTML = activeMatches.map((item, index) => {
        const key = item.key;
        
        // 【修改点】根据动态计算的 Start 和 End 进行切割
        // part1: 高亮前的部分 (如 "中文")
        const part1 = escapeHtml(key.substring(0, item.highlightStart)); 
        // partMatch: 高亮部分 (如 "润色")
        const partMatch = escapeHtml(key.substring(item.highlightStart, item.highlightEnd));
        // part2: 高亮后的部分 (如有)
        const part2 = escapeHtml(key.substring(item.highlightEnd));
        // 只为前9项生成序号 (1-9)，超过的不显示或者你可以选择显示 0
        // const indexHtml = index < 9 
        //     ? `<span class="ai-shortcut-index">${index + 1}</span>` 
        //     : `<span class="ai-shortcut-index" style="visibility:hidden"></span>`; // 超过9的不显示数字，但保留占位防止文字错位
        const indexHtml =  `<span class="ai-shortcut-index">${index + 1}</span>` 
        return `
        <div class="ai-shortcut-item ${index === selectedIndex ? 'selected' : ''}" data-index="${index}">
            ${indexHtml} <!-- 插入序号 -->
            <div class="ai-shortcut-key-wrap">
                ${part1}<span class="ai-shortcut-match-hint">${partMatch}</span>${part2}
            </div>
            <div class="ai-shortcut-preview">${escapeHtml(item.value)}</div>
        </div>
        `;
    }).join('');

    suggestionBox.style.display = 'block';

    cursorRect = getCursorAbsolutePosition(target);
    let finalLeft = cursorRect.left;
    const boxWidth = commonSettings.suggestionBoxWidth;
    if (finalLeft + boxWidth > window.innerWidth) finalLeft = window.innerWidth - boxWidth - 10;
    suggestionBox.style.left = `${finalLeft}px`;

    const boxHeight = suggestionBox.offsetHeight;

    if (commonSettings.enableShortcutPreview){
        // 策略：只要上方空间足够容纳列表，就优先显示在上方；否则才显示在下方
        // 这样可以最大程度避免遮挡光标后面的幽灵文字
        const spaceAbove = cursorRect.top; // 光标上方的可用空间
        if (spaceAbove > boxHeight + 10) {
            suggestionBox.style.top = 'auto';
            // 留出 5-10px 的间隙
            suggestionBox.style.bottom = `${window.innerHeight - cursorRect.top + 10}px`; 
        } else {
            // 上方空间不够，只能显示在下方
            suggestionBox.style.top = `${cursorRect.bottom + 10}px`;
            suggestionBox.style.bottom = 'auto';
        }
    }else{
        const spaceBelow = window.innerHeight - cursorRect.bottom;
        if (spaceBelow < boxHeight + 10 && cursorRect.top > boxHeight + 10) {
            suggestionBox.style.top = 'auto';
            suggestionBox.style.bottom = `${window.innerHeight - cursorRect.top + 4}px`;
        } else {
            suggestionBox.style.top = `${cursorRect.bottom + 4}px`;
            suggestionBox.style.bottom = 'auto';
        }

    }

    // 【新增】渲染完列表后，立即显示当前选中项（默认第0项）的幽灵文字
    if (activeMatches.length > 0) {
        updateGhost(target, activeMatches[selectedIndex].value);
    }
}
// 【核心升级】：获取光标绝对位置 (X 和 Y)
function getCursorAbsolutePosition(target) {
    // 默认返回值 (如果计算失败，返回输入框左下角)
    const defaultRect = target.getBoundingClientRect();
    let result = {
        left: defaultRect.left,
        top: defaultRect.top,
        bottom: defaultRect.bottom,
        height: 20
    };

    try {
        // --- A. AI 网站 (ContentEditable) ---
        if (target.isContentEditable) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                // getClientRects 能处理换行情况，通常比 getBoundingClientRect 准
                const rects = range.getClientRects();
                if (rects.length > 0) {
                    // 取最后一个矩形 (通常是光标位置)
                    const r = rects[rects.length - 1];
                    result = { left: r.left, top: r.top, bottom: r.bottom, height: r.height };
                    // 修正：如果是空行，left可能为0，尝试取容器left
                    if (result.left === 0 && defaultRect.left > 0) result.left = defaultRect.left;
                } else {
                    // 降级
                    const r = range.getBoundingClientRect();
                    if (r.left > 0 || r.top > 0) {
                        result = { left: r.left, top: r.top, bottom: r.bottom, height: r.height };
                    }
                }
            }
        }
        
        // --- B. Input / Textarea (影子模拟) ---
        else if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            const mirror = getMirrorDivPosition(target);
            // 影子计算的是相对于输入框左上角的偏移
            // 绝对位置 = 输入框绝对位置 + 偏移 - 滚动
            const borderTop = parseFloat(window.getComputedStyle(target).borderTopWidth) || 0;
            const borderLeft = parseFloat(window.getComputedStyle(target).borderLeftWidth) || 0;
            
            result = {
                left: defaultRect.left + mirror.left + borderLeft - target.scrollLeft,
                top: defaultRect.top + mirror.top + borderTop - target.scrollTop,
                bottom: defaultRect.top + mirror.top + borderTop - target.scrollTop + 20, // 估算行高20
                height: 20
            };
            
            // Textarea 特殊修正：获取真实行高
            if (mirror.lineHeight) {
                result.bottom = result.top + mirror.lineHeight;
                result.height = mirror.lineHeight;
            }
        }
    } catch (e) {
        console.log('Cursor calc failed', e);
    }

    return result;
}

// 影子模拟法：同时计算 X 和 Y
function getMirrorDivPosition(origin) {
    const div = document.createElement('div');
    const style = window.getComputedStyle(origin);
    const properties = [
        'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
        'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
        'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'whiteSpace', 'wordBreak', 'wordWrap'
    ];
    properties.forEach(prop => div.style[prop] = style[prop]);
    
    div.style.position = 'absolute';
    div.style.top = '0px'; 
    div.style.left = '-9999px'; 
    div.style.visibility = 'hidden';
    
    if (origin.tagName === 'TEXTAREA') {
        div.style.whiteSpace = 'pre-wrap';
        div.textContent = origin.value.substring(0, origin.selectionEnd);
    } else {
        div.style.whiteSpace = 'pre';
        div.textContent = origin.value.substring(0, origin.selectionEnd);
    }

    const span = document.createElement('span');
    span.textContent = '|';
    div.appendChild(span);
    document.body.appendChild(div);

    const result = {
        left: span.offsetLeft,
        top: span.offsetTop,
        lineHeight: span.offsetHeight
    };
    
    document.body.removeChild(div);
    return result;
}



// 【新增】切换选中项的封装函数
function moveSelection(direction) {
    if (activeMatches.length === 0) return;
    
    // 计算新索引
    selectedIndex = (selectedIndex + direction + activeMatches.length) % activeMatches.length;
    
    // 更新 UI
    updateSelection();
    // 注意：这里传入 currentInputTarget，因为它在 handleInput 时被赋值了
    if (currentInputTarget) {
        updateGhost(currentInputTarget, activeMatches[selectedIndex].value);
    }
}
// -------------------------------------------------------------
// #region 5. 替换逻辑
// -------------------------------------------------------------
/**
 * 处理 Prompt 模板变量的函数
 * @param {string} template - 包含变量的原始 Prompt，例如 "请翻译：{{clipboard}}"
 * @returns {Promise<string>} - 返回替换完成后的最终字符串
 */
async function processPromptVariables(template) {
    // 如果模板为空，直接返回
    if (!template) return "";

    let finalPrompt = template;

    // --- 1. 处理剪贴板 {{clipboard}} (这是唯一的异步操作) ---
    if (finalPrompt.includes("{{clipboard}}")) {
        try {
            // 读取剪贴板文本
            const clipboardText = await navigator.clipboard.readText();
            // 使用 replaceAll 替换所有出现的变量
            finalPrompt = finalPrompt.replaceAll("{{clipboard}}", clipboardText || "");
        } catch (error) {
            // console.error("无法读取剪贴板:", error);
            // 如果读取失败（如没权限），替换为空或者提示用户
            finalPrompt = finalPrompt.replaceAll("{{clipboard}}", "[无法读取剪贴板]");
        }
    }

    // --- 2. 处理当前选中文本 {{selection}} ---

    // --- 3. 处理网页信息 {{title}}, {{url}} ---
    if (finalPrompt.includes("{{title}}")) {
        finalPrompt = finalPrompt.replaceAll("{{title}}", document.title || "");
    }
    
    if (finalPrompt.includes("{{url}}")) {
        finalPrompt = finalPrompt.replaceAll("{{url}}", window.location.href || "");
    }

    // --- 4. 处理时间日期 {{date}}, {{time}} ---
    const now = new Date();
    if (finalPrompt.includes("{{date}}")) {
        // 格式：2023-10-27
        const dateStr = now.toLocaleDateString('zh-CN').replace(/\//g, '-'); 
        finalPrompt = finalPrompt.replaceAll("{{date}}", dateStr);
    }
    
    if (finalPrompt.includes("{{time}}")) {
        // 格式：14:30
        const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        finalPrompt = finalPrompt.replaceAll("{{time}}", timeStr);
    }

    // --- 5. 高级：处理交互式输入 {{input:提示语}} ---
    // 正则匹配所有 {{input:xxx}} 格式
    const inputRegex = /{{input:(.*?)}}/g;
    let match;
    
    // 循环查找所有需要输入的变量
    // 注意：这里使用了 while 循环和 exec，因为可能有一条指令里有多个填空
    while ((match = inputRegex.exec(finalPrompt)) !== null) {
        const fullTag = match[0]; // 例如 "{{input:目标语言}}"
        const promptText = match[1]; // 例如 "目标语言"
        
        // 简单实现：使用浏览器原生弹窗让用户输入
        // 进阶实现：你可以调用你插件自定义的漂亮 Modal 弹窗
        const userInput = prompt(`请输入 ${promptText}:`, "");
        
        // 替换（如果用户取消，默认为空）
        finalPrompt = finalPrompt.replace(fullTag, userInput || "");
    }

    return finalPrompt;
}

async function confirmSelection(index) {
    const match = activeMatches[index];
    if (!match || !currentInputTarget) return;
    if (!await checkWeb())  return;
    // 【新增】记录使用次数并保存
    // 注意：match 是 activeMatches 中的副本，我们需要修改全局 shortcuts 数组中的原始对象
    const originalItem = shortcuts.find(item => item.id === match.id);
    if (originalItem) {
        // 初始化或累加 usageCount
        originalItem.usageCount = (originalItem.usageCount || 0) + 1;

        // 异步保存到 storage 和 IndexedDB (不阻塞后续 UI 操作)
        // 这里的保存策略是“即时保存”，保证数据不丢失
        (async () => {
            try {
                // 更新本地缓存
                await chrome.storage.local.set({ shortcutsData: shortcuts });
                // 更新 IndexedDB (根据你的架构，如果 background 依赖 IDB 也需要更新)
                await idbSet({ shortcutsData: shortcuts });
            } catch (e) {
                console.log("更新使用次数失败:", e);
            }
        })();
    }
    hideGhost(); // 【新增】在替换开始前隐藏，防止视觉重叠
    await performReplacement(currentInputTarget, match.value, match.matchLen);//
    if(originalItem.autoSend){
        setTimeout(() => {
            triggerEnter(currentInputTarget);
        }, 100); 
    }
    hideSuggestions();
    
}

async function performReplacement(target, replacement, deleteLength) {
    target.focus();
    replacement=await processPromptVariables(replacement);
    // A. 原生输入框：优先 execCommand 支持撤回
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const start = target.selectionEnd - deleteLength;
        const end = target.selectionEnd;
        target.setSelectionRange(start, end);
        const success = document.execCommand('insertText', false, replacement);
        if (!success && target.setRangeText) {
            target.setRangeText(replacement, start, end, 'end');
            target.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
    }

    // B. AI 网页 (ContentEditable)
    if (target.isContentEditable) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
            const rangeToSelect = document.createRange();
            const startOffset = Math.max(0, range.startOffset - deleteLength);
            rangeToSelect.setStart(range.startContainer, startOffset);
            rangeToSelect.setEnd(range.startContainer, range.startOffset);
            selection.removeAllRanges();
            selection.addRange(rangeToSelect);
        } else {
            try { for (let i = 0; i < deleteLength; i++) selection.modify('extend', 'backward', 'character'); } catch (e) {}
        }

        const url = window.location.href.toLowerCase();
        const isKimi = url.includes('kimi') || url.includes('yiyan');
        const isComplexAI = url.includes('deepseek') || url.includes('doubao');
        // 👈 增加对 Slate.js 编辑器的直接识别，这是最稳妥的特征匹配
        const isSlateEditor = target.hasAttribute('data-slate-editor');

        if (isKimi) {
            handleKimiReplacement(target, replacement, selection);
        } else if (isComplexAI || isSlateEditor) {
            triggerPasteEvent(target, replacement);
        } else {
            const success = document.execCommand('insertText', false, replacement);
            if (!success) triggerPasteEvent(target, replacement);
        }
    }
}

function handleKimiReplacement(target, replacement, selection) {
    const TEMP_PLACEHOLDER = '\u200b'; 
    let clearSuccess = false;
    try { clearSuccess = document.execCommand('insertText', false, TEMP_PLACEHOLDER); } catch (e) {}
    if (!clearSuccess) {
        try {
            const r = selection.getRangeAt(0);
            r.deleteContents();
            r.insertNode(document.createTextNode(TEMP_PLACEHOLDER));
            r.selectNodeContents(r.startContainer); 
            selection.removeAllRanges();
            selection.addRange(r);
            target.dispatchEvent(new Event('input', { bubbles: true }));
        } catch(e) {}
    }
    try { selection.modify('extend', 'backward', 'character'); } catch(e) {}
    triggerPasteEvent(target, replacement);
}
async function checkWeb() {
    const response = await chrome.runtime.sendMessage({ action: 'getSelector' });
    if (response && response.isChro === true) {
        return true;
    }else{
        return false;
    }  
}
// function triggerPasteEvent(target, text) {
//     try {
//         const dt = new DataTransfer();
//         dt.setData('text/plain', text);
//         const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
//         target.dispatchEvent(evt);
//         return evt.defaultPrevented;
//     } catch (e) { return false; }
// }

function triggerPasteEvent(target, text) {
    try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        // 有些富文本编辑器强依赖 text/html 才能正确解析粘贴
        dt.setData('text/html', text); 
        
        // 触发 beforeinput (很多现代框架依赖这个而不是 paste)
        const beforeInputEvt = new InputEvent('beforeinput', { inputType: 'insertFromPaste', data: text, bubbles: true, cancelable: true });
        target.dispatchEvent(beforeInputEvt);

        const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        target.dispatchEvent(evt);
        return evt.defaultPrevented;
    } catch (e) { return false; }
}

function getTextBeforeCursor(target) {
    let rawText = '';
    try {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            rawText = target.value.substring(0, target.selectionEnd);
        } else if (target.isContentEditable) {
            const selection = window.getSelection();
            if (!selection.rangeCount) return '';
            const range = selection.getRangeAt(0);
            if (range.startContainer.nodeType === Node.TEXT_NODE) {
                rawText = range.startContainer.textContent.substring(0, range.startOffset);
            } else {
                const preCaretRange = range.cloneRange();
                preCaretRange.selectNodeContents(target);
                preCaretRange.setEnd(range.endContainer, range.endOffset);
                rawText = preCaretRange.toString(); 
            }
        }
    } catch (e) { return ''; }
    return rawText.replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
}

function hideSuggestions() {
    if (suggestionBox) suggestionBox.style.display = 'none';
    activeMatches = [];
    hideGhost(); // 【新增】隐藏幽灵文字
}

function updateSelection() {
    if (!suggestionBox) return;
    
    // 使用 children 属性代替 querySelectorAll，性能更高
    const items = suggestionBox.children;
    
    // 移除旧的高亮
    const prevSelected = suggestionBox.querySelector('.ai-shortcut-item.selected');
    if (prevSelected) prevSelected.classList.remove('selected');

    // 添加新的高亮
    const currentItem = items[selectedIndex];
    if (currentItem) {
        currentItem.classList.add('selected');
        
        // 确保可视 (block: 'nearest' 避免不必要的剧烈跳动)
        currentItem.scrollIntoView({ block: 'nearest' });
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

/**
 * 智能回车发送
 * 根据当前域名判断是发送 Enter 还是 Ctrl/Cmd + Enter
 * @param {HTMLElement} target - 目标输入框
 */
function triggerEnter(target) {
    if (!target) return;

    // 1. 判断当前网站是否需要组合键
    const currentHost = window.location.hostname;
    const needModifier = MODIFIER_SEND_SITES.some(site => currentHost===site);
    console.log('需要Ctrl')
    // 2. 判断是否为 Mac 系统 (用于决定是按 Command 还是 Ctrl)
    // 现代浏览器通常用 navigator.userAgentData 或 navigator.platform
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform) || 
                  (navigator.userAgent && navigator.userAgent.includes('Mac'));

    // 3. 构造事件参数
    const eventProps = {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,     // 必须冒泡
        cancelable: true,  // 必须可取消
        composed: true,
        // 如果在特殊网站列表里：
        // Windows/Linux 触发 ctrlKey
        // Mac 触发 metaKey (Command键) 和 ctrlKey (为了兼容性通常两个都设为true或者只设meta)
        ctrlKey: needModifier ? !isMac : false, 
        metaKey: needModifier ? isMac : false   
    };

    // 4. 触发 input 事件 (确保 React/Vue 框架感知到文本变化，防止发送空内容)
    target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

    // 5. 模拟完整的按键流程 (KeyDown -> KeyPress -> KeyUp)
    // 大多数网站监听的是 keydown
    target.dispatchEvent(new KeyboardEvent('keydown', eventProps));
    target.dispatchEvent(new KeyboardEvent('keypress', eventProps));
    target.dispatchEvent(new KeyboardEvent('keyup', eventProps));
}
// ==========================================================================================================
// #region 6.幽灵文字
// ==========================================================================================================
function createGhostBox() {
    if (document.getElementById('ai-ghost-preview')) return;
    ghostBox = document.createElement('div');
    ghostBox.id = 'ai-ghost-preview';
    document.body.appendChild(ghostBox);
}
// #region 
/**
 * 显示/更新幽灵文字（带防溢出逻辑）
 * @param {HTMLElement} target - 当前输入框
 * @param {string} suggestionText - 要展示的完整文本
 */
/**
 * 完美修正版：Padding偏移 + 半行距补偿 + 自然换行
 * 解决：1. 幽灵文字下偏 (通过 half-leading 补偿)
 * 2. 幽灵文字挤在一起 (通过 text-indent 换行)
 * 3. 回车后位置乱飞 (通过 光标绝对定位)
 */
async function updateGhost(target, suggestionText) {
    if (!commonSettings.enableShortcutPreview) return;
    if (!ghostBox || !target || !suggestionText) return;

    // 1. 获取基础尺寸
    const rect = target.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(target);
    const finalSuggestion = await processPromptVariables(suggestionText);

    // 2. 同步基础样式
    const stylesToCopy = [
        'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 
        'letterSpacing', 'textTransform', 'textAlign', 
        'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth', 'borderStyle'
    ];
    stylesToCopy.forEach(key => ghostBox.style[key] = computedStyle[key]);
    
    // 3. 基础容器设置
    ghostBox.style.display = 'block';
    ghostBox.style.boxSizing = 'border-box';
    ghostBox.style.zIndex = '2147483646';
    ghostBox.style.color = 'transparent'; 
    ghostBox.style.backgroundColor = 'transparent';
    ghostBox.style.overflow = 'hidden'; 
    
    // === 分支 A: ContentEditable (AI 网页核心逻辑) ===
    if (target.isContentEditable) {
        const cursorPos = getCursorAbsolutePosition(target);
        
        // 容错
        if (!cursorPos || cursorPos.left === 0 || cursorPos.top === 0) {
            hideGhost();
            return;
        }

        // A1. 容器全覆盖定位
        ghostBox.style.position = 'fixed';
        ghostBox.style.left = `${rect.left}px`;
        ghostBox.style.top = `${rect.top}px`;
        ghostBox.style.width = `${rect.width}px`;
        ghostBox.style.height = `${rect.height}px`;

        // A2. 【核心修复】计算半行距补偿 (Half-Leading Correction)
        // 目的：消除因为 line-height 导致的文字下偏
        let verticalCorrection = 0;
        const lhStr = computedStyle.lineHeight;
        const fsVal = parseFloat(computedStyle.fontSize);
        let lhVal = parseFloat(lhStr);

        // 处理 'normal' 或无单位的情况 (浏览器默认通常是 1.2 倍)
        if (lhStr === 'normal') lhVal = fsVal * 1.2;
        else if (!isNaN(lhVal) && !lhStr.includes('px')) lhVal = fsVal * lhVal;
        
        // 如果行高大于光标高度，说明有垂直留白，需要向上修正
        // cursorPos.height 通常接近 fontSize 或 glyph height
        if (!isNaN(lhVal) && !isNaN(fsVal) && cursorPos.height > 0) {
            // 计算单侧留白：(行高 - 光标高) / 2
            const diff = (lhVal - cursorPos.height) / 2;
            // 只有当差异合理时才补偿 (防止光标高度计算错误导致的抖动)
            if (diff > 0 && diff < fsVal) {
                verticalCorrection = diff;
            }
        }

        // A3. 计算相对位置
        const relativeTop = cursorPos.top - rect.top;
        const relativeLeft = cursorPos.left - rect.left;

        // A4. 应用垂直偏移 (减去 compensation)
        // 这样：PaddingTop(光标顶) - 补偿值 + 文字自带留白 = 完美的视觉对齐
        ghostBox.style.paddingTop = `${Math.max(0, relativeTop - verticalCorrection)}px`;
        ghostBox.style.paddingBottom = '0px';

        // A5. 应用水平偏移 (Text Indent 技巧)
        const paddingLeftVal = parseFloat(computedStyle.paddingLeft) || 0;
        const borderLeftVal = parseFloat(computedStyle.borderLeftWidth) || 0;
        const indentVal = relativeLeft - paddingLeftVal - borderLeftVal;
        ghostBox.style.textIndent = `${indentVal}px`;

        // A6. 样式收尾
        ghostBox.style.whiteSpace = 'pre-wrap';
        ghostBox.style.wordWrap = 'break-word';
        ghostBox.style.pointerEvents = 'none'; // 确保点击穿透

        // A7. 填充内容
        ghostBox.innerHTML = '';
        const ghostSpan = document.createElement('span');
        ghostSpan.className = 'ghost-text';
        ghostSpan.style.color = '#9ca3af'; 
        ghostSpan.textContent = finalSuggestion;
        ghostBox.appendChild(ghostSpan);

        // 强制重置滚动 (因为我们是靠 padding 模拟位置的)
        ghostBox.scrollTop = 0;
        ghostBox.scrollLeft = 0;
        return;
    }

    // === 分支 B: Input / Textarea (保持不变) ===
    ghostBox.style.position = 'fixed';
    ghostBox.style.width = `${rect.width}px`;
    ghostBox.style.height = `${rect.height}px`;
    ghostBox.style.top = `${rect.top}px`;
    ghostBox.style.left = `${rect.left}px`;
    ghostBox.style.paddingTop = computedStyle.paddingTop;
    ghostBox.style.paddingBottom = computedStyle.paddingBottom;
    ghostBox.style.borderTopWidth = computedStyle.borderTopWidth;
    ghostBox.style.borderBottomWidth = computedStyle.borderBottomWidth;
    ghostBox.style.textIndent = '0px';

    if (target.tagName === 'INPUT') {
        ghostBox.style.whiteSpace = 'pre';
        ghostBox.style.overflowX = 'hidden'; 
        ghostBox.style.wordWrap = 'normal';
        ghostBox.style.paddingTop = '0px';
        ghostBox.style.paddingBottom = '0px';
        ghostBox.style.lineHeight = `${rect.height}px`;
    } else {
        ghostBox.style.whiteSpace = 'pre-wrap';
        ghostBox.style.overflowY = 'hidden'; 
        ghostBox.style.wordWrap = 'break-word';
    }

    const textBefore = getTextBeforeCursor(target);
    if (textBefore === null) { hideGhost(); return; }

    ghostBox.innerHTML = '';
    const invisibleSpan = document.createElement('span');
    invisibleSpan.className = 'invisible-text';
    invisibleSpan.textContent = textBefore;
    
    const ghostSpan2 = document.createElement('span');
    ghostSpan2.className = 'ghost-text';
    ghostSpan2.style.color = '#9ca3af';
    ghostSpan2.textContent = finalSuggestion;

    ghostBox.appendChild(invisibleSpan);
    ghostBox.appendChild(ghostSpan2);
    
    requestAnimationFrame(() => {
        ghostBox.scrollTop = target.scrollTop;
        ghostBox.scrollLeft = target.scrollLeft;
    });
}
async function updateGhost0(target, suggestionText) {
    if (!commonSettings.enableShortcutPreview) return;
    if (!ghostBox || !target || !suggestionText) return;

    const textBefore = getTextBeforeCursor(target);
    if (textBefore === null || textBefore === undefined) {
        hideGhost();
        return;
    }

    const rect = target.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(target);

    // 1. 锁死位置和大小 (box-sizing: border-box 是前提)
    ghostBox.style.width = `${rect.width}px`;
    ghostBox.style.height = `${rect.height}px`;
    ghostBox.style.top = `${rect.top}px`;
    ghostBox.style.left = `${rect.left}px`;
    ghostBox.style.boxSizing = 'border-box';
    ghostBox.style.display = 'block'; // 统一用 Block，不要用 Flex

    // 2. 区分处理
    if (target.tagName === 'INPUT') {
        // ===【核心修复：单行文本框】===
        // 策略：忽略 Input 的 padding-top/bottom，直接用 line-height = height 强制垂直居中
        
        // 复制字体
        ghostBox.style.fontSize = computedStyle.fontSize;
        ghostBox.style.fontFamily = computedStyle.fontFamily;
        ghostBox.style.fontWeight = computedStyle.fontWeight;
        ghostBox.style.letterSpacing = computedStyle.letterSpacing;
        ghostBox.style.textAlign = computedStyle.textAlign; // 比如 input 可能居中
        
        // 复制水平排版 (Padding Left/Right 必须由 input 决定)
        ghostBox.style.paddingLeft = computedStyle.paddingLeft;
        ghostBox.style.paddingRight = computedStyle.paddingRight;
        ghostBox.style.borderLeftWidth = computedStyle.borderLeftWidth;
        ghostBox.style.borderRightWidth = computedStyle.borderRightWidth;
        ghostBox.style.borderStyle = computedStyle.borderStyle;

        // 【关键】垂直方向强制归零，用行高撑开
        ghostBox.style.paddingTop = '0px';
        ghostBox.style.paddingBottom = '0px';
        ghostBox.style.borderTopWidth = computedStyle.borderTopWidth; // 边框还是要有的，否则位置不对
        ghostBox.style.borderBottomWidth = computedStyle.borderBottomWidth;
        
        // 【核武器】行高 = 盒子总高 - 边框 (如果 box-sizing 是 border-box)
        // 简单做法：直接等于 rect.height 通常就能完美居中
        ghostBox.style.lineHeight = `${rect.height}px`;
        
        // 单行特有样式
        ghostBox.style.whiteSpace = 'pre';
        ghostBox.style.overflowX = 'hidden'; 
        ghostBox.style.wordWrap = 'normal';

    } else {
        // ===【多行文本框 Textarea / ContentEditable】===
        // 策略：完全克隆所有样式，信任浏览器的原生排版
        
        const stylesToCopy = [
            'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 
            'letterSpacing', 'textTransform', 'textAlign', 'textIndent',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
            'borderStyle'
        ];
        stylesToCopy.forEach(key => ghostBox.style[key] = computedStyle[key]);
        
        ghostBox.style.whiteSpace = 'pre-wrap';
        ghostBox.style.overflowY = 'hidden'; 
        ghostBox.style.wordWrap = 'break-word';
    }

    // 3. 填充内容
    ghostBox.innerHTML = '';
    const invisibleSpan = document.createElement('span');
    invisibleSpan.className = 'invisible-text';
    invisibleSpan.textContent = textBefore;
    
    const ghostSpan = document.createElement('span');
    ghostSpan.className = 'ghost-text';
    ghostSpan.textContent = await processPromptVariables(suggestionText);

    ghostBox.appendChild(invisibleSpan);
    ghostBox.appendChild(ghostSpan);
    
    ghostBox.style.display = 'block';

    // 4. 滚动同步 (Input 横向，TextArea 纵向)
    requestAnimationFrame(() => {
        ghostBox.scrollTop = target.scrollTop;
        ghostBox.scrollLeft = target.scrollLeft;
    });
}
function hideGhost() {
    if (ghostBox) ghostBox.style.display = 'none';
}
// 在 initPromptListeners 或 handleInput 里补充：
// 无需修改，只需确认你已经有这个函数
function addScrollListener(target) {
    if (target._hasScrollListener) return;
    target.addEventListener('scroll', () => {
        if (ghostBox && ghostBox.style.display !== 'none') {
            // 实时同步滚动，这样幽灵文字就像钉在输入框里一样
            ghostBox.scrollTop = target.scrollTop;
            ghostBox.scrollLeft = target.scrollLeft;
        }
        // 滚动时建议隐藏建议框，但保留幽灵文字(体验更好)
        if (suggestionBox) suggestionBox.style.display = 'none';
    }, { passive: true });
    target._hasScrollListener = true;
}

// =============================================================================
// #region 快捷指令快捷收藏 (修复DeepSeek无法填入 + 智能输入增强版)
// =============================================================================


// --- START OF FILE function initPromptGrab() {.js ---
function initPromptGrab() {
    if (window.hasDeepChatSuperDrag) return;
    window.hasDeepChatSuperDrag = true;

    // --- 0. 环境感知 ---
    const currentHost = location.hostname;
    const isAiPage = (typeof promptSelector !== 'undefined') && (promptSelector.hasOwnProperty(currentHost));
    const aiInputSelector = isAiPage ? promptSelector[currentHost] : null;

    // --- 1. 容器创建 ---
    const host = document.createElement('div');
    host.id = 'deepchat-drag-root';
    Object.assign(host.style, {
        position: 'fixed', top: '0', left: '0',
        zIndex: '2147483647', pointerEvents: 'none'
    });
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const iconLink = document.createElement('link');
    iconLink.rel = 'stylesheet';
    iconLink.href = chrome.runtime.getURL('libs/remixicon.css');
    shadow.appendChild(iconLink);

    // --- 2. 样式注入 ---
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        :host {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            --bg-core: #ffffff; --bg-border: #cbd5e1; --icon-def: #64748b; --text-main: #334155; --text-sub: #64748b;
            --hover-bg: #f1f5f9; --shadow-color: rgba(0,0,0,0.15);
            /* 激活色 */
            --c-save: #10b981; --c-edit: #4388f7; --c-search: #f59e0b; --c-copy: #d946ef;
            --scroll-track: transparent; 
            --scroll-thumb: #cbd5e1; 
            --scroll-thumb-hover: #94a3b8;
        }
        @media (prefers-color-scheme: dark) {
            :host {
                --bg-core: #1e293b; --bg-border: #475569; --icon-def: #94a3b8; --text-main: #f8fafc; --text-sub: #cbd5e1;
                --hover-bg: #334155; --shadow-color: rgba(0,0,0,0.5);
                --scroll-thumb: #475569; 
                --scroll-thumb-hover: #64748b;
            }
        }
        /* 滚动条美化 */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: var(--scroll-track); }
        ::-webkit-scrollbar-thumb { background: var(--scroll-thumb); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--scroll-thumb-hover); }
        ::-webkit-scrollbar-button { display: none; }
        
        .hud-wrapper { position: fixed; width: 260px; height: 260px; transform: translate(-50%, -50%) scale(0.9); opacity: 0; transition: opacity 0.2s, transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28); pointer-events: none; z-index: 99999; }
        .hud-wrapper.visible { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        
        svg { overflow: visible; position: absolute; top:0; left:0; width:100%; height:100%; }
        .sector-border { fill: none; stroke: var(--bg-border); stroke-width: 64; stroke-linecap: round; filter: drop-shadow(0 6px 8px var(--shadow-color)); transition: stroke 0.2s; }
        .sector-core { fill: none; stroke: var(--bg-core); stroke-width: 60; stroke-linecap: round; transition: stroke 0.2s, opacity 0.2s; }
        
        .icons-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        .ri-icon { position: absolute; font-size: 24px; color: var(--icon-def); transform: translate(-50%, -50%); transition: color 0.2s, transform 0.2s; }
        .icon-up { top: 45px; left: 130px; } .icon-right { top: 130px; left: 215px; } .icon-down { top: 215px; left: 130px; } .icon-left { top: 130px; left: 45px; }
        
        /* 激活状态样式 */
        .hud-wrapper[data-active="up"] .border-up { stroke: #059669; } .hud-wrapper[data-active="up"] .core-up { stroke: var(--c-save); } .hud-wrapper[data-active="up"] .icon-up { color: #fff; transform: translate(-50%, -50%) scale(1.2); }
        .hud-wrapper[data-active="down"] .border-down { stroke: #2563eb; } .hud-wrapper[data-active="down"] .core-down { stroke: var(--c-edit); } .hud-wrapper[data-active="down"] .icon-down { color: #fff; transform: translate(-50%, -50%) scale(1.2); }
        
        .hud-wrapper[data-active="left"] .border-left { stroke: #d97706; } .hud-wrapper[data-active="left"] .core-left { stroke: var(--c-search); } .hud-wrapper[data-active="left"] .icon-left { color: #fff; transform: translate(-50%, -50%) scale(1.2); }
        
        .hud-wrapper[data-active="right"] .border-right { stroke: #c026d3; } .hud-wrapper[data-active="right"] .core-right { stroke: var(--c-copy); } .hud-wrapper[data-active="right"] .icon-right { color: #fff; transform: translate(-50%, -50%) scale(1.2); }
        
        /* === 子功能按钮公共样式 === */
        .sub-actions, .sub-actions-right { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0; transition: opacity 0.1s ease; }
        
        /* 左侧激活逻辑 */
        .hud-wrapper.ai-mode[data-active="left"] .sub-actions { opacity: 1; }
        /* 【新增】右侧激活逻辑 */
        .hud-wrapper[data-active="right"] .sub-actions-right { opacity: 1; }
        
        .sub-btn {
            position: absolute; 
            width: 34px; height: 34px; 
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            background: rgba(255, 255, 255, 0.1); 
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: rgba(255, 255, 255, 0.7);
            font-size: 16px;
            transform: translate(-50%, -50%);
            transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            z-index: 10;
        }
        
        /* 左侧坐标 */
        .btn-why { top: 90px; left: 52px; }
        .btn-what { top: 170px; left: 52px; }

        /* 【新增】右侧坐标 (与左侧对称：260 - 52 = 208) */
        .btn-google { top: 90px; left: 208px; }
        .btn-baidu { top: 170px; left: 208px; }

        /* 左侧激活效果 */
        .hud-wrapper[data-sub="why"] .btn-why,
        .hud-wrapper[data-sub="what"] .btn-what { 
            background: rgba(255, 255, 255, 0.25);
            border-color: #ffffff; color: #ffffff;
            transform: translate(-50%, -50%) scale(1.1);
            box-shadow: 0 0 10px rgba(255,255,255,0.4); backdrop-filter: blur(2px);
        }

        /* 【新增】右侧激活效果 */
        .hud-wrapper[data-sub="google"] .btn-google,
        .hud-wrapper[data-sub="baidu"] .btn-baidu { 
            background: rgba(255, 255, 255, 0.25);
            border-color: #ffffff; color: #ffffff;
            transform: translate(-50%, -50%) scale(1.1);
            box-shadow: 0 0 10px rgba(255,255,255,0.4); backdrop-filter: blur(2px);
        }
        
        .center-display { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        .center-label { font-size: 14px; font-weight: 700; color: var(--text-main); background: var(--bg-core); padding: 6px 14px; border-radius: 20px; border: 1px solid var(--bg-border); box-shadow: 0 4px 12px var(--shadow-color); opacity: 0; transform: scale(0.8); transition: all 0.2s; white-space: nowrap; z-index: 20; }
        .center-label.show { opacity: 1; transform: scale(1); }


        /* ... 原有 CSS ... */

    /* === 悬浮搜索窗口样式 (支持调整大小) === */
    .search-window {
        position: fixed; 
        /* 默认宽高，后续可拖拽改变 */
        width: 500px; height: 750px; 
        min-width: 300px; min-height: 400px; /* 最小尺寸限制 */
        max-width: 95vw; max-height: 95vh;   /* 最大尺寸限制 */
        
        background: var(--bg-core); border: 1px solid var(--bg-border);
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.25);
        display: flex; flex-direction: column;
        z-index: 2147483647; 
        opacity: 0; pointer-events: none; transform: scale(0.95);
        transition: 
            opacity 0.2s, 
            transform 0.2s,
            width 0.4s cubic-bezier(0.16, 1, 0.3, 1),
            height 0.4s cubic-bezier(0.16, 1, 0.3, 1),
            left 0.4s cubic-bezier(0.16, 1, 0.3, 1),
            top 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* 激活态 */
    .search-window.visible { opacity: 1; pointer-events: auto; transform: scale(1); }
    
    /* 拖拽/缩放时禁用过渡，保证跟手 */
    .search-window.no-transition { transition: none !important; }

    /* 拖拽/缩放时给 iframe 盖一层遮罩，防止鼠标事件被 iframe 吞掉 */
    .search-window.interacting .search-body::after {
        content: ""; position: absolute; top:0; left:0; width:100%; height:100%;
        z-index: 50; background: transparent;
    }
    /* === 1. 修复 Header 布局 (防止按钮跑到底部) === */
    .search-header {
        height: 40px; 
        box-sizing: border-box; /* 确保 padding 不撑大高度 */
        background: var(--hover-bg); 
        border-bottom: 1px solid var(--bg-border);
        border-radius: 12px 12px 0 0;
        display: flex; 
        align-items: center;       /* 垂直居中 */
        justify-content: space-between; /* 左右两端对齐 */
        flex-wrap: nowrap;         /* 【关键】禁止换行 */
        padding: 0 12px; 
        cursor: move; user-select: none;
        overflow: hidden;          /* 防止内容溢出 */
    }

    .search-title { 
        font-size: 14px; font-weight: 600; color: var(--text-main); 
        display: flex; align-items: center; gap: 8px; 
        white-space: nowrap;       /* 【关键】文字不换行 */
        overflow: hidden; text-overflow: ellipsis; /* 文字太长显示省略号 */
        flex: 1;                   /* 占据剩余空间 */
        margin-right: 10px;
    }

    .search-controls { 
        display: flex; 
        align-items: center; /* 子元素垂直居中 */
        gap: 8px; 
        flex-shrink: 0;      /* 【关键】禁止按钮被挤压 */
        height: 100%;        /* 充满高度 */
    }

    .win-btn { 
        width: 26px; height: 26px; /* 稍微大一点点好点 */
        border-radius: 4px; 
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; color: var(--text-sub); transition: all 0.2s;
    }
    .win-btn:hover { background: rgba(0,0,0,0.1); color: var(--text-main); }
    .win-btn:active { transform: scale(0.9);}
    .win-btn.close:hover { background: #ef4444; color: white; }

    /* 优化滚动条样式 (让它细一点，不占地方) */
    .search-body::-webkit-scrollbar { width: 6px; height: 6px; }
    .search-body::-webkit-scrollbar-track { background: transparent; }
    .search-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    .search-body::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        
    /* 针对 iframe 容器稍微做点圆角处理 */
    .search-body { 
        flex: 1; 
        position: relative; 
        background: #fff; /* 设置白底，防止加载时透明 */
        overflow: hidden; /* 【核心】彻底禁止任何滚动条出现 */
        border-bottom-left-radius: 12px;
        border-bottom-right-radius: 12px;
    }
    /* === 新增：宽屏模式样式 === */
    .search-window.wide-mode {
        width: 900px !important; /* 强制变宽 */
        /* 高度稍微增加一点，阅读体验更好 */
        height: 700px !important; 
        max-width: 95vw;
    }

    /* === 修改：iframe 样式 === */
    .search-frame { 
        width: 100%; 
        height: 100%; 
        border: none; 
        display: block;
        vertical-align: top; /* 强制顶部对齐，消除底部间隙 */
        /* 尝试让 iframe 内部自适应 */
        min-width: 100%; 
    }
    
    .loading-mask {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        background: var(--bg-core); color: var(--text-sub); font-size: 14px;
        z-index: 10;
    }
    /* === 新增：右下角调整大小手柄 === */
    .resize-handle {
        position: absolute; bottom: 0; right: 0;
        width: 20px; height: 20px;
        cursor: nwse-resize; /* 斜向箭头 */
        z-index: 100;
        display: flex; align-items: flex-end; justify-content: flex-end;
        padding: 2px;
        color: var(--text-sub);
    }
    .resize-handle:hover { color: var(--text-main); }
    `;
    shadow.appendChild(styleSheet);
    // --- 3. 构建路径 ---
    const CX = 130, CY = 130, R = 85;
    function getArc(start, end) {
        const rad = Math.PI / 180;
        const x1 = CX + R * Math.cos(start * rad), y1 = CY + R * Math.sin(start * rad);
        const x2 = CX + R * Math.cos(end * rad), y2 = CY + R * Math.sin(end * rad);
        return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
    }
    const paths = { up: getArc(-111, -69), right: getArc(-21, 21), down: getArc(69, 111), left: getArc(159, 201) };

    const hudHtml = `
        <div class="hud-wrapper ${isAiPage ? 'ai-mode' : ''}">
            <svg viewBox="0 0 260 260">
                <path class="sector-border border-up" d="${paths.up}"></path><path class="sector-core core-up" d="${paths.up}"></path>
                <path class="sector-border border-right" d="${paths.right}"></path><path class="sector-core core-right" d="${paths.right}"></path>
                <path class="sector-border border-down" d="${paths.down}"></path><path class="sector-core core-down" d="${paths.down}"></path>
                <path class="sector-border border-left" d="${paths.left}"></path><path class="sector-core core-left" d="${paths.left}"></path>
            </svg>
            <div class="icons-layer">
                <i class="ri-save-3-fill ri-icon icon-up"></i>
                <i class="ri-search-2-fill ri-icon icon-right"></i>
                <i class="ri-edit-2-fill ri-icon icon-down"></i>
                <i class="${isAiPage ? 'ri-chat-4-fill' : 'ri-file-copy-2-fill'} ri-icon icon-left"></i>
            </div>
            <!-- 左侧子功能按钮 (AI) -->
            <div class="sub-actions">
                <div class="sub-btn btn-why"><i class="ri-question-line"></i></div>
                <div class="sub-btn btn-what"><i class="ri-book-open-line"></i></div>
            </div>
            <!-- 【新增】右侧子功能按钮 (搜索) -->
            <div class="sub-actions-right">
                <div class="sub-btn btn-google"><i class="ri-google-fill"></i></div>
                <div class="sub-btn btn-baidu"><i class="ri-baidu-fill"></i></div>
            </div>
            <div class="center-display"><span class="center-label">功能</span></div>
        </div>

        <!-- === 新增：悬浮搜索窗口结构 === -->
        <div class="search-window">
            <div class="search-header">
                <div class="search-title">
                    <i class="ri-search-eye-line"></i> <span id="win-title">搜索结果</span>
                </div>
                <div class="search-controls">
                    <div class="win-btn" id="btn-toggle-wide" title="切换宽屏/窄屏"><i class="ri-aspect-ratio-line"></i></div>
                    <div class="win-btn" id="btn-reload-win" title="重置/刷新"><i class="ri-refresh-line"></i></div>
                    <div class="win-btn" id="btn-open-ext" title="新标签页打开"><i class="ri-external-link-line"></i></div>
                    <div class="win-btn close" id="btn-close-win" title="关闭"><i class="ri-close-line"></i></div>
                </div>
            </div>
            <div class="search-body">
                <iframe class="search-frame" src="about:blank"></iframe>
            </div>
            <div class="resize-handle"><i class="ri-corner-right-down-line"></i></div>
        </div>
    `;
    const container = document.createElement('div');
    container.innerHTML = hudHtml;
    shadow.appendChild(container);

    // --- 5. 交互逻辑 ---
    const wrapper = shadow.querySelector('.hud-wrapper');
    const label = shadow.querySelector('.center-label');
    let startX = 0, startY = 0, selectedText = '', isDragging = false, activeDir = null;
    let activeSubAction = null; 

    const searchWin = shadow.querySelector('.search-window');
    const searchFrame = shadow.querySelector('.search-frame');
    const winHeader = shadow.querySelector('.search-header');
    const btnClose = shadow.querySelector('#btn-close-win');
    const btnExt = shadow.querySelector('#btn-open-ext');
    const btnWide = shadow.querySelector('#btn-toggle-wide');
    const btnReload = shadow.querySelector('#btn-reload-win');
    const winTitle = shadow.querySelector('#win-title');
    const resizeHandle = shadow.querySelector('.resize-handle');
    let currentSearchUrl = 'about:blank';
    // 状态变量
    let winState = {
        isDragging: false,
        isResizing: false,
        startX: 0, startY: 0,
        startLeft: 0, startTop: 0,
        startW: 0, startH: 0
    };
    const LABELS = {
        up: getI18nText('super_wheel.action_save_direct'),
        down: getI18nText('super_wheel.action_save_edit'),
        left: isAiPage ? getI18nText('super_wheel.action_fill_chat') : getI18nText('super_wheel.action_copy_text'),
        right: getI18nText('super_wheel.action_search_bing')
    };

    function forceFillInput(targetElement, text) {
        if (!targetElement) return false;
        let inputEl = targetElement;
        if (inputEl.tagName !== 'INPUT' && inputEl.tagName !== 'TEXTAREA' && !inputEl.isContentEditable) {
            const possibleInput = inputEl.querySelector('textarea, input, [contenteditable="true"]');
            if (possibleInput) inputEl = possibleInput;
        }
        inputEl.focus();
        try {
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', text);
            inputEl.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }));
            if (inputEl.value === text || inputEl.textContent.includes(text)) return true;
        } catch(e) {}
        let success = false;
        try {
            let nativeSetter = null;
            if (inputEl.tagName === 'TEXTAREA') nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
            else if (inputEl.tagName === 'INPUT') nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            if (nativeSetter) { nativeSetter.call(inputEl, text); inputEl.dispatchEvent(new Event('input', { bubbles: true })); success = true; }
        } catch (e) {}
        if (!success || (inputEl.value !== text)) {
            try {
                 if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') inputEl.value = ''; 
                 else inputEl.textContent = '';
                 success = document.execCommand('insertText', false, text);
            } catch (e) {}
        }
        return true;
    }

    document.addEventListener('dragstart', (e) => {
        if (!commonSettings.enableShortcutGrab) return;
        const sel = window.getSelection().toString().trim();
        if (!sel) return;
        selectedText = sel; startX = e.clientX; startY = e.clientY; isDragging = true;
        wrapper.style.left = startX + 'px'; wrapper.style.top = startY + 'px';
        requestAnimationFrame(() => wrapper.classList.add('visible'));
    });

    // 重新校准判定区域 (Center 130, 130)
    // Left Zone: x: -88
    // Right Zone: x: +88
    const SUB_ZONES = {
        // 左侧 AI 子功能
        why: { x: -88, y: -48, radius: 28 }, 
        what: { x: -88, y: 48, radius: 28 },
        // 【新增】右侧搜索子功能
        google: { x: 88, y: -48, radius: 28 },
        baidu: { x: 88, y: 48, radius: 28 }
    };

    document.addEventListener('dragover', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - startX, dy = e.clientY - startY, dist = Math.hypot(dx, dy);
        let newDir = null;
        let newSubAction = null;

        if (dist > 50 && dist < 180) { 
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            angle = (angle + 90 + 360) % 360;
            if (angle >= 315 || angle < 45) newDir = 'up';
            else if (angle >= 45 && angle < 135) newDir = 'right';
            else if (angle >= 135 && angle < 225) newDir = 'down';
            else if (angle >= 225 && angle < 315) newDir = 'left';
        }

        // --- 子功能判定逻辑 ---
        if (newDir === 'left' && isAiPage) {
            const distWhy = Math.hypot(dx - SUB_ZONES.why.x, dy - SUB_ZONES.why.y);
            const distWhat = Math.hypot(dx - SUB_ZONES.what.x, dy - SUB_ZONES.what.y);
            
            if (distWhy < SUB_ZONES.why.radius) newSubAction = 'why';
            else if (distWhat < SUB_ZONES.what.radius) newSubAction = 'what';
        } 
        // 【新增】右侧子功能判定
        else if (newDir === 'right') {
            const distGoogle = Math.hypot(dx - SUB_ZONES.google.x, dy - SUB_ZONES.google.y);
            const distBaidu = Math.hypot(dx - SUB_ZONES.baidu.x, dy - SUB_ZONES.baidu.y);

            if (distGoogle < SUB_ZONES.google.radius) newSubAction = 'google';
            else if (distBaidu < SUB_ZONES.baidu.radius) newSubAction = 'baidu';
        }

        if (newDir !== activeDir || newSubAction !== activeSubAction) {
            activeDir = newDir;
            activeSubAction = newSubAction;

            if (activeDir) {
                wrapper.setAttribute('data-active', activeDir);
                if (activeSubAction) {
                    wrapper.setAttribute('data-sub', activeSubAction);
                    // 【修改】动态显示标签文字
                    if (activeSubAction === 'why') {
                        label.textContent = getI18nText('super_wheel.sub_why');
                    } else if (activeSubAction === 'what') {
                        label.textContent = getI18nText('super_wheel.sub_what');
                    } else if (activeSubAction === 'google') {
                        label.textContent = getI18nText('super_wheel.sub_google');
                    } else if (activeSubAction === 'baidu') {
                        label.textContent = getI18nText('super_wheel.sub_baidu');
                    }
                    
                } else {
                    wrapper.removeAttribute('data-sub');
                    label.textContent = LABELS[activeDir];
                }
                label.classList.add('show');
            } else {
                wrapper.removeAttribute('data-active');
                wrapper.removeAttribute('data-sub');
                label.classList.remove('show');
            }
        }
    });

    document.addEventListener('dragend', async (e) => {
        if (!isDragging) return;
        isDragging = false;
        wrapper.classList.remove('visible');
        wrapper.removeAttribute('data-active');
        wrapper.removeAttribute('data-sub');
        label.classList.remove('show');

        if (!selectedText || !activeDir) return;
        const action = activeDir;
        const subAction = activeSubAction;
        activeDir = null; activeSubAction = null;

        switch (action) {
            case 'right':
                 // 获取当前鼠标释放时的坐标
                const dropX = e.clientX;
                const dropY = e.clientY;

                let searchUrl = '';
                let displayUrl = '';
                let title = '搜索';
                
                if (subAction === 'google') {
                    // Google: igu=1 允许 iframe，pws=0 减少个性化干扰
                    displayUrl = `https://www.google.com/search?igu=1&pws=0&q=${encodeURIComponent(selectedText)}`;
                    searchUrl = `https://www.google.com/search?q=${encodeURIComponent(selectedText)}`;
                    title = 'Google';
                } else if (subAction === 'baidu') {
                    // 百度: 强制用 m.baidu.com
                    displayUrl = `https://m.baidu.com/s?word=${encodeURIComponent(selectedText)}`;
                    searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(selectedText)}`;
                    title = '百度';
                } else {
                    // 必应: 尝试使用 PC=MOZB 参数欺骗必应使用移动布局
                    // &form=MOZLBR 也是移动端常用的参数
                    displayUrl = `https://www.bing.com/search?q=${encodeURIComponent(selectedText)}&PC=MOZB&form=MOZLBR`;
                    searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(selectedText)}`;
                    title = '必应';
                }

                // 传入坐标 dropX, dropY
                openSearchWindow(displayUrl, title, searchUrl, dropX, dropY);
                break;
            case 'left': 
                if (isAiPage && aiInputSelector) {
                    const inputEl = document.querySelector(aiInputSelector);
                    if (inputEl) {
                        let finalText = selectedText;
                        if (subAction === 'why') finalText = getI18nText('super_wheel.sub_why') + selectedText;
                        else if (subAction === 'what') finalText = getI18nText('super_wheel.sub_what') + selectedText;
                        
                        forceFillInput(inputEl, finalText);
                        // const msg = subAction ? `✅ 已填入: ${subAction === 'why' ? '为什么...' : '什么是...'}` : '✅ 已填入对话框';
                        // showTopToast(msg);
                    } else {
                        showTopToast(getI18nText('toast.input_not_found'));
                    }
                } else {
                    try { await navigator.clipboard.writeText(selectedText); showTopToast(getI18nText('toast.copied_clipboard')); } catch(e) { showTopToast(getI18nText('toast.copy_fail')); }
                }
                break;
            case 'up': 
                const k = selectedText.substring(0, 5).replace(/\s/g, '');
                await saveCommand(k, selectedText, '');
                showTopToast(`${getI18nText('toast.saved_item')}${k}`);
                break;
            case 'down': 
                openModal(null,allCategories, 'all', selectedText);
                break;
        }
    });

    // --- 6. 模态框逻辑 ---
    document.querySelector('#modalSave').addEventListener('click', () => {
        const key = editKey.value.trim(); 
        const value = editValue.value;
        const catId = editCategory.value;
        const autoSend=autoSendToggle.checked;


        if(!key) return showTopToast(getI18nText('toast.need_keyword'));
        saveCommand(key, value, catId,autoSend); showTopToast(getI18nText('toast.save_cmd_success')); closeModal();
        closeModal();
    });

    async function saveCommand(key, value, catId,autoSend) {
        if (typeof shortcuts !== 'undefined') {
            const item = { 
                id: Date.now().toString(36),
                key: key, 
                value: value,
                autoSend:autoSend, 
                active: true, 
                usageCount: 0,
                createdAt: new Date().toLocaleString(),
                categoryId: catId || '', 
            };
            const p = (typeof preprocessShortcut === 'function') ? preprocessShortcut(item) : item;
            shortcuts.push(p);
            try { await idbSet({ shortcutsData: shortcuts }); await chrome.storage.local.set({ shortcutsData: shortcuts }); } catch(e) {}
        }
    }

    // #region 搜索窗口
    function closeSearchWindow() {
        searchWin.classList.remove('visible');
        setTimeout(() => { searchFrame.src = 'about:blank'; }, 300);
    }

    // 边界检查与修正函数 (用于浏览器 Resize 或 拖拽结束)
    function fitWindowToScreen() {
        if (!searchWin.classList.contains('visible')) return;
        
        const rect = searchWin.getBoundingClientRect();
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        
        let newLeft = rect.left;
        let newTop = rect.top;
        let newW = rect.width;
        let newH = rect.height;

        // 1. 尺寸修正：如果窗口比屏幕还大，强制缩小
        if (newW > screenW) newW = screenW - 20;
        if (newH > screenH) newH = screenH - 20;

        // 2. 位置修正：右侧溢出
        if (newLeft + newW > screenW) newLeft = screenW - newW - 10;
        // 左侧溢出
        if (newLeft < 0) newLeft = 10;

        // 3. 位置修正：底部溢出
        if (newTop + newH > screenH) newTop = screenH - newH - 10;
        // 顶部溢出
        if (newTop < 0) newTop = 10;

        // 应用修正
        Object.assign(searchWin.style, {
            left: `${newLeft}px`,
            top: `${newTop}px`,
            width: `${newW}px`,
            height: `${newH}px`
        });
    }

    function openSearchWindow(url, title, engineUrl, mouseX, mouseY) {
        winTitle.textContent = title;
        currentSearchUrl = url;
        // 1. 先把窗口显示出来！(视觉上秒开)
        // 浏览器会逐步渲染 iframe 内容，比傻等 onload 快得多
        requestAnimationFrame(() => searchWin.classList.add('visible'));

        // 2. 然后再加载 URL
        if (searchFrame.src !== url) {
            searchFrame.src = url;
        }
        searchWin.classList.remove('wide-mode');
        // 如果你之前写了 style.width，这里要清除掉，让 CSS class 生效
        searchWin.style.width = ''; 
        searchWin.style.height = ''; 
        
        btnExt.onclick = () => window.open(engineUrl, '_blank');
        btnClose.onclick = closeSearchWindow;
        btnWide.onclick = () => {
            // 1. 获取当前视觉中心点 (Anchor Point)
            // 动画必须基于这个中心点扩散，否则会向右下角生硬变大
            const rect = searchWin.getBoundingClientRect();
            const centerX = rect.left + (rect.width / 2);
            const centerY = rect.top + (rect.height / 2);

            // 2. 切换状态
            const isNowWide = searchWin.classList.toggle('wide-mode');

            // 3. 【关键】预设目标尺寸
            // 因为开启了动画，此时测量 DOM 拿到的还是旧尺寸，所以必须手动指定目标值
            // 宽屏目标: 900x700 (需与 CSS .wide-mode 一致)
            // 普屏目标: 500x750 (需与 CSS 默认值一致)
            let targetW = isNowWide ? 900 : 500;
            let targetH = isNowWide ? 700 : 750;

            // 如果用户之前手动调整过大小，普屏模式下可能需要恢复之前的尺寸？
            // 这里为了动画稳定，简单起见我们强制清除内联样式，回到 CSS 定义的默认值
            if (!isNowWide) {
                searchWin.style.width = '';
                searchWin.style.height = '';
                // 如果 CSS 中默认是 500x750，这里 targetW/H 保持不变
                // 如果你想让它“记住”用户缩放的尺寸，逻辑会复杂很多，建议先保持这样
            }

            // 4. 计算新的 Left / Top (保持中心点不动)
            let newLeft = centerX - (targetW / 2);
            let newTop = centerY - (targetH / 2);

            // 5. 边界检查 (防止变大后中心点撑出屏幕)
            const screenW = window.innerWidth;
            const screenH = window.innerHeight;

            // 简单修正：确保不会溢出
            if (newLeft < 10) newLeft = 10;
            if (newLeft + targetW > screenW - 10) newLeft = screenW - targetW - 10;
            if (newTop < 10) newTop = 10;
            if (newTop + targetH > screenH - 10) newTop = screenH - targetH - 10;

            // 6. 应用新坐标
            // 浏览器会自动将 left/top 的变化与 width/height 的变化组合成动画
            searchWin.style.left = `${newLeft}px`;
            searchWin.style.top = `${newTop}px`;
        };
        btnReload.onclick = () => {
            // 强制重新加载初始搜索链接 (模拟"回到首页")
            console.log('Reloading search frame...');
            searchFrame.src = currentSearchUrl;
        };
        // 初始位置计算
        const winW = 500, winH = 750;
        const screenW = window.innerWidth, screenH = window.innerHeight;
        
        let left = mouseX + 20;
        if (left + winW > screenW) left = mouseX - winW - 20;
        
        let top = mouseY - 50; 
        if (top + winH > screenH) top = screenH - winH - 10;
        
        if (left < 0) left = 10;
        if (top < 0) top = 10;

        searchWin.style.left = `${left}px`;
        searchWin.style.top = `${top}px`;
    }

    // --- 事件监听：移动 (Move) ---
    winHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('.win-btn')) return; // 点按钮时不拖拽
        winState.isDragging = true;
        winState.startX = e.clientX;
        winState.startY = e.clientY;
        
        const rect = searchWin.getBoundingClientRect();
        winState.startLeft = rect.left;
        winState.startTop = rect.top;

        searchWin.classList.add('no-transition'); // 移除动画以提高性能
        searchWin.classList.add('interacting');    // 添加遮罩防止 iframe 捕获鼠标
        winHeader.style.cursor = 'grabbing';
    });

    // --- 事件监听：调整大小 (Resize) ---
    resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // 防止冒泡触发 header 的拖拽
        winState.isResizing = true;
        winState.startX = e.clientX;
        winState.startY = e.clientY;
        
        const rect = searchWin.getBoundingClientRect();
        winState.startW = rect.width;
        winState.startH = rect.height;

        searchWin.classList.add('no-transition');
        searchWin.classList.add('interacting');
    });

    // --- 全局鼠标移动与释放 ---
    document.addEventListener('mousemove', (e) => {
        if (winState.isDragging) {
            e.preventDefault();
            const dx = e.clientX - winState.startX;
            const dy = e.clientY - winState.startY;
            // 【修复点】：使用 Math.round() 取整
            const newLeft = Math.round(winState.startLeft + dx);
            const newTop = Math.round(winState.startTop + dy);

            searchWin.style.left = `${newLeft}px`;
            searchWin.style.top = `${newTop}px`;
        } 
        else if (winState.isResizing) {
            e.preventDefault();
            const dx = e.clientX - winState.startX;
            const dy = e.clientY - winState.startY;
            // 最小值由 CSS min-width/height 控制
            searchWin.style.width = `${winState.startW + dx}px`;
            searchWin.style.height = `${winState.startH + dy}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (winState.isDragging || winState.isResizing) {
            winState.isDragging = false;
            winState.isResizing = false;
            searchWin.classList.remove('no-transition');
            searchWin.classList.remove('interacting');
            winHeader.style.cursor = 'move';
            
            // 拖拽/缩放结束后，做一次吸附修正，防止只有一半在屏幕内
            fitWindowToScreen();
        }
    });

    // --- 监听浏览器窗口变化 (自适应) ---
    window.addEventListener('resize', () => {
        // 只有当窗口显示时才计算，节省性能
        if (searchWin.classList.contains('visible')) {
            // 使用 requestAnimationFrame 防抖动
            requestAnimationFrame(fitWindowToScreen);
        }
    });

}
