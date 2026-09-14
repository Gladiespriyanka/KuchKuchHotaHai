#!/usr/bin/env bash
# One-command local demo: seeds the database, starts FastAPI, starts Vite.
set -e
cd "$(dirname "$0")"

echo "→ backend"
cd backend
python3 -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip install -q -r requirements.txt
python -c "from app.database import SessionLocal; from app.models import User; import sys; sys.exit(0 if SessionLocal().query(User).count()>0 else 1)" || python -m app.seed.import_datasets
uvicorn app.main:app --port 8000 &
BACK=$!
cd ..

echo "→ frontend"
cd frontend
[ -d node_modules ] || npm install
npm run dev

kill $BACK
