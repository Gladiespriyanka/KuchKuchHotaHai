from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Handover, Lot, Payment, Price, Recycler, Transaction, User
from ..schemas.schemas import RecyclerProfileIn
from ..services import auction, matching, premium
from ..services.common import lot_dict, log_event, recycler_dict
from ..services.security import current_user, recycler_for, require_role

router = APIRouter(prefix="/api/recyclers", tags=["recyclers"])


@router.get("")
def list_recyclers(
    lat: float | None = None,
    lng: float | None = None,
    material: str | None = None,
    db: Session = Depends(get_db),
):
    """Public directory — approved recyclers only."""

    rows = db.query(Recycler).filter(Recycler.authorization_status == "approved").all()

    out = []

    for r in rows:

        if material and material not in (r.accepted_materials or []):
            continue

        item = recycler_dict(r)

        if (
            lat is not None
            and lng is not None
            and r.latitude is not None
            and r.longitude is not None
        ):
            item["distance_km"] = matching.haversine_km(
                lat,
                lng,
                r.latitude,
                r.longitude,
            )

        out.append(item)

    out.sort(key=lambda x: x.get("distance_km", 0))

    return out


@router.get("/me")
def my_profile(user: User = Depends(require_role("recycler")), db: Session = Depends(get_db)):
    return recycler_dict(recycler_for(db, user))


@router.put("/me")
def update_profile(
    payload: RecyclerProfileIn,
    user: User = Depends(require_role("recycler")),
    db: Session = Depends(get_db),
):
    rec = recycler_for(db, user)
    data = payload.model_dump(exclude_none=True)

    if "offered_rate" in data:
        new_rates = {k: float(v) for k, v in data["offered_rate"].items() if float(v) > 0}
        old_rates = rec.offered_rate or {}
        # A rate change writes a new price observation: the dataset stays live.
        for category, rate in new_rates.items():
            if float(old_rates.get(category, -1)) != rate:
                db.add(Price(
                    material_category=category, location=rec.location,
                    date=datetime.utcnow(), buying_price=rate,
                    selling_price=round(rate * 1.18, 2), unit="kg",
                    recycler_id=rec.recycler_id, source="recycler_update",
                ))
        data["offered_rate"] = new_rates

    for key, value in data.items():
        setattr(rec, key, value)
    db.commit()
    return recycler_dict(rec)


@router.post("/me/subscribe")
def subscribe(user: User = Depends(require_role("recycler")), db: Session = Depends(get_db)):
    """Activate priority access (₹2,000/month, simulated — no real payment
    gateway in this prototype)."""
    rec = recycler_for(db, user)
    premium.subscribe(db, rec)
    return recycler_dict(rec)


@router.post("/me/subscribe/cancel")
def cancel_subscription(user: User = Depends(require_role("recycler")), db: Session = Depends(get_db)):
    rec = recycler_for(db, user)
    premium.cancel(db, rec)
    return recycler_dict(rec)


@router.get("/me/dashboard")
def dashboard(user: User = Depends(require_role("recycler")), db: Session = Depends(get_db)):
    rec = recycler_for(db, user)
    lots = db.query(Lot).filter(Lot.recycler_id == rec.recycler_id).all()
    today = datetime.utcnow().date()
    txns = db.query(Transaction).filter(Transaction.recycler_id == rec.recycler_id).all()
    completed = [t for t in txns if t.transaction_status == "COMPLETED"]
    today_kg = sum(
        t.final_weight for t in txns if t.updated_at and t.updated_at.date() == today
    )
    premium_locked = 0
    if not premium.is_active(rec):
        accepted = set(rec.accepted_materials or [])
        candidates = (
            db.query(Lot)
            .filter(Lot.status.in_(("LOT_CREATED", "PRICE_ESTIMATED")), Lot.recycler_id.is_(None))
            .all()
        )
        for lot in candidates:
            if lot.material_category != "Other" and lot.material_category not in accepted:
                continue
            if not premium.visible_to(db, lot, rec):
                premium_locked += 1
    return {
        "recycler": recycler_dict(rec),
        "cards": {
            "active_lots": len([l for l in lots if l.status in
                                ("HANDOVER_PENDING", "RECYCLER_VERIFIED")]),
            "today_collection_kg": round(today_kg, 1),
            "pending_handover": len([l for l in lots if l.status == "HANDOVER_PENDING"]),
            "completed": len(completed),
            "total_paid": round(sum(t.final_price for t in completed)),
            "premium_locked_lots": premium_locked,
        },
        "incoming": [
            lot_dict(db, l) for l in
            sorted([l for l in lots if l.status in ("HANDOVER_PENDING", "RECYCLER_VERIFIED")],
                   key=lambda x: x.created_at, reverse=True)
        ],
        "recent": [
            {
                "transaction_id": t.transaction_id, "lot_id": t.lot_id,
                "final_price": t.final_price, "final_weight": t.final_weight,
                "payment_status": t.payment_status, "status": t.transaction_status,
                "at": t.updated_at,
            }
            for t in sorted(txns, key=lambda x: x.updated_at or x.created_at, reverse=True)[:15]
        ],
    }


@router.post("/me/lots/{lot_id}/decision")
def decide_on_lot(
    lot_id: str,
    decision: str,
    user: User = Depends(require_role("recycler")),
    db: Session = Depends(get_db),
):
    """Accept or reject a lot the collector routed to this facility.

    Rejecting releases the lot: the assignment and its transaction are removed
    so the collector can pick another authorised recycler.
    """
    if decision not in ("accept", "reject"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "decision must be accept or reject")
    rec = recycler_for(db, user)
    lot = db.query(Lot).filter(Lot.lot_id == lot_id).first()
    if not lot or lot.recycler_id != rec.recycler_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lot not found for your facility")
    if lot.status not in ("HANDOVER_PENDING", "RECYCLER_VERIFIED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Lot is in status {lot.status} and cannot be changed")
    txn = db.query(Transaction).filter(Transaction.lot_id == lot_id).first()

    if decision == "accept":
        lot.status = "RECYCLER_VERIFIED"
        if txn:
            txn.transaction_status = "ACCEPTED"
            txn.updated_at = datetime.utcnow()
        log_event(db, lot_id, "RECYCLER_VERIFIED", f"{rec.name} accepted the lot", actor=rec.name)
    else:
        lot.recycler_id = None
        lot.quoted_price = 0
        lot.match_score = 0
        lot.status = "PRICE_ESTIMATED"
        if txn:
            db.delete(txn)
        log_event(db, lot_id, "PRICE_ESTIMATED",
                  f"{rec.name} could not take this lot — choose another recycler",
                  actor=rec.name)
    db.commit()
    return {"lot_id": lot_id, "decision": decision, "status": lot.status}


@router.get("/verify/{lot_id}")
def verify_lot(
    lot_id: str,
    user: User = Depends(require_role("recycler", "admin")),
    db: Session = Depends(get_db),
):
    """Target of the QR code. The QR carries only /verify/<lot id>; every
    detail below is fetched fresh from the database."""
    lot = db.query(Lot).filter(Lot.lot_id == lot_id).first()
    if not lot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No lot with ID {lot_id}")
    if user.role == "recycler":
        rec = recycler_for(db, user)
        if lot.recycler_id != rec.recycler_id:
            # An unassigned live auction is intentionally readable by every
            # eligible bidder. QR verification remains private once a lot is
            # assigned to a recycler.
            auction.resolve_if_expired(db, lot)
            if lot.auction_status != "open":
                raise HTTPException(status.HTTP_403_FORBIDDEN,
                                    "This lot was assigned to a different recycler")
            if rec.authorization_status != "approved":
                raise HTTPException(status.HTTP_403_FORBIDDEN,
                                    "Only authorised facilities can view this auction")
            # A live auction is intentionally visible to every approved
            # recycler. Material/profile restrictions are enforced by the
            # bidding endpoint, not by auction visibility.
            if lot.auction_status != "open" and lot.material_category != "Other" and lot.material_category not in (rec.accepted_materials or []):
                raise HTTPException(status.HTTP_403_FORBIDDEN,
                                    f"Your facility does not accept {lot.material_category}")
    txn = db.query(Transaction).filter(Transaction.lot_id == lot_id).first()
    handover = db.query(Handover).filter(Handover.lot_id == lot_id).first()
    payment = (
        db.query(Payment).filter(Payment.transaction_id == txn.transaction_id).first()
        if txn else None
    )
    return {
        "lot": lot_dict(db, lot),
        "transaction": {
            "transaction_id": txn.transaction_id,
            "quoted_price": txn.quoted_price,
            "final_price": txn.final_price,
            "final_weight": txn.final_weight,
            "payment_status": txn.payment_status,
            "transaction_status": txn.transaction_status,
            "anomaly_flag": txn.anomaly_flag,
            "anomaly_reason": txn.anomaly_reason,
        } if txn else None,
        "handover": {
            "reference_number": handover.reference_number,
            "weight": handover.weight,
            "status": handover.status,
            "gps_location": handover.gps_location,
            "timestamp": handover.timestamp,
        } if handover else None,
        "payment": {
            "mode": payment.mode, "amount": payment.amount,
            "status": payment.status, "timestamp": payment.timestamp,
        } if payment else None,
        "timeline": [
            {"status": e.status, "note": e.note, "actor": e.actor, "at": e.created_at}
            for e in lot.events
        ],
    }
