from fastapi import APIRouter
router = APIRouter(prefix="/control")
@router.post("/start")
def start():
    return {"status": "started"}
@router.post("/stop")
def stop():
    return {"status": "stopped"}
