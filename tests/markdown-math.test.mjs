import assert from 'node:assert/strict';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { highlightTree } from '@lezer/highlight';
import { markdownMath, mathHighlightStyle } from '../app/JS/markdown-math.mjs';

// SECTION Markdown 数学源码解析检查
const mathParser = markdown({ codeLanguages: languages, extensions: markdownMath }).language.parser;
function nodes(source, type) {
    const matches = [];
    mathParser.parse(source).iterate({ enter(node) {
        if (node.name === type) matches.push(source.slice(node.from, node.to));
    } });
    return matches;
}
const display = String.raw`$$
f_Y(y)
=
\frac{\beta^\alpha}{\Gamma(\alpha)}
y^{\alpha-1}
e^{-\beta y},
\qquad y\geq 0
$$`;
assert.deepEqual(nodes(display, 'MathBlock'), [display]);
assert.deepEqual(nodes(display, 'SetextHeading1'), [], '公式中的等号不得生成 Markdown 标题');
assert.deepEqual(nodes(String.raw`参数 $\alpha=a\tau$ 与 $x_1^{2}$。`, 'InlineMath'), [String.raw`$\alpha=a\tau$`, '$x_1^{2}$']);
assert.deepEqual(nodes('金额 $5 和 $10，公式 $x$；数值 $5$。', 'InlineMath'), ['$x$', '$5$']);
assert.deepEqual(nodes('未闭合 $x_1\n下一行 $y$。', 'InlineMath'), ['$y$'], '未闭合行内公式不得跨行配对');
assert.deepEqual(nodes(String.raw`转义 \$x\$，代码 ` + '`$y$` 与 $z$。', 'InlineMath'), ['$z$']);
assert.deepEqual(nodes('```text\n$x$\n$$\ny\n$$\n```', 'InlineMath'), []);
assert.deepEqual(nodes('```text\n$$\ny\n$$\n```', 'MathBlock'), []);
assert.deepEqual(nodes('    $$\n    x\n    $$', 'MathBlock'), [], '缩进代码不得被识别为公式');
assert.deepEqual(nodes('$$x + 1$$', 'MathBlock'), ['$$x + 1$$']);
assert.deepEqual(nodes('文字 $$x + 1$$ 后文', 'InlineMath'), ['$$x + 1$$']);
assert.deepEqual(nodes('正文\n$$\nx\n$$\n后文', 'MathBlock'), ['$$\nx\n$$']);
assert.deepEqual(nodes('$$\nx\n\ny\n$$', 'MathBlock'), ['$$\nx\n\ny\n$$'], '完整块公式允许内部空行');
assert.deepEqual(nodes('$$\nx\n\n普通正文 $y$', 'MathBlock'), ['$$\nx'], '未闭合块公式在段落边界停止');
assert.deepEqual(nodes('$$\nx\n# 后续标题\n正文', 'ATXHeading1'), ['# 后续标题']);
assert.deepEqual(nodes('> $$\n> x\n> $$\n\n正文', 'MathBlock'), ['$$\n> x\n> $$']);

const tokens = [];
highlightTree(mathParser.parse(display), mathHighlightStyle, (from, to, style) => {
    tokens.push({ text: display.slice(from, to), style });
});
const colorOf = text => tokens.find(token => token.text === text)?.style;
assert.ok(colorOf('\\frac'), 'LaTeX 命令应着色');
assert.ok(colorOf('y'), '数学变量应着色');
assert.ok(colorOf('1'), '数字应着色');
assert.ok(colorOf('{'), '括号应着色');
assert.ok(colorOf('='), '运算符应着色');
assert.equal(colorOf('^'), colorOf('='), '上下标应按数学运算符着色');
assert.notEqual(colorOf('\\frac'), colorOf('1'), '命令与数字应使用不同颜色');
console.log('数学源码检查通过：行内与块公式、LaTeX 分色、标题冲突、金额、转义、代码隔离及未闭合边界。');
// !SECTION Markdown 数学源码解析检查
