// hook.js
(function() {
    // console.log('[Banana] 内存劫持系统启动');
    const blobCache = new Map();

    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function(obj) {
        const url = originalCreateObjectURL.apply(this, arguments);
        if (obj instanceof Blob || obj instanceof File) {
            const dataPromise = new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);   // 读取成功返回 Base64
                reader.onerror = () => resolve(null);           // 读取失败返回 null
                reader.readAsDataURL(obj);                      // 把 Blob/File 转成 Base64 字符串
            });
            blobCache.set(url, dataPromise);                    // 把 blob URL 和对应的 Base64 Promise 存入缓存
            setTimeout(() => blobCache.delete(url), 180000);    // 3分钟后自动清理缓存（防止内存泄漏）
        }
        return url;
    };

    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
        const url = this.href;
        
        // 核心判断条件：
        // 1. 有 download 属性（是下载链接）
        // 2. href 存在且以 blob: 开头（是 blob URL）
        // 3. 该 blob URL 存在于缓存中
        if (this.hasAttribute('download') && url && url.startsWith('blob:') && blobCache.has(url)) {
            // console.log('[Banana] ⚡️ 命中缓存:', url);
            
            // --- 文件名处理开始 ---
            let filename = this.getAttribute('download');
            
            // 1. 如果没获取到文件名，给个默认的
            if (!filename) {
                filename = 'generated_image.png';
            }
            
            // 2. 强制补全 .png 后缀 (如果原来没有)
            if (!filename.toLowerCase().endsWith('.png')) {
                filename += '.png';
            }
            // --- 文件名处理结束 ---
            // console.log('[Banana] 文件名处理结果:', filename);
            blobCache.get(url).then(base64Data => {
                if (base64Data) {
                    window.postMessage({
                        type: 'BANANA_INTERCEPT_DOWNLOAD',
                        base64: base64Data,
                        filename: filename // 发送处理好的文件名
                    }, '*');
                } else {
                    originalClick.apply(this);
                }
            });
            return; 
        }
        return originalClick.apply(this, arguments);
    };


    // #region 豆包去水印
    // console.log('%c [豆包去水印插件] 🚀 核心逻辑已在 Main World 启动');
    // 1. 保存原始的 JSON.parse 方法
    const originalParse = JSON.parse;

    /**
     * 递归遍历对象，寻找并替换图片链接
     * @param {Object} obj 服务器返回的JSON对象
     */
    function replaceImageUrls(obj) {
        if (!obj || typeof obj !== 'object') return;

        // 处理数组
        if (Array.isArray(obj)) {
            obj.forEach(item => replaceImageUrls(item));
            return;
        }

        // 遍历对象属性
        for (const key in obj) {
            // 核心逻辑：寻找 image_ori_raw 字段
            if (key === 'image' && obj[key]?.image_ori_raw?.url) {
                const rawUrl = obj[key].image_ori_raw.url;
                
                if (rawUrl) {
                    // 替换原图链接
                    if (obj[key].image_ori) obj[key].image_ori.url = rawUrl;
                    // 替换预览图链接
                    if (obj[key].image_preview) obj[key].image_preview.url = rawUrl;
                    // 替换缩略图链接
                    if (obj[key].image_thumb) obj[key].image_thumb.url = rawUrl;
                    
                    console.log('✨ 成功替换一张无水印原图');
                }
            } else {
                // 递归深层搜索
                replaceImageUrls(obj[key]);
            }
        }
    }

    /**
     * 简单的视频链接提取 (保留原逻辑)
     */
    function checkVideoUrl(obj) {
        if (!obj) return;
        if (typeof obj === 'object') {
            if (obj.play_info && obj.play_info.main) {
                console.log('🎥 [插件] 发现视频链接:', obj.play_info.main);
            }
            Object.values(obj).forEach(checkVideoUrl);
        }
    }

    // 2. 重写 JSON.parse
    // 所有的 Fetch/XHR 请求返回的 JSON 都会经过这里
    JSON.parse = function(text, reviver) {
        // 先解析出原始数据
        const data = originalParse(text, reviver);

        try {
            // 性能优化：只有当文本包含特定关键字时才进行深度遍历
            if (text.includes('creations') || text.includes('image_ori_raw')) {
                replaceImageUrls(data);
            }
            if (text.includes('play_info')) {
                checkVideoUrl(data);
            }
        } catch (e) {
            console.log('[插件] 去水印处理出错:', e);
        }

        // 返回修改后的数据给网页
        return data;
    };

})();