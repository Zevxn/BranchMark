'use strict';

// SECTION Markdown 编辑器浏览器回归
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { app, BrowserWindow } = require('electron');

app.setPath('userData', mkdtempSync(join(tmpdir(), 'branchmark-editor-')));
app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { backgroundThrottling: false } });
    const evaluate = code => window.webContents.executeJavaScript(code, true);
    try {
        await window.loadFile(resolve(__dirname, '../app/HTML/MindMap.html'));
        await evaluate(`new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if (typeof getMindMapSourceEditor === 'function' && getMindMapSourceEditor()?.view && state.data) return resolve();
                if (Date.now() - start > 5000) return reject(new Error('编辑器初始化超时'));
                setTimeout(check, 20);
            };
            check();
        })`);
        const sample = '# 示例标题\n\n普通文字 **加粗** [链接](https://example.com)\n\n```javascript\nconst answer = 42;\n```';
        await evaluate(`openMindMapEditor(state.data, false, true); loadMindMapSourceEditor(${JSON.stringify(sample)});`);
        await evaluate(`new Promise((resolve, reject) => {
            const started = Date.now();
            const check = () => {
                if ([...getMindMapSourceEditor().view.dom.querySelectorAll('.cm-line span')].some(span => span.textContent === 'const')) return resolve();
                if (Date.now() - started > 3000) return reject(new Error('代码块高亮超时'));
                setTimeout(check, 20);
            };
            check();
        })`);
        const appearance = await evaluate(`(() => {
            const editor = getMindMapSourceEditor();
            const spans = [...editor.view.dom.querySelectorAll('.cm-line span')];
            const title = spans.find(span => span.textContent.includes('示例标题'));
            const keyword = spans.find(span => span.textContent === 'const');
            return { source: editor.value, height: editor.clientHeight, scrollHeight: editor.scrollHeight,
                titleColor: title && getComputedStyle(title).color,
                keywordColor: keyword && getComputedStyle(keyword).color,
                spans: spans.map(span => ({ text: span.textContent, color: getComputedStyle(span).color })),
                plainColor: getComputedStyle(editor.view.dom).color, hidden: document.getElementById('editorTextarea').hidden };
        })()`);
        assert.equal(appearance.source, sample);
        assert.equal(appearance.hidden, true);
        assert.ok(appearance.height > 100 && appearance.scrollHeight >= appearance.height, '编辑区必须占据可滚动的有效空间');
        assert.ok(appearance.titleColor && appearance.titleColor !== appearance.plainColor, 'Markdown 标题应着色');
        assert.ok(appearance.keywordColor && appearance.keywordColor !== appearance.plainColor, '代码块应按语言着色：' + JSON.stringify(appearance.spans));

        // 使用实际编辑器确认行内、块公式分色，内部空行与等号不影响解析。
        const mathSample = '参数 $\\alpha=a\\tau$。\n\n$$\nf_Y(y)\n=\n\\frac{\\beta^\\alpha}{\\Gamma(\\alpha)}\n\ny^{\\alpha-1}\n$$';
        const mathAppearance = await evaluate(`(async () => {
            loadMindMapSourceEditor(${JSON.stringify(mathSample)});
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const editor = getMindMapSourceEditor();
            const spans = [...editor.view.dom.querySelectorAll('.cm-line span')];
            const color = text => {
                const span = spans.find(span => span.textContent === text);
                return span && getComputedStyle(span).color;
            };
            const originalTheme = document.documentElement.getAttribute('data-theme');
            const themes = ['light', 'dark'].map(theme => {
                document.documentElement.setAttribute('data-theme', theme);
                return { command: color('\\\\frac'), inline: color('\\\\alpha'), number: color('1'),
                    plain: getComputedStyle(editor.view.dom).color };
            });
            if (originalTheme === null) document.documentElement.removeAttribute('data-theme');
            else document.documentElement.setAttribute('data-theme', originalTheme);
            return { source: editor.value, themes,
                equationWeight: getComputedStyle([...editor.view.dom.querySelectorAll('.cm-line')].find(line => line.textContent === '=')).fontWeight };
        })()`);
        assert.equal(mathAppearance.source, mathSample);
        for (const theme of mathAppearance.themes) {
            assert.ok(theme.command && theme.inline && theme.number, '行内及块公式必须生成着色节点');
            assert.notEqual(theme.command, theme.plain);
            assert.notEqual(theme.command, theme.number);
        }
        assert.notEqual(mathAppearance.themes[0].command, mathAppearance.themes[1].command, '公式配色必须跟随明暗主题');
        assert.ok(Number(mathAppearance.equationWeight) < 600, '独立等号不得将公式误识别为标题');

        // 使用真实输入路径，确认 CodeMirror 输入会驱动右侧预览。
        await evaluate(`loadMindMapSourceEditor('正文'); getMindMapSourceEditor().focus(); getMindMapSourceEditor().setSelectionRange(0, 0);`);
        await window.webContents.insertText('中文');
        assert.deepEqual(await evaluate(`({ text: getMindMapSourceEditor().value, preview: document.getElementById('previewContent').textContent.trim() })`),
            { text: '中文正文', preview: '中文正文' });
        await evaluate(`getMindMapSourceEditor().setSelectionRange(0, 2); document.querySelector('.edit-btn[data-cmd="bold"]').click();`);
        assert.equal(await evaluate('getMindMapSourceEditor().value'), '**中文**正文');
        await window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Z', modifiers: ['control'] });
        await window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Z', modifiers: ['control'] });
        assert.equal(await evaluate('getMindMapSourceEditor().value'), '中文正文', '格式工具必须能一次撤销');

        // 取色预览不得消耗撤销历史，正式提交可撤销到原始文字。
        await evaluate(`getMindMapSourceEditor().setSelectionRange(0, 2);
            const picker = document.getElementById('editorCustomColor');
            picker.value = '#ff0000'; picker.dispatchEvent(new Event('input'));
            picker.value = '#00ff00'; picker.dispatchEvent(new Event('input'));
            picker.dispatchEvent(new Event('change'));`);
        assert.equal(await evaluate('getMindMapSourceEditor().value'), '<span style="color:#00ff00">中文</span>正文');
        await evaluate(`BranchMarkCodeMirror.historyKeymap.find(binding => binding.key === 'Mod-z').run(getMindMapSourceEditor().view)`);
        assert.equal(await evaluate('getMindMapSourceEditor().value'), '中文正文');
        await evaluate(`BranchMarkCodeMirror.historyKeymap.find(binding => binding.key === 'Mod-z').run(getMindMapSourceEditor().view)`);
        assert.equal(await evaluate('getMindMapSourceEditor().value'), '正文', '取色预览不得破坏更早的输入历史');

        // 用本地替身上传图片，验证粘贴在默认处理前被接管，且异步替换保留后方选区。
        const imageResult = await evaluate(`(async () => {
            loadMindMapSourceEditor('前文后文');
            const editor = getMindMapSourceEditor();
            editor.setSelectionRange(2, 2);
            await chrome.storage.local.set({ MindMap_ImgBB_Key: 'test-key' });
            const upload = uploadToImgBB;
            let finishUpload, calls = 0;
            uploadToImgBB = () => { calls++; return new Promise(resolve => { finishUpload = resolve; }); };
            try {
                const data = new DataTransfer();
                data.items.add(new File(['test-image'], 'test.png', { type: 'image/png' }));
                const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
                editor.view.contentDOM.dispatchEvent(event);
                await new Promise(resolve => setTimeout(resolve, 30));
                const placeholder = editor.value.includes('![⏳ 图片上传中...');
                if (!finishUpload) throw new Error('图片粘贴未调用上传入口');
                editor.setSelectionRange(editor.value.length - 2, editor.value.length);
                finishUpload('data:image/png;base64,iVBORw0KGgo=');
                await new Promise(resolve => setTimeout(resolve, 30));
                return { calls, prevented: event.defaultPrevented, placeholder: !!placeholder,
                    source: editor.value, selected: editor.value.slice(editor.selectionStart, editor.selectionEnd) };
            } finally { uploadToImgBB = upload; }
        })()`);
        assert.equal(imageResult.calls, 1);
        assert.ok(imageResult.prevented && imageResult.placeholder);
        assert.equal(imageResult.source, '前文![image](data:image/png;base64,iVBORw0KGgo=)后文');
        assert.equal(imageResult.selected, '后文');

        const saved = await evaluate(`(() => {
            loadMindMapSourceEditor('保存正文');
            document.getElementById('btn-close-modal').click();
            const saved = state.data.content;
            openMindMapEditor(state.data, false, true);
            const undone = BranchMarkCodeMirror.historyKeymap.find(binding => binding.key === 'Mod-z').run(getMindMapSourceEditor().view);
            openMindMapEditor(state.data, true);
            return { saved, undone, readOnly: document.getElementById('editorTextarea').parentElement.style.display };
        })()`);
        assert.deepEqual(saved, { saved: '保存正文', undone: false, readOnly: 'none' });
        console.log('CodeMirror 编辑器校验通过：源码着色、数学公式与明暗配色、离线代码语言、输入预览、格式撤销、取色历史、图片粘贴、选区映射、保存及历史隔离。');
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
        window.destroy();
        app.exit(process.exitCode || 0);
    }
});
// !SECTION Markdown 编辑器浏览器回归
