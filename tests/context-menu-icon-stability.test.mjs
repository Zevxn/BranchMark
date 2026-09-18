import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, mindMap] = await Promise.all([
    readFile('app/HTML/MindMap.html', 'utf8'),
    readMindMapSource(),
]);
const fadeStart = html.indexOf('@keyframes fadeIn');
const fadeEnd = html.indexOf('.menu-item {', fadeStart);
const fadeAnimation = html.slice(fadeStart, fadeEnd);

assert.ok(fadeStart >= 0 && fadeEnd > fadeStart, '应能定位右键菜单淡入动画');
assert.match(fadeAnimation, /from\s*\{\s*opacity:\s*0\s*;/, '菜单应保留 opacity 淡入效果');
assert.match(fadeAnimation, /to\s*\{\s*opacity:\s*1\s*;/, '菜单淡入结束时应完全可见');
assert.doesNotMatch(fadeAnimation, /transform\s*:/, '菜单淡入不得缩放整层文字，避免鼠标刚进入时产生真实位移');
assert.doesNotMatch(html, /#contextMenu\s*>\s*\.menu-item\s*>\s*i\s*\{/, '不应保留对根因无效的图标专属合成规则');

assert.match(html, /\.menu-item:hover\s*\{[^}]*background:/, '应保留原有菜单项 hover 效果');
assert.match(html, /\.context-menu\.active\s*\{[^}]*animation:\s*fadeIn/, '应保留原有菜单淡入动画');
assert.match(html, /\.context-menu\.submenu-opens-left \.submenu\s*\{[^}]*right:\s*100%/s,
    '子菜单在右侧空间不足时应支持向左展开');
assert.match(html, /\.context-menu\.submenu-opens-left \.submenu::before\s*\{[^}]*right:\s*-20px/s,
    '向左展开的子菜单应保留鼠标移动缓冲区');
assert.match(mindMap, /function positionMindMapContextMenu\(menu, clientX, clientY\)[\s\S]*?menu\.offsetWidth[\s\S]*?menu\.offsetHeight/,
    '右键菜单应使用实际渲染尺寸定位，不能依赖固定宽高估算');
assert.match(mindMap, /opensRight[\s\S]*?submenu-opens-left/,
    '右键菜单应根据右侧空间决定子菜单展开方向');
assert.match(mindMap, /viewportBottom - submenuHeight[\s\S]*?submenu\.style\.top/,
    '子菜单纵向位置应限制在 Tab 栏上方的可见区域内');

console.log('右键菜单文字稳定性校验通过：保留淡入和 hover 效果，移除父级缩放位移。');
