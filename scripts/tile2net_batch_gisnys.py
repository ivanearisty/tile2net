"""
tile2net_batch_gisnys.py

Download tiles from maps.nyc.gov, stitch them, and run tile2net inference.

Available years: 1924, 1951, 1996, 2001, 2004, 2006, 2008, 2010, 2012, 2014, 2018
Tile URL pattern: https://maps.nyc.gov/xyz/1.0.0/photo/{year}/{z}/{x}/{y}.png8
"""
import modal
import os
import math
import time

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

app = modal.App("tile2net-nyc-batch")
vol = modal.Volume.from_name("tile2net-data", create_if_missing=True)

TILE_SIZE = 256


def lat_lon_to_tile(lat, lon, zoom):
    """Convert lat/lon to tile coordinates at given zoom level."""
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def get_tile_bounds(zoom, min_lat, min_lon, max_lat, max_lon):
    """Get the range of tile coordinates for a bounding box."""
    x_min, y_max = lat_lon_to_tile(min_lat, min_lon, zoom)
    x_max, y_min = lat_lon_to_tile(max_lat, max_lon, zoom)
    return x_min, x_max, y_min, y_max


def download_tile(url, filepath, retries=3):
    """Download a single tile with retry logic."""
    import requests
    
    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=30)
            if response.status_code == 200:
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
        time.sleep(0.5 * (attempt + 1))
    return False, filepath, "Max retries exceeded"


def download_tiles_for_area(year, zoom, bbox, output_dir, max_workers=8):
    """
    Download all tiles for a given area and year from maps.nyc.gov.
    
    Args:
        year: Year of aerial photography
        zoom: Zoom level (19 is high detail)
        bbox: Bounding box as [north_lat, west_lon, south_lat, east_lon]
        output_dir: Directory to save tiles
        max_workers: Number of parallel download threads
    
    Returns:
        Tuple of (downloaded_count, failed_count, tile_bounds, tiles_dir)
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from pathlib import Path
    
    north_lat, west_lon, south_lat, east_lon = bbox
    
    # Get tile bounds
    x_min, x_max, y_min, y_max = get_tile_bounds(zoom, south_lat, west_lon, north_lat, east_lon)
    
    print(f"   Tile bounds: X=[{x_min}, {x_max}], Y=[{y_min}, {y_max}]")
    print(f"   Total tiles: {(x_max - x_min + 1) * (y_max - y_min + 1)}")
    
    # Create output directory
    tiles_dir = Path(output_dir) / f"nyc_{year}" / f"{TILE_SIZE}_{zoom}"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    
    # Build list of tiles to download
    tiles_to_download = []
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            # maps.nyc.gov tile URL pattern
            url = f"https://maps.nyc.gov/xyz/1.0.0/photo/{year}/{zoom}/{x}/{y}.png8"
            filepath = tiles_dir / f"{x}_{y}.png"
            if not filepath.exists():
                tiles_to_download.append((url, filepath))
    
    print(f"   Tiles to download: {len(tiles_to_download)} (skipping {(x_max - x_min + 1) * (y_max - y_min + 1) - len(tiles_to_download)} existing)")
    
    if not tiles_to_download:
        print("   All tiles already downloaded!")
        return 0, 0, (x_min, x_max, y_min, y_max), str(tiles_dir)
    
    # Download tiles in parallel
    downloaded = 0
    failed = 0
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(download_tile, url, str(fp)): (url, fp) for url, fp in tiles_to_download}
        
        for i, future in enumerate(as_completed(futures)):
            success, filepath, error = future.result()
            if success:
                downloaded += 1
            else:
                failed += 1
            
            # Progress update
            if (i + 1) % 100 == 0 or i + 1 == len(tiles_to_download):
                print(f"   Progress: {i + 1}/{len(tiles_to_download)} (Downloaded: {downloaded}, Failed: {failed})")
    
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
                    if tile.mode == 'RGBA':
                        output_image.paste(tile.convert('RGB'), (pos_x, pos_y))
                    elif tile.mode == 'P':
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
    """
    Tile a large image into smaller tiles for tile2net.
    
    Args:
        input_path: Path to the large image
        output_dir: Directory to save tiles
        tile_size: Size of each tile (default 256)
        xtile_start: Starting x tile coordinate (slippy map coordinate)
        ytile_start: Starting y tile coordinate (slippy map coordinate)
    
    Returns:
        Tuple of (num_tiles_x, num_tiles_y)
    """
    from PIL import Image
    
    # Disable decompression bomb check for very large aerial images
    Image.MAX_IMAGE_PIXELS = None
    
    print(f"   Loading stitched image...")
    img = Image.open(input_path)
    width, height = img.size
    print(f"   Image size: {width} x {height} pixels")
    
    # Calculate number of tiles
    num_tiles_x = math.ceil(width / tile_size)
    num_tiles_y = math.ceil(height / tile_size)
    total_tiles = num_tiles_x * num_tiles_y
    print(f"   Will create {num_tiles_x} x {num_tiles_y} = {total_tiles} tiles")
    print(f"   Starting at tile coordinates: ({xtile_start}, {ytile_start})")
    
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
            
            # Use slippy map coordinates for tile naming
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
def process_year(year: int):
    """
    Download tiles, stitch them, and run tile2net for a given year.
    """
    from tile2net import Raster
    
    # North/Central Brooklyn bounding box
    bbox = [40.7000, -74.0000, 40.6500, -73.9300]
    zoom = 19
    
    project_name = f"bk_central_{year}"
    output_dir = "/data/outputs"
    downloads_dir = "/data/downloads"
    images_dir = "/data/images"
    
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(downloads_dir, exist_ok=True)
    os.makedirs(images_dir, exist_ok=True)
    
    print(f"\n{'='*60}")
    print(f"⏳ Processing Year: {year}")
    print(f"{'='*60}")
    print(f"   Bounding box: {bbox}")
    print(f"   Zoom: {zoom}")
    
    try:
        # Step 1: Download tiles from maps.nyc.gov
        print(f"\n📥 Step 1: Downloading tiles for {year}...")
        downloaded, failed, tile_bounds, tiles_dir = download_tiles_for_area(
            year=year,
            zoom=zoom,
            bbox=bbox,
            output_dir=downloads_dir,
            max_workers=16
        )
        print(f"   Download complete: {downloaded} downloaded, {failed} failed/missing")
        
        # Commit volume after downloads
        vol.commit()
        
        # Step 2: Stitch tiles into a large image
        print(f"\n🖼️  Step 2: Stitching tiles for {year}...")
        stitched_path = f"{images_dir}/nyc_{year}.png"
        stitch_tiles(tiles_dir, stitched_path, tile_bounds)
        
        # Commit volume after stitching
        vol.commit()
        
        # Step 3: Get expected tile coordinates from tile2net
        print(f"\n📐 Step 3: Setting up tile2net and getting tile coordinates...")
        
        # Create a temporary Raster to get the expected tile coordinates
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
        
        # Generate project structure and info JSON (required before inference)
        print(f"\n📝 Step 6: Generating project structure...")
        raster.generate(step=1)
        
        print(f"\n🧠 Step 7: Running Inference for {year}...")
        raster.inference()
        
        # Commit final results
        vol.commit()
        
        print(f"\n✅ Success! Output saved to {output_dir}/{project_name}")
        return f"✅ Success: {year}"
        
    except Exception as e:
        import traceback
        error_msg = f"❌ Error processing {year}: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return error_msg

    
@app.function(
    image=image,
    gpu="A100-80GB",
    cpu=4,
    timeout=86400,
    volumes={"/data": vol}
)
def process_from_image(year: int, image_path: str):
    """
    Process a pre-existing stitched image (skip download/stitch steps).
    
    Args:
        year: Year label for the output
        image_path: Path to the stitched image in the Modal volume (e.g., "/data/images/nyc_2016.png")
    """
    from tile2net import Raster
    from PIL import Image
    
    # North/Central Brooklyn bounding box (same as download version)
    bbox = [40.7000, -74.0000, 40.6500, -73.9300]
    zoom = 19
    
    project_name = f"bk_central_{year}"
    output_dir = "/data/outputs"
    
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"\n{'='*60}")
    print(f"⏳ Processing Year: {year} (from existing image)")
    print(f"{'='*60}")
    print(f"   Image path: {image_path}")
    print(f"   Bounding box: {bbox}")
    print(f"   Zoom: {zoom}")
    
    try:
        # Disable decompression bomb check for very large aerial images
        Image.MAX_IMAGE_PIXELS = None
        
        # Verify the image exists
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        # Get image info
        img = Image.open(image_path)
        width, height = img.size
        print(f"   Image size: {width} x {height} pixels")
        img.close()
        
        # Create a temporary Raster to get the expected tile coordinates
        # This tells us what slippy map coordinates tile2net expects
        temp_raster = Raster(
            location=bbox,
            name=project_name,
            output_dir=output_dir,
            zoom=zoom
        )
        xtile_start = temp_raster.xtile
        ytile_start = temp_raster.ytile
        print(f"   Expected tile range: x=[{xtile_start}, {temp_raster.xtilem}], y=[{ytile_start}, {temp_raster.ytilem}]")
        
        # Store tiles in the project's static tiles directory (where tile2net expects them)
        # Use the project structure that tile2net expects
        tiles_dir = os.path.join(output_dir, project_name, "tiles", "static")
        os.makedirs(tiles_dir, exist_ok=True)
        
        # Check if tiles already exist with correct naming
        expected_first_tile = os.path.join(tiles_dir, f"{xtile_start}_{ytile_start}.png")
        existing_tiles = [f for f in os.listdir(tiles_dir) if f.endswith('.png')] if os.path.exists(tiles_dir) else []
        
        if os.path.exists(expected_first_tile) and len(existing_tiles) > 100:
            print(f"\n📦 Found {len(existing_tiles)} cached tiles in {tiles_dir}")
            print(f"   First tile exists: {expected_first_tile}")
            print(f"   Skipping tiling step!")
        else:
            # Step 1: Tile the image with correct slippy map coordinates
            print(f"\n📐 Step 1: Tiling image for tile2net...")
            print(f"   Saving tiles to: {tiles_dir}")
            
            tile_large_image(
                input_path=image_path,
                output_dir=tiles_dir,
                tile_size=256,
                xtile_start=xtile_start,
                ytile_start=ytile_start
            )
            
            # Commit volume after tiling to persist the cache
            vol.commit()
            print(f"   ✅ Tiles created!")
        
        # Step 2: Create Raster with input_dir pointing to our tiles
        print(f"\n🔧 Step 2: Setting up tile2net Raster...")
        input_pattern = os.path.join(tiles_dir, "x_y.png")
        
        raster = Raster(
            location=bbox,
            name=project_name,
            output_dir=output_dir,
            input_dir=input_pattern,
            zoom=zoom
        )
        
        # Step 3: Generate project structure and info JSON
        # This is required before running inference!
        print(f"\n📝 Step 3: Generating project structure...")
        raster.generate(step=1)  # stitch_step=1 since tiles are already 256x256
        
        # Commit after generate to persist the info JSON
        vol.commit()
        
        print(f"\n🧠 Step 4: Running Inference for {year}...")
        raster.inference()
        
        # Commit final results
        vol.commit()
        
        print(f"\n✅ Success! Output saved to {output_dir}/{project_name}")
        return f"✅ Success: {year}"
        
    except Exception as e:
        import traceback
        error_msg = f"❌ Error processing {year}: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return error_msg


@app.local_entrypoint()
def main(
    year: int = 2016,
    from_image: str = None,
    batch: bool = False,
):
    """
    tile2net batch processing for NYC aerial imagery.
    
    Args:
        year: Year to process (default: 2016)
        from_image: Path to existing image in Modal volume (e.g., /data/images/nyc_2016.png)
        batch: Run batch processing for all years from maps.nyc.gov
    """
    print("=" * 60)
    print("tile2net Batch Processing - NYC Historical Aerial Imagery")
    print("=" * 60)
    
    if batch:
        # Original batch processing from maps.nyc.gov
        years = [
            1924,
            1951, 
            1996,
            2001,
            2004,
            2006,
            2008,
            2010,
            2012,
            2014,
            2018,
        ]
        
        print(f"🚀 Launching batch job for years: {years}")
        print(f"   Tile source: https://maps.nyc.gov/xyz/1.0.0/photo/{{year}}/...")
        print()
        
        # Run in parallel on Modal
        results = list(process_year.map(years))
        
        print("\n" + "=" * 60)
        print("Results:")
        print("=" * 60)
        for res in results:
            print(res)
    else:
        # Process from existing image (default for 2016)
        image_path = from_image or f"/data/images/nyc_{year}.png"
        print(f"🚀 Processing year {year} from existing image: {image_path}")
        print()
        result = process_from_image.remote(year, image_path)
        print("\n" + "=" * 60)
        print("Result:")
        print("=" * 60)
        print(result)
