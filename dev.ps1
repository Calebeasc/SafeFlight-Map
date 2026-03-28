# dev.ps1 – Start backend and frontend in dev mode (two terminals)
# Run from the repo root: .\scripts\dev.ps1

$Root = Split-Path $PSScriptRoot -Parent

Write-Host "Starting SafeFlight Map in DEV mode..." -ForegroundColor Cyan

# Terminal 1: FastAPI backend
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$Root'; .\.venv\Scripts\activate; `$env:PYTHONPATH='$Root\backend\src'; uvicorn app.main:app --host 127.0.0.1 --port 8742 --reload"
)

# Terminal 2: Vite dev server
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$Root\frontend'; npm run dev"
)

Write-Host "Backend:  http://127.0.0.1:8742"
Write-Host "Frontend: http://127.0.0.1:5173  (with HMR)"
Write-Host "API docs: http://127.0.0.1:8742/docs"
