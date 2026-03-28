"""
Windows Wi-Fi scanner using netsh (no extra drivers, no admin required).
Parses: netsh wlan show networks mode=bssid
"""
import re
import subprocess
import threading
import time
from typing import Optional, Callable

from app.core.allowlist import build_allowlist, hash_identifier
from app.core.config import settings
from app.processing.aggregator import ingest_observation

_running = False
_thread: Optional[threading.Thread] = None
_CREATE_NO_WINDOW = 0x08000000  # Windows flag to suppress console popup


def _parse_netsh(output: str) -> list:
    networks = []
    current: dict = {}
    for line in output.splitlines():
        line = line.strip()
        # New SSID block
        ssid_m = re.match(r'^SSID\s+\d+\s*:\s*(.*)$', line)
        if ssid_m and 'BSSID' not in line:
            if current.get('bssid'):
                networks.append(current)
            current = {'ssid': ssid_m.group(1).strip(), 'bssid': None, 'rssi': -99, 'channel': None}
            continue
        # BSSID line
        bssid_m = re.match(r'^BSSID\s+\d+\s*:\s*([\da-fA-F:]{17})$', line, re.IGNORECASE)
        if bssid_m:
            if current.get('bssid'):
                networks.append(dict(current))
            current['bssid'] = bssid_m.group(1).upper()
            continue
        # Signal %
        sig_m = re.match(r'^Signal\s*:\s*(\d+)%', line)
        if sig_m:
            current['rssi'] = int(sig_m.group(1)) / 2 - 100
            continue
        # Channel
        ch_m = re.match(r'^Channel\s*:\s*(\d+)', line)
        if ch_m:
            current['channel'] = int(ch_m.group(1))
    if current.get('bssid'):
        networks.append(current)
    return networks


def _scan_once(allowlist: dict, gps_fn: Optional[Callable]):
    try:
        result = subprocess.run(
            ['netsh', 'wlan', 'show', 'networks', 'mode=bssid'],
            capture_output=True, text=True, timeout=8,
            creationflags=_CREATE_NO_WINDOW,
        )
    except Exception:
        return
    networks = _parse_netsh(result.stdout)
    ts_ms = int(time.time() * 1000)
    loc = gps_fn() if gps_fn else {}
    for net in networks:
        if not net.get('bssid'):
            continue
        key = hash_identifier(net['bssid'])
        if key not in allowlist:
            continue
        meta = allowlist[key]
        ingest_observation(
            target_key=key, source='wifi', ts_ms=ts_ms,
            rssi=net['rssi'],
            lat=loc.get('lat'), lon=loc.get('lon'),
            speed_mps=loc.get('speed_mps'), heading=loc.get('heading'),
            meta={**meta, 'channel': net.get('channel'), 'ssid': net.get('ssid')},
        )


def _loop(gps_fn):
    global _running
    allowlist = build_allowlist()
    while _running:
        _scan_once(allowlist, gps_fn)
        allowlist = build_allowlist()   # reload in case targets.json changed
        time.sleep(max(1.0, settings.WIFI_SCAN_INTERVAL_S))


def start(gps_fn=None):
    global _running, _thread
    if _running:
        return
    _running = True
    _thread = threading.Thread(target=_loop, args=(gps_fn,), daemon=True, name='wifi-scanner')
    _thread.start()


def stop():
    global _running
    _running = False


def is_available() -> bool:
    try:
        r = subprocess.run(
            ['netsh', 'wlan', 'show', 'interfaces'],
            capture_output=True, text=True, timeout=4,
            creationflags=_CREATE_NO_WINDOW,
        )
        return 'State' in r.stdout
    except Exception:
        return False
