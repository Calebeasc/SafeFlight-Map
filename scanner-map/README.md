# SafeFlight Map — Invincible.Inc

Real-time Wi-Fi + Bluetooth detection logger with an interactive heat map, tail detection, surge alerts, and hotspot tracking. Runs as a Windows desktop app.

Two special OUI categories are tracked:
- **Fun-Watcher** (`00:25:DF`) — shown in **blue**
- **Fun-Stopper** (`B4:1E:52`) — shown in **red**, with detection timestamps and alert toasts

---

## Branch strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable releases — only merged into from `dev` via PR |
| `dev`  | Active development — all feature branches merge here first |

Always branch off `dev` for new work, open a PR to `dev`, and promote `dev` → `main` for releases.

---

## Quick Start (Development)

### Prerequisites

- Python 3.11+
- Node.js 18+
- Windows 10 or 11
- Git

### 1. Clone the repo

```
git clone https://github.com/YOUR_ORG/safeflight
cd safeflight
git checkout dev
```

### 2. Set up Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend\requirements.txt
```

### 3. Configure your targets

```powershell
copy targets.example.json %USERPROFILE%\SafeFlightMap\targets.json
```

Edit `%USERPROFILE%\SafeFlightMap\targets.json` — replace the example BSSIDs/addresses with your own devices.

### 4. Configure GitHub repo (for auto-updates)

Edit `backend\src\app\core\config.py` and set:

```python
GITHUB_REPO: str = 'YOUR_ORG/safeflight'   # ← your actual repo
```

Or set the environment variable `GITHUB_REPO=YOUR_ORG/safeflight` before launching.

### 5. Launch

```
START_BACKEND.bat
```

This will:
1. Check for updates against the GitHub releases API
2. Build the React frontend
3. Start the Vite dev server (port 5173)
4. Start an ngrok tunnel (port 8742)
5. Start the FastAPI backend (port 8742)

Then open **http://127.0.0.1:5173** in your browser.

---

## Auto-Update System

On every launch via `START_BACKEND.bat`, the app checks `https://api.github.com/repos/<GITHUB_REPO>/releases/latest` and compares the release tag against the local `version.txt`.

- If a newer version is available: runs `git pull --ff-only`, updates `version.txt`, and the subsequent frontend build picks up any changes automatically.
- If offline or the repo is unconfigured: skips silently and starts normally.
- Update check never blocks startup — failures are always non-fatal.

The compiled desktop launcher (`backend/run.py`) also checks for updates on a 12-hour background timer and shows a Windows toast + tray menu entry when a new release is published.

---

## Building the Windows EXE

```powershell
.\scripts\build.ps1
```

Output: `dist\InvincibleInc.exe`

Copy to any Windows 10/11 machine and double-click. No install required. For a full installer (Inno Setup), run `Invincible Installer.bat`.

---

## Configuring Your Targets

1. Copy `targets.example.json` to `%USERPROFILE%\SafeFlightMap\targets.json`
2. Replace the example BSSIDs/addresses with your own devices

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

All other devices are ignored. Identifiers are **hashed** (HMAC-SHA256) before being written to disk — raw MACs/UUIDs are never stored.

---

## Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Replay** | Scrub back through historical scan sessions |
| 2 | **Tail Detection** | Alert after 3+ separate encounters with the same device |
| 3 | **Surge Alert** | Broadcast alert when 5+ unique Fun-Stoppers appear in one day |
| 4 | **Hotspot System** | Promote cells seen on 3+ distinct days in a 7-day window; proximity + ahead-of-heading alerts |

---

## Data & Privacy

- Only allowlisted targets are ever recorded
- Identifiers are hashed with HMAC-SHA256 before storage — raw MACs never hit the database
- HMAC secret: `%USERPROFILE%\SafeFlightMap\.hmac_secret` (auto-generated, excluded from git)
- Database: `%USERPROFILE%\SafeFlightMap\sfm.db` (excluded from git)

---

## Troubleshooting

**Map tiles blank / black**
WebView2 Runtime is required. It ships with Windows 11; for Windows 10 download from Microsoft.

**"Backend failed to start"**
Check that Windows Defender / antivirus isn't blocking the exe, and that the path contains no spaces.

**No data on map**
Click ▶ START SCANNING, wait ~5 s, and make sure the time range filter isn't too narrow.

**Update check fails with "git pull failed"**
The working tree may have local uncommitted changes. Stash or commit them before launching.
