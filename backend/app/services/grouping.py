"""Group buying / bulk aggregation.

Two collectors nearby, holding the same material, are worth more to a
recycler combined than apart — a recycler will often pay a premium for one
bulk pickup instead of two small ones. This module lazily looks for that
opportunity (same pattern as the auction module: no background worker, so
detection runs on the read paths that already touch a lot), proposes a
bundle, and — once both collectors accept — finalizes it into a real
recycler match with one Transaction per lot (so payment still splits by
each collector's own weight, even though the pickup is shared).
"""
from sqlalchemy.orm import Session

from ..models import Lot, LotGroup, Transaction
from . import matching, pricing
from .common import log_event, next_group_id

OPEN_STATUSES = ("LOT_CREATED", "PRICE_ESTIMATED")

# A bundle only unlocks the bulk rate once it clears this combined weight...
MIN_COMBINED_KG = 15.0
# ...and pays this much more per kg than the going rate.
BONUS_PCT = 0.13
# Collectors this far apart (km) are still considered "nearby enough" for a
# single shared pickup.
MAX_DISTANCE_KM = 8.0


class _CombinedLot:
    """Duck-types just enough of `Lot` for `matching.match_recyclers` to
    score a hypothetical pickup covering every member's combined weight."""

    def __init__(self, members: list[Lot]):
        anchor = members[0]
        self.material_category = anchor.material_category
        self.location = anchor.location
        self.city = anchor.city
        self.latitude = anchor.latitude
        self.longitude = anchor.longitude
        self.weight = sum(m.weight for m in members)


def _group_out(db: Session, group: LotGroup, viewer_lot_id: str) -> dict:
    members = db.query(Lot).filter(Lot.group_id == group.group_id).all()
    partners = [m for m in members if m.lot_id != viewer_lot_id]
    return {
        "group_id": group.group_id,
        "status": group.status,
        "material_category": group.material_category,
        "combined_weight": group.combined_weight,
        "base_rate_per_kg": group.base_rate_per_kg,
        "bonus_rate_per_kg": group.bonus_rate_per_kg,
        "pickup_location": group.pickup_location,
        "recycler_id": group.recycler_id,
        "you_accepted": next((m.group_accepted for m in members if m.lot_id == viewer_lot_id), False),
        "partners": [
            {
                "lot_id": p.lot_id,
                "collector_name": p.collector.display_name if p.collector else None,
                "weight": p.weight,
                "location": p.location,
                "accepted": p.group_accepted,
            }
            for p in partners
        ],
    }


def suggestion_for(db: Session, lot: Lot) -> dict | None:
    """Find (or return the already-suggested) group for `lot`. None if a
    bundle isn't already forming and no new candidate qualifies."""
    if lot.group_id:
        group = db.get(LotGroup, lot.group_id)
        return _group_out(db, group, lot.lot_id) if group else None

    if lot.status not in OPEN_STATUSES or lot.recycler_id is not None:
        return None
    if not (lot.latitude and lot.longitude):
        return None

    candidates = (
        db.query(Lot)
        .filter(
            Lot.material_category == lot.material_category,
            Lot.status.in_(OPEN_STATUSES),
            Lot.recycler_id.is_(None),
            Lot.group_id.is_(None),
            Lot.collector_id != lot.collector_id,
            Lot.lot_id != lot.lot_id,
        )
        .order_by(Lot.created_at.desc())
        .limit(50)
        .all()
    )
    best, best_distance = None, None
    for c in candidates:
        if not (c.latitude and c.longitude):
            continue
        if lot.weight + c.weight < MIN_COMBINED_KG:
            continue
        d = matching.haversine_km(lot.latitude, lot.longitude, c.latitude, c.longitude)
        if d > MAX_DISTANCE_KM:
            continue
        if best is None or d < best_distance:
            best, best_distance = c, d
    if not best:
        return None

    stats = pricing.current_range(db, lot.material_category, lot.location)
    base_rate = stats["max_price"] or 0
    if base_rate <= 0:
        return None

    group = LotGroup(
        group_id=next_group_id(db),
        material_category=lot.material_category,
        status="SUGGESTED",
        combined_weight=round(lot.weight + best.weight, 2),
        base_rate_per_kg=base_rate,
        bonus_rate_per_kg=round(base_rate * (1 + BONUS_PCT), 2),
        pickup_location=lot.location,
    )
    db.add(group)
    db.flush()
    lot.group_id = group.group_id
    best.group_id = group.group_id
    note = (
        f"Combine with a nearby {best.weight:.0f} kg lot for "
        f"{group.combined_weight:.0f} kg total → ₹{group.bonus_rate_per_kg:.0f}/kg "
        f"instead of ₹{base_rate:.0f}/kg"
    )
    log_event(db, lot.lot_id, "GROUP_SUGGESTED", note)
    log_event(db, best.lot_id, "GROUP_SUGGESTED", note)
    db.commit()
    db.refresh(lot)
    return _group_out(db, group, lot.lot_id)


def accept(db: Session, lot: Lot) -> dict:
    group = db.get(LotGroup, lot.group_id)
    lot.group_accepted = True
    db.commit()

    members = db.query(Lot).filter(Lot.group_id == group.group_id).all()
    if group.status == "SUGGESTED" and all(m.group_accepted for m in members):
        _finalize(db, group, members)
        db.refresh(lot)
    return _group_out(db, group, lot.lot_id)


def decline(db: Session, lot: Lot) -> None:
    group = db.get(LotGroup, lot.group_id)
    for member in db.query(Lot).filter(Lot.group_id == group.group_id).all():
        member.group_id = None
        member.group_accepted = False
        log_event(db, member.lot_id, "GROUP_DECLINED", "Bulk-combine offer declined")
    group.status = "DECLINED"
    db.commit()


def _finalize(db: Session, group: LotGroup, members: list[Lot]) -> None:
    combo = _CombinedLot(members)
    ranked = matching.match_recyclers(db, combo, limit=5)
    if not ranked:
        # No recycler currently covers the combined pickup — leave the group
        # accepted so it can be retried; the member lots stay open.
        group.status = "ACCEPTED"
        db.commit()
        return

    picked = ranked[0]
    rec = picked["recycler"]
    group.recycler_id = rec.recycler_id
    group.status = "MATCHED"
    for member in members:
        member.recycler_id = rec.recycler_id
        member.quoted_price = round(group.bonus_rate_per_kg * member.weight)
        member.match_score = picked["match_score"]
        member.status = "HANDOVER_PENDING"
        txn = Transaction(
            lot_id=member.lot_id, collector_id=member.collector_id, recycler_id=rec.recycler_id,
            quoted_price=member.quoted_price, collection_location=group.pickup_location,
            transaction_status="RECYCLER_MATCHED", payment_status="PENDING",
        )
        db.add(txn)
        log_event(db, member.lot_id, "RECYCLER_MATCHED",
                  f"Group pickup with {rec.name} at ₹{group.bonus_rate_per_kg:.0f}/kg (bulk rate)")
        log_event(db, member.lot_id, "HANDOVER_PENDING", "Waiting for recycler to scan the lot QR")
    db.commit()
