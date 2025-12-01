"""
Convert tile2net shapefiles to GeoJSON for the frontend app
Uses pyshp library for shapefile reading

Updated to support bk_central_YYYY folder structure from new tile2net runs
"""
import json
import os
from pathlib import Path
import shapefile

# Paths
OUTPUT_DIR = Path("output")
FRONTEND_DATA_DIR = Path("frontend/public/data")

# Create output directory
FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)

def shapefile_to_geojson(shp_path):
    """Convert a shapefile to GeoJSON format"""
    sf = shapefile.Reader(str(shp_path))
    
    features = []
    fields = [field[0] for field in sf.fields[1:]]  # Skip DeletionFlag
    
    for sr in sf.shapeRecords():
        # Get geometry
        geom = sr.shape.__geo_interface__
        
        # Get properties
        props = dict(zip(fields, sr.record))
        
        # Clean up properties (convert to JSON-serializable types)
        clean_props = {}
        for k, v in props.items():
            if isinstance(v, (int, float, str, bool, type(None))):
                clean_props[k] = v
            else:
                clean_props[k] = str(v)
        
        feature = {
            "type": "Feature",
            "geometry": geom,
            "properties": clean_props
        }
        features.append(feature)
    
    return {
        "type": "FeatureCollection",
        "features": features
    }

def find_shapefile_in_dir(base_dir):
    """Find the first shapefile in a directory (handles nested timestamped folders)"""
    if not base_dir.exists():
        return None
    
    # Look for .shp files directly or in subdirectories
    for item in base_dir.iterdir():
        if item.is_dir():
            shp_files = list(item.glob("*.shp"))
            if shp_files:
                return shp_files[0]
        elif item.suffix == '.shp':
            return item
    
    return None

def discover_years():
    """Discover available years from the output folder"""
    years = []
    
    for folder in OUTPUT_DIR.iterdir():
        if folder.is_dir() and folder.name.startswith("bk_central_"):
            try:
                year = int(folder.name.split("_")[-1])
                years.append(year)
            except ValueError:
                continue
    
    return sorted(years)

# Discover years from output folder
years = discover_years()

if not years:
    print("No bk_central_YYYY folders found in output/")
    exit(1)

print("Converting tile2net shapefiles to GeoJSON...")
print("=" * 50)
print(f"Found years: {years}")

# Track successful conversions
converted_years = []
location_info = None

for year in years:
    # New folder structure: output/bk_central_YYYY/bk_central_YYYY/
    year_dir = OUTPUT_DIR / f"bk_central_{year}" / f"bk_central_{year}"
    
    if not year_dir.exists():
        print(f"\n[{year}] Directory not found: {year_dir}")
        continue
    
    network_converted = False
    polygon_converted = False
    
    # Find network shapefile
    network_dir = year_dir / "network"
    shp_path = find_shapefile_in_dir(network_dir)
    
    if shp_path:
        print(f"\n[{year}] Processing network: {shp_path.name}")
        
        try:
            geojson = shapefile_to_geojson(shp_path)
            
            # Add year to each feature
            for feature in geojson['features']:
                feature['properties']['year'] = year
            
            output_file = FRONTEND_DATA_DIR / f"network_{year}.geojson"
            with open(output_file, 'w') as f:
                json.dump(geojson, f)
            
            print(f"  ✓ Saved: {output_file.name}")
            print(f"    Features: {len(geojson['features'])}")
            network_converted = True
            
            # Extract location info from first feature for map centering
            if location_info is None and geojson['features']:
                first_geom = geojson['features'][0]['geometry']
                if first_geom['type'] == 'LineString' and first_geom['coordinates']:
                    coords = first_geom['coordinates']
                    # Calculate center from all coordinates
                    lons = [c[0] for c in coords]
                    lats = [c[1] for c in coords]
                    location_info = {
                        "center": [sum(lons)/len(lons), sum(lats)/len(lats)],
                        "bbox": [min(lats), max(lats), min(lons), max(lons)]
                    }
            
        except Exception as e:
            print(f"  ✗ Error: {e}")
    else:
        print(f"\n[{year}] No network shapefile found")
    
    # Find polygon shapefile  
    polygon_dir = year_dir / "polygons"
    shp_path = find_shapefile_in_dir(polygon_dir)
    
    if shp_path:
        print(f"[{year}] Processing polygons: {shp_path.name}")
        
        try:
            geojson = shapefile_to_geojson(shp_path)
            
            for feature in geojson['features']:
                feature['properties']['year'] = year
            
            output_file = FRONTEND_DATA_DIR / f"polygons_{year}.geojson"
            with open(output_file, 'w') as f:
                json.dump(geojson, f)
            
            print(f"  ✓ Saved: {output_file.name}")
            print(f"    Features: {len(geojson['features'])}")
            polygon_converted = True
            
        except Exception as e:
            print(f"  ✗ Error: {e}")
    else:
        print(f"[{year}] No polygon shapefile found")
    
    if network_converted or polygon_converted:
        converted_years.append(year)

if not converted_years:
    print("\n❌ No data was converted!")
    exit(1)

# Create a manifest file with metadata
manifest = {
    "name": "Brooklyn Central Pedestrian Infrastructure",
    "years": converted_years,
    "location": {
        "name": "Brooklyn Central", 
        "center": location_info["center"] if location_info else [-73.9695, 40.6744],
        "zoom": 16,
        "bbox": location_info["bbox"] if location_info else [40.6733, 40.6754, -73.9709, -73.9682]
    },
    "files": {
        str(year): {
            "network": f"network_{year}.geojson",
            "polygons": f"polygons_{year}.geojson"
        } for year in converted_years
    }
}

manifest_file = FRONTEND_DATA_DIR / "manifest.json"
with open(manifest_file, 'w') as f:
    json.dump(manifest, f, indent=2)

print(f"\n{'=' * 50}")
print(f"✅ Conversion complete!")
print(f"📅 Years converted: {converted_years}")
print(f"📁 Files saved to: {FRONTEND_DATA_DIR.absolute()}")
print(f"📋 Manifest: {manifest_file.name}")
