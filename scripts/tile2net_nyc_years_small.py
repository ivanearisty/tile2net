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
            self.tiles = f'https://maps.nyc.gov/xyz/1.0.0/photo/{target_year}/{{z}}/{{x}}/{{y}}.png8'
            self.server = f'https://maps.nyc.gov/xyz/1.0.0/photo/{target_year}'
            self.zoom = 19
            self.extension = 'png'
            self.name = f'nyc_{target_year}'
            self.keyword = 'New York City'

    location = [40.7000, -74.0000, 40.6500, -73.9300]
    project_name = f"bk_central_{year}"
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
    years_to_process = [
        # 1996, # did not work
        # 2004, # worked
        # 2008, # did not work
        # 2010, # worked
        # 2012, # worked
        # 2014, # worked
        # 2016, # did not work
        # 2018, # worked
        # 2020, # did not work
        # 2022, # worked
        ]
    
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


"""
Error for 1996:

Geocoding nys_1996, this may take a while...
INFO       Geocoded 'nys_1996' to
	'1996, NYS Route 32/Schuylerville Road, Jewell Corner, Gansevoort, Town of Northumberland, Saratoga County, New York, 12831, United States'
INFO       Using base_tilesize=256 from source
WARNING    No polygons were dumped
Traceback (most recent call last):
  File "/usr/local/lib/python3.10/runpy.py", line 196, in _run_module_as_main
    return _run_code(code, main_globals, None,
  File "/usr/local/lib/python3.10/runpy.py", line 86, in _run_code
    exec(code, run_globals)
  File "/usr/local/lib/python3.10/site-packages/tile2net/__main__.py", line 6, in <module>
    argh.dispatch_commands([
  File "/usr/local/lib/python3.10/site-packages/argh/dispatching.py", line 358, in dispatch_commands
    dispatch(parser, *args, **kwargs)
  File "/usr/local/lib/python3.10/site-packages/argh/dispatching.py", line 183, in dispatch
    for line in lines:
  File "/usr/local/lib/python3.10/site-packages/argh/dispatching.py", line 294, in _execute_command
    for line in result:
  File "/usr/local/lib/python3.10/site-packages/argh/dispatching.py", line 247, in _call
    result = function(namespace_obj)
  File "/usr/local/lib/python3.10/site-packages/tile2net/namespace.py", line 671, in wrapper
    return func(namespace, **kwargs)
  File "/usr/local/lib/python3.10/site-packages/tile2net/tileseg/inference/inference.py", line 405, in inference
    return inference.inference()
  File "/usr/local/lib/python3.10/site-packages/tile2net/tileseg/inference/inference.py", line 210, in inference
    self.validate(
  File "/usr/local/lib/python3.10/site-packages/tile2net/tileseg/inference/inference.py", line 316, in validate
    grid.save_ntw_polygons(poly_network)
  File "/usr/local/lib/python3.10/site-packages/tile2net/raster/grid.py", line 676, in save_ntw_polygons
    poly_network.set_crs(self.crs, inplace=True)
  File "/usr/local/lib/python3.10/site-packages/geopandas/geodataframe.py", line 1741, in set_crs
    df.geometry = df.geometry.set_crs(
  File "/usr/local/lib/python3.10/site-packages/pandas/core/generic.py", line 6321, in __getattr__
    return object.__getattribute__(self, name)
  File "/usr/local/lib/python3.10/site-packages/geopandas/geodataframe.py", line 287, in _get_geometry
    raise AttributeError(msg)
AttributeError: You are calling a geospatial method on the GeoDataFrame, but the active geometry column to use has not been set. 
There are no existing columns with geometry data type. You can add a geometry column as the active geometry column with df.set_geometry. 
"""