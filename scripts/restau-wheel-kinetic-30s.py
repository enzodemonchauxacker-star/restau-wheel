#!/usr/bin/env python3
"""
Restau Wheel — 30s kinetic motion design (local Python + ffmpeg).
Dense motion, procedural SFX, real product UI assets. No Higgsedit.
"""
from __future__ import annotations

import math
import os
import subprocess
import wave
from pathlib import Path
from typing import List, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

W, H = 1920, 1080
FPS = 30
DUR = 30.0
NFRAMES = int(DUR * FPS)

ROOT = Path("/tmp/restau-wheel-kinetic-30s")
ARTIFACTS = Path("/workspace/artifacts/restau-wheel-kinetic-30s")
PUBLIC_ARTIFACTS = Path("/opt/cursor/artifacts/restau-wheel-kinetic-30s")
ASSETS = Path("/tmp/rw-ui")
VOICE = Path("/tmp/rw-voice.wav")
FRAMES = ROOT / "frames"
SFX = ROOT / "sfx"
OUT_MP4 = ROOT / "restau-wheel-kinetic-30s.mp4"

PINK = (255, 45, 106)
YELLOW = (245, 197, 24)
CYAN = (46, 230, 214)
WHITE = (255, 255, 255)
BLACK = (10, 10, 10)
MUTED = (170, 170, 178)

for d in (ROOT, FRAMES, SFX, ARTIFACTS, PUBLIC_ARTIFACTS):
    d.mkdir(parents=True, exist_ok=True)


def ease_out_cubic(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def ease_out_back(t: float, s: float = 1.70158) -> float:
    t = max(0.0, min(1.0, t))
    return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2


def ease_in_out(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 3 * t * t - 2 * t * t * t


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    cands = [
        "/usr/share/fonts/truetype/macos/Inter-Bold.ttf" if bold else "/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in cands:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def load_ui(name: str) -> Image.Image:
    return Image.open(ASSETS / name).convert("RGBA")


UI = {
    "landing": load_ui("landing-16x9.png"),
    "client": load_ui("client.png"),
    "phone": load_ui("design-phone-tourner.jpg"),
    "phone_money": load_ui("design-phone-money.jpg"),
    "qr": load_ui("carte-qr.png"),
}


def rounded(im: Image.Image, size: Tuple[int, int], radius: int = 36) -> Image.Image:
    im = im.convert("RGBA").resize(size, Image.Resampling.LANCZOS)
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.paste(im, (0, 0))
    out.putalpha(mask)
    # pink rim glow
    rim = Image.new("RGBA", size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    rd.rounded_rectangle([1, 1, size[0] - 2, size[1] - 2], radius=radius, outline=(*PINK, 180), width=3)
    return Image.alpha_composite(out, rim)


def zoom_crop(im: Image.Image, scale: float, cx: float = 0.5, cy: float = 0.5) -> Image.Image:
    scale = max(1.0, scale)
    w, h = im.size
    nw, nh = int(w / scale), int(h / scale)
    x0 = int((w - nw) * cx)
    y0 = int((h - nh) * cy)
    return im.crop((x0, y0, x0 + nw, y0 + nh)).resize((w, h), Image.Resampling.LANCZOS)


def paste_center(base: Image.Image, overlay: Image.Image, cx: float, cy: float, opacity: float = 1.0):
    if opacity <= 0:
        return
    ov = overlay
    if opacity < 1:
        a = ov.split()[-1].point(lambda v: int(v * opacity))
        ov = ov.copy()
        ov.putalpha(a)
    x = int(cx - ov.width / 2)
    y = int(cy - ov.height / 2)
    base.alpha_composite(ov, (x, y))


def draw_text(
    base: Image.Image,
    text: str,
    xy: Tuple[float, float],
    size: int,
    color: Tuple[int, int, int],
    *,
    anchor: str = "mm",
    opacity: float = 1.0,
    tracking: int = 0,
    shadow: bool = True,
):
    if opacity <= 0:
        return
    f = font(size)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    col = (*color, int(255 * opacity))
    if shadow:
        d.text((xy[0] + 3, xy[1] + 4), text, font=f, fill=(0, 0, 0, int(160 * opacity)), anchor=anchor)
    if tracking == 0:
        d.text(xy, text, font=f, fill=col, anchor=anchor)
    else:
        # crude tracking
        bbox = d.textbbox((0, 0), text, font=f)
        total = bbox[2] - bbox[0] + tracking * (len(text) - 1)
        x = xy[0] - total / 2 if "m" in anchor else xy[0]
        y = xy[1]
        for ch in text:
            d.text((x, y), ch, font=f, fill=col, anchor="lm")
            cw = d.textbbox((0, 0), ch, font=f)[2]
            x += cw + tracking
    base.alpha_composite(layer)


def particles(base: Image.Image, t: float, n: int = 40, color=PINK):
    d = ImageDraw.Draw(base)
    rng = np.random.default_rng(42)
    for i in range(n):
        seed = (i * 97 + 13) % 1000 / 1000
        x = (seed * 1.7 + t * (0.15 + (i % 5) * 0.03)) % 1.0 * W
        y = ((i * 0.17 + t * 0.08) % 1.0) * H
        r = 2 + (i % 4)
        a = int(80 + 100 * abs(math.sin(t * 3 + i)))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(*color, a))


def glow_orb(base: Image.Image, x: float, y: float, r: float, color, a: int = 90):
    orb = Image.new("RGBA", (int(r * 2), int(r * 2)), (0, 0, 0, 0))
    d = ImageDraw.Draw(orb)
    d.ellipse([0, 0, r * 2 - 1, r * 2 - 1], fill=(*color, a))
    orb = orb.filter(ImageFilter.GaussianBlur(r * 0.45))
    base.alpha_composite(orb, (int(x - r), int(y - r)))


def flash(base: Image.Image, amount: float):
    if amount <= 0:
        return
    white = Image.new("RGBA", base.size, (255, 255, 255, int(220 * amount)))
    base.alpha_composite(white)


def scene_local(t: float, start: float, end: float) -> float:
    if t < start or t >= end:
        return -1.0
    return (t - start) / (end - start)


def render_frame(i: int) -> Image.Image:
    t = i / FPS
    base = Image.new("RGBA", (W, H), (*BLACK, 255))
    particles(base, t, 50, PINK)
    particles(base, t + 10, 30, YELLOW)

    # continuous camera drift
    drift_x = math.sin(t * 0.7) * 18
    drift_y = math.cos(t * 0.55) * 12

    # ===== 0–5 HOOK =====
    s = scene_local(t, 0, 5.2)
    if s >= 0:
        glow_orb(base, 200 + drift_x, 300, 280, PINK, 70)
        glow_orb(base, 1700, 750, 240, YELLOW, 55)
        enter = ease_out_back(min(1, s * 3.2))
        scale = lerp(1.35, 1.0, enter)
        op = min(1, s * 4) * (1 if s < 0.85 else 1 - (s - 0.85) / 0.15)
        y_off = lerp(80, 0, enter) + math.sin(t * 6) * 3
        # fake scale via font size
        draw_text(base, "RESTAU WHEEL", (W / 2 + drift_x * 0.3, 380 + y_off), int(96 * scale), WHITE, opacity=op, tracking=10)
        enter2 = ease_out_back(max(0, min(1, (s - 0.12) * 3)))
        draw_text(
            base,
            "Une roue de fortune sur chaque table",
            (W / 2, 500 + lerp(50, 0, enter2)),
            44,
            YELLOW,
            opacity=enter2 * op,
        )
        enter3 = ease_out_cubic(max(0, min(1, (s - 0.25) * 2.5)))
        draw_text(
            base,
            "Le SaaS de fidélisation pour restaurants",
            (W / 2, 580 + lerp(30, 0, enter3)),
            28,
            MUTED,
            opacity=enter3 * op,
        )
        if s < 0.08:
            flash(base, 1 - s / 0.08)

    # ===== 5.2–12 FLOW =====
    s = scene_local(t, 5.0, 12.2)
    if s >= 0:
        op = min(1, s * 5) * (1 if s < 0.9 else 1 - (s - 0.9) / 0.1)
        # title whip from left
        tx = lerp(-400, 120, ease_out_back(min(1, s * 2.5))) + drift_x
        draw_text(base, "COMMENT ÇA MARCHE", (tx + 420, 90), 48, PINK, anchor="lm", opacity=op, tracking=4)

        steps = [
            (0.05, "1 · SCAN QR", "Le client scanne sur la table"),
            (0.28, "2 · TICKET", "Il remplit son entrée"),
            (0.52, "3 · TOURNER", "Il gagne — et revient"),
        ]
        for delay, title, sub in steps:
            ls = max(0, min(1, (s - delay) * 4))
            e = ease_out_back(ls)
            y = 220 + steps.index((delay, title, sub)) * 140
            x = lerp(-300, 140, e) + drift_x * 0.4
            draw_text(base, title, (x, y), 34, YELLOW, anchor="lm", opacity=e * op)
            draw_text(base, sub, (x, y + 42), 24, MUTED, anchor="lm", opacity=e * op * 0.9)

        # UI plate flies in from right with punch zoom
        ui_e = ease_out_back(max(0, min(1, (s - 0.08) * 2.2)))
        z = 1.0 + 0.08 * math.sin(t * 2.2)
        landing = zoom_crop(UI["landing"], 1.05 + 0.04 * math.sin(t * 1.5), 0.55, 0.45)
        plate = rounded(landing, (int(980 * (0.85 + 0.15 * ui_e)), int(690 * (0.85 + 0.15 * ui_e))), 40)
        # motion blur trail
        if ui_e < 0.95:
            trail = plate.filter(ImageFilter.GaussianBlur(8 * (1 - ui_e)))
            paste_center(base, trail, lerp(2300, 1280, ui_e) + 40, 560 + drift_y, opacity=0.35 * op)
        paste_center(base, plate, lerp(2300, 1280, ui_e) + drift_x * 0.2, 560 + drift_y + math.sin(t * 3) * 6, opacity=op)

        # QR stamp
        qr_e = ease_out_back(max(0, min(1, (s - 0.35) * 3)))
        qr = rounded(UI["qr"], (int(180 * (1.4 - 0.4 * qr_e)), int(180 * (1.4 - 0.4 * qr_e))), 24)
        paste_center(base, qr, 420 + drift_x, 820 + lerp(120, 0, qr_e), opacity=qr_e * op)
        if 0.35 < s < 0.42:
            flash(base, (0.42 - s) / 0.07 * 0.5)

    # ===== 12–20 PRODUCT =====
    s = scene_local(t, 11.8, 20.2)
    if s >= 0:
        op = min(1, (s) * 5) * (1 if s < 0.9 else 1 - (s - 0.9) / 0.1)
        draw_text(
            base,
            "VOS CLIENTS REVIENNENT",
            (W / 2 + drift_x * 0.2, 70 + lerp(-40, 0, ease_out_back(min(1, s * 3)))),
            52,
            CYAN,
            opacity=op,
            tracking=6,
        )

        left_e = ease_out_back(max(0, min(1, s * 2.4)))
        right_e = ease_out_back(max(0, min(1, (s - 0.08) * 2.4)))
        client = zoom_crop(UI["client"], 1.08 + 0.03 * math.sin(t * 1.8), 0.5, 0.4 + 0.05 * math.sin(t))
        phone = zoom_crop(UI["phone"], 1.1 + 0.05 * math.sin(t * 2.4), 0.5, 0.5)
        p1 = rounded(client, (820, 740), 36)
        p2 = rounded(phone, (780, 740), 36)
        # rotate-ish via offset parallax
        paste_center(base, p1, lerp(-500, 500, left_e) + drift_x, 560 + drift_y, opacity=op)
        paste_center(base, p2, lerp(2400, 1420, right_e) - drift_x, 560 - drift_y, opacity=op)

        # prize ticker
        prizes = ["DESSERT", "BOISSON", "RÉDUCTION", "SURPRISE"]
        idx = int((t * 2.2) % len(prizes))
        pe = ease_out_cubic(max(0, min(1, (s - 0.2) * 3)))
        draw_text(base, prizes[idx], (W / 2, 980), 36, YELLOW, opacity=pe * op)
        draw_text(base, "vous gardez la main sur lots & odds", (W / 2, 1030), 22, MUTED, opacity=pe * op)
        if abs((t * 2.2) % 1) < 0.05:
            flash(base, 0.15)

    # ===== 20–26 PRICE =====
    s = scene_local(t, 19.8, 26.2)
    if s >= 0:
        op = min(1, s * 5) * (1 if s < 0.88 else 1 - (s - 0.88) / 0.12)
        glow_orb(base, W / 2, H / 2, 360, YELLOW, 40)
        draw_text(
            base,
            "VOUS CONTRÔLEZ TOUT",
            (W / 2, 280 + lerp(40, 0, ease_out_back(min(1, s * 3)))),
            56,
            WHITE,
            opacity=op,
            tracking=5,
        )
        draw_text(
            base,
            "Lots · probabilités · QR unique",
            (W / 2, 360),
            30,
            MUTED,
            opacity=op * ease_out_cubic(max(0, min(1, (s - 0.1) * 3))),
        )
        # price slam
        pe = ease_out_back(max(0, min(1, (s - 0.22) * 3.5)))
        price_scale = lerp(1.6, 1.0, pe)
        # yellow pill
        pill_w, pill_h = int(620 * pe), int(150 * pe)
        if pill_w > 10:
            pill = Image.new("RGBA", (pill_w, pill_h), (0, 0, 0, 0))
            ImageDraw.Draw(pill).rounded_rectangle([0, 0, pill_w - 1, pill_h - 1], radius=pill_h // 2, fill=(*YELLOW, int(255 * op)))
            paste_center(base, pill, W / 2, 560 + math.sin(t * 8) * (1 - pe) * 20, opacity=1)
        draw_text(base, "20 € / mois", (W / 2, 545), int(64 * price_scale), BLACK, opacity=pe * op)
        draw_text(
            base,
            "Simple. Sans engagement caché.",
            (W / 2, 680),
            26,
            WHITE,
            opacity=pe * op * ease_out_cubic(max(0, min(1, (s - 0.35) * 3))),
        )
        if 0.22 < s < 0.30:
            flash(base, (0.30 - s) / 0.08 * 0.7)

    # ===== 26–30 CTA =====
    s = scene_local(t, 25.8, 30.0)
    if s >= 0:
        op = min(1, s * 6)
        glow_orb(base, W / 2, H / 2, 300 + 40 * math.sin(t * 3), PINK, 80)
        draw_text(
            base,
            "RESTAU WHEEL",
            (W / 2, 360 + lerp(50, 0, ease_out_back(min(1, s * 3)))),
            72,
            WHITE,
            opacity=op,
            tracking=8,
        )
        be = ease_out_back(max(0, min(1, (s - 0.15) * 3)))
        bw, bh = int(720 * be), int(96 * be)
        if bw > 10:
            btn = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
            ImageDraw.Draw(btn).rounded_rectangle([0, 0, bw - 1, bh - 1], radius=bh // 2, fill=(*PINK, int(255 * op)))
            paste_center(base, btn, W / 2, 520 + math.sin(t * 5) * 4, opacity=1)
        draw_text(base, "Créer mon restaurant  →", (W / 2, 520), 34, WHITE, opacity=be * op)
        draw_text(
            base,
            "restauwheel.com",
            (W / 2, 640),
            32,
            YELLOW,
            opacity=op * ease_out_cubic(max(0, min(1, (s - 0.35) * 3))),
            tracking=2,
        )
        if s < 0.06:
            flash(base, 1 - s / 0.06)

    # vignette
    vig = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    vd = ImageDraw.Draw(vig)
    for i in range(80):
        a = int(90 * (i / 80) ** 2)
        vd.rectangle([0, i, W, i], fill=(0, 0, 0, a))
        vd.rectangle([0, H - 1 - i, W, H - 1 - i], fill=(0, 0, 0, a))
    base.alpha_composite(vig)
    return base.convert("RGB")


def write_wav(path: Path, samples: np.ndarray, sr: int = 44100):
    samples = np.clip(samples, -1, 1)
    pcm = (samples * 32767).astype(np.int16)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def tone(sr, freq, dur, amp=0.3, decay=True):
    n = int(sr * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    env = np.linspace(1, 0, n) if decay else np.ones(n)
    if decay:
        env = np.exp(-np.linspace(0, 5, n))
    return amp * env * np.sin(2 * math.pi * freq * t)


def noise_burst(sr, dur, amp=0.25):
    n = int(sr * dur)
    env = np.exp(-np.linspace(0, 8, n))
    return amp * env * (np.random.randn(n))


def whoosh(sr, dur=0.28, amp=0.35):
    n = int(sr * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    # band-limited noise with rising filter illusion via amplitude + sine sweep
    noise = np.random.randn(n) * 0.5
    sweep = np.sin(2 * math.pi * (200 + 1800 * (t / dur)) * t) * 0.35
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.2
    return amp * env * (noise * 0.6 + sweep)


def mix_samples(*parts: np.ndarray) -> np.ndarray:
    n = max(len(p) for p in parts)
    out = np.zeros(n, dtype=np.float64)
    for p in parts:
        out[: len(p)] += p
    return out


def hit(sr, amp=0.45):
    return mix_samples(
        tone(sr, 90, 0.18, amp),
        tone(sr, 180, 0.12, amp * 0.5),
        noise_burst(sr, 0.08, amp * 0.4),
    )


def tick(sr, amp=0.2):
    return mix_samples(tone(sr, 2200, 0.04, amp, decay=True), noise_burst(sr, 0.03, amp * 0.3))


def riser(sr, dur=1.2, amp=0.25):
    n = int(sr * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    freq = 120 + 900 * (t / dur) ** 2
    phase = 2 * math.pi * np.cumsum(freq) / sr
    env = (t / dur) ** 1.5
    return amp * env * np.sin(phase) + 0.15 * amp * env * np.random.randn(n)


def build_sfx_bed(sr: int = 44100) -> Path:
    total = np.zeros(int(sr * DUR), dtype=np.float64)

    def place(sample, at):
        i0 = int(at * sr)
        i1 = min(len(total), i0 + len(sample))
        total[i0:i1] += sample[: i1 - i0]

    # dense timeline
    events = [
        (0.05, hit(sr, 0.55)),
        (0.15, whoosh(sr, 0.32, 0.4)),
        (0.9, tick(sr)),
        (1.4, tick(sr, 0.15)),
        (2.2, whoosh(sr, 0.25, 0.3)),
        (4.9, whoosh(sr, 0.35, 0.45)),
        (5.05, hit(sr, 0.4)),
        (5.6, tick(sr)),
        (6.8, whoosh(sr, 0.3, 0.35)),
        (7.9, tick(sr, 0.18)),
        (8.5, hit(sr, 0.3)),
        (9.2, whoosh(sr, 0.28, 0.3)),
        (11.7, whoosh(sr, 0.4, 0.45)),
        (11.9, hit(sr, 0.5)),
        (13.0, tick(sr)),
        (14.2, whoosh(sr, 0.25, 0.28)),
        (15.5, tick(sr, 0.16)),
        (16.8, whoosh(sr, 0.3, 0.32)),
        (18.0, tick(sr)),
        (19.6, riser(sr, 1.1, 0.28)),
        (20.1, hit(sr, 0.6)),
        (20.3, whoosh(sr, 0.35, 0.4)),
        (22.0, tick(sr)),
        (23.5, whoosh(sr, 0.25, 0.25)),
        (25.6, riser(sr, 0.9, 0.3)),
        (25.9, hit(sr, 0.55)),
        (26.2, whoosh(sr, 0.4, 0.4)),
        (27.5, tick(sr, 0.2)),
        (28.8, whoosh(sr, 0.3, 0.3)),
        (29.4, hit(sr, 0.35)),
    ]
    for at, sample in events:
        place(sample, at)

    # low pulse bed
    n = len(total)
    tt = np.arange(n) / sr
    bed = 0.04 * np.sin(2 * math.pi * 55 * tt) * (0.5 + 0.5 * np.sin(2 * math.pi * 0.5 * tt))
    total += bed

    peak = np.max(np.abs(total)) or 1
    total = total / peak * 0.85
    out = SFX / "bed.wav"
    write_wav(out, total, sr)
    return out


def render_all():
    print(f"Rendering {NFRAMES} frames…")
    for i in range(NFRAMES):
        frame = render_frame(i)
        frame.save(FRAMES / f"f_{i:05d}.png", optimize=False)
        if i % 30 == 0:
            print(f"  {i}/{NFRAMES}")
    print("Frames done")


def mux():
    sfx = build_sfx_bed()
    silent_video = ROOT / "video_silent.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", str(FRAMES / "f_%05d.png"),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
            "-movflags", "+faststart",
            str(silent_video),
        ],
        check=True,
    )

    # mix VO + SFX
    vo = VOICE if VOICE.exists() else None
    filter_complex = "[1:a]volume=0.55[sfx];"
    inputs = ["-i", str(silent_video), "-i", str(sfx)]
    if vo:
        inputs += ["-i", str(vo)]
        filter_complex += (
            "[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,"
            "volume=1.1,apad=whole_dur=30[vo];"
            "[sfx][vo]amix=inputs=2:duration=first:dropout_transition=0[a]"
        )
    else:
        filter_complex += "[sfx]anull[a]"

    subprocess.run(
        [
            "ffmpeg", "-y",
            *inputs,
            "-filter_complex", filter_complex,
            "-map", "0:v", "-map", "[a]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-t", str(DUR),
            "-shortest",
            str(OUT_MP4),
        ],
        check=True,
    )

    # preview frames + copy deliverables to artifacts
    for sec, name in [(1, "hook"), (8, "howto"), (16, "product"), (28, "cta")]:
        preview = ARTIFACTS / f"{name}.png"
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(sec), "-i", str(OUT_MP4), "-frames:v", "1", str(preview)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    import shutil

    shutil.copy2(OUT_MP4, ARTIFACTS / OUT_MP4.name)
    try:
        shutil.copy2(OUT_MP4, PUBLIC_ARTIFACTS / OUT_MP4.name)
        for name in ("hook", "howto", "product", "cta"):
            src = ARTIFACTS / f"{name}.png"
            if src.exists():
                shutil.copy2(src, PUBLIC_ARTIFACTS / src.name)
    except OSError as exc:
        print("warn public artifacts copy:", exc)
    print("OUT", ARTIFACTS / OUT_MP4.name)


def main():
    render_all()
    mux()
    subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size", "-of", "default=nw=1", str(OUT_MP4)])


if __name__ == "__main__":
    main()
