import React from 'react';

interface ControlsSectionProps {
  onNewPrompt: () => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  onClearSearch: () => void;
  selectedTag: string;
  onTagChange: (tag: string) => void;
  tagsWithCounts: Array<{ tag: string; count: number }>;
  sortOption: string;
  onSortChange: (sort: string) => void;
}

export const ControlsSection: React.FC<ControlsSectionProps> = ({
  onNewPrompt,
  searchTerm,
  onSearchChange,
  onClearSearch,
  selectedTag,
  onTagChange,
  tagsWithCounts,
  sortOption,
  onSortChange
}) => {
  return (
    <>
      <section className="new-prompt-section">
        <button className="new-prompt-btn" id="new-prompt-btn" onClick={onNewPrompt}>
          <i className="fas fa-plus"></i>
          New Prompt
        </button>
      </section>

      <section className="controls-section">
        <div className="search-container">
          <input
            type="text"
            id="search-input"
            className="search-input"
            placeholder="Search prompts..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <i className="fas fa-search search-icon"></i>
          <button
            type="button"
            id="search-clear-btn"
            className={`search-clear-btn ${searchTerm ? 'visible' : ''}`}
            aria-label="Clear search"
            title="Clear search"
            onClick={onClearSearch}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="filters-container">
          <div className="controlsRow">
            <div className="controlGroup">
              <label htmlFor="tag-select" className="sort-label">
                Tag:
              </label>
              <select
                id="tag-select"
                className="sort-select"
                value={selectedTag}
                onChange={(e) => onTagChange(e.target.value)}
              >
                <option value="all">All tags</option>
                {tagsWithCounts.map(({ tag, count }) => (
                  <option key={tag} value={tag}>
                    {tag} ({count})
                  </option>
                ))}
              </select>
            </div>
            <div className="controlGroup">
              <label htmlFor="sort-select" className="sort-label">
                Sort by:
              </label>
              <select
                id="sort-select"
                className="sort-select"
                value={sortOption}
                onChange={(e) => onSortChange(e.target.value)}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="most-used">Most Used</option>
              </select>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
