import type { Prompt, PromptTombstone } from '../types.ts';
import { SAMPLE_PROMPTS } from './sampleData.ts';
import { getRandomUUID, createPreviewFromContent } from './importExport.ts';

/**
 * Creates a duplicate copy of a prompt with '- Copy' appended to the title,
 * a newly generated unique ID, reset usage metrics, and current timestamps.
 */
export function duplicatePrompt(prompt: Prompt, now: string = new Date().toISOString()): Prompt {
  return {
    ...prompt,
    id: getRandomUUID(),
    title: `${prompt.title} - Copy`,
    preview: prompt.preview || createPreviewFromContent(prompt.content),
    tags: [...prompt.tags],
    createdAt: now,
    updatedAt: now,
    lastUsed: null,
    useCount: 0
  };
}

const SAMPLE_IDS = new Set(SAMPLE_PROMPTS.map(p => p.id));

export function isDefaultSamplePrompt(prompt: Prompt): boolean {
  if (!SAMPLE_IDS.has(prompt.id)) return false;
  const original = SAMPLE_PROMPTS.find(p => p.id === prompt.id);
  if (!original) return false;
  return prompt.title === original.title && prompt.content === original.content;
}

export function filterOutDefaultSamplePrompts(prompts: Prompt[]): Prompt[] {
  return prompts.filter(p => !isDefaultSamplePrompt(p));
}

/**
 * Resolves conflict between local and cloud version of the same prompt.
 * Uses updatedAt (falling back to createdAt for legacy records).
 */
export function resolvePromptConflict(local: Prompt, cloud: Prompt): Prompt {
  const localTime = new Date(local.updatedAt || local.createdAt).getTime();
  const cloudTime = new Date(cloud.updatedAt || cloud.createdAt).getTime();

  if (cloudTime > localTime) {
    return cloud;
  }
  return local;
}

/**
 * Generates a deterministic conflict copy ID based on the prompt ID and the remote timestamp.
 * This guarantees repeated snapshots will NOT generate duplicate conflict copies.
 */
export function generateConflictCopyId(promptId: string, remoteUpdatedAt: string): string {
  const safeTime = remoteUpdatedAt.replace(/[:.]/g, '-');
  return `${promptId}_conflict_${safeTime}`;
}

/**
 * Reconciles live snapshots with local library.
 * Handles deletion tombstones, updatedAt comparisons, and idempotent conflict copies.
 */
export function reconcileRemotePromptsWithLocal(
  localPrompts: Prompt[],
  remotePrompts: Prompt[],
  tombstones: Map<string, PromptTombstone>
): { nextPrompts: Prompt[]; localPromptsToPush: Prompt[] } {
  const remoteMap = new Map<string, Prompt>();
  remotePrompts.forEach(p => remoteMap.set(p.id, p));

  const localMap = new Map<string, Prompt>();
  localPrompts.forEach(p => localMap.set(p.id, p));

  const nextPrompts: Prompt[] = [];
  const localPromptsToPush: Prompt[] = [];
  const existingIds = new Set<string>();

  // Process remote prompts first
  remotePrompts.forEach(remote => {
    // Check if remote is tombstoned
    const tombstone = tombstones.get(remote.id);
    if (tombstone) {
      const tombTime = new Date(tombstone.deletedAt).getTime();
      const remoteTime = new Date(remote.updatedAt || remote.createdAt).getTime();
      if (tombTime >= remoteTime) {
        return; // Discard tombstoned prompt
      }
    }

    const local = localMap.get(remote.id);
    if (!local) {
      nextPrompts.push(remote);
      existingIds.add(remote.id);
      return;
    }

    // Both exist: compare timestamps and contents
    const localTime = new Date(local.updatedAt || local.createdAt).getTime();
    const remoteTime = new Date(remote.updatedAt || remote.createdAt).getTime();

    const contentsMatch =
      local.title === remote.title &&
      local.content === remote.content &&
      JSON.stringify(local.tags) === JSON.stringify(remote.tags);

    if (contentsMatch || remoteTime > localTime) {
      // Remote is newer or identical: use remote
      nextPrompts.push(remote);
      existingIds.add(remote.id);

      // If local had unmerged divergent edits and remote is strictly newer, create deterministic conflict copy
      if (!contentsMatch && remoteTime > localTime) {
        const conflictId = generateConflictCopyId(local.id, remote.updatedAt);
        if (!localMap.has(conflictId) && !existingIds.has(conflictId)) {
          const conflictCopy: Prompt = {
            ...local,
            id: conflictId,
            title: `${local.title} (Conflict Copy)`,
            updatedAt: new Date().toISOString()
          };
          nextPrompts.push(conflictCopy);
          existingIds.add(conflictId);
          localPromptsToPush.push(conflictCopy);
        }
      }
    } else if (localTime > remoteTime) {
      // Local is newer: preserve local and mark to push to cloud
      nextPrompts.push(local);
      existingIds.add(local.id);
      localPromptsToPush.push(local);
    } else {
      // Timestamps identical but contents differ: remote takes primary ID, local becomes conflict copy
      nextPrompts.push(remote);
      existingIds.add(remote.id);

      const conflictId = generateConflictCopyId(local.id, remote.updatedAt);
      if (!localMap.has(conflictId) && !existingIds.has(conflictId)) {
        const conflictCopy: Prompt = {
          ...local,
          id: conflictId,
          title: `${local.title} (Conflict Copy)`,
          updatedAt: new Date().toISOString()
        };
        nextPrompts.push(conflictCopy);
        existingIds.add(conflictId);
        localPromptsToPush.push(conflictCopy);
      }
    }
  });

  // Check remaining local prompts not in remote
  localPrompts.forEach(local => {
    if (existingIds.has(local.id)) return;

    // Check tombstone
    const tombstone = tombstones.get(local.id);
    if (tombstone) {
      const tombTime = new Date(tombstone.deletedAt).getTime();
      const localTime = new Date(local.updatedAt || local.createdAt).getTime();
      if (tombTime >= localTime) {
        return; // Discard deleted prompt from local device
      }
    }

    // Keep local prompt and schedule push to cloud
    nextPrompts.push(local);
    existingIds.add(local.id);
    if (!isDefaultSamplePrompt(local)) {
      localPromptsToPush.push(local);
    }
  });

  return { nextPrompts, localPromptsToPush };
}
