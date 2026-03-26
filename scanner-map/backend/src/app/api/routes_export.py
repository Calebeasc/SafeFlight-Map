from fastapi import APIRouter
router = APIRouter(prefix="/export")
@router.get("/geojson")
def export_geojson():
    return {"type": "FeatureCollection", "features": []}
@router.get("/csv")
def export_csv():
    return {"status": "not_implemented"}
