export interface Prompt {
  id: string;
  title: string;
  preview: string;
  content: string;
  tags: string[];
  createdAt: string;
  lastUsed: string | null;
  useCount: number;
}

export interface AiSettings {
  apiKey: string;
  model: string;
  enhancementPrompt: string;
}

export interface AiModel {
  id: string;
  name: string;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
}

export type ImportBehavior = 'merge' | 'overwrite' | 'replaceAll';

export interface NotificationItem {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export interface ExportBundle {
  type: string;
  version: number;
  prompts: Prompt[];
  settings?: {
    aiSettings?: AiSettings;
    [key: string]: unknown;
  };
}

export interface ImportSummary {
  added: number;
  updated: number;
  skipped: number;
  total: number;
  error?: string;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type FirstTimeSyncChoice = 'merge' | 'useCloud' | 'replaceCloud';

export type SyncConnectionStatus = 'connected' | 'local-cache' | 'offline';

export interface FirstTimeSyncModalData {
  isOpen: boolean;
  localCount: number;
  cloudCount: number;
  cloudPrompts: Prompt[];
}

