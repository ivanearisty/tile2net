import React, { useEffect, useMemo } from 'react';
import '../styles/TemporalSlider.css';

const TemporalSlider = ({ 
  selectedYear, 
  onYearChange, 
  isPlaying, 
  onPlayPause,
  availableYears = [2014, 2016, 2018]
}) => {
  // Sort years to ensure proper ordering
  const sortedYears = useMemo(() => [...availableYears].sort((a, b) => a - b), [availableYears]);
  
  // Use index-based slider (0 to length-1) for discrete steps
  const currentIndex = sortedYears.indexOf(selectedYear);
  const maxIndex = sortedYears.length - 1;

  // Auto-play functionality
  useEffect(() => {
    if (isPlaying) {
      const timer = setTimeout(() => {
        const nextIndex = (currentIndex + 1) % sortedYears.length;
        onYearChange(sortedYears[nextIndex]);
      }, 2500); // Slightly longer for large datasets
      return () => clearTimeout(timer);
    }
  }, [isPlaying, currentIndex, onYearChange, sortedYears]);

  const handleSliderChange = (e) => {
    const index = parseInt(e.target.value, 10);
    if (index >= 0 && index < sortedYears.length) {
      onYearChange(sortedYears[index]);
    }
  };

  const handleYearClick = (year) => {
    onYearChange(year);
  };

  // Progress based on index position
  const progress = maxIndex > 0 ? (currentIndex / maxIndex) * 100 : 0;

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
            min={0}
            max={maxIndex}
            step={1}
            value={currentIndex >= 0 ? currentIndex : 0}
            onChange={handleSliderChange}
            className="slider-input"
          />
        </div>
      </div>

      <div className="year-markers">
        {sortedYears.map((year) => (
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
          {sortedYears.length} snapshots • {sortedYears[0]}–{sortedYears[sortedYears.length - 1]}
        </span>
      </div>
    </div>
  );
};

export default TemporalSlider;
