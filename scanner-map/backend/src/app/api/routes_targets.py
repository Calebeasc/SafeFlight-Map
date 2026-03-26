from fastapi import APIRouter
router = APIRouter()
@router.get("/targets")
def targets():
    return {"wifi": [], "ble": []}
