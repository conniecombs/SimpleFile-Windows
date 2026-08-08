"""Install Option E clay folder icon into base_icon + Tauri icon set."""
from pathlib import Path
from PIL import Image

src = Path(
    r"C:\Users\raz00\.grok\sessions\C%3A%5CUsers%5Craz00%5CDesktop"
    r"\019fddae-22cd-7e70-8b47-902fc5bd3ca5\images\5.jpg"
)
icons_dir = Path(r"R:\SimpleFile-Windows\src-tauri\icons")
root = Path(r"R:\SimpleFile-Windows")
frontend_public = Path(r"R:\SimpleFile-Windows\frontend\public")

img = Image.open(src).convert("RGBA")
w, h = img.size
side = max(w, h)
# Soft lavender matching Option E canvas edges
canvas = Image.new("RGBA", (side, side), (248, 246, 255, 255))
canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
master = canvas.resize((1024, 1024), Image.Resampling.LANCZOS)

base_path = root / "base_icon.png"
master.save(base_path, format="PNG", optimize=True)
print(f"wrote {base_path} {master.size}")

master.resize((512, 512), Image.Resampling.LANCZOS).save(
    icons_dir / "icon.png", format="PNG", optimize=True
)
print("wrote icon.png 512")

sizes = {
    "32x32.png": 32,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

for name, px in sizes.items():
    master.resize((px, px), Image.Resampling.LANCZOS).save(
        icons_dir / name, format="PNG", optimize=True
    )
    print(f"wrote {name} {px}")

ico_sizes = [16, 24, 32, 48, 64, 128, 256]
ico_images = [master.resize((s, s), Image.Resampling.LANCZOS) for s in ico_sizes]
ico_path = icons_dir / "icon.ico"
ico_images[-1].save(
    ico_path,
    format="ICO",
    sizes=[(s, s) for s in ico_sizes],
)
print(f"wrote {ico_path}")

if frontend_public.exists():
    fav = frontend_public / "favicon.ico"
    master.resize((256, 256), Image.Resampling.LANCZOS).save(
        fav,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f"wrote {fav}")

print("done")
