"""
Invincible.Inc — User App Launcher
Full scanner (WiFi + BLE + GPS), local server, native window.

Identical scanner engine to DevInvincible.Inc; differs only in branding.
Requires Administrator (Windows will prompt automatically via UAC manifest).

Offline mode: if the backend server fails to start (e.g. missing Npcap,
driver issue, port conflict) the app opens an embedded offline page instead
of crashing. The tray stays alive and retries the server every 30 seconds;
when it comes back up a tray notification fires and the window reloads.

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
import tempfile

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
    bundle_roots = [
        getattr(sys, '_MEIPASS', ''),
        os.path.dirname(sys.executable),
        os.path.join(os.path.dirname(sys.executable), '_internal'),
    ]
    src_path = ''
    for root in bundle_roots:
        candidate = os.path.join(root, 'src')
        if root and os.path.exists(candidate):
            src_path = candidate
            break
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
APP_VERSION  = '1.1.0'
GITHUB_REPO  = 'Calebeasc/SafeFlight-Map'

_update_available: str | None = None
_server_online: bool = False          # set True once /health responds
_window_ref     = None                # pywebview window handle (if open)

# ── Npcap / dependency check ──────────────────────────────────────────────────

def _check_npcap() -> bool:
    """Return True if Npcap (or WinPcap) is installed."""
    if sys.platform != 'win32':
        return True
    try:
        import winreg
        winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Npcap')
        return True
    except FileNotFoundError:
        pass
    # Fallback: check for the DLL (WinPcap / Npcap both install this)
    return os.path.exists(r'C:\Windows\System32\wpcap.dll')


def _prompt_npcap():
    """Show a dialog if Npcap is missing; offer to open the download page."""
    try:
        import ctypes
        result = ctypes.windll.user32.MessageBoxW(
            0,
            'WiFi scanning requires Npcap, which is not installed on this machine.\n\n'
            'Without Npcap, WiFi scanning is disabled. BLE and GPS still work.\n\n'
            'Click OK to open the Npcap download page (npcap.com), '
            'then re-launch the app after installation.',
            'Invincible.Inc — Npcap Required for WiFi',
            0x30 | 0x1,   # MB_ICONEXCLAMATION | MB_OKCANCEL
        )
        if result == 1:   # IDOK
            webbrowser.open('https://npcap.com/#download')
    except Exception as e:
        log.warning('npcap prompt failed: %s', e)

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

# ── Offline page ──────────────────────────────────────────────────────────────

_OFFLINE_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Invincible.Inc — Offline</title>
<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{background:#080c14;color:#e8edf5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}}
  .card{{max-width:480px;text-align:center;}}
  .icon{{font-size:56px;margin-bottom:24px;}}
  h1{{font-size:22px;font-weight:800;margin-bottom:10px;}}
  p{{font-size:14px;color:rgba(180,195,220,0.7);line-height:1.7;margin-bottom:8px;}}
  .badge{{display:inline-block;margin-top:20px;padding:8px 20px;border-radius:100px;
         background:rgba(0,200,255,0.1);border:1px solid rgba(0,200,255,0.25);
         color:#00c8ff;font-size:12px;font-weight:700;}}
  .reason{{margin-top:22px;padding:14px 18px;border-radius:12px;
          background:rgba(255,69,58,0.06);border:1px solid rgba(255,69,58,0.2);
          font-size:12px;color:rgba(180,195,220,0.55);text-align:left;line-height:1.8;}}
  .retry{{margin-top:24px;padding:10px 24px;border-radius:100px;background:rgba(0,200,255,0.12);
         border:1px solid rgba(0,200,255,0.3);color:#00c8ff;font-size:13px;font-weight:700;
         cursor:pointer;}}
  .retry:hover{{background:rgba(0,200,255,0.2);}}
</style>
</head>
<body>
<div class="card">
  <div class="icon">📡</div>
  <h1>Scanner offline</h1>
  <p>The Invincible.Inc scanning engine couldn't start. This usually means a required driver is missing or the port is busy.</p>
  <div class="reason">
    <strong style="color:rgba(220,230,245,0.8);">Common causes</strong><br>
    &bull; Npcap not installed &mdash; download from npcap.com<br>
    &bull; Another instance of the app is already running<br>
    &bull; Port 8742 is in use by another process<br>
    &bull; WiFi adapter not present or disabled<br>
    &bull; Check <code style="color:#00c8ff;">~/SafeFlightMap/launcher.log</code> for details
  </div>
  <p style="margin-top:18px;">The app will keep retrying. You'll get a notification when the scanner comes back online.</p>
  <button class="retry" onclick="window.location.reload()">Retry now</button>
  <div class="badge">v{ver} &middot; Offline Mode</div>
</div>
</body>
</html>
"""


def _offline_page_url() -> str:
    """Write the offline HTML to a temp file and return its file:// URL."""
    html = _OFFLINE_HTML_TEMPLATE.format(ver=APP_VERSION)
    path = os.path.join(tempfile.gettempdir(), 'invincible_offline.html')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)
    return f'file:///{path.replace(os.sep, "/")}'


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


def _server_recovery_loop(notify_fn):
    """After a failed startup, keep polling and notify when server comes back."""
    global _server_online, _window_ref
    log.info('server recovery loop started')
    while True:
        time.sleep(30)
        try:
            urllib.request.urlopen(f'{URL}/health', timeout=3)
            if not _server_online:
                _server_online = True
                log.info('server recovered')
                notify_fn('✅ Scanner back online', 'Invincible.Inc is ready — opening map.')
                if _window_ref is not None:
                    try:
                        _window_ref.load_url(URL)
                    except Exception as e:
                        log.debug('window reload failed: %s', e)
                        webbrowser.open(URL)
        except Exception:
            _server_online = False

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

def _run_tray(stop_event: threading.Event, notify_holder: list | None = None):
    try:
        import pystray
    except ImportError:
        log.warning('pystray not available')
        if notify_holder is not None:
            notify_holder[0] = lambda t, m: None
        stop_event.wait()
        return

    icon_img = _make_icon()

    def open_map(icon, item):
        if _server_online:
            webbrowser.open(URL)
        else:
            webbrowser.open(_offline_page_url())

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

    def _status_label(item):
        return '🟢 Scanner online' if _server_online else '🔴 Scanner offline — retrying…'

    menu = pystray.Menu(
        pystray.MenuItem('Open Map', open_map, default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(_status_label, None, enabled=False),
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

    # Expose notify so _server_recovery_loop can use it
    if notify_holder is not None:
        notify_holder[0] = notify

    threading.Thread(target=_alert_poll_loop, args=(notify,), daemon=True).start()
    threading.Thread(target=_check_for_update, args=(notify,), daemon=True).start()

    tray.run()

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global _server_online, _window_ref

    mutex = _ensure_single_instance()

    if not _check_npcap():
        log.warning('Npcap not found — WiFi scanning will be unavailable')
        _prompt_npcap()

    threading.Thread(target=_start_server, daemon=True).start()
    server_ready = _wait_for_server()
    _server_online = server_ready

    if not server_ready:
        log.warning('server did not start in time — entering offline mode')

    stop_event = threading.Event()

    # Tray must start before the window so notify_fn is available
    tray_notify_holder: list = [lambda t, m: None]

    def _tray_thread():
        _run_tray(stop_event, tray_notify_holder)

    threading.Thread(target=_tray_thread, daemon=True).start()

    if not server_ready:
        # Kick off recovery loop — will reload the window when server comes up
        threading.Thread(
            target=_server_recovery_loop,
            args=(lambda t, m: tray_notify_holder[0](t, m),),
            daemon=True,
        ).start()

    target_url = URL if server_ready else _offline_page_url()

    try:
        import webview
        log.info('opening pywebview (%s)', 'online' if server_ready else 'offline page')
        window = webview.create_window(
            'Invincible.Inc', target_url,
            width=1280, height=800, min_size=(480, 600),
        )
        _window_ref = window
        webview.start()
        log.info('window closed — continuing in tray')
        stop_event.wait()
    except Exception as e:
        log.warning('pywebview failed (%s) — browser fallback', e)
        webbrowser.open(target_url)
        stop_event.wait()

    log.info('exit')
    del mutex


if __name__ == '__main__':
    main()
