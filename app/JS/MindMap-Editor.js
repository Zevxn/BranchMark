// SECTION Markdown 源码编辑器适配
let mindMapSourceEditor = null;

function getMindMapSourceEditor() {
    return mindMapSourceEditor || document.getElementById('editorTextarea');
}

function initializeMindMapSourceEditor() {
    const textarea = document.getElementById('editorTextarea');
    const cm = window.BranchMarkCodeMirror;
    if (mindMapSourceEditor || !textarea || !cm) return;

    const host = document.createElement('div');
    host.id = 'markdownSourceEditor';
    host.className = 'markdown-source-editor';
    const inputEvents = new EventTarget();
    const { tags } = cm;
    const extensions = [
        cm.history(),
        cm.drawSelection(),
        cm.highlightSpecialChars(),
        cm.keymap.of([...cm.historyKeymap, ...cm.defaultKeymap, cm.indentWithTab]),
        cm.markdown({ codeLanguages: cm.languages, extensions: cm.markdownMath }),
        cm.syntaxHighlighting(cm.mathHighlightStyle),
        cm.syntaxHighlighting(cm.HighlightStyle.define([
            { tag: tags.heading, color: 'var(--md-heading)', fontWeight: 'bold' },
            { tag: tags.strong, fontWeight: 'bold' },
            { tag: tags.emphasis, fontStyle: 'italic' },
            { tag: tags.strikethrough, textDecoration: 'line-through' },
            { tag: [tags.link, tags.url], color: 'var(--md-link)' },
            { tag: tags.monospace, color: 'var(--md-string)' },
            { tag: [tags.comment, tags.quote], color: 'var(--md-comment)' },
            { tag: [tags.keyword, tags.processingInstruction, tags.meta], color: 'var(--md-keyword)' },
            { tag: [tags.string, tags.attributeValue], color: 'var(--md-string)' },
            { tag: [tags.number, tags.bool, tags.null], color: 'var(--md-number)' },
            { tag: [tags.tagName, tags.typeName, tags.className], color: 'var(--md-heading)' },
            { tag: [tags.attributeName, tags.propertyName], color: 'var(--md-property)' },
            { tag: tags.function(tags.variableName), color: 'var(--md-function)' },
            { tag: tags.invalid, color: 'var(--md-invalid)' },
        ])),
        cm.EditorView.lineWrapping,
        cm.placeholder('在此输入 Markdown...'),
        cm.EditorView.contentAttributes.of({ 'aria-label': 'Markdown 源码', spellcheck: 'false' }),
        cm.EditorView.updateListener.of(update => {
            if (update.docChanged) inputEvents.dispatchEvent(new Event('input'));
        }),
    ];
    const view = new cm.EditorView({
        state: cm.EditorState.create({ doc: textarea.value, extensions }),
        parent: host,
    });
    textarea.after(host);
    textarea.hidden = true;
    textarea.style.display = 'none';
    document.getElementById('editorPreviewResizer')?.setAttribute('aria-controls', 'markdownSourceEditor previewContent');

    // 仅适配现有编辑操作；源码始终由 CodeMirror state 持有，不维护第二份副本。
    mindMapSourceEditor = {
        view,
        get value() { return view.state.doc.toString(); },
        set value(text) {
            const current = this.value;
            if (current === text) return;
            // 取色预览只提交变化区间以减少重绘；正式提交前恢复原始状态。
            let from = 0, oldEnd = current.length, newEnd = text.length;
            while (from < oldEnd && from < newEnd && current[from] === text[from]) from++;
            while (oldEnd > from && newEnd > from && current[oldEnd - 1] === text[newEnd - 1]) {
                oldEnd--;
                newEnd--;
            }
            view.dispatch({
                changes: { from, to: oldEnd, insert: text.slice(from, newEnd) },
                annotations: cm.Transaction.addToHistory.of(false),
            });
        },
        get selectionStart() { return view.state.selection.main.from; },
        get selectionEnd() { return view.state.selection.main.to; },
        get scrollTop() { return view.scrollDOM.scrollTop; },
        set scrollTop(top) { view.scrollDOM.scrollTop = top; },
        get scrollHeight() { return view.scrollDOM.scrollHeight; },
        get clientHeight() { return view.scrollDOM.clientHeight; },
        focus() { view.focus(); },
        setSelectionRange(start, end) {
            const length = view.state.doc.length;
            view.dispatch({ selection: { anchor: Math.max(0, Math.min(start, length)), head: Math.max(0, Math.min(end, length)) } });
        },
        addEventListener(type, listener, options) {
            if (type === 'input') inputEvents.addEventListener(type, listener, options);
            else if (type === 'scroll') view.scrollDOM.addEventListener(type, listener, options);
            // 图片粘贴、导图内链接快捷键要在 CodeMirror 的默认处理之前接管。
            else view.dom.addEventListener(type, listener, options ?? (type === 'paste' || type === 'keydown'));
        },
        load(text) {
            view.setState(cm.EditorState.create({ doc: text, extensions }));
            view.scrollDOM.scrollTop = 0;
            view.requestMeasure();
        },
    };
}

function loadMindMapSourceEditor(text) {
    const editor = getMindMapSourceEditor();
    if (editor.view) editor.load(text);
    else editor.value = text;
}

function restoreMindMapSourceEditorSnapshot(editor, text, editorState) {
    // 临时取色会映射撤销历史；恢复完整不可变状态后再正式提交，保留先前输入的历史。
    if (editor.view && editorState) editor.view.setState(editorState);
    else editor.value = text;
}

function notifyMindMapSourceEditorInput(editor) {
    // CodeMirror 的事务自动通知预览；原生输入框回退仍需手动派发 input。
    if (!editor.view) editor.dispatchEvent(new Event('input'));
}

function replaceMindMapEditorSelection(editor, text) {
    editor.focus({ preventScroll: true });
    if (editor.view) {
        const cm = window.BranchMarkCodeMirror;
        editor.view.dispatch({
            ...editor.view.state.replaceSelection(text),
            annotations: [cm.Transaction.userEvent.of('input'), cm.isolateHistory.of('full')],
        });
    } else {
        const start = editor.selectionStart, end = editor.selectionEnd;
        if (typeof document.execCommand !== 'function' || !document.execCommand('insertText', false, text)) {
            editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
            editor.setSelectionRange(start + text.length, start + text.length);
        }
        notifyMindMapSourceEditorInput(editor);
    }
}
// !SECTION Markdown 源码编辑器适配
