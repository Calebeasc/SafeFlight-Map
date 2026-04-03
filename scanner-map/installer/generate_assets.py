"""
Generate installer wizard images for Invincible.Inc Setup.
Outputs wizard_banner.bmp and wizard_small.bmp in this script's directory.

Run:  python installer/generate_assets.py
Requires: Pillow  (pip install Pillow)
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))

# ── Brand palette ────────────────────────────────────────────────────────────
BG    = (11,  15,  20)   # #0b0f14
BG2   = (17,  24,  32)   # slightly lighter panels
EDGE  = (30,  45,  61)   # #1e2d3d  border/grid lines
CYAN  = (0,  212, 255)   # #00d4ff  primary accent
GREEN = (0,  230, 118)   # #00e676  GPS dot / positive
WHITE = (200, 216, 232)  # #c8d8e8  body text
DIM   = (90, 122, 150)   # #5a7a96  secondary text


def _blend(fg, alpha, bg=BG):
    """Blend fg into bg at 0.0–1.0 alpha, returning a solid RGB tuple."""
    return tuple(int(fg[i] * alpha + bg[i] * (1 - alpha)) for i in range(3))


def _font(size, bold=False):
    """Try common Windows font paths, fall back to Pillow default."""
    candidates = [
        f"C:/Windows/Fonts/{'arialbd' if bold else 'arial'}.ttf",
        f"C:/Windows/Fonts/{'calibrib' if bold else 'calibri'}.ttf",
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


# ── Wizard banner  (410 × 797)  left panel ───────────────────────────────────

def make_banner():
    W, H = 410, 797
    img  = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Subtle dot-grid background
    for gx in range(0, W, 28):
        for gy in range(0, H, 28):
            draw.point((gx, gy), fill=_blend(EDGE, 0.6))

    # ── Radar rings (bottom-centre focal point) ──────────────────────────────
    cx, cy = W // 2, 590
    ring_spec = [
        (320, 0.06), (260, 0.09), (205, 0.13),
        (155, 0.18), (110, 0.26), (70,  0.38), (38, 0.60),
    ]
    for r, a in ring_spec:
        c = _blend(CYAN, a)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=c, width=1)

    # Sweep line (45° from focal point, fading out)
    sweep_angle = math.radians(52)
    for step in range(1, 290, 2):
        fade = max(0.0, 1.0 - step / 260.0)
        col  = _blend(CYAN, fade * 0.55)
        sx   = cx + int(step * math.cos(sweep_angle))
        sy   = cy - int(step * math.sin(sweep_angle))
        if 0 <= sx < W and 0 <= sy < H:
            draw.ellipse([sx - 1, sy - 1, sx + 1, sy + 1], fill=col)

    # Cross-hair tick marks on the largest ring
    for angle_deg in range(0, 360, 30):
        a_rad = math.radians(angle_deg)
        r_in, r_out = 315, 323
        x1 = cx + int(r_in  * math.cos(a_rad))
        y1 = cy - int(r_in  * math.sin(a_rad))
        x2 = cx + int(r_out * math.cos(a_rad))
        y2 = cy - int(r_out * math.sin(a_rad))
        draw.line([x1, y1, x2, y2], fill=_blend(CYAN, 0.35), width=1)

    # Centre dot (green lock-on)
    draw.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=GREEN)
    draw.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=WHITE)

    # ── Top branding area ─────────────────────────────────────────────────────
    # Subtle panel behind the text
    for y in range(0, 220):
        alpha = 0.0 if y > 200 else 0.25 * (1 - y / 200)
        draw.line([(0, y), (W, y)], fill=_blend(BG2, alpha * 3 if alpha * 3 < 1 else 1))

    # Thin cyan bar at very top
    for y in range(3):
        draw.line([(0, y), (W, y)], fill=_blend(CYAN, 0.7))

    # Logo text
    f_title  = _font(38, bold=True)
    f_sub    = _font(16)
    f_tag    = _font(12)
    f_feat   = _font(13)
    f_small  = _font(11)

    # "Invincible.Inc" centred
    draw.text((W // 2, 54), "Invincible.Inc", font=f_title, fill=WHITE, anchor='mm')
    # "SCANNER" in cyan
    draw.text((W // 2, 90), "S C A N N E R", font=f_sub, fill=CYAN, anchor='mm')

    # Horizontal rule
    for y in [112, 113]:
        draw.line([(36, y), (W - 36, y)], fill=_blend(CYAN, 0.30))

    # Tagline
    draw.text((W // 2, 132), "Real-time WiFi & BLE encounter mapping", font=f_tag,
              fill=_blend(WHITE, 0.55), anchor='mm')

    # ── Feature bullets (middle band) ────────────────────────────────────────
    features = [
        ("📡", "WiFi & BLE scanning"),
        ("🗺", "Live GPS encounter map"),
        ("🚔", "Fun-Stopper detection & alerts"),
        ("⚡", "Multi-user real-time sharing"),
        ("🏆", "Top speed leaderboard"),
        ("🔒", "Operator access control"),
    ]
    fy = 178
    for icon, text in features:
        # bullet dot
        draw.ellipse([36, fy + 4, 42, fy + 10], fill=_blend(CYAN, 0.65))
        draw.text((54, fy), text, font=f_feat, fill=_blend(WHITE, 0.80))
        fy += 28

    # ── Bottom version strip ─────────────────────────────────────────────────
    draw.line([(0, H - 34), (W, H - 34)], fill=_blend(EDGE, 0.8))
    draw.text((W // 2, H - 17), "v1.0  ·  invincible.inc", font=f_small,
              fill=_blend(DIM, 0.7), anchor='mm')

    out_path = os.path.join(OUT, 'wizard_banner.bmp')
    img.save(out_path, format='BMP')
    print(f'  wizard_banner.bmp  ({W}×{H})')


# ── Wizard small icon  (58 × 58)  top-right corner ───────────────────────────

def make_small():
    S = 58
    img  = Image.new('RGB', (S, S), BG)
    draw = ImageDraw.Draw(img)

    cx = cy = S // 2

    # Rings
    for r, a in [(26, 0.18), (19, 0.30), (12, 0.50), (6, 0.80)]:
        c = _blend(CYAN, a)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=c, width=1)

    # Sweep
    angle = math.radians(50)
    for step in range(1, 26, 1):
        fade = max(0, 1.0 - step / 24.0)
        col  = _blend(CYAN, fade * 0.6)
        sx   = cx + int(step * math.cos(angle))
        sy   = cy - int(step * math.sin(angle))
        if 0 <= sx < S and 0 <= sy < S:
            draw.point((sx, sy), fill=col)

    # Centre
    draw.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=GREEN)

    out_path = os.path.join(OUT, 'wizard_small.bmp')
    img.save(out_path, format='BMP')
    print(f'  wizard_small.bmp   ({S}×{S})')


if __name__ == '__main__':
    print('Generating installer assets...')
    make_banner()
    make_small()
    print('Done.')
