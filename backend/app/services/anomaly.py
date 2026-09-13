"""Transaction anomaly detection.

Compares the effective per-kg price of a transaction against the historical
distribution for that material (mean / standard deviation over the last 45
days) and against the declared vs. final weight difference.
"""
import statistics
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..models import Price


def _distribution(db: Session, category: str) -> tuple[float, float]:
    since = datetime.utcnow() - timedelta(days=45)
    values = [
        p.buying_price
        for p in db.query(Price).filter(
            Price.material_category == category, Price.date >= since
        )
    ]
    if len(values) < 5:
        return 0.0, 0.0
    return statistics.mean(values), (statistics.pstdev(values) or 1.0)


def check(db: Session, category: str, final_price: float, final_weight: float,
          declared_weight: float) -> tuple[bool, str]:
    reasons: list[str] = []
    if final_weight <= 0:
        return True, "Final weight is zero or negative."

    rate = final_price / final_weight
    mean, sd = _distribution(db, category)
    if mean:
        z = (rate - mean) / sd
        deviation = abs(rate - mean) / mean
        # A flag needs BOTH a statistical outlier and a materially different
        # price, so normal day-to-day noise never raises an alert.
        if z < -2.0 and deviation > 0.15:
            reasons.append(
                f"Price ₹{rate:.0f}/kg is far below the historical range "
                f"(avg ₹{mean:.0f}/kg) for {category}."
            )
        elif z > 2.5 and deviation > 0.15:
            reasons.append(
                f"Price ₹{rate:.0f}/kg is unusually above the historical range "
                f"(avg ₹{mean:.0f}/kg) for {category}."
            )

    if declared_weight > 0:
        drift = abs(final_weight - declared_weight) / declared_weight
        if drift > 0.25:
            reasons.append(
                f"Final weight {final_weight} kg differs from the collector's "
                f"declared {declared_weight} kg by {drift * 100:.0f}%."
            )

    return bool(reasons), " ".join(reasons)


def fairness(db: Session, category: str, declared_weight: float,
             final_weight: float, final_price: float) -> dict:
    """Collector-facing view of the same checks the admin sees.

    Returned with the lot so the collector's phone can warn them out loud at
    the moment the recycler enters figures, rather than after the fact.
    """
    issues = []
    weight_drift = 0.0
    if declared_weight > 0 and final_weight > 0:
        weight_drift = round((final_weight - declared_weight) / declared_weight * 100, 1)
        if weight_drift <= -8:
            issues.append("weight")

    rate = final_price / final_weight if final_weight else 0
    mean, _sd = _distribution(db, category)
    rate_gap = 0.0
    if mean and rate:
        rate_gap = round((rate - mean) / mean * 100, 1)
        if rate_gap <= -15:
            issues.append("price")

    return {
        "ok": not issues,
        "issues": issues,
        "declared_weight": declared_weight,
        "final_weight": final_weight,
        "weight_drift_pct": weight_drift,
        "rate": round(rate, 1),
        "market_rate": round(mean, 1) if mean else 0,
        "rate_gap_pct": rate_gap,
    }
