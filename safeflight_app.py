import asyncio
import csv
import datetime as dt
import json
import math
import re
import subprocess
import threading
import time
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import ttk, messagebox

import requests
from bleak import BleakScanner
import folium
from folium.plugins import HeatMap

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

WATCH_OUIS = {
    "B4:1E:52": {"label": "B-cam", "color": "red"},
    "00:25:DF": {"label": "S-cam", "color": "blue"},
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


def rebuild_map(records, center=None):
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
            f"<b>Flag:</b> {r['flag_label'] if r['flagged'] else 'normal'}<br>"
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

    fg_heat.add_to(m)
    fg_paths.add_to(m)
    fg_flag.add_to(m)
    fg_wifi.add_to(m)
    fg_bt.add_to(m)
    folium.LayerControl(collapsed=False).add_to(m)
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

        self.webview_thread = None

        self.build_ui()
        self.load_settings()

    def build_ui(self):
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
            ("Show B-cam", self.v_show_b_cam), ("Show S-cam", self.v_show_s_cam),
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

    def refresh_map(self):
        self.save_settings()
        recs = self.filtered_records()
        rebuild_map(recs, center=self.map_center)

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

        def _run():
            try:
                webview.create_window("Live Map", OUT_MAP.resolve().as_uri(), width=1100, height=700)
                webview.start()
            except Exception:
                pass

        if self.webview_thread and self.webview_thread.is_alive():
            return
        self.webview_thread = threading.Thread(target=_run, daemon=True)
        self.webview_thread.start()

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

            for _ in range(SCAN_INTERVAL_SEC * 10):
                if not self.running:
                    break
                time.sleep(0.1)

        self.status_var.set("Stopped")


def main():
    root = tk.Tk()
    style = ttk.Style()
    if "vista" in style.theme_names():
        style.theme_use("vista")
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
