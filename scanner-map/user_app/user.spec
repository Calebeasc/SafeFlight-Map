# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

ROOT = Path.cwd()
USER_APP = ROOT / "user_app"
BACKEND_SRC = ROOT / "backend" / "src"
FRONTEND_DIST = ROOT / "frontend" / "dist"
INSTALLER_ICON = ROOT / "installer" / "icon.ico"

datas = [
    (str(BACKEND_SRC), "src"),
]

if FRONTEND_DIST.exists():
    datas.append((str(FRONTEND_DIST), "frontend"))

a = Analysis(
    [str(USER_APP / "run.py")],
    pathex=[str(ROOT), str(BACKEND_SRC)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "pystray._win32",
        "webview.platforms.edgechromium",
        "webview.platforms.winforms",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "PyQt5", "PyQt6", "PySide2", "PySide6", "matplotlib"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="InvincibleInc",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=str(INSTALLER_ICON) if INSTALLER_ICON.exists() else None,
    uac_admin=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="InvincibleInc",
    contents_directory="_internal",
)
