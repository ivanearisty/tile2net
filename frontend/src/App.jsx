import React, { useState, useCallback } from 'react';
import Map from './components/Map';
import TemporalSlider from './components/TemporalSlider';
import MetricsDashboard from './components/MetricsDashboard';
import ChangeSummary from './components/ChangeSummary';
import { getDataForYear, getSummaryForYear, metricsData } from './data/mockData';
import './styles/App.css';

function App() {
  const [selectedYear, setSelectedYear] = useState(2024);
  const [geoData, setGeoData] = useState(() => getDataForYear(2024));
  const [summary, setSummary] = useState(() => getSummaryForYear(2024));
  const [isPlaying, setIsPlaying] = useState(false);

  const handleYearChange = useCallback((year) => {
    setSelectedYear(year);
    setGeoData(getDataForYear(year));
    setSummary(getSummaryForYear(year));
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  return (
    <div className="app-container">
      <div className="map-section">
        <Map geoData={geoData} selectedYear={selectedYear} />
        <div className="map-overlay">
          <div className="year-badge">{selectedYear}</div>
        </div>
      </div>
      
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1 className="app-title">Brooklyn Pedestrian Infrastructure</h1>
          <p className="app-subtitle">Temporal Analysis 2014–2024</p>
        </header>

        <section className="slider-section">
          <TemporalSlider
            selectedYear={selectedYear}
            onYearChange={handleYearChange}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
          />
        </section>

        <section className="summary-section">
          <ChangeSummary summary={summary} year={selectedYear} />
        </section>

        <section className="metrics-section">
          <MetricsDashboard data={metricsData} selectedYear={selectedYear} />
        </section>

        <footer className="sidebar-footer">
          <div className="legend">
            <h4>Legend</h4>
            <div className="legend-items">
              <div className="legend-item">
                <span className="legend-color added"></span>
                <span>Added</span>
              </div>
              <div className="legend-item">
                <span className="legend-color removed"></span>
                <span>Removed</span>
              </div>
              <div className="legend-item">
                <span className="legend-color unchanged"></span>
                <span>Unchanged</span>
              </div>
            </div>
          </div>
        </footer>
      </aside>
    </div>
  );
}

export default App;

