"""
Windows BLE scanner using bleak (pure Python, no admin, Windows 10/11).

bleak uses WinRT underneath — requires Windows 10 1709+ and Bluetooth LE adapter.
Falls back gracefully if bleak is not installed or no BLE adapter is present.
"""
import asyncio
import threading
import time
import logging
from typing import Optional, Callable

log = logging.getLogger(__name__)

_running = False
_thread: Optional[threading.Thread] = None

try:
    from bleak import BleakScanner
    _BLEAK_AVAILABLE = True
except ImportError:
    _BLEAK_AVAILABLE = False
    log.warning("bleak not installed — BLE scanning disabled. Run: pip install bleak")


def _oui(addr: str) -> str:
    """Return upper-cased OUI (first 3 octets) from a BLE address."""
    return addr.upper()[:8]


async def _scan_loop_async(allowlist: dict, gps_fn: Optional[Callable], stop_event: asyncio.Event):
    from app.core.config import settings
    from app.core.allowlist import hash_identifier
    from app.processing.aggregator import ingest_observation

    def detection_callback(device, advertisement_data):
        if stop_event.is_set():
            return
        # Try address as stable ID; also check any service UUIDs
        candidates = [device.address]
        if advertisement_data.service_uuids:
            candidates += list(advertisement_data.service_uuids)

        for raw_id in candidates:
            key = hash_identifier(raw_id)
            if key not in allowlist:
                continue
            meta = allowlist[key]
            ts_ms = int(time.time() * 1000)
            loc = gps_fn() if gps_fn else {}
            rssi = advertisement_data.rssi if advertisement_data.rssi else -99
            ingest_observation(
                target_key=key, source='ble', ts_ms=ts_ms, rssi=rssi,
                lat=loc.get('lat'), lon=loc.get('lon'),
                speed_mps=loc.get('speed_mps'), heading=loc.get('heading'),
                meta={**meta, 'name': device.name or '', 'addr': device.address},
            )

    scanner = BleakScanner(detection_callback=detection_callback)
    try:
        await scanner.start()
        while not stop_event.is_set():
            await asyncio.sleep(0.5)
        await scanner.stop()
    except Exception as e:
        log.error(f"BLE scanner error: {e}")


def _loop(allowlist: dict, gps_fn: Optional[Callable]):
    global _running
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    stop_event = asyncio.Event()

    async def runner():
        scan_task = loop.create_task(_scan_loop_async(allowlist, gps_fn, stop_event))
        while _running:
            await asyncio.sleep(1)
        stop_event.set()
        await scan_task

    try:
        loop.run_until_complete(runner())
    finally:
        loop.close()


def start(gps_fn=None):
    global _running, _thread
    if not _BLEAK_AVAILABLE:
        log.warning("BLE start() called but bleak is not available.")
        return
    if _running:
        return
    from app.core.allowlist import build_allowlist
    allowlist = build_allowlist()
    _running = True
    _thread = threading.Thread(target=_loop, args=(allowlist, gps_fn), daemon=True, name='ble-scanner')
    _thread.start()


def stop():
    global _running
    _running = False


def is_available() -> bool:
    return _BLEAK_AVAILABLE
