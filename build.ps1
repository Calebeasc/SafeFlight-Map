# build.ps1 – Invincible.Inc build script
# Run from the repo root: .\scripts\build.ps1
# Produces: dist\Invincible.exe

param(
    [switch]$SkipFrontend,
    [switch]$SkipVenv
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

Write-Host "`n=== Invincible.Inc Builder ===" -ForegroundColor Cyan

# ── 1. Build React frontend ───────────────────────────────────────────────────
if (-not $SkipFrontend) {
    Write-Host "`n[1/4] Building React frontend..." -ForegroundColor Yellow
    Push-Location "$Root\frontend"
    npm install --prefer-offline
    npm run build
    if (-not (Test-Path "dist\index.html")) {
        Write-Error "Frontend build failed – dist\index.html not found."
    }
    Pop-Location
    Write-Host "      Frontend built OK." -ForegroundColor Green
} else {
    Write-Host "[1/4] Skipping frontend build." -ForegroundColor DarkGray
}

# ── 2. Create / activate Python venv ────────────────────────────────────────
Write-Host "`n[2/4] Setting up Python environment..." -ForegroundColor Yellow
$VenvDir = "$Root\.venv"
if (-not $SkipVenv) {
    if (-not (Test-Path $VenvDir)) {
        python -m venv $VenvDir
    }
    & "$VenvDir\Scripts\pip" install --upgrade pip --quiet
    & "$VenvDir\Scripts\pip" install -r "$Root\backend\requirements.txt" --quiet
    Write-Host "      Python env ready." -ForegroundColor Green
}

$Python = "$VenvDir\Scripts\python.exe"
if (-not (Test-Path $Python)) { $Python = "python" }

# ── 3. Run PyInstaller ───────────────────────────────────────────────────────
Write-Host "`n[3/4] Running PyInstaller..." -ForegroundColor Yellow

$FrontendDist = "$Root\frontend\dist"
$BackendSrc   = "$Root\backend\src"
$Launcher     = "$Root\desktop\launcher.py"
$OutDir       = "$Root\dist"

# Build the --add-data argument (src;dest inside the bundle)
$AddData      = "$FrontendDist;frontend/dist"
$AddPaths     = $BackendSrc

& $Python -m PyInstaller `
    --onefile `
    --noconsole `
    --name "Invincible" `
    --distpath $OutDir `
    --workpath "$Root\build\pyinstaller" `
    --specpath "$Root\build" `
    --add-data "$AddData" `
    --paths $AddPaths `
    --hidden-import "app.main" `
    --hidden-import "app.api.control" `
    --hidden-import "app.api.targets" `
    --hidden-import "app.api.heatmap" `
    --hidden-import "app.api.encounters" `
    --hidden-import "app.api.exports" `
    --hidden-import "app.db.database" `
    --hidden-import "app.ingest.scanner" `
    --hidden-import "app.processing.aggregator" `
    --hidden-import "app.core.config" `
    --hidden-import "app.core.allowlist" `
    $Launcher

if (-not (Test-Path "$OutDir\Invincible.exe")) {
    Write-Error "PyInstaller did not produce Invincible.exe"
}

# ── 4. Copy targets template ─────────────────────────────────────────────────
Write-Host "`n[4/4] Copying assets..." -ForegroundColor Yellow
Copy-Item "$Root\targets.example.json" "$OutDir\targets.example.json" -Force

Write-Host "`n=== BUILD COMPLETE ===" -ForegroundColor Cyan
Write-Host "Executable: $OutDir\Invincible.exe" -ForegroundColor Green
Write-Host "Copy targets.example.json to %USERPROFILE%\Invincible\targets.json and edit it."
