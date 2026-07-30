// offscreen.js - 24K-GA Nano Banana 算法移植版

// 配置：对应原项目 constants.js 中的 MASK_CONFIGS
// 注意：path 改为了插件根目录文件名../libs/icons/icon128.png
const MASK_CONFIGS = [
    { size: 96, path: 'mask/mask_96.png', margin: 64 },
    { size: 48, path: 'mask/mask_48.png', margin: 32 }
];

// 全局缓存处理好的 Mask 数据
const maskCache = new Map();

// ==========================================
// 1. Mask 预处理 (对应 maskUtils.js preprocessMask)
// 从 RGB 亮度提取 alpha 值，转为纯白透明图
// ==========================================
function preprocessMask(rawImageData) {
    const data = rawImageData.data;
    const width = rawImageData.width;
    const height = rawImageData.height;
    
    const processed = new ImageData(width, height);
    const output = processed.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // 计算亮度 (Luminance)
        const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        
        // 设置 RGB 为白色 (水印本体)，Alpha 为亮度
        output[i] = 255;     // R
        output[i + 1] = 255; // G
        output[i + 2] = 255; // B
        output[i + 3] = luminance; // Alpha
    }
    
    return processed;
}

// ==========================================
// 2. 加载所有 Masks
// ==========================================
async function loadAllMasks() {
    if (maskCache.size > 0) return; // 已加载

    for (const config of MASK_CONFIGS) {
        try {
            const response = await fetch(config.path);
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);
            
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            
            const rawData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
            const processedData = preprocessMask(rawData);
            
            maskCache.set(config.size, {
                width: bitmap.width,
                height: bitmap.height,
                imageData: processedData,
                margin: config.margin // 边距非常重要
            });
            console.log(`[Offscreen] Mask loaded: ${config.size}px (Margin: ${config.margin})`);
        } catch (e) {
            console.error(`[Offscreen] Failed to load ${config.path}`, e);
        }
    }
}

// ==========================================
// 3. 选择合适的 Mask (对应 maskUtils.js selectMask)
// ==========================================
function selectMask(width, height) {
    let selectedSize;
    // 原项目逻辑：长宽都大于 1024 使用 96px Mask，否则 48px
    if (width > 1024 && height > 1024) {
        selectedSize = 96;
    } else {
        selectedSize = 48;
    }
    return maskCache.get(selectedSize);
}

// ==========================================
// 4. 反向 Alpha 混合 (对应 maskUtils.js reverseAlphaBlend)
// ==========================================
function reverseAlphaBlend(imageData, mask, imgWidth, imgHeight) {
    const imgPixels = imageData.data;
    const maskPixels = mask.imageData.data;
    const maskWidth = mask.width;
    const maskHeight = mask.height;
    const margin = mask.margin;
    
    // 计算 Mask 在图片右下角的位置
    const offsetX = imgWidth - maskWidth - margin;
    const offsetY = imgHeight - maskHeight - margin;

    // 越界检查
    if (offsetX < 0 || offsetY < 0) return;

    for (let my = 0; my < maskHeight; my++) {
        for (let mx = 0; mx < maskWidth; mx++) {
            const imgX = offsetX + mx;
            const imgY = offsetY + my;
            
            // 边界安全检查
            if (imgX >= imgWidth || imgY >= imgHeight) continue;
            
            const imgIdx = (imgY * imgWidth + imgX) * 4;
            const maskIdx = (my * maskWidth + mx) * 4;
            
            // 获取 Mask 的 Alpha (0-1)
            // 可以在这里乘以一个强度系数，如 1.0 (原项目 ALPHA_INTENSITY)
            let alpha = (maskPixels[maskIdx + 3] / 255) * 1.0;
            
            // 优化：跳过几乎透明的区域和完全覆盖的区域
            if (alpha < 0.01 || alpha > 0.99) continue;
            
            const invAlpha = 1 - alpha;
            
            // 原图像素
            const compR = imgPixels[imgIdx];
            const compG = imgPixels[imgIdx + 1];
            const compB = imgPixels[imgIdx + 2];
            
            // 水印颜色 (纯白)
            const wmR = 255;
            const wmG = 255;
            const wmB = 255;
            
            // 核心还原公式: Original = (Composite - Watermark * alpha) / (1 - alpha)
            let origR = (compR - wmR * alpha) / invAlpha;
            let origG = (compG - wmG * alpha) / invAlpha;
            let origB = (compB - wmB * alpha) / invAlpha;
            
            // 限制范围 0-255
            imgPixels[imgIdx]     = Math.max(0, Math.min(255, origR));
            imgPixels[imgIdx + 1] = Math.max(0, Math.min(255, origG));
            imgPixels[imgIdx + 2] = Math.max(0, Math.min(255, origB));
        }
    }
}

// ==========================================
// 5. 主处理流程
// ==========================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PROCESS_IMAGE') {
        processImage(message.dataUrl).then(res => {
            sendResponse({ success: true, dataUrl: res });
        }).catch(err => {
            console.error(err);
            sendResponse({ success: false });
        });
        return true; 
    }
});

async function processImage(base64Data) {
    // 1. 确保 Mask 已加载
    await loadAllMasks();

    // 2. 加载原图
    const response = await fetch(base64Data);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    
    const width = bitmap.width;
    const height = bitmap.height;
    
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    
    // 3. 智能选择 Mask
    const selectedMask = selectMask(width, height);
    
    if (!selectedMask) {
        console.warn('[Offscreen] 未找到合适的 Mask，跳过处理');
        return base64Data;
    }

    console.log(`[Offscreen] 处理图片: ${width}x${height}, 使用 Mask: ${selectedMask.width}px, 边距: ${selectedMask.margin}`);

    // 4. 获取像素数据
    const imageData = ctx.getImageData(0, 0, width, height);

    // 5. 执行算法
    // 注：这里跳过了原项目的 detectWatermark 步骤，因为用户点击下载通常意味着有水印
    // 直接执行去除可以减少计算量，且反向混合算法在无水印区域（alpha=0）不会改变像素
    reverseAlphaBlend(imageData, selectedMask, width, height);
    
    // 6. 写回 Canvas
    ctx.putImageData(imageData, 0, 0);
    
    // 7. 导出
    const processedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return new Promise(r => {
        const reader = new FileReader();
        reader.onloadend = () => r(reader.result);
        reader.readAsDataURL(processedBlob);
    });
}