"""
tile2net_from_image.py

Process a large aerial image (PNG) by:
1. Tiling it into 256x256 tiles
2. Running tile2net inference on the tiles
3. Generating pedestrian network outputs

This script takes a pre-downloaded stitched aerial image instead of 
pulling tiles from an API.
"""
import modal
import os
import math

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "git", "libgdal-dev", "gdal-bin", "libspatialindex-dev",
        "libgl1", "libglib2.0-0"
    )
    .pip_install(
        "numpy<2.0",
        "Pillow",
        "git+https://github.com/VIDA-NYU/tile2net.git",
        "urllib3<2.0"
    )
)

app = modal.App("tile2net-from-image")
vol = modal.Volume.from_name("tile2net-data", create_if_missing=True)


def tile_large_image(input_path: str, output_dir: str, tile_size: int = 256,
                     xtile_start: int = 0, ytile_start: int = 0):
    """
    Tile a large image into smaller tiles.
    
    Args:
        input_path: Path to the large PNG image
        output_dir: Directory to save tiles (will create x_y.png files)
        tile_size: Size of each tile (default 256)
        xtile_start: Starting x tile coordinate (slippy map coordinate)
        ytile_start: Starting y tile coordinate (slippy map coordinate)
    
    Returns:
        Tuple of (num_tiles_x, num_tiles_y, tile_bounds)
    """
    from PIL import Image
    import os
    
    print(f"📂 Loading image from {input_path}...")
    img = Image.open(input_path)
    width, height = img.size
    print(f"   Image size: {width} x {height} pixels")
    
    # Calculate number of tiles
    num_tiles_x = math.ceil(width / tile_size)
    num_tiles_y = math.ceil(height / tile_size)
    total_tiles = num_tiles_x * num_tiles_y
    print(f"   Will create {num_tiles_x} x {num_tiles_y} = {total_tiles} tiles")
    print(f"   Starting at tile coordinates: ({xtile_start}, {ytile_start})")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Create tiles
    tiles_created = 0
    for y in range(num_tiles_y):
        for x in range(num_tiles_x):
            # Calculate crop box
            left = x * tile_size
            upper = y * tile_size
            right = min(left + tile_size, width)
            lower = min(upper + tile_size, height)
            
            # Crop tile
            tile = img.crop((left, upper, right, lower))
            
            # If tile is smaller than tile_size (edge tiles), pad it
            if tile.size != (tile_size, tile_size):
                padded = Image.new('RGB', (tile_size, tile_size), (0, 0, 0))
                padded.paste(tile, (0, 0))
                tile = padded
            
            # Save tile with slippy map coordinates
            tile_x = xtile_start + x
            tile_y = ytile_start + y
            tile_path = os.path.join(output_dir, f"{tile_x}_{tile_y}.png")
            tile.save(tile_path)
            tiles_created += 1
            
            if tiles_created % 100 == 0:
                print(f"   Created {tiles_created}/{total_tiles} tiles...")
    
    print(f"✅ Created {tiles_created} tiles in {output_dir}")
    
    return num_tiles_x, num_tiles_y, (xtile_start, xtile_start + num_tiles_x - 1, ytile_start, ytile_start + num_tiles_y - 1)


@app.function(
    image=image,
    gpu="A100-80GB",
    cpu=4,
    timeout=86400,
    volumes={"/data": vol}
)
def process_image(
    image_path: str,
    project_name: str,
    bbox: list,  # [north_lat, west_lon, south_lat, east_lon]
    zoom: int = 19,
    tile_size: int = 256
):
    """
    Process a large aerial image through tile2net.
    
    Args:
        image_path: Path to the large PNG image (on the volume)
        project_name: Name for the output project
        bbox: Bounding box [north_lat, west_lon, south_lat, east_lon]
        zoom: Zoom level for geo-referencing (default 19)
        tile_size: Tile size (default 256)
    """
    from tile2net import Raster
    import json
    import os
    
    output_dir = "/data/outputs"
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"⏳ Processing image: {image_path}")
    print(f"   Project: {project_name}")
    print(f"   Bounding box: {bbox}")
    
    try:
        # Step 1: Create a temporary Raster to get expected tile coordinates
        print("\n📐 Step 1: Setting up tile2net and getting tile coordinates...")
        temp_raster = Raster(
            location=bbox,  # [north, west, south, east]
            name=project_name,
            output_dir=output_dir,
            zoom=zoom
        )
        xtile_start = temp_raster.xtile
        ytile_start = temp_raster.ytile
        print(f"   Expected tile range: x=[{xtile_start}, {temp_raster.xtilem}], y=[{ytile_start}, {temp_raster.ytilem}]")
        
        # Create tiles directory in the static location (where tile2net expects them)
        tiles_dir = os.path.join(output_dir, project_name, "tiles", "static")
        os.makedirs(tiles_dir, exist_ok=True)
        
        # Step 2: Tile the large image with correct slippy map coordinates
        print("\n📐 Step 2: Tiling the image...")
        num_x, num_y, tile_bounds = tile_large_image(
            input_path=image_path,
            output_dir=tiles_dir,
            tile_size=tile_size,
            xtile_start=xtile_start,
            ytile_start=ytile_start
        )
        
        # Step 3: Create the Raster with input_dir pointing to our tiles
        print("\n🔧 Step 3: Setting up tile2net Raster...")
        input_pattern = os.path.join(tiles_dir, "x_y.png")
        
        raster = Raster(
            location=bbox,  # [north, west, south, east]
            name=project_name,
            output_dir=output_dir,
            input_dir=input_pattern,
            zoom=zoom
        )
        
        # Step 4: Generate project structure and info JSON (required before inference)
        print("\n📝 Step 4: Generating project structure...")
        raster.generate(step=1)  # stitch_step=1 since tiles are already 256x256
        
        # Step 5: Run inference
        print("\n🧠 Step 5: Running inference...")
        raster.inference()
        
        print(f"\n✅ Success! Output saved to {output_dir}/{project_name}")
        return f"✅ Success: {project_name}"
        
    except Exception as e:
        import traceback
        error_msg = f"❌ Error: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return error_msg


@app.function(
    image=image,
    cpu=2,
    timeout=3600,
    volumes={"/data": vol}
)
def upload_image(local_path: str, remote_path: str):
    """
    Helper function to check if an image exists on the volume.
    The actual upload should be done via modal volume put command.
    """
    import os
    if os.path.exists(remote_path):
        from PIL import Image
        img = Image.open(remote_path)
        return f"✅ Image found: {remote_path} ({img.size[0]}x{img.size[1]})"
    else:
        return f"❌ Image not found: {remote_path}. Upload using: modal volume put tile2net-data {local_path} {remote_path}"


@app.local_entrypoint()
def main():
    """
    Process a large aerial image through tile2net.
    
    Before running, upload your image to the Modal volume:
        modal volume put tile2net-data /path/to/your/image.png /images/nyc_2018.png
    """
    # Configuration
    image_path = "/data/images/nyc_2018.png"  # Path on the Modal volume
    project_name = "nyc_2018_from_image"
    
    # Bounding box for North/Central Brooklyn
    # Format: [north_lat, west_lon, south_lat, east_lon]
    bbox = [40.7000, -74.0000, 40.6500, -73.9300]
    
    print("=" * 60)
    print("tile2net from Image - Processing Pre-Downloaded Aerial Photo")
    print("=" * 60)
    print(f"Image path: {image_path}")
    print(f"Project: {project_name}")
    print(f"Bounding box: {bbox}")
    print()
    
    # First check if image exists
    print("📋 Checking if image exists on volume...")
    check_result = upload_image.remote("", image_path)
    print(check_result)
    
    if "not found" in check_result.lower():
        print("\n⚠️  Please upload your image first:")
        print(f"   modal volume put tile2net-data /path/to/your/large_image.png {image_path.replace('/data/', '/')}")
        return
    
    # Process the image
    print("\n🚀 Starting image processing...")
    result = process_image.remote(
        image_path=image_path,
        project_name=project_name,
        bbox=bbox,
        zoom=19,
        tile_size=256
    )
    print(result)


# Alternative entrypoint for batch processing multiple images
@app.local_entrypoint()
def batch():
    """Process multiple years/images in parallel."""
    
    # Configuration for multiple images
    images = [
        {
            "image_path": "/data/images/nyc_2018.png",
            "project_name": "nyc_2018",
            "bbox": [40.7000, -74.0000, 40.6500, -73.9300],
        },
        {
            "image_path": "/data/images/nyc_2016.png", 
            "project_name": "nyc_2016",
            "bbox": [40.7000, -74.0000, 40.6500, -73.9300],
        },
    ]
    
    print(f"🚀 Launching batch job for {len(images)} images")
    
    # Run in parallel
    results = list(process_image.starmap([
        (img["image_path"], img["project_name"], img["bbox"])
        for img in images
    ]))
    
    for result in results:
        print(result)

