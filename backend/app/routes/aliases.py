"""Endpoint aliases.

The primary API lives under /api/... . These aliases expose the exact paths
listed in the problem brief (POST /auth/login, GET /traceability/{lot_id},
and so on) so either shape works. They delegate to the same handlers — no
duplicated logic.
"""
from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Handover, Lot, Recycler, Transaction, User
from ..schemas.schemas import LoginIn, PaymentIn, HandoverIn, RecyclerProfileIn
from ..services import anomaly, pricing
from ..services.security import (
    collector_for, current_user, recycler_for, require_role,
)
from .admin import trace as admin_trace
from .auth import login as auth_login
from .lots import matches as lot_matches
from .prices import materials as list_materials
from .recyclers import update_profile as recycler_update
from .transactions import confirm_handover, earnings as collector_earnings, mark_paid

router = APIRouter(tags=["aliases"])


@router.post("/auth/login")
def login_alias(payload: LoginIn, db: Session = Depends(get_db)):
    return auth_login(payload, db)


@router.get("/materials")
def materials_alias(db: Session = Depends(get_db)):
    return list_materials(db)


@router.post("/lots/{lot_id}/price-estimate")
def price_estimate_alias(
    lot_id: str,
    user: User = Depends(require_role("collector", "recycler", "admin")),
    db: Session = Depends(get_db),
):
    """Recompute the fair-price range for an existing lot against today's rates."""
    lot = db.query(Lot).filter(Lot.lot_id == lot_id).first()
    if not lot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No lot with ID {lot_id}")
    if user.role == "collector":
        collector = collector_for(db, user)
        if lot.collector_id != collector.collector_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This lot belongs to another collector")
    result = pricing.estimate(
        db, lot.material_category, lot.weight, lot.condition, lot.source_type, lot.location
    )
    lot.estimated_min = result["estimated_min"]
    lot.estimated_max = result["estimated_max"]
    db.commit()
    result["lot_id"] = lot.lot_id
    result["informal_estimate"] = pricing.informal_benchmark(result["estimated_max"])
    return result


@router.get("/recyclers/match")
def match_alias(lot_id: str, user: User = Depends(require_role("collector")),
                db: Session = Depends(get_db)):
    return lot_matches(lot_id, user, db)


@router.put("/recyclers/{recycler_id}/rates")
def rates_alias(
    recycler_id: int,
    payload: RecyclerProfileIn,
    user: User = Depends(require_role("recycler")),
    db: Session = Depends(get_db),
):
    rec = recycler_for(db, user)
    if rec.recycler_id != recycler_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only update your own facility")
    return recycler_update(payload, user, db)


@router.post("/handover")
def handover_alias(payload: HandoverIn, user: User = Depends(require_role("recycler")),
                   db: Session = Depends(get_db)):
    return confirm_handover(payload, user, db)


@router.get("/handover/{reference}")
def handover_detail(reference: str, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    record = (
        db.query(Handover)
        .filter(
            (Handover.reference_number == reference)
            | (Handover.lot_id == reference)
        )
        .first()
    )
    if not record:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No handover record for {reference}")
    lot = db.query(Lot).filter(Lot.lot_id == record.lot_id).first()
    txn = db.get(Transaction, record.transaction_id)
    if user.role == "collector":
        collector = collector_for(db, user)
        if lot.collector_id != collector.collector_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This record belongs to another collector")
    recycler = db.get(Recycler, txn.recycler_id) if txn else None
    return {
        "reference_number": record.reference_number,
        "lot_id": record.lot_id,
        "material": lot.material_category if lot else None,
        "photo": record.photo,
        "weight": record.weight,
        "collection_timestamp": lot.created_at if lot else None,
        "collection_location": txn.collection_location if txn else None,
        "handover_location": txn.handover_location if txn else None,
        "gps_location": record.gps_location,
        "recycler": recycler.name if recycler else None,
        "quoted_price": txn.quoted_price if txn else None,
        "final_price": txn.final_price if txn else None,
        "payment_status": txn.payment_status if txn else None,
        "transaction_status": txn.transaction_status if txn else None,
        "recycler_confirmation": record.recycler_confirmation,
        "status": record.status,
        "timestamp": record.timestamp,
    }


@router.post("/payments")
def payments_alias(payload: PaymentIn, user: User = Depends(require_role("recycler")),
                   db: Session = Depends(get_db)):
    return mark_paid(payload, user, db)


@router.get("/collector/earnings")
def earnings_alias(user: User = Depends(require_role("collector")),
                   db: Session = Depends(get_db)):
    return collector_earnings(user, db)


@router.get("/transactions")
def transactions_alias(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Role-scoped transaction list."""
    q = db.query(Transaction)
    if user.role == "collector":
        q = q.filter(Transaction.collector_id == collector_for(db, user).collector_id)
    elif user.role == "recycler":
        q = q.filter(Transaction.recycler_id == recycler_for(db, user).recycler_id)
    rows = q.order_by(Transaction.created_at.desc()).limit(200).all()
    return [
        {
            "transaction_id": t.transaction_id, "lot_id": t.lot_id,
            "quoted_price": t.quoted_price, "final_price": t.final_price,
            "final_weight": t.final_weight, "payment_status": t.payment_status,
            "transaction_status": t.transaction_status, "anomaly_flag": t.anomaly_flag,
            "created_at": t.created_at, "updated_at": t.updated_at,
        }
        for t in rows
    ]


@router.get("/traceability/{lot_id}")
def traceability_alias(lot_id: str, user: User = Depends(require_role("admin")),
                       db: Session = Depends(get_db)):
    return admin_trace(lot_id, user, db)


@router.post("/ai/anomaly-detection")
def anomaly_alias(payload: dict = Body(...), db: Session = Depends(get_db)):
    """Rule/statistics check for a proposed transaction, callable before it is saved."""
    category = payload.get("material_category")
    if not category:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "material_category is required")
    final_price = float(payload.get("final_price", 0))
    final_weight = float(payload.get("final_weight", 0))
    declared = float(payload.get("declared_weight", 0))
    flagged, reason = anomaly.check(db, category, final_price, final_weight, declared)
    stats = pricing.current_range(db, category)
    return {
        "anomaly": flagged,
        "reason": reason,
        "rate": round(final_price / final_weight, 2) if final_weight else 0,
        "historical_range": {"min": stats["min_price"], "max": stats["max_price"]},
        "method": "z-score against the last 45 days of recorded prices, plus a "
                  "declared-vs-final weight check",
    }
