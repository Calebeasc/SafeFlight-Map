"""
Device type filter API — controls which signal types are logged to the map.

State is in-memory (resets to defaults on restart).
Dev panel can read and toggle individual types.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from app.core.device_classifier import DEVICE_TYPES, TYPE_DEFAULTS

router = APIRouter()

# ── In-memory filter state ────────────────────────────────────────────────────
# True = this device type is logged; False = silently dropped.
_enabled: dict[str, bool] = {k: TYPE_DEFAULTS[k] for k in DEVICE_TYPES}


def is_type_enabled(device_type: str) -> bool:
    """Called by scanners before ingesting a non-allowlisted observation."""
    return _enabled.get(device_type, False)


# ── API ───────────────────────────────────────────────────────────────────────

@router.get('')
def get_filter():
    """Return the full device type registry with enabled state and counts."""
    return {
        'types': [
            {
                'key':     key,
                'label':   info[0],
                'color':   info[1],
                'enabled': _enabled.get(key, info[2]),
            }
            for key, info in DEVICE_TYPES.items()
        ]
    }


class ToggleBody(BaseModel):
    key:     str
    enabled: bool


@router.post('/toggle')
def toggle_type(body: ToggleBody):
    if body.key not in DEVICE_TYPES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f'Unknown device type: {body.key}')
    _enabled[body.key] = body.enabled
    return {'key': body.key, 'enabled': body.enabled}


class BulkBody(BaseModel):
    enabled: bool


@router.post('/toggle-all')
def toggle_all(body: BulkBody):
    for key in _enabled:
        _enabled[key] = body.enabled
    return {'enabled': body.enabled}


class SetAllBody(BaseModel):
    types: dict


@router.put('')
def set_filter(body: SetAllBody):
    """Batch-set all enabled states at once (used by save button)."""
    for key, val in (body.types or {}).items():
        if key in _enabled:
            _enabled[key] = bool(val)
    return {'ok': True}
