from fastapi import APIRouter
from app.ingest.scanner import start_scanning, stop_scanning, scanner_status

router = APIRouter()

@router.post("/start")
def start():
    return start_scanning()

@router.post("/stop")
def stop():
    return stop_scanning()

@router.get("/status")
def status():
    return scanner_status()
