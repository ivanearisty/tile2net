/**
 * Utility functions for persisting map position across page reloads
 */

const STORAGE_KEY = 'tile2net_map_position';

/**
 * Save map position to localStorage
 * @param {Object} position - Map position object with center, zoom, bearing, pitch
 */
export function saveMapPosition(position) {
  try {
    const positionData = {
      center: position.center ? [position.center.lng, position.center.lat] : position.center,
      zoom: position.zoom,
      bearing: position.bearing || 0,
      pitch: position.pitch || 0,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positionData));
  } catch (error) {
    console.warn('Failed to save map position:', error);
  }
}

/**
 * Load map position from localStorage
 * @returns {Object|null} Map position object or null if not found/invalid
 */
export function loadMapPosition() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const positionData = JSON.parse(stored);
    
    // Validate the data structure
    if (!positionData.center || !Array.isArray(positionData.center) || positionData.center.length !== 2) {
      return null;
    }
    
    if (typeof positionData.zoom !== 'number' || positionData.zoom < 0 || positionData.zoom > 22) {
      return null;
    }
    
    return {
      center: positionData.center,
      zoom: positionData.zoom,
      bearing: positionData.bearing || 0,
      pitch: positionData.pitch || 0
    };
  } catch (error) {
    console.warn('Failed to load map position:', error);
    return null;
  }
}

/**
 * Clear saved map position
 */
export function clearMapPosition() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear map position:', error);
  }
}

