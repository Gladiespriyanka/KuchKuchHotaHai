"""Scheduled pickup calendar / route optimization.

A recycler sets a standing recurring round ("every Tuesday in Malviya
Nagar"); collectors in range book one of their open lots into a specific
future occurrence. Booking a slot commits the recycler to that lot exactly
the way a direct "choose this recycler" pick would — same Transaction, same
downstream handover/payment code — the only new thing is which day the
recycler plans to actually show up, and in what order.
"""
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from ..models import Collector, Lot, PickupBooking, PickupSchedule, Recycler, Transaction
from . import matching
from .common import log_event

WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def next_occurrence(weekday: int, *, after: date | None = None) -> date:
    """The next date matching `weekday` on or after `after` (today by
    default) — today itself counts if today already is that weekday."""
    today = after or date.today()
    days_ahead = (weekday - today.weekday()) % 7
    return today + timedelta(days=days_ahead)


def upcoming_occurrences(weekday: int, count: int = 4) -> list[date]:
    first = next_occurrence(weekday)
    return [first + timedelta(weeks=i) for i in range(count)]


def validate_occurrence(schedule: PickupSchedule, occurrence_date: str) -> date:
    try:
        parsed = datetime.strptime(occurrence_date, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("occurrence_date must be YYYY-MM-DD") from exc
    if parsed < date.today():
        raise ValueError("occurrence_date is in the past")
    if parsed.weekday() != schedule.weekday:
        raise ValueError(f"{parsed.isoformat()} is not a {WEEKDAY_KEYS[schedule.weekday]}")
    return parsed


def booked_count(db: Session, schedule_id: int, occurrence_date: str) -> int:
    return (
        db.query(PickupBooking)
        .filter(PickupBooking.schedule_id == schedule_id,
                PickupBooking.occurrence_date == occurrence_date,
                PickupBooking.status == "BOOKED")
        .count()
    )


def book_slot(db: Session, schedule: PickupSchedule, lot: Lot, collector: Collector,
              occurrence_date: str) -> tuple[PickupBooking, Transaction]:
    rec = db.get(Recycler, schedule.recycler_id)
    rate = float((rec.offered_rate or {}).get(lot.material_category, 0))
    lot.recycler_id = rec.recycler_id
    lot.quoted_price = round(rate * lot.weight)
    ranked = {m["recycler"].recycler_id: m for m in matching.match_recyclers(db, lot, limit=20)}
    picked = ranked.get(rec.recycler_id)
    lot.match_score = picked["match_score"] if picked else 0
    lot.status = "HANDOVER_PENDING"

    booking = PickupBooking(
        schedule_id=schedule.schedule_id, lot_id=lot.lot_id, collector_id=collector.collector_id,
        occurrence_date=occurrence_date, status="BOOKED",
    )
    db.add(booking)

    txn = Transaction(
        lot_id=lot.lot_id, collector_id=lot.collector_id, recycler_id=rec.recycler_id,
        quoted_price=lot.quoted_price, collection_location=lot.location,
        transaction_status="RECYCLER_MATCHED", payment_status="PENDING",
    )
    db.add(txn)
    log_event(db, lot.lot_id, "RECYCLER_MATCHED",
              f"Booked into {rec.name}'s {WEEKDAY_KEYS[schedule.weekday]} round in "
              f"{schedule.area} for {occurrence_date}", actor=collector.display_name)
    log_event(db, lot.lot_id, "HANDOVER_PENDING",
              f"Pickup scheduled for {occurrence_date} — waiting for the recycler's round")
    db.commit()
    db.refresh(lot)
    db.refresh(booking)
    return booking, txn


def cancel_booking(db: Session, booking: PickupBooking, lot: Lot) -> None:
    booking.status = "CANCELLED"
    lot.recycler_id = None
    lot.quoted_price = 0
    lot.match_score = 0
    lot.status = "PRICE_ESTIMATED"
    txn = db.query(Transaction).filter(Transaction.lot_id == lot.lot_id).first()
    if txn:
        db.delete(txn)
    log_event(db, lot.lot_id, "PRICE_ESTIMATED", "Pickup slot booking cancelled")
    db.commit()


def route_for(db: Session, schedule: PickupSchedule, occurrence_date: str) -> dict:
    """Greedy nearest-neighbour visiting order for one day's bookings,
    starting from the recycler's own facility. A full TSP solver is
    overkill for a route that is realistically 5-15 stops; nearest-neighbour
    gets a good-enough order at trivial cost."""
    rec = db.get(Recycler, schedule.recycler_id)
    bookings = (
        db.query(PickupBooking)
        .filter(PickupBooking.schedule_id == schedule.schedule_id,
                PickupBooking.occurrence_date == occurrence_date,
                PickupBooking.status == "BOOKED")
        .all()
    )
    stops = []
    for b in bookings:
        lot = db.query(Lot).filter(Lot.lot_id == b.lot_id).first()
        if lot:
            stops.append({"booking": b, "lot": lot})

    ordered = []
    remaining = stops[:]
    cur_lat, cur_lng = rec.latitude, rec.longitude
    total_km = 0.0
    while remaining:
        best_i, best_d = 0, None
        for i, s in enumerate(remaining):
            d = matching.haversine_km(cur_lat, cur_lng, s["lot"].latitude, s["lot"].longitude)
            if best_d is None or d < best_d:
                best_i, best_d = i, d
        chosen = remaining.pop(best_i)
        total_km += best_d
        cur_lat, cur_lng = chosen["lot"].latitude, chosen["lot"].longitude
        ordered.append({
            "stop": len(ordered) + 1,
            "lot_id": chosen["lot"].lot_id,
            "collector_id": chosen["booking"].collector_id,
            "material_category": chosen["lot"].material_category,
            "weight": chosen["lot"].weight,
            "location": chosen["lot"].location,
            "distance_from_previous_km": round(best_d, 1),
        })

    return {
        "schedule_id": schedule.schedule_id,
        "occurrence_date": occurrence_date,
        "stops": ordered,
        "total_distance_km": round(total_km, 1),
    }
