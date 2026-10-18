import assert from 'node:assert';
import {
    normalizeImportedData,
    applyImport,
    createExportBundle
} from '../src/utils/importExport.ts';

function isIsoString(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function test(name, fn) {
    try {
        fn();
        console.log(`ok - ${name}`);
    } catch (err) {
        console.error(`not ok - ${name}`);
        console.error(err);
        process.exitCode = 1;
    }
}

test('imports legacy array and normalizes fields', () => {
    const legacy = [
        {
            id: 1766148199942,
            title: 123,
            content: 'Hello   world\n\nand   more',
            tags: ['Tag', 2],
            createdAt: 'not-a-date',
            lastUsed: '',
            useCount: '3'
        }
    ];
    const result = normalizeImportedData(legacy);
    assert.strictEqual(result.prompts.length, 1);

    const prompt = result.prompts[0];
    assert.strictEqual(prompt.id, '1766148199942');
    assert.strictEqual(prompt.title, '123');
    assert.strictEqual(prompt.content, 'Hello   world\n\nand   more');
    assert.strictEqual(prompt.preview, 'Hello world and more');
    assert.ok(isIsoString(prompt.createdAt));
    assert.strictEqual(prompt.lastUsed, null);
    assert.strictEqual(prompt.useCount, 0);
    assert.deepStrictEqual(prompt.tags, ['tag', '2']);
});

test('imports new v2 object and preserves settings', () => {
    const payload = {
        type: 'promptbox.export',
        version: 2,
        prompts: [
            {
                id: 'abc',
                title: 'Title',
                content: 'Content',
                createdAt: '2024-01-01T00:00:00.000Z',
                lastUsed: '2024-01-02T00:00:00.000Z',
                useCount: 2,
                tags: ['alpha']
            }
        ],
        settings: { foo: 'bar' }
    };

    const result = normalizeImportedData(payload);
    assert.strictEqual(result.prompts.length, 1);
    assert.deepStrictEqual(result.settings, { foo: 'bar' });
    assert.strictEqual(result.prompts[0].id, 'abc');
});

test('merge/overwrite/replace behaviors', () => {
    const existing = [
        {
            id: '1',
            title: 'One',
            content: 'One',
            preview: 'One',
            tags: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            lastUsed: null,
            useCount: 0
        },
        {
            id: '2',
            title: 'Two',
            content: 'Two',
            preview: 'Two',
            tags: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            lastUsed: null,
            useCount: 0
        }
    ];
    const incoming = [
        {
            id: '2',
            title: 'Two Updated',
            content: 'Two Updated',
            preview: 'Two Updated',
            tags: [],
            createdAt: '2024-01-02T00:00:00.000Z',
            lastUsed: null,
            useCount: 1
        },
        {
            id: '3',
            title: 'Three',
            content: 'Three',
            preview: 'Three',
            tags: [],
            createdAt: '2024-01-03T00:00:00.000Z',
            lastUsed: null,
            useCount: 0
        }
    ];

    const merged = applyImport(existing, incoming, 'merge');
    assert.strictEqual(merged.length, 3);
    assert.strictEqual(merged.find(p => p.id === '2').title, 'Two');

    const overwritten = applyImport(existing, incoming, 'overwrite');
    assert.strictEqual(overwritten.length, 3);
    assert.strictEqual(overwritten.find(p => p.id === '2').title, 'Two Updated');

    const replaced = applyImport(existing, incoming, 'replace');
    assert.strictEqual(replaced.length, 2);
    assert.strictEqual(replaced.find(p => p.id === '1'), undefined);
});

test('numeric ids become strings and missing ids generate strings', () => {
    const result = normalizeImportedData([
        { id: 9, title: 'T', content: 'C' },
        { title: 'No ID', content: 'C' }
    ]);
    assert.strictEqual(result.prompts[0].id, '9');
    assert.strictEqual(typeof result.prompts[1].id, 'string');
    assert.ok(result.prompts[1].id.length > 0);
});

test('exports as v2 bundle', () => {
    const bundle = createExportBundle([
        { id: '1', title: 'T', content: 'C', preview: 'C', tags: [], createdAt: '2024-01-01T00:00:00.000Z', lastUsed: null, useCount: 0 }
    ]);
    assert.strictEqual(bundle.type, 'promptbox.export');
    assert.strictEqual(bundle.version, 2);
    assert.strictEqual(bundle.prompts.length, 1);
    assert.strictEqual(bundle.prompts[0].id, '1');
});
