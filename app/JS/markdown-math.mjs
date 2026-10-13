import { parseMixed } from '@lezer/common';
import { Tag, tags } from '@lezer/highlight';
import { HighlightStyle, StreamLanguage } from '@codemirror/language';
import { stexMath } from '@codemirror/legacy-modes/mode/stex';

// SECTION LaTeX 数学源码着色
const mathTags = {
    mathCommand: Tag.define(), mathVariable: Tag.define(), mathNumber: Tag.define(),
    mathBracket: Tag.define(), mathOperator: Tag.define(),
};
const mathLanguage = StreamLanguage.define({
    ...stexMath,
    tokenTable: mathTags,
    // 数学区域中的空行不会切换到普通 LaTeX 文档模式。
    blankLine() {},
    token(stream, state) {
        const token = stexMath.token(stream, state);
        if (token === 'tag') return /^[\^_&]$/.test(stream.current()) ? 'mathOperator' : 'mathCommand';
        if (token === 'variableName.special') return 'mathVariable';
        if (token === 'number') return 'mathNumber';
        if (token === 'bracket') return 'mathBracket';
        if (token === null && /^[+\-<>|=,\/@!*:;'"`~#?]+$/.test(stream.current())) return 'mathOperator';
        // 轻量着色器无法判断所有宏和中文文本的合法性，不把这些内容误标为语法错误。
        return token === 'error' ? null : token;
    },
});

export const mathHighlightStyle = HighlightStyle.define([
    { tag: mathTags.mathCommand, color: 'var(--md-heading)' },
    { tag: mathTags.mathVariable, color: 'var(--md-property)' },
    { tag: mathTags.mathNumber, color: 'var(--md-number)' },
    { tag: mathTags.mathBracket, color: 'var(--md-function)' },
    { tag: mathTags.mathOperator, color: 'var(--md-keyword)' },
]);
// !SECTION LaTeX 数学源码着色

// SECTION Markdown 数学区域识别
function isEscaped(text, position) {
    let backslashes = 0;
    while (position > 0 && text[--position] === '\\') backslashes++;
    return backslashes % 2 === 1;
}

function findMathEnd(text, from, width) {
    for (let position = from; position < text.length; position++) {
        if (text[position] === '\n' || text[position] === '\r') return -1;
        if (text[position] === '%' && !isEscaped(text, position)) return -1;
        if (text[position] !== '$' || isEscaped(text, position)) continue;
        let end = position + 1;
        while (text[end] === '$') end++;
        if (end - position !== width) return -1;
        // 单美元遵循非空白边界，且结束符后不能紧跟金额数字。
        if (width === 1 && (/\s/.test(text[position - 1]) || /\d/.test(text[end] || ''))) return -1;
        return position;
    }
    return -1;
}

let activeMathInput = null;
const mixedMath = parseMixed(node => node.name === 'MathContent' ? { parser: mathLanguage.parser } : null);

function hasClosingMathBlock(from) {
    // 仅在块内遇到空行时向前查看：完整公式允许空行，未闭合公式在段落边界停止。
    const cached = activeMathInput;
    cached.source ??= cached.input.read(0, cached.input.length);
    const source = cached.source;
    const closing = /\$\$(?!\$)[ \t]*(?:\r?\n|$)/g;
    closing.lastIndex = from;
    let match;
    while ((match = closing.exec(source))) {
        const lineStart = source.lastIndexOf('\n', match.index - 1) + 1;
        const line = source.slice(lineStart, match.index + 2);
        if (findMathEnd(line, 0, 2) !== match.index - lineStart) continue;
        // 不跨过新的标题或代码围栏去寻找结束符。
        return !/(?:^|\n)[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]|`{3,}|~{3,})/.test(source.slice(from, match.index));
    }
    return false;
}

export const markdownMath = {
    defineNodes: [
        { name: 'MathBlock', block: true }, 'InlineMath', 'MathContent',
        { name: 'MathMark', style: tags.processingInstruction },
    ],
    parseBlock: [{
        name: 'MathBlock',
        before: 'FencedCode',
        endLeaf: (context, line) => line.indent - line.baseIndent < 4 && /^\$\$(?!\$)/.test(line.text.slice(line.pos)),
        parse(context, line) {
            const text = line.text.slice(line.pos);
            if (line.indent - line.baseIndent >= 4 || !/^\$\$(?!\$)/.test(text)) return false;
            const sameLineEnd = findMathEnd(text, 2, 2);
            if (sameLineEnd >= 0 && text.slice(sameLineEnd + 2).trim()) return false;

            const from = context.lineStart + line.pos;
            const contentFrom = from + 2;
            const baseIndent = line.baseIndent;
            let contentTo = context.lineStart + line.text.length;
            let closingFrom = sameLineEnd >= 0 ? from + sameLineEnd : -1;
            let end = closingFrom >= 0 ? closingFrom + 2 : contentTo;
            let closedAhead;
            if (closingFrom < 0) {
                while (context.nextLine()) {
                    if (line.baseIndent < baseIndent) break;
                    const body = line.text.slice(line.pos);
                    const close = findMathEnd(body, 0, 2);
                    if (close >= 0 && !body.slice(close + 2).trim()) {
                        closingFrom = context.lineStart + line.pos + close;
                        contentTo = closingFrom;
                        end = closingFrom + 2;
                        break;
                    }
                    if (!body.trim()) {
                        closedAhead ??= hasClosingMathBlock(context.lineStart);
                        if (!closedAhead) break;
                    }
                    if (/^(?:#{1,6}[ \t]|`{3,}|~{3,})/.test(body)) break;
                    contentTo = end = context.lineStart + line.text.length;
                }
            } else {
                contentTo = closingFrom;
            }
            const children = [context.elt('MathMark', from, from + 2)];
            if (contentTo > contentFrom) children.push(context.elt('MathContent', contentFrom, contentTo));
            if (closingFrom >= 0) {
                children.push(context.elt('MathMark', closingFrom, closingFrom + 2));
                context.nextLine();
            }
            context.addElement(context.elt('MathBlock', from, end, children));
            return true;
        },
    }],
    parseInline: [{
        name: 'InlineMath',
        before: 'Emphasis',
        parse(context, next, position) {
            if (next !== 36 || context.char(position - 1) === 36) return -1;
            const width = context.char(position + 1) === 36 ? 2 : 1;
            if (context.char(position + width) === 36) return -1;
            const rest = context.slice(position, context.end);
            if (width === 1 && (!rest[1] || /\s/.test(rest[1]))) return -1;
            const close = findMathEnd(rest, width, width);
            if (close <= width || !rest.slice(width, close).trim()) return -1;
            return context.addElement(context.elt('InlineMath', position, position + close + width, [
                context.elt('MathMark', position, position + width),
                context.elt('MathContent', position + width, position + close),
                context.elt('MathMark', position + close, position + close + width),
            ]));
        },
    }],
    wrap(parse, input, fragments, ranges) {
        const mixed = mixedMath(parse, input, fragments, ranges);
        const cached = { input, source: null };
        return {
            advance() {
                // advance 同步执行；临时绑定输入，兼容代码块等其他解析包装器及交错解析。
                const previous = activeMathInput;
                activeMathInput = cached;
                try { return mixed.advance(); }
                finally { activeMathInput = previous; }
            },
            get parsedPos() { return mixed.parsedPos; },
            get stoppedAt() { return mixed.stoppedAt; },
            stopAt(position) { mixed.stopAt(position); },
        };
    },
};
// !SECTION Markdown 数学区域识别
