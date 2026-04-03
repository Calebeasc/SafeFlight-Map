@echo off
setlocal enabledelayedexpansion
title Invincible.Inc — Building Installer...

set ROOT=%~dp0
set STEP=0

:: ── Locate Inno Setup ────────────────────────────────────────────────────────
set ISCC=
for %%P in (
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    "C:\Program Files\Inno Setup 6\ISCC.exe"
) do if exist %%P set ISCC=%%~P

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║     Invincible.Inc  ·  User App Installer        ║
echo  ║     Full WiFi + BLE Scanner                      ║
echo  ╚══════════════════════════════════════════════════╝
echo.

if "%ISCC%"=="" (
    echo  [!] Inno Setup 6 not found.
    echo.
    echo      Download free from: https://jrsoftware.org/isdl.php
    echo      Re-run this script after installing.
    echo.
    pause & exit /b 1
)
echo  Inno Setup: %ISCC%
echo.

:: ── Step 1: Build React frontend ─────────────────────────────────────────────
set /a STEP+=1
echo  [%STEP%/5]  Building React frontend...
cd "%ROOT%frontend"
call npm run build > "%ROOT%build_frontend_user.log" 2>&1
if errorlevel 1 ( echo         FAILED — see build_frontend_user.log & cd "%ROOT%" & goto :error )
cd "%ROOT%"
echo         OK

:: ── Step 2: Install Python deps ──────────────────────────────────────────────
set /a STEP+=1
echo  [%STEP%/5]  Installing Python dependencies...
cd "%ROOT%backend"
pip install -r requirements.txt --quiet --disable-pip-version-check > "%ROOT%build_pip_user.log" 2>&1
if errorlevel 1 ( echo         FAILED — see build_pip_user.log & cd "%ROOT%" & goto :error )
cd "%ROOT%"
echo         OK

:: ── Step 3: Bundle with PyInstaller ──────────────────────────────────────────
set /a STEP+=1
echo  [%STEP%/5]  Bundling Invincible.Inc with PyInstaller  ^(~60 sec^)...
pyinstaller user_app\user.spec --clean --noconfirm > "%ROOT%build_pyinstaller_user.log" 2>&1
if errorlevel 1 ( echo         FAILED — see build_pyinstaller_user.log & goto :error )
if not exist "%ROOT%user_app\dist\InvincibleInc\InvincibleInc.exe" (
    echo         FAILED — InvincibleInc.exe not found
    goto :error
)
echo         OK

:: ── Step 4: Generate wizard images ───────────────────────────────────────────
set /a STEP+=1
echo  [%STEP%/5]  Generating installer graphics...
python installer\user\generate_assets.py > "%ROOT%build_assets_user.log" 2>&1
if errorlevel 1 ( echo         FAILED — see build_assets_user.log & goto :error )
echo         OK

:: ── Step 5: Compile installer ─────────────────────────────────────────────────
set /a STEP+=1
echo  [%STEP%/5]  Compiling installer...
if not exist "%ROOT%dist_installer" mkdir "%ROOT%dist_installer"
"%ISCC%" installer\user\installer.iss > "%ROOT%build_inno_user.log" 2>&1
if errorlevel 1 ( echo         FAILED — see build_inno_user.log & goto :error )
echo         OK

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║  Done!                                           ║
echo  ╠══════════════════════════════════════════════════╣
echo  ║                                                  ║
echo  ║  Output:                                         ║
echo  ║    dist_installer\Invincible_Setup_v1.0.exe      ║
echo  ║                                                  ║
echo  ║  Full WiFi + BLE scanner included.               ║
echo  ║  Users will be prompted for admin on launch.     ║
echo  ║                                                  ║
echo  ╚══════════════════════════════════════════════════╝
echo.
start "" "%ROOT%dist_installer"
goto :end

:error
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║  Build FAILED at step %STEP%/5                          ║
echo  ╚══════════════════════════════════════════════════╝
echo.
echo  Check the log files in the repo root folder.
echo.

:end
cd "%ROOT%"
pause
endlocal
