import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  Unsubscribe,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from './config';
import { Prompt } from '../types';
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

// Built-in sample prompt IDs
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

export function backupLocalPrompts(prompts: Prompt[]): string {
  const timestamp = new Date().toISOString();
  const backupKey = `promptForgePrompts_backup_${timestamp.replace(/[:.]/g, '-')}`;
  try {
    localStorage.setItem(backupKey, JSON.stringify(prompts));
    localStorage.setItem('promptForgePrompts_latest_backup_key', backupKey);
  } catch (e) {
    console.error('Failed to create local backup', e);
  }
  return backupKey;
}

export async function fetchCloudPrompts(userId: string): Promise<Prompt[]> {
  const path = `users/${userId}/prompts`;
  try {
    const colRef = collection(db, 'users', userId, 'prompts');
    const snapshot = await getDocs(colRef);
    const cloudPrompts: Prompt[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      cloudPrompts.push({
        id: data.id || docSnap.id,
        title: data.title || '',
        preview: data.preview || '',
        content: data.content || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        createdAt: data.createdAt || new Date().toISOString(),
        lastUsed: data.lastUsed || null,
        useCount: typeof data.useCount === 'number' ? data.useCount : 0
      });
    });
    return cloudPrompts;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

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
        updatedPrompts.push({
          id: data.id || docSnap.id,
          title: data.title || '',
          preview: data.preview || '',
          content: data.content || '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          createdAt: data.createdAt || new Date().toISOString(),
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

export async function savePromptToCloud(userId: string, prompt: Prompt): Promise<void> {
  const path = `users/${userId}/prompts/${prompt.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'prompts', prompt.id);
    const payload = {
      id: prompt.id,
      title: prompt.title,
      preview: prompt.preview || '',
      content: prompt.content,
      tags: prompt.tags,
      createdAt: prompt.createdAt,
      lastUsed: prompt.lastUsed || null,
      useCount: prompt.useCount || 0,
      userId
    };
    await setDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deletePromptFromCloud(userId: string, promptId: string): Promise<void> {
  const path = `users/${userId}/prompts/${promptId}`;
  try {
    const docRef = doc(db, 'users', userId, 'prompts', promptId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Resolves conflicts between two prompt versions using Last-Modified-Wins
 */
export function resolvePromptConflict(local: Prompt, cloud: Prompt): Prompt {
  const localTime = new Date(local.lastUsed || local.createdAt).getTime();
  const cloudTime = new Date(cloud.lastUsed || cloud.createdAt).getTime();

  if (cloudTime > localTime) {
    return cloud;
  }
  return local;
}

export type FirstTimeSyncChoice = 'merge' | 'useCloud' | 'replaceCloud';

export async function executeFirstTimeSync(
  userId: string,
  localPrompts: Prompt[],
  cloudPrompts: Prompt[],
  choice: FirstTimeSyncChoice
): Promise<Prompt[]> {
  // Always create an automatic local backup first
  backupLocalPrompts(localPrompts);

  if (choice === 'useCloud') {
    // Replace local library with cloud library
    return cloudPrompts.length > 0 ? cloudPrompts : [];
  }

  if (choice === 'replaceCloud') {
    // Filter out built-in sample prompts from being uploaded to cloud
    const toUpload = filterOutDefaultSamplePrompts(localPrompts);
    const batch = writeBatch(db);

    // Delete existing cloud prompts
    cloudPrompts.forEach(p => {
      const docRef = doc(db, 'users', userId, 'prompts', p.id);
      batch.delete(docRef);
    });

    // Upload local prompts
    toUpload.forEach(p => {
      const docRef = doc(db, 'users', userId, 'prompts', p.id);
      batch.set(docRef, {
        id: p.id,
        title: p.title,
        preview: p.preview || '',
        content: p.content,
        tags: p.tags,
        createdAt: p.createdAt,
        lastUsed: p.lastUsed || null,
        useCount: p.useCount || 0,
        userId
      });
    });

    await batch.commit();
    return toUpload;
  }

  // choice === 'merge' (Recommended)
  const cloudMap = new Map<string, Prompt>();
  cloudPrompts.forEach(p => cloudMap.set(p.id, p));

  const mergedList: Prompt[] = [];
  const uploadList: Prompt[] = [];

  // Consider non-sample local prompts for merging
  const candidateLocalPrompts = filterOutDefaultSamplePrompts(localPrompts);

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

  // Batch upload any new or updated local items to cloud
  if (uploadList.length > 0) {
    const batch = writeBatch(db);
    uploadList.forEach(p => {
      const docRef = doc(db, 'users', userId, 'prompts', p.id);
      batch.set(docRef, {
        id: p.id,
        title: p.title,
        preview: p.preview || '',
        content: p.content,
        tags: p.tags,
        createdAt: p.createdAt,
        lastUsed: p.lastUsed || null,
        useCount: p.useCount || 0,
        userId
      });
    });
    await batch.commit();
  }

  return mergedList;
}
