#!/usr/bin/env python3
"""Génère docs/communication/lancement-2026/video-1711-montage/ pour CapCut."""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "video-1711-montage"
ASSETS = Path("/home/ubuntu/.cursor/projects/workspace/assets")
UPLOAD_ZIP = Path("/home/ubuntu/.cursor/projects/workspace/uploads/main_3296.zip")

# Compte membre (publication com) — priorité sur les captures admin
MEMBER_SCREENS = {
    "164f7dfa-989f-4152-9601-e5197bcbd48e.png": "APP_agenda-com.png",
    "b1319370-3754-45a3-ae76-4e3358a1f6f9.png": "APP_spots-com.png",
    "5159c11e-6d0a-4888-a96c-7ca3c2391b40.png": "APP_outils-com.png",
    "8add86a8-f3ee-43ce-9ddf-1a02eb938126.png": "APP_favoris-com.png",
}


def blur_band(im: Image.Image, y0: int, y1: int, radius: int = 26) -> Image.Image:
    out = im.copy()
    w, h = im.size
    y0, y1 = max(0, y0), min(h, y1)
    if y1 <= y0:
        return out
    band = im.crop((0, y0, w, y1)).filter(ImageFilter.GaussianBlur(radius=radius))
    out.paste(band, (0, y0))
    return out


def blur_rect(im: Image.Image, box: tuple[int, int, int, int], radius: int = 22) -> Image.Image:
    out = im.copy()
    x0, y0, x1, y1 = box
    w, h = im.size
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    if x1 <= x0 or y1 <= y0:
        return out
    patch = im.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(radius=radius))
    out.paste(patch, (x0, y0))
    return out


def app_screen_com_safe(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    # Cartes + noms fictifs : zone centrale. Header + bottom nav lisibles.
    im = blur_band(im, int(h * 0.22), int(h * 0.86), radius=28)
    im.save(dest, quality=92, optimize=True)


def accueil_com_safe(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    im = blur_band(im, int(h * 0.12), int(h * 0.88), radius=26)
    im = blur_rect(im, (0, int(h * 0.12), w, int(h * 0.22)), radius=20)  # Bonjour, prénom
    im.save(dest, quality=92, optimize=True)


def fragment_seuil_crop(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    # Crop zone LE FRAGMENT / LE SEUIL (sans bannière À la une)
    crop = im.crop((0, int(h * 0.18), w, int(h * 0.52)))
    cw, ch = crop.size
    crop = blur_rect(crop, (0, 0, cw, int(ch * 0.08)), radius=16)
    crop.save(dest, quality=92, optimize=True)


def singulier_com_safe(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    im = blur_band(im, 0, int(h * 0.16), radius=24)  # bannière À la une
    im = blur_rect(im, (0, int(h * 0.72), w, int(h * 0.88)), radius=14)  # sous-titre lieu si besoin
    im.save(dest, quality=92, optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "README.txt").write_text(
        "Pack montage 17/11 — voir MONTAGE-17-11.md\n", encoding="utf-8"
    )

    for src_name, out_name in MEMBER_SCREENS.items():
        src = ASSETS / src_name
        if src.exists():
            app_screen_com_safe(src, OUT / out_name)

    # Fallback admin (legacy) si membre absent
    legacy = {
        "9cef7fb8-bee4-4211-aa8d-3dee7893d55f.png": "APP_agenda-com.png",
        "247c3637-4bf3-441a-90bc-c1a738a8375d.png": "APP_spots-com.png",
        "adacf4a3-62cf-431e-b9cf-a168e82f8d1c.png": "APP_outils-com.png",
    }
    for src_name, out_name in legacy.items():
        dest = OUT / out_name
        if dest.exists():
            continue
        src = ASSETS / src_name
        if src.exists():
            app_screen_com_safe(src, dest)

    pairs = [
        ("5771ab5c-5c8e-4d48-9096-d776faa5df3e.jpg", "APP_accueil-com.png", accueil_com_safe),
        ("e6b700b8-18d2-4152-aa69-ff0da54f10b3.jpg", "APP_fragment-seuil-com.png", fragment_seuil_crop),
        ("d4902cbd-8a49-45f3-8698-5f506d647b03.jpg", "APP_singulier-com.png", singulier_com_safe),
    ]
    for src_name, out_name, fn in pairs:
        src = ASSETS / src_name
        if src.exists():
            fn(src, OUT / out_name)

    # Photos lifestyle : non utilisées dans le montage 17/11 (hors sujet vs texte)

    cover = ROOT / "exports-png-v4-light" / "COVER_17-11_liste-ouverte.png"
    if cover.exists():
        shutil.copy2(cover, OUT / "COVER_17-11_liste-ouverte.png")

    if UPLOAD_ZIP.exists():
        import zipfile

        with zipfile.ZipFile(UPLOAD_ZIP) as zf:
            zf.extract("main.mp4", OUT)
        (OUT / "main.mp4").rename(OUT / "B-roll-main.mp4")

    print(f"OK → {OUT} ({len(list(OUT.iterdir()))} fichiers)")


if __name__ == "__main__":
    main()
