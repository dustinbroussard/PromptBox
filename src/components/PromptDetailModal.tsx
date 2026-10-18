import React from 'react';
import { Prompt } from '../types';

interface PromptDetailModalProps {
  prompt: Prompt | null;
  isOpen: boolean;
  onClose: () => void;
  onUse: (prompt: Prompt) => void;
  onEdit: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void;
}

export const PromptDetailModal: React.FC<PromptDetailModalProps> = ({
  prompt,
  isOpen,
  onClose,
  onUse,
  onEdit,
  onDelete
}) => {
  if (!isOpen || !prompt) return null;

  return (
    <div id="prompt-detail-modal" className="modal active" role="dialog" aria-modal="true">
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="prompt-detail-title" className="modal-title">
            {prompt.title}
          </h2>
          <button className="close-modal" onClick={onClose} aria-label="Close modal">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-prompt-content" id="modal-prompt-content">
            {prompt.content}
          </div>
          <div className="modal-prompt-tags" id="modal-prompt-tags">
            {prompt.tags.map((tag, idx) => (
              <span key={idx} className="prompt-tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            id="modal-use-prompt-btn"
            className="action-btn primary"
            onClick={() => onUse(prompt)}
          >
            <i className="fas fa-copy"></i> Copy Prompt
          </button>
          <button
            type="button"
            id="modal-edit-prompt-btn"
            className="action-btn secondary"
            onClick={() => onEdit(prompt)}
          >
            <i className="fas fa-edit"></i> Edit
          </button>
          <button
            type="button"
            id="modal-delete-prompt-btn"
            className="action-btn danger"
            onClick={() => onDelete(prompt)}
          >
            <i className="fas fa-trash-alt"></i> Delete
          </button>
        </div>
      </div>
    </div>
  );
};
