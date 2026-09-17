from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Collector, Lot, LotEvent, LotGroup, Recycler

STATUS_FLOW = [
    "LOT_CREATED",
    "PRICE_ESTIMATED",
    "RECYCLER_MATCHED",
    "HANDOVER_PENDING",
    "RECYCLER_VERIFIED",
    "HANDED_OVER",
    "PAYMENT_PENDING",
    "PAID",
    "COMPLETED",
]


def next_lot_id(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"KC-{year}-"
    last = (
        db.query(Lot)
        .filter(Lot.lot_id.like(f"{prefix}%"))
        .order_by(Lot.lot_id.desc())
        .first()
    )
    seq = int(last.lot_id.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:06d}"


def next_group_id(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"GB-{year}-"
    last = (
        db.query(LotGroup)
        .filter(LotGroup.group_id.like(f"{prefix}%"))
        .order_by(LotGroup.group_id.desc())
        .first()
    )
    seq = int(last.group_id.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:06d}"


def next_handover_ref(db: Session) -> str:
    from ..models import Handover

    year = datetime.utcnow().year
    prefix = f"HR-{year}-"
    last = (
        db.query(Handover)
        .filter(Handover.reference_number.like(f"{prefix}%"))
        .order_by(Handover.reference_number.desc())
        .first()
    )
    seq = int(last.reference_number.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:05d}"


def log_event(db: Session, lot_id: str, status: str, note: str = "", actor: str = "system") -> None:
    db.add(LotEvent(lot_id=lot_id, status=status, note=note, actor=actor))


# Lot statuses reached only once a recycler has accepted the lot (see
# recyclers.py `decide_on_lot`). The collector's phone number is only ever
# handed to the recycler side from this point on.
CONTACT_VISIBLE_STATUSES = {
    "RECYCLER_VERIFIED", "HANDED_OVER", "PAYMENT_PENDING", "PAID", "COMPLETED",
}


def collector_dict(c: Collector) -> dict:
    return {
        "collector_id": c.collector_id,
        "display_name": c.display_name,
        "phone": c.phone,
        "language": c.language,
        "operating_location": c.operating_location,
        "latitude": c.latitude,
        "longitude": c.longitude,
        "authorization_status": c.authorization_status,
        "created_at": c.created_at,
    }


def recycler_dict(r: Recycler) -> dict:
    return {
        "recycler_id": r.recycler_id,
        "name": r.name,
        "location": r.location,
        "latitude": r.latitude,
        "longitude": r.longitude,
        "accepted_materials": r.accepted_materials or [],
        "authorization_id": r.authorization_id,
        "authorization_status": r.authorization_status,
        "contact": r.contact,
        "offered_rate": r.offered_rate or {},
        "pickup_available": r.pickup_available,
        "service_area_km": r.service_area_km,
        "rating": r.rating,
        "is_premium": bool(r.is_premium and r.premium_expires_at and r.premium_expires_at > datetime.utcnow()),
        "premium_expires_at": r.premium_expires_at,
    }


def lot_dict(db: Session, lot: Lot) -> dict:
    collector = db.get(Collector, lot.collector_id)
    recycler = db.get(Recycler, lot.recycler_id) if lot.recycler_id else None
    return {
        "lot_id": lot.lot_id,
        "collector_id": lot.collector_id,
        "collector_name": collector.display_name if collector else None,
        # Only revealed once a recycler has accepted this lot — see
        # CONTACT_VISIBLE_STATUSES above.
        "collector_contact": (
            collector.phone if collector and lot.status in CONTACT_VISIBLE_STATUSES else None
        ),
        "material_category": lot.material_category,
        "description": lot.description,
        "photo": lot.photo,
        "weight": lot.weight,
        "condition": lot.condition,
        "source_type": lot.source_type,
        "estimated_min": lot.estimated_min,
        "estimated_max": lot.estimated_max,
        "quoted_price": lot.quoted_price,
        "ai_prediction": lot.ai_prediction or {},
        "location": lot.location,
        "latitude": lot.latitude,
        "longitude": lot.longitude,
        "recycler_id": lot.recycler_id,
        "recycler_name": recycler.name if recycler else None,
        "match_score": lot.match_score,
        "status": lot.status,
        "created_at": lot.created_at,
        "auction_status": lot.auction_status,
        "auction_ends_at": lot.auction_ends_at,
        "group_id": lot.group_id,
        "group_accepted": lot.group_accepted,
    }
