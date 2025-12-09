import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { saveMapPosition, loadMapPosition } from '../utils/mapPosition';
import '../styles/Map.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  streets: 'mapbox://styles/mapbox/streets-v12',
  light: 'mapbox://styles/mapbox/light-v11',
};

const Map = ({ geoData, selectedYear, center = [-73.9695, 40.6744], zoom = 17, enabledTypes = { sidewalk: true, crosswalk: true, road: true } }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const popup = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentStyle, setCurrentStyle] = useState('dark');
  const geoDataRef = useRef(geoData);
  
  // Load saved position or use provided props
  const savedPosition = loadMapPosition();
  const initialCenter = useRef(savedPosition?.center || center);
  const initialZoom = useRef(savedPosition?.zoom || zoom);
  const initialBearing = useRef(savedPosition?.bearing || 0);
  const initialPitch = useRef(savedPosition?.pitch || 0);
  
  // Debounce timer for saving position
  const savePositionTimeout = useRef(null);

  // Keep geoData ref updated
  useEffect(() => {
    geoDataRef.current = geoData;
  }, [geoData]);

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

  // Add infrastructure layers to map
  const addInfrastructureLayers = useCallback(() => {
    if (!map.current) return;

    // Add source if it doesn't exist
    if (!map.current.getSource('infrastructure')) {
      map.current.addSource('infrastructure', {
        type: 'geojson',
        data: geoDataRef.current || { type: 'FeatureCollection', features: [] },
        // Performance optimizations for large datasets
        buffer: 128,           // Larger buffer reduces tile loading at edges
        tolerance: 0.5,        // Simplify geometries at lower zoom levels (rendering only, not data)
        maxzoom: 18,           // Prevent over-detailed tiles
        generateId: true       // Auto-generate feature IDs for better performance
      });
    }

    // Zoom-based line width: thinner when zoomed out, thicker when zoomed in
    const lineWidthUnchanged = [
      'interpolate', ['linear'], ['zoom'],
      10, 0.5,   // zoom 10: very thin
      14, 1.5,   // zoom 14: thin
      17, 3,     // zoom 17: normal
      20, 5      // zoom 20: thick
    ];
    
    const lineWidthHighlight = [
      'interpolate', ['linear'], ['zoom'],
      10, 0.75,  // zoom 10: slightly thicker than unchanged
      14, 2,     // zoom 14: visible
      17, 4,     // zoom 17: prominent
      20, 6      // zoom 20: very prominent
    ];

    // Layer for unchanged infrastructure
    if (!map.current.getLayer('infrastructure-unchanged')) {
      map.current.addLayer({
        id: 'infrastructure-unchanged',
        type: 'line',
        source: 'infrastructure',
        filter: buildTypeFilter(['==', ['get', 'status'], 'unchanged']),
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': currentStyle === 'satellite' ? '#ffffff' : '#94a3b8',
          'line-width': lineWidthUnchanged,
          'line-opacity': 0.85
        }
      });
    } else {
      // Update filter if layer exists
      map.current.setFilter('infrastructure-unchanged', buildTypeFilter(['==', ['get', 'status'], 'unchanged']));
    }

    // Layer for added infrastructure (green)
    if (!map.current.getLayer('infrastructure-added')) {
      map.current.addLayer({
        id: 'infrastructure-added',
        type: 'line',
        source: 'infrastructure',
        filter: buildTypeFilter(['==', ['get', 'status'], 'added']),
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#22c55e',
          'line-width': lineWidthHighlight,
          'line-opacity': 0.95
        }
      });
    } else {
      // Update filter if layer exists
      map.current.setFilter('infrastructure-added', buildTypeFilter(['==', ['get', 'status'], 'added']));
    }

    // Layer for removed infrastructure (red)
    if (!map.current.getLayer('infrastructure-removed')) {
      map.current.addLayer({
        id: 'infrastructure-removed',
        type: 'line',
        source: 'infrastructure',
        filter: buildTypeFilter(['==', ['get', 'status'], 'removed']),
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ef4444',
          'line-width': lineWidthHighlight,
          'line-opacity': 0.95
        }
      });
    } else {
      // Update filter if layer exists
      map.current.setFilter('infrastructure-removed', buildTypeFilter(['==', ['get', 'status'], 'removed']));
    }

    // Add hover effects
    ['infrastructure-added', 'infrastructure-removed', 'infrastructure-unchanged'].forEach(layerId => {
      map.current.on('mouseenter', layerId, () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', layerId, () => {
        map.current.getCanvas().style.cursor = '';
      });
    });

    // Click handler for popups
    ['infrastructure-added', 'infrastructure-removed', 'infrastructure-unchanged'].forEach(layerId => {
      map.current.on('click', layerId, (e) => {
        const feature = e.features[0];
        const props = feature.properties;
        
        const statusColors = {
          added: '#22c55e',
          removed: '#ef4444',
          unchanged: '#94a3b8'
        };

        const featureType = props.f_type || props.class || props.type || 'Infrastructure';
        const featureClass = props.class || props.f_type || '';
        const status = props.status || 'unchanged';
        const year = props.year || 'N/A';

        popup.current
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="popup-content">
              <div class="popup-header" style="border-left: 4px solid ${statusColors[status]}">
                <span class="popup-type">${featureType}</span>
                <span class="popup-status ${status}">${status}</span>
              </div>
              <div class="popup-details">
                ${featureClass ? `<p><strong>Class:</strong> ${featureClass}</p>` : ''}
                <p><strong>Year:</strong> ${year}</p>
                ${props.length ? `<p><strong>Length:</strong> ${parseFloat(props.length).toFixed(1)}m</p>` : ''}
                ${props.comparedFrom ? `<p><strong>Compared:</strong> ${props.comparedFrom} → ${props.comparedTo}</p>` : ''}
              </div>
            </div>
          `)
          .addTo(map.current);
      });
    });
  }, [currentStyle, buildTypeFilter]);

  // Update layer filters when enabledTypes changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    // Rebuild layers with updated filters
    addInfrastructureLayers();
  }, [enabledTypes, mapLoaded, addInfrastructureLayers]);

  // Initialize map only once
  useEffect(() => {
    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLES[currentStyle],
      center: initialCenter.current,
      zoom: initialZoom.current,
      pitch: initialPitch.current,
      bearing: initialBearing.current,
      // Performance optimizations
      antialias: false,        // Disable antialiasing for better performance
      fadeDuration: 0,         // Disable fade animations
      trackResize: true,
      refreshExpiredTiles: false,
      maxTileCacheSize: 100,   // Increase tile cache
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-left');
    map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

    popup.current = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
      className: 'infrastructure-popup'
    });

    map.current.on('load', () => {
      addInfrastructureLayers();
      setMapLoaded(true);
    });

    // Save map position when user moves/zooms the map
    const handleMapMove = () => {
      if (!map.current) return;
      
      // Debounce saves to avoid excessive localStorage writes
      if (savePositionTimeout.current) {
        clearTimeout(savePositionTimeout.current);
      }
      
      savePositionTimeout.current = setTimeout(() => {
        if (map.current) {
          saveMapPosition({
            center: map.current.getCenter(),
            zoom: map.current.getZoom(),
            bearing: map.current.getBearing(),
            pitch: map.current.getPitch()
          });
        }
      }, 500); // Save 500ms after user stops moving
    };

    map.current.on('moveend', handleMapMove);
    map.current.on('zoomend', handleMapMove);
    map.current.on('rotateend', handleMapMove);
    map.current.on('pitchend', handleMapMove);

    return () => {
      if (savePositionTimeout.current) {
        clearTimeout(savePositionTimeout.current);
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [addInfrastructureLayers, currentStyle]);

  // Handle style change
  const handleStyleChange = useCallback((newStyle) => {
    if (!map.current || newStyle === currentStyle) return;
    
    setCurrentStyle(newStyle);
    setMapLoaded(false);
    
    map.current.setStyle(MAP_STYLES[newStyle]);
    
    map.current.once('style.load', () => {
      addInfrastructureLayers();
      
      // Re-add data
      const source = map.current.getSource('infrastructure');
      if (source && geoDataRef.current) {
        source.setData(geoDataRef.current);
      }
      
      setMapLoaded(true);
    });
  }, [currentStyle, addInfrastructureLayers]);

  // Track if we've centered on data initially
  const hasCenteredOnData = useRef(false);
  const hasUsedSavedPosition = useRef(!!savedPosition);

  // Update data when geoData changes
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const source = map.current.getSource('infrastructure');
    if (source && geoData) {
      source.setData(geoData);
      
      // Only auto-fit to data if we don't have a saved position
      // This allows seamless transitions between map modes
      if (!hasUsedSavedPosition.current && !hasCenteredOnData.current && geoData.features && geoData.features.length > 0) {
        const bounds = calculateDataBounds(geoData);
        if (bounds) {
          map.current.fitBounds(bounds, {
            padding: 50,
            maxZoom: 18,
            duration: 1000
          });
          hasCenteredOnData.current = true;
        }
      }
    }
  }, [geoData, mapLoaded, calculateDataBounds]);

  return (
    <div className="map-wrapper">
      <div ref={mapContainer} className="mapbox-container" />
      
      {/* Style Toggle */}
      <div className="map-style-toggle">
        <button 
          className={`style-btn ${currentStyle === 'dark' ? 'active' : ''}`}
          onClick={() => handleStyleChange('dark')}
          title="Dark Mode"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
        <button 
          className={`style-btn ${currentStyle === 'satellite' ? 'active' : ''}`}
          onClick={() => handleStyleChange('satellite')}
          title="Satellite"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </button>
        <button 
          className={`style-btn ${currentStyle === 'streets' ? 'active' : ''}`}
          onClick={() => handleStyleChange('streets')}
          title="Streets"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
        <button 
          className={`style-btn ${currentStyle === 'light' ? 'active' : ''}`}
          onClick={() => handleStyleChange('light')}
          title="Light Mode"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Map;
