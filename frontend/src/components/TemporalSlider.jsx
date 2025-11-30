import React, { useEffect, useRef } from 'react';
import '../styles/TemporalSlider.css';

const TemporalSlider = ({ selectedYear, onYearChange, isPlaying, onPlayPause }) => {
  const years = Array.from({ length: 11 }, (_, i) => 2014 + i);
  const intervalRef = useRef(null);

  // Auto-play functionality
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        onYearChange(prev => {
          const nextYear = prev >= 2024 ? 2014 : prev + 1;
          return nextYear;
        });
      }, 1500);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, onYearChange]);

  // Handle auto-play year updates
  useEffect(() => {
    if (isPlaying) {
      const timer = setTimeout(() => {
        const nextYear = selectedYear >= 2024 ? 2014 : selectedYear + 1;
        onYearChange(nextYear);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, selectedYear, onYearChange]);

  const handleSliderChange = (e) => {
    onYearChange(parseInt(e.target.value, 10));
  };

  const handleYearClick = (year) => {
    onYearChange(year);
  };

  const progress = ((selectedYear - 2014) / 10) * 100;

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
            min="2014"
            max="2024"
            value={selectedYear}
            onChange={handleSliderChange}
            className="slider-input"
          />
        </div>
      </div>

      <div className="year-markers">
        {years.map((year) => (
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
    </div>
  );
};

export default TemporalSlider;

