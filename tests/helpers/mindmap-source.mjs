import { readFile } from 'node:fs/promises';

const MINDMAP_SOURCE_FILES = [
    'app/JS/MindMap.js',
    'app/JS/MindMap-UI.js',
    'app/JS/MindMap-Relations.js',
    'app/JS/MindMap-SummariesSearch.js',
    'app/JS/MindMap-Render.js',
    'app/JS/MindMap-IO.js',
    'app/JS/MindMap-Document.js',
];

export async function readMindMapSource() {
    const sources = await Promise.all(
        MINDMAP_SOURCE_FILES.map(file => readFile(file, 'utf8')),
    );
    return sources.join('\n');
}
