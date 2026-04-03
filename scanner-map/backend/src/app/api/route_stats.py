"""
Route, stats, and data management endpoints.

GET  /route?since=<ms>&limit=5000   – GPS breadcrumbs for the polyline
GET  /stats                         – row counts and DB size
POST /data/clear?table=<name>       – clear a specific table (or 'all')
"""
import os
import time
from fastapi import APIRouter, Query
from typing import Optional
from app.db.database import get_db
from app.core.config import settings

router = APIRouter()


# ── Route polyline ────────────────────────────────────────────────────────────
@router.get("/route")
def get_route(
    since: Optional[int] = Query(None, description="Unix ms cutoff"),
    limit: int = Query(5000, le=20000),
):
    conn = get_db()
    q = "SELECT ts_ms, lat, lon, speed_mps, heading FROM route_points WHERE 1=1"
    params = []
    if since:
        q += " AND ts_ms >= ?"
        params.append(since)
    q += " ORDER BY ts_ms DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(q, params).fetchall()
    # Reverse so it's chronological
    points = [{"ts": r["ts_ms"], "lat": r["lat"], "lon": r["lon"],
               "speed": r["speed_mps"], "heading": r["heading"]}
              for r in reversed(rows)]
    return {"points": points, "count": len(points)}


# ── Database stats ────────────────────────────────────────────────────────────
@router.get("/stats")
def get_stats():
    conn = get_db()

    def count(table):
        try:
            return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        except Exception:
            return 0

    def oldest(table, col="ts_ms"):
        try:
            r = conn.execute(f"SELECT MIN({col}) FROM {table}").fetchone()[0]
            return r
        except Exception:
            return None

    db_size = 0
    try:
        db_size = os.path.getsize(settings.DB_PATH)
    except Exception:
        pass

    return {
        "raw_observations": count("raw_observations"),
        "encounters":       count("encounters"),
        "heat_cells":       count("heat_cells"),
        "route_points":     count("route_points"),
        "oldest_obs_ms":    oldest("raw_observations"),
        "oldest_route_ms":  oldest("route_points"),
        "db_size_bytes":    db_size,
        "db_size_mb":       round(db_size / 1024 / 1024, 2),
    }


# ── Clear data ────────────────────────────────────────────────────────────────
CLEARABLE = {"raw_observations", "encounters", "heat_cells", "route_points"}

@router.post("/data/clear")
def clear_data(table: str = Query(..., description="Table name or 'all'")):
    conn = get_db()
    cleared = []
    if table == "all":
        for t in CLEARABLE:
            conn.execute(f"DELETE FROM {t}")
            cleared.append(t)
    elif table in CLEARABLE:
        conn.execute(f"DELETE FROM {table}")
        cleared.append(table)
    else:
        return {"error": f"Unknown table '{table}'. Valid: {sorted(CLEARABLE)} or 'all'"}
    conn.commit()
    return {"cleared": cleared, "status": "ok"}
