from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

# Canonical categories from data/seed/material_taxonomy.csv.
MATERIAL_CATEGORIES = [
    "PCB",
    "Cable",
    "Battery",
    "LCD/LED panel",
    "CRT",
    "Motor & magnet-bearing",
    "Mixed plastic",
    # Genuine e-waste that fits none of the above. No published rate, so the
    # estimate is withheld and the recycler quotes on inspection.
    "Other",
]

# The original 8-value enum stays accepted and is normalised, so older
# clients and stored records keep working.
LEGACY_CATEGORY_ALIASES = {
    "LCD": "LCD/LED panel",
    "Motor": "Motor & magnet-bearing",
    "Magnet-bearing Assembly": "Motor & magnet-bearing",
    "Mixed Plastic": "Mixed plastic",
}
CONDITIONS = ["good", "damaged", "mixed", "intact", "broken", "partial"]
SOURCES = ["household", "commercial", "industrial", "scrap_collection",
           "household_pickup", "office_clearance", "repair_shop", "bulk_tender"]


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str
    password: str = Field(min_length=6, max_length=128)
    language: str = "hi"
    # City is what matters for matching. Coordinates are resolved from the
    # recycler dataset for that city unless the device supplies a real fix —
    # the old Jaipur default sat 700 km from every recycler in the dataset,
    # so a new account could never match anyone.
    operating_location: str = "Pune"
    latitude: float | None = None
    longitude: float | None = None


class UpdateMeIn(BaseModel):
    """The signed-in user editing their own display name / language."""
    name: str | None = Field(default=None, min_length=2, max_length=120)
    language: str | None = None

    @field_validator("language")
    @classmethod
    def _lang(cls, v: str) -> str:
        if v not in ("en", "hi", "mr"):
            raise ValueError("language must be en, hi or mr")
        return v


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    language: str
    profile_id: int | None = None
    location: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class TokenOut(BaseModel):
    token: str
    user: UserOut


class PriceBoardItem(BaseModel):
    category: str
    min_price: float
    max_price: float
    unit: str = "kg"
    trend: Literal["rising", "stable", "falling"]
    change_pct: float
    icon: str = ""


class PricePoint(BaseModel):
    date: str
    price: float


class ClassifyOut(BaseModel):
    # `model_version` is a deliberate field name; silence Pydantic's
    # protected-namespace warning rather than renaming the API contract.
    model_config = {"protected_namespaces": ()}

    # category is None when the classifier declines to name a material —
    # either the photo is not e-waste, or it is not confident enough.
    category: str | None = None
    confidence: float
    # E_WASTE | NOT_E_WASTE | UNCERTAIN
    verdict: str = "E_WASTE"
    is_ewaste: bool = True
    reason: str = ""
    detail: str = ""
    alternatives: list[dict[str, Any]] = Field(default_factory=list)
    features: dict[str, Any] = Field(default_factory=dict)
    device: str | None = None
    device_mapping: dict[str, Any] = Field(default_factory=dict)
    model_version: str
    note: str


class LotCreateIn(BaseModel):
    material_category: str
    weight: float = Field(gt=0, le=5000)
    condition: str = "good"
    source_type: str = "household"
    description: str = ""
    photo: str = ""
    location: str = ""
    latitude: float = 0.0
    longitude: float = 0.0
    ai_prediction: dict[str, Any] = Field(default_factory=dict)
    client_ref: str = ""
    # Reverse-auction bidding: when set, the lot opens for a timed round of
    # competitive recycler bids instead of a plain first-come offer.
    auction_minutes: int | None = Field(default=None, ge=1, le=180)

    @field_validator("material_category")
    @classmethod
    def _cat(cls, v: str) -> str:
        v = LEGACY_CATEGORY_ALIASES.get(v, v)
        if v not in MATERIAL_CATEGORIES:
            raise ValueError(f"Unknown material category: {v}")
        return v

    @field_validator("condition")
    @classmethod
    def _cond(cls, v: str) -> str:
        if v.lower() not in CONDITIONS:
            raise ValueError("condition must be good, damaged or mixed")
        return v.lower()

    @field_validator("source_type")
    @classmethod
    def _src(cls, v: str) -> str:
        if v.lower() not in SOURCES:
            raise ValueError("invalid source_type")
        return v.lower()


class LotOut(BaseModel):
    lot_id: str
    collector_id: int
    collector_name: str | None = None
    material_category: str
    description: str
    photo: str
    weight: float
    condition: str
    source_type: str
    estimated_min: float
    estimated_max: float
    quoted_price: float
    ai_prediction: dict[str, Any]
    location: str
    latitude: float
    longitude: float
    recycler_id: int | None
    recycler_name: str | None = None
    match_score: float
    status: str
    created_at: datetime


class RecyclerOut(BaseModel):
    recycler_id: int
    name: str
    location: str
    latitude: float
    longitude: float
    accepted_materials: list[str]
    authorization_id: str
    authorization_status: str
    contact: str
    offered_rate: dict[str, float]
    pickup_available: bool
    service_area_km: float
    rating: float


class MatchOut(RecyclerOut):
    distance_km: float
    rate_for_material: float
    offer_value: float
    match_score: float
    breakdown: dict[str, float]


class OfferIn(BaseModel):
    rate_per_kg: float = Field(gt=0, le=100000)
    note: str = Field(default="", max_length=255)
    pickup_offered: bool = False


class OfferOut(BaseModel):
    offer_id: int
    lot_id: str
    recycler_id: int
    recycler_name: str | None = None
    recycler_location: str | None = None
    authorization_id: str | None = None
    pickup_offered: bool = False
    distance_km: float | None = None
    rate_per_kg: float
    amount: float
    note: str = ""
    status: str
    created_at: datetime


class SelectRecyclerIn(BaseModel):
    recycler_id: int


class HandoverIn(BaseModel):
    lot_id: str
    final_weight: float = Field(gt=0, le=5000)
    final_price: float = Field(ge=0)
    # Photo of the weighing scale showing the final weight — makes the
    # recorded weight verifiable instead of merely asserted.
    scale_photo: str = ""
    handover_location: str = ""
    gps_location: str = ""


class PaymentIn(BaseModel):
    transaction_id: int
    mode: Literal["cash", "upi"] = "cash"


class RecyclerProfileIn(BaseModel):
    name: str | None = None
    location: str | None = None
    contact: str | None = None
    accepted_materials: list[str] | None = None
    offered_rate: dict[str, float] | None = None
    pickup_available: bool | None = None
    service_area_km: float | None = None


class SyncLotsIn(BaseModel):
    lots: list[LotCreateIn]


class PickupScheduleIn(BaseModel):
    area: str = Field(min_length=2, max_length=120)
    weekday: int = Field(ge=0, le=6)  # Monday=0 .. Sunday=6
    start_time: str = Field(default="09:00", pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(default="17:00", pattern=r"^\d{2}:\d{2}$")
    capacity: int = Field(default=6, ge=1, le=50)
    radius_km: float = Field(default=6.0, gt=0, le=50)


class BookSlotIn(BaseModel):
    lot_id: str
    occurrence_date: str  # "YYYY-MM-DD" — must be a future date matching the schedule's weekday
