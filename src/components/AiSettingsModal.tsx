import React, { useState, useEffect } from 'react';
import { AiSettings, AiModel } from '../types';
import { DEFAULT_ENHANCEMENT_PROMPT, DEFAULT_AI_MODEL } from '../utils/sampleData';

interface AiSettingsModalProps {
  isOpen: boolean;
  settings: AiSettings;
  onClose: () => void;
  onSave: (newSettings: AiSettings) => void;
  onNotify: (msg: string, type: 'success' | 'error') => void;
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({
  isOpen,
  settings,
  onClose,
  onSave,
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
          'Authorization': `Bearer ${trimmedKey}`,
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: AiSettings = {
      apiKey: apiKey.trim(),
      model: model || DEFAULT_AI_MODEL,
      enhancementPrompt: enhancementPrompt.trim() || DEFAULT_ENHANCEMENT_PROMPT
    };
    onSave(updated);
    onNotify('AI settings saved successfully!', 'success');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div id="ai-settings-modal" className="modal active" role="dialog" aria-modal="true">
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">AI Enhancement Settings</h2>
          <button className="close-modal" onClick={onClose} aria-label="Close modal">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          <form id="ai-settings-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="openrouter-api-key">OpenRouter API Key</label>
              <input
                type="password"
                id="openrouter-api-key"
                placeholder="sk-or-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={handleApiKeyBlur}
                required
              />
              <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                Get your free API key from{' '}
                <a
                  href="https://openrouter.ai"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-primary)' }}
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
                required
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
                      {m.name || m.id} ({m.id}) {isFree ? '- FREE' : ''}
                    </option>
                  );
                })}
              </select>
              {isLoadingModels && (
                <div
                  id="model-loading-spinner"
                  style={{ marginTop: '8px', color: 'var(--text-muted)' }}
                >
                  <i className="fas fa-spinner fa-spin"></i> Loading models...
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="enhancement-prompt">Enhancement Prompt</label>
              <textarea
                id="enhancement-prompt"
                rows={5}
                placeholder="Enter system prompt for enhancement..."
                value={enhancementPrompt}
                onChange={(e) => setEnhancementPrompt(e.target.value)}
              ></textarea>
            </div>

            <div className="form-actions">
              <button type="submit" id="save-ai-settings" className="action-btn primary">
                Save Settings
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
