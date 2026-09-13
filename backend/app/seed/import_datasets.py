"""Import the supplied structured datasets into the application database.

    data/seed/*.csv  ->  SQLAlchemy models  ->  existing API  ->  existing UI

This REPLACES the small hand-written demo seed for anyone who wants the full
dataset. `app/seed/seed.py` still exists and still works; this importer is the
route that satisfies the problem statement's dataset requirements.

Design notes
------------
* The supplied taxonomy is treated as canonical. It carries material_code,
  sub-category, hazard and critical-material yields, which the old 8-value
  enum did not.
* Collector logins are synthesised as <collector_id>@demo.com / password123 so
  every one of the 400 collectors is reachable, and the demo accounts
  (collector@demo.com, recycler@demo.com, admin@demo.com) are mapped onto the
  collector and recycler named in demo_scenario.json.
* price_history is imported from a cut-off date by default (PRICE_HISTORY_DAYS)
  — 122,808 rows import fine but make the seed slow for no demo benefit. Pass
  --full-history to load all of it.
* Nothing here invents data. Every value written comes from the CSVs, and rows
  the CSVs mark synthetic stay marked synthetic.

Run:  python -m app.seed.import_datasets [--full-history] [--limit-lots N]
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

from ..database import Base, SessionLocal, engine
from ..models import (
    Collector, Handover, Lot, LotEvent, Material, Payment, Price, Recycler,
    Transaction, User,
)
from ..services.security import hash_password

SEED_DIR = Path(__file__).resolve().parents[3] / "data" / "seed"
PRICE_HISTORY_DAYS = 365
DEFAULT_PASSWORD = "password123"

# The app's original 8-value enum -> the dataset's 7 canonical categories.
# Kept so existing lots, matching and the classifier keep working.
LEGACY_CATEGORY_MAP = {
    "PCB": "PCB",
    "Cable": "Cable",
    "Battery": "Battery",
    "LCD": "LCD/LED panel",
    "CRT": "CRT",
    "Motor": "Motor & magnet-bearing",
    "Magnet-bearing Assembly": "Motor & magnet-bearing",
    "Mixed Plastic": "Mixed plastic",
}

CATEGORY_ICON = {
    "PCB": "🔌", "Cable": "🔗", "Battery": "🔋", "LCD/LED panel": "🖥️",
    "CRT": "📺", "Motor & magnet-bearing": "⚙️", "Mixed plastic": "♻️",
}

# recyclers.csv authorisation_status -> the app's approved/pending/rejected.
# Only `active` and `expiring_soon` may be recommended to a collector.
AUTH_STATUS_MAP = {
    "active": "approved",
    "expiring_soon": "approved",
    "expired": "rejected",
    "suspended": "rejected",
}


def read(name: str) -> list[dict]:
    path = SEED_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"{path} missing — unzip the dataset into data/seed/")
    with path.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def num(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def ts(value, default=None):
    if not value:
        return default
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return default


def truthy(value) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes"}


def city_centroids(recyclers: list[dict]) -> dict[str, tuple[float, float]]:
    """Approximate coordinates for each city, averaged from its facilities.

    collectors.csv carries `home_city` but NO latitude/longitude. Writing 0,0
    put every collector in the Gulf of Guinea, so distance-based recycler
    matching filtered out every authorised facility. A city centroid is an
    honest stand-in until the device supplies real GPS, and lot creation
    overwrites it with the device fix when one is available.
    """
    acc: dict[str, list[tuple[float, float]]] = {}
    for r in recyclers:
        try:
            acc.setdefault(r["city"], []).append((float(r["lat"]), float(r["lng"])))
        except (KeyError, TypeError, ValueError):
            continue
    return {
        city: (sum(a for a, _ in pts) / len(pts), sum(b for _, b in pts) / len(pts))
        for city, pts in acc.items() if pts
    }


def run(full_history: bool = False, limit_lots: int | None = None) -> None:
    print(f"Importing datasets from {SEED_DIR}")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    scenario = json.loads((SEED_DIR / "demo_scenario.json").read_text())
    demo_collector_id = scenario["collector"]["collector_id"]
    demo_recycler_id = scenario["recycler"]["recycler_id"]

    # ---------------------------------------------------------- materials
    taxonomy = read("material_taxonomy.csv")
    for row in taxonomy:
        critical = {
            k.replace("_g_per_kg", ""): num(v)
            for k, v in row.items() if k.endswith("_g_per_kg") and num(v) > 0
        }
        db.add(Material(
            material_code=row["material_code"],
            category=row["material_category"],
            subcategory=row["sub_category"],
            description=f"{row['material_category']} — {row['sub_category']}",
            hazard_note=row.get("informal_processing_risk", ""),
            primary_hazard=row.get("primary_hazard", ""),
            informal_processing_risk=row.get("informal_processing_risk", ""),
            base_informal_rate=num(row["base_informal_rate_inr_per_kg"]),
            formal_premium_pct=num(row["formal_premium_pct"]),
            critical_materials=critical,
            icon=CATEGORY_ICON.get(row["material_category"], "♻️"),
            unit=row.get("unit", "kg"),
        ))
    db.flush()
    print(f"  materials          {len(taxonomy)}")

    # ---------------------------------------------------------- collectors
    collectors = read("collectors.csv")
    centroids = city_centroids(read("recyclers.csv"))
    earnings = {r["collector_id"]: r for r in read("collector_earnings.csv")}
    col_by_ext: dict[str, Collector] = {}
    for i, row in enumerate(collectors):
        ext = row["collector_id"]
        is_demo = ext == demo_collector_id
        email = "collector@demo.com" if is_demo else f"{ext.lower()}@demo.com"
        user = User(
            email=email, password_hash=hash_password(DEFAULT_PASSWORD),
            role="collector", name=row["display_name"],
            language=row.get("preferred_language", "hi"),
        )
        db.add(user)
        db.flush()
        areas = (row.get("operating_areas") or "").split("|")
        lat, lng = centroids.get(row["home_city"], (0.0, 0.0))
        collector = Collector(
            user_id=user.id, display_name=row["display_name"],
            language=row.get("preferred_language", "hi"),
            operating_location=f"{areas[0]}, {row['home_city']}" if areas[0] else row["home_city"],
            latitude=lat, longitude=lng,
            created_at=ts(row.get("joined_on"), datetime.utcnow()),
        )
        db.add(collector)
        db.flush()
        col_by_ext[ext] = collector
    print(f"  collectors         {len(collectors)}  (demo collector = {demo_collector_id})")

    # ----------------------------------------------------------- recyclers
    recyclers = read("recyclers.csv")
    rec_by_ext: dict[str, Recycler] = {}
    for row in recyclers:
        ext = row["recycler_id"]
        is_demo = ext == demo_recycler_id
        user_id = None
        if is_demo:
            u = User(email="recycler@demo.com", password_hash=hash_password(DEFAULT_PASSWORD),
                     role="recycler", name=row["name"], language="mr")
            db.add(u)
            db.flush()
            user_id = u.id
        accepted = [m for m in (row.get("materials_accepted") or "").split("|") if m]
        # offered_rate = taxonomy base rate x this facility's multiplier
        mult = num(row.get("offered_rate_multiplier"), 1.0)
        rates = {}
        for t in taxonomy:
            if t["material_category"] in accepted:
                formal = num(t["base_informal_rate_inr_per_kg"]) * (
                    1 + num(t["formal_premium_pct"]) / 100)
                rates.setdefault(t["material_category"], round(formal * mult, 2))
        rec = Recycler(
            user_id=user_id, name=row["name"], external_id=ext,
            location=f"{row.get('industrial_estate', '')}, {row['city']}".strip(", "),
            city=row["city"], industrial_estate=row.get("industrial_estate", ""),
            latitude=num(row["lat"]), longitude=num(row["lng"]),
            accepted_materials=accepted,
            authorization_id=row.get("cpcb_registration_no", ""),
            authorization_status=AUTH_STATUS_MAP.get(row.get("authorisation_status"), "pending"),
            facility_type=row.get("facility_type", ""),
            authorisation_valid_till=row.get("authorisation_valid_till", ""),
            contact=row.get("contact_phone", ""), offered_rate=rates,
            pickup_available=truthy(row.get("pickup_available")),
            service_area_km=num(row.get("service_area_radius_km"), 20),
            offered_rate_multiplier=mult,
            min_lot_weight_kg=num(row.get("min_lot_weight_kg")),
            avg_settlement_hours=num(row.get("avg_settlement_hours"), 24),
            capacity_tonnes_per_month=num(row.get("capacity_tonnes_per_month")),
            rating=num(row.get("rating"), 4.0),
            documents_note=f"CPCB {row.get('cpcb_registration_no', '')} · "
                           f"{row.get('authorisation_status', '')} · valid to "
                           f"{row.get('authorisation_valid_till', '')}",
        )
        db.add(rec)
        db.flush()
        rec_by_ext[ext] = rec
    approved = sum(1 for r in recyclers if AUTH_STATUS_MAP.get(r["authorisation_status"]) == "approved")
    print(f"  recyclers          {len(recyclers)}  ({approved} recommendable, "
          f"{len(recyclers) - approved} expired/suspended)")

    # -------------------------------------------------------- price board
    board = read("price_board_current.csv")
    as_of = ts(board[0]["as_of_date"], datetime.utcnow()) if board else datetime.utcnow()
    price_rows = []
    for row in board:
        price_rows.append({
            "material_category": row["material_category"],
            "material_code": row["material_code"],
            "sub_category": row["sub_category"],
            "city": row["city"], "location": row["city"],
            "date": as_of,
            "buying_price": num(row["buying_price_informal"]),
            "selling_price": num(row["quoted_price_formal"]),
            "market_range_low": num(row["market_range_low"]),
            "market_range_high": num(row["market_range_high"]),
            "unit": row.get("unit", "kg"), "recycler_id": None,
            "source": "price_board_current",
        })

    # ------------------------------------------------------ price history
    cutoff = (as_of - timedelta(days=PRICE_HISTORY_DAYS)).date().isoformat()
    kept = 0
    for row in read("price_history.csv"):
        if not full_history and row["date"] < cutoff:
            continue
        bench = rec_by_ext.get(row.get("benchmark_recycler_id"))
        price_rows.append({
            "material_category": row["material_category"],
            "material_code": row["material_code"],
            "sub_category": row["sub_category"],
            "city": row["city"], "location": row["city"],
            "date": ts(row["date"], as_of),
            "buying_price": num(row["buying_price_informal"]),
            "selling_price": num(row["quoted_price_formal"]),
            "market_range_low": num(row["market_range_low"]),
            "market_range_high": num(row["market_range_high"]),
            "unit": row.get("unit", "kg"),
            "recycler_id": bench.recycler_id if bench else None,
            "source": row.get("source", "price_history"),
        })
        kept += 1
    db.bulk_insert_mappings(Price, price_rows)
    db.flush()
    print(f"  prices             {len(price_rows)}  ({len(board)} board + {kept} history"
          f"{'' if full_history else f', last {PRICE_HISTORY_DAYS} days'})")

    # ---------------------------------------------------------------- lots
    lots = read("lots.csv")
    if limit_lots:
        lots = lots[-limit_lots:]
    lot_by_ext: dict[str, str] = {}
    lot_rows, event_rows = [], []
    tax_by_code = {t["material_code"]: t for t in taxonomy}
    for row in lots:
        collector = col_by_ext.get(row["collector_id"])
        if not collector:
            continue
        created = ts(row["created_at"], datetime.utcnow())
        lot_id = f"KC-{created.year}-{row['lot_id'][3:]}"
        lot_by_ext[row["lot_id"]] = lot_id
        lot_rows.append({
            "lot_id": lot_id, "collector_id": collector.collector_id,
            "material_category": row["material_category"],
            "material_code": row["material_code"],
            "sub_category": row["sub_category"],
            "description": row.get("description_voice_transcript", ""),
            "voice_transcript": row.get("description_voice_transcript", ""),
            "input_method": row.get("input_method", "photo"),
            "created_offline": truthy(row.get("created_offline")),
            "photo": "", "weight": num(row["weight_kg"]),
            "condition": (row.get("condition") or "intact").lower(),
            "source_type": (row.get("source_type") or "household").lower(),
            "estimated_min": num(row["estimated_value_informal"]),
            "estimated_max": num(row["estimated_value_formal"]),
            "quoted_price": 0.0,
            "ai_prediction": {
                "category": row.get("predicted_category"),
                "confidence": num(row.get("prediction_confidence")),
                "accepted_by_user": truthy(row.get("prediction_accepted_by_user")),
            },
            "location": f"{row.get('collection_area', '')}, {row['collection_city']}".strip(", "),
            "city": row["collection_city"],
            "latitude": num(row["collection_lat"]), "longitude": num(row["collection_lng"]),
            "recycler_id": None, "match_score": 0.0,
            "status": "PRICE_ESTIMATED", "client_ref": row["lot_id"],
            "created_at": created, "updated_at": created,
        })
        event_rows.append({
            "lot_id": lot_id, "status": "LOT_CREATED",
            "note": f"{row['weight_kg']} kg {row['material_category']} "
                    f"({row.get('input_method', 'photo')})",
            "actor": collector.display_name, "created_at": created,
        })
    db.bulk_insert_mappings(Lot, lot_rows)
    db.flush()
    print(f"  lots               {len(lot_rows)}")

    # ------------------------------------------------------- transactions
    txns = read("transactions.csv")
    trace = {r["txn_id"]: r for r in read("traceability.csv")}
    lot_lookup = {l["lot_id"]: l for l in lot_rows}
    lot_status: dict[str, str] = {}
    txn_rows, handover_rows, payment_rows = [], [], []
    txn_seq = 0
    for row in txns:
        lot_id = lot_by_ext.get(row["lot_id"])
        collector = col_by_ext.get(row["collector_id"])
        rec = rec_by_ext.get(row["recycler_id"])
        if not (lot_id and collector and rec):
            continue
        txn_seq += 1
        quoted_at = ts(row.get("quoted_at"), datetime.utcnow())
        handed = ts(row.get("handed_over_at"))
        confirmed = ts(row.get("confirmed_at"))
        settled = ts(row.get("settled_at"))
        status = row["txn_status"]
        pay = row["payment_status"]

        app_status = {
            "quoted": "RECYCLER_MATCHED", "matched": "RECYCLER_MATCHED",
            "handed_over": "HANDED_OVER", "confirmed": "HANDED_OVER",
            "settled": "COMPLETED", "cancelled": "CANCELLED",
        }.get(status, "RECYCLER_MATCHED")
        lot_state = {
            "quoted": "HANDOVER_PENDING", "matched": "HANDOVER_PENDING",
            "handed_over": "PAYMENT_PENDING", "confirmed": "PAYMENT_PENDING",
            "settled": "COMPLETED", "cancelled": "PRICE_ESTIMATED",
        }.get(status, "HANDOVER_PENDING")
        lot_status[lot_id] = lot_state

        txn_rows.append({
            "transaction_id": txn_seq, "external_id": row["txn_id"], "lot_id": lot_id,
            "collector_id": collector.collector_id, "recycler_id": rec.recycler_id,
            "quoted_price": num(row["quoted_price"]),
            "final_price": num(row["final_price"]),
            "declared_weight": num(row["weight_kg"]),
            "final_weight": num(row["weight_verified_kg"]),
            "collection_location": row["collection_city"],
            "handover_location": rec.location,
            "payment_status": "PAID" if pay == "paid" else pay.upper(),
            "transaction_status": app_status,
            "anomaly_flag": truthy(row.get("is_anomaly")),
            "anomaly_type": row.get("anomaly_type", ""),
            "anomaly_reason": (f"Dataset flag: {row.get('anomaly_type')}"
                               if truthy(row.get("is_anomaly")) else ""),
            "created_at": quoted_at, "updated_at": settled or confirmed or handed or quoted_at,
        })

        if lot_id in lot_lookup:
            lot_lookup[lot_id]["recycler_id"] = rec.recycler_id
            lot_lookup[lot_id]["quoted_price"] = num(row["quoted_price"])

        t = trace.get(row["txn_id"])
        if t and handed:
            handover_rows.append({
                "reference_number": t["handover_ref"], "lot_id": lot_id,
                "transaction_id": txn_seq, "photo": "",
                "scale_photo": "", "weight": num(t["weight_kg"]),
                "gps_location": f"{t['gps_lat']},{t['gps_lng']}",
                "gps_accuracy_m": num(t.get("gps_accuracy_m")),
                "captured_offline": truthy(t.get("device_offline_at_capture")),
                "synced_at": ts(t.get("synced_at")),
                "confirmation_method": t.get("confirmation_method", "qr_scan"),
                "downstream_status": t.get("downstream_status", ""),
                "epr_credit_reference": t.get("epr_credit_reference", ""),
                "recycler_confirmation": bool(confirmed),
                "status": "VERIFIED" if confirmed else "PENDING",
                "timestamp": ts(t.get("captured_at"), handed),
            })
        if pay == "paid" and settled:
            payment_rows.append({
                "transaction_id": txn_seq, "amount": num(row["final_price"]),
                "mode": row.get("payment_mode", "cash"), "status": "PAID",
                "timestamp": settled,
            })

    db.bulk_insert_mappings(Transaction, txn_rows)
    db.bulk_insert_mappings(Handover, handover_rows)
    db.bulk_insert_mappings(Payment, payment_rows)
    db.flush()

    # apply the lot status / recycler assignment worked out above
    for lot_id, state in lot_status.items():
        if lot_id in lot_lookup:
            lot_lookup[lot_id]["status"] = state
    db.bulk_update_mappings(Lot, [
        {"lot_id": l["lot_id"], "status": l["status"],
         "recycler_id": l["recycler_id"], "quoted_price": l["quoted_price"]}
        for l in lot_rows if l["lot_id"] in lot_status
    ]) if False else None
    for lot_id, state in lot_status.items():
        db.query(Lot).filter(Lot.lot_id == lot_id).update(
            {"status": state,
             "recycler_id": lot_lookup[lot_id]["recycler_id"],
             "quoted_price": lot_lookup[lot_id]["quoted_price"]},
            synchronize_session=False)

    db.bulk_insert_mappings(LotEvent, event_rows)

    # ------------------------------------------------------------- admin
    db.add(User(email="admin@demo.com", password_hash=hash_password(DEFAULT_PASSWORD),
                role="admin", name="Platform Admin", language="en"))
    db.commit()

    anomalies = sum(1 for t in txn_rows if t["anomaly_flag"])
    print(f"  transactions       {len(txn_rows)}  ({anomalies} flagged as anomalies)")
    print(f"  handovers          {len(handover_rows)}")
    print(f"  payments           {len(payment_rows)}")
    print("\nDemo logins (password123):")
    print(f"  collector@demo.com  ->  {scenario['collector']['display_name']} "
          f"({scenario['collector']['home_city']}, {scenario['collector']['preferred_language']})")
    print(f"  recycler@demo.com   ->  {scenario['recycler']['name']}")
    print("  admin@demo.com")
    print("\nAll records originate from data/seed/*.csv. The generator marks this "
          "data synthetic and calibrated to published ranges — not audited market data.")
    db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--full-history", action="store_true",
                    help="import all 122,808 price rows instead of the last year")
    ap.add_argument("--limit-lots", type=int, default=None,
                    help="import only the most recent N lots (faster)")
    args = ap.parse_args()
    run(full_history=args.full_history, limit_lots=args.limit_lots)


if __name__ == "__main__":
    sys.exit(main())
