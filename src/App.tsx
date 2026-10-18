import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Prompt, AiSettings, NotificationItem } from './types';
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
import { AiSettingsModal } from './components/AiSettingsModal';
import { ImportExportModal } from './components/ImportExportModal';
import { InstallModal } from './components/InstallModal';
import { NotificationToast } from './components/NotificationToast';

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

  // AI settings
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

  // Sync theme to DOM
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'default-light' ? '#ffffff' : '#000000');
    }
  }, [theme]);

  // Persist prompts
  useEffect(() => {
    try {
      localStorage.setItem('promptForgePrompts', JSON.stringify(prompts));
    } catch (e) {
      console.error('Failed to save prompts', e);
    }
  }, [prompts]);

  // Persist AI settings
  useEffect(() => {
    try {
      localStorage.setItem('promptForgeAiSettings', JSON.stringify(aiSettings));
    } catch (e) {
      console.error('Failed to save AI settings', e);
    }
  }, [aiSettings]);

  // Handle body modal-open class
  const hasOpenModal =
    Boolean(detailPrompt) ||
    isNewEditOpen ||
    isAiAssistantOpen ||
    isAiSettingsOpen ||
    isImportExportOpen;

  useEffect(() => {
    if (hasOpenModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
  }, [hasOpenModal]);

  // Notification helper
  const addNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = getRandomUUID();
    const item: NotificationItem = { id, message, type };
    setNotifications((prev) => [...prev, item]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3000);
  }, []);

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
        if (detailPrompt) setDetailPrompt(null);
        else if (isNewEditOpen) setIsNewEditOpen(false);
        else if (isAiAssistantOpen) setIsAiAssistantOpen(false);
        else if (isAiSettingsOpen) setIsAiSettingsOpen(false);
        else if (isImportExportOpen) setIsImportExportOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailPrompt, isNewEditOpen, isAiAssistantOpen, isAiSettingsOpen, isImportExportOpen]);

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

  // Prompt actions
  const handleUsePrompt = (prompt: Prompt) => {
    navigator.clipboard
      .writeText(prompt.content)
      .then(() => {
        addNotification(`'${prompt.title}' copied to clipboard!`, 'success');
        setPrompts((prev) =>
          prev.map((p) =>
            p.id === prompt.id
              ? {
                  ...p,
                  useCount: p.useCount + 1,
                  lastUsed: new Date().toISOString()
                }
              : p
          )
        );
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

  const handleDeletePrompt = (prompt: Prompt) => {
    if (!window.confirm('Are you sure you want to delete this prompt?')) return;
    setPrompts((prev) => prev.filter((p) => p.id !== prompt.id));
    if (detailPrompt?.id === prompt.id) {
      setDetailPrompt(null);
    }
    addNotification('Prompt deleted successfully!', 'success');
  };

  const handleSavePrompt = (data: {
    id?: string;
    title: string;
    content: string;
    tags: string[];
  }) => {
    if (data.id) {
      // Update
      setPrompts((prev) =>
        prev.map((p) =>
          p.id === data.id
            ? {
                ...p,
                title: data.title,
                content: data.content,
                preview: createPreviewFromContent(data.content),
                tags: data.tags
              }
            : p
        )
      );
      addNotification('Prompt updated successfully!', 'success');
    } else {
      // New
      const newPrompt: Prompt = {
        id: getRandomUUID(),
        title: data.title,
        content: data.content,
        preview: createPreviewFromContent(data.content),
        tags: data.tags,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        useCount: 0
      };
      setPrompts((prev) => [newPrompt, ...prev]);
      addNotification('Prompt created successfully!', 'success');
    }
    setIsNewEditOpen(false);
    setEditingPrompt(null);
  };

  const handleAcceptAiPrompt = (generatedContent: string) => {
    setEditingPrompt(null);
    setIsNewEditOpen(true);
    // Let NewEditPromptModal receive the content or set initial values
    setEditingPrompt({
      id: '',
      title: 'New AI Prompt',
      preview: createPreviewFromContent(generatedContent),
      content: generatedContent,
      tags: ['ai-generated'],
      createdAt: new Date().toISOString(),
      lastUsed: null,
      useCount: 0
    });
  };

  const handleImportComplete = (nextPrompts: Prompt[], updatedSettings?: AiSettings) => {
    setPrompts(nextPrompts);
    if (updatedSettings) {
      setAiSettings(updatedSettings);
    }
  };

  return (
    <>
      <Header
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
        onOpenImportExport={() => {
          setImportExportTab('export');
          setIsImportExportOpen(true);
        }}
        onOpenSettings={() => setIsAiSettingsOpen(true)}
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

      <AiSettingsModal
        isOpen={isAiSettingsOpen}
        settings={aiSettings}
        onClose={() => setIsAiSettingsOpen(false)}
        onSave={(updated) => setAiSettings(updated)}
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

      <InstallModal />

      <NotificationToast notifications={notifications} />
    </>
  );
};

export default App;
