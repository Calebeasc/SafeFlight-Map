from fastapi import APIRouter
from app.ingest.scanner import start_scanning, stop_scanning, scanner_status
from app.ingest.route_recorder import start_recording, stop_recording

router = APIRouter()

@router.post("/start")
def start():
    result = start_scanning()
    start_recording()
    # Feature 2: establish a new session window for tail detection
    try:
        from app.processing.aggregator import set_session_start
        set_session_start()
    except Exception:
        pass
    return result

@router.post("/stop")
def stop():
    stop_recording()
    return stop_scanning()

@router.get("/status")
def status():
    return scanner_status()

@router.post("/selftest")
async def selftest():
    """Run a quick health check on each subsystem and return a checklist."""
    checks = []

    # DB writable
    try:
        from app.db.database import get_db
        conn = get_db()
        conn.execute("CREATE TABLE IF NOT EXISTS _sfm_test (id INTEGER PRIMARY KEY AUTOINCREMENT)")
        conn.execute("INSERT INTO _sfm_test DEFAULT VALUES")
        conn.execute("DELETE FROM _sfm_test")
        conn.commit()
        checks.append({"name": "Database", "ok": True, "detail": "Read/write OK"})
    except Exception as e:
        checks.append({"name": "Database", "ok": False, "detail": str(e)})

    # GPS status
    try:
        from app.ingest import gps_store
        s = gps_store.status()
        avail = s.get("available", False)
        detail = f"source={s.get('source', 'none')}"
        if s.get("lat") is not None:
            detail += f"  lat={s['lat']:.5f}"
        checks.append({"name": "GPS", "ok": avail, "detail": detail})
    except Exception as e:
        checks.append({"name": "GPS", "ok": False, "detail": str(e)})

    # Scanner process
    try:
        st = scanner_status()
        checks.append({"name": "Scanner", "ok": True,
                        "detail": f"mode={st.get('mode', '?')}  running={st.get('running', False)}"})
    except Exception as e:
        checks.append({"name": "Scanner", "ok": False, "detail": str(e)})

    # Settings readable
    try:
        from app.api.settings_api import load
        s = load()
        checks.append({"name": "Settings", "ok": True, "detail": f"{len(s)} keys loaded"})
    except Exception as e:
        checks.append({"name": "Settings", "ok": False, "detail": str(e)})

    return {"checks": checks}
