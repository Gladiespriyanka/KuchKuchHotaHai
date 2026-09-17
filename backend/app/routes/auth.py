import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Collector, Recycler, User
from ..schemas.schemas import (
    LoginIn, OtpRequestIn, OtpVerifyIn, RegisterIn, TokenOut, UpdateMeIn, UserOut,
)
from ..services import otp
from ..services.security import create_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_out(db: Session, user: User) -> UserOut:
    profile_id = None
    location = None
    lat = lng = None
    auth_status = None
    if user.role == "collector":
        p = db.query(Collector).filter(Collector.user_id == user.id).first()
        if p:
            profile_id, location, lat, lng = (
                p.collector_id, p.operating_location, p.latitude, p.longitude,
            )
            auth_status = p.authorization_status
    elif user.role == "recycler":
        p = db.query(Recycler).filter(Recycler.user_id == user.id).first()
        if p:
            profile_id, location, lat, lng = (p.recycler_id, p.location, p.latitude, p.longitude)
            auth_status = p.authorization_status
    return UserOut(
        id=user.id, name=user.name, email=user.email, phone=user.phone, role=user.role,
        language=user.language, profile_id=profile_id, location=location,
        latitude=lat, longitude=lng, authorization_status=auth_status,
    )


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email or password is incorrect")
    return TokenOut(token=create_token(user.id, user.role), user=_user_out(db, user))


@router.post("/otp/request")
def request_otp(payload: OtpRequestIn):
    """Step 1 of collector login: issue a demo OTP for a phone number.

    There is no SMS gateway in this prototype, so the code is returned
    directly in the response (`demo_otp`) instead of being sent anywhere.
    """
    phone = otp.normalize_phone(payload.phone)
    if len(phone.lstrip("+")) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter a valid phone number")
    code = otp.request_otp(phone)
    return {
        "phone": phone,
        "demo_otp": code,
        "expires_in": otp.TTL_SECONDS,
        "note": "Demo mode — no SMS is actually sent. Use the code above "
                f"(or {otp.DEMO_FALLBACK_OTP}) to continue.",
    }


@router.post("/otp/verify", response_model=TokenOut)
def verify_otp(payload: OtpVerifyIn, db: Session = Depends(get_db)):
    """Step 2: check the OTP and sign the collector in, registering a new
    collector profile the first time this phone number is seen."""
    phone = otp.normalize_phone(payload.phone)
    if not otp.verify_otp(phone, payload.otp):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect or expired OTP")

    user = db.query(User).filter(User.phone == phone, User.role == "collector").first()
    if not user:
        name = (payload.name or f"Collector {phone[-4:]}").strip()
        user = User(
            # Every User needs a unique email; phone-based accounts get a
            # synthetic, unguessable one that is never used to sign in.
            email=f"phone-{phone.lstrip('+')}@collector.local",
            password_hash=hash_password(secrets.token_hex(16)),
            role="collector", name=name, language="hi", phone=phone,
        )
        db.add(user)
        db.flush()
        city, lat, lng = _resolve_city(db, payload.operating_location or "")
        db.add(Collector(
            user_id=user.id, display_name=name, language="hi",
            operating_location=payload.operating_location or city,
            latitude=payload.latitude if payload.latitude is not None else lat,
            longitude=payload.longitude if payload.longitude is not None else lng,
            phone=phone, authorization_status="pending",
        ))
    elif payload.name and payload.name.strip() and payload.name.strip() != user.name:
        user.name = payload.name.strip()
        profile = db.query(Collector).filter(Collector.user_id == user.id).first()
        if profile:
            profile.display_name = user.name
    db.commit()
    db.refresh(user)
    return TokenOut(token=create_token(user.id, user.role), user=_user_out(db, user))


# def _resolve_city(db: Session, place: str) -> tuple[str, float, float]:
#     # """Turn a free-text place into a city and usable coordinates.

#     # Coordinates are averaged from the authorised facilities the dataset lists
#     # in that city, so a new collector starts inside a real service area
#     # instead of at a hardcoded point in another state.
#     # """
#     # place = (place or "").strip()
#     # city = place.split(",")[-1].strip() or "Pune"
#     # rows = db.query(Recycler).filter(Recycler.city.isnot(None)).all()
#     # matches = [r for r in rows if r.city and r.city.lower() == city.lower()]
#     # if not matches:  # unknown city: fall back to the busiest one we have
#     #     counts: dict[str, int] = {}
#     #     for r in rows:
#     #         counts[r.city] = counts.get(r.city, 0) + 1
#     #     if counts:
#     #         city = max(counts, key=counts.get)
#     #         matches = [r for r in rows if r.city == city]
#     # if not matches:
#     #     return city, 0.0, 0.0
#     # lat = sum(r.latitude for r in matches) / len(matches)
#     # lng = sum(r.longitude for r in matches) / len(matches)
#     # return city, lat, lng


# updating fallback

def _resolve_city(db: Session, place: str) -> tuple[str, float, float]:
    """Resolve a typed location to a known city coordinate."""
    place = (place or "").strip()
    city = place.split(",")[-1].strip() or "Pune"
    rows = (
        db.query(Recycler)
        .filter(
            Recycler.city.isnot(None),
            Recycler.latitude.isnot(None),
            Recycler.longitude.isnot(None),
        )
        .all()
    )
    matches = [
        r for r in rows
        if r.city and r.city.lower() == city.lower()
    ]
    if not matches:
        # Do NOT silently assign a new user to another city.
        return city, 0.0, 0.0
    lat = sum(r.latitude for r in matches) / len(matches)
    lng = sum(r.longitude for r in matches) / len(matches)
    return city, lat, lng


@router.get("/cities")
def cities(db: Session = Depends(get_db)):
    """Cities the platform actually has authorised recyclers in."""
    rows = db.query(Recycler.city).filter(Recycler.city.isnot(None)).distinct().all()
    return sorted({c[0] for c in rows if c[0]})


@router.post("/register", response_model=TokenOut, status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already registered")
    # user = User(
    #     email=email, password_hash=hash_password(payload.password), role="collector",
    #     name=payload.name, language=payload.language,
    # )
    # db.add(user)
    # db.flush()
    # city, lat, lng = _resolve_city(db, payload.operating_location)
    # db.add(Collector(
    #     user_id=user.id, display_name=payload.name, language=payload.language,
    #     operating_location=payload.operating_location or city,
    #     # A device-supplied fix always wins over the city centroid.
    #     latitude=payload.latitude if payload.latitude else lat,
    #     longitude=payload.longitude if payload.longitude else lng,
    # ))

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        name=payload.name,
        language=payload.language,
    )

    db.add(user)
    db.flush()

    city, lat, lng = _resolve_city(db, payload.operating_location)

    if payload.role == "collector":
        db.add(
            Collector(
                user_id=user.id,
                display_name=payload.name,
                language=payload.language,
                operating_location=payload.operating_location or city,
                latitude=payload.latitude if payload.latitude is not None else lat,
                longitude=payload.longitude if payload.longitude is not None else lng,
            )
        )

    elif payload.role == "recycler":
        db.add(
            Recycler(
                user_id=user.id,
                name=payload.name,
                location=payload.operating_location or city,
                city=city,
                latitude=payload.latitude if payload.latitude is not None else lat,
                longitude=payload.longitude if payload.longitude is not None else lng,
                accepted_materials=[],
                authorization_id="",
                authorization_status="pending",
                contact="",
                offered_rate={},
                pickup_available=False,
                service_area_km=20.0,
                rating=0.0,
            )
        )
    db.commit()
    db.refresh(user)
    return TokenOut(token=create_token(user.id, user.role), user=_user_out(db, user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Authoritative current user. The frontend calls this on every boot."""
    return _user_out(db, user)


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UpdateMeIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Let a user rename themselves.

    The display name is mirrored onto the role profile so collector- and
    recycler-facing screens show the same name as the account.
    """
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")

    if "name" in data:
        user.name = data["name"].strip()
    if "language" in data:
        user.language = data["language"]

    if user.role == "collector":
        profile = db.query(Collector).filter(Collector.user_id == user.id).first()
        if profile:
            if "name" in data:
                profile.display_name = user.name
            if "language" in data:
                profile.language = user.language
    elif user.role == "recycler":
        profile = db.query(Recycler).filter(Recycler.user_id == user.id).first()
        if profile and "name" in data:
            profile.name = user.name

    db.commit()
    db.refresh(user)
    return _user_out(db, user)
