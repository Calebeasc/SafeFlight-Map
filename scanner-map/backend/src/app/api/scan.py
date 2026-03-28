"""
GET /scan/timeline     – Average RSSI per 5-minute bucket, last 6 hours
GET /scan/recent       – Devices seen in last N seconds
GET /scan/probes       – Probe requests captured from nearby devices
                         (what SSIDs those devices are looking for)
GET /scan/network      – LAN devices found via ARP/mDNS/SSDP/NetBIOS
GET /scan/cell         – Current LTE/5G signal info
GET /scan/port-check   – TCP port open/closed check (own network only)
GET /scan/banner       – TCP banner grab (own network only)
"""
import json
import socket
import time
from fastapi import APIRouter, Query
from app.db.database import get_db

router = APIRouter()

BUCKET_MS = 5 * 60 * 1000   # 5 minutes


@router.get("/recent")
def recent_devices(seconds: int = Query(60, le=3600)):
    """
    Devices seen in the last N seconds (default 60 s).
    Returns one row per unique target_key with latest RSSI, name, device_type.
    Works even if GPS is unavailable — lat/lon may be null.
    """
    since_ms = int(time.time() * 1000) - seconds * 1000
    conn = get_db()
    rows = conn.execute("""
        SELECT
            target_key,
            source,
            MAX(rssi)   AS rssi_max,
            COUNT(*)    AS hit_count,
            MAX(ts_ms)  AS last_seen_ms,
            meta_json
        FROM raw_observations
        WHERE ts_ms >= ?
        GROUP BY target_key
        ORDER BY last_seen_ms DESC
        LIMIT 200
    """, (since_ms,)).fetchall()

    devices = []
    for r in rows:
        meta = {}
        try:
            meta = json.loads(r["meta_json"] or '{}')
        except Exception:
            pass
        devices.append({
            "target_key":   r["target_key"],
            "source":       r["source"],
            "rssi_max":     r["rssi_max"],
            "hit_count":    r["hit_count"],
            "last_seen_ms": r["last_seen_ms"],
            "name":         meta.get("name") or meta.get("ssid") or "",
            "device_type":  meta.get("device_type") or "unknown",
            "label":        meta.get("oui_label") or meta.get("label") or "",
        })
    return {"devices": devices, "since_ms": since_ms}


@router.get("/timeline")
def signal_timeline():
    since_ms = int(time.time() * 1000) - 6 * 60 * 60 * 1000
    conn = get_db()
    rows = conn.execute("""
        SELECT
            (ts_ms / ?) * ?  AS bucket_ms,
            source,
            AVG(rssi)        AS avg_rssi,
            COUNT(*)         AS hits
        FROM raw_observations
        WHERE ts_ms >= ?
        GROUP BY bucket_ms, source
        ORDER BY bucket_ms
    """, (BUCKET_MS, BUCKET_MS, since_ms)).fetchall()

    return {
        "buckets": [
            {
                "ts_ms":    r["bucket_ms"],
                "source":   r["source"],
                "avg_rssi": round(r["avg_rssi"], 1),
                "hits":     r["hits"],
            }
            for r in rows
        ]
    }


@router.get("/probes")
def probe_requests():
    """
    Probe requests passively captured from nearby Wi-Fi client devices.
    Each entry shows which SSIDs (network names) a device has been searching for —
    powerful device fingerprint data captured with zero packet injection.
    Requires Scapy + Npcap to be installed; empty if not available.
    """
    try:
        from app.ingest.wifi_scanner import get_probe_requests
        probes = get_probe_requests()
        # Sort by most recently seen
        items = sorted(probes.items(), key=lambda kv: kv[1]['last_ts_ms'], reverse=True)
        return {
            "probes": [
                {
                    "mac":          addr,
                    "probed_ssids": info['ssids'],
                    "last_seen_ms": info['last_ts_ms'],
                    "avg_rssi":     round(info['avg_rssi'], 1),
                    "ssid_count":   len(info['ssids']),
                }
                for addr, info in items[:200]
            ]
        }
    except Exception:
        return {"probes": [], "error": "probe capture not active (install scapy + npcap)"}


@router.get("/network")
def network_devices():
    """
    LAN devices discovered via ARP sweep, mDNS/Bonjour, UPnP/SSDP, and NetBIOS.
    Returns device IP, MAC, name, manufacturer, model, and detected service types.
    """
    try:
        from app.ingest.network_discovery import get_discovered
        discovered = get_discovered()
        devices = []
        for ip, info in sorted(discovered.items()):
            if not info.get('mac'):
                continue
            devices.append({
                "ip":              ip,
                "mac":             info.get('mac'),
                "name":            info.get('friendlyName') or info.get('netbios_name') or ip,
                "manufacturer":    info.get('manufacturer'),
                "model":           info.get('modelName') or info.get('modelDescription'),
                "mdns_services":   info.get('mdns_services', []),
                "mdns_categories": info.get('mdns_categories', []),
                "upnp_types":      info.get('upnp_types', []),
                "netbios_name":    info.get('netbios_name'),
                "serial":          info.get('serialNumber'),
            })
        return {"devices": devices, "count": len(devices)}
    except Exception as e:
        return {"devices": [], "error": str(e)}


@router.get("/aggressive")
def aggressive_hits(limit: int = Query(100, le=500)):
    """
    Live feed of fleet/Axon device detections from the aggressive scanner.
    Returns: fleet WiFi APs, AVL nodes, Axon BLE hits, body camera probe detections.
    Empty when aggressive_mode is disabled.
    """
    try:
        from app.ingest.aggressive_scanner import get_fleet_summary
        return get_fleet_summary()
    except Exception as e:
        return {"error": str(e), "fleet_wifi_count": 0, "axon_ble_count": 0}


@router.post("/aggressive/toggle")
async def toggle_aggressive(data: dict):
    """Enable or disable aggressive scanning mode at runtime."""
    enabled = bool(data.get('enabled', False))
    interval = float(data.get('interval_s', 1.0))
    from app.api.settings_api import load, save
    from app.core.config import settings as cfg
    s = load()
    s['aggressive_mode'] = enabled
    s['aggressive_scan_interval_s'] = max(0.5, min(10.0, interval))
    save(s)
    cfg.AGGRESSIVE_MODE = enabled

    from app.ingest import aggressive_scanner
    from app.ingest.gps_relay import get_fix as gps_fn
    if enabled and not aggressive_scanner.is_running():
        aggressive_scanner.start(gps_fn=gps_fn, interval_s=interval)
    elif not enabled and aggressive_scanner.is_running():
        aggressive_scanner.stop()

    return {"aggressive_mode": enabled, "interval_s": interval}


@router.post("/interval")
async def set_scan_interval(data: dict):
    """Set the global scan frequency in seconds (1–30). Affects WiFi poll rate."""
    interval = float(data.get('interval_s', 3.0))
    interval = max(1.0, min(30.0, interval))
    from app.api.settings_api import load, save
    from app.core.config import settings as cfg
    s = load()
    s['scan_interval_s'] = interval
    s['wifi_scan_interval_s'] = interval
    save(s)
    cfg.WIFI_SCAN_INTERVAL_S = interval
    return {"scan_interval_s": interval}


@router.get("/cell")
def cell_signal():
    """
    Current LTE/5G cellular signal information.
    Includes RSSI, RSRP, RSRQ, SNR, data class, carrier, cell ID, and roaming state.
    Returns empty if no cellular adapter is present (Wi-Fi-only machine).
    """
    try:
        from app.ingest.cell_scanner import get_cell_info
        info = get_cell_info()
        return {"cell": info, "available": bool(info)}
    except Exception:
        return {"cell": {}, "available": False}


@router.get("/port-check")
def port_check(host: str = Query(...), port: int = Query(...)):
    """
    TCP port open/closed check. Only use on networks you own.
    Returns: { host, port, open, latency_ms }
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.0)
        t0 = time.time()
        result = s.connect_ex((host, port))
        latency_ms = round((time.time() - t0) * 1000, 1)
        s.close()
        return {"host": host, "port": port, "open": result == 0, "latency_ms": latency_ms}
    except Exception as e:
        return {"host": host, "port": port, "open": False, "error": str(e)}


@router.get("/banner")
def banner_grab(host: str = Query(...), port: int = Query(80)):
    """
    TCP banner grab — connects to host:port, sends a minimal HTTP HEAD or raw
    read, and returns whatever the service sends back. Only use on your own devices.
    Returns: { host, port, banner, protocol_hint }
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3.0)
        s.connect((host, port))
        # Send a minimal HTTP probe; many services (SMTP, FTP, SSH) reply immediately
        try:
            s.sendall(b"HEAD / HTTP/1.0\r\nHost: " + host.encode() + b"\r\n\r\n")
        except Exception:
            pass
        banner = b""
        try:
            while len(banner) < 2048:
                chunk = s.recv(512)
                if not chunk:
                    break
                banner += chunk
        except Exception:
            pass
        s.close()
        text = banner.decode("utf-8", errors="replace").strip()
        # Guess protocol from banner content
        hint = "unknown"
        if text.startswith("HTTP"):
            hint = "http"
        elif "SSH" in text[:20]:
            hint = "ssh"
        elif "220" in text[:10]:
            hint = "ftp_or_smtp"
        elif "* OK" in text[:20]:
            hint = "imap"
        return {"host": host, "port": port, "banner": text[:1024], "protocol_hint": hint}
    except Exception as e:
        return {"host": host, "port": port, "banner": "", "error": str(e)}
