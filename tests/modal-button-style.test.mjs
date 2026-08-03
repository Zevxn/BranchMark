import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mindMapHtml = await readFile('app/HTML/MindMap.html', 'utf8');
const bookmarkCss = await readFile('app/CSS/BookMarks.css', 'utf8');

assert.match(mindMapHtml, /\.toolbar \.btn,\s*\.modal-head \.btn\s*\{/,
    '思维导图按钮基础样式应限制在工具栏和编辑器标题栏');
assert.doesNotMatch(mindMapHtml, /^\s*\.btn\s*\{/m,
    '思维导图页面不应再用全局 .btn 污染收藏夹模态框');
assert.match(bookmarkCss, /\.mymodal \.btn-secondary\s*\{/,
    '取消按钮样式应限制在收藏夹模态框');
assert.match(bookmarkCss, /\.mymodal \.btn-danger\s*\{/,
    '删除按钮样式应限制在收藏夹模态框');
assert.match(bookmarkCss, /\.mymodal \.btn-danger:hover\s*\{/,
    '删除按钮悬停样式不应再被工具栏规则覆盖');

console.log('模态框按钮样式校验通过：工具栏和收藏夹按钮选择器已隔离。');
