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
        "libgl1",       # <--- ADDED: Fixes libGL.so.1 error
        "libglib2.0-0"  # <--- ADDED: Required for OpenCV
    )
    .pip_install(
        "numpy<2.0",
        "git+https://github.com/VIDA-NYU/tile2net.git",
        "urllib3<2.0"
    )
)

app = modal.App("tile2net-runner")

# 2. Create a persistent volume to store the downloaded tiles and output shapefiles
vol = modal.Volume.from_name("tile2net-data", create_if_missing=True)

@app.function(
    image=image,
    gpu="T4",
    timeout=3600,
    volumes={"/data": vol}
)
def run_tile2net(location_str: str, project_name: str):
    from tile2net import Raster
    import shutil

    # Define paths inside the remote container
    output_dir = f"/data/outputs"
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"📍 Processing location: {location_str}")
    print(f"📂 Project Name: {project_name}")

    # Initialize the Raster object
    raster = Raster(
        location=location_str,
        name=project_name,
        output_dir=output_dir,
        zoom=19, 
    )

    # Step 1: Generate (Download tiles and Stitch)
    print("⬇️  Downloading and stitching tiles...")
    raster.generate(4) 

    # Step 2: Inference (Run the Neural Network)
    print("🧠 Running Inference (Segmentation)...")
    raster.inference()
    
    print(f"✅ Done! Results saved to volume at {output_dir}/{project_name}")
    
    return f"{output_dir}/{project_name}"

@app.local_entrypoint()
def main(location: str = "Boston Common, MA", name: str = "boston_project"):
    print(f"🚀 Sending job to Modal...")
    output_path = run_tile2net.remote(location, name)
    print(f"Remote execution finished. Data located at: {output_path}")
    print(f"Run the following command to download your data:")
    print(f"modal volume get tile2net-data outputs/{name} ./local_results")