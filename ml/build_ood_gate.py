"""Build the out-of-distribution gate for the image classifier.

THE PROBLEM
    The classifier has ten classes and no "not e-waste" class, so softmax
    always names one of them. A photo of food came back as PCB at 0.81 and a
    household object at 0.98 — high confidence means "closest of the ten",
    NOT "this is e-waste". Confidence alone can never catch this.

THE GATE
    Project the image into the model's own PCA space and measure the mean
    distance to its k nearest TRAINING images. Anything the model has never
    seen anything like lands far away, whatever its softmax says. The
    threshold is calibrated on the validation split — a percentile of genuine
    in-distribution distances — so it is derived from data, not guessed.

    Raising the percentile rejects fewer real items and lets more junk in;
    lowering it does the opposite. The value used is printed and stored.

Run after train_image_model.py:  python ml/build_ood_gate.py
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.neighbors import NearestNeighbors

from train_image_model import IMAGES, load_split

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "ml" / "image_model.pkl"
GATE_OUT = ROOT / "ml" / "image_ood_gate.pkl"
METRICS = ROOT / "ml" / "image_model_metrics.json"

K = 5
PERCENTILE = 97.0        # of validation distances; see the note above
STRUCTURE_PERCENTILE = 2.0  # of training edge density; see below


def embed(pipeline, X: np.ndarray) -> np.ndarray:
    """Everything in the pipeline except the final classifier."""
    return pipeline[:-1].transform(X)


def main() -> None:
    bundle = joblib.load(MODEL)
    pipe = bundle["pipeline"]

    X_train, _, _ = load_split("train")
    X_val, _, _ = load_split("val")
    X_test, _, _ = load_split("test")

    Z_train = embed(pipe, X_train)
    Z_val = embed(pipe, X_val)
    Z_test = embed(pipe, X_test)

    nn = NearestNeighbors(n_neighbors=K).fit(Z_train)
    val_d = nn.kneighbors(Z_val)[0].mean(axis=1)
    test_d = nn.kneighbors(Z_test)[0].mean(axis=1)

    threshold = float(np.percentile(val_d, PERCENTILE))
    rejected_test = float((test_d > threshold).mean())

    # SECOND, COMPLEMENTARY CHECK: structure floor.
    #
    # The distance gate catches images that are novel but textured. It does
    # NOT catch smooth, low-detail images — those sit near the middle of
    # feature space and score a LOWER distance than real photos. Photographs
    # of actual devices always contain hard edges (casings, ports, screws,
    # traces); a blank wall, a pet or a plate of food does not. So we also
    # require the image to carry at least as much edge structure as the least
    # structured genuine training photo, at the chosen percentile.
    import sys
    sys.path.insert(0, str(ROOT / "backend"))
    from app.ai.features import extract as extract_basic

    train_files = sorted((IMAGES / "train").glob("*/*.jpg"))
    edges = np.array([extract_basic(f.read_bytes())["edge_density"]
                      for f in train_files])
    structure_floor = float(np.percentile(edges, STRUCTURE_PERCENTILE))
    print(f"training edge density: median {np.median(edges):.4f}, "
          f"p{STRUCTURE_PERCENTILE:.0f} {structure_floor:.4f}")
    print(f"structure floor     {structure_floor:.4f} "
          f"(rejects the least-structured {STRUCTURE_PERCENTILE:.0f}% of real photos)")

    joblib.dump({
        "nn": nn, "threshold": threshold, "k": K, "percentile": PERCENTILE,
        "val_distance_median": float(np.median(val_d)),
        "structure_floor": structure_floor,
        "structure_percentile": STRUCTURE_PERCENTILE,
    }, GATE_OUT, compress=3)

    print(f"validation distance: median {np.median(val_d):.2f}, "
          f"p{PERCENTILE:.0f} {threshold:.2f}")
    print(f"threshold           {threshold:.2f}")
    print(f"real e-waste wrongly rejected on the test split: {rejected_test:.1%}")
    print(f"saved {GATE_OUT.name} ({GATE_OUT.stat().st_size / 1024:.0f} KB)")

    if METRICS.exists():
        m = json.loads(METRICS.read_text())
        m["ood_gate"] = {
            "method": f"mean distance to {K} nearest training images in PCA space",
            "threshold": round(threshold, 3),
            "calibrated_on": f"p{PERCENTILE:.0f} of validation distances",
            "false_rejection_rate_on_test": round(rejected_test, 4),
            "structure_floor_edge_density": round(structure_floor, 4),
            "structure_floor_calibrated_on": f"p{STRUCTURE_PERCENTILE:.0f} of training edge density",
            "why": ("The classifier has no non-e-waste class, so a high softmax "
                    "score only means 'closest of the ten'. The gate rejects "
                    "images unlike anything in the training set."),
        }
        METRICS.write_text(json.dumps(m, indent=2))


if __name__ == "__main__":
    main()




