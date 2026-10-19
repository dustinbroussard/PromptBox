import React from 'react';
import { Prompt } from '../types';
import { formatDate, createPreviewFromContent } from '../utils/importExport';

interface PromptCardProps {
  prompt: Prompt;
  onClick: () => void;
  onUse: (e: React.MouseEvent) => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onExport: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
}

export const PromptCard: React.FC<PromptCardProps> = ({
  prompt,
  onClick,
  onUse,
  onDuplicate,
  onExport,
  onEdit
}) => {
  const lastUsedText = formatDate(prompt.lastUsed);
  const preview = prompt.preview || createPreviewFromContent(prompt.content);

  return (
    <div
      className="prompt-card"
      data-id={prompt.id}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="prompt-header">
        <div>
          <h3 className="prompt-title">{prompt.title}</h3>
          <div className="prompt-meta">
            Used {prompt.useCount} times • Last used {lastUsedText}
          </div>
        </div>
      </div>

      <div className="prompt-tags">
        {prompt.tags.map((tag, idx) => (
          <span key={idx} className="prompt-tag">
            {tag}
          </span>
        ))}
      </div>

      <div className="prompt-preview">{preview}</div>

      <div className="prompt-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="action-btn primary use-prompt-btn"
          onClick={onUse}
          title="Copy prompt to clipboard"
          aria-label="Copy prompt to clipboard"
        >
          <i className="fas fa-copy"></i>
        </button>
        <button
          type="button"
          className="action-btn secondary duplicate-prompt-btn"
          onClick={onDuplicate}
          title="Duplicate prompt"
          aria-label="Duplicate prompt"
        >
          <i className="fas fa-clone"></i>
        </button>
        <button
          type="button"
          className="action-btn secondary export-prompt-btn"
          onClick={onExport}
          title="Export single prompt as JSON"
          aria-label="Export single prompt"
        >
          <i className="fas fa-file-export"></i>
        </button>
        <button
          type="button"
          className="action-btn secondary edit-prompt-btn"
          onClick={onEdit}
          title="Edit prompt"
          aria-label="Edit prompt"
        >
          <i className="fas fa-edit"></i>
        </button>
      </div>
    </div>
  );
};
