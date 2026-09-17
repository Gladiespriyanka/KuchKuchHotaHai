"""Fair-price engine.

Everything is derived from the `prices` table, so when a recycler updates a
rate (which writes a new Price row) the estimates move with it — the dataset
is live, not hard-coded.
"""
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Material, Price

CONDITION_FACTOR = {"good": 1.0, "mixed": 0.92, "damaged": 0.82}
SOURCE_FACTOR = {
    "household": 1.0,
    "commercial": 1.03,
    "industrial": 1.05,
    "scrap_collection": 0.98,
}


def _rows(db: Session, category: str, days: int, location: str | None = None,
          material_code: str | None = None, city: str | None = None):
    """Price observations for a material, narrowed as far as the data allows.

    The supplied dataset prices every SUB-CATEGORY (material_code) in every
    CITY separately, so a board that groups only by category would average a
    ₹1780/kg RAM board together with a ₹118/kg TV board. Narrow by code and
    city first; fall back only when there is not enough data.
    """
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(Price).filter(Price.date >= since)
    q = q.filter(Price.material_code == material_code) if material_code \
        else q.filter(Price.material_category == category)

    if city:
        city_rows = q.filter(Price.city == city).all()
        if len(city_rows) >= 3:
            return city_rows
    if location:
        loc_rows = q.filter(Price.location == location).all()
        if len(loc_rows) >= 3:
            return loc_rows
    return q.all()


def current_range(db: Session, category: str, location: str | None = None,
                  material_code: str | None = None, city: str | None = None) -> dict:
    recent = (_rows(db, category, 7, location, material_code, city)
              or _rows(db, category, 45, location, material_code, city))
    if not recent:
        return {"min_price": 0.0, "max_price": 0.0, "avg": 0.0, "trend": "stable", "change_pct": 0.0}

    prices = sorted(p.buying_price for p in recent)
    avg = sum(prices) / len(prices)

    # The dataset publishes an explicit market range per row; prefer it over a
    # percentile of our own observations, and only fall back when absent.
    lows = [p.market_range_low for p in recent if p.market_range_low]
    highs = [p.market_range_high for p in recent if p.market_range_high]
    if lows and highs:
        lo = round(sum(lows) / len(lows), 0)
        hi = round(sum(highs) / len(highs), 0)
    else:
        lo = round(prices[int(len(prices) * 0.1)], 0)
        hi = round(prices[int(len(prices) * 0.9)] if len(prices) > 1 else prices[0], 0)
    if hi <= lo:
        hi = round(lo * 1.12, 0)

    older = _rows(db, category, 30, location, material_code, city)
    cutoff = datetime.utcnow() - timedelta(days=14)
    old_prices = [p.buying_price for p in older if p.date < cutoff]
    change_pct = 0.0
    if old_prices:
        old_avg = sum(old_prices) / len(old_prices)
        if old_avg:
            change_pct = round((avg - old_avg) / old_avg * 100, 1)
    trend = "rising" if change_pct > 2.5 else "falling" if change_pct < -2.5 else "stable"
    formal = [p.selling_price for p in recent if p.selling_price]
    return {
        "min_price": float(lo),
        "max_price": float(hi),
        "avg": round(avg, 2),
        "formal_quote": round(sum(formal) / len(formal), 2) if formal else 0.0,
        "trend": trend,
        "change_pct": change_pct,
        "observations": len(recent),
        "as_of": max(p.date for p in recent).isoformat(),
    }


def price_board(db: Session, location: str | None = None,
                city: str | None = None, by_subcategory: bool = True) -> list[dict]:
    """One row per sub-category (the dataset's material_code) for a city.

    `by_subcategory=False` collapses to one row per category for the simple
    collector board, keeping the old shape for existing callers.
    """
    board = []
    for material in db.query(Material).order_by(Material.material_id).all():
        stats = current_range(db, material.category, location,
                              material_code=material.material_code, city=city)
        board.append({
            "category": material.category,
            "material_code": material.material_code,
            "sub_category": material.subcategory,
            "min_price": stats["min_price"],
            "max_price": stats["max_price"],
            "avg": stats["avg"],
            "formal_quote": stats.get("formal_quote", 0.0),
            "unit": material.unit,
            "trend": stats["trend"],
            "change_pct": stats["change_pct"],
            "city": city or location or "all cities",
            "as_of": stats.get("as_of"),
            "observations": stats.get("observations", 0),
            "icon": material.icon,
            "primary_hazard": material.primary_hazard,
        })

    if by_subcategory:
        return board

    grouped: dict[str, dict] = {}
    for row in board:
        g = grouped.setdefault(row["category"], {
            **row, "sub_category": "", "material_code": "",
            "min_price": row["min_price"], "max_price": row["max_price"],
        })
        g["min_price"] = min(g["min_price"], row["min_price"])
        g["max_price"] = max(g["max_price"], row["max_price"])
    return list(grouped.values())


def history(db: Session, category: str, days: int = 60, location: str | None = None,
            material_code: str | None = None, city: str | None = None) -> list[dict]:
    """Historical series. Location IS applied when supplied — the dataset holds
    a separate series per city, so ignoring it would show the wrong market."""
    since = datetime.utcnow() - timedelta(days=days)
    filters = [Price.date >= since]
    filters.append(Price.material_code == material_code if material_code
                   else Price.material_category == category)
    if city:
        filters.append(Price.city == city)
    elif location:
        filters.append(Price.location == location)
    rows = (
        db.query(
            func.date(Price.date).label("d"),
            func.avg(Price.buying_price).label("p"),
        )
        .filter(*filters)
        .group_by(func.date(Price.date))
        .order_by(func.date(Price.date))
        .all()
    )
    return [{"date": str(r.d)[:10], "price": round(float(r.p), 1)} for r in rows]


def estimate(db: Session, category: str, weight: float, condition: str, source_type: str,
             location: str | None = None) -> dict:
    stats = current_range(db, category, location)
    factor = CONDITION_FACTOR.get(condition, 1.0) * SOURCE_FACTOR.get(source_type, 1.0)
    est_min = round(stats["min_price"] * weight * factor)
    est_max = round(stats["max_price"] * weight * factor)
    return {
        "estimated_min": float(est_min),
        "estimated_max": float(est_max),
        "rate_min": stats["min_price"],
        "rate_max": stats["max_price"],
        "trend": stats["trend"],
        "change_pct": stats["change_pct"],
        "condition_factor": round(factor, 3),
        "basis": "Average of recent recorded buying rates for this material, adjusted "
                 "for condition and source. Estimated market range only — the final "
                 "price is agreed with the recycler after weighing.",
    }


def informal_benchmark(estimated_max: float) -> float:
    """Typical informal-channel offer used for the 'you could earn more' card.

    Prototype assumption: informal aggregators pay roughly 12% below the
    formal rate because of margin stacking in the chain.
    """
    return round(estimated_max * 0.88)
