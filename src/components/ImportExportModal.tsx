import React, { useState, useRef } from 'react';
import { Prompt, AiSettings, ImportSummary, ImportBehavior } from '../types';
import {
  createExportBundle,
  downloadExportData,
  normalizeImportedData,
  applyImport
} from '../utils/importExport';

interface ImportExportModalProps {
  isOpen: boolean;
  initialTab?: 'export' | 'import';
  prompts: Prompt[];
  aiSettings: AiSettings;
  onClose: () => void;
  onImportComplete: (nextPrompts: Prompt[], updatedSettings?: AiSettings) => void;
  onNotify: (msg: string, type: 'success' | 'error') => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  initialTab = 'export',
  prompts,
  aiSettings,
  onClose,
  onImportComplete,
  onNotify
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(initialTab);
  const [includeSettingsInExport, setIncludeSettingsInExport] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importBehavior, setImportBehavior] = useState<ImportBehavior>('merge');
  const [importSettingsIfPresent, setImportSettingsIfPresent] = useState(true);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExportAll = () => {
    const settingsBundle = includeSettingsInExport ? { aiSettings } : undefined;
    const bundle = createExportBundle(prompts, settingsBundle);
    downloadExportData(bundle, 'promptbox_prompts.json');
    onNotify('Prompts exported successfully!', 'success');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setSummary(null);
  };

  const computeImportSummary = (
    existing: Prompt[],
    incoming: Prompt[],
    mode: ImportBehavior
  ): ImportSummary => {
    const total = incoming.length;
    if (mode === 'replaceAll') {
      return { added: total, updated: 0, skipped: 0, total };
    }

    const existingIds = new Set(existing.map(p => p.id));
    let added = 0;
    let updated = 0;
    let skipped = 0;

    incoming.forEach(p => {
      if (existingIds.has(p.id)) {
        if (mode === 'overwrite') {
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        added += 1;
      }
    });

    return { added, updated, skipped, total };
  };

  const handleImportConfirm = () => {
    if (!selectedFile) {
      onNotify('Choose a JSON file to import.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const normalized = normalizeImportedData(parsed);

        const sum = computeImportSummary(prompts, normalized.prompts, importBehavior);
        const nextPrompts = applyImport(
          prompts,
          normalized.prompts,
          importBehavior === 'replaceAll' ? 'replace' : importBehavior
        );

        let newSettings: AiSettings | undefined;
        if (
          importSettingsIfPresent &&
          normalized.settings &&
          typeof normalized.settings === 'object' &&
          'aiSettings' in normalized.settings
        ) {
          newSettings = normalized.settings.aiSettings as AiSettings;
        }

        onImportComplete(nextPrompts, newSettings);
        setSummary(sum);
        onNotify('Prompts imported successfully!', 'success');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setSummary({ added: 0, updated: 0, skipped: 0, total: 0, error: message });
        onNotify(`Failed to import prompts: ${message}`, 'error');
      }
    };
    reader.readAsText(selectedFile);
  };

  const getBehaviorHelp = () => {
    switch (importBehavior) {
      case 'merge':
        return 'Keeps your current prompts and adds only new ones.';
      case 'overwrite':
        return 'Replaces prompts with matching IDs.';
      case 'replaceAll':
        return 'Deletes everything first. Use with caution.';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setActiveTab('import');
      setSelectedFile(file);
      setSummary(null);
    }
  };

  return (
    <div
      id="import-export-modal"
      className={`modal import-export-modal active ${isDragActive ? 'drag-active' : ''}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-overlay" onClick={onClose}></div>
      <div
        className="modal-content import-export-content"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="modal-header">
          <h2 className="modal-title">Import / Export</h2>
          <button className="close-modal" onClick={onClose} aria-label="Close modal">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          <div className="import-export-tabs" role="tablist" aria-label="Import and export tabs">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'export'}
              onClick={() => setActiveTab('export')}
            >
              Export
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'import' ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'import'}
              onClick={() => setActiveTab('import')}
            >
              Import
            </button>
          </div>

          {activeTab === 'export' && (
            <div className="import-export-section active">
              <div className="form-group">
                <label className="section-title">Export Options</label>
                <div className="export-actions">
                  <button
                    type="button"
                    id="export-all-btn"
                    className="action-btn primary"
                    onClick={handleExportAll}
                  >
                    Export All Prompts
                  </button>
                </div>
                <label className="option-row" style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="export-include-settings"
                    checked={includeSettingsInExport}
                    onChange={(e) => setIncludeSettingsInExport(e.target.checked)}
                  />
                  <span>Include settings</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'import' && (
            <div className="import-export-section active">
              <div className="form-group">
                <label className="section-title">Import Options</label>
                <div className="file-input-row">
                  <button
                    type="button"
                    id="import-file-btn"
                    className="action-btn secondary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose file
                  </button>
                  <span id="import-file-name" className="file-name">
                    {selectedFile ? selectedFile.name : 'No file selected'}
                  </span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    id="import-file-input"
                    className="visually-hidden"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="section-title" htmlFor="import-behavior-select">
                  Import behavior
                </label>
                <select
                  id="import-behavior-select"
                  className="sort-select"
                  style={{ width: '100%' }}
                  value={importBehavior}
                  onChange={(e) => setImportBehavior(e.target.value as ImportBehavior)}
                >
                  <option value="merge">Merge (add new, keep existing)</option>
                  <option value="overwrite">Overwrite duplicates (replace existing)</option>
                  <option value="replaceAll">Replace all (delete all then import)</option>
                </select>
                <p id="import-behavior-help" className="helper-text">
                  {getBehaviorHelp()}
                </p>
              </div>

              <label className="option-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="import-include-settings"
                  checked={importSettingsIfPresent}
                  onChange={(e) => setImportSettingsIfPresent(e.target.checked)}
                />
                <span>Import settings if present</span>
              </label>

              <div className="import-actions">
                <button
                  type="button"
                  id="import-confirm-btn"
                  className="action-btn primary"
                  onClick={handleImportConfirm}
                >
                  Import
                </button>
              </div>

              {summary && (
                <div id="import-summary" className="import-summary" aria-live="polite">
                  {summary.error ? (
                    `Import failed: ${summary.error}`
                  ) : (
                    `Added: ${summary.added} • Updated: ${summary.updated} • Skipped: ${summary.skipped} • Total: ${summary.total}`
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
