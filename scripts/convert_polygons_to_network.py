"""
Convert polygon shapefiles to network (LineString) GeoJSON for years that only have polygon data.

This script reads polygon shapefiles and converts them to LineString features by:
1. Extracting the polygon boundary as a LineString
2. Optionally computing a centerline/skeleton (for crosswalks/sidewalks)

Usage:
  python convert_polygons_to_network.py              # Convert 2020, 2022, 2024
  python convert_polygons_to_network.py 2020 2022    # Convert specific years
"""

import json
import sys
from pathlib import Path
import shapefile

# Paths
OUTPUT_DIR = Path("outputs")
FRONTEND_DATA_DIR = Path("frontend/public/data")

# Years that need network files generated from polygons
POLYGON_ONLY_YEARS = [2020, 2022, 2024]


def find_polygon_shapefile(year):
    """Find the polygon shapefile for a given year"""
    year_dir = OUTPUT_DIR / f"nyc_{year}"
    polygon_dir = year_dir / "polygons"
    
    if not polygon_dir.exists():
        return None
    
    # Find any subdirectory containing a .shp file
    for subdir in polygon_dir.iterdir():
        if subdir.is_dir():
            shp_files = list(subdir.glob("*.shp"))
            if shp_files:
                return shp_files[0]
    
    # Also check for .shp directly in polygon_dir
    shp_files = list(polygon_dir.glob("*.shp"))
    if shp_files:
        return shp_files[0]
    
    return None


def polygon_to_linestring(polygon_coords):
    """
    Convert polygon coordinates to a LineString.
    For simple polygons, use the outer ring.
    Returns the coordinates as a LineString (list of [lng, lat] pairs).
    """
    if not polygon_coords or len(polygon_coords) == 0:
        return None
    
    # Polygon coordinates are [[outer_ring], [hole1], [hole2], ...]
    # We just want the outer ring
    outer_ring = polygon_coords[0] if isinstance(polygon_coords[0][0], (list, tuple)) else polygon_coords
    
    if len(outer_ring) < 2:
        return None
    
    # Return the ring as a LineString (exclude closing point if it duplicates first)
    if outer_ring[0] == outer_ring[-1] and len(outer_ring) > 2:
        return outer_ring[:-1]
    
    return outer_ring


def compute_centerline(polygon_coords):
    """
    Compute a simple centerline for a polygon.
    For crosswalks (roughly rectangular), this returns a line from the midpoint 
    of one short edge to the midpoint of the opposite short edge.
    """
    if not polygon_coords or len(polygon_coords) == 0:
        return None
    
    outer_ring = polygon_coords[0] if isinstance(polygon_coords[0][0], (list, tuple)) else polygon_coords
    
    if len(outer_ring) < 4:
        return None
    
    # Find the longest edge and use perpendicular direction for centerline
    edges = []
    for i in range(len(outer_ring) - 1):
        p1 = outer_ring[i]
        p2 = outer_ring[i + 1]
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        length = (dx * dx + dy * dy) ** 0.5
        midpoint = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
        edges.append({
            'length': length,
            'midpoint': midpoint,
            'p1': p1,
            'p2': p2,
            'idx': i
        })
    
    if len(edges) < 2:
        return None
    
    # Sort edges by length
    edges.sort(key=lambda e: e['length'], reverse=True)
    
    # For roughly rectangular shapes, connect midpoints of the two longest edges
    # These are typically the "sides" of a crosswalk
    long_edge1 = edges[0]
    long_edge2 = edges[1]
    
    # Return a LineString from midpoint to midpoint
    return [long_edge1['midpoint'], long_edge2['midpoint']]


def shapefile_to_network_geojson(shp_path, year, use_centerline=True):
    """
    Convert a polygon shapefile to LineString GeoJSON.
    
    Args:
        shp_path: Path to the shapefile
        year: Year for metadata
        use_centerline: If True, compute centerlines; if False, use polygon boundaries
    """
    try:
        sf = shapefile.Reader(str(shp_path))
    except Exception as e:
        print(f"  Error reading shapefile: {e}")
        return None
    
    features = []
    fields = [field[0] for field in sf.fields[1:]]  # Skip DeletionFlag
    
    skipped = 0
    for sr in sf.shapeRecords():
        try:
            geom = sr.shape.__geo_interface__
        except Exception:
            skipped += 1
            continue
        
        if not geom or geom.get('type') != 'Polygon':
            skipped += 1
            continue
        
        coords = geom.get('coordinates')
        if not coords:
            skipped += 1
            continue
        
        # Convert polygon to linestring
        if use_centerline:
            line_coords = compute_centerline(coords)
        else:
            line_coords = polygon_to_linestring(coords)
        
        if not line_coords or len(line_coords) < 2:
            skipped += 1
            continue
        
        # Get properties
        try:
            props = dict(zip(fields, sr.record))
        except Exception:
            props = {}
        
        # Clean up properties
        clean_props = {}
        for k, v in props.items():
            if isinstance(v, (int, float, str, bool, type(None))):
                clean_props[k] = v
            else:
                clean_props[k] = str(v)
        
        clean_props['year'] = year
        clean_props['_derived_from'] = 'polygon_centerline' if use_centerline else 'polygon_boundary'
        
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": line_coords
            },
            "properties": clean_props
        }
        features.append(feature)
    
    if skipped > 0:
        print(f"  Skipped {skipped} features (invalid geometry)")
    
    return {
        "type": "FeatureCollection",
        "features": features
    }


def convert_year(year, use_centerline=True):
    """Convert polygon shapefile for a year to network GeoJSON"""
    print(f"\n[{year}] Looking for polygon shapefile...")
    
    shp_path = find_polygon_shapefile(year)
    
    if not shp_path:
        print(f"  ❌ No polygon shapefile found for {year}")
        return False
    
    print(f"  Found: {shp_path}")
    
    geojson = shapefile_to_network_geojson(shp_path, year, use_centerline=use_centerline)
    
    if not geojson or not geojson['features']:
        print(f"  ❌ No features extracted")
        return False
    
    # Save as network GeoJSON
    output_file = FRONTEND_DATA_DIR / f"network_{year}.geojson"
    with open(output_file, 'w') as f:
        json.dump(geojson, f)
    
    print(f"  ✅ Saved: {output_file}")
    print(f"     Features: {len(geojson['features'])}")
    
    return True


def main():
    print("=" * 60)
    print("Converting Polygon Shapefiles to Network GeoJSON")
    print("=" * 60)
    
    # Parse command line arguments
    if len(sys.argv) > 1:
        try:
            years = [int(y) for y in sys.argv[1:]]
        except ValueError:
            print("Usage: python convert_polygons_to_network.py [year1] [year2] ...")
            return
    else:
        years = POLYGON_ONLY_YEARS
    
    print(f"Years to process: {years}")
    
    # Check for --boundary flag to use polygon boundary instead of centerline
    use_centerline = '--boundary' not in sys.argv
    if not use_centerline:
        print("Mode: Using polygon boundaries (not centerlines)")
    else:
        print("Mode: Computing centerlines from polygons")
    
    successful = []
    for year in years:
        if convert_year(year, use_centerline=use_centerline):
            successful.append(year)
    
    print("\n" + "=" * 60)
    if successful:
        print(f"✅ Successfully converted: {successful}")
    else:
        print("❌ No years were converted")
    
    print(f"\n💡 Network GeoJSON files saved to: {FRONTEND_DATA_DIR}")


if __name__ == "__main__":
    main()

