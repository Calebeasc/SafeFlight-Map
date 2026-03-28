"""
Aggregation logic: raw observations → encounters → heat cells.

Designed for 60-80 mph highway use:
  - Wi-Fi burst gap: 2.0 s
  - BLE burst gap:   1.0 s
  - Heat cell size:  100 m
  - GPS interpolation for sub-Hz GPS receivers

Also drives Features 2, 3, and 4:
  - Feature 2: tail detection  (same device ≥3 separate encounters this session)
  - Feature 3: daily Stopper surge  (≥N unique Stoppers today → global broadcast)
  - Feature 4: Stopper hotspot promotion  (cell seen on ≥3 distinct days in 7-day window)
"""
import json
import math
import time
from datetime import datetime, timezone, timedelta
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
_pending_meta: dict[str, dict] = {}  # stores the correct meta for each active burst
_last_seen: dict[str, float] = {}
_first_seen: dict[str, float] = {}   # when the current burst started

# Flush an active encounter after this many seconds even if device never disappears.
# Ensures stationary scanners (Ring doorbell in range continuously) show on the map.
FORCE_FLUSH_S = 20


def _gap_timeout(source: str) -> float:
    return settings.WIFI_GAP_TIMEOUT_S if source == "wifi" else settings.BLE_GAP_TIMEOUT_S


def _rssi_weight(rssi: float) -> float:
    return max(0.0, rssi - settings.RSSI_FLOOR)


# ── Session tracking (Feature 2) ──────────────────────────────────────────
_session_start_ms: int = 0
# Track which (target_key) already fired a tail alert this session to avoid spam
_tail_alerted: set = set()


def set_session_start(ts_ms: Optional[int] = None):
    """Called by control.py when scanning starts to establish a new session window."""
    global _session_start_ms, _tail_alerted
    _session_start_ms = ts_ms if ts_ms is not None else int(time.time() * 1000)
    _tail_alerted = set()


# ── Surge tracking (Feature 3) ────────────────────────────────────────────
_surge_alerted_day: str = ""  # "YYYY-MM-DD" — reset on each new calendar day


# ── Internal helpers ───────────────────────────────────────────────────────

def _check_tail_detection(target_key: str, label: str, conn) -> None:
    """
    Feature 2: if the same Watcher/Stopper has appeared in TAIL_ENCOUNTER_THRESHOLD
    or more separate encounters this session, push a high-priority global alert.
    Fires once per target_key per session.
    """
    if label not in ("Fun-Watcher", "Fun-Stopper"):
        return
    if _session_start_ms == 0 or target_key in _tail_alerted:
        return
    count = conn.execute(
        "SELECT COUNT(*) FROM encounters WHERE target_key=? AND start_ts_ms>=?",
        (target_key, _session_start_ms),
    ).fetchone()[0]
    if count >= settings.TAIL_ENCOUNTER_THRESHOLD:
        _tail_alerted.add(target_key)
        from app.core.alerts_bus import push_global_alert
        push_global_alert({
            "type":            "tail_detection",
            "target_key":      target_key,
            "label":           label,
            "encounter_count": count,
            "message":         f"This device keeps appearing! ({label}, {count}× this session)",
            "color":           "orange" if label == "Fun-Watcher" else "red",
        })


def _check_daily_surge(conn) -> None:
    """
    Feature 3: if unique Stopper encounters today ≥ STOPPER_SURGE_THRESHOLD,
    broadcast a global surge alert once per calendar day.
    """
    global _surge_alerted_day
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _surge_alerted_day == today:
        return
    today_start_ms = int(
        datetime.now(timezone.utc)
        .replace(hour=0, minute=0, second=0, microsecond=0)
        .timestamp() * 1000
    )
    count = conn.execute(
        "SELECT COUNT(DISTINCT target_key) FROM encounters "
        "WHERE label='Fun-Stopper' AND start_ts_ms>=?",
        (today_start_ms,),
    ).fetchone()[0]
    if count >= settings.STOPPER_SURGE_THRESHOLD:
        _surge_alerted_day = today
        from app.core.alerts_bus import push_global_alert
        push_global_alert({
            "type":    "stopper_surge",
            "message": f"High Stopper activity today — stay alert! ({count} unique Stoppers detected)",
            "count":   count,
            "color":   "red",
        })


def _update_hotspot(cell_x: int, cell_y: int, ts_ms: int, conn) -> None:
    """
    Feature 4: record that this cell saw a Stopper today; if it has been seen on
    HOTSPOT_MIN_DAYS+ distinct days in the past 7 days, upsert a stopper_hotspot row.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    conn.execute(
        "INSERT OR IGNORE INTO stopper_daily_hits (cell_x, cell_y, day_str) VALUES (?,?,?)",
        (cell_x, cell_y, today),
    )
    conn.commit()

    seven_days_ago = (datetime.now(timezone.utc).date() - timedelta(days=7)).strftime("%Y-%m-%d")
    day_count = conn.execute(
        "SELECT COUNT(DISTINCT day_str) FROM stopper_daily_hits "
        "WHERE cell_x=? AND cell_y=? AND day_str>=?",
        (cell_x, cell_y, seven_days_ago),
    ).fetchone()[0]

    if day_count >= settings.HOTSPOT_MIN_DAYS:
        lat, lon = cell_center(cell_x, cell_y)
        conn.execute(
            """
            INSERT INTO stopper_hotspots
                (cell_x, cell_y, lat, lon, radius_m, first_seen_ms, last_seen_ms, day_count, hit_count)
            VALUES (?,?,?,?,150,?,?,?,1)
            ON CONFLICT(cell_x, cell_y) DO UPDATE SET
                last_seen_ms = excluded.last_seen_ms,
                day_count    = excluded.day_count,
                hit_count    = hit_count + 1
            """,
            (cell_x, cell_y, lat, lon, ts_ms, ts_ms, day_count),
        )
        conn.commit()


def _finalize_encounter(target_key: str, obs_list: list[dict], meta: dict):
    """Flush a completed encounter to the database, then run post-encounter checks."""
    if not obs_list:
        return

    # Find peak RSSI observation
    peak = max(obs_list, key=lambda o: o["rssi"])
    start_ts = obs_list[0]["ts_ms"]
    end_ts   = obs_list[-1]["ts_ms"]

    # Use the peak observation's coordinates, but if GPS was absent at that moment,
    # fall back to the highest-RSSI observation that *does* have a GPS fix.
    # This prevents encounters from being stored with null lat/lon when the scanner
    # briefly had no GPS fix at the moment of strongest signal.
    peak_lat = peak.get("lat")
    peak_lon = peak.get("lon")
    if peak_lat is None:
        for obs in sorted(obs_list, key=lambda o: o["rssi"], reverse=True):
            if obs.get("lat") is not None and obs.get("lon") is not None:
                peak_lat, peak_lon = obs["lat"], obs["lon"]
                break

    confidence = min(1.0, len(obs_list) / 10.0)  # crude: 10 hits = full confidence
    label      = meta.get("oui_label")

    # MAC comes from 'addr' (BLE) or 'bssid' (WiFi) in meta
    mac_addr    = meta.get("addr") or meta.get("bssid")
    device_name = meta.get("name") or meta.get("ssid") or ""

    conn = get_db()
    conn.execute("""
        INSERT INTO encounters
            (target_key, source, start_ts_ms, end_ts_ms, peak_ts_ms,
             peak_lat, peak_lon, rssi_max, hit_count, confidence,
             label, color, device_type, mac_addr, device_name)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        target_key,
        meta.get("source", "unknown"),
        start_ts, end_ts,
        peak["ts_ms"],
        peak_lat, peak_lon,
        peak["rssi"],
        len(obs_list),
        confidence,
        label,
        meta.get("color"),
        meta.get("device_type"),
        mac_addr,
        device_name,
    ))

    # Update heat cells for each observation that has a location
    is_stopper = label == "Fun-Stopper"
    stopper_cells: set[tuple[int, int]] = set()

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
        if is_stopper:
            stopper_cells.add((cx, cy))

    conn.commit()

    # ── Post-encounter feature checks ─────────────────────────────────────
    # Feature 2: tail detection
    _check_tail_detection(target_key, label or "", conn)

    # Feature 3: daily Stopper surge
    if is_stopper:
        _check_daily_surge(conn)

    # Feature 4: Stopper hotspot promotion (per unique cell in this encounter)
    if is_stopper:
        for cx, cy in stopper_cells:
            _update_hotspot(cx, cy, end_ts, conn)


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

    # Always keep each device's own meta (not the triggering device's meta)
    _pending_meta[target_key] = meta

    # Flush expired encounters from *other* keys — use each key's own stored meta
    expired = [k for k, t in _last_seen.items() if (now_s - t) > timeout and k != target_key]
    for k in expired:
        _finalize_encounter(k, _pending.pop(k, []), _pending_meta.pop(k, {}))
        del _last_seen[k]
        _first_seen.pop(k, None)

    # Check if current key's encounter has timed out (device disappeared)
    if target_key in _last_seen and (now_s - _last_seen[target_key]) > timeout:
        _finalize_encounter(target_key, _pending.pop(target_key, []), _pending_meta.pop(target_key, meta))
        _first_seen.pop(target_key, None)

    # Force-flush if this burst has been open too long (device in continuous range)
    # This ensures stationary detections (Ring doorbell, parked car) appear on the map.
    if target_key in _first_seen and (now_s - _first_seen[target_key]) >= FORCE_FLUSH_S:
        if _pending.get(target_key):
            _finalize_encounter(target_key, _pending.pop(target_key, []), _pending_meta.pop(target_key, meta))
        _first_seen.pop(target_key, None)

    # Append to pending burst
    if target_key not in _first_seen:
        _first_seen[target_key] = now_s
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
