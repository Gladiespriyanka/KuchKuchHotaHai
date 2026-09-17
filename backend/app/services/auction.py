"""Reverse-auction bidding.

A collector may open a lot as a timed auction instead of a plain first-come
offer: recyclers place competing bids (each must beat the current highest),
and whichever bid is on top when the window closes automatically becomes the
winning Transaction — no collector action required.

There is no background scheduler in this prototype, so the auction window is
resolved lazily: `resolve_if_expired` is called from every read/write path
that touches a lot (list, detail, open-lots, make-offer), so an expired
auction is always caught on the very next request that looks at it.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Lot, Offer, Recycler, Transaction
from . import matching
from .common import log_event


def finalize_offer(db: Session, lot: Lot, offer: Offer, actor: str) -> Transaction:
    """Assign `offer`'s recycler to `lot` and open a Transaction.

    Shared by the collector's manual "accept" and by automatic auction
    resolution, so both paths converge on exactly the same downstream
    handover/payment logic.
    """
    rec = db.get(Recycler, offer.recycler_id)
    lot.recycler_id = rec.recycler_id
    lot.quoted_price = offer.amount
    ranked = {m["recycler"].recycler_id: m for m in matching.match_recyclers(db, lot, limit=20)}
    picked = ranked.get(rec.recycler_id)
    lot.match_score = picked["match_score"] if picked else 0
    lot.status = "HANDOVER_PENDING"

    offer.status = "ACCEPTED"
    offer.updated_at = datetime.utcnow()
    for other in db.query(Offer).filter(
        Offer.lot_id == lot.lot_id, Offer.offer_id != offer.offer_id, Offer.status == "PENDING"
    ).all():
        other.status = "DECLINED"
        other.updated_at = datetime.utcnow()

    txn = Transaction(
        lot_id=lot.lot_id, collector_id=lot.collector_id, recycler_id=rec.recycler_id,
        quoted_price=offer.amount, collection_location=lot.location,
        transaction_status="RECYCLER_MATCHED", payment_status="PENDING",
    )
    db.add(txn)
    log_event(db, lot.lot_id, "OFFER_ACCEPTED",
              f"{rec.name} at ₹{offer.rate_per_kg:.0f}/kg (₹{offer.amount:.0f})", actor=actor)
    log_event(db, lot.lot_id, "RECYCLER_MATCHED", f"{rec.name} accepted", actor=actor)
    log_event(db, lot.lot_id, "HANDOVER_PENDING", "Waiting for recycler to scan the lot QR")
    return txn


def highest_bid(db: Session, lot_id: str, exclude_recycler_id: int | None = None) -> Offer | None:
    q = db.query(Offer).filter(Offer.lot_id == lot_id, Offer.status == "PENDING")
    if exclude_recycler_id is not None:
        q = q.filter(Offer.recycler_id != exclude_recycler_id)
    return q.order_by(Offer.amount.desc()).first()


def resolve_if_expired(db: Session, lot: Lot) -> bool:
    """If `lot`'s auction window has passed and it has not been resolved yet,
    auto-accept the highest pending bid (or close with no winner).

    Returns True if the lot's state changed (caller should treat cached
    fields on `lot` as stale and re-read if it needs them).
    """
    if lot.auction_status != "open" or not lot.auction_ends_at or lot.recycler_id is not None:
        return False
    if datetime.utcnow() < lot.auction_ends_at:
        return False

    top = highest_bid(db, lot.lot_id)
    lot.auction_status = "closed"
    if top:
        finalize_offer(db, lot, top, actor="Auction")
        log_event(db, lot.lot_id, "AUCTION_ENDED",
                  f"Auction closed — winning bid ₹{top.amount:.0f} (₹{top.rate_per_kg:.0f}/kg)",
                  actor="system")
    else:
        log_event(db, lot.lot_id, "AUCTION_ENDED", "Auction closed with no bids", actor="system")
    db.commit()
    db.refresh(lot)
    return True
