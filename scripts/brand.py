"""Deterministic brand art drawn from the sail in src/renderer/kite/sail.ts. Requires Pillow; no AI or reference art.
Colors come from src/renderer/tokens.css and kite.css. Keep the sail geometry below in sync with sail.ts and config.ts."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets'; OUT.mkdir(exist_ok=True)
TRAY = OUT / 'tray'; TRAY.mkdir(exist_ok=True)
PINK, SHADE, SUN = '#ff426f', '#e92c59', '#e9a43f'
INK, MUTED, BG, SURFACE, BORDER, LIGHT = '#1b212a', '#5a6472', '#f4f5f7', '#ffffff', '#dfe2e7', '#eceef1'

# The sail at rest (sailPath(restSail)), turned by config.baseAngle so the nose leans back toward the cursor.
NOSE_Y, WING_X, WING_Y, TAIL_Y, NOSE_ROUND = -11.1, 13.3, 8.6, 10.3, 1.5
LEAD, TRAIL, BASE_ANGLE = (10, -2.9), (4.7, 5.5), -35
DOTS = [(0.4, 13.6, 2.4), (1.5, 17.6, 2.0), (2.9, 21.3, 1.6)]
EDGE = math.hypot(LEAD[0], LEAD[1] - NOSE_Y)
A = (LEAD[0] / EDGE * NOSE_ROUND, NOSE_Y + (LEAD[1] - NOSE_Y) / EDGE * NOSE_ROUND)  # where the soft nose meets the right edge
APEX = (0, (A[1] + NOSE_Y) / 2)

def font(size, bold=False):
    file = Path('C:/Windows/Fonts') / ('segoeuib.ttf' if bold else 'segoeui.ttf')
    return ImageFont.truetype(str(file), size) if file.exists() else ImageFont.load_default(size=size)

def quad(p0, c, p1, n=20):
    return [tuple((1 - t) ** 2 * p0[i] + 2 * (1 - t) * t * c[i] + t * t * p1[i] for i in (0, 1)) for t in (k / n for k in range(1, n + 1))]

def sail_shapes():
    """The whole sail, and its right panel (the shaded half of the fold), in the sail's local frame."""
    b, wing_r, wing_l, notch = (-A[0], A[1]), (WING_X, WING_Y), (-WING_X, WING_Y), (0, TAIL_Y)
    right = quad(A, LEAD, wing_r) + quad(wing_r, TRAIL, notch)
    whole = [A] + right + quad(notch, (-TRAIL[0], TRAIL[1]), wing_l) + quad(wing_l, (-LEAD[0], LEAD[1]), b) + quad(b, (0, NOSE_Y), A)
    panel = [APEX] + quad(APEX, (A[0] / 2, (NOSE_Y + A[1]) / 2), A) + right
    return whole, panel

def dot_square(x, y, s):
    c, n = math.cos(math.radians(12)), math.sin(math.radians(12))
    return [(x + dx * c - dy * n, y + dx * n + dy * c) for dx, dy in ((-s / 2, -s / 2), (s / 2, -s / 2), (s / 2, s / 2), (-s / 2, s / 2))]

def place(points, k, cx, cy):
    c, n = math.cos(math.radians(BASE_ANGLE)), math.sin(math.radians(BASE_ANGLE))
    return [(cx + (x * c - y * n) * k, cy + (x * n + y * c) * k) for x, y in points]

def render(size, dots=1, two_tone=True, fill=.8, halo=None, hollow=None, badge=False, phase=0.0, ss=8):
    """One icon at one size: drawn at ss times the size, then box-filtered down with premultiplied alpha."""
    S = size * ss
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    whole, panel = sail_shapes()
    tail = [dot_square(x + math.sin(phase - i * .8) * .5 * i, y, s) for i, (x, y, s) in enumerate(DOTS[:dots])]
    bounds = place(whole + [p for sq in tail for p in sq], 1, 0, 0)
    xs, ys = [p[0] for p in bounds], [p[1] for p in bounds]
    k = fill * S / max(max(xs) - min(xs), max(ys) - min(ys)) * (.84 if badge else 1)
    cx, cy = S / 2 - (min(xs) + max(xs)) / 2 * k, S / 2 - (min(ys) + max(ys)) / 2 * k
    if badge: cx, cy = cx - S * .07, cy + S * .08  # make room for the dot in the top-right corner
    P = lambda points: place(points, k, cx, cy)
    if hollow:
        # Paused: the same sail, outlined and empty.
        d.line(P(whole) + P(whole)[:1], fill=hollow, width=round(1.3 * ss), joint='curve')
    else:
        if halo: d.line(P(whole) + P(whole)[:1], fill=halo, width=round(2 * ss), joint='curve')
        d.polygon(P(whole), fill=PINK)
        if two_tone: d.polygon(P(panel), fill=SHADE)
        for sq in tail: d.polygon(P(sq), fill=SHADE)
    if badge:
        # Update ready: a small gold dot in the empty top-right corner, cut free of the sail.
        r, gap = S * .16, S * .06
        bx, by = S - r - S * .02, r + S * .02
        d.ellipse((bx - r - gap, by - r - gap, bx + r + gap, by + r + gap), fill=(0, 0, 0, 0))
        d.ellipse((bx - r, by - r, bx + r, by + r), fill=SUN)
    return im.convert('RGBa').resize((size, size), Image.Resampling.BOX).convert('RGBA')

def save_ico(path, sizes, draw):
    images = [draw(s) for s in sizes]
    images[-1].save(path, sizes=[(s, s) for s in sizes], append_images=images[:-1])

# App icon: transparent, the sail filling most of the tile. Small sizes drop the fold and the dot so they stay crisp.
save_ico(OUT / 'kite.ico', [16, 24, 32, 48, 64, 128, 256], lambda s: render(s, dots=0 if s < 32 else 1, two_tone=s >= 32, fill=.9 if s < 32 else .8))
for size in [256, 512]: render(size).save(OUT / f'kite-{size}.png')

# Tray: one .ico per state and taskbar theme, drawn separately at 16, 20, 24, and 32 px for each DPI.
# The taskbar color is known, so no halo is needed. Paused is an outline in the taskbar's text color; update ready adds a gold dot.
for theme, line in [('light', INK), ('dark', LIGHT)]:
    for paused in (False, True):
        for update in (False, True):
            name = theme + ('-paused' if paused else '') + ('-update' if update else '')
            save_ico(TRAY / f'{name}.ico', [16, 20, 24, 32], lambda s: render(s, dots=0 if s < 24 else 1, two_tone=False, fill=.92 if s < 24 else .9,
                                                                           hollow=line if paused else None, badge=update))

def sprite(px, phase=0.0):
    return render(px, dots=3, fill=.96, phase=phase, ss=4)

def stamp(im, px, x, y, phase=0.0):
    s = sprite(px, phase); im.paste(s, (round(x - px / 2), round(y - px / 2)), s)

im = Image.new('RGB', (1280, 640), BG); d = ImageDraw.Draw(im)
d.rounded_rectangle((70, 65, 1210, 575), radius=40, fill=SURFACE, outline=BORDER, width=2)
stamp(im, 300, 960, 300); d.text((125, 140), 'Kite', font=font(100, True), fill=INK)
d.text((130, 280), 'A little company beside your cursor.', font=font(32), fill=INK)
d.text((130, 345), 'Hold. Ask. Circle anything.', font=font(40, True), fill=INK)
d.text((130, 485), 'Windows  /  BYOK  /  Your keys. Your computer.', font=font(22), fill=MUTED)
im.save(OUT / 'social-preview.png'); im.save(OUT / 'readme-hero.png')

def animation(name, title, subtitle, seconds=4, installer=False):
    frames = []; width, height = (440, 260) if installer else (900, 480)
    for i in range(seconds * 10):
        t = i / 10; im = Image.new('RGB', (width, height), BG); d = ImageDraw.Draw(im)
        if installer:
            stamp(im, 110, 220, 95 + 4 * math.sin(t * 2), phase=t * 3); d.text((130, 205), 'Kite is landing…', font=font(23, True), fill=INK)
        else:
            d.text((40, 30), title, font=font(28, True), fill=INK)
            d.rounded_rectangle((40, 105, 600, 380), radius=20, fill=SURFACE, outline=BORDER, width=2)
            d.text((70, 145), subtitle, font=font(24), fill=INK)
            x = 690 + 45 * math.sin(t * 1.3); y = 230 + 35 * math.sin(t * 1.7)
            stamp(im, 100, x, y, phase=t * 4)
            if 'circle' in name or name == 'hero':
                d.text((85, 225), 'Revenue grew 24% this quarter.', font=font(24), fill=INK)
                if t > 1: d.arc((68, 195, 570, 290), 0, min(359, int((t - 1) * 180)), fill=SUN, width=4)
                if t > 3: d.rounded_rectangle((350, 310, 825, 375), radius=16, fill=INK); d.text((370, 325), 'Kite: Growth is up this quarter.', font=font(20), fill='white')
            d.text((40, 430), 'Interface illustration • simulated sequence', font=font(17), fill=MUTED)
        frames.append(im)
    frames[0].save(OUT / (name + '.gif'), save_all=True, append_images=frames[1:], duration=100, loop=0, optimize=True)
animation('installer', '', '', 3, True)
animation('hero', 'Meet Kite', 'Hold Ctrl + Win. Ask about what you see.', 7)
for name, title, sub in [('voice', 'Talk while you hold', 'Release to hear the answer.'), ('providers', 'Choose your model', 'OpenAI · Anthropic · Gemini · Groq · Kimi'),
                         ('actions', 'Actions with a clear yes', 'Open Spotify?    [Approve]    [Decline]'), ('circle', 'Circle to ask', 'Mark it. Ask about “this”.'),
                         ('reminders', 'A nudge when it matters', 'Remind me to stretch in 20 minutes.')]: animation(name, title, sub)

# Editable vector source: the same sail, fold, and first tail dot as the app's mark.
r = lambda n: f'{round(n, 2):g}'
sail_d = (f'M{r(A[0])} {r(A[1])}Q{r(LEAD[0])} {r(LEAD[1])} {r(WING_X)} {r(WING_Y)}Q{r(TRAIL[0])} {r(TRAIL[1])} 0 {r(TAIL_Y)}'
          f'Q{r(-TRAIL[0])} {r(TRAIL[1])} {r(-WING_X)} {r(WING_Y)}Q{r(-LEAD[0])} {r(LEAD[1])} {r(-A[0])} {r(A[1])}Q0 {r(NOSE_Y)} {r(A[0])} {r(A[1])}Z')
panel_d = (f'M0 {r(APEX[1])}Q{r(A[0] / 2)} {r((NOSE_Y + A[1]) / 2)} {r(A[0])} {r(A[1])}Q{r(LEAD[0])} {r(LEAD[1])} {r(WING_X)} {r(WING_Y)}'
           f'Q{r(TRAIL[0])} {r(TRAIL[1])} 0 {r(TAIL_Y)}Z')
x, y, s = DOTS[0]
(OUT / 'kite.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8.7 -9.7 25 25"><g transform="rotate({BASE_ANGLE})">'
                              f'<rect x="{r(x - s / 2)}" y="{r(y - s / 2)}" width="{r(s)}" height="{r(s)}" rx="{r(s * .2)}" transform="rotate(12 {r(x)} {r(y)})" fill="{SHADE}"/>'
                              f'<path d="{sail_d}" fill="{PINK}"/><path d="{panel_d}" fill="{SHADE}"/></g></svg>\n')
print('Generated brand assets and explicitly labeled UI illustrations.')
