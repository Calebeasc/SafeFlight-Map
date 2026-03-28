"""
Runtime settings — GET/PUT /settings
Persisted to ~/SafeFlightMap/runtime_settings.json
"""
import json
import os
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

_SETTINGS_FILE = os.path.join(os.path.expanduser('~'), 'SafeFlightMap', 'runtime_settings.json')

_DEFAULTS = {
    'alert_radius_m':            300,
    'alert_cooldown_s':          30,
    'wifi_scan_interval_s':      3.0,
    'ble_scan_enabled':          True,
    'wifi_scan_enabled':         True,
    'fake_data_enabled':         False,
    'heat_cell_m':               100,
    'rssi_floor':                -95,
    # Aggressive mode
    'aggressive_mode':           False,
    'aggressive_scan_interval_s': 1.0,   # 0.5 – 10 s
    # User-facing scan frequency (applies to all active scanning)
    'scan_interval_s':           3.0,    # 1 – 30 s
}


def load() -> dict:
    if os.path.exists(_SETTINGS_FILE):
        try:
            with open(_SETTINGS_FILE) as f:
                saved = json.load(f)
            return {**_DEFAULTS, **saved}
        except Exception:
            pass
    return dict(_DEFAULTS)


def save(data: dict):
    os.makedirs(os.path.dirname(_SETTINGS_FILE), exist_ok=True)
    with open(_SETTINGS_FILE, 'w') as f:
        json.dump(data, f, indent=2)


@router.get('')
def get_settings():
    return load()


class SettingsUpdate(BaseModel):
    alert_radius_m:              Optional[int]   = None
    alert_cooldown_s:            Optional[int]   = None
    wifi_scan_interval_s:        Optional[float] = None
    ble_scan_enabled:            Optional[bool]  = None
    wifi_scan_enabled:           Optional[bool]  = None
    fake_data_enabled:           Optional[bool]  = None
    heat_cell_m:                 Optional[int]   = None
    rssi_floor:                  Optional[float] = None
    aggressive_mode:             Optional[bool]  = None
    aggressive_scan_interval_s:  Optional[float] = None
    scan_interval_s:             Optional[float] = None


@router.put('')
def update_settings(update: SettingsUpdate):
    current = load()
    patch = {k: v for k, v in update.dict().items() if v is not None}
    current.update(patch)
    save(current)
    # Push into live config object
    from app.core.config import settings as cfg
    for k, v in patch.items():
        attr = k.upper()
        if hasattr(cfg, attr):
            setattr(cfg, attr, v)
    return current
