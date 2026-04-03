"""
Export endpoints:
  GET /export/csv          – raw observations as CSV
  GET /export/encounters   – encounters as CSV
  GET /export/geojson      – encounters as GeoJSON FeatureCollection
"""
import csv
import io
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.db.database import get_db

router = APIRouter()

@router.get("/csv")
def export_raw_csv():
    conn = get_db()
    rows = conn.execute(
        "SELECT ts_ms,lat,lon,speed_mps,heading,source,target_key,rssi FROM raw_observations ORDER BY ts_ms"
    ).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["ts_ms","lat","lon","speed_mps","heading","source","target_key","rssi"])
    for r in rows:
        w.writerow(list(r))
    buf.seek(0)
    return StreamingResponse(buf, media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=raw_observations.csv"})

@router.get("/encounters")
def export_encounters_csv():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM encounters ORDER BY start_ts_ms"
    ).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id","target_key","source","start_ts_ms","end_ts_ms","peak_ts_ms",
                "peak_lat","peak_lon","rssi_max","hit_count","confidence","label","color"])
    for r in rows:
        w.writerow(list(r))
    buf.seek(0)
    return StreamingResponse(buf, media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=encounters.csv"})

@router.get("/geojson")
def export_geojson():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM encounters WHERE peak_lat IS NOT NULL ORDER BY start_ts_ms"
    ).fetchall()
    features = []
    for r in rows:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["peak_lon"], r["peak_lat"]]},
            "properties": {
                "id": r["id"],
                "target_key": r["target_key"],
                "source": r["source"],
                "start_ts_ms": r["start_ts_ms"],
                "end_ts_ms": r["end_ts_ms"],
                "rssi_max": r["rssi_max"],
                "hit_count": r["hit_count"],
                "label": r["label"],
                "color": r["color"],
            }
        })
    geo = {"type": "FeatureCollection", "features": features}
    return StreamingResponse(
        io.StringIO(json.dumps(geo, indent=2)),
        media_type="application/geo+json",
        headers={"Content-Disposition": "attachment; filename=encounters.geojson"}
    )
