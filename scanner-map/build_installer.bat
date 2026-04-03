@echo off
setlocal enabledelayedexpansion
title Invincible.Inc — Building Installer...

:: ═══════════════════════════════════════════════════════════════════
::  Invincible.Inc Scanner — Full Installer Build Pipeline
::
::  Produces:  dist_installer\InvincibleInc_Setup_v1.0.exe
::
::  Requirements:
::    - Node.js  (npm in PATH)
::    - Python 3 (python in PATH, with pip)
::    - Inno Setup 6  (iscc.exe — auto-detected below)
:: ═══════════════════════════════════════════════════════════════════

set ROOT=%~dp0
set STEP=0
set ERRORS=0

:: ── Banner ───────────────────────────────────────────────────────────────────
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║         Invincible.Inc  ·  Installer Build       ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: ── Locate Inno Setup ────────────────────────────────────────────────────────
set ISCC=
for %%P in (
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    "C:\Program Files\Inno Setup 6\ISCC.exe"
    "C:\Program Files (x86)\Inno Setup 5\ISCC.exe"
) do (
    if exist %%P (
        set ISCC=%%~P
        goto :found_iscc
    )
)

:iscc_not_found
echo  [!] Inno Setup 6 not found.
echo.
echo      Download it free from:
echo      https://jrsoftware.org/isdl.php
echo.
echo      After installing Inno Setup, re-run this script.
echo.
pause
exit /b 1

:found_iscc
echo  Found Inno Setup: %ISCC%
echo.

:: ── Step 1: Build React frontend ─────────────────────────────────────────────
set /a STEP+=1
echo  [%STEP%/5]  Building React frontend...
cd "%ROOT%frontend"
call npm run build >"%ROOT%build_frontend.log" 2>&1
if errorlevel 1 (
    echo         FAILED  — see build_frontend.log
    set /a ERRORS+=1
    goto :error
)
echo         OK

:: ── Step 2: Install Python dependencies ─────────────────────────────────────
set /a STEP+=1
echo  [%STEP%/5]  Installing Python dependencies...
cd "%ROOT%backend"
pip install -r requirements.txt --quiet --disable-pip-version-check >"%ROOT%build_pip.log" 2>&1
if errorlevel 1 (
    echo         FAILED  — see build_pip.log
    set /a ERRORS+=1
    goto :error
)
echo         OK

:: ── Step 3: Bundle with PyInstaller ─────────────────────────────────────────
set /a STEP+=1
echo  [%STEP%/5]  Bundling app with PyInstaller  ^(~60 sec^)...
cd "%ROOT%"
pyinstaller user_app\user.spec --clean --noconfirm >"%ROOT%build_pyinstaller.log" 2>&1
if errorlevel 1 (
    echo         FAILED  — see build_pyinstaller.log
    set /a ERRORS+=1
    goto :error
)
if not exist "%ROOT%dist\InvincibleInc\InvincibleInc.exe" (
    echo         FAILED  — InvincibleInc.exe not found after build
    set /a ERRORS+=1
    goto :error
)
echo         OK

:: ── Step 4: Generate installer wizard images ─────────────────────────────────
set /a STEP+=1
echo  [%STEP%/5]  Generating installer graphics...
cd "%ROOT%"
python installer\generate_assets.py >"%ROOT%build_assets.log" 2>&1
if errorlevel 1 (
    echo         FAILED  — see build_assets.log
    echo         ^(Tip: pip install Pillow^)
    set /a ERRORS+=1
    goto :error
)
echo         OK

:: ── Step 5: Compile Inno Setup installer ─────────────────────────────────────
set /a STEP+=1
echo  [%STEP%/5]  Compiling installer with Inno Setup...
cd "%ROOT%"
if not exist "dist_installer" mkdir dist_installer
"%ISCC%" installer\installer.iss >"%ROOT%build_inno.log" 2>&1
if errorlevel 1 (
    echo         FAILED  — see build_inno.log
    set /a ERRORS+=1
    goto :error
)
echo         OK

:: ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║  Build complete!                                 ║
echo  ╠══════════════════════════════════════════════════╣
echo  ║                                                  ║
echo  ║  Installer:                                      ║
echo  ║    dist_installer\InvincibleInc_Setup_v1.0.exe  ║
echo  ║                                                  ║
echo  ║  Share this single .exe file — recipients        ║
echo  ║  do NOT need Python, Node, or any other tools.  ║
echo  ║                                                  ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: Open the output folder in Explorer
start "" "%ROOT%dist_installer"
goto :end

:error
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║  Build FAILED at step %STEP%/5                          ║
echo  ╚══════════════════════════════════════════════════╝
echo.
echo  Log files in the repo root:
echo    build_frontend.log
echo    build_pip.log
echo    build_pyinstaller.log
echo    build_assets.log
echo    build_inno.log
echo.

:end
cd "%ROOT%"
pause
endlocal
