"""
Generate installer wizard images for Invincible.Inc (user app) Setup.
Outputs wizard_banner.bmp and wizard_small.bmp in this script's directory.
"""
import os, math
from PIL import Image, ImageDraw

OUT  = os.path.dirname(os.path.abspath(__file__))
BG   = (11,  15,  20)
EDGE = (30,  45,  61)
CYAN = (0,  212, 255)
GREEN= (0,  230, 118)
WHITE= (200, 216, 232)
DIM  = (90, 122, 150)


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

    # Radar rings (focal at bottom-centre)
    cx, cy = W // 2, 600
    for r, a in [(310,0.06),(250,0.10),(195,0.15),(145,0.22),(100,0.33),(60,0.50),(30,0.70)]:
        d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=b(CYAN, a), width=1)

    # Sweep
    ang = math.radians(48)
    for step in range(2, 300, 3):
        fade = max(0, 1 - step/280)
        sx = cx + int(step * math.cos(ang))
        sy = cy - int(step * math.sin(ang))
        if 0 <= sx < W and 0 <= sy < H:
            d.ellipse([sx-1, sy-1, sx+1, sy+1], fill=b(CYAN, fade*0.55))

    # Tick marks
    for deg in range(0, 360, 30):
        a = math.radians(deg)
        for ri, ro in [(307, 315)]:
            x1 = cx + int(ri*math.cos(a)); y1 = cy - int(ri*math.sin(a))
            x2 = cx + int(ro*math.cos(a)); y2 = cy - int(ro*math.sin(a))
            d.line([x1, y1, x2, y2], fill=b(CYAN, 0.28), width=1)

    # Centre dot
    d.ellipse([cx-7, cy-7, cx+7, cy+7], fill=GREEN)
    d.ellipse([cx-3, cy-3, cx+3, cy+3], fill=WHITE)

    # Top fade overlay
    for y in range(230):
        a = max(0, 0.55 * (1 - y/200))
        d.line([(0, y), (W, y)], fill=b((17,24,32), min(a*2,1)))

    # Top cyan bar
    for y in range(3):
        d.line([(0, y), (W, y)], fill=b(CYAN, 0.75))

    # Title text
    d.text((W//2, 52),  'Invincible.Inc',   font=font(38, bold=True), fill=WHITE,          anchor='mm')
    d.text((W//2, 90),  'S C A N N E R',    font=font(15),             fill=b(CYAN, 0.9),  anchor='mm')

    # Rule
    for y in [111, 112]:
        d.line([(36, y), (W-36, y)], fill=b(CYAN, 0.28))

    d.text((W//2, 130), 'Full WiFi & BLE scanning with live GPS mapping',
           font=font(12), fill=b(WHITE, 0.50), anchor='mm')

    # Feature list
    feats = [
        'WiFi & BLE real-time scanning',
        'Live GPS map with encounter markers',
        'Fun-Stopper & Watcher detection',
        'Route history & heat map',
        'Multi-user presence & alerts',
        'Top speed leaderboard',
    ]
    fy = 168
    for feat in feats:
        d.ellipse([36, fy+5, 42, fy+11], fill=b(CYAN, 0.60))
        d.text((54, fy), feat, font=font(13), fill=b(WHITE, 0.78))
        fy += 29

    # Admin warning badge
    bx, by = 36, fy + 10
    bw, bh = W - 72, 38
    d.rectangle([bx, by, bx+bw, by+bh], fill=b(CYAN, 0.06), outline=b(CYAN, 0.20))
    d.text((bx + bw//2, by + bh//2),
           '⚠  Requires Administrator Access',
           font=font(11, bold=True), fill=b(CYAN, 0.70), anchor='mm')

    # Bottom strip
    d.line([(0, H-34), (W, H-34)], fill=b(EDGE, 0.9))
    d.text((W//2, H-17), 'v1.0  ·  invincible.inc',
           font=font(11), fill=b(DIM, 0.65), anchor='mm')

    img.save(os.path.join(OUT, 'wizard_banner.bmp'), format='BMP')
    print('  wizard_banner.bmp  (410×797)')


def make_small():
    S    = 58
    img  = Image.new('RGB', (S, S), BG)
    d    = ImageDraw.Draw(img)
    cx = cy = S // 2
    for r, a in [(26,0.18),(19,0.30),(12,0.52),(6,0.80)]:
        d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=b(CYAN, a), width=1)
    ang = math.radians(50)
    for step in range(1, 25):
        fade = max(0, 1 - step/23)
        sx = cx + int(step*math.cos(ang))
        sy = cy - int(step*math.sin(ang))
        if 0 <= sx < S and 0 <= sy < S:
            d.point((sx, sy), fill=b(CYAN, fade*0.6))
    d.ellipse([cx-3, cy-3, cx+3, cy+3], fill=GREEN)
    img.save(os.path.join(OUT, 'wizard_small.bmp'), format='BMP')
    print('  wizard_small.bmp   (58×58)')


if __name__ == '__main__':
    print('Generating Invincible.Inc installer assets...')
    make_banner()
    make_small()
    print('Done.')
