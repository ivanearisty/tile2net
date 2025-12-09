import modal
import os
import math
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "git", "libgdal-dev", "gdal-bin", "libspatialindex-dev",
        "libgl1", "libglib2.0-0"
    )
    .pip_install(
        "numpy<2.0",
        "git+https://github.com/VIDA-NYU/tile2net.git",
        "urllib3<2.0",
        "requests"
    )
)

app = modal.App("tile2net-nyc-historical")
vol = modal.Volume.from_name("tile2net-data", create_if_missing=True)

def lat_lon_to_tile(lat, lon, zoom):
    """Convert lat/lon to tile coordinates at given zoom level."""
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def download_tiles_with_retry(year, zoom, bbox, output_dir, max_workers=8):
    """
    Download tiles with proper retry logic, connection pooling, and rate limiting.
    """
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    
    north_lat, west_lon, south_lat, east_lon = bbox
    
    # Get tile bounds
    x_min, y_max = lat_lon_to_tile(south_lat, west_lon, zoom)
    x_max, y_min = lat_lon_to_tile(north_lat, east_lon, zoom)
    
    print(f"📊 Tile bounds: X=[{x_min}, {x_max}], Y=[{y_min}, {y_max}]")
    total_tiles = (x_max - x_min + 1) * (y_max - y_min + 1)
    print(f"📦 Total tiles to check: {total_tiles}")
    
    # Create output directory matching tile2net's expected structure
    url_year = "2001-2" if year == 2001 else str(year)
    tiles_dir = Path(output_dir) / f"tiles/static/nyc_{year}/256_{zoom}"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    
    # Setup session with connection pooling and retry logic
    session = requests.Session()
    retry_strategy = Retry(
        total=5,
        backoff_factor=1,  # 1, 2, 4, 8, 16 seconds
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(
        max_retries=retry_strategy,
        pool_connections=10,
        pool_maxsize=10
    )
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    
    # Headers to look like a real browser
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://maps.nyc.gov/'
    }
    
    # Build list of tiles to download
    tiles_to_download = []
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            # tile2net expects format: {x}_{y}.png
            filepath = tiles_dir / f"{x}_{y}.png"
            if not filepath.exists():
                url = f"https://maps.nyc.gov/xyz/1.0.0/photo/{url_year}/{zoom}/{x}/{y}.png8"
                tiles_to_download.append((url, filepath, x, y))
    
    print(f"⬇️  Tiles to download: {len(tiles_to_download)} (skipping {total_tiles - len(tiles_to_download)} existing)")
    
    if not tiles_to_download:
        print("✅ All tiles already downloaded!")
        return tiles_dir, 0, 0
    
    def download_single_tile(args):
        url, filepath, x, y = args
        # Small delay to avoid hammering the server
        time.sleep(0.1)
        for attempt in range(5):
            try:
                response = session.get(url, headers=headers, timeout=30)
                if response.status_code == 200:
                    with open(filepath, 'wb') as f:
                        f.write(response.content)
                    return True, filepath, None
                elif response.status_code == 404:
                    return False, filepath, "404"
                elif response.status_code == 429:
                    # Rate limited - wait longer
                    time.sleep(5 * (attempt + 1))
                else:
                    if attempt == 4:
                        return False, filepath, f"HTTP {response.status_code}"
                    time.sleep(2 ** attempt)
            except Exception as e:
                if attempt == 4:
                    return False, filepath, str(e)
                # Exponential backoff
                time.sleep(2 ** attempt)
        return False, filepath, "Max retries"
    
    # Download with limited concurrency
    downloaded = 0
    failed = 0
    failed_tiles = []
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(download_single_tile, args): args for args in tiles_to_download}
        
        for i, future in enumerate(as_completed(futures)):
            success, filepath, error = future.result()
            if success:
                downloaded += 1
            else:
                failed += 1
                if error != "404":
                    failed_tiles.append((filepath, error))
            
            if (i + 1) % 100 == 0 or i + 1 == len(tiles_to_download):
                print(f"📥 Progress: {i + 1}/{len(tiles_to_download)} (✓ {downloaded}, ✗ {failed})")
    
    if failed_tiles and len(failed_tiles) <= 20:
        print(f"\n⚠️  Failed tiles (non-404):")
        for fp, err in failed_tiles:
            print(f"  {fp.name}: {err}")
    elif failed_tiles:
        print(f"\n⚠️  {len(failed_tiles)} tiles failed (non-404 errors)")
    
    return tiles_dir, downloaded, failed


@app.function(
    image=image,
    gpu="A100-80GB",
    cpu=4,
    memory=16384,
    timeout=86400,
    volumes={"/data": vol}
)
def run_brooklyn_history(year: int):
    from tile2net import Raster
    from tile2net.raster.source import Source
    
    # --- DEFINE CUSTOM SOURCES ---
    
    class NYC_XYZ_Source(Source):
        ignore = True 
        
        def __init__(self, target_year):
            self.year = target_year
            # 2001 uses "2001-2" in the URL
            url_year = "2001-2" if target_year == 2001 else str(target_year)
            self.tiles = f'https://maps.nyc.gov/xyz/1.0.0/photo/{url_year}/{{z}}/{{x}}/{{y}}.png8'
            self.server = f'https://maps.nyc.gov/xyz/1.0.0/photo/{url_year}'
            self.zoom = 19
            self.extension = 'png'
            self.name = f'nyc_{target_year}'
            self.keyword = 'New York City'

    # --- SETUP ---
    # Bounding box for North/Central Brooklyn [north_lat, west_lon, south_lat, east_lon]
    bbox = [40.7000, -74.0000, 40.6500, -73.9300]
    project_name = f"bk_central_{year}"
    output_dir = "/data/outputs"
    project_dir = f"{output_dir}/{project_name}"
    os.makedirs(project_dir, exist_ok=True)

    print(f"⏳ Processing Year: {year}")
    
    # --- STEP 1: Download tiles ourselves with better error handling ---
    print(f"⬇️  Downloading tiles for {year} with retry logic...")
    tiles_dir, downloaded, failed = download_tiles_with_retry(
        year=year,
        zoom=19,
        bbox=bbox,
        output_dir=project_dir,
        max_workers=3  # Reduced to avoid rate limiting from NYC server
    )
    print(f"✅ Download complete: {downloaded} downloaded, {failed} failed/missing")
    
    # --- STEP 2: Now run tile2net (tiles are already on disk) ---
    source = NYC_XYZ_Source(year)

    raster = Raster(
        location=bbox,
        name=project_name,
        output_dir=output_dir,
        source=source, 
        zoom=19
    )

    # This will find cached tiles and just stitch them
    print(f"🔗 Stitching tiles...")
    raster.generate(4) 
    
    print(f"🧠 Running Inference for {year}...")
    raster.inference()
    
    return f"{output_dir}/{project_name}"

@app.local_entrypoint()
def main():
    years_to_process = [2018, 2020, 2022]  # Re-running 2006
    
    for year in years_to_process:
        print(f"\n🚀 Starting job for {year}...")
        try:
            output_path = run_brooklyn_history.remote(year)
            print(f"✅ Finished {year}. Data at: {output_path}")
        except Exception as e:
            print(f"❌ Failed {year}: {e}")

    print("\nTo download results:")
    for year in years_to_process:
        print(f"modal volume get tile2net-data outputs/bk_central_{year} ./bk_data_{year}")