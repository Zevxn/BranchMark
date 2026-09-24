/**
 * 生成桌面版应用图标，不依赖任何第三方库。
 *
 * 产物：
 *   desktop/build/icon.ico  —— 多尺寸（16/24/32/48/64/128/256），BMP(DIB) 条目，
 *                              兼容性最好，electron-builder 校验 256x256 也认。
 *   desktop/build/icon.png  —— 256x256，供其他构建目标或文档使用。
 *
 * 画法：4 倍超采样后做预乘 alpha 的均值下采样，得到平滑边缘。
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPERSAMPLE = 4;
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const BACKGROUND = [79, 70, 229];
const FOREGROUND = [255, 255, 255];

// SECTION 几何绘制

function setPixel(buffer, size, x, y, color) {
    const offset = (y * size + x) * 4;
    buffer[offset] = color[0];
    buffer[offset + 1] = color[1];
    buffer[offset + 2] = color[2];
    buffer[offset + 3] = 255;
}

function insideRoundedRect(px, py, x0, y0, x1, y1, radius) {
    if (px < x0 || px > x1 || py < y0 || py > y1) return false;
    const cx = px < x0 + radius ? x0 + radius : (px > x1 - radius ? x1 - radius : px);
    const cy = py < y0 + radius ? y0 + radius : (py > y1 - radius ? y1 - radius : py);
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= radius * radius;
}

function fillRoundedRect(buffer, size, x0, y0, width, height, radius, color) {
    const x1 = x0 + width;
    const y1 = y0 + height;
    const fromY = Math.max(0, Math.floor(y0));
    const toY = Math.min(size, Math.ceil(y1));
    const fromX = Math.max(0, Math.floor(x0));
    const toX = Math.min(size, Math.ceil(x1));

    for (let y = fromY; y < toY; y++) {
        for (let x = fromX; x < toX; x++) {
            if (insideRoundedRect(x + 0.5, y + 0.5, x0, y0, x1, y1, radius)) {
                setPixel(buffer, size, x, y, color);
            }
        }
    }
}

function fillCircle(buffer, size, cx, cy, radius, color) {
    const radiusSquared = radius * radius;
    const fromY = Math.max(0, Math.floor(cy - radius));
    const toY = Math.min(size, Math.ceil(cy + radius));
    const fromX = Math.max(0, Math.floor(cx - radius));
    const toX = Math.min(size, Math.ceil(cx + radius));

    for (let y = fromY; y < toY; y++) {
        for (let x = fromX; x < toX; x++) {
            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            if (dx * dx + dy * dy <= radiusSquared) {
                setPixel(buffer, size, x, y, color);
            }
        }
    }
}

/** 以胶囊（圆头线段）方式绘制主线，保证转角处不出现缺口。 */
function drawBranch(buffer, size, x1, y1, x2, y2, width, color) {
    const half = width / 2;
    const fromY = Math.max(0, Math.floor(Math.min(y1, y2) - half));
    const toY = Math.min(size, Math.ceil(Math.max(y1, y2) + half));
    const fromX = Math.max(0, Math.floor(Math.min(x1, x2) - half));
    const toX = Math.min(size, Math.ceil(Math.max(x1, x2) + half));

    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy || 1;

    for (let y = fromY; y < toY; y++) {
        for (let x = fromX; x < toX; x++) {
            const px = x + 0.5 - x1;
            const py = y + 0.5 - y1;
            let t = (px * dx + py * dy) / lengthSquared;
            t = t < 0 ? 0 : (t > 1 ? 1 : t);
            const offsetX = px - t * dx;
            const offsetY = py - t * dy;
            if (offsetX * offsetX + offsetY * offsetY <= half * half) {
                setPixel(buffer, size, x, y, color);
            }
        }
    }
}

// !SECTION 几何绘制

// SECTION 图标绘制

/** 画一颗「中心节点 + 四个分支」的思维导图。 */
function renderIcon(size) {
    const hi = size * SUPERSAMPLE;
    const buffer = new Uint8Array(hi * hi * 4);

    fillRoundedRect(buffer, hi, 0, 0, hi, hi, hi * 0.21, BACKGROUND);

    const center = hi / 2;
    const offset = hi * 0.198;
    const branches = [
        [center - offset, center - offset],
        [center + offset, center - offset],
        [center + offset, center + offset],
        [center - offset, center + offset],
    ];

    for (const [x, y] of branches) {
        drawBranch(buffer, hi, center, center, x, y, hi * 0.055, FOREGROUND);
    }
    for (const [x, y] of branches) {
        fillCircle(buffer, hi, x, y, hi * 0.075, FOREGROUND);
    }
    fillCircle(buffer, hi, center, center, hi * 0.115, FOREGROUND);

    return downsample(buffer, hi, size);
}

/** 预乘 alpha 的均值下采样，边缘不会出现黑边。 */
function downsample(source, hi, size) {
    const output = new Uint8Array(size * size * 4);
    const samples = SUPERSAMPLE * SUPERSAMPLE;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let red = 0;
            let green = 0;
            let blue = 0;
            let alpha = 0;

            for (let sy = 0; sy < SUPERSAMPLE; sy++) {
                for (let sx = 0; sx < SUPERSAMPLE; sx++) {
                    const index = ((y * SUPERSAMPLE + sy) * hi + (x * SUPERSAMPLE + sx)) * 4;
                    const a = source[index + 3];
                    red += source[index] * a;
                    green += source[index + 1] * a;
                    blue += source[index + 2] * a;
                    alpha += a;
                }
            }

            const offset = (y * size + x) * 4;
            if (alpha === 0) continue;
            output[offset] = Math.round(red / alpha);
            output[offset + 1] = Math.round(green / alpha);
            output[offset + 2] = Math.round(blue / alpha);
            output[offset + 3] = Math.round(alpha / samples);
        }
    }

    return output;
}

// !SECTION 图标绘制

// SECTION PNG 编码

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
    }
    return table;
})();

function crc32(buffer) {
    let c = -1;
    for (let i = 0; i < buffer.length; i++) {
        c = CRC_TABLE[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
    const chunk = Buffer.alloc(data.length + 12);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4, 'ascii');
    data.copy(chunk, 8);
    const crcInput = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    chunk.writeUInt32BE(crc32(crcInput), data.length + 8);
    return chunk;
}

function encodePng(rgba, size) {
    const stride = size * 4;
    const raw = Buffer.alloc(size * (stride + 1));
    for (let y = 0; y < size; y++) {
        const rowStart = y * (stride + 1);
        raw[rowStart] = 0; // filter type: none
        Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, rowStart + 1);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type: RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

// !SECTION PNG 编码

// SECTION ICO 编码

/**
 * 生成 ICO 里的单个条目，使用经典 BMP(DIB) 负载。
 * 相比 PNG 负载，BMP 条目能被所有解析器正确处理，包括 electron-builder
 * 的图标尺寸校验。
 */
function encodeBmpEntry(rgba, size) {
    const pixelCount = size * size;
    const xor = Buffer.alloc(pixelCount * 4);

    // BMP 的行序是自下而上，通道序是 BGRA
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const source = ((size - 1 - y) * size + x) * 4;
            const target = (y * size + x) * 4;
            xor[target] = rgba[source + 2];
            xor[target + 1] = rgba[source + 1];
            xor[target + 2] = rgba[source];
            xor[target + 3] = rgba[source + 3];
        }
    }

    // AND 掩码全 0：真正的透明信息由 alpha 通道决定
    const maskStride = Math.ceil(size / 32) * 4;
    const andMask = Buffer.alloc(maskStride * size);

    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8); // 高度翻倍：XOR 图 + AND 掩码
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    header.writeUInt32LE(0, 16); // BI_RGB
    header.writeUInt32LE(xor.length + andMask.length, 20);

    return Buffer.concat([header, xor, andMask]);
}

function encodeIco(entries) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);            // reserved
    header.writeUInt16LE(1, 2);            // type: icon
    header.writeUInt16LE(entries.length, 4);

    const directory = Buffer.alloc(16 * entries.length);
    let offset = 6 + directory.length;

    entries.forEach((entry, index) => {
        const base = index * 16;
        const dimension = entry.size >= 256 ? 0 : entry.size;
        directory[base] = dimension;
        directory[base + 1] = dimension;
        directory[base + 2] = 0; // 调色板数量
        directory[base + 3] = 0; // reserved
        directory.writeUInt16LE(1, base + 4);
        directory.writeUInt16LE(32, base + 6);
        directory.writeUInt32LE(entry.data.length, base + 8);
        directory.writeUInt32LE(offset, base + 12);
        offset += entry.data.length;
    });

    return Buffer.concat([header, directory, ...entries.map(entry => entry.data)]);
}

// !SECTION ICO 编码

const outputDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');
mkdirSync(outputDir, { recursive: true });

const rendered = SIZES.map(size => ({ size, rgba: renderIcon(size) }));

const png = rendered.find(item => item.size === 256);
writeFileSync(path.join(outputDir, 'icon.png'), encodePng(png.rgba, png.size));

const ico = encodeIco(rendered.map(item => ({
    size: item.size,
    data: encodeBmpEntry(item.rgba, item.size),
})));
writeFileSync(path.join(outputDir, 'icon.ico'), ico);

console.log(`已生成图标：${path.join(outputDir, 'icon.ico')}（${SIZES.join(', ')}）`);
console.log(`已生成图标：${path.join(outputDir, 'icon.png')}（256x256）`);
