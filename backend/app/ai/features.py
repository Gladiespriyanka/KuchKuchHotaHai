"""Image features for the prototype classifier.

Deliberately simple, explainable statistics — no trained weights. The point is
that every number here can be printed, argued with, and reproduced, which is
what makes the "is this even e-waste?" rejection defensible.

Features computed on a 96x96 downscale:

  edge_density        mean Sobel gradient magnitude, 0..1. Circuit boards,
                      cables and connectors are full of small high-contrast
                      detail; leaves, petals, sky and skin are smooth.
  strong_edge_frac    fraction of pixels above a high gradient threshold.
  saturation_mean     mean HSV saturation. Manufactured e-waste is mostly
                      desaturated (grey, black, dull green); flowers and
                      foliage are vividly saturated.
  vegetation_frac     pixels in the leaf/plant hue band with real saturation.
  petal_frac          pixels in vivid warm/magenta hues typical of flowers.
  sky_frac            bright, moderately saturated blue.
  skin_frac           narrow warm hue band with the R>G>B ordering of skin.
  value_mean/std      brightness statistics.
  grey_frac           near-neutral pixels (metal, plastic housings, tracks).
"""
from __future__ import annotations

import colorsys
import io
import math

SIZE = 96


class FeatureError(RuntimeError):
    pass


def _to_rgb_grid(image_bytes: bytes):
    try:
        from PIL import Image
    except Exception as exc:  # pragma: no cover - Pillow is in requirements
        raise FeatureError("Pillow is required for image features") from exc
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img = img.convert("RGB").resize((SIZE, SIZE))
    except Exception as exc:
        raise FeatureError("Unreadable image") from exc
    return list(img.getdata())


def extract(image_bytes: bytes) -> dict:
    """Return the feature dictionary described in the module docstring."""
    pixels = _to_rgb_grid(image_bytes)
    n = len(pixels)

    grey = [0.0] * n
    sat_total = 0.0
    val_total = 0.0
    val_sq = 0.0
    vegetation = petal = sky = skin = neutral = 0
    r_total = g_total = b_total = 0

    for i, (r, g, b) in enumerate(pixels):
        r_total += r
        g_total += g
        b_total += b
        grey[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0

        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        hue = h * 360.0
        sat_total += s
        val_total += v
        val_sq += v * v

        if s < 0.18:
            neutral += 1
        # Foliage: yellow-green through green-cyan, genuinely coloured.
        if 65 <= hue <= 165 and s > 0.30 and v > 0.18:
            vegetation += 1
        # Petals: vivid warm reds/oranges/yellows and magentas/violets.
        if s > 0.45 and v > 0.45 and (hue <= 60 or hue >= 280):
            petal += 1
        # Sky: bright, blue, not too saturated.
        if 190 <= hue <= 255 and 0.15 < s < 0.75 and v > 0.55:
            sky += 1
        # Skin: narrow warm band with the characteristic channel ordering.
        if 5 <= hue <= 45 and 0.15 < s < 0.62 and v > 0.35 and r > g > b:
            skin += 1

    val_mean = val_total / n
    val_std = math.sqrt(max(val_sq / n - val_mean * val_mean, 0.0))

    # Sobel on the greyscale grid.
    grad_total = 0.0
    strong = 0
    inner = 0
    for y in range(1, SIZE - 1):
        row = y * SIZE
        for x in range(1, SIZE - 1):
            i = row + x
            tl, t, tr = grey[i - SIZE - 1], grey[i - SIZE], grey[i - SIZE + 1]
            ml, mr = grey[i - 1], grey[i + 1]
            bl, bo, br = grey[i + SIZE - 1], grey[i + SIZE], grey[i + SIZE + 1]
            gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl)
            gy = (bl + 2 * bo + br) - (tl + 2 * t + tr)
            mag = math.sqrt(gx * gx + gy * gy) / 4.0  # normalised to ~0..1
            grad_total += mag
            if mag > 0.22:
                strong += 1
            inner += 1

    return {
        "edge_density": round(grad_total / inner, 4),
        "strong_edge_frac": round(strong / inner, 4),
        "saturation_mean": round(sat_total / n, 4),
        "value_mean": round(val_mean, 4),
        "value_std": round(val_std, 4),
        "vegetation_frac": round(vegetation / n, 4),
        "petal_frac": round(petal / n, 4),
        "sky_frac": round(sky / n, 4),
        "skin_frac": round(skin / n, 4),
        "grey_frac": round(neutral / n, 4),
        "mean_rgb": [r_total // n, g_total // n, b_total // n],
    }
