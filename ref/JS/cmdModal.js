const cmdStyleSheet = document.createElement('style');
cmdStyleSheet.textContent = `
    :root {
        /* --- 配色变量 (保持原有) --- */
        --primary-modal: #3b82f6;
        --primary-modal-hover: #2563eb;
        --bg-modal-body: #f8fafc;
        --bg-modal-sidebar: #eff6ff;
        --bg-modal-card: #ffffff;
        --bg-modal-option: #eff6ff;
        
        --text-modal-main: #0f172a;
        --text-modal-sub: #64748b;
        --border-modal: #e2e8f0;
        --lightning-color: #fbba06
    }

    @media (prefers-color-scheme: dark) {
        :root:not([data-theme="light"]) {
            --bg-modal-body: #0f172a;
            --bg-modal-sidebar: #020617;
            --bg-modal-card: #1e293b;
            --bg-modal-option: #eff6ff1f;
    
            --text-modal-main: #f1f5f9;
            --text-modal-sub: #94a3b8;
            --border-modal: #334155;
            --lightning-color: #ffd700
        }
    }
    #modalOverlay * {
        box-sizing: border-box !important;
    }
    #modalOverlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 100; backdrop-filter: blur(2px); display: none; align-items: center; justify-content: center; }
    #modalOverlay.show { display: flex; }
    .modal-card { width: 90%; max-width: 420px; /*稍微加宽一点以容纳新按钮*/ background: var(--bg-modal-card); border-radius: 16px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); animation: popIn 0.2s; }
    @keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .modal-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
    
    #modalCancel,#modalSave{height: 30px;}
    
    #modalOverlay #editKey { font-family: Consolas, 'PingFang SC'; font-weight: 600; color: var(--primary-modal); }
    #modalOverlay #editValue { height: 120px; resize: none; overflow-y: auto; line-height: 1.6; }

    #modalOverlay #editValue::-webkit-scrollbar {width: 6px;}
    #modalOverlay #editValue::-webkit-scrollbar-thumb {background: var(--border-modal);border-radius: 3px;}
    #modalOverlay #editValue::-webkit-scrollbar-track {background: transparent;}
    #modalOverlay button { border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
    #modalOverlay button:active { transform: scale(0.96); }
    #modalOverlay button:disabled { opacity: 0.7; cursor: not-allowed; }
    #modalOverlay .btn-primary { background: var(--primary-modal); color: white; padding: 6px 16px}
    #modalOverlay .btn-primary:hover { background: var(--primary-modal-hover); }
    #modalOverlay .btn-text { background: transparent; color: var(--text-modal-sub); padding: 8px 12px; }
    #modalOverlay .btn-text:hover { background: var(--bg-modal-body); color: var(--text-modal-main); }

    #modalOverlay .custom-select-container { position: relative; width: 100%; }
    #modalOverlay .select-trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 10px 12px; background: var(--bg-modal-body); border: 1px solid var(--border-modal); border-radius: 8px; font-size: 14px; color: var(--text-modal-main); cursor: pointer; transition: all 0.2s; user-select: none; }
    #modalOverlay .select-trigger:hover { background: var(--bg-modal-card); border-color: var(--text-modal-sub); }
    #modalOverlay .select-trigger.active { border-color: var(--primary-modal); background: var(--bg-modal-card); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }
    #modalOverlay .select-arrow { color: var(--text-modal-sub); transition: transform 0.2s; }
    #modalOverlay .select-trigger.active .select-arrow { transform: rotate(180deg); }
    #modalOverlay .select-options { position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: var(--bg-modal-card); border: 1px solid var(--border-modal); border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 2000; max-height: 200px; overflow-y: auto; opacity: 0; visibility: hidden; transform: translateY(-10px); transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); padding: 4px; }
    #modalOverlay .select-options.open { opacity: 1; visibility: visible; transform: translateY(0); }
    #modalOverlay .custom-option { padding: 8px 12px; font-size: 13px; color: var(--text-modal-main); 
                                    border-radius: 6px; cursor: pointer; display: flex; align-items: center; 
                                    justify-content: space-between; transition: background 0.2s;
                                }
    #modalOverlay .var-option:hover,
    #modalOverlay .custom-option:hover { background-color: var(--bg-modal-option); color: var(--primary-modal); }
    #modalOverlay .custom-option.selected { background-color: rgba(59, 130, 246, 0.1); color: var(--primary-modal); font-weight: 600; }

    #modalOverlay #editKey { font-family: Consolas, 'PingFang SC'; font-weight: 600; color: var(--primary-modal); }
    #modalOverlay #editValue { height: 120px; resize: none; overflow-y: auto; line-height: 1.6; }

    #modalOverlay input, 
    #modalOverlay textarea { width: 100%; padding: 10px; background: var(--bg-modal-body); border: 1px solid var(--border-modal); 
                            border-radius: 8px; color: var(--text-modal-main); outline: none; font-family: inherit; font-size: 14px; }
    #modalOverlay input:focus, 
    #modalOverlay textarea:focus { border-color: var(--primary-modal); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }
    #catModalOverlay label,
    #modalOverlay label { display: block; font-size: 12px !important; color: var(--text-modal-sub); margin-bottom: 4px !important; }

    .form-group { margin-bottom: 10px; }
    #modalOverlay .modal-footer {
        display: flex; 
        justify-content: space-between; 
        gap: 8px;
        align-items: center; 
        margin-top: 5px;
        width: 100%;
    }

    .modal-btn-group {
        display: flex;       
        align-items: center;
        gap: 10px;
    }

    /* 左侧控件组 (变量+开关) */
    .left-controls {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    /* 2. 下拉框容器 */
    .var-select-wrapper {
        position: relative;
        width: 100px; /* 稍微缩小以节省空间 */
        font-size: 13px;
        user-select: none;
    }

    /* 3. 触发器按钮 */
    .var-select-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 8px;
        height: 32px;
        background: var(--bg-modal-body);
        border: 1px solid var(--border-modal);
        border-radius: 6px;
        color: var(--text-modal-sub);
        cursor: pointer;
        transition: all 0.2s;
    }

    .var-select-trigger:hover {
        background: var(--bg-modal-card);
        border-color: var(--text-modal-main);
        color: var(--text-modal-main);
    }

    /* 小箭头图标 */
    .var-select-arrow {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        transition: transform 0.2s;
        opacity: 0.7;
    }

    /* 激活状态 */
    .var-select-wrapper.open .var-select-trigger {
        border-color: var(--primary-modal);
        color: var(--primary-modal);
        background: var(--bg-modal-card);
    }
    .var-select-wrapper.open .var-select-arrow {
        transform: rotate(180deg);
    }

    /* 4. 下拉选项列表 */
    .var-select-options {
        position: absolute;
        bottom: 115%;
        padding: 5px;
        left: 0;
        min-width: 120px;
        width: max-content;
        background: var(--bg-modal-card);
        border: 1px solid var(--border-modal);
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        
        max-height: 180px; 
        overflow-y: auto;
        
        opacity: 0;
        visibility: hidden;
        transform: translateY(5px);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 500;
    }

    .var-select-wrapper.open .var-select-options {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }

    .var-option {
        padding: 4px 8px;
        cursor: pointer;
        border-radius: 4px;
        color: var(--text-modal-sub);
        transition: background 0.1s;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
    }

/* --- 最终方案：现代化状态标签 (Tag/Chip Style) --- */
    
    /* 1. 容器：不再是开关，而是一个按钮样式的标签 */
    #modalOverlay .toggle-wrapper {
        display: flex !important;
        align-items: center;
        justify-content: center;
        height: 32px; /* ★关键：强制与左侧下拉框同高 */
        padding: 0 10px;
        
        /* 默认样式：模仿左侧下拉框 */
        background: var(--bg-modal-body);
        border: 1px solid var(--border-modal);
        border-radius: 6px; /* 圆角保持一致 */
        
        color: var(--text-modal-sub);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        user-select: none;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        
        /* 消除旧样式影响 */
        gap: 0; 
        margin-bottom: 0 !important;
        width: auto;
    }

    /* 2. 悬停效果 (未激活时) */
    #modalOverlay .toggle-wrapper:hover {
        background: var(--bg-modal-card);
        border-color: var(--text-modal-main);
        color: var(--text-modal-main);
    }

    /* 3. ★★★ 激活状态 (关键视觉反馈) ★★★ */
    /* 当内部 checkbox 被选中时：边框变蓝，背景变浅蓝，文字变蓝 */
    #modalOverlay .toggle-wrapper:has(.toggle-input:checked) {
        background: rgba(59, 130, 246, 0.08); /* 极淡的主题色背景 */
        border-color: var(--primary-modal);
        color: var(--primary-modal);
    }
    
    /* 兼容性写法 (如果浏览器不支持 :has) */
    .toggle-input:checked + .chip-content {
        color: var(--primary-modal);
    }

    /* 4. 内部内容布局 */
    .chip-content {
        display: flex;
        align-items: center;
        gap: 6px; /* 图标和文字间距 */
    }

    /* 5. 图标样式 */
    .chip-icon {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor; /* 跟随文字颜色变化 */
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    /* 激活时：图标上浮 + 变实心 */
    #modalOverlay .toggle-wrapper:has(.toggle-input:checked) .chip-icon {
        /* 动作 */
        transform: scale(1.1); 
        stroke: var(--lightning-color);       /* 描边 */
        fill: var(--lightning-color);         /* 变成实心 */
        filter: drop-shadow(0 2px 3px rgba(255, 215, 0, 0.2));
    }
    /* 隐藏原生 checkbox */
    .toggle-input { display: none; }
    
    /* 彻底移除旧的轨道和圆点样式，防止残留 */
    .toggle-track, .toggle-thumb { display: none !important; }

    @media (prefers-color-scheme: dark) {
        .var-select-options {
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        }
    }

    .select-options::-webkit-scrollbar,
    .var-select-options::-webkit-scrollbar 
    { width: 4px !important; }

    .select-options::-webkit-scrollbar-thumb,
    .var-select-options::-webkit-scrollbar-thumb
    { background: var(--border-modal)!important; 
     border-radius: 2px !important; 
    }
    
    .select-options::-webkit-scrollbar-track,
    .var-select-options::-webkit-scrollbar-track
    { background: transparent; }
    `
document.head.appendChild(cmdStyleSheet);

const cmdModal = document.createElement('div');
cmdModal.className = 'cmd-modal-overlay';
cmdModal.innerHTML = `
    <div id="modalOverlay">
        <div class="modal-card">
            <div class="modal-title" id="modalTitle" data-i18n="commands.modal_title_new">新建指令</div>
            <div class="form-group">
            <label data-i18n="commands.modal_category">所属分类</label>
            <div class="custom-select-container" id="customSelect">
                <div class="select-trigger" id="selectTrigger"><span id="selectTriggerText" data-i18n="commands.modal_no_category">无分类</span><svg class="select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></div>
                <div class="select-options" id="selectOptions"></div>
                <input type="hidden" id="editCategory" value="">
            </div>
            </div>
            <div class="form-group"><label data-i18n="commands.modal_keyword">唤醒词</label><input type="text" id="editKey" data-i18n-placeholder="commands.modal_keyword_placeholder" placeholder="例如: chat"></div>
            <div class="form-group"><label data-i18n="commands.modal_content">指令内容</label><textarea id="editValue" data-i18n-placeholder="commands.modal_content_placeholder" placeholder="输入完整的替换文本..."></textarea></div>
            
            <div class="modal-footer">
                <div class="left-controls">
                    <div class="var-select-wrapper" id="varInsertWrapper">
                        <div class="var-select-trigger" id="varSelectTrigger">
                            <span id="varSelectLabel" style="margin-right: 4px;" data-i18n="commands.modal_variables">+ 变量</span>
                            <svg class="var-select-arrow" viewBox="0 0 24 24">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </div>
                        
                        <div class="var-select-options" id="varSelectOptions">
                            </div>
                    </div>
                    <label class="toggle-wrapper" data-i18n-title="commands.modal_auto_send_tooltip" title="开启后，匹配关键词将直接发送消息">
                        <input type="checkbox" id="autoSendToggle" class="toggle-input">
                        
                        <div class="chip-content">
                            <svg class="chip-icon" viewBox="0 0 24 24">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                            </svg>
                            <span data-i18n="commands.modal_auto_send">自动发送</span>
                        </div>
                    </label>
                </div>

                <div class="modal-btn-group">
                    <button id="modalCancel" class="btn-text" data-i18n="common.cancel">取消</button>
                    <button id="modalSave" class="btn-primary" data-i18n="common.save">保存</button>
                </div>
            </div>
        </div>
    </div>
`;
document.body.appendChild(cmdModal);
const modalOverlay =  document.querySelector('#modalOverlay');
const modalTitle =  document.querySelector('#modalTitle');
const editKey =  document.querySelector('#editKey');
const editValue =  document.querySelector('#editValue');
const editCategory =  document.querySelector('#editCategory'); 
const modalSave =  document.querySelector('#modalSave');
const modalCancel =  document.querySelector('#modalCancel');
const varWrapper =  document.querySelector('#varInsertWrapper');
const varTrigger =  document.querySelector('#varSelectTrigger');
const varOptionsBox =  document.querySelector('#varSelectOptions');
const autoSendToggle = document.querySelector('#autoSendToggle'); // 新增：获取开关元素

const customSelect = document.querySelector('#customSelect');
const selectTrigger = document.querySelector('#selectTrigger');
const selectTriggerText = document.querySelector('#selectTriggerText');
const selectOptions = document.querySelector('#selectOptions');
async function initCmdModal(){
    await initI18n();
    initVariableInserter();
    modalCancel.addEventListener('click', closeModal);
    modalOverlay.onmousedown = (e) => { if(e.target === modalOverlay) closeModal(); };
    // 2. 点击外部关闭
    document.addEventListener('click', (e) => {
        if (!customSelect.contains(e.target)) {
            closeSelect();
        }
    });
    // 1. 点击触发器：切换显示
    selectTrigger.addEventListener('click', (e) => {
        e.stopPropagation(); // 防止冒泡关闭自己
        const isOpen = selectOptions.classList.contains('open');
        if (isOpen) {
            closeSelect();
        } else {
            selectOptions.classList.add('open');
            selectTrigger.classList.add('active');
        }
    });
    renderLanguage();
}

function openModal(item = null, allCategories,activeCategoryId = 'all',text='') {
    modalTitle.textContent = item ? '编辑指令' : '新建指令';
    // 修改后的 JS 逻辑：
    const titleKey = item ? 'commands.modal_title_edit' : 'commands.modal_title_new';
    modalTitle.textContent = getI18nText(titleKey);
    modalTitle.setAttribute('data-i18n', titleKey); // 确保语言切换时也能正确响应
    // 初始化自动发送开关
    autoSendToggle.checked = item ? (item?.autoSend || false) : false;

    if (text!==''){
        editKey.value = text.substring(0, 5).replace(/\s/g, '');
        editValue.value = text; 
    }else{
        editKey.value = item ? item.key : '';
        editValue.value = item ? item.value : '';
    }
    
    // --- 渲染自定义下拉框选项 ---
    selectOptions.innerHTML = ''; // 清空旧选项
    
    // 1. 确定当前应该选中的值
    let currentVal = ""; // 默认为无分类
    if (item && item.categoryId) {
        currentVal = item.categoryId;
    } else if (!item && activeCategoryId !== 'all') {
        currentVal = activeCategoryId; // 新建时继承当前视图
    }

    // 2. 添加 "无分类" 选项
    addCustomOption("", getI18nText('commands.modal_no_category'), currentVal === "");
    // 3. 添加用户分类选项
    allCategories.forEach(cat => {
        addCustomOption(cat.id, cat.name, currentVal === cat.id);
    });
    // 4. 初始化触发器显示的文字
    const currentCatObj = allCategories.find(c => c.id === currentVal);
    selectTriggerText.textContent = currentCatObj ? currentCatObj.name : getI18nText('commands.modal_no_category');
    editCategory.value = currentVal; // 初始化 hidden input
    modalOverlay.classList.add('show');
    // 新增：禁止背景滚动
    document.body.style.overflow = 'hidden'; 

    setTimeout(() => editKey.focus(), 100);
}

// 辅助函数：创建单个下拉选项 DOM
function addCustomOption(value, name, isSelected) {
    const div = document.createElement('div');
    div.className = `custom-option ${isSelected ? 'selected' : ''}`;
    div.dataset.value = value;
    div.textContent = name;
    div.addEventListener('click', (e) => {
        e.stopPropagation();
        selectOption(value, name);      // 更新选中的值
    });
    
    selectOptions.appendChild(div);
}
function closeModal() { 
    modalOverlay.classList.remove('show');
    localStorage.removeItem('currentEditingId');
    document.body.style.overflow = '';
}

// --- 自定义下拉框，用于选择分类 ---
function closeSelect() {
    selectOptions.classList.remove('open');
    selectTrigger.classList.remove('active');
}

// 3. 选中选项
function selectOption(value, name) {
    // 更新显示文本
    selectTriggerText.textContent = name;
    // 更新真实值 (供保存按钮读取)
    editCategory.value = value;
    
    // 更新选中样式
    document.querySelectorAll('.custom-option').forEach(opt => {
        if (opt.dataset.value === value) opt.classList.add('selected');
        else opt.classList.remove('selected');
    });
    closeSelect();
}

function initVariableInserter() {
    if (!varWrapper || !varOptionsBox) return;
    // 1. 定义变量列表配置 (使用多语言)
    const variables = [
        { 
            value: '{{clipboard}}', 
            label: getI18nText('commands.var_clipboard_label'), 
            tooltip: getI18nText('commands.var_clipboard_tooltip') 
        },
        { 
            value: '{{title}}', 
            label: getI18nText('commands.var_title_label'), 
            tooltip: getI18nText('commands.var_title_tooltip') 
        },
        { 
            value: '{{url}}', 
            label: getI18nText('commands.var_url_label'), 
            tooltip: getI18nText('commands.var_url_tooltip') 
        },
        { 
            value: '{{date}}', 
            label: getI18nText('commands.var_date_label'), 
            tooltip: getI18nText('commands.var_date_tooltip') 
        },
        { 
            value: '{{time}}', 
            label: getI18nText('commands.var_time_label'), 
            tooltip: getI18nText('commands.var_time_tooltip') 
        },
        { 
            value: getI18nText('commands.var_input_value'), // 这里也做了国际化
            label: getI18nText('commands.var_input_label'), 
            tooltip: getI18nText('commands.var_input_tooltip') 
        }
    ];

    // 2. 渲染选项
    varOptionsBox.innerHTML = ''; // 清空
    variables.forEach(v => {
        const div = document.createElement('div');
        div.className = 'var-option';
        div.textContent = v.label;
        div.title = v.tooltip; // 设置原生 Tooltip
        
        // 点击选项事件
        div.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止冒泡
            insertTextAtCursor(editValue, v.value);
            closeVarSelect(); // 插入后关闭菜单
        });
        
        varOptionsBox.appendChild(div);
    });

    // 3. 交互逻辑
    // 点击触发器 -> 切换开关
    varTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = varWrapper.classList.contains('open');
        if (isOpen) closeVarSelect();
        else openVarSelect();
    });

    // 点击外部 -> 关闭
    document.addEventListener('click', (e) => {
        if (!varWrapper.contains(e.target)) {
            closeVarSelect();
        }
    });
    
    // 辅助：打开/关闭
    function openVarSelect() {
        varWrapper.classList.add('open');
    }
    function closeVarSelect() {
        varWrapper.classList.remove('open');
    }
}

// 辅助函数：在光标处插入文本 (保持不变)
function insertTextAtCursor(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const originalText = textarea.value;
    const before = originalText.substring(0, start);
    const after = originalText.substring(end, originalText.length);
    textarea.value = before + text + after;
    textarea.focus();
    
    if (text.startsWith('{{input:')) {
        const innerStart = start + 8; 
        const innerEnd = start + text.length - 2; 
        textarea.setSelectionRange(innerStart, innerEnd);
    } else {
        const newCursorPos = start + text.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
    }
}

// 拼音处理
// 检测是否包含简体中文
function hasChinese(str) {
  // 正则：匹配任意一个简体中文字符
  const reg = /[\u4e00-\u9fa5]/;
  // 先判断是否为字符串，避免非字符串参数报错
  return typeof str === 'string' && reg.test(str);
}

function preprocessShortcuts(rawList) {
  return rawList.map(item =>
    (hasChinese(item.key) && (!item._pinyinList || !item._searchString))
      ? preprocessShortcut(item)        // 需要补全
      : item                            // 已有，原样返回
  );
}
function preprocessEnKey(rawList) {
    return rawList.map(item =>{
        if (!hasChinese(item.key) && (item._pinyinList || item._searchString)){
            delete item._pinyinList;
            delete item._initialList;
            delete item._searchString;
            delete item._rawString;
            delete item._fuzzyPinyins;
            delete item._fuzzyInits;
            return item;
        }else{
            return item;
        }
    });
}
function preprocessShortcut(item) {
    let processed = { ...item };    // 创建原对象的浅拷贝，避免修改原始数据
    if (typeof pinyinPro !== 'undefined') {
        const key = item.key;
        const pList = []; // 全拼列表
        const iList = []; // 首字母列表
        
        // 逐字遍历，确保 list 长度与 key 长度严格一致
        for (const char of key) {
            if (/[\u4e00-\u9fa5]/.test(char)) {
                // 是汉字：生成拼音
                const pArr = pinyinPro.pinyin(char, { type: 'array', toneType: 'none' });
                const iArr = pinyinPro.pinyin(char, { pattern: 'initial', type: 'array', toneType: 'none' });
                pList.push(pArr[0] || '');  // 取第一个拼音结果
                iList.push(iArr[0] || '');  // 取第一个首字母结果
            } else {
                // 非汉字：直接保留小写字符
                const lower = char.toLowerCase();
                pList.push(lower);
                iList.push(lower);
            }
        }
        
        processed._pinyinList = pList;
        processed._initialList = iList;

        processed._searchString = iList.map(i => i ? i[0].toLowerCase() : '').join('');
        processed._rawString = iList.join('').toLowerCase();
        processed._fuzzyPinyins = pList.map(p => p.toLowerCase().replace(/zh/g, 'z').replace(/ch/g, 'c').replace(/sh/g, 's'));
        processed._fuzzyInits = iList.map(i => i ? i[0].toLowerCase() : '');
    }
    return processed;
}