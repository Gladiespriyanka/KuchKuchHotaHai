import base64

from fastapi import APIRouter, Body, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from ..ai.classifier import classify
from ..database import get_db
from ..models import Material, Price
from ..schemas.schemas import ClassifyOut
from ..services import pricing

router = APIRouter(prefix="/api", tags=["prices", "ai"])


@router.get("/materials")
def materials(db: Session = Depends(get_db)):
    return [
        {
            "material_id": m.material_id,
            "category": m.category,
            "subcategory": m.subcategory,
            "description": m.description,
            "hazard_note": m.hazard_note,
            "icon": m.icon,
            "unit": m.unit,
        }
        for m in db.query(Material).order_by(Material.material_id).all()
    ]


@router.get("/prices")
def price_board(location: str | None = None, city: str | None = None,
                by_subcategory: bool = False, db: Session = Depends(get_db)):
    items = pricing.price_board(db, location, city=city, by_subcategory=by_subcategory)
    return {
        "as_of": max((i.get("as_of") or "") for i in items) if items else "live",
        "location": city or location or "all locations",
        "cities": sorted({c[0] for c in db.query(Price.city).distinct() if c[0]}),
        "items": items,
        "disclaimer": "Indicative market ranges from recorded prototype data. "
                      "Not a guaranteed selling price.",
    }


@router.get("/prices/{category}/history")
def price_history(category: str, days: int = 60, city: str | None = None,
                  material_code: str | None = None, db: Session = Depends(get_db)):
    return {
        "category": category, "city": city, "material_code": material_code,
        "points": pricing.history(db, category, days, city=city, material_code=material_code),
    }


@router.get("/estimate")
def estimate(
    category: str,
    weight: float,
    condition: str = "good",
    source_type: str = "household",
    location: str | None = None,
    db: Session = Depends(get_db),
):
    result = pricing.estimate(db, category, weight, condition, source_type, location)
    result["informal_estimate"] = pricing.informal_benchmark(result["estimated_max"])
    return result


def _as_out(p) -> ClassifyOut:
    return ClassifyOut(
        category=p.category, confidence=p.confidence, verdict=p.verdict,
        is_ewaste=p.is_ewaste, reason=p.reason, detail=p.detail,
        alternatives=p.alternatives, features=p.features,
        device=p.device, device_mapping=p.device_mapping,
        model_version=p.model_version, note=p.note,
    )


@router.post("/ai/classify-material", response_model=ClassifyOut)
async def classify_material(
    file: UploadFile | None = File(default=None),
    image_base64: str | None = Form(default=None),
    hint: str | None = Form(default=None),
):
    """Accepts multipart file upload or a base64 data URL (offline sync path)."""
    if file is not None:
        data = await file.read()
    elif image_base64:
        payload = image_base64.split(",", 1)[-1]
        try:
            data = base64.b64decode(payload)
        except Exception:
            data = payload.encode()
    else:
        data = b"empty"
    return _as_out(classify(data, hint))


@router.post("/ai/classify-material-json", response_model=ClassifyOut)
async def classify_material_json(payload: dict = Body(...)):
    raw = (payload.get("image_base64") or "").split(",", 1)[-1]
    try:
        data = base64.b64decode(raw) if raw else b"empty"
    except Exception:
        data = raw.encode()
    return _as_out(classify(data, payload.get("hint")))
