@echo off
cd /d "C:\Users\eckel\OneDrive\Documents\Invincible.Inc\scanner-map"
call .venv\Scripts\activate.bat
set PYTHONPATH=backend\src

:: ── Auto-update check ─────────────────────────────────────────────────────
echo.
python scripts\update_check.py
echo.

:: ── Build frontend (updates static files served by backend) ──────────────
echo.
echo Building frontend...
cd frontend
call npm run build
cd ..
echo Frontend build complete.
echo.

:: ── Watch mode: auto-rebuilds dist/ whenever .jsx/.css files change ────────
:: The backend serves dist/ directly — no manual rebuild needed after edits.
start "Vite Watch" cmd /k "cd /d C:\Users\eckel\OneDrive\Documents\Invincible.Inc\scanner-map\frontend && npx vite build --watch"

:: ── Start ngrok in a separate window ─────────────────────────────────────
start "ngrok" cmd /c "ngrok http 8742 --request-header-add=ngrok-skip-browser-warning:true"

:: Give ngrok a moment to connect
timeout /t 2 /nobreak >nul

:: Print the public URL from ngrok's local API
echo.
echo Fetching ngrok URL...
curl -s http://127.0.0.1:4040/api/tunnels | python -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print('\n  Public URL: ' + next(x['public_url'] for x in t if x['proto']=='https'))" 2>nul || echo   (ngrok URL will appear in the ngrok window)
echo.

:: ── Start backend — auto-restarts when any Python file in backend/src changes
uvicorn app.main:app --host 127.0.0.1 --port 8742 --reload --reload-dir backend\src
pause
