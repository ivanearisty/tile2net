import React from 'react';
import '../styles/CompareControls.css';

const CompareControls = ({ 
  isCompareMode, 
  onToggleCompare,
  leftYear,
  rightYear,
  onLeftYearChange,
  onRightYearChange,
  onOpenImageOverlay,
  availableYears = [2014, 2016, 2018]
}) => {
  return (
    <div className="compare-controls">
      <div className="compare-header">
        <h3>Compare Mode</h3>
        <button 
          className={`toggle-button ${isCompareMode ? 'active' : ''}`}
          onClick={onToggleCompare}
        >
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
        </button>
      </div>

      {isCompareMode && (
        <div className="compare-options">
          <div className="year-pair">
            <div className="year-select">
              <label>
                <span className="label-dot before" />
                Before
              </label>
              <select 
                value={leftYear} 
                onChange={(e) => onLeftYearChange(parseInt(e.target.value))}
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <div className="year-divider">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>

            <div className="year-select">
              <label>
                <span className="label-dot after" />
                After
              </label>
              <select 
                value={rightYear} 
                onChange={(e) => onRightYearChange(parseInt(e.target.value))}
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          <button className="image-compare-button" onClick={onOpenImageOverlay}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            Compare Satellite Imagery
          </button>

          <div className="compare-stats">
            <div className="stat-item">
              <span className="stat-icon change-positive">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </span>
              <span className="stat-text">
                {rightYear - leftYear} year{rightYear - leftYear !== 1 ? 's' : ''} difference
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompareControls;
