#!/usr/bin/env python3
"""
Script to download tiles from NYC maps.nyc.gov tile service and stitch them together.
This is for testing the tile service before using it in Modal VMs.

The XYZ tile service URL pattern for aerial photography is:
https://maps.nyc.gov/xyz/1.0.0/photo/{year}/{z}/{x}/{y}.png8

Available years: 2018, 2016, 2014, 2012, 2010, 2008, 2006, 2004, 2001-2, 1996, 1951, 1924
"""

import os
import math
import requests
from pathlib import Path
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

# Tile size (standard web map tiles)
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
    # Note: min_lat is actually the southern bound (lower y value in lat)
    # In tile coordinates, higher y = further south
    x_min, y_max = lat_lon_to_tile(min_lat, min_lon, zoom)
    x_max, y_min = lat_lon_to_tile(max_lat, max_lon, zoom)
    return x_min, x_max, y_min, y_max


def download_tile(url, filepath, retries=3):
    """Download a single tile with retry logic."""
    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=30)
            if response.status_code == 200:
                with open(filepath, 'wb') as f:
                    f.write(response.content)
                return True, filepath, None
            elif response.status_code == 404:
                # Tile doesn't exist (outside coverage area)
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
    Download all tiles for a given area and year.
    
    Args:
        year: Year of aerial photography (e.g., 2016)
        zoom: Zoom level (19 is high detail)
        bbox: Bounding box as [north_lat, west_lon, south_lat, east_lon]
        output_dir: Directory to save tiles
        max_workers: Number of parallel download threads
    
    Returns:
        Tuple of (downloaded_count, failed_count, tile_bounds)
    """
    north_lat, west_lon, south_lat, east_lon = bbox
    
    # Get tile bounds
    x_min, x_max, y_min, y_max = get_tile_bounds(zoom, south_lat, west_lon, north_lat, east_lon)
    
    print(f"Tile bounds: X=[{x_min}, {x_max}], Y=[{y_min}, {y_max}]")
    print(f"Total tiles: {(x_max - x_min + 1) * (y_max - y_min + 1)}")
    
    # Create output directory
    tiles_dir = Path(output_dir) / f"nyc_{year}" / f"{TILE_SIZE}_{zoom}"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    
    # Build list of tiles to download
    tiles_to_download = []
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            # XYZ tile URL for NYC maps
            url = f"https://maps.nyc.gov/xyz/1.0.0/photo/{year}/{zoom}/{x}/{y}.png8"
            filepath = tiles_dir / f"{x}_{y}.png"
            if not filepath.exists():
                tiles_to_download.append((url, filepath))
    
    print(f"Tiles to download: {len(tiles_to_download)} (skipping {(x_max - x_min + 1) * (y_max - y_min + 1) - len(tiles_to_download)} existing)")
    
    if not tiles_to_download:
        print("All tiles already downloaded!")
        return 0, 0, (x_min, x_max, y_min, y_max)
    
    # Download tiles in parallel
    downloaded = 0
    failed = 0
    failed_tiles = []
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(download_tile, url, fp): (url, fp) for url, fp in tiles_to_download}
        
        for i, future in enumerate(as_completed(futures)):
            success, filepath, error = future.result()
            if success:
                downloaded += 1
            else:
                failed += 1
                if error != "404 - Not Found":  # Don't report 404s as failures
                    failed_tiles.append((filepath, error))
            
            # Progress update
            if (i + 1) % 50 == 0 or i + 1 == len(tiles_to_download):
                print(f"Progress: {i + 1}/{len(tiles_to_download)} (Downloaded: {downloaded}, Failed: {failed})")
    
    if failed_tiles:
        print(f"\nFailed tiles (non-404):")
        for fp, err in failed_tiles[:10]:
            print(f"  {fp}: {err}")
        if len(failed_tiles) > 10:
            print(f"  ... and {len(failed_tiles) - 10} more")
    
    return downloaded, failed, (x_min, x_max, y_min, y_max)


def stitch_tiles(tiles_dir, output_path, tile_bounds):
    """Stitch downloaded tiles into a single image."""
    x_min, x_max, y_min, y_max = tile_bounds
    
    width = (x_max - x_min + 1) * TILE_SIZE
    height = (y_max - y_min + 1) * TILE_SIZE
    
    print(f"\nStitching tiles into {width}x{height} image...")
    
    # Create output image with gray background (to show missing tiles)
    output_image = Image.new('RGB', (width, height), color=(128, 128, 128))
    
    tiles_placed = 0
    black_tiles = []
    
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            tile_path = tiles_dir / f"{x}_{y}.png"
            if tile_path.exists():
                try:
                    tile = Image.open(tile_path)
                    
                    # Check if tile is mostly black
                    if tile.mode in ('RGB', 'RGBA', 'P'):
                        gray = tile.convert('L')
                        pixels = list(gray.getdata())
                        avg_brightness = sum(pixels) / len(pixels)
                        if avg_brightness < 5:
                            black_tiles.append((x, y, avg_brightness))
                    
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
                    print(f"Error loading {tile_path}: {e}")
    
    print(f"Tiles placed: {tiles_placed}")
    
    if black_tiles:
        print(f"\n⚠️  Found {len(black_tiles)} black/dark tiles:")
        for x, y, brightness in black_tiles[:20]:
            print(f"  - {x}_{y}.png (brightness: {brightness:.1f})")
        if len(black_tiles) > 20:
            print(f"  ... and {len(black_tiles) - 20} more")
    
    # Save output
    print(f"\nSaving stitched image to: {output_path}")
    output_image.save(output_path, quality=95)
    print("Done!")
    
    return output_image


def main():
    # Configuration
    years = [2001, 2006, 2008, 2018]  # Re-downloading failed years only
    zoom = 19    # Zoom level (19 = high detail, matching tile2net)
    
    # Bounding box for North/Central Brooklyn
    # Format: [north_lat, west_lon, south_lat, east_lon]
    bbox = [40.7000, -74.0000, 40.6500, -73.9300]
    
    # Output directories - relative to project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    output_dir = project_root / "output" / "nyc_tiles"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("NYC Tile Downloader - maps.nyc.gov Historical Imagery")
    print("=" * 60)
    print(f"Years: {years}")
    print(f"Zoom: {zoom}")
    print(f"Bounding box: {bbox}")
    print(f"  North: {bbox[0]}, South: {bbox[2]}")
    print(f"  West: {bbox[1]}, East: {bbox[3]}")
    print(f"Output: {output_dir}")
    print()
    
    results = []
    
    for year in years:
        print("\n" + "=" * 60)
        print(f"📅 Processing Year: {year}")
        print("=" * 60)
        
        tiles_dir = output_dir / f"nyc_{year}" / f"{TILE_SIZE}_{zoom}"
        
        # Download tiles
        print("📥 Downloading tiles...")
        downloaded, failed, tile_bounds = download_tiles_for_area(
            year=year,
            zoom=zoom,
            bbox=bbox,
            output_dir=output_dir,
            max_workers=8
        )
        
        print(f"✅ Download complete: {downloaded} downloaded, {failed} failed/missing")
        
        # Stitch tiles
        stitched_path = output_dir / f"nyc_{year}_stitched.png"
        stitch_tiles(tiles_dir, stitched_path, tile_bounds)
        
        results.append({
            "year": year,
            "downloaded": downloaded,
            "failed": failed,
            "stitched": str(stitched_path)
        })
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for r in results:
        print(f"  {r['year']}: {r['downloaded']} tiles → {r['stitched']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
