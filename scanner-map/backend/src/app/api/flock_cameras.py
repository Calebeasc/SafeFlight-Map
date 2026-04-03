"""
Flock Safety / ALPR camera locations.

Sources (merged, deduplicated):
  1. OpenStreetMap Overpass API — ALPR nodes tagged with Flock Safety
     manufacturer.  Queries all configured home regions in parallel,
     plus a radius around the current GPS fix if available.
     Results cached for 1 hour.  Non-blocking: first call returns []
     while background threads populate the cache.
  2. Flock Safety Transparency Portals — intersection-level addresses
     for known MN agencies, geocoded via Nominatim (OSM).
     Cached separately for 24 hours.
  3. Locally scanned encounters tagged 'flock' / 'lpr' (always fresh).

GET /flock/cameras            — all known camera locations
GET /flock/cameras/reload     — force re-fetch (expires cache, re-queues)
"""
import time
import logging
import threading
import json
try:
    import urllib.request as _urllib
    import urllib.parse  as _uparse
except ImportError:
    _urllib = None
    _uparse = None

from fastapi import APIRouter
from app.db.database import get_db

router = APIRouter()
log = logging.getLogger(__name__)

# ── Cache ─────────────────────────────────────────────────────────────────────
_CACHE_TTL_S        = 3600
_PORTAL_CACHE_TTL_S = 86400   # transparency portals change rarely
_cache_lock         = threading.Lock()
_cache_data: list   = []
_cache_ts:   float  = 0.0
_fetch_in_progress  = False

_portal_lock        = threading.Lock()
_portal_data: list  = []
_portal_ts:   float = 0.0
_portal_fetching    = False

# ── Home regions — queried whenever no GPS fix is available ───────────────────
# Add/remove bboxes here as (S, W, N, E, label)
_HOME_REGIONS = [
    (44.70, -93.65, 45.25, -92.85, "Twin Cities MN"),   # Minneapolis/St Paul metro
    (44.00, -94.50, 46.00, -92.00, "Greater MN"),        # broader MN coverage
    (33.00, -112.70, 33.90, -111.50, "Phoenix AZ"),      # original default
]

# ── Overpass ──────────────────────────────────────────────────────────────────
_OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Around a GPS fix (80 km radius)
_OVERPASS_AREA_QUERY = """
[out:json][timeout:30];
(
  node["manufacturer"="Flock Safety"](around:{radius},{lat},{lng});
  node["manufacturer:wikidata"="Q108485435"](around:{radius},{lat},{lng});
  node["surveillance:type"="ALPR"]["man_made"="surveillance"](around:{radius},{lat},{lng});
  node["surveillance:type"="ALPR"](around:{radius},{lat},{lng});
  node["camera:type"="ALPR"](around:{radius},{lat},{lng});
);
out body;
"""

def _build_bbox_query(s, w, n, e) -> str:
    return (
        f'[out:json][timeout:30];'
        f'('
        f'node["manufacturer"="Flock Safety"]({s},{w},{n},{e});'
        f'node["manufacturer:wikidata"="Q108485435"]({s},{w},{n},{e});'
        f'node["surveillance:type"="ALPR"]["man_made"="surveillance"]({s},{w},{n},{e});'
        f'node["surveillance:type"="ALPR"]({s},{w},{n},{e});'
        f'node["camera:type"="ALPR"]({s},{w},{n},{e});'
        f');out body;'
    )


def _parse_overpass(data: dict, region_label: str = "") -> list:
    cameras = []
    for el in data.get("elements", []):
        if el.get("type") != "node":
            continue
        tags = el.get("tags", {})
        cameras.append({
            "lat":    el["lat"],
            "lng":    el["lon"],
            "type":   "flock",
            "city":   tags.get("addr:city") or tags.get("is_in:city") or region_label,
            "label":  tags.get("name") or tags.get("description") or "ALPR Camera",
            "source": "osm",
        })
    return cameras


def _overpass_fetch(query: str, region_label: str = "") -> list:
    """Run one Overpass query, return parsed cameras (empty list on failure)."""
    try:
        body = ("data=" + _uparse.quote(query)).encode()
        req  = _urllib.Request(
            _OVERPASS_URL, data=body,
            headers={"User-Agent": "InvincibleInc-Scanner/1.0",
                     "Content-Type": "application/x-www-form-urlencoded"},
        )
        with _urllib.urlopen(req, timeout=35) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        data    = json.loads(raw)
        cameras = _parse_overpass(data, region_label)
        log.info("Overpass [%s]: %d ALPR cameras", region_label or "query", len(cameras))
        return cameras
    except Exception as exc:
        log.warning("Overpass fetch failed [%s]: %s", region_label or "query", exc)
        return []


def _run_fetch_all(lat=None, lng=None):
    """Query all home regions + optional GPS fix in parallel threads, merge results."""
    global _cache_data, _cache_ts, _fetch_in_progress

    queries = []
    # GPS-fix based query takes priority if we have a fix
    if lat is not None and lng is not None:
        queries.append((_OVERPASS_AREA_QUERY.format(lat=lat, lng=lng, radius=80000), "GPS area"))
    # Always query home regions so the map is useful without a fix
    for s, w, n, e, label in _HOME_REGIONS:
        queries.append((_build_bbox_query(s, w, n, e), label))

    results = [[] for _ in queries]

    def worker(idx, query, label):
        results[idx] = _overpass_fetch(query, label)

    threads = [
        threading.Thread(target=worker, args=(i, q, l), daemon=True)
        for i, (q, l) in enumerate(queries)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=40)

    # Merge and deduplicate across all region results
    seen: set = set()
    merged = []
    for cam_list in results:
        for cam in cam_list:
            key = (round(cam["lat"], 4), round(cam["lng"], 4))
            if key not in seen:
                seen.add(key)
                merged.append(cam)

    log.info("Overpass total: %d unique ALPR cameras across %d regions", len(merged), len(queries))
    with _cache_lock:
        _cache_data = merged
        _cache_ts   = time.time()
    _fetch_in_progress = False


def _ensure_cache_refresh(lat=None, lng=None):
    global _fetch_in_progress
    with _cache_lock:
        stale = (time.time() - _cache_ts) > _CACHE_TTL_S
        if not stale or _fetch_in_progress:
            return
        _fetch_in_progress = True
    t = threading.Thread(target=_run_fetch_all, args=(lat, lng), daemon=True)
    t.start()


# ── Flock Transparency Portals (MN agencies) ──────────────────────────────────
# Intersection-level addresses scraped from public portals, geocoded via Nominatim.
# These are known camera intersection strings from public transparency data.
_MN_PORTAL_CAMERAS = [
    # Hennepin County SO
    {"agency": "Hennepin County SO", "city": "Minneapolis", "state": "MN",
     "intersections": [
         "Lyndale Ave N & 26th Ave N, Minneapolis MN",
         "Penn Ave N & Lowry Ave N, Minneapolis MN",
         "Broadway Ave N & Lyndale Ave N, Minneapolis MN",
     ]},
    # Anoka County SO
    {"agency": "Anoka County SO", "city": "Anoka", "state": "MN",
     "intersections": [
         "Main St & Ferry St, Anoka MN",
         "US-10 & Round Lake Blvd, Anoka MN",
     ]},
    # West Hennepin Public Safety
    {"agency": "West Hennepin Public Safety", "city": "Orono", "state": "MN",
     "intersections": [
         "Long Lake Rd & Willow Dr, Long Lake MN",
         "Hwy 12 & Hwy 15, Wayzata MN",
     ]},
    # St Cloud PD
    {"agency": "St Cloud PD", "city": "St Cloud", "state": "MN",
     "intersections": [
         "University Dr S & 9th Ave S, St Cloud MN",
         "Division St & 33rd Ave S, St Cloud MN",
         "Hwy 15 & Cooper Ave S, St Cloud MN",
     ]},
    # St Louis County SO
    {"agency": "St Louis County SO", "city": "Duluth", "state": "MN",
     "intersections": [
         "London Rd & 21st Ave E, Duluth MN",
         "Central Ave & 4th St, Duluth MN",
     ]},
]

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

def _geocode(address: str) -> tuple:
    """Return (lat, lng) or (None, None) via Nominatim."""
    try:
        params = _uparse.urlencode({"q": address, "format": "json", "limit": 1})
        req = _urllib.Request(
            f"{_NOMINATIM_URL}?{params}",
            headers={"User-Agent": "InvincibleInc-Scanner/1.0"},
        )
        with _urllib.urlopen(req, timeout=10) as resp:
            results = json.loads(resp.read().decode())
        if results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as exc:
        log.debug("Geocode failed for %r: %s", address, exc)
    return None, None


def _run_portal_fetch():
    global _portal_data, _portal_ts, _portal_fetching
    cameras = []
    for agency in _MN_PORTAL_CAMERAS:
        for addr in agency["intersections"]:
            lat, lng = _geocode(addr)
            if lat and lng:
                cameras.append({
                    "lat":    lat,
                    "lng":    lng,
                    "type":   "flock",
                    "city":   agency["city"],
                    "label":  f"Flock Safety — {agency['agency']}",
                    "source": "transparency_portal",
                })
            time.sleep(1.1)   # Nominatim 1 req/s fair-use limit
    log.info("Portal geocoder: %d/%d addresses resolved",
             len(cameras),
             sum(len(a["intersections"]) for a in _MN_PORTAL_CAMERAS))
    with _portal_lock:
        _portal_data    = cameras
        _portal_ts      = time.time()
        _portal_fetching = False


def _ensure_portal_refresh():
    global _portal_fetching
    with _portal_lock:
        stale = (time.time() - _portal_ts) > _PORTAL_CACHE_TTL_S
        if not stale or _portal_fetching:
            return
        _portal_fetching = True
    threading.Thread(target=_run_portal_fetch, daemon=True).start()


# ── Local DB flock encounters ─────────────────────────────────────────────────
def _get_local_flock(conn) -> list:
    try:
        rows = conn.execute("""
            SELECT DISTINCT lat, lon, label, device_type, device_name
            FROM encounters
            WHERE lat IS NOT NULL AND lon IS NOT NULL
              AND (
                device_type = 'flock'
                OR LOWER(label)       LIKE '%flock%'
                OR LOWER(label)       LIKE '%lpr%'
                OR LOWER(label)       LIKE '%alpr%'
                OR LOWER(device_name) LIKE '%flock%'
              )
        """).fetchall()
        return [
            {
                "lat":    r["lat"],
                "lng":    r["lon"],
                "type":   r["device_type"] or "flock",
                "city":   "",
                "label":  r["label"] or r["device_name"] or "Flock Camera",
                "source": "local_scan",
            }
            for r in rows
        ]
    except Exception as exc:
        log.debug("local flock query failed: %s", exc)
        return []


def _get_last_gps():
    try:
        from app.ingest import gps_store
        fix = gps_store.last_fix()
        if fix and fix.get("lat") and fix.get("lon"):
            return fix["lat"], fix["lon"]
    except Exception:
        pass
    return None, None


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("/cameras")
def get_cameras():
    """
    Returns all known Flock/ALPR camera locations.
    Combines OSM Overpass (all home regions + GPS fix, cached 1 h),
    transparency portal geocoded addresses (cached 24 h), and
    locally-scanned encounters.  Returns immediately; caches populate
    in background threads.
    """
    try:
        conn  = get_db()
        local = _get_local_flock(conn)
    except Exception:
        local = []

    lat, lng = _get_last_gps()
    _ensure_cache_refresh(lat, lng)
    _ensure_portal_refresh()

    with _cache_lock:
        external = list(_cache_data)
    with _portal_lock:
        portal = list(_portal_data)

    # Merge and deduplicate (~11 m grid)
    seen: set    = set()
    merged: list = []
    for cam in external + portal + local:
        key = (round(cam["lat"], 4), round(cam["lng"], 4))
        if key not in seen:
            seen.add(key)
            merged.append(cam)

    return {
        "cameras":         merged,
        "count":           len(merged),
        "external_count":  len(external),
        "portal_count":    len(portal),
        "local_count":     len(local),
        "cache_age_s":     int(time.time() - _cache_ts) if _cache_ts else None,
        "fetching":        _fetch_in_progress,
        "portal_fetching": _portal_fetching,
    }


@router.post("/cameras/reload")
def reload_cameras():
    """Force re-fetch of all external ALPR data."""
    global _cache_ts, _portal_ts
    with _cache_lock:
        _cache_ts = 0.0
    with _portal_lock:
        _portal_ts = 0.0
    lat, lng = _get_last_gps()
    _ensure_cache_refresh(lat, lng)
    _ensure_portal_refresh()
    return {"ok": True, "queued": True}
