"""
Shared GPS state.
Updated by:
  - Phone web page posting to /gps/update
  - (future) USB serial NMEA reader
Read by scanners when building observations.
"""
import threading
import time
from typing import Optional

_lock = threading.Lock()
_fix: dict = {}   # {lat, lon, speed_mps, heading, ts_ms, source}


def update(lat: float, lon: float,
           speed_mps: Optional[float] = None,
           heading: Optional[float] = None,
           source: str = 'phone'):
    with _lock:
        _fix.update({
            'lat': lat, 'lon': lon,
            'speed_mps': speed_mps, 'heading': heading,
            'ts_ms': int(time.time() * 1000),
            'source': source,
        })


def get() -> dict:
    """Return latest GPS fix, or {} if none received."""
    with _lock:
        if not _fix:
            return {}
        age_s = (int(time.time() * 1000) - _fix.get('ts_ms', 0)) / 1000
        if age_s > 30:      # stale — don't use fixes older than 30 s
            return {}
        return dict(_fix)


def status() -> dict:
    with _lock:
        if not _fix:
            return {'available': False, 'source': None}
        age_s = (int(time.time() * 1000) - _fix.get('ts_ms', 0)) / 1000
        return {
            'available': age_s <= 30,
            'source': _fix.get('source'),
            'age_s': round(age_s, 1),
            'lat': _fix.get('lat'),
            'lon': _fix.get('lon'),
        }
