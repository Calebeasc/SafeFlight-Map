from fastapi import APIRouter
from app.core.privacy import allowlist

router = APIRouter()

@router.get('/targets')
def targets():
    return {"wifi": sorted(allowlist.wifi), "ble": sorted(allowlist.ble)}
