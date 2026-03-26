# SafeFlight-Map

SafeFlight Maps is a local desktop app that scans nearby Wi-Fi/Bluetooth signals, logs observations, and renders them on a live Folium map.

## 1) Requirements

- Python 3.10+
- Windows is recommended for full functionality (`netsh` Wi-Fi scan + optional Windows location API)
- Optional features:
  - `winsdk` for higher-accuracy Windows location
  - `pywebview` for embedded map window

Install dependencies:

```bash
pip install requests bleak folium
```

Optional:

```bash
pip install winsdk pywebview
```

## 2) Run the app

From the project root:

```bash
python safeflight_app.py
```

## 3) Basic workflow

1. Click **Start** to begin scanning.
2. Watch rows appear in the table (latest at top).
3. Click **Update Map** to build `live_signal_map.html`.
4. Click **Open Browser Map** to view the latest map in your browser.
5. (Optional) click **Open Embedded Map** if `pywebview` is installed.

## 4) Data files created

The app writes output files in the same folder:

- `local_exact_log.csv` — detailed local log
- `local_exact_log.jsonl` — detailed local JSONL log
- `live_signal_map.html` — generated map
- `safe_share_queue.jsonl` — safe-share queue events
- `app_settings.json` — persisted UI/settings state
- `safeflight_observations.db` — SQLite database for raw observations + encounter summaries

### Database model (high level)

- `raw_observations`: high-rate truth data (timestamp ms, lat/lon, speed, heading, target, type, rssi, channel/misc, oui)
- `encounters`: burst-compressed windows per target with peak point and confidence

Mapping behavior:

- Raw observations are collected quickly and stored.
- Map markers are generated from **encounters** (compressed bursts), not one marker per raw hit.
- Heatmap is aggregated from **100m grid cells** for cleaner display at highway speed.

## 5) Sharing modes

In **Sharing** panel:

- **Local only**: logs only to local files.
- **Safe share**: writes anonymized grid events and attempts upload to your configured endpoint.

If upload fails, events are still queued locally in `safe_share_queue.jsonl`.

### Endpoint field (detailed)

The **Endpoint** should be the full HTTPS URL for your ingestion API route.

Examples:

- `https://api.yourdomain.com/safeflight/events`
- `https://example.org/v1/device-events`

Best practices:

1. Use **HTTPS** (not plain HTTP) for security.
2. Paste the **full path**, not just a domain.
3. Confirm your endpoint accepts JSON with the format:

```json
{
  "events": [
    {
      "timestamp_hour": "2026-03-26T18:00:00",
      "scan_type": "wifi|bluetooth",
      "device_kind": "wifi_ap|bluetooth_speaker_like|bluetooth_other",
      "category": "Fun-Stopper|Fun-Watcher|other",
      "oui_flagged_only": "B4:1E:52|00:25:DF|null",
      "strength_bucket": "strong|medium|weak|unknown",
      "grid_lat": 37.77,
      "grid_lon": -122.42,
      "count": 1
    }
  ]
}
```

4. If your backend expects a different schema, adapt backend parsing or app code accordingly.
5. If endpoint is blank, upload is skipped and data remains local/queued.

### Token field (detailed)

The **Token** is optional unless your API requires authentication.

How it is sent:

- If token is non-empty, app adds:
  - `Authorization: Bearer <your_token>`
- If token is empty, no Authorization header is sent.

Token examples:

- JWT (typical): `eyJhbGciOiJIUzI1NiIs...`
- Opaque API key: `sk_live_abc123...`

Important notes:

1. Enter only the raw token value (do **not** include `Bearer ` prefix manually).
2. Token is stored in `app_settings.json` for convenience; treat this file as sensitive.
3. For stronger security, use short-lived tokens and rotate regularly.
4. If you get 401/403 responses, verify:
   - token validity/expiry
   - correct environment (dev/staging/prod endpoint)
   - required scopes/permissions on your backend

### Quick Safe Share setup checklist

1. Select **Safe share** radio button.
2. Paste full **Endpoint** URL.
3. Paste **Token** (if required by server).
4. Start scanning.
5. Watch status text:
   - `safe upload OK: HTTP 2xx` means uploads are succeeding.
   - `safe queued, upload issue: ...` means local queueing continues and upload failed.
6. Inspect `safe_share_queue.jsonl` for queued events if troubleshooting.

## 6) Filters and map controls

- Use checkboxes to filter Wi-Fi/Bluetooth types, flagged OUIs, and signal buckets.
- Use **Time** (`all`, `1h`, `5m`) to filter recency.
- Use **Re-center** to center map around current location.
- Enable **Auto map update** if you want map refresh each scan cycle.
- The map now includes a **Signal Heatmap** layer (small/intensity-weighted by signal strength).
- Hover a marker to preview **name + device type + reported time**.
- Click a marker for a detailed report popup (ID/MAC, signal bucket, OUI, location source, and more).
- Device points are plotted as an **estimated signal origin** (using signal strength and movement direction heuristics).
- Moved devices render a **sequential path line** that connects first → second → third sightings in order.
- Sequential path tracing is restricted to **Fun-Stopper** detections only.
- OUI `00:25:DF` is shown in **blue** as **Fun-Watcher** and remains visible across time.
- OUI `B4:1E:52` is shown in **red** as **Fun-Stopper** and uses non-permanent detection markers with detection date in popup text.
- If Fun-Stopper detections cluster (3+ sightings within 500 ft), the map marks a hotspot area and the app alerts when you approach it.
- When a Fun-Stopper is detected, scan cadence increases to **0.5 seconds** for higher-resolution signal/location logging.
- The app asks for a username on first launch and remembers it for future sessions.
- Bottom-left footer shows current estimated movement speed in **MPH**.
- Browser/web map now also shows **MPH in the bottom-left overlay**.
- Embedded map launch uses a separate process to avoid GUI freezing from event-loop conflicts.
- Web map layer checkboxes now include **Fun-Stopper Only** and **Fun-Watcher Only** overlays.
- App has a **Map tracked-only** checkbox to restrict rendering to just Fun-Stopper/Fun-Watcher markers.
- A transient popup notification appears for new Fun-Stopper/Fun-Watcher detections and auto-dismisses after 8 seconds.
- Map filters apply consistently to markers, tracing lines, and heatmaps (unchecked categories are removed from all map layers).

## 7) Notes / troubleshooting

- If Bluetooth scanning fails, ensure Bluetooth is enabled and your adapter/permissions are available.
- If location is `unknown`, Windows location services may be off and/or IP geolocation failed.
- If no map opens, run one scan and click **Update Map** first.
