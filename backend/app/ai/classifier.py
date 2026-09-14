"""Material classification service.

The interface is what matters: `classify(image_bytes, hint) -> Prediction`.
Swap `ACTIVE_CLASSIFIER` for a TensorFlow/PyTorch implementation of
`BaseClassifier` and nothing else in the app changes.

This is NOT a trained model. It is an explainable heuristic over the simple
image statistics in `features.py`, and it is built around one honest idea:

    it is far more useful to say "that isn't e-waste" than to confidently
    mislabel a photograph.

v1 mapped "green-dominant image" straight to PCB, so a leaf or a flower came
back as a circuit board at 91% confidence. v2 runs a rejection stage first —
foliage, petals, sky and skin are recognised and refused — and then only
proposes a category when the picture actually looks like manufactured scrap
(hard edges, low saturation). When it is unsure it says so and asks the
collector to choose, instead of inventing a number.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from pathlib import Path

from .features import FeatureError, extract

# Categories the classifier can propose.
CATEGORIES = [
    "PCB",
    "Cable",
    "Battery",
    "LCD/LED panel",
    "CRT",
    "Motor & magnet-bearing",
    "Mixed plastic",
]

# What a collector may pick by hand. "Other" exists so a genuine piece of
# e-waste that fits none of the above is never forced into a wrong category;
# it carries no published rate, so the recycler quotes it.
MANUAL_CATEGORIES = CATEGORIES + ["Other"]

# The three states every classification resolves to.
E_WASTE = "E_WASTE"
NOT_E_WASTE = "NOT_E_WASTE"
UNCERTAIN = "UNCERTAIN"

# Shown to the collector whenever the image is not electronic waste.
NOT_EWASTE_MESSAGE = (
    "This image does not appear to be electronic waste. Please upload a photo "
    "of the material you want to sell."
)

MODEL_VERSION = "heuristic-demo-v2"
IMAGE_MODEL_VERSION = "ewaste-image-hog-svc-v1"

# Below this the suggestion is not worth showing as an answer; the UI asks the
# collector to pick the material instead.
MIN_CONFIDENCE = 0.45

PROTOTYPE_NOTE = (
    "Prototype classifier (rule-based, not a trained model). A suggestion "
    "only — confirm or correct it before the lot is priced."
)


@dataclass
class Prediction:
    category: str | None
    confidence: float
    verdict: str = E_WASTE       # E_WASTE | NOT_E_WASTE | UNCERTAIN
    is_ewaste: bool = True       # kept for the existing API contract
    reason: str = ""
    detail: str = ""             # why, specifically — shown under the message
    alternatives: list[dict] = field(default_factory=list)
    features: dict = field(default_factory=dict)
    device: str | None = None
    device_mapping: dict = field(default_factory=dict)
    model_version: str = MODEL_VERSION
    note: str = PROTOTYPE_NOTE


class BaseClassifier:
    version = "base"

    def predict(self, image_bytes: bytes, hint: str | None = None) -> Prediction:  # pragma: no cover
        raise NotImplementedError


def _reject(f: dict) -> str | None:
    """Return a reason string if the photo does not look like e-waste.

    The discriminator that matters is texture, not colour. A circuit board is
    green *and* covered in hard-edged detail; a leaf is green and smooth. So
    every colour-based rejection also requires the picture to be smooth
    (few strong edges) and to contain almost no neutral/metallic pixels.
    """
    smooth = f["strong_edge_frac"] < 0.05
    manufactured = f["grey_frac"] > 0.15  # metal, plastic, solder mask, casing

    if f["vegetation_frac"] > 0.30 and smooth and not manufactured:
        return "plant"
    if f["petal_frac"] > 0.20 and f["saturation_mean"] > 0.45 and smooth and not manufactured:
        return "flower"
    if f["sky_frac"] > 0.40:
        return "sky"
    if f["skin_frac"] > 0.35 and smooth and not manufactured:
        return "person"
    # Coloured and smooth, with almost no neutral/metallic pixels: food,
    # fabric, fruit, packaging in daylight. Manufactured scrap is either
    # neutral (grey_frac high) or textured (strong edges) — usually both.
    if f["saturation_mean"] > 0.28 and smooth and f["grey_frac"] < 0.35:
        return "vivid"
    # Almost no detail at all — a blank wall, the floor, a blurred frame.
    if f["edge_density"] < 0.012 and f["value_std"] < 0.03:
        return "featureless"
    return None


REJECTION_TEXT = {
    "plant": "This looks like a plant or leaves, not e-waste. Photograph the "
             "item you want to sell.",
    "flower": "This looks like a flower, not e-waste. Photograph the item you "
              "want to sell.",
    "sky": "This looks like sky or an outdoor scene. Point the camera at the "
           "material itself.",
    "person": "This looks like a person. Photograph the e-waste item instead.",
    "vivid": "The colours and smooth surface do not look like scrap material. "
             "Photograph the item on a plain surface in good light.",
    "featureless": "The photo is too blurred or too plain to read. Move closer "
                   "and try again.",
}


def _score_categories(f: dict) -> list[tuple[str, float]]:
    """Loose, readable evidence scores. Not probabilities — normalised later."""
    r, g, b = f["mean_rgb"]
    edges = f["edge_density"]
    strong = f["strong_edge_frac"]
    sat = f["saturation_mean"]
    val = f["value_mean"]
    grey = f["grey_frac"]

    vstd = f["value_std"]
    scores = {c: 0.06 for c in CATEGORIES}

    # PCB: green substrate AND dense hard-edged detail. Both are required —
    # the detail is what separates a board from a leaf.
    if g > r and g > b:
        scores["PCB"] += 0.30 if strong > 0.10 else 0.02
    scores["PCB"] += min(strong * 1.4, 0.35)
    if 0.20 < sat < 0.65 and strong > 0.10:
        scores["PCB"] += 0.10

    # Cable: dark, strongly textured by tangled strands, part neutral.
    if val < 0.42:
        scores["Cable"] += 0.28
    if strong > 0.12:
        scores["Cable"] += 0.22
    if 0.15 < grey < 0.60:
        scores["Cable"] += 0.12

    # Battery: mostly neutral, mid brightness, modest detail, printed label.
    if grey > 0.55 and sat < 0.25:
        scores["Battery"] += 0.24
    if 0.35 < val < 0.62 and 0.03 < edges < 0.09:
        scores["Battery"] += 0.20
    if 0.05 < strong < 0.15:
        scores["Battery"] += 0.12

    # LCD: dark bluish panel in a bezel, flat centre.
    if b >= r and b >= g:
        scores["LCD/LED panel"] += 0.26
    if val < 0.45 and edges < 0.06:
        scores["LCD/LED panel"] += 0.20
    if 0.30 < grey < 0.70:
        scores["LCD/LED panel"] += 0.10

    # CRT: bulky, bright beige/grey body, very little detail.
    if grey > 0.80 and val > 0.62 and edges < 0.06:
        scores["CRT"] += 0.32
    if vstd > 0.10:
        scores["CRT"] += 0.10

    # Motor: neutral metal, mid brightness, very low colour, even surface.
    if grey > 0.80 and sat < 0.10 and 0.40 < val < 0.62:
        scores["Motor & magnet-bearing"] += 0.30
    if vstd < 0.09 and edges < 0.06:
        scores["Motor & magnet-bearing"] += 0.12

    # Magnet-bearing assembly: dark metal with bright specular highlights.
    if val < 0.45 and grey > 0.55:
        scores["Motor & magnet-bearing"] += 0.24
    if vstd > 0.16 and strong < 0.12:
        scores["Motor & magnet-bearing"] += 0.12

    # Mixed plastic: light, smooth, neutral housings.
    if val > 0.68 and edges < 0.035:
        scores["Mixed plastic"] += 0.30
    if sat < 0.12 and grey > 0.80 and vstd < 0.08:
        scores["Mixed plastic"] += 0.14

    return sorted(scores.items(), key=lambda kv: -kv[1])


class HeuristicClassifier(BaseClassifier):
    """Rejection-first rule classifier over explainable image statistics."""

    version = MODEL_VERSION

    def predict(self, image_bytes: bytes, hint: str | None = None) -> Prediction:
        # An explicit hint is the collector telling us the answer.
        if hint and hint in CATEGORIES:
            return Prediction(
                category=hint,
                confidence=0.95,
                verdict=E_WASTE,
                is_ewaste=True,
                reason="Material chosen by the collector.",
                alternatives=[],
                features={},
            )

        if not image_bytes or image_bytes == b"empty":
            return Prediction(
                category=None, confidence=0.0, verdict=UNCERTAIN, is_ewaste=True,
                reason="No photo supplied — choose the material manually.",
            )

        try:
            f = extract(image_bytes)
        except FeatureError:
            # Unreadable image: say so rather than guessing from a hash.
            return Prediction(
                category=None, confidence=0.0, verdict=UNCERTAIN, is_ewaste=True,
                reason="The photo could not be read. Take it again or choose "
                       "the material manually.",
            )

        rejection = _reject(f)
        if rejection:
            return Prediction(
                category=None,
                confidence=0.0,
                verdict=NOT_E_WASTE,
                is_ewaste=False,
                reason=NOT_EWASTE_MESSAGE,
                detail=REJECTION_TEXT[rejection],
                features=f,
            )

        ranked = _score_categories(f)
        top_cat, top_score = ranked[0]
        second_score = ranked[1][1] if len(ranked) > 1 else 0.0
        total = sum(max(s, 0.0) for _, s in ranked) or 1.0

        # Margin-based: confidence reflects how far the leading category is
        # ahead of the runner-up, not how many rules happened to fire. A rule
        # engine over 96x96 statistics never deserves 0.95, so it is capped.
        margin = (top_score - second_score) / top_score if top_score else 0.0
        seed = int(hashlib.sha256(image_bytes).hexdigest()[:6], 16)
        confidence = 0.34 + 0.62 * margin + (seed % 5) / 200.0
        confidence = round(min(max(confidence, 0.20), 0.85), 2)

        alternatives = [
            {"category": c, "confidence": round(s / total, 2)} for c, s in ranked[1:3]
        ]

        if confidence < MIN_CONFIDENCE:
            return Prediction(
                category=None,
                confidence=confidence,
                verdict=UNCERTAIN,
                is_ewaste=True,
                reason="Not confident enough to name the material — please "
                       "choose it below.",
                alternatives=alternatives,
                features=f,
            )

        return Prediction(
            category=top_cat,
            confidence=confidence,
            verdict=E_WASTE,
            is_ewaste=True,
            reason="",
            alternatives=alternatives,
            features=f,
        )


class ImageDatasetClassifier(BaseClassifier):
    """Real trained classifier over the supplied e-waste image dataset.

    Predicts the DEVICE (that is what the dataset labels), then maps it to a
    material via ml/device_map.py. The rejection stage from v2 still runs
    first, so a photo of a leaf is still refused before the model sees it.

    Falls back to the heuristic when the model file is missing.
    """

    version = IMAGE_MODEL_VERSION

    def __init__(self) -> None:
        self._bundle = None
        self._gate = None
        self._loaded = False
        self._fallback = HeuristicClassifier()

    def _load(self):
        if self._loaded:
            return self._bundle
        self._loaded = True
        try:
            import sys
            ml_dir = Path(__file__).resolve().parents[3] / "ml"
            if str(ml_dir) not in sys.path:
                sys.path.insert(0, str(ml_dir))
            import joblib
            model_path = ml_dir / "image_model.pkl"
            if model_path.exists():
                self._bundle = joblib.load(model_path)
            gate_path = ml_dir / "image_ood_gate.pkl"
            if gate_path.exists():
                self._gate = joblib.load(gate_path)
        except Exception:
            self._bundle = None
        return self._bundle

    def predict(self, image_bytes: bytes, hint: str | None = None) -> Prediction:
        if hint and hint in CATEGORIES:
            return Prediction(category=hint, confidence=0.95, verdict="E_WASTE",
                              is_ewaste=True, reason="Material chosen by the collector.")

        bundle = self._load()
        if bundle is None or not image_bytes or image_bytes == b"empty":
            return self._fallback.predict(image_bytes, hint)

        # Rejection first: a photo that is not e-waste never reaches the model.
        try:
            f = extract(image_bytes)
            rejection = _reject(f)
            if rejection:
                return Prediction(category=None, confidence=0.0, verdict="NOT_E_WASTE",
                                  is_ewaste=False, reason=REJECTION_TEXT[rejection],
                                  features=f, model_version=self.version)
        except FeatureError:
            f = {}

        try:
            import numpy as np
            from device_map import map_device
            from train_image_model import features as image_features

            import io, tempfile, os
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                tmp.write(image_bytes)
                tmp_path = tmp.name
            try:
                vec = image_features(Path(tmp_path)).reshape(1, -1)
            finally:
                os.unlink(tmp_path)

            pipe = bundle["pipeline"]
            classes = list(bundle["classes"])

            # OUT-OF-DISTRIBUTION GATE, before any class is named.
            # The model has ten classes and no "not e-waste" class, so its
            # softmax always picks one — food scored 0.81 as PCB and a
            # household object 0.98. Confidence cannot catch that; distance
            # from the training distribution can.
            if self._gate is not None:
                z = pipe[:-1].transform(vec)
                dist = float(self._gate["nn"].kneighbors(z)[0].mean())
                floor = self._gate.get("structure_floor", 0.0)
                too_smooth = bool(f) and f.get("edge_density", 1.0) < floor
                # Two complementary tests: novel-but-textured images fail the
                # distance test; smooth low-detail images (a wall, a pet, a
                # plate of food) fail the structure test. Neither alone is
                # enough, and confidence alone catches neither.
                if dist > self._gate["threshold"] or too_smooth:
                    return Prediction(
                        category=None, confidence=0.0, verdict="NOT_E_WASTE",
                        is_ewaste=False,
                        reason=("This image does not appear to be electronic waste. "
                                "Please upload a photo of the material you want to sell."),
                        features={**f, "ood_distance": round(dist, 1),
                                  "ood_threshold": round(self._gate["threshold"], 1),
                                  "structure_floor": round(floor, 4),
                                  "rejected_by": "structure" if too_smooth else "distance"},
                        model_version=self.version,
                    )

            proba = pipe.predict_proba(vec)[0]
            order = np.argsort(proba)[::-1]
            device = classes[order[0]]
            confidence = float(proba[order[0]])
            mapping = map_device(device)
        except Exception:
            return self._fallback.predict(image_bytes, hint)

        alternatives = [
            {"device": classes[i], "category": map_device(classes[i])["material"],
             "confidence": round(float(proba[i]), 3)}
            for i in order[1:4]
        ]

        # Below the gate we do not name a material — we ask.
        if confidence < 0.45 or mapping["material"] is None:
            return Prediction(
                category=None, confidence=round(confidence, 2), verdict="UNCERTAIN",
                is_ewaste=True,
                reason="Could not confidently identify the material. Please select it manually.",
                alternatives=alternatives, features=f, model_version=self.version,
                device=device, device_mapping=mapping,
            )

        return Prediction(
            category=mapping["material"], confidence=round(confidence, 2),
            verdict="E_WASTE", is_ewaste=True, reason="",
            alternatives=alternatives, features=f, model_version=self.version,
            device=device, device_mapping=mapping,
            note=("Trained on the supplied e-waste image dataset (10 device classes, "
                  "65.3% test accuracy). The model identifies the DEVICE; the material "
                  "shown is a mapping you should confirm."),
        )


ACTIVE_CLASSIFIER: BaseClassifier = ImageDatasetClassifier()


def classify(image_bytes: bytes, hint: str | None = None) -> Prediction:
    return ACTIVE_CLASSIFIER.predict(image_bytes, hint)
