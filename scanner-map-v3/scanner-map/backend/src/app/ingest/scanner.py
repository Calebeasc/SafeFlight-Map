"""
Scanner orchestrator.

Priority:
  1. Real Wi-Fi (netsh) if adapter present and enabled
  2. Real BLE (bleak) if adapter present and enabled
  3. Fake data loop if nothing real is available OR fake_data_enabled=True

GPS is sourced from gps_store (phone page or future USB dongle).
"""
import random
import threading
import time
import logging
from typing import Optional

from app.core.allowlist import build_allowlist, hash_identifier
from app.processing.aggregator import ingest_observation, flush_all
from app.ingest import gps_store

log = logging.getLogger(__name__)

_running = False
_fake_thread: Optional[threading.Thread] = None

# Phoenix test route
_FAKE_ROUTE = [
    (33.4484, -112.0740), (33.4490, -112.0720), (33.4497, -112.0700),
    (33.4504, -112.0680), (33.4511, -112.0660), (33.4518, -112.0640),
    (33.4525, -112.0620), (33.4532, -112.0600),
]


def _fake_loop():
    allowlist = build_allowlist()
    if not allowlist:
        from app.core.allowlist import hash_identifier
        allowlist = {
            hash_identifier('00:25:DF:AA:BB:01'): {'label': 'Fun-Watcher Demo', 'source': 'wifi',  'oui_label': 'Fun-Watcher', 'color': 'blue'},
            hash_identifier('B4:1E:52:CC:DD:01'): {'label': 'Fun-Stopper Demo', 'source': 'ble',   'oui_label': 'Fun-Stopper', 'color': 'red'},
        }
    route_idx = 0
    while _running:
        now_ms = int(time.time() * 1000)
        # Prefer real GPS if available
        loc = gps_store.get()
        if loc:
            lat, lon = loc['lat'], loc['lon']
        else:
            lat, lon = _FAKE_ROUTE[route_idx % len(_FAKE_ROUTE)]
            lat += random.gauss(0, 0.0003)
            lon += random.gauss(0, 0.0003)

        for key, meta in allowlist.items():
            if random.random() < 0.4:
                ingest_observation(
                    target_key=key, source=meta['source'], ts_ms=now_ms,
                    rssi=random.gauss(-65, 8),
                    lat=lat, lon=lon,
                    speed_mps=random.uniform(25, 35),
                    heading=random.uniform(0, 360),
                    meta=meta,
                )
        route_idx += 1
        time.sleep(0.5)


def _resolve_settings():
    try:
        from app.api.settings_api import load
        return load()
    except Exception:
        return {}


def start_scanning():
    global _running, _fake_thread
    if _running:
        return {'status': 'already_running', 'adapters': []}

    _running = True
    s = _resolve_settings()
    adapters = []

    gps_fn = gps_store.get  # callable that returns {} or {lat,lon,...}

    # Wi-Fi
    if s.get('wifi_scan_enabled', True):
        try:
            from app.ingest import wifi_scanner
            if wifi_scanner.is_available():
                wifi_scanner.start(gps_fn=gps_fn)
                adapters.append('wifi')
                log.info('Wi-Fi scanner started.')
            else:
                log.warning('Wi-Fi adapter not found.')
        except Exception as e:
            log.error(f'Wi-Fi scanner failed to start: {e}')

    # BLE
    if s.get('ble_scan_enabled', True):
        try:
            from app.ingest import ble_scanner
            if ble_scanner.is_available():
                ble_scanner.start(gps_fn=gps_fn)
                adapters.append('ble')
                log.info('BLE scanner started.')
            else:
                log.warning('BLE (bleak) not available.')
        except Exception as e:
            log.error(f'BLE scanner failed to start: {e}')

    # Fake data — always on if no real adapters, or if explicitly enabled
    if not adapters or s.get('fake_data_enabled', False):
        if not adapters:
            log.info('No real adapters — starting fake data generator.')
        _fake_thread = threading.Thread(target=_fake_loop, daemon=True, name='fake-scanner')
        _fake_thread.start()
        adapters.append('fake')

    return {'status': 'started', 'adapters': adapters}


def stop_scanning():
    global _running
    _running = False
    try:
        from app.ingest import wifi_scanner
        wifi_scanner.stop()
    except Exception:
        pass
    try:
        from app.ingest import ble_scanner
        ble_scanner.stop()
    except Exception:
        pass
    flush_all()
    return {'status': 'stopped'}


def is_running() -> bool:
    return _running
