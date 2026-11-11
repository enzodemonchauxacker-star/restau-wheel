#!/usr/bin/env python3
"""Restau Wheel promo v9 — new copy angle, same style as reference (typewriter + clean-tech)."""
from __future__ import annotations

import math
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageDraw, ImageFont

ROOT = Path("/tmp/rw_v9")
SRC = ROOT / "clips"
OUT = ROOT / "out"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1080, 1920
FPS = 30

FONT_BOLD = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf"
FONT_MED = "/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf"
FONT_REG = "/usr/share/fonts/truetype/macos/Inter-Regular.ttf"

RED = (196, 28, 36, 255)
BLACK = (18, 18, 20, 255)
GRAY = (55, 55, 60, 255)
WHITE = (255, 255, 255, 255)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont) -> Tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def draw_corner_brackets(draw, box, color=BLACK, arm=28, thick=4):
    x0, y0, x1, y1 = box
    draw.line([(x0, y0 + arm), (x0, y0), (x0 + arm, y0)], fill=color, width=thick)
    draw.line([(x1 - arm, y0), (x1, y0), (x1, y0 + arm)], fill=color, width=thick)
    draw.line([(x0, y1 - arm), (x0, y1), (x0 + arm, y1)], fill=color, width=thick)
    draw.line([(x1 - arm, y1), (x1, y1), (x1, y1 - arm)], fill=color, width=thick)


@dataclass
class Line:
    text: str
    size: int
    color: Tuple[int, int, int, int]
    bold: bool = True
    brackets: bool = False
    start: float = 0.0
    cps: float = 18.0
    y: int = 0


def typed_count(line: Line, t: float) -> int:
    if t < line.start:
        return 0
    n = int((t - line.start) * line.cps)
    return max(0, min(len(line.text), n))


def render_type_line(line: Line, t: float) -> Image.Image:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if t < line.start:
        return layer
    d = ImageDraw.Draw(layer)
    fnt = font(FONT_BOLD if line.bold else FONT_MED, line.size)
    n = typed_count(line, t)
    visible = line.text[:n]
    full_w, full_h = text_size(d, line.text, fnt)
    x = (W - full_w) // 2
    y = line.y

    if line.brackets and n > 0:
        pad_x, pad_y = 36, 18
        box = (x - pad_x, y - pad_y, x + full_w + pad_x, y + full_h + pad_y)
        draw_corner_brackets(d, box, arm=max(22, line.size // 3), thick=4)

    if visible:
        d.text((x, y), visible, font=fnt, fill=line.color)

    still_typing = n < len(line.text)
    blink = (math.floor((t - line.start) * 4) % 2) == 0
    if still_typing and blink:
        vw, _ = text_size(d, visible, fnt) if visible else (0, 0)
        caret_h = int(full_h * 0.9)
        caret_x = x + vw + 4
        caret_y = y + (full_h - caret_h) // 2
        d.rectangle([caret_x, caret_y, caret_x + 6, caret_y + caret_h], fill=line.color)
    return layer


def draw_cta(base: Image.Image, text: str, y: int, t: float, start: float, url: str = ""):
    if t < start:
        return
    cps = 16.0
    n = min(len(text), int((t - start) * cps))
    visible = text[:n]
    fnt = font(FONT_BOLD, 42)
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    tw, th = text_size(d, text, fnt)
    pw, ph = tw + 72, th + 36
    x = (W - pw) // 2
    d.rounded_rectangle([x, y, x + pw, y + ph], radius=ph // 2, fill=(232, 64, 92, 255))
    d.text((x + 36, y + 16), visible, font=fnt, fill=WHITE)
    if n < len(text) and (math.floor((t - start) * 4) % 2) == 0:
        vw, _ = text_size(d, visible, fnt) if visible else (0, 0)
        cx = x + 36 + vw + 3
        d.rectangle([cx, y + 18, cx + 5, y + ph - 18], fill=WHITE)
    if url and n >= len(text):
        uf = font(FONT_REG, 28)
        uw, _ = text_size(d, url, uf)
        url_start = start + len(text) / cps + 0.15
        if t >= url_start:
            un = min(len(url), int((t - url_start) * 22))
            d.text(((W - uw) // 2, y + ph + 18), url[:un], font=uf, fill=(70, 70, 75, 220))
    base.alpha_composite(overlay)


def scene_lines(scene: int) -> List[Line]:
    """New angle vs v8: empty tables / acquisition waste / QR loop / fill services."""
    if scene == 1:
        return [
            Line("TES TABLES", 88, RED, bold=True, brackets=True, start=0.22, cps=13, y=620),
            Line("se vident", 48, BLACK, bold=False, start=1.05, cps=16, y=760),
            Line("après le dessert ?", 44, GRAY, bold=False, start=1.85, cps=18, y=840),
        ]
    if scene == 2:
        return [
            Line("Tu paies pour", 40, GRAY, bold=False, start=0.18, cps=18, y=520),
            Line("LES ATTIRER", 84, RED, bold=True, brackets=True, start=0.85, cps=13, y=590),
            Line("Ils mangent…", 42, BLACK, bold=False, start=1.85, cps=16, y=1240),
            Line("et DISPARAISSENT", 72, RED, bold=True, start=2.65, cps=13, y=1320),
        ]
    if scene == 3:
        return [
            Line("SCANNE · TOURNE", 64, RED, bold=True, brackets=True, start=0.18, cps=14, y=140),
            Line("Une roue sur chaque table", 40, BLACK, bold=False, start=1.2, cps=18, y=250),
            Line("ils reviennent", 42, BLACK, bold=False, start=2.25, cps=16, y=1560),
            Line("TOUT SEULS", 82, RED, bold=True, start=3.0, cps=12, y=1635),
        ]
    return [
        Line("RESTAU WHEEL", 72, BLACK, bold=True, start=0.18, cps=13, y=130),
        Line("La fidélité qui remplit", 40, GRAY, bold=False, start=1.1, cps=18, y=230),
        Line("TES SERVICES", 78, RED, bold=True, brackets=True, start=2.15, cps=12, y=300),
    ]


def extract_frames(src: Path, frames_dir: Path):
    if frames_dir.exists():
        shutil.rmtree(frames_dir)
    frames_dir.mkdir(parents=True)
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-i", str(src),
            "-vf", f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0xD8DCE0,fps={FPS}",
            str(frames_dir / "%05d.png"),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def encode_frames(frames_dir: Path, out_mp4: Path):
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-framerate", str(FPS), "-i", str(frames_dir / "%05d.png"),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "fast",
            str(out_mp4),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def process_scene(scene: int, src: Path, has_cta: bool = False) -> Path:
    frames_dir = OUT / f"s{scene}_frames"
    out_frames = OUT / f"s{scene}_out"
    extract_frames(src, frames_dir)
    if out_frames.exists():
        shutil.rmtree(out_frames)
    out_frames.mkdir(parents=True)

    lines = scene_lines(scene)
    frames = sorted(frames_dir.glob("*.png"))
    for i, fp in enumerate(frames):
        t = i / FPS
        base = Image.open(fp).convert("RGBA")
        for line in lines:
            base.alpha_composite(render_type_line(line, t))
        if has_cta:
            draw_cta(base, "Essaie la démo", 1580, t, start=3.15, url="restauwheel.com")
        base.convert("RGB").save(out_frames / f"{i+1:05d}.png")

    out_mp4 = OUT / f"s{scene}_final.mp4"
    encode_frames(out_frames, out_mp4)
    print(f"scene {scene}: {len(frames)} frames -> {out_mp4.name}")
    return out_mp4


def export_line_events() -> List[tuple]:
    """Absolute (t, char) events for audio sync."""
    events = []
    for scene in range(1, 5):
        offset = (scene - 1) * 5.0
        for line in scene_lines(scene):
            for i, ch in enumerate(line.text):
                events.append((offset + line.start + i / line.cps, ch))
        if scene == 4:
            # CTA
            text = "Essaie la démo"
            start = offset + 3.15
            cps = 16.0
            for i, ch in enumerate(text):
                events.append((start + i / cps, ch))
            url = "restauwheel.com"
            url_start = start + len(text) / cps + 0.15
            for i, ch in enumerate(url):
                events.append((url_start + i / 22.0, ch))
    return events


def main():
    outs = [
        process_scene(1, SRC / "s1_5s.mp4", False),
        process_scene(2, SRC / "s2_5s.mp4", False),
        process_scene(3, SRC / "s3_5s.mp4", False),
        process_scene(4, SRC / "s4_5s.mp4", True),
    ]
    lst = OUT / "list.txt"
    lst.write_text("\n".join(f"file '{p.name}'" for p in outs) + "\n")
    silent = OUT / "video_silent.mp4"
    subprocess.check_call(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(silent)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        cwd=str(OUT),
    )
    # save events for audio
    ev = export_line_events()
    (ROOT / "events.txt").write_text("\n".join(f"{t:.4f}\t{ch}" for t, ch in ev))
    print("silent", silent, "events", len(ev))


if __name__ == "__main__":
    main()
