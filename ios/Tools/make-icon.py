#!/usr/bin/env python3
"""Génère l'icône de l'app iOS (1024x1024) aux couleurs de public/css/theme.css.

    python3 ios/Tools/make-icon.py

Écrit ios/RestauWheel/Assets.xcassets/AppIcon.appiconset/AppIcon.png
"""

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024
SUPERSAMPLE = 4  # dessin en 4096 puis réduction : bords lisses sans antialiasing natif

INK = (10, 10, 10)
GOLD = (255, 214, 10)
PINK = (255, 45, 106)
IVORY = (255, 248, 231)
CYAN = (0, 194, 255)

SEGMENTS = [GOLD, PINK, IVORY, CYAN, GOLD, PINK, IVORY, CYAN]


def build() -> Image.Image:
    size = SIZE * SUPERSAMPLE
    image = Image.new("RGB", (size, size), INK)
    draw = ImageDraw.Draw(image)

    margin = size * 0.11
    box = (margin, margin, size - margin, size - margin)
    step = 360 / len(SEGMENTS)
    separator = int(size * 0.012)

    for index, color in enumerate(SEGMENTS):
        start = index * step - 90
        draw.pieslice(box, start, start + step, fill=color, outline=INK, width=separator)

    # Jante
    draw.ellipse(box, outline=INK, width=int(size * 0.028))

    # Moyeu
    hub = size * 0.5
    radius = size * 0.105
    draw.ellipse(
        (hub - radius, hub - radius, hub + radius, hub + radius),
        fill=INK,
        outline=GOLD,
        width=int(size * 0.018),
    )

    return image.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    target = (
        Path(__file__).resolve().parents[1]
        / "RestauWheel/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    build().save(target, "PNG")
    print(f"→ {target}")


if __name__ == "__main__":
    main()
