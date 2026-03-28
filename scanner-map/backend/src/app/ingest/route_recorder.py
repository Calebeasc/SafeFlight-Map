"""
Route breadcrumb storage.
Stores GPS positions at ~1 Hz while scanning is active.
Used to draw the driven path on the map.
"""
import time
import threading
from app.db.database import get_db
from app.ingest.gps_relay import get_fix

_running = False
_thread = None

def init_route_table():
    conn = get_db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS route_points (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        ts_ms    INTEGER NOT NULL,
        lat      REAL NOT NULL,
        lon      REAL NOT NULL,
        speed_mps REAL,
        heading  REAL,
        source   TEXT DEFAULT 'gps'
    );
    CREATE INDEX IF NOT EXISTS idx_route_ts ON route_points(ts_ms);
    """)
    conn.commit()


def _record_loop():
    last_lat = last_lon = None
    MIN_DIST_M = 10   # only store if moved >10m

    while _running:
        fix = get_fix()
        if fix["lat"] is not None:
            lat, lon = fix["lat"], fix["lon"]
            # Simple distance gate so we don't spam stationary points
            moved = True
            if last_lat is not None:
                dlat = (lat - last_lat) * 111320
                dlon = (lon - last_lon) * 111320 * 0.85  # rough
                moved = (dlat**2 + dlon**2) ** 0.5 > MIN_DIST_M

            if moved:
                conn = get_db()
                conn.execute(
                    "INSERT INTO route_points (ts_ms, lat, lon, speed_mps, heading, source) VALUES (?,?,?,?,?,?)",
                    (int(time.time() * 1000), lat, lon,
                     fix.get("speed_mps"), fix.get("heading"), fix.get("source", "gps"))
                )
                conn.commit()
                last_lat, last_lon = lat, lon

        time.sleep(1.0)


def start_recording():
    global _running, _thread
    if _running:
        return
    _running = True
    _thread = threading.Thread(target=_record_loop, daemon=True, name="route-recorder")
    _thread.start()


def stop_recording():
    global _running
    _running = False
