// SECTION CodeMirror 本地依赖入口
export { EditorState, Transaction } from '@codemirror/state';
export { EditorView, keymap, drawSelection, highlightSpecialChars, placeholder } from '@codemirror/view';
export { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory } from '@codemirror/commands';
export { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
export { markdown } from '@codemirror/lang-markdown';
export { languages } from '@codemirror/language-data';
export { tags } from '@lezer/highlight';
export { markdownMath, mathHighlightStyle } from '../app/JS/markdown-math.mjs';
// !SECTION CodeMirror 本地依赖入口
