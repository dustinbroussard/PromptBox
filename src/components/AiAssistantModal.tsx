import React, { useState } from 'react';
import { AiSettings } from '../types';

interface AiAssistantModalProps {
  isOpen: boolean;
  aiSettings: AiSettings;
  initialPrompt?: string;
  onClose: () => void;
  onAcceptPrompt: (generatedContent: string) => void;
  onOpenSettings: () => void;
  onNotify: (msg: string, type: 'success' | 'error') => void;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  aiSettings,
  initialPrompt = '',
  onClose,
  onAcceptPrompt,
  onOpenSettings,
  onNotify
}) => {
  const [userInput, setUserInput] = useState(initialPrompt);
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async (isRedo = false) => {
    if (!aiSettings.apiKey || !aiSettings.model) {
      onNotify('Please configure AI settings first', 'error');
      onOpenSettings();
      return;
    }

    const trimmedInput = userInput.trim();
    if (!trimmedInput) {
      onNotify('Enter a prompt or request to generate', 'error');
      return;
    }

    try {
      setIsWorking(true);
      setStatus(isRedo ? 'Regenerating with AI...' : 'Generating with AI...');

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
              content: aiSettings.enhancementPrompt
            },
            {
              role: 'user',
              content: trimmedInput
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'API request failed');
      }

      const result = await response.json();
      const generatedContent = result.choices?.[0]?.message?.content?.trim();

      if (!generatedContent) {
        throw new Error('No AI content returned');
      }

      setOutput(generatedContent);
      setStatus('AI draft ready.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus('');
      onNotify(`AI generation failed: ${message}`, 'error');
    } finally {
      setIsWorking(false);
    }
  };

  const handleAccept = () => {
    const trimmed = output.trim();
    if (!trimmed) {
      onNotify('No AI result to accept', 'error');
      return;
    }
    onAcceptPrompt(trimmed);
    onClose();
    onNotify('AI prompt accepted. Review and save when ready.', 'success');
  };

  const handleReject = () => {
    setOutput('');
    setStatus('Draft discarded.');
  };

  const hasOutput = Boolean(output.trim());

  return (
    <div id="ai-assistant-modal" className="modal active" role="dialog" aria-modal="true">
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">AI Prompt Lab</h2>
          <button className="close-modal" onClick={onClose} aria-label="Close modal">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="ai-prompt-input">Your prompt or request</label>
            <textarea
              id="ai-prompt-input"
              rows={6}
              placeholder="Describe the prompt you want to create or enhance..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
            ></textarea>
          </div>
          <div className="form-group">
            <label htmlFor="ai-prompt-output">AI Result</label>
            <textarea
              id="ai-prompt-output"
              className="ai-output"
              rows={8}
              readOnly
              value={output}
            ></textarea>
            {status && (
              <div id="ai-prompt-status" className="helper-text" aria-live="polite">
                {status}
              </div>
            )}
          </div>
          <div className="form-actions ai-modal-actions">
            <button
              type="button"
              id="ai-prompt-generate"
              className="action-btn secondary ai-generate-btn"
              disabled={isWorking}
              onClick={() => handleGenerate(false)}
            >
              {isWorking ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Working...
                </>
              ) : (
                <>
                  <i className="fas fa-wand-magic-sparkles"></i> Generate
                </>
              )}
            </button>
            <button
              type="button"
              id="ai-prompt-accept"
              className="action-btn primary"
              disabled={!hasOutput || isWorking}
              onClick={handleAccept}
            >
              <i className="fas fa-save"></i> Accept
            </button>
            <button
              type="button"
              id="ai-prompt-redo"
              className="action-btn secondary"
              disabled={!hasOutput || isWorking}
              onClick={() => handleGenerate(true)}
            >
              <i className="fas fa-rotate-right"></i> Redo
            </button>
            <button
              type="button"
              id="ai-prompt-reject"
              className="action-btn danger"
              disabled={!hasOutput || isWorking}
              onClick={handleReject}
            >
              <i className="fas fa-times"></i> Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
