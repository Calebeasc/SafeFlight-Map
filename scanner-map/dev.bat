@echo off
title Invincible.Inc Scanner — Dev Servers
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   Invincible.Inc Scanner — Dev Mode  ║
echo  ╚══════════════════════════════════════╝
echo.

:: Kill any existing instances
taskkill /F /IM python.exe /FI "WINDOWTITLE eq uvicorn*" >nul 2>&1

:: Start backend with auto-reload
echo [1/2] Starting backend (port 8000, auto-reload)...
start "Backend" cmd /k "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir src --reload"

:: Wait a moment for backend to boot
timeout /t 2 /nobreak >nul

:: Start frontend dev server
echo [2/2] Starting frontend (port 5173, HMR)...
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo  Both servers are starting...
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo  Dev console: http://localhost:5173/#dev
echo.
echo  Close this window to leave servers running.
pause
