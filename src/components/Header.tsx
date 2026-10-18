import React from 'react';
import { AuthUser, SyncConnectionStatus } from '../types';

interface HeaderProps {
  theme: 'default-dark' | 'default-light';
  user: AuthUser | null;
  isAuthLoading: boolean;
  syncStatus: SyncConnectionStatus;
  onToggleTheme: () => void;
  onOpenAiAssistant: () => void;
  onOpenImportExport: () => void;
  onOpenSettings: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  user,
  isAuthLoading,
  syncStatus,
  onToggleTheme,
  onOpenAiAssistant,
  onOpenImportExport,
  onOpenSettings,
  onSignIn,
  onSignOut
}) => {
  const getStatusDetails = () => {
    switch (syncStatus) {
      case 'connected':
        return {
          label: 'Connected',
          tooltip: 'Syncing with cloud',
          icon: 'fas fa-cloud'
        };
      case 'local-cache':
        return {
          label: 'Local Storage',
          tooltip: 'Using local storage',
          icon: 'fas fa-database'
        };
      case 'offline':
        return {
          label: 'Offline',
          tooltip: 'Offline - changes will sync when connected',
          icon: 'fas fa-cloud-slash'
        };
    }
  };

  const status = getStatusDetails();

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-title">
          <i className="fas fa-hammer header-icon"></i>
          <h1>PromptBox</h1>
        </div>

        <div className="header-actions" style={{ alignItems: 'center' }}>
          {/* Firebase Connection / Sync Status Indicator with Tooltip */}
          <div
            className={`sync-status-wrapper ${syncStatus}`}
            tabIndex={0}
            title={status.tooltip}
            aria-label={`Sync Status: ${status.tooltip}`}
          >
            <div className={`sync-status-indicator ${syncStatus}`}>
              <span className={`sync-status-dot ${syncStatus}`} aria-hidden="true"></span>
              <i className={status.icon} style={{ fontSize: '0.75rem' }} aria-hidden="true"></i>
              <span className="sync-status-text">{status.label}</span>
            </div>

            <div className={`sync-tooltip ${syncStatus}`} role="tooltip">
              <div className="sync-tooltip-header">
                <span className={`sync-status-dot ${syncStatus}`}></span>
                <strong>{status.tooltip}</strong>
              </div>
            </div>
          </div>

          <button
            className="header-btn header-btn-text"
            id="ai-assistant-btn"
            title="AI Prompt Lab"
            onClick={onOpenAiAssistant}
            aria-label="Open AI Prompt Lab"
          >
            <i className="fas fa-wand-magic-sparkles"></i>
          </button>
          <button
            className="header-btn header-btn-text"
            id="import-export-btn"
            title="Import / Export"
            onClick={onOpenImportExport}
            aria-label="Open Import / Export"
          >
            <i className="fas fa-file-import"></i>
          </button>
          <button
            className="header-btn"
            id="theme-toggle-btn"
            title="Toggle Theme"
            onClick={onToggleTheme}
            aria-label="Toggle Theme"
          >
            <i className={theme === 'default-dark' ? 'fas fa-sun' : 'fas fa-moon'}></i>
          </button>
          <button
            className="header-btn"
            id="settings-btn"
            title="Settings"
            onClick={onOpenSettings}
            aria-label="Open AI Settings"
          >
            <i className="fas fa-cog"></i>
          </button>

          {/* User Auth Section */}
          {isAuthLoading ? (
            <button className="header-btn" disabled title="Authenticating...">
              <i className="fas fa-spinner fa-spin"></i>
            </button>
          ) : user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px' }}>
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || user.email || 'User'}
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    border: '1px solid var(--border)'
                  }}
                  title={`Signed in as ${user.displayName || user.email}`}
                />
              ) : (
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: 'var(--accent-primary)',
                    color: 'var(--bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '0.85rem'
                  }}
                  title={`Signed in as ${user.displayName || user.email}`}
                >
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <button
                className="header-btn"
                id="sign-out-btn"
                title={`Sign out (${user.email || 'Account'})`}
                onClick={onSignOut}
                aria-label="Sign out"
              >
                <i className="fas fa-arrow-right-from-bracket"></i>
              </button>
            </div>
          ) : (
            <button
              className="action-btn secondary"
              style={{ padding: '6px 12px', fontSize: '0.85rem', marginLeft: '4px' }}
              onClick={onSignIn}
              title="Sign in with Google to sync prompts across devices"
            >
              <i className="fab fa-google" style={{ marginRight: '6px' }}></i>
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
