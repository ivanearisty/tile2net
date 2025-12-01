import React, { useState, useEffect } from 'react';
import '../styles/ValidationPanel.css';
import { 
  loadReferenceData, 
  getAvailableReferenceYears,
  validateAgainstReference,
  getSuggestedPairings
} from '../data/referenceData';
import { loadNetworkData } from '../data/realData';

const ValidationPanel = ({ 
  isOpen,
  onClose,
  availableDetectedYears = [2014, 2016, 2018],
  onValidationResult,
  onShowValidationMap
}) => {
  const [referenceYears, setReferenceYears] = useState([]);
  const [selectedDetectedYear, setSelectedDetectedYear] = useState(null);
  const [selectedReferenceYear, setSelectedReferenceYear] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [suggestedPairings, setSuggestedPairings] = useState([]);
  const [error, setError] = useState(null);

  // Load available reference years on mount
  useEffect(() => {
    async function loadReferenceYears() {
      const years = await getAvailableReferenceYears();
      setReferenceYears(years);
      
      if (years.length > 0 && availableDetectedYears.length > 0) {
        const pairings = getSuggestedPairings(availableDetectedYears, years);
        setSuggestedPairings(pairings);
        
        // Auto-select first pairing
        if (pairings.length > 0) {
          setSelectedDetectedYear(pairings[0].detected);
          setSelectedReferenceYear(pairings[0].reference);
        }
      }
    }
    
    loadReferenceYears();
  }, [availableDetectedYears]);

  const handleValidate = async () => {
    if (!selectedDetectedYear || !selectedReferenceYear) {
      setError('Please select both detected and reference years');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const [detectedData, referenceData] = await Promise.all([
        loadNetworkData(selectedDetectedYear),
        loadReferenceData(selectedReferenceYear)
      ]);

      if (!detectedData) {
        throw new Error(`No detected data available for ${selectedDetectedYear}`);
      }
      
      if (!referenceData) {
        throw new Error(`No reference data available for ${selectedReferenceYear}. Run the conversion script first.`);
      }

      const result = validateAgainstReference(detectedData, referenceData);
      setValidationResult(result);
      
      if (onValidationResult) {
        onValidationResult(result);
      }
    } catch (err) {
      setError(err.message);
    }

    setIsValidating(false);
  };

  const handleShowOnMap = () => {
    if (validationResult && onShowValidationMap) {
      onShowValidationMap(validationResult);
    }
  };

  const formatPercent = (value) => {
    return (value * 100).toFixed(1) + '%';
  };

  const getMatchQualityColor = (quality) => {
    switch (quality) {
      case 'good': return '#4CAF50';
      case 'moderate': return '#FF9800';
      case 'poor': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="validation-panel-overlay">
      <div className="validation-panel">
        <div className="validation-header">
          <h2>🔍 Validation & Analysis</h2>
          <p className="validation-subtitle">
            Compare tile2net detected infrastructure against NYC Planimetrics reference data
          </p>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="validation-content">
          {/* Year Selection */}
          <section className="year-selection">
            <h3>Select Years to Compare</h3>
            
            <div className="year-selectors">
              <div className="year-selector">
                <label>Detected Data (tile2net)</label>
                <select 
                  value={selectedDetectedYear || ''} 
                  onChange={(e) => setSelectedDetectedYear(parseInt(e.target.value))}
                >
                  <option value="">Select year...</option>
                  {availableDetectedYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="comparison-arrow">⟷</div>

              <div className="year-selector">
                <label>Reference Data (NYC Planimetrics)</label>
                <select 
                  value={selectedReferenceYear || ''} 
                  onChange={(e) => setSelectedReferenceYear(parseInt(e.target.value))}
                  disabled={referenceYears.length === 0}
                >
                  <option value="">
                    {referenceYears.length === 0 
                      ? 'No reference data available' 
                      : 'Select year...'}
                  </option>
                  {referenceYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Suggested Pairings */}
            {suggestedPairings.length > 0 && (
              <div className="suggested-pairings">
                <h4>Suggested Pairings</h4>
                <div className="pairing-chips">
                  {suggestedPairings.map((pairing, idx) => (
                    <button
                      key={idx}
                      className={`pairing-chip ${
                        selectedDetectedYear === pairing.detected && 
                        selectedReferenceYear === pairing.reference ? 'selected' : ''
                      }`}
                      onClick={() => {
                        setSelectedDetectedYear(pairing.detected);
                        setSelectedReferenceYear(pairing.reference);
                      }}
                      style={{ borderColor: getMatchQualityColor(pairing.matchQuality) }}
                    >
                      <span className="detected-year">{pairing.detected}</span>
                      <span className="arrow">→</span>
                      <span className="reference-year">{pairing.reference}</span>
                      {pairing.yearDiff > 0 && (
                        <span className="year-diff">({pairing.yearDiff}yr gap)</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button 
              className="validate-button"
              onClick={handleValidate}
              disabled={isValidating || !selectedDetectedYear || !selectedReferenceYear}
            >
              {isValidating ? 'Validating...' : 'Run Validation'}
            </button>

            {error && (
              <div className="error-message">
                ⚠️ {error}
              </div>
            )}
          </section>

          {/* Validation Results */}
          {validationResult && (
            <section className="validation-results">
              <h3>Validation Results</h3>
              
              <div className="metrics-grid">
                <div className="metric-card precision">
                  <div className="metric-value">{formatPercent(validationResult.precision)}</div>
                  <div className="metric-label">Precision</div>
                  <div className="metric-description">
                    Of detected features, how many are real
                  </div>
                </div>

                <div className="metric-card recall">
                  <div className="metric-value">{formatPercent(validationResult.recall)}</div>
                  <div className="metric-label">Recall</div>
                  <div className="metric-description">
                    Of real features, how many were detected
                  </div>
                </div>

                <div className="metric-card f1">
                  <div className="metric-value">{formatPercent(validationResult.f1Score)}</div>
                  <div className="metric-label">F1 Score</div>
                  <div className="metric-description">
                    Harmonic mean of precision and recall
                  </div>
                </div>
              </div>

              <div className="detailed-counts">
                <h4>Detailed Breakdown</h4>
                <div className="count-grid">
                  <div className="count-item true-positive">
                    <span className="count">{validationResult.truePositives}</span>
                    <span className="label">True Positives</span>
                    <span className="description">Correctly detected</span>
                  </div>
                  <div className="count-item false-positive">
                    <span className="count">{validationResult.falsePositives}</span>
                    <span className="label">False Positives</span>
                    <span className="description">Detected but not in reference</span>
                  </div>
                  <div className="count-item false-negative">
                    <span className="count">{validationResult.falseNegatives}</span>
                    <span className="label">False Negatives</span>
                    <span className="description">Missed detections</span>
                  </div>
                </div>
              </div>

              <div className="totals-summary">
                <div className="total-item">
                  <strong>{validationResult.totalDetected}</strong> features detected by tile2net
                </div>
                <div className="total-item">
                  <strong>{validationResult.totalReference}</strong> features in reference data
                </div>
              </div>

              <button 
                className="show-map-button"
                onClick={handleShowOnMap}
              >
                🗺️ Show on Map
              </button>
            </section>
          )}

          {/* Reference Data Info */}
          {referenceYears.length === 0 && (
            <section className="no-reference-data">
              <h3>⚠️ No Reference Data Available</h3>
              <p>
                To run validation, you need to convert the NYC Planimetrics data to GeoJSON format.
              </p>
              <div className="instructions">
                <h4>Setup Instructions:</h4>
                <ol>
                  <li>Navigate to the project root directory</li>
                  <li>Run: <code>python scripts/convert_planimetrics.py</code></li>
                  <li>Refresh this page</li>
                </ol>
              </div>
              <p className="note">
                Reference data years available: 1996, 2004, 2014, 2022
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default ValidationPanel;
