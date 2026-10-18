import assert from 'node:assert';
import {
    normalizeImportedData,
    applyImport,
    createExportBundle
} from '../src/utils/importExport.ts';
import {
    generateConflictCopyId,
    resolvePromptConflict,
    reconcileRemotePromptsWithLocal,
    duplicatePrompt
} from '../src/utils/syncUtils.ts';

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

test('imports legacy array and normalizes fields including updatedAt', () => {
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
    assert.ok(isIsoString(prompt.updatedAt));
    assert.strictEqual(prompt.updatedAt, prompt.createdAt); // Fallback to createdAt
    assert.strictEqual(prompt.lastUsed, null);
    assert.strictEqual(prompt.useCount, 0);
    assert.deepStrictEqual(prompt.tags, ['tag', '2']);
});

test('imports new v2 object and preserves distinct updatedAt and settings', () => {
    const payload = {
        type: 'promptbox.export',
        version: 2,
        prompts: [
            {
                id: 'abc',
                title: 'Title',
                content: 'Content',
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-02-15T12:00:00.000Z',
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
    assert.strictEqual(result.prompts[0].createdAt, '2024-01-01T00:00:00.000Z');
    assert.strictEqual(result.prompts[0].updatedAt, '2024-02-15T12:00:00.000Z');
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
            updatedAt: '2024-01-01T00:00:00.000Z',
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
            updatedAt: '2024-01-01T00:00:00.000Z',
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
            updatedAt: '2024-01-02T00:00:00.000Z',
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
            updatedAt: '2024-01-03T00:00:00.000Z',
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

test('exports as v2 bundle with updatedAt', () => {
    const bundle = createExportBundle([
        {
            id: '1',
            title: 'T',
            content: 'C',
            preview: 'C',
            tags: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
            lastUsed: null,
            useCount: 0
        }
    ]);
    assert.strictEqual(bundle.type, 'promptbox.export');
    assert.strictEqual(bundle.version, 2);
    assert.strictEqual(bundle.prompts.length, 1);
    assert.strictEqual(bundle.prompts[0].id, '1');
    assert.strictEqual(bundle.prompts[0].updatedAt, '2024-01-02T00:00:00.000Z');
});

test('resolvePromptConflict compares updatedAt timestamps accurately', () => {
    const olderPrompt = {
        id: '1',
        title: 'Older',
        content: 'Older text',
        preview: 'Older text',
        tags: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-05T00:00:00.000Z',
        lastUsed: '2024-01-10T00:00:00.000Z', // lastUsed is ignored for edit conflict!
        useCount: 10
    };
    const newerPrompt = {
        id: '1',
        title: 'Newer',
        content: 'Newer text',
        preview: 'Newer text',
        tags: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-08T00:00:00.000Z',
        lastUsed: null,
        useCount: 1
    };

    const winner = resolvePromptConflict(olderPrompt, newerPrompt);
    assert.strictEqual(winner.title, 'Newer');
});

test('deterministic conflict copy ID generation', () => {
    const id = generateConflictCopyId('prompt-123', '2024-03-01T15:30:00.000Z');
    assert.strictEqual(id, 'prompt-123_conflict_2024-03-01T15-30-00-000Z');
    // Idempotency: same inputs generate exact same ID
    const id2 = generateConflictCopyId('prompt-123', '2024-03-01T15:30:00.000Z');
    assert.strictEqual(id, id2);
});

test('reconcileRemotePromptsWithLocal creates idempotent conflict copy without duplicates on repeated snapshots', () => {
    const local = [
        {
            id: 'prompt-1',
            title: 'Local Title',
            content: 'Local Content',
            preview: 'Local Content',
            tags: ['tag1'],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
            lastUsed: null,
            useCount: 0
        }
    ];

    const remote = [
        {
            id: 'prompt-1',
            title: 'Remote Title',
            content: 'Remote Content',
            preview: 'Remote Content',
            tags: ['tag1'],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-03T00:00:00.000Z', // Remote is newer
            lastUsed: null,
            useCount: 0
        }
    ];

    const tombstones = new Map();

    // Pass 1: Should produce 2 prompts: remote prompt + deterministic conflict copy of divergent local edit
    const pass1 = reconcileRemotePromptsWithLocal(local, remote, tombstones);
    assert.strictEqual(pass1.nextPrompts.length, 2);
    const primary = pass1.nextPrompts.find(p => p.id === 'prompt-1');
    const conflict = pass1.nextPrompts.find(p => p.id.includes('_conflict_'));
    assert.strictEqual(primary.title, 'Remote Title');
    assert.strictEqual(conflict.title, 'Local Title (Conflict Copy)');

    // Pass 2: Next snapshot arrives with the conflict copy already in local state:
    // MUST NOT create duplicate conflict copies!
    const pass2 = reconcileRemotePromptsWithLocal(pass1.nextPrompts, remote, tombstones);
    assert.strictEqual(pass2.nextPrompts.length, 2);
    const conflictCopies = pass2.nextPrompts.filter(p => p.id.includes('_conflict_'));
    assert.strictEqual(conflictCopies.length, 1);
});

test('tombstone precedence purges stale local copy during sync', () => {
    const local = [
        {
            id: 'deleted-on-other-device',
            title: 'Stale Prompt',
            content: 'Should be deleted',
            preview: 'Should be deleted',
            tags: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
            lastUsed: null,
            useCount: 0
        }
    ];

    const remote = []; // Already deleted in cloud prompts collection
    const tombstones = new Map();
    tombstones.set('deleted-on-other-device', {
        id: 'deleted-on-other-device',
        deletedAt: '2024-01-03T00:00:00.000Z', // Deleted after local updatedAt
        userId: 'test-user'
    });

    const reconciled = reconcileRemotePromptsWithLocal(local, remote, tombstones);
    // The stale local prompt must be purged, not uploaded or restored!
    assert.strictEqual(reconciled.nextPrompts.length, 0);
    assert.strictEqual(reconciled.localPromptsToPush.length, 0);
});

test('intentional recreation after tombstone survives when local updatedAt > deletedAt', () => {
    const local = [
        {
            id: 'recreated-prompt',
            title: 'Recreated Prompt',
            content: 'User intentionally created this again',
            preview: 'User intentionally created this again',
            tags: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-05T00:00:00.000Z', // Created AFTER tombstone
            lastUsed: null,
            useCount: 0
        }
    ];

    const remote = [];
    const tombstones = new Map();
    tombstones.set('recreated-prompt', {
        id: 'recreated-prompt',
        deletedAt: '2024-01-03T00:00:00.000Z', // Deleted before current updatedAt
        userId: 'test-user'
    });

    const reconciled = reconcileRemotePromptsWithLocal(local, remote, tombstones);
    assert.strictEqual(reconciled.nextPrompts.length, 1);
    assert.strictEqual(reconciled.nextPrompts[0].title, 'Recreated Prompt');
    assert.strictEqual(reconciled.localPromptsToPush.length, 1);
});

test('duplicatePrompt creates a copy with "- Copy" appended, new unique ID, reset metrics, and current timestamps', () => {
    const original = {
        id: 'original-prompt-123',
        title: 'Product Launch Brief',
        content: 'Draft a product launch brief including target audience and milestones.',
        preview: 'Draft a product launch brief including target audience and milestones.',
        tags: ['marketing', 'launch'],
        createdAt: '2023-01-01T12:00:00.000Z',
        updatedAt: '2023-01-10T15:30:00.000Z',
        lastUsed: '2023-02-01T09:00:00.000Z',
        useCount: 42
    };

    const copy1 = duplicatePrompt(original);
    assert.strictEqual(copy1.title, 'Product Launch Brief - Copy');
    assert.notStrictEqual(copy1.id, original.id);
    assert.ok(copy1.id && typeof copy1.id === 'string' && copy1.id.length > 0);
    assert.strictEqual(copy1.content, original.content);
    assert.deepStrictEqual(copy1.tags, original.tags);
    assert.strictEqual(copy1.useCount, 0);
    assert.strictEqual(copy1.lastUsed, null);
    assert.ok(isIsoString(copy1.createdAt));
    assert.ok(isIsoString(copy1.updatedAt));
    assert.strictEqual(copy1.createdAt, copy1.updatedAt);

    // Ensure successive duplicates receive unique IDs
    const copy2 = duplicatePrompt(original);
    assert.notStrictEqual(copy1.id, copy2.id);
    assert.strictEqual(copy2.title, 'Product Launch Brief - Copy');
});
