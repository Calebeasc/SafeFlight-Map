"""
GET /encounters?since=<ms>&target=<key>&limit=20

Returns recent encounter peaks for optional map markers.
Fun-Stopper markers always include detection timestamp in popup.
"""
from fastapi import APIRouter, Query
from typing import Optional
from app.db.database import get_db

router = APIRouter()

@router.get("")
def get_encounters(
    since: Optional[int] = Query(None),
    target: Optional[str] = Query(None),
    limit: int = Query(10, le=50),
):
    conn = get_db()
    q = """
        SELECT id, target_key, source, start_ts_ms, end_ts_ms, peak_ts_ms,
               peak_lat, peak_lon, rssi_max, hit_count, confidence, label, color
        FROM encounters WHERE 1=1
    """
    params: list = []
    if since:
        q += " AND start_ts_ms >= ?"
        params.append(since)
    if target:
        q += " AND target_key = ?"
        params.append(target)
    q += " ORDER BY confidence DESC, rssi_max DESC LIMIT ?"
    params.append(limit)

    rows = conn.execute(q, params).fetchall()
    return {
        "encounters": [
            {
                "id": r["id"],
                "target_key": r["target_key"],
                "source": r["source"],
                "start_ts_ms": r["start_ts_ms"],
                "end_ts_ms":   r["end_ts_ms"],
                "peak_ts_ms":  r["peak_ts_ms"],
                "lat": r["peak_lat"],
                "lon": r["peak_lon"],
                "rssi_max": r["rssi_max"],
                "hit_count": r["hit_count"],
                "confidence": r["confidence"],
                "label": r["label"],
                "color": r["color"],
                # Fun-Stopper requires timestamp in popup
                "show_timestamp": r["label"] == "Fun-Stopper",
            }
            for r in rows
            if r["peak_lat"] is not None
        ]
    }
