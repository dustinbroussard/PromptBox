import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Prompt,
  PromptTombstone,
  AiSettings,
  NotificationItem,
  AuthUser,
  FirstTimeSyncChoice,
  FirstTimeSyncModalData,
  SyncConnectionStatus
} from './types';
import {
  SAMPLE_PROMPTS,
  DEFAULT_AI_SETTINGS
} from './utils/sampleData';
import {
  normalizeImportedData,
  createExportBundle,
  buildPromptFilename,
  downloadExportData,
  createPreviewFromContent,
  getRandomUUID
} from './utils/importExport';
import { Header } from './components/Header';
import { ControlsSection } from './components/ControlsSection';
import { PromptCard } from './components/PromptCard';
import { PromptDetailModal } from './components/PromptDetailModal';
import { NewEditPromptModal } from './components/NewEditPromptModal';
import { AiAssistantModal } from './components/AiAssistantModal';
import { SettingsModal } from './components/SettingsModal';
import { ImportExportModal } from './components/ImportExportModal';
import { InstallModal } from './components/InstallModal';
import { NotificationToast } from './components/NotificationToast';
import { SyncConfirmModal } from './components/SyncConfirmModal';

// Firebase imports
import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from './firebase/config';
import {
  fetchCloudPrompts,
  fetchTombstones,
  subscribeToUserPrompts,
  savePromptToCloud,
  deletePromptFromCloud,
  executeFirstTimeSync,
  filterOutDefaultSamplePrompts,
  reconcileRemotePromptsWithLocal,
  duplicatePrompt
} from './firebase/syncService';

export const App: React.FC = () => {
  // Theme state
  const [theme, setTheme] = useState<'default-dark' | 'default-light'>(() => {
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'default-light' || stored === 'default-dark') {
        return stored;
      }
    } catch {
      // ignore
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'default-dark' : 'default-light';
  });

  // Authentication state
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Prompts state
  const [prompts, setPrompts] = useState<Prompt[]>(() => {
    try {
      const stored = localStorage.getItem('promptForgePrompts');
      if (stored) {
        const parsed = JSON.parse(stored);
        const normalized = normalizeImportedData(parsed).prompts;
        if (normalized.length > 0) return normalized;
      }
    } catch (e) {
      console.error('Failed to load prompts from storage', e);
    }
    return SAMPLE_PROMPTS;
  });

  // Keep a ref to latest prompts to avoid stale closures in async sync handlers
  const promptsRef = useRef<Prompt[]>(prompts);
  useEffect(() => {
    promptsRef.current = prompts;
  }, [prompts]);

  // AI settings (strictly local only)
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => {
    try {
      const saved = localStorage.getItem('promptForgeAiSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          apiKey: parsed.apiKey || '',
          model: parsed.model || DEFAULT_AI_SETTINGS.model,
          enhancementPrompt: parsed.enhancementPrompt || DEFAULT_AI_SETTINGS.enhancementPrompt
        };
      }
    } catch {
      // ignore
    }
    return DEFAULT_AI_SETTINGS;
  });

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>(() => {
    return localStorage.getItem('pf_selectedTag') || 'all';
  });
  const [sortOption, setSortOption] = useState<string>(() => {
    return localStorage.getItem('pf_sort') || 'newest';
  });

  // Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Modals state
  const [detailPrompt, setDetailPrompt] = useState<Prompt | null>(null);
  const [isNewEditOpen, setIsNewEditOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [importExportTab, setImportExportTab] = useState<'export' | 'import'>('export');

  // First-time sync confirmation state
  const [syncModalData, setSyncModalData] = useState<FirstTimeSyncModalData>({
    isOpen: false,
    localCount: 0,
    cloudCount: 0,
    cloudPrompts: []
  });

  // Active Firestore unsubscribe ref and tombstones cache
  const unsubscribeFirestoreRef = useRef<(() => void) | null>(null);
  const tombstonesRef = useRef<Map<string, PromptTombstone>>(new Map());
  const isSyncDeferredRef = useRef(false);

  // Connection and Sync Status
  const [syncStatus, setSyncStatus] = useState<SyncConnectionStatus>(() => {
    return typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'local-cache';
  });

  // Notification helper
  const addNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = getRandomUUID();
    const item: NotificationItem = { id, message, type };
    setNotifications((prev) => [...prev, item]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3000);
  }, []);

  // Sync theme to DOM
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'default-light' ? '#ffffff' : '#000000');
    }
  }, [theme]);

  // Persist prompts locally (acts as offline cache and guest storage)
  useEffect(() => {
    try {
      localStorage.setItem('promptForgePrompts', JSON.stringify(prompts));
    } catch (e) {
      console.error('Failed to save prompts locally', e);
    }
  }, [prompts]);

  // Persist AI settings locally
  useEffect(() => {
    try {
      localStorage.setItem('promptForgeAiSettings', JSON.stringify(aiSettings));
    } catch (e) {
      console.error('Failed to save AI settings', e);
    }
  }, [aiSettings]);

  // Subscribe to Firestore for real-time sync with idempotent conflict resolution
  const startRealtimeSync = useCallback((userId: string) => {
    if (unsubscribeFirestoreRef.current) {
      unsubscribeFirestoreRef.current();
      unsubscribeFirestoreRef.current = null;
    }

    const unsub = subscribeToUserPrompts(
      userId,
      (cloudPrompts, isFromCache) => {
        setPrompts((prevLocal) => {
          const { nextPrompts, localPromptsToPush } = reconcileRemotePromptsWithLocal(
            prevLocal,
            cloudPrompts,
            tombstonesRef.current
          );

          // Push any newer local versions or deterministic conflict copies to cloud
          if (localPromptsToPush.length > 0) {
            localPromptsToPush.forEach((p) => {
              savePromptToCloud(userId, p).catch((err) => {
                console.error('Failed to sync reconciled local prompt to cloud', err);
              });
            });
          }

          return nextPrompts;
        });

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setSyncStatus('offline');
        } else if (isFromCache) {
          setSyncStatus('local-cache');
        } else {
          setSyncStatus('connected');
        }
      },
      (error) => {
        console.error('Realtime sync error:', error);
        setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'local-cache');
        addNotification('Sync connection error. Using offline cache.', 'error');
      }
    );

    unsubscribeFirestoreRef.current = unsub;
  }, [addNotification]);

  // Evaluates initial synchronization safely
  const checkAndInitSync = useCallback(async (uid: string) => {
    try {
      // 1. Fetch server truth for cloud prompts and tombstones
      const [cloudPrompts, tombstones] = await Promise.all([
        fetchCloudPrompts(uid),
        fetchTombstones(uid)
      ]);

      tombstonesRef.current = tombstones;
      isSyncDeferredRef.current = false;

      const currentLocalPrompts = promptsRef.current;
      // Filter out local prompts that match an active cloud tombstone
      const activeLocalPrompts = currentLocalPrompts.filter((p) => {
        const tomb = tombstones.get(p.id);
        if (!tomb) return true;
        const tombTime = new Date(tomb.deletedAt).getTime();
        const localTime = new Date(p.updatedAt || p.createdAt).getTime();
        return localTime > tombTime; // Recreated locally after deletion
      });

      const nonSampleLocal = filterOutDefaultSamplePrompts(activeLocalPrompts);

      if (cloudPrompts.length > 0 && nonSampleLocal.length > 0) {
        // Both local and cloud have custom data: prompt user to decide
        setSyncModalData({
          isOpen: true,
          localCount: nonSampleLocal.length,
          cloudCount: cloudPrompts.length,
          cloudPrompts
        });
      } else if (cloudPrompts.length > 0) {
        // Local only had sample prompts: adopt cloud prompts directly
        setPrompts(cloudPrompts);
        startRealtimeSync(uid);
        addNotification('Connected to cloud library.', 'success');
      } else if (nonSampleLocal.length > 0) {
        // Cloud is empty, but local has user prompts: upload them
        const merged = await executeFirstTimeSync(
          uid,
          activeLocalPrompts,
          [],
          'merge'
        );
        setPrompts(merged);
        startRealtimeSync(uid);
        addNotification('Local prompts synced to cloud.', 'success');
      } else {
        // Both are empty/sample only
        startRealtimeSync(uid);
      }
    } catch (err: unknown) {
      console.error('Initial sync check failed (offline or network error):', err);
      // Network failure / offline: treat cloud state as UNKNOWN
      isSyncDeferredRef.current = true;
      setSyncStatus('offline');
      // Do NOT attach live onSnapshot
      // Do NOT show FirstTimeSync modal
      // Do NOT wipe or overwrite local prompts
      addNotification('Offline or server unreachable. Sync deferred until connected.', 'error');
    }
  }, [startRealtimeSync, addNotification]);

  // Network online/offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      if (user) {
        if (isSyncDeferredRef.current || !unsubscribeFirestoreRef.current) {
          checkAndInitSync(user.uid);
        } else {
          setSyncStatus('connected');
        }
      } else {
        setSyncStatus('local-cache');
      }
    };
    const handleOffline = () => {
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, checkAndInitSync]);

  // Handle Firebase Auth changes
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsAuthLoading(true);

      if (firebaseUser) {
        const authUser: AuthUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL
        };
        setUser(authUser);
        await checkAndInitSync(firebaseUser.uid);
      } else {
        // User is signed out
        if (unsubscribeFirestoreRef.current) {
          unsubscribeFirestoreRef.current();
          unsubscribeFirestoreRef.current = null;
        }
        tombstonesRef.current.clear();
        isSyncDeferredRef.current = false;
        setUser(null);
        setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'local-cache');

        // Restore local unauthenticated prompts
        try {
          const stored = localStorage.getItem('promptForgePrompts');
          if (stored) {
            const parsed = JSON.parse(stored);
            setPrompts(normalizeImportedData(parsed).prompts);
          } else {
            setPrompts(SAMPLE_PROMPTS);
          }
        } catch {
          setPrompts(SAMPLE_PROMPTS);
        }
      }

      setIsAuthLoading(false);
    });

    return () => {
      unsubAuth();
      if (unsubscribeFirestoreRef.current) {
        unsubscribeFirestoreRef.current();
      }
    };
  }, [checkAndInitSync]);

  // Google Sign-In
  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      console.error('Sign-in failed', err);
      const message = err instanceof Error ? err.message : String(err);
      addNotification(`Sign-in failed: ${message}`, 'error');
    }
  };

  // Sign-Out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      addNotification('Signed out successfully.', 'success');
    } catch (err: unknown) {
      console.error('Sign-out failed', err);
      addNotification('Sign-out failed.', 'error');
    }
  };

  // First-time sync confirmation resolver
  const handleConfirmFirstTimeSync = async (choice: FirstTimeSyncChoice) => {
    if (!user) return;
    try {
      const resolved = await executeFirstTimeSync(
        user.uid,
        prompts,
        syncModalData.cloudPrompts,
        choice
      );
      setPrompts(resolved);
      setSyncModalData((prev) => ({ ...prev, isOpen: false }));
      startRealtimeSync(user.uid);
      addNotification('Libraries synchronized successfully!', 'success');
    } catch (err: unknown) {
      console.error('First time sync failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      addNotification(`Failed to synchronize: ${msg}`, 'error');
    }
  };

  const handleCancelFirstTimeSync = async () => {
    setSyncModalData((prev) => ({ ...prev, isOpen: false }));
    // Sign out to keep local prompts unmerged
    await handleSignOut();
  };

  // Handle body modal-open class
  const hasOpenModal =
    Boolean(detailPrompt) ||
    isNewEditOpen ||
    isAiAssistantOpen ||
    isAiSettingsOpen ||
    isImportExportOpen ||
    syncModalData.isOpen;

  useEffect(() => {
    if (hasOpenModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
  }, [hasOpenModal]);

  // Tag list calculation with counts
  const tagsWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    prompts.forEach((p) => {
      (p.tags || []).forEach((t) => {
        const tag = String(t).trim().toLowerCase();
        if (!tag) return;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }));
  }, [prompts]);

  // Ensure selectedTag is still valid if tags change
  useEffect(() => {
    if (selectedTag !== 'all' && !tagsWithCounts.some((t) => t.tag === selectedTag)) {
      setSelectedTag('all');
      localStorage.setItem('pf_selectedTag', 'all');
    }
  }, [tagsWithCounts, selectedTag]);

  // Filtered and sorted prompts
  const filteredPrompts = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();

    const filtered = prompts.filter((p) => {
      const matchesFilter = selectedTag === 'all' || p.tags.includes(selectedTag);
      const matchesSearch =
        !lowerSearch ||
        p.title.toLowerCase().includes(lowerSearch) ||
        p.content.toLowerCase().includes(lowerSearch) ||
        p.tags.some((t) => t.toLowerCase().includes(lowerSearch));
      return matchesFilter && matchesSearch;
    });

    return filtered.sort((a, b) => {
      switch (sortOption) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'alphabetical':
          return a.title.localeCompare(b.title);
        case 'most-used':
          return b.useCount - a.useCount;
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [prompts, selectedTag, searchTerm, sortOption]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (syncModalData.isOpen) setSyncModalData((prev) => ({ ...prev, isOpen: false }));
        else if (detailPrompt) setDetailPrompt(null);
        else if (isNewEditOpen) setIsNewEditOpen(false);
        else if (isAiAssistantOpen) setIsAiAssistantOpen(false);
        else if (isAiSettingsOpen) setIsAiSettingsOpen(false);
        else if (isImportExportOpen) setIsImportExportOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailPrompt, isNewEditOpen, isAiAssistantOpen, isAiSettingsOpen, isImportExportOpen, syncModalData.isOpen]);

  // Theme toggle
  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'default-dark' ? 'default-light' : 'default-dark'));
  };

  // Tag filter change
  const handleTagChange = (tag: string) => {
    setSelectedTag(tag);
    localStorage.setItem('pf_selectedTag', tag);
  };

  // Sort change
  const handleSortChange = (sort: string) => {
    setSortOption(sort);
    localStorage.setItem('pf_sort', sort);
  };

  // Prompt actions with cloud sync
  const handleUsePrompt = (prompt: Prompt) => {
    navigator.clipboard
      .writeText(prompt.content)
      .then(() => {
        addNotification(`'${prompt.title}' copied to clipboard!`, 'success');
        // Copying/using preserves original updatedAt! Only useCount and lastUsed change.
        const updatedPrompt: Prompt = {
          ...prompt,
          useCount: prompt.useCount + 1,
          lastUsed: new Date().toISOString()
        };

        // Optimistic local update
        setPrompts((prev) => prev.map((p) => (p.id === prompt.id ? updatedPrompt : p)));

        // Sync to cloud if signed in
        if (user) {
          savePromptToCloud(user.uid, updatedPrompt).catch((err) => {
            console.error('Failed to sync usage to cloud', err);
          });
        }
      })
      .catch(() => {
        addNotification('Failed to copy prompt.', 'error');
      });
    setDetailPrompt(null);
  };

  const handleExportPrompt = (prompt: Prompt) => {
    const bundle = createExportBundle([prompt]);
    const filename = buildPromptFilename(prompt.title);
    downloadExportData(bundle, filename);
    addNotification('Prompt exported successfully!', 'success');
  };

  const handleOpenEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setDetailPrompt(null);
    setIsNewEditOpen(true);
  };

  const handleDuplicatePrompt = (prompt: Prompt) => {
    const duplicatedPrompt = duplicatePrompt(prompt);

    setPrompts((prev) => [duplicatedPrompt, ...prev]);
    addNotification(`Duplicated '${prompt.title}'!`, 'success');

    if (user) {
      savePromptToCloud(user.uid, duplicatedPrompt).catch((err) => {
        console.error('Failed to save duplicated prompt to cloud', err);
        addNotification('Saved locally, but cloud sync failed.', 'error');
      });
    }

    setEditingPrompt(duplicatedPrompt);
    setDetailPrompt(null);
    setIsNewEditOpen(true);
  };

  const handleDeletePrompt = (prompt: Prompt) => {
    if (!window.confirm('Are you sure you want to delete this prompt?')) return;

    // Optimistic local update
    setPrompts((prev) => prev.filter((p) => p.id !== prompt.id));
    if (detailPrompt?.id === prompt.id) {
      setDetailPrompt(null);
    }
    addNotification('Prompt deleted successfully!', 'success');

    // Sync deletion to cloud with tombstone if signed in
    if (user) {
      deletePromptFromCloud(user.uid, prompt.id).catch((err) => {
        console.error('Failed to sync deletion to cloud', err);
        addNotification('Failed to delete prompt from cloud.', 'error');
      });
    }
  };

  const handleSavePrompt = (data: {
    id?: string;
    title: string;
    content: string;
    tags: string[];
  }) => {
    const now = new Date().toISOString();

    if (data.id) {
      // Update existing
      const existing = prompts.find((p) => p.id === data.id);
      const updatedPrompt: Prompt = {
        id: data.id,
        title: data.title,
        content: data.content,
        preview: createPreviewFromContent(data.content),
        tags: data.tags,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        lastUsed: existing?.lastUsed || null,
        useCount: existing?.useCount || 0
      };

      setPrompts((prev) => prev.map((p) => (p.id === data.id ? updatedPrompt : p)));
      addNotification('Prompt updated successfully!', 'success');

      if (user) {
        savePromptToCloud(user.uid, updatedPrompt).catch((err) => {
          console.error('Failed to save update to cloud', err);
          addNotification('Saved locally, but cloud sync failed.', 'error');
        });
      }
    } else {
      // Create new
      const newPrompt: Prompt = {
        id: getRandomUUID(),
        title: data.title,
        content: data.content,
        preview: createPreviewFromContent(data.content),
        tags: data.tags,
        createdAt: now,
        updatedAt: now,
        lastUsed: null,
        useCount: 0
      };

      setPrompts((prev) => [newPrompt, ...prev]);
      addNotification('Prompt created successfully!', 'success');

      if (user) {
        savePromptToCloud(user.uid, newPrompt).catch((err) => {
          console.error('Failed to save new prompt to cloud', err);
          addNotification('Saved locally, but cloud sync failed.', 'error');
        });
      }
    }
    setIsNewEditOpen(false);
    setEditingPrompt(null);
  };

  const handleAcceptAiPrompt = (generatedContent: string) => {
    const now = new Date().toISOString();
    setEditingPrompt(null);
    setIsNewEditOpen(true);
    setEditingPrompt({
      id: '',
      title: 'New AI Prompt',
      preview: createPreviewFromContent(generatedContent),
      content: generatedContent,
      tags: ['ai-generated'],
      createdAt: now,
      updatedAt: now,
      lastUsed: null,
      useCount: 0
    });
  };

  const handleImportComplete = (nextPrompts: Prompt[], updatedSettings?: AiSettings) => {
    setPrompts(nextPrompts);
    if (updatedSettings) {
      setAiSettings(updatedSettings);
    }

    // Sync newly imported prompts to cloud if signed in
    if (user) {
      nextPrompts.forEach((p) => {
        savePromptToCloud(user.uid, p).catch((err) => {
          console.error('Failed to sync imported prompt to cloud', err);
        });
      });
    }
  };

  return (
    <>
      <Header
        theme={theme}
        user={user}
        isAuthLoading={isAuthLoading}
        syncStatus={syncStatus}
        onToggleTheme={handleToggleTheme}
        onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
        onOpenImportExport={() => {
          setImportExportTab('export');
          setIsImportExportOpen(true);
        }}
        onOpenSettings={() => setIsAiSettingsOpen(true)}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      <main className="main-container">
        <ControlsSection
          onNewPrompt={() => {
            setEditingPrompt(null);
            setIsNewEditOpen(true);
          }}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onClearSearch={() => setSearchTerm('')}
          selectedTag={selectedTag}
          onTagChange={handleTagChange}
          tagsWithCounts={tagsWithCounts}
          sortOption={sortOption}
          onSortChange={handleSortChange}
        />

        {filteredPrompts.length > 0 ? (
          <section className="prompts-grid" id="prompts-grid">
            {filteredPrompts.map((prompt) => (
              <PromptCard
                key={prompt.id}
                prompt={prompt}
                onClick={() => setDetailPrompt(prompt)}
                onUse={() => handleUsePrompt(prompt)}
                onDuplicate={() => handleDuplicatePrompt(prompt)}
                onExport={() => handleExportPrompt(prompt)}
                onEdit={() => handleOpenEdit(prompt)}
              />
            ))}
          </section>
        ) : (
          <div id="empty-state" className="empty-state" style={{ display: 'flex' }}>
            <i className="fas fa-box-open empty-icon"></i>
            <h2 className="empty-title">No Prompts Found</h2>
            <p className="empty-text">
              It looks like there are no prompts matching your criteria. Try adjusting your search
              or filters.
            </p>
          </div>
        )}
      </main>

      {/* Modals */}
      <PromptDetailModal
        prompt={detailPrompt}
        isOpen={Boolean(detailPrompt)}
        onClose={() => setDetailPrompt(null)}
        onUse={handleUsePrompt}
        onDuplicate={handleDuplicatePrompt}
        onEdit={handleOpenEdit}
        onDelete={handleDeletePrompt}
      />

      <NewEditPromptModal
        isOpen={isNewEditOpen}
        editingPrompt={editingPrompt && editingPrompt.id ? editingPrompt : null}
        aiSettings={aiSettings}
        onClose={() => {
          setIsNewEditOpen(false);
          setEditingPrompt(null);
        }}
        onSave={handleSavePrompt}
        onOpenSettings={() => {
          setIsNewEditOpen(false);
          setIsAiSettingsOpen(true);
        }}
        onNotify={addNotification}
      />

      <AiAssistantModal
        isOpen={isAiAssistantOpen}
        aiSettings={aiSettings}
        initialPrompt={editingPrompt?.content || ''}
        onClose={() => setIsAiAssistantOpen(false)}
        onAcceptPrompt={handleAcceptAiPrompt}
        onOpenSettings={() => {
          setIsAiAssistantOpen(false);
          setIsAiSettingsOpen(true);
        }}
        onNotify={addNotification}
      />

      <SettingsModal
        isOpen={isAiSettingsOpen}
        settings={aiSettings}
        user={user}
        isAuthLoading={isAuthLoading}
        syncStatus={syncStatus}
        promptsCount={prompts.length}
        onClose={() => setIsAiSettingsOpen(false)}
        onSave={(updated) => setAiSettings(updated)}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onOpenExport={() => {
          setImportExportTab('export');
          setIsImportExportOpen(true);
        }}
        onOpenImport={() => {
          setImportExportTab('import');
          setIsImportExportOpen(true);
        }}
        onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
        onNotify={addNotification}
      />

      <ImportExportModal
        isOpen={isImportExportOpen}
        initialTab={importExportTab}
        prompts={prompts}
        aiSettings={aiSettings}
        onClose={() => setIsImportExportOpen(false)}
        onImportComplete={handleImportComplete}
        onNotify={addNotification}
      />

      <SyncConfirmModal
        isOpen={syncModalData.isOpen}
        localCount={syncModalData.localCount}
        cloudCount={syncModalData.cloudCount}
        userEmail={user?.email || null}
        onConfirm={handleConfirmFirstTimeSync}
        onCancel={handleCancelFirstTimeSync}
      />

      <InstallModal />

      <NotificationToast notifications={notifications} />
    </>
  );
};

export default App;
