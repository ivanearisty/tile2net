import modal
import os

# 1. Define the image with system dependencies and tile2net
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "git",
        "libgdal-dev",
        "gdal-bin",
        "libspatialindex-dev",
        "libgl1",  
        "libglib2.0-0"
    )
    .pip_install(
        "numpy<2.0",
        "git+https://github.com/VIDA-NYU/tile2net.git",
        "urllib3<2.0"
    )
)

app = modal.App("tile2net-runner")

# 2. Create a persistent volume
vol = modal.Volume.from_name("tile2net-data", create_if_missing=True)

@app.function(
    image=image,
    gpu="A100",
    cpu=4,
    memory=16384,
    timeout=86400,
    volumes={"/data": vol}
)
def run_tile2net(location_str: str, project_name: str, boundary_path: str | None = None):
    from tile2net import Raster
    import shutil

    output_dir = f"/data/outputs"
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"📍 Processing location: {location_str}")
    print(f"📂 Project Name: {project_name}")

    # --- FIX START ---
    # 1. Initialize Raster WITHOUT boundary_path first
    # This creates the grid of tiles (self.tiles) which is required before filtering
    raster = Raster(
        location=location_str,
        name=project_name,
        output_dir=output_dir,
        zoom=19, 
        # boundary_path=boundary_path,  <-- REMOVED: Do not pass this here
    )

    # 2. Apply boundary manually AFTER initialization
    if boundary_path and os.path.exists(boundary_path):
        print(f"✂️ Clipping grid to boundary: {boundary_path}")
        # This function modifies raster.tiles in place, setting those outside to inactive
        raster.get_in_boundary(path=boundary_path)
        print(f"ℹ️ Active tiles remaining: {raster.num_inside}")
    else:
        print(f"⚠️ Boundary skipped: Path '{boundary_path}' not found or not provided.")
    # --- FIX END ---

    # Step 1: Generate 
    # Because we ran get_in_boundary, this will ONLY download tiles inside the shapefile
    # INCREASED thread count for faster downloads (was 4, now 16)
    print("⬇️  Downloading and stitching tiles...")
    raster.generate(16) 

    # Step 2: Inference
    print("🧠 Running Inference (Segmentation)...")
    raster.inference()
    
    print(f"✅ Done! Results saved to volume at {output_dir}/{project_name}")
    
    return f"{output_dir}/{project_name}"

@app.local_entrypoint()
def main(location: str | None = None, name: str = "brooklyn_project"):
    import subprocess
    import os
    import json

    # Define boundary file path
    boundary_file = "boundries/Borough Boundaries (Clipped to Shoreline).json"
    
    # This is where the file will live INSIDE the remote container
    # Since we mount the volume to /data, and we upload to the root of the volume
    remote_boundary_path = "/data/boundary.json"

    if os.path.exists(boundary_file):
        print(f"📤 Uploading boundary file to Modal volume...")
        try:
            # Force overwrite (-f) to avoid "already exists" error
            subprocess.run(
                ["modal", "volume", "put", "--force", "tile2net-data", boundary_file, "boundary.json"],
                check=True
            )
            print("✅ Upload complete.")
        except subprocess.CalledProcessError as e:
            print(f"❌ Failed to upload boundary file: {e}")
            remote_boundary_path = None
        
        if location is None:
            print(f"📍 Calculating bounding box from {boundary_file}...")
            try:
                with open(boundary_file, 'r') as f:
                    data = json.load(f)
                
                for feature in data['features']:
                    if feature['properties'].get('BoroName') == 'Brooklyn':
                        minx, miny = float('inf'), float('inf')
                        maxx, maxy = float('-inf'), float('-inf')
                        
                        def update_bounds(coords):
                            nonlocal minx, miny, maxx, maxy
                            for item in coords:
                                if isinstance(item[0], (list, tuple)):
                                    update_bounds(item)
                                else:
                                    x, y = item
                                    minx = min(minx, x)
                                    miny = min(miny, y)
                                    maxx = max(maxx, x)
                                    maxy = max(maxy, y)

                        update_bounds(feature['geometry']['coordinates'])
                        location = f"{miny},{minx},{maxy},{maxx}"
                        print(f"✅ Found Brooklyn bounding box: {location}")
                        break
            except Exception as e:
                print(f"❌ Error reading boundary file: {e}")
                location = "40.5707,-74.0419,40.7395,-73.8334" # Fallback Brooklyn bbox
    else:
        print(f"⚠️ Boundary file not found at {boundary_file}. Proceeding without it.")
        remote_boundary_path = None
        if location is None:
            location = "40.5707,-74.0419,40.7395,-73.8334" # Fallback Brooklyn bbox

    print(f"🚀 Sending job to Modal...")
    output_path = run_tile2net.remote(location, name, boundary_path=remote_boundary_path) # type: ignore
    print(f"Remote execution finished. Data located at: {output_path}")