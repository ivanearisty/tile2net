import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { saveMapPosition, loadMapPosition } from '../utils/mapPosition';
import '../styles/CompareMap.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const CompareMap = ({ 
  leftYear, 
  rightYear, 
  leftData, 
  rightData,
  center = [-73.9695, 40.6744],
  zoom = 17,
  enabledTypes = { sidewalk: true, crosswalk: true, road: true }
}) => {
  const containerRef = useRef(null);
  const leftMapContainer = useRef(null);
  const rightMapContainer = useRef(null);
  const leftMap = useRef(null);
  const rightMap = useRef(null);
  const isSyncing = useRef(false);
  
  // Load saved position or use provided props
  const savedPosition = loadMapPosition();
  const initialCenter = useRef(savedPosition?.center || center);
  const initialZoom = useRef(savedPosition?.zoom || zoom);
  const initialBearing = useRef(savedPosition?.bearing || 0);
  const initialPitch = useRef(savedPosition?.pitch || 0);
  
  // Debounce timer for saving position
  const savePositionTimeout = useRef(null);
  
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState({ left: false, right: false });

  // Initialize maps only once
  useEffect(() => {
    if (leftMap.current || rightMap.current) return;

    const mapConfig = {
      style: 'mapbox://styles/mapbox/dark-v11',
      center: initialCenter.current,
      zoom: initialZoom.current,
      pitch: initialPitch.current,
      bearing: initialBearing.current,
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

      // Layers will be added when enabledTypes is available
    });

    // Setup right map
    rightMap.current.on('load', () => {
      setMapsLoaded(prev => ({ ...prev, right: true }));
      
      rightMap.current.addSource('infrastructure-right', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Layers will be added when enabledTypes is available
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

    // Save map position when user moves/zooms (use right map as source of truth)
    const handleMapMove = () => {
      if (!rightMap.current) return;
      
      // Debounce saves to avoid excessive localStorage writes
      if (savePositionTimeout.current) {
        clearTimeout(savePositionTimeout.current);
      }
      
      savePositionTimeout.current = setTimeout(() => {
        if (rightMap.current) {
          saveMapPosition({
            center: rightMap.current.getCenter(),
            zoom: rightMap.current.getZoom(),
            bearing: rightMap.current.getBearing(),
            pitch: rightMap.current.getPitch()
          });
        }
      }, 500); // Save 500ms after user stops moving
    };

    rightMap.current.on('moveend', handleMapMove);
    rightMap.current.on('zoomend', handleMapMove);
    rightMap.current.on('rotateend', handleMapMove);
    rightMap.current.on('pitchend', handleMapMove);

    return () => {
      if (savePositionTimeout.current) {
        clearTimeout(savePositionTimeout.current);
      }
      if (leftMap.current) {
        leftMap.current.remove();
        leftMap.current = null;
      }
      if (rightMap.current) {
        rightMap.current.remove();
        rightMap.current = null;
      }
    };
  }, []); // Empty dependency array - only initialize once

  // Helper function to build type filter
  const buildTypeFilter = useCallback((statusFilter) => {
    const typeConditions = [];
    
    // Get feature type from properties (f_type, class, or type)
    const getFeatureType = ['coalesce', 
      ['get', 'f_type'],
      ['get', 'class'],
      ['get', 'type']
    ];
    
    if (enabledTypes.sidewalk) {
      typeConditions.push(['==', getFeatureType, 'sidewalk']);
    }
    if (enabledTypes.crosswalk) {
      typeConditions.push(['==', getFeatureType, 'crosswalk']);
    }
    if (enabledTypes.road) {
      typeConditions.push(['==', getFeatureType, 'road']);
    }
    
    // If no types are enabled, show nothing
    if (typeConditions.length === 0) {
      return ['literal', false];
    }
    
    // Combine status filter with type filter
    if (typeConditions.length === 1) {
      return ['all', statusFilter, typeConditions[0]];
    } else {
      return ['all', statusFilter, ['any', ...typeConditions]];
    }
  }, [enabledTypes]);

  const addInfrastructureLayers = useCallback((map, side) => {
    const sourceId = `infrastructure-${side}`;

    // Zoom-based line width
    const lineWidthUnchanged = [
      'interpolate', ['linear'], ['zoom'],
      10, 0.5, 14, 1.5, 17, 3, 20, 5
    ];
    const lineWidthHighlight = [
      'interpolate', ['linear'], ['zoom'],
      10, 0.75, 14, 2, 17, 4, 20, 6
    ];

    const unchangedLayerId = `infrastructure-unchanged-${side}`;
    const addedLayerId = `infrastructure-added-${side}`;
    const removedLayerId = `infrastructure-removed-${side}`;

    // Remove existing layers if they exist
    if (map.getLayer(unchangedLayerId)) {
      map.removeLayer(unchangedLayerId);
    }
    if (map.getLayer(addedLayerId)) {
      map.removeLayer(addedLayerId);
    }
    if (map.getLayer(removedLayerId)) {
      map.removeLayer(removedLayerId);
    }

    map.addLayer({
      id: unchangedLayerId,
      type: 'line',
      source: sourceId,
      filter: buildTypeFilter(['==', ['get', 'status'], 'unchanged']),
      paint: {
        'line-color': '#ffffff',
        'line-width': lineWidthUnchanged,
        'line-opacity': 0.85
      }
    });

    map.addLayer({
      id: addedLayerId,
      type: 'line',
      source: sourceId,
      filter: buildTypeFilter(['==', ['get', 'status'], 'added']),
      paint: {
        'line-color': '#22c55e',
        'line-width': lineWidthHighlight,
        'line-opacity': 0.95
      }
    });

    map.addLayer({
      id: removedLayerId,
      type: 'line',
      source: sourceId,
      filter: buildTypeFilter(['==', ['get', 'status'], 'removed']),
      paint: {
        'line-color': '#ef4444',
        'line-width': lineWidthHighlight,
        'line-opacity': 0.95
      }
    });
  }, [buildTypeFilter]);

  // Calculate bounds from GeoJSON data
  const calculateDataBounds = useCallback((data) => {
    if (!data || !data.features || data.features.length === 0) {
      return null;
    }

    const bounds = new mapboxgl.LngLatBounds();
    let hasCoordinates = false;

    data.features.forEach(feature => {
      if (!feature.geometry || !feature.geometry.coordinates) return;

      const coords = feature.geometry.coordinates;
      
      if (feature.geometry.type === 'Point') {
        bounds.extend(coords);
        hasCoordinates = true;
      } else if (feature.geometry.type === 'LineString') {
        coords.forEach(coord => {
          bounds.extend(coord);
          hasCoordinates = true;
        });
      } else if (feature.geometry.type === 'Polygon') {
        coords[0].forEach(coord => {
          bounds.extend(coord);
          hasCoordinates = true;
        });
      } else if (feature.geometry.type === 'MultiLineString') {
        coords.forEach(line => {
          line.forEach(coord => {
            bounds.extend(coord);
            hasCoordinates = true;
          });
        });
      } else if (feature.geometry.type === 'MultiPolygon') {
        coords.forEach(polygon => {
          polygon[0].forEach(coord => {
            bounds.extend(coord);
            hasCoordinates = true;
          });
        });
      }
    });

    if (hasCoordinates && !bounds.isEmpty()) {
      return bounds;
    }

    return null;
  }, []);

  // Track if we've centered on data initially
  const hasCenteredOnData = useRef({ left: false, right: false });
  const hasUsedSavedPosition = useRef(!!savedPosition);

  // Update data when it changes
  useEffect(() => {
    if (mapsLoaded.left && leftMap.current && leftData) {
      const source = leftMap.current.getSource('infrastructure-left');
      if (source) source.setData(leftData);
      
      // Only auto-fit to data if we don't have a saved position
      if (!hasUsedSavedPosition.current && !hasCenteredOnData.current.left && leftData.features && leftData.features.length > 0) {
        const bounds = calculateDataBounds(leftData);
        if (bounds) {
          leftMap.current.fitBounds(bounds, {
            padding: 50,
            maxZoom: 18,
            duration: 1000
          });
          hasCenteredOnData.current.left = true;
        }
      }
    }
  }, [leftData, mapsLoaded.left, calculateDataBounds]);

  useEffect(() => {
    if (mapsLoaded.right && rightMap.current && rightData) {
      const source = rightMap.current.getSource('infrastructure-right');
      if (source) source.setData(rightData);
      
      // Only auto-fit to data if we don't have a saved position
      if (!hasUsedSavedPosition.current && !hasCenteredOnData.current.right && rightData.features && rightData.features.length > 0) {
        const bounds = calculateDataBounds(rightData);
        if (bounds) {
          rightMap.current.fitBounds(bounds, {
            padding: 50,
            maxZoom: 18,
            duration: 1000
          });
          hasCenteredOnData.current.right = true;
        }
      }
    }
  }, [rightData, mapsLoaded.right, calculateDataBounds]);

  // Add layers when maps are loaded and update when enabledTypes changes
  useEffect(() => {
    if (!mapsLoaded.left || !mapsLoaded.right || !addInfrastructureLayers) return;
    
    if (leftMap.current) {
      addInfrastructureLayers(leftMap.current, 'left');
    }
    if (rightMap.current) {
      addInfrastructureLayers(rightMap.current, 'right');
    }
  }, [enabledTypes, mapsLoaded.left, mapsLoaded.right, addInfrastructureLayers]);

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
