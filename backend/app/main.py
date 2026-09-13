from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, SessionLocal, engine
from .models import models  # noqa: F401  (import registers the tables)
from .routes import admin, aliases, auth, lots, offers, pickup, prices, recyclers, scrap, transactions

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description=(
        "Kabadiwala Connect — API for the SIH 26229 prototype. All recycler "
        "records and prices in the seeded database are demo/prototype data."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS or ["*"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(prices.router)
app.include_router(lots.router)
app.include_router(recyclers.router)
app.include_router(transactions.router)
app.include_router(offers.router)
app.include_router(admin.router)
app.include_router(aliases.router)
app.include_router(scrap.router)
app.include_router(pickup.router)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/api/health")
def health():
    """Health also reports whether the database has actually been seeded.

    An empty database is the single most common cause of "everything shows
    zero": create_all() makes the file on first start, so a seed guard that
    only checks for the file will skip seeding forever.
    """
    backend = "postgresql" if settings.DATABASE_URL.startswith("postgres") else "sqlite"
    counts = {}
    seeded = False
    try:
        with SessionLocal() as db:
            for name, model in (("users", models.User), ("materials", models.Material),
                                ("recyclers", models.Recycler), ("prices", models.Price)):
                counts[name] = db.query(model).count()
        seeded = all(counts.get(k, 0) > 0 for k in ("users", "materials", "prices"))
    except Exception:
        counts = {}
    return {
        "status": "ok", "version": settings.VERSION, "database": backend,
        "seeded": seeded, "counts": counts,
        "hint": None if seeded else
        "Database is empty. Run: python -m app.seed.import_datasets",
    }
