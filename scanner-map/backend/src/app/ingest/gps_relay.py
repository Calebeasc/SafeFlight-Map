"""
GPS relay — holds the most recent GPS fix from any source.

Sources (in priority order):
  1. Phone browser → WebSocket /ws/gps  (best for driving)
  2. System geolocation (future)
  3. None — observations logged with lat=None

The phone connects to ws://<laptop-ip>:PORT/ws/gps and sends JSON:
  { "lat": 33.44, "lon": -112.07, "accuracy": 5.0,
    "heading": 270.0, "speed": 28.0 }
"""
import time
import threading
from typing import Optional

_lock = threading.Lock()

_fix: dict = {
    "lat": None,
    "lon": None,
    "accuracy": None,
    "heading": None,
    "speed_mps": None,
    "source": "none",
    "ts": 0.0,
}

GPS_STALE_AFTER_S = 10.0   # consider fix stale after 10 s


def update_fix(lat: float, lon: float, accuracy: Optional[float] = None,
               heading: Optional[float] = None, speed_mps: Optional[float] = None,
               source: str = "phone"):
    with _lock:
        _fix.update({
            "lat": lat, "lon": lon,
            "accuracy": accuracy,
            "heading": heading,
            "speed_mps": speed_mps,
            "source": source,
            "ts": time.time(),
        })


def get_fix() -> dict:
    """Return the current fix. lat/lon are None if no fix or fix is stale."""
    with _lock:
        f = dict(_fix)
    age = time.time() - f["ts"]
    if age > GPS_STALE_AFTER_S:
        return {"lat": None, "lon": None, "accuracy": None,
                "heading": None, "speed_mps": None, "source": "stale", "ts": f["ts"]}
    return f


def has_fix() -> bool:
    f = get_fix()
    return f["lat"] is not None
