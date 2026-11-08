#!/usr/bin/env python3
"""Restau Wheel — motion design kinétique 30 s (30 fps).

Pipeline 100 % local : rendu image par image PIL/numpy (vrais visuels produit),
SFX procéduraux générés par ffmpeg (aevalsrc), mix VO + SFX + bed en numpy,
puis encodage H.264/AAC avec ffmpeg.

Usage :
    python3 scripts/restau-wheel-kinetic-30s.py                 # 16:9 1920x1080
    python3 scripts/restau-wheel-kinetic-30s.py --vertical      # 9:16 1080x1920
    python3 scripts/restau-wheel-kinetic-30s.py --preview 1,8,16
    python3 scripts/restau-wheel-kinetic-30s.py --png-frames

Dépendances : Python 3.9+, Pillow, numpy, ffmpeg/ffprobe dans le PATH.
"""

import argparse
import bisect
import functools
import json
import math
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import wave
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Espace design (scènes écrites en 16:9) — le canvas peut être 9:16 via --vertical.
DW, DH = 1920, 1080
W, H = DW, DH
VERTICAL = False
FPS, DUR = 30, 30.0
NFRAMES = int(round(FPS * DUR))
SR = 48000

ASSETS = os.environ.get("RW_ASSETS", "/opt/cursor/artifacts/restau-wheel-real-ui")
OUT_DIR = os.environ.get("RW_OUT", "/opt/cursor/artifacts/restau-wheel-kinetic-30s")
WORK_DIR = os.environ.get("RW_WORK", "/tmp/restau-wheel-kinetic-30s")
VO_LOCAL = "/opt/cursor/artifacts/restau-wheel-motion-30s/voice.wav"
VO_URL = (
    "https://d8j0ntlcm91z4.cloudfront.net/user_3FtfBHx3ODuHtkhLTPM9V4BijnV/"
    "hf_20260930_141010_383d1544-f1f1-45fe-a5ef-1335c12547c1.wav"
)
# VO ElevenLabs V4 (API Higgsfield) — clips scène par scène, prioritaire sur VO_LOCAL.
VO_CLIPS_DIR = os.environ.get(
    "RW_VO_CLIPS",
    "/opt/cursor/artifacts/restau-wheel-kinetic-30s-9x16/vo-clips",
)
# (fichier local, position timeline s) — voix homme Andre / elevenlabs_v4
VO_CLIPS = [
    ("0-hook.wav", 0.50),
    ("1-flow.wav", 5.30),
    ("2-value.wav", 12.20),
    ("3-control.wav", 19.30),
    ("4-price.wav", 23.20),
    ("5-cta.wav", 26.10),
]
VO_CLIPS_URLS = [
    "https://d8j0ntlcm91z4.cloudfront.net/user_3FtfBHx3ODuHtkhLTPM9V4BijnV/"
    "hf_20260930_175005_d67cc124-71db-4859-b1dd-bbdd83be5108.mp3",
    "https://d8j0ntlcm91z4.cloudfront.net/user_3FtfBHx3ODuHtkhLTPM9V4BijnV/"
    "hf_20260930_175004_591767b6-703b-4e65-b1a2-ccbdd0be6d05.mp3",
    "https://d8j0ntlcm91z4.cloudfront.net/user_3FtfBHx3ODuHtkhLTPM9V4BijnV/"
    "hf_20260930_175004_790274e7-2530-4197-a9d0-2501e82fd132.mp3",
    "https://d8j0ntlcm91z4.cloudfront.net/user_3FtfBHx3ODuHtkhLTPM9V4BijnV/"
    "hf_20260930_175004_6e14b772-9622-4ba4-8114-fd745379dc19.mp3",
    "https://d8j0ntlcm91z4.cloudfront.net/user_3FtfBHx3ODuHtkhLTPM9V4BijnV/"
    "hf_20260930_175004_5a8a2ab7-6b6e-4ea8-8e91-01659bd1cb7a.mp3",
    "https://d8j0ntlcm91z4.cloudfront.net/user_3FtfBHx3ODuHtkhLTPM9V4BijnV/"
    "hf_20260930_175005_288dde4f-5079-485a-9670-5a4520a95d62.mp3",
]

BLACK = (10, 10, 10)
PINK = (255, 45, 106)
YELLOW = (245, 197, 24)
CYAN = (46, 230, 214)
WHITE = (255, 255, 255)
CREAM = (255, 248, 231)
# Couleurs exactes de la roue du ticket (échantillonnées sur la landing).
WHEEL_SEGS = [CREAM, BLACK, (255, 45, 106), (255, 214, 10), (0, 194, 255),
              (0, 229, 200), (255, 45, 106), (255, 214, 10)]

# ---------------------------------------------------------------------------
# Timeline : scènes, VO, événements. Source unique pour l'image ET le son.
# ---------------------------------------------------------------------------
SCENES = [
    ("hook", 0.0, 5.0),      # Restau Wheel. Une roue de fortune sur chaque table.
    ("qr", 5.0, 7.4),        # Vos clients scannent le QR,
    ("ticket", 7.4, 9.2),    # remplissent leur ticket,
    ("spin", 9.2, 12.0),     # et tournent la roue.
    ("win", 12.0, 19.0),     # Ils gagnent un lot, dessert, boisson, réduction et reviennent.
    ("control", 19.0, 23.0),  # Vous contrôlez les lots et les probabilités.
    ("price", 23.0, 26.0),   # Vingt euros par mois.
    ("cta", 26.0, 30.0),     # Créez votre restaurant sur restauwheel.com.
]

# VO découpée dans ses silences (timings mesurés au mot près) puis recalée sur les scènes :
# (début source, fin source, position timeline).
VO_EXPECTED_DUR = 24.78
VO_CHUNKS = [
    (0.00, 4.25, 0.50),
    (4.25, 9.55, 5.30),
    (9.55, 15.55, 12.20),
    (15.55, 18.90, 19.30),
    (18.90, 21.00, 23.20),
    (21.00, 24.78, 26.10),
]

SPIN_T0, SPIN_T1, SPIN_TOTAL = 9.62, 11.62, 1710.0  # finit sur le segment rose

FLASHES = [(0.50, 0.12, PINK, 0.55), (6.68, 0.10, WHITE, 0.35), (11.95, 0.24, WHITE, 1.0),
           (17.37, 0.10, WHITE, 0.4), (23.58, 0.12, YELLOW, 0.6), (25.93, 0.22, PINK, 1.0),
           (29.35, 0.10, WHITE, 0.3)]
GLITCHES = [(0.48, 0.58, 0.6), (6.64, 6.78, 0.8), (18.80, 19.12, 1.0), (23.56, 23.64, 0.5)]
# (temps de coupe, type, direction)
TRANSITIONS = [(5.0, "whip_h", -1), (7.4, "whip_v", -1), (9.2, "zoom", 0), (23.0, "whip_h", 1)]

BURSTS_DESIGN = [
    (0.50, 960, 440, 70, (PINK, YELLOW, WHITE), 1.0, "dot"),
    (3.80, 420, 760, 45, (YELLOW, CYAN), 0.8, "dot"),
    (6.68, 1330, 540, 70, (CYAN, WHITE), 1.0, "dot"),
    (9.62, 1330, 560, 50, (PINK, YELLOW, CYAN), 1.2, "dot"),
    (11.62, 1330, 150, 80, (PINK, YELLOW, CYAN, WHITE), 1.0, "confetti"),
    (12.02, 960, 540, 140, (PINK, YELLOW, CYAN, WHITE), 1.5, "confetti"),
    (13.95, 520, 560, 45, (PINK, WHITE), 0.9, "dot"),
    (15.05, 520, 560, 45, (CYAN, WHITE), 0.9, "dot"),
    (16.01, 520, 560, 45, (YELLOW, WHITE), 0.9, "dot"),
    (17.37, 960, 560, 90, (PINK, YELLOW, CYAN), 1.2, "confetti"),
    (21.35, 420, 670, 30, (CYAN,), 0.7, "dot"),
    (23.58, 1060, 500, 100, (YELLOW, PINK, WHITE), 1.4, "dot"),
    (26.10, 960, 300, 60, (PINK, YELLOW, CYAN), 1.0, "dot"),
    (29.35, 960, 820, 90, (PINK, YELLOW, CYAN, WHITE), 1.2, "confetti"),
]
BURSTS = list(BURSTS_DESIGN)


def configure_format(vertical: bool = False):
    """Active le canvas 9:16 (1080x1920) ou 16:9 (1920x1080). Les scènes restent en coords design."""
    global W, H, VERTICAL, OUT_DIR, WORK_DIR, BURSTS
    VERTICAL = vertical
    if vertical:
        W, H = 1080, 1920
        OUT_DIR = os.environ.get("RW_OUT", "/opt/cursor/artifacts/restau-wheel-kinetic-30s-9x16")
        WORK_DIR = os.environ.get("RW_WORK", "/tmp/restau-wheel-kinetic-30s-9x16")
        BURSTS = [(t, x * W / DW, y * H / DH, n, c, p, k) for (t, x, y, n, c, p, k) in BURSTS_DESIGN]
    else:
        W, H = DW, DH
        OUT_DIR = os.environ.get("RW_OUT", "/opt/cursor/artifacts/restau-wheel-kinetic-30s")
        WORK_DIR = os.environ.get("RW_WORK", "/tmp/restau-wheel-kinetic-30s")
        BURSTS = list(BURSTS_DESIGN)


def d2c(cx, cy, scale=1.0):
    """Design (DW×DH) → canvas (W×H). En vertical : X shrink, Y stretch (plus d'air)."""
    if not VERTICAL:
        return cx, cy, scale
    return cx * W / DW, cy * H / DH, scale * (W / DW)


def P(x, y=None):
    """Remap d'un point (ou d'une abscisse seule) pour ImageDraw sur le canvas."""
    if y is None:
        return x * W / DW if VERTICAL else x
    if not VERTICAL:
        return x, y
    return x * W / DW, y * H / DH

# ---------------------------------------------------------------------------
# Easings : cubic-bezier (comme en CSS/After Effects) + springs amortis.
# ---------------------------------------------------------------------------


def cubic_bezier(x1, y1, x2, y2):
    def bx(t):
        return 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3

    def by(t):
        return 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3

    def dbx(t):
        return 3 * (1 - t) ** 2 * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2)

    @functools.lru_cache(maxsize=4096)
    def solve(x):
        t = x
        for _ in range(8):
            d = dbx(t)
            if abs(d) < 1e-6:
                break
            t2 = t - (bx(t) - x) / d
            if not 0.0 <= t2 <= 1.0:
                break
            t = t2
        if abs(bx(t) - x) > 1e-4:
            lo, hi = 0.0, 1.0
            for _ in range(40):
                t = (lo + hi) / 2
                if bx(t) < x:
                    lo = t
                else:
                    hi = t
        return by(t)

    def f(x):
        if x <= 0:
            return 0.0
        if x >= 1:
            return 1.0
        return solve(round(x, 5))

    return f


EO = cubic_bezier(0.16, 1.0, 0.3, 1.0)       # expo-out
EI = cubic_bezier(0.7, 0.0, 0.84, 0.0)       # expo-in
EIO = cubic_bezier(0.65, 0.0, 0.35, 1.0)
EBACK = cubic_bezier(0.34, 1.56, 0.64, 1.0)  # overshoot
EHOUSE = cubic_bezier(0.22, 1.35, 0.36, 1.0)  # overshoot plus sec


def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def lerp(a, b, p):
    return a + (b - a) * p


def E(t, t0, d, ease=EO):
    return ease(clamp01((t - t0) / d))


def spring(dt, f=2.4, z=7.0):
    """0 -> 1 avec dépassement amorti (dt en secondes)."""
    if dt <= 0:
        return 0.0
    return 1.0 - math.exp(-z * dt) * math.cos(2 * math.pi * f * dt)


def decay(t, t0, k=10.0):
    return math.exp(-k * (t - t0)) if t >= t0 else 0.0


def punch(t, times, amp=0.06, k=9.0):
    return 1.0 + sum(amp * decay(t, tp, k) for tp in times if t >= tp)


# ---------------------------------------------------------------------------
# Polices
# ---------------------------------------------------------------------------
FONT_SOURCES = {
    "anton": ("Anton-Regular.ttf",
              "https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf"),
    "bebas": ("BebasNeue-Regular.ttf",
              "https://github.com/google/fonts/raw/main/ofl/bebasneue/BebasNeue-Regular.ttf"),
    "montserrat": ("Montserrat-wght.ttf",
                   "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf"),
}
FONT_FALLBACKS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]
MONO_CANDIDATES = [
    "/usr/share/fonts/truetype/macos/JetBrainsMono-Bold.ttf",
    "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
]
FONT_PATHS = {}


def ensure_fonts():
    cache = os.path.join(os.path.expanduser("~"), ".cache", "restau-wheel-kinetic", "fonts")
    os.makedirs(cache, exist_ok=True)
    fallback = next((p for p in FONT_FALLBACKS if os.path.exists(p)), None)
    for key, (fname, url) in FONT_SOURCES.items():
        path = os.path.join(cache, fname)
        if not os.path.exists(path) or os.path.getsize(path) < 10000:
            try:
                urllib.request.urlretrieve(url, path)
            except Exception as exc:  # réseau indisponible -> fallback
                print(f"[fonts] {key}: téléchargement impossible ({exc}), fallback DejaVu")
                path = fallback
        FONT_PATHS[key] = path
    FONT_PATHS["mono"] = next((p for p in MONO_CANDIDATES if os.path.exists(p)), fallback)


@functools.lru_cache(maxsize=256)
def F(name, size):
    font = ImageFont.truetype(FONT_PATHS[name], size)
    if name == "montserrat":
        try:
            font.set_variation_by_axes([800])
        except Exception:
            pass
    return font


# ---------------------------------------------------------------------------
# Texte
# ---------------------------------------------------------------------------


@functools.lru_cache(maxsize=1024)
def text_img(s, font="anton", size=120, color=WHITE, tracking=0.0, hollow=0):
    """Texte RGBA recadré. hollow>0 = contour seul (épaisseur en px)."""
    f = F(font, size)
    asc, desc = f.getmetrics()
    pad = int(size * 0.15) + hollow
    adv = [f.getlength(ch) for ch in s]
    total = sum(adv) + tracking * size * max(0, len(s) - 1)
    w, h = int(total + 2 * pad), int(asc + desc + 2 * pad)
    fill_m = Image.new("L", (w, h), 0)
    stroke_m = Image.new("L", (w, h), 0) if hollow else None
    df = ImageDraw.Draw(fill_m)
    ds = ImageDraw.Draw(stroke_m) if hollow else None
    x = pad
    for ch, a in zip(s, adv):
        df.text((x, pad), ch, font=f, fill=255)
        if hollow:
            ds.text((x, pad), ch, font=f, fill=255, stroke_width=hollow, stroke_fill=255)
        x += a + tracking * size
    alpha = fill_m
    if hollow:
        alpha = Image.fromarray(np.clip(np.asarray(stroke_m, np.int16) - np.asarray(fill_m, np.int16),
                                        0, 255).astype(np.uint8))
    img = Image.new("RGBA", (w, h), color + (0,))
    img.putalpha(alpha)
    bbox = alpha.getbbox()
    if bbox:
        img = img.crop((max(0, bbox[0] - 4), max(0, bbox[1] - 4), min(w, bbox[2] + 4), min(h, bbox[3] + 4)))
    return img


@functools.lru_cache(maxsize=256)
def letter_imgs(s, font, size, color, tracking=0.0):
    """Lettres séparées sur une ligne de base commune -> (imgs, centres x, largeur totale)."""
    f = F(font, size)
    asc, desc = f.getmetrics()
    pad = int(size * 0.15)
    h = asc + desc + 2 * pad
    imgs, centers, x = [], [], 0.0
    for ch in s:
        a = f.getlength(ch)
        im = Image.new("RGBA", (int(a) + 2 * pad, h), color + (0,))
        m = Image.new("L", im.size, 0)
        ImageDraw.Draw(m).text((pad, pad), ch, font=f, fill=255)
        im.putalpha(m)
        imgs.append(im)
        centers.append(x + a / 2)
        x += a + tracking * size
    total = x - tracking * size
    return imgs, centers, total


@functools.lru_cache(maxsize=64)
def chip_img(s, color, size=76, fg=BLACK, pad_x=34, pad_y=18, radius=14):
    t = text_img(s, "anton", size, fg)
    w, h = t.width + 2 * pad_x, t.height + 2 * pad_y
    im = Image.new("RGBA", (w + 12, h + 12), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((12, 12, w + 11, h + 11), radius, fill=(0, 0, 0, 200))
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius, fill=color + (255,))
    im.alpha_composite(t, (pad_x, pad_y))
    return im


# ---------------------------------------------------------------------------
# Compositing
# ---------------------------------------------------------------------------


def with_alpha(im, alpha):
    if alpha >= 0.999:
        return im
    a = im.getchannel("A").point([int(v * alpha) for v in range(256)])
    out = im.copy()
    out.putalpha(a)
    return out


def place(cv, img, cx, cy, scale=1.0, rot=0.0, alpha=1.0, resample=Image.BICUBIC):
    """Colle img centré en (cx, cy) design avec échelle, rotation (degrés, anti-horaire) et opacité."""
    if alpha <= 0.004 or scale <= 0.01:
        return
    cx, cy, scale = d2c(cx, cy, scale)
    im = img
    if abs(scale - 1.0) > 1e-3:
        im = im.resize((max(1, int(round(im.width * scale))), max(1, int(round(im.height * scale)))), resample)
    if abs(rot) > 0.05:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    im = with_alpha(im, alpha)
    x0, y0 = int(round(cx - im.width / 2)), int(round(cy - im.height / 2))
    sx, sy = max(0, -x0), max(0, -y0)
    ex, ey = min(im.width, cv.width - x0), min(im.height, cv.height - y0)
    if ex <= sx or ey <= sy:
        return
    if (sx, sy, ex, ey) != (0, 0, im.width, im.height):
        im = im.crop((sx, sy, ex, ey))
    cv.alpha_composite(im, (x0 + sx, y0 + sy))


def draw_state(cv, img, st, t, trail=4, trail_dt=0.012, gain=0.3):
    """Élément animé par une fonction d'état st(t)->(x,y,s,rot,alpha) + traînée de flou."""
    s = st(t)
    if s is None:
        return
    if trail:
        p = st(t - trail_dt * trail)
        if p is not None:
            speed = math.hypot(s[0] - p[0], s[1] - p[1]) + abs(s[2] - p[2]) * img.width * 0.5 + abs(s[3] - p[3]) * 6
            if speed > 10:
                for k in range(trail, 0, -1):
                    g = st(t - trail_dt * k)
                    if g is not None:
                        place(cv, img, g[0], g[1], g[2], g[3], g[4] * gain * (1 - k / (trail + 1)))
    place(cv, img, *s)


def slam(t0, cx, cy, s0=1.2, dx=0.0, dy=60.0, rot0=0.0, dur=0.32, fade=0.07,
         drift=(0.0, -7.0), grow=0.014, exit_t=None, exit_dur=0.2, exit_vec=(0.0, -420.0),
         exit_scale=1.0, sf=2.6, sz=7.5, punches=()):
    """Entrée 'kinetic' : scale s0 -> 100 %, offset en spring, dérive continue, sortie whip."""
    def st(t):
        if t < t0:
            return None
        dt = t - t0
        sp = spring(dt, sf, sz)
        sc = lerp(s0, 1.0, EO(clamp01(dt / dur))) + grow * dt
        sc *= punch(t, punches, 0.07, 10)
        x = cx + dx * (1 - sp) + drift[0] * dt
        y = cy + dy * (1 - sp) + drift[1] * dt
        r = rot0 * (1 - sp)
        a = clamp01(dt / fade)
        if exit_t is not None and t > exit_t:
            q = EI(clamp01((t - exit_t) / exit_dur))
            x += exit_vec[0] * q
            y += exit_vec[1] * q
            sc *= lerp(1.0, exit_scale, q)
            a *= 1 - q
            if a <= 0.004:
                return None
        return (x, y, sc, r, a)
    return st


def left(x, img, scale=1.0):
    return x + img.width * scale / 2


def draw_letters(cv, s, font, size, color, cx, cy, t, t0, stagger=0.03, mode="drop",
                 tracking=0.0, exit_t=None, exit_vec=(0, -400), exit_dur=0.2, wave_amp=4.0):
    imgs, centers, total = letter_imgs(s, font, size, color, tracking)
    x0 = cx - total / 2
    q = EI(clamp01((t - exit_t) / exit_dur)) if exit_t is not None and t > exit_t else 0.0
    for i, (im, c) in enumerate(zip(imgs, centers)):
        ti = t0 + i * stagger
        if t < ti:
            continue
        dt = t - ti
        sp = spring(dt, 2.4, 7.0)
        side = 1 if i % 2 else -1
        if mode == "drop":
            ox, oy, sc, r = 0, -150 * (1 - sp), lerp(1.4, 1.0, EO(clamp01(dt / 0.3))), 22 * side * (1 - sp)
        elif mode == "rise":
            ox, oy, sc, r = 0, 140 * (1 - sp), lerp(0.6, 1.0, EO(clamp01(dt / 0.3))), -14 * side * (1 - sp)
        else:  # pop
            ox, oy, sc, r = 0, 0, EBACK(clamp01(dt / 0.32)), 40 * side * (1 - sp)
        oy += wave_amp * math.sin(t * 3.2 + i * 0.55)
        a = clamp01(dt / 0.06) * (1 - q)
        place(cv, im, x0 + c + ox + exit_vec[0] * q, cy + oy + exit_vec[1] * q, sc, r, a)


# ---------------------------------------------------------------------------
# Assets (vrais visuels produit) + sprites procéduraux
# ---------------------------------------------------------------------------
A = {}


def load(name, mode="RGBA"):
    return Image.open(os.path.join(ASSETS, name)).convert(mode)


def cut_dark_border(img, thr=62):
    """Rend transparent le fond sombre connecté aux bords (ticket de la landing)."""
    rgb = img.convert("RGB")
    lum = rgb.convert("L").point(lambda v: 0 if v < thr else 255)
    w, h = lum.size
    seeds = [(x, 0) for x in range(0, w, 12)] + [(x, h - 1) for x in range(0, w, 12)]
    seeds += [(0, y) for y in range(0, h, 12)] + [(w - 1, y) for y in range(0, h, 12)]
    for sd in seeds:
        if lum.getpixel(sd) == 0:
            ImageDraw.floodfill(lum, sd, 128)
    alpha = lum.point(lambda v: 0 if v == 128 else 255).filter(ImageFilter.GaussianBlur(0.7))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def rounded(img, radius):
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(m)
    return out


def card(img, radius=26, shadow=(22, 22), shadow_color=PINK, border=0, border_color=BLACK):
    w, h = img.width + 2 * border, img.height + 2 * border
    sx, sy = shadow
    out = Image.new("RGBA", (w + abs(sx), h + abs(sy)), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    ox, oy = max(0, -sx), max(0, -sy)
    d.rounded_rectangle((ox + sx, oy + sy, ox + sx + w - 1, oy + sy + h - 1), radius, fill=shadow_color + (255,))
    if border:
        d.rounded_rectangle((ox, oy, ox + w - 1, oy + h - 1), radius, fill=border_color + (255,))
    out.alpha_composite(rounded(img, max(1, radius - border)), (ox + border, oy + border))
    return out


def fit_h(img, h):
    return img.resize((int(img.width * h / img.height), h), Image.LANCZOS)


def glow_sprite(color, size=900, power=2.2):
    y, x = np.ogrid[-1:1:size * 1j, -1:1:size * 1j]
    r = np.sqrt(x * x + y * y)
    arr = np.zeros((size, size, 4), np.uint8)
    arr[..., :3] = color
    arr[..., 3] = (np.clip(1 - r, 0, 1) ** power * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def wheel_sprite(size, dim=1.0, pegs=True):
    ss = 2
    S = size * ss
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c, r = S / 2, S / 2 - 2
    d.ellipse((c - r, c - r, c + r, c + r), fill=BLACK + (255,))
    r1 = r * 0.965
    d.ellipse((c - r1, c - r1, c + r1, c + r1), fill=(255, 214, 10, 255))
    r2 = r * 0.86
    d.ellipse((c - r2, c - r2, c + r2, c + r2), fill=BLACK + (255,))
    r3 = r * 0.845
    for i, col in enumerate(WHEEL_SEGS):
        a0 = -112.5 + 45 * i
        d.pieslice((c - r3, c - r3, c + r3, c + r3), a0, a0 + 45, fill=col + (255,))
    for i in range(8):
        a = math.radians(-112.5 + 45 * i)
        d.line((c, c, c + r3 * math.cos(a), c + r3 * math.sin(a)), fill=BLACK + (255,), width=int(S * 0.008))
    if pegs:
        rp = r * 0.912
        for i in range(16):
            a = math.radians(-112.5 + 22.5 * i)
            px, py, pr = c + rp * math.cos(a), c + rp * math.sin(a), S * 0.012
            d.ellipse((px - pr, py - pr, px + pr, py + pr), fill=WHITE + (255,))
    rh = r * 0.2
    d.ellipse((c - rh, c - rh, c + rh, c + rh), fill=BLACK + (255,))
    rh2 = r * 0.165
    d.ellipse((c - rh2, c - rh2, c + rh2, c + rh2), fill=(255, 214, 10, 255))
    im = im.resize((size, size), Image.LANCZOS)
    if dim < 1.0:
        arr = np.asarray(im).astype(np.float32)
        arr[..., :3] *= dim
        im = Image.fromarray(arr.astype(np.uint8), "RGBA")
    return im


def logo_sprite(size):
    """Pictogramme Restau Wheel (reprend l'apple-touch-icon en vectoriel net)."""
    ss = 3
    S = size * ss
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c, r = S / 2, S / 2 - 3
    d.ellipse((c - r, c - r, c + r, c + r), fill=BLACK + (255,))
    r2 = r * 0.84
    cols = [(0, 194, 255), (255, 45, 106), (255, 214, 10), (0, 194, 255), (255, 45, 106), (255, 214, 10)]
    for i, col in enumerate(cols):
        a0 = -150 + 60 * i
        d.pieslice((c - r2, c - r2, c + r2, c + r2), a0, a0 + 60, fill=col + (255,))
    rh = r * 0.3
    d.ellipse((c - rh, c - rh, c + rh, c + rh), fill=BLACK + (255,))
    rh2 = r * 0.14
    d.ellipse((c - rh2, c - rh2, c + rh2, c + rh2), fill=(255, 214, 10, 255))
    return im.resize((size, size), Image.LANCZOS)


def rays_sprite(size=1700, n=22, color=YELLOW, alpha=34):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = size / 2
    for i in range(n):
        a0 = 360 / n * i
        d.pieslice((0, 0, size, size), a0, a0 + 360 / n / 2, fill=color + (alpha,))
    m = glow_sprite(WHITE, size, 0.9).getchannel("A")
    im.putalpha(Image.fromarray((np.asarray(im.getchannel("A"), np.float32) *
                                 np.asarray(m, np.float32) / 255).astype(np.uint8)))
    return im


def grid_sprite(w=None, h=None, step=48, alpha=34):
    w = W + 96 if w is None else w
    h = H + 96 if h is None else h
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y in range(0, h, step):
        for x in range(0, w, step):
            d.ellipse((x - 1.6, y - 1.6, x + 1.6, y + 1.6), fill=(255, 255, 255, alpha))
    return im


def streak_sprite(color, w=1300, h=70):
    y, x = np.ogrid[-1:1:h * 1j, -1:1:w * 1j]
    a = np.exp(-(y ** 2) * 18) * np.clip(1 - np.abs(x) ** 2, 0, 1)
    arr = np.zeros((h, w, 4), np.uint8)
    core = np.exp(-(y ** 2) * 160)[..., None]
    arr[..., :3] = (np.array(color)[None, None, :] * (1 - core) + 255 * core).astype(np.uint8)
    arr[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def marquee_strip():
    items = ["LOTS", "PROBABILITÉS", "QR UNIQUE", "20€ / MOIS", "RESTAU WHEEL"]
    parts = []
    for i, s in enumerate(items * 3):
        parts.append(text_img(s, "anton", 64, BLACK))
        parts.append(text_img("•", "montserrat", 70, PINK if i % 2 else BLACK))
    w = sum(p.width + 36 for p in parts)
    im = Image.new("RGBA", (w, 104), YELLOW + (255,))
    x = 0
    for p in parts:
        im.alpha_composite(p, (x, (104 - p.height) // 2))
        x += p.width + 36
    return im


def browser_frame(w=1000, h=620, bar=58):
    im = Image.new("RGBA", (w + 24, h + 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((24, 24, w + 23, h + 23), 22, fill=CYAN + (255,))
    d.rounded_rectangle((0, 0, w - 1, h - 1), 22, fill=(22, 22, 22, 255), outline=(60, 60, 60, 255), width=2)
    for i, col in enumerate((PINK, YELLOW, CYAN)):
        d.ellipse((26 + i * 30, bar / 2 - 8, 42 + i * 30, bar / 2 + 8), fill=col + (255,))
    d.rounded_rectangle((140, 12, w - 40, bar - 12), 12, fill=(38, 38, 38, 255))
    d.text((164, bar / 2), "restauwheel.com", font=F("mono", 22), fill=(200, 200, 200, 255), anchor="lm")
    return im


def odds_card_base(w=500, h=250):
    im = Image.new("RGBA", (w + 14, h + 14), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((14, 14, w + 13, h + 13), 18, fill=PINK + (255,))
    d.rounded_rectangle((0, 0, w - 1, h - 1), 18, fill=(16, 16, 16, 255), outline=(70, 70, 70, 255), width=2)
    d.text((26, 30), "PROBABILITÉS", font=F("mono", 24), fill=YELLOW + (255,), anchor="lm")
    return im


def init_assets():
    ensure_fonts()
    landing = load("landing-chrome2.png", "RGB")                      # 1440x900
    A["landing_top"] = landing.crop((0, 0, 1440, 620))
    ticket = cut_dark_border(landing.crop((890, 176, 1326, 706)))
    A["ticket"] = fit_h(ticket, 780)
    A["ticket_s"] = fit_h(ticket, 700)

    client = np.asarray(load("client.png", "RGB")).astype(np.float32)
    client = np.clip((client - 8.4) / 0.1553, 0, 255).astype(np.uint8)  # annule l'overlay sombre
    form = Image.fromarray(client).crop((429, 269, 850, 844))
    A["form_scale"] = 1.45
    A["form"] = form.resize((int(form.width * 1.45), int(form.height * 1.45)), Image.LANCZOS).convert("RGBA")

    phone = load("design-phone-tourner.jpg", "RGB").crop((110, 330, 650, 950))
    A["phone_scale"] = 780 / phone.height
    A["phone"] = card(fit_h(phone, 780), 34, (22, 22), PINK, 8, WHITE)
    money = load("design-phone-money.jpg", "RGB").crop((150, 360, 570, 900))
    A["money"] = card(fit_h(money, 620), 30, (-22, 22), CYAN, 8, WHITE)
    qr = load("carte-qr.png", "RGBA").resize((520, 520), Image.LANCZOS)
    A["qr"] = card(qr.convert("RGB"), 18, (22, 22), PINK, 14, CREAM)
    A["qr_small"] = card(load("carte-qr.png", "RGB").resize((170, 170), Image.LANCZOS), 10, (10, 10), YELLOW, 8, CREAM)
    A["icon_real"] = load("apple-touch-icon.png").resize((78, 78), Image.LANCZOS)

    A["wheel"] = wheel_sprite(880)
    A["wheel_dim"] = wheel_sprite(1000, 0.38)
    A["wheel_bg"] = wheel_sprite(1300, 0.22, pegs=False)
    A["wheel_small"] = wheel_sprite(420, 0.6)
    A["logo"] = logo_sprite(250)
    A["glow"] = {k: glow_sprite(c) for k, c in
                 (("pink", PINK), ("cyan", CYAN), ("yellow", YELLOW), ("white", WHITE))}
    A["grid"] = grid_sprite(W + 96, H + 96)
    A["rays"] = rays_sprite()
    A["streak_p"] = streak_sprite(PINK)
    A["streak_c"] = streak_sprite(CYAN, 900, 60)
    A["marquee"] = marquee_strip()
    A["browser"] = browser_frame()
    A["odds"] = odds_card_base()

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / math.sqrt(2)
    A["vignette"] = (1 - 0.42 * r ** 2.2)[..., None].astype(np.float32)
    rng = np.random.default_rng(7)
    A["grain"] = [rng.normal(0, 2.0, (H, W, 1)).astype(np.float32) for _ in range(4)]

    rng = np.random.default_rng(3)
    pal = [PINK, YELLOW, CYAN, WHITE]
    A["ambient"] = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(0.25, 1.0), pal[i % 4],
                     rng.uniform(0, 6.28)) for i in range(80)]
    A["ticks"] = spin_ticks()


# ---------------------------------------------------------------------------
# Roue : angle de spin + ticks (partagés image/son)
# ---------------------------------------------------------------------------


def spin_angle(t):
    if t <= SPIN_T0:
        return 0.0
    p = clamp01((t - SPIN_T0) / (SPIN_T1 - SPIN_T0))
    return SPIN_TOTAL * (1 - (1 - p) ** 3.2)


def spin_ticks(min_gap=0.05):
    ticks, last_seg, last_t = [], 0, -1.0
    t = SPIN_T0
    while t <= SPIN_T1:
        seg = math.floor((spin_angle(t) - 22.5) / 45)
        if seg != last_seg:
            if t - last_t >= min_gap:
                ticks.append(round(t, 4))
                last_t = t
            last_seg = seg
        t += 0.001
    return ticks


# ---------------------------------------------------------------------------
# Décor commun : glows, grille, particules, bursts
# ---------------------------------------------------------------------------


def draw_bg(cv, t, glows, grid=(-26.0, -10.0), grid_alpha=True):
    for key, x, y, s, a in glows:
        place(cv, A["glow"][key], x, y, s, 0, a, Image.BILINEAR)
    if grid_alpha:
        ox, oy = int((grid[0] * t) % 48), int((grid[1] * t) % 48)
        cv.alpha_composite(A["grid"].crop((ox, oy, ox + W, oy + H)))


def draw_particles(cv, t, speed=1.0, par_x=0.0):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for (x0, y0, z, col, ph) in A["ambient"]:
        x = (x0 + 18 * math.sin(t * 0.8 + ph) + par_x * z) % W
        y = (y0 - (22 + 60 * z) * speed * t) % H
        r = 1.2 + 3.8 * z
        a = int(255 * (0.18 + 0.5 * z) * (0.6 + 0.4 * math.sin(t * 3 + ph * 3)))
        d.ellipse((x - r, y - r, x + r, y + r), fill=col + (a,))
    cv.alpha_composite(lay)


def draw_bursts(cv, t):
    active = [b for b in BURSTS if 0 <= t - b[0] < 1.6]
    if not active:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for (t0, bx, by, n, cols, power, kind) in active:
        dt = t - t0
        rng = np.random.default_rng(int(t0 * 1000))
        life = 1.5 if kind == "confetti" else 1.0
        if dt > life:
            continue
        fade = (1 - dt / life) ** 1.4
        for j in range(n):
            ang = rng.uniform(0, 2 * math.pi)
            v = rng.uniform(350, 1500) * power
            drag = rng.uniform(2.5, 4.5)
            grav = 900 if kind == "confetti" else 220
            dist = v * (1 - math.exp(-drag * dt)) / drag
            x = bx + math.cos(ang) * dist
            y = by + math.sin(ang) * dist + 0.5 * grav * dt * dt * 0.35
            col = cols[j % len(cols)]
            a = int(255 * fade)
            if kind == "confetti":
                sz = rng.uniform(8, 16)
                spin = rng.uniform(-14, 14) * dt + ang
                cs, sn = math.cos(spin), math.sin(spin)
                hw, hh = sz, sz * 0.45 * abs(math.cos(dt * 9 + j))
                pts = [(x + cs * px - sn * py, y + sn * px + cs * py)
                       for px, py in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))]
                d.polygon(pts, fill=col + (a,))
            else:
                r = rng.uniform(3, 9) * (1 - 0.6 * dt / life)
                d.ellipse((x - r, y - r, x + r, y + r), fill=col + (a,))
    cv.alpha_composite(lay)


def draw_hollow_number(cv, s, color, x, y, t, t0, alpha=0.2):
    img = text_img(s, "anton", 860, color, hollow=4)
    p = E(t, t0, 0.5)
    place(cv, img, x - 40 * (t - t0), y + 60 * (1 - p), lerp(1.25, 1.0, p) + 0.02 * (t - t0), 0, alpha * p,
          Image.BILINEAR)


def draw_step(cv, t, t0, n, label, color):
    p = E(t, t0, 0.35, EBACK)
    img = text_img(f"{n:02d} — {label}", "mono", 30, color)
    place(cv, img, lerp(-200, 130 + img.width / 2, p), 150, 1, 0, clamp01((t - t0) / 0.1))
    d = ImageDraw.Draw(cv)
    for i in range(3):
        x0 = 130 + i * 74
        xa, ya = P(x0, 184)
        xb, yb = P(x0 + 64, 190)
        d.rectangle((xa, ya, xb, yb), fill=(60, 60, 60, 255))
        fill = 1.0 if i < n - 1 else (E(t, t0 + 0.15, 0.5) if i == n - 1 else 0)
        if fill > 0:
            xf, _ = P(x0 + int(64 * fill), 190)
            d.rectangle((xa, ya, xf, yb), fill=color + (255,))


def draw_wheel(cv, img, x, y, scale, angle, alpha, omega=0.0, ghosts=4):
    """Roue avec flou de rotation (copies fantômes) proportionnel à la vitesse (deg/s)."""
    if omega > 200 and ghosts:
        spread = min(40.0, omega / FPS * 0.7)
        for k in range(ghosts, 0, -1):
            place(cv, img, x, y, scale, -(angle - spread * k / ghosts), alpha * 0.28, Image.BILINEAR)
    place(cv, img, x, y, scale, -angle, alpha, Image.BILINEAR)


# ---------------------------------------------------------------------------
# Scènes. Chaque scène dessine dans cv et renvoie la caméra (zoom, rot, fx, fy).
# ---------------------------------------------------------------------------


def scene_hook(cv, t):
    draw_bg(cv, t, [("pink", 360 + 90 * math.sin(t * 0.9), 260 + 50 * math.cos(t * 0.7), 1.7, 0.55),
                    ("cyan", 1600 - 100 * math.sin(t * 0.6), 880, 1.8, 0.42),
                    ("yellow", 960 + 200 * math.sin(t * 0.5), 540, 1.3, 0.16)])
    # Balayage lumineux d'intro
    if t < 0.55:
        p = E(t, 0.0, 0.45, EIO)
        st = lambda tt: (lerp(-700, 2600, E(tt, 0.0, 0.45, EIO)), 540 - 120 * math.sin(tt * 3), 1.0, 8, 1.0)
        draw_state(cv, A["streak_p"], st, t, trail=5, trail_dt=0.01, gain=0.5)
        place(cv, A["streak_c"], lerp(2400, -600, p), 620, 1.0, -6, 0.8)

    # Roue de fond : pop, spin décéléré puis glisse derrière le ticket
    pin = E(t, 0.12, 0.6, EBACK)
    pp = clamp01((t - 0.12) / 2.4)
    ang = 900 * (1 - (1 - pp) ** 3) + 22 * t
    omega = 900 * 3 * (1 - pp) ** 2 / 2.4 + 22
    q = E(t, 1.8, 0.7, EIO)
    draw_wheel(cv, A["wheel_dim"], lerp(960, 1470, q), lerp(540, 560, q) + 12 * math.sin(t * 1.3),
               pin * lerp(1.0, 0.98, q), ang, 1.0, omega if t > 0.12 else 0)

    # Logo kinetic "RESTAU / WHEEL"
    tag = text_img("N° 000 · LOYALTY", "mono", 30, YELLOW)
    if 1.0 < t < 2.0:
        n = int(clamp01((t - 1.05) / 0.3) * 16)
        if n:
            img = text_img("N° 000 · LOYALTY"[:n], "mono", 30, YELLOW)
            a = 1 - E(t, 1.72, 0.15)
            place(cv, img, 960 - tag.width / 2 + img.width / 2, 250 - 80 * E(t, 1.72, 0.2, EI), 1, 0, a)
            d = ImageDraw.Draw(cv)
            if a > 0.5:
                x0, y0 = P(960 - tag.width / 2 - 18, 222)
                x1, y1 = P(960 + tag.width / 2 + 18, 278)
                d.rectangle((x0, y0, x1, y1), outline=YELLOW + (255,), width=3)
    r_img = text_img("RESTAU", "anton", 300, WHITE)
    w_img = text_img("WHEEL", "anton", 300, YELLOW)
    draw_state(cv, r_img, slam(0.5, 960, 450, s0=1.75, dy=0, rot0=-4, dur=0.28, drift=(0, -8),
                               exit_t=1.78, exit_dur=0.2, exit_vec=(0, -60), exit_scale=3.4), t, trail=5)
    draw_state(cv, w_img, slam(1.06, 960, 730, s0=1.1, dx=1100, dy=0, rot0=10, dur=0.3, sf=2.2, sz=6.5,
                               drift=(0, 6), exit_t=1.8, exit_dur=0.2, exit_vec=(0, 80), exit_scale=3.4),
               t, trail=5)

    # Ticket réel de la landing, entrée spring + flottement (parallaxe vs roue)
    if t > 1.95:
        def tst(tt):
            dt = tt - 2.0
            if dt < 0:
                return None
            sp = spring(dt, 1.9, 5.5)
            return (lerp(1780, 1450, sp) + 10 * math.sin(tt * 1.1), lerp(1500, 560, sp) + 16 * math.sin(tt * 2.1),
                    lerp(0.6, 0.93, EO(clamp01(dt / 0.5))) * punch(tt, [3.78], 0.07, 9),
                    lerp(28, -5, sp) + 1.8 * math.sin(tt * 1.4), 1.0)
        draw_state(cv, A["ticket_s"], tst, t, trail=4, trail_dt=0.014)

    # Lignes kinetic synchronisées VO
    L = 130
    lines = [("UNE ROUE", WHITE, 150, 285, 2.14), ("DE FORTUNE", PINK, 150, 430, 2.82),
             ("SUR CHAQUE", WHITE, 150, 575, 3.36)]
    for s, col, size, y, t0 in lines:
        img = text_img(s, "anton", size, col)
        draw_state(cv, img, slam(t0, left(L, img), y, s0=1.22, dx=-90, dy=40, rot0=-3, drift=(0, -9)), t)
    tb = text_img("TABLE.", "anton", 230, YELLOW)
    draw_state(cv, tb, slam(3.78, left(L, tb), 770, s0=1.5, dy=90, rot0=-7, dur=0.3, drift=(0, -10)), t, trail=5)
    if t > 3.95:
        p = E(t, 3.95, 0.3, EBACK)
        y0 = 770 + tb.height / 2 + 14 - 10 * (t - 3.78)
        xa, ya = P(L, y0)
        xb, yb = P(L + tb.width * p, y0 + 16)
        ImageDraw.Draw(cv).rectangle((xa, ya, xb, yb), fill=CYAN + (255,))

    draw_particles(cv, t)
    draw_bursts(cv, t)
    z = 1.0 + 0.05 * E(t, 0.3, 1.5) if t < 1.9 else 1.02 + 0.06 * E(t, 1.9, 3.0, EIO)
    return z, -0.8 * E(t, 2.0, 3.0), 960, 540


def scene_qr(cv, t):
    lt = t - 5.0
    draw_bg(cv, t, [("cyan", 300 + 60 * math.sin(t), 300, 1.8, 0.4),
                    ("pink", 1500, 900 + 40 * math.cos(t * 1.3), 1.7, 0.4)], grid=(-60, 0))
    draw_hollow_number(cv, "01", CYAN, 1500, 560, t, 5.0, 0.16)
    draw_step(cv, t, 5.08, 1, "SCAN", CYAN)

    def qst(tt):
        dt = tt - 5.0
        if dt < -0.2:
            return None
        sp = spring(max(0, dt), 2.2, 6.0)
        s = punch(tt, [6.68], 0.08, 9) * (1 + 0.015 * dt)
        return (lerp(2400, 1330, EO(clamp01(dt / 0.42))) + 8 * math.sin(tt * 1.7),
                560 + 12 * math.sin(tt * 2.3), s, lerp(16, -3, sp) + 1.2 * math.sin(tt * 1.9), 1.0)
    draw_state(cv, A["qr"], qst, t, trail=5, trail_dt=0.012)
    qx, qy, qs, _, _ = qst(t)
    qy -= 6
    # Laser de scan
    if 5.45 < t < 6.72:
        ph = (t - 5.45) / 1.27
        ly = qy - 260 + 520 * (0.5 - 0.5 * math.cos(ph * 2 * math.pi * 1.0))
        place(cv, A["streak_c"], qx, ly, 0.75, 0, 1.0)
        lay = Image.new("RGBA", (620, 90), (0, 0, 0, 0))
        dd = ImageDraw.Draw(lay)
        for i in range(90):
            dd.line((0, i, 620, i), fill=CYAN + (int(70 * (i / 90) ** 2),))
        place(cv, lay if math.sin(ph * 2 * math.pi) > 0 else lay.transpose(Image.FLIP_TOP_BOTTOM),
              qx, ly - 45 if math.sin(ph * 2 * math.pi) > 0 else ly + 45, 1, 0, 0.9)
    # Coins de visée
    if t > 5.35:
        p = E(t, 5.35, 0.3, EBACK)
        half = (330 + 20 * math.sin(t * 7)) * lerp(1.5, 1.0, p)
        col = YELLOW if t > 6.68 else CYAN
        d = ImageDraw.Draw(cv)
        L, th = 70, 10
        for sx in (-1, 1):
            for sy in (-1, 1):
                cx, cy = qx + sx * half, qy + sy * half
                d.rectangle((min(cx, cx - sx * L), cy - th / 2 if sy < 0 else cy - th / 2,
                             max(cx, cx - sx * L), cy + th / 2), fill=col + (255,))
                d.rectangle((cx - th / 2, min(cy, cy - sy * L), cx + th / 2, max(cy, cy - sy * L)), fill=col + (255,))
    if 6.68 <= t < 6.9:
        flash = Image.new("RGBA", (560, 560), WHITE + (int(200 * (1 - (t - 6.68) / 0.22)),))
        place(cv, flash, qx, qy, qs, 0, 1)

    L = 130
    a = text_img("VOS CLIENTS", "bebas", 96, YELLOW, tracking=0.06)
    draw_state(cv, a, slam(5.47, left(L, a), 330, s0=1.2, dx=-120, dy=0, drift=(6, 0)), t)
    b = text_img("SCANNENT", "anton", 200, WHITE)
    draw_state(cv, b, slam(5.99, left(L, b), 480, s0=1.3, dy=70, rot0=-3, drift=(0, -8)), t, trail=5)
    c = text_img("LE QR", "anton", 300, PINK)
    draw_state(cv, c, slam(6.65, left(L, c), 735, s0=1.55, dy=0, rot0=-6, dur=0.25, drift=(4, -6)), t, trail=5)

    draw_particles(cv, t, 1.3, -40 * lt)
    draw_bursts(cv, t)
    return 1.0 + 0.09 * E(t, 5.0, 2.4, EIO), 0.6 * math.sin(lt * 1.5), 1330, 560


def scene_ticket(cv, t):
    lt = t - 7.4
    draw_bg(cv, t, [("yellow", 1300, 200 + 50 * math.sin(t), 1.7, 0.35),
                    ("pink", 300, 900, 1.6, 0.45)], grid=(0, -80))
    draw_hollow_number(cv, "02", YELLOW, 420, 560, t, 7.4, 0.14)
    draw_step(cv, t, 7.45, 2, "TICKET", YELLOW)

    # Formulaire réel : highlights dessinés dans le repère du formulaire
    form = A["form"].copy()
    ov = Image.new("RGBA", form.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    k = A["form_scale"]
    fields = [((22, 91, 400, 137), 7.72), ((22, 173, 400, 220), 7.98),
              ((22, 257, 400, 303), 8.24), ((22, 341, 400, 387), 8.50)]
    for (x0, y0, x1, y1), tf in fields:
        if t < tf:
            continue
        p = E(t, tf, 0.25, EBACK)
        g = lerp(10, 0, p)
        on = 1 - E(t, tf + 0.3, 0.3)
        box = (x0 * k - g, y0 * k - g, x1 * k + g, y1 * k + g)
        if on > 0.02:
            d.rounded_rectangle(box, 6, outline=PINK + (int(255 * on),), width=6)
            d.rectangle((x0 * k, y0 * k, (x0 + (x1 - x0) * E(t, tf, 0.22)) * k, y1 * k),
                        fill=PINK + (int(40 * on),))
        cr = 20 * EBACK(clamp01((t - tf - 0.05) / 0.25))
        cx, cy = x1 * k - 30, (y0 + y1) / 2 * k
        if cr > 1:
            d.ellipse((cx - cr, cy - cr, cx + cr, cy + cr), fill=CYAN + (255,))
            d.line((cx - cr * 0.45, cy, cx - cr * 0.1, cy + cr * 0.4, cx + cr * 0.5, cy - cr * 0.35),
                   fill=BLACK + (255,), width=5)
    if t > 8.75:
        x0, y0, x1, y1 = (23 * k, 405 * k, 40 * k, 422 * k)
        s = EBACK(clamp01((t - 8.75) / 0.2))
        d.rectangle((x0, y0, x1, y1), fill=PINK + (255,))
        d.line((x0 + 4, (y0 + y1) / 2, x0 + 10 * s, y1 - 5, x0 + 24 * s, y0 + 3), fill=WHITE + (255,), width=4)
    if t > 8.92:
        a = int(160 * (1 - E(t, 8.92, 0.25)))
        d.rectangle((22 * k, 491 * k, 400 * k, 538 * k), fill=WHITE + (a,))
    form.alpha_composite(ov)
    fc = card(form, 10, (22, 22), PINK)

    def fst(tt):
        dt = tt - 7.4
        sp = spring(max(0, dt), 2.0, 6.5)
        zoom = 1.0 + 0.16 * E(tt, 7.6, 1.5, EIO)
        return (1450 + 6 * math.sin(tt * 2), lerp(1700, 560, sp) - 170 * E(tt, 7.6, 1.5, EIO) * zoom,
                zoom * punch(tt, [f[1] for f in fields], 0.015, 12), lerp(8, -1.5, sp), 1.0)
    draw_state(cv, fc, fst, t, trail=4, trail_dt=0.014)

    L = 130
    draw_letters(cv, "REMPLISSENT", "anton", 150, WHITE, L + letter_imgs("REMPLISSENT", "anton", 150, WHITE)[2] / 2,
                 450, t, 7.69, stagger=0.025, mode="drop")
    b = text_img("LEUR TICKET", "anton", 175, YELLOW)
    draw_state(cv, b, slam(8.13, left(L, b), 650, s0=1.35, dy=80, rot0=-4, drift=(0, -8)), t, trail=5)

    draw_particles(cv, t, 1.5)
    draw_bursts(cv, t)
    return 1.02 + 0.04 * E(t, 7.4, 1.8), -0.6 + 0.8 * math.sin(lt * 2), 1450, 560


def scene_spin(cv, t):
    lt = t - 9.2
    omega = 0.0
    if t > SPIN_T0:
        omega = (spin_angle(t) - spin_angle(t - 0.01)) / 0.01
    draw_bg(cv, t, [("pink", 1330, 560, 2.0 + 0.2 * math.sin(t * 5), 0.45 + min(0.3, omega / 6000)),
                    ("cyan", 200, 150, 1.4, 0.35), ("yellow", 400, 1000, 1.3, 0.25)], grid=(-40, -40))
    draw_step(cv, t, 9.25, 3, "SPIN", PINK)

    # Traits de vitesse radiaux
    if omega > 150:
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        a = min(1.0, omega / 1500)
        for i in range(36):
            ang = math.radians(i * 10 + t * 90)
            r0 = 480 + 30 * math.sin(i * 1.7 + t * 12)
            r1 = r0 + 80 + 180 * a
            col = (PINK, YELLOW, CYAN)[i % 3]
            d.line((1330 + r0 * math.cos(ang), 560 + r0 * math.sin(ang), 1330 + r1 * math.cos(ang),
                    560 + r1 * math.sin(ang)), fill=col + (int(200 * a),), width=6)
        cv.alpha_composite(lay)

    # Roue
    if t > SPIN_T0 - 0.02:
        s = E(t, SPIN_T0, 0.45, EBACK) * punch(t, [SPIN_T1], 0.05, 8)
        draw_wheel(cv, A["wheel"], 1330, 560, s, spin_angle(t), 1.0, omega, 5)
        ticks = A["ticks"]
        i = bisect.bisect_right(ticks, t) - 1
        defl = 22 * decay(t, ticks[i], 22) if i >= 0 else 0
        if t > SPIN_T1:
            defl += 14 * math.exp(-(t - SPIN_T1) * 6) * math.sin((t - SPIN_T1) * 30)
        ptr = Image.new("RGBA", (90, 110), (0, 0, 0, 0))
        dp = ImageDraw.Draw(ptr)
        dp.polygon([(6, 6), (84, 6), (45, 104)], fill=BLACK + (255,))
        dp.polygon([(16, 12), (74, 12), (45, 88)], fill=PINK + (255,))
        place(cv, ptr, 1330, 560 - 440 * s - 10, s, defl, 1)
        if t > SPIN_T1:
            fl = Image.new("RGBA", (880, 880), (0, 0, 0, 0))
            ImageDraw.Draw(fl).pieslice((0, 0, 879, 879), -112.5, -67.5,
                                        fill=WHITE + (int(170 * abs(math.sin((t - SPIN_T1) * 14)) *
                                                          math.exp(-(t - SPIN_T1) * 3)),))
            place(cv, fl, 1330, 560, s, 0, 0.9)
            chip = chip_img("GAGNÉ !", YELLOW, 96)
            draw_state(cv, chip, slam(SPIN_T1 + 0.02, 1690, 190, s0=0.2, dy=-60, rot0=30, dur=0.3,
                                      drift=(0, -10)), t)

    # Téléphone réel (bouton TOURNER) : entrée zoom, tap, sortie whip
    def pst(tt):
        dt = tt - 9.2
        if dt < 0:
            return None
        s = lerp(1.45, 1.0, EO(clamp01(dt / 0.3))) * (1 - 0.05 * decay(tt, 9.45, 14) * (tt > 9.45))
        x, y, r, a = 1330, 560, 0.0, 1.0
        if tt > 9.6:
            # le téléphone est "aspiré" pendant que la roue jaillit au même endroit
            q = EI(clamp01((tt - 9.6) / 0.2))
            y, r, s, a = lerp(560, 760, q), lerp(0, 35, q), s * lerp(1, 0.25, q), 1 - q
            if q >= 1:
                return None
        return (x, y, s, r, a)
    draw_state(cv, A["phone"], pst, t, trail=5, trail_dt=0.014)
    ps = pst(t)
    if ps and 9.45 < t < 9.9:
        # coordonnées du bouton TOURNER dans le visuel recadré
        bx = ps[0] + ((322 - 110) * A["phone_scale"] + 8 - A["phone"].width / 2) * ps[2]
        by = ps[1] + ((774 - 330) * A["phone_scale"] + 8 - A["phone"].height / 2) * ps[2]
        bx, by, _ = d2c(bx, by)
        rs = W / DW if VERTICAL else 1.0
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        for k in range(3):
            dt = t - 9.45 - k * 0.07
            if dt > 0:
                r = (30 + 420 * EO(clamp01(dt / 0.45))) * rs
                d.ellipse((bx - r, by - r, bx + r, by + r), outline=WHITE + (int(255 * (1 - clamp01(dt / 0.45))),),
                          width=max(2, int(8 * rs)))
        cv.alpha_composite(lay)

    L = 130
    a = text_img("TOURNENT", "anton", 170, WHITE)
    draw_state(cv, a, slam(9.37, left(L, a), 430, s0=1.3, dx=-160, dy=0, rot0=-4, drift=(0, -8)), t, trail=5)
    b = text_img("LA ROUE", "anton", 250, PINK)
    draw_state(cv, b, slam(9.81, left(L, b), 640, s0=1.45, dy=70, rot0=-6, drift=(0, -8)), t, trail=5)

    draw_particles(cv, t, 2.0)
    draw_bursts(cv, t)
    z = 1.0 + 0.06 * E(t, 9.6, 2.0) + 0.04 * decay(t, SPIN_T1, 5) * (t > SPIN_T1)
    return z, -0.8 * math.sin(lt * 1.2), 1330, 560


def scene_win(cv, t):
    draw_bg(cv, t, [("pink", 400 + 120 * math.sin(t * 0.8), 300, 1.9, 0.45),
                    ("yellow", 1500, 850 + 60 * math.sin(t * 1.1), 1.7, 0.35),
                    ("cyan", 960, 540, 1.2, 0.12)], grid=(-30, 20))
    place(cv, A["wheel_small"], 120, 1010, 1.0, -t * 70, 0.7, Image.BILINEAR)

    prizes = [("UN LOT", WHITE, 12.95), ("UN DESSERT", PINK, 13.95), ("UNE BOISSON", CYAN, 15.05),
              ("UNE RÉDUCTION", YELLOW, 16.01)]
    # Bandes de couleur diagonales qui balaient l'écran à chaque lot
    for s, col, tp in prizes[1:]:
        if 0 <= t - tp < 0.45:
            p = E(t, tp, 0.45, EIO)
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            x = lerp(-900, 2800, p)
            sx = W / DW if VERTICAL else 1.0
            x *= sx
            ImageDraw.Draw(lay).polygon(
                [(x, 0), (x + 420 * sx, 0), (x + 120 * sx, H), (x - 300 * sx, H)],
                fill=col + (150,),
            )
            cv.alpha_composite(lay)

    def tst(tt):
        dt = tt - 12.05
        if dt < 0:
            return None
        sp = spring(dt, 1.8, 5.0)
        x = 1480 + 10 * math.sin(tt * 1.2)
        s = 1.0 * punch(tt, [p[2] for p in prizes], 0.06, 9)
        a = 1.0
        if tt > 16.95:
            q = EI(clamp01((tt - 16.95) / 0.3))
            x += 1000 * q
            a = 1 - q
            if a <= 0:
                return None
        return (x, lerp(-600, 560, sp) + 14 * math.sin(tt * 2), s, lerp(-28, -6, sp) + 2 * math.sin(tt * 1.5), a)
    draw_state(cv, A["ticket"], tst, t, trail=4, trail_dt=0.014)

    L = 130
    a = text_img("ILS GAGNENT", "anton", 150, WHITE)
    draw_state(cv, a, slam(12.55, left(L, a), 360, s0=1.3, dy=60, rot0=-3, drift=(0, -5),
                           exit_t=16.95, exit_vec=(-1200, 0), exit_dur=0.25), t, trail=5)
    for i, (s, col, tp) in enumerate(prizes):
        img = text_img(s, "anton", 165, col)
        nxt = prizes[i + 1][2] if i + 1 < len(prizes) else 16.95
        vec = (0, -300) if i + 1 < len(prizes) else (-1300, 0)
        draw_state(cv, img, slam(tp, left(L, img), 560, s0=1.3, dy=170, rot0=-4 if i % 2 else 4, dur=0.28,
                                 drift=(0, -6), exit_t=nxt - 0.02, exit_dur=0.16, exit_vec=vec), t, trail=5)
        if tp <= t < nxt + 0.1:
            lab = text_img(f"LOT #{i + 1:02d}", "mono", 34, col)
            p = E(t, tp, 0.3, EBACK)
            place(cv, lab, L + lab.width / 2 + 40 * (1 - p), 700, 1, 0, p * (1 - E(t, nxt - 0.05, 0.1)))

    # "ET REVIENNENT." + boucle
    if t > 17.1:
        et = text_img("ET", "bebas", 130, PINK, tracking=0.08)
        draw_state(cv, et, slam(17.15, 960, 350, s0=1.6, dy=0, dur=0.25, drift=(0, -6)), t)
        draw_letters(cv, "REVIENNENT.", "anton", 240, WHITE, 960, 560, t, 17.37, stagger=0.028, mode="pop",
                     wave_amp=6)
        pa = E(t, 17.3, 0.6)
        if pa > 0:
            S = 2
            bw, bh = 1500, 600
            lay = Image.new("RGBA", (bw * S, bh * S), (0, 0, 0, 0))
            d = ImageDraw.Draw(lay)
            start = -200 + (t - 17.3) * 60
            d.arc((10 * S, 10 * S, (bw - 10) * S, (bh - 10) * S), start, start + 320 * pa, fill=CYAN + (255,),
                  width=12 * S)
            end = math.radians(start + 320 * pa)
            ex, ey = bw / 2 * S + (bw / 2 - 10) * S * math.cos(end), bh / 2 * S + (bh / 2 - 10) * S * math.sin(end)
            tx, ty = -math.sin(end) * (bw / 2), math.cos(end) * (bh / 2)
            n = math.hypot(tx, ty) or 1
            tx, ty = tx / n, ty / n
            hs = 42 * S
            d.polygon([(ex + tx * hs, ey + ty * hs), (ex - ty * hs * 0.7, ey + tx * hs * 0.7),
                       (ex + ty * hs * 0.7, ey - tx * hs * 0.7)], fill=CYAN + (255,))
            lay = lay.resize((bw, bh), Image.BILINEAR)
            place(cv, lay, 960, 570, 1.0 + 0.03 * math.sin(t * 4), 0, 1)
        visits = [(17.9, "VISITE 1"), (18.25, "VISITE 2"), (18.6, "VISITE 3")]
        for j, (tv, lab) in enumerate(visits):
            nx = visits[j + 1][0] if j + 1 < len(visits) else 99
            if tv <= t < nx:
                chip = chip_img(lab, YELLOW if j == 2 else WHITE, 58)
                p = E(t, tv, 0.22, EBACK)
                place(cv, chip, 960, 860 + 60 * (1 - p), lerp(0.5, 1.0, p), 6 * (1 - p), 1)

    draw_particles(cv, t, 1.2)
    draw_bursts(cv, t)
    z = 1.0 + 0.05 * E(t, 12.0, 7.0) + 0.035 * sum(decay(t, p[2], 7) for p in prizes if t >= p[2])
    z += 0.05 * decay(t, 12.0, 5)
    return z, 0.5 * math.sin((t - 12) * 0.9), 960, 540


def scene_control(cv, t):
    draw_bg(cv, t, [("cyan", 1400, 300 + 50 * math.sin(t), 1.9, 0.38),
                    ("pink", 300, 950, 1.6, 0.35)], grid=(-50, -12))

    # Navigateur : zoom caméra à l'intérieur de la vraie landing
    fr = A["browser"].copy()
    z = 1.0 + 1.05 * E(t, 19.3, 3.5, EIO)
    fx = lerp(560, 1108, E(t, 19.3, 3.5, EIO))
    fy = lerp(310, 440, E(t, 19.3, 3.5, EIO))
    hs = 620 / z
    ws = hs * 1000 / 562
    x0 = min(max(0, fx - ws / 2), 1440 - ws)
    y0 = min(max(0, fy - hs / 2), 620 - hs)
    content = A["landing_top"].resize((1000 - 4, 562 - 2), Image.BILINEAR, box=(x0, y0, x0 + ws, y0 + hs))
    fr.paste(content, (2, 58))

    def bst(tt):
        dt = tt - 19.0
        sp = spring(max(0, dt), 2.0, 6.0)
        return (lerp(2600, 1370, EO(clamp01(dt / 0.45))) + 8 * math.sin(tt * 1.3), 500 + 12 * math.sin(tt * 1.8),
                0.9 + 0.015 * dt, lerp(10, -2, sp) + 0.8 * math.sin(tt * 1.1), 1.0)
    draw_state(cv, fr, bst, t, trail=4, trail_dt=0.014)

    # Carte probabilités (graphique animé)
    if t > 21.3:
        oc = A["odds"].copy()
        d = ImageDraw.Draw(oc)
        bars = [("DESSERT", 10, PINK), ("BOISSON", 30, CYAN), ("RÉDUCTION", 60, YELLOW)]
        for i, (lab, pct, col) in enumerate(bars):
            p = EBACK(clamp01((t - 21.42 - i * 0.12) / 0.45))
            y = 78 + i * 56
            d.text((26, y), lab, font=F("mono", 22), fill=(220, 220, 220, 255), anchor="lm")
            d.rounded_rectangle((190, y - 12, 420, y + 12), 6, fill=(45, 45, 45, 255))
            wbar = int(230 * pct / 60 * max(0.0, p))
            if wbar > 2:
                d.rounded_rectangle((190, y - 12, 190 + min(260, wbar), y + 12), 6, fill=col + (255,))
            d.text((480, y), f"{int(round(pct * clamp01(p)))}%", font=F("mono", 24), fill=col + (255,), anchor="rm")
        draw_state(cv, oc, slam(21.3, 1560, 850, s0=0.4, dy=80, rot0=8, dur=0.35, drift=(0, -6)), t)

    L = 130
    a = text_img("VOUS", "bebas", 110, YELLOW, tracking=0.08)
    draw_state(cv, a, slam(19.6, left(L, a), 300, s0=1.3, dx=-100, dy=0, drift=(0, -5)), t)
    b = text_img("CONTRÔLEZ", "anton", 165, WHITE)
    draw_state(cv, b, slam(19.81, left(L, b), 430, s0=1.3, dy=70, rot0=-3, drift=(0, -6)), t, trail=5)
    chips = [("LOTS", PINK, 20.6, 580), ("PROBABILITÉS", CYAN, 21.35, 700), ("QR UNIQUE", YELLOW, 22.05, 820)]
    for s, col, tc, y in chips:
        c = chip_img(s, col, 72)
        draw_state(cv, c, slam(tc, left(L, c), y, s0=1.0, dx=-600, dy=0, rot0=-10, dur=0.3, sf=2.0, sz=6.0,
                               drift=(3, 0)), t, trail=4)
    if t > 22.05:
        c = chip_img("QR UNIQUE", YELLOW, 72)
        p = E(t, 22.05, 0.45, EBACK)
        place(cv, A["qr_small"], L + c.width + 110, 815, max(0.01, p), 180 * (1 - E(t, 22.05, 0.5)) + 3 * math.sin(t * 3), 1)

    draw_particles(cv, t)
    draw_bursts(cv, t)
    return 1.0 + 0.04 * E(t, 19.0, 4.0), 0.6 * math.sin((t - 19) * 1.2), 960, 540


def scene_price(cv, t):
    lt = t - 23.0
    draw_bg(cv, t, [("yellow", 1060, 520, 2.1 + 0.2 * math.sin(t * 4), 0.4),
                    ("pink", 250, 900, 1.6, 0.4)], grid=(30, -30))
    place(cv, A["rays"], 1060, 520, 1.15 + 0.1 * E(t, 23.5, 1), t * 24, 0.9 + 0.1 * math.sin(t * 6), Image.BILINEAR)

    def mst(tt):
        dt = tt - 23.0
        sp = spring(max(0, dt), 1.8, 5.5)
        return (lerp(-500, 380, sp) + 20 * math.sin(tt * 1.1), 560 + 20 * math.sin(tt * 1.6),
                0.85 + 0.03 * dt, lerp(-30, -9, sp) + 2 * math.sin(tt * 1.3), 1.0)
    draw_state(cv, A["money"], mst, t, trail=4, trail_dt=0.014)

    cx = 1060
    if t < 23.58:
        # compteur "slot machine" qui défile avant de verrouiller sur 20
        k = int(t * 30)
        for j, off in enumerate((-1, 0, 1)):
            n = (37 + (k + j) * 17) % 90 + 10
            img = text_img(str(n), "anton", 520, YELLOW)
            sub = (t * 30) % 1
            place(cv, img, cx, 500 + (off + sub) * 380, 1.0, 0, 0.35 if off else 0.9)
    else:
        img = text_img("20", "anton", 520, YELLOW)
        draw_state(cv, img, slam(23.58, cx, 500, s0=1.4, dy=0, dur=0.22, drift=(0, -4), grow=0.02), t, trail=5)
        eu = text_img("€", "anton", 330, PINK)
        draw_state(cv, eu, slam(23.98, cx + img.width / 2 + eu.width / 2 + 10, 430, s0=1.2, dx=600, dy=0,
                                rot0=24, dur=0.3, sf=2.2, sz=6.0, drift=(0, -4)), t, trail=5)
        draw_letters(cv, "/ MOIS", "anton", 150, WHITE, cx + 60, 830, t, 24.34, stagger=0.04, mode="rise")
        if t > 24.75:
            p = E(t, 24.75, 0.3, EBACK)
            wbar = letter_imgs("/ MOIS", "anton", 150, WHITE)[2]
            xa, ya = P(cx + 60 - wbar / 2, 915)
            xb, yb = P(cx + 60 - wbar / 2 + wbar * p, 931)
            ImageDraw.Draw(cv).rectangle((xa, ya, xb, yb), fill=YELLOW + (255,))

    # Bandeau défilant
    strip = A["marquee"]
    off = int((lt * 620) % (strip.width / 3))
    seg = strip.crop((off, 0, off + 2300, strip.height))
    place(cv, seg, 960, 1010 + 50 * (1 - E(t, 23.1, 0.4, EBACK)), 1.0, 3, 1)

    draw_particles(cv, t, 1.6)
    draw_bursts(cv, t)
    z = 1.0 + 0.05 * E(t, 23.0, 3.0) + 0.06 * decay(t, 23.58, 6) * (t > 23.58)
    return z, -0.8 * math.sin(lt * 1.4), 1060, 520


def scene_cta(cv, t):
    lt = t - 26.0
    draw_bg(cv, t, [("pink", 960 + 500 * math.cos(t * 0.9), 540 + 250 * math.sin(t * 0.9), 1.5, 0.4),
                    ("cyan", 960 - 500 * math.cos(t * 0.9), 540 - 250 * math.sin(t * 0.9), 1.5, 0.35),
                    ("yellow", 960, 300, 1.2, 0.2)], grid=(0, -20))
    place(cv, A["wheel_bg"], 960, 560, 1.0 + 0.04 * lt, t * 14, 1.0, Image.BILINEAR)

    p = E(t, 26.0, 0.55, EBACK)
    rot = -540 * (1 - E(t, 26.0, 0.8)) + 6 * math.sin(t * 2.2)
    place(cv, A["logo"], 960, 300 + 6 * math.sin(t * 2.5), max(0.01, p) * punch(t, [29.35], 0.1, 8), rot, 1)

    draw_letters(cv, "RESTAU WHEEL", "anton", 170, WHITE, 960, 505, t, 26.12, stagger=0.03, mode="drop", wave_amp=5)
    words = [("CRÉEZ", 26.32), ("VOTRE", 26.96), ("RESTAURANT", 27.2)]
    imgs = [text_img(w, "montserrat", 56, YELLOW if w == "RESTAURANT" else WHITE, tracking=0.12) for w, _ in words]
    total = sum(i.width for i in imgs) + 30 * (len(imgs) - 1)
    x = 960 - total / 2
    for img, (w, tw) in zip(imgs, words):
        draw_state(cv, img, slam(tw, x + img.width / 2, 650, s0=1.4, dy=40, dur=0.25, drift=(0, -4)), t)
        x += img.width + 30

    if t > 27.85:
        url = "restauwheel.com"
        full = text_img(url, "montserrat", 64, WHITE)
        pw = full.width + 78 + 110
        pp = E(t, 27.85, 0.3, EBACK)
        wcur = max(40, pw * pp)
        cy = 820
        s = punch(t, [29.35], 0.08, 8) * (1 + 0.015 * math.sin(t * 6))
        lay = Image.new("RGBA", (int(pw + 40), 160), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        lx0 = (pw + 40 - wcur) / 2
        d.rounded_rectangle((lx0 + 12, 32, lx0 + wcur + 12, 152), 60, fill=YELLOW + (255,))
        d.rounded_rectangle((lx0, 20, lx0 + wcur, 140), 60, fill=PINK + (255,))
        if pp > 0.9:
            lay.alpha_composite(A["icon_real"], (int(lx0 + 30), 41))
            n = int(clamp01((t - 28.08) / 1.2) * len(url))
            if n:
                typed = text_img(url[:n], "montserrat", 64, WHITE)
                lay.alpha_composite(typed, (int(lx0 + 128), int(80 - typed.height / 2)))
                cxr = lx0 + 128 + typed.width + 6
            else:
                cxr = lx0 + 128
            if int(t * 4) % 2 == 0 or n < len(url):
                d.rectangle((cxr, 52, cxr + 6, 108), fill=WHITE + (255,))
        # anneaux de pulsation
        rings = Image.new("RGBA", (W, 400), (0, 0, 0, 0))
        dr = ImageDraw.Draw(rings)
        for k in range(3):
            ph = ((t - 28.1) / 0.9 + k / 3) % 1 if t > 28.1 else -1
            if ph >= 0:
                g = 20 + 120 * ph
                dr.rounded_rectangle((960 - wcur / 2 - g, 200 - 60 - g, 960 + wcur / 2 + g, 200 + 60 + g), 60 + g,
                                     outline=PINK + (int(180 * (1 - ph)),), width=4)
        cv.alpha_composite(rings, (0, cy - 200))
        place(cv, lay, 960, cy + 6, s, 0, 1)

    draw_particles(cv, t, 1.0)
    draw_bursts(cv, t)
    return 1.0 + 0.05 * E(t, 26.0, 4.0, EIO), 0.0, 960, 540


SCENE_FUNCS = {"hook": scene_hook, "qr": scene_qr, "ticket": scene_ticket, "spin": scene_spin,
               "win": scene_win, "control": scene_control, "price": scene_price, "cta": scene_cta}

# ---------------------------------------------------------------------------
# Post-traitement : caméra, transitions, flashes, glitch, vignette, grain
# ---------------------------------------------------------------------------
SHAKES = [(0.5, 16), (1.06, 10), (3.78, 12), (6.65, 12), (9.62, 10), (11.62, 10), (12.0, 26), (13.95, 9),
          (15.05, 9), (16.01, 9), (17.37, 14), (19.81, 8), (23.58, 22), (26.0, 10), (29.35, 10)]


def camera_shake(t):
    dx = dy = rot = 0.0
    for ts, amp in SHAKES:
        if 0 <= t - ts < 0.6:
            k = amp * math.exp(-(t - ts) * 9)
            dx += k * math.sin(t * 91 + ts)
            dy += k * math.sin(t * 73 + ts * 2 + 1)
            rot += k * 0.03 * math.sin(t * 57 + ts)
    return dx, dy, rot


def apply_camera(img, zoom, rot, fx, fy, dx, dy):
    """Caméra 2D : zoom autour d'un point focal, rotation, translation."""
    if abs(zoom - 1) < 1e-4 and abs(rot) < 1e-3 and abs(dx) < 0.05 and abs(dy) < 0.05:
        return img
    th = math.radians(rot)
    c, s = math.cos(th), math.sin(th)
    ox = fx + dx
    oy = fy + dy
    a, b = c / zoom, s / zoom
    d_, e = -s / zoom, c / zoom
    cxo = fx - a * ox - b * oy
    cyo = fy - d_ * ox - e * oy
    return img.transform((W, H), Image.AFFINE, (a, b, cxo, d_, e, cyo), Image.BICUBIC, fillcolor=BLACK)


def hblur(arr, r, axis=1):
    r = int(r)
    if r < 1:
        return arr
    pw = [(0, 0)] * 3
    pw[axis] = (r + 1, r)
    c = np.cumsum(np.pad(arr, pw, mode="edge"), axis=axis, dtype=np.float32)
    n = arr.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / (2 * r + 1)


def zoom_blur(img, zoom, spread, n=5):
    acc = np.zeros((H, W, 3), np.float32)
    for k in range(n):
        z = zoom * (1 + spread * k / max(1, n - 1))
        w, h = W / z, H / z
        acc += np.asarray(img.resize((W, H), Image.BILINEAR, box=((W - w) / 2, (H - h) / 2, (W + w) / 2, (H + h) / 2)),
                          np.float32)
    return acc / n


def glitch(arr, amt, seed):
    rng = np.random.default_rng(seed)
    out = arr.copy()
    s = int(36 * amt) + 2
    out[..., 0] = np.roll(arr[..., 0], s, axis=1)
    out[..., 2] = np.roll(arr[..., 2], -s, axis=1)
    for _ in range(int(10 * amt) + 2):
        y0 = int(rng.integers(0, H - 60))
        hh = int(rng.integers(6, 70))
        out[y0:y0 + hh] = np.roll(out[y0:y0 + hh], int(rng.integers(-220, 220) * amt), axis=1)
    return out


def render_frame(i):
    t = i / FPS
    name, t0, t1 = next(s for s in SCENES if s[1] <= t < s[2] or (s == SCENES[-1] and t >= s[1]))
    cv = Image.new("RGBA", (W, H), BLACK + (255,))
    zoom, rot, fx, fy = SCENE_FUNCS[name](cv, t)
    fx, fy, _ = d2c(fx, fy)
    sdx, sdy, srot = camera_shake(t)
    if VERTICAL:
        sdx, sdy = sdx * W / DW, sdy * H / DH
    th = math.radians(abs(rot + srot))
    cover = math.cos(th) + math.sin(th) * W / H + 2.2 * max(abs(sdx) / W, abs(sdy) / H)
    img = apply_camera(cv.convert("RGB"), max(zoom, cover), rot + srot, fx, fy, sdx, sdy)

    arr = None
    for tb, kind, direction in TRANSITIONS:
        h = 0.17
        if tb - h <= t < tb + h:
            p_out = (t - (tb - h)) / h
            if kind == "zoom":
                if t < tb:
                    arr = zoom_blur(img, 1 + 0.6 * EI(p_out), 0.25 * p_out)
                else:
                    q = (t - tb) / h
                    arr = zoom_blur(img, 1 + 0.4 * (1 - EO(q)), 0.25 * (1 - q))
            else:
                axis = 1 if kind == "whip_h" else 0
                size = W if axis == 1 else H
                if t < tb:
                    shift, amt = direction * size * 0.4 * EI(p_out), p_out
                else:
                    q = (t - tb) / h
                    shift, amt = -direction * size * 0.4 * (1 - EO(q)), 1 - q
                a = np.roll(np.asarray(img, np.float32), int(shift), axis=axis)
                arr = hblur(a, 240 * amt * (1 if axis == 1 else 0.6), axis=axis)
    if arr is None:
        arr = np.asarray(img, np.float32)

    for t0g, t1g, amt in GLITCHES:
        if t0g <= t < t1g:
            mid = (t0g + t1g) / 2
            k = amt * (1 - abs(t - mid) / ((t1g - t0g) / 2))
            arr = glitch(arr, max(0.2, k), i)
    for tf, dur, col, mx in FLASHES:
        if tf - 1 / FPS <= t < tf + dur:
            a = mx * (1 - clamp01((t - tf) / dur))
            arr = arr * (1 - a) + np.array(col, np.float32) * a
    arr = arr * A["vignette"] + A["grain"][i % 4]
    if t > DUR - 0.25:
        arr *= 1 - 0.9 * EI(clamp01((t - (DUR - 0.25)) / 0.25))
    return np.clip(arr, 0, 255).astype(np.uint8)


def _worker_init():
    if not A:
        init_assets()


def _render_bytes(i):
    return render_frame(i).tobytes()


# ---------------------------------------------------------------------------
# Audio : SFX procéduraux ffmpeg + timeline + mix
# ---------------------------------------------------------------------------


def _chirp(f0, f1, dur, amp=0.35, noise=0.25):
    ratio = f1 / f0
    return (f"{amp}*sin(2*PI*{f0}*{dur}*(pow({ratio},t/{dur})-1)/log({ratio}))*pow(t/{dur},1.6)"
            f"+{noise}*(2*random(0)-1)*pow(t/{dur},3)")


def _whoosh_graph(dur, lo=1100, hi=1800):
    env = f"pow(sin(PI*pow(min(t/{dur},1),1.4)),2)"
    return (f"aevalsrc='(2*random(0)-1)*{env}':d={dur}:s={SR},lowpass=f={lo},lowpass=f={lo}[a];"
            f"aevalsrc='(2*random(1)-1)*{env}*{env}':d={dur}:s={SR},highpass=f={hi},lowpass=f=7500[b];"
            f"[a][b]amix=inputs=2:normalize=0,volume=1.8,aphaser=type=t:speed=1.6:decay=0.5[out]")


SFX_SPECS = {
    "impact": (1.3, "0.95*sin(2*PI*(42*t+130*(1-exp(-26*t))/26))*exp(-4.2*t)+0.45*(2*random(0)-1)*exp(-45*t)",
               "lowpass=f=5000,acompressor=threshold=0.5:ratio=4:attack=1:release=80"),
    "bassdrop": (2.4, "0.9*sin(2*PI*(28*t+140*(1-exp(-2.4*t))/2.4))*exp(-1.3*t)+0.3*(2*random(0)-1)*exp(-30*t)",
                 "asoftclip=type=tanh,lowpass=f=1800"),
    "hit": (0.6, "0.9*sin(2*PI*(65*t+220*(1-exp(-38*t))/38))*exp(-9*t)+0.5*(2*random(0)-1)*exp(-70*t)",
            "highpass=f=35"),
    "pop": (0.22, "0.8*sin(2*PI*(420*t+1100*(1-exp(-32*t))/32))*exp(-22*t)", "highpass=f=150"),
    "tick": (0.06, "0.55*(2*random(0)-1)*exp(-260*t)+0.5*sin(2*PI*3400*t)*exp(-320*t)", "highpass=f=1200"),
    "click": (0.12, "0.6*sin(2*PI*1750*t)*exp(-110*t)+gte(t,0.035)*0.5*sin(2*PI*2650*(t-0.035))*exp(-120*(t-0.035))",
              "highpass=f=300"),
    "key": (0.07, "0.5*(2*random(0)-1)*exp(-380*t)+0.35*sin(2*PI*1150*t)*exp(-260*t)", "highpass=f=600"),
    "wtick": (0.05, "0.6*sin(2*PI*1400*t)*exp(-170*t)+0.35*(2*random(0)-1)*exp(-320*t)", "highpass=f=500"),
    "ding": (1.6, "0.33*(sin(2*PI*1318.5*t)+0.55*sin(2*PI*1975.5*t)+0.35*sin(2*PI*2637*t)+0.2*sin(2*PI*3951*t))"
                  "*exp(-3.2*t)*(1-exp(-400*t))", "aecho=0.8:0.5:90|170:0.35|0.2"),
    "coin": (0.7, "0.35*(sin(2*PI*2093*t)*exp(-9*t)+gte(t,0.07)*sin(2*PI*2794*(t-0.07))*exp(-7*(t-0.07)))",
             "aecho=0.7:0.4:60:0.3"),
    "glitch": (0.4, "0.35*sgn(sin(2*PI*(180+620*mod(floor(t*36),5))*t))*exp(-2.5*t)",
               "acrusher=bits=5:mode=log:samples=6,lowpass=f=7000"),
    "riser": (1.4, _chirp(120, 1440, 1.4), "highpass=f=90"),
    "riser_s": (0.55, _chirp(200, 1800, 0.55), "highpass=f=120"),
    "whoosh": (0.5, None, None),
    "whoosh_l": (0.9, None, None),
    "swoosh_rev": (0.9, None, "areverse"),
}


def gen_sfx(sfx_dir):
    os.makedirs(sfx_dir, exist_ok=True)
    for name, (dur, expr, post) in SFX_SPECS.items():
        out = os.path.join(sfx_dir, f"{name}.wav")
        if expr is None:
            graph = _whoosh_graph(dur, 900 if name != "whoosh" else 1300, 1600 if name != "whoosh" else 2200)
            if post:
                graph = graph.replace("[out]", f",{post}[out]")
            cmd = ["ffmpeg", "-v", "error", "-y", "-filter_complex", graph, "-map", "[out]"]
        else:
            af = f"aevalsrc='{expr}':d={dur}:s={SR}" + (f",{post}" if post else "")
            cmd = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", af]
        cmd += ["-ac", "1", "-ar", str(SR), "-c:a", "pcm_s16le", out]
        subprocess.run(cmd, check=True)
    bed = os.path.join(sfx_dir, "bed.wav")
    l_expr = ("0.42*sin(2*PI*55*t)*exp(-7*mod(t,0.5))*(1-exp(-300*mod(t,0.5)))"
              "+0.10*sin(2*PI*110*t)*(0.55+0.45*sin(2*PI*0.125*t))+0.06*sin(2*PI*82.41*t)"
              "+0.03*(2*random(0)-1)*exp(-40*mod(t+0.25,0.5))")
    r_expr = l_expr.replace("82.41", "82.9").replace("random(0)", "random(1)")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                    f"aevalsrc='{l_expr}|{r_expr}':d={DUR}:s={SR}",
                    "-af", f"lowpass=f=6000,afade=t=in:d=0.6,afade=t=out:st={DUR - 0.8}:d=0.8",
                    "-ar", str(SR), "-c:a", "pcm_s16le", bed], check=True)


def sfx_timeline():
    """(temps, sfx, gain dB, pan) — calée sur les animations ci-dessus."""
    ev = [
        (0.00, "riser_s", -8, 0), (0.42, "whoosh", -6, -0.4), (0.50, "impact", -3, 0), (0.50, "glitch", -16, 0.3),
        (0.96, "whoosh", -7, 0.5), (1.06, "hit", -5, 0.2),
        (1.60, "riser_s", -14, 0), (1.78, "whoosh_l", -6, 0), (2.00, "swoosh_rev", -12, 0.5),
        (2.14, "pop", -9, -0.3), (2.82, "pop", -9, -0.2), (3.36, "pop", -9, -0.3), (3.78, "hit", -4, -0.2),
        (3.95, "click", -10, -0.3), (4.45, "riser", -14, 0), (4.83, "whoosh_l", -5, -0.6),
        (5.02, "hit", -8, 0.5), (5.35, "tick", -10, 0.5), (5.40, "tick", -12, 0.4), (5.47, "pop", -10, -0.3),
        (5.99, "hit", -6, -0.2), (6.65, "impact", -6, -0.2), (6.66, "glitch", -12, 0), (6.68, "click", -6, 0.4),
        (6.70, "coin", -12, 0.4), (7.22, "whoosh", -5, 0), (7.42, "hit", -9, 0.3),
        (7.69, "pop", -10, -0.3), (7.72, "click", -9, 0.4), (7.98, "click", -9, 0.4), (8.13, "hit", -6, -0.2),
        (8.24, "click", -9, 0.4), (8.50, "click", -9, 0.4), (8.75, "tick", -8, 0.4), (8.92, "click", -7, 0.3),
        (8.75, "riser_s", -10, 0), (9.05, "whoosh_l", -6, 0), (9.20, "hit", -6, 0),
        (9.37, "hit", -7, -0.4), (9.45, "click", -4, 0), (9.60, "whoosh", -6, -0.7), (9.62, "impact", -5, 0.4),
        (9.81, "hit", -6, -0.3), (11.62, "ding", -6, 0.4), (11.62, "coin", -10, 0.4),
        (11.40, "riser", -9, 0), (12.00, "bassdrop", -2, 0), (12.00, "impact", -5, 0),
        (12.05, "whoosh_l", -9, 0.4), (12.55, "hit", -6, -0.2), (12.95, "pop", -8, -0.2),
        (13.85, "whoosh", -8, -0.6), (13.95, "hit", -5, -0.2), (13.97, "coin", -12, 0.3),
        (14.95, "whoosh", -8, -0.6), (15.05, "hit", -5, -0.2), (15.07, "coin", -12, 0.3),
        (15.91, "whoosh", -8, -0.6), (16.01, "hit", -5, -0.2), (16.03, "coin", -12, 0.3),
        (16.90, "whoosh_l", -6, -0.5), (17.15, "pop", -8, 0), (17.37, "impact", -5, 0), (17.40, "ding", -12, 0),
        (17.90, "tick", -8, 0.2), (18.25, "tick", -8, 0.2), (18.60, "tick", -7, 0.2),
        (18.80, "glitch", -7, 0), (19.00, "whoosh_l", -7, 0.6), (19.02, "hit", -8, 0.4),
        (19.60, "click", -9, -0.3), (19.81, "hit", -6, -0.2), (20.60, "whoosh", -10, -0.6), (20.62, "click", -6, -0.4),
        (21.30, "pop", -9, 0.5), (21.35, "click", -6, -0.4), (21.42, "tick", -10, 0.5), (21.54, "tick", -10, 0.5),
        (21.66, "tick", -10, 0.5), (22.05, "click", -6, -0.4), (22.07, "whoosh", -10, -0.2),
        (22.83, "whoosh_l", -5, 0.6), (23.00, "hit", -9, -0.4),
    ]
    ev += [(23.05 + k * 0.066, "wtick", -12, 0.1 * ((-1) ** k)) for k in range(8)]
    ev += [(23.58, "bassdrop", -3, 0), (23.58, "impact", -4, 0), (23.60, "coin", -8, 0.3), (23.98, "whoosh", -7, 0.6),
           (24.00, "hit", -6, 0.4), (24.34, "pop", -9, 0), (24.75, "click", -10, 0),
           (25.40, "riser", -9, 0), (25.88, "whoosh_l", -5, 0), (26.00, "impact", -4, 0),
           (26.05, "swoosh_rev", -12, 0)]
    ev += [(26.12 + k * 0.03, "tick", -16, -0.5 + k * 0.09) for k in range(12)]
    ev += [(26.32, "pop", -9, 0), (26.96, "pop", -10, 0), (27.20, "pop", -9, 0), (27.85, "whoosh", -9, 0),
           (27.95, "click", -7, 0)]
    url = "restauwheel.com"
    ev += [(28.08 + 1.2 * k / len(url), "key", -11, 0.3 * math.sin(k)) for k in range(len(url))]
    ev += [(29.35, "impact", -5, 0), (29.37, "ding", -7, 0)]
    ev += [(tk, "wtick", -9, 0.35) for tk in spin_ticks()]
    return sorted(ev)


def read_wav(path):
    with wave.open(path, "rb") as wf:
        ch, sw, sr, n = wf.getnchannels(), wf.getsampwidth(), wf.getframerate(), wf.getnframes()
        raw = wf.readframes(n)
    assert sw == 2 and sr == SR, (path, sw, sr)
    return (np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0).reshape(-1, ch)


def write_wav(path, data):
    data = np.clip(data, -1, 1)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(data.shape[1])
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes((data * 32767).astype(np.int16).tobytes())


def _ffmpeg_stereo48(src, dst):
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", src, "-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", dst],
        check=True,
    )


def load_vo_clips(work):
    """Charge les clips ElevenLabs V4 (local → téléchargement CDN). Retourne [(wav, at), ...] ou None."""
    clip_dir = os.path.join(work, "vo-clips")
    os.makedirs(clip_dir, exist_ok=True)
    loaded = []
    for (fname, at), url in zip(VO_CLIPS, VO_CLIPS_URLS):
        local = os.path.join(VO_CLIPS_DIR, fname)
        mp3_name = fname.replace(".wav", ".mp3")
        local_mp3 = os.path.join(VO_CLIPS_DIR, mp3_name)
        out = os.path.join(clip_dir, fname)
        src = None
        if os.path.exists(local):
            src = local
        elif os.path.exists(local_mp3):
            src = local_mp3
        else:
            dl = os.path.join(clip_dir, mp3_name)
            if not url:
                print(f"[audio] clip VO {fname} manquant (pas d'URL)")
                return None
            try:
                if not os.path.exists(dl):
                    urllib.request.urlretrieve(url, dl)
                src = dl
            except Exception as exc:
                print(f"[audio] clip VO {fname} indisponible ({exc})")
                return None
        if not os.path.exists(out) or os.path.getmtime(src) > os.path.getmtime(out):
            _ffmpeg_stereo48(src, out)
        loaded.append((read_wav(out), at))
    return loaded


def get_voice(work):
    """VO locale mono-fichier > URL CloudFront > placeholder (silence + bips)."""
    src = None
    if os.path.exists(VO_LOCAL):
        src = VO_LOCAL
    else:
        dl = os.path.join(work, "vo_download.wav")
        try:
            if not os.path.exists(dl):
                urllib.request.urlretrieve(VO_URL, dl)
            src = dl
        except Exception as exc:
            print(f"[audio] VO indisponible ({exc}) -> placeholder bips")
    if src is None:
        return None, "placeholder"
    out = os.path.join(work, "vo48k.wav")
    _ffmpeg_stereo48(src, out)
    return read_wav(out), src


def place_vo_clip(vo_track, clip, dst, n):
    clip = clip / max(1e-6, np.abs(clip).max()) * 0.89
    fade = min(int(0.01 * SR), clip.shape[0] // 2)
    if fade > 0:
        clip = clip.copy()
        clip[:fade] *= np.linspace(0, 1, fade)[:, None]
        clip[-fade:] *= np.linspace(1, 0, fade)[:, None]
    i0 = int(dst * SR)
    m = min(clip.shape[0], n - i0)
    if m > 0:
        vo_track[i0:i0 + m] += clip[:m]


def build_audio(work):
    sfx_dir = os.path.join(work, "sfx")
    gen_sfx(sfx_dir)
    n = int(DUR * SR)
    vo_track = np.zeros((n, 2), np.float32)
    sfx_track = np.zeros((n, 2), np.float32)

    clips = load_vo_clips(work)
    if clips:
        vo_src = "elevenlabs_v4"
        for clip, at in clips:
            place_vo_clip(vo_track, clip, at, n)
        print(f"[audio] VO ElevenLabs V4 — {len(clips)} clips scène", flush=True)
    else:
        vo, vo_src = get_voice(work)
        if vo is None:
            beep = np.sin(2 * np.pi * 880 * np.arange(int(0.12 * SR)) / SR) * 0.3
            for _, _, dst in VO_CHUNKS:
                i0 = int(dst * SR)
                vo_track[i0:i0 + beep.size] += beep[:, None]
        else:
            vo = vo / max(1e-6, np.abs(vo).max()) * 0.89
            vo_dur = vo.shape[0] / SR
            if abs(vo_dur - VO_EXPECTED_DUR) < 0.1:
                for s0, s1, dst in VO_CHUNKS:
                    seg = vo[int(s0 * SR):int(s1 * SR)].copy()
                    fade = min(int(0.01 * SR), seg.shape[0] // 2)
                    seg[:fade] *= np.linspace(0, 1, fade)[:, None]
                    seg[-fade:] *= np.linspace(1, 0, fade)[:, None]
                    i0 = int(dst * SR)
                    m = min(seg.shape[0], n - i0)
                    vo_track[i0:i0 + m] += seg[:m]
            else:  # autre VO : posée telle quelle
                i0 = int(0.3 * SR)
                m = min(vo.shape[0], n - i0)
                vo_track[i0:i0 + m] += vo[:m]

    cache = {}
    events = sfx_timeline()
    for t, name, gain_db, pan in events:
        if name not in cache:
            cache[name] = read_wav(os.path.join(sfx_dir, f"{name}.wav"))[:, 0]
        # SFX discrets : -3 dB vs timeline, la VO reste prioritaire
        clip = cache[name] * (10 ** ((gain_db - 3) / 20))
        i0 = int(t * SR)
        m = min(clip.size, n - i0)
        if m <= 0:
            continue
        ang = (pan + 1) * math.pi / 4
        sfx_track[i0:i0 + m, 0] += clip[:m] * math.cos(ang) * 0.95
        sfx_track[i0:i0 + m, 1] += clip[:m] * math.sin(ang) * 0.95

    bed = read_wav(os.path.join(sfx_dir, "bed.wav"))[:n] * (10 ** (-18 / 20))
    # Ducking fort sous la VO : les SFX s'effacent quand on parle
    env = np.abs(vo_track).mean(axis=1)
    k = int(0.03 * SR)
    env = np.convolve(env, np.ones(k) / k, mode="same")
    duck = np.clip(env / 0.04, 0, 1)
    duck = np.convolve(duck, np.ones(int(0.16 * SR)) / int(0.16 * SR), mode="same")[:, None]
    mix = vo_track * 1.05 + sfx_track * (0.72 - 0.55 * duck) + bed * (1 - 0.7 * duck)
    mix = mix / max(1e-6, np.abs(mix).max()) * 0.76
    pre = os.path.join(work, "premix.wav")
    write_wav(pre, mix)
    final = os.path.join(work, "mix.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", pre, "-af",
                    "acompressor=threshold=0.32:ratio=2.2:attack=5:release=140,"
                    "loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.89",
                    "-ar", str(SR), "-t", str(DUR), "-c:a", "pcm_s16le", final], check=True)
    with open(os.path.join(work, "sfx_timeline.json"), "w") as fh:
        json.dump([{"t": round(e[0], 3), "sfx": e[1], "gain_db": e[2], "pan": round(e[3], 2)} for e in events],
                  fh, indent=1)
    return final, events, vo_src


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def encode(frames_src, audio, out_mp4, workers, png_dir=None):
    vin = (["-framerate", str(FPS), "-i", os.path.join(png_dir, "f%04d.png")] if png_dir else
           ["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"])
    ain = ["-i", audio] if audio else []
    cmd = ["ffmpeg", "-v", "error", "-y"] + vin + ain + ["-map", "0:v"] + (["-map", "1:a"] if audio else [])
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", "19", "-maxrate", "12M", "-bufsize", "24M",
            "-pix_fmt", "yuv420p", "-profile:v", "high",
            "-r", str(FPS), "-t", str(DUR), "-movflags", "+faststart"]
    if audio:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-ar", str(SR)]
    cmd += [out_mp4]
    if png_dir:
        subprocess.run(cmd, check=True)
        return
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    with Pool(workers, initializer=_worker_init) as pool:
        for i, buf in enumerate(pool.imap(_render_bytes, range(NFRAMES), chunksize=2)):
            proc.stdin.write(buf)
            if i % 60 == 0:
                el = time.time() - t0
                print(f"[video] frame {i}/{NFRAMES}  {el:.0f}s  ~{el / (i + 1) * (NFRAMES - i - 1):.0f}s restantes",
                      flush=True)
    proc.stdin.close()
    if proc.wait() != 0:
        raise SystemExit("ffmpeg a échoué")


def render_pngs(png_dir, workers):
    os.makedirs(png_dir, exist_ok=True)
    with Pool(workers, initializer=_worker_init) as pool:
        for i, buf in enumerate(pool.imap(_render_bytes, range(NFRAMES), chunksize=2)):
            Image.frombytes("RGB", (W, H), buf).save(os.path.join(png_dir, f"f{i:04d}.png"), compress_level=1)
            if i % 60 == 0:
                print(f"[video] png {i}/{NFRAMES}", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--vertical", action="store_true", help="rendu 9:16 (1080x1920) pour Stories/Reels/TikTok")
    ap.add_argument("--preview", help="temps (s) séparés par des virgules -> PNG dans WORK_DIR/preview")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2)))
    ap.add_argument("--png-frames", action="store_true", help="exporte les frames PNG avant l'encodage")
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--remux-audio", metavar="VIDEO",
                    help="regénère uniquement le mix VO+SFX et remux sur une vidéo existante (-c:v copy)")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    configure_format(args.vertical)
    if args.out is None:
        name = "restau-wheel-kinetic-30s-9x16.mp4" if args.vertical else "restau-wheel-kinetic-30s.mp4"
        args.out = os.path.join(OUT_DIR, name)

    os.makedirs(WORK_DIR, exist_ok=True)
    print(f"[format] {'9:16' if VERTICAL else '16:9'}  {W}x{H}", flush=True)

    if args.remux_audio:
        if args.no_audio:
            raise SystemExit("--remux-audio incompatible avec --no-audio")
        src = args.remux_audio
        if not os.path.exists(src):
            raise SystemExit(f"vidéo introuvable: {src}")
        audio, events, vo_src = build_audio(WORK_DIR)
        print(f"[audio] {len(events)} SFX, VO: {vo_src} -> remux {src}")
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        tmp = os.path.join(WORK_DIR, "remux.mp4")
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-i", src, "-i", audio,
            "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", "-ar", str(SR),
            "-shortest", "-movflags", "+faststart", tmp,
        ], check=True)
        shutil.copyfile(tmp, args.out)
        timeline_src = os.path.join(WORK_DIR, "sfx_timeline.json")
        timeline_dst = os.path.join(os.path.dirname(args.out) or ".", "sfx_timeline.json")
        if os.path.abspath(timeline_src) != os.path.abspath(timeline_dst):
            shutil.copyfile(timeline_src, timeline_dst)
        print(f"[video] remux audio OK -> {args.out}")
        return

    init_assets()

    if args.preview:
        pdir = os.path.join(WORK_DIR, "preview")
        os.makedirs(pdir, exist_ok=True)
        for ts in args.preview.split(","):
            i = min(NFRAMES - 1, int(round(float(ts) * FPS)))
            t0 = time.time()
            Image.fromarray(render_frame(i)).save(os.path.join(pdir, f"t{float(ts):05.2f}.png"))
            print(f"preview t={ts}s  ({time.time() - t0:.2f}s)")
        return

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    audio, events, vo_src = (None, [], None) if args.no_audio else build_audio(WORK_DIR)
    if audio:
        print(f"[audio] {len(events)} événements SFX, VO: {vo_src}")
    t0 = time.time()
    # Encodage en local : certains montages (artifacts) refusent la réécriture +faststart.
    tmp_mp4 = os.path.join(WORK_DIR, os.path.basename(args.out))
    if args.png_frames:
        png_dir = os.path.join(WORK_DIR, "frames")
        render_pngs(png_dir, args.workers)
        encode(None, audio, tmp_mp4, args.workers, png_dir)
    else:
        encode(None, audio, tmp_mp4, args.workers)
    shutil.copyfile(tmp_mp4, args.out)
    print(f"[video] rendu+encodage {time.time() - t0:.0f}s -> {args.out}")

    out_dir = os.path.dirname(args.out)
    for ts in (1, 8, 16, 28):
        still = os.path.join(WORK_DIR, f"frame-{ts:02d}s.png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp_mp4, "-ss", str(ts), "-frames:v", "1", still],
                       check=True)
        shutil.copyfile(still, os.path.join(out_dir, os.path.basename(still)))
    if audio:
        shutil.copyfile(os.path.join(WORK_DIR, "sfx_timeline.json"), os.path.join(out_dir, "sfx_timeline.json"))
    print("OK")


if __name__ == "__main__":
    main()
