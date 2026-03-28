# SafeFlight Map — User Guide

## What it does
Logs Wi-Fi and Bluetooth detections of **your own authorized devices** while you drive,
then displays the results as a **heat map** (not icon spam) on an interactive map.
Two special OUI categories are tracked:
- **Fun-Watcher** (OUI `00:25:DF`) — shown in **blue**
- **Fun-Stopper** (OUI `B4:1E:52`) — shown in **red**, with detection timestamps in popups

---

## Quick Start (Development)

### Prerequisites
- Python 3.11+
- Node.js 18+
- Windows 10 or 11

### 1. Clone / download the repo

```
git clone https://github.com/yourname/scanner-map
cd scanner-map
```

### 2. Set up Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend\requirements.txt
```

### 3. Build the frontend

```powershell
cd frontend
npm install
npm run build
cd ..
```

### 4. Start in dev mode (two terminals open automatically)

```powershell
.\scripts\dev.ps1
```

Then open **http://127.0.0.1:5173** in your browser.

---

## Building the Windows EXE

```powershell
.\scripts\build.ps1
```

Output: `dist\scanner-map.exe`

Copy to any Windows machine and double-click. No install required.

---

## Configuring Your Targets

1. Copy `targets.example.json` to `%USERPROFILE%\SafeFlightMap\targets.json`
2. Edit it — replace the example BSSIDs/addresses with your own devices
3. Save and restart the app

```json
{
  "wifi": [
    { "bssid": "AA:BB:CC:DD:EE:FF", "label": "My AP" }
  ],
  "ble": [
    { "address": "AA:BB:CC:DD:EE:FF", "label": "My Beacon" }
  ]
}
```

All other devices are **ignored**. Identifiers are **hashed** (HMAC-SHA256) before being written to disk — raw MACs/UUIDs are never stored.

---

## Using the App

| Control | What it does |
|---------|-------------|
| ▶ START SCANNING | Begin collecting detections (fake data in Milestone 1) |
| ⬛ STOP SCANNING | Stop and flush any open encounters to the database |
| Time range buttons | Filter the map to 15m / 1h / 6h / 24h of data |
| Encounter markers toggle | Show/hide the top encounter pins on the map |

### Map layers
- **Heat map** (always on) — aggregated intensity grid, 100m cells
- **Encounter markers** (optional) — top 5 Fun-Watcher + top 5 Fun-Stopper peaks only

### Exports
Click the export buttons in the sidebar:
- **RAW CSV** — every raw observation
- **ENC CSV** — aggregated encounters
- **GEOJSON** — encounters as GeoJSON (import into QGIS, Google Earth, etc.)

---

## Data & Privacy

- Only allowlisted targets are ever recorded
- Identifiers are hashed with HMAC-SHA256 before storage — raw MACs never hit the database
- The HMAC secret is auto-generated and stored at `%USERPROFILE%\SafeFlightMap\.hmac_secret`
- Database: `%USERPROFILE%\SafeFlightMap\sfm.db` (SQLite)

---

## GPS

Currently the app runs **without GPS** (Milestone 1 uses synthetic locations).

To add GPS in a future milestone, connect a USB GPS dongle and use a serial NMEA reader.
The backend's `ingest_observation()` function accepts `lat`, `lon`, `speed_mps`, and `heading` — just pass them in from your GPS feed.

---

## Milestones

| # | Status | Description |
|---|--------|-------------|
| 1 | ✅ **Done** | UI + fake data + heat map renders correctly |
| 2 | 🔲 Next | Real DB + allowlist + encounter aggregation |
| 3 | 🔲 | PyInstaller EXE that runs on fresh machine |
| 4 | 🔲 | Real Wi-Fi + Bluetooth scanning adapters |
| 5 | 🔲 | GPS integration |

---

## Troubleshooting

**Map tiles are black / blank**
- In the EXE, the app uses Edge Chromium via pywebview. Make sure WebView2 Runtime is installed on the target machine (it ships with Windows 11; for Windows 10 download from Microsoft).

**"Backend failed to start" dialog**
- Check Windows Defender / antivirus isn't blocking the exe
- Try running from a folder without spaces in the path

**No data on map**
- Click ▶ START SCANNING and wait ~5 seconds for the fake data to accumulate
- Check the time range filter isn't set too narrow
