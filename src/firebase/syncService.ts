import {
  collection,
  doc,
  getDocsFromServer,
  onSnapshot,
  Unsubscribe,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from './config';
import { Prompt, PromptTombstone, BackupResult, FirstTimeSyncChoice } from '../types';
import { SAMPLE_PROMPTS } from '../utils/sampleData';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import {
  isDefaultSamplePrompt,
  filterOutDefaultSamplePrompts,
  resolvePromptConflict,
  generateConflictCopyId,
  reconcileRemotePromptsWithLocal,
  duplicatePrompt
} from '../utils/syncUtils';

export {
  isDefaultSamplePrompt,
  filterOutDefaultSamplePrompts,
  resolvePromptConflict,
  generateConflictCopyId,
  reconcileRemotePromptsWithLocal,
  duplicatePrompt
};

/**
 * Mandatory backup before any destructive or bulk synchronization operation.
 * Returns success or failure status.
 */
export function backupLocalPrompts(prompts: Prompt[]): BackupResult {
  const timestamp = new Date().toISOString();
  const backupKey = `promptForgePrompts_backup_${timestamp.replace(/[:.]/g, '-')}`;
  try {
    const serialized = JSON.stringify(prompts);
    localStorage.setItem(backupKey, serialized);
    const verified = localStorage.getItem(backupKey);
    if (!verified || verified !== serialized) {
      throw new Error('Local backup storage verification failed.');
    }
    localStorage.setItem('promptForgePrompts_latest_backup_key', backupKey);
    return { success: true, key: backupKey };
  } catch (e) {
    console.error('Failed to create mandatory local backup', e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Local storage quota exceeded or storage unavailable.'
    };
  }
}

/**
 * Fetches all deletion tombstones for the user from Firestore.
 */
export async function fetchTombstones(userId: string): Promise<Map<string, PromptTombstone>> {
  const path = `users/${userId}/tombstones`;
  try {
    const colRef = collection(db, 'users', userId, 'tombstones');
    const snapshot = await getDocsFromServer(colRef);
    const tombstones = new Map<string, PromptTombstone>();
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      tombstones.set(docSnap.id, {
        id: data.id || docSnap.id,
        deletedAt: data.deletedAt || new Date().toISOString(),
        userId: data.userId || userId
      });
    });
    return tombstones;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Fetches all user prompts from server (strictly server-first to guarantee truth).
 */
export async function fetchCloudPrompts(userId: string): Promise<Prompt[]> {
  const path = `users/${userId}/prompts`;
  try {
    const colRef = collection(db, 'users', userId, 'prompts');
    const snapshot = await getDocsFromServer(colRef);
    const cloudPrompts: Prompt[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const createdAt = data.createdAt || new Date().toISOString();
      const updatedAt = data.updatedAt || createdAt;
      cloudPrompts.push({
        id: data.id || docSnap.id,
        title: data.title || '',
        preview: data.preview || '',
        content: data.content || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        createdAt,
        updatedAt,
        lastUsed: data.lastUsed || null,
        useCount: typeof data.useCount === 'number' ? data.useCount : 0
      });
    });
    return cloudPrompts;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Subscribes to live updates on user's cloud prompts.
 */
export function subscribeToUserPrompts(
  userId: string,
  onUpdate: (prompts: Prompt[], isFromCache: boolean) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}/prompts`;
  const colRef = collection(db, 'users', userId, 'prompts');

  return onSnapshot(
    colRef,
    { includeMetadataChanges: true },
    snapshot => {
      const isFromCache = snapshot.metadata.fromCache;
      const updatedPrompts: Prompt[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const createdAt = data.createdAt || new Date().toISOString();
        const updatedAt = data.updatedAt || createdAt;
        updatedPrompts.push({
          id: data.id || docSnap.id,
          title: data.title || '',
          preview: data.preview || '',
          content: data.content || '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          createdAt,
          updatedAt,
          lastUsed: data.lastUsed || null,
          useCount: typeof data.useCount === 'number' ? data.useCount : 0
        });
      });
      onUpdate(updatedPrompts, isFromCache);
    },
    error => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/**
 * Saves or updates a prompt in Firestore.
 * Atomically purges any existing tombstone for this prompt ID so intentional recreations succeed.
 */
export async function savePromptToCloud(userId: string, prompt: Prompt): Promise<void> {
  const path = `users/${userId}/prompts/${prompt.id}`;
  try {
    const batch = writeBatch(db);
    const docRef = doc(db, 'users', userId, 'prompts', prompt.id);
    const tombstoneRef = doc(db, 'users', userId, 'tombstones', prompt.id);

    const createdAt = prompt.createdAt || new Date().toISOString();
    const updatedAt = prompt.updatedAt || createdAt;

    const payload = {
      id: prompt.id,
      title: prompt.title,
      preview: prompt.preview || '',
      content: prompt.content,
      tags: prompt.tags || [],
      createdAt,
      updatedAt,
      lastUsed: prompt.lastUsed || null,
      useCount: prompt.useCount || 0,
      userId
    };

    batch.set(docRef, payload);
    batch.delete(tombstoneRef);
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a prompt from Firestore and atomically writes a persistent tombstone.
 * Tombstones are never pruned automatically to prevent stale offline devices from resurrecting deleted prompts.
 */
export async function deletePromptFromCloud(userId: string, promptId: string): Promise<void> {
  const path = `users/${userId}/prompts/${promptId}`;
  try {
    const batch = writeBatch(db);
    const docRef = doc(db, 'users', userId, 'prompts', promptId);
    const tombstoneRef = doc(db, 'users', userId, 'tombstones', promptId);

    batch.delete(docRef);
    batch.set(tombstoneRef, {
      id: promptId,
      deletedAt: new Date().toISOString(),
      userId
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}


/**
 * Executes first-time sync between local library and cloud library.
 * Mandatory backup is enforced; failure aborts immediately to protect data.
 */
export async function executeFirstTimeSync(
  userId: string,
  localPrompts: Prompt[],
  cloudPrompts: Prompt[],
  choice: FirstTimeSyncChoice
): Promise<Prompt[]> {
  // 1. Mandatory local backup
  const backup = backupLocalPrompts(localPrompts);
  if (!backup.success) {
    throw new Error(`Mandatory local backup failed: ${backup.error}. Synchronization aborted to protect your data.`);
  }

  // 2. Fetch tombstones
  const tombstones = await fetchTombstones(userId);

  // 3. Purge local prompts that have been deleted in cloud tombstones
  const activeLocalPrompts = localPrompts.filter(localP => {
    const tomb = tombstones.get(localP.id);
    if (!tomb) return true;
    const tombTime = new Date(tomb.deletedAt).getTime();
    const localTime = new Date(localP.updatedAt || localP.createdAt).getTime();
    return localTime > tombTime; // Keep only if locally recreated after deletion
  });

  if (choice === 'useCloud') {
    // Replace local library with cloud library (excluding any tombstones)
    const validCloudPrompts = cloudPrompts.filter(cloudP => {
      const tomb = tombstones.get(cloudP.id);
      if (!tomb) return true;
      const tombTime = new Date(tomb.deletedAt).getTime();
      const cloudTime = new Date(cloudP.updatedAt || cloudP.createdAt).getTime();
      return cloudTime > tombTime;
    });
    return validCloudPrompts;
  }

  if (choice === 'replaceCloud') {
    const toUpload = filterOutDefaultSamplePrompts(activeLocalPrompts);
    const batch = writeBatch(db);

    // Delete existing cloud prompts that are not in toUpload and tombstone them
    const uploadIds = new Set(toUpload.map(p => p.id));
    cloudPrompts.forEach(p => {
      if (!uploadIds.has(p.id)) {
        const docRef = doc(db, 'users', userId, 'prompts', p.id);
        const tombRef = doc(db, 'users', userId, 'tombstones', p.id);
        batch.delete(docRef);
        batch.set(tombRef, {
          id: p.id,
          deletedAt: new Date().toISOString(),
          userId
        });
      }
    });

    // Upload local prompts and remove any obsolete tombstones
    toUpload.forEach(p => {
      const docRef = doc(db, 'users', userId, 'prompts', p.id);
      const tombRef = doc(db, 'users', userId, 'tombstones', p.id);
      const createdAt = p.createdAt || new Date().toISOString();
      const updatedAt = p.updatedAt || createdAt;
      batch.set(docRef, {
        id: p.id,
        title: p.title,
        preview: p.preview || '',
        content: p.content,
        tags: p.tags || [],
        createdAt,
        updatedAt,
        lastUsed: p.lastUsed || null,
        useCount: p.useCount || 0,
        userId
      });
      batch.delete(tombRef);
    });

    await batch.commit();
    return toUpload;
  }

  // choice === 'merge' (Recommended)
  const cloudMap = new Map<string, Prompt>();
  cloudPrompts.forEach(p => {
    const tomb = tombstones.get(p.id);
    if (tomb) {
      const tombTime = new Date(tomb.deletedAt).getTime();
      const cloudTime = new Date(p.updatedAt || p.createdAt).getTime();
      if (tombTime >= cloudTime) return;
    }
    cloudMap.set(p.id, p);
  });

  const mergedList: Prompt[] = [];
  const uploadList: Prompt[] = [];
  const candidateLocalPrompts = filterOutDefaultSamplePrompts(activeLocalPrompts);

  candidateLocalPrompts.forEach(localP => {
    const existingCloud = cloudMap.get(localP.id);
    if (!existingCloud) {
      mergedList.push(localP);
      uploadList.push(localP);
    } else {
      const resolved = resolvePromptConflict(localP, existingCloud);
      mergedList.push(resolved);
      if (resolved === localP) {
        uploadList.push(localP);
      }
      cloudMap.delete(localP.id);
    }
  });

  // Add remaining cloud prompts
  cloudMap.forEach(cloudP => {
    mergedList.push(cloudP);
  });

  // Batch upload any new or resolved local items to cloud
  if (uploadList.length > 0) {
    const batch = writeBatch(db);
    uploadList.forEach(p => {
      const docRef = doc(db, 'users', userId, 'prompts', p.id);
      const tombRef = doc(db, 'users', userId, 'tombstones', p.id);
      const createdAt = p.createdAt || new Date().toISOString();
      const updatedAt = p.updatedAt || createdAt;
      batch.set(docRef, {
        id: p.id,
        title: p.title,
        preview: p.preview || '',
        content: p.content,
        tags: p.tags || [],
        createdAt,
        updatedAt,
        lastUsed: p.lastUsed || null,
        useCount: p.useCount || 0,
        userId
      });
      batch.delete(tombRef);
    });
    await batch.commit();
  }

  return mergedList;
}
