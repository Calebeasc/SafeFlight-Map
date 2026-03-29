"""SafeFlight Map / Invincible.Inc – FastAPI backend v0.3"""
import sys, os
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC  = os.path.join(_HERE, "..", "..")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import time
import collections
import threading
from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.db.database import init_db
from app.api import control, targets, heatmap, encounters, exports
from app.api import settings_api, gps_ws, route_stats, users, scan, device_filter
from app.api import replay, hotspots, accounts, dev_auth
from app.api import achievements
from app.api import stoppers
from app.api import flock_cameras

app = FastAPI(title="Invincible.Inc Scanner", version="1.1.0")

# ── Security headers middleware ───────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(), camera=()"
        # Only add HSTS if served over HTTPS (local dev is HTTP)
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ── Simple in-memory rate limiter ─────────────────────────────────────────────
_rate_lock = threading.Lock()
_rate_store: dict = collections.defaultdict(list)  # ip → [ts, ...]

_RATE_RULES = {
    "/control":  (20, 60),   # 20 req / 60 s
    "/accounts": (30, 60),   # 30 req / 60 s
    "/scan":     (30, 10),   # 30 req / 10 s  (Lab tab polls 4 endpoints every 5s)
}

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        client_ip = (request.headers.get("x-forwarded-for") or
                     (request.client.host if request.client else "local"))
        now = time.time()
        for prefix, (limit, window) in _RATE_RULES.items():
            if path.startswith(prefix):
                key = f"{client_ip}:{prefix}"
                with _rate_lock:
                    hits = _rate_store[key]
                    hits[:] = [t for t in hits if now - t < window]
                    if len(hits) >= limit:
                        return Response(
                            content='{"detail":"rate limit exceeded"}',
                            status_code=429,
                            media_type="application/json",
                            headers={"Retry-After": str(window)},
                        )
                    hits.append(now)
                break
        return await call_next(request)

app.add_middleware(RateLimitMiddleware)

# ── CORS: localhost origins only (Vite dev + production same-origin) ──────────
_LOCALHOST_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:8000",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_LOCALHOST_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Device-ID"],
    allow_credentials=False,
)

# ── App Mode Detection ───────────────────────────────────────────────────────
# Detects if we are running in 'user' or 'sovereign' (dev) mode.
APP_MODE = "user"
if "--mode=sovereign" in sys.argv:
    APP_MODE = "sovereign"

@app.get("/health")
def get_health():
    return {
        "status": "online",
        "mode": APP_MODE,
        "version": "1.1.0"
    }

@app.get("/adsb/status")
def get_adsb_status():
    from app.ingest import adsb_scanner
    return {"aircraft": adsb_scanner.get_active_aircraft()}

from app.api import vanguard
app.include_router(vanguard.router,       prefix="/vanguard",    tags=["vanguard"])
app.include_router(control.router,        prefix="/control",    tags=["control"])
app.include_router(targets.router,        prefix="/targets",    tags=["targets"])
app.include_router(heatmap.router,        prefix="/heatmap",    tags=["heatmap"])
app.include_router(encounters.router,     prefix="/encounters", tags=["encounters"])
app.include_router(exports.router,        prefix="/export",     tags=["exports"])
app.include_router(settings_api.router,   prefix="/settings",   tags=["settings"])
app.include_router(gps_ws.router,         prefix="",            tags=["gps"])
app.include_router(route_stats.router,    prefix="",            tags=["route"])
app.include_router(users.router,          prefix="/users",       tags=["users"])
app.include_router(scan.router,           prefix="/scan",          tags=["scan"])
app.include_router(device_filter.router,  prefix="/devices/filter", tags=["devices"])
app.include_router(replay.router,         prefix="/replay",         tags=["replay"])
app.include_router(hotspots.router,       prefix="/hotspots",       tags=["hotspots"])
app.include_router(accounts.router,       prefix="/accounts",       tags=["accounts"])
app.include_router(dev_auth.router,       prefix="/auth/dev",       tags=["auth"])
app.include_router(achievements.router,   prefix="/achievements",   tags=["achievements"])
app.include_router(stoppers.router,       prefix="/stoppers",        tags=["stoppers"])
app.include_router(flock_cameras.router,  prefix="/flock",            tags=["flock"])

# ── @smith: Sovereign-Only Intelligence Routes ───────────────────────────────
if APP_MODE == "sovereign":
    try:
        from app.api import accounts, users # Re-include for expanded dev access if needed
        # placeholder for future deep OSINT routes
        # app.include_router(osint_engine.router, prefix="/osint", tags=["osint"])
        pass
    except ImportError:
        pass

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.1.0"}

def setup_windows_environment():
    """
    Ensures the Windows environment is ready (Firewall, Start Menu, Folders).
    Executes silently on first launch.
    """
    if sys.platform != "win32":
        return

    import subprocess
    app_exe = sys.executable
    app_name = "InvincibleInc"

    # 1. Add Firewall Exception (Silent)
    try:
        # Check if rule exists
        check_cmd = f'netsh advfirewall firewall show rule name="{app_name}"'
        res = subprocess.run(check_cmd, capture_output=True, shell=True)
        if res.returncode != 0:
            # Add rule
            add_cmd = f'netsh advfirewall firewall add rule name="{app_name}" dir=in action=allow program="{app_exe}" enable=yes profile=any'
            subprocess.run(add_cmd, capture_output=True, shell=True)
    except:
        pass

    # 2. Ensure Data Folders exist
    if APP_MODE == "sovereign":
        # @ghost: Stealth Mode — No Start Menu, volatile data path
        data_dir = os.path.join(os.environ.get("TEMP", ""), "Invincible_Sovereign")
    else:
        data_dir = os.path.join(os.environ.get("USERPROFILE", ""), "SafeFlightMap")
    
    os.makedirs(data_dir, exist_ok=True)

@app.on_event("startup")
async def on_startup():
    setup_windows_environment()
    init_db()

    # Start Windows Location API fallback GPS (no-op on non-Windows or if winrt missing)
    try:
        from app.ingest import gps_store
        gps_store.start()
    except Exception:
        pass
    # Auto-start scanning immediately — no need to click Start in the dev panel
    try:
        from app.ingest.scanner import start_scanning
        start_scanning()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error('Auto-start scanning failed: %s', e)

    # @tron: Start ADS-B tracking
    try:
        from app.ingest import adsb_scanner
        adsb_scanner.scanner.start()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error('ADS-B start failed: %s', e)

# ── @architect: Absolute Resource Resolution ────────────────────────────────
def get_base_path() -> Path:
    """Return the resource root for source and PyInstaller layouts."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    return Path(__file__).resolve().parents[3]

def get_windows_download_targets() -> list[Path]:
    candidates = [
        _ROOT / "dist_installer" / "InvincibleInc_Setup_v1.1.exe",
        _ROOT / "explainer" / "Invincible_Setup_v1.1.exe",
        _ROOT / "dist" / "InvincibleInc" / "InvincibleInc.exe",
    ]
    if getattr(sys, "frozen", False):
        candidates.insert(0, Path(sys.executable).resolve())
    return candidates


def resolve_windows_download_path() -> Path:
    for candidate in get_windows_download_targets():
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("No Windows installer artifact found.")


def iter_file_chunks(path: Path, chunk_size: int = 64 * 1024):
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            yield chunk


_BASE = get_base_path()
_ROOT = _BASE
_dist = (_BASE / "frontend") if getattr(sys, "frozen", False) else (_ROOT / "frontend" / "dist")
_explainer = _ROOT / "explainer"


@app.api_route("/download/windows", methods=["GET", "HEAD"])
def download_windows_installer(request: Request):
    try:
        download_path = resolve_windows_download_path()
    except FileNotFoundError:
        return Response(
            content='{"detail":"windows installer artifact missing"}',
            status_code=404,
            media_type="application/json",
        )

    headers = {
        "Content-Disposition": 'attachment; filename="Invincible_Inc_Windows_Sovereign.exe"',
        "Content-Length": str(download_path.stat().st_size),
        "Cache-Control": "no-store",
    }
    media_type = "application/vnd.microsoft.portable-executable"

    if request.method == "HEAD":
        return Response(status_code=200, headers=headers, media_type=media_type)

    return StreamingResponse(
        iter_file_chunks(download_path),
        headers=headers,
        media_type=media_type,
    )


if _explainer.is_dir():
    app.mount("/explainer", StaticFiles(directory=_explainer, html=True), name="explainer")

if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")

    @app.exception_handler(404)
    async def spa_fallback(request, exc):
        _index = _dist / "index.html"
        if _index.is_file():
            return FileResponse(_index)
        return {"error": "Lattice UI payload missing. Run build."}
else:
    @app.get("/")
    def index():

        # Helpful diagnostic if frontend is missing
        return {
            "status": "active",
            "msg": "Lattice engine running. UI directory not found.",
            "diag": {"base": str(_BASE), "dist_target": str(_dist)}
        }
