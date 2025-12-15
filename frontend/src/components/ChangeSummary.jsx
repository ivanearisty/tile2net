import React, { useMemo } from 'react';
import '../styles/ChangeSummary.css';

const ChangeSummary = ({ summary, year, compareFromYear = null, calibration = null, enabledTypes = { sidewalk: true, crosswalk: true, road: true }, onToggleType = null }) => {
  // Compute match rate (must be called before any early returns)
  const matchRate = useMemo(() => {
    if (!summary) return null;
    if (!summary.unchanged && !summary.removed) return null;
    const beforeCount = summary.unchanged + summary.removed;
    return beforeCount > 0 ? summary.unchanged / beforeCount : 0;
  }, [summary]);

  if (!summary) return null;

  const typeLabels = {
    sidewalk: 'Sidewalks',
    crosswalk: 'Crosswalks',
    pedestrian_path: 'Pedestrian Paths',
    bike_lane: 'Bike Lanes',
  };

  return (
    <div className="change-summary">
      <h3 className="summary-title">
        <span className="year-highlight">{year}</span> Summary
      </h3>

      {/* Auto-Calibration Status */}
      {matchRate !== null && (
        <div className="quality-banner quality-good">
          <div className="quality-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div className="quality-content">
            <span className="quality-rate">
              {(matchRate * 100).toFixed(0)}% continuity
            </span>
            <span className="quality-message">
              {calibration ? 'Auto-calibrated for realistic change detection' : 'Infrastructure stability verified'}
            </span>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card added">
          <div className="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-number">{summary.added}</span>
            <span className="stat-label">Added</span>
          </div>
        </div>

        <div className="stat-card removed">
          <div className="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-number">{summary.removed}</span>
            <span className="stat-label">Removed</span>
          </div>
        </div>

        <div className="stat-card unchanged">
          <div className="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-number">{summary.unchanged}</span>
            <span className="stat-label">Unchanged</span>
          </div>
        </div>

        <div className="stat-card total">
          <div className="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M18 9l-5 5-4-4-6 6" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-number">{summary.total}</span>
            <span className="stat-label">Total</span>
          </div>
        </div>
      </div>

      <div className="breakdown-section">
        <h4>By Type</h4>
        <div className="breakdown-bars">
          {Object.entries(summary.byType).map(([type, count]) => {
            const percentage = (count / summary.total) * 100;
            return (
              <div key={type} className="breakdown-item">
                <div className="breakdown-header">
                  <span className="breakdown-label">{typeLabels[type] || type}</span>
                  <span className="breakdown-count">{count}</span>
                </div>
                <div className="breakdown-bar">
                  <div 
                    className="breakdown-fill"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="total-length">
        <span className="length-label">Total Network Length</span>
        <span className="length-value">
          {(summary.totalLength / 1000).toFixed(1)} km
        </span>
      </div>

      {/* Type Toggles */}
      {onToggleType && (
        <div className="type-toggles-section">
          <h4>Show on Map</h4>
          <div className="type-toggles">
            <label className="type-toggle">
              <input
                type="checkbox"
                checked={enabledTypes.sidewalk !== false}
                onChange={() => onToggleType('sidewalk')}
              />
              <span className="toggle-label">Sidewalks</span>
            </label>
            <label className="type-toggle">
              <input
                type="checkbox"
                checked={enabledTypes.crosswalk !== false}
                onChange={() => onToggleType('crosswalk')}
              />
              <span className="toggle-label">Crosswalks</span>
            </label>
            <label className="type-toggle">
              <input
                type="checkbox"
                checked={enabledTypes.road !== false}
                onChange={() => onToggleType('road')}
              />
              <span className="toggle-label">Roads</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChangeSummary;

