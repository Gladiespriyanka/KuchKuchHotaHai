"""Smart Scrap Value Estimator — hybrid reference + ML predictor.

    reference rate (real, published)  ->  ML adjustment (locality / quality /
    quantity / drift)  ->  estimated rate  ->  x quantity  ->  estimated value

The reference rate is the anchor because it is the only REAL number we have.
The model only adjusts around it, and only for materials it has seen. For an
unknown material we fall back to the category median and say so, instead of
inventing a number.

Importable from the backend: `estimate_value(...)` has no FastAPI dependency.
"""
from __future__ import annotations

import csv
import datetime as dt
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLEAN = ROOT / "data" / "jaipur_scrap_rates_clean.csv"
RAW = ROOT / "data" / "jaipur_scrap_rates.csv"
MODEL = ROOT / "ml" / "scrap_price_model.pkl"
TRANSACTIONS = ROOT / "data" / "scrap_transactions.csv"

DISCLAIMER = (
    "Estimated from published Jaipur scrap rates. Actual kabadiwala rates vary "
    "with quality, quantity and local market conditions."
)

TRANSACTION_FIELDS = [
    "transaction_id", "date", "material", "category", "locality", "quantity",
    "unit", "offered_price", "final_price", "quality", "collector_type", "source",
]


@lru_cache(maxsize=1)
def reference_table() -> list[dict]:
    path = CLEAN if CLEAN.exists() else RAW
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        r["price"] = float(r["price"])
    return rows


@lru_cache(maxsize=1)
def _model():
    """Load the trained pipeline. Absent model is fine — reference still works."""
    if not MODEL.exists():
        return None
    try:
        import joblib
        return joblib.load(MODEL)
    except Exception:
        return None


def list_materials(category: str | None = None) -> list[dict]:
    """Materials with their published rates, most valuable first."""
    rows = [r for r in reference_table() if not category or r["category"] == category]
    rows.sort(key=lambda r: (r["unit"], -r["price"]))
    return [
        {
            "material": r["material"], "category": r["category"],
            "item_type": r.get("item_type", ""), "unit": r["unit"],
            "reference_rate": r["price"],
            "buys": r["price"] > 0,
        }
        for r in rows
    ]


def _find(material: str) -> dict | None:
    m = (material or "").strip().lower()
    for r in reference_table():
        if r["material"].lower() == m:
            return r
    for r in reference_table():          # forgiving partial match
        if m and (m in r["material"].lower() or r["material"].lower() in m):
            return r
    return None


def estimate_value(category: str, material: str, quantity: float,
                   unit: str | None = None, locality: str = "Jaipur",
                   quality: str = "mixed") -> dict:
    if quantity is None or float(quantity) <= 0:
        raise ValueError("quantity must be greater than zero")
    quantity = float(quantity)

    ref = _find(material)
    method = "reference+ml"
    confidence = "Reference-based estimate, ML-adjusted"

    if ref is None:
        # Unknown material: category median, clearly labelled. No invention.
        same = [r["price"] for r in reference_table()
                if r["category"] == category and r["price"] > 0]
        if not same:
            raise ValueError(f"Unknown material and category: {material} / {category}")
        same.sort()
        rate = same[len(same) // 2]
        return {
            "material": material, "category": category,
            "unit": unit or "kg", "quantity": quantity,
            "reference_rate": None,
            "predicted_rate": round(rate, 2),
            "estimated_value": round(rate * quantity),
            "currency": "INR",
            "confidence": "Category median only — this exact item is not in the rate list",
            "method": "category-median",
            "locality": locality, "quality": quality,
            "disclaimer": DISCLAIMER,
        }

    unit = ref["unit"]
    reference_rate = ref["price"]

    if reference_rate == 0:
        return {
            "material": ref["material"], "category": ref["category"],
            "unit": unit, "quantity": quantity,
            "reference_rate": 0.0, "predicted_rate": 0.0, "estimated_value": 0,
            "currency": "INR",
            "confidence": "This material is currently accepted at no payment",
            "method": "reference", "locality": locality, "quality": quality,
            "disclaimer": DISCLAIMER,
        }

    predicted = reference_rate
    bundle = _model()
    if bundle is not None:
        try:
            import pandas as pd
            row = pd.DataFrame([{
                "material": ref["material"], "category": ref["category"],
                "item_type": ref.get("item_type", ""), "locality": locality,
                "unit": unit, "quality": quality, "quantity": quantity,
                "days_index": 179,   # most recent simulated day
            }])
            predicted = float(bundle["pipeline"].predict(row)[0])
            # Guard rail: the ML layer adjusts, it does not overrule. Anything
            # beyond +/-35% of the published rate is treated as model error.
            low, high = reference_rate * 0.65, reference_rate * 1.35
            if not (low <= predicted <= high):
                predicted = min(max(predicted, low), high)
                confidence = "Reference-based estimate (ML adjustment capped)"
        except Exception:
            method = "reference"
            confidence = "Reference-based estimate (model unavailable)"
    else:
        method = "reference"
        confidence = "Reference-based estimate (model not trained yet)"

    predicted = round(predicted, 2)
    return {
        "material": ref["material"], "category": ref["category"],
        "unit": unit, "quantity": quantity,
        "reference_rate": reference_rate,
        "predicted_rate": predicted,
        "estimated_value": round(predicted * quantity),
        "currency": "INR",
        "confidence": confidence, "method": method,
        "locality": locality, "quality": quality,
        "model_version": bundle["model_name"] if bundle else None,
        "disclaimer": DISCLAIMER,
    }


def log_transaction(**row) -> None:
    """Append a completed platform transaction — future retraining data."""
    TRANSACTIONS.parent.mkdir(exist_ok=True)
    is_new = not TRANSACTIONS.exists()
    record = {f: row.get(f, "") for f in TRANSACTION_FIELDS}
    record["date"] = record["date"] or dt.datetime.now().isoformat(timespec="seconds")
    with TRANSACTIONS.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=TRANSACTION_FIELDS)
        if is_new:
            writer.writeheader()
        writer.writerow(record)


def analytics() -> dict:
    rows = [r for r in reference_table() if r["price"] > 0]
    by_cat: dict[str, list[float]] = {}
    for r in rows:
        by_cat.setdefault(f"{r['category']} ({r['unit']})", []).append(r["price"])
    return {
        "average_by_category": [
            {"category": k, "average_rate": round(sum(v) / len(v), 1), "items": len(v)}
            for k, v in sorted(by_cat.items())
        ],
        "plastic": [m for m in list_materials("Plastic") if m["buys"]][:8],
        "ewaste": [m for m in list_materials("E-waste") if m["buys"]][:8],
        "note": "Published reference rates, Jaipur. Localities share the city rate list.",
    }


if __name__ == "__main__":
    for args in [
        ("Plastic", "PET Bottle", 8, "kg"),
        ("E-waste", "Laptop", 2, "piece"),
        ("E-waste", "CPU", 5, "kg"),
        ("Plastic", "Packaging Film", 10, "kg"),
    ]:
        r = estimate_value(args[0], args[1], args[2], args[3])
        print(f"{r['material']:<26} {r['quantity']} {r['unit']:<6} "
              f"ref ₹{r['reference_rate']}  est ₹{r['predicted_rate']}/{r['unit']}  "
              f"total ₹{r['estimated_value']}  [{r['confidence']}]")
