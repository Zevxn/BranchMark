import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile('app/JS/renderMD.js', 'utf8');
const helperMatch = source.match(/function svgSourceToDataUrl\(source\) \{[\s\S]*?\n\}/);
assert.ok(helperMatch, '应定义 Mermaid SVG data URL 转换函数');

const context = vm.createContext({ encodeURIComponent });
const svgSourceToDataUrl = vm.runInContext(`(${helperMatch[0]})`, context);
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>中文 # &amp;</text></svg>';
const dataUrl = svgSourceToDataUrl(svg);
assert.match(dataUrl, /^data:image\/svg\+xml;charset=utf-8,/);
assert.equal(decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1)), svg,
    'SVG data URL 应无损保留 Unicode 和特殊字符');

const copyStart = source.indexOf('function copyMermaidAsPng()');
const copyEnd = source.indexOf('// ==========================================', copyStart);
const copyFunction = source.slice(copyStart, copyEnd);
assert.ok(copyStart >= 0 && copyEnd > copyStart, '应能定位 Mermaid PNG 复制函数');
assert.match(copyFunction, /svgSourceToDataUrl\(source\)/,
    'PNG 导出应使用自包含 data URL');
assert.doesNotMatch(copyFunction, /URL\.createObjectURL|URL\.revokeObjectURL/,
    'PNG 导出不应再通过 WebView2 中可能污染 Canvas 的 blob URL');
assert.match(copyFunction, /await canvasToPngBlob\(canvas\)/,
    'Canvas 导出错误应进入统一的异常处理');
assert.match(source, /if \(blob\) resolve\(blob\);[\s\S]*reject\(new Error/,
    'toBlob 返回空值时应明确报错');

console.log('Mermaid PNG 导出校验通过：WebView2 使用自包含 SVG data URL，并完整处理 Canvas 导出失败。');
