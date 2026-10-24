#!/usr/bin/env python3
"""Bulles FB / IG / TikTok + clip scroll pour montage 17/11."""
from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "video-1711-montage"
BROLL = OUT / "B-roll-main.mp4"

NETWORKS = [
    ("facebook", "Facebook", "#1877F2", "#FFFFFF"),
    ("instagram", "Instagram", "#C13584", "#FFFFFF"),
    ("tiktok", "TikTok", "#010101", "#FFFFFF"),
]

W, H = 1080, 320


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def make_bubble(slug: str, label: str, bg: str, fg: str) -> Path:
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    font = load_font(52)
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad_x, pad_y = 48, 28
    rw, rh = tw + pad_x * 2, th + pad_y * 2
    rx, ry = (W - rw) // 2, (H - rh) // 2
    draw.rounded_rectangle(
        (rx, ry, rx + rw, ry + rh),
        radius=rh // 2,
        fill=bg,
    )
    draw.text((rx + pad_x, ry + pad_y - bbox[1]), label, fill=fg, font=font)
    dest = OUT / f"BULLE_reseau-{slug}.png"
    im.save(dest, "PNG")
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
    filters: list[str] = []
    inputs = ["-i", str(scaled)]
    for i, bub in enumerate(bubbles):
        inputs.extend(["-i", str(bub)])
    chain = "[0:v]copy[base]"
    prev = "base"
    for i, _ in enumerate(bubbles):
        inp = i + 1
        t0, t1 = i * seg, (i + 1) * seg
        out = f"v{i}"
        chain += (
            f";[{prev}][{inp}:v]overlay=(W-w)/2:140:"
            f"enable='between(t,{t0},{t1})'[{out}]"
        )
        prev = out
    vf = chain.split(";", 1)[1] if ";" in chain else chain
    # ffmpeg filter_complex from built chain
    fc = "[0:v]copy[tmp0]"
    prev = "tmp0"
    for i in range(len(bubbles)):
        inp = i + 1
        t0, t1 = i * seg, (i + 1) * seg
        out = f"tmp{i + 1}"
        fc += f";[{prev}][{inp}:v]overlay=(W-w)/2:140:enable='between(t\\,{t0}\\,{t1})'[{out}]"
        prev = out
    cmd = [
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
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    scaled.unlink(missing_ok=True)
    return dest


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    paths = [make_bubble(*n) for n in NETWORKS]
    clip = build_clip(paths)
    if clip:
        print(f"Clip → {clip}")
    for p in paths:
        print(f"Bulle → {p}")


if __name__ == "__main__":
    main()
