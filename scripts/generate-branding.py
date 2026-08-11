"""Generate the VoiceClone logo, app icon, adaptive icon parts, favicon and
splash art.

Brand: indigo -> violet gradient background (#6366F1 -> #8B5CF6) with a white
rounded waveform glyph (the universal "voice" mark).

Run from the repo root:  python scripts/generate-branding.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "images")

# ---------------------------------------------------------------------------
# Brand constants
# ---------------------------------------------------------------------------
INDIGO = (99, 102, 241)      # #6366F1 — app primary (light mode)
VIOLET = (139, 92, 246)      # #8B5CF6 — app accent
GRAD_TOP = INDIGO
GRAD_BOTTOM = VIOLET

# Waveform bars: relative heights of the 5 rounded bars (bell curve)
BAR_HEIGHTS = [0.34, 0.60, 1.00, 0.72, 0.44]
BAR_COLOR = (255, 255, 255, 255)


def gradient(size, top=GRAD_TOP, bottom=GRAD_BOTTOM):
    """Vertical gradient image (RGB)."""
    w, h = size
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def draw_waveform(draw, cx, cy, bar_w, bar_gap, max_h, color=BAR_COLOR):
    """Draw the 5-bar rounded waveform centred on (cx, cy).

    max_h is the height of the tallest bar; bars sit vertically centred.
    Returns nothing (draws onto `draw`).
    """
    total_w = len(BAR_HEIGHTS) * bar_w + (len(BAR_HEIGHTS) - 1) * bar_gap
    x = cx - total_w / 2
    radius = bar_w / 2
    for h_ratio in BAR_HEIGHTS:
        h = max_h * h_ratio
        y0 = cy - h / 2
        draw.rounded_rectangle(
            [x, y0, x + bar_w, y0 + h],
            radius=radius,
            fill=color,
        )
        x += bar_w + bar_gap


def load_font(size_px, bold=True):
    candidates = [
        (r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf"),
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\DejaVuSans-Bold.ttf",
        r"C:\Windows\Fonts\DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size_px)
            except Exception:
                continue
    return ImageFont.load_default()


def rounded_square(size, radius, color):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=color)
    return img


# ---------------------------------------------------------------------------
# 1. icon.png — full-bleed square app icon (iOS / legacy Android / fallback)
# ---------------------------------------------------------------------------
S = 1024
icon = gradient((S, S))
d = ImageDraw.Draw(icon)
bar_w = 96
bar_gap = 60
max_h = 430
draw_waveform(d, S / 2, S / 2, bar_w, bar_gap, max_h)
icon.save(os.path.join(OUT, "icon.png"))
print("icon.png")

# ---------------------------------------------------------------------------
# 2. android-icon-background.png — solid gradient (behind the launcher mask)
# ---------------------------------------------------------------------------
bg = gradient((S, S))
bg.save(os.path.join(OUT, "android-icon-background.png"))
print("android-icon-background.png")

# ---------------------------------------------------------------------------
# 3. android-icon-foreground.png — waveform on transparent, safe zone (66%)
# ---------------------------------------------------------------------------
fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
df = ImageDraw.Draw(fg)
safe = 0.66 * S            # content must fit inside the central 66 %
bar_w = int(S * 0.095)
bar_gap = int(S * 0.06)
max_h = int(safe * 0.52)
draw_waveform(df, S / 2, S / 2, bar_w, bar_gap, max_h)
fg.save(os.path.join(OUT, "android-icon-foreground.png"))
print("android-icon-foreground.png")

# ---------------------------------------------------------------------------
# 4. android-icon-monochrome.png — white glyph for themed icons (alpha mask)
# ---------------------------------------------------------------------------
mono = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dm = ImageDraw.Draw(mono)
draw_waveform(dm, S / 2, S / 2, bar_w, bar_gap, max_h)
mono.save(os.path.join(OUT, "android-icon-monochrome.png"))
print("android-icon-monochrome.png")

# ---------------------------------------------------------------------------
# 5. splash-icon.png — logo + "VoiceClone" wordmark on transparent, shown on
#    the indigo gradient splash background
# ---------------------------------------------------------------------------
sp = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ds = ImageDraw.Draw(sp)
wave_h = int(S * 0.14)
draw_waveform(ds, S / 2, S * 0.34, int(S * 0.032), int(S * 0.02), wave_h)
try:
    font = load_font(int(S * 0.075))
    text = "VoiceClone"
    bbox = ds.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    ds.text(
        ((S - tw) / 2 - bbox[0], S * 0.52 - bbox[1]),
        text,
        font=font,
        fill=(255, 255, 255, 255),
    )
except Exception as e:
    print("  (wordmark skipped:", e, ")")
sp.save(os.path.join(OUT, "splash-icon.png"))
print("splash-icon.png")

# ---------------------------------------------------------------------------
# 6. favicon.png — small web favicon (rounded square + waveform)
# ---------------------------------------------------------------------------
FS = 48
fav = rounded_square(FS, FS * 0.22, None)
# gradient fill on the rounded square
fav_grad = gradient((FS, FS))
mask = fav.split()[3]  # alpha from the rounded square
fav = Image.new("RGBA", (FS, FS), (0, 0, 0, 0))
fav.paste(fav_grad, (0, 0), mask)
dfav = ImageDraw.Draw(fav)
draw_waveform(dfav, FS / 2, FS / 2, 5, 3, FS * 0.44)
fav.save(os.path.join(OUT, "favicon.png"))
print("favicon.png")

print("Done.")
