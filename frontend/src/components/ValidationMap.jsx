import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../styles/ValidationMap.css';
import { getValidationGeoJSON } from '../data/referenceData';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const ValidationMap = ({ 
  validationResult,
  center = [-73.9695, 40.6744],
  zoom = 16,
  onClose
}) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [legendVisible, setLegendVisible] = useState(true);
  const [stats, setStats] = useState({
    truePositive: 0,
    falsePositive: 0,
    falseNegative: 0
  });

  // Store initial values in refs to avoid useEffect dependency issues
  const initialCenter = React.useRef(center);
  const initialZoom = React.useRef(zoom);

  // Initialize map
  useEffect(() => {
    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: initialCenter.current,
      zoom: initialZoom.current,
      pitch: 0,
      bearing: 0,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);

      // Add empty source
      map.current.addSource('validation-data', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add layers for each validation status
      addValidationLayers(map.current);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update data when validation result changes
  useEffect(() => {
    if (!mapLoaded || !map.current || !validationResult) return;

    const geoJSON = getValidationGeoJSON(validationResult);
    
    if (map.current.getSource('validation-data')) {
      map.current.getSource('validation-data').setData(geoJSON);
    }

    // Update stats
    setStats({
      truePositive: validationResult.truePositives,
      falsePositive: validationResult.falsePositives,
      falseNegative: validationResult.falseNegatives
    });

    // Fit to bounds if we have features
    if (geoJSON.features.length > 0) {
      fitToBounds(geoJSON);
    }
  }, [mapLoaded, validationResult]);

  const fitToBounds = (geoJSON) => {
    const bounds = new mapboxgl.LngLatBounds();
    
    geoJSON.features.forEach(feature => {
      if (feature.geometry.type === 'LineString') {
        feature.geometry.coordinates.forEach(coord => {
          bounds.extend(coord);
        });
      } else if (feature.geometry.type === 'Point') {
        bounds.extend(feature.geometry.coordinates);
      } else if (feature.geometry.type === 'Polygon') {
        feature.geometry.coordinates[0].forEach(coord => {
          bounds.extend(coord);
        });
      }
    });

    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 18
      });
    }
  };

  const addValidationLayers = (mapInstance) => {
    const lineWidth = [
      'interpolate', ['linear'], ['zoom'],
      10, 1, 14, 2, 17, 4, 20, 6
    ];

    // True Positives (correctly detected) - Green
    mapInstance.addLayer({
      id: 'validation-true-positive-line',
      type: 'line',
      source: 'validation-data',
      filter: ['all',
        ['==', ['get', 'validation_status'], 'true_positive'],
        ['==', ['geometry-type'], 'LineString']
      ],
      paint: {
        'line-color': '#4CAF50',
        'line-width': lineWidth,
        'line-opacity': 0.9
      }
    });

    mapInstance.addLayer({
      id: 'validation-true-positive-point',
      type: 'circle',
      source: 'validation-data',
      filter: ['all',
        ['==', ['get', 'validation_status'], 'true_positive'],
        ['==', ['geometry-type'], 'Point']
      ],
      paint: {
        'circle-color': '#4CAF50',
        'circle-radius': 6,
        'circle-opacity': 0.9,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });

    // False Positives (detected but not in reference) - Orange
    mapInstance.addLayer({
      id: 'validation-false-positive-line',
      type: 'line',
      source: 'validation-data',
      filter: ['all',
        ['==', ['get', 'validation_status'], 'false_positive'],
        ['==', ['geometry-type'], 'LineString']
      ],
      paint: {
        'line-color': '#FF9800',
        'line-width': lineWidth,
        'line-opacity': 0.9
      }
    });

    mapInstance.addLayer({
      id: 'validation-false-positive-point',
      type: 'circle',
      source: 'validation-data',
      filter: ['all',
        ['==', ['get', 'validation_status'], 'false_positive'],
        ['==', ['geometry-type'], 'Point']
      ],
      paint: {
        'circle-color': '#FF9800',
        'circle-radius': 6,
        'circle-opacity': 0.9,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });

    // False Negatives (in reference but not detected) - Red
    mapInstance.addLayer({
      id: 'validation-false-negative-line',
      type: 'line',
      source: 'validation-data',
      filter: ['all',
        ['==', ['get', 'validation_status'], 'false_negative'],
        ['==', ['geometry-type'], 'LineString']
      ],
      paint: {
        'line-color': '#F44336',
        'line-width': lineWidth,
        'line-opacity': 0.7,
        'line-dasharray': [2, 2]
      }
    });

    mapInstance.addLayer({
      id: 'validation-false-negative-point',
      type: 'circle',
      source: 'validation-data',
      filter: ['all',
        ['==', ['get', 'validation_status'], 'false_negative'],
        ['==', ['geometry-type'], 'Point']
      ],
      paint: {
        'circle-color': '#F44336',
        'circle-radius': 6,
        'circle-opacity': 0.7,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
        'circle-stroke-dasharray': [2, 2]
      }
    });

    // Add click handlers for popup info
    const layers = [
      'validation-true-positive-line',
      'validation-true-positive-point',
      'validation-false-positive-line',
      'validation-false-positive-point',
      'validation-false-negative-line',
      'validation-false-negative-point'
    ];

    layers.forEach(layer => {
      mapInstance.on('click', layer, (e) => {
        const feature = e.features[0];
        const props = feature.properties;
        
        const statusLabel = {
          'true_positive': '✅ Correctly Detected',
          'false_positive': '⚠️ Detected (Not in Reference)',
          'false_negative': '❌ Missed (In Reference Only)'
        }[props.validation_status] || props.validation_status;

        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="validation-popup">
              <h4>${statusLabel}</h4>
              <div class="popup-details">
                ${props._source_layer ? `<p><strong>Layer:</strong> ${props._source_layer}</p>` : ''}
                ${props._source_year ? `<p><strong>Source Year:</strong> ${props._source_year}</p>` : ''}
                ${props.f_type ? `<p><strong>Type:</strong> ${props.f_type}</p>` : ''}
                ${props.class ? `<p><strong>Class:</strong> ${props.class}</p>` : ''}
              </div>
            </div>
          `)
          .addTo(mapInstance);
      });

      mapInstance.on('mouseenter', layer, () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });

      mapInstance.on('mouseleave', layer, () => {
        mapInstance.getCanvas().style.cursor = '';
      });
    });
  };

  const toggleLayer = (layerPrefix) => {
    const layers = [
      `validation-${layerPrefix}-line`,
      `validation-${layerPrefix}-point`
    ];

    layers.forEach(layerId => {
      if (map.current.getLayer(layerId)) {
        const visibility = map.current.getLayoutProperty(layerId, 'visibility');
        map.current.setLayoutProperty(
          layerId,
          'visibility',
          visibility === 'none' ? 'visible' : 'none'
        );
      }
    });
  };

  return (
    <div className="validation-map-container">
      <div className="validation-map-header">
        <h3>🗺️ Validation Map View</h3>
        <button className="close-button" onClick={onClose}>×</button>
      </div>

      <div ref={mapContainer} className="validation-map" />

      {legendVisible && (
        <div className="validation-legend">
          <h4>Validation Legend</h4>
          <div className="legend-items">
            <div 
              className="legend-item clickable"
              onClick={() => toggleLayer('true-positive')}
            >
              <span className="legend-color true-positive" />
              <span className="legend-label">True Positive</span>
              <span className="legend-count">{stats.truePositive}</span>
            </div>
            <div 
              className="legend-item clickable"
              onClick={() => toggleLayer('false-positive')}
            >
              <span className="legend-color false-positive" />
              <span className="legend-label">False Positive</span>
              <span className="legend-count">{stats.falsePositive}</span>
            </div>
            <div 
              className="legend-item clickable"
              onClick={() => toggleLayer('false-negative')}
            >
              <span className="legend-color false-negative" />
              <span className="legend-label">False Negative</span>
              <span className="legend-count">{stats.falseNegative}</span>
            </div>
          </div>
          <p className="legend-hint">Click to toggle layers</p>
        </div>
      )}

      <button 
        className="toggle-legend-button"
        onClick={() => setLegendVisible(!legendVisible)}
      >
        {legendVisible ? '◀' : '▶'}
      </button>
    </div>
  );
};

export default ValidationMap;
