import modal
import os

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "git", "libgdal-dev", "gdal-bin", "libspatialindex-dev",
        "libgl1", "libglib2.0-0"
    )
    .pip_install(
        "numpy<2.0",
        "git+https://github.com/VIDA-NYU/tile2net.git",
        "urllib3<2.0"
    )
)

app = modal.App("tile2net-nyc-historical")
vol = modal.Volume.from_name("tile2net-data", create_if_missing=True)

@app.function(
    image=image,
    gpu="T4",
    timeout=3600,
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
            self.tiles = f'https://maps.nyc.gov/xyz/1.0.0/photo/{target_year}/{{z}}/{{x}}/{{y}}.png8'
            
            # --- FIX IS HERE ---
            # tile2net requires a 'server' attribute for metadata logging
            self.server = f'https://maps.nyc.gov/xyz/1.0.0/photo/{target_year}'
            
            self.zoom = 19
            self.extension = 'png'
            self.name = f'nyc_{target_year}'
            self.keyword = 'New York City'

    # --- SETUP ---
    location = "Grand Army Plaza, Brooklyn, NY"
    project_name = f"bk_gap_{year}"
    output_dir = "/data/outputs"
    os.makedirs(output_dir, exist_ok=True)

    print(f"⏳ Processing Year: {year}")
    
    # Instantiate the source
    if year in [2008, 2010, 2012, 2014, 2016, 2018]:
        source = NYC_XYZ_Source(year)
    else:
        print(f"⚠️ Year {year} might not be hosted on NYC XYZ. Trying generic...")
        source = NYC_XYZ_Source(year)

    # Initialize Raster
    raster = Raster(
        location=location,
        name=project_name,
        output_dir=output_dir,
        source=source, 
        zoom=19
    )

    # --- EXECUTION ---
    print(f"⬇️  Downloading tiles for {year}...")
    raster.generate(4) 
    
    print(f"🧠 Running Inference for {year}...")
    raster.inference()
    
    return f"{output_dir}/{project_name}"

@app.local_entrypoint()
def main():
    years_to_process = [2014, 2016, 2018]
    
    for year in years_to_process:
        print(f"\n🚀 Starting job for {year}...")
        try:
            output_path = run_brooklyn_history.remote(year)
            print(f"✅ Finished {year}. Data at: {output_path}")
        except Exception as e:
            print(f"❌ Failed {year}: {e}")

    print("\nTo download results:")
    for year in years_to_process:
        print(f"modal volume get tile2net-data outputs/bk_gap_{year} ./bk_data_{year}")