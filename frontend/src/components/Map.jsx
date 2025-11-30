import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../styles/Map.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const Map = ({ geoData, selectedYear }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-73.9442, 40.6782], // Brooklyn center
      zoom: 12,
      pitch: 0,
      bearing: 0,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-left');
    map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

    map.current.on('load', () => {
      setMapLoaded(true);

      // Add empty source
      map.current.addSource('infrastructure', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Layer for unchanged infrastructure (gray)
      map.current.addLayer({
        id: 'infrastructure-unchanged',
        type: 'line',
        source: 'infrastructure',
        filter: ['==', ['get', 'status'], 'unchanged'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#6b7280',
          'line-width': 3,
          'line-opacity': 0.7
        }
      });

      // Layer for added infrastructure (green)
      map.current.addLayer({
        id: 'infrastructure-added',
        type: 'line',
        source: 'infrastructure',
        filter: ['==', ['get', 'status'], 'added'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#10b981',
          'line-width': 4,
          'line-opacity': 0.9
        }
      });

      // Layer for removed infrastructure (red)
      map.current.addLayer({
        id: 'infrastructure-removed',
        type: 'line',
        source: 'infrastructure',
        filter: ['==', ['get', 'status'], 'removed'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ef4444',
          'line-width': 4,
          'line-opacity': 0.9
        }
      });

      // Add hover effects
      map.current.on('mouseenter', 'infrastructure-added', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      
      map.current.on('mouseleave', 'infrastructure-added', () => {
        map.current.getCanvas().style.cursor = '';
      });

      // Popup on click
      const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        className: 'infrastructure-popup'
      });

      ['infrastructure-added', 'infrastructure-removed', 'infrastructure-unchanged'].forEach(layerId => {
        map.current.on('click', layerId, (e) => {
          const feature = e.features[0];
          const props = feature.properties;
          
          const statusColors = {
            added: '#10b981',
            removed: '#ef4444',
            unchanged: '#6b7280'
          };

          popup
            .setLngLat(e.lngLat)
            .setHTML(`
              <div class="popup-content">
                <div class="popup-header" style="border-left: 4px solid ${statusColors[props.status]}">
                  <span class="popup-type">${props.type.replace('_', ' ')}</span>
                  <span class="popup-status ${props.status}">${props.status}</span>
                </div>
                <div class="popup-details">
                  <p><strong>Neighborhood:</strong> ${props.neighborhood}</p>
                  <p><strong>Length:</strong> ${props.length}m</p>
                  <p><strong>Added:</strong> ${props.addedYear}</p>
                  ${props.removedYear ? `<p><strong>Removed:</strong> ${props.removedYear}</p>` : ''}
                </div>
              </div>
            `)
            .addTo(map.current);
        });
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update data when geoData changes
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const source = map.current.getSource('infrastructure');
    if (source && geoData) {
      source.setData(geoData);
    }
  }, [geoData, mapLoaded]);

  return (
    <div className="map-wrapper">
      <div ref={mapContainer} className="mapbox-container" />
    </div>
  );
};

export default Map;

