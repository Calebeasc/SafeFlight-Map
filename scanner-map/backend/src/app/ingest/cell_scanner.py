"""
LTE / cellular signal scanner for Windows.

Strategy (in priority order):
  1. Windows MBN (Mobile Broadband Network) WMI namespace
     — signal strength, registration state, data class (LTE/5G/HSPA)
  2. netsh mbn show signal / show interface
     — parses text output for signal bars, RSSI, RSRP, RSRQ, SNR
  3. Windows Location API cellular fallback (WinRT)
     — reports signal quality when GPS is off

Fields collected when available:
  signal_bars     (0-5)
  rssi_dbm        received signal strength
  rsrp_dbm        LTE Reference Signal Received Power
  rsrq_db         LTE Reference Signal Received Quality
  snr_db          Signal-to-Noise Ratio
  data_class      'LTE' | 'LTE-A' | '5G' | 'HSPA+' | '3G' | 'Edge' | '2G'
  roaming         bool
  provider        carrier name (e.g. 'Verizon', 'T-Mobile')
  cell_id         Cell ID (integer)
  lac             Location Area Code
  mcc             Mobile Country Code (e.g. 310 = USA)
  mnc             Mobile Network Code (e.g. 260 = T-Mobile US)
"""
import logging
import re
import subprocess
import threading
import time
from typing import Optional

log = logging.getLogger(__name__)

_running   = False
_thread: Optional[threading.Thread] = None
_last_cell: dict = {}
_CREATE_NO_WINDOW = 0x08000000

# LTE data class codes from Windows MBN API
_DATA_CLASS = {
    0x00000000: 'None',
    0x00000001: '2G-GPRS',
    0x00000002: '2G-EDGE',
    0x00000004: '3G-UMTS',
    0x00000008: '3G-HSDPA',
    0x00000010: '3G-HSUPA',
    0x00000020: '3G-HSPA',
    0x00000040: '3G-LTE',      # LTE
    0x00000080: '3GPP2-1xRTT',
    0x00000100: '3GPP2-EVDO',
    0x00000200: '3GPP2-EVDOA',
    0x00000400: '3GPP2-EVDOB',
    0x00000800: '3GPP-CUSTOM',
    0x00001000: '5G-NR',       # 5G
}


def _parse_netsh_mbn(interface: str = '') -> dict:
    """
    Parse `netsh mbn show signal interface=*` output.
    Returns dict with signal fields.
    """
    result = {}
    iface_arg = f'interface="{interface}"' if interface else 'interface=*'

    try:
        out = subprocess.run(
            ['netsh', 'mbn', 'show', 'signal', iface_arg],
            capture_output=True, text=True, timeout=8,
            creationflags=_CREATE_NO_WINDOW,
        ).stdout
        if not out or 'There is no' in out:
            return result

        for line in out.splitlines():
            line = line.strip()
            # Signal bars: "Signal Bars           : 3"
            m = re.match(r'Signal\s+Bars\s*:\s*(\d+)', line, re.IGNORECASE)
            if m:
                result['signal_bars'] = int(m.group(1))
            # RSSI
            m = re.match(r'RSSI\s*:\s*(-?\d+)', line, re.IGNORECASE)
            if m:
                result['rssi_dbm'] = int(m.group(1))
            # RSRP
            m = re.match(r'RSRP\s*:\s*(-?\d+)', line, re.IGNORECASE)
            if m:
                result['rsrp_dbm'] = int(m.group(1))
            # RSRQ
            m = re.match(r'RSRQ\s*:\s*(-?\d+(?:\.\d+)?)', line, re.IGNORECASE)
            if m:
                result['rsrq_db'] = float(m.group(1))
            # SNR / SINR
            m = re.match(r'S(?:I)?NR\s*:\s*(-?\d+(?:\.\d+)?)', line, re.IGNORECASE)
            if m:
                result['snr_db'] = float(m.group(1))
            # Error rate
            m = re.match(r'Error\s+Rate\s*:\s*(.+)', line, re.IGNORECASE)
            if m:
                result['error_rate'] = m.group(1).strip()
    except Exception as e:
        log.debug('netsh mbn signal error: %s', e)

    try:
        out2 = subprocess.run(
            ['netsh', 'mbn', 'show', 'interface', iface_arg],
            capture_output=True, text=True, timeout=8,
            creationflags=_CREATE_NO_WINDOW,
        ).stdout
        if out2:
            for line in out2.splitlines():
                line = line.strip()
                m = re.match(r'Provider\s+Name\s*:\s*(.+)', line, re.IGNORECASE)
                if m:
                    result['provider'] = m.group(1).strip()
                m = re.match(r'(?:Data\s+Class|Network\s+Type)\s*:\s*(.+)', line, re.IGNORECASE)
                if m:
                    result['data_class'] = m.group(1).strip()
                m = re.match(r'Roaming\s*:\s*(\w+)', line, re.IGNORECASE)
                if m:
                    result['roaming'] = m.group(1).strip().lower() not in ('no', 'false', '0', 'home')
                m = re.match(r'Cell\s+ID\s*:\s*(\d+)', line, re.IGNORECASE)
                if m:
                    result['cell_id'] = int(m.group(1))
                m = re.match(r'(?:Location\s+Area|LAC)\s*:\s*(\d+)', line, re.IGNORECASE)
                if m:
                    result['lac'] = int(m.group(1))
                m = re.match(r'PLMN\s*:\s*(\d{3})(\d{2,3})', line, re.IGNORECASE)
                if m:
                    result['mcc'] = m.group(1)
                    result['mnc'] = m.group(2)
    except Exception as e:
        log.debug('netsh mbn interface error: %s', e)

    return result


def _try_wmi() -> dict:
    """Try reading MBN data via WMI (requires wmi package: pip install wmi)."""
    try:
        import wmi
        w = wmi.WMI(namespace='root\\wmi')
        result = {}
        # MBN_Interface
        for iface in w.query('SELECT * FROM MbnInterface'):
            try:
                result['provider'] = getattr(iface, 'ProviderName', None)
                result['data_class'] = _DATA_CLASS.get(
                    getattr(iface, 'CurrentDataClass', 0), 'Unknown'
                )
                result['roaming'] = bool(getattr(iface, 'CurrentRoamingText', '') not in ('', 'Home'))
            except Exception:
                pass
        # MBN_Signal
        for sig in w.query('SELECT * FROM MbnSignal'):
            try:
                result['signal_bars'] = getattr(sig, 'SignalStrength', None)
                result['rssi_dbm']    = getattr(sig, 'Rssi', None)
                result['rsrp_dbm']    = getattr(sig, 'Rsrp', None)
                result['rsrq_db']     = getattr(sig, 'Rsrq', None)
                result['snr_db']      = getattr(sig, 'Snr', None)
            except Exception:
                pass
        return result
    except Exception:
        return {}


def get_cell_info() -> dict:
    """Return the latest known cell signal info."""
    return dict(_last_cell)


def _scan_loop():
    global _running, _last_cell
    while _running:
        try:
            # Try WMI first, fall back to netsh
            info = _try_wmi()
            if not info or 'signal_bars' not in info:
                info = _parse_netsh_mbn()

            if info:
                info['ts_ms'] = int(time.time() * 1000)
                _last_cell = info
                log.debug('Cell: %s', info)

        except Exception as e:
            log.debug('cell_scanner loop error: %s', e)

        time.sleep(10)   # poll every 10 seconds


def start():
    global _running, _thread
    if _running:
        return
    _running = True
    _thread = threading.Thread(target=_scan_loop, daemon=True, name='cell-scanner')
    _thread.start()
    log.info('Cell signal scanner started')


def stop():
    global _running
    _running = False


def is_available() -> bool:
    """Check if a mobile broadband interface exists."""
    try:
        out = subprocess.run(
            ['netsh', 'mbn', 'show', 'interfaces'],
            capture_output=True, text=True, timeout=5,
            creationflags=_CREATE_NO_WINDOW,
        ).stdout
        return bool(out and 'There is no' not in out and len(out.strip()) > 20)
    except Exception:
        return False
