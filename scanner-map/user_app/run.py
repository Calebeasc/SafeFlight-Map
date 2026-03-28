"""
Invincible.Inc — User App Launcher
Full scanner (WiFi + BLE + GPS), local server, native window.

Identical scanner engine to DevInvincible.Inc; differs only in branding.
Requires Administrator (Windows will prompt automatically via UAC manifest).

Build:
  pyinstaller user_app/user.spec --clean --noconfirm
"""
import sys
import os
import threading
import time
import webbrowser
import logging
import urllib.request
import json

# ── Logging ───────────────────────────────────────────────────────────────────

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

# ── Bundled src path ──────────────────────────────────────────────────────────

if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle — src is under _MEIPASS
    src_path = os.path.join(sys._MEIPASS, 'src')
else:
    # Running from source — src is in ../backend/src
    _here    = os.path.dirname(os.path.abspath(__file__))
    src_path = os.path.normpath(os.path.join(_here, '..', 'backend', 'src'))

if src_path not in sys.path:
    sys.path.insert(0, src_path)

PORT         = 8742
URL          = f'http://127.0.0.1:{PORT}'
APP_NAME     = 'InvincibleInc'
EXE_PATH     = sys.executable
APP_VERSION  = '1.0.0'                          # bump this with each release
GITHUB_REPO  = 'YourUsername/scanner-map'       # ← set to your actual GitHub repo

_update_available: str | None = None

# ── Update checker ────────────────────────────────────────────────────────────

def _parse_version(v: str) -> tuple:
    try:
        return tuple(int(x) for x in v.lstrip('v').split('.'))
    except Exception:
        return (0,)


def _check_for_update(notify_fn, *, repeat_hours: int = 12):
    global _update_available
    api_url = f'https://api.github.com/repos/{GITHUB_REPO}/releases/latest'

    time.sleep(30)

    while True:
        try:
            req = urllib.request.Request(
                api_url, headers={'User-Agent': APP_NAME}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            latest = data.get('tag_name', '').lstrip('v')
            if latest and _parse_version(latest) > _parse_version(APP_VERSION):
                if _update_available != latest:
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


# ── Single-instance lock ──────────────────────────────────────────────────────

def _ensure_single_instance():
    if sys.platform != 'win32':
        return None
    import ctypes
    kernel32 = ctypes.windll.kernel32
    mutex = kernel32.CreateMutexW(None, False, f'Global\\{APP_NAME}SingleInstance')
    if kernel32.GetLastError() == 183:
        log.info('Already running — focusing window')
        hwnd = ctypes.windll.user32.FindWindowW(None, 'Invincible.Inc')
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 9)
            ctypes.windll.user32.SetForegroundWindow(hwnd)
        sys.exit(0)
    return mutex

# ── Auto-start ────────────────────────────────────────────────────────────────

_AUTOSTART_KEY = r'Software\Microsoft\Windows\CurrentVersion\Run'


def is_autostart_enabled() -> bool:
    if sys.platform != 'win32':
        return False
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _AUTOSTART_KEY) as k:
            winreg.QueryValueEx(k, APP_NAME)
            return True
    except FileNotFoundError:
        return False
    except Exception as e:
        log.warning('autostart check: %s', e)
        return False


def set_autostart(enable: bool):
    if sys.platform != 'win32':
        return
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _AUTOSTART_KEY, 0,
                            winreg.KEY_SET_VALUE) as k:
            if enable:
                winreg.SetValueEx(k, APP_NAME, 0, winreg.REG_SZ, f'"{EXE_PATH}"')
            else:
                try:
                    winreg.DeleteValue(k, APP_NAME)
                except FileNotFoundError:
                    pass
        log.info('autostart %s', 'enabled' if enable else 'disabled')
    except Exception as e:
        log.warning('autostart set: %s', e)

# ── Backend server ────────────────────────────────────────────────────────────

def _start_server():
    try:
        import uvicorn
        from app.main import app
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
    log.error('server not ready after %.0fs', timeout)
    return False

# ── Tray icon ─────────────────────────────────────────────────────────────────

def _make_icon():
    from PIL import Image, ImageDraw
    size = 64
    img  = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([1, 1, size-2, size-2], fill=(11, 15, 20, 255))
    draw.ellipse([1, 1, size-2, size-2], outline=(0, 212, 255, 255), width=3)
    c = size // 2
    for r, a in [(20, 120), (30, 70)]:
        draw.ellipse([c-r, c-r, c+r, c+r], outline=(0, 212, 255, a), width=1)
    draw.ellipse([c-3, c-3, c+3, c+3], fill=(0, 230, 118, 255))
    return img

# ── Fun-Stopper alert polling ─────────────────────────────────────────────────

def _alert_poll_loop(notify_fn):
    last_ts = int(time.time() * 1000)
    while True:
        time.sleep(6)
        try:
            with urllib.request.urlopen(f'{URL}/encounters?limit=20', timeout=3) as resp:
                data = json.loads(resp.read())
            encs = data if isinstance(data, list) else data.get('encounters', [])
            for enc in encs:
                if enc.get('label') == 'Fun-Stopper' and enc.get('peak_ts_ms', 0) > last_ts:
                    last_ts = enc['peak_ts_ms']
                    rssi    = enc.get('rssi_max', 0)
                    hits    = enc.get('hit_count', 1)
                    notify_fn('🚔 Fun-Stopper Detected',
                              f'{rssi:.0f} dBm · {hits} hits — check the map')
                    log.info('stopper alert fired')
        except Exception:
            pass

# ── System tray ───────────────────────────────────────────────────────────────

def _run_tray(stop_event: threading.Event):
    try:
        import pystray
    except ImportError:
        log.warning('pystray not available')
        stop_event.wait()
        return

    icon_img = _make_icon()

    def open_map(icon, item):     webbrowser.open(URL)
    def open_releases(icon, item): webbrowser.open(f'https://github.com/{GITHUB_REPO}/releases/latest')
    def quit_app(icon, item):
        log.info('quit from tray')
        stop_event.set()
        icon.stop()
    def toggle_autostart(icon, item):
        set_autostart(not is_autostart_enabled())
        icon.update_menu()
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
        pystray.MenuItem('Quit Invincible.Inc', quit_app),
    )

    tray = pystray.Icon(APP_NAME, icon_img, 'Invincible.Inc', menu)

    def notify(title, message):
        try:
            tray.notify(message, title)
        except Exception as e:
            log.debug('tray notify failed: %s', e)

    threading.Thread(target=_alert_poll_loop, args=(notify,), daemon=True).start()
    threading.Thread(target=_check_for_update, args=(notify,), daemon=True).start()

    tray.run()

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    mutex = _ensure_single_instance()

    threading.Thread(target=_start_server, daemon=True).start()

    if not _wait_for_server():
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0,
                'Server failed to start.\nCheck ~/SafeFlightMap/launcher.log',
                'Invincible.Inc — Error', 0x10,
            )
        except Exception:
            pass
        sys.exit(1)

    stop_event  = threading.Event()
    threading.Thread(target=_run_tray, args=(stop_event,), daemon=True).start()

    try:
        import webview
        log.info('opening pywebview')
        webview.create_window('Invincible.Inc', URL,
                              width=1280, height=800, min_size=(480, 600))
        webview.start()
        log.info('window closed — continuing in tray')
        stop_event.wait()
    except Exception as e:
        log.warning('pywebview failed (%s) — browser fallback', e)
        webbrowser.open(URL)
        stop_event.wait()

    log.info('exit')
    del mutex


if __name__ == '__main__':
    main()
