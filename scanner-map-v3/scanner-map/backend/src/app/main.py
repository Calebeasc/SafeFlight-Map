"""SafeFlight Map / Invincible.Inc — FastAPI backend"""
import sys, os

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC  = os.path.join(_HERE, '..', '..')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.db.database import init_db
from app.api import control, targets, heatmap, encounters, exports
from app.api import gps, settings_api
from app.core.config import settings

app = FastAPI(title='Invincible.Inc Scanner', version='0.2.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

app.include_router(control.router,      prefix='/control',   tags=['control'])
app.include_router(targets.router,      prefix='/targets',   tags=['targets'])
app.include_router(heatmap.router,      prefix='/heatmap',   tags=['heatmap'])
app.include_router(encounters.router,   prefix='/encounters', tags=['encounters'])
app.include_router(exports.router,      prefix='/export',    tags=['exports'])
app.include_router(gps.router,          prefix='/gps',       tags=['gps'])
app.include_router(settings_api.router, prefix='/settings',  tags=['settings'])

@app.get('/health')
def health():
    from app.ingest import gps_store
    return {'status': 'ok', 'version': '0.2.0', 'gps': gps_store.status()}

@app.on_event('startup')
async def startup():
    init_db()
    # Apply saved runtime settings on boot
    try:
        from app.api.settings_api import load
        saved = load()
        cfg = settings
        for k, v in saved.items():
            attr = k.upper()
            if hasattr(cfg, attr):
                setattr(cfg, attr, v)
    except Exception:
        pass

def _frontend_dist() -> str:
    if getattr(sys, 'frozen', False):
        base = sys._MEIPASS
        return os.path.normpath(os.path.join(base, 'frontend', 'dist'))
    return os.path.normpath(os.path.join(_HERE, '..', '..', '..', '..', 'frontend', 'dist'))

_dist = _frontend_dist()
if os.path.isdir(_dist):
    app.mount('/', StaticFiles(directory=_dist, html=True), name='static')
else:
    @app.get('/')
    def index():
        return {'message': 'Run: cd frontend && npm run build'}
