// Mock GeoJSON data for Brooklyn pedestrian infrastructure
// Simulates changes in sidewalks, crosswalks, and pedestrian paths over time

const generateLine = (startLat, startLng, segments = 3) => {
  const coords = [];
  let currentLat = startLat;
  let currentLng = startLng;
  
  for (let i = 0; i <= segments; i++) {
    coords.push([currentLng, currentLat]);
    currentLat += (Math.random() - 0.5) * 0.005;
    currentLng += (Math.random() - 0.5) * 0.005;
  }
  return coords;
};

// Brooklyn neighborhoods with approximate coordinates
const neighborhoods = [
  { name: 'Downtown Brooklyn', lat: 40.6930, lng: -73.9875 },
  { name: 'Park Slope', lat: 40.6720, lng: -73.9810 },
  { name: 'Williamsburg', lat: 40.7081, lng: -73.9571 },
  { name: 'DUMBO', lat: 40.7033, lng: -73.9881 },
  { name: 'Brooklyn Heights', lat: 40.6960, lng: -73.9936 },
  { name: 'Bedford-Stuyvesant', lat: 40.6872, lng: -73.9418 },
  { name: 'Crown Heights', lat: 40.6694, lng: -73.9422 },
  { name: 'Bushwick', lat: 40.6944, lng: -73.9213 },
  { name: 'Greenpoint', lat: 40.7282, lng: -73.9490 },
  { name: 'Cobble Hill', lat: 40.6860, lng: -73.9969 },
];

// Generate infrastructure features for each year
const generateYearlyData = () => {
  const years = {};
  let featureId = 1;
  
  // Track cumulative infrastructure
  const existingFeatures = [];
  
  for (let year = 2014; year <= 2024; year++) {
    const features = [];
    
    // Carry over unchanged features from previous year
    existingFeatures.forEach(feature => {
      features.push({
        ...feature,
        properties: {
          ...feature.properties,
          status: 'unchanged',
          year: feature.properties.addedYear,
        }
      });
    });
    
    // Add new infrastructure (3-8 new segments per year)
    const newCount = Math.floor(Math.random() * 6) + 3;
    for (let i = 0; i < newCount; i++) {
      const neighborhood = neighborhoods[Math.floor(Math.random() * neighborhoods.length)];
      const type = ['sidewalk', 'crosswalk', 'pedestrian_path', 'bike_lane'][Math.floor(Math.random() * 4)];
      
      const newFeature = {
        type: 'Feature',
        id: featureId++,
        geometry: {
          type: 'LineString',
          coordinates: generateLine(
            neighborhood.lat + (Math.random() - 0.5) * 0.02,
            neighborhood.lng + (Math.random() - 0.5) * 0.02,
            Math.floor(Math.random() * 4) + 2
          )
        },
        properties: {
          id: featureId,
          type: type,
          status: 'added',
          neighborhood: neighborhood.name,
          length: Math.floor(Math.random() * 500) + 100,
          addedYear: year,
          year: year,
        }
      };
      
      features.push(newFeature);
      existingFeatures.push(newFeature);
    }
    
    // Remove some infrastructure (0-3 removals per year after 2016)
    if (year > 2016) {
      const removeCount = Math.floor(Math.random() * 4);
      for (let i = 0; i < removeCount && existingFeatures.length > 10; i++) {
        const removeIndex = Math.floor(Math.random() * existingFeatures.length);
        const removedFeature = existingFeatures.splice(removeIndex, 1)[0];
        
        // Update the feature in this year's data to show as removed
        const featureIndex = features.findIndex(f => f.id === removedFeature.id);
        if (featureIndex !== -1) {
          features[featureIndex] = {
            ...features[featureIndex],
            properties: {
              ...features[featureIndex].properties,
              status: 'removed',
              removedYear: year,
            }
          };
        }
      }
    }
    
    years[year] = {
      type: 'FeatureCollection',
      features: features,
    };
  }
  
  return years;
};

// Generate metrics data for charts
export const generateMetricsData = () => {
  const data = [];
  let totalLength = 0;
  let totalSegments = 0;
  
  for (let year = 2014; year <= 2024; year++) {
    const added = Math.floor(Math.random() * 3000) + 1500;
    const removed = year > 2016 ? Math.floor(Math.random() * 800) : 0;
    const newSegments = Math.floor(Math.random() * 6) + 3;
    const removedSegments = year > 2016 ? Math.floor(Math.random() * 3) : 0;
    
    totalLength += added - removed;
    totalSegments += newSegments - removedSegments;
    
    data.push({
      year: year,
      added: added,
      removed: removed,
      net: added - removed,
      totalLength: totalLength,
      segments: totalSegments,
      sidewalks: Math.floor(totalSegments * 0.4),
      crosswalks: Math.floor(totalSegments * 0.25),
      pedestrianPaths: Math.floor(totalSegments * 0.2),
      bikeLanes: Math.floor(totalSegments * 0.15),
    });
  }
  
  return data;
};

// Pre-generate the data
export const yearlyGeoJSON = generateYearlyData();
export const metricsData = generateMetricsData();

// Get data for a specific year
export const getDataForYear = (year) => {
  return yearlyGeoJSON[year] || yearlyGeoJSON[2024];
};

// Get summary stats for a specific year
export const getSummaryForYear = (year) => {
  const data = yearlyGeoJSON[year];
  if (!data) return null;
  
  const stats = {
    total: data.features.length,
    added: data.features.filter(f => f.properties.status === 'added').length,
    removed: data.features.filter(f => f.properties.status === 'removed').length,
    unchanged: data.features.filter(f => f.properties.status === 'unchanged').length,
    byType: {},
    byNeighborhood: {},
    totalLength: 0,
  };
  
  data.features.forEach(feature => {
    const type = feature.properties.type;
    const neighborhood = feature.properties.neighborhood;
    
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    stats.byNeighborhood[neighborhood] = (stats.byNeighborhood[neighborhood] || 0) + 1;
    stats.totalLength += feature.properties.length || 0;
  });
  
  return stats;
};

