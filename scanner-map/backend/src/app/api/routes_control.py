from fastapi import APIRouter

router = APIRouter(prefix='/control')
SCANNER_RUNNING = False

@router.post('/start')
def start():
    global SCANNER_RUNNING
    SCANNER_RUNNING = True
    return {"running": SCANNER_RUNNING}

@router.post('/stop')
def stop():
    global SCANNER_RUNNING
    SCANNER_RUNNING = False
    return {"running": SCANNER_RUNNING}
