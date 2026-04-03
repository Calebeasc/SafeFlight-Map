"""
Allowlist and identifier hashing.

targets.json format:
{
  "wifi": [
    {"bssid": "AA:BB:CC:DD:EE:FF", "label": "Home AP"},
    {"bssid": "11:22:33:44:55:66"}
  ],
  "ble": [
    {"address": "AA:BB:CC:DD:EE:FF", "label": "Beacon 1"},
    {"uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
  ]
}
"""
import hashlib
import hmac
import json
import os
from typing import Optional
from app.core.config import settings


def _normalize(identifier: str) -> str:
    return identifier.strip().upper()


def hash_identifier(identifier: str) -> str:
    """Return HMAC-SHA256 hex of the normalised identifier."""
    secret = settings.HMAC_SECRET.encode()
    msg = _normalize(identifier).encode()
    return hmac.new(secret, msg, hashlib.sha256).hexdigest()


def _load_targets() -> dict:
    if not os.path.exists(settings.TARGETS_FILE):
        os.makedirs(os.path.dirname(settings.TARGETS_FILE), exist_ok=True)
        # Write a sample file on first run
        sample = {
            "wifi": [{"bssid": "00:00:00:00:00:00", "label": "Example AP (replace me)"}],
            "ble":  [{"address": "00:00:00:00:00:00", "label": "Example Beacon (replace me)"}]
        }
        with open(settings.TARGETS_FILE, "w") as f:
            json.dump(sample, f, indent=2)
        return sample
    with open(settings.TARGETS_FILE) as f:
        return json.load(f)


# Build a set of allowed hashed keys for fast lookup
def build_allowlist() -> dict[str, dict]:
    """Return {target_key: {label, source, oui_label, color}} for all allowlisted targets."""
    data = _load_targets()
    allowed: dict[str, dict] = {}

    def _oui_tag(mac: str):
        oui = mac.upper()[:8]
        if oui == settings.OUI_FUN_WATCHER.upper():
            return "Fun-Watcher", "blue"
        if oui == settings.OUI_FUN_STOPPER.upper():
            return "Fun-Stopper", "red"
        return None, None

    for entry in data.get("wifi", []):
        raw_id = entry.get("bssid", "")
        if not raw_id:
            continue
        key = hash_identifier(raw_id)
        label, color = _oui_tag(raw_id)
        allowed[key] = {
            "label": entry.get("label") or label,
            "source": "wifi",
            "oui_label": label,
            "color": color,
        }

    for entry in data.get("ble", []):
        raw_id = entry.get("address") or entry.get("uuid", "")
        if not raw_id:
            continue
        key = hash_identifier(raw_id)
        label, color = _oui_tag(raw_id) if len(raw_id) >= 8 else (None, None)
        allowed[key] = {
            "label": entry.get("label") or label,
            "source": "ble",
            "oui_label": label,
            "color": color,
        }

    return allowed


def get_targets_raw() -> dict:
    """Return raw targets.json content (for the /targets UI endpoint)."""
    return _load_targets()


def save_targets(data: dict):
    os.makedirs(os.path.dirname(settings.TARGETS_FILE), exist_ok=True)
    with open(settings.TARGETS_FILE, "w") as f:
        json.dump(data, f, indent=2)
