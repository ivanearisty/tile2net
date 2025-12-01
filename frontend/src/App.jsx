import React, { useState, useCallback, useEffect } from 'react';
import Map from './components/Map';
import CompareMap from './components/CompareMap';
import TemporalSlider from './components/TemporalSlider';
import MetricsDashboard from './components/MetricsDashboard';
import ChangeSummary from './components/ChangeSummary';
import CompareControls from './components/CompareControls';
import ImageOverlay from './components/ImageOverlay';
import ValidationPanel from './components/ValidationPanel';
import ValidationMap from './components/ValidationMap';
import { 
  loadManifest, 
  getDataForYear, 
  getSummaryFromData,
  generateMetricsFromRealData 
} from './data/realData';
import './styles/App.css';

function App() {
  // Data state
  const [manifest, setManifest] = useState(null);
  const [availableYears, setAvailableYears] = useState([2014, 2016, 2018]);
  const [mapCenter, setMapCenter] = useState([-73.9695, 40.6744]);
  const [mapZoom, setMapZoom] = useState(17);
  const [loading, setLoading] = useState(true);
  
  // Year selection
  const [selectedYear, setSelectedYear] = useState(2018);
  const [geoData, setGeoData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [metricsData, setMetricsData] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Compare mode state
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareLeftYear, setCompareLeftYear] = useState(2014);
  const [compareRightYear, setCompareRightYear] = useState(2018);
  const [leftData, setLeftData] = useState(null);
  const [rightData, setRightData] = useState(null);
  const [isImageOverlayOpen, setIsImageOverlayOpen] = useState(false);
  const [imageBeforeYear, setImageBeforeYear] = useState(2014);
  const [imageAfterYear, setImageAfterYear] = useState(2018);

  // Validation mode state
  const [isValidationPanelOpen, setIsValidationPanelOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [showValidationMap, setShowValidationMap] = useState(false);

  // Load manifest and initial data
  useEffect(() => {
    async function initializeApp() {
      setLoading(true);
      
      try {
        // Load manifest
        const manifestData = await loadManifest();
        if (manifestData) {
          setManifest(manifestData);
          setAvailableYears(manifestData.years);
          setMapCenter(manifestData.location.center);
          setMapZoom(manifestData.location.zoom);
          setSelectedYear(manifestData.years[manifestData.years.length - 1]);
          setCompareLeftYear(manifestData.years[0]);
          setCompareRightYear(manifestData.years[manifestData.years.length - 1]);
        }
        
        // Generate metrics
        const years = manifestData?.years || [2014, 2016, 2018];
        const metrics = await generateMetricsFromRealData(years);
        setMetricsData(metrics);
        
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
      
      setLoading(false);
    }
    
    initializeApp();
  }, []);

  // Load data when selected year changes
  useEffect(() => {
    async function loadYearData() {
      if (!availableYears.length) return;
      
      const data = await getDataForYear(selectedYear, availableYears);
      setGeoData(data);
      setSummary(getSummaryFromData(data));
    }
    
    loadYearData();
  }, [selectedYear, availableYears]);

  // Load compare mode data
  useEffect(() => {
    async function loadCompareData() {
      if (!isCompareMode) return;
      
      const [left, right] = await Promise.all([
        getDataForYear(compareLeftYear, availableYears),
        getDataForYear(compareRightYear, availableYears)
      ]);
      
      setLeftData(left);
      setRightData(right);
    }
    
    loadCompareData();
  }, [isCompareMode, compareLeftYear, compareRightYear, availableYears]);

  const handleYearChange = useCallback((year) => {
    // Find closest available year
    const closestYear = availableYears.reduce((prev, curr) => 
      Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev
    );
    setSelectedYear(closestYear);
  }, [availableYears]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleToggleCompare = useCallback(() => {
    setIsCompareMode(prev => !prev);
    setIsPlaying(false);
  }, []);

  const handleImageYearChange = useCallback((type, year) => {
    if (type === 'before') {
      setImageBeforeYear(year);
    } else {
      setImageAfterYear(year);
    }
  }, []);

  const handleValidationResult = useCallback((result) => {
    setValidationResult(result);
  }, []);

  const handleShowValidationMap = useCallback((result) => {
    setValidationResult(result);
    setShowValidationMap(true);
    setIsValidationPanelOpen(false);
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Loading data...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="map-section">
        {isCompareMode ? (
          <CompareMap 
            leftYear={compareLeftYear}
            rightYear={compareRightYear}
            leftData={leftData}
            rightData={rightData}
            center={mapCenter}
            zoom={mapZoom}
          />
        ) : (
          <>
            <Map 
              geoData={geoData} 
              selectedYear={selectedYear}
              center={mapCenter}
              zoom={mapZoom}
            />
            <div className="map-overlay">
              <div className="year-badge">{selectedYear}</div>
            </div>
          </>
        )}
      </div>
      
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1 className="app-title">{manifest?.name || 'Brooklyn Pedestrian Infrastructure'}</h1>
          <p className="app-subtitle">
            {manifest?.location?.name || 'Grand Plaza'} • {availableYears[0]}–{availableYears[availableYears.length - 1]}
          </p>
        </header>

        {/* Compare Controls */}
        <section className="compare-section">
          <CompareControls
            isCompareMode={isCompareMode}
            onToggleCompare={handleToggleCompare}
            leftYear={compareLeftYear}
            rightYear={compareRightYear}
            onLeftYearChange={setCompareLeftYear}
            onRightYearChange={setCompareRightYear}
            onOpenImageOverlay={() => setIsImageOverlayOpen(true)}
            availableYears={availableYears}
          />
        </section>

        {/* Validation Button */}
        <section className="validation-section">
          <button 
            className="validation-button"
            onClick={() => setIsValidationPanelOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="10" />
            </svg>
            Validate Against Reference Data
          </button>
          <p className="validation-hint">
            Compare detected infrastructure with NYC Planimetrics
          </p>
        </section>

        {/* Timeline slider - only in normal mode */}
        {!isCompareMode && (
          <section className="slider-section">
            <TemporalSlider
              selectedYear={selectedYear}
              onYearChange={handleYearChange}
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              availableYears={availableYears}
            />
          </section>
        )}

        <section className="summary-section">
          <ChangeSummary 
            summary={isCompareMode ? getSummaryFromData(rightData) : summary} 
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
          <p className="data-source">
            Data: tile2net • {geoData?.features?.length || 0} segments
          </p>
        </footer>
      </aside>

      {/* Image Comparison Overlay */}
      <ImageOverlay
        isOpen={isImageOverlayOpen}
        onClose={() => setIsImageOverlayOpen(false)}
        beforeYear={imageBeforeYear}
        afterYear={imageAfterYear}
        onYearChange={handleImageYearChange}
        availableYears={availableYears}
        center={mapCenter}
      />

      {/* Validation Panel */}
      <ValidationPanel
        isOpen={isValidationPanelOpen}
        onClose={() => setIsValidationPanelOpen(false)}
        availableDetectedYears={availableYears}
        onValidationResult={handleValidationResult}
        onShowValidationMap={handleShowValidationMap}
      />

      {/* Validation Map View */}
      {showValidationMap && validationResult && (
        <ValidationMap
          validationResult={validationResult}
          center={mapCenter}
          zoom={mapZoom}
          onClose={() => setShowValidationMap(false)}
        />
      )}
    </div>
  );
}

export default App;
