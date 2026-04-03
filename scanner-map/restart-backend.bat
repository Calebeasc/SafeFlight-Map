@echo off
title Restart Backend
echo Restarting backend...
taskkill /F /IM python.exe >nul 2>&1
timeout /t 1 /nobreak >nul
cd /d "%~dp0backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir src --reload
