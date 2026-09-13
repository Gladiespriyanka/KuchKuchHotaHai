"""Recycler subscription / priority access.

A premium facility (₹2,000/month, simulated here — there is no real payment
gateway in this prototype) sees a brand-new lot 2 hours before anyone else.
If no premium facility could even take the lot (none accept that material),
the exclusivity window is pointless, so it opens to everyone immediately.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..models import Lot, Recycler

PRIORITY_WINDOW = timedelta(hours=2)
SUBSCRIPTION_PRICE_INR = 2000
SUBSCRIPTION_DAYS = 30


def is_active(rec: Recycler) -> bool:
    return bool(rec.is_premium and rec.premium_expires_at and rec.premium_expires_at > datetime.utcnow())


def subscribe(db: Session, rec: Recycler) -> Recycler:
    rec.is_premium = True
    rec.premium_expires_at = datetime.utcnow() + timedelta(days=SUBSCRIPTION_DAYS)
    db.commit()
    db.refresh(rec)
    return rec


def cancel(db: Session, rec: Recycler) -> Recycler:
    rec.is_premium = False
    rec.premium_expires_at = None
    db.commit()
    db.refresh(rec)
    return rec


def _any_premium_covers(db: Session, material_category: str) -> bool:
    premium = (
        db.query(Recycler)
        .filter(
            Recycler.is_premium.is_(True),
            Recycler.authorization_status == "approved",
            Recycler.premium_expires_at > datetime.utcnow(),
        )
        .all()
    )
    return any(material_category in (r.accepted_materials or []) for r in premium)


def visible_to(db: Session, lot: Lot, rec: Recycler) -> bool:
    """Whether `rec` may currently see/bid on `lot` at all, independent of
    material/distance filters the caller already applies."""
    if is_active(rec):
        return True
    window_ends = lot.created_at + PRIORITY_WINDOW
    if datetime.utcnow() >= window_ends:
        return True
    # No premium facility exists that could even take this — don't make
    # everyone else wait on a head start nobody is using.
    return not _any_premium_covers(db, lot.material_category)


def window_ends_at(lot: Lot) -> datetime:
    return lot.created_at + PRIORITY_WINDOW
