import React, { useState } from 'react';
import '../styles/CompareControls.css';

const CompareControls = ({ 
  isCompareMode, 
  onToggleCompare,
  leftYear,
  rightYear,
  onLeftYearChange,
  onRightYearChange,
  onOpenImageOverlay,
  availableYears = [2014, 2016, 2018],
  tolerance,
  onToleranceChange,
  isReloading = false
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Convert distance in degrees to approximate meters (at NYC latitude)
  const distanceToMeters = (deg) => Math.round(deg * 111000 * Math.cos(40.7 * Math.PI / 180));
  const metersToDistance = (m) => m / (111000 * Math.cos(40.7 * Math.PI / 180));
  
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

          {/* Tolerance Settings */}
          <div className="tolerance-section">
            <button 
              className={`advanced-toggle ${showAdvanced ? 'open' : ''}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Match Tolerance
              <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {showAdvanced && tolerance && (
              <div className="tolerance-controls">
                <div className="tolerance-slider">
                  <label>
                    <span>Distance</span>
                    <span className="tolerance-value">{distanceToMeters(tolerance.DISTANCE)}m</span>
                  </label>
                  <input 
                    type="range"
                    min="5"
                    max="50"
                    step="1"
                    value={distanceToMeters(tolerance.DISTANCE)}
                    onChange={(e) => onToleranceChange({
                      ...tolerance,
                      DISTANCE: metersToDistance(parseInt(e.target.value))
                    })}
                  />
                  <div className="slider-labels">
                    <span>5m</span>
                    <span>50m</span>
                  </div>
                </div>

                <div className="tolerance-slider">
                  <label>
                    <span>Length Ratio</span>
                    <span className="tolerance-value">{Math.round(tolerance.LENGTH_RATIO * 100)}%</span>
                  </label>
                  <input 
                    type="range"
                    min="10"
                    max="80"
                    step="5"
                    value={tolerance.LENGTH_RATIO * 100}
                    onChange={(e) => onToleranceChange({
                      ...tolerance,
                      LENGTH_RATIO: parseInt(e.target.value) / 100
                    })}
                  />
                  <div className="slider-labels">
                    <span>10%</span>
                    <span>80%</span>
                  </div>
                </div>

                <div className="tolerance-slider">
                  <label>
                    <span>Angle</span>
                    <span className="tolerance-value">{tolerance.ANGLE}°</span>
                  </label>
                  <input 
                    type="range"
                    min="5"
                    max="45"
                    step="5"
                    value={tolerance.ANGLE}
                    onChange={(e) => onToleranceChange({
                      ...tolerance,
                      ANGLE: parseInt(e.target.value)
                    })}
                  />
                  <div className="slider-labels">
                    <span>5°</span>
                    <span>45°</span>
                  </div>
                </div>

                <p className="tolerance-hint">
                  {isReloading ? (
                    <span className="reloading">
                      <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                      </svg>
                      Recomputing...
                    </span>
                  ) : (
                    'Adjust how strictly features must match between years'
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompareControls;
