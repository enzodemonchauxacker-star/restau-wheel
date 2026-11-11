#!/usr/bin/env python3
"""Use unprocessed real laptop-keyboard recordings + clean whoosh cuts."""
from __future__ import annotations

import math
import random
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import List

import numpy as np
from scipy import signal

SR = 48000
DUR = 20.0
N = int(SR * DUR)
ROOT = Path("/tmp/rw_v5/sfx/real")
OUT = Path("/tmp/rw_v5/sfx")


@dataclass
class Line:
    text: str
    start: float
    cps: float

    @property
    def end(self) -> float:
        return self.start + len(self.text) / self.cps


def lines() -> List[Line]:
    return [
        Line("TU GALÈRES", 0.25, 14),
        Line("à faire revenir tes clients ?", 1.15, 22),
        Line("tu laisses", 5.2, 18),
        Line("DE L'ARGENT", 5.85, 14),
        Line("sur chaque table", 6.8, 20),
        Line("SANS RETOUR", 7.7, 14),
        Line("LA SOLUTION", 10.2, 14),
        Line("Une roue sur chaque table", 11.1, 20),
        Line("clients qui", 12.2, 18),
        Line("REVIENNENT", 12.9, 13),
        Line("RESTAU WHEEL", 15.2, 14),
        Line("La fidélité qui remplit", 16.15, 20),
        Line("TES TABLES", 17.3, 12),
        Line("Essaie la démo", 18.2, 16),
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


def fade(x: np.ndarray, nin=int(0.015 * SR), nout=int(0.04 * SR)) -> np.ndarray:
    y = x.copy()
    nin = min(nin, max(1, len(y) // 4))
    nout = min(nout, max(1, len(y) // 4))
    if nin > 1:
        y[:nin] *= np.linspace(0, 1, nin, dtype=np.float32)
    if nout > 1:
        y[-nout:] *= np.linspace(1, 0, nout, dtype=np.float32)
    return y


def peak_norm(x: np.ndarray, p=0.85) -> np.ndarray:
    m = float(np.max(np.abs(x))) + 1e-9
    return (x / m * p).astype(np.float32)


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


def active_regions(x: np.ndarray, min_len=0.4) -> List[tuple]:
    """Find typing bursts; merge gaps shorter than 120ms."""
    win = int(0.02 * SR)
    hop = int(0.01 * SR)
    rms = np.array([np.sqrt(np.mean(x[i : i + win] ** 2)) for i in range(0, len(x) - win, hop)], dtype=np.float32)
    thr = max(float(np.percentile(rms, 30)), 0.006)
    mask = rms > thr
    # merge short gaps
    gap = int(0.12 * SR / hop)
    i = 0
    while i < len(mask):
        if mask[i]:
            i += 1
            continue
        # look ahead for next True within gap
        j = i
        while j < len(mask) and not mask[j] and j - i <= gap:
            j += 1
        if j < len(mask) and mask[j] and j > i:
            mask[i:j] = True
            i = j
        else:
            i = j if j > i else i + 1
    regions = []
    i = 0
    while i < len(mask):
        if not mask[i]:
            i += 1
            continue
        j = i
        while j < len(mask) and mask[j]:
            j += 1
        a = i * hop
        b = min(len(x), j * hop + win)
        if (b - a) / SR >= min_len:
            regions.append((a, b))
        i = j
    return regions


def slice_for(src: np.ndarray, regions: List[tuple], need: int, rng: random.Random) -> np.ndarray:
    """Take a natural contiguous slice, NO time-stretch. Loop softly if needed."""
    # prefer regions long enough
    cands = [r for r in regions if (r[1] - r[0]) >= need]
    if cands:
        a, b = rng.choice(cands)
        start = rng.randint(a, max(a, b - need))
        return fade(peak_norm(src[start : start + need], 0.9))
    # else take longest region and tile with crossfade
    if not regions:
        if len(src) >= need:
            start = rng.randint(0, len(src) - need)
            return fade(peak_norm(src[start : start + need], 0.9))
        tile = np.tile(src, int(math.ceil(need / len(src))))[:need]
        return fade(peak_norm(tile, 0.9))
    a, b = max(regions, key=lambda r: r[1] - r[0])
    chunk = src[a:b]
    out = np.zeros(need, dtype=np.float32)
    pos = 0
    xf = int(0.03 * SR)
    while pos < need:
        take = min(len(chunk), need - pos)
        piece = chunk[:take].copy()
        if pos > 0 and xf > 1:
            n = min(xf, take, pos)
            ramp = np.linspace(0, 1, n, dtype=np.float32)
            out[pos : pos + n] = out[pos : pos + n] * (1 - ramp) + piece[:n] * ramp
            if take > n:
                out[pos + n : pos + take] = piece[n:take]
        else:
            out[pos : pos + take] = piece
        pos += take - (xf if pos + take < need else 0)
        if take <= xf:
            break
    return fade(peak_norm(out, 0.9))


def load_whoosh(path: Path, maxlen=0.85) -> np.ndarray:
    x = read_mono(path)[: int(maxlen * SR)]
    return fade(peak_norm(x, 0.95), nin=int(0.01 * SR), nout=int(0.1 * SR))


def main():
    rng = random.Random(21)

    # Best natural laptop / plastic keyboard beds (Mixkit + FSL)
    library = []
    for fname, weight in [
        ("hq_2531.wav", 10),   # Typing on a laptop keyboard HQ
        ("hq_2532.wav", 6),    # Slow typing HQ
        ("hq_2538.wav", 5),    # Hard laptop typing HQ
        ("hq_1386.wav", 4),    # Keyboard typing HQ
        ("fsl_typing.wav", 2),
    ]:
        x = read_mono(ROOT / fname)
        regs = active_regions(x)
        print(fname, f"{len(x)/SR:.1f}s", "regions", len(regs), "lens", [round((b-a)/SR,2) for a,b in regs[:6]])
        for _ in range(weight):
            library.append((x, regs))

    whoosh_files = [
        ("hq_whoosh_1491.wav", 0.95),
        ("hq_whoosh_1485.wav", 0.55),
        ("hq_whoosh_1467.wav", 0.9),
        ("hq_whoosh_166.wav", 0.75),
        ("hq_whoosh_1492.wav", 0.95),
        ("hq_whoosh_1489.wav", 0.9),
    ]
    whooshes = []
    for fn, ml in whoosh_files:
        fp = ROOT / fn
        if fp.exists():
            whooshes.append(load_whoosh(fp, ml))
    if len(whooshes) < 2:
        whooshes = [load_whoosh(ROOT / "whoosh_a.wav", 0.9), load_whoosh(ROOT / "whoosh_d.wav", 0.7)]

    buf = np.zeros((N, 2), dtype=np.float32)

    # Merge nearby lines into typing windows so bed feels continuous within a scene beat
    # but still starts/stops with text.
    for line in lines():
        need = int((line.end - line.start + 0.06) * SR)
        src, regs = rng.choice(library)
        bed = slice_for(src, regs, need, rng)
        # mild highpass only (remove rumble), no weird EQ
        b, a = signal.butter(2, 120 / (SR / 2), btype="high")
        bed = signal.lfilter(b, a, bed).astype(np.float32)
        bed = peak_norm(bed, 0.88)
        place(buf, bed, line.start, gain=1.35, pan=rng.uniform(-0.08, 0.08))

    # Whoosh on every scene transition
    for i, cut in enumerate([0.0, 5.0, 10.0, 15.0]):
        w = whooshes[i % len(whooshes)]
        t0 = max(0.0, cut - 0.06)
        place(buf, w, t0, gain=0.78 if cut else 0.58, pan=rng.uniform(-0.12, 0.12))
        # second layer softer / slightly delayed for body
        w2 = whooshes[(i + 3) % len(whooshes)]
        place(buf, w2[: int(0.55 * SR)], t0 + 0.04, gain=0.30, pan=-0.05)

    peak = float(np.max(np.abs(buf))) + 1e-9
    buf *= 0.93 / peak
    buf = np.tanh(buf * 1.02).astype(np.float32) * 0.98

    out = OUT / "audio_realistic.wav"
    write_stereo(out, buf)
    mono = buf.mean(1)
    print(
        "wrote",
        out,
        "mean",
        round(20 * math.log10(float(np.sqrt(np.mean(mono**2))) + 1e-12), 1),
        "max",
        round(20 * math.log10(float(np.max(np.abs(mono))) + 1e-12), 1),
    )


if __name__ == "__main__":
    main()
