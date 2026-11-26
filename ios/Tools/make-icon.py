#!/usr/bin/env python3
"""Génère l'icône de l'app iOS (1024x1024) aux couleurs de public/css/theme.css.

    python3 ios/Tools/make-icon.py

Écrit ios/RestauWheel/Assets.xcassets/AppIcon.appiconset/AppIcon.png
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SIZE = 1024
SUPERSAMPLE = 4  # dessin en 4096 puis réduction : bords lisses sans antialiasing natif

INK = (10, 10, 10)
GOLD = (255, 214, 10)
PINK = (255, 45, 106)
IVORY = (255, 248, 231)
CYAN = (0, 194, 255)

SEGMENTS = [GOLD, PINK, IVORY, CYAN, GOLD, PINK, IVORY, CYAN]


def _soft_ellipse(size: int, box, fill, blur: float) -> Image.Image:
    """Disque / ellipse flou en RGBA."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=fill)
    radius = max(1, int(blur))
    return layer.filter(ImageFilter.GaussianBlur(radius=radius))


def _side_crescent(size: int, side: str, strength: int = 200) -> Image.Image:
    """Reflet en croissant sur le bord gauche ou droit (masque L, pas de fill transparent)."""
    margin = size * 0.11
    outer = Image.new("L", (size, size), 0)
    ImageDraw.Draw(outer).ellipse(
        (margin, margin, size - margin, size - margin),
        fill=255,
    )

    # Disque intérieur décalé : croissant fin sur le bord
    shift = size * 0.032
    inset = size * 0.01
    if side == "left":
        cut = (
            margin + shift,
            margin + inset,
            size - margin + shift * 0.2,
            size - margin - inset,
        )
    else:
        cut = (
            margin - shift * 0.2,
            margin + inset,
            size - margin - shift,
            size - margin - inset,
        )
    hole = Image.new("L", (size, size), 0)
    ImageDraw.Draw(hole).ellipse(cut, fill=255)
    crescent = ImageChops.subtract(outer, hole)

    # Ne garder que la zone latérale (milieu haut-bas)
    side_gate = Image.new("L", (size, size), 0)
    gd = ImageDraw.Draw(side_gate)
    if side == "left":
        gd.ellipse((size * 0.05, size * 0.24, size * 0.36, size * 0.76), fill=255)
    else:
        gd.ellipse((size * 0.64, size * 0.24, size * 0.95, size * 0.76), fill=255)
    side_gate = side_gate.filter(ImageFilter.GaussianBlur(radius=int(size * 0.02)))
    crescent = ImageChops.multiply(crescent, side_gate)
    crescent = crescent.point(lambda a: min(255, int(a * strength / 255)))
    crescent = crescent.filter(ImageFilter.GaussianBlur(radius=max(1, int(size * 0.008))))

    layer = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    layer.putalpha(crescent)
    return layer


def add_side_reflections(image: Image.Image, margin: float) -> Image.Image:
    """Reflets latéraux en croissant sur les bords gauche et droit."""
    size = image.size[0]
    base = image.convert("RGBA")

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse(
        (margin, margin, size - margin, size - margin),
        fill=255,
    )

    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gloss = Image.alpha_composite(gloss, _side_crescent(size, "left", strength=235))
    gloss = Image.alpha_composite(gloss, _side_crescent(size, "right", strength=210))

    # Petit gloss haut, discret
    top = _soft_ellipse(
        size,
        (size * 0.32, size * 0.13, size * 0.68, size * 0.30),
        (255, 255, 255, 42),
        blur=size * 0.035,
    )
    gloss = Image.alpha_composite(gloss, top)

    clipped = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    clipped.paste(gloss, mask=mask)
    return Image.alpha_composite(base, clipped)


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

    # Reflets sur les côtés de la roue
    image = add_side_reflections(image, margin).convert("RGB")

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
