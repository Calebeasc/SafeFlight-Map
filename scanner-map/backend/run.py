"""
Invincible.Inc – Windows desktop launcher.

PyInstaller bundles this as the entry point. It:
  1. Enforces single instance via a Windows named mutex
  2. Starts FastAPI/uvicorn on localhost:8742 in a background thread
  3. Opens a pywebview window (native frame, no browser chrome)
  4. Runs a system-tray icon so the app survives window close
  5. Polls /encounters and shows Windows toast alerts for new Fun-Stoppers
  6. Supports toggling launch-on-Windows-boot from the tray menu
  7. Logs startup/errors to ~/SafeFlightMap/launcher.log

Build:
  cd backend
  pyinstaller invincible.spec --clean --noconfirm
"""
import sys
import os
import threading
import time
import webbrowser
import logging
import urllib.request
import json

# ── Logging (must happen before any import that might fail) ──────────────────

LOG_DIR = os.path.join(os.path.expanduser('~'), 'SafeFlightMap')
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    filename=os.path.join(LOG_DIR, 'launcher.log'),
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger('launcher')
log.info('─' * 50)
log.info('Invincible.Inc launcher starting — Python %s', sys.version.split()[0])

# ── Bundled src path ─────────────────────────────────────────────────────────

if getattr(sys, 'frozen', False):
    bundle_dir = sys._MEIPASS
else:
    bundle_dir = os.path.dirname(os.path.abspath(__file__))

src_path = os.path.join(bundle_dir, 'src')
if src_path not in sys.path:
    sys.path.insert(0, src_path)

PORT         = 8742
URL          = f'http://127.0.0.1:{PORT}'
APP_NAME     = 'DevInvincibleInc'
EXE_PATH     = sys.executable
APP_VERSION  = '1.0.0'                          # bump this with each release
GITHUB_REPO  = 'YourUsername/scanner-map'       # ← set to your actual GitHub repo

_update_available: str | None = None  # filled in by _check_for_update if newer tag found

# ── Update checker ───────────────────────────────────────────────────────────

def _parse_version(v: str) -> tuple:
    try:
        return tuple(int(x) for x in v.lstrip('v').split('.'))
    except Exception:
        return (0,)


def _check_for_update(notify_fn, *, repeat_hours: int = 12):
    """
    Background thread: checks GitHub Releases for a newer version.
    Waits 30 s after startup, then re-checks every repeat_hours.
    Fires notify_fn once per discovered update; tray menu stays updated.
    """
    global _update_available
    api_url      = f'https://api.github.com/repos/{GITHUB_REPO}/releases/latest'

    time.sleep(30)  # let server fully start before hitting the network

    while True:
        try:
            req = urllib.request.Request(
                api_url, headers={'User-Agent': APP_NAME}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            latest = data.get('tag_name', '').lstrip('v')
            if latest and _parse_version(latest) > _parse_version(APP_VERSION):
                if _update_available != latest:      # only notify once per version
                    _update_available = latest
                    notify_fn(
                        f'⬆ Update available — v{latest}',
                        'Open the tray menu and click "Update available" to download.',
                    )
                    log.info('update available: v%s (running v%s)', latest, APP_VERSION)
            else:
                _update_available = None
                log.info('up to date (v%s)', APP_VERSION)
        except Exception as e:
            log.debug('update check failed: %s', e)

        time.sleep(repeat_hours * 3600)


# ── Single-instance lock ─────────────────────────────────────────────────────

def _ensure_single_instance():
    """
    Create a named Windows mutex. If it already exists, another instance is
    running — try to bring that window to the foreground, then exit cleanly.
    Returns the mutex handle (must stay alive for the process lifetime).
    """
    if sys.platform != 'win32':
        return None
    import ctypes
    kernel32 = ctypes.windll.kernel32
    mutex = kernel32.CreateMutexW(None, False, f'Global\\{APP_NAME}SingleInstance')
    if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        log.info('Another instance is already running — focusing its window.')
        hwnd = ctypes.windll.user32.FindWindowW(None, 'Invincible.Inc')
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 9)        # SW_RESTORE
            ctypes.windll.user32.SetForegroundWindow(hwnd)
        sys.exit(0)
    return mutex

# ── Auto-start (Windows registry) ───────────────────────────────────────────

_AUTOSTART_KEY = r'Software\Microsoft\Windows\CurrentVersion\Run'
_AUTOSTART_VAL = APP_NAME


def is_autostart_enabled() -> bool:
    if sys.platform != 'win32':
        return False
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _AUTOSTART_KEY) as k:
            winreg.QueryValueEx(k, _AUTOSTART_VAL)
            return True
    except FileNotFoundError:
        return False
    except Exception as e:
        log.warning('autostart check failed: %s', e)
        return False


def set_autostart(enable: bool):
    if sys.platform != 'win32':
        return
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _AUTOSTART_KEY, 0, winreg.KEY_SET_VALUE) as k:
            if enable:
                winreg.SetValueEx(k, _AUTOSTART_VAL, 0, winreg.REG_SZ, f'"{EXE_PATH}"')
                log.info('autostart enabled')
            else:
                try:
                    winreg.DeleteValue(k, _AUTOSTART_VAL)
                except FileNotFoundError:
                    pass
                log.info('autostart disabled')
    except Exception as e:
        log.warning('autostart set failed: %s', e)

# ── Backend server ───────────────────────────────────────────────────────────

def _start_server():
    try:
        import uvicorn
        from app.main import app  # triggers init_db via @app.on_event('startup')
        log.info('uvicorn starting on %s', URL)
        uvicorn.run(app, host='127.0.0.1', port=PORT, log_level='warning')
    except Exception:
        log.exception('uvicorn crashed')


def _wait_for_server(timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f'{URL}/health', timeout=1)
            log.info('server ready')
            return True
        except Exception:
            time.sleep(0.25)
    log.error('server did not become ready within %.0fs', timeout)
    return False

# ── Tray icon image (generated with Pillow — no external asset needed) ───────

def _make_icon() -> 'PIL.Image.Image':
    from PIL import Image, ImageDraw

    size = 64
    img  = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Dark background circle
    draw.ellipse([1, 1, size - 2, size - 2], fill=(11, 15, 20, 255))

    # Cyan outer ring
    draw.ellipse([1, 1, size - 2, size - 2], outline=(0, 212, 255, 255), width=3)

    # Inner radar arcs (smaller concentric rings, dimmer)
    for r, alpha in [(20, 120), (30, 70)]:
        c = size // 2
        draw.ellipse([c - r, c - r, c + r, c + r], outline=(0, 212, 255, alpha), width=1)

    # Cross-hair dot in centre
    c = size // 2
    draw.ellipse([c - 3, c - 3, c + 3, c + 3], fill=(0, 230, 118, 255))  # green dot

    return img

# ── Fun-Stopper alert polling ────────────────────────────────────────────────

def _alert_poll_loop(notify_fn):
    """
    Poll /encounters every 6 s.  When a Fun-Stopper appears whose peak_ts_ms
    is newer than our last seen timestamp, call notify_fn(title, message).
    """
    last_ts = int(time.time() * 1000)  # only alert on encounters from now on
    log.info('alert poller started (last_ts=%d)', last_ts)

    while True:
        time.sleep(6)
        try:
            with urllib.request.urlopen(f'{URL}/encounters?limit=20', timeout=3) as resp:
                data = json.loads(resp.read())
            encounters = data if isinstance(data, list) else data.get('encounters', [])
            for enc in encounters:
                if enc.get('label') == 'Fun-Stopper' and enc.get('peak_ts_ms', 0) > last_ts:
                    last_ts = enc['peak_ts_ms']
                    rssi    = enc.get('rssi_max', 0)
                    hits    = enc.get('hit_count', 1)
                    notify_fn(
                        '🚔 Fun-Stopper Detected',
                        f'{rssi:.0f} dBm · {hits} hits — check the map',
                    )
                    log.info('stopper alert fired (rssi=%s hits=%s)', rssi, hits)
        except Exception:
            pass  # server may not be fully up yet; silent retry

# ── System tray ──────────────────────────────────────────────────────────────

def _run_tray(stop_event: threading.Event):
    """Build and run the system-tray icon (blocking until stop_event is set)."""
    try:
        import pystray
    except ImportError:
        log.warning('pystray not available — no system tray')
        stop_event.wait()
        return

    icon_img = _make_icon()

    # ── tray callbacks ──
    def open_map(icon, item):
        webbrowser.open(URL)

    def open_releases(icon, item):
        webbrowser.open(f'https://github.com/{GITHUB_REPO}/releases/latest')

    def toggle_autostart(icon, item):
        enable = not is_autostart_enabled()
        set_autostart(enable)
        icon.update_menu()

    def quit_app(icon, item):
        log.info('quit requested from tray')
        stop_event.set()
        icon.stop()

    def _autostart_label(item):
        return '✓ Launch on Windows boot' if is_autostart_enabled() else '  Launch on Windows boot'

    def _update_label(item):
        return (f'⬆ Update available — v{_update_available}'
                if _update_available else f'  Up to date (v{APP_VERSION})')

    menu = pystray.Menu(
        pystray.MenuItem('Open Map', open_map, default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(_update_label, open_releases),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(_autostart_label, toggle_autostart),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('Quit DevInvincible.Inc', quit_app),
    )

    tray = pystray.Icon(APP_NAME, icon_img, 'DevInvincible.Inc', menu)

    def notify(title, message):
        try:
            tray.notify(message, title)
        except Exception as e:
            log.debug('tray notify failed: %s', e)

    # Start alert poller and update checker in background
    alert_thread = threading.Thread(
        target=_alert_poll_loop, args=(notify,), daemon=True
    )
    alert_thread.start()

    threading.Thread(
        target=_check_for_update, args=(notify,), daemon=True
    ).start()

    tray.run()   # blocks until tray.stop() is called

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    mutex = _ensure_single_instance()  # exits if duplicate; keep ref alive

    # Start backend server
    server_thread = threading.Thread(target=_start_server, daemon=True)
    server_thread.start()

    ready = _wait_for_server()
    if not ready:
        # Show error without importing tkinter if possible
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0,
                'Server failed to start.\nCheck ~/SafeFlightMap/launcher.log for details.',
                'Invincible.Inc — Error',
                0x10,  # MB_ICONERROR
            )
        except Exception:
            print('ERROR: server did not start. Check launcher.log.')
        sys.exit(1)

    stop_event = threading.Event()

    # Start system tray in a background thread
    tray_thread = threading.Thread(
        target=_run_tray, args=(stop_event,), daemon=True
    )
    tray_thread.start()

    # Open the main pywebview window (must run on main thread)
    try:
        import webview
        log.info('opening pywebview window')
        webview.create_window(
            'DevInvincible.Inc',
            URL,
            width=1280,
            height=800,
            min_size=(480, 600),
        )
        webview.start()
        log.info('pywebview window closed — app continues in tray')
        # Window is gone but tray keeps the server alive; wait for quit
        stop_event.wait()
    except Exception as e:
        log.warning('pywebview failed (%s) — opening browser instead', e)
        webbrowser.open(URL)
        stop_event.wait()

    log.info('launcher exit')

    # suppress unused-variable warning — mutex must stay alive
    del mutex


if __name__ == '__main__':
    main()
