import asyncio
import csv
import datetime as dt
import json
import math
import re
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog

import requests
from bleak import BleakScanner
import folium
from folium.plugins import HeatMap
from folium import Element

# Optional precise Windows location
try:
    from winsdk.windows.devices.geolocation import Geolocator
    HAS_WINSDK = True
except Exception:
    HAS_WINSDK = False

# Optional embedded map window
try:
    import webview
    HAS_WEBVIEW = True
except Exception:
    HAS_WEBVIEW = False


# -----------------------------
# Config
# -----------------------------
SCAN_INTERVAL_SEC = 10
BT_TIMEOUT_SEC = 6
SHARE_GRID_DECIMALS = 2
FAST_SCAN_INTERVAL_SEC = 0.5
FEET_TO_M = 0.3048
STOPPER_HOTSPOT_RADIUS_M = 500 * FEET_TO_M
STOPPER_HOTSPOT_MIN_HITS = 3

WATCH_OUIS = {
    "B4:1E:52": {"label": "Fun-Stopper", "color": "red"},
    "00:25:DF": {"label": "Fun-Watcher", "color": "blue"},
}

OUT_CSV = Path("local_exact_log.csv")
OUT_JSONL = Path("local_exact_log.jsonl")
OUT_MAP = Path("live_signal_map.html")
SAFE_QUEUE_JSONL = Path("safe_share_queue.jsonl")
SETTINGS_FILE = Path("app_settings.json")

history_records = []
history_lock = threading.Lock()


def now_iso():
    return dt.datetime.now(dt.timezone.utc).astimezone().isoformat()


def parse_iso(ts):
    try:
        return dt.datetime.fromisoformat(ts)
    except Exception:
        return None


def normalize_mac_prefix(mac: str):
    if not mac:
        return None
    m = mac.upper().replace("-", ":")
    parts = m.split(":")
    if len(parts) < 3:
        return None
    return ":".join(parts[:3])


def classify_by_oui(mac: str):
    oui = normalize_mac_prefix(mac)
    if oui in WATCH_OUIS:
        cfg = WATCH_OUIS[oui]
        return True, cfg["label"], oui, cfg["color"]
    return False, None, oui, None


def classify_bt_kind(name: str):
    n = (name or "").lower()
    if any(k in n for k in ["speaker", "jbl", "bose", "sonos", "airpods", "headphone", "earbud"]):
        return "bluetooth_speaker_like"
    return "bluetooth_other"


def signal_bucket(scan_type, signal):
    if scan_type == "wifi":
        if signal is None:
            return "unknown"
        if signal >= 70:
            return "strong"
        if signal >= 40:
            return "medium"
        return "weak"

    if signal is None:
        return "unknown"
    if signal >= -60:
        return "strong"
    if signal >= -80:
        return "medium"
    return "weak"


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing_deg(lat1, lon1, lat2, lon2):
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    b = math.degrees(math.atan2(y, x))
    return (b + 360) % 360


def angle_diff_deg(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def destination_point(lat, lon, bearing_deg_value, distance_m):
    # Great-circle destination from start point, bearing, distance.
    R = 6371000.0
    brng = math.radians(bearing_deg_value % 360)
    p1 = math.radians(lat)
    l1 = math.radians(lon)
    ang = distance_m / R

    p2 = math.asin(math.sin(p1) * math.cos(ang) + math.cos(p1) * math.sin(ang) * math.cos(brng))
    l2 = l1 + math.atan2(
        math.sin(brng) * math.sin(ang) * math.cos(p1),
        math.cos(ang) - math.sin(p1) * math.sin(p2)
    )
    return math.degrees(p2), math.degrees(l2)


def estimate_distance_m(rec):
    # Very rough range model for visualization only.
    sig = rec.get("signal")
    if sig is None:
        return 35.0
    if rec.get("scan_type") == "wifi":
        # Map Wi-Fi quality % to approximate meters (stronger = closer).
        return max(4.0, min(120.0, 120.0 - (sig * 1.1)))
    # Bluetooth RSSI distance estimate via log-distance path loss.
    tx_power = -59.0
    n = 2.2
    return max(2.0, min(120.0, 10 ** ((tx_power - float(sig)) / (10.0 * n))))


def estimate_signal_origin(rec, prev_for_device):
    lat, lon = rec.get("lat"), rec.get("lon")
    if lat is None or lon is None:
        return None, None

    est_dist = estimate_distance_m(rec)
    if not prev_for_device:
        # Unknown bearing; default north-ish for stable single-point placement.
        b = 0.0
        return destination_point(lat, lon, b, est_dist), est_dist

    p_lat, p_lon = prev_for_device.get("lat"), prev_for_device.get("lon")
    p_sig = prev_for_device.get("signal")
    if p_lat is None or p_lon is None:
        b = 0.0
        return destination_point(lat, lon, b, est_dist), est_dist

    move_bearing = bearing_deg(p_lat, p_lon, lat, lon)
    if rec.get("signal") is None or p_sig is None:
        inferred_bearing = move_bearing
    elif rec["signal"] >= p_sig:
        # Signal improved while moving: device likely ahead.
        inferred_bearing = move_bearing
    else:
        # Signal weakened while moving: device likely behind us.
        inferred_bearing = (move_bearing + 180.0) % 360.0

    return destination_point(lat, lon, inferred_bearing, est_dist), est_dist


def compute_fun_stopper_hotspots(records):
    stoppers = [
        r for r in records
        if r.get("oui") == "B4:1E:52" and r.get("lat") is not None and r.get("lon") is not None
    ]
    clusters = []
    for r in stoppers:
        lat, lon = r["lat"], r["lon"]
        ts = parse_iso(r.get("timestamp", ""))
        added = False
        for c in clusters:
            d = haversine_m(lat, lon, c["lat"], c["lon"])
            if d <= STOPPER_HOTSPOT_RADIUS_M:
                c["count"] += 1
                c["lat"] = (c["lat"] * (c["count"] - 1) + lat) / c["count"]
                c["lon"] = (c["lon"] * (c["count"] - 1) + lon) / c["count"]
                if ts and (c["last_seen"] is None or ts > c["last_seen"]):
                    c["last_seen"] = ts
                added = True
                break
        if not added:
            clusters.append({
                "lat": lat,
                "lon": lon,
                "count": 1,
                "last_seen": ts,
            })

    return [c for c in clusters if c["count"] >= STOPPER_HOTSPOT_MIN_HITS]


def compute_fun_stopper_pinpoint(records):
    # Weighted centroid using inverse estimated distance.
    stopper_points = []
    for r in records:
        if r.get("oui") != "B4:1E:52":
            continue
        if r.get("lat") is None or r.get("lon") is None:
            continue
        dist = estimate_distance_m(r)
        w = 1.0 / max(1.0, dist)
        stopper_points.append((r["lat"], r["lon"], w))
    if not stopper_points:
        return None
    wsum = sum(w for _, _, w in stopper_points)
    lat = sum(lat * w for lat, _, w in stopper_points) / wsum
    lon = sum(lon * w for _, lon, w in stopper_points) / wsum
    return {"lat": lat, "lon": lon, "samples": len(stopper_points)}


# -----------------------------
# Location
# -----------------------------
async def get_windows_location_async():
    if not HAS_WINSDK:
        return None
    try:
        g = Geolocator()
        pos = await g.get_geoposition_async()
        p = pos.coordinate.point.position
        return {
            "source": "windows_location",
            "lat": p.latitude,
            "lon": p.longitude,
            "text": "Windows Location Services",
            "accuracy_m": getattr(pos.coordinate, "accuracy", None),
        }
    except Exception:
        return None


def get_ip_geolocation():
    try:
        r = requests.get("http://ip-api.com/json/", timeout=5)
        d = r.json()
        if d.get("status") == "success":
            return {
                "source": "ip-api",
                "lat": d.get("lat"),
                "lon": d.get("lon"),
                "text": ", ".join(x for x in [d.get("city"), d.get("regionName"), d.get("country")] if x),
                "accuracy_m": None,
            }
    except Exception:
        pass
    return None


def get_best_location():
    try:
        wl = asyncio.run(get_windows_location_async())
    except Exception:
        wl = None
    if wl and wl.get("lat") is not None:
        ip = get_ip_geolocation()
        if ip and ip.get("text"):
            wl["text"] = f"{wl['text']} (IP area: {ip['text']})"
        return wl
    ip = get_ip_geolocation()
    if ip:
        return ip
    return {"source": "unknown", "lat": None, "lon": None, "text": "unknown", "accuracy_m": None}


# -----------------------------
# Scanning
# -----------------------------
def parse_netsh_wifi():
    p = subprocess.run(
        ["netsh", "wlan", "show", "networks", "mode=bssid"],
        capture_output=True, text=True, encoding="utf-8", errors="ignore", check=False
    )
    out = p.stdout

    ssid_re = re.compile(r"^\s*SSID\s+\d+\s*:\s*(.*)$", re.IGNORECASE)
    bssid_re = re.compile(r"^\s*BSSID\s+\d+\s*:\s*(.*)$", re.IGNORECASE)
    signal_re = re.compile(r"^\s*Signal\s*:\s*(\d+)\s*%", re.IGNORECASE)
    channel_re = re.compile(r"^\s*Channel\s*:\s*(\d+)", re.IGNORECASE)

    rows = []
    cur_ssid = None
    cur_bssid = None
    cur_signal = None
    cur_channel = None

    def flush():
        nonlocal cur_bssid, cur_signal, cur_channel
        if cur_ssid and cur_bssid:
            flagged, label, oui, color = classify_by_oui(cur_bssid)
            rows.append({
                "scan_type": "wifi",
                "device_kind": "wifi_ap",
                "id": cur_bssid,
                "name": cur_ssid,
                "signal": cur_signal,
                "strength_bucket": signal_bucket("wifi", cur_signal),
                "misc": f"ch={cur_channel}" if cur_channel is not None else "",
                "oui": oui,
                "flagged": flagged,
                "flag_label": label,
                "marker_color": color,
            })
        cur_bssid = cur_signal = cur_channel = None

    for line in out.splitlines():
        m = ssid_re.match(line)
        if m:
            flush()
            cur_ssid = m.group(1).strip()
            continue
        m = bssid_re.match(line)
        if m:
            flush()
            cur_bssid = m.group(1).strip()
            continue
        m = signal_re.match(line)
        if m:
            cur_signal = int(m.group(1))
            continue
        m = channel_re.match(line)
        if m:
            cur_channel = int(m.group(1))
            continue
    flush()
    return rows


async def scan_bluetooth(timeout=BT_TIMEOUT_SEC):
    devs = await BleakScanner.discover(timeout=timeout)
    rows = []
    for d in devs:
        rssi = getattr(d, "rssi", None)
        if rssi is None and isinstance(getattr(d, "metadata", None), dict):
            rssi = d.metadata.get("rssi")
        flagged, label, oui, color = classify_by_oui(d.address)
        rows.append({
            "scan_type": "bluetooth",
            "device_kind": classify_bt_kind(d.name or ""),
            "id": d.address,
            "name": d.name or "",
            "signal": rssi,
            "strength_bucket": signal_bucket("bluetooth", rssi),
            "misc": "",
            "oui": oui,
            "flagged": flagged,
            "flag_label": label,
            "marker_color": color,
        })
    return rows


# -----------------------------
# Storage + Safe share
# -----------------------------
def ensure_local_header():
    if not OUT_CSV.exists():
        with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=[
                "timestamp", "scan_type", "device_kind", "id", "name", "signal", "strength_bucket",
                "misc", "oui", "flagged", "flag_label", "marker_color",
                "lat", "lon", "location_source", "location_text", "location_accuracy_m"
            ])
            w.writeheader()


def append_local_exact(records):
    ensure_local_header()
    with OUT_CSV.open("a", newline="", encoding="utf-8") as f_csv, OUT_JSONL.open("a", encoding="utf-8") as f_jsonl:
        w = csv.DictWriter(f_csv, fieldnames=[
            "timestamp", "scan_type", "device_kind", "id", "name", "signal", "strength_bucket",
            "misc", "oui", "flagged", "flag_label", "marker_color",
            "lat", "lon", "location_source", "location_text", "location_accuracy_m"
        ])
        for r in records:
            w.writerow(r)
            f_jsonl.write(json.dumps(r, ensure_ascii=False) + "\n")


def to_safe_event(rec):
    lat, lon = rec.get("lat"), rec.get("lon")
    return {
        "timestamp_hour": rec["timestamp"][:13] + ":00:00",
        "scan_type": rec["scan_type"],
        "device_kind": rec["device_kind"],
        "category": rec["flag_label"] if rec["flagged"] else "other",
        "oui_flagged_only": rec["oui"] if rec["flagged"] else None,
        "strength_bucket": rec["strength_bucket"],
        "grid_lat": round(lat, SHARE_GRID_DECIMALS) if lat is not None else None,
        "grid_lon": round(lon, SHARE_GRID_DECIMALS) if lon is not None else None,
        "count": 1
    }


def append_safe_queue(records):
    with SAFE_QUEUE_JSONL.open("a", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(to_safe_event(r), ensure_ascii=False) + "\n")


def upload_safe_batch(endpoint, token, records):
    if not endpoint:
        return False, "No endpoint configured"
    payload = {"events": [to_safe_event(r) for r in records]}
    headers = {"Content-Type": "application/json"}
    if token.strip():
        headers["Authorization"] = f"Bearer {token.strip()}"
    try:
        resp = requests.post(endpoint, json=payload, headers=headers, timeout=6)
        return 200 <= resp.status_code < 300, f"HTTP {resp.status_code}"
    except Exception as e:
        return False, str(e)


# -----------------------------
# Filters + map
# -----------------------------
def within_window(rec, window):
    if window == "all":
        return True
    t = parse_iso(rec.get("timestamp", ""))
    if not t:
        return False
    now = dt.datetime.now(dt.timezone.utc).astimezone()
    delta = now - t
    if window == "5m":
        return delta <= dt.timedelta(minutes=5)
    if window == "1h":
        return delta <= dt.timedelta(hours=1)
    return True


def apply_filters(rec, f):
    if not within_window(rec, f["time_window"]):
        return False
    if rec["scan_type"] == "wifi" and not f["show_wifi"]:
        return False
    if rec["scan_type"] == "bluetooth" and not f["show_bt"]:
        return False
    if rec["device_kind"] == "bluetooth_speaker_like" and not f["show_speakers"]:
        return False
    if rec["device_kind"] == "bluetooth_other" and not f["show_bt_other"]:
        return False
    if f["flagged_only"] and not rec["flagged"]:
        return False
    if not f["show_non_flagged"] and not rec["flagged"]:
        return False
    if rec.get("oui") == "B4:1E:52" and not f["show_b_cam"]:
        return False
    if rec.get("oui") == "00:25:DF" and not f["show_s_cam"]:
        return False
    if rec["strength_bucket"] == "strong" and not f["show_strong"]:
        return False
    if rec["strength_bucket"] == "medium" and not f["show_medium"]:
        return False
    if rec["strength_bucket"] == "weak" and not f["show_weak"]:
        return False
    if rec["strength_bucket"] == "unknown" and not f["show_unknown"]:
        return False
    return True


def rebuild_map(records, center=None, current_mph=None):
    pts = [r for r in records if r.get("lat") is not None and r.get("lon") is not None]
    if not pts:
        return
    if center is None:
        center = (pts[-1]["lat"], pts[-1]["lon"])

    m = folium.Map(location=[center[0], center[1]], zoom_start=15, tiles=None)
    folium.TileLayer("CartoDB Positron", name="Light").add_to(m)
    folium.TileLayer("CartoDB Dark_Matter", name="Dark").add_to(m)
    folium.TileLayer("OpenStreetMap", name="OSM").add_to(m)
    folium.TileLayer(
        tiles="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attr="Esri", name="Satellite", overlay=False, control=True
    ).add_to(m)

    fg_heat = folium.FeatureGroup(name="Signal Heatmap")
    fg_paths = folium.FeatureGroup(name="Device Movement Paths")
    fg_hotspots = folium.FeatureGroup(name="Fun-Stopper Hotspots")
    fg_pinpoint = folium.FeatureGroup(name="Fun-Stopper Pinpoint")
    fg_flag = folium.FeatureGroup(name="Flagged")
    fg_wifi = folium.FeatureGroup(name="Wi-Fi")
    fg_bt = folium.FeatureGroup(name="Bluetooth")
    heat_points = []
    device_prev = {}
    device_tracks = {}

    for r in pts:
        prev_for_device = device_prev.get(r["id"])
        est_point, est_dist = estimate_signal_origin(r, prev_for_device)
        if est_point is None:
            continue
        est_lat, est_lon = est_point
        device_prev[r["id"]] = r
        if r.get("oui") == "B4:1E:52":
            device_tracks.setdefault(r["id"], []).append((r["timestamp"], est_lat, est_lon))

        color = r["marker_color"] if r["flagged"] else ("orange" if r["scan_type"] == "wifi" else "green")
        radius = 8 if r["flagged"] else 4
        sig = f"{r['signal']}%" if r["scan_type"] == "wifi" and r["signal"] is not None else (
            f"{r['signal']} dBm" if r["scan_type"] == "bluetooth" and r["signal"] is not None else "N/A"
        )
        if r["scan_type"] == "wifi" and r["signal"] is not None:
            weight = max(0.05, min(1.0, r["signal"] / 100))
        elif r["scan_type"] == "bluetooth" and r["signal"] is not None:
            weight = max(0.05, min(1.0, (r["signal"] + 100) / 60))
        else:
            weight = 0.1
        heat_points.append([est_lat, est_lon, weight])

        hover_preview = (
            f"{r['name'] or '(unnamed)'} | {r['device_kind']} | {r['timestamp']}"
        )
        popup = (
            "<b>SafeFlight Device Report</b><br>"
            f"<b>Reported:</b> {r['timestamp']}<br>"
            f"<b>Scan Type:</b> {r['scan_type']}<br>"
            f"<b>Device Type:</b> {r['device_kind']}<br>"
            f"<b>Name:</b> {r['name'] or '(unnamed)'}<br>"
            f"<b>ID/MAC:</b> {r['id']}<br>"
            f"<b>Signal:</b> {sig}<br>"
            f"<b>Strength Bucket:</b> {r['strength_bucket']}<br>"
            f"<b>Flag:</b> "
            f"{('Fun-Stopper detected here ' + r['timestamp'][:10]) if r.get('oui') == 'B4:1E:52' else (r['flag_label'] if r['flagged'] else 'normal')}<br>"
            f"<b>OUI:</b> {r.get('oui') or 'unknown'}<br>"
            f"<b>Location Source:</b> {r.get('location_source') or 'unknown'}<br>"
            f"<b>Location Text:</b> {r.get('location_text') or 'unknown'}<br>"
            f"<b>Accuracy (m):</b> {r.get('location_accuracy_m') if r.get('location_accuracy_m') is not None else 'unknown'}<br>"
            f"<b>Estimated Range (m):</b> {round(est_dist, 1)}<br>"
            f"<b>Estimated Signal Origin:</b> {est_lat:.6f}, {est_lon:.6f}<br>"
            f"<b>Misc:</b> {r.get('misc') or '-'}"
        )
        mk = folium.CircleMarker(
            [est_lat, est_lon],
            radius=radius,
            color=color,
            fill=True,
            fill_opacity=0.75,
            tooltip=hover_preview,
            popup=folium.Popup(popup, max_width=420)
        )
        if r["flagged"]:
            mk.add_to(fg_flag)
        if r["scan_type"] == "wifi":
            mk.add_to(fg_wifi)
        else:
            mk.add_to(fg_bt)

    hotspots = compute_fun_stopper_hotspots(pts)
    for h in hotspots:
        last = h["last_seen"].isoformat() if h["last_seen"] else "unknown"
        folium.Circle(
            [h["lat"], h["lon"]],
            radius=STOPPER_HOTSPOT_RADIUS_M,
            color="red",
            fill=True,
            fill_opacity=0.12,
            tooltip="Fun-Stopper commonly detected in this area",
            popup=folium.Popup(
                f"<b>Flagged Area</b><br>Fun-Stopper commonly detected in this area.<br>"
                f"Detections: {h['count']}<br>Last seen: {last}",
                max_width=420
            )
        ).add_to(fg_hotspots)
        folium.Marker(
            [h["lat"], h["lon"]],
            icon=folium.Icon(color="red", icon="flag"),
            tooltip="⚑ Fun-Stopper hotspot"
        ).add_to(fg_hotspots)

    if heat_points:
        HeatMap(
            heat_points,
            name="Signal Heatmap",
            radius=14,
            blur=16,
            min_opacity=0.25,
            max_zoom=18
        ).add_to(fg_heat)

    for dev_id, seq in device_tracks.items():
        if len(seq) < 2:
            continue
        seq_sorted = sorted(seq, key=lambda t: parse_iso(t[0]) or dt.datetime.min.replace(tzinfo=dt.timezone.utc))
        coords = [(lat, lon) for _, lat, lon in seq_sorted]
        folium.PolyLine(
            coords,
            weight=2,
            color="#00c2ff",
            opacity=0.8,
            tooltip=f"Path: {dev_id}"
        ).add_to(fg_paths)

    pinpoint = compute_fun_stopper_pinpoint(pts)
    if pinpoint:
        folium.Marker(
            [pinpoint["lat"], pinpoint["lon"]],
            icon=folium.Icon(color="darkred", icon="crosshairs", prefix="fa"),
            tooltip="Estimated Fun-Stopper location"
        ).add_to(fg_pinpoint)
        folium.Circle(
            [pinpoint["lat"], pinpoint["lon"]],
            radius=40,
            color="darkred",
            fill=True,
            fill_opacity=0.12,
            popup=folium.Popup(
                f"<b>Estimated Fun-Stopper location</b><br>Samples: {pinpoint['samples']}",
                max_width=320
            )
        ).add_to(fg_pinpoint)

    fg_heat.add_to(m)
    fg_paths.add_to(m)
    fg_hotspots.add_to(m)
    fg_pinpoint.add_to(m)
    fg_flag.add_to(m)
    fg_wifi.add_to(m)
    fg_bt.add_to(m)
    folium.LayerControl(collapsed=False).add_to(m)
    mph_text = f"{current_mph:.1f} MPH" if current_mph is not None else "0.0 MPH"
    m.get_root().html.add_child(Element(
        f"""
        <div style="
            position: fixed;
            bottom: 12px;
            left: 12px;
            z-index: 9999;
            background: rgba(20,20,20,0.75);
            color: #fff;
            padding: 8px 10px;
            border-radius: 8px;
            font-size: 13px;
            font-family: Arial, sans-serif;
            box-shadow: 0 1px 6px rgba(0,0,0,0.25);
        ">Speed: {mph_text}</div>
        """
    ))
    m.save(str(OUT_MAP))


class App:
    def __init__(self, root):
        self.root = root
        self.root.title("SafeFlight Maps (Persistent + Embedded Map)")
        self.root.geometry("1330x810")

        self.running = False
        self.worker = None
        self.last_location = None
        self.last_alert_ts = 0
        self.map_center = None
        self.last_hotspot_alert_ts = 0
        self.user_name = tk.StringVar(value="")
        self.speed_var = tk.StringVar(value="Speed: 0.0 MPH")
        self.last_speed_point = None
        self.last_speed_ts = None

        self.status_var = tk.StringVar(value="Idle")
        self.location_var = tk.StringVar(value="Location: unknown")
        self.count_var = tk.StringVar(value="Total: 0 | Flagged: 0")

        # share controls
        self.share_mode = tk.StringVar(value="local_only")
        self.endpoint_var = tk.StringVar(value="")
        self.token_var = tk.StringVar(value="")

        # map behavior + alerts
        self.auto_map_update = tk.BooleanVar(value=False)
        self.heading_alerts = tk.BooleanVar(value=True)

        # filters
        self.v_show_wifi = tk.BooleanVar(value=True)
        self.v_show_bt = tk.BooleanVar(value=True)
        self.v_show_speakers = tk.BooleanVar(value=True)
        self.v_show_bt_other = tk.BooleanVar(value=True)
        self.v_flagged_only = tk.BooleanVar(value=False)
        self.v_show_non_flagged = tk.BooleanVar(value=True)
        self.v_show_b_cam = tk.BooleanVar(value=True)
        self.v_show_s_cam = tk.BooleanVar(value=True)
        self.v_show_strong = tk.BooleanVar(value=True)
        self.v_show_medium = tk.BooleanVar(value=True)
        self.v_show_weak = tk.BooleanVar(value=True)
        self.v_show_unknown = tk.BooleanVar(value=True)
        self.time_window = tk.StringVar(value="all")

        self.build_ui()
        self.load_settings()
        self.ensure_user_name()
        self.load_history_from_disk()

    def build_ui(self):
        self.root.configure(bg="#eef2f7")
        top = ttk.Frame(self.root, padding=8)
        top.pack(fill="x")
        ttk.Button(top, text="Start", command=self.start).pack(side="left", padx=4)
        ttk.Button(top, text="Stop", command=self.stop).pack(side="left", padx=4)
        ttk.Button(top, text="Open Browser Map", command=self.open_map_browser).pack(side="left", padx=4)
        ttk.Button(top, text="Open Embedded Map", command=self.open_map_embedded).pack(side="left", padx=4)
        ttk.Button(top, text="Update Map", command=self.refresh_map).pack(side="left", padx=4)
        ttk.Button(top, text="Re-center", command=self.recenter_map).pack(side="left", padx=4)

        ttk.Checkbutton(top, text="Auto map update", variable=self.auto_map_update, command=self.save_settings).pack(side="left", padx=10)
        ttk.Checkbutton(top, text="Heading alerts", variable=self.heading_alerts, command=self.save_settings).pack(side="left", padx=10)

        ttk.Label(top, text="Time").pack(side="left", padx=(16, 4))
        tw = ttk.Combobox(top, textvariable=self.time_window, values=["all", "1h", "5m"], width=8, state="readonly")
        tw.pack(side="left")
        tw.bind("<<ComboboxSelected>>", lambda e: (self.save_settings(), self.refresh_map()))

        ttk.Label(top, textvariable=self.status_var).pack(side="right")

        share = ttk.LabelFrame(self.root, text="Sharing", padding=8)
        share.pack(fill="x", padx=8, pady=6)
        ttk.Radiobutton(share, text="Local only", variable=self.share_mode, value="local_only", command=self.save_settings).grid(row=0, column=0, sticky="w")
        ttk.Radiobutton(share, text="Safe share", variable=self.share_mode, value="safe_share", command=self.save_settings).grid(row=0, column=1, sticky="w")
        ttk.Label(share, text="Endpoint").grid(row=1, column=0, sticky="e")
        e1 = ttk.Entry(share, textvariable=self.endpoint_var, width=60)
        e1.grid(row=1, column=1, sticky="w", padx=8)
        ttk.Label(share, text="Token").grid(row=2, column=0, sticky="e")
        e2 = ttk.Entry(share, textvariable=self.token_var, width=60, show="*")
        e2.grid(row=2, column=1, sticky="w", padx=8)
        e1.bind("<FocusOut>", lambda e: self.save_settings())
        e2.bind("<FocusOut>", lambda e: self.save_settings())

        flt = ttk.LabelFrame(self.root, text="Filters", padding=8)
        flt.pack(fill="x", padx=8, pady=6)
        checks = [
            ("Wi-Fi", self.v_show_wifi), ("Bluetooth", self.v_show_bt),
            ("BT speaker-like", self.v_show_speakers), ("BT other", self.v_show_bt_other),
            ("Flagged only", self.v_flagged_only), ("Show non-flagged", self.v_show_non_flagged),
            ("Show Fun-Stopper", self.v_show_b_cam), ("Show Fun-Watcher", self.v_show_s_cam),
            ("Strong", self.v_show_strong), ("Medium", self.v_show_medium),
            ("Weak", self.v_show_weak), ("Unknown", self.v_show_unknown)
        ]
        for i, (label, var) in enumerate(checks):
            ttk.Checkbutton(
                flt,
                text=label,
                variable=var,
                command=lambda: (self.save_settings(), self.refresh_map())
            ).grid(row=i // 4, column=i % 4, sticky="w", padx=10, pady=4)

        ttk.Label(self.root, textvariable=self.location_var, padding=8).pack(anchor="w")
        ttk.Label(self.root, textvariable=self.count_var, padding=8).pack(anchor="w")
        footer = ttk.Frame(self.root, padding=4)
        footer.pack(fill="x")
        ttk.Label(footer, textvariable=self.speed_var).pack(side="left")
        ttk.Label(footer, textvariable=self.user_name).pack(side="right")

        cols = ("timestamp", "type", "kind", "name", "id", "signal", "bucket", "label")
        self.tree = ttk.Treeview(self.root, columns=cols, show="headings", height=30)
        for c in cols:
            self.tree.heading(c, text=c)
            self.tree.column(c, width=145 if c != "name" else 220)
        self.tree.pack(fill="both", expand=True, padx=8, pady=8)

        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def save_settings(self):
        data = {
            "share_mode": self.share_mode.get(),
            "endpoint": self.endpoint_var.get(),
            "token": self.token_var.get(),
            "user_name": self.user_name.get().replace("User: ", "", 1).strip(),
            "auto_map_update": self.auto_map_update.get(),
            "heading_alerts": self.heading_alerts.get(),
            "time_window": self.time_window.get(),

            "show_wifi": self.v_show_wifi.get(),
            "show_bt": self.v_show_bt.get(),
            "show_speakers": self.v_show_speakers.get(),
            "show_bt_other": self.v_show_bt_other.get(),
            "flagged_only": self.v_flagged_only.get(),
            "show_non_flagged": self.v_show_non_flagged.get(),
            "show_b_cam": self.v_show_b_cam.get(),
            "show_s_cam": self.v_show_s_cam.get(),
            "show_strong": self.v_show_strong.get(),
            "show_medium": self.v_show_medium.get(),
            "show_weak": self.v_show_weak.get(),
            "show_unknown": self.v_show_unknown.get(),
        }
        SETTINGS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def load_settings(self):
        if not SETTINGS_FILE.exists():
            return
        try:
            d = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            self.share_mode.set(d.get("share_mode", "local_only"))
            self.endpoint_var.set(d.get("endpoint", ""))
            self.token_var.set(d.get("token", ""))
            self.user_name.set(d.get("user_name", ""))
            self.auto_map_update.set(d.get("auto_map_update", False))
            self.heading_alerts.set(d.get("heading_alerts", True))
            self.time_window.set(d.get("time_window", "all"))

            self.v_show_wifi.set(d.get("show_wifi", True))
            self.v_show_bt.set(d.get("show_bt", True))
            self.v_show_speakers.set(d.get("show_speakers", True))
            self.v_show_bt_other.set(d.get("show_bt_other", True))
            self.v_flagged_only.set(d.get("flagged_only", False))
            self.v_show_non_flagged.set(d.get("show_non_flagged", True))
            self.v_show_b_cam.set(d.get("show_b_cam", True))
            self.v_show_s_cam.set(d.get("show_s_cam", True))
            self.v_show_strong.set(d.get("show_strong", True))
            self.v_show_medium.set(d.get("show_medium", True))
            self.v_show_weak.set(d.get("show_weak", True))
            self.v_show_unknown.set(d.get("show_unknown", True))
        except Exception:
            pass

    def filters(self):
        return {
            "show_wifi": self.v_show_wifi.get(),
            "show_bt": self.v_show_bt.get(),
            "show_speakers": self.v_show_speakers.get(),
            "show_bt_other": self.v_show_bt_other.get(),
            "flagged_only": self.v_flagged_only.get(),
            "show_non_flagged": self.v_show_non_flagged.get(),
            "show_b_cam": self.v_show_b_cam.get(),
            "show_s_cam": self.v_show_s_cam.get(),
            "show_strong": self.v_show_strong.get(),
            "show_medium": self.v_show_medium.get(),
            "show_weak": self.v_show_weak.get(),
            "show_unknown": self.v_show_unknown.get(),
            "time_window": self.time_window.get(),
        }

    def filtered_records(self):
        with history_lock:
            return [r for r in history_records if apply_filters(r, self.filters())]

    def map_records(self):
        # Keep Fun-Watcher marks persistent across time filters.
        with history_lock:
            persistent_watchers = [r for r in history_records if r.get("oui") == "00:25:DF"]
        base = self.filtered_records()
        seen = {(r.get("id"), r.get("timestamp")) for r in base}
        for r in persistent_watchers:
            key = (r.get("id"), r.get("timestamp"))
            if key not in seen:
                base.append(r)
                seen.add(key)
        return base

    def refresh_map(self):
        self.save_settings()
        recs = self.map_records()
        mph = None
        try:
            mph = float(self.speed_var.get().replace("Speed:", "").replace("MPH", "").strip())
        except Exception:
            mph = None
        rebuild_map(recs, center=self.map_center, current_mph=mph)

    def load_history_from_disk(self):
        if not OUT_JSONL.exists():
            return
        loaded = []
        try:
            with OUT_JSONL.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        r = json.loads(line)
                    except Exception:
                        continue
                    if r.get("lat") is not None and r.get("lon") is not None:
                        loaded.append(r)
        except Exception:
            return
        if loaded:
            with history_lock:
                history_records.extend(loaded)

    def ensure_user_name(self):
        existing = self.user_name.get().replace("User: ", "", 1).strip()
        if existing:
            self.user_name.set(f"User: {existing}")
            return
        entered = simpledialog.askstring("Welcome to SafeFlight", "Enter your username:")
        entered = (entered or "").strip()
        if not entered:
            entered = "Pilot"
        self.user_name.set(f"User: {entered}")
        self.save_settings()

    def update_speed(self, cur_loc):
        if cur_loc.get("lat") is None or cur_loc.get("lon") is None:
            self.speed_var.set("Speed: 0.0 MPH")
            return
        now = time.time()
        if self.last_speed_point is None or self.last_speed_ts is None:
            self.last_speed_point = (cur_loc["lat"], cur_loc["lon"])
            self.last_speed_ts = now
            self.speed_var.set("Speed: 0.0 MPH")
            return
        dt_sec = max(0.001, now - self.last_speed_ts)
        meters = haversine_m(self.last_speed_point[0], self.last_speed_point[1], cur_loc["lat"], cur_loc["lon"])
        mps = meters / dt_sec
        mph = mps * 2.2369362921
        self.speed_var.set(f"Speed: {mph:.1f} MPH")
        self.last_speed_point = (cur_loc["lat"], cur_loc["lon"])
        self.last_speed_ts = now

    def recenter_map(self):
        if self.last_location and self.last_location.get("lat") is not None:
            self.map_center = (self.last_location["lat"], self.last_location["lon"])
            self.refresh_map()
            self.status_var.set("Map re-centered to current location.")

    def open_map_browser(self):
        if not OUT_MAP.exists():
            messagebox.showinfo("Map", "No map yet. Click Update Map after scanning.")
            return
        webbrowser.open(OUT_MAP.resolve().as_uri())

    def open_map_embedded(self):
        if not HAS_WEBVIEW:
            messagebox.showwarning("Embedded Map", "pywebview not installed. Using browser map instead.")
            self.open_map_browser()
            return
        if not OUT_MAP.exists():
            messagebox.showinfo("Map", "No map yet. Click Update Map after scanning.")
            return

        map_url = OUT_MAP.resolve().as_uri() + f"?t={int(time.time())}"
        # Run pywebview in a separate process to avoid Tk/webview event-loop deadlocks.
        launcher = (
            "import webview; "
            f"webview.create_window('Live Map', '{map_url}', width=1100, height=700); "
            "webview.start()"
        )
        try:
            subprocess.Popen([sys.executable, "-c", launcher])
            self.status_var.set("Embedded map opened in separate window.")
        except Exception:
            self.open_map_browser()

    def start(self):
        if self.running:
            return
        self.running = True
        self.status_var.set("Running...")
        self.worker = threading.Thread(target=self.loop, daemon=True)
        self.worker.start()

    def stop(self):
        self.running = False
        self.status_var.set("Stopping...")

    def on_close(self):
        self.running = False
        self.save_settings()
        self.root.after(250, self.root.destroy)

    def update_counts(self):
        with history_lock:
            total = len(history_records)
            flagged = sum(1 for r in history_records if r["flagged"])
        self.count_var.set(f"Total: {total} | Flagged: {flagged}")

    def add_rows(self, batch):
        f = self.filters()
        for r in batch:
            if not apply_filters(r, f):
                continue
            sig = f"{r['signal']}%" if r["scan_type"] == "wifi" and r["signal"] is not None else (
                f"{r['signal']} dBm" if r["scan_type"] == "bluetooth" and r["signal"] is not None else "N/A"
            )
            self.tree.insert("", 0, values=(
                r["timestamp"], r["scan_type"], r["device_kind"], r["name"], r["id"],
                sig, r["strength_bucket"], (r["flag_label"] if r["flagged"] else "normal")
            ))
        kids = self.tree.get_children()
        if len(kids) > 1500:
            for iid in kids[1500:]:
                self.tree.delete(iid)

    def nearest_flagged(self, lat, lon):
        with history_lock:
            flagged = [r for r in history_records if r["flagged"] and r.get("lat") is not None and r.get("lon") is not None]
        if not flagged:
            return None
        best = min(flagged, key=lambda x: haversine_m(lat, lon, x["lat"], x["lon"]))
        d = haversine_m(lat, lon, best["lat"], best["lon"])
        return best, d

    def maybe_heading_alert(self, prev_loc, cur_loc):
        if not self.heading_alerts.get():
            return
        if not prev_loc or prev_loc.get("lat") is None or cur_loc.get("lat") is None:
            return

        move_d = haversine_m(prev_loc["lat"], prev_loc["lon"], cur_loc["lat"], cur_loc["lon"])
        if move_d < 10:
            return

        nearest = self.nearest_flagged(cur_loc["lat"], cur_loc["lon"])
        if not nearest:
            return
        target, dist = nearest
        if dist > 800:
            return

        move_b = bearing_deg(prev_loc["lat"], prev_loc["lon"], cur_loc["lat"], cur_loc["lon"])
        targ_b = bearing_deg(cur_loc["lat"], cur_loc["lon"], target["lat"], target["lon"])
        diff = angle_diff_deg(move_b, targ_b)

        now = time.time()
        if diff <= 35 and (now - self.last_alert_ts) > 60:
            self.last_alert_ts = now
            label = target["flag_label"] or "flagged"
            self.status_var.set(f"ALERT: Heading toward nearby {label} (~{int(dist)}m)")
            print("\a")

        with history_lock:
            hotspots = compute_fun_stopper_hotspots(history_records)
        if not hotspots:
            return
        nearest_hotspot = min(
            hotspots,
            key=lambda h: haversine_m(cur_loc["lat"], cur_loc["lon"], h["lat"], h["lon"])
        )
        hd = haversine_m(cur_loc["lat"], cur_loc["lon"], nearest_hotspot["lat"], nearest_hotspot["lon"])
        if hd > 900:
            return
        hb = bearing_deg(cur_loc["lat"], cur_loc["lon"], nearest_hotspot["lat"], nearest_hotspot["lon"])
        hdiff = angle_diff_deg(move_b, hb)
        if hdiff <= 40 and (now - self.last_hotspot_alert_ts) > 75:
            self.last_hotspot_alert_ts = now
            self.status_var.set("ALERT: Approaching flagged area - Fun-Stopper commonly detected nearby")
            print("\a")

    def loop(self):
        while self.running:
            try:
                self.status_var.set("Scanning...")
                prev = self.last_location
                loc = get_best_location()
                self.last_location = loc

                self.location_var.set(
                    f"Location src={loc['source']} | lat={loc['lat']} lon={loc['lon']} | {loc.get('text') or ''}"
                )
                self.root.after(0, lambda l=loc: self.update_speed(l))

                wifi = parse_netsh_wifi()
                bt = asyncio.run(scan_bluetooth(BT_TIMEOUT_SEC))
                raw = wifi + bt
                ts = now_iso()

                batch = []
                for r in raw:
                    rr = dict(r)
                    rr["timestamp"] = ts
                    rr["lat"] = loc.get("lat")
                    rr["lon"] = loc.get("lon")
                    rr["location_source"] = loc.get("source")
                    rr["location_text"] = loc.get("text")
                    rr["location_accuracy_m"] = loc.get("accuracy_m")
                    batch.append(rr)

                append_local_exact(batch)
                with history_lock:
                    history_records.extend(batch)

                if self.share_mode.get() == "safe_share":
                    append_safe_queue(batch)
                    ok, msg = upload_safe_batch(self.endpoint_var.get().strip(), self.token_var.get(), batch)
                    if ok:
                        self.status_var.set(f"Running (safe upload OK: {msg})")
                    else:
                        self.status_var.set(f"Running (safe queued, upload issue: {msg})")

                self.maybe_heading_alert(prev, loc)

                if self.auto_map_update.get():
                    self.root.after(0, self.refresh_map)

                self.root.after(0, lambda b=batch: self.add_rows(b))
                self.root.after(0, self.update_counts)

            except Exception as e:
                self.status_var.set(f"Error: {e}")

            has_stopper = any(r.get("oui") == "B4:1E:52" for r in batch) if "batch" in locals() else False
            wait_sec = FAST_SCAN_INTERVAL_SEC if has_stopper else SCAN_INTERVAL_SEC
            for _ in range(int(wait_sec * 10)):
                if not self.running:
                    break
                time.sleep(0.1)

        self.status_var.set("Stopped")


def main():
    root = tk.Tk()
    style = ttk.Style()
    if "vista" in style.theme_names():
        style.theme_use("vista")
    elif "clam" in style.theme_names():
        style.theme_use("clam")
    style.configure("TButton", padding=6)
    style.configure("TLabel", padding=2)
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
