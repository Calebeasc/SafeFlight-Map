"""
Generate installer wizard images for DevInvincible.Inc (operator/dev app) Setup.
Outputs wizard_banner.bmp and wizard_small.bmp in this script's directory.
"""
import os, math
from PIL import Image, ImageDraw

OUT   = os.path.dirname(os.path.abspath(__file__))
BG    = (11,  15,  20)
EDGE  = (30,  45,  61)
# Dev accent: amber/gold instead of cyan
AMBER = (255, 214,  10)
GREEN = (0,  230, 118)
WHITE = (200, 216, 232)
DIM   = (90, 122, 150)
CYAN  = (0,  212, 255)   # used for secondary elements


def b(fg, a, bg=BG):
    return tuple(int(fg[i]*a + bg[i]*(1-a)) for i in range(3))


def font(size, bold=False):
    from PIL import ImageFont
    for p in [
        f"C:/Windows/Fonts/{'arialbd' if bold else 'arial'}.ttf",
        f"C:/Windows/Fonts/{'calibrib' if bold else 'calibri'}.ttf",
    ]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: pass
    return ImageFont.load_default()


def make_banner():
    W, H = 410, 797
    img  = Image.new('RGB', (W, H), BG)
    d    = ImageDraw.Draw(img)

    # Dot grid
    for gx in range(0, W, 28):
        for gy in range(0, H, 28):
            d.point((gx, gy), fill=b(EDGE, 0.55))

    # Radar rings — amber tint for dev/operator feel
    cx, cy = W // 2, 600
    for r, a in [(310,0.05),(250,0.09),(195,0.14),(145,0.20),(100,0.30),(60,0.48),(30,0.68)]:
        d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=b(AMBER, a), width=1)

    # Secondary cyan inner rings
    for r, a in [(80, 0.08), (45, 0.12)]:
        d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=b(CYAN, a), width=1)

    # Sweep (amber)
    ang = math.radians(52)
    for step in range(2, 295, 3):
        fade = max(0, 1 - step/275)
        sx = cx + int(step * math.cos(ang))
        sy = cy - int(step * math.sin(ang))
        if 0 <= sx < W and 0 <= sy < H:
            d.ellipse([sx-1, sy-1, sx+1, sy+1], fill=b(AMBER, fade*0.50))

    # Cross-hair ticks
    for deg in range(0, 360, 30):
        a = math.radians(deg)
        x1 = cx + int(307*math.cos(a)); y1 = cy - int(307*math.sin(a))
        x2 = cx + int(315*math.cos(a)); y2 = cy - int(315*math.sin(a))
        d.line([x1, y1, x2, y2], fill=b(AMBER, 0.25), width=1)

    # Extra cross-hair lines through centre
    d.line([(cx-20, cy), (cx+20, cy)], fill=b(AMBER, 0.20), width=1)
    d.line([(cx, cy-20), (cx, cy+20)], fill=b(AMBER, 0.20), width=1)

    # Centre lock-on dot (amber core)
    d.ellipse([cx-7, cy-7, cx+7, cy+7], fill=AMBER)
    d.ellipse([cx-3, cy-3, cx+3, cy+3], fill=WHITE)

    # Top fade
    for y in range(230):
        a = max(0, 0.55*(1-y/200))
        d.line([(0, y), (W, y)], fill=b((17,24,32), min(a*2, 1)))

    # Amber top bar (not cyan)
    for y in range(3):
        d.line([(0, y), (W, y)], fill=b(AMBER, 0.80))

    # Titles
    d.text((W//2, 52),  'DevInvincible.Inc', font=font(33, bold=True), fill=WHITE,         anchor='mm')
    d.text((W//2, 90),  'O P E R A T O R   T O O L S', font=font(11),  fill=b(AMBER,0.90), anchor='mm')

    # Rule (amber)
    for y in [111, 112]:
        d.line([(36, y), (W-36, y)], fill=b(AMBER, 0.25))

    d.text((W//2, 130), 'Full scanner suite for operators',
           font=font(12), fill=b(WHITE, 0.48), anchor='mm')

    # Feature list
    feats = [
        'WiFi & BLE real-time scanning',
        'Live GPS route recording',
        'Encounter detection & classification',
        'Multi-user presence & alerts',
        'Operator access control panel',
        'Data export & leaderboard',
    ]
    fy = 168
    for feat in feats:
        d.ellipse([36, fy+5, 42, fy+11], fill=b(AMBER, 0.65))
        d.text((54, fy), feat, font=font(13), fill=b(WHITE, 0.78))
        fy += 29

    # Admin warning badge
    bx, by = 36, fy + 10
    bw, bh = W - 72, 38
    d.rectangle([bx, by, bx+bw, by+bh], fill=b(AMBER, 0.08), outline=b(AMBER, 0.22))
    d.text((bx + bw//2, by + bh//2),
           '⚠  Requires Administrator Access',
           font=font(11, bold=True), fill=b(AMBER, 0.75), anchor='mm')

    # Bottom strip
    d.line([(0, H-34), (W, H-34)], fill=b(EDGE, 0.9))
    d.text((W//2, H-17), 'v1.0  ·  invincible.inc  ·  dev build',
           font=font(11), fill=b(DIM, 0.65), anchor='mm')

    img.save(os.path.join(OUT, 'wizard_banner.bmp'), format='BMP')
    print('  wizard_banner.bmp  (410×797)')


def make_small():
    S     = 58
    img   = Image.new('RGB', (S, S), BG)
    d     = ImageDraw.Draw(img)
    cx = cy = S // 2
    # Amber rings for dev
    for r, a in [(26,0.18),(19,0.30),(12,0.52),(6,0.80)]:
        d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=b(AMBER, a), width=1)
    # Crosshair
    d.line([(cx-8, cy), (cx+8, cy)], fill=b(AMBER, 0.20), width=1)
    d.line([(cx, cy-8), (cx, cy+8)], fill=b(AMBER, 0.20), width=1)
    # Centre
    d.ellipse([cx-3, cy-3, cx+3, cy+3], fill=AMBER)
    img.save(os.path.join(OUT, 'wizard_small.bmp'), format='BMP')
    print('  wizard_small.bmp   (58×58)')


if __name__ == '__main__':
    print('Generating DevInvincible.Inc installer assets...')
    make_banner()
    make_small()
    print('Done.')
