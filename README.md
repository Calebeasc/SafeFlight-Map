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

## 5) Sharing modes

In **Sharing** panel:

- **Local only**: logs only to local files.
- **Safe share**: writes anonymized grid events and attempts upload to your configured endpoint.

If upload fails, events are still queued locally in `safe_share_queue.jsonl`.

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

## 7) Notes / troubleshooting

- If Bluetooth scanning fails, ensure Bluetooth is enabled and your adapter/permissions are available.
- If location is `unknown`, Windows location services may be off and/or IP geolocation failed.
- If no map opens, run one scan and click **Update Map** first.
