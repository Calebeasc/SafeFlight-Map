"""
GET /heatmap?since=<ms>&target=<key>&cellSize=100

Returns a list of heat cell objects the frontend renders as a heat layer.
Each cell includes an approximate center lat/lon and a normalised intensity [0,1].
"""
import math
from fastapi import APIRouter, Query
from typing import Optional
from app.db.database import get_db
from app.processing.aggregator import cell_center

router = APIRouter()

@router.get("")
def get_heatmap(
    since: Optional[int] = Query(None, description="Unix ms cutoff"),
    target: Optional[str] = Query(None),
):
    conn = get_db()
    query = "SELECT cell_x, cell_y, sum_weight, hit_count, max_rssi FROM heat_cells WHERE 1=1"
    params: list = []

    if since:
        query += " AND last_seen_ts_ms >= ?"
        params.append(since)
    if target:
        query += " AND target_key = ?"
        params.append(target)

    rows = conn.execute(query, params).fetchall()
    if not rows:
        return {"cells": []}

    max_w = max(r["sum_weight"] for r in rows) or 1.0
    cells = []
    for r in rows:
        lat, lon = cell_center(r["cell_x"], r["cell_y"])
        cells.append({
            "lat": lat,
            "lon": lon,
            "intensity": r["sum_weight"] / max_w,
            "hits": r["hit_count"],
            "max_rssi": r["max_rssi"],
        })

    return {"cells": cells}
