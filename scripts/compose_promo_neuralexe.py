#!/usr/bin/env python3
"""
Restau Wheel promo — NeuralExe Instagram Reel style (split comparison).
Reference: https://www.instagram.com/reel/Dc3Yan9BROY/
NOT the previous 3D full-bleed plates — side-by-side panels, pinstripe BG,
typewriter with red accents, bold italic metrics, bottom CTA underline.
"""
from __future__ import annotations

import math
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

W, H = 1080, 1920
FPS = 30
DUR = 10.0
NFRAMES = int(DUR * FPS)
ROOT = Path("/tmp/rw_v10")
AS = ROOT / "assets"
OUT = ROOT / "frames_out"
OUT.mkdir(parents=True, exist_ok=True)

RED = (214, 36, 48)
BLACK = (12, 12, 14)
GRAY = (55, 55, 60)
MUTED = (120, 120, 128)
CREAM = (250, 247, 240)
PIN = (58, 58, 62)
WHITE = (255, 255, 255)


def F(name: str, size: int) -> ImageFont.FreeTypeFont:
    path = f"/usr/share/fonts/truetype/macos/{name}.ttf"
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size)


def F_oswald(size: int) -> ImageFont.FreeTypeFont:
    p = ROOT / "fonts" / "Oswald-Bold.ttf"
    if p.exists():
        return ImageFont.truetype(str(p), size)
    return F("Inter-BoldItalic", size)


FONT_BODY = F("Inter-SemiBold", 28)
FONT_BODY_SM = F("Inter-Medium", 24)
FONT_METRIC = F_oswald(54)
FONT_CTA = F("Inter-Medium", 30)
FONT_CTA_KEY = F("Inter-Bold", 48)
FONT_BRAND = F("Inter-Bold", 26)
FONT_LABEL = F("Inter-Bold", 22)


def text_w(draw, text, font) -> int:
    b = draw.textbbox((0, 0), text, font=font)
    return b[2] - b[0]


def pinstripe_bg() -> Image.Image:
    img = Image.new("RGB", (W, H), PIN)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 6):
        d.line([(x, 0), (x, H)], fill=(52, 52, 56), width=1)
    # slight top/bottom vignette
    for i in range(80):
        a = int(40 * (1 - i / 80))
        d.rectangle([0, i, W, i], fill=(max(0, PIN[0] - a),) * 3)
        d.rectangle([0, H - 1 - i, W, H - 1 - i], fill=(max(0, PIN[0] - a),) * 3)
    return img


def rounded_resize(im: Image.Image, size: Tuple[int, int], radius: int = 28) -> Image.Image:
    im = im.convert("RGBA").resize(size, Image.Resampling.LANCZOS)
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.paste(im, (0, 0))
    out.putalpha(mask)
    return out


def draw_logo_left(base: Image.Image, cx: int, y: int):
    """Simple 'AVANT' badge instead of Ae."""
    d = ImageDraw.Draw(base)
    label = "AVANT"
    tw = text_w(d, label, FONT_LABEL)
    pad_x, pad_y = 18, 10
    box = [cx - tw // 2 - pad_x, y, cx + tw // 2 + pad_x, y + 40]
    d.rounded_rectangle(box, radius=8, fill=(70, 70, 76))
    d.text((cx - tw // 2, y + 8), label, font=FONT_LABEL, fill=WHITE)


def draw_logo_right(base: Image.Image, cx: int, y: int):
    """Restau Wheel pill."""
    d = ImageDraw.Draw(base)
    label = "RESTAU WHEEL"
    tw = text_w(d, label, FONT_BRAND)
    pad_x, pad_y = 20, 12
    box = [cx - tw // 2 - pad_x, y, cx + tw // 2 + pad_x, y + 46]
    d.rounded_rectangle(box, radius=999, fill=WHITE)
    # yellow accent bar
    d.rounded_rectangle([box[0], box[1], box[0] + 8, box[3]], radius=4, fill=(255, 214, 10))
    d.text((cx - tw // 2 + 4, y + 10), label, font=FONT_BRAND, fill=BLACK)


def underline_swoosh(draw, x0, y, width, color=BLACK, thick=7):
    # hand-drawn-ish cubic underline
    pts = []
    for i in range(24):
        t = i / 23
        x = x0 + t * width
        yy = y + int(6 * math.sin(t * math.pi)) + int(3 * math.sin(t * math.pi * 2))
        pts.append((x, yy))
    for i in range(len(pts) - 1):
        draw.line([pts[i], pts[i + 1]], fill=color, width=thick)


@dataclass
class TextSeg:
    text: str
    color: Tuple[int, int, int]


@dataclass
class Beat:
    start: float
    end: float
    lines: List[List[TextSeg]]  # each line = list of colored segments
    left: str
    right: str
    metric_l: str
    metric_r: str


# Narrative beats — lowercase NeuralExe tone, red accents
BEATS: List[Beat] = [
    Beat(
        0.0, 2.4,
        [
            [TextSeg("tes clients ", BLACK), TextSeg("mangent", RED)],
            [TextSeg("puis ", BLACK), TextSeg("disparaissent", RED)],
        ],
        "panel_left_empty.png", "panel_right_a.png",
        "0×", "+24%",
    ),
    Beat(
        2.4, 4.6,
        [
            [TextSeg("tu paies pour", BLACK)],
            [TextSeg("les ", BLACK), TextSeg("attirer", RED)],
        ],
        "panel_left_paper.png", "panel_right_a.png",
        "0×", "+24%",
    ),
    Beat(
        4.6, 7.0,
        [
            [TextSeg("argent ", BLACK), TextSeg("perdu", RED)],
            [TextSeg("sur chaque ", BLACK), TextSeg("table", RED)],
        ],
        "panel_left_money.png", "panel_right_a.png",
        "PERDU", "GARDÉ",
    ),
    Beat(
        7.0, 10.0,
        [
            [TextSeg("une ", BLACK), TextSeg("roue", RED), TextSeg(" =", BLACK)],
            [TextSeg("ils ", BLACK), TextSeg("reviennent", RED)],
        ],
        "panel_left_paper.png", "panel_right_b.png",
        "0×", "CHAQUE SEM.",
    ),
]


def typed_segments(lines: List[List[TextSeg]], t: float, start: float, cps: float = 22.0) -> List[List[TextSeg]]:
    """Progressively reveal characters across all segments."""
    chars = []
    for li, line in enumerate(lines):
        for si, seg in enumerate(line):
            for ci, ch in enumerate(seg.text):
                chars.append((li, si, ci, ch, seg.color))
    n = max(0, min(len(chars), int((t - start) * cps)))
    # rebuild
    out: List[List[TextSeg]] = [[] for _ in lines]
    counts = {i: 0 for i in range(len(lines))}
    # track per-seg
    seg_bufs = [["" for _ in line] for line in lines]
    seg_cols = [[seg.color for seg in line] for line in lines]
    for idx, (li, si, ci, ch, col) in enumerate(chars):
        if idx >= n:
            break
        seg_bufs[li][si] += ch
    for li, line in enumerate(lines):
        built = []
        for si, seg in enumerate(line):
            if seg_bufs[li][si]:
                built.append(TextSeg(seg_bufs[li][si], seg.color))
        out[li] = built
    return out, n, len(chars)


def draw_panel_text(panel: Image.Image, lines: List[List[TextSeg]], caret: bool):
    d = ImageDraw.Draw(panel)
    y = 70
    last_x = panel.width // 2
    last_y = y
    for line in lines:
        # measure full current line width
        full = "".join(s.text for s in line)
        tw = text_w(d, full, FONT_BODY) if full else 0
        x = (panel.width - tw) // 2
        for seg in line:
            d.text((x, y), seg.text, font=FONT_BODY, fill=seg.color)
            x += text_w(d, seg.text, FONT_BODY)
        last_x, last_y = x, y
        y += 46
    if caret:
        d.rectangle([last_x + 2, last_y + 4, last_x + 6, last_y + 36], fill=RED)


def beat_at(t: float) -> Beat:
    for b in BEATS:
        if b.start <= t < b.end:
            return b
    return BEATS[-1]


def render_frame(t: float) -> Image.Image:
    base = pinstripe_bg().convert("RGBA")
    beat = beat_at(t)

    # Panel geometry — right slightly larger / zooms over time within beat (NeuralExe)
    left_w, left_h = 460, 1020
    # right panel grows
    prog = (t - beat.start) / max(0.01, beat.end - beat.start)
    zoom = 1.0 + 0.08 * min(1.0, prog)
    right_w = int(500 * zoom)
    right_h = int(1080 * zoom)

    gap = 28
    total_w = left_w + gap + right_w
    left_x = (W - total_w) // 2
    right_x = left_x + left_w + gap
    panel_y = 210
    right_y = panel_y - (right_h - left_h) // 2

    # logos above panels
    draw_logo_left(base, left_x + left_w // 2, 130)
    draw_logo_right(base, right_x + right_w // 2, 124)

    # load & compose panels
    left_src = Image.open(AS / beat.left).convert("RGBA")
    right_src = Image.open(AS / beat.right).convert("RGBA")
    left_p = rounded_resize(left_src, (left_w, left_h), 26)
    right_p = rounded_resize(right_src, (right_w, right_h), 26)

    # soft shadow
    for panel, (px, py) in ((left_p, (left_x, panel_y)), (right_p, (right_x, right_y))):
        sh = Image.new("RGBA", (panel.width + 40, panel.height + 40), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sh)
        sd.rounded_rectangle([10, 10, panel.width + 20, panel.height + 20], radius=28, fill=(0, 0, 0, 70))
        sh = sh.filter(ImageFilter.GaussianBlur(12))
        base.alpha_composite(sh, (px - 10, py - 6))
        base.alpha_composite(panel, (px, py))

    # typewriter text OVER both panels (same text mirrored like reference)
    typed, n, total = typed_segments(beat.lines, t, beat.start, cps=20.0)
    caret = n < total and (math.floor(t * 4) % 2 == 0)

    def overlay_text_on_region(x0, y0, pw, ph):
        # draw text onto a transparent layer sized to panel, then composite
        layer = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
        draw_panel_text(layer, typed, caret)
        base.alpha_composite(layer, (x0, y0))

    overlay_text_on_region(left_x, panel_y, left_w, left_h)
    overlay_text_on_region(right_x, right_y, right_w, right_h)

    d = ImageDraw.Draw(base)
    # Metrics under panels
    for text, cx in ((beat.metric_l, left_x + left_w // 2), (beat.metric_r, right_x + right_w // 2)):
        tw = text_w(d, text, FONT_METRIC)
        d.text((cx - tw // 2, panel_y + left_h + 36), text, font=FONT_METRIC, fill=BLACK)

    # Bottom CTA
    cta1 = "Essaie la "
    cta_key = "DÉMO"
    cta2 = " · restauwheel.com"
    # reveal CTA after 1.2s
    if t >= 1.0:
        full = cta1 + cta_key + cta2
        # type CTA slowly from t=1
        ncta = min(len(full), int((t - 1.0) * 18))
        shown = full[:ncta]
        # draw with key emphasis if key fully visible
        y = H - 160
        # measure
        if ncta <= len(cta1):
            tw = text_w(d, shown, FONT_CTA)
            d.text(((W - tw) // 2, y), shown, font=FONT_CTA, fill=WHITE)
        else:
            # cta1 full
            rest = shown[len(cta1):]
            if len(rest) <= len(cta_key):
                key_shown = rest
                after = ""
            else:
                key_shown = cta_key
                after = rest[len(cta_key):]
            w1 = text_w(d, cta1, FONT_CTA)
            wk = text_w(d, key_shown, FONT_CTA_KEY)
            w2 = text_w(d, after, FONT_CTA) if after else 0
            total = w1 + wk + w2
            x = (W - total) // 2
            d.text((x, y + 10), cta1, font=FONT_CTA, fill=WHITE)
            d.text((x + w1, y), key_shown, font=FONT_CTA_KEY, fill=WHITE)
            if after:
                d.text((x + w1 + wk, y + 10), after, font=FONT_CTA, fill=WHITE)
            if key_shown == cta_key:
                underline_swoosh(d, x + w1 - 4, y + 52, wk + 8, color=WHITE, thick=6)

    return base.convert("RGB")


def main():
    print(f"rendering {NFRAMES} frames…")
    for i in range(NFRAMES):
        t = i / FPS
        frame = render_frame(t)
        frame.save(OUT / f"{i+1:05d}.png")
        if i % 30 == 0:
            print(f"  {t:.1f}s")
    mp4 = ROOT / "video_silent.mp4"
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-framerate", str(FPS), "-i", str(OUT / "%05d.png"),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "14", "-preset", "fast",
            str(mp4),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print("wrote", mp4)


if __name__ == "__main__":
    main()
