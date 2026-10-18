import React from 'react';
import { Prompt } from '../types';
import { formatDate, createPreviewFromContent } from '../utils/importExport';

interface PromptCardProps {
  prompt: Prompt;
  onClick: () => void;
  onUse: (e: React.MouseEvent) => void;
  onExport: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
}

export const PromptCard: React.FC<PromptCardProps> = ({
  prompt,
  onClick,
  onUse,
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
        >
          <i className="fas fa-copy"></i> Use
        </button>
        <button
          type="button"
          className="action-btn secondary export-prompt-btn"
          onClick={onExport}
          title="Export single prompt as JSON"
        >
          <i className="fas fa-file-export"></i> Export
        </button>
        <button
          type="button"
          className="action-btn secondary edit-prompt-btn"
          onClick={onEdit}
          title="Edit prompt"
        >
          <i className="fas fa-edit"></i> Edit
        </button>
      </div>
    </div>
  );
};
