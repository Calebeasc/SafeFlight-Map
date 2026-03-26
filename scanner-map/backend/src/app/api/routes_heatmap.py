from fastapi import APIRouter
router = APIRouter()
@router.get("/heatmap")
def heatmap(since: int | None = None, cellSize: int = 100, target: str | None = None):
    return {"type": "FeatureCollection", "features": []}
