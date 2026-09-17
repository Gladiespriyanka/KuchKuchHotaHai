"""Database models.

Kept deliberately PostgreSQL-compatible: no SQLite-only types, JSON columns
use the portable sqlalchemy JSON type, money is stored as Numeric-friendly
Float for prototype simplicity.
"""
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


def _now() -> datetime:
    return datetime.utcnow()


class User(Base):
    """Login identity. role = collector | recycler | admin."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(120))
    language: Mapped[str] = mapped_column(String(5), default="hi")
    # Collectors sign in with phone + OTP instead of email/password. Kept on
    # User (not just Collector) since login looks a phone number up before
    # any role-specific profile is known.
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    collector: Mapped["Collector"] = relationship(back_populates="user", uselist=False)
    recycler: Mapped["Recycler"] = relationship(back_populates="user", uselist=False)


class Collector(Base):
    __tablename__ = "collectors"

    collector_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    language: Mapped[str] = mapped_column(String(5), default="hi")
    operating_location: Mapped[str] = mapped_column(String(160))
    latitude: Mapped[float] = mapped_column(Float, default=0.0)
    longitude: Mapped[float] = mapped_column(Float, default=0.0)
    # Contact number shown to a recycler once it has accepted this
    # collector's lot, so the two sides can coordinate the handover.
    phone: Mapped[str] = mapped_column(String(20), default="", index=True)
    # Admin profile approval, mirroring Recycler.authorization_status.
    authorization_status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="collector")
    lots: Mapped[list["Lot"]] = relationship(back_populates="collector")


class Material(Base):
    """Catalogue of accepted e-waste categories (reference data)."""

    __tablename__ = "materials"

    material_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # material_code is the canonical key from material_taxonomy.csv
    # (e.g. PCB-RAM). category is no longer unique: one category now has
    # several sub-categories, as the problem statement requires.
    material_code: Mapped[str] = mapped_column(String(20), default="", index=True)
    category: Mapped[str] = mapped_column(String(60), index=True)
    subcategory: Mapped[str] = mapped_column(String(80), default="")
    base_informal_rate: Mapped[float] = mapped_column(Float, default=0.0)
    formal_premium_pct: Mapped[float] = mapped_column(Float, default=0.0)
    primary_hazard: Mapped[str] = mapped_column(String(60), default="")
    informal_processing_risk: Mapped[str] = mapped_column(Text, default="")
    critical_materials: Mapped[dict] = mapped_column(JSON, default=dict)
    description: Mapped[str] = mapped_column(Text, default="")
    hazard_note: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(20), default="")
    unit: Mapped[str] = mapped_column(String(10), default="kg")


class Recycler(Base):
    __tablename__ = "recyclers"

    recycler_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    location: Mapped[str] = mapped_column(String(200))
    latitude: Mapped[float] = mapped_column(Float, default=0.0)
    longitude: Mapped[float] = mapped_column(Float, default=0.0)
    accepted_materials: Mapped[list] = mapped_column(JSON, default=list)
    # From recyclers.csv: real CPCB-style registration fields.
    authorization_id: Mapped[str] = mapped_column(String(60), default="")
    authorization_status: Mapped[str] = mapped_column(String(20), default="pending")
    facility_type: Mapped[str] = mapped_column(String(40), default="authorised_recycler")
    authorisation_valid_till: Mapped[str] = mapped_column(String(20), default="")
    city: Mapped[str] = mapped_column(String(60), default="", index=True)
    industrial_estate: Mapped[str] = mapped_column(String(120), default="")
    offered_rate_multiplier: Mapped[float] = mapped_column(Float, default=1.0)
    min_lot_weight_kg: Mapped[float] = mapped_column(Float, default=0.0)
    avg_settlement_hours: Mapped[float] = mapped_column(Float, default=24.0)
    capacity_tonnes_per_month: Mapped[float] = mapped_column(Float, default=0.0)
    external_id: Mapped[str] = mapped_column(String(20), default="", index=True)
    contact: Mapped[str] = mapped_column(String(60), default="")
    offered_rate: Mapped[dict] = mapped_column(JSON, default=dict)  # {category: rate}
    pickup_available: Mapped[bool] = mapped_column(Boolean, default=False)
    service_area_km: Mapped[float] = mapped_column(Float, default=10.0)
    rating: Mapped[float] = mapped_column(Float, default=4.2)
    documents_note: Mapped[str] = mapped_column(String(200), default="Demo document set")
    # Priority access subscription (₹2,000/month, simulated — no real payment
    # gateway): a premium facility sees a new lot 2 hours before everyone else.
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False)
    premium_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="recycler")


class Price(Base):
    __tablename__ = "prices"

    price_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    material_category: Mapped[str] = mapped_column(String(60), index=True)
    material_code: Mapped[str] = mapped_column(String(20), default="", index=True)
    sub_category: Mapped[str] = mapped_column(String(80), default="")
    city: Mapped[str] = mapped_column(String(60), default="", index=True)
    market_range_low: Mapped[float] = mapped_column(Float, default=0.0)
    market_range_high: Mapped[float] = mapped_column(Float, default=0.0)
    location: Mapped[str] = mapped_column(String(120), index=True)
    date: Mapped[datetime] = mapped_column(DateTime, index=True)
    buying_price: Mapped[float] = mapped_column(Float)
    selling_price: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(10), default="kg")
    recycler_id: Mapped[int | None] = mapped_column(ForeignKey("recyclers.recycler_id"), nullable=True)
    source: Mapped[str] = mapped_column(String(30), default="seed")


class Lot(Base):
    __tablename__ = "lots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lot_id: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    collector_id: Mapped[int] = mapped_column(ForeignKey("collectors.collector_id"))
    material_category: Mapped[str] = mapped_column(String(60), index=True)
    material_code: Mapped[str] = mapped_column(String(20), default="", index=True)
    sub_category: Mapped[str] = mapped_column(String(80), default="")
    city: Mapped[str] = mapped_column(String(60), default="", index=True)
    # voice | photo | icon_keypad — which route created this lot
    input_method: Mapped[str] = mapped_column(String(20), default="photo")
    voice_transcript: Mapped[str] = mapped_column(Text, default="")
    created_offline: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str] = mapped_column(Text, default="")
    photo: Mapped[str] = mapped_column(Text, default="")  # data URL or /uploads path
    weight: Mapped[float] = mapped_column(Float)
    condition: Mapped[str] = mapped_column(String(20), default="good")
    source_type: Mapped[str] = mapped_column(String(30), default="household")
    estimated_min: Mapped[float] = mapped_column(Float, default=0)
    estimated_max: Mapped[float] = mapped_column(Float, default=0)
    quoted_price: Mapped[float] = mapped_column(Float, default=0)
    ai_prediction: Mapped[dict] = mapped_column(JSON, default=dict)
    location: Mapped[str] = mapped_column(String(160), default="")
    latitude: Mapped[float] = mapped_column(Float, default=0.0)
    longitude: Mapped[float] = mapped_column(Float, default=0.0)
    recycler_id: Mapped[int | None] = mapped_column(ForeignKey("recyclers.recycler_id"), nullable=True)
    match_score: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(30), default="LOT_CREATED", index=True)
    client_ref: Mapped[str] = mapped_column(String(60), default="")  # offline dedupe key
    # Reverse-auction bidding (none = never an auction; open = accepting bids;
    # closed = deadline passed, either resolved into a Transaction or not).
    auction_status: Mapped[str] = mapped_column(String(10), default="none")
    auction_ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Group buying / bulk aggregation: a suggested or confirmed bundle with
    # another collector's nearby lot of the same material.
    group_id: Mapped[str | None] = mapped_column(ForeignKey("lot_groups.group_id"), nullable=True, index=True)
    group_accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    collector: Mapped[Collector] = relationship(back_populates="lots")
    events: Mapped[list["LotEvent"]] = relationship(
        back_populates="lot", order_by="LotEvent.created_at"
    )


class LotEvent(Base):
    """Append-only trail used for the traceability timeline."""

    __tablename__ = "lot_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lot_id: Mapped[str] = mapped_column(ForeignKey("lots.lot_id"), index=True)
    status: Mapped[str] = mapped_column(String(30))
    note: Mapped[str] = mapped_column(String(255), default="")
    actor: Mapped[str] = mapped_column(String(60), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    lot: Mapped[Lot] = relationship(back_populates="events")


class LotGroup(Base):
    """A bulk-aggregation bundle: two (or more) nearby collectors' open lots
    of the same material, combined so the recycler pays the bulk rate.

    SUGGESTED  -> system found a compatible pair, waiting on both collectors.
    ACCEPTED   -> every member lot's collector has accepted (transient — the
                  group is finalized into MATCHED in the same request).
    MATCHED    -> a recycler was assigned; each member lot has its own
                  Transaction at the bonus rate, single shared pickup point.
    DECLINED   -> someone declined; member lots were released back to normal.
    """

    __tablename__ = "lot_groups"

    group_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    material_category: Mapped[str] = mapped_column(String(60), index=True)
    status: Mapped[str] = mapped_column(String(20), default="SUGGESTED", index=True)
    combined_weight: Mapped[float] = mapped_column(Float, default=0)
    base_rate_per_kg: Mapped[float] = mapped_column(Float, default=0)
    bonus_rate_per_kg: Mapped[float] = mapped_column(Float, default=0)
    pickup_location: Mapped[str] = mapped_column(String(160), default="")
    recycler_id: Mapped[int | None] = mapped_column(ForeignKey("recyclers.recycler_id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Offer(Base):
    """A recycler's bid on an open lot.

    The collector may still pick a recycler directly from the match list —
    that path is unchanged. An accepted offer converges on exactly the same
    Transaction, so downstream handover/payment logic needs no special case.
    """

    __tablename__ = "offers"

    offer_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lot_id: Mapped[str] = mapped_column(ForeignKey("lots.lot_id"), index=True)
    recycler_id: Mapped[int] = mapped_column(ForeignKey("recyclers.recycler_id"), index=True)
    rate_per_kg: Mapped[float] = mapped_column(Float)
    amount: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(String(255), default="")
    pickup_offered: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Transaction(Base):
    __tablename__ = "transactions"

    transaction_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lot_id: Mapped[str] = mapped_column(ForeignKey("lots.lot_id"), index=True)
    collector_id: Mapped[int] = mapped_column(ForeignKey("collectors.collector_id"))
    recycler_id: Mapped[int] = mapped_column(ForeignKey("recyclers.recycler_id"))
    quoted_price: Mapped[float] = mapped_column(Float, default=0)
    final_price: Mapped[float] = mapped_column(Float, default=0)
    final_weight: Mapped[float] = mapped_column(Float, default=0)
    collection_location: Mapped[str] = mapped_column(String(160), default="")
    handover_location: Mapped[str] = mapped_column(String(160), default="")
    payment_status: Mapped[str] = mapped_column(String(20), default="PENDING")
    transaction_status: Mapped[str] = mapped_column(String(30), default="MATCHED")
    declared_weight: Mapped[float] = mapped_column(Float, default=0.0)
    anomaly_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    anomaly_type: Mapped[str] = mapped_column(String(40), default="")
    anomaly_reason: Mapped[str] = mapped_column(String(255), default="")
    external_id: Mapped[str] = mapped_column(String(20), default="", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Handover(Base):
    __tablename__ = "handovers"

    handover_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference_number: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    lot_id: Mapped[str] = mapped_column(ForeignKey("lots.lot_id"), index=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.transaction_id"))
    photo: Mapped[str] = mapped_column(Text, default="")        # collection photo
    scale_photo: Mapped[str] = mapped_column(Text, default="")  # weighing scale at handover
    weight: Mapped[float] = mapped_column(Float, default=0)
    gps_location: Mapped[str] = mapped_column(String(120), default="")
    recycler_confirmation: Mapped[bool] = mapped_column(Boolean, default=False)
    gps_accuracy_m: Mapped[float] = mapped_column(Float, default=0.0)
    captured_offline: Mapped[bool] = mapped_column(Boolean, default=False)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    confirmation_method: Mapped[str] = mapped_column(String(30), default="qr_scan")
    downstream_status: Mapped[str] = mapped_column(String(40), default="awaiting_confirmation")
    epr_credit_reference: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(20), default="VERIFIED")
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Payment(Base):
    __tablename__ = "payments"

    payment_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.transaction_id"), index=True)
    amount: Mapped[float] = mapped_column(Float)
    mode: Mapped[str] = mapped_column(String(10), default="cash")
    status: Mapped[str] = mapped_column(String(20), default="PAID")
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=_now)


class PickupSchedule(Base):
    """A recycler's standing recurring pickup round — e.g. "Every Tuesday in
    Malviya Nagar". Collectors in the area book a lot into a specific future
    occurrence of it; `route.py` orders that day's bookings into an
    efficient visiting sequence."""

    __tablename__ = "pickup_schedules"

    schedule_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recycler_id: Mapped[int] = mapped_column(ForeignKey("recyclers.recycler_id"), index=True)
    area: Mapped[str] = mapped_column(String(120))
    weekday: Mapped[int] = mapped_column(Integer)  # Monday=0 .. Sunday=6
    start_time: Mapped[str] = mapped_column(String(5), default="09:00")
    end_time: Mapped[str] = mapped_column(String(5), default="17:00")
    capacity: Mapped[int] = mapped_column(Integer, default=6)
    radius_km: Mapped[float] = mapped_column(Float, default=6.0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class PickupBooking(Base):
    """One collector's lot booked into one occurrence of a PickupSchedule."""

    __tablename__ = "pickup_bookings"

    booking_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    schedule_id: Mapped[int] = mapped_column(ForeignKey("pickup_schedules.schedule_id"), index=True)
    lot_id: Mapped[str] = mapped_column(ForeignKey("lots.lot_id"), unique=True, index=True)
    collector_id: Mapped[int] = mapped_column(ForeignKey("collectors.collector_id"))
    occurrence_date: Mapped[str] = mapped_column(String(10), index=True)  # "YYYY-MM-DD"
    status: Mapped[str] = mapped_column(String(20), default="BOOKED")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
