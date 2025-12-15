"""
tile2net_nys_orthos.py

Download orthoimagery from NY State WMS endpoints, stitch tiles, and run tile2net inference.

Available years and WMS endpoints:
- 2020: https://orthos.its.ny.gov/arcgis/services/wms/2020/MapServer/WMSServer
- 2022: https://orthos.its.ny.gov/arcgis/services/wms/2022/MapServer/WMSServer
- 2024: https://orthos.its.ny.gov/arcgis/services/wms/2024/MapServer/WMSServer
- Latest (2021-2025): https://orthos.its.ny.gov/arcgis/services/wms/Latest/MapServer/WMSServer

WMS requests use GetMap with EPSG:3857 (Web Mercator) bounding boxes.
"""
import modal
import os
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "git", "libgdal-dev", "gdal-bin", "libspatialindex-dev",
        "libgl1", "libglib2.0-0"
    )
    .pip_install(
        "numpy<2.0",
        "Pillow",
        "requests",
        "git+https://github.com/VIDA-NYU/tile2net.git",
        "urllib3<2.0"
    )
)

app = modal.App("tile2net-nys-orthos")
vol = modal.Volume.from_name("tile2net-data", create_if_missing=True)

TILE_SIZE = 256

# WMS endpoint patterns for NY State orthoimagery
WMS_ENDPOINTS = {
    2020: "https://orthos.its.ny.gov/arcgis/services/wms/2020/MapServer/WMSServer",
    2022: "https://orthos.its.ny.gov/arcgis/services/wms/2022/MapServer/WMSServer",
    2024: "https://orthos.its.ny.gov/arcgis/services/wms/2024/MapServer/WMSServer",
    "latest": "https://orthos.its.ny.gov/arcgis/services/wms/Latest/MapServer/WMSServer",
}


def lat_lon_to_web_mercator(lat, lon):
    """Convert WGS84 lat/lon to Web Mercator (EPSG:3857) coordinates."""
    x = lon * 20037508.34 / 180.0
    y = math.log(math.tan((90 + lat) * math.pi / 360.0)) / (math.pi / 180.0)
    y = y * 20037508.34 / 180.0
    return x, y


def lat_lon_to_tile(lat, lon, zoom):
    """Convert lat/lon to tile coordinates at given zoom level."""
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def tile_to_bbox_mercator(x, y, zoom):
    """Convert tile coordinates to Web Mercator bounding box."""
    n = 2.0 ** zoom
    
    # Calculate lat/lon bounds
    lon_min = x / n * 360.0 - 180.0
    lon_max = (x + 1) / n * 360.0 - 180.0
    
    lat_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    
    # Convert to Web Mercator
    x_min, y_min = lat_lon_to_web_mercator(lat_min, lon_min)
    x_max, y_max = lat_lon_to_web_mercator(lat_max, lon_max)
    
    return x_min, y_min, x_max, y_max


def get_tile_bounds(zoom, min_lat, min_lon, max_lat, max_lon):
    """Get the range of tile coordinates for a bounding box."""
    x_min, y_max = lat_lon_to_tile(min_lat, min_lon, zoom)
    x_max, y_min = lat_lon_to_tile(max_lat, max_lon, zoom)
    return x_min, x_max, y_min, y_max


def download_wms_tile(wms_url, bbox, filepath, size=256, retries=3):
    """
    Download a single tile from WMS endpoint using GetMap request.
    
    Args:
        wms_url: Base WMS endpoint URL
        bbox: Bounding box in Web Mercator (x_min, y_min, x_max, y_max)
        filepath: Path to save the tile
        size: Tile size in pixels
        retries: Number of retry attempts
    """
    import requests
    
    x_min, y_min, x_max, y_max = bbox
    
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "FORMAT": "image/png",
        "TRANSPARENT": "false",
        "LAYERS": "0",  # Usually the ortho layer
        "SRS": "EPSG:3857",
        "STYLES": "",
        "WIDTH": str(size),
        "HEIGHT": str(size),
        "BBOX": f"{x_min},{y_min},{x_max},{y_max}"
    }
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/png,image/*,*/*;q=0.8',
    }
    
    for attempt in range(retries):
        try:
            response = requests.get(wms_url, params=params, headers=headers, timeout=60)
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                
                # Check if we got an image (not an error XML)
                if 'image' in content_type or response.content[:8] == b'\x89PNG\r\n\x1a\n':
                    with open(filepath, 'wb') as f:
                        f.write(response.content)
                    return True, filepath, None
                else:
                    # Might be an XML error
                    if b'ServiceException' in response.content or b'Error' in response.content:
                        return False, filepath, "WMS Service Exception"
                    # Try to save anyway
                    with open(filepath, 'wb') as f:
                        f.write(response.content)
                    return True, filepath, None
            elif response.status_code == 404:
                return False, filepath, "404 - Not Found"
            else:
                if attempt == retries - 1:
                    return False, filepath, f"HTTP {response.status_code}"
        except Exception as e:
            if attempt == retries - 1:
                return False, filepath, str(e)
        time.sleep(1 * (attempt + 1))
    
    return False, filepath, "Max retries exceeded"


def download_tiles_wms(year, zoom, bbox, output_dir, max_workers=8):
    """
    Download all tiles for a given area and year from NY State WMS.
    
    Args:
        year: Year of orthoimagery (2020, 2022, 2024, or "latest")
        zoom: Zoom level (19 is high detail)
        bbox: Bounding box as [north_lat, west_lon, south_lat, east_lon]
        output_dir: Directory to save tiles
        max_workers: Number of parallel download threads
    
    Returns:
        Tuple of (downloaded_count, failed_count, tile_bounds, tiles_dir)
    """
    from pathlib import Path
    
    wms_url = WMS_ENDPOINTS.get(year)
    if not wms_url:
        raise ValueError(f"Unknown year: {year}. Available: {list(WMS_ENDPOINTS.keys())}")
    
    north_lat, west_lon, south_lat, east_lon = bbox
    
    # Get tile bounds
    x_min, x_max, y_min, y_max = get_tile_bounds(zoom, south_lat, west_lon, north_lat, east_lon)
    
    print(f"   WMS endpoint: {wms_url}")
    print(f"   Tile bounds: X=[{x_min}, {x_max}], Y=[{y_min}, {y_max}]")
    print(f"   Total tiles: {(x_max - x_min + 1) * (y_max - y_min + 1)}")
    
    # Create output directory
    year_str = str(year) if isinstance(year, int) else year
    tiles_dir = Path(output_dir) / f"nys_ortho_{year_str}" / f"{TILE_SIZE}_{zoom}"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    
    # Build list of tiles to download
    tiles_to_download = []
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            filepath = tiles_dir / f"{x}_{y}.png"
            if not filepath.exists():
                merc_bbox = tile_to_bbox_mercator(x, y, zoom)
                tiles_to_download.append((merc_bbox, filepath, x, y))
    
    total_tiles = (x_max - x_min + 1) * (y_max - y_min + 1)
    print(f"   Tiles to download: {len(tiles_to_download)} (skipping {total_tiles - len(tiles_to_download)} existing)")
    
    if not tiles_to_download:
        print("   All tiles already downloaded!")
        return 0, 0, (x_min, x_max, y_min, y_max), str(tiles_dir)
    
    def download_task(args):
        merc_bbox, filepath, x, y = args
        # Add small delay to avoid overwhelming the server
        time.sleep(0.05)
        return download_wms_tile(wms_url, merc_bbox, str(filepath))
    
    # Download tiles in parallel
    downloaded = 0
    failed = 0
    failed_tiles = []
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(download_task, args): args for args in tiles_to_download}
        
        for i, future in enumerate(as_completed(futures)):
            success, filepath, error = future.result()
            if success:
                downloaded += 1
            else:
                failed += 1
                if error and error != "404 - Not Found":
                    failed_tiles.append((filepath, error))
            
            # Progress update
            if (i + 1) % 100 == 0 or i + 1 == len(tiles_to_download):
                print(f"   Progress: {i + 1}/{len(tiles_to_download)} (Downloaded: {downloaded}, Failed: {failed})")
    
    if failed_tiles and len(failed_tiles) <= 20:
        print(f"\n⚠️  Sample failed tiles (non-404):")
        for fp, err in failed_tiles[:10]:
            print(f"     {Path(fp).name}: {err}")
    elif failed_tiles:
        print(f"\n⚠️  {len(failed_tiles)} tiles failed with non-404 errors")
    
    return downloaded, failed, (x_min, x_max, y_min, y_max), str(tiles_dir)


def stitch_tiles(tiles_dir, output_path, tile_bounds):
    """Stitch downloaded tiles into a single image."""
    from PIL import Image
    from pathlib import Path
    
    x_min, x_max, y_min, y_max = tile_bounds
    tiles_dir = Path(tiles_dir)
    
    width = (x_max - x_min + 1) * TILE_SIZE
    height = (y_max - y_min + 1) * TILE_SIZE
    
    print(f"   Stitching tiles into {width}x{height} image...")
    
    # Create output image with gray background (to show missing tiles)
    output_image = Image.new('RGB', (width, height), color=(128, 128, 128))
    
    tiles_placed = 0
    
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            tile_path = tiles_dir / f"{x}_{y}.png"
            if tile_path.exists():
                try:
                    tile = Image.open(tile_path)
                    
                    # Calculate position
                    pos_x = (x - x_min) * TILE_SIZE
                    pos_y = (y - y_min) * TILE_SIZE
                    
                    # Convert and paste
                    if tile.mode in ('RGBA', 'P'):
                        output_image.paste(tile.convert('RGB'), (pos_x, pos_y))
                    else:
                        output_image.paste(tile, (pos_x, pos_y))
                    
                    tiles_placed += 1
                except Exception as e:
                    print(f"   Error loading {tile_path}: {e}")
    
    print(f"   Tiles placed: {tiles_placed}")
    
    # Save output
    print(f"   Saving stitched image to: {output_path}")
    output_image.save(output_path, quality=95)
    
    return str(output_path)


def tile_large_image(input_path: str, output_dir: str, tile_size: int = 256, 
                     xtile_start: int = 0, ytile_start: int = 0):
    """Tile a large image into smaller tiles for tile2net."""
    from PIL import Image
    
    Image.MAX_IMAGE_PIXELS = None
    
    print(f"   Loading stitched image...")
    img = Image.open(input_path)
    width, height = img.size
    print(f"   Image size: {width} x {height} pixels")
    
    num_tiles_x = math.ceil(width / tile_size)
    num_tiles_y = math.ceil(height / tile_size)
    total_tiles = num_tiles_x * num_tiles_y
    print(f"   Will create {num_tiles_x} x {num_tiles_y} = {total_tiles} tiles")
    
    os.makedirs(output_dir, exist_ok=True)
    
    tiles_created = 0
    for y in range(num_tiles_y):
        for x in range(num_tiles_x):
            left = x * tile_size
            upper = y * tile_size
            right = min(left + tile_size, width)
            lower = min(upper + tile_size, height)
            
            tile = img.crop((left, upper, right, lower))
            
            if tile.size != (tile_size, tile_size):
                padded = Image.new('RGB', (tile_size, tile_size), (0, 0, 0))
                padded.paste(tile, (0, 0))
                tile = padded
            
            tile_x = xtile_start + x
            tile_y = ytile_start + y
            tile_path = os.path.join(output_dir, f"{tile_x}_{tile_y}.png")
            tile.save(tile_path)
            tiles_created += 1
            
            if tiles_created % 500 == 0:
                print(f"   Created {tiles_created}/{total_tiles} tiles...")
    
    print(f"   ✅ Created {tiles_created} tiles")
    return num_tiles_x, num_tiles_y


@app.function(
    image=image,
    gpu="A100-80GB",
    cpu=4,
    timeout=86400,
    volumes={"/data": vol}
)
def process_nys_ortho(year: int):
    """
    Download tiles from NY State WMS, stitch them, and run tile2net for a given year.
    """
    from tile2net import Raster
    
    # North/Central Brooklyn bounding box
    bbox = [40.7000, -74.0000, 40.6500, -73.9300]
    zoom = 19
    
    project_name = f"bk_nys_{year}"
    output_dir = "/data/outputs"
    downloads_dir = "/data/downloads"
    images_dir = "/data/images"
    
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(downloads_dir, exist_ok=True)
    os.makedirs(images_dir, exist_ok=True)
    
    print(f"\n{'='*60}")
    print(f"⏳ Processing NY State Ortho: {year}")
    print(f"{'='*60}")
    print(f"   Bounding box: {bbox}")
    print(f"   Zoom: {zoom}")
    
    try:
        # Step 1: Download tiles from NY State WMS
        print(f"\n📥 Step 1: Downloading tiles for {year}...")
        downloaded, failed, tile_bounds, tiles_dir = download_tiles_wms(
            year=year,
            zoom=zoom,
            bbox=bbox,
            output_dir=downloads_dir,
            max_workers=8  # WMS can handle more concurrent requests
        )
        print(f"   Download complete: {downloaded} downloaded, {failed} failed/missing")
        
        vol.commit()
        
        # Step 2: Stitch tiles into a large image
        print(f"\n🖼️  Step 2: Stitching tiles for {year}...")
        stitched_path = f"{images_dir}/nys_{year}.png"
        stitch_tiles(tiles_dir, stitched_path, tile_bounds)
        
        vol.commit()
        
        # Step 3: Setup tile2net
        print(f"\n📐 Step 3: Setting up tile2net...")
        
        temp_raster = Raster(
            location=bbox,
            name=project_name,
            output_dir=output_dir,
            zoom=zoom
        )
        xtile_start = temp_raster.xtile
        ytile_start = temp_raster.ytile
        print(f"   Expected tile range: x=[{xtile_start}, {temp_raster.xtilem}], y=[{ytile_start}, {temp_raster.ytilem}]")
        
        # Step 4: Re-tile for tile2net with correct coordinates
        print(f"\n📐 Step 4: Re-tiling for tile2net...")
        t2n_tiles_dir = os.path.join(output_dir, project_name, "tiles", "static")
        os.makedirs(t2n_tiles_dir, exist_ok=True)
        
        tile_large_image(
            input_path=stitched_path,
            output_dir=t2n_tiles_dir,
            tile_size=256,
            xtile_start=xtile_start,
            ytile_start=ytile_start
        )
        
        # Step 5: Create Raster and generate project structure
        print(f"\n🔧 Step 5: Setting up tile2net Raster...")
        input_pattern = os.path.join(t2n_tiles_dir, "x_y.png")
        
        raster = Raster(
            location=bbox,
            name=project_name,
            output_dir=output_dir,
            input_dir=input_pattern,
            zoom=zoom
        )
        
        print(f"\n📝 Step 6: Generating project structure...")
        raster.generate(step=1)
        
        print(f"\n🧠 Step 7: Running Inference for {year}...")
        raster.inference()
        
        vol.commit()
        
        print(f"\n✅ Success! Output saved to {output_dir}/{project_name}")
        return f"✅ Success: NYS Ortho {year}"
        
    except Exception as e:
        import traceback
        error_msg = f"❌ Error processing {year}: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return error_msg


@app.local_entrypoint()
def main(
    year: int = None,
    batch: bool = True,
):
    """
    tile2net processing for NY State orthoimagery (WMS).
    
    Args:
        year: Specific year to process (2020, 2022, or 2024)
        batch: Run batch processing for all available years (default: True)
    """
    print("=" * 60)
    print("tile2net - NY State Orthoimagery (WMS)")
    print("=" * 60)
    
    if batch or year is None:
        years = [2020, 2022, 2024]
        
        print(f"🚀 Launching batch job for years: {years}")
        print(f"   WMS source: orthos.its.ny.gov")
        print()
        
        # Run in parallel on Modal
        results = list(process_nys_ortho.map(years))
        
        print("\n" + "=" * 60)
        print("Results:")
        print("=" * 60)
        for res in results:
            print(res)
            
        print("\nTo download results:")
        for y in years:
            print(f"modal volume get tile2net-data outputs/bk_nys_{y} ./nys_ortho_{y}")
    else:
        print(f"🚀 Processing year {year}...")
        print()
        result = process_nys_ortho.remote(year)
        print("\n" + "=" * 60)
        print("Result:")
        print("=" * 60)
        print(result)
        print(f"\nTo download results:")
        print(f"modal volume get tile2net-data outputs/bk_nys_{year} ./nys_ortho_{year}")


