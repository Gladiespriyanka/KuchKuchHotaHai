"""Train and honestly evaluate the Smart Scrap Value Estimator.

Compares RandomForestRegressor and GradientBoostingRegressor, keeps the
better one, and writes ml/scrap_price_model.pkl + ml/model_metrics.json.

THREE THINGS THIS SCRIPT REFUSES TO HIDE
  1. `base_reference_price` is NOT given to the model. It is the number the
     synthetic price was generated from, so including it would leak the
     answer and produce a meaningless R^2 near 1.0.
  2. The headline metrics are measured on SYNTHETIC data. They show the
     regressor recovered the generator's rules. They are NOT evidence of
     real-world price accuracy, and the JSON says so in `interpretation`.
  3. An unseen-material check is run deliberately: the model is asked to
     price materials it never saw in training. It does badly. That is the
     honest demonstration that this is a reference-anchored estimator, not a
     general market model.
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "synthetic_scrap_training_data.csv"
MODEL_OUT = ROOT / "ml" / "scrap_price_model.pkl"
METRICS_OUT = ROOT / "ml" / "model_metrics.json"

CATEGORICAL = ["material", "category", "item_type", "locality", "unit", "quality"]
NUMERIC = ["quantity", "days_index"]
TARGET = "price"


def make_pipeline(model):
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
        ("num", "passthrough", NUMERIC),
    ])
    return Pipeline([("pre", pre), ("model", model)])


def scores(y_true, y_pred) -> dict:
    return {
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 3),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 3),
        "r2": round(float(r2_score(y_true, y_pred)), 4),
    }


def main() -> None:
    df = pd.read_csv(DATA)
    X, y = df[CATEGORICAL + NUMERIC], df[TARGET]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    candidates = {
        # Kept deliberately small: 3,330 rows do not need 300 deep trees, and
        # a compact model keeps the repo light.
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=120, min_samples_leaf=4, max_depth=14,
            random_state=42, n_jobs=-1),
        "GradientBoostingRegressor": GradientBoostingRegressor(
            n_estimators=300, learning_rate=0.08, max_depth=3, random_state=42),
    }

    results = {}
    fitted = {}
    for name, model in candidates.items():
        pipe = make_pipeline(model)
        pipe.fit(X_train, y_train)
        pred = pipe.predict(X_test)
        results[name] = scores(y_test, pred)
        fitted[name] = pipe
        print(f"{name:<28} MAE {results[name]['mae']:>8}  "
              f"RMSE {results[name]['rmse']:>8}  R2 {results[name]['r2']}")

    best_name = min(results, key=lambda n: results[n]["rmse"])
    best = fitted[best_name]
    print(f"\nSelected: {best_name}")

    # Per-unit metrics — kg items (₹2-250) and piece items (₹100-3500) live on
    # very different scales, so a single MAE is misleading on its own.
    test = X_test.copy()
    test["y_true"] = y_test.values
    test["y_pred"] = best.predict(X_test)
    per_unit = {
        unit: scores(g["y_true"], g["y_pred"])
        for unit, g in test.groupby("unit")
    }
    print("\nPer unit:")
    for unit, s in per_unit.items():
        print(f"  {unit:<6} MAE {s['mae']:>8}  RMSE {s['rmse']:>8}  R2 {s['r2']}")

    # Honesty check: hold out WHOLE materials, so the model must price
    # something it has never seen. This is expected to be poor.
    gss = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=7)
    tr_idx, te_idx = next(gss.split(X, y, groups=df["material"]))
    cold = make_pipeline(RandomForestRegressor(
        n_estimators=120, min_samples_leaf=4, max_depth=14,
        random_state=42, n_jobs=-1))
    cold.fit(X.iloc[tr_idx], y.iloc[tr_idx])
    cold_scores = scores(y.iloc[te_idx], cold.predict(X.iloc[te_idx]))
    print(f"\nUnseen-material check   MAE {cold_scores['mae']}  "
          f"RMSE {cold_scores['rmse']}  R2 {cold_scores['r2']}")
    print("  (expected to be poor — the estimator is reference-anchored)")

    joblib.dump({
        "pipeline": best,
        "model_name": best_name,
        "features": {"categorical": CATEGORICAL, "numeric": NUMERIC},
    }, MODEL_OUT, compress=3)

    metrics = {
        "model_selected": best_name,
        "trained_on": "data/synthetic_scrap_training_data.csv",
        "training_rows": int(len(df)),
        "real_reference_rates": 37,
        "real_data_source": "https://www.thekabadiwala.com/scrap-rates/Jaipur",
        "features": {"categorical": CATEGORICAL, "numeric": NUMERIC},
        "target": TARGET,
        "comparison": results,
        "selected_metrics_per_unit": per_unit,
        "unseen_material_check": cold_scores,
        "interpretation": (
            "These metrics are measured on SYNTHETIC data generated from 37 real "
            "published reference rates. A high R-squared here means the regressor "
            "recovered the documented generator rules (locality, quality, quantity "
            "and market-drift factors) — it is NOT evidence that the model predicts "
            "real Jaipur market prices. The unseen-material check is deliberately "
            "included and is poor, which shows the estimator is reference-anchored: "
            "it interpolates around known published rates and cannot price a "
            "material it has never seen."
        ),
        "limitations": [
            "One published rate per material; no real historical time series.",
            "Every Jaipur locality page serves identical rates — real locality "
            "variation is unavailable and is MODELLED, not observed.",
            "Rates are a scrap aggregator's published buying prices, not verified "
            "transaction prices.",
            "The model cannot price materials outside the 37 reference items.",
            "Accuracy against real transactions is unmeasured, because no real "
            "transaction data exists yet.",
        ],
        "how_to_improve": (
            "Every completed platform transaction is appended to "
            "data/scrap_transactions.csv. Once enough real rows accumulate, retrain "
            "on those instead of the synthetic set and the metrics become meaningful."
        ),
    }
    METRICS_OUT.write_text(json.dumps(metrics, indent=2))
    print(f"\nSaved {MODEL_OUT.name} and {METRICS_OUT.name}")


if __name__ == "__main__":
    main()
