"""
Windows BLE scanner (bleak / WinRT) with deep advertisement parsing.

Extracts from every advertisement:
  - Service UUIDs → device capability fingerprint
  - Manufacturer Specific Data:
      Apple (0x004C):
        iBeacon          — proximity UUID, major, minor, TX power
        AirDrop          — contact hash
        FindMy           — lost-device tag
        AirPods          — model, battery L/R/case, in-ear status
        HomeKit          — device category
        Nearby Info      — screen on/off, Apple device type
      Google (0x00E0 / service data):
        Eddystone-URL    — embedded URL
        Eddystone-UID    — namespace + instance
      Microsoft (0x0006): Nearby Share device name
      Samsung (0x0075): Galaxy device pairing
      Tile (0xFEED service): tracker detection
  - TX Power Level → estimated distance = 10^((TxPower – RSSI) / 20) metres
  - Battery Level service (0x180F) data
  - Heart Rate / fitness services
  - Generic device appearance value (category code)
"""
import asyncio
import math
import struct
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
    log.warning('bleak not installed — BLE scanning disabled. Run: pip install bleak')


# ── Service UUID fingerprint table ────────────────────────────────────────────
# Short 16-bit UUIDs used by standard Bluetooth profiles
_SERVICE_TYPES = {
    '1800': 'Generic Access',
    '1801': 'Generic Attribute',
    '180a': 'Device Information',
    '180f': 'Battery Service',
    '1810': 'Blood Pressure',
    '1811': 'Alert Notification',
    '1812': 'Human Interface Device',
    '1819': 'Location and Navigation',
    '180d': 'Heart Rate',
    '1816': 'Cycling Speed and Cadence',
    '1818': 'Cycling Power',
    '181b': 'Body Composition',
    '181c': 'User Data',
    '181d': 'Weight Scale',
    '1802': 'Immediate Alert',
    '1803': 'Link Loss',
    '1804': 'Tx Power',
    '1805': 'Current Time',
    # Apple
    'fd6f': 'Apple Exposure Notification',
    'fe9f': 'Apple Media Control',
    'febe': 'Apple HomeKit',
    # Google
    'fe9a': 'Eddystone',
    'feaa': 'Eddystone',
    # Tile
    'feed': 'Tile Tracker',
    # Samsung
    'fdcc': 'Samsung SmartThings',
    # Microsoft
    'fd3d': 'Microsoft Nearby Share',
    # Nordic DFU
    'fe59': 'Nordic DFU',
}

# Infer device category from set of service UUIDs
def _infer_category(uuids: list) -> Optional[str]:
    u = {s.lower().replace('-', '')[-4:] for s in uuids}
    if '180d' in u: return 'fitness_heart_rate'
    if '1812' in u: return 'hid'           # keyboard, mouse, game controller
    if '1819' in u: return 'gps_tracker'
    if '181d' in u: return 'weight_scale'
    if '180f' in u: return 'battery_device'
    if 'feaa' in u or 'fe9a' in u: return 'eddystone_beacon'
    if 'feed' in u: return 'tile_tracker'
    if 'febe' in u: return 'apple_homekit'
    if 'fe59' in u: return 'nordic_dfu'    # firmware update mode
    return None


# ── Manufacturer data parsers ─────────────────────────────────────────────────

def _parse_apple(data: bytes) -> dict:
    """Parse Apple manufacturer-specific data (company ID 0x004C)."""
    if len(data) < 2:
        return {}
    sub_type = data[0]

    if sub_type == 0x02 and len(data) >= 21:  # iBeacon
        uuid_bytes = data[2:18]
        uuid_str = '-'.join([
            uuid_bytes[0:4].hex(),
            uuid_bytes[4:6].hex(),
            uuid_bytes[6:8].hex(),
            uuid_bytes[8:10].hex(),
            uuid_bytes[10:16].hex(),
        ])
        major, minor = struct.unpack('>HH', data[18:22]) if len(data) >= 22 else (0, 0)
        tx_power = struct.unpack('b', data[22:23])[0] if len(data) >= 23 else None
        return {
            'apple_type': 'iBeacon',
            'ibeacon_uuid': uuid_str,
            'ibeacon_major': major,
            'ibeacon_minor': minor,
            'tx_power_dbm': tx_power,
        }

    if sub_type == 0x05:  # AirDrop
        return {'apple_type': 'AirDrop'}

    if sub_type == 0x07:  # AirPods / Beats
        if len(data) >= 25:
            model_id = data[1:3].hex().upper()
            status   = data[3]
            batt_r   = (data[4] & 0xF0) >> 4  # right pod (× 10 = %)
            batt_l   = (data[4] & 0x0F)        # left pod
            batt_c   = (data[5] & 0xF0) >> 4   # case
            charging = bool(data[5] & 0x07)
            return {
                'apple_type': 'AirPods',
                'model_id': model_id,
                'battery_right': batt_r * 10,
                'battery_left':  batt_l * 10,
                'battery_case':  batt_c * 10,
                'charging':      charging,
                'in_ear': bool(status & 0x20),
            }
        return {'apple_type': 'AirPods'}

    if sub_type == 0x0F:  # Apple Watch proximity pairing
        return {'apple_type': 'AppleWatch_Pairing'}

    if sub_type == 0x10:  # Nearby Info (screen state, Apple device type)
        if len(data) >= 3:
            flags = data[1]
            screen_on = bool(flags & 0x40)
            apple_dev = {0x01: 'iPhone', 0x02: 'iPad', 0x03: 'iPod',
                         0x04: 'Mac', 0x05: 'Watch', 0x06: 'AirPods'}.get(flags & 0x1F, 'Apple device')
            return {'apple_type': 'NearbyInfo', 'device_hint': apple_dev, 'screen_on': screen_on}

    if sub_type == 0x12:  # FindMy (lost device or AirTag)
        return {'apple_type': 'FindMy_Lost' if (len(data) > 2 and (data[2] & 0x40)) else 'FindMy'}

    if sub_type == 0x13:
        return {'apple_type': 'AirPrint_Printer'}

    if sub_type == 0x14:
        return {'apple_type': 'HomeKit_Accessory'}

    if sub_type == 0x0B:
        return {'apple_type': 'Watch_Connectivity'}

    return {'apple_type': f'Apple_0x{sub_type:02X}'}


def _parse_eddystone(service_data: bytes) -> dict:
    """Parse Google Eddystone beacon service data."""
    if len(service_data) < 2:
        return {}
    frame_type = service_data[0]

    if frame_type == 0x00 and len(service_data) >= 18:  # Eddystone-UID
        tx_power  = struct.unpack('b', service_data[1:2])[0]
        namespace = service_data[2:12].hex()
        instance  = service_data[12:18].hex()
        return {'eddystone_type': 'UID', 'namespace': namespace, 'instance': instance, 'tx_power': tx_power}

    if frame_type == 0x10 and len(service_data) >= 4:   # Eddystone-URL
        tx_power = struct.unpack('b', service_data[1:2])[0]
        scheme   = {0: 'http://www.', 1: 'https://www.', 2: 'http://', 3: 'https://'}.get(service_data[2], '')
        suffix   = {0: '.com/', 1: '.org/', 2: '.edu/', 3: '.net/', 4: '.info/',
                    5: '.biz/', 6: '.gov/', 7: '.com', 8: '.org', 9: '.edu',
                    10: '.net', 11: '.info', 12: '.biz', 13: '.gov'}
        url_bytes = service_data[3:]
        url_parts = []
        for b in url_bytes:
            url_parts.append(suffix.get(b, chr(b)) if b < 14 else chr(b))
        return {'eddystone_type': 'URL', 'url': scheme + ''.join(url_parts), 'tx_power': tx_power}

    if frame_type == 0x20:  # Eddystone-TLM telemetry
        return {'eddystone_type': 'TLM'}

    return {'eddystone_type': f'0x{frame_type:02X}'}


def _estimate_distance(rssi: float, tx_power: Optional[int]) -> Optional[float]:
    """
    Estimate distance in metres from RSSI and known TX power.
    Uses the log-distance path loss model:
        d = 10 ^ ((TxPower – RSSI) / (10 × n))
    n = 2.0 (free space); in practice 2–4 depending on environment.
    """
    if tx_power is None:
        return None
    n = 2.0
    try:
        d = 10 ** ((tx_power - rssi) / (10 * n))
        return round(d, 1)
    except Exception:
        return None


# ── Main scan callback ────────────────────────────────────────────────────────

async def _scan_loop_async(allowlist: dict, gps_fn: Optional[Callable], stop_event: asyncio.Event):
    from app.core.allowlist import hash_identifier
    from app.core.device_classifier import classify_ble
    from app.api.device_filter import is_type_enabled
    from app.processing.aggregator import ingest_observation

    def detection_callback(device, adv):
        if stop_event.is_set():
            return

        ts_ms = int(time.time() * 1000)
        loc   = gps_fn() if gps_fn else {}
        rssi  = adv.rssi if adv.rssi else -99
        name  = device.name or ''

        # ── Parse service UUIDs ───────────────────────────────────────────────
        service_uuids = list(adv.service_uuids or [])
        service_names = [_SERVICE_TYPES.get(u.lower()[-4:], u) for u in service_uuids]
        category      = _infer_category(service_uuids)

        # ── TX power → distance estimate ─────────────────────────────────────
        tx_power   = adv.tx_power if hasattr(adv, 'tx_power') else None
        est_dist_m = _estimate_distance(rssi, tx_power)

        # ── Manufacturer data ─────────────────────────────────────────────────
        mfr_info: dict = {}
        mfr_raw = dict(adv.manufacturer_data or {})
        for company_id, data in mfr_raw.items():
            if company_id == 0x004C:  # Apple
                mfr_info.update(_parse_apple(bytes(data)))
            elif company_id == 0x00E0:  # Google
                mfr_info['google_data'] = bytes(data).hex()
            elif company_id == 0x0006:  # Microsoft
                mfr_info['microsoft_nearby'] = True
                try:
                    mfr_info['ms_device_name'] = bytes(data[4:]).decode('utf-16-le', errors='replace').rstrip('\x00')
                except Exception:
                    pass
            elif company_id == 0x0075:  # Samsung
                mfr_info['samsung_device'] = True
                mfr_info['samsung_data'] = bytes(data).hex()
            else:
                mfr_info[f'mfr_0x{company_id:04X}'] = bytes(data).hex()

        # ── Eddystone from service data ───────────────────────────────────────
        service_data = dict(adv.service_data or {})
        for uuid, data in service_data.items():
            if 'feaa' in uuid.lower() or 'fe9a' in uuid.lower():
                mfr_info.update(_parse_eddystone(bytes(data)))

        # ── Allowlist check ───────────────────────────────────────────────────
        candidates = [device.address] + service_uuids
        for raw_id in candidates:
            key = hash_identifier(raw_id)
            if key in allowlist:
                meta = allowlist[key]
                ingest_observation(
                    target_key=key, source='ble', ts_ms=ts_ms, rssi=rssi,
                    lat=loc.get('lat'), lon=loc.get('lon'),
                    speed_mps=loc.get('speed_mps'), heading=loc.get('heading'),
                    meta={
                        **meta,
                        'name':           name,
                        'addr':           device.address,
                        'device_type':    None,
                        'tx_power':       tx_power,
                        'est_dist_m':     est_dist_m,
                        'services':       service_names,
                        'category':       category,
                        **mfr_info,
                    },
                )
                return

        # ── Classify and filter ───────────────────────────────────────────────
        dtype, dlabel, dcolor = classify_ble(
            name=name,
            service_uuids=service_uuids,
            manufacturer_data=mfr_raw,
            address=device.address,
        )
        if not is_type_enabled(dtype):
            return

        key = hash_identifier(device.address)
        ingest_observation(
            target_key=key, source='ble', ts_ms=ts_ms, rssi=rssi,
            lat=loc.get('lat'), lon=loc.get('lon'),
            speed_mps=loc.get('speed_mps'), heading=loc.get('heading'),
            meta={
                'oui_label':   dlabel,
                'color':       dcolor,
                'device_type': dtype,
                'name':        name,
                'addr':        device.address,
                'tx_power':    tx_power,
                'est_dist_m':  est_dist_m,
                'services':    service_names,
                'category':    category,
                **mfr_info,
            },
        )

    scanner = BleakScanner(detection_callback=detection_callback)
    try:
        await scanner.start()
        while not stop_event.is_set():
            await asyncio.sleep(0.5)
        await scanner.stop()
    except Exception as e:
        log.error('BLE scanner error: %s', e)


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
        log.warning('BLE start() called but bleak is not available.')
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
