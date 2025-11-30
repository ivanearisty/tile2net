import React, { useState, useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../styles/ImageOverlay.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

// NYC Historical Imagery years available
const NYC_IMAGERY_YEARS = [2024, 2022, 2020, 2018, 2016, 2014, 2012, 2010, 2008, 2006, 2004, 2001, 1996, 1951, 1924];

// Get NYC imagery URL for a year (outside component to avoid recreating)
const getNycImageryUrl = (year) => {
  const closestYear = NYC_IMAGERY_YEARS.reduce((prev, curr) => 
    Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev
  );
  return `https://maps.nyc.gov/xyz/1.0.0/photo/${closestYear}/{z}/{x}/{y}.png8`;
};

const getClosestNycYear = (year) => {
  return NYC_IMAGERY_YEARS.reduce((prev, curr) => 
    Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev
  );
};

const ImageOverlay = ({ 
  isOpen, 
  onClose, 
  beforeYear, 
  afterYear, 
  onYearChange,
  center = [-73.9695, 40.6744]
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  
  const leftMapContainer = useRef(null);
  const rightMapContainer = useRef(null);
  const leftMap = useRef(null);
  const rightMap = useRef(null);
  const isSyncing = useRef(false);
  const [mapsReady, setMapsReady] = useState(false);

  // Add NYC imagery as raster layer
  const addNycImageryLayer = useCallback((map, year, id) => {
    if (!map) return;
    
    const sourceId = `nyc-imagery-${id}`;
    const layerId = `nyc-imagery-layer-${id}`;

    try {
      if (map.getSource(sourceId)) {
        map.removeLayer(layerId);
        map.removeSource(sourceId);
      }

      map.addSource(sourceId, {
        type: 'raster',
        tiles: [getNycImageryUrl(year)],
        tileSize: 256,
        attribution: '© NYC DoITT'
      });

      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': 1
        }
      });
    } catch (e) {
      console.warn('Error adding imagery layer:', e);
    }
  }, []);

  // Initialize maps when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (!leftMapContainer.current || !rightMapContainer.current) return;
    if (leftMap.current || rightMap.current) return;

    const mapConfig = {
      style: {
        version: 8,
        sources: {},
        layers: []
      },
      center: center,
      zoom: 17,
      maxZoom: 19,
    };

    let loadedCount = 0;
    const checkMapsReady = () => {
      loadedCount++;
      if (loadedCount >= 2) {
        setMapsReady(true);
      }
    };

    // Create left map (before)
    leftMap.current = new mapboxgl.Map({
      container: leftMapContainer.current,
      ...mapConfig,
    });

    // Create right map (after)
    rightMap.current = new mapboxgl.Map({
      container: rightMapContainer.current,
      ...mapConfig,
    });

    rightMap.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Setup left map with NYC imagery
    leftMap.current.on('load', () => {
      addNycImageryLayer(leftMap.current, beforeYear, 'before');
      checkMapsReady();
    });

    // Setup right map with NYC imagery
    rightMap.current.on('load', () => {
      addNycImageryLayer(rightMap.current, afterYear, 'after');
      checkMapsReady();
    });

    // Sync map movements
    const syncFromLeft = () => {
      if (isSyncing.current || !leftMap.current || !rightMap.current) return;
      isSyncing.current = true;
      rightMap.current.setCenter(leftMap.current.getCenter());
      rightMap.current.setZoom(leftMap.current.getZoom());
      rightMap.current.setBearing(leftMap.current.getBearing());
      rightMap.current.setPitch(leftMap.current.getPitch());
      isSyncing.current = false;
    };

    const syncFromRight = () => {
      if (isSyncing.current || !leftMap.current || !rightMap.current) return;
      isSyncing.current = true;
      leftMap.current.setCenter(rightMap.current.getCenter());
      leftMap.current.setZoom(rightMap.current.getZoom());
      leftMap.current.setBearing(rightMap.current.getBearing());
      leftMap.current.setPitch(rightMap.current.getPitch());
      isSyncing.current = false;
    };

    leftMap.current.on('move', syncFromLeft);
    rightMap.current.on('move', syncFromRight);

    return () => {
      if (leftMap.current) {
        leftMap.current.remove();
        leftMap.current = null;
      }
      if (rightMap.current) {
        rightMap.current.remove();
        rightMap.current = null;
      }
      setMapsReady(false);
    };
  }, [isOpen, center, beforeYear, afterYear, addNycImageryLayer]);

  // Update imagery when years change
  useEffect(() => {
    if (!mapsReady || !leftMap.current) return;
    addNycImageryLayer(leftMap.current, beforeYear, 'before');
  }, [beforeYear, mapsReady, addNycImageryLayer]);

  useEffect(() => {
    if (!mapsReady || !rightMap.current) return;
    addNycImageryLayer(rightMap.current, afterYear, 'after');
  }, [afterYear, mapsReady, addNycImageryLayer]);

  // Slider handling
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

  if (!isOpen) return null;

  return (
    <div className="image-overlay-backdrop" onClick={onClose}>
      <div className="image-overlay-modal large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>NYC Historical Aerial Imagery</h2>
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
              {NYC_IMAGERY_YEARS.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <span className="year-note">NYC imagery: {getClosestNycYear(beforeYear)}</span>
          </div>
          <div className="year-selector">
            <label>After</label>
            <select 
              value={afterYear} 
              onChange={(e) => onYearChange('after', parseInt(e.target.value))}
            >
              {NYC_IMAGERY_YEARS.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <span className="year-note">NYC imagery: {getClosestNycYear(afterYear)}</span>
          </div>
        </div>

        <div className="image-compare-container" ref={containerRef}>
          {/* Before map (clipped) */}
          <div 
            className="compare-image before"
            style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
          >
            <div ref={leftMapContainer} className="imagery-map" />
            <div className="image-year-label left">{getClosestNycYear(beforeYear)}</div>
          </div>

          {/* After map */}
          <div className="compare-image after">
            <div ref={rightMapContainer} className="imagery-map" />
            <div className="image-year-label right">{getClosestNycYear(afterYear)}</div>
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
            Historical aerial imagery from NYC DoITT. 
            Years: 1924, 1951, 1996, 2001, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024
          </p>
        </div>
      </div>
    </div>
  );
};

export default ImageOverlay;
