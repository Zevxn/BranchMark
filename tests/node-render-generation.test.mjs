import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// SECTION 节点生成测试环境
const source = await readFile('app/JS/MindMap-Render.js', 'utf8');
const sliceFunctions = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const renderedContents = [];
const context = vm.createContext({
    state: { data: null, selectedIds: new Set(), compactView: false, rainbowMode: false },
    revealedIds: new Set(),
    isMapNodeTemporarilyExpanded: id => context.revealedIds.has(id),
    getMindMapRelatedCardItems: () => [{ targetId: 'related' }],
    renderMarkdown: content => {
        renderedContents.push(content);
        return `<p>${content}</p>`;
    },
});
vm.runInContext([
    sliceFunctions('function isTemporarilyCollapsed(', 'function toggleMindMapEntitySimpleMode('),
    sliceFunctions('function createNodeHTML(', 'function renderTree('),
    sliceFunctions('function escapeHtml(', '// --- 核心修复：强制钉死根节点位置 ---'),
    sliceFunctions('function darkenHSL(', 'function updateTreeStyle('),
].join('\n'), context);

function generate(node, includeChildren) {
    context.node = node;
    return vm.runInContext(`createNodeHTML(node, isLeft, inheritedColor, ${includeChildren})`, context);
}

function withoutChildren(html) {
    const childrenStart = html.indexOf('\n        <div class="children-container ');
    return childrenStart < 0 ? html : `${html.slice(0, childrenStart)}\n        \n    </div>`;
}
// !SECTION 节点生成测试环境

// SECTION 卡片等价与后代生成开销
const parent = {
    id: 'parent', topic: '标题 <内容>', content: '父卡片正文', color: '#abc123',
    widthMode: 'manual', width: 250, heightMode: 'manual', bodyHeight: 160,
    children: [{
        id: 'child', topic: '子节点', content: '子卡片正文',
        children: [{ id: 'grandchild', topic: '孙节点', content: '孙卡片正文' }],
    }],
};
for (const isRoot of [false, true]) {
    for (const isLeft of [false, true]) {
        for (const rainbowMode of [false, true]) {
            for (const mode of ['standard', 'simple', 'content-collapsed', 'compact', 'folded', 'search-revealed', 'empty-topic']) {
                const node = structuredClone(parent);
                node.isSimple = mode === 'simple';
                node.contentCollapsed = mode === 'content-collapsed';
                node.folded = mode === 'folded' || mode === 'search-revealed';
                if (mode === 'empty-topic') node.topic = '';
                context.state.data = isRoot ? node : { id: 'root', children: [node] };
                context.state.selectedIds = new Set([node.id]);
                context.state.compactView = mode === 'compact';
                context.state.rainbowMode = rainbowMode;
                context.revealedIds = new Set(mode === 'search-revealed' ? [node.id] : []);
                context.isLeft = isLeft;
                context.inheritedColor = rainbowMode ? 'hsl(100, 85%, 88%)' : null;
                const full = generate(node, true);
                renderedContents.length = 0;
                const cardOnly = generate(node, false);
                const label = `${isRoot ? '根' : '普通'}节点 / ${isLeft ? '左' : '右'}侧 / ${rainbowMode ? '彩虹' : '普通颜色'} / ${mode}`;
                assert.equal(cardOnly, withoutChildren(full), `${label}：单卡输出应完整保留原卡片结构、颜色、工具和折叠按钮`);
                assert.equal((cardOnly.match(/data-node-id=/g) || []).length, 1, `${label}：只生成当前卡片`);
                assert.ok(renderedContents.every(content => content === node.content), `${label}：不得解析后代正文`);
                if (!isRoot) {
                    assert.match(cardOnly, /data-action="fold"/, `${label}：保留真实子树的折叠按钮`);
                    assert.match(cardOnly, node.folded && mode !== 'search-revealed' ? /ri-add-line/ : /ri-subtract-line/, `${label}：折叠按钮与真实展开状态一致`);
                }
            }
        }
    }
}

context.state.compactView = false;
context.state.rainbowMode = false;
context.state.data = { id: 'root' };
context.isLeft = false;
context.inheritedColor = null;
const largeParent = { ...parent, children: Array.from({ length: 400 }, (_, i) => ({ id: `child-${i}`, topic: `子节点${i}`, content: `正文${i}` })) };
renderedContents.length = 0;
generate(largeParent, true);
assert.equal(renderedContents.length, 401, '完整子树生成仍解析父卡片及全部后代');
renderedContents.length = 0;
generate(largeParent, false);
assert.deepEqual(renderedContents, [parent.content], '单卡生成的正文解析次数应与后代数量无关');
// !SECTION 卡片等价与后代生成开销

console.log('节点生成校验通过：56 种渲染组合输出等价，单卡生成不解析后代正文。');
