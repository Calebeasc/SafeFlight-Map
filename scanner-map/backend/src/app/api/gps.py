"""
GPS endpoints.

POST /gps/update   – phone page posts its location here
GET  /gps/status   – current GPS fix info
GET  /gps/phone    – serve the phone GPS sharing page
"""
import time
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional, List
from app.ingest import gps_store

router = APIRouter()


class GpsFix(BaseModel):
    lat: float
    lon: float
    speed_mps: Optional[float] = None
    heading: Optional[float] = None
    accuracy_m: Optional[float] = None


@router.post("/update")
def update_gps(fix: GpsFix):
    gps_store.update(
        lat=fix.lat, lon=fix.lon,
        speed_mps=fix.speed_mps,
        heading=fix.heading,
        source='phone',
    )
    return {"status": "ok"}


class GpsFixBatch(BaseModel):
    lat: float
    lon: float
    speed_mps: Optional[float] = None
    heading: Optional[float] = None
    accuracy_m: Optional[float] = None
    ts_ms: Optional[int] = None  # original capture timestamp


@router.post("/batch")
def update_gps_batch(fixes: List[GpsFixBatch]):
    """Flush buffered fixes collected while the app was backgrounded."""
    if not fixes:
        return {"status": "ok", "count": 0}

    # Update in-memory store with the most recent fix
    latest = fixes[-1]
    gps_store.update(
        lat=latest.lat, lon=latest.lon,
        speed_mps=latest.speed_mps,
        heading=latest.heading,
        source='phone',
    )

    # Write all fixes into route_points preserving original timestamps
    from app.db.database import get_db
    now_ms = int(time.time() * 1000)
    conn = get_db()
    conn.executemany(
        "INSERT INTO route_points (ts_ms, lat, lon, speed_mps, heading, source) VALUES (?,?,?,?,?,?)",
        [(f.ts_ms or now_ms, f.lat, f.lon, f.speed_mps, f.heading, 'phone') for f in fixes],
    )
    conn.commit()
    return {"status": "ok", "count": len(fixes)}


@router.get("/status")
def gps_status():
    return gps_store.status()


@router.get("/phone", response_class=HTMLResponse)
def phone_page(request: Request):
    """
    Minimal page the user opens on their phone.
    Watches GPS and POSTs to the laptop backend every 2 seconds.
    """
    base_url = str(request.base_url).rstrip('/')
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
  <title>SafeFlight GPS</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{background:#0b0f14;color:#c8d8e8;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:20px;}}
    h1{{color:#00d4ff;font-size:18px;letter-spacing:.15em;margin-bottom:4px}}
    .sub{{color:#5a7a96;font-size:11px;margin-bottom:32px;letter-spacing:.1em}}
    .card{{background:#111820;border:1px solid #1e2d3d;padding:20px 24px;width:100%;max-width:340px;margin-bottom:12px}}
    .label{{font-size:9px;letter-spacing:.2em;color:#5a7a96;text-transform:uppercase;margin-bottom:4px}}
    .val{{font-size:15px;color:#00d4ff;font-weight:700}}
    .dot{{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#5a7a96}}
    .dot.on{{background:#00e676;box-shadow:0 0 6px #00e676}}
    .status{{font-size:12px;margin-top:8px}}
    .err{{color:#ff4d6d;font-size:11px;margin-top:12px;text-align:center}}
    .keepon{{color:#5a7a96;font-size:10px;margin-top:24px;text-align:center;line-height:1.6}}
  </style>
</head>
<body>
  <h1>📡 SafeFlight GPS</h1>
  <p class="sub">Keep this page open while driving</p>

  <div class="card">
    <div class="label">Status</div>
    <div class="status"><span class="dot" id="dot"></span><span id="status-text">Waiting for GPS…</span></div>
  </div>

  <div class="card">
    <div class="label">Latitude</div>
    <div class="val" id="lat">—</div>
  </div>
  <div class="card">
    <div class="label">Longitude</div>
    <div class="val" id="lon">—</div>
  </div>
  <div class="card">
    <div class="label">Speed</div>
    <div class="val" id="spd">—</div>
  </div>
  <div class="card">
    <div class="label">Accuracy</div>
    <div class="val" id="acc">—</div>
  </div>

  <div class="err" id="err"></div>
  <p class="keepon">Keep screen on · Stay on this page<br/>Your GPS location streams to the laptop</p>

<script>
const API = '{base_url}';
let watchId = null;

function post(fix) {{
  fetch(API + '/gps/update', {{
    method: 'POST',
    headers: {{'Content-Type': 'application/json'}},
    body: JSON.stringify(fix),
  }}).catch(() => {{}});
}}

function onPos(pos) {{
  const c = pos.coords;
  document.getElementById('lat').textContent  = c.latitude.toFixed(6);
  document.getElementById('lon').textContent  = c.longitude.toFixed(6);
  document.getElementById('spd').textContent  = c.speed != null ? (c.speed * 3.6).toFixed(1) + ' km/h' : '—';
  document.getElementById('acc').textContent  = c.accuracy ? c.accuracy.toFixed(0) + ' m' : '—';
  document.getElementById('dot').className    = 'dot on';
  document.getElementById('status-text').textContent = 'Streaming ✓';
  document.getElementById('err').textContent  = '';
  post({{
    lat: c.latitude, lon: c.longitude,
    speed_mps: c.speed, heading: c.heading, accuracy_m: c.accuracy,
  }});
}}

function onErr(e) {{
  document.getElementById('dot').className = 'dot';
  document.getElementById('err').textContent = 'GPS error: ' + e.message;
}}

if (navigator.geolocation) {{
  watchId = navigator.geolocation.watchPosition(onPos, onErr, {{
    enableHighAccuracy: true, maximumAge: 2000, timeout: 15000,
  }});
}} else {{
  document.getElementById('err').textContent = 'Geolocation not supported on this browser.';
}}

// Prevent screen sleep via Wake Lock API if available
if ('wakeLock' in navigator) {{
  navigator.wakeLock.request('screen').catch(() => {{}});
}}
</script>
</body>
</html>"""
