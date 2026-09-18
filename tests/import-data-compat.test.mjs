import { readMindMapSource } from './helpers/mindmap-source.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const mindMap = await readMindMapSource();
const normalizerStart = mindMap.indexOf('function isMindMapNodeData(');
const normalizerEnd = mindMap.indexOf('function applyImportedMindMap(', normalizerStart);
const normalizerSource = mindMap.slice(normalizerStart, normalizerEnd).trim();

assert.ok(normalizerSource, '应能定位导入数据规范化函数');

const context = vm.createContext({});
vm.runInContext(`${normalizerSource}\nglobalThis.normalizeImportedMindMap = normalizeImportedMindMap;`, context);
const normalizeImportedMindMap = context.normalizeImportedMindMap;

const pureData = {
    id: 'chen_yingrong',
    topic: '陈映荣',
    content: '李氏-子二-迁居：安寨',
    children: [{
        id: 'chen_zhixun',
        topic: '陈志训',
        content: '次子-无传',
        children: []
    }]
};

const pureResult = normalizeImportedMindMap(pureData);
assert.equal(pureResult.data, pureData, '纯 data 文件应直接作为根节点导入');
assert.equal(pureResult.data.children[0].topic, '陈志训', '纯 data 文件的层级和主题不能丢失');
assert.equal(Array.isArray(pureResult.data.relations), true, '纯 data 文件应补齐关联线数据');
assert.equal(pureResult.data.relations.length, 0, '纯 data 文件初始不应包含关联线');
assert.equal(Array.isArray(pureResult.data.summaries), true, '纯 data 文件应补齐总结数据');
assert.equal(pureResult.data.summaries.length, 0, '纯 data 文件初始不应包含总结');
assert.equal(pureResult.data.foldedLeft, false, '纯 data 文件应补齐左侧折叠状态');
assert.equal(pureResult.data.foldedRight, false, '纯 data 文件应补齐右侧折叠状态');
assert.equal(pureResult.view, null, '纯 data 文件不应伪造视图数据');

const savedSnapshot = {
    data: { id: 'root', topic: '完整存档', content: '', children: [] },
    view: { tx: 120, ty: 80, scale: 1.2 },
    scrollMap: { root: 30 }
};
const snapshotResult = normalizeImportedMindMap(savedSnapshot);
assert.equal(snapshotResult.data, savedSnapshot.data, '完整存档不应被重复包裹');
assert.deepEqual(snapshotResult.view, savedSnapshot.view, '完整存档的视图数据应继续保留');
assert.deepEqual(snapshotResult.scrollMap, savedSnapshot.scrollMap, '完整存档的滚动位置应继续保留');

assert.throws(() => normalizeImportedMindMap({ version: 'v1' }), /节点格式不正确/);
assert.throws(() => normalizeImportedMindMap([]), /文件格式不正确/);

console.log('import data compatibility tests passed');
