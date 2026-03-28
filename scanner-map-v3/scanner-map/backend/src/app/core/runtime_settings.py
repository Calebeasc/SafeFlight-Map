"""
Runtime settings that the user can change via the Settings panel
without restarting the app. Persisted to a JSON sidecar file.
"""
import json
import os
import threading
from typing import Any

_SETTINGS_FILE = os.path.join(os.path.expanduser("~"), "SafeFlightMap", "settings.json")

DEFAULTS: dict[str, Any] = {
    "scan_mode":          "fake",      # "fake" | "wifi" | "ble" | "both"
    "alert_radius_m":     300,
    "wifi_gap_s":         2.0,
    "ble_gap_s":          1.0,
    "heat_cell_m":        100.0,
    "wifi_scan_interval": 2.0,         # seconds between Wi-Fi scans
    "ble_scan_duration":  1.5,         # seconds per BLE scan window
    "audio_enabled":      True,
    "audio_volume":       0.7,
    "show_markers":       True,
    "alert_cooldown_s":   30,
}

_lock = threading.Lock()
_cache: dict[str, Any] = {}


def _path() -> str:
    os.makedirs(os.path.dirname(_SETTINGS_FILE), exist_ok=True)
    return _SETTINGS_FILE


def load() -> dict[str, Any]:
    global _cache
    with _lock:
        if _cache:
            return dict(_cache)
        try:
            with open(_path()) as f:
                saved = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            saved = {}
        merged = {**DEFAULTS, **saved}
        _cache = merged
        return dict(merged)


def save(updates: dict[str, Any]) -> dict[str, Any]:
    global _cache
    with _lock:
        current = {**DEFAULTS, **_cache}
        # Only accept known keys
        for k, v in updates.items():
            if k in DEFAULTS:
                current[k] = v
        _cache = current
        with open(_path(), "w") as f:
            json.dump(current, f, indent=2)
        return dict(current)


def get(key: str, default: Any = None) -> Any:
    return load().get(key, default)
