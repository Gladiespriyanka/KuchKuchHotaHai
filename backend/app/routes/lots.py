from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Collector, Lot, Recycler, Transaction, User
from ..schemas.schemas import LotCreateIn, SelectRecyclerIn, SyncLotsIn
from ..services import anomaly, auction, grouping, matching, pricing
from ..services.common import lot_dict, log_event, next_lot_id, recycler_dict
from ..services.security import collector_for, current_user, require_role

router = APIRouter(prefix="/api/lots", tags=["lots"])


def _create_lot(db: Session, collector: Collector, payload: LotCreateIn) -> Lot:
    if payload.client_ref:
        existing = db.query(Lot).filter(Lot.client_ref == payload.client_ref).first()
        if existing:
            return existing  # idempotent offline sync

    location = payload.location or collector.operating_location
    est = pricing.estimate(
        db, payload.material_category, payload.weight, payload.condition,
        payload.source_type, location,
    )
    lot = Lot(
        lot_id=next_lot_id(db),
        collector_id=collector.collector_id,
        material_category=payload.material_category,
        description=payload.description,
        photo=payload.photo,
        weight=payload.weight,
        condition=payload.condition,
        source_type=payload.source_type,
        estimated_min=est["estimated_min"],
        estimated_max=est["estimated_max"],
        ai_prediction=payload.ai_prediction,
        location=location,
        latitude=payload.latitude or collector.latitude,
        longitude=payload.longitude or collector.longitude,
        status="PRICE_ESTIMATED",
        client_ref=payload.client_ref,
    )
    if payload.auction_minutes:
        lot.auction_status = "open"
        lot.auction_ends_at = datetime.utcnow() + timedelta(minutes=payload.auction_minutes)
    db.add(lot)
    db.flush()
    log_event(db, lot.lot_id, "LOT_CREATED", f"{payload.weight} kg {payload.material_category}",
              actor=collector.display_name)
    log_event(db, lot.lot_id, "PRICE_ESTIMATED",
              f"₹{est['estimated_min']:.0f} – ₹{est['estimated_max']:.0f}")
    if payload.auction_minutes:
        log_event(db, lot.lot_id, "AUCTION_STARTED",
                  f"Reverse auction open for {payload.auction_minutes} min — "
                  "recyclers bid, the highest bid at the deadline wins",
                  actor=collector.display_name)
    return lot


@router.post("", status_code=201)
def create_lot(
    payload: LotCreateIn,
    user: User = Depends(require_role("collector")),
    db: Session = Depends(get_db),
):
    collector = collector_for(db, user)
    lot = _create_lot(db, collector, payload)
    db.commit()
    db.refresh(lot)
    return lot_dict(db, lot)


@router.post("/sync", status_code=201)
def sync_lots(
    payload: SyncLotsIn,
    user: User = Depends(require_role("collector")),
    db: Session = Depends(get_db),
):
    """Bulk upload of lots drafted while the collector was offline."""
    collector = collector_for(db, user)
    created = [lot_dict(db, _create_lot(db, collector, item)) for item in payload.lots]
    db.commit()
    return {"synced": len(created), "lots": created}


@router.get("")
def my_lots(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "collector":
        collector = collector_for(db, user)
        q = db.query(Lot).filter(Lot.collector_id == collector.collector_id)
    elif user.role == "recycler":
        rec = db.query(Recycler).filter(Recycler.user_id == user.id).first()
        q = db.query(Lot).filter(Lot.recycler_id == rec.recycler_id)
    else:
        q = db.query(Lot)
    rows = q.order_by(Lot.created_at.desc()).limit(100).all()
    for lot in rows:
        auction.resolve_if_expired(db, lot)
    return [lot_dict(db, lot) for lot in rows]


@router.get("/{lot_id}")
def lot_detail(lot_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.lot_id == lot_id).first()
    if not lot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No lot with ID {lot_id}")
    auction.resolve_if_expired(db, lot)
    group = None
    if user.role == "collector":
        collector = collector_for(db, user)
        if lot.collector_id != collector.collector_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This lot belongs to another collector")
        # Bulk-aggregation suggestions are collector-facing only — the owner
        # of the lot is the one who decides whether to combine it.
        group = grouping.suggestion_for(db, lot)
    data = lot_dict(db, lot)
    data["group"] = group
    txn = db.query(Transaction).filter(Transaction.lot_id == lot_id).first()
    data["transaction"] = (
        {
            "transaction_id": txn.transaction_id,
            "quoted_price": txn.quoted_price,
            "final_price": txn.final_price,
            "final_weight": txn.final_weight,
            "payment_status": txn.payment_status,
            "transaction_status": txn.transaction_status,
            "anomaly_flag": txn.anomaly_flag,
            "anomaly_reason": txn.anomaly_reason,
        }
        if txn
        else None
    )
    data["timeline"] = [
        {"status": e.status, "note": e.note, "actor": e.actor, "at": e.created_at}
        for e in lot.events
    ]
    # Collector-facing fairness check, present once the recycler has entered
    # final figures. The collector's phone speaks a warning if it is not ok.
    data["fairness"] = (
        anomaly.fairness(db, lot.material_category, lot.weight,
                         txn.final_weight, txn.final_price)
        if txn and txn.final_weight else None
    )
    return data


@router.get("/{lot_id}/matches")
def matches(lot_id: str, user: User = Depends(require_role("collector")),
            db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.lot_id == lot_id).first()
    if not lot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No lot with ID {lot_id}")
    collector = collector_for(db, user)
    if lot.collector_id != collector.collector_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This lot belongs to another collector")

    ranked = matching.match_recyclers(db, lot)
    informal = pricing.informal_benchmark(lot.estimated_max)
    return {
        "lot_id": lot.lot_id,
        "weights": matching.WEIGHTS,
        "informal_estimate": informal,
        "matches": [
            {
                **recycler_dict(m["recycler"]),
                "distance_km": m["distance_km"],
                "rate_for_material": m["rate_for_material"],
                "offer_value": m["offer_value"],
                "match_score": m["match_score"],
                "breakdown": m["breakdown"],
                "out_of_service_area": m.get("out_of_service_area", False),
                "distance_basis": m.get("distance_basis", "gps"),
                "extra_vs_informal": round(m["offer_value"] - informal),
            }
            for m in ranked
        ],
        "note": "Only recyclers with an approved authorisation record are listed. "
                "Demo/prototype data.",
    }


@router.post("/{lot_id}/select-recycler")
def select_recycler(
    lot_id: str,
    payload: SelectRecyclerIn,
    user: User = Depends(require_role("collector")),
    db: Session = Depends(get_db),
):
    lot = db.query(Lot).filter(Lot.lot_id == lot_id).first()
    if not lot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No lot with ID {lot_id}")
    collector = collector_for(db, user)
    if lot.collector_id != collector.collector_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This lot belongs to another collector")
    if lot.status not in ("LOT_CREATED", "PRICE_ESTIMATED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "This lot already has a recycler assigned")
    if lot.auction_status == "open":
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "This lot is in a live auction — wait for a bid to win, "
                            "or accept one early from the offers list")
    if lot.group_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "This lot is part of a group-buying suggestion — "
                            "accept or decline it first")

    recycler = db.get(Recycler, payload.recycler_id)
    if not recycler or recycler.authorization_status != "approved":
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "That recycler is not authorised on the platform")
    if lot.material_category not in (recycler.accepted_materials or []):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"{recycler.name} does not accept {lot.material_category}")

    ranked = {m["recycler"].recycler_id: m for m in matching.match_recyclers(db, lot, limit=20)}
    picked = ranked.get(recycler.recycler_id)
    rate = float((recycler.offered_rate or {}).get(lot.material_category, 0))
    lot.quoted_price = round(rate * lot.weight)
    lot.recycler_id = recycler.recycler_id
    lot.match_score = picked["match_score"] if picked else 0
    lot.status = "HANDOVER_PENDING"

    txn = Transaction(
        lot_id=lot.lot_id,
        collector_id=lot.collector_id,
        recycler_id=recycler.recycler_id,
        quoted_price=lot.quoted_price,
        collection_location=lot.location,
        transaction_status="RECYCLER_MATCHED",
        payment_status="PENDING",
    )
    db.add(txn)
    log_event(db, lot.lot_id, "RECYCLER_MATCHED",
              f"{recycler.name} at ₹{rate:.0f}/kg", actor=collector.display_name)
    log_event(db, lot.lot_id, "HANDOVER_PENDING", "Waiting for recycler to scan the lot QR")
    db.commit()
    db.refresh(lot)
    return {
        **lot_dict(db, lot),
        "qr_payload": f"/verify/{lot.lot_id}",
        "transaction_id": txn.transaction_id,
    }


def _owned_group_lot(db: Session, lot_id: str, user: User) -> Lot:
    lot = db.query(Lot).filter(Lot.lot_id == lot_id).first()
    if not lot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No lot with ID {lot_id}")
    collector = collector_for(db, user)
    if lot.collector_id != collector.collector_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This lot belongs to another collector")
    if not lot.group_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This lot has no group-buying suggestion")
    return lot


@router.post("/{lot_id}/group/accept")
def accept_group(lot_id: str, user: User = Depends(require_role("collector")),
                 db: Session = Depends(get_db)):
    lot = _owned_group_lot(db, lot_id, user)
    return grouping.accept(db, lot)


@router.post("/{lot_id}/group/decline")
def decline_group(lot_id: str, user: User = Depends(require_role("collector")),
                  db: Session = Depends(get_db)):
    lot = _owned_group_lot(db, lot_id, user)
    grouping.decline(db, lot)
    return {"status": "DECLINED"}
