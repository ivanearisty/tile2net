#!/usr/bin/env python3
"""
Script to stitch all tile images from a directory into a single large image.
This helps debug why some files in the stitched version might be black.
"""

import os
import glob
from pathlib import Path
from PIL import Image
import re


def parse_tile_filename(filename):
    """Extract X and Y coordinates from tile filename like '154375_197162.png'"""
    basename = os.path.basename(filename)
    match = re.match(r'(\d+)_(\d+)\.png', basename)
    if match:
        return int(match.group(1)), int(match.group(2))
    return None, None


def stitch_tiles(input_dir, output_path, tile_size=256):
    """
    Stitch all PNG tiles in input_dir into a single image.
    
    Args:
        input_dir: Directory containing tile images named as X_Y.png
        output_path: Path to save the stitched output image
        tile_size: Size of each tile (default 256)
    """
    # Get all PNG files
    tile_files = glob.glob(os.path.join(input_dir, '*.png'))
    
    if not tile_files:
        print(f"No PNG files found in {input_dir}")
        return
    
    print(f"Found {len(tile_files)} tile files")
    
    # Parse coordinates from filenames
    tiles = []
    for f in tile_files:
        x, y = parse_tile_filename(f)
        if x is not None and y is not None:
            tiles.append((x, y, f))
    
    if not tiles:
        print("Could not parse any tile coordinates")
        return
    
    # Find bounds
    min_x = min(t[0] for t in tiles)
    max_x = max(t[0] for t in tiles)
    min_y = min(t[1] for t in tiles)
    max_y = max(t[1] for t in tiles)
    
    print(f"Tile coordinates range:")
    print(f"  X: {min_x} to {max_x} ({max_x - min_x + 1} tiles)")
    print(f"  Y: {min_y} to {max_y} ({max_y - min_y + 1} tiles)")
    
    # Calculate output image size
    width = (max_x - min_x + 1) * tile_size
    height = (max_y - min_y + 1) * tile_size
    
    print(f"Output image size: {width} x {height} pixels")
    
    # Check for potentially black/empty tiles
    black_tiles = []
    empty_tiles = []
    
    # Create the output image (RGB, white background)
    # Using white background to make missing tiles visible
    output_image = Image.new('RGB', (width, height), color=(200, 200, 200))
    
    # Place each tile
    for x, y, filepath in tiles:
        try:
            tile = Image.open(filepath)
            
            # Check if tile is mostly black
            if tile.mode == 'RGB' or tile.mode == 'RGBA':
                # Convert to grayscale to check brightness
                gray = tile.convert('L')
                avg_brightness = sum(gray.getdata()) / (tile.width * tile.height)
                if avg_brightness < 5:  # Very dark
                    black_tiles.append((x, y, filepath, avg_brightness))
            
            # Calculate position in output image
            # Note: Y increases downward in image coordinates
            pos_x = (x - min_x) * tile_size
            pos_y = (y - min_y) * tile_size
            
            # Paste tile (convert to RGB if needed)
            if tile.mode == 'RGBA':
                output_image.paste(tile, (pos_x, pos_y), tile)
            else:
                output_image.paste(tile.convert('RGB'), (pos_x, pos_y))
                
        except Exception as e:
            print(f"Error loading {filepath}: {e}")
            empty_tiles.append((x, y, filepath))
    
    # Report black tiles
    if black_tiles:
        print(f"\n⚠️  Found {len(black_tiles)} potentially black/dark tiles:")
        for x, y, filepath, brightness in black_tiles[:20]:  # Show first 20
            print(f"  - {os.path.basename(filepath)} (avg brightness: {brightness:.1f})")
        if len(black_tiles) > 20:
            print(f"  ... and {len(black_tiles) - 20} more")
    
    if empty_tiles:
        print(f"\n❌ Failed to load {len(empty_tiles)} tiles:")
        for x, y, filepath in empty_tiles[:10]:
            print(f"  - {os.path.basename(filepath)}")
    
    # Check for gaps in the tile grid
    tile_coords = set((t[0], t[1]) for t in tiles)
    expected_tiles = set()
    for x in range(min_x, max_x + 1):
        for y in range(min_y, max_y + 1):
            expected_tiles.add((x, y))
    
    missing_tiles = expected_tiles - tile_coords
    if missing_tiles:
        print(f"\n⚠️  Missing {len(missing_tiles)} tiles in the grid (will appear gray):")
        for x, y in sorted(missing_tiles)[:20]:
            print(f"  - {x}_{y}.png")
        if len(missing_tiles) > 20:
            print(f"  ... and {len(missing_tiles) - 20} more")
    
    # Save output
    print(f"\nSaving stitched image to: {output_path}")
    output_image.save(output_path, quality=95)
    print("Done!")
    
    return output_image


if __name__ == '__main__':
    # Input directory with tiles
    input_dir = '/Users/suape/WorkDir/tile2net/output/bk_central_2022/bk_central_2022/tiles/static/nys_2022/256_19'
    
    # Output path for stitched image
    output_path = '/Users/suape/WorkDir/tile2net/output/bk_central_2022/bk_central_2022_stitched.png'
    
    # Tile size
    tile_size = 256
    
    stitch_tiles(input_dir, output_path, tile_size)
