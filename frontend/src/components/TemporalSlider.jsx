import React, { useEffect } from 'react';
import '../styles/TemporalSlider.css';

const TemporalSlider = ({ 
  selectedYear, 
  onYearChange, 
  isPlaying, 
  onPlayPause,
  availableYears = [2014, 2016, 2018]
}) => {
  const minYear = Math.min(...availableYears);
  const maxYear = Math.max(...availableYears);

  // Auto-play functionality
  useEffect(() => {
    if (isPlaying) {
      const timer = setTimeout(() => {
        const currentIndex = availableYears.indexOf(selectedYear);
        const nextIndex = (currentIndex + 1) % availableYears.length;
        onYearChange(availableYears[nextIndex]);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, selectedYear, onYearChange, availableYears]);

  const handleSliderChange = (e) => {
    const value = parseInt(e.target.value, 10);
    // Find closest available year
    const closestYear = availableYears.reduce((prev, curr) => 
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    );
    onYearChange(closestYear);
  };

  const handleYearClick = (year) => {
    onYearChange(year);
  };

  const progress = ((selectedYear - minYear) / (maxYear - minYear)) * 100;

  return (
    <div className="temporal-slider">
      <div className="slider-header">
        <h3>Timeline</h3>
        <button 
          className={`play-button ${isPlaying ? 'playing' : ''}`}
          onClick={onPlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>

      <div className="slider-container">
        <div className="slider-track">
          <div 
            className="slider-progress" 
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={selectedYear}
            onChange={handleSliderChange}
            className="slider-input"
          />
        </div>
      </div>

      <div className="year-markers">
        {availableYears.map((year) => (
          <button
            key={year}
            className={`year-marker ${year === selectedYear ? 'active' : ''}`}
            onClick={() => handleYearClick(year)}
          >
            <span className="marker-dot" />
            <span className="marker-label">{year}</span>
          </button>
        ))}
      </div>
      
      <div className="data-info">
        <span className="info-badge">
          {availableYears.length} snapshots available
        </span>
      </div>
    </div>
  );
};

export default TemporalSlider;
