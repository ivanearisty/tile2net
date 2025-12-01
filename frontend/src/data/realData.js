/**
 * Real data loader for tile2net Grand Plaza output
 * Loads GeoJSON files and computes temporal changes with spatial tolerance
 */

// Cache for loaded data
const dataCache = {};
const manifestCache = { data: null };

// Tolerance settings for ML output comparison
const TOLERANCE = {
  // Distance in degrees (roughly 5 meters at NYC latitude)
  DISTANCE: 0.0005,
  // Length ratio tolerance (20% difference allowed)
  LENGTH_RATIO: 0.3,
  // Angle tolerance in degrees
  ANGLE: 15,
};

/**
 * Load the manifest file
 */
export async function loadManifest() {
  if (manifestCache.data) return manifestCache.data;
  
  try {
    const response = await fetch('/data/manifest.json');
    manifestCache.data = await response.json();
    return manifestCache.data;
  } catch (error) {
    console.error('Failed to load manifest:', error);
    return null;
  }
}

/**
 * Load network data for a specific year
 */
export async function loadNetworkData(year) {
  const cacheKey = `network_${year}`;
  if (dataCache[cacheKey]) return dataCache[cacheKey];
  
  try {
    const response = await fetch(`/data/network_${year}.geojson`);
    const data = await response.json();
    dataCache[cacheKey] = data;
    return data;
  } catch (error) {
    console.error(`Failed to load network data for ${year}:`, error);
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
    const data = await response.json();
    dataCache[cacheKey] = data;
    return data;
  } catch (error) {
    console.error(`Failed to load polygon data for ${year}:`, error);
    return null;
  }
}

/**
 * Calculate centroid of a LineString geometry
 */
function getCentroid(geometry) {
  if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
    return null;
  }
  
  const coords = geometry.coordinates;
  let sumX = 0, sumY = 0;
  
  for (const coord of coords) {
    sumX += coord[0];
    sumY += coord[1];
  }
  
  return [sumX / coords.length, sumY / coords.length];
}

/**
 * Calculate approximate length of a LineString in degrees
 */
function getApproxLength(geometry) {
  if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
    return 0;
  }
  
  let length = 0;
  const coords = geometry.coordinates;
  
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i-1][0];
    const dy = coords[i][1] - coords[i-1][1];
    length += Math.sqrt(dx * dx + dy * dy);
  }
  
  return length;
}

/**
 * Calculate bearing/angle of a LineString (start to end)
 */
function getBearing(geometry) {
  if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
    return 0;
  }
  
  const coords = geometry.coordinates;
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
 */
function areSimilarFeatures(f1, f2) {
  const centroid1 = getCentroid(f1.geometry);
  const centroid2 = getCentroid(f2.geometry);
  
  // Check centroid distance
  const dist = distance(centroid1, centroid2);
  if (dist > TOLERANCE.DISTANCE) {
    return false;
  }
  
  // Check length similarity
  const len1 = getApproxLength(f1.geometry);
  const len2 = getApproxLength(f2.geometry);
  const maxLen = Math.max(len1, len2);
  const minLen = Math.min(len1, len2);
  
  if (maxLen > 0 && (1 - minLen / maxLen) > TOLERANCE.LENGTH_RATIO) {
    return false;
  }
  
  // Check angle similarity
  const angle1 = getBearing(f1.geometry);
  const angle2 = getBearing(f2.geometry);
  let angleDiff = Math.abs(angle1 - angle2);
  
  // Normalize angle difference (lines can be in opposite directions)
  if (angleDiff > 90) angleDiff = 180 - angleDiff;
  
  if (angleDiff > TOLERANCE.ANGLE) {
    return false;
  }
  
  return true;
}

/**
 * Find a matching feature in a list using tolerance-based comparison
 */
function findMatchingFeature(feature, featureList, usedIndices) {
  const centroid = getCentroid(feature.geometry);
  if (!centroid) return -1;
  
  for (let i = 0; i < featureList.length; i++) {
    if (usedIndices.has(i)) continue;
    
    if (areSimilarFeatures(feature, featureList[i])) {
      return i;
    }
  }
  
  return -1;
}

/**
 * Compare two years and classify features as added, removed, or unchanged
 * Uses tolerance-based spatial comparison for ML output
 */
export async function compareYears(beforeYear, afterYear) {
  const beforeData = await loadNetworkData(beforeYear);
  const afterData = await loadNetworkData(afterYear);
  
  if (!beforeData || !afterData) {
    return { type: 'FeatureCollection', features: [] };
  }
  
  const beforeFeatures = beforeData.features;
  const afterFeatures = afterData.features;
  
  const resultFeatures = [];
  const matchedBeforeIndices = new Set();
  const matchedAfterIndices = new Set();
  
  // First pass: find matching features (unchanged)
  for (let i = 0; i < afterFeatures.length; i++) {
    const matchIndex = findMatchingFeature(afterFeatures[i], beforeFeatures, matchedBeforeIndices);
    
    if (matchIndex !== -1) {
      matchedBeforeIndices.add(matchIndex);
      matchedAfterIndices.add(i);
      
      // Use the "after" geometry but mark as unchanged
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
  
  // Second pass: features in "after" without match are "added"
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
  
  // Third pass: features in "before" without match are "removed"
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
  
  return {
    type: 'FeatureCollection',
    features: resultFeatures
  };
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
export async function generateMetricsFromRealData(availableYears) {
  const metricsData = [];
  let cumulativeFeatures = 0;
  
  for (const year of availableYears.sort((a, b) => a - b)) {
    const networkData = await loadNetworkData(year);
    const featureCount = networkData?.features?.length || 0;
    
    // Estimate changes from previous year if applicable
    const prevYear = availableYears.filter(y => y < year).sort((a, b) => b - a)[0];
    let added = 0;
    let removed = 0;
    let unchanged = 0;
    
    if (prevYear) {
      const comparison = await compareYears(prevYear, year);
      added = comparison.features.filter(f => f.properties.status === 'added').length;
      removed = comparison.features.filter(f => f.properties.status === 'removed').length;
      unchanged = comparison.features.filter(f => f.properties.status === 'unchanged').length;
    } else {
      unchanged = featureCount;
    }
    
    cumulativeFeatures = featureCount;
    
    metricsData.push({
      year,
      segments: featureCount,
      added,
      removed,
      unchanged,
      net: added - removed,
      totalSegments: cumulativeFeatures,
      // Placeholder estimates for length (would need actual geometry calculation)
      totalLength: featureCount * 50, // Rough estimate: 50m per segment
    });
  }
  
  return metricsData;
}
