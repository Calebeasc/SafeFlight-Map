"""
Generate Invincible.Inc app icon in multiple resolutions.
Outputs:
  backend/assets/icon.ico   — multi-res Windows icon (16,32,48,64,128,256)
  installer/icon.ico        — copy for Inno Setup

Run:  python installer/generate_icon.py
Requires: Pillow  (pip install Pillow)
"""
import os
import math
from PIL import Image, ImageDraw

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

BG    = (11,  15,  20)
CYAN  = (0,  212, 255)
GREEN = (0,  230, 118)
WHITE = (232, 240, 248)


def _blend(fg, alpha, bg=BG):
    return tuple(int(fg[i] * alpha + bg[i] * (1 - alpha)) for i in range(3))


def make_frame(size: int) -> Image.Image:
    """Draw one radar icon frame at the given pixel size."""
    img  = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx   = cy = size // 2
    pad  = max(1, size // 32)

    # Dark circle background
    draw.ellipse([pad, pad, size - pad - 1, size - pad - 1],
                 fill=(*BG, 255))

    # Outer border ring
    bw = max(1, size // 20)
    draw.ellipse([pad, pad, size - pad - 1, size - pad - 1],
                 outline=(*CYAN, 220), width=bw)

    # Inner radar rings (3 rings at 30 / 50 / 70 % of radius)
    r_max = cx - pad - bw - 1
    if r_max > 4:
        for frac, alpha in [(0.70, 0.40), (0.50, 0.28), (0.30, 0.18)]:
            r = max(2, int(r_max * frac))
            draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                         outline=_blend(CYAN, alpha) + (180,), width=1)

    # Sweep line (45 degrees)
    if size >= 24:
        sweep = math.radians(45)
        steps = max(4, int(r_max * 0.85))
        for step in range(1, steps):
            fade = max(0.0, 1.0 - step / steps)
            col  = _blend(CYAN, fade * 0.7)
            sx   = cx + int(step * math.cos(sweep))
            sy   = cy - int(step * math.sin(sweep))
            if 0 <= sx < size and 0 <= sy < size:
                r_dot = max(1, size // 48)
                draw.ellipse([sx - r_dot, sy - r_dot, sx + r_dot, sy + r_dot],
                             fill=(*col, 200))

    # Centre dot (green)
    dot_r = max(2, size // 12)
    draw.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
                 fill=(*GREEN, 255))
    # White highlight inside dot
    hi_r = max(1, dot_r // 2)
    draw.ellipse([cx - hi_r, cy - hi_r, cx + hi_r, cy + hi_r],
                 fill=(*WHITE, 200))

    return img


def build_ico(out_path: str):
    sizes = [256, 128, 64, 48, 32, 16]
    frames = [make_frame(s) for s in sizes]
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    # PIL saves multi-size .ico when given a list of sizes
    frames[0].save(
        out_path,
        format='ICO',
        sizes=[(s, s) for s in sizes],
        append_images=frames[1:],
    )
    print(f'  {out_path}  ({", ".join(str(s) for s in sizes)}px)')


if __name__ == '__main__':
    print('Generating icon...')
    primary = os.path.join(ROOT, 'backend', 'assets', 'icon.ico')
    build_ico(primary)
    # Copy to installer/ so Inno Setup can reference it easily
    import shutil
    installer_copy = os.path.join(ROOT, 'installer', 'icon.ico')
    shutil.copy2(primary, installer_copy)
    print(f'  {installer_copy}  (copy)')
    print('Done.')
