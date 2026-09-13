"""Generate the PROTOTYPE training set from the 37 real reference rates.

WHY THIS EXISTS
    The source publishes one rate per material, with no history and no real
    locality variation. That is 37 usable numbers — nowhere near enough to
    train a market model. Rather than pretend otherwise, we expand the real
    rates with explicitly modelled, documented variation and mark every row
    `synthetic = true`.

WHAT THE VARIATION MEANS
    locality_factor     +/-8%, fixed per locality by a seeded draw. This is an
                        ASSUMPTION. The source shows no locality variation; we
                        model it because a real market plausibly has some.
    quality_factor      clean 1.05 / mixed 1.00 / dirty 0.85 / damaged 0.75
    quantity_factor     small bulk premium above 50 kg or 5 pieces
    market_factor       a bounded random walk over 180 days, sd ~1.5%,
                        de-trended so the most recent day has zero drift

    predicted_price = base_rate x locality x quality x quantity x market

    A model trained on this learns THE GENERATOR ABOVE, not the Jaipur scrap
    market. Its metrics say "the regressor recovered the rules we wrote", not
    "this predicts real prices". train_model.py prints that warning too.
"""
from __future__ import annotations

import datetime as dt
from pathlib import Path

import numpy as np
import pandas as pd

from collect_data import JAIPUR_LOCALITIES
from preprocess import clean, load_reference

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT = DATA_DIR / "synthetic_scrap_training_data.csv"

SEED = 26229
DAYS = 180
ROWS_PER_MATERIAL = 90

QUALITY_FACTOR = {"clean": 1.05, "mixed": 1.00, "dirty": 0.85, "damaged": 0.75}


def build(seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    ref = clean(load_reference(), verbose=False)
    ref = ref[ref["is_priced"]]  # ₹0 materials are not price observations

    # One fixed factor per locality, drawn once — an assumption, not data.
    locality_factor = {loc: float(rng.uniform(0.92, 1.08)) for loc in JAIPUR_LOCALITIES}

    # Bounded random walk for day-to-day market movement, de-trended so the
    # LAST day sits at zero drift. We have no evidence that Jaipur rates have
    # moved, so "today" must estimate to the published rate; otherwise every
    # estimate inherits whatever direction the random walk happened to end in,
    # which would be an artifact presented as information.
    walk = np.cumsum(rng.normal(0, 0.015, DAYS))
    walk = walk - np.linspace(0, walk[-1], DAYS)
    walk = np.clip(walk, -0.18, 0.18)
    start = dt.date.today() - dt.timedelta(days=DAYS - 1)

    rows = []
    for _, item in ref.iterrows():
        for _ in range(ROWS_PER_MATERIAL):
            day = int(rng.integers(0, DAYS))
            locality = str(rng.choice(JAIPUR_LOCALITIES))
            quality = str(rng.choice(list(QUALITY_FACTOR), p=[0.25, 0.45, 0.2, 0.1]))
            if item["unit"] == "kg":
                quantity = float(np.round(rng.uniform(1, 120), 1))
                bulk = 1.04 if quantity > 50 else 1.0
            else:
                quantity = int(rng.integers(1, 12))
                bulk = 1.03 if quantity > 5 else 1.0

            price = (
                float(item["price"])
                * locality_factor[locality]
                * QUALITY_FACTOR[quality]
                * bulk
                * (1 + walk[day])
            )
            rows.append({
                "material": item["material"],
                "category": item["category"],
                "item_type": item["item_type"],
                "locality": locality,
                "unit": item["unit"],
                "quantity": quantity,
                "quality": quality,
                "days_index": day,
                "date": (start + dt.timedelta(days=day)).isoformat(),
                "base_reference_price": float(item["price"]),
                "price": round(price, 2),
                "city": "Jaipur",
                "synthetic": "true",
            })
    return pd.DataFrame(rows)


def main() -> None:
    df = build()
    DATA_DIR.mkdir(exist_ok=True)
    df.to_csv(OUT, index=False)
    print(f"Wrote {OUT}")
    print(f"  rows              {len(df)}  (all synthetic = true)")
    print(f"  materials         {df['material'].nunique()}")
    print(f"  localities        {df['locality'].nunique()}  (modelled, not observed)")
    print(f"  days simulated    {df['days_index'].nunique()}")
    print("  NOTE: derived from 37 real reference rates. Not field data.")


if __name__ == "__main__":
    main()
