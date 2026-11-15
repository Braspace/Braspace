"""Deterministic CPU render of Joel's Moon HD south-polar terrain.

This is a static, orthographic visual preview of the same checked LOLA grid,
not a capture of the WebGL shader or a prediction of solar visibility.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

R = 1_737_400.0
SOURCE_SHA = 'a1244e43cb392feb55aa63ee2289de5a7a098847f2511ce5fba2fcafceccf23c'


def render(source: Path, output: Path, width: int = 1200, height: int = 800):
    data = source.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    if sha != SOURCE_SHA or len(data) != 2048 * 2048 * 2:
        raise ValueError('Moon HD native 80 m asset integrity mismatch')
    dem = np.frombuffer(data, dtype='<i2').reshape(2048, 2048).astype(np.float32) * .5
    origin, spacing = -81880.0, 80.0
    yy, xx = np.mgrid[:2048, :2048].astype(np.float32)
    x, y = origin + xx * spacing, origin + yy * spacing
    # Same south-polar stereographic reference sphere and radial relief as Moon HD.
    q = (x*x+y*y)/(4*R*R)
    elevation = (R + dem)*(1-q)/(1+q)-R
    gy, gx = np.gradient(elevation, spacing, spacing)
    # Fixed art-direction lighting: not current SPICE illumination.
    light = np.array([-0.63, -0.60, 0.49], dtype=np.float32)
    light /= np.linalg.norm(light)
    shade = np.clip((-gx*light[0]-gy*light[1]+light[2])/np.sqrt(1+gx*gx+gy*gy),0,1)
    # Orthographic camera tilted 18 degrees from nadir. Invert the projected
    # heightfield iteratively; low tilt keeps the projection single-valued.
    across = np.linspace(-65000, 65000, width, dtype=np.float32)
    vertical = np.linspace(-65000*height/width, 65000*height/width, height, dtype=np.float32)
    px, py = np.meshgrid(across, vertical)
    angle = np.deg2rad(18)
    sy = py/np.cos(angle)
    for _ in range(5):
        coords = ((sy-origin)/spacing, (px-origin)/spacing)
        h = map_coordinates(elevation, coords, order=1, mode='nearest')
        sy = (py + h*np.sin(angle))/np.cos(angle)
    coords = ((sy-origin)/spacing, (px-origin)/spacing)
    value = map_coordinates(shade, coords, order=1, mode='nearest')
    grey = np.clip((0.10 + value*0.86)**0.8,0,1)
    # Subtle neutral cool grade, still recognizably lunar rock.
    rgb = np.stack((grey*.94,grey*.97,grey), axis=-1)
    image = Image.fromarray(np.uint8(np.clip(rgb*255,0,255)), 'RGB')
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format='WEBP', quality=78, method=6)
    return {'source_sha256':sha, 'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
            'bytes':output.stat().st_size,'width':width,'height':height,
            'source':'web/data/moonhd/south_pole_80m.bin','illumination':'fixed illustrative; not SPICE',
            'projection':'orthographic CPU heightfield; 18 degrees from nadir'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    print(json.dumps(render(args.source,args.output),indent=2))
