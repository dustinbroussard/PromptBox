import React from 'react';

interface HeaderProps {
  theme: 'default-dark' | 'default-light';
  onToggleTheme: () => void;
  onOpenAiAssistant: () => void;
  onOpenImportExport: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  onOpenAiAssistant,
  onOpenImportExport,
  onOpenSettings
}) => {
  return (
    <header className="header">
      <div className="header-content">
        <div className="header-title">
          <i className="fas fa-hammer header-icon"></i>
          <h1>PromptBox</h1>
        </div>
        <div className="header-actions">
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
        </div>
      </div>
    </header>
  );
};
