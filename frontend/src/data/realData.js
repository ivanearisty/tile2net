/**
 * Loads GeoJSON files and computes temporal changes with spatial tolerance
 */

// Cache for loaded data
const dataCache = {};
const manifestCache = { data: null };

// Expected behavior for pedestrian infrastructure
// Based on domain knowledge: infrastructure changes gradually (~5% per year)
const EXPECTED_CHANGE = {
  // Expected yearly change rate (5% is typical for urban infrastructure)
  YEARLY_RATE: 0.05,
  // Warning threshold - flag if change exceeds this multiplier of expected
  WARNING_MULTIPLIER: 3,
  // Critical threshold - something is likely wrong
  CRITICAL_MULTIPLIER: 6,
};

// Default tolerance settings for ML output comparison
// TUNED FOR STABILITY: Prefer matching over flagging changes
// Since real infrastructure changes ~5%/year, we want high match rates
const DEFAULT_TOLERANCE = {
  // Distance in degrees (roughly 25 meters at NYC latitude)
  // Larger distance accounts for slight georeferencing variations between years
  DISTANCE: 0.0025,
  // Length ratio tolerance (70% difference allowed)
  // ML segmentation can vary significantly in how it breaks up features
  LENGTH_RATIO: 0.70,
  // Angle tolerance in degrees (35°)
  // Allows for slight orientation variations in detection
  ANGLE: 35,
};

// Current active tolerance (can be modified via setTolerance)
let TOLERANCE = { ...DEFAULT_TOLERANCE };

// Tolerance change version for cache invalidation
let toleranceVersion = 0;

/**
 * Update tolerance settings and invalidate comparison cache
 */
export function setTolerance(newTolerance) {
  TOLERANCE = { ...DEFAULT_TOLERANCE, ...newTolerance };
  toleranceVersion++;
  
  // Clear comparison cache (but keep raw data cache)
  Object.keys(dataCache).forEach(key => {
    if (key.startsWith('compare_')) {
      delete dataCache[key];
    }
  });
  
  console.log('Tolerance updated:', TOLERANCE, 'Version:', toleranceVersion);
  return toleranceVersion;
}

/**
 * Get current tolerance settings
 */
export function getTolerance() {
  return { ...TOLERANCE };
}

/**
 * Get default tolerance settings
 */
export function getDefaultTolerance() {
  return { ...DEFAULT_TOLERANCE };
}

/**
 * Get expected change parameters
 */
export function getExpectedChange() {
  return { ...EXPECTED_CHANGE };
}

/**
 * Compute change quality metrics
 * Returns assessment of whether detected changes align with domain expectations
 */
export function assessChangeQuality(beforeCount, afterCount, unchanged, added, removed, yearsDiff = 1) {
  const totalBefore = beforeCount;
  const totalAfter = afterCount;
  
  // Calculate change rates
  const addRate = totalBefore > 0 ? added / totalBefore : 0;
  const removeRate = totalBefore > 0 ? removed / totalBefore : 0;
  const changeRate = totalBefore > 0 ? (added + removed) / totalBefore : 0;
  const matchRate = totalBefore > 0 ? unchanged / totalBefore : 0;
  
  // Expected change for the time period
  const expectedChange = EXPECTED_CHANGE.YEARLY_RATE * yearsDiff;
  const expectedChangeCapped = Math.min(expectedChange, 0.5); // Cap at 50% for very long periods
  
  // Assess quality
  const changeRatio = changeRate / expectedChangeCapped;
  
  let status = 'good';
  let message = 'Changes align with expected infrastructure evolution';
  
  if (changeRatio > EXPECTED_CHANGE.CRITICAL_MULTIPLIER) {
    status = 'critical';
    message = `Change rate (${(changeRate * 100).toFixed(1)}%) is ${changeRatio.toFixed(1)}x higher than expected. Consider increasing tolerance.`;
  } else if (changeRatio > EXPECTED_CHANGE.WARNING_MULTIPLIER) {
    status = 'warning';
    message = `Change rate (${(changeRate * 100).toFixed(1)}%) is higher than typical. May need tolerance adjustment.`;
  } else if (matchRate > 0.95) {
    status = 'excellent';
    message = `Excellent stability (${(matchRate * 100).toFixed(1)}% match rate)`;
  }
  
  return {
    status,
    message,
    metrics: {
      matchRate,
      changeRate,
      addRate,
      removeRate,
      expectedChange: expectedChangeCapped,
      changeRatio,
      yearsDiff
    }
  };
}

/**
 * Load the manifest file
 */
export async function loadManifest() {
  if (manifestCache.data) return manifestCache.data;
  
  try {
    const response = await fetch('/data/manifest.json');
    if (!response.ok) {
      console.error('Failed to load manifest: not found');
      return null;
    }
    manifestCache.data = await response.json();
    return manifestCache.data;
  } catch (error) {
    console.error('Failed to load manifest:', error);
    return null;
  }
}

/**
 * Load feature data for a specific year
 * Uses streaming JSON parse for large files
 * Prefers polygon data for consistent cross-year comparisons
 */
export async function loadNetworkData(year) {
  const cacheKey = `network_${year}`;
  if (dataCache[cacheKey]) return dataCache[cacheKey];
  
  try {
    console.log(`Loading data for ${year}...`);
    
    // Prefer polygon data for consistent comparisons across all years
    let response = await fetch(`/data/polygons_${year}.geojson`);
    let dataSource = 'polygons';
    
    // Fall back to network data if polygon data doesn't exist
    if (!response.ok) {
      console.log(`No polygon data for ${year}, trying network data...`);
      response = await fetch(`/data/network_${year}.geojson`);
      dataSource = 'network';
      
      if (!response.ok) {
        console.log(`No data available for ${year}`);
        return null;
      }
    }
    
    // For large files, parse in a non-blocking way
    const text = await response.text();
    
    // Use setTimeout to yield to the main thread during parse
    const data = await new Promise((resolve) => {
      setTimeout(() => {
        resolve(JSON.parse(text));
      }, 0);
    });
    
    console.log(`Loaded ${data.features?.length || 0} features for ${year} (from ${dataSource})`);
    dataCache[cacheKey] = data;
    return data;
  } catch (error) {
    console.error(`Failed to load data for ${year}:`, error);
    return null;
  }
}

/**
 * Load polygon data for a specific year
 */
export async function loadPolygonData(year) {
  const cacheKey = `polygons_${year}`;
  if (dataCache[cacheKey]) return dataCache[cacheKey];
  
  try {
    const response = await fetch(`/data/polygons_${year}.geojson`);
    if (!response.ok) {
      console.log(`No polygon data available for ${year}`);
      return null;
    }
    const data = await response.json();
    dataCache[cacheKey] = data;
    return data;
  } catch (error) {
    console.error(`Failed to load polygon data for ${year}:`, error);
    return null;
  }
}

/**
 * Get coordinate array from geometry (handles LineString and Polygon)
 */
function getCoords(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  
  // Polygon: coordinates are [[[lng, lat], ...], ...] - use outer ring
  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0];
  }
  // LineString: coordinates are [[lng, lat], ...]
  return geometry.coordinates;
}

/**
 * Calculate centroid of a geometry (LineString or Polygon)
 */
function getCentroid(geometry) {
  const coords = getCoords(geometry);
  if (!coords || coords.length === 0) {
    return null;
  }
  
  let sumX = 0, sumY = 0;
  
  for (const coord of coords) {
    sumX += coord[0];
    sumY += coord[1];
  }
  
  return [sumX / coords.length, sumY / coords.length];
}

/**
 * Calculate approximate length/perimeter of a geometry in degrees
 */
function getApproxLength(geometry) {
  const coords = getCoords(geometry);
  if (!coords || coords.length < 2) {
    return 0;
  }
  
  let length = 0;
  
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i-1][0];
    const dy = coords[i][1] - coords[i-1][1];
    length += Math.sqrt(dx * dx + dy * dy);
  }
  
  return length;
}

/**
 * Calculate bearing/angle of a geometry (start to end, or principal axis for polygons)
 */
function getBearing(geometry) {
  const coords = getCoords(geometry);
  if (!coords || coords.length < 2) {
    return 0;
  }
  
  // For polygons, use the longest edge to determine orientation
  if (geometry.type === 'Polygon') {
    let maxLen = 0;
    let bearing = 0;
    for (let i = 1; i < coords.length; i++) {
      const dx = coords[i][0] - coords[i-1][0];
      const dy = coords[i][1] - coords[i-1][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > maxLen) {
        maxLen = len;
        bearing = Math.atan2(dy, dx) * (180 / Math.PI);
      }
    }
    return bearing;
  }
  
  // For LineString, use start to end
  const start = coords[0];
  const end = coords[coords.length - 1];
  
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  
  return Math.atan2(dy, dx) * (180 / Math.PI);
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
 * Check if two features are similar within tolerance
 * @param {Object} f1 - First feature
 * @param {Object} f2 - Second feature  
 * @param {Object} tol - Tolerance settings (optional, uses global TOLERANCE if not provided)
 */
function areSimilarFeatures(f1, f2, tol = null) {
  const tolerance = tol || TOLERANCE;
  
  const centroid1 = getCentroid(f1.geometry);
  const centroid2 = getCentroid(f2.geometry);
  
  // Check centroid distance
  const dist = distance(centroid1, centroid2);
  if (dist > tolerance.DISTANCE) {
    return false;
  }
  
  // Check length similarity
  const len1 = getApproxLength(f1.geometry);
  const len2 = getApproxLength(f2.geometry);
  const maxLen = Math.max(len1, len2);
  const minLen = Math.min(len1, len2);
  
  if (maxLen > 0 && (1 - minLen / maxLen) > tolerance.LENGTH_RATIO) {
    return false;
  }
  
  // Check angle similarity
  const angle1 = getBearing(f1.geometry);
  const angle2 = getBearing(f2.geometry);
  let angleDiff = Math.abs(angle1 - angle2);
  
  // Normalize angle difference (lines can be in opposite directions)
  if (angleDiff > 90) angleDiff = 180 - angleDiff;
  
  if (angleDiff > tolerance.ANGLE) {
    return false;
  }
  
  return true;
}

// findMatchingFeature was replaced by spatial index approach in compareYears

/**
 * Core comparison function with explicit tolerance
 * Returns match statistics without building full result
 */
function runComparisonPass(beforeFeatures, afterFeatures, beforeIndex, tolerance) {
  const matchedBeforeIndices = new Set();
  const matchedAfterIndices = new Set();
  
  // Determine search radius based on tolerance
  const cellSize = Math.max(1, Math.ceil(tolerance.DISTANCE * 200));
  
  for (let i = 0; i < afterFeatures.length; i++) {
    const centroid = getCentroid(afterFeatures[i].geometry);
    if (!centroid) continue;
    
    const cellX = Math.floor(centroid[0] * 200);
    const cellY = Math.floor(centroid[1] * 200);
    
    let matchIndex = -1;
    for (let dx = -cellSize; dx <= cellSize && matchIndex === -1; dx++) {
      for (let dy = -cellSize; dy <= cellSize && matchIndex === -1; dy++) {
        const neighborKey = `${cellX + dx}_${cellY + dy}`;
        const candidates = beforeIndex.get(neighborKey) || [];
        
        for (const idx of candidates) {
          if (matchedBeforeIndices.has(idx)) continue;
          if (areSimilarFeatures(afterFeatures[i], beforeFeatures[idx], tolerance)) {
            matchIndex = idx;
            break;
          }
        }
      }
    }
    
    if (matchIndex !== -1) {
      matchedBeforeIndices.add(matchIndex);
      matchedAfterIndices.add(i);
    }
  }
  
  return { matchedBeforeIndices, matchedAfterIndices };
}

/**
 * Auto-calibrate tolerance to achieve realistic change rates
 * Based on domain knowledge: infrastructure changes ~5% per year
 * Aggressively relaxes tolerance to compensate for ML/imagery variations
 */
function autoCalibrateTolerance(beforeFeatures, afterFeatures, beforeIndex, yearsDiff) {
  const targetChangeRate = EXPECTED_CHANGE.YEARLY_RATE * yearsDiff;
  // Allow up to 15% change rate max, even for longer periods
  const maxAcceptableChange = Math.min(targetChangeRate * 2, 0.15);
  
  // Aggressive tolerance steps - go up to 10x for really problematic comparisons
  const steps = [1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 10.0];
  
  let bestResult = null;
  let bestTolerance = null;
  let bestDiff = Infinity;
  
  for (let i = 0; i < steps.length; i++) {
    const testTolerance = {
      // Distance: up to 50m at highest step
      DISTANCE: DEFAULT_TOLERANCE.DISTANCE * steps[i],
      // Length ratio: max 95% difference allowed at highest
      LENGTH_RATIO: Math.min(0.95, DEFAULT_TOLERANCE.LENGTH_RATIO + (steps[i] - 1) * 0.05),
      // Angle: max 80 degrees at highest (basically ignoring orientation)
      ANGLE: Math.min(80, DEFAULT_TOLERANCE.ANGLE + (steps[i] - 1) * 8),
    };
    
    const result = runComparisonPass(beforeFeatures, afterFeatures, beforeIndex, testTolerance);
    const unchanged = result.matchedAfterIndices.size;
    const added = afterFeatures.length - unchanged;
    const removed = beforeFeatures.length - result.matchedBeforeIndices.size;
    const changeRate = beforeFeatures.length > 0 ? (added + removed) / beforeFeatures.length : 0;
    
    // Track result closest to target
    const diff = Math.abs(changeRate - targetChangeRate);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestResult = { ...result, changeRate, unchanged, added, removed };
      bestTolerance = testTolerance;
    }
    
    // If we've achieved acceptable change rate, stop
    if (changeRate <= maxAcceptableChange) {
      console.log(`Auto-calibrated at step ${i + 1}: ${(changeRate * 100).toFixed(1)}% change (target ≤${(maxAcceptableChange * 100).toFixed(0)}%)`);
      return { tolerance: testTolerance, result, stats: { unchanged, added, removed, changeRate } };
    }
  }
  
  // Return best result found (closest to target)
  console.log(`Auto-calibration best result: ${(bestResult.changeRate * 100).toFixed(1)}% change`);
  return { tolerance: bestTolerance, result: bestResult, stats: bestResult };
}

/**
 * Compare two years and classify features as added, removed, or unchanged
 * Uses auto-calibrating tolerance to ensure realistic change rates
 * Based on domain knowledge: pedestrian infrastructure changes ~5% per year
 */
export async function compareYears(beforeYear, afterYear) {
  const cacheKey = `compare_${beforeYear}_${afterYear}_v${toleranceVersion}`;
  if (dataCache[cacheKey]) return dataCache[cacheKey];
  
  const beforeData = await loadNetworkData(beforeYear);
  const afterData = await loadNetworkData(afterYear);
  
  if (!beforeData || !afterData) {
    return { type: 'FeatureCollection', features: [], calibration: null };
  }
  
  console.log(`Comparing ${beforeYear} (${beforeData.features.length}) vs ${afterYear} (${afterData.features.length})...`);
  
  const beforeFeatures = beforeData.features;
  const afterFeatures = afterData.features;
  const yearsDiff = Math.abs(afterYear - beforeYear);
  
  // Build spatial index for "before" features
  const beforeIndex = new Map();
  beforeFeatures.forEach((f, i) => {
    const centroid = getCentroid(f.geometry);
    if (centroid) {
      const cellKey = `${Math.floor(centroid[0] * 200)}_${Math.floor(centroid[1] * 200)}`;
      if (!beforeIndex.has(cellKey)) beforeIndex.set(cellKey, []);
      beforeIndex.get(cellKey).push(i);
    }
  });
  
  // Auto-calibrate tolerance for realistic change rates
  const { tolerance: calibratedTolerance, result: matchResult, stats } = 
    autoCalibrateTolerance(beforeFeatures, afterFeatures, beforeIndex, yearsDiff);
  
  const { matchedBeforeIndices, matchedAfterIndices } = matchResult;
  
  // Build result features
  const resultFeatures = [];
  
  // Unchanged features
  for (let i = 0; i < afterFeatures.length; i++) {
    if (matchedAfterIndices.has(i)) {
      resultFeatures.push({
        ...afterFeatures[i],
        properties: {
          ...afterFeatures[i].properties,
          status: 'unchanged',
          comparedFrom: beforeYear,
          comparedTo: afterYear,
        }
      });
    }
  }
  
  // Added features
  for (let i = 0; i < afterFeatures.length; i++) {
    if (!matchedAfterIndices.has(i)) {
      resultFeatures.push({
        ...afterFeatures[i],
        properties: {
          ...afterFeatures[i].properties,
          status: 'added',
          comparedFrom: beforeYear,
          comparedTo: afterYear,
        }
      });
    }
  }
  
  // Removed features
  for (let i = 0; i < beforeFeatures.length; i++) {
    if (!matchedBeforeIndices.has(i)) {
      resultFeatures.push({
        ...beforeFeatures[i],
        properties: {
          ...beforeFeatures[i].properties,
          status: 'removed',
          comparedFrom: beforeYear,
          comparedTo: afterYear,
        }
      });
    }
  }
  
  console.log(`Comparison complete: ${stats.unchanged} unchanged, ${stats.added} added, ${stats.removed} removed (${(stats.changeRate * 100).toFixed(1)}% change)`);
  
  const result = {
    type: 'FeatureCollection',
    features: resultFeatures,
    calibration: {
      tolerance: calibratedTolerance,
      stats,
      yearsDiff,
      expectedRate: EXPECTED_CHANGE.YEARLY_RATE * yearsDiff
    }
  };
  
  dataCache[cacheKey] = result;
  
  return result;
}

/**
 * Get data for a single year (all features marked as 'current')
 */
export async function getDataForYear(year, availableYears) {
  const networkData = await loadNetworkData(year);
  
  if (!networkData) {
    return { type: 'FeatureCollection', features: [] };
  }
  
  // If this is the first available year, everything is "unchanged" (baseline)
  const firstYear = Math.min(...availableYears);
  
  if (year === firstYear) {
    return {
      type: 'FeatureCollection',
      features: networkData.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          status: 'unchanged'
        }
      }))
    };
  }
  
  // Compare to previous available year
  const previousYear = availableYears
    .filter(y => y < year)
    .sort((a, b) => b - a)[0] || firstYear;
  
  return compareYears(previousYear, year);
}

/**
 * Get summary statistics for a year's data
 */
export function getSummaryFromData(geojsonData) {
  if (!geojsonData || !geojsonData.features) {
    return {
      total: 0,
      added: 0,
      removed: 0,
      unchanged: 0,
      byType: {},
      totalLength: 0
    };
  }
  
  const features = geojsonData.features;
  
  const stats = {
    total: features.length,
    added: features.filter(f => f.properties.status === 'added').length,
    removed: features.filter(f => f.properties.status === 'removed').length,
    unchanged: features.filter(f => f.properties.status === 'unchanged').length,
    byType: {},
    totalLength: 0
  };
  
  // Count by class/type if available
  features.forEach(feature => {
    const type = feature.properties.f_type || feature.properties.class || 'infrastructure';
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    
    // Estimate length if available
    if (feature.properties.length) {
      stats.totalLength += parseFloat(feature.properties.length) || 0;
    }
  });
  
  return stats;
}

/**
 * Generate metrics data for charts based on available years
 */
export async function generateMetricsFromRealData(availableYears, enabledTypes = { sidewalk: true, crosswalk: true, road: true }) {
  const metricsData = [];
  let cumulativeFeatures = 0;
  
  // Helper to check if a feature type is enabled
  const isTypeEnabled = (feature) => {
    const type = feature.properties.f_type || feature.properties.class || feature.properties.type || '';
    if (type === 'sidewalk') return enabledTypes.sidewalk !== false;
    if (type === 'crosswalk') return enabledTypes.crosswalk !== false;
    if (type === 'road') return enabledTypes.road !== false;
    // For unknown types, include them if at least one type is enabled
    return enabledTypes.sidewalk || enabledTypes.crosswalk || enabledTypes.road;
  };
  
  for (const year of availableYears.sort((a, b) => a - b)) {
    const networkData = await loadNetworkData(year);
    const allFeatures = networkData?.features || [];
    
    // Filter features by enabled types
    const filteredFeatures = allFeatures.filter(isTypeEnabled);
    const featureCount = filteredFeatures.length;
    
    // Estimate changes from previous year if applicable
    const prevYear = availableYears.filter(y => y < year).sort((a, b) => b - a)[0];
    let added = 0;
    let removed = 0;
    let unchanged = 0;
    let totalLength = 0;
    
    if (prevYear) {
      const comparison = await compareYears(prevYear, year);
      // Filter comparison features by enabled types
      const filteredComparison = comparison.features.filter(isTypeEnabled);
      added = filteredComparison.filter(f => f.properties.status === 'added').length;
      removed = filteredComparison.filter(f => f.properties.status === 'removed').length;
      unchanged = filteredComparison.filter(f => f.properties.status === 'unchanged').length;
      
      // Calculate total length from filtered features
      filteredComparison.forEach(feature => {
        if (feature.properties.length) {
          totalLength += parseFloat(feature.properties.length) || 0;
        }
      });
    } else {
      unchanged = featureCount;
      // Calculate total length from filtered features
      filteredFeatures.forEach(feature => {
        if (feature.properties.length) {
          totalLength += parseFloat(feature.properties.length) || 0;
        }
      });
    }
    
    cumulativeFeatures = featureCount;
    
    // If no length data, estimate from segment count
    if (totalLength === 0) {
      totalLength = featureCount * 50; // Rough estimate: 50m per segment
    }
    
    metricsData.push({
      year,
      segments: featureCount,
      added,
      removed,
      unchanged,
      net: added - removed,
      totalSegments: cumulativeFeatures,
      totalLength: totalLength,
    });
  }
  
  return metricsData;
}
