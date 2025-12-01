"""
Convert tile2net shapefiles to GeoJSON for the frontend app
Uses pyshp library for shapefile reading
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

# Years to process
years = [2014, 2016, 2018]

print("Converting tile2net shapefiles to GeoJSON...")
print("=" * 50)

for year in years:
    year_dir = OUTPUT_DIR / f"bk_data_{year}" / f"bk_gap_{year}"
    
    # Find network shapefile
    network_dir = year_dir / "network"
    if network_dir.exists():
        for subdir in network_dir.iterdir():
            if subdir.is_dir():
                shp_files = list(subdir.glob("*.shp"))
                if shp_files:
                    shp_path = shp_files[0]
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
                        
                    except Exception as e:
                        print(f"  ✗ Error: {e}")
    
    # Find polygon shapefile  
    polygon_dir = year_dir / "polygons"
    if polygon_dir.exists():
        for subdir in polygon_dir.iterdir():
            if subdir.is_dir():
                shp_files = list(subdir.glob("*.shp"))
                if shp_files:
                    shp_path = shp_files[0]
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
                        
                    except Exception as e:
                        print(f"  ✗ Error: {e}")

# Create a manifest file with metadata
manifest = {
    "name": "Grand Plaza Brooklyn",
    "years": years,
    "location": {
        "name": "Grand Plaza, Brooklyn", 
        "center": [-73.9695, 40.6744],
        "zoom": 17,
        "bbox": [40.6733, 40.6754, -73.9709, -73.9682]
    },
    "files": {
        str(year): {
            "network": f"network_{year}.geojson",
            "polygons": f"polygons_{year}.geojson"
        } for year in years
    }
}

manifest_file = FRONTEND_DATA_DIR / "manifest.json"
with open(manifest_file, 'w') as f:
    json.dump(manifest, f, indent=2)

print(f"\n{'=' * 50}")
print(f"✅ Conversion complete!")
print(f"📁 Files saved to: {FRONTEND_DATA_DIR.absolute()}")
print(f"📋 Manifest: {manifest_file.name}")
