import React, { useState } from 'react';
import { FirstTimeSyncChoice } from '../types';

interface SyncConfirmModalProps {
  isOpen: boolean;
  localCount: number;
  cloudCount: number;
  userEmail: string | null;
  onConfirm: (choice: FirstTimeSyncChoice) => void;
  onCancel: () => void;
}

export const SyncConfirmModal: React.FC<SyncConfirmModalProps> = ({
  isOpen,
  localCount,
  cloudCount,
  userEmail,
  onConfirm,
  onCancel
}) => {
  const [selectedChoice, setSelectedChoice] = useState<FirstTimeSyncChoice>('merge');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleApply = async () => {
    setIsProcessing(true);
    try {
      await onConfirm(selectedChoice);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div id="sync-confirm-modal" className="modal active" role="dialog" aria-modal="true">
      <div className="modal-overlay" onClick={onCancel}></div>
      <div className="modal-content" style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <h2 className="modal-title">
            <i className="fas fa-cloud-arrow-up" style={{ marginRight: '8px' }}></i>
            Sync Your Prompts
          </h2>
          <button className="close-modal" onClick={onCancel} aria-label="Close modal">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
            Signed in as <strong>{userEmail || 'Google User'}</strong>. We found{' '}
            <strong>{localCount} local prompt{localCount === 1 ? '' : 's'}</strong> on this device and{' '}
            <strong>{cloudCount} prompt{cloudCount === 1 ? '' : 's'}</strong> in your cloud library.
            Choose how you would like to synchronize them:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
            {/* Option 1: Merge */}
            <label
              style={{
                display: 'block',
                padding: '14px 16px',
                borderRadius: '10px',
                border: `2px solid ${selectedChoice === 'merge' ? 'var(--accent-primary)' : 'var(--border)'}`,
                background: selectedChoice === 'merge' ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <input
                  type="radio"
                  name="syncChoice"
                  value="merge"
                  checked={selectedChoice === 'merge'}
                  onChange={() => setSelectedChoice('merge')}
                />
                <strong style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>
                  Merge both libraries (Recommended)
                </strong>
              </div>
              <p style={{ margin: '0 0 0 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Combines your local and cloud prompts. Any duplicate IDs will keep the most recently updated
                version. No prompts will be deleted.
              </p>
            </label>

            {/* Option 2: Use Cloud */}
            <label
              style={{
                display: 'block',
                padding: '14px 16px',
                borderRadius: '10px',
                border: `2px solid ${selectedChoice === 'useCloud' ? 'var(--accent-primary)' : 'var(--border)'}`,
                background: selectedChoice === 'useCloud' ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <input
                  type="radio"
                  name="syncChoice"
                  value="useCloud"
                  checked={selectedChoice === 'useCloud'}
                  onChange={() => setSelectedChoice('useCloud')}
                />
                <strong style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>
                  Use the cloud library on this device
                </strong>
              </div>
              <p style={{ margin: '0 0 0 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Loads your cloud prompts onto this device. An automatic local backup of your existing local
                prompts is saved first so nothing is lost.
              </p>
            </label>

            {/* Option 3: Replace Cloud */}
            <label
              style={{
                display: 'block',
                padding: '14px 16px',
                borderRadius: '10px',
                border: `2px solid ${selectedChoice === 'replaceCloud' ? 'var(--accent-primary)' : 'var(--border)'}`,
                background: selectedChoice === 'replaceCloud' ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <input
                  type="radio"
                  name="syncChoice"
                  value="replaceCloud"
                  checked={selectedChoice === 'replaceCloud'}
                  onChange={() => setSelectedChoice('replaceCloud')}
                />
                <strong style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>
                  Replace the cloud library with this device's library
                </strong>
              </div>
              <p style={{ margin: '0 0 0 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Uploads this device's prompts to your cloud account, replacing older cloud prompts. A local
                backup is created before proceeding.
              </p>
            </label>
          </div>

          <div className="modal-footer" style={{ padding: '0', border: 'none', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              className="action-btn secondary"
              onClick={onCancel}
              disabled={isProcessing}
            >
              Cancel (Stay Offline)
            </button>
            <button
              type="button"
              className="action-btn primary"
              onClick={handleApply}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Syncing...
                </>
              ) : (
                <>
                  <i className="fas fa-check"></i> Confirm Sync
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
