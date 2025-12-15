import React, { useState } from 'react';
import '../styles/YearSettings.css';

const YearSettings = ({ 
  allYears = [], 
  disabledYears = [], 
  onToggleYear,
  onEnableAll,
  onDisableAll
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const enabledCount = allYears.length - disabledYears.length;

  return (
    <div className="year-settings">
      <button 
        className="year-settings-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Configure visible years"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
        </svg>
        <span className="year-count">{enabledCount}/{allYears.length}</span>
      </button>

      {isOpen && (
        <>
          <div className="year-settings-backdrop" onClick={() => setIsOpen(false)} />
          <div className="year-settings-panel">
            <div className="year-settings-header">
              <h3>Year Visibility</h3>
              <div className="year-settings-actions">
                <button onClick={onEnableAll} className="action-btn">All</button>
                <button onClick={onDisableAll} className="action-btn">None</button>
              </div>
            </div>
            
            <div className="year-settings-list">
              {allYears.map(year => {
                const isDisabled = disabledYears.includes(year);
                return (
                  <label key={year} className={`year-toggle ${isDisabled ? 'disabled' : 'enabled'}`}>
                    <input
                      type="checkbox"
                      checked={!isDisabled}
                      onChange={() => onToggleYear(year)}
                    />
                    <span className="year-label">{year}</span>
                    <span className="toggle-indicator" />
                  </label>
                );
              })}
            </div>

            <div className="year-settings-footer">
              <span>{enabledCount} of {allYears.length} years visible</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default YearSettings;

