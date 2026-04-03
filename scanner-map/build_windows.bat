@echo off
setlocal

echo [1/1] Running consolidated Windows build pipeline...
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1"
if %ERRORLEVEL% neq 0 (
    echo [CRITICAL] Windows build failed.
    pause
    exit /b %ERRORLEVEL%
)

echo [SUCCESS] Build pipeline completed.
pause
