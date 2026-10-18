import React, { useState, useEffect } from 'react';
import { AiSettings, AiModel, AuthUser, SyncConnectionStatus } from '../types';
import { DEFAULT_ENHANCEMENT_PROMPT, DEFAULT_AI_MODEL } from '../utils/sampleData';

export interface SettingsModalProps {
  isOpen: boolean;
  settings: AiSettings;
  user: AuthUser | null;
  isAuthLoading: boolean;
  syncStatus: SyncConnectionStatus;
  promptsCount: number;
  onClose: () => void;
  onSave: (newSettings: AiSettings) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenExport: () => void;
  onOpenImport: () => void;
  onOpenAiAssistant: () => void;
  onNotify: (msg: string, type: 'success' | 'error') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  user,
  isAuthLoading,
  syncStatus,
  promptsCount,
  onClose,
  onSave,
  onSignIn,
  onSignOut,
  onOpenExport,
  onOpenImport,
  onOpenAiAssistant,
  onNotify
}) => {
  const [apiKey, setApiKey] = useState(settings.apiKey || '');
  const [model, setModel] = useState(settings.model || DEFAULT_AI_MODEL);
  const [enhancementPrompt, setEnhancementPrompt] = useState(
    settings.enhancementPrompt || DEFAULT_ENHANCEMENT_PROMPT
  );
  const [models, setModels] = useState<AiModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  useEffect(() => {
    setApiKey(settings.apiKey || '');
    setModel(settings.model || DEFAULT_AI_MODEL);
    setEnhancementPrompt(settings.enhancementPrompt || DEFAULT_ENHANCEMENT_PROMPT);
  }, [settings, isOpen]);

  useEffect(() => {
    if (isOpen && settings.apiKey) {
      fetchModels(settings.apiKey);
    }
  }, [isOpen, settings.apiKey]);

  const fetchModels = async (keyToUse: string) => {
    const trimmedKey = keyToUse.trim();
    if (!trimmedKey) return;

    try {
      setIsLoadingModels(true);
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch models');
      }

      const data = await res.json();
      if (Array.isArray(data.data)) {
        const sorted = data.data.sort((a: AiModel, b: AiModel) =>
          (a.name || a.id).localeCompare(b.name || b.id)
        );
        setModels(sorted);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      onNotify(`Failed to load models: ${message}`, 'error');
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleApiKeyBlur = () => {
    if (apiKey.trim()) {
      fetchModels(apiKey);
    }
  };

  const handleSubmitAiSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: AiSettings = {
      apiKey: apiKey.trim(),
      model: model || DEFAULT_AI_MODEL,
      enhancementPrompt: enhancementPrompt.trim() || DEFAULT_ENHANCEMENT_PROMPT
    };
    onSave(updated);
    onNotify('AI settings saved successfully!', 'success');
  };

  if (!isOpen) return null;

  const getSyncStatusBadge = () => {
    switch (syncStatus) {
      case 'connected':
        return {
          label: 'Cloud Sync Connected',
          subtext: 'Your prompts are synced in real-time with Google Cloud.',
          icon: 'fas fa-cloud'
        };
      case 'local-cache':
        return {
          label: 'Local Storage Mode',
          subtext: 'Prompts are saved safely in your browser local storage.',
          icon: 'fas fa-database'
        };
      case 'offline':
        return {
          label: 'Offline Cache',
          subtext: 'Offline — changes are saved locally and will sync once connected.',
          icon: 'fas fa-cloud-slash'
        };
    }
  };

  const statusInfo = getSyncStatusBadge();

  return (
    <div id="ai-settings-modal" className="modal active" role="dialog" aria-modal="true">
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal-content settings-modal-content">
        <div className="modal-header">
          <h2 className="modal-title">
            <i className="fas fa-cog" style={{ fontSize: '1.2rem' }}></i>
            Settings
          </h2>
          <button className="close-modal" onClick={onClose} aria-label="Close modal">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body settings-modal-body">
          {/* SECTION 1: ACCOUNT & SYNC */}
          <section className="settings-section">
            <div className="settings-section-header">
              <h3 className="settings-section-title">
                <i className="fas fa-user-shield"></i>
                Account &amp; Sync
              </h3>
              <div className={`sync-status-indicator ${syncStatus}`}>
                <span className={`sync-status-dot ${syncStatus}`} aria-hidden="true"></span>
                <i className={statusInfo.icon} style={{ fontSize: '0.75rem' }} aria-hidden="true"></i>
                <span>{statusInfo.label}</span>
              </div>
            </div>

            <p className="settings-section-desc">{statusInfo.subtext}</p>

            {isAuthLoading ? (
              <div className="settings-auth-loading">
                <i className="fas fa-spinner fa-spin"></i>
                <span>Checking authentication status...</span>
              </div>
            ) : user ? (
              <div className="settings-user-card">
                <div className="settings-user-info">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || user.email || 'User'}
                      className="settings-user-avatar"
                    />
                  ) : (
                    <div className="settings-user-avatar-placeholder">
                      {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="settings-user-details">
                    <div className="settings-user-name">
                      {user.displayName || 'Google Account'}
                    </div>
                    <div className="settings-user-email">{user.email}</div>
                  </div>
                </div>

                <button
                  type="button"
                  id="settings-sign-out-btn"
                  className="action-btn secondary settings-sign-out-btn"
                  onClick={onSignOut}
                  title="Sign out of PromptBox"
                >
                  <i className="fas fa-arrow-right-from-bracket"></i>
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="settings-signin-card">
                <p className="settings-signin-text">
                  Sign in with your Google account to back up your prompts and sync them
                  seamlessly across your mobile phone and desktop.
                </p>
                <button
                  type="button"
                  id="settings-sign-in-btn"
                  className="action-btn secondary settings-google-btn"
                  onClick={onSignIn}
                  title="Sign in with Google"
                >
                  <i className="fab fa-google"></i>
                  <span>Sign In with Google</span>
                </button>
              </div>
            )}
          </section>

          {/* SECTION 2: PROMPT DATA */}
          <section className="settings-section">
            <div className="settings-section-header">
              <h3 className="settings-section-title">
                <i className="fas fa-database"></i>
                Prompt Data
              </h3>
              <span className="settings-badge">
                {promptsCount} {promptsCount === 1 ? 'Prompt' : 'Prompts'}
              </span>
            </div>

            <p className="settings-section-desc">
              Export your prompt library as a portable JSON file or import prompts from another
              backup.
            </p>

            <div className="settings-actions-grid">
              <button
                type="button"
                id="settings-export-btn"
                className="action-btn secondary"
                onClick={() => {
                  onClose();
                  onOpenExport();
                }}
                title="Export prompts as JSON"
              >
                <i className="fas fa-file-export"></i>
                <span>Export Prompts</span>
              </button>

              <button
                type="button"
                id="settings-import-btn"
                className="action-btn secondary"
                onClick={() => {
                  onClose();
                  onOpenImport();
                }}
                title="Import prompts from JSON"
              >
                <i className="fas fa-file-import"></i>
                <span>Import Prompts</span>
              </button>
            </div>
          </section>

          {/* SECTION 3: AI TOOLS */}
          <section className="settings-section">
            <div className="settings-section-header">
              <h3 className="settings-section-title">
                <i className="fas fa-wand-magic-sparkles"></i>
                AI Tools
              </h3>
            </div>

            <p className="settings-section-desc">
              Draft new prompts, brainstorm ideas, or enhance existing prompts with language models.
            </p>

            <button
              type="button"
              id="settings-open-ai-lab-btn"
              className="action-btn primary settings-ai-lab-btn"
              onClick={() => {
                onClose();
                onOpenAiAssistant();
              }}
              title="Open AI Prompt Lab"
            >
              <i className="fas fa-wand-magic-sparkles"></i>
              <span>Open AI Prompt Lab</span>
            </button>

            <div className="settings-ai-divider">
              <span>OpenRouter &amp; Model Configuration</span>
            </div>

            <form id="ai-settings-form" onSubmit={handleSubmitAiSettings}>
              <div className="form-group">
                <label htmlFor="openrouter-api-key">OpenRouter API Key</label>
                <input
                  type="password"
                  id="openrouter-api-key"
                  placeholder="sk-or-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={handleApiKeyBlur}
                />
                <small
                  style={{
                    color: 'var(--text-muted)',
                    display: 'block',
                    marginTop: '4px',
                    fontSize: '0.8rem'
                  }}
                >
                  Get your free API key from{' '}
                  <a
                    href="https://openrouter.ai"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
                  >
                    openrouter.ai
                  </a>
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="ai-model-select">AI Model</label>
                <select
                  id="ai-model-select"
                  className="form-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {!apiKey.trim() && <option value="">Enter API Key first</option>}
                  {apiKey.trim() && models.length === 0 && !isLoadingModels && (
                    <option value={model}>{model} (configured)</option>
                  )}
                  {models.map((m) => {
                    const isFree = m.pricing?.prompt === 0 && m.pricing?.completion === 0;
                    return (
                      <option
                        key={m.id}
                        value={m.id}
                        style={{ color: isFree ? '#00ff88' : undefined }}
                      >
                        {m.name || m.id} {isFree ? '- FREE' : ''}
                      </option>
                    );
                  })}
                </select>
                {isLoadingModels && (
                  <div
                    id="model-loading-spinner"
                    style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}
                  >
                    <i className="fas fa-spinner fa-spin"></i> Loading models...
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="enhancement-prompt">Enhancement System Prompt</label>
                <textarea
                  id="enhancement-prompt"
                  rows={4}
                  placeholder="Enter system prompt for enhancement..."
                  value={enhancementPrompt}
                  onChange={(e) => setEnhancementPrompt(e.target.value)}
                ></textarea>
              </div>

              <div className="form-actions">
                <button type="submit" id="save-ai-settings" className="action-btn primary">
                  <i className="fas fa-save"></i>
                  <span>Save AI Settings</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
