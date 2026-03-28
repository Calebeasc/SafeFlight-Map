# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for Invincible.Inc (Windows)
#
# Usage (from backend/ directory):
#   1. Build the frontend first:
#        cd ../frontend && npm run build && cd ../backend
#   2. Then build the exe:
#        pyinstaller invincible.spec --clean --noconfirm
#   3. Output:
#        backend/dist/InvincibleInc/InvincibleInc.exe
#
#   To distribute: zip the entire backend/dist/InvincibleInc/ folder.
#   The .exe must stay with its sibling files.
#

import os

HERE          = os.path.abspath(os.path.dirname(SPEC))
FRONTEND_DIST = os.path.normpath(os.path.join(HERE, '..', 'frontend', 'dist'))
MANIFEST      = os.path.join(HERE, 'invincible.manifest')

block_cipher = None

a = Analysis(
    [os.path.join(HERE, 'run.py')],
    pathex=[os.path.join(HERE, 'src')],
    binaries=[],
    datas=[
        # React build output — served as static files by FastAPI
        (FRONTEND_DIST, 'frontend/dist'),
        # Python source tree — needed so frozen imports resolve
        (os.path.join(HERE, 'src'), 'src'),
    ],
    hiddenimports=[
        # ── uvicorn internals PyInstaller misses ──
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.logging',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        # ── FastAPI / Starlette ──
        'fastapi',
        'fastapi.middleware.cors',
        'fastapi.staticfiles',
        'fastapi.responses',
        'starlette.routing',
        'starlette.staticfiles',
        'starlette.middleware.cors',
        'starlette.websockets',
        'anyio',
        'anyio._backends._asyncio',
        # ── BLE ──
        'bleak',
        'bleak.backends.winrt.scanner',
        'bleak.backends.winrt.client',
        # ── pywebview Windows backend ──
        'webview',
        'webview.platforms.winforms',
        'webview.platforms.mshtml',
        # ── pystray + Pillow ──
        'pystray',
        'pystray._win32',
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        # ── App modules ──
        'app.main',
        'app.db.database',
        'app.core.config',
        'app.core.allowlist',
        'app.core.runtime_settings',
        'app.api.control',
        'app.api.targets',
        'app.api.heatmap',
        'app.api.encounters',
        'app.api.exports',
        'app.api.settings_api',
        'app.api.gps_ws',
        'app.api.gps',
        'app.api.route_stats',
        'app.api.users',
        'app.api.scan',
        'app.ingest.scanner',
        'app.ingest.wifi_scanner',
        'app.ingest.ble_scanner',
        'app.ingest.gps_store',
        'app.ingest.gps_relay',
        'app.ingest.route_recorder',
        'app.processing.aggregator',
        # ── Windows stdlib ──
        'winreg',
        'ctypes',
        'sqlite3',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # Strip packages you definitely don't use to keep the bundle smaller
    excludes=['tkinter', 'matplotlib', 'numpy', 'pandas', 'scipy', 'IPython'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='DevInvincibleInc',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,           # No console window
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    manifest=MANIFEST,       # UAC elevation + DPI awareness
    # icon='assets/icon.ico',  # Uncomment if you add a .ico file
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='DevInvincibleInc',
)
