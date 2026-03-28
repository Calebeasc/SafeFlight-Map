"""
Encounter Replay API (Feature 1).

GET /replay/sessions
    Returns all drive sessions inferred from route_points, split on gaps > 2 h.
    Each session has: start_ms, end_ms, label, route_count, encounter_count.

GET /replay/data?start_ms=X&end_ms=Y
    Returns all route_points and encounters within [start_ms, end_ms], ordered
    chronologically, for the frontend scrubber to animate.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Query
from app.db.database import get_db

router = APIRouter()

SESSION_GAP_MS = 2 * 60 * 60 * 1000  # 2-hour gap → new session


@router.get("/sessions")
def get_sessions():
    """
    Return a list of past drive sessions.
    Sessions are derived by splitting route_points on time gaps > 2 h.
    """
    conn = get_db()
    rows = conn.execute(
        "SELECT ts_ms FROM route_points ORDER BY ts_ms ASC"
    ).fetchall()

    if not rows:
        return {"sessions": []}

    sessions = []
    cur_start = rows[0]["ts_ms"]
    cur_end   = rows[0]["ts_ms"]
    pt_count  = 1

    for row in rows[1:]:
        if row["ts_ms"] - cur_end > SESSION_GAP_MS:
            sessions.append({"start_ms": cur_start, "end_ms": cur_end, "route_count": pt_count})
            cur_start = row["ts_ms"]
            pt_count  = 1
        else:
            pt_count += 1
        cur_end = row["ts_ms"]

    sessions.append({"start_ms": cur_start, "end_ms": cur_end, "route_count": pt_count})

    # Annotate with encounter counts and human-readable label
    result = []
    for s in reversed(sessions):          # most-recent first
        enc_count = conn.execute(
            "SELECT COUNT(*) FROM encounters WHERE start_ts_ms>=? AND start_ts_ms<=?",
            (s["start_ms"], s["end_ms"]),
        ).fetchone()[0]
        label = datetime.fromtimestamp(
            s["start_ms"] / 1000, tz=timezone.utc
        ).strftime("%b %d, %Y · %H:%M")
        result.append({
            "start_ms":       s["start_ms"],
            "end_ms":         s["end_ms"],
            "label":          label,
            "route_count":    s["route_count"],
            "encounter_count": enc_count,
        })

    return {"sessions": result}


@router.get("/data")
def get_replay_data(
    start_ms: int = Query(..., description="Session start Unix ms"),
    end_ms:   int = Query(..., description="Session end Unix ms"),
):
    """
    Return all encounters and route_points for the given time window.
    Used by the frontend replay scrubber to animate the drive.
    """
    conn = get_db()

    enc_rows = conn.execute(
        """
        SELECT id, target_key, source, start_ts_ms, end_ts_ms, peak_ts_ms,
               peak_lat, peak_lon, rssi_max, hit_count, confidence, label, color, device_type
        FROM encounters
        WHERE start_ts_ms >= ? AND start_ts_ms <= ?
        ORDER BY start_ts_ms ASC
        """,
        (start_ms, end_ms),
    ).fetchall()

    route_rows = conn.execute(
        """
        SELECT ts_ms, lat, lon, speed_mps, heading
        FROM route_points
        WHERE ts_ms >= ? AND ts_ms <= ?
        ORDER BY ts_ms ASC
        LIMIT 15000
        """,
        (start_ms, end_ms),
    ).fetchall()

    encounters = [
        {
            "id":           r["id"],
            "target_key":   r["target_key"],
            "source":       r["source"],
            "start_ts_ms":  r["start_ts_ms"],
            "end_ts_ms":    r["end_ts_ms"],
            "peak_ts_ms":   r["peak_ts_ms"],
            "lat":          r["peak_lat"],
            "lon":          r["peak_lon"],
            "rssi_max":     r["rssi_max"],
            "hit_count":    r["hit_count"],
            "confidence":   r["confidence"],
            "label":        r["label"],
            "color":        r["color"],
            "device_type":  r["device_type"],
            "show_timestamp": r["label"] == "Fun-Stopper",
        }
        for r in enc_rows
        if r["peak_lat"] is not None
    ]

    route = [
        {
            "ts":      r["ts_ms"],
            "lat":     r["lat"],
            "lon":     r["lon"],
            "speed":   r["speed_mps"],
            "heading": r["heading"],
        }
        for r in route_rows
    ]

    return {
        "encounters": encounters,
        "route":      route,
        "start_ms":   start_ms,
        "end_ms":     end_ms,
    }
