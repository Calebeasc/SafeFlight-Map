"""
Stopper Hotspot API (Feature 4).

GET /hotspots
    Return all recorded hotspot zones, ordered by hit_count desc.

GET /hotspots/nearby?lat=X&lon=Y&heading=H&speed_mps=S
    Return hotspots that are either:
      (a) within HOTSPOT_PROXIMITY_M of the given position, OR
      (b) within a ±30° forward cone at the user's current heading,
          within HOTSPOT_AHEAD_M.
    The heading cone uses the user's provided heading (from GPS / last few fixes).
    No external road API required — pure vector math.
"""
import math
from typing import Optional
from fastapi import APIRouter, Query
from app.db.database import get_db
from app.core.config import settings

router = APIRouter()


# ── Geometry helpers ───────────────────────────────────────────────────────

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in metres between two lat/lon points."""
    R = 6_371_000
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = (math.sin(dLat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Forward azimuth (0–360°) from point 1 to point 2."""
    dLon = math.radians(lon2 - lon1)
    y = math.sin(dLon) * math.cos(math.radians(lat2))
    x = (math.cos(math.radians(lat1)) * math.sin(math.radians(lat2))
         - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dLon))
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _angle_diff(a: float, b: float) -> float:
    """Smallest angular difference between two bearings (0–180°)."""
    return min(abs(a - b), 360 - abs(a - b))


# ── Routes ─────────────────────────────────────────────────────────────────

@router.get("")
def get_hotspots():
    """Return all stopper hotspot zones."""
    conn = get_db()
    rows = conn.execute(
        "SELECT id, cell_x, cell_y, lat, lon, radius_m, "
        "first_seen_ms, last_seen_ms, day_count, hit_count, confirmed "
        "FROM stopper_hotspots ORDER BY hit_count DESC"
    ).fetchall()
    return {"hotspots": [dict(r) for r in rows]}


@router.get("/nearby")
def get_nearby_hotspots(
    lat:       float           = Query(...),
    lon:       float           = Query(...),
    heading:   Optional[float] = Query(None, description="Current heading degrees 0-360"),
    speed_mps: Optional[float] = Query(None, description="Current speed m/s"),
):
    """
    Return hotspots that trigger a proximity or heading-cone alert.

    Proximity:  distance to hotspot ≤ HOTSPOT_PROXIMITY_M
    Heading cone: hotspot falls within ±30° of current heading AND
                  distance ≤ HOTSPOT_AHEAD_M AND speed ≥ 1 m/s
    """
    conn = get_db()
    rows = conn.execute(
        "SELECT id, lat, lon, radius_m, day_count, hit_count, confirmed "
        "FROM stopper_hotspots"
    ).fetchall()

    results = []
    for r in rows:
        dist = _haversine(lat, lon, r["lat"], r["lon"])
        in_proximity = dist <= settings.HOTSPOT_PROXIMITY_M

        in_cone = False
        if heading is not None and speed_mps is not None and speed_mps >= 1.0:
            bear = _bearing(lat, lon, r["lat"], r["lon"])
            if _angle_diff(heading, bear) <= 30 and dist <= settings.HOTSPOT_AHEAD_M:
                in_cone = True

        if in_proximity or in_cone:
            results.append({
                **dict(r),
                "distance_m":   round(dist),
                "in_proximity": in_proximity,
                "in_cone":      in_cone,
            })

    return {
        "hotspots":     results,
        "proximity_m":  settings.HOTSPOT_PROXIMITY_M,
        "ahead_m":      settings.HOTSPOT_AHEAD_M,
    }
