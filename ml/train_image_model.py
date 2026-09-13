"""Train the e-waste image classifier on the supplied image dataset.

DATASET (as supplied, archive.zip -> ml/images/modified-dataset/)
    10 classes x 240 train / 30 val / 30 test = 3,000 images, 150x150 RGB.
    Classes: Battery, Keyboard, Microwave, Mobile, Mouse, PCB, Player,
             Printer, Television, Washing Machine.

WHAT THE MODEL PREDICTS
    The DEVICE in the photo, because that is what the labels actually say.
    Mapping device -> scrap material category is a separate, explicit step in
    device_map.py, and the collector always confirms it. Predicting "Television"
    and then silently calling it CRT would be guessing: a TV photo cannot tell
    you whether the tube is a CRT or an LCD panel. The app asks instead.

APPROACH
    HOG (shape/edge structure) + downsampled colour histograms, then a linear
    SVM. No deep learning, and that is a deliberate trade:
      * trains in about a minute on CPU, here, reproducibly;
      * exports to a ~1 MB pickle instead of a 10-50 MB network, which matters
        for entry-level Android and for backend cold start;
      * every accuracy number below is MEASURED on the held-out test split.
    A fine-tuned MobileNetV2 would very likely beat it. That is stated in the
    limitations rather than implied away.

Run:  python ml/train_image_model.py
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import joblib
import numpy as np
from PIL import Image
from skimage.feature import hog, local_binary_pattern
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.svm import SVC

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "ml" / "images" / "modified-dataset"
MODEL_OUT = ROOT / "ml" / "image_model.pkl"
METRICS_OUT = ROOT / "ml" / "image_model_metrics.json"

SIZE = 128
HOG_PARAMS = dict(orientations=9, pixels_per_cell=(8, 8),
                  cells_per_block=(2, 2), block_norm="L2-Hys")


def features(path: Path) -> np.ndarray:
    """HOG on greyscale + a coarse RGB histogram. Cheap, and it captures the
    two things that separate these classes: outline/texture, and colour."""
    img = Image.open(path).convert("RGB").resize((SIZE, SIZE))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    grey = arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    h = hog(grey, **HOG_PARAMS)
    hist = np.concatenate([
        np.histogram(arr[:, :, c], bins=24, range=(0, 1), density=True)[0]
        for c in range(3)
    ])
    # Local Binary Patterns add micro-texture (PCB traces, keyboard keys,
    # brushed metal) that HOG's coarse gradients miss.
    lbp = local_binary_pattern((grey * 255).astype(np.uint8), P=8, R=1, method="uniform")
    lbp_hist = np.histogram(lbp, bins=10, range=(0, 10), density=True)[0]
    # coarse 4x4 mean colour grid — layout information HOG throws away
    grid = arr.reshape(4, SIZE // 4, 4, SIZE // 4, 3).mean(axis=(1, 3)).ravel()
    return np.concatenate([h, hist, lbp_hist, grid]).astype(np.float32)


def load_split(split: str) -> tuple[np.ndarray, list[str], list[str]]:
    X, y, files = [], [], []
    for class_dir in sorted((IMAGES / split).iterdir()):
        if not class_dir.is_dir():
            continue
        for f in sorted(class_dir.glob("*.jpg")):
            X.append(features(f))
            y.append(class_dir.name)
            files.append(str(f.relative_to(ROOT)))
    return np.vstack(X), y, files


def main() -> None:
    if not IMAGES.exists():
        raise SystemExit(f"{IMAGES} not found — unzip archive.zip into ml/images/")

    t0 = time.time()
    print("Extracting features…")
    X_train, y_train, _ = load_split("train")
    X_val, y_val, _ = load_split("val")
    X_test, y_test, _ = load_split("test")
    classes = sorted(set(y_train))
    print(f"  train {X_train.shape}  val {X_val.shape}  test {X_test.shape}")
    print(f"  {len(classes)} classes, {X_train.shape[1]} features, "
          f"{time.time() - t0:.0f}s")

    # 8,230 features against 2,400 samples: keep estimators linear and cheap.
    # PCA both regularises and makes this train in seconds rather than hours
    # (calibrated LinearSVC with 3-fold CV at this width was pathological).
    candidates = {
        "PCA+LogisticRegression": Pipeline([
            ("scale", StandardScaler()),
            ("pca", PCA(n_components=220, random_state=42)),
            ("clf", LogisticRegression(max_iter=3000, C=1.0)),
        ]),
        "LogisticRegression": Pipeline([
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1500, C=0.02)),
        ]),
        "PCA+SVC-rbf": Pipeline([
            ("scale", StandardScaler()),
            ("pca", PCA(n_components=220, random_state=42)),
            ("clf", SVC(C=8.0, gamma="scale", probability=True, random_state=42)),
        ]),
    }

    scored = {}
    for name, pipe in candidates.items():
        pipe.fit(X_train, y_train)
        val_acc = accuracy_score(y_val, pipe.predict(X_val))
        scored[name] = {"pipeline": pipe, "val_accuracy": round(float(val_acc), 4)}
        print(f"  {name:<20} val accuracy {val_acc:.3f}")

    best_name = max(scored, key=lambda n: scored[n]["val_accuracy"])
    best = scored[best_name]["pipeline"]
    print(f"\nSelected {best_name} on validation accuracy")

    # Final, honest number: the test split, untouched until now.
    y_pred = best.predict(X_test)
    test_acc = float(accuracy_score(y_test, y_pred))
    print(f"TEST accuracy: {test_acc:.3f}\n")
    print(classification_report(y_test, y_pred, digits=3))

    cm = confusion_matrix(y_test, y_pred, labels=classes)
    per_class = {
        c: {
            "support": int(cm[i].sum()),
            "correct": int(cm[i, i]),
            "recall": round(float(cm[i, i] / cm[i].sum()), 3) if cm[i].sum() else 0.0,
            "most_confused_with": classes[int(np.argsort(cm[i])[-2])] if cm[i].sum() else None,
        }
        for i, c in enumerate(classes)
    }

    joblib.dump({
        "pipeline": best, "classes": classes, "model_name": best_name,
        "image_size": SIZE, "hog_params": HOG_PARAMS,
        "test_accuracy": round(test_acc, 4),
    }, MODEL_OUT, compress=3)

    metrics = {
        "model": best_name,
        "feature_extractor": "HOG(9 orientations, 8px cells) + RGB histogram(24 bins) + LBP(uniform, P=8) + 4x4 colour grid",
        "input_size": f"{SIZE}x{SIZE} RGB",
        "classes": classes,
        "dataset": {
            "source": "supplied archive.zip / modified-dataset",
            "train": len(y_train), "val": len(y_val), "test": len(y_test),
            "per_class_train": 240, "image_size_native": "150x150 RGB",
        },
        "validation_accuracy": {n: v["val_accuracy"] for n, v in scored.items()},
        "test_accuracy": round(test_acc, 4),
        "per_class_test": per_class,
        "confusion_matrix": {"labels": classes, "matrix": cm.tolist()},
        "training_seconds": round(time.time() - t0, 1),
        "what_it_predicts": (
            "The DEVICE shown in the photo (the dataset's own labels). Mapping a "
            "device to a scrap material category is a separate explicit step that "
            "the collector confirms — see ml/device_map.py."
        ),
        "limitations": [
            "Classical features (HOG + colour), not a fine-tuned CNN. A "
            "MobileNetV2 would likely score higher; this was chosen for a ~1 MB "
            "model, fast CPU inference and reproducible training.",
            "Trained on 150x150 catalogue-style images. Real scrapyard photos are "
            "cluttered, poorly lit and taken at odd angles — expect accuracy to "
            "drop in the field.",
            "Television cannot be resolved into CRT vs LCD/LED from the image "
            "alone; the app asks the collector instead of guessing.",
            "10 device classes do not cover all 7 material categories: Cable and "
            "Mixed plastic have no class in this dataset, so photo classification "
            "cannot propose them.",
            "Accuracy below is measured on this dataset's own test split, not on "
            "field photographs.",
        ],
    }
    METRICS_OUT.write_text(json.dumps(metrics, indent=2))
    size_kb = MODEL_OUT.stat().st_size / 1024
    print(f"Saved {MODEL_OUT.name} ({size_kb:.0f} KB) and {METRICS_OUT.name}")


if __name__ == "__main__":
    main()
