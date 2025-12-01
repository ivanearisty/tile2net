"""
Convert NYC Planimetrics 2014 and 2022 File Geodatabase data to GeoJSON
Uses Fiona to read ESRI File Geodatabase format
"""
import json
import math
from pathlib import Path
import fiona
from fiona.transform import transform_geom

# Paths
PLANIMETRICS_DIR = Path("NYC_Planimetrics_Historical_Data")
FRONTEND_DATA_DIR = Path("frontend/public/data/reference")

# Create output directory
FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)

# Year mappings to folder names
YEAR_FOLDERS = {
    2014: "NYC_Planimetrics_2014.gdb",
    2022: "NYC_Planimetrics_2022.gdb"
}

# Brooklyn bounding box for filtering (approximate)
# [min_lon, min_lat, max_lon, max_lat]
BROOKLYN_BBOX = [-74.05, 40.57, -73.83, 40.74]

def coords_in_bbox(geometry, bbox):
    """Check if geometry intersects with bbox"""
    min_lon, min_lat, max_lon, max_lat = bbox
    
    def check_coord(coord):
        if len(coord) >= 2:
            lon, lat = coord[0], coord[1]
            return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat
        return False
    
    def check_coords(coords):
        if not coords:
            return False
        if isinstance(coords[0], (int, float)):
            return check_coord(coords)
        return any(check_coords(c) for c in coords)
    
    try:
        geom_type = geometry.get('type', '')
        coords = geometry.get('coordinates', [])
        
        if geom_type == 'Point':
            return check_coord(coords)
        elif geom_type in ('LineString', 'MultiPoint'):
            return any(check_coord(c) for c in coords)
        elif geom_type in ('Polygon', 'MultiLineString'):
            return any(any(check_coord(c) for c in ring) for ring in coords)
        elif geom_type == 'MultiPolygon':
            return any(any(any(check_coord(c) for c in ring) for ring in poly) for poly in coords)
        return True
    except:
        return True

def convert_gdb_year(year, bbox=None):
    """Convert File Geodatabase for a given year"""
    folder = YEAR_FOLDERS.get(year)
    if not folder:
        print(f"Unknown year: {year}")
        return None
    
    gdb_path = PLANIMETRICS_DIR / folder
    if not gdb_path.exists():
        print(f"GDB not found: {gdb_path}")
        return None
    
    print(f"\n{'='*60}")
    print(f"Processing {year} data from {folder}")
    print('='*60)
    
    # List available layers
    layers = fiona.listlayers(str(gdb_path))
    print(f"Found {len(layers)} layers")
    
    # Relevant layers for pedestrian infrastructure
    relevant_keywords = [
        'sidewalk', 'crosswalk', 'pedestrian', 'curb', 
        'centerline', 'street', 'plaza', 'median',
        'path', 'walkway', 'pavement'
    ]
    
    all_features = []
    layers_info = []
    
    for layer_name in layers:
        # Check if layer name contains relevant keywords
        layer_lower = layer_name.lower()
        is_relevant = any(kw in layer_lower for kw in relevant_keywords)
        
        if not is_relevant:
            continue
        
        print(f"\n  Processing: {layer_name}")
        
        try:
            with fiona.open(str(gdb_path), layer=layer_name) as src:
                # Get source CRS
                src_crs = src.crs
                feature_count = 0
                
                for feature in src:
                    # Transform geometry to WGS84 if needed
                    geom = feature['geometry']
                    if geom is None:
                        continue
                    
                    # Convert fiona geometry to dict if needed
                    if hasattr(geom, '__geo_interface__'):
                        geom = dict(geom)
                    elif not isinstance(geom, dict):
                        geom = dict(geom)
                    
                    # Transform from source CRS to WGS84
                    if src_crs and str(src_crs).upper() != 'EPSG:4326':
                        try:
                            geom = transform_geom(src_crs, 'EPSG:4326', geom)
                            # Ensure result is a dict
                            if hasattr(geom, '__geo_interface__'):
                                geom = dict(geom)
                        except Exception as e:
                            continue
                    
                    # Filter by bbox if provided
                    if bbox and not coords_in_bbox(geom, bbox):
                        continue
                    
                    # Clean properties
                    props = {}
                    for k, v in feature['properties'].items():
                        if isinstance(v, (int, float, str, bool, type(None))):
                            props[k] = v
                        else:
                            props[k] = str(v)
                    
                    # Add metadata
                    props['_source_layer'] = layer_name
                    props['_source_year'] = year
                    props['_source'] = 'NYC_Planimetrics'
                    
                    all_features.append({
                        "type": "Feature",
                        "geometry": geom,
                        "properties": props
                    })
                    feature_count += 1
                
                if feature_count > 0:
                    layers_info.append({
                        "name": layer_name,
                        "feature_count": feature_count
                    })
                    print(f"    ✓ {feature_count} features (transformed to WGS84)")
                else:
                    print(f"    - No features in bbox")
                    
        except Exception as e:
            print(f"    ✗ Error: {e}")
    
    # Create combined GeoJSON
    combined = {
        "type": "FeatureCollection",
        "features": all_features,
        "metadata": {
            "source": "NYC Planimetrics Historical Data",
            "year": year,
            "layers": layers_info,
            "total_features": len(all_features)
        }
    }
    
    return combined

def save_geojson(data, output_path):
    """Save GeoJSON data to file"""
    with open(output_path, 'w') as f:
        json.dump(data, f)
    print(f"Saved: {output_path}")

def update_manifest():
    """Update manifest file with all available years"""
    manifest = {
        "name": "NYC Planimetrics Reference Data",
        "description": "Official NYC planimetrics data for validation",
        "available_years": [],
        "files": {}
    }
    
    for year in [1996, 2004, 2014, 2022]:
        file_path = FRONTEND_DATA_DIR / f"planimetrics_{year}.geojson"
        if file_path.exists():
            manifest["available_years"].append(year)
            manifest["files"][str(year)] = f"reference/planimetrics_{year}.geojson"
    
    manifest_path = FRONTEND_DATA_DIR / "manifest.json"
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f"\nUpdated manifest: {manifest_path}")
    print(f"Available years: {manifest['available_years']}")

def main():
    print("Converting NYC Planimetrics 2014 & 2022 (File Geodatabase) to GeoJSON")
    print("=" * 60)
    
    for year in [2014, 2022]:
        data = convert_gdb_year(year, bbox=BROOKLYN_BBOX)
        if data and data['features']:
            output_path = FRONTEND_DATA_DIR / f"planimetrics_{year}.geojson"
            save_geojson(data, output_path)
            print(f"  Total features for {year}: {len(data['features'])}")
        else:
            print(f"  No features extracted for {year}")
    
    # Update manifest
    update_manifest()
    
    print("\n" + "=" * 60)
    print("Conversion complete!")

if __name__ == "__main__":
    main()
