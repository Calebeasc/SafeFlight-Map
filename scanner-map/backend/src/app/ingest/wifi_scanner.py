"""
Windows Wi-Fi scanner — two modes, whichever is available:

MODE A  (netsh — no admin, always available):
  netsh wlan show networks mode=bssid
  Parses: SSID, BSSID, RSSI, channel, authentication, encryption,
          radio type (802.11n/ac/ax), band (2.4/5/6 GHz), basic/other rates

MODE B  (Scapy + Npcap — optional, richer data, no admin on Windows 10/11
         if Npcap is installed with "WinPcap API-compatible mode"):
  Raw 802.11 capture on the Wi-Fi interface.
  Additionally captures PASSIVE PROBE REQUESTS from nearby devices —
  this reveals which SSIDs (network names) those devices are actively
  looking for, which is a powerful device fingerprint with zero injection.
  Also captures beacon frames directly for full IE field extraction:
  WPS info, HT/VHT/HE capabilities, RSN cipher suites, country code, etc.

Active probe requests (sent by us):
  Windows Wi-Fi adapter sends broadcast probe requests automatically every
  time netsh triggers a scan — this causes every AP in range to respond
  with a probe response, and we collect those responses. No extra code needed;
  the OS already does this as part of normal scanning.
"""
import re
import subprocess
import threading
import time
import logging
from typing import Optional, Callable

from app.core.allowlist import build_allowlist, hash_identifier
from app.core.config import settings
from app.processing.aggregator import ingest_observation

log = logging.getLogger(__name__)

_running = False
_thread: Optional[threading.Thread] = None
_CREATE_NO_WINDOW = 0x08000000


# ── Scapy availability ────────────────────────────────────────────────────────
try:
    from scapy.all import sniff, Dot11, Dot11Beacon, Dot11Elt, Dot11ProbeReq, RadioTap
    _SCAPY = True
except ImportError:
    _SCAPY = False


# ── netsh output parser ───────────────────────────────────────────────────────

def _parse_netsh(output: str) -> list:
    """Parse `netsh wlan show networks mode=bssid` into a list of dicts."""
    networks = []
    current: dict = {}

    for line in output.splitlines():
        line = line.strip()

        ssid_m = re.match(r'^SSID\s+\d+\s*:\s*(.*)$', line)
        if ssid_m and 'BSSID' not in line:
            if current.get('bssid'):
                networks.append(current)
            current = {
                'ssid': ssid_m.group(1).strip(),
                'bssid': None,
                'rssi': -99,
                'channel': None,
                'auth': None,
                'encryption': None,
                'radio_type': None,
                'band': None,
                'basic_rates': [],
                'other_rates': [],
            }
            continue

        bssid_m = re.match(r'^BSSID\s+\d+\s*:\s*([\da-fA-F:]{17})$', line, re.IGNORECASE)
        if bssid_m:
            if current.get('bssid'):
                networks.append(dict(current))
            current['bssid'] = bssid_m.group(1).upper()
            continue

        sig_m = re.match(r'^Signal\s*:\s*(\d+)%', line)
        if sig_m:
            pct = int(sig_m.group(1))
            # Windows "signal" is (RSSI + 100) × 2 clamped to [0,100]
            current['rssi'] = (pct / 2) - 100
            continue

        ch_m = re.match(r'^Channel\s*:\s*(\d+)', line)
        if ch_m:
            current['channel'] = int(ch_m.group(1))
            continue

        auth_m = re.match(r'^Authentication\s*:\s*(.+)$', line)
        if auth_m:
            current['auth'] = auth_m.group(1).strip()
            continue

        enc_m = re.match(r'^Encryption\s*:\s*(.+)$', line)
        if enc_m:
            current['encryption'] = enc_m.group(1).strip()
            continue

        radio_m = re.match(r'^Radio\s+type\s*:\s*(.+)$', line)
        if radio_m:
            raw = radio_m.group(1).strip()
            current['radio_type'] = raw
            # Infer band from radio type string
            if '6' in raw or 'ax' in raw.lower() or 'Wi-Fi 6' in raw:
                current['band'] = '6GHz' if '6E' in raw else '5GHz'
            elif 'ac' in raw.lower() or '5' in raw:
                current['band'] = '5GHz'
            else:
                current['band'] = '2.4GHz'
            continue

        # Channel also encodes band on some Windows versions
        band_m = re.match(r'^Band\s*:\s*(.+)$', line)
        if band_m:
            current['band'] = band_m.group(1).strip()
            continue

        basic_m = re.match(r'^Basic\s+rates\s*\(Mbps\)\s*:\s*(.+)$', line)
        if basic_m:
            current['basic_rates'] = [r.strip() for r in basic_m.group(1).split()]
            continue

        other_m = re.match(r'^Other\s+rates\s*\(Mbps\)\s*:\s*(.+)$', line)
        if other_m:
            current['other_rates'] = [r.strip() for r in other_m.group(1).split()]
            continue

    if current.get('bssid'):
        networks.append(current)
    return networks


def _scan_netsh_once(allowlist: dict, gps_fn: Optional[Callable]):
    """Run one netsh scan cycle and ingest results."""
    from app.core.device_classifier import classify_wifi
    from app.api.device_filter import is_type_enabled

    try:
        result = subprocess.run(
            ['netsh', 'wlan', 'show', 'networks', 'mode=bssid'],
            capture_output=True, text=True, timeout=10,
            creationflags=_CREATE_NO_WINDOW,
        )
    except Exception:
        return

    networks = _parse_netsh(result.stdout)
    ts_ms = int(time.time() * 1000)
    loc   = gps_fn() if gps_fn else {}

    for net in networks:
        if not net.get('bssid'):
            continue

        key = hash_identifier(net['bssid'])

        if key in allowlist:
            meta = allowlist[key]
            ingest_observation(
                target_key=key, source='wifi', ts_ms=ts_ms,
                rssi=net['rssi'],
                lat=loc.get('lat'), lon=loc.get('lon'),
                speed_mps=loc.get('speed_mps'), heading=loc.get('heading'),
                meta={**meta,
                      'channel':     net.get('channel'),
                      'ssid':        net.get('ssid'),
                      'auth':        net.get('auth'),
                      'encryption':  net.get('encryption'),
                      'radio_type':  net.get('radio_type'),
                      'band':        net.get('band'),
                      'basic_rates': net.get('basic_rates'),
                      'device_type': None},
            )
            continue

        dtype, dlabel, dcolor = classify_wifi(net.get('ssid'), net.get('bssid'))
        if not is_type_enabled(dtype):
            continue

        ingest_observation(
            target_key=key, source='wifi', ts_ms=ts_ms,
            rssi=net['rssi'],
            lat=loc.get('lat'), lon=loc.get('lon'),
            speed_mps=loc.get('speed_mps'), heading=loc.get('heading'),
            meta={
                'oui_label':   dlabel,
                'color':       dcolor,
                'device_type': dtype,
                'channel':     net.get('channel'),
                'ssid':        net.get('ssid'),
                'auth':        net.get('auth'),
                'encryption':  net.get('encryption'),
                'radio_type':  net.get('radio_type'),
                'band':        net.get('band'),
                'basic_rates': net.get('basic_rates'),
                'other_rates': net.get('other_rates'),
            },
        )


# ── Scapy raw 802.11 capture ──────────────────────────────────────────────────

def _get_wifi_iface() -> Optional[str]:
    """Return the name of the first Wi-Fi interface Scapy can see."""
    if not _SCAPY:
        return None
    try:
        from scapy.arch.windows import get_windows_if_list
        for iface in get_windows_if_list():
            name = iface.get('name', '')
            desc = iface.get('description', '').lower()
            if 'wi-fi' in desc or 'wireless' in desc or '802.11' in desc or 'wlan' in desc:
                return name
    except Exception:
        pass
    return None


# Track probe requests FROM other devices (passive, zero-injection)
# Maps MAC → list of SSIDs the device has been looking for
_probe_requests_seen: dict = {}   # addr -> {'ssids': set, 'last_ts': int, 'rssi_list': []}


def _handle_packet(pkt, allowlist: dict, gps_fn: Optional[Callable]):
    """Scapy packet callback — handles beacons and probe requests."""
    from app.core.device_classifier import classify_wifi
    from app.api.device_filter import is_type_enabled

    ts_ms = int(time.time() * 1000)
    loc   = gps_fn() if gps_fn else {}

    # ── Beacon frames (from APs) ──────────────────────────────────────────────
    if pkt.haslayer(Dot11Beacon):
        try:
            bssid = pkt[Dot11].addr3.upper() if pkt[Dot11].addr3 else None
            if not bssid:
                return

            rssi = pkt[RadioTap].dBm_AntSignal if pkt.haslayer(RadioTap) else -99

            # Walk Information Elements for rich data
            ssid = ''
            channel = None
            auth = 'Unknown'
            encryption = 'Unknown'
            country_code = None
            ht_capable = False     # 802.11n
            vht_capable = False    # 802.11ac
            he_capable = False     # 802.11ax / Wi-Fi 6
            wps_present = False
            hidden = False

            elt = pkt[Dot11Elt]
            while elt:
                try:
                    if elt.ID == 0:   # SSID
                        raw_ssid = bytes(elt.info)
                        if raw_ssid:
                            try:
                                ssid = raw_ssid.decode('utf-8', errors='replace')
                            except Exception:
                                ssid = raw_ssid.hex()
                        else:
                            hidden = True   # empty SSID = hidden network
                    elif elt.ID == 3:  # DS Parameter Set → channel
                        channel = int.from_bytes(bytes(elt.info), 'little')
                    elif elt.ID == 7:  # Country
                        info = bytes(elt.info)
                        if len(info) >= 2:
                            country_code = info[:2].decode('ascii', errors='replace').strip()
                    elif elt.ID == 48:  # RSN (WPA2/WPA3)
                        auth = 'WPA2/WPA3'
                        # Parse cipher suites for encryption type
                        if b'\x00\x0f\xac\x04' in bytes(elt.info):
                            encryption = 'AES/CCMP'
                        elif b'\x00\x0f\xac\x02' in bytes(elt.info):
                            encryption = 'TKIP'
                        else:
                            encryption = 'AES'
                    elif elt.ID == 221:  # Vendor Specific
                        info = bytes(elt.info)
                        # WPS OUI: 00:50:F2:04
                        if info[:4] == b'\x00\x50\xf2\x04':
                            wps_present = True
                        # WPA (WPA1): 00:50:F2:01
                        if info[:4] == b'\x00\x50\xf2\x01' and auth == 'Unknown':
                            auth = 'WPA'
                            encryption = 'TKIP'
                    elif elt.ID == 45:  # HT Capabilities (802.11n)
                        ht_capable = True
                    elif elt.ID == 191:  # VHT Capabilities (802.11ac)
                        vht_capable = True
                    elif elt.ID == 255:  # Extended — check for HE (802.11ax)
                        if bytes(elt.info)[:1] == b'\x23':
                            he_capable = True
                    elt = elt.payload if hasattr(elt, 'payload') and isinstance(elt.payload, Dot11Elt) else None
                except Exception:
                    break

            if auth == 'Unknown':
                cap = pkt[Dot11Beacon].cap
                if cap & 0x0010:   # Privacy bit
                    auth = 'WEP'
                    encryption = 'WEP'
                else:
                    auth = 'Open'
                    encryption = 'None'

            wifi_gen = 'Wi-Fi 6' if he_capable else ('Wi-Fi 5' if vht_capable else ('Wi-Fi 4' if ht_capable else 'Wi-Fi 1-3'))
            band = '5GHz' if (channel and channel > 14) else '2.4GHz'

            key = hash_identifier(bssid)
            if key in allowlist:
                meta = allowlist[key]
                ingest_observation(
                    target_key=key, source='wifi', ts_ms=ts_ms, rssi=rssi,
                    lat=loc.get('lat'), lon=loc.get('lon'),
                    speed_mps=loc.get('speed_mps'), heading=loc.get('heading'),
                    meta={**meta,
                          'ssid': ssid, 'hidden': hidden, 'channel': channel,
                          'auth': auth, 'encryption': encryption,
                          'wifi_gen': wifi_gen, 'band': band,
                          'country': country_code, 'wps': wps_present,
                          'device_type': None},
                )
                return

            dtype, dlabel, dcolor = classify_wifi(ssid, bssid)
            if not is_type_enabled(dtype):
                return

            ingest_observation(
                target_key=key, source='wifi', ts_ms=ts_ms, rssi=rssi,
                lat=loc.get('lat'), lon=loc.get('lon'),
                speed_mps=loc.get('speed_mps'), heading=loc.get('heading'),
                meta={
                    'oui_label':   dlabel,
                    'color':       dcolor,
                    'device_type': dtype,
                    'ssid':        ssid,
                    'hidden':      hidden,
                    'channel':     channel,
                    'auth':        auth,
                    'encryption':  encryption,
                    'wifi_gen':    wifi_gen,
                    'band':        band,
                    'country':     country_code,
                    'wps':         wps_present,
                },
            )
        except Exception as e:
            log.debug('beacon parse error: %s', e)

    # ── Probe Request frames (from nearby client devices) ─────────────────────
    # These are passively captured — the devices around us are broadcasting
    # what networks they're looking for. No packets are injected.
    elif pkt.haslayer(Dot11ProbeReq):
        try:
            src = pkt[Dot11].addr2
            if not src or src.lower() in ('ff:ff:ff:ff:ff:ff', '00:00:00:00:00:00'):
                return
            src = src.upper()

            rssi = pkt[RadioTap].dBm_AntSignal if pkt.haslayer(RadioTap) else -99

            # Extract requested SSID (what network is this device looking for?)
            wanted_ssid = ''
            if pkt.haslayer(Dot11Elt):
                elt = pkt[Dot11Elt]
                if elt.ID == 0 and elt.info:
                    try:
                        wanted_ssid = bytes(elt.info).decode('utf-8', errors='replace')
                    except Exception:
                        wanted_ssid = bytes(elt.info).hex()

            # Accumulate probe history for this device
            entry = _probe_requests_seen.setdefault(src, {'ssids': set(), 'last_ts': 0, 'rssi_list': []})
            entry['last_ts'] = ts_ms
            entry['rssi_list'].append(rssi)
            if len(entry['rssi_list']) > 20:
                entry['rssi_list'] = entry['rssi_list'][-20:]
            if wanted_ssid:
                entry['ssids'].add(wanted_ssid)

            key = hash_identifier(src)
            dtype, dlabel, dcolor = classify_wifi('', src)
            if not is_type_enabled(dtype):
                return

            ingest_observation(
                target_key=key, source='wifi_probe', ts_ms=ts_ms, rssi=rssi,
                lat=loc.get('lat'), lon=loc.get('lon'),
                speed_mps=loc.get('speed_mps'), heading=loc.get('heading'),
                meta={
                    'oui_label':    dlabel,
                    'color':        dcolor,
                    'device_type':  dtype,
                    'addr':         src,
                    'probe_type':   'request',
                    'wanted_ssid':  wanted_ssid or None,
                    # Include full list of SSIDs this device has probed for
                    'probed_ssids': list(entry['ssids'])[:20],
                },
            )
        except Exception as e:
            log.debug('probe req parse error: %s', e)


def _scapy_loop(allowlist: dict, gps_fn: Optional[Callable]):
    """Continuous Scapy sniff loop on the Wi-Fi interface."""
    global _running
    iface = _get_wifi_iface()
    if not iface:
        log.warning('Scapy: no Wi-Fi interface found — falling back to netsh')
        _netsh_loop(gps_fn)
        return

    log.info('Scapy Wi-Fi capture started on interface: %s', iface)
    try:
        sniff(
            iface=iface,
            prn=lambda pkt: _handle_packet(pkt, allowlist, gps_fn),
            store=False,
            stop_filter=lambda _: not _running,
        )
    except Exception as e:
        log.error('Scapy capture error: %s — falling back to netsh', e)
        _netsh_loop(gps_fn)


def _netsh_loop(gps_fn: Optional[Callable]):
    global _running
    allowlist = build_allowlist()
    while _running:
        _scan_netsh_once(allowlist, gps_fn)
        allowlist = build_allowlist()
        time.sleep(max(1.0, settings.WIFI_SCAN_INTERVAL_S))


def _loop(gps_fn: Optional[Callable]):
    allowlist = build_allowlist()
    if _SCAPY and _get_wifi_iface():
        _scapy_loop(allowlist, gps_fn)
    else:
        _netsh_loop(gps_fn)


def get_probe_requests() -> dict:
    """Return accumulated probe-request history (for API exposure)."""
    return {
        addr: {
            'ssids':      list(e['ssids']),
            'last_ts_ms': e['last_ts'],
            'avg_rssi':   sum(e['rssi_list']) / len(e['rssi_list']) if e['rssi_list'] else -99,
        }
        for addr, e in _probe_requests_seen.items()
    }


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
