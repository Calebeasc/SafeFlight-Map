"""
Aggregation logic: raw observations → encounters → heat cells.

Designed for 60-80 mph highway use:
  - Wi-Fi burst gap: 2.0 s
  - BLE burst gap:   1.0 s
  - Heat cell size:  100 m
  - GPS interpolation for sub-Hz GPS receivers
"""
import json
import math
import time
from typing import Optional
from app.core.config import settings
from app.db.database import get_db


# ── Coordinate → heat cell ─────────────────────────────────────────────────
METERS_PER_DEG_LAT = 111_320.0  # roughly constant

def _lat_to_cell(lat: float) -> int:
    return int(math.floor(lat * METERS_PER_DEG_LAT / settings.HEAT_CELL_METERS))

def _lon_to_cell(lon: float, lat: float) -> int:
    m_per_deg_lon = METERS_PER_DEG_LAT * math.cos(math.radians(lat))
    return int(math.floor(lon * m_per_deg_lon / settings.HEAT_CELL_METERS))

def cell_center(cell_x: int, cell_y: int, ref_lat: float = 0.0) -> tuple[float, float]:
    """Return approximate (lat, lon) of a cell center."""
    lat = (cell_x + 0.5) * settings.HEAT_CELL_METERS / METERS_PER_DEG_LAT
    m_per_deg_lon = METERS_PER_DEG_LAT * math.cos(math.radians(lat))
    lon = (cell_y + 0.5) * settings.HEAT_CELL_METERS / (m_per_deg_lon or 1)
    return lat, lon


# ── In-memory encounter accumulator ───────────────────────────────────────
# Keyed by target_key, value = list of pending observations
_pending: dict[str, list[dict]] = {}
_last_seen: dict[str, float] = {}


def _gap_timeout(source: str) -> float:
    return settings.WIFI_GAP_TIMEOUT_S if source == "wifi" else settings.BLE_GAP_TIMEOUT_S


def _rssi_weight(rssi: float) -> float:
    return max(0.0, rssi - settings.RSSI_FLOOR)


def _finalize_encounter(target_key: str, obs_list: list[dict], meta: dict):
    """Flush a completed encounter to the database."""
    if not obs_list:
        return

    # Find peak RSSI observation
    peak = max(obs_list, key=lambda o: o["rssi"])
    start_ts = obs_list[0]["ts_ms"]
    end_ts   = obs_list[-1]["ts_ms"]

    confidence = min(1.0, len(obs_list) / 10.0)  # crude: 10 hits = full confidence

    conn = get_db()
    conn.execute("""
        INSERT INTO encounters
            (target_key, source, start_ts_ms, end_ts_ms, peak_ts_ms,
             peak_lat, peak_lon, rssi_max, hit_count, confidence, label, color)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        target_key,
        meta.get("source", "unknown"),
        start_ts, end_ts,
        peak["ts_ms"],
        peak.get("lat"), peak.get("lon"),
        peak["rssi"],
        len(obs_list),
        confidence,
        meta.get("oui_label"),
        meta.get("color"),
    ))

    # Update heat cells for each observation that has a location
    for o in obs_list:
        if o.get("lat") is None or o.get("lon") is None:
            continue
        cx = _lat_to_cell(o["lat"])
        cy = _lon_to_cell(o["lon"], o["lat"])
        w  = _rssi_weight(o["rssi"])
        conn.execute("""
            INSERT INTO heat_cells (cell_x, cell_y, target_key, sum_weight, hit_count, max_rssi, last_seen_ts_ms)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(cell_x, cell_y, target_key) DO UPDATE SET
                sum_weight      = sum_weight + excluded.sum_weight,
                hit_count       = hit_count  + excluded.hit_count,
                max_rssi        = MAX(max_rssi, excluded.max_rssi),
                last_seen_ts_ms = excluded.last_seen_ts_ms
        """, (cx, cy, target_key, w, 1, o["rssi"], o["ts_ms"]))

    conn.commit()


def ingest_observation(
    target_key: str,
    source: str,
    ts_ms: int,
    rssi: float,
    lat: Optional[float],
    lon: Optional[float],
    speed_mps: Optional[float],
    heading: Optional[float],
    meta: dict,
):
    """
    Accept one observation.
    Saves to raw_observations, updates in-memory burst tracker,
    and flushes completed encounters to the DB.
    """
    conn = get_db()
    conn.execute("""
        INSERT INTO raw_observations
            (ts_ms, lat, lon, speed_mps, heading, source, target_key, rssi, meta_json)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, (ts_ms, lat, lon, speed_mps, heading, source, target_key, rssi,
          json.dumps(meta) if meta else None))
    conn.commit()

    now_s = ts_ms / 1000.0
    timeout = _gap_timeout(source)

    # Flush expired encounters from *other* keys
    expired = [k for k, t in _last_seen.items() if (now_s - t) > timeout and k != target_key]
    for k in expired:
        _finalize_encounter(k, _pending.pop(k, []), meta)
        del _last_seen[k]

    # Check if current key's encounter has timed out
    if target_key in _last_seen and (now_s - _last_seen[target_key]) > timeout:
        _finalize_encounter(target_key, _pending.pop(target_key, []), meta)

    # Append to pending burst
    _pending.setdefault(target_key, []).append({
        "ts_ms": ts_ms, "rssi": rssi, "lat": lat, "lon": lon,
    })
    _last_seen[target_key] = now_s


def flush_all():
    """Call on shutdown to finalise any open encounters."""
    meta: dict = {}
    for key, obs in list(_pending.items()):
        _finalize_encounter(key, obs, meta)
    _pending.clear()
    _last_seen.clear()
