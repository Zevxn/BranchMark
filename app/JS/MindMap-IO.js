// SECTION 节点剪贴板操作
const CUSTOM_MIME_TYPE = 'web text/x-mindmap-data';
const CLIPBOARD_SIGN = "MindMap_Node_Data_v1";

/**
 * 递归重生成节点 ID (用于粘贴时防止 ID 冲突)
 */
function renewNodeIds(node, idMap = new Map()) {
    const previousId = node.id;
    node.id = generateNodeId();
    if (previousId !== undefined && previousId !== null) {
        idMap.set(String(previousId), String(node.id));
    }
    // 重置一些状态
    node.folded = false; // 粘贴进来的节点默认展开
    // 确保样式模式兼容
    if (!node.widthMode) node.widthMode = 'auto';
    if (!node.heightMode) node.heightMode = 'auto';
    
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => renewNodeIds(child, idMap));
    }
    return node;
}

function getMindMapClipboardNodes(json) {
    if (json && json.signature === CLIPBOARD_SIGN && Array.isArray(json.nodes)) {
        return json.nodes;
    }

    try {
        // 导入文件与剪贴板共用格式识别：完整存档和纯 data 树都作为一棵待粘贴的子树。
        const node = JSON.parse(JSON.stringify(normalizeImportedMindMap(json).data));
        // 关联线和总结属于整张图的数据，不能跟随根节点成为子卡片属性。
        delete node.relations;
        delete node.summaries;
        delete node.foldedLeft;
        delete node.foldedRight;
        return [node];
    } catch (error) {
        return null;
    }
}

/* MindMap.js 底部 */

/**
 * 执行复制逻辑 (精准重组版 - 支持静默模式)
 * @param {boolean} showToast - 是否显示提示 (默认为 true)
 * @returns {Promise<boolean>} - 返回是否复制成功
 */
async function copySelectedNodes(showToast = true) {
    if (state.selectedIds.size === 0) return false;

    // 1. 建立映射表与克隆 (精准快照)
    const selectedMap = new Map();
    state.selectedIds.forEach(id => {
        const originalNode = findNode(state.data, id);
        if (originalNode) {
            const clone = deepCopyNode(originalNode);
            clone.children = []; // 清空孩子，稍后根据选中状态重组
            selectedMap.set(id, clone);
        }
    });

    const roots = [];

    // 2. 重新构建关系 (认祖归宗)
    selectedMap.forEach((clone, id) => {
        const originalParent = findParent(state.data, id);
        if (originalParent && selectedMap.has(originalParent.id)) {
            // 父亲也被选中了，加入父亲的孩子列表
            const parentClone = selectedMap.get(originalParent.id);
            parentClone.children.push(clone);
        } else {
            // 父亲没被选中，我是顶层
            roots.push(clone);
        }
    });

    if (roots.length === 0) return false;

    // 3. 写入剪贴板
    const clipboardDataObj = {
        signature: CLIPBOARD_SIGN,
        nodes: roots
    };

    const jsonString = JSON.stringify(clipboardDataObj);

    // --- 3. 写入剪贴板 (使用 ClipboardItem) ---
    try {
        // 创建私有数据 Blob
        const customBlob = new Blob([jsonString], { type: CUSTOM_MIME_TYPE });
        
        // 创建普通文本 Blob (作为掩护)
        // 用户在记事本粘贴时，只会看到这个字符串，而不是一大坨 JSON
        const plainTextBlob = new Blob([`[MindMap Nodes: ${roots.length} items]`], { type: 'text/plain' });

        // 构造 ClipboardItem
        // 注意：键名必须包含定义的 MIME Type
        const item = new ClipboardItem({
            [CUSTOM_MIME_TYPE]: customBlob,
            'text/plain': plainTextBlob 
        });

        await navigator.clipboard.write([item]);

        if (showToast) {
            showTopToast(`📝 已复制 ${selectedMap.size} 个节点`);
        }
        return true;
    } catch (err) {
        console.log('私有格式复制失败，尝试回退到普通文本模式:', err);
        // 兼容性降级：如果浏览器不支持自定义 MIME，回退到以前的明文 JSON 方式
        try {
            await navigator.clipboard.writeText(jsonString);
            if (showToast) showTopToast(`📝 已复制 ${selectedMap.size} 个节点`);
            return true;
        } catch (e2) {
            if (showToast) showTopToast('❌ 复制失败');
            return false;
        }
    }
}

/**
 * 执行剪切逻辑 (复制 + 删除)
 */
async function cutSelectedNodes() {
    if (state.selectedIds.size === 0) return;

    // 1. 先执行复制 (开启静默模式，不弹窗)
    const copySuccess = await copySelectedNodes(false);

    // 2. 如果复制成功，则执行删除
    if (copySuccess) {
        // 直接调用工具栏已有的删除按钮逻辑，复用其 robust 的删除算法
        // 注意：删除按钮的逻辑会处理 state.selectedIds 并记录历史
        const deleteBtn = document.getElementById('btn-delete');
        if (deleteBtn) {
            deleteBtn.click();
            showTopToast('✂️ 已剪切节点');
        }
    }
}

/* MindMap.js */

function pasteMindMapNodesToSelection(nodesToPaste) {
    if (!Array.isArray(nodesToPaste) || nodesToPaste.length === 0) return false;

    let targetId = state.data.id;
    if (state.selectedIds.size === 1) {
        targetId = Array.from(state.selectedIds)[0];
    } else if (state.selectedIds.size > 1) {
        showTopToast('⚠️ 请只选中一个节点作为粘贴目标');
        return false;
    }

    const targetNode = findNode(state.data, targetId);
    if (!targetNode) return false;

    if (!targetNode.children) targetNode.children = [];
    const isRoot = targetNode.id === state.data.id;

    let totalCount = 0;
    const countNodes = list => {
        list.forEach(node => {
            totalCount++;
            if (node.children?.length) countNodes(node.children);
        });
    };
    countNodes(nodesToPaste);

    const workbook = typeof mindMapWorkbook !== 'undefined' ? mindMapWorkbook : null;
    nodesToPaste.forEach(node => {
        const nodeIdMap = new Map();
        const newNode = renewNodeIds(node, nodeIdMap); // 重生成 ID
        if (workbook?.documentId && workbook.activeTabId) {
            rewriteMindMapInternalLinksInTree(newNode, {
                sourceDocumentId: workbook.documentId,
                destinationDocumentId: workbook.documentId,
                sourceTabId: workbook.activeTabId,
                nodeIdMap,
            });
        }
        if (isRoot) newNode.dir = 'right';
        else delete newNode.dir;
        targetNode.children.push(newNode);
    });

    invalidateMindMapNodeIndex();
    targetNode.folded = false;
    recordHistory();
    updateChildrenDOM(targetNode.id);
    state.selectedIds.clear();
    nodesToPaste.forEach(node => state.selectedIds.add(node.id));
    updateSelection();
    showTopToast(`📋 已粘贴 ${totalCount} 个节点`);
    return true;
}

/**
 * 执行粘贴逻辑 (修复版：正确统计粘贴总数)
 */
function parseMindMapPlainText(value) {
    const text = String(value ?? '').replace(/\r\n?/g, '\n');
    if (!text.trim()) return null;

    const firstLineBreak = text.indexOf('\n');
    const firstLine = firstLineBreak < 0 ? text : text.slice(0, firstLineBreak);
    const content = firstLineBreak < 0 ? '' : text.slice(firstLineBreak + 1);
    const headingMatch = firstLine.match(/^#{1,6}[ \t]+(.+)$/);
    const isMarkdownHeading = Boolean(headingMatch);

    return {
        text,
        firstLine,
        topic: isMarkdownHeading
            ? headingMatch[1].replace(/\*\*/g, '').trim()
            : '',
        content: isMarkdownHeading ? content : text,
        isMarkdownHeading
    };
}

function createMindMapNodeFromPlainText(value) {
    const parsed = parseMindMapPlainText(value);
    if (!parsed) return null;

    return {
        topic: parsed.topic,
        content: parsed.content,
        widthMode: 'auto',
        heightMode: 'auto'
    };
}

async function pasteNodesToSelection() {
    let nodesToPaste = [];
    let isMindMapData = false;

    try {
        // 优先读取私有剪贴板格式。
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                if (!item.types.includes(CUSTOM_MIME_TYPE)) continue;
                const text = await (await item.getType(CUSTOM_MIME_TYPE)).text();
                const clipboardNodes = getMindMapClipboardNodes(JSON.parse(text));
                if (!clipboardNodes) continue;
                nodesToPaste = clipboardNodes;
                isMindMapData = true;
                break;
            }
        } catch (_) { /* 读取失败或不支持时回退到纯文本 */ }

        if (!isMindMapData) {
            const text = await navigator.clipboard.readText();
            if (text) {
                try {
                    const clipboardNodes = getMindMapClipboardNodes(JSON.parse(text));
                    if (clipboardNodes) {
                        nodesToPaste = clipboardNodes;
                        isMindMapData = true;
                    }
                } catch (_) { /* 无法解析 JSON 时按普通文本处理 */ }

                if (!isMindMapData) {
                    if (text.startsWith('[MindMap Nodes:')) {
                        showTopToast('⚠️ 无法识别节点数据');
                        return;
                    }
                    const plainTextNode = createMindMapNodeFromPlainText(text);
                    nodesToPaste = plainTextNode ? [plainTextNode] : [];
                }
            }
        }

        pasteMindMapNodesToSelection(nodesToPaste);
    } catch (err) {
        console.log('粘贴过程出错:', err);
    }
}

// !SECTION 节点剪贴板操作




// SECTION 编辑器图片上传

function initializeImageUpload() {
    const textarea = document.getElementById('editorTextarea');
    const settingsBtn = document.getElementById('btn-img-settings');
    // 定义存储的 Key
    const STORAGE_KEY = 'MindMap_ImgBB_Key';

    // 1. 设置按钮点击事件
    if (settingsBtn) {
        settingsBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            let currentKey = '';
            try {
                // [修改] 从 chrome.storage.local 读取
                const result = await chrome.storage.local.get([STORAGE_KEY]);
                currentKey = result[STORAGE_KEY] || '';
            } catch (err) {
                console.log('读取 API Key 失败', err);
            }

            const newKey = prompt('请输入 ImgBB API Key:\n(申请地址: https://api.imgbb.com/)', currentKey);
            
            if (newKey !== null) {
                // [修改] 写入 chrome.storage.local
                await chrome.storage.local.set({ [STORAGE_KEY]: newKey.trim() });
                showTopToast('✅ API Key 已保存');
            }
        };
    }

    // 2. 监听粘贴事件
    textarea.addEventListener('paste', async (e) => {
        // 获取剪贴板中的条目
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let imageFile = null;

        // 查找图片文件
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                imageFile = item.getAsFile();
                break;
            }
        }

        // 如果没有图片，允许默认行为（粘贴文本）
        if (!imageFile) return;

        // 阻止默认粘贴行为
        e.preventDefault();

        // [修改] 从 chrome.storage.local 读取 API Key
        // 注意：因为外层函数已经是 async (e)，这里直接 await 即可
        let apiKey = '';
        try {
            const result = await chrome.storage.local.get([STORAGE_KEY]);
            apiKey = result[STORAGE_KEY];
        } catch (err) {
            console.log('存储读取错误', err);
        }

        if (!apiKey) {
            alert('请先点击工具栏的【图片设置】按钮配置 ImgBB API Key 才能上传图片。');
            return;
        }

        // 3. 插入占位符
        const uniqueId = Date.now(); 
        const placeholder = `![⏳ 图片上传中...-${uniqueId}]()`;
        
        insertTextToEditor(textarea, placeholder);

        try {
            // 4. 执行上传 (逻辑不变)
            const imageUrl = await uploadToImgBB(imageFile, apiKey);
            
            // 5. 上传成功：替换占位符
            const finalMarkdown = `![image](${imageUrl})`;
            replaceTextInEditor(textarea, placeholder, finalMarkdown);
            
            showTopToast('✅ 图片上传成功');

        } catch (err) {
            console.log(err);
            // 6. 上传失败
            const errorText = `[❌ 图片上传失败: ${err.message}]`;
            replaceTextInEditor(textarea, placeholder, errorText);
            alert('图片上传失败: ' + err.message);
        }
    });
}
/**
 * 上传图片到 ImgBB
 */
async function uploadToImgBB(file, apiKey) {
    const formData = new FormData();
    formData.append('key', apiKey);
    formData.append('image', file);

    const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
        throw new Error(json.error ? json.error.message : '网络请求错误');
    }

    return json.data.url;
}

/**
 * 辅助：在光标处插入文本 (兼容撤销/重做)
 */
function insertTextToEditor(textarea, text) {
    if (document.execCommand) {
        // 使用 execCommand 支持浏览器原生撤销
        textarea.focus();
        document.execCommand('insertText', false, text);
    } else {
        // 降级方案
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        textarea.value = val.substring(0, start) + text + val.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }
    // 触发 input 事件以更新预览
    textarea.dispatchEvent(new Event('input')); 
}

/**
 * 辅助：全局替换文本 (用于异步回调后的替换)
 */
function replaceTextInEditor(textarea, originalText, newText) {
    // 由于是异步回调，光标可能已经移动，所以这里采用简单的全文替换策略
    // 只要 uniqueId 足够唯一，就不会误伤
    const val = textarea.value;
    if (val.includes(originalText)) {
        // 保存当前滚动位置
        const scrollTop = textarea.scrollTop;
        const selectionStart = textarea.selectionStart;
        
        // 替换
        textarea.value = val.replace(originalText, newText);
        
        // 恢复状态
        textarea.scrollTop = scrollTop;
        // 如果光标在替换区域之后，需要调整光标位置 (可选优化，简单起见可忽略)
        
        // 触发 input 事件以更新预览
        textarea.dispatchEvent(new Event('input'));
        
        // 如果正在同步预览，强制刷新一次
        if(typeof processRichContent === 'function') {
            const preview = document.getElementById('previewContent');
            if(preview) {
                preview.innerHTML = renderMarkdown(textarea.value);
                processRichContent(preview);
            }
        }
    }
}

// !SECTION 编辑器图片上传




// SECTION Markdown 拖拽导入
function isMarkdownFile(file) {
    return Boolean(file && typeof file.name === 'string' && /\.md$/i.test(file.name));
}

function replaceLegacyMathDelimiters(text) {
    return text
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, expression) => '$$' + expression + '$$')
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, expression) => '$' + expression + '$');
}

function normalizeMathOutsideInlineCode(text) {
    let result = '';
    let cursor = 0;

    while (cursor < text.length) {
        const openingIndex = text.indexOf('`', cursor);
        if (openingIndex === -1) {
            result += replaceLegacyMathDelimiters(text.slice(cursor));
            break;
        }

        let runLength = 1;
        while (text[openingIndex + runLength] === '`') runLength += 1;
        const delimiter = '`'.repeat(runLength);
        const closingIndex = text.indexOf(delimiter, openingIndex + runLength);

        result += replaceLegacyMathDelimiters(text.slice(cursor, openingIndex));
        if (closingIndex === -1) {
            result += text.slice(openingIndex);
            break;
        }

        const codeEnd = closingIndex + runLength;
        result += text.slice(openingIndex, codeEnd);
        cursor = codeEnd;
    }

    return result;
}

function normalizeMarkdownMathDelimiters(markdown) {
    if (typeof markdown !== 'string' || !markdown) return markdown || '';

    let result = '';
    let proseBuffer = '';
    let cursor = 0;
    let fenceCharacter = '';
    let fenceLength = 0;

    const flushProse = () => {
        result += normalizeMathOutsideInlineCode(proseBuffer);
        proseBuffer = '';
    };

    while (cursor < markdown.length) {
        const newlineIndex = markdown.indexOf('\n', cursor);
        const lineEnd = newlineIndex === -1 ? markdown.length : newlineIndex + 1;
        const line = markdown.slice(cursor, lineEnd);
        const lineWithoutEnding = line.endsWith('\n') ? line.slice(0, -1) : line;

        if (!fenceCharacter) {
            const openingFence = lineWithoutEnding.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
            if (openingFence) {
                flushProse();
                fenceCharacter = openingFence[1][0];
                fenceLength = openingFence[1].length;
                result += line;
            } else {
                proseBuffer += line;
            }
        } else {
            result += line;
            const closingFence = lineWithoutEnding.match(/^[ \t]{0,3}(`+|~+)[ \t]*\r?$/);
            if (closingFence && closingFence[1][0] === fenceCharacter && closingFence[1].length >= fenceLength) {
                fenceCharacter = '';
                fenceLength = 0;
            }
        }

        cursor = lineEnd;
    }

    flushProse();
    return result;
}

function readDroppedFileAsText(file) {
    if (file && typeof file.text === 'function') {
        return file.text();
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error || new Error('无法读取 Markdown 文件'));
        reader.readAsText(file);
    });
}

async function readDroppedMarkdownFiles(dataTransfer) {
    const markdownFiles = Array.from(dataTransfer?.files || []).filter(isMarkdownFile);
    return Promise.all(markdownFiles.map(async file => {
        const content = await readDroppedFileAsText(file);
        return {
            topic: file.name.replace(/\.md$/i, ''),
            content: normalizeMarkdownMathDelimiters(content)
        };
    }));
}

function initializeNativeDragDrop() {
    const app = document.getElementById('app');
    const insertLine = document.getElementById('insertLine'); // 复用现有的插入线元素

    // 1. 拖拽进入/悬停 (视觉反馈：高亮或显示插入线)
    app.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        
        const card = e.target.closest('.node-card');
        if (!card) {
            // 如果不在卡片上，清除所有状态
            document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
            if(insertLine) insertLine.style.display = 'none';
            return;
        }

        // 根节点只能作为父节点添加子节点，不支持兄弟插入
        const isRoot = card.dataset.nodeId === state.data.id;
        const rect = card.getBoundingClientRect();
        const ry = e.clientY - rect.top; // 鼠标在卡片内的 Y 坐标

        // 清除旧状态
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        if(insertLine) insertLine.style.display = 'none';

        // 设置拖拽效果
        e.dataTransfer.dropEffect = 'copy';

        // 判定逻辑
        if (!isRoot && ry < rect.height * 0.25) {
            // --- 上方区域：插入上方兄弟 ---
            insertLine.style.display = 'block';
            insertLine.style.left = rect.left + 'px';
            insertLine.style.top = (rect.top - 4) + 'px';
            insertLine.style.width = rect.width + 'px';
            card.dataset.dragState = 'BEFORE'; // 临时标记状态
        } 
        else if (!isRoot && ry > rect.height * 0.75) {
            // --- 下方区域：插入下方兄弟 ---
            insertLine.style.display = 'block';
            insertLine.style.left = rect.left + 'px';
            insertLine.style.top = (rect.bottom + 2) + 'px';
            insertLine.style.width = rect.width + 'px';
            card.dataset.dragState = 'AFTER';
        } 
        else {
            // --- 中间区域 或 根节点：添加子节点 ---
            card.classList.add('drop-target');
            card.dataset.dragState = 'CHILD';
        }
    });

    // 2. 拖拽离开 (清除样式)
    app.addEventListener('dragleave', (e) => {
        const card = e.target.closest('.node-card');
        // 只有当真正离开这个元素时才移除 (避免子元素触发)
        if (card && !card.contains(e.relatedTarget)) {
            card.classList.remove('drop-target');
            delete card.dataset.dragState;
        }
        // 如果离开了整个 app 区域，隐藏线
        if (e.target.id === 'app') {
            if(insertLine) insertLine.style.display = 'none';
        }
    });

    // 3. 放置 (核心逻辑)
    app.addEventListener('drop', async (e) => {
        e.preventDefault();
        
        // 清除所有高亮和辅助线
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        if(insertLine) insertLine.style.display = 'none';

        const card = e.target.closest('.node-card');
        if (!card) return;

        // 获取放置类型 (依赖 dragover 时计算的状态，或者重新计算)
        // 为了稳健性，这里建议重新计算一次，防止 dragover 状态未及时更新
        const isRoot = card.dataset.nodeId === state.data.id;
        const rect = card.getBoundingClientRect();
        const ry = e.clientY - rect.top;
        
        let dropType = 'CHILD';
        if (!isRoot) {
            if (ry < rect.height * 0.25) dropType = 'BEFORE';
            else if (ry > rect.height * 0.75) dropType = 'AFTER';
        }

        const targetId = card.dataset.nodeId;
        // 在异步文件读取前保存本次拖拽的块；dragend 会清理拖拽状态。
        const documentBlocks = typeof getMindMapDocumentDraggedBlocks === 'function'
            ? getMindMapDocumentDraggedBlocks(e.dataTransfer)
            : [];
        let nodePayloads = [];
        let isMarkdownDrop = false;

        try {
            nodePayloads = await readDroppedMarkdownFiles(e.dataTransfer);
            isMarkdownDrop = nodePayloads.length > 0;
        } catch (error) {
            showTopToast(`❌ Markdown 文件读取失败：${error.message || '未知错误'}`);
            delete card.dataset.dragState;
            return;
        }

        if (!isMarkdownDrop) {
            // 资源管理器拖入的非 Markdown 文件不应退化为“文件路径文字”节点。
            if (e.dataTransfer?.files?.length) {
                delete card.dataset.dragState;
                return;
            }

            const text = e.dataTransfer?.getData('text/plain') || '';
            if (!text.trim()) {
                delete card.dataset.dragState;
                return;
            }

            const [header, body] = extractMarkdownHeader(normalizeMarkdownMathDelimiters(text));
            nodePayloads = [{ topic: header, content: body }];
        }

        const targetNode = findNode(state.data, targetId);
        
        if (targetNode) {
            // 文件拖拽可一次创建多个节点；文字拖拽仍只创建一个节点。
            const newNodes = nodePayloads.map(({ topic, content }) => ({
                id: generateNodeId(),
                topic,
                content,
                isSimple: false,
                heightMode: 'auto',
                widthMode: 'auto',
                width: 360,
                children: []
            }));
            let inserted = false;

            // --- 分支 A: 添加子节点 ---
            if (dropType === 'CHILD') {
                // 处理根节点的方向逻辑
                if (targetId === state.data.id) {
                    const rRect = card.getBoundingClientRect();
                    const direction = (e.clientX < rRect.left + rRect.width / 2) ? 'left' : 'right';
                    newNodes.forEach(node => { node.dir = direction; });
                } else {
                    // 如果不是根节点，且有方向属性（比如在 Dock 或其他特定逻辑下），可以继承
                    // 这里通常不需要处理，因为子节点方向由布局算法自动处理
                    newNodes.forEach(node => { delete node.dir; });
                }

                if (!targetNode.children) targetNode.children = [];
                targetNode.children.push(...newNodes);
                invalidateMindMapNodeIndex();
                targetNode.folded = false; 
                
                recordHistory();
                updateChildrenDOM(targetId);
                inserted = true;
            } 
            // --- 分支 B: 添加兄弟节点 ---
            else {
                const parent = findParent(state.data, targetId);
                if (parent) {
                    // 1. 继承方向 (重要：保持在同一侧)
                    newNodes.forEach(node => { node.dir = targetNode.dir; });

                    // 2. 找到插入位置
                    const index = parent.children.findIndex(c => c.id === targetId);
                    
                    if (index !== -1) {
                        const insertIndex = (dropType === 'BEFORE') ? index : index + 1;
                        parent.children.splice(insertIndex, 0, ...newNodes);
                        invalidateMindMapNodeIndex();
                        
                        recordHistory();
                        updateChildrenDOM(parent.id);
                        inserted = true;
                    }
                }
            }

            if (inserted && documentBlocks.length) removeMindMapDocumentBlocks(documentBlocks);

            if (isMarkdownDrop) {
                showTopToast(`✅ 已从 ${newNodes.length} 个 Markdown 文件创建节点`);
            }
        }
        
        // 清理临时属性
        delete card.dataset.dragState;
    });
}
/**
 * 提取 Markdown 标题：
 * 1. 识别首行是否为 1～6 个 "#" 加空白开头
 * 2. 去掉开头的 Markdown 标题标记
 * 3. 如果标题两边包含 "**"，也一并去掉
 * @param {string} text - 输入的字符串
 * @returns {Array<string>} - [处理后的标题, 剩余内容]
 */
function extractMarkdownHeader(text) {
    const parsed = parseMindMapPlainText(text);
    if (!parsed) return ["", ""];

    const formulaPattern = /\$.*\$/;
    if (formulaPattern.test(parsed.firstLine)) {
        return ["", parsed.text];
    }

    return parsed.isMarkdownHeading
        ? [parsed.topic, parsed.content]
        : ["", parsed.text];
}

// !SECTION Markdown 拖拽导入

// SECTION Canvas 导出
    // 辅助：RGB 转 Hex (Obsidian Canvas 需要 Hex 颜色)
/**
 * @param {string} rgb - RGB 颜色字符串，如 "rgb(255, 0, 0)"
 * @param {number} saturation - 饱和度系数 (默认 1)
 *    0: 完全灰色 (黑白)
 *    1: 原始颜色 (无变化)
 *    >1: 提高饱和度 (例如 2 是双倍饱和度)
 */
function rgbToHex (rgb, saturation = 4) {
    if (!rgb || rgb === 'rgba(0, 0, 0, 0)' || rgb === 'transparent') return null;
    
    // 如果已经是 Hex，直接返回（不做饱和度处理，因为函数名是rgbToHex）
    if (rgb.startsWith('#')) return rgb;

    // 处理 rgb(r, g, b)
    const sep = rgb.indexOf(",") > -1 ? "," : " ";
    const rgbArr = rgb.substr(4).split(")")[0].split(sep);
    
    // 1. 先转为数字类型
    let r = +rgbArr[0],
        g = +rgbArr[1],
        b = +rgbArr[2];

    // 2. 调整饱和度算法 (如果系数不是 1)
    if (saturation !== 1) {
        // 计算亮度 (Luma)，使用人眼感知的加权公式: 0.299R + 0.587G + 0.114B
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // 公式: 目标颜色 = 灰度 + (原色 - 灰度) * 饱和度系数
        r = gray + (r - gray) * saturation;
        g = gray + (g - gray) * saturation;
        b = gray + (b - gray) * saturation;

        // 修正数值范围 (0 - 255) 并取整
        r = Math.max(0, Math.min(255, Math.round(r)));
        g = Math.max(0, Math.min(255, Math.round(g)));
        b = Math.max(0, Math.min(255, Math.round(b)));
    }
    
    // 3. 转为 16 进制字符串
    let rHex = r.toString(16),
        gHex = g.toString(16),
        bHex = b.toString(16);
    
    if (rHex.length == 1) rHex = "0" + rHex;
    if (gHex.length == 1) gHex = "0" + gHex;
    if (bHex.length == 1) bHex = "0" + bHex;
    
    return "#" + rHex + gHex + bHex;
};

async function writeMindMapCanvasExport(canvasData, fileName) {
    const jsonString = JSON.stringify(canvasData, null, 2);
    const isSaved = await saveFileDirectly(fileName, jsonString);
    if (isSaved) {
        showTopToast(`✅ 导图已保存到 Obsidian: ${fileName}`);
        return true;
    }

    downloadFile(jsonString, fileName, 'application/json');
    showTopToast(`✅ 已下载文件 (API 不可用或被拒绝)`);
    return false;
}

// SECTION 横向 Canvas 导出

async function exportToCanvas() {
    const nodes = [];
    const edges = [];
    const rootId = state.data.id;
    
    // 获取根节点的 DOM 用于计算相对坐标原点
    const rootCard = document.getElementById(`card-${rootId}`);
    if (!rootCard) {
        showTopToast('❌ 无法找到根节点，导出失败');
        return;
    }
    
    // 获取根节点的绝对位置，作为 Canvas 的 (0,0) 参考点
    // 这样导出的 Canvas 内容会大致居中
    const rootRect = rootCard.getBoundingClientRect();
    const currentScale = state.view.scale;
    const EXPORT_SCALE = 1.35; // 用户要求的 1.25 倍间距缩放

    // 递归遍历函数
    const traverse = (node, parentId) => {
        const el = document.getElementById(`card-${node.id}`);
        if (!el) return;

        // 1. 计算几何尺寸与位置
        const rect = el.getBoundingClientRect();

        // 核心公式：(当前屏幕坐标 - 根节点屏幕坐标) / 当前缩放比例 * 1.25
        const x = Math.round(((rect.left - rootRect.left) / currentScale) * EXPORT_SCALE);
        const y = Math.round(((rect.top - rootRect.top) / currentScale) * EXPORT_SCALE);
        const width = Math.round((rect.width / currentScale) * EXPORT_SCALE);
        const height = Math.round((rect.height / currentScale) * EXPORT_SCALE);

        // 2. 获取颜色
        // 优先读取实际渲染的背景色（解决彩虹模式颜色不在 node.data 里的问题）
        let colorHex = null;
        if (node.isSimple) {
            // 便利贴模式：颜色在 card 上
            const bg = window.getComputedStyle(el).backgroundColor;
            colorHex = rgbToHex(bg);
        } else {
            // 标准模式：颜色在 header 上
            const header = el.querySelector('.card-header');
            if (header) {
                const bg = window.getComputedStyle(header).backgroundColor;
                colorHex = rgbToHex(bg);
            }
        }
        // 如果是默认白色/透明，不传 color 字段给 Obsidian
        if (colorHex === '#ffffff') colorHex = null;

        // 3. 构建节点内容
        // 标题加粗，内容换行
        let textContent = node.topic.length>0? `# ${node.topic}\n\n` : '';
        if (node.content) {
            textContent += `${node.content}`;
        }

        // 添加节点
        nodes.push({
            id: node.id,
            type: 'text',
            text: textContent,
            x: x,
            y: y,
            width: width,
            height: height,
            color: colorHex ? colorHex : undefined // 仅当有颜色时添加
        });

        // 4. 构建连线 (Edge)
        if (parentId) {
            // 判断连线方向
            // 如果节点在根节点的左侧体系内 (isDescendantOfLeft 是现有函数)，则 父左->子右
            // 否则 父右->子左
            const isLeft = isDescendantOfLeft(node.id);
            
            edges.push({
                id: generateNodeId(), // 生成唯一的 Edge ID
                fromNode: parentId,
                fromSide: isLeft ? 'left' : 'right',
                toNode: node.id,
                toSide: isLeft ? 'right' : 'left',
                color: colorHex ? colorHex : undefined // 线条颜色跟随节点
            });
        }

        // 递归子节点
        if (node.children && node.children.length > 0) {
            // 注意：因为是 DOM 遍历，不需要处理 folded，
            // 但如果节点被折叠了，DOM 可能不存在或位置不对。
            // 这里我们假设导出时希望导出完整数据，或者只导出可见数据。
            // 如果只想导出可见的，加上 if(!node.folded) check。
            // 既然是生成文件，通常导出所有数据比较好，但要考虑 DOM 是否渲染。
            // 你的 MindMap 实现中，折叠的节点是不渲染 DOM 的。
            // 为了保证有坐标，必须只导出“未折叠”的节点，或者临时强制计算（太复杂）。
            // 策略：只导出当前可见的节点。
            
            if (!node.folded) {
                node.children.forEach(child => traverse(child, node.id));
            }
        }
    };

    // 开始遍历
    traverse(state.data, null);
    appendMindMapRelationsToCanvas(nodes, edges);

    // 生成 JSON 字符串
    const canvasData = {
        nodes: nodes,
        edges: edges
    };
    const fileName = `${getMindMapExportBaseName()}.canvas`;
    await writeMindMapCanvasExport(canvasData, fileName);
}

// !SECTION 横向 Canvas 导出

// SECTION 竖向 Canvas 导出


async function exportToVerticalCanvas() {
    // 1. 常量与配置
    const EXPORT_SCALE = 1.35;  // 保持和横向导出一致的缩放倍率
    const GAP_X = 40;           // 兄弟节点之间的水平间距 (Canvas坐标系)
    const GAP_Y = 150;          // 父子层级之间的垂直间距 (Canvas坐标系)
    const currentScale = state.view.scale; // 当前视图缩放比
    
    const nodes = [];
    const edges = [];

    // 2. 第一步：构建虚拟树 & 获取真实 DOM 尺寸
    // 这一步解决了"尺寸变了"的问题，直接读 DOM
    const buildVirtualTree = (node) => {
        const el = document.getElementById(`card-${node.id}`);
        // 如果节点折叠了或者找不到 DOM，给个默认值（防止报错）
        let realW = 200, realH = 100;
        let colorHex = null;

        if (el) {
            const rect = el.getBoundingClientRect();
            // 核心修复：完全照搬原版导出的尺寸计算公式
            realW = Math.round((rect.width / currentScale) * EXPORT_SCALE);
            realH = Math.round((rect.height / currentScale) * EXPORT_SCALE);

            // 读取颜色
            if (node.isSimple) {
                colorHex = rgbToHex(window.getComputedStyle(el).backgroundColor);
            } else {
                const header = el.querySelector('.card-header');
                if (header) colorHex = rgbToHex(window.getComputedStyle(header).backgroundColor);
            }
            if (colorHex === '#ffffff') colorHex = null;
        }

        const vNode = {
            id: node.id,
            topic: node.topic,
            content: node.content,
            width: realW,
            height: realH,
            color: colorHex,
            children: [],
            // 下面两个属性用于布局计算
            x: 0,
            y: 0,
            subtreeWidth: 0 // 子树总宽度
        };

        // 处理子节点顺序：左侧分支在前，右侧分支在后
        if (node.children && node.children.length > 0 && !node.folded) {
            const lefts = node.children.filter(c => c.dir === 'left');
            const rights = node.children.filter(c => c.dir !== 'left');
            const sorted = [...lefts, ...rights];
            vNode.children = sorted.map(child => buildVirtualTree(child));
        }

        return vNode;
    };

    // 3. 第二步：计算子树宽度 (后序遍历 - 自底向上)
    // 计算每个节点及其所有子孙节点并排在一起需要多宽
    const calculateSubtreeWidth = (vNode) => {
        if (vNode.children.length === 0) {
            vNode.subtreeWidth = vNode.width;
        } else {
            // 先递归算孩子
            vNode.children.forEach(calculateSubtreeWidth);
            
            // 孩子的总宽度 = 所有孩子的 subtreeWidth 之和 + 间隙
            const childrenTotalW = vNode.children.reduce((sum, child) => sum + child.subtreeWidth, 0) 
                                 + (vNode.children.length - 1) * GAP_X;
            
            // 自己的 subtreeWidth = max(自己宽, 孩子总宽)
            vNode.subtreeWidth = Math.max(vNode.width, childrenTotalW);
        }
    };

    // 4. 第三步：计算最终坐标 (前序遍历 - 自顶向下)
    // 解决了"位置乱"的问题，父节点永远居中于子节点上方
    const calculateCoordinates = (vNode, startX, currentY) => {
        vNode.y = currentY;

        // 核心布局逻辑：
        // 当前节点要在分配给它的 startX ~ startX + subtreeWidth 这个范围内居中
        // 公式：startX + (总宽/2) - (自己宽/2)
        vNode.x = startX + (vNode.subtreeWidth / 2) - (vNode.width / 2);

        // 如果有孩子，算出孩子们的起始 X
        if (vNode.children.length > 0) {
            const childrenTotalW = vNode.children.reduce((sum, c) => sum + c.subtreeWidth, 0) 
                                 + (vNode.children.length - 1) * GAP_X;
            
            // 孩子们的整体也要在 currentArea 居中
            // 孩子起始 X = startX + (父总宽 - 孩总宽) / 2
            let childStartX = startX + (vNode.subtreeWidth - childrenTotalW) / 2;
            
            const nextY = currentY + vNode.height + GAP_Y;

            vNode.children.forEach(child => {
                calculateCoordinates(child, childStartX, nextY);
                // 移动游标，下一个孩子紧挨着
                childStartX += child.subtreeWidth + GAP_X;
            });
        }
    };

    // 5. 第四步：生成 Canvas 数据
    const generateJson = (vNode, parentId = null) => {
        let textContent =vNode.topic.length>0? `# ${vNode.topic}\n\n`:'';
        if (vNode.content) textContent += `${vNode.content}`;

        nodes.push({
            id: vNode.id,
            type: 'text',
            text: textContent,
            x: Math.round(vNode.x),
            y: Math.round(vNode.y),
            width: vNode.width,
            height: vNode.height,
            color: vNode.color
        });

        if (parentId) {
            edges.push({
                id: 'edge-' + Math.random().toString(36).substr(2, 9),
                fromNode: parentId,
                fromSide: 'bottom', // 父节点底部
                toNode: vNode.id,
                toSide: 'top',      // 子节点顶部
                color: vNode.color // 线条颜色跟随子节点
            });
        }

        vNode.children.forEach(child => generateJson(child, vNode.id));
    };

    // --- 执行 ---
    const rootId = state.data.id;
    // 1. 构建树
    const vRoot = buildVirtualTree(state.data);
    
    // 2. 计算宽度
    calculateSubtreeWidth(vRoot);
    
    // 3. 计算坐标 (从 0,0 开始)
    calculateCoordinates(vRoot, 0, 0);
    
    // 4. 生成数据
    generateJson(vRoot);
    appendMindMapRelationsToCanvas(nodes, edges);

    // 5. 导出文件
    const canvasData = { nodes, edges };
    const fileName=`${getMindMapExportBaseName()}_Vertical.canvas`;
    await writeMindMapCanvasExport(canvasData, fileName);
}

// !SECTION 竖向 Canvas 导出

// !SECTION Canvas 导出
