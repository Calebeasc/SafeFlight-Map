"""SafeFlight Map / Invincible.Inc – FastAPI backend v0.3"""
import sys, os

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC  = os.path.join(_HERE, "..", "..")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import time
import collections
import threading
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.db.database import init_db
from app.api import control, targets, heatmap, encounters, exports
from app.api import settings_api, gps_ws, route_stats, users, scan, device_filter
from app.api import replay, hotspots, accounts
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
app.include_router(achievements.router,   prefix="/achievements",   tags=["achievements"])
app.include_router(stoppers.router,       prefix="/stoppers",        tags=["stoppers"])
app.include_router(flock_cameras.router,  prefix="/flock",            tags=["flock"])

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.1.0"}

@app.on_event("startup")
async def startup():
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

def _frontend_dist() -> str:
    if getattr(sys, "frozen", False):
        return os.path.normpath(os.path.join(sys._MEIPASS, "frontend", "dist"))
    return os.path.normpath(os.path.join(_HERE, "..", "..", "..", "frontend", "dist"))

_dist = _frontend_dist()
if os.path.isdir(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")
else:
    @app.get("/")
    def index():
        return {"message": "Run: cd frontend && npm run build"}
