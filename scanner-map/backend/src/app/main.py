from fastapi import FastAPI
from app.api.routes_health import router as health_router
from app.api.routes_control import router as control_router
from app.api.routes_heatmap import router as heatmap_router
from app.api.routes_encounters import router as encounters_router
from app.api.routes_export import router as export_router
from app.api.routes_targets import router as targets_router

app = FastAPI(title="scanner-map")
app.include_router(health_router)
app.include_router(control_router)
app.include_router(heatmap_router)
app.include_router(encounters_router)
app.include_router(export_router)
app.include_router(targets_router)
