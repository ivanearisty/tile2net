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

app = modal.App("tile2net-nyc-batch")
vol = modal.Volume.from_name("tile2net-data", create_if_missing=True)

@app.function(
    image=image,
    gpu="A10G",
    cpu=4,
    memory=16384,
    timeout=86400,
    volumes={"/data": vol}
)
def process_year(year: int):
    from tile2net import Raster
    from tile2net.raster.source import Source
    
    # Inherit from Source (not ArcGis) to avoid type conflicts
    class NYS_Source(Source):
        ignore = True 
        def __init__(self, target_year):
            self.year = target_year
            # NYS MapServer Tile URL pattern
            self.tiles = f'https://orthos.its.ny.gov/arcgis/rest/services/wms/{target_year}/MapServer/tile/{{z}}/{{y}}/{{x}}'
            # Metadata server URL (required by tile2net for logging)
            self.server = f'https://orthos.its.ny.gov/arcgis/rest/services/wms/{target_year}/MapServer'
            self.name = f'nys_{target_year}'
            self.keyword = 'New York'
            self.zoom = 19
            self.extension = 'png'

    # North/Central Brooklyn
    location = [40.7000, -74.0000, 40.6500, -73.9300]
    project_name = f"bk_central_{year}"
    output_dir = "/data/outputs"
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"⏳ Processing Year: {year}")
    
    try:
        raster = Raster(
            location=location,
            name=project_name,
            output_dir=output_dir,
            source=NYS_Source(year), 
            zoom=19
        )
        
        print(f"⬇️  Downloading tiles for {year}...")
        raster.generate(4) 
        
        print(f"🧠 Running Inference for {year}...")
        raster.inference()
        
        return f"✅ Success: {year}"
    except Exception as e:
        return f"❌ Error processing {year}: {str(e)}"
    
@app.local_entrypoint()
def main():
    # The list of years to process
    years = [
        1996,
        2008,
        2016,
        2020,
        2022 
    ]
    
    print(f"🚀 Launching batch job for years: {years}")
    
    # Run in parallel on Modal
    results = list(process_year.map(years))
    
    for res in results:
        print(res)