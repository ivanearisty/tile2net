"""
Convert NYC Planimetrics Historical Data shapefiles to GeoJSON for validation

Supports shapefile years: 1996, 2001, 2004, 2006, 2008, 2010, 2012, 2018
For .gdb years (2014, 2016, 2017, 2022), use convert_planimetrics_gdb.py

NYC Planimetrics data uses NAD83 / New York Long Island (ftUS) - EPSG:2263
We need to transform to WGS84 (EPSG:4326) for web mapping

Usage:
    python convert_planimetrics.py                  # Convert all shapefile years
    python convert_planimetrics.py 2001 2006 2018  # Convert specific years
"""
import json
import math
import sys
from pathlib import Path
import shapefile

# Paths
PLANIMETRICS_DIR = Path("NYC_Planimetrics_Historical_Data")
FRONTEND_DATA_DIR = Path("frontend/public/data/reference")

# Create output directory
FRONTEND_DATA_DIR.mkdir(parents=True, exist_ok=True)

# Year mappings to folder names (supports both .gdb and shapefile folders)
YEAR_FOLDERS = {
    1996: "NYC_Planimetrics_1996",
    2001: "NYC_Planimetrics_2001",
    2004: "NYC_Planimetrics_2004", 
    2006: "NYC_Planimetrics_2006",
    2008: "NYC_Planimetrics_2008",
    2010: "NYC_Planimetrics_2010",
    2012: "NYC_Planimetrics_2012",
    2014: "NYC_Planimetrics_2014.gdb",
    2016: "NYC_Planimetrics_2016.gdb",
    2017: "NYC_Planimetrics_2017.gdb",
    2018: "NYC_Planimetrics_2018",
    2022: "NYC_Planimetrics_2022.gdb"
}

# Relevant layers for pedestrian infrastructure validation
# Empty list = use keyword matching (sidewalk, crosswalk, etc.)
PEDESTRIAN_LAYERS = {
    1996: [
        "centerln",      # Street centerlines
        "trn",           # Transportation features
        "trn_l",         # Transportation lines
        "opensp",        # Open spaces/plazas
        "opensp_l",      # Open space boundaries
    ],
    2001: [],  # Use keyword matching
    2004: [
        "street_centreline",           # Street centerlines
        "nonvehicular_centerline",     # Non-vehicular paths!
        "curb_block",                  # Curb features
        "Open_Space",                  # Open spaces
    ],
    2006: [],  # Use keyword matching
    2008: [],  # Use keyword matching
    2010: [],  # Use keyword matching
    2012: [],  # Use keyword matching
    2014: [],  # Use keyword matching
    2016: [],  # Use keyword matching
    2017: [],  # Use keyword matching
    2018: [],  # Use keyword matching
    2022: [],  # Use keyword matching
}

# Keywords for auto-detecting pedestrian-related layers
PEDESTRIAN_KEYWORDS = [
    'sidewalk', 'crosswalk', 'pedestrian', 'curb', 
    'centerline', 'street', 'plaza', 'median',
    'path', 'walkway', 'pavement', 'roadbed'
]

# NYC State Plane (EPSG:2263) to WGS84 (EPSG:4326) transformation
# EPSG:2263 parameters: NAD83 / New York Long Island (ftUS)
# Lambert Conformal Conic projection

def state_plane_to_wgs84(x_ft, y_ft):
    """
    Convert NY State Plane coordinates (feet) to WGS84 lat/lon
    Uses the official EPSG:2263 projection parameters
    
    Input: x, y in US Survey Feet (EPSG:2263)
    Output: lon, lat in degrees (EPSG:4326)
    """
    # Convert US Survey Feet to meters
    # US Survey Foot = 1200/3937 meters
    x = x_ft * (1200.0 / 3937.0)
    y = y_ft * (1200.0 / 3937.0)
    
    # EPSG:2263 Lambert Conformal Conic parameters
    # False Easting: 300000 m, False Northing: 0 m
    # Standard Parallels: 40°40'N and 41°02'N  
    # Central Meridian: -74°00'W
    # Latitude of Origin: 40°10'N
    
    x0 = 300000.0  # False Easting in meters
    y0 = 0.0       # False Northing in meters
    lon0 = -74.0   # Central meridian
    lat0 = 40.16666666666667  # Latitude of origin (40°10'N)
    lat1 = 40.66666666666667  # Standard parallel 1 (40°40'N)
    lat2 = 41.03333333333333  # Standard parallel 2 (41°02'N)
    
    # GRS80 ellipsoid parameters
    a = 6378137.0  # Semi-major axis
    f = 1/298.257222101  # Flattening
    e2 = 2*f - f*f  # Eccentricity squared
    e = math.sqrt(e2)
    
    # Convert to radians
    lat0_r = math.radians(lat0)
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    
    # Calculate m and t values for standard parallels
    def calc_m(lat_r):
        return math.cos(lat_r) / math.sqrt(1 - e2 * math.sin(lat_r)**2)
    
    def calc_t(lat_r):
        sin_lat = math.sin(lat_r)
        return math.tan(math.pi/4 - lat_r/2) / ((1 - e*sin_lat)/(1 + e*sin_lat))**(e/2)
    
    m1 = calc_m(lat1_r)
    m2 = calc_m(lat2_r)
    t0 = calc_t(lat0_r)
    t1 = calc_t(lat1_r)
    t2 = calc_t(lat2_r)
    
    # Calculate n (cone constant)
    n = (math.log(m1) - math.log(m2)) / (math.log(t1) - math.log(t2))
    
    # Calculate F
    F = m1 / (n * t1**n)
    
    # Calculate rho0
    rho0 = a * F * t0**n
    
    # Inverse projection
    x_shifted = x - x0
    y_shifted = y - y0
    
    rho = math.sqrt(x_shifted**2 + (rho0 - y_shifted)**2)
    if n < 0:
        rho = -rho
    
    theta = math.atan2(x_shifted, rho0 - y_shifted)
    
    # Calculate longitude
    lon = lon0 + math.degrees(theta / n)
    
    # Calculate latitude iteratively
    t = (rho / (a * F)) ** (1/n)
    
    # Initial latitude estimate
    lat = math.pi/2 - 2 * math.atan(t)
    
    # Iterate to refine latitude
    for _ in range(10):
        sin_lat = math.sin(lat)
        lat_new = math.pi/2 - 2 * math.atan(
            t * ((1 - e*sin_lat)/(1 + e*sin_lat))**(e/2)
        )
        if abs(lat_new - lat) < 1e-12:
            break
        lat = lat_new
    
    lat = math.degrees(lat)
    
    return lon, lat


def transform_coordinates(coords, geom_type):
    """Transform coordinates from State Plane to WGS84"""
    if geom_type == 'Point':
        return list(state_plane_to_wgs84(coords[0], coords[1]))
    elif geom_type == 'LineString':
        return [list(state_plane_to_wgs84(c[0], c[1])) for c in coords]
    elif geom_type == 'Polygon':
        return [[list(state_plane_to_wgs84(c[0], c[1])) for c in ring] for ring in coords]
    elif geom_type == 'MultiPoint':
        return [list(state_plane_to_wgs84(c[0], c[1])) for c in coords]
    elif geom_type == 'MultiLineString':
        return [[list(state_plane_to_wgs84(c[0], c[1])) for c in line] for line in coords]
    elif geom_type == 'MultiPolygon':
        return [[[list(state_plane_to_wgs84(c[0], c[1])) for c in ring] for ring in poly] for poly in coords]
    return coords


def shapefile_to_geojson(shp_path, layer_name, year, bbox=None):
    """Convert a shapefile to GeoJSON format with coordinate transformation"""
    try:
        sf = shapefile.Reader(str(shp_path))
    except Exception as e:
        print(f"    Error reading shapefile: {e}")
        return None
    
    features = []
    fields = [field[0] for field in sf.fields[1:]]
    
    for sr in sf.shapeRecords():
        try:
            geom = sr.shape.__geo_interface__
            if not geom or not geom.get('coordinates'):
                continue
        except Exception:
            continue
        
        # Transform coordinates to WGS84
        geom_type = geom['type']
        try:
            transformed_coords = transform_coordinates(geom['coordinates'], geom_type)
            geom['coordinates'] = transformed_coords
        except Exception as e:
            continue
        
        # Apply bbox filter after transformation (now in WGS84)
        if bbox:
            if not coords_in_bbox(geom['coordinates'], bbox):
                continue
        
        # Get properties
        try:
            props = dict(zip(fields, sr.record))
        except:
            props = {}
        
        # Clean up properties
        clean_props = {}
        for k, v in props.items():
            if isinstance(v, (int, float, str, bool, type(None))):
                clean_props[k] = v
            else:
                clean_props[k] = str(v)
        
        clean_props['_source_layer'] = layer_name
        clean_props['_source_year'] = year
        clean_props['_source'] = 'NYC_Planimetrics'
        
        feature = {
            "type": "Feature",
            "geometry": geom,
            "properties": clean_props
        }
        features.append(feature)
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "source": "NYC Planimetrics Historical Data",
            "year": year,
            "layer": layer_name,
            "feature_count": len(features)
        }
    }


def coords_in_bbox(coords, bbox):
    """Check if any coordinate falls within bbox (WGS84)"""
    min_lat, max_lat, min_lon, max_lon = bbox
    
    def check_point(point):
        if len(point) >= 2:
            lon, lat = point[0], point[1]
            return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat
        return False
    
    def check_nested(c):
        if isinstance(c[0], (int, float)):
            return check_point(c)
        else:
            return any(check_nested(sub) for sub in c)
    
    try:
        return check_nested(coords)
    except:
        return True


def is_pedestrian_layer(layer_name):
    """Check if layer name matches pedestrian infrastructure keywords"""
    layer_lower = layer_name.lower()
    return any(kw in layer_lower for kw in PEDESTRIAN_KEYWORDS)


def convert_shapefile_year(year, bbox=None, relevant_only=True):
    """Convert all relevant shapefiles for a given year"""
    folder = YEAR_FOLDERS.get(year)
    if not folder:
        print(f"Unknown year: {year}")
        return None
    
    folder_path = PLANIMETRICS_DIR / folder
    if not folder_path.exists():
        # Try with .gdb extension if shapefile folder not found
        folder_path = PLANIMETRICS_DIR / f"{folder}.gdb"
        if not folder_path.exists():
            print(f"Folder not found: {PLANIMETRICS_DIR / folder}")
            return None
    
    # If it's a .gdb file, skip (use convert_planimetrics_gdb.py instead)
    if folder_path.suffix == '.gdb':
        print(f"Skipping {year}: Use convert_planimetrics_gdb.py for .gdb files")
        return None
    
    print(f"\n{'='*60}")
    print(f"Processing {year} data from {folder}")
    print('='*60)
    
    all_features = []
    layers_info = []
    
    relevant_layers = PEDESTRIAN_LAYERS.get(year, [])
    shp_files = list(folder_path.glob("*.shp"))
    
    print(f"Found {len(shp_files)} shapefiles")
    
    if relevant_only:
        if relevant_layers:
            print(f"Processing only specified layers: {relevant_layers}")
        else:
            print(f"Using keyword matching for pedestrian layers")
    
    for shp_path in shp_files:
        layer_name = shp_path.stem
        
        # Filter by relevance
        if relevant_only:
            if relevant_layers:
                # Use explicit layer list
                if layer_name.lower() not in [l.lower() for l in relevant_layers]:
                    continue
            else:
                # Use keyword matching
                if not is_pedestrian_layer(layer_name):
                    continue
        
        print(f"\n  Processing: {layer_name}")
        
        geojson = shapefile_to_geojson(shp_path, layer_name, year, bbox)
        if geojson and geojson['features']:
            all_features.extend(geojson['features'])
            layers_info.append({
                "name": layer_name,
                "feature_count": len(geojson['features'])
            })
            print(f"    ✓ {len(geojson['features'])} features (transformed to WGS84)")
        else:
            print(f"    - No features in bbox or error")
    
    combined = {
        "type": "FeatureCollection",
        "features": all_features,
        "metadata": {
            "source": "NYC Planimetrics Historical Data",
            "year": year,
            "layers": layers_info,
            "total_features": len(all_features),
            "crs": "EPSG:4326"
        }
    }
    
    return combined


def save_geojson(data, output_path):
    """Save GeoJSON data to file"""
    with open(output_path, 'w') as f:
        json.dump(data, f)
    print(f"Saved: {output_path}")


def create_reference_manifest():
    """Create manifest file for reference data"""
    manifest = {
        "name": "NYC Planimetrics Reference Data",
        "description": "Official NYC planimetrics data for validation (transformed to WGS84)",
        "available_years": [],
        "files": {}
    }
    
    # Check all possible years
    all_years = [1996, 2001, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2017, 2018, 2022]
    for year in all_years:
        file_path = FRONTEND_DATA_DIR / f"planimetrics_{year}.geojson"
        if file_path.exists():
            try:
                with open(file_path) as f:
                    data = json.load(f)
                    if data.get('features') and len(data['features']) > 0:
                        manifest["available_years"].append(year)
                        manifest["files"][str(year)] = f"reference/planimetrics_{year}.geojson"
            except:
                pass
    
    manifest_path = FRONTEND_DATA_DIR / "manifest.json"
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f"\nCreated manifest: {manifest_path}")
    print(f"Available years: {manifest['available_years']}")
    
    return manifest


# Brooklyn Central bbox in WGS84 [min_lat, max_lat, min_lon, max_lon]
BROOKLYN_BBOX = [40.65, 40.70, -74.00, -73.95]

# Shapefile years (non-.gdb)
SHAPEFILE_YEARS = [1996, 2001, 2004, 2006, 2008, 2010, 2012, 2018]


def main():
    print("Converting NYC Planimetrics Historical Data (Shapefiles) to GeoJSON")
    print("=" * 60)
    print("Transforming from EPSG:2263 (NY State Plane) to EPSG:4326 (WGS84)")
    
    # Test the transformation with a known point
    test_lon, test_lat = state_plane_to_wgs84(988000, 212000)
    print(f"\nTransformation test (Empire State Building area):")
    print(f"  Input: (988000, 212000) ft")
    print(f"  Output: ({test_lon:.6f}, {test_lat:.6f})")
    print(f"  Expected: approximately (-73.98, 40.75)")
    
    # Parse command line arguments for specific years
    if len(sys.argv) > 1:
        try:
            years_to_process = [int(y) for y in sys.argv[1:] if y.isdigit()]
        except ValueError:
            print("Usage: python convert_planimetrics.py [year1] [year2] ...")
            return
    else:
        years_to_process = SHAPEFILE_YEARS
    
    print(f"\n📅 Years to process: {years_to_process}")
    
    successful = []
    for year in years_to_process:
        data = convert_shapefile_year(year, bbox=BROOKLYN_BBOX, relevant_only=True)
        if data and data['features']:
            output_path = FRONTEND_DATA_DIR / f"planimetrics_{year}.geojson"
            save_geojson(data, output_path)
            print(f"  Total features for {year}: {len(data['features'])}")
            successful.append(year)
        else:
            print(f"  No features found for {year}")
    
    create_reference_manifest()
    
    print("\n" + "=" * 60)
    print(f"✅ Conversion complete!")
    print(f"📅 Successfully converted: {successful}")
    print(f"\n💡 For .gdb years (2014, 2016, 2017, 2022), run:")
    print(f"   python convert_planimetrics_gdb.py")


if __name__ == "__main__":
    main()
