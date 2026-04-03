@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

set "MODE=%~1"
if /I "%MODE%"=="" set "MODE=user"
if /I "%MODE%"=="dev" set "MODE=sovereign"

if /I not "%MODE%"=="user" if /I not "%MODE%"=="sovereign" (
  echo Usage: START_BACKEND.bat [user^|dev^|sovereign]
  echo.
  echo   user       Starts the standard app stack on http://127.0.0.1:8742
  echo   dev        Starts the system/dev stack on http://127.0.0.1:8742
  echo   sovereign  Same as dev
  exit /b 1
)

if exist ".venv\Scripts\activate.bat" (
  call ".venv\Scripts\activate.bat"
) else (
  echo [WARN] .venv not found under "%ROOT%\.venv". Using system Python/npm.
)

set "PYTHON_EXE=python"
if exist ".venv\Scripts\python.exe" (
  set "PYTHON_EXE=%ROOT%\.venv\Scripts\python.exe"
)

set "PYTHONPATH=%ROOT%\backend\src"
set "INVINCIBLE_APP_MODE="
set "MODE_LABEL=USER"
if /I "%MODE%"=="sovereign" (
  set "INVINCIBLE_APP_MODE=sovereign"
  set "MODE_LABEL=SYSTEM / DEV"
)

echo.
echo ============================================================
echo  Invincible.Inc Local Stack
echo  Mode: %MODE_LABEL%
echo  Root: %ROOT%
echo ============================================================
echo.

echo Verifying backend Python dependencies...
"%PYTHON_EXE%" -c "import fastapi, jwt, aiohttp, flask, flask_cors" >nul 2>nul
if errorlevel 1 (
  echo Syncing backend requirements into the active Python environment...
  "%PYTHON_EXE%" -m pip install -r "%ROOT%\backend\requirements.txt"
  if errorlevel 1 (
    echo [FAIL] Backend dependency sync failed.
    exit /b 1
  )
) else (
  echo Backend Python dependencies are ready.
)
echo.

if exist "scripts\update_check.py" (
  "%PYTHON_EXE%" "scripts\update_check.py"
  echo.
)

if exist "scripts\daily_release.py" (
  "%PYTHON_EXE%" "scripts\daily_release.py" %MODE%
  echo.
)

echo Building frontend dist for backend-served UI...
pushd "frontend"
call npm run build
if errorlevel 1 (
  echo [FAIL] Frontend build failed.
  popd
  exit /b 1
)
popd
echo Frontend build complete.
echo.

echo Starting frontend dist watcher...
start "Invincible Frontend Watch" cmd /k "cd /d \"%ROOT%\frontend\" && npx vite build --watch"

if exist "..\sentinel_monitor\sentinel_server.py" (
  echo Starting Sentinel monitor on port 9999...
  start "Invincible Sentinel" cmd /k "cd /d \"%ROOT%\..\sentinel_monitor\" && \"%PYTHON_EXE%\" sentinel_server.py"
  echo.
) else (
  echo [INFO] Sentinel workspace not found. Skipping sentinel monitor.
  echo.
)

where ngrok >nul 2>nul
if errorlevel 1 (
  echo [INFO] ngrok not found in PATH. Skipping tunnel startup.
) else (
  echo Starting ngrok tunnel for port 8742...
  start "Invincible ngrok" cmd /c "ngrok http 8742 --request-header-add=ngrok-skip-browser-warning:true"
  timeout /t 2 /nobreak >nul
  echo Fetching ngrok URL...
  curl -s http://127.0.0.1:4040/api/tunnels | "%PYTHON_EXE%" -c "import sys,json; t=json.load(sys.stdin).get('tunnels', []); print('\n  Public URL: ' + next((x['public_url'] for x in t if x.get('proto') == 'https'), 'unavailable'))" 2>nul || echo   (ngrok URL will appear in the ngrok window)
  echo.
)

echo Starting FastAPI backend on http://127.0.0.1:8742 ...
if defined INVINCIBLE_APP_MODE (
  echo Backend mode override: %INVINCIBLE_APP_MODE%
)
echo.

"%PYTHON_EXE%" -m uvicorn app.main:app --host 127.0.0.1 --port 8742 --reload --reload-dir "%ROOT%\backend\src"

endlocal
