from fastapi import APIRouter
from app.db.session import SessionLocal
from app.db.repo import heatmap_geojson

router = APIRouter()

@router.get('/heatmap')
def heatmap(since: int | None = None, cellSize: int = 100, target: str | None = None):
    with SessionLocal() as db:
        return heatmap_geojson(db, since=since, target=target)
