"""
WebSocket endpoint for phone GPS relay + a simple HTML page
the user opens on their phone to stream GPS to the laptop.

Phone usage:
  1. Connect phone to the same WiFi as the laptop (or laptop hotspot)
  2. Open http://<laptop-ip>:PORT/phone-gps in phone browser
  3. Allow location access
  4. GPS data streams to laptop automatically
"""
import json
import time
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from app.ingest.gps_relay import update_fix, get_fix

router = APIRouter()
log = logging.getLogger(__name__)


# ── Browser GPS push (called by React frontend watchPosition) ─────────────────
@router.post("/gps/update")
async def gps_update(data: dict):
    """
    Accept a GPS fix POSTed by the laptop browser's own geolocation API.
    This is the primary GPS source when the phone relay page is not open.
    Body: { lat, lon, accuracy?, heading?, speed? }
    """
    try:
        update_fix(
            lat=float(data["lat"]),
            lon=float(data["lon"]),
            accuracy=data.get("accuracy"),
            heading=data.get("heading"),
            speed_mps=data.get("speed"),
            source="browser",
        )
        return {"ok": True}
    except (KeyError, ValueError, TypeError) as e:
        return {"error": str(e)}

# ── WebSocket endpoint ────────────────────────────────────────────────────────
@router.websocket("/ws/gps")
async def gps_websocket(ws: WebSocket):
    await ws.accept()
    log.info("Phone GPS connected from %s", ws.client)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
                update_fix(
                    lat=float(data["lat"]),
                    lon=float(data["lon"]),
                    accuracy=data.get("accuracy"),
                    heading=data.get("heading"),
                    speed_mps=data.get("speed"),
                    source="phone",
                )
                await ws.send_text(json.dumps({"ok": True}))
            except (KeyError, ValueError, TypeError) as e:
                await ws.send_text(json.dumps({"error": str(e)}))
    except WebSocketDisconnect:
        log.info("Phone GPS disconnected")


# ── Current GPS status ────────────────────────────────────────────────────────
@router.get("/gps/status")
def gps_status():
    fix = get_fix()
    fix["available"] = fix.get("lat") is not None
    fix["age_s"] = round(time.time() - fix.get("ts", 0), 1) if fix.get("ts") else None
    return fix


# ── Phone GPS HTML page ───────────────────────────────────────────────────────
PHONE_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>Invincible.Inc GPS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0b0f14; color: #c8d8e8;
      font-family: 'Courier New', monospace;
      min-height: 100vh;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 24px; gap: 20px;
    }
    h1 { font-size: 18px; color: #00d4ff; letter-spacing: .15em; text-transform: uppercase; }
    .status {
      font-size: 13px; padding: 10px 18px;
      border: 1px solid #1e2d3d; border-radius: 4px;
      text-align: center; min-width: 260px;
    }
    .status.ok   { border-color: #00e676; color: #00e676; }
    .status.warn { border-color: #ffab40; color: #ffab40; }
    .status.err  { border-color: #ff4d6d; color: #ff4d6d; }
    .coords { font-size: 12px; color: #5a7a96; text-align: center; line-height: 1.8; }
    .dot {
      width: 12px; height: 12px; border-radius: 50%;
      background: #5a7a96; display: inline-block;
      animation: pulse 1.4s ease-in-out infinite;
    }
    .dot.active { background: #00e676; }
    @keyframes pulse {
      0%,100% { opacity:1; transform:scale(1); }
      50%      { opacity:.4; transform:scale(1.5); }
    }
    .tip { font-size: 11px; color: #3a5a76; text-align: center; max-width: 260px; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>🏍 GPS Relay</h1>
  <span id="dot" class="dot"></span>
  <div id="status" class="status warn">Connecting…</div>
  <div id="coords" class="coords">Waiting for location…</div>
  <div class="tip">Keep this page open while driving. Your phone's GPS will stream to the laptop map in real time.</div>

<script>
  const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/gps';
  let ws, watchId;
  let lastSent = 0;
  const SEND_INTERVAL_MS = 1500;

  function connect() {
    ws = new WebSocket(WS_URL);
    ws.onopen  = () => setStatus('ok', '● Connected — GPS streaming');
    ws.onclose = () => { setStatus('err', '✕ Disconnected — retrying…'); setTimeout(connect, 3000); };
    ws.onerror = () => setStatus('err', '✕ Connection error');
  }

  function setStatus(cls, msg) {
    const el = document.getElementById('status');
    el.className = 'status ' + cls;
    el.textContent = msg;
    document.getElementById('dot').className = 'dot' + (cls === 'ok' ? ' active' : '');
  }

  function startGeo() {
    if (!navigator.geolocation) {
      setStatus('err', 'Geolocation not supported'); return;
    }
    watchId = navigator.geolocation.watchPosition(pos => {
      const { latitude: lat, longitude: lon, accuracy, heading, speed } = pos.coords;
      document.getElementById('coords').innerHTML =
        lat.toFixed(6) + ', ' + lon.toFixed(6) +
        '<br>Accuracy: ' + (accuracy ? accuracy.toFixed(1) + 'm' : '?') +
        (speed != null ? '<br>Speed: ' + (speed * 3.6).toFixed(1) + ' km/h' : '');

      const now = Date.now();
      if (ws && ws.readyState === 1 && now - lastSent >= SEND_INTERVAL_MS) {
        ws.send(JSON.stringify({ lat, lon, accuracy, heading, speed }));
        lastSent = now;
      }
    },
    err => setStatus('warn', '⚠ GPS: ' + err.message),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
  }

  connect();
  startGeo();
</script>
</body>
</html>
"""

@router.get("/phone-gps", response_class=HTMLResponse)
def phone_gps_page():
    return HTMLResponse(content=PHONE_PAGE)
