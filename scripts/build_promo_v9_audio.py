#!/usr/bin/env python3
"""Audio for v9: real laptop keyboard beds + whoosh cuts (same recipe as reference)."""
from __future__ import annotations

import math
import random
import wave
from pathlib import Path

import numpy as np
from scipy import signal

SR = 48000
DUR = 20.0
N = int(SR * DUR)
ROOT = Path("/tmp/rw_v5/sfx/real")
OUT = Path("/tmp/rw_v9/sfx")
OUT.mkdir(parents=True, exist_ok=True)

# Typing windows from overlay_v9 scene_lines (absolute)
WINDOWS = [
    # scene1
    (0.22, 0.22 + len("TES TABLES") / 13 + 0.04),
    (1.05, 1.05 + len("se vident") / 16 + 0.04),
    (1.85, 1.85 + len("après le dessert ?") / 18 + 0.04),
    # scene2
    (5.18, 5.18 + len("Tu paies pour") / 18 + 0.04),
    (5.85, 5.85 + len("LES ATTIRER") / 13 + 0.04),
    (6.85, 6.85 + len("Ils mangent…") / 16 + 0.04),
    (7.65, 7.65 + len("et DISPARAISSENT") / 13 + 0.04),
    # scene3
    (10.18, 10.18 + len("SCANNE · TOURNE") / 14 + 0.04),
    (11.20, 11.20 + len("Une roue sur chaque table") / 18 + 0.04),
    (12.25, 12.25 + len("ils reviennent") / 16 + 0.04),
    (13.00, 13.00 + len("TOUT SEULS") / 12 + 0.04),
    # scene4
    (15.18, 15.18 + len("RESTAU WHEEL") / 13 + 0.04),
    (16.10, 16.10 + len("La fidélité qui remplit") / 18 + 0.04),
    (17.15, 17.15 + len("TES SERVICES") / 12 + 0.04),
    (18.15, 18.15 + len("Essaie la démo") / 16 + 0.04),
    (18.15 + len("Essaie la démo") / 16 + 0.15, 18.15 + len("Essaie la démo") / 16 + 0.15 + len("restauwheel.com") / 22 + 0.04),
]


def read_mono(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
        if ch > 1:
            x = x.reshape(-1, ch).mean(1)
        x /= 32768.0
    if sr != SR:
        x = signal.resample(x, int(len(x) * SR / sr)).astype(np.float32)
    return x


def write_stereo(path: Path, buf: np.ndarray):
    pcm = (np.clip(buf, -1, 1) * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(np.column_stack((pcm[:, 0], pcm[:, 1])).tobytes())


def fade(x, nin=int(0.012 * SR), nout=int(0.045 * SR)):
    y = x.copy()
    nin = min(nin, max(1, len(y) // 4))
    nout = min(nout, max(1, len(y) // 4))
    if nin > 1:
        y[:nin] *= np.linspace(0, 1, nin, dtype=np.float32)
    if nout > 1:
        y[-nout:] *= np.linspace(1, 0, nout, dtype=np.float32)
    return y


def peak(x, p=0.9):
    return (x / (float(np.max(np.abs(x))) + 1e-9) * p).astype(np.float32)


def place(buf, clip, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= len(buf):
        return
    n = min(len(clip), len(buf) - i)
    if n <= 0:
        return
    lg = math.cos((pan + 1) * math.pi / 4)
    rg = math.sin((pan + 1) * math.pi / 4)
    buf[i : i + n, 0] += clip[:n] * gain * lg
    buf[i : i + n, 1] += clip[:n] * gain * rg


def main():
    rng = random.Random(99)
    b_lp, a_lp = signal.butter(2, 12000 / (SR / 2), btype="low")
    b_hp, a_hp = signal.butter(2, 100 / (SR / 2), btype="high")

    srcs = []
    for fn in ["hq_2531.wav", "hq_2538.wav", "hq_2532.wav", "hq_1386.wav"]:
        x = read_mono(ROOT / fn)
        x = signal.lfilter(b_lp, a_lp, signal.lfilter(b_hp, a_hp, x)).astype(np.float32)
        srcs.append(x)

    whooshes = []
    for fn in ["hq_whoosh_1491.wav", "hq_whoosh_1467.wav", "hq_whoosh_1492.wav", "hq_whoosh_166.wav", "hq_whoosh_1489.wav"]:
        w = read_mono(ROOT / fn)[: int(0.85 * SR)]
        w = signal.lfilter(b_hp, a_hp, w).astype(np.float32)
        whooshes.append(fade(peak(w, 0.95), nin=int(0.01 * SR), nout=int(0.12 * SR)))

    buf = np.zeros((N, 2), dtype=np.float32)

    for a, b in WINDOWS:
        a = max(0.0, a)
        b = min(DUR - 0.02, b)
        if b <= a:
            continue
        need = int((b - a) * SR)
        src = srcs[rng.randrange(len(srcs))]
        if len(src) <= need:
            chunk = np.tile(src, int(math.ceil(need / len(src))))[:need]
        else:
            best = None
            for _ in range(20):
                st = rng.randint(0, len(src) - need)
                c = src[st : st + need]
                r = float(np.sqrt(np.mean(c**2)))
                if best is None or r > best[0]:
                    best = (r, c)
            chunk = best[1]
        chunk = fade(peak(chunk, 0.92))
        place(buf, chunk, a, gain=1.25, pan=rng.uniform(-0.08, 0.08))

    for i, cut in enumerate([0.0, 5.0, 10.0, 15.0]):
        w = whooshes[i % len(whooshes)]
        t0 = max(0.0, cut - 0.05)
        place(buf, w, t0, gain=0.72 if cut else 0.55, pan=rng.uniform(-0.1, 0.1))
        w2 = whooshes[(i + 2) % len(whooshes)][: int(0.5 * SR)]
        place(buf, w2, t0 + 0.04, gain=0.28, pan=-0.06)

    peakv = float(np.max(np.abs(buf))) + 1e-9
    buf *= 0.93 / peakv
    buf = np.tanh(buf * 1.03).astype(np.float32) * 0.98
    raw = OUT / "audio_raw.wav"
    write_stereo(raw, buf)
    print("wrote", raw)


if __name__ == "__main__":
    main()
