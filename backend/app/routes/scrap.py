"""Smart Scrap Value Estimator API.

Thin wrapper over ml/predict.py, which holds all the logic and has no FastAPI
dependency so it stays testable and retrainable on its own.
"""
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator

# ml/ lives beside backend/ in the repo root.
ML_DIR = Path(__file__).resolve().parents[3] / "ml"
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

try:
    import predict as scrap_ml  # noqa: E402
except Exception:  # pragma: no cover - the rest of the API must still boot
    scrap_ml = None

router = APIRouter(prefix="/api", tags=["scrap-estimator"])

VALID_QUALITY = {"clean", "mixed", "dirty", "damaged"}


class PredictIn(BaseModel):
    category: str
    material: str
    quantity: float = Field(gt=0, le=100000)
    unit: str | None = None
    locality: str = "Jaipur"
    quality: str = "mixed"

    @field_validator("quality")
    @classmethod
    def _quality(cls, v: str) -> str:
        v = (v or "mixed").lower()
        if v not in VALID_QUALITY:
            raise ValueError(f"quality must be one of {sorted(VALID_QUALITY)}")
        return v


def _require_ml():
    if scrap_ml is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Scrap estimator is unavailable. Run: python ml/collect_data.py && "
            "python ml/preprocess.py && python ml/make_synthetic.py && "
            "python ml/train_model.py",
        )


@router.get("/scrap-materials")
def scrap_materials(category: str | None = None):
    """Reference rate list — also powers Smart Material Recommendation."""
    _require_ml()
    items = scrap_ml.list_materials(category)
    if not items:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Rate dataset not built — run ml/collect_data.py")
    return {
        "count": len(items),
        "categories": sorted({i["category"] for i in items}),
        "items": items,
        "source": "https://www.thekabadiwala.com/scrap-rates/Jaipur",
        "note": "Published reference rates, transcribed. Not real-time.",
    }


@router.post("/predict-scrap-value")
def predict_scrap_value(payload: PredictIn):
    _require_ml()
    try:
        return scrap_ml.estimate_value(
            category=payload.category, material=payload.material,
            quantity=payload.quantity, unit=payload.unit,
            locality=payload.locality, quality=payload.quality,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.get("/scrap-analytics")
def scrap_analytics():
    """Average rate per category plus the top plastic and e-waste items."""
    _require_ml()
    return scrap_ml.analytics()
