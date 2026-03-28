from fastapi import APIRouter, HTTPException
from app.core.allowlist import get_targets_raw, save_targets

router = APIRouter()

@router.get("")
def list_targets():
    return get_targets_raw()

@router.put("")
def update_targets(data: dict):
    try:
        save_targets(data)
        return {"status": "saved"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
