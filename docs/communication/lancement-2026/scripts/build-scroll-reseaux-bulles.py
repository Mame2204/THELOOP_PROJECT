#!/usr/bin/env python3
"""Bulles dialogue + icônes réseaux + clip scroll · montage 17/11."""
from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "video-1711-montage"
BROLL = OUT / "B-roll-main.mp4"

W, H = 1080, 520

NETWORKS = [
    (
        "facebook",
        "Facebook",
        "Encore le même fil…",
        "#1877F2",
    ),
    (
        "instagram",
        "Instagram",
        "Stories · posts · reels",
        "#E4405F",
    ),
    (
        "tiktok",
        "TikTok",
        "Un plan pour ce week-end ?",
        "#010101",
    ),
]


def load_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    names = (
        ["DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"]
        if bold
        else ["DejaVuSans.ttf", "LiberationSans-Regular.ttf"]
    )
    for name in names:
        path = Path("/usr/share/fonts/truetype/dejavu") / name
        if not path.exists():
            path = Path("/usr/share/fonts/truetype/liberation") / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def draw_icon(draw: ImageDraw.ImageDraw, slug: str, cx: int, cy: int, r: int) -> None:
    if slug == "facebook":
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill="#1877F2")
        fnt = load_font(int(r * 1.35))
        bb = draw.textbbox((0, 0), "f", font=fnt)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        draw.text((cx - tw // 2, cy - th // 2 - bb[1]), "f", fill="#FFFFFF", font=fnt)
    elif slug == "instagram":
        draw.rounded_rectangle(
            (cx - r, cy - r, cx + r, cy + r),
            radius=int(r * 0.28),
            outline="#E4405F",
            width=8,
        )
        draw.ellipse(
            (cx - r // 2, cy - r // 2, cx + r // 2, cy + r // 2),
            outline="#E4405F",
            width=6,
        )
        draw.ellipse((cx + r // 3, cy - r // 3, cx + r // 3 + 14, cy - r // 3 + 14), fill="#E4405F")
    else:
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill="#010101")
        fnt = load_font(int(r * 0.95))
        bb = draw.textbbox((0, 0), "♪", font=fnt)
        tw = bb[2] - bb[0]
        draw.text((cx - tw // 2, cy - r // 2 - 4), "♪", fill="#25F4EE", font=fnt)


def speech_bubble(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str) -> None:
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=36, fill=fill)
    tail = [(x0 + 80, y1), (x0 + 50, y1 + 36), (x0 + 120, y1)]
    draw.polygon(tail, fill=fill)


def make_dialogue_bubble(slug: str, title: str, subtitle: str, accent: str) -> Path:
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    # ombre
    shadow = (40, 48, W - 40, H - 72)
    speech_bubble(draw, (shadow[0] + 6, shadow[1] + 8, shadow[2] + 6, shadow[3] + 8), "#00000033")
    speech_bubble(draw, shadow, "#FFFFFF")
    draw.rounded_rectangle(
        (shadow[0], shadow[1], shadow[0] + 12, shadow[3]),
        radius=8,
        fill=accent,
    )
    icon_cx, icon_cy = shadow[0] + 88, (shadow[1] + shadow[3]) // 2
    draw_icon(draw, slug, icon_cx, icon_cy, 44)
    title_font = load_font(46)
    sub_font = load_font(30, bold=False)
    tx = shadow[0] + 160
    ty = shadow[1] + 52
    draw.text((tx, ty), title, fill="#0A3A44", font=title_font)
    bb = draw.textbbox((0, 0), title, font=title_font)
    draw.text((tx, ty + (bb[3] - bb[1]) + 12), subtitle, fill="#3D5560", font=sub_font)
    dest = OUT / f"DIALOGUE_bulle-{slug}.png"
    im.save(dest, "PNG")
    # alias pour CapCut
    im.save(OUT / f"BULLE_reseau-{slug}.png", "PNG")
    return dest


def build_clip(bubbles: list[Path], seg: float = 3.0) -> Path | None:
    if not BROLL.exists():
        return None
    dest = OUT / "SCROLL_reseaux-bulles.mp4"
    total = seg * len(bubbles)
    scaled = OUT / "_broll_scaled.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-stream_loop",
            "2",
            "-i",
            str(BROLL),
            "-vf",
            "scale=1080:1920:force_original_aspect_ratio=decrease,"
            "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0a3a44",
            "-t",
            str(total),
            "-an",
            str(scaled),
        ],
        check=True,
        capture_output=True,
    )
    inputs = ["-i", str(scaled)]
    for bub in bubbles:
        inputs.extend(["-i", str(bub)])
    fc = "[0:v]copy[tmp0]"
    prev = "tmp0"
    for i in range(len(bubbles)):
        inp = i + 1
        t0, t1 = i * seg, (i + 1) * seg
        out = f"tmp{i + 1}"
        fc += f";[{prev}][{inp}:v]overlay=(W-w)/2:100:enable='between(t\\,{t0}\\,{t1})'[{out}]"
        prev = out
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            *inputs,
            "-filter_complex",
            fc,
            "-map",
            f"[{prev}]",
            "-t",
            str(total),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(dest),
        ],
        check=True,
        capture_output=True,
    )
    scaled.unlink(missing_ok=True)
    return dest


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    paths = [make_dialogue_bubble(slug, title, sub, accent) for slug, title, sub, accent in NETWORKS]
    clip = build_clip(paths)
    if clip:
        print(f"Clip → {clip}")
    for p in paths:
        print(f"Bulle → {p}")


if __name__ == "__main__":
    main()
