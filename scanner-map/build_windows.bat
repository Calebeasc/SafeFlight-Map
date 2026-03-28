@echo off
setlocal
echo.
echo  ==============================
echo   Invincible.Inc  Windows Build
echo  ==============================
echo.

:: ── 1. Build React frontend ─────────────────────────────────────────────────
echo [1/3] Building React frontend...
cd "%~dp0frontend"
call npm run build
if errorlevel 1 (
    echo.
    echo  FAILED: npm build failed. Check the output above.
    pause & exit /b 1
)
cd "%~dp0"

:: ── 2. Install / update Python deps ─────────────────────────────────────────
echo.
echo [2/3] Installing Python dependencies...
cd "%~dp0backend"
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo.
    echo  FAILED: pip install failed.
    pause & exit /b 1
)

:: ── 3. Bundle with PyInstaller ───────────────────────────────────────────────
echo.
echo [3/3] Bundling with PyInstaller (this takes ~60 seconds)...
pyinstaller invincible.spec --clean --noconfirm
if errorlevel 1 (
    echo.
    echo  FAILED: PyInstaller failed. Check the output above.
    cd "%~dp0"
    pause & exit /b 1
)
cd "%~dp0"

echo.
echo  ==============================
echo   Build complete!
echo  ==============================
echo.
echo  Executable : backend\dist\InvincibleInc\InvincibleInc.exe
echo  To share   : zip the entire backend\dist\InvincibleInc\ folder
echo.
echo  First run will prompt for administrator access (needed for WiFi scanning).
echo  The app will appear in the system tray after launch.
echo.
pause
