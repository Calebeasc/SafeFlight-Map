# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for Invincible.Inc USER app
# Full WiFi + BLE scanner bundled — requires UAC admin at runtime.
#
# Build from repo root:
#   pyinstaller user_app/user.spec --clean --noconfirm
#
# Output: user_app/dist/InvincibleInc/InvincibleInc.exe
#

import os

HERE          = os.path.abspath(os.path.dirname(SPEC))
REPO_ROOT     = os.path.normpath(os.path.join(HERE, '..'))
FRONTEND_DIST = os.path.normpath(os.path.join(REPO_ROOT, 'frontend', 'dist'))
BACKEND_SRC   = os.path.normpath(os.path.join(REPO_ROOT, 'backend', 'src'))
MANIFEST      = os.path.normpath(os.path.join(REPO_ROOT, 'backend', 'invincible.manifest'))
ICON          = os.path.normpath(os.path.join(REPO_ROOT, 'backend', 'assets', 'icon.ico'))

block_cipher = None

a = Analysis(
    [os.path.join(HERE, 'run.py')],
    pathex=[BACKEND_SRC],
    binaries=[],
    datas=[
        (FRONTEND_DIST, 'frontend/dist'),
        (BACKEND_SRC,   'src'),
    ],
    hiddenimports=[
        # uvicorn
        'uvicorn.lifespan.on', 'uvicorn.lifespan.off',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.logging', 'uvicorn.loops.auto', 'uvicorn.loops.asyncio',
        # FastAPI / Starlette
        'fastapi', 'fastapi.middleware.cors', 'fastapi.staticfiles',
        'fastapi.responses', 'starlette.routing', 'starlette.staticfiles',
        'starlette.middleware.cors', 'starlette.websockets',
        'anyio', 'anyio._backends._asyncio',
        # BLE
        'bleak', 'bleak.backends.winrt.scanner', 'bleak.backends.winrt.client',
        # pywebview
        'webview', 'webview.platforms.winforms',
        'webview.platforms.mshtml', 'webview.platforms.edgechromium',
        # pystray + Pillow
        'pystray', 'pystray._win32', 'PIL', 'PIL.Image', 'PIL.ImageDraw',
        # App modules
        'app.main', 'app.db.database',
        'app.core.config', 'app.core.allowlist', 'app.core.runtime_settings',
        'app.api.control', 'app.api.targets', 'app.api.heatmap',
        'app.api.encounters', 'app.api.exports', 'app.api.settings_api',
        'app.api.gps_ws', 'app.api.gps', 'app.api.route_stats',
        'app.api.users', 'app.api.scan',
        'app.ingest.scanner', 'app.ingest.wifi_scanner',
        'app.ingest.ble_scanner', 'app.ingest.gps_store',
        'app.ingest.gps_relay', 'app.ingest.route_recorder',
        'app.processing.aggregator',
        # Windows stdlib
        'winreg', 'ctypes', 'sqlite3',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
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
    name='InvincibleInc',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    manifest=MANIFEST,    # UAC elevation — WiFi scanning needs admin
    icon=ICON if os.path.exists(ICON) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='InvincibleInc',
)
