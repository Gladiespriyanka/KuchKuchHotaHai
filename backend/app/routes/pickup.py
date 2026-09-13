"""Scheduled pickup calendar / route optimization.

Recycler side: create a standing recurring round ("every Tuesday in
Malviya Nagar"), see upcoming occurrences and how full each is, and pull up
a nearest-neighbour visiting order for a given day.

Collector side: find schedules covering their area, book one of their own
open lots into a specific future date.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Lot, PickupBooking, PickupSchedule, Recycler, User
from ..schemas.schemas import BookSlotIn, PickupScheduleIn
from ..services import matching, scheduling
from ..services.common import lot_dict
from ..services.security import collector_for, recycler_for, require_role

router = APIRouter(prefix="/api/pickup-schedules", tags=["pickup"])

OPEN_STATUSES = ("LOT_CREATED", "PRICE_ESTIMATED")


def _schedule_out(db: Session, s: PickupSchedule, occurrences: int = 4) -> dict:
    upcoming = []
    for occ in scheduling.upcoming_occurrences(s.weekday, occurrences):
        occ_str = occ.isoformat()
        upcoming.append({
            "date": occ_str,
            "booked": scheduling.booked_count(db, s.schedule_id, occ_str),
            "capacity": s.capacity,
        })
    return {
        "schedule_id": s.schedule_id,
        "recycler_id": s.recycler_id,
        "area": s.area,
        "weekday": s.weekday,
        "weekday_key": scheduling.WEEKDAY_KEYS[s.weekday],
        "start_time": s.start_time,
        "end_time": s.end_time,
        "capacity": s.capacity,
        "radius_km": s.radius_km,
        "active": s.active,
        "upcoming": upcoming,
    }


@router.post("", status_code=201)
def create_schedule(
    payload: PickupScheduleIn,
    user: User = Depends(require_role("recycler")),
    db: Session = Depends(get_db),
):
    rec = recycler_for(db, user)
    schedule = PickupSchedule(
        recycler_id=rec.recycler_id, area=payload.area, weekday=payload.weekday,
        start_time=payload.start_time, end_time=payload.end_time,
        capacity=payload.capacity, radius_km=payload.radius_km,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return _schedule_out(db, schedule)


@router.get("/me")
def my_schedules(user: User = Depends(require_role("recycler")), db: Session = Depends(get_db)):
    rec = recycler_for(db, user)
    rows = (
        db.query(PickupSchedule)
        .filter(PickupSchedule.recycler_id == rec.recycler_id, PickupSchedule.active.is_(True))
        .order_by(PickupSchedule.weekday)
        .all()
    )
    return [_schedule_out(db, s) for s in rows]


@router.delete("/{schedule_id}")
def deactivate_schedule(schedule_id: int, user: User = Depends(require_role("recycler")),
                        db: Session = Depends(get_db)):
    rec = recycler_for(db, user)
    schedule = db.get(PickupSchedule, schedule_id)
    if not schedule or schedule.recycler_id != rec.recycler_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    schedule.active = False
    db.commit()
    return {"schedule_id": schedule_id, "active": False}


@router.get("/{schedule_id}/route")
def route(schedule_id: int, occurrence_date: str, user: User = Depends(require_role("recycler")),
         db: Session = Depends(get_db)):
    rec = recycler_for(db, user)
    schedule = db.get(PickupSchedule, schedule_id)
    if not schedule or schedule.recycler_id != rec.recycler_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    return scheduling.route_for(db, schedule, occurrence_date)


@router.get("/nearby")
def nearby_schedules(user: User = Depends(require_role("collector")), db: Session = Depends(get_db)):
    """Standing pickup rounds within reach of this collector — matched by
    distance when the collector has GPS, otherwise by matching city text."""
    collector = collector_for(db, user)
    rows = (
        db.query(PickupSchedule)
        .filter(PickupSchedule.active.is_(True))
        .order_by(PickupSchedule.weekday)
        .all()
    )
    has_coords = bool(collector.latitude) and bool(collector.longitude)
    out = []
    for s in rows:
        rec = db.get(Recycler, s.recycler_id)
        if not rec or rec.authorization_status != "approved":
            continue
        if has_coords and rec.latitude and rec.longitude:
            distance = matching.haversine_km(collector.latitude, collector.longitude,
                                             rec.latitude, rec.longitude)
            if distance > s.radius_km:
                continue
        else:
            distance = None
            if collector.operating_location and s.area.lower() not in collector.operating_location.lower() \
               and collector.operating_location.lower() not in s.area.lower():
                continue
        out.append({
            **_schedule_out(db, s),
            "recycler_name": rec.name,
            "recycler_location": rec.location,
            "distance_km": distance,
        })
    out.sort(key=lambda x: x["distance_km"] if x["distance_km"] is not None else 1e9)
    return out


@router.post("/{schedule_id}/book", status_code=201)
def book(
    schedule_id: int,
    payload: BookSlotIn,
    user: User = Depends(require_role("collector")),
    db: Session = Depends(get_db),
):
    collector = collector_for(db, user)
    schedule = db.get(PickupSchedule, schedule_id)
    if not schedule or not schedule.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")

    lot = db.query(Lot).filter(Lot.lot_id == payload.lot_id).first()
    if not lot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No lot with ID {payload.lot_id}")
    if lot.collector_id != collector.collector_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This lot belongs to another collector")
    if lot.status not in OPEN_STATUSES or lot.recycler_id is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This lot already has a recycler")

    rec = db.get(Recycler, schedule.recycler_id)
    if lot.material_category != "Other" and lot.material_category not in (rec.accepted_materials or []):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"{rec.name} does not accept {lot.material_category}")

    try:
        occ = scheduling.validate_occurrence(schedule, payload.occurrence_date)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    if occ < date.today():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "occurrence_date is in the past")

    if scheduling.booked_count(db, schedule_id, payload.occurrence_date) >= schedule.capacity:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This round is fully booked — pick another date")

    booking, txn = scheduling.book_slot(db, schedule, lot, collector, payload.occurrence_date)
    return {
        **lot_dict(db, lot),
        "booking_id": booking.booking_id,
        "occurrence_date": booking.occurrence_date,
        "transaction_id": txn.transaction_id,
        "qr_payload": f"/verify/{lot.lot_id}",
    }


@router.post("/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: int, user: User = Depends(require_role("collector")),
                   db: Session = Depends(get_db)):
    collector = collector_for(db, user)
    booking = db.get(PickupBooking, booking_id)
    if not booking or booking.collector_id != collector.collector_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if booking.status != "BOOKED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Booking is already {booking.status}")
    lot = db.query(Lot).filter(Lot.lot_id == booking.lot_id).first()
    scheduling.cancel_booking(db, booking, lot)
    return {"booking_id": booking_id, "status": "CANCELLED"}
