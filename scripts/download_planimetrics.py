"""
NYC Planimetrics Historical Data - Download Instructions

NYC Planimetrics data contains official surveyed infrastructure including:
- Sidewalks, curbs, crosswalks
- Street centerlines
- Plazas and open spaces
- Building footprints

⚠️  IMPORTANT: NYC Planimetrics data requires MANUAL download from official portals.
    Automated downloads are not available due to authentication/access restrictions.

Data sources:
1. NYC Open Data Portal: https://data.cityofnewyork.us
   - Search for "Planimetrics" or specific features like "Sidewalk", "Curb", "Crosswalk"
   
2. NYC Planning BYTES Archive: https://www.nyc.gov/site/planning/data-maps/open-data/bytes-archive.page
   - Historical planimetrics data back to 1996

Available years: 1996, 2004, 2014, 2022 (main releases)
                 Individual features may have different years available

Usage:
    python download_planimetrics.py --help     # Show download instructions
    python download_planimetrics.py --list     # List available years and status
"""

import os
import sys
from pathlib import Path

# Output directory for downloaded data
OUTPUT_DIR = Path("NYC_Planimetrics_Historical_Data")

# NYC Planimetrics data - manual download required
PLANIMETRICS_INFO = {
    1996: {
        "format": "shapefile",
        "description": "1996 NYC Planimetrics",
        "download_url": "https://www.nyc.gov/site/planning/data-maps/open-data/bytes-archive.page",
        "notes": "Look for 'Planimetrics 1996' in the BYTES archive"
    },
    2004: {
        "format": "shapefile", 
        "description": "2004 NYC Planimetrics",
        "download_url": "https://www.nyc.gov/site/planning/data-maps/open-data/bytes-archive.page",
        "notes": "Look for 'Planimetrics 2004' in the BYTES archive"
    },
    2014: {
        "format": "gdb",
        "description": "2014 NYC Planimetrics (File Geodatabase)",
        "download_url": "https://data.cityofnewyork.us/City-Government/Planimetric-Database-2014/xd8h-7j2h",
        "notes": "Click 'Export' → 'Download as Shapefile' or 'Original'"
    },
    2022: {
        "format": "gdb",
        "description": "2022 NYC Planimetrics (File Geodatabase)", 
        "download_url": "https://data.cityofnewyork.us/City-Government/NYC-Planimetrics/wvba-fuzw",
        "notes": "Latest planimetrics - click 'Export' to download"
    },
}


def check_local_data():
    """Check what planimetrics data is already downloaded"""
    downloaded = {}
    if OUTPUT_DIR.exists():
        for item in OUTPUT_DIR.iterdir():
            if item.is_dir():
                # Extract year from folder name
                name = item.name
                for year in PLANIMETRICS_INFO.keys():
                    if str(year) in name:
                        downloaded[year] = item
                        break
    return downloaded


def list_available_years():
    """Print available years and download instructions"""
    downloaded = check_local_data()
    
    print("\n📊 NYC Planimetrics Data Status:")
    print("=" * 70)
    
    for year in sorted(PLANIMETRICS_INFO.keys()):
        info = PLANIMETRICS_INFO[year]
        if year in downloaded:
            status = f"✅ Downloaded → {downloaded[year].name}"
        else:
            status = "❌ Not downloaded"
        print(f"  {year}: {info['format'].upper():10} - {status}")
    
    print()


def show_download_instructions():
    """Show manual download instructions"""
    print("\n" + "=" * 70)
    print("📥 MANUAL DOWNLOAD INSTRUCTIONS")
    print("=" * 70)
    print("""
NYC Planimetrics data must be downloaded manually from official portals.
Automated downloads are blocked by NYC's servers.

🔗 DOWNLOAD SOURCES:

1. NYC Open Data Portal (Recommended for recent data)
   https://data.cityofnewyork.us
   
   Search for:
   - "NYC Planimetrics" - Full planimetric database
   - "Sidewalk" - Sidewalk polygons
   - "Curb" - Curb features
   - "Crosswalk" - Crosswalk markings
   - "Street Centerline" - Street network

2. NYC Planning BYTES Archive (For historical data)
   https://www.nyc.gov/site/planning/data-maps/open-data/bytes-archive.page
   
   Look for "Planimetrics" datasets from different years.

📁 AFTER DOWNLOADING:

1. Create folder: NYC_Planimetrics_Historical_Data/
2. Extract downloaded files into year-specific folders:
   - NYC_Planimetrics_Historical_Data/NYC_Planimetrics_1996/
   - NYC_Planimetrics_Historical_Data/NYC_Planimetrics_2004/
   - NYC_Planimetrics_Historical_Data/NYC_Planimetrics_2014.gdb/
   - NYC_Planimetrics_Historical_Data/NYC_Planimetrics_2022.gdb/

3. Run conversion scripts:
   python scripts/convert_planimetrics.py      # For shapefiles
   python scripts/convert_planimetrics_gdb.py  # For .gdb files
""")
    
    print("\n📋 SPECIFIC DOWNLOAD LINKS:")
    print("-" * 70)
    for year in sorted(PLANIMETRICS_INFO.keys()):
        info = PLANIMETRICS_INFO[year]
        print(f"\n  📅 {year} ({info['format'].upper()}):")
        print(f"     {info['download_url']}")
        print(f"     Note: {info['notes']}")
    
    print()


def main():
    print("🗽 NYC Planimetrics Historical Data")
    print("=" * 70)
    
    # Parse arguments
    if "--help" in sys.argv or "-h" in sys.argv:
        print(__doc__)
        show_download_instructions()
        return
    
    if "--list" in sys.argv or "-l" in sys.argv:
        list_available_years()
        return
    
    # Default: show status and instructions
    list_available_years()
    show_download_instructions()


if __name__ == "__main__":
    main()

