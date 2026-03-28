"""
Live Stopper Tracking — derives mobile patrol unit positions from raw_observations.

A "stopper" is a fleet/patrol device (WiFi AP, BLE device) that:
  - Matches known fleet hardware patterns (Cradlepoint, Sierra Wireless, Axon, etc.)
  - OR is associated with a Fun-Stopper encounter in the encounters table
  - AND has GPS data (was seen while the user had a GPS fix)

GET /stoppers/active?window_min=30   — all stopper devices seen recently,
                                       each with a GPS trail showing their movement
GET /stoppers/{key}/trail?limit=200  — full movement history for one stopper
"""
import json
import time
import logging
from fastapi import APIRouter, Query
from app.db.database import get_db

router = APIRouter()
log = logging.getLogger(__name__)

# ── Fleet hardware pattern matching ──────────────────────────────────────────
# These patterns identify patrol/fleet vehicle WiFi APs and BLE devices.
# Matching is done against SSID, device name, OUI label, or meta_json fields.
_FLEET_PATTERNS = [
    # Cradlepoint (most common US police vehicle router)
    'cradlepoint', 'netcloud', 'ibr900', 'ibr1700', 'ibr650', 'ibr600',
    'aer1600', 'aer2100', 'w2000', 'e3000',
    # Sierra Wireless AirLink
    'sierra', 'airlink', 'rv50', 'rv55', 'gx450', 'mp70', 'lx40',
    # Axon (body cameras, fleet dash cams)
    'axon', 'axon_dock', 'axon_fleet', 'axon_signal',
    # Motorola Solutions (MDT routers, APX radios)
    'motorola', 'apx', 'astro25',
    # Panasonic (Toughbook MDTs)
    'toughbook',
    # Generic fleet/patrol indicators
    'fleet', 'patrol', 'police', 'sheriff', 'pd-', 'dept-',
    # Fun-Stopper label (app's own classification)
    'stopper', 'fun-stopper',
]

def _is_fleet(meta_json: str | None, label: str | None = None) -> bool:
    """Return True if any fleet pattern matches the meta_json or label."""
    combined = ((meta_json or '') + ' ' + (label or '')).lower()
    return any(p in combined for p in _FLEET_PATTERNS)


def _label_from_meta(meta_json: str | None, fallback: str = '') -> str:
    """Extract a human-readable label from meta_json."""
    if not meta_json:
        return fallback
    try:
        m = json.loads(meta_json)
        return (m.get('label') or m.get('ssid') or m.get('device_name')
                or m.get('oui_label') or fallback)
    except Exception:
        return fallback


# ── Helpers ───────────────────────────────────────────────────────────────────

def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def _get_stopper_keys(conn) -> dict:
    """Return {target_key: label} for all known Fun-Stopper encounters."""
    if not _table_exists(conn, 'encounters'):
        return {}
    rows = conn.execute(
        "SELECT DISTINCT target_key, label, device_name, mac_addr "
        "FROM encounters WHERE device_type = 'Fun-Stopper'"
    ).fetchall()
    out = {}
    for r in rows:
        key = r['target_key']
        lbl = r['label'] or r['device_name'] or ''
        out[key] = lbl
        if r['mac_addr']:
            out[r['mac_addr']] = lbl
    return out


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get('/active')
def active_stoppers(window_min: int = Query(30, ge=1, le=1440)):
    """
    Returns all stopper-class devices seen in the last `window_min` minutes.
    Each entry includes a GPS trail (up to 50 recent positions) and a
    mobility flag indicating whether the device has moved.
    """
    try:
        conn = get_db()
    except Exception:
        return {'stoppers': [], 'window_min': window_min}

    if not _table_exists(conn, 'raw_observations'):
        return {'stoppers': [], 'window_min': window_min}

    since_ms = int((time.time() - window_min * 60) * 1000)

    # 1. Observations matching fleet meta patterns
    fleet_rows = []
    try:
        fleet_rows = conn.execute("""
            SELECT target_key, ts_ms, lat, lon, rssi, source, meta_json
            FROM raw_observations
            WHERE ts_ms >= ? AND lat IS NOT NULL AND lon IS NOT NULL
              AND source IN ('wifi', 'wifi_aggressive', 'ble', 'network')
              AND (
                LOWER(meta_json) LIKE '%cradlepoint%'
                OR LOWER(meta_json) LIKE '%sierra%'
                OR LOWER(meta_json) LIKE '%airlink%'
                OR LOWER(meta_json) LIKE '%axon%'
                OR LOWER(meta_json) LIKE '%motorola%'
                OR LOWER(meta_json) LIKE '%fleet%'
                OR LOWER(meta_json) LIKE '%patrol%'
                OR LOWER(meta_json) LIKE '%police%'
                OR LOWER(meta_json) LIKE '%stopper%'
                OR LOWER(meta_json) LIKE '%toughbook%'
              )
            ORDER BY target_key, ts_ms ASC
        """, (since_ms,)).fetchall()
    except Exception as exc:
        log.debug('fleet_rows query failed: %s', exc)

    # 2. Observations for known Fun-Stopper target_keys (confirmed by aggregator)
    known = _get_stopper_keys(conn)
    known_rows = []
    if known:
        placeholders = ','.join(['?' for _ in known])
        try:
            known_rows = conn.execute(f"""
                SELECT target_key, ts_ms, lat, lon, rssi, source, meta_json
                FROM raw_observations
                WHERE ts_ms >= ? AND lat IS NOT NULL AND lon IS NOT NULL
                  AND target_key IN ({placeholders})
                ORDER BY target_key, ts_ms ASC
            """, (since_ms, *known.keys())).fetchall()
        except Exception as exc:
            log.debug('known_rows query failed: %s', exc)

    # Merge, deduplicate by (target_key, ts_ms)
    seen_pairs: set = set()
    merged = []
    for r in list(fleet_rows) + list(known_rows):
        pair = (r['target_key'], r['ts_ms'])
        if pair not in seen_pairs:
            seen_pairs.add(pair)
            merged.append(dict(r))

    if not merged:
        return {'stoppers': [], 'window_min': window_min}

    # Group by target_key
    groups: dict = {}
    for r in merged:
        k = r['target_key']
        groups.setdefault(k, []).append(r)

    stoppers = []
    for key, points in groups.items():
        points.sort(key=lambda p: p['ts_ms'])
        latest = points[-1]

        # Mobility: device seen at 2+ distinct ~100 m grid squares
        unique_cells = {
            (round(p['lat'], 3), round(p['lon'], 3))
            for p in points
        }
        is_mobile = len(unique_cells) > 1

        # Label resolution: known encounters > meta_json > truncated key
        label = known.get(key, '')
        if not label:
            label = _label_from_meta(latest.get('meta_json'), fallback=key[:20])

        stoppers.append({
            'key':          key,
            'label':        label,
            'source':       latest['source'],
            'is_mobile':    is_mobile,
            'last_seen_ms': latest['ts_ms'],
            'lat':          latest['lat'],
            'lng':          latest['lon'],
            'rssi':         latest['rssi'],
            'hit_count':    len(points),
            'trail': [
                {
                    'ts_ms': p['ts_ms'],
                    'lat':   p['lat'],
                    'lng':   p['lon'],
                    'rssi':  p['rssi'],
                }
                for p in points[-50:]
            ],
        })

    stoppers.sort(key=lambda s: s['last_seen_ms'], reverse=True)
    return {'stoppers': stoppers, 'window_min': window_min}


@router.get('/{key}/trail')
def stopper_trail(key: str, limit: int = Query(200, ge=1, le=2000)):
    """Full GPS trail for a specific stopper target_key (most recent `limit` fixes)."""
    try:
        conn = get_db()
    except Exception:
        return {'key': key, 'trail': []}

    if not _table_exists(conn, 'raw_observations'):
        return {'key': key, 'trail': []}

    try:
        rows = conn.execute("""
            SELECT ts_ms, lat, lon, rssi, source
            FROM raw_observations
            WHERE target_key = ? AND lat IS NOT NULL AND lon IS NOT NULL
            ORDER BY ts_ms DESC
            LIMIT ?
        """, (key, limit)).fetchall()
    except Exception:
        return {'key': key, 'trail': []}

    return {
        'key':   key,
        'trail': [
            {'ts_ms': r['ts_ms'], 'lat': r['lat'], 'lng': r['lon'], 'rssi': r['rssi'], 'source': r['source']}
            for r in reversed(rows)
        ],
    }
