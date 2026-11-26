#!/usr/bin/env python3
"""Génère l'icône de l'app iOS (1024x1024) aux couleurs de public/css/theme.css.

    python3 ios/Tools/make-icon.py

Écrit ios/RestauWheel/Assets.xcassets/AppIcon.appiconset/AppIcon.png

Les reflets sont ceux du carré / squircle Apple (bords gauche & droit du
tile), pas ceux de la roue. Apple applique le masque arrondi à l'affichage ;
on livre un PNG plein cadre 1024×1024 sans transparence.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
SUPERSAMPLE = 4  # dessin en 4096 puis réduction : bords lisses sans antialiasing natif

INK = (10, 10, 10)
GOLD = (255, 214, 10)
PINK = (255, 45, 106)
IVORY = (255, 248, 231)
CYAN = (0, 194, 255)

SEGMENTS = [GOLD, PINK, IVORY, CYAN, GOLD, PINK, IVORY, CYAN]

# Rayon type iOS (~22 % du côté) pour le preview masqué uniquement
SQUIRCLE_CORNER = 0.2237


def _soft_rect(size: int, box, fill, blur: float) -> Image.Image:
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rectangle(box, fill=fill)
    return layer.filter(ImageFilter.GaussianBlur(radius=max(1, int(blur))))


def add_apple_square_reflections(image: Image.Image) -> Image.Image:
    """Reflets spéculaires sur les côtés du carré d’icône Apple."""
    size = image.size[0]
    base = image.convert("RGBA")
    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Bande claire verticale — bord gauche du tile
    left = _soft_rect(
        size,
        (0, size * 0.08, size * 0.14, size * 0.92),
        (255, 255, 255, 95),
        blur=size * 0.035,
    )
    # Contre-jour — bord droit
    right = _soft_rect(
        size,
        (size * 0.86, size * 0.08, size, size * 0.92),
        (255, 255, 255, 70),
        blur=size * 0.035,
    )
    # Léger gloss haut (liseré du carré Apple)
    top = _soft_rect(
        size,
        (size * 0.12, 0, size * 0.88, size * 0.10),
        (255, 255, 255, 45),
        blur=size * 0.028,
    )

    gloss = Image.alpha_composite(gloss, left)
    gloss = Image.alpha_composite(gloss, right)
    gloss = Image.alpha_composite(gloss, top)
    return Image.alpha_composite(base, gloss)


def apple_squircle_mask(size: int) -> Image.Image:
    """Masque arrondi proche du squircle iOS (pour aperçu uniquement)."""
    mask = Image.new("L", (size, size), 0)
    r = int(size * SQUIRCLE_CORNER)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=255)
    return mask


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

    # Reflets autour du carré Apple (côtés du tile)
    image = add_apple_square_reflections(image).convert("RGB")

    return image.resize((SIZE, SIZE), Image.LANCZOS)


def preview_on_home_screen(icon: Image.Image) -> Image.Image:
    """Aperçu : icône masquée en squircle Apple sur fond wallpaper clair."""
    size = icon.size[0]
    # Fond type grille iOS (gris chaud léger)
    canvas = Image.new("RGB", (size + 160, size + 160), (230, 229, 225))
    masked = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    masked.paste(icon.convert("RGBA"), (0, 0))
    masked.putalpha(apple_squircle_mask(size))
    # Ombre douce sous le tile
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    pad = 80
    r = int(size * SQUIRCLE_CORNER)
    sd.rounded_rectangle(
        (pad + 6, pad + 14, pad + size + 6, pad + size + 14),
        radius=r,
        fill=(0, 0, 0, 55),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=18))
    out = canvas.convert("RGBA")
    out = Image.alpha_composite(out, shadow)
    out.paste(masked, (pad, pad), masked)
    return out.convert("RGB")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    target = root / "RestauWheel/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    icon = build()
    icon.save(target, "PNG")
    print(f"→ {target}")

    # Aperçu local (non versionné) pour juger les reflets du carré Apple
    preview_path = Path("/opt/cursor/artifacts/app-icon-apple-squircle.png")
    preview_on_home_screen(icon).save(preview_path, "PNG")
    print(f"→ {preview_path}")


if __name__ == "__main__":
    main()
