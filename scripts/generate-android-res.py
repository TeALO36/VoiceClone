"""Regenerate the native Android resources (launcher icons, adaptive icon
parts, splash logo + colors) from the branded base assets in assets/images/.

Run from the repo root:  python scripts/generate-android-res.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets", "images")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]
LAUNCHER = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
SPLASH = {"mdpi": 288, "hdpi": 432, "xhdpi": 576, "xxhdpi": 864, "xxxhdpi": 1152}
BRAND = "#6366F1"

icon_src = Image.open(os.path.join(IMG, "icon.png")).convert("RGBA")
bg_src = Image.open(os.path.join(IMG, "android-icon-background.png")).convert("RGBA")
fg_src = Image.open(os.path.join(IMG, "android-icon-foreground.png")).convert("RGBA")
mono_src = Image.open(os.path.join(IMG, "android-icon-monochrome.png")).convert("RGBA")
splash_src = Image.open(os.path.join(IMG, "splash-icon.png")).convert("RGBA")


def resize(src, size):
    return src.resize((size, size), Image.LANCZOS)


def save_webp(img, path):
    img.save(path, "WEBP", lossless=True, quality=100)


for d in DENSITIES:
    mip = os.path.join(RES, f"mipmap-{d}")
    drw = os.path.join(RES, f"drawable-{d}")
    s = LAUNCHER[d]
    save_webp(resize(icon_src, s), os.path.join(mip, "ic_launcher.webp"))
    save_webp(resize(icon_src, s), os.path.join(mip, "ic_launcher_round.webp"))
    s = ADAPTIVE[d]
    save_webp(resize(bg_src, s), os.path.join(mip, "ic_launcher_background.webp"))
    save_webp(resize(fg_src, s), os.path.join(mip, "ic_launcher_foreground.webp"))
    save_webp(resize(mono_src, s), os.path.join(mip, "ic_launcher_monochrome.webp"))
    ss = SPLASH[d]
    resize(splash_src, ss).save(os.path.join(drw, "splashscreen_logo.png"), "PNG")
    print(f"{d}: launcher {LAUNCHER[d]}px, adaptive {ADAPTIVE[d]}px, splash {SPLASH[d]}px")

# Splash + icon background colors (light and dark)
colors_light = os.path.join(RES, "values", "colors.xml")
colors_night = os.path.join(RES, "values-night", "colors.xml")
with open(colors_light, encoding="utf-8") as f:
    c = f.read()
c = c.replace(
    '<color name="splashscreen_background">#ffffff</color>',
    f'<color name="splashscreen_background">{BRAND}</color>',
).replace(
    '<color name="iconBackground">#E6F4FE</color>',
    f'<color name="iconBackground">{BRAND}</color>',
)
with open(colors_light, "w", encoding="utf-8") as f:
    f.write(c)
print("values/colors.xml -> splashscreen_background & iconBackground =", BRAND)

with open(colors_night, encoding="utf-8") as f:
    c = f.read()
c = c.replace(
    '<color name="splashscreen_background">#000000</color>',
    f'<color name="splashscreen_background">{BRAND}</color>',
)
with open(colors_night, "w", encoding="utf-8") as f:
    f.write(c)
print("values-night/colors.xml -> splashscreen_background =", BRAND)
print("Done.")
