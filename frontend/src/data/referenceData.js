/**
 * Reference data loader for NYC Planimetrics validation
 * Compares tile2net detected infrastructure against official NYC data
 */

// Cache for loaded reference data
const referenceCache = {};
const referenceManifestCache = { data: null };

// Available reference years from NYC Planimetrics
export const REFERENCE_YEARS = [1996, 2004, 2014, 2022];

// Tolerance settings for validation comparison
const VALIDATION_TOLERANCE = {
  // Distance in degrees (roughly 10 meters at NYC latitude for reference comparison)
  DISTANCE: 0.0001,
  // Length ratio tolerance (30% difference allowed for reference matching)
  LENGTH_RATIO: 0.4,
  // Angle tolerance in degrees
  ANGLE: 20,
};

/**
 * Load reference data manifest
 */
export async function loadReferenceManifest() {
  if (referenceManifestCache.data) return referenceManifestCache.data;
  
  try {
    const response = await fetch('/data/reference/manifest.json');
    if (!response.ok) throw new Error('Reference manifest not found');
    referenceManifestCache.data = await response.json();
    return referenceManifestCache.data;
  } catch (error) {
    console.warn('Reference manifest not available:', error);
    return {
      name: "NYC Planimetrics Reference Data",
      available_years: [],
      files: {}
    };
  }
}

/**
 * Load reference data for a specific year
 */
export async function loadReferenceData(year) {
  const cacheKey = `reference_${year}`;
  if (referenceCache[cacheKey]) return referenceCache[cacheKey];
  
  try {
    const response = await fetch(`/data/reference/planimetrics_${year}.geojson`);
    if (!response.ok) throw new Error(`Reference data for ${year} not found`);
    const data = await response.json();
    referenceCache[cacheKey] = data;
    return data;
  } catch (error) {
    console.warn(`Failed to load reference data for ${year}:`, error);
    return null;
  }
}

/**
 * Get available reference years
 */
export async function getAvailableReferenceYears() {
  const manifest = await loadReferenceManifest();
  return manifest.available_years || [];
}

/**
 * Calculate centroid of a geometry
 */
function getCentroid(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  
  const coords = geometry.coordinates;
  
  if (geometry.type === 'Point') {
    return coords;
  } else if (geometry.type === 'LineString') {
    let sumX = 0, sumY = 0;
    for (const coord of coords) {
      sumX += coord[0];
      sumY += coord[1];
    }
    return [sumX / coords.length, sumY / coords.length];
  } else if (geometry.type === 'Polygon') {
    const ring = coords[0];
    let sumX = 0, sumY = 0;
    for (const coord of ring) {
      sumX += coord[0];
      sumY += coord[1];
    }
    return [sumX / ring.length, sumY / ring.length];
  }
  
  return null;
}

/**
 * Calculate approximate length of a geometry in degrees
 */
function getApproxLength(geometry) {
  if (!geometry || !geometry.coordinates) return 0;
  
  let length = 0;
  const coords = geometry.coordinates;
  
  if (geometry.type === 'LineString' && coords.length >= 2) {
    for (let i = 1; i < coords.length; i++) {
      const dx = coords[i][0] - coords[i-1][0];
      const dy = coords[i][1] - coords[i-1][1];
      length += Math.sqrt(dx * dx + dy * dy);
    }
  } else if (geometry.type === 'Polygon') {
    const ring = coords[0];
    for (let i = 1; i < ring.length; i++) {
      const dx = ring[i][0] - ring[i-1][0];
      const dy = ring[i][1] - ring[i-1][1];
      length += Math.sqrt(dx * dx + dy * dy);
    }
  }
  
  return length;
}

/**
 * Calculate distance between two points
 */
function distance(p1, p2) {
  if (!p1 || !p2) return Infinity;
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if detected feature matches a reference feature
 */
function isMatchingFeature(detected, reference) {
  const centroid1 = getCentroid(detected.geometry);
  const centroid2 = getCentroid(reference.geometry);
  
  const dist = distance(centroid1, centroid2);
  if (dist > VALIDATION_TOLERANCE.DISTANCE) {
    return false;
  }
  
  // Check length similarity if both are LineStrings
  if (detected.geometry.type === 'LineString' && reference.geometry.type === 'LineString') {
    const len1 = getApproxLength(detected.geometry);
    const len2 = getApproxLength(reference.geometry);
    const maxLen = Math.max(len1, len2);
    const minLen = Math.min(len1, len2);
    
    if (maxLen > 0 && (1 - minLen / maxLen) > VALIDATION_TOLERANCE.LENGTH_RATIO) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validate detected data against reference data
 * @param {Object} detectedData - GeoJSON from tile2net
 * @param {Object} referenceData - GeoJSON from NYC Planimetrics
 * @returns {Object} Validation results with precision/recall metrics
 */
export function validateAgainstReference(detectedData, referenceData) {
  if (!detectedData?.features || !referenceData?.features) {
    return {
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      matchedDetected: [],
      unmatchedDetected: [],
      unmatchedReference: []
    };
  }

  const detectedFeatures = detectedData.features;
  const referenceFeatures = referenceData.features;
  
  const matchedDetectedIndices = new Set();
  const matchedReferenceIndices = new Set();
  
  // Find matches between detected and reference
  for (let i = 0; i < detectedFeatures.length; i++) {
    for (let j = 0; j < referenceFeatures.length; j++) {
      if (matchedReferenceIndices.has(j)) continue;
      
      if (isMatchingFeature(detectedFeatures[i], referenceFeatures[j])) {
        matchedDetectedIndices.add(i);
        matchedReferenceIndices.add(j);
        break;
      }
    }
  }
  
  const truePositives = matchedDetectedIndices.size;
  const falsePositives = detectedFeatures.length - truePositives;
  const falseNegatives = referenceFeatures.length - matchedReferenceIndices.size;
  
  const precision = truePositives / (truePositives + falsePositives) || 0;
  const recall = truePositives / (truePositives + falseNegatives) || 0;
  const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
  
  // Categorize features for visualization
  const matchedDetected = detectedFeatures
    .filter((_, i) => matchedDetectedIndices.has(i))
    .map(f => ({
      ...f,
      properties: { ...f.properties, validation_status: 'true_positive' }
    }));
    
  const unmatchedDetected = detectedFeatures
    .filter((_, i) => !matchedDetectedIndices.has(i))
    .map(f => ({
      ...f,
      properties: { ...f.properties, validation_status: 'false_positive' }
    }));
    
  const unmatchedReference = referenceFeatures
    .filter((_, i) => !matchedReferenceIndices.has(i))
    .map(f => ({
      ...f,
      properties: { ...f.properties, validation_status: 'false_negative' }
    }));
  
  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1Score,
    matchedDetected,
    unmatchedDetected,
    unmatchedReference,
    totalDetected: detectedFeatures.length,
    totalReference: referenceFeatures.length
  };
}

/**
 * Get combined GeoJSON for validation visualization
 */
export function getValidationGeoJSON(validationResults) {
  return {
    type: 'FeatureCollection',
    features: [
      ...validationResults.matchedDetected,
      ...validationResults.unmatchedDetected,
      ...validationResults.unmatchedReference
    ]
  };
}

/**
 * Find best matching reference year for a detected year
 */
export function findBestReferenceYear(detectedYear, availableReferenceYears) {
  if (!availableReferenceYears.length) return null;
  
  // Find the closest reference year that's before or equal to detected year
  const beforeOrEqual = availableReferenceYears.filter(y => y <= detectedYear);
  if (beforeOrEqual.length) {
    return Math.max(...beforeOrEqual);
  }
  
  // Otherwise, find closest year
  return availableReferenceYears.reduce((prev, curr) => 
    Math.abs(curr - detectedYear) < Math.abs(prev - detectedYear) ? curr : prev
  );
}

/**
 * Get suggested year pairings for validation
 */
export function getSuggestedPairings(detectedYears, referenceYears) {
  const pairings = [];
  
  for (const detected of detectedYears) {
    const reference = findBestReferenceYear(detected, referenceYears);
    if (reference) {
      pairings.push({
        detected,
        reference,
        yearDiff: Math.abs(detected - reference),
        matchQuality: Math.abs(detected - reference) <= 2 ? 'good' : 
                      Math.abs(detected - reference) <= 5 ? 'moderate' : 'poor'
      });
    }
  }
  
  return pairings;
}
