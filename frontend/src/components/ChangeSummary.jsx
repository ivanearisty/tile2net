import React from 'react';
import '../styles/ChangeSummary.css';

const ChangeSummary = ({ summary, year }) => {
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
    </div>
  );
};

export default ChangeSummary;

