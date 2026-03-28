"""
Shared GPS state.
Updated by:
  - Phone web page posting to /gps/update
  - Windows Location API (polled automatically on Windows when no phone fix available)
  - (future) USB serial NMEA reader
Read by scanners when building observations.
"""
import threading
import time
import logging
from typing import Optional

log = logging.getLogger(__name__)

_lock = threading.Lock()
_fix: dict = {}   # {lat, lon, speed_mps, heading, ts_ms, source}

# ── Windows Location API fallback ─────────────────────────────────────────────
# Polls Windows location services every 10 s when no phone/external fix is present.
# Requires: Windows 10+, location services ON, and location permission granted to app.

_win_gps_thread: Optional[threading.Thread] = None
_win_gps_available: Optional[bool] = None  # None=untested, True/False=known


def _win_gps_loop():
    """Background thread: poll Windows Location API and feed into gps_store."""
    global _win_gps_available
    try:
        import asyncio
        import winrt.windows.devices.geolocation as wdg
        _win_gps_available = True
    except Exception:
        _win_gps_available = False
        log.info('winrt not available — Windows Location API disabled.')
        return

    log.info('Windows Location API available — starting fallback GPS poller.')

    async def _get_fix():
        try:
            loc = wdg.Geolocator()
            loc.desired_accuracy = wdg.PositionAccuracy.HIGH
            pos = await loc.get_geoposition_async()
            c = pos.coordinate
            return c.latitude, c.longitude, getattr(c, 'accuracy', None)
        except Exception as e:
            log.debug('Windows GPS poll failed: %s', e)
            return None

    while True:
        time.sleep(10)
        with _lock:
            if _fix:
                age_s = (int(time.time() * 1000) - _fix.get('ts_ms', 0)) / 1000
                if age_s <= 25:
                    continue  # fresh phone/external fix present — skip
        try:
            result = asyncio.run(_get_fix())
            if result:
                lat, lon, acc = result
                # Push into gps_relay so the scanners see it
                try:
                    from app.ingest.gps_relay import update_fix
                    update_fix(lat=lat, lon=lon, accuracy=acc, source='windows')
                except Exception:
                    pass
                with _lock:
                    _fix.update({
                        'lat': lat, 'lon': lon,
                        'speed_mps': None, 'heading': None,
                        'accuracy_m': acc,
                        'ts_ms': int(time.time() * 1000),
                        'source': 'windows',
                    })
                log.debug('Windows GPS: %.5f, %.5f (acc=%.0fm)', lat, lon, acc or 0)
        except Exception as e:
            log.debug('Windows GPS loop error: %s', e)


def _ensure_win_gps():
    """Start the Windows GPS poller thread once."""
    global _win_gps_thread
    if _win_gps_thread is not None:
        return
    import sys
    if sys.platform != 'win32':
        return
    _win_gps_thread = threading.Thread(
        target=_win_gps_loop, daemon=True, name='win-gps'
    )
    _win_gps_thread.start()


def start():
    """Call once on backend startup to activate Windows GPS fallback."""
    _ensure_win_gps()


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
