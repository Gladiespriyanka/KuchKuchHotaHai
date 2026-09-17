"""Deterministic synthetic dataset builder for Kabadiwala Connect (SIH PS 26229).

Run:  python -m gen.build --out /path/to/seed
Re-running with the same seed produces byte-identical files.
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from gen.config import (
    SEED, END_DATE, MONTHS_HISTORY, TAXONOMY, WEIGHT_DIST, BATCH_LAMBDA, CATEGORY_MIX, CITIES,
    FIRST_M, FIRST_F, SURNAMES, RECYCLER_PREFIX, RECYCLER_MID, RECYCLER_SUFFIX,
    VOICE_TEMPLATES, SOURCE_TYPES, SOURCE_WEIGHTS, CONDITIONS, CONDITION_WEIGHTS,
    CLASSIFIER_ACCURACY,
)

rng = np.random.default_rng(SEED)

END = datetime.fromisoformat(END_DATE)
START = END - timedelta(days=int(MONTHS_HISTORY * 30.44))
DATES = pd.date_range(START, END, freq="D")
NDAYS = len(DATES)

REF_ALPHABET = "ACDEFHJKLMNPRTUVWXY34679"  # no visually confusable chars

CRITICALS = ["lithium", "cobalt", "neodymium", "tantalum", "gallium", "indium"]

# family a sub-category's price tracks
FAMILY = {
    "Cable": "copper", "Motor & magnet-bearing": "copper",
    "PCB": "precious", "Battery": "battery",
    "Mixed plastic": "polymer", "LCD/LED panel": "indium",
    "CRT": "glass",
}


def jitter(lat, lng, km):
    """Offset a coordinate by up to `km` kilometres."""
    r = rng.uniform(0, km) / 111.0
    th = rng.uniform(0, 2 * np.pi)
    return round(lat + r * np.cos(th), 6), round(lng + r * np.sin(th) / np.cos(np.radians(lat)), 6)


def haversine(a_lat, a_lng, b_lat, b_lng):
    p = np.pi / 180
    h = (0.5 - np.cos((b_lat - a_lat) * p) / 2
         + np.cos(a_lat * p) * np.cos(b_lat * p) * (1 - np.cos((b_lng - a_lng) * p)) / 2)
    return round(12742 * np.arcsin(np.sqrt(h)), 2)


_USED_REFS = set()


def ref_code():
    """Human-speakable, collision-free handover reference."""
    while True:
        c = "KC-" + "".join(rng.choice(list(REF_ALPHABET), 6))
        if c not in _USED_REFS:
            _USED_REFS.add(c)
            return c


# =====================================================================
# 1. Material taxonomy
# =====================================================================
def build_taxonomy():
    rows = []
    for cat, sub, code, base, prem, vol, hazard, crit in TAXONOMY:
        row = {
            "material_code": code,
            "material_category": cat,
            "sub_category": sub,
            "unit": "kg",
            "base_informal_rate_inr_per_kg": base,
            "formal_premium_pct": round(prem * 100, 1),
            "price_volatility": vol,
            "price_family": FAMILY[cat],
            "primary_hazard": hazard,
            "informal_processing_risk": {
                "leaded_glass": "CRT implosion + lead dust when tube is broken open",
                "mercury_backlight": "mercury vapour when CCFL backlight is snapped",
                "solder_lead": "lead fume from open desoldering; acid leaching of gold",
                "pvc_burn_risk": "dioxins from open-air cable burning",
                "fire_puncture": "thermal runaway / fire when pack is punctured",
                "acid_lead": "sulphuric acid burns, lead exposure",
                "brominated_fr": "brominated flame retardant fumes when melted",
                "none": "low direct hazard",
            }[hazard],
        }
        for c in CRITICALS:
            row[f"{c}_g_per_kg"] = crit.get(c, 0.0)
        row["critical_materials_lost_informal"] = ";".join(crit.keys()) or "none"
        rows.append(row)
    return pd.DataFrame(rows)


# =====================================================================
# 2. Commodity index series (drives the price dataset)
# =====================================================================
def build_indices():
    """One index series per price family: drift + AR(1) noise + two corrections."""
    idx = {}
    specs = {
        "copper":   (0.00022, 0.011, 0.72),
        "precious": (0.00028, 0.014, 0.70),
        "battery":  (-0.00010, 0.016, 0.75),   # cobalt softened over the window
        "polymer":  (0.00008, 0.009, 0.68),
        "indium":   (0.00015, 0.012, 0.66),
        "glass":    (0.00002, 0.005, 0.80),
    }
    # two market-wide corrections everyone can point at on the chart
    shock_days = [int(NDAYS * 0.34), int(NDAYS * 0.71)]
    for fam, (drift, sigma, phi) in specs.items():
        e = rng.normal(0, sigma, NDAYS)
        ar = np.zeros(NDAYS)
        for t in range(1, NDAYS):
            ar[t] = phi * ar[t - 1] + e[t]
        series = np.exp(np.cumsum(np.full(NDAYS, drift)) + ar)
        for d, depth in zip(shock_days, [-0.09, -0.06]):
            fall = 18
            recover = 55
            series[d:d + fall] *= np.linspace(1, 1 + depth, fall)
            end = min(NDAYS, d + fall + recover)
            series[d + fall:end] *= np.linspace(1 + depth, 1 + depth * 0.25, end - d - fall)
            series[end:] *= (1 + depth * 0.25)
        idx[fam] = series / series[0]
    return idx


def seasonal_factor(dates):
    m = dates.month.values
    f = np.ones(len(dates))
    f[np.isin(m, [10, 11])] *= 1.06      # Diwali clear-out surge
    f[np.isin(m, [6, 7, 8])] *= 0.96     # monsoon: collection drops, rates soften
    f[np.isin(m, [3, 4])] *= 1.02        # year-end office disposal
    return f


# =====================================================================
# 3. Recyclers
# =====================================================================
def build_recyclers():
    rows = []
    used = set()
    n = 75
    city_names = list(CITIES)
    city_w = np.array([CITIES[c]["weight"] for c in city_names])
    city_w = city_w / city_w.sum()
    picks = rng.choice(len(city_names), size=n, p=city_w)

    for i in range(n):
        city = city_names[picks[i]]
        cfg = CITIES[city]
        while True:
            name = f"{rng.choice(RECYCLER_PREFIX)} {rng.choice(RECYCLER_MID)} {rng.choice(RECYCLER_SUFFIX)}"
            if name not in used:
                used.add(name)
                break
        est_name, est_lat, est_lng = cfg["industrial"][rng.integers(len(cfg["industrial"]))]
        lat, lng = jitter(est_lat, est_lng, 4.5)

        facility_type = "authorised_recycler" if i % 5 != 4 else "authorised_dismantler"
        if rng.random() < 0.40:
            facility_type = "authorised_aggregator"

        u = rng.random()
        if u < 0.70:
            status, valid_days = "active", int(rng.integers(150, 900))
        elif u < 0.85:
            status, valid_days = "expiring_soon", int(rng.integers(5, 90))
        elif u < 0.95:
            status, valid_days = "expired", -int(rng.integers(10, 420))
        else:
            status, valid_days = "suspended", int(rng.integers(30, 400))

        cats = list(CATEGORY_MIX)
        k = int(rng.integers(3, 8))
        accepts = sorted(rng.choice(cats, size=k, replace=False).tolist())

        rows.append({
            "recycler_id": f"REC{1000 + i}",
            "name": name,
            "facility_type": facility_type,
            "city": city,
            "industrial_estate": est_name,
            "lat": lat, "lng": lng,
            "materials_accepted": "|".join(accepts),
            "cpcb_registration_no": f"MH/EW/{rng.integers(2019, 2026)}/{rng.integers(1000, 9999)}",
            "authorisation_status": status,
            "authorisation_valid_till": (END + timedelta(days=valid_days)).date().isoformat(),
            "contact_phone": f"+91-9{rng.integers(100000000, 999999999)}",
            "offered_rate_multiplier": round(float(rng.normal(1.0, 0.045)), 3),
            "pickup_available": bool(rng.random() < 0.55),
            "min_lot_weight_kg": int(rng.choice([0, 0, 5, 10, 25, 50])),
            "service_area_radius_km": int(rng.choice([8, 12, 15, 20, 25, 35, 50])),
            "avg_settlement_hours": int(rng.choice([2, 6, 12, 24, 24, 48, 72])),
            "rating": round(float(np.clip(rng.normal(4.1, 0.45), 2.5, 5.0)), 1),
            "capacity_tonnes_per_month": int(rng.choice([20, 50, 80, 120, 200, 350, 500])),
            "verified_on": (END - timedelta(days=int(rng.integers(20, 600)))).date().isoformat(),
            "is_synthetic": True,
        })
    return pd.DataFrame(rows)


# =====================================================================
# 4. Prices  (daily, per sub-category, per city)
# =====================================================================
def build_prices(recyclers):
    idx = build_indices()
    seas = seasonal_factor(DATES)
    date_str = DATES.strftime("%Y-%m-%d").values

    # one benchmark recycler per city (used as the quoting reference)
    bench = {}
    for city in CITIES:
        pool = recyclers[(recyclers.city == city)
                         & (recyclers.authorisation_status.isin(["active", "expiring_soon"]))]
        bench[city] = pool.recycler_id.iloc[0] if len(pool) else recyclers.recycler_id.iloc[0]

    frames = []
    pid = 0
    for cat, sub, code, base, prem, vol, _hz, _cr in TAXONOMY:
        fam = idx[FAMILY[cat]]
        for city, cfg in CITIES.items():
            noise = rng.normal(1.0, vol * 0.30, NDAYS)
            informal = base * cfg["mult"] * fam * seas * noise
            informal = np.round(np.maximum(informal, base * 0.35), 2)
            # formal premium widens slightly when the commodity index is high
            prem_t = prem * (0.92 + 0.16 * (fam / fam.mean()))
            formal = np.round(informal * (1 + prem_t), 2)
            spread_pct = np.round((formal / informal - 1) * 100, 2)
            frames.append(pd.DataFrame({
                "price_id": [f"PRC{pid + j:07d}" for j in range(NDAYS)],
                "date": date_str,
                "material_code": code,
                "material_category": cat,
                "sub_category": sub,
                "city": city,
                "unit": "kg",
                "buying_price_informal": informal,
                "quoted_price_formal": formal,
                "spread_pct": spread_pct,
                "market_range_low": np.round(informal * 0.90, 2),
                "market_range_high": np.round(formal * 1.08, 2),
                "benchmark_recycler_id": bench[city],
                "source": "synthetic_calibrated",
            }))
            pid += NDAYS
    df = pd.concat(frames, ignore_index=True)
    return df.sort_values(["date", "material_code", "city"], ignore_index=True)


def build_price_board(prices):
    """Latest snapshot + 7/30-day trend, i.e. what the collector price board shows."""
    last = prices.date.max()
    d7 = (pd.to_datetime(last) - timedelta(days=7)).date().isoformat()
    d30 = (pd.to_datetime(last) - timedelta(days=30)).date().isoformat()
    cur = prices[prices.date == last].set_index(["material_code", "city"])
    p7 = prices[prices.date == d7].set_index(["material_code", "city"])["buying_price_informal"]
    p30 = prices[prices.date == d30].set_index(["material_code", "city"])["buying_price_informal"]
    out = cur[["material_category", "sub_category", "unit", "buying_price_informal",
               "quoted_price_formal", "spread_pct", "market_range_low",
               "market_range_high"]].copy()
    out["chg_7d_pct"] = np.round((cur.buying_price_informal / p7 - 1) * 100, 2)
    out["chg_30d_pct"] = np.round((cur.buying_price_informal / p30 - 1) * 100, 2)
    out["trend_7d"] = np.where(out.chg_7d_pct > 0.8, "up",
                               np.where(out.chg_7d_pct < -0.8, "down", "flat"))
    out["as_of_date"] = last
    return out.reset_index()


# =====================================================================
# 5. Collectors
# =====================================================================
def build_collectors():
    rows = []
    city_names = list(CITIES)
    city_w = np.array([CITIES[c]["weight"] for c in city_names])
    city_w = city_w / city_w.sum()
    for i in range(400):
        city = city_names[rng.choice(len(city_names), p=city_w)]
        cfg = CITIES[city]
        female = rng.random() < 0.22
        name = f"{rng.choice(FIRST_F if female else FIRST_M)} {rng.choice(SURNAMES)}"
        lang = rng.choice(["mr", "hi", "other"], p=[0.62, 0.30, 0.08])
        areas = rng.choice(cfg["areas"], size=int(rng.integers(1, 4)), replace=False)
        rows.append({
            "collector_id": f"COL{2000 + i}",
            "display_name": name,
            "preferred_language": lang,
            "home_city": city,
            "operating_areas": "|".join(sorted(areas.tolist())),
            "device_tier": rng.choice(["entry", "entry", "mid", "feature_android"],
                                      p=[0.52, 0.26, 0.16, 0.06]),
            "literacy_tier": rng.choice(["non_reader", "numerals_only", "functional"],
                                        p=[0.27, 0.44, 0.29]),
            "active_days_per_month": int(np.clip(rng.normal(19, 5), 4, 28)),
            "joined_on": (END - timedelta(days=int(rng.integers(20, 540)))).date().isoformat(),
            "onboarded_by": rng.choice(["field_camp", "peer_referral", "ngo_partner", "recycler_referral"],
                                       p=[0.38, 0.34, 0.16, 0.12]),
            # deliberately NOT collected: aadhaar, address, caste, income, household size
            "pii_minimised": True,
        })
    return pd.DataFrame(rows)


# =====================================================================
# 6. Lots
# =====================================================================
def build_lots(collectors, prices):
    n = 20000
    lot_start = END - timedelta(days=548)  # 18 months of field activity
    price_lookup = {
        (d, c, ct): (bi, qf) for d, c, ct, bi, qf in zip(
            prices.date.values, prices.material_code.values, prices.city.values,
            prices.buying_price_informal.values, prices.quoted_price_formal.values)
    }

    # heavy-tailed activity: a few power users, a long tail of occasional collectors
    activity = rng.pareto(1.7, len(collectors)) + 0.35
    activity = activity / activity.sum()

    cats = list(CATEGORY_MIX)
    cat_p = np.array([CATEGORY_MIX[c] for c in cats])
    subs_by_cat = {}
    for cat, sub, code, *_ in TAXONOMY:
        subs_by_cat.setdefault(cat, []).append((sub, code))

    rows = []
    col_idx = rng.choice(len(collectors), size=n, p=activity)
    for i in range(n):
        c = collectors.iloc[int(col_idx[i])]
        cat = cats[rng.choice(len(cats), p=cat_p)]
        sub, code = subs_by_cat[cat][rng.integers(len(subs_by_cat[cat]))]

        mu, sg, lo, hi = WEIGHT_DIST[cat]
        items = 1 + int(rng.poisson(BATCH_LAMBDA[cat]))
        w = float(np.clip(rng.lognormal(mu, sg) * items, lo, hi))
        w = round(w, 1)

        day_off = int(rng.integers(0, 549))
        created = lot_start + timedelta(days=day_off,
                                        hours=int(rng.integers(7, 20)),
                                        minutes=int(rng.integers(0, 60)))
        dkey = created.date().isoformat()
        pr = price_lookup.get((dkey, code, c.home_city))
        informal, formal = (float(pr[0]), float(pr[1])) if pr else (np.nan, np.nan)

        area = rng.choice(CITIES[c.home_city]["areas"])
        lat, lng = jitter(CITIES[c.home_city]["lat"], CITIES[c.home_city]["lng"], 11)

        # classifier stub output
        acc = CLASSIFIER_ACCURACY[cat]
        correct = rng.random() < acc
        if correct:
            pred = cat
            conf = float(np.clip(rng.normal(0.88, 0.07), 0.55, 0.99))
        else:
            alt = [x for x in cats if x != cat]
            pred = alt[rng.integers(len(alt))]
            conf = float(np.clip(rng.normal(0.61, 0.09), 0.35, 0.85))

        rows.append({
            "lot_id": f"LOT{100000 + i}",
            "collector_id": c.collector_id,
            "created_at": created.isoformat(timespec="minutes"),
            "material_category": cat,
            "sub_category": sub,
            "material_code": code,
            "item_count": items,
            "description_voice_transcript":
                rng.choice(VOICE_TEMPLATES[cat]).replace("{w}", str(max(1, int(round(w))))),
            "transcript_language": c.preferred_language if c.preferred_language != "other" else "hi",
            "input_method": rng.choice(["voice", "voice", "icon_keypad", "assisted"],
                                       p=[0.48, 0.22, 0.24, 0.06]),
            "image_ref": f"img/lots/{100000 + i:06d}.jpg",
            "weight_kg": w,
            "weight_source": rng.choice(["spring_balance", "platform_scale", "estimated"],
                                        p=[0.49, 0.34, 0.17]),
            "condition": rng.choice(CONDITIONS, p=CONDITION_WEIGHTS),
            "source_type": rng.choice(SOURCE_TYPES, p=SOURCE_WEIGHTS),
            "collection_city": c.home_city,
            "collection_area": area,
            "collection_lat": lat,
            "collection_lng": lng,
            "estimated_value_informal": round(w * informal, 2) if informal == informal else None,
            "estimated_value_formal": round(w * formal, 2) if formal == formal else None,
            "predicted_category": pred,
            "prediction_confidence": round(conf, 3),
            "prediction_accepted_by_user": bool(correct or rng.random() < 0.18),
            "created_offline": bool(rng.random() < 0.35),
        })
    return pd.DataFrame(rows).sort_values("created_at", ignore_index=True)


# =====================================================================
# 7. Transactions
# =====================================================================
def build_transactions(lots, recyclers, collectors):
    eligible = lots.sample(n=16500, random_state=SEED).sort_values("created_at")
    col_city = collectors.set_index("collector_id").home_city.to_dict()
    ok_status = ["active", "expiring_soon"]
    pools, lapsed = {}, {}
    for city in CITIES:
        base = recyclers[recyclers.city == city]
        for cat in CATEGORY_MIX:
            sel = base[base.materials_accepted.str.contains(cat, regex=False)]
            sel = sel if len(sel) else base
            good = sel[sel.authorisation_status.isin(ok_status)]
            bad = sel[~sel.authorisation_status.isin(ok_status)]
            pools[(city, cat)] = (good if len(good) else sel).reset_index(drop=True)
            lapsed[(city, cat)] = bad.reset_index(drop=True)

    statuses = ["quoted", "matched", "handed_over", "confirmed", "settled", "cancelled"]
    status_p = [0.05, 0.06, 0.07, 0.09, 0.70, 0.03]

    rows = []
    for i, (_, lot) in enumerate(eligible.iterrows()):
        city = col_city[lot.collector_id]
        key = (city, lot.material_category)
        lapsed_pool = lapsed[key]
        # ~3% of historical trades went to a recycler whose authorisation had lapsed —
        # kept in the data on purpose so the admin compliance view has something to flag
        if len(lapsed_pool) and rng.random() < 0.03:
            rec = lapsed_pool.iloc[int(rng.integers(len(lapsed_pool)))]
        else:
            pool = pools[key]
            rec = pool.iloc[int(rng.integers(len(pool)))]

        status = rng.choice(statuses, p=status_p)
        quoted = float(lot.estimated_value_formal or 0) * float(rec.offered_rate_multiplier)
        quoted = round(quoted, 2)

        t0 = datetime.fromisoformat(lot.created_at)
        quoted_at = t0 + timedelta(hours=float(rng.uniform(0.2, 30)))

        w_verified = round(float(lot.weight_kg) * float(np.clip(rng.normal(0.985, 0.035), 0.85, 1.08)), 1)
        final = round(quoted * (w_verified / lot.weight_kg) * float(np.clip(rng.normal(0.995, 0.02), 0.9, 1.05)), 2)

        handed = confirmed = settled = None
        pay_status = "not_due"
        if status in ("handed_over", "confirmed", "settled"):
            handed = quoted_at + timedelta(hours=float(rng.uniform(2, 96)))
        if status in ("confirmed", "settled"):
            confirmed = handed + timedelta(hours=float(rng.uniform(0.1, 20)))
        if status == "settled":
            settled = confirmed + timedelta(hours=float(rng.uniform(0.2, rec.avg_settlement_hours * 1.6)))
            pay_status = "paid"
        elif status == "confirmed":
            pay_status = rng.choice(["pending", "partial", "paid"], p=[0.62, 0.14, 0.24])
        elif status == "handed_over":
            pay_status = "pending"
        if status == "cancelled":
            final = 0.0

        # anomalies (~4%), labelled, kept out of model features
        is_anom, anom_type = False, None
        if rng.random() < 0.05 and status in ("handed_over", "confirmed", "settled"):
            is_anom = True
            anom_type = rng.choice(["price_out_of_band", "weight_value_mismatch",
                                    "impossible_geography", "duplicate_photo"],
                                   p=[0.38, 0.27, 0.19, 0.16])
            if anom_type == "price_out_of_band":
                final = round(final * float(rng.choice([0.42, 0.51, 1.95, 2.4])), 2)
            elif anom_type == "weight_value_mismatch":
                w_verified = round(w_verified * float(rng.choice([0.35, 0.45, 2.6, 3.1])), 1)

        h_lat, h_lng = float(rec.lat), float(rec.lng)
        if is_anom and anom_type == "impossible_geography":
            h_lat, h_lng = jitter(19.9975, 73.7898, 5) if city != "Nashik" else jitter(21.1458, 79.0882, 5)

        rows.append({
            "txn_id": f"TXN{500000 + i}",
            "lot_image_ref": lot.image_ref,
            "lot_id": lot.lot_id,
            "collector_id": lot.collector_id,
            "recycler_id": rec.recycler_id,
            "material_category": lot.material_category,
            "material_code": lot.material_code,
            "weight_kg": lot.weight_kg,
            "weight_verified_kg": w_verified,
            "quoted_price": quoted,
            "final_price": final,
            "informal_benchmark_value": lot.estimated_value_informal,
            "collection_city": lot.collection_city,
            "collection_lat": lot.collection_lat,
            "collection_lng": lot.collection_lng,
            "handover_lat": round(h_lat, 6),
            "handover_lng": round(h_lng, 6),
            "handover_distance_km": haversine(lot.collection_lat, lot.collection_lng, h_lat, h_lng),
            "quoted_at": quoted_at.isoformat(timespec="minutes"),
            "handed_over_at": handed.isoformat(timespec="minutes") if handed else None,
            "confirmed_at": confirmed.isoformat(timespec="minutes") if confirmed else None,
            "settled_at": settled.isoformat(timespec="minutes") if settled else None,
            "payment_mode": rng.choice(["cash", "upi"], p=[0.68, 0.32]),
            "payment_status": pay_status,
            "txn_status": status,
            "pickup_by_recycler": bool(rec.pickup_available and rng.random() < 0.6),
            "recycler_authorisation_at_txn": rec.authorisation_status,
            "recycler_authorised_at_txn": bool(rec.authorisation_status in ("active", "expiring_soon")),
            "is_anomaly": is_anom,
            "anomaly_type": anom_type,
        })
    return pd.DataFrame(rows)


# =====================================================================
# 8. Traceability
# =====================================================================
def build_traceability(txns, lots):
    lot_img = lots.set_index("lot_id").image_ref.to_dict()
    t = txns[txns.txn_status.isin(["handed_over", "confirmed", "settled"])].reset_index(drop=True)
    all_imgs = lots.image_ref.tolist()
    rows = []
    for i, r in t.iterrows():
        offline = bool(rng.random() < 0.35)
        cap = datetime.fromisoformat(r.handed_over_at)
        if offline:
            lag_h = float(rng.uniform(0.5, 14)) if rng.random() < 0.7 else float(rng.uniform(14, 132))
        else:
            lag_h = float(rng.uniform(0.003, 0.07))
        synced = cap + timedelta(hours=lag_h)
        n_photos = int(rng.integers(2, 5))
        first = lot_img[r.lot_id]
        if r.anomaly_type == "duplicate_photo":
            # genuinely reuse another lot's image so a perceptual-hash check can catch it
            first = all_imgs[int(rng.integers(len(all_imgs)))]
        photos = [first] + [f"img/handover/{500000 + i:06d}_{k}.jpg" for k in range(n_photos - 1)]

        conf_at = r.confirmed_at
        rows.append({
            "trace_id": f"TRC{700000 + i}",
            "lot_id": r.lot_id,
            "txn_id": r.txn_id,
            "handover_ref": ref_code(),
            "photo_refs": "|".join(photos),
            "photo_reused_from_other_lot": bool(r.anomaly_type == "duplicate_photo"),
            "scale_photo_ref": f"img/scale/{500000 + i:06d}.jpg",
            "weight_kg": r.weight_verified_kg,
            "gps_lat": r.handover_lat,
            "gps_lng": r.handover_lng,
            "gps_accuracy_m": int(np.clip(rng.gamma(3, 6), 4, 120)),
            "captured_at": cap.isoformat(timespec="minutes"),
            "device_offline_at_capture": offline,
            "synced_at": synced.isoformat(timespec="minutes"),
            "sync_lag_minutes": int((synced - cap).total_seconds() // 60),
            "recycler_confirmed_at": conf_at,
            "confirmation_method": rng.choice(["qr_scan", "code_entry", "spoken_code"],
                                              p=[0.44, 0.38, 0.18]) if conf_at else None,
            "downstream_status": rng.choice(
                ["awaiting_confirmation", "received_at_facility", "segregated",
                 "sent_for_recovery", "recovery_complete"],
                p=[0.10, 0.18, 0.22, 0.24, 0.26]) if conf_at else "awaiting_confirmation",
            "epr_credit_reference": f"EPR/MH/{rng.integers(2025, 2027)}/{rng.integers(10000, 99999)}"
                                    if conf_at and rng.random() < 0.72 else None,
        })
    return pd.DataFrame(rows)


# =====================================================================
# 9. ML image index
# =====================================================================
def build_ml_index(lots):
    n_real, n_synth = 300, 2100
    sample = lots.sample(n=n_real + n_synth, random_state=SEED + 1).reset_index(drop=True)
    rows = []
    for i, r in sample.iterrows():
        real = i < n_real
        split = rng.choice(["train", "val", "test"], p=[0.70, 0.15, 0.15])
        rows.append({
            "image_id": f"IMG{900000 + i}",
            "image_ref": (f"img/pilot/{i:04d}.jpg" if real else f"img/placeholder/{i:04d}.png"),
            "label_source": "field_capture_pilot" if real else "procedural_placeholder",
            "usable_for_training": real,
            "material_category": r.material_category,
            "sub_category": r.sub_category,
            "material_code": r.material_code,
            "weight_kg": r.weight_kg,
            "city": r.collection_city,
            "month": r.created_at[:7],
            "lighting": rng.choice(["daylight", "shade", "indoor_tube", "low_light", "flash"],
                                   p=[0.34, 0.22, 0.21, 0.15, 0.08]),
            "background": rng.choice(["cluttered_yard", "floor_mat", "cart", "shop_counter", "plain"],
                                     p=[0.36, 0.24, 0.18, 0.14, 0.08]),
            "hand_for_scale": bool(rng.random() < 0.41),
            "split": split,
        })
    return pd.DataFrame(rows)


# =====================================================================
# 10. Derived: collector earnings summary + demo scenario
# =====================================================================
def build_earnings(txns, collectors):
    txns = txns[txns.txn_status != "cancelled"]
    paid = txns[txns.payment_status == "paid"]
    g = txns.groupby("collector_id")
    df = pd.DataFrame({
        "total_lots_transacted": g.size(),
        "total_weight_kg": g.weight_verified_kg.sum().round(1),
        "gross_earnings_platform_inr": g.final_price.sum().round(2),
        "informal_benchmark_inr": g.informal_benchmark_value.sum().round(2),
    })
    df["earnings_paid_inr"] = paid.groupby("collector_id").final_price.sum().round(2)
    df["earnings_pending_inr"] = (df.gross_earnings_platform_inr - df.earnings_paid_inr.fillna(0)).round(2)
    df["uplift_vs_informal_inr"] = (df.gross_earnings_platform_inr - df.informal_benchmark_inr).round(2)
    df["uplift_pct"] = (df.uplift_vs_informal_inr / df.informal_benchmark_inr * 100).round(2)
    out = collectors.merge(df.reset_index(), on="collector_id", how="left")
    return out[["collector_id", "display_name", "home_city", "preferred_language",
                "literacy_tier", "active_days_per_month", "total_lots_transacted",
                "total_weight_kg", "gross_earnings_platform_inr", "informal_benchmark_inr",
                "earnings_paid_inr", "earnings_pending_inr", "uplift_vs_informal_inr",
                "uplift_pct"]].fillna(0)



def build_unit_economics(txns, earnings, lots):
    """Per-category unit economics: what the collector gets informally vs on the
    platform, and what the platform can charge the RECYCLER (never the collector)."""
    t = txns[txns.txn_status.isin(["confirmed", "settled"]) & (~txns.is_anomaly)]
    g = t.groupby("material_category")
    df = pd.DataFrame({
        "lots": g.size(),
        "total_weight_kg": g.weight_verified_kg.sum().round(1),
        "informal_value_inr": g.informal_benchmark_value.sum().round(2),
        "platform_value_inr": g.final_price.sum().round(2),
    })
    df["uplift_inr"] = (df.platform_value_inr - df.informal_value_inr).round(2)
    df["uplift_pct"] = (df.uplift_inr / df.informal_value_inr * 100).round(2)
    df["avg_lot_weight_kg"] = (df.total_weight_kg / df.lots).round(1)
    df["informal_rate_inr_per_kg"] = (df.informal_value_inr / df.total_weight_kg).round(2)
    df["platform_rate_inr_per_kg"] = (df.platform_value_inr / df.total_weight_kg).round(2)
    # platform revenue: 1.75% commission billed to the recycler
    df["platform_fee_inr_at_1_75pct"] = (df.platform_value_inr * 0.0175).round(2)
    df["collector_fee_inr"] = 0.0
    return df.reset_index()


def build_impact(txns, tax):
    """Critical materials routed to formal recovery instead of backyard processing."""
    crit_cols = [f"{c}_g_per_kg" for c in CRITICALS]
    per_code = tax.set_index("material_code")[crit_cols]
    t = txns[txns.txn_status.isin(["confirmed", "settled"])]
    g = t.groupby("material_code").weight_verified_kg.sum()
    rows = []
    for code, kg in g.items():
        r = {"material_code": code,
             "material_category": tax.set_index("material_code").material_category[code],
             "sub_category": tax.set_index("material_code").sub_category[code],
             "weight_formalised_kg": round(float(kg), 1)}
        for c in CRITICALS:
            r[f"{c}_recovered_g"] = round(float(kg) * float(per_code.loc[code, f"{c}_g_per_kg"]), 1)
        r["open_burning_events_avoided"] = int(t[t.material_code == code].shape[0]
                                               * (0.55 if code.startswith("CBL") else 0.12))
        rows.append(r)
    return pd.DataFrame(rows).sort_values("weight_formalised_kg", ascending=False, ignore_index=True)


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    written = {}

    def w(df, name):
        p = os.path.join(out_dir, name)
        df.to_csv(p, index=False)
        written[name] = (len(df), os.path.getsize(p))
        print(f"  {name:34s} {len(df):>8,} rows  {os.path.getsize(p)/1e6:>7.2f} MB")

    print("Generating (seed=%d)…" % SEED)
    tax = build_taxonomy();                       w(tax, "material_taxonomy.csv")
    rec = build_recyclers();                      w(rec, "recyclers.csv")
    prc = build_prices(rec);                      w(prc, "price_history.csv")
    brd = build_price_board(prc);                 w(brd, "price_board_current.csv")
    col = build_collectors();                     w(col, "collectors.csv")
    lots = build_lots(col, prc);                  w(lots, "lots.csv")
    txns = build_transactions(lots, rec, col);    w(txns, "transactions.csv")
    trc = build_traceability(txns, lots);         w(trc, "traceability.csv")
    mlx = build_ml_index(lots);                   w(mlx, "ml_image_index.csv")
    ern = build_earnings(txns, col);              w(ern, "collector_earnings.csv")
    une = build_unit_economics(txns, ern, lots);  w(une, "unit_economics.csv")
    imp = build_impact(txns, tax);                w(imp, "impact_summary.csv")

    # demo scenario: a scripted, deterministic path for the live demo
    mr = ern[(ern.preferred_language == "mr") & (ern.literacy_tier != "functional")]
    top = mr.sort_values("total_lots_transacted", ascending=False).iloc[2]
    demo_col = col[col.collector_id == top.collector_id].iloc[0]
    active_ids = set(rec[rec.authorisation_status == "active"].recycler_id)
    demo_txn = txns[(txns.collector_id == top.collector_id)
                    & (txns.txn_status == "settled")
                    & (txns.recycler_id.isin(active_ids))
                    & (~txns.is_anomaly)].iloc[0]
    demo_rec = rec[rec.recycler_id == demo_txn.recycler_id].iloc[0]
    demo_trc = trc[trc.txn_id == demo_txn.txn_id]
    scenario = {
        "note": "Deterministic path for the live demo — never depends on random data.",
        "collector": json.loads(demo_col.to_json()),
        "recycler": json.loads(demo_rec.to_json()),
        "transaction": json.loads(demo_txn.to_json()),
        "traceability": json.loads(demo_trc.iloc[0].to_json()) if len(demo_trc) else None,
        "login": {"collector": "COL_DEMO / 1234", "recycler": "REC_DEMO / 1234",
                  "admin": "ADMIN_DEMO / 1234"},
    }
    with open(os.path.join(out_dir, "demo_scenario.json"), "w") as f:
        json.dump(scenario, f, indent=2, default=str)

    # checksum manifest so reproducibility is verifiable
    man = {}
    for name in sorted(written):
        h = hashlib.sha256(open(os.path.join(out_dir, name), "rb").read()).hexdigest()[:16]
        man[name] = {"rows": written[name][0], "bytes": written[name][1], "sha256_16": h}
    with open(os.path.join(out_dir, "MANIFEST.json"), "w") as f:
        json.dump({"seed": SEED, "generated_window": [str(START.date()), str(END.date())],
                   "files": man}, f, indent=2)
    return written, txns, lots, trc, prc, rec, col, ern


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="seed")
    a = ap.parse_args()
    main(a.out)
