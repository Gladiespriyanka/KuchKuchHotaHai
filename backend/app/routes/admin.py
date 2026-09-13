from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Collector, Handover, Lot, LotEvent, Payment, Recycler, Transaction, User,
)
from ..services import pricing
from ..services.common import lot_dict, recycler_dict
from ..services.security import require_role

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats")
def stats(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    lots = db.query(Lot).all()
    txns = db.query(Transaction).all()
    completed = [t for t in txns if t.transaction_status == "COMPLETED"]
    recyclers = db.query(Recycler).all()
    total_kg = sum(t.final_weight for t in completed) + sum(
        l.weight for l in lots if l.status not in ("COMPLETED",)
    )
    return {
        "collectors": db.query(Collector).count(),
        "recyclers": len(recyclers),
        "authorized_recyclers": len([r for r in recyclers if r.authorization_status == "approved"]),
        "pending_recyclers": len([r for r in recyclers if r.authorization_status == "pending"]),
        "total_lots": len(lots),
        "total_kg": round(total_kg, 1),
        "total_tons": round(total_kg / 1000, 2),
        "formal_transactions": len(completed),
        "pending_transactions": len([t for t in txns if t.payment_status != "PAID"]),
        "total_value": round(sum(t.final_price for t in completed)),
        "anomalies": len([t for t in txns if t.anomaly_flag]),
    }


@router.get("/charts")
def charts(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    lots = db.query(Lot).all()
    txns = db.query(Transaction).all()

    material_mix = defaultdict(float)
    for lot in lots:
        material_mix[lot.material_category] += lot.weight

    monthly = defaultdict(lambda: {"kg": 0.0, "value": 0.0, "count": 0})
    for t in txns:
        when = t.updated_at or t.created_at
        key = when.strftime("%b %Y")
        monthly[key]["kg"] += t.final_weight
        monthly[key]["value"] += t.final_price
        monthly[key]["count"] += 1

    ordered = sorted(monthly.items(), key=lambda kv: datetime.strptime(kv[0], "%b %Y"))[-8:]
    paid = len([t for t in txns if t.payment_status == "PAID"])

    trends = {}
    for category in {l.material_category for l in lots}:
        trends[category] = pricing.history(db, category, 45)

    return {
        "material_distribution": [
            {"category": k, "kg": round(v, 1)}
            for k, v in sorted(material_mix.items(), key=lambda kv: -kv[1])
        ],
        "monthly": [
            {"month": k, "kg": round(v["kg"], 1), "value": round(v["value"]), "count": v["count"]}
            for k, v in ordered
        ],
        "payment_status": [
            {"name": "Paid", "value": paid},
            {"name": "Pending", "value": len(txns) - paid},
        ],
        "price_trends": trends,
    }


@router.get("/recyclers")
def all_recyclers(status_filter: str | None = None,
                  user: User = Depends(require_role("admin")),
                  db: Session = Depends(get_db)):
    q = db.query(Recycler)
    if status_filter:
        q = q.filter(Recycler.authorization_status == status_filter)
    return [
        {**recycler_dict(r), "documents_note": r.documents_note}
        for r in q.order_by(Recycler.recycler_id).all()
    ]


@router.post("/recyclers/{recycler_id}/verify")
def verify_recycler(recycler_id: int, decision: str,
                    user: User = Depends(require_role("admin")),
                    db: Session = Depends(get_db)):
    if decision not in ("approved", "rejected"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "decision must be approved or rejected")
    rec = db.get(Recycler, recycler_id)
    if not rec:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recycler not found")
    rec.authorization_status = decision
    db.commit()
    return recycler_dict(rec)


@router.get("/anomalies")
def anomalies(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    rows = db.query(Transaction).filter(Transaction.anomaly_flag.is_(True)).all()
    out = []
    for t in rows:
        lot = db.query(Lot).filter(Lot.lot_id == t.lot_id).first()
        rec = db.get(Recycler, t.recycler_id)
        out.append({
            "transaction_id": t.transaction_id,
            "lot_id": t.lot_id,
            "material": lot.material_category if lot else "",
            "final_weight": t.final_weight,
            "final_price": t.final_price,
            "rate": round(t.final_price / t.final_weight, 1) if t.final_weight else 0,
            "recycler": rec.name if rec else "",
            "reason": t.anomaly_reason,
            "at": t.updated_at,
        })
    return out


@router.get("/transactions")
def all_transactions(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    rows = db.query(Transaction).order_by(Transaction.created_at.desc()).limit(200).all()
    out = []
    for t in rows:
        lot = db.query(Lot).filter(Lot.lot_id == t.lot_id).first()
        rec = db.get(Recycler, t.recycler_id)
        col = db.get(Collector, t.collector_id)
        out.append({
            "transaction_id": t.transaction_id, "lot_id": t.lot_id,
            "material": lot.material_category if lot else "",
            "collector": col.display_name if col else "",
            "recycler": rec.name if rec else "",
            "quoted_price": t.quoted_price, "final_price": t.final_price,
            "final_weight": t.final_weight, "payment_status": t.payment_status,
            "transaction_status": t.transaction_status, "anomaly_flag": t.anomaly_flag,
            "created_at": t.created_at,
        })
    return out


@router.get("/prices")
def price_dataset(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    from ..models import Price

    since = datetime.utcnow() - timedelta(days=10)
    rows = (
        db.query(Price).filter(Price.date >= since)
        .order_by(Price.date.desc()).limit(150).all()
    )
    return [
        {
            "price_id": p.price_id, "material_category": p.material_category,
            "location": p.location, "date": p.date, "buying_price": p.buying_price,
            "selling_price": p.selling_price, "unit": p.unit,
            "recycler_id": p.recycler_id, "source": p.source,
        }
        for p in rows
    ]


@router.get("/map")
def map_points(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    recyclers = [
        {"type": "recycler", "name": r.name, "lat": r.latitude, "lng": r.longitude,
         "status": r.authorization_status, "location": r.location}
        for r in db.query(Recycler).all()
    ]
    lots = [
        {"type": "lot", "name": l.lot_id, "lat": l.latitude, "lng": l.longitude,
         "material": l.material_category, "status": l.status}
        for l in db.query(Lot).order_by(Lot.created_at.desc()).limit(60).all()
        if l.latitude
    ]
    return {"recyclers": recyclers, "lots": lots}


@router.get("/trace/{lot_id}")
def trace(lot_id: str, user: User = Depends(require_role("admin")),
          db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.lot_id == lot_id.strip().upper()).first()
    if not lot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No lot with ID {lot_id}")
    collector = db.get(Collector, lot.collector_id)
    recycler = db.get(Recycler, lot.recycler_id) if lot.recycler_id else None
    txn = db.query(Transaction).filter(Transaction.lot_id == lot.lot_id).first()
    handover = db.query(Handover).filter(Handover.lot_id == lot.lot_id).first()
    payment = (
        db.query(Payment).filter(Payment.transaction_id == txn.transaction_id).first()
        if txn else None
    )
    events = (
        db.query(LotEvent).filter(LotEvent.lot_id == lot.lot_id)
        .order_by(LotEvent.created_at).all()
    )
    return {
        "lot": lot_dict(db, lot),
        "collector": {
            "collector_id": collector.collector_id, "name": collector.display_name,
            "location": collector.operating_location, "language": collector.language,
        } if collector else None,
        "recycler": recycler_dict(recycler) if recycler else None,
        "transaction": {
            "transaction_id": txn.transaction_id, "quoted_price": txn.quoted_price,
            "final_price": txn.final_price, "final_weight": txn.final_weight,
            "payment_status": txn.payment_status, "transaction_status": txn.transaction_status,
            "collection_location": txn.collection_location,
            "handover_location": txn.handover_location,
            "anomaly_flag": txn.anomaly_flag, "anomaly_reason": txn.anomaly_reason,
        } if txn else None,
        "handover": {
            "reference_number": handover.reference_number, "weight": handover.weight,
            "gps_location": handover.gps_location, "status": handover.status,
            "timestamp": handover.timestamp,
        } if handover else None,
        "payment": {
            "payment_id": payment.payment_id, "amount": payment.amount,
            "mode": payment.mode, "status": payment.status, "timestamp": payment.timestamp,
        } if payment else None,
        "timeline": [
            {"status": e.status, "note": e.note, "actor": e.actor, "at": e.created_at}
            for e in events
        ],
    }
