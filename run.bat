@echo off
REM One command to run everything on Windows.
cd /d "%~dp0"
set ROOT=%CD%

echo == backend ==
cd /d "%ROOT%\backend"
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt

echo == ML pipeline ==
cd /d "%ROOT%\ml"
if not exist scrap_price_model.pkl (
  python collect_data.py
  python preprocess.py
  python make_synthetic.py
  python train_model.py
) else (
  echo model already trained ^(delete ml\scrap_price_model.pkl to rebuild^)
)

echo == database ==
cd /d "%ROOT%\backend"
REM Seed when the database is EMPTY, not when the file is missing: uvicorn
REM creates an empty kabadiwala.db on first start, so a file check would skip
REM seeding forever and every screen would show zero.
python -c "from app.database import SessionLocal; from app.models import User; import sys; db=SessionLocal(); sys.exit(0 if db.query(User).count()>0 else 1)" 2>nul
if errorlevel 1 (
  echo    database empty -^> importing the supplied datasets
  python -m app.seed.import_datasets || python -m app.seed.seed
) else (
  echo    database already populated
)

echo == starting API on :8000 ==
start "Kabadiwala API" cmd /k "cd /d %ROOT%\backend && call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"

echo == starting frontend on :5173 ==
cd /d "%ROOT%\frontend"
if not exist node_modules npm install
start "Kabadiwala Frontend" cmd /k "cd /d %ROOT%\frontend && npm run dev"

echo.
echo Both servers starting. Open http://localhost:5173
pause
