"""Collect Jaipur scrap rates for the Smart Scrap Value Estimator.

SOURCE
    https://www.thekabadiwala.com/scrap-rates/Jaipur
    Captured: 2026-08-31

HOW THIS DATA WAS OBTAINED
    The published rate cards on the public Jaipur page (and its locality
    pages) were read and transcribed into the SNAPSHOT table below. No login,
    CAPTCHA or access control was bypassed, and nothing behind an
    authentication wall was touched.

    `--live` re-fetches the page with `requests` if you have network access
    and want to refresh the snapshot; it is optional and off by default so the
    pipeline is reproducible offline.

TWO FINDINGS YOU MUST NOT MISREPRESENT
    1. These are ONE-OFF published rates, not a time series. There is exactly
       one observation per material. No historical prices are available.
    2. Every Jaipur locality page checked (e.g. /jaipur/malviya-nagar) serves
       the IDENTICAL rate list to the city page. There is no real
       locality-level price variation in this source. We therefore record the
       city rate once and mark the localities as sharing it, rather than
       fabricating geographic spread in the real dataset.

    Both facts are why the estimator is a reference-rate system with an ML
    layer on clearly-labelled synthetic data, and not a trained market model.
    See ml/README notes and model_metrics.json.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
from pathlib import Path

SOURCE_URL = "https://www.thekabadiwala.com/scrap-rates/Jaipur"
CAPTURE_DATE = "2026-08-31"
CITY = "Jaipur"

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Localities listed on the Jaipur page. Verified: they serve the same rates.
JAIPUR_LOCALITIES = [
    "Malviya Nagar", "Vaishali Nagar", "Mansarovar", "C-Scheme", "Raja Park",
    "Adarsh Nagar", "Tonk Road", "Shyam Nagar", "Civil Lines", "Sodala",
    "Nirman Nagar", "Gopalpura", "Durgapura", "Barkat Nagar", "Mahesh Nagar",
    "MI Road", "Chandpole", "Hasanpura", "Patrakar Colony", "Model Town",
    "Airport Area", "Ramnagariya",
]

# (material, category, item_type, price, unit) exactly as published.
# Only Plastic and E-waste are taken; paper and metals are out of scope for
# this module, as instructed.
SNAPSHOT = [
    # ---- Plastic -------------------------------------------------------
    ("Mix Plastic", "Plastic", "mixed", 7, "kg"),
    ("Soft Plastic", "Plastic", "soft", 10, "kg"),
    ("Hard Plastic", "Plastic", "hard", 5, "kg"),
    ("PET Bottle", "Plastic", "bottle", 20, "kg"),
    ("Plastic Jar (5 Litre)", "Plastic", "jar", 10, "kg"),
    ("Plastic Jar (15 Litre)", "Plastic", "jar", 10, "kg"),
    ("Plastic Can (20 Litre)", "Plastic", "can", 10, "kg"),
    ("Plastic Can (25 Litre)", "Plastic", "can", 15, "kg"),
    ("Plastic Can (50 Litre)", "Plastic", "can", 14, "kg"),
    ("Plastic Drum (200 Litre)", "Plastic", "drum", 10, "kg"),
    ("PVC Pipe", "Plastic", "pipe", 10, "kg"),
    ("Polythene Bags (LD)", "Plastic", "film", 10, "kg"),
    ("Polythene Bags (HM)", "Plastic", "film", 10, "kg"),
    ("Plastic (PP) Bags", "Plastic", "film", 10, "kg"),
    ("Water Tank (Sintex)", "Plastic", "tank", 15, "kg"),
    ("Cooler (Plastic/Fibre)", "Plastic", "appliance body", 8, "kg"),
    ("Fibre", "Plastic", "fibre", 5, "kg"),
    ("Packaging Film", "Plastic", "film", 0, "kg"),
    ("Milk Covers", "Plastic", "film", 0, "kg"),
    # ---- E-waste -------------------------------------------------------
    ("E-waste", "E-waste", "mixed", 10, "kg"),
    ("CPU", "E-waste", "computer", 250, "kg"),
    ("Printer", "E-waste", "peripheral", 10, "kg"),
    ("Microwave", "E-waste", "appliance", 15, "kg"),
    ("Geyser", "E-waste", "appliance", 15, "kg"),
    ("Alkaline Battery (Cell)", "E-waste", "battery", 2, "kg"),
    ("Inverter Battery", "E-waste", "battery", 90, "kg"),
    ("Laptop", "E-waste", "computer", 200, "piece"),
    ("Television (LCD/LED)", "E-waste", "display", 100, "piece"),
    ("Television (CRT)", "E-waste", "display", 150, "piece"),
    ("Monitor (LCD/LED)", "E-waste", "display", 100, "piece"),
    ("Monitor (CRT)", "E-waste", "display", 100, "piece"),
    ("UPS (with battery)", "E-waste", "power", 300, "piece"),
    ("UPS (without battery)", "E-waste", "power", 150, "piece"),
    ("Washing machine", "E-waste", "appliance", 500, "piece"),
    ("Refrigerator (Single Door)", "E-waste", "appliance", 800, "piece"),
    ("Refrigerator (Double Door)", "E-waste", "appliance", 1200, "piece"),
    ("AC (1 ton)", "E-waste", "appliance", 3000, "piece"),
    ("AC (1.5 ton)", "E-waste", "appliance", 3200, "piece"),
    ("AC (2 Ton)", "E-waste", "appliance", 3500, "piece"),
]

FIELDS = [
    "material", "category", "item_type", "price", "unit", "city", "locality",
    "source", "source_url", "collection_date", "synthetic",
]


def fetch_live(url: str = SOURCE_URL) -> list[tuple] | None:
    """Optional live refresh. Returns None if the page cannot be parsed."""
    try:
        import requests  # optional dependency
    except ImportError:
        print("requests is not installed — using the stored snapshot.")
        return None
    try:
        html = requests.get(url, timeout=20, headers={
            "User-Agent": "KabadiwalaConnect-student-project/1.0"
        }).text
    except Exception as exc:  # noqa: BLE001
        print(f"Live fetch failed ({exc}) — using the stored snapshot.")
        return None

    # The cards render as: <h3>Material</h3> ... ₹<price>/<unit>
    pattern = re.compile(r">([^<>]{2,60}?)</h3>\s*.{0,400}?₹\s*(\d+)\s*/\s*(kg|pcs)", re.S | re.I)
    found = [(m.group(1).strip(), int(m.group(2)),
              "piece" if m.group(3).lower() == "pcs" else "kg")
             for m in pattern.finditer(html)]
    if len(found) < 10:
        print("Live page layout not recognised — using the stored snapshot.")
        return None

    known = {row[0].lower(): row for row in SNAPSHOT}
    rows = []
    for name, price, unit in found:
        base = known.get(name.lower())
        if not base:
            continue  # out of scope (paper, metals, vehicles)
        rows.append((base[0], base[1], base[2], price, unit))
    print(f"Live fetch OK — {len(rows)} in-scope materials refreshed.")
    return rows or None


def build_rows(snapshot: list[tuple]) -> list[dict]:
    today = dt.date.today().isoformat()
    rows = []
    for material, category, item_type, price, unit in snapshot:
        rows.append({
            "material": material,
            "category": category,
            "item_type": item_type,
            "price": price,
            "unit": unit,
            "city": CITY,
            # City-wide rate. Locality pages publish the same numbers, so a
            # single "Jaipur (all localities)" row is the truthful record.
            "locality": "Jaipur (all localities)",
            "source": "thekabadiwala.com published rate card",
            "source_url": SOURCE_URL,
            "collection_date": CAPTURE_DATE if snapshot is SNAPSHOT else today,
            "synthetic": "false",
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true",
                        help="try to re-fetch the page instead of using the snapshot")
    args = parser.parse_args()

    snapshot = (fetch_live() if args.live else None) or SNAPSHOT
    rows = build_rows(snapshot)

    DATA_DIR.mkdir(exist_ok=True)
    out = DATA_DIR / "jaipur_scrap_rates.csv"
    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    plastic = sum(1 for r in rows if r["category"] == "Plastic")
    ewaste = len(rows) - plastic
    print(f"Wrote {out} — {len(rows)} records ({plastic} plastic, {ewaste} e-waste)")
    print(f"Localities on the source page: {len(JAIPUR_LOCALITIES)} "
          f"(verified to share the city rate list — no locality variation)")


if __name__ == "__main__":
    main()
