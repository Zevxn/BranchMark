import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('app/HTML/MindMap.html', 'utf8');
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

console.log('右键菜单文字稳定性校验通过：保留淡入和 hover 效果，移除父级缩放位移。');
