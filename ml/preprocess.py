"""Clean the collected rates into a training-ready reference table.

Handles, explicitly:
  * duplicates            — same material recorded twice
  * invalid prices        — ₹0/kg means "not currently bought", not "free";
                            kept in the reference table (so the UI can say so)
                            but EXCLUDED from model training
  * unit differences      — kg and piece are never mixed into one target;
                            `unit` is a model feature and predictions are
                            returned per that unit
  * category consistency  — Plastic / E-waste only
  * missing values        — dropped with a printed count, never imputed silently
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RAW = DATA_DIR / "jaipur_scrap_rates.csv"
CLEAN = DATA_DIR / "jaipur_scrap_rates_clean.csv"

VALID_CATEGORIES = {"Plastic", "E-waste"}
VALID_UNITS = {"kg", "piece"}


def load_reference() -> pd.DataFrame:
    if not RAW.exists():
        raise FileNotFoundError(f"{RAW} not found — run ml/collect_data.py first")
    return pd.read_csv(RAW)


def clean(df: pd.DataFrame, verbose: bool = True) -> pd.DataFrame:
    report = {"input": len(df)}

    df = df.dropna(subset=["material", "category", "price", "unit"])
    report["after_missing"] = len(df)

    df = df.drop_duplicates(subset=["material", "city", "locality", "unit"])
    report["after_duplicates"] = len(df)

    df["category"] = df["category"].str.strip()
    df = df[df["category"].isin(VALID_CATEGORIES)]
    report["after_category_filter"] = len(df)

    df["unit"] = df["unit"].str.strip().str.lower().replace({"pcs": "piece", "pc": "piece"})
    df = df[df["unit"].isin(VALID_UNITS)]
    report["after_unit_filter"] = len(df)

    df["price"] = pd.to_numeric(df["price"], errors="coerce")
    df = df.dropna(subset=["price"])
    df = df[df["price"] >= 0]

    # ₹0 = the buyer does not pay for this material. Real information, but it
    # is not a price observation, so it is flagged rather than deleted.
    df["is_priced"] = df["price"] > 0
    report["zero_priced"] = int((~df["is_priced"]).sum())
    report["output"] = len(df)

    if verbose:
        print("Preprocessing report")
        for k, v in report.items():
            print(f"  {k:<24} {v}")
        by_unit = df.groupby("unit")["price"].agg(["count", "min", "max"])
        print("\nPrice ranges per unit (never mixed into one target):")
        print(by_unit.to_string())

    return df.reset_index(drop=True)


def main() -> None:
    df = clean(load_reference())
    df.to_csv(CLEAN, index=False)
    print(f"\nWrote {CLEAN} — {len(df)} rows, "
          f"{int(df['is_priced'].sum())} usable for training")


if __name__ == "__main__":
    main()
