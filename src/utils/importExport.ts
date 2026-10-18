import type { Prompt, ExportBundle } from '../types.ts';

export const EXPORT_TYPE = 'promptbox.export';
export const EXPORT_VERSION = 2;

export function getRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pf_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function normalizeDateToIso(value: unknown, fallbackIso: string | null): string | null {
  if (!value) return fallbackIso;
  const date = new Date(value as string | number | Date);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }
  return fallbackIso;
}

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map(tag => String(tag).trim().toLowerCase())
    .filter(Boolean);
}

export function createPreviewFromContent(content: string | undefined): string {
  const collapsed = String(content || '').replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, 140);
}

export function normalizePrompt(raw: any): Prompt {
  const idRaw = raw && raw.id;
  let id = '';
  if (idRaw === null || idRaw === undefined || idRaw === '') {
    id = getRandomUUID();
  } else if (typeof idRaw === 'number') {
    id = String(idRaw);
  } else {
    id = String(idRaw);
  }

  const title = raw && raw.title !== undefined ? String(raw.title) : '';
  const content = raw && raw.content !== undefined ? String(raw.content) : '';
  const preview = raw && typeof raw.preview === 'string' && raw.preview.trim()
    ? raw.preview
    : createPreviewFromContent(content);

  const createdAtFallback = new Date().toISOString();
  const createdAt = normalizeDateToIso(raw && raw.createdAt, createdAtFallback) || createdAtFallback;

  let lastUsed: string | null = null;
  if (raw && raw.lastUsed !== undefined && raw.lastUsed !== null && raw.lastUsed !== '') {
    const lastUsedIso = normalizeDateToIso(raw.lastUsed, null);
    if (lastUsedIso) {
      lastUsed = lastUsedIso;
    }
  }

  const useCount = raw && typeof raw.useCount === 'number' && Number.isFinite(raw.useCount)
    ? raw.useCount
    : 0;

  return {
    id,
    title,
    preview,
    content,
    tags: normalizeTags(raw && raw.tags),
    createdAt,
    lastUsed,
    useCount
  };
}

export function normalizeImportedData(json: unknown): { prompts: Prompt[]; settings?: Record<string, unknown> } {
  if (Array.isArray(json)) {
    return { prompts: json.map(normalizePrompt) };
  }
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid file format');
  }
  const obj = json as Record<string, unknown>;
  if (obj.type !== EXPORT_TYPE || obj.version !== EXPORT_VERSION || !Array.isArray(obj.prompts)) {
    throw new Error('Invalid file format');
  }
  return {
    prompts: obj.prompts.map(normalizePrompt),
    settings: obj.settings as Record<string, unknown> | undefined
  };
}

export function applyImport(
  existingPrompts: Prompt[],
  incomingPrompts: Prompt[],
  mode: 'merge' | 'overwrite' | 'replace' | 'replaceAll'
): Prompt[] {
  const normalizedMode = mode === 'replaceAll' ? 'replace' : mode || 'replace';
  if (normalizedMode === 'replace') {
    return incomingPrompts.slice();
  }

  const next = existingPrompts.slice();
  const indexById = new Map<string, number>();
  next.forEach((prompt, index) => {
    indexById.set(prompt.id, index);
  });

  incomingPrompts.forEach(prompt => {
    const existingIndex = indexById.get(prompt.id);
    if (existingIndex === undefined) {
      indexById.set(prompt.id, next.length);
      next.push(prompt);
      return;
    }
    if (normalizedMode === 'overwrite') {
      next[existingIndex] = prompt;
    }
  });

  return next;
}

export function createExportBundle(prompts: Prompt[], settings?: Record<string, unknown>): ExportBundle {
  const bundle: ExportBundle = {
    type: EXPORT_TYPE,
    version: EXPORT_VERSION,
    prompts: (prompts || []).map(normalizePrompt)
  };
  if (settings !== undefined) {
    bundle.settings = settings;
  }
  return bundle;
}

export function buildPromptFilename(title: string): string {
  const base = String(title || 'prompt')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return `${base || 'prompt'}.json`;
}

export function downloadExportData(exportData: ExportBundle, filename: string): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute('href', dataStr);
  downloadAnchorNode.setAttribute('download', filename);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return 'never';
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return 'never';

  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - parsedDate.getTime()) / (1000 * 60 * 60 * 24));
  const diffInHours = Math.floor((now.getTime() - parsedDate.getTime()) / (1000 * 60 * 60));
  const diffInMinutes = Math.floor((now.getTime() - parsedDate.getTime()) / (1000 * 60));

  if (diffInDays > 30) {
    return parsedDate.toLocaleDateString();
  } else if (diffInDays > 0) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  } else if (diffInHours > 0) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  } else if (diffInMinutes > 0) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  } else {
    return 'just now';
  }
}
