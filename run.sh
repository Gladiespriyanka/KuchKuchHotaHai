#!/usr/bin/env bash
# One command to run everything: ML pipeline (first time), backend, frontend.
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"

echo "== backend =="
cd "$ROOT/backend"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt

echo "== ML pipeline =="
cd "$ROOT/ml"
if [ ! -f scrap_price_model.pkl ]; then
  python collect_data.py
  python preprocess.py
  python make_synthetic.py
  python train_model.py
else
  echo "model already trained (delete ml/scrap_price_model.pkl to rebuild)"
fi

echo "== database =="
cd "$ROOT/backend"
# Seed when the database is EMPTY, not when the file is missing.
# uvicorn's create_all() creates an empty kabadiwala.db on first start, so a
# file-existence check skips seeding forever and every screen shows zero.
NEEDS_SEED=$(python - <<'PYEOF'
try:
    from app.database import SessionLocal
    from app.models import User
    with SessionLocal() as db:
        print("no" if db.query(User).count() > 0 else "yes")
except Exception:
    print("yes")
PYEOF
)
if [ "$NEEDS_SEED" = "yes" ]; then
  echo "   database empty -> importing the supplied datasets"
  python -m app.seed.import_datasets || python -m app.seed.seed
else
  echo "   database already populated"
fi

echo "== starting API on :8000 =="
uvicorn app.main:app --reload --port 8000 &
BACK=$!
trap 'kill $BACK 2>/dev/null' EXIT

echo "== starting frontend on :5173 =="
cd "$ROOT/frontend"
[ -d node_modules ] || npm install
npm run dev
