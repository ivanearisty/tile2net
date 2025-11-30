import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../styles/CompareMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const CompareMap = ({ leftYear, rightYear, leftData, rightData }) => {
  const containerRef = useRef(null);
  const leftMapContainer = useRef(null);
  const rightMapContainer = useRef(null);
  const leftMap = useRef(null);
  const rightMap = useRef(null);
  const isSyncing = useRef(false); // Flag to prevent infinite sync loop
  
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState({ left: false, right: false });

  // Initialize maps
  useEffect(() => {
    if (leftMap.current || rightMap.current) return;

    const mapConfig = {
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [-73.9442, 40.6782],
      zoom: 13,
      pitch: 0,
      bearing: 0,
    };

    // Left map (before)
    leftMap.current = new mapboxgl.Map({
      container: leftMapContainer.current,
      ...mapConfig,
    });

    // Right map (after)
    rightMap.current = new mapboxgl.Map({
      container: rightMapContainer.current,
      ...mapConfig,
    });

    // Add controls to right map only
    rightMap.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Setup left map
    leftMap.current.on('load', () => {
      setMapsLoaded(prev => ({ ...prev, left: true }));
      
      leftMap.current.addSource('infrastructure-left', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      addInfrastructureLayers(leftMap.current, 'left');
    });

    // Setup right map
    rightMap.current.on('load', () => {
      setMapsLoaded(prev => ({ ...prev, right: true }));
      
      rightMap.current.addSource('infrastructure-right', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      addInfrastructureLayers(rightMap.current, 'right');
    });

    // Sync map movements with guard against infinite loop
    const syncFromLeft = () => {
      if (isSyncing.current) return;
      if (!leftMap.current || !rightMap.current) return;
      
      isSyncing.current = true;
      rightMap.current.setCenter(leftMap.current.getCenter());
      rightMap.current.setZoom(leftMap.current.getZoom());
      rightMap.current.setBearing(leftMap.current.getBearing());
      rightMap.current.setPitch(leftMap.current.getPitch());
      isSyncing.current = false;
    };

    const syncFromRight = () => {
      if (isSyncing.current) return;
      if (!leftMap.current || !rightMap.current) return;
      
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
    };
  }, []);

  const addInfrastructureLayers = (map, side) => {
    const sourceId = `infrastructure-${side}`;

    map.addLayer({
      id: `infrastructure-unchanged-${side}`,
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'status'], 'unchanged'],
      paint: {
        'line-color': '#6b7280',
        'line-width': 3,
        'line-opacity': 0.8
      }
    });

    map.addLayer({
      id: `infrastructure-added-${side}`,
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'status'], 'added'],
      paint: {
        'line-color': '#10b981',
        'line-width': 4,
        'line-opacity': 0.9
      }
    });

    map.addLayer({
      id: `infrastructure-removed-${side}`,
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'status'], 'removed'],
      paint: {
        'line-color': '#ef4444',
        'line-width': 4,
        'line-opacity': 0.9
      }
    });
  };

  // Update data when it changes
  useEffect(() => {
    if (mapsLoaded.left && leftMap.current && leftData) {
      const source = leftMap.current.getSource('infrastructure-left');
      if (source) source.setData(leftData);
    }
  }, [leftData, mapsLoaded.left]);

  useEffect(() => {
    if (mapsLoaded.right && rightMap.current && rightData) {
      const source = rightMap.current.getSource('infrastructure-right');
      if (source) source.setData(rightData);
    }
  }, [rightData, mapsLoaded.right]);

  // Slider drag handling
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(10, Math.min(90, (x / rect.width) * 100));
      setSliderPosition(percentage);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e) => {
      if (!isDragging || !containerRef.current) return;
      
      const touch = e.touches[0];
      const rect = containerRef.current.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const percentage = Math.max(10, Math.min(90, (x / rect.width) * 100));
      setSliderPosition(percentage);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="compare-map-container" ref={containerRef}>
      {/* Left map (clipped) */}
      <div 
        className="compare-map-wrapper left"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <div ref={leftMapContainer} className="compare-map" />
        <div className="year-label left">{leftYear}</div>
      </div>

      {/* Right map (full, underneath) */}
      <div className="compare-map-wrapper right">
        <div ref={rightMapContainer} className="compare-map" />
        <div className="year-label right">{rightYear}</div>
      </div>

      {/* Slider handle */}
      <div 
        className={`compare-slider ${isDragging ? 'dragging' : ''}`}
        style={{ left: `${sliderPosition}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        <div className="slider-line" />
        <div className="slider-handle">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l-6-7zm8 0v14l6-7z" />
          </svg>
        </div>
      </div>

      {/* Instructions overlay */}
      <div className="compare-instructions">
        <span>← Drag to compare →</span>
      </div>
    </div>
  );
};

export default CompareMap;
