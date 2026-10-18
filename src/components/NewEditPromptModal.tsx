import React, { useState, useEffect } from 'react';
import { Prompt, AiSettings } from '../types';

interface NewEditPromptModalProps {
  isOpen: boolean;
  editingPrompt: Prompt | null;
  aiSettings: AiSettings;
  onClose: () => void;
  onSave: (promptData: { id?: string; title: string; content: string; tags: string[] }) => void;
  onOpenSettings: () => void;
  onNotify: (msg: string, type: 'success' | 'error') => void;
}

export const NewEditPromptModal: React.FC<NewEditPromptModalProps> = ({
  isOpen,
  editingPrompt,
  aiSettings,
  onClose,
  onSave,
  onOpenSettings,
  onNotify
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [previousContent, setPreviousContent] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);

  useEffect(() => {
    if (editingPrompt) {
      setTitle(editingPrompt.title);
      setContent(editingPrompt.content);
      setTags(editingPrompt.tags.join(', '));
      setPreviousContent(null);
    } else {
      setTitle('');
      setContent('');
      setTags('');
      setPreviousContent(null);
    }
  }, [editingPrompt, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanContent = content.trim();

    if (!cleanTitle || !cleanContent) {
      onNotify('Title and content are required!', 'error');
      return;
    }

    const cleanTags = tags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    onSave({
      id: editingPrompt ? editingPrompt.id : undefined,
      title: cleanTitle,
      content: cleanContent,
      tags: cleanTags.length > 0 ? cleanTags : ['general']
    });
  };

  const handleEnhance = async () => {
    if (!aiSettings.apiKey || !aiSettings.model) {
      onNotify('Please configure AI settings first', 'error');
      onOpenSettings();
      return;
    }

    const currentContent = content.trim();
    if (!currentContent) {
      onNotify('No prompt content to enhance', 'error');
      return;
    }

    setIsEnhancing(true);
    setPreviousContent(currentContent);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiSettings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: aiSettings.model,
          messages: [
            {
              role: 'system',
              content: `${aiSettings.enhancementPrompt}\n\n${currentContent}\n\nIMPORTANT: Only return the improved prompt text exactly as it should be used.`
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'API request failed');
      }

      const result = await response.json();
      const enhanced = result.choices?.[0]?.message?.content?.trim();

      if (enhanced) {
        setContent(enhanced);
        onNotify('Prompt enhanced successfully!', 'success');
      } else {
        throw new Error('No enhanced content returned');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      onNotify(`Enhancement failed: ${message}`, 'error');
      setPreviousContent(null);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleUndo = () => {
    if (!previousContent) return;
    setContent(previousContent);
    setPreviousContent(null);
    onNotify('Reverted to the previous prompt.', 'success');
  };

  return (
    <div id="new-edit-prompt-modal" className="modal active" role="dialog" aria-modal="true">
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="new-edit-modal-title" className="modal-title">
            {editingPrompt ? `Edit Prompt: ${editingPrompt.title}` : 'New Prompt'}
          </h2>
          <button className="close-modal" onClick={onClose} aria-label="Close modal">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          <form id="prompt-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="prompt-title">Title</label>
              <input
                type="text"
                id="prompt-title"
                placeholder="e.g., Creative Writing Assistant"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="prompt-content">Prompt Content</label>
              <textarea
                id="prompt-content"
                placeholder="e.g., You are a creative writing assistant..."
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              ></textarea>
            </div>
            <div className="form-group">
              <label htmlFor="prompt-tags">Tags (comma-separated)</label>
              <input
                type="text"
                id="prompt-tags"
                placeholder="e.g., writing, creative, story"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                id="enhance-prompt-btn"
                className="action-btn"
                style={{ marginRight: 'auto' }}
                onClick={handleEnhance}
                disabled={isEnhancing}
                title="Enhance prompt with AI"
              >
                {isEnhancing ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> Enhancing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-magic"></i> Enhance with AI
                  </>
                )}
              </button>
              <button
                type="button"
                id="undo-enhance-btn"
                className="action-btn secondary"
                disabled={!previousContent || isEnhancing}
                onClick={handleUndo}
                title="Undo AI enhancement"
              >
                <i className="fas fa-undo"></i>
              </button>
              <button
                type="submit"
                id="save-prompt-btn"
                className="action-btn primary"
                title="Save prompt"
              >
                <i className="fas fa-save"></i>
              </button>
              <button
                type="button"
                id="cancel-prompt-btn"
                className="action-btn secondary"
                onClick={onClose}
                title="Cancel"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
