# ============================================================================
#  Invincible.Inc Scanner — Full Build Pipeline
#  Run from the repo root:  .\scanner-map\scripts\build.ps1
#
#  Produces:
#    scanner-map\dist\InvincibleInc\InvincibleInc.exe           (raw bundle, UAC admin manifest)
#    scanner-map\dist_installer\InvincibleInc_Setup_v1.1.exe    (installer)
#
#  Requirements:
#    - Node.js + npm
#    - Python 3.11+ with venv at scanner-map\.venv
#    - PyInstaller  (pip install pyinstaller)
#    - Pillow       (pip install pillow)
#    - Inno Setup 6 (iscc.exe on PATH or at default install location)
# ============================================================================

param(
    [switch]$SkipFrontend,    # skip `npm run build`
    [switch]$SkipVenv,        # skip pip install
    [switch]$SkipInstaller,   # skip Inno Setup (just build the EXE bundle)
    [switch]$SkipIcon         # skip icon generation (use existing icon.ico)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root        = Split-Path $PSScriptRoot -Parent           # scanner-map/
$FrontendDir = Join-Path $Root 'frontend'
$BackendDir  = Join-Path $Root 'backend'
$UserAppDir  = Join-Path $Root 'user_app'
$InstallerDir= Join-Path $Root 'installer'
$VenvDir     = Join-Path $Root '.venv'
$Python      = if (Test-Path "$VenvDir\Scripts\python.exe") { "$VenvDir\Scripts\python.exe" } else { 'python' }
$Pip         = if (Test-Path "$VenvDir\Scripts\pip.exe")    { "$VenvDir\Scripts\pip.exe"    } else { 'pip'    }
$SpecPath    = Join-Path $UserAppDir 'user.spec'
$DailyReleaseScript = Join-Path $Root 'scripts\daily_release.py'

function Step($n, $total, $msg) {
    Write-Host "`n[$n/$total] $msg" -ForegroundColor Yellow
}
function OK($msg) { Write-Host "      $msg" -ForegroundColor Green }
function Fail($msg) { Write-Error $msg }
function Repair-PyInstallerLayout($distDir) {
    $internalDir = Join-Path $distDir '_internal'
    if (-not (Test-Path $internalDir)) { return }
    $dll = Get-ChildItem -Path $internalDir -Filter 'python312.dll' -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $dll) {
        $dll = Get-ChildItem -Path $internalDir -Filter 'python3*.dll' -File -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    }
    if ($dll) {
        Copy-Item -LiteralPath $dll.FullName -Destination (Join-Path $distDir $dll.Name) -Force
        OK "Mirrored $($dll.Name) to bundle root."
    }
}

$TotalSteps = 5
if ($SkipInstaller) { $TotalSteps = 4 }

Write-Host "`n══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Invincible.Inc Builder  v1.1" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════`n" -ForegroundColor Cyan

if (Test-Path $DailyReleaseScript) {
    & $Python $DailyReleaseScript
}

# ── 1. React frontend ─────────────────────────────────────────────────────────
Step 1 $TotalSteps 'Building React frontend...'
if (-not $SkipFrontend) {
    Push-Location $FrontendDir
    npm install --prefer-offline --silent
    npm run build
    if (-not (Test-Path 'dist\index.html')) { Fail 'Frontend build failed — dist\index.html not found.' }
    Pop-Location
    OK 'Frontend built.'
} else {
    if (-not (Test-Path "$FrontendDir\dist\index.html")) {
        Fail 'No frontend dist found and -SkipFrontend was set. Run without -SkipFrontend first.'
    }
    Write-Host '      Skipped (using existing dist).' -ForegroundColor DarkGray
}

# ── 2. Python environment ────────────────────────────────────────────────────
Step 2 $TotalSteps 'Setting up Python environment...'
if (-not $SkipVenv) {
    if (-not (Test-Path $VenvDir)) {
        python -m venv $VenvDir
    }
    & $Pip install --upgrade pip --quiet
    & $Pip install -r "$BackendDir\requirements.txt" --quiet
    & $Pip install pyinstaller pillow --quiet
    OK 'Python environment ready.'
} else {
    Write-Host '      Skipped.' -ForegroundColor DarkGray
}

# ── 3. Generate icon ──────────────────────────────────────────────────────────
Step 3 $TotalSteps 'Generating app icon...'
if (-not $SkipIcon) {
    & $Python "$InstallerDir\generate_icon.py"
    if (-not (Test-Path "$InstallerDir\icon.ico")) { Fail 'Icon generation failed.' }
    OK 'icon.ico generated.'
} else {
    if (-not (Test-Path "$InstallerDir\icon.ico")) {
        Write-Host '      Warning: icon.ico not found — EXE will use default icon.' -ForegroundColor DarkYellow
    } else {
        Write-Host '      Skipped (using existing icon.ico).' -ForegroundColor DarkGray
    }
}

# Also generate installer wizard images if they don't exist and we plan to build the installer
if (-not $SkipInstaller -and -not (Test-Path "$InstallerDir\wizard_banner.bmp")) {
    Write-Host '      Generating installer wizard images...' -ForegroundColor DarkGray
    & $Python "$InstallerDir\generate_assets.py"
}

# ── 4. PyInstaller ────────────────────────────────────────────────────────────
Step 4 $TotalSteps 'Running PyInstaller...'
Push-Location $Root
if (-not (Test-Path $SpecPath)) { Fail "Missing PyInstaller spec: $SpecPath" }
& $Python -m PyInstaller $SpecPath --clean --noconfirm
Pop-Location

$ExePath = "$Root\dist\InvincibleInc\InvincibleInc.exe"
if (-not (Test-Path $ExePath)) { Fail "PyInstaller did not produce InvincibleInc.exe" }
Repair-PyInstallerLayout "$Root\dist\InvincibleInc"
$ExeSize = [math]::Round((Get-Item $ExePath).Length / 1MB, 1)
OK "InvincibleInc.exe built ($ExeSize MB) with requireAdministrator manifest."

# ── 5. Inno Setup installer ──────────────────────────────────────────────────
if (-not $SkipInstaller) {
    Step 5 $TotalSteps 'Building installer with Inno Setup...'

    # Locate iscc.exe
    $IsccPaths = @(
        'iscc.exe',
        'C:\Program Files (x86)\Inno Setup 6\iscc.exe',
        'C:\Program Files\Inno Setup 6\iscc.exe'
    )
    $Iscc = $null
    foreach ($p in $IsccPaths) {
        if (Get-Command $p -ErrorAction SilentlyContinue) { $Iscc = $p; break }
        if (Test-Path $p) { $Iscc = $p; break }
    }

    if (-not $Iscc) {
        Write-Host '' -ForegroundColor Red
        Write-Host '  ✗ Inno Setup not found. Download from jrsoftware.org/isinfo.php' -ForegroundColor Red
        Write-Host '    The EXE bundle is ready at:' -ForegroundColor DarkYellow
        Write-Host "    $ExePath" -ForegroundColor White
        Write-Host '    Skipping installer creation.' -ForegroundColor DarkYellow
    } else {
        $OutDir = Join-Path $Root 'dist_installer'
        New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
        & $Iscc "$InstallerDir\installer.iss"
        $SetupExe = "$OutDir\InvincibleInc_Setup_v1.1.exe"
        if (-not (Test-Path $SetupExe)) { Fail 'Inno Setup did not produce installer.' }
        $SetupSize = [math]::Round((Get-Item $SetupExe).Length / 1MB, 1)
        OK "Installer built ($SetupSize MB)."
    }
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host "`n══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host '  BUILD COMPLETE' -ForegroundColor Green
Write-Host '══════════════════════════════════════════' -ForegroundColor Cyan
Write-Host ''
Write-Host "  EXE bundle : $ExePath"
if (-not $SkipInstaller -and (Test-Path "$Root\dist_installer\InvincibleInc_Setup_v1.1.exe")) {
    Write-Host "  Installer  : $Root\dist_installer\InvincibleInc_Setup_v1.1.exe"
}
Write-Host ''
Write-Host '  To distribute: share the Setup .exe — it includes everything.' -ForegroundColor DarkGray
Write-Host '  Users will need Npcap for WiFi scanning (app prompts on first launch).' -ForegroundColor DarkGray
Write-Host ''
