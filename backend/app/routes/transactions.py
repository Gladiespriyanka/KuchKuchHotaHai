from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Handover, Lot, Payment, Transaction, User
from ..schemas.schemas import HandoverIn, PaymentIn
from ..services import anomaly
from ..services.common import log_event, next_handover_ref
from ..services.security import collector_for, current_user, recycler_for, require_role

router = APIRouter(prefix="/api", tags=["transactions"])


@router.post("/handovers", status_code=201)
def confirm_handover(
    payload: HandoverIn,
    user: User = Depends(require_role("recycler")),
    db: Session = Depends(get_db),
):
    rec = recycler_for(db, user)
    lot = db.query(Lot).filter(Lot.lot_id == payload.lot_id).first()
    if not lot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No lot with ID {payload.lot_id}")
    if lot.recycler_id != rec.recycler_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "This lot was assigned to a different recycler")
    if lot.status not in ("HANDOVER_PENDING", "RECYCLER_VERIFIED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Lot is in status {lot.status} and cannot be handed over")

    txn = db.query(Transaction).filter(Transaction.lot_id == lot.lot_id).first()
    if not txn:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No transaction found for this lot")

    flagged, reason = anomaly.check(
        db, lot.material_category, payload.final_price, payload.final_weight, lot.weight
    )
    ref = next_handover_ref(db)
    handover = Handover(
        reference_number=ref,
        lot_id=lot.lot_id,
        transaction_id=txn.transaction_id,
        photo=lot.photo,
        scale_photo=payload.scale_photo,
        weight=payload.final_weight,
        gps_location=payload.gps_location or f"{rec.latitude:.4f},{rec.longitude:.4f}",
        recycler_confirmation=True,
        status="VERIFIED",
        timestamp=datetime.utcnow(),
    )
    db.add(handover)

    txn.final_weight = payload.final_weight
    txn.final_price = payload.final_price
    txn.handover_location = payload.handover_location or rec.location
    txn.transaction_status = "HANDED_OVER"
    txn.payment_status = "PENDING"
    txn.anomaly_flag = flagged
    txn.anomaly_reason = reason
    txn.updated_at = datetime.utcnow()

    lot.status = "PAYMENT_PENDING"
    log_event(db, lot.lot_id, "RECYCLER_VERIFIED", f"QR verified by {rec.name}", actor=rec.name)
    log_event(db, lot.lot_id, "HANDED_OVER",
              f"{payload.final_weight} kg at ₹{payload.final_price:.0f} · ref {ref}", actor=rec.name)
    log_event(db, lot.lot_id, "PAYMENT_PENDING", "Awaiting payment confirmation")
    if flagged:
        log_event(db, lot.lot_id, "ANOMALY_FLAGGED", reason, actor="anomaly-service")
    db.commit()
    return {
        "handover_id": handover.handover_id,
        "reference_number": ref,
        "lot_id": lot.lot_id,
        "material": lot.material_category,
        "declared_weight": lot.weight,
        "final_weight": payload.final_weight,
        "quoted_price": txn.quoted_price,
        "final_price": payload.final_price,
        "collection_location": txn.collection_location,
        "handover_location": txn.handover_location,
        "recycler": rec.name,
        "status": "VERIFIED",
        "scale_photo": bool(payload.scale_photo),
        "transaction_id": txn.transaction_id,
        "anomaly_flag": flagged,
        "anomaly_reason": reason,
        "timestamp": handover.timestamp,
    }


@router.post("/payments", status_code=201)
def mark_paid(
    payload: PaymentIn,
    user: User = Depends(require_role("recycler")),
    db: Session = Depends(get_db),
):
    rec = recycler_for(db, user)
    txn = db.get(Transaction, payload.transaction_id)
    if not txn or txn.recycler_id != rec.recycler_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found for your facility")
    if txn.payment_status == "PAID":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This transaction is already paid")
    if txn.transaction_status != "HANDED_OVER":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Confirm the handover before payment")

    payment = Payment(
        transaction_id=txn.transaction_id, amount=txn.final_price,
        mode=payload.mode, status="PAID", timestamp=datetime.utcnow(),
    )
    db.add(payment)
    txn.payment_status = "PAID"
    txn.transaction_status = "COMPLETED"
    txn.updated_at = datetime.utcnow()

    lot = db.query(Lot).filter(Lot.lot_id == txn.lot_id).first()
    lot.status = "COMPLETED"
    log_event(db, lot.lot_id, "PAID", f"₹{txn.final_price:.0f} via {payload.mode.upper()}",
              actor=rec.name)
    log_event(db, lot.lot_id, "COMPLETED", "Traceability record closed")
    db.commit()

    # Real transactions become training data: appended to
    # data/scrap_transactions.csv so the estimator can eventually be retrained
    # on actual platform history instead of synthetic rows.
    try:
        import sys
        from pathlib import Path
        ml_dir = Path(__file__).resolve().parents[3] / "ml"
        if str(ml_dir) not in sys.path:
            sys.path.insert(0, str(ml_dir))
        import predict as scrap_ml
        scrap_ml.log_transaction(
            transaction_id=txn.transaction_id, material=lot.material_category,
            category="E-waste", locality=txn.collection_location,
            quantity=txn.final_weight, unit="kg",
            offered_price=txn.quoted_price, final_price=txn.final_price,
            quality=lot.condition, collector_type="informal_collector",
            source="kabadiwala-connect-platform",
        )
    except Exception:
        pass  # logging training data must never break a payment

    return {
        "payment_id": payment.payment_id, "transaction_id": txn.transaction_id,
        "amount": payment.amount, "mode": payment.mode, "status": payment.status,
        "lot_id": txn.lot_id, "transaction_status": txn.transaction_status,
    }


@router.get("/earnings")
def earnings(user: User = Depends(require_role("collector")), db: Session = Depends(get_db)):
    collector = collector_for(db, user)
    txns = (
        db.query(Transaction)
        .filter(Transaction.collector_id == collector.collector_id)
        .order_by(Transaction.created_at.desc())
        .all()
    )
    now = datetime.utcnow()
    paid = [t for t in txns if t.payment_status == "PAID"]
    pending = [t for t in txns if t.payment_status != "PAID" and t.transaction_status
               in ("HANDED_OVER", "RECYCLER_VERIFIED")]
    this_month = [t for t in paid if t.updated_at and t.updated_at.year == now.year
                  and t.updated_at.month == now.month]
    rows = []
    for t in txns:
        lot = db.query(Lot).filter(Lot.lot_id == t.lot_id).first()
        rows.append({
            "lot_id": t.lot_id,
            "material": lot.material_category if lot else "",
            "weight": t.final_weight or (lot.weight if lot else 0),
            "amount": t.final_price or t.quoted_price,
            "payment_status": t.payment_status,
            "transaction_status": t.transaction_status,
            "date": t.updated_at or t.created_at,
        })
    return {
        "total_earnings": round(sum(t.final_price for t in paid)),
        "this_month": round(sum(t.final_price for t in this_month)),
        "pending": round(sum(t.final_price or t.quoted_price for t in pending)),
        "total_weight_kg": round(sum(t.final_weight for t in paid), 1),
        "transactions": rows,
    }
