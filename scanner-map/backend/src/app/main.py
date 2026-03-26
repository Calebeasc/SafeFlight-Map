from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.api.routes_health import router as health_router
from app.api.routes_control import router as control_router
from app.api.routes_heatmap import router as heatmap_router
from app.api.routes_encounters import router as encounters_router
from app.api.routes_targets import router as targets_router
from app.db.session import engine
from app.db.models import Base
from app.config import BASE_DIR, settings

app = FastAPI(title='scanner-map')
Base.metadata.create_all(bind=engine)

app.include_router(health_router)
app.include_router(control_router)
app.include_router(heatmap_router)
app.include_router(encounters_router)
app.include_router(targets_router)

frontend_dist = BASE_DIR / settings.frontend_dist
if frontend_dist.exists():
    app.mount('/', StaticFiles(directory=str(frontend_dist), html=True), name='frontend')
