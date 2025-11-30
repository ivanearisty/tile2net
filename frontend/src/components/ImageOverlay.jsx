import React, { useState, useRef, useCallback, useEffect } from 'react';
import '../styles/ImageOverlay.css';

// Mock historical imagery URLs - in production, these would come from an API
const mockImagery = {
  2014: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/-73.9442,40.6782,13,0/800x600@2x?access_token=' + process.env.REACT_APP_MAPBOX_TOKEN,
  2016: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/-73.9442,40.6782,13,0/800x600@2x?access_token=' + process.env.REACT_APP_MAPBOX_TOKEN,
  2018: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/-73.9442,40.6782,13,0/800x600@2x?access_token=' + process.env.REACT_APP_MAPBOX_TOKEN,
  2020: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/-73.9442,40.6782,13,0/800x600@2x?access_token=' + process.env.REACT_APP_MAPBOX_TOKEN,
  2022: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/-73.9442,40.6782,13,0/800x600@2x?access_token=' + process.env.REACT_APP_MAPBOX_TOKEN,
  2024: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/-73.9442,40.6782,13,0/800x600@2x?access_token=' + process.env.REACT_APP_MAPBOX_TOKEN,
};

const ImageOverlay = ({ isOpen, onClose, beforeYear, afterYear, onYearChange }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingBefore, setLoadingBefore] = useState(true);
  const [loadingAfter, setLoadingAfter] = useState(true);
  const containerRef = useRef(null);

  const availableYears = [2014, 2016, 2018, 2020, 2022, 2024];

  const handleMouseDown = () => setIsDragging(true);
  
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Reset loading states when years change
  useEffect(() => {
    setLoadingBefore(true);
    setLoadingAfter(true);
  }, [beforeYear, afterYear]);

  if (!isOpen) return null;

  const getImageUrl = (year) => {
    // Find closest available year
    const closest = availableYears.reduce((prev, curr) => 
      Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev
    );
    return mockImagery[closest];
  };

  return (
    <div className="image-overlay-backdrop" onClick={onClose}>
      <div className="image-overlay-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Historical Imagery Comparison</h2>
          <button className="close-button" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="year-selectors">
          <div className="year-selector">
            <label>Before</label>
            <select 
              value={beforeYear} 
              onChange={(e) => onYearChange('before', parseInt(e.target.value))}
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className="year-selector">
            <label>After</label>
            <select 
              value={afterYear} 
              onChange={(e) => onYearChange('after', parseInt(e.target.value))}
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="image-compare-container" ref={containerRef}>
          {/* Loading indicators */}
          {(loadingBefore || loadingAfter) && (
            <div className="loading-overlay">
              <div className="loading-spinner" />
              <span>Loading imagery...</span>
            </div>
          )}

          {/* Before image (clipped) */}
          <div 
            className="compare-image before"
            style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
          >
            <img 
              src={getImageUrl(beforeYear)} 
              alt={`Brooklyn ${beforeYear}`}
              onLoad={() => setLoadingBefore(false)}
            />
            <div className="image-year-label left">{beforeYear}</div>
          </div>

          {/* After image */}
          <div className="compare-image after">
            <img 
              src={getImageUrl(afterYear)} 
              alt={`Brooklyn ${afterYear}`}
              onLoad={() => setLoadingAfter(false)}
            />
            <div className="image-year-label right">{afterYear}</div>
          </div>

          {/* Slider */}
          <div 
            className={`image-slider ${isDragging ? 'dragging' : ''}`}
            style={{ left: `${sliderPosition}%` }}
            onMouseDown={handleMouseDown}
          >
            <div className="slider-line" />
            <div className="slider-handle">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l-6-7zm8 0v14l6-7z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <p className="imagery-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            Satellite imagery courtesy of Mapbox. Drag the slider to compare different years.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ImageOverlay;

