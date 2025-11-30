import React, { useState, useCallback, useMemo } from 'react';
import Map from './components/Map';
import CompareMap from './components/CompareMap';
import TemporalSlider from './components/TemporalSlider';
import MetricsDashboard from './components/MetricsDashboard';
import ChangeSummary from './components/ChangeSummary';
import CompareControls from './components/CompareControls';
import ImageOverlay from './components/ImageOverlay';
import { getDataForYear, getSummaryForYear, metricsData } from './data/mockData';
import './styles/App.css';

function App() {
  const [selectedYear, setSelectedYear] = useState(2024);
  const [geoData, setGeoData] = useState(() => getDataForYear(2024));
  const [summary, setSummary] = useState(() => getSummaryForYear(2024));
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Compare mode state
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareLeftYear, setCompareLeftYear] = useState(2014);
  const [compareRightYear, setCompareRightYear] = useState(2024);
  const [isImageOverlayOpen, setIsImageOverlayOpen] = useState(false);
  const [imageBeforeYear, setImageBeforeYear] = useState(2014);
  const [imageAfterYear, setImageAfterYear] = useState(2024);

  // Memoized data for compare mode
  const leftData = useMemo(() => getDataForYear(compareLeftYear), [compareLeftYear]);
  const rightData = useMemo(() => getDataForYear(compareRightYear), [compareRightYear]);

  const handleYearChange = useCallback((year) => {
    setSelectedYear(year);
    setGeoData(getDataForYear(year));
    setSummary(getSummaryForYear(year));
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleToggleCompare = useCallback(() => {
    setIsCompareMode(prev => !prev);
    setIsPlaying(false); // Stop auto-play when entering compare mode
  }, []);

  const handleImageYearChange = useCallback((type, year) => {
    if (type === 'before') {
      setImageBeforeYear(year);
    } else {
      setImageAfterYear(year);
    }
  }, []);

  return (
    <div className="app-container">
      <div className="map-section">
        {isCompareMode ? (
          <CompareMap 
            leftYear={compareLeftYear}
            rightYear={compareRightYear}
            leftData={leftData}
            rightData={rightData}
          />
        ) : (
          <>
            <Map geoData={geoData} selectedYear={selectedYear} />
            <div className="map-overlay">
              <div className="year-badge">{selectedYear}</div>
            </div>
          </>
        )}
      </div>
      
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1 className="app-title">Brooklyn Pedestrian Infrastructure</h1>
          <p className="app-subtitle">Temporal Analysis 2014–2024</p>
        </header>

        {/* Compare Controls - New Section */}
        <section className="compare-section">
          <CompareControls
            isCompareMode={isCompareMode}
            onToggleCompare={handleToggleCompare}
            leftYear={compareLeftYear}
            rightYear={compareRightYear}
            onLeftYearChange={setCompareLeftYear}
            onRightYearChange={setCompareRightYear}
            onOpenImageOverlay={() => setIsImageOverlayOpen(true)}
          />
        </section>

        {/* Regular timeline controls - hidden in compare mode */}
        {!isCompareMode && (
          <section className="slider-section">
            <TemporalSlider
              selectedYear={selectedYear}
              onYearChange={handleYearChange}
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
            />
          </section>
        )}

        <section className="summary-section">
          <ChangeSummary 
            summary={isCompareMode ? getSummaryForYear(compareRightYear) : summary} 
            year={isCompareMode ? compareRightYear : selectedYear} 
          />
        </section>

        <section className="metrics-section">
          <MetricsDashboard 
            data={metricsData} 
            selectedYear={isCompareMode ? compareRightYear : selectedYear} 
          />
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

      {/* Image Comparison Overlay */}
      <ImageOverlay
        isOpen={isImageOverlayOpen}
        onClose={() => setIsImageOverlayOpen(false)}
        beforeYear={imageBeforeYear}
        afterYear={imageAfterYear}
        onYearChange={handleImageYearChange}
      />
    </div>
  );
}

export default App;
