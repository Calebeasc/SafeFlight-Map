"""
SafeFlight Map – desktop launcher.
Starts the FastAPI backend on a free port, then opens a pywebview window.

IMPORTANT: This file must NOT be named app.py — it would collide with the
backend package import 'app'.
"""
import os
import sys
import socket
import threading
import time

# ── Path setup ────────────────────────────────────────────────────────────────
_HERE  = os.path.dirname(os.path.abspath(__file__))
_ROOT  = os.path.dirname(_HERE)
_BACKEND_SRC = os.path.join(_ROOT, "backend", "src")

if _BACKEND_SRC not in sys.path:
    sys.path.insert(0, _BACKEND_SRC)

# ── Find a free port ──────────────────────────────────────────────────────────
def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


PORT = _free_port()
URL  = f"http://127.0.0.1:{PORT}"


# ── Start FastAPI in a background thread ──────────────────────────────────────
def _run_server():
    import uvicorn
    from app.core.config import settings
    settings.PORT = PORT   # patch at runtime
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=PORT,
        log_level="warning",
    )


server_thread = threading.Thread(target=_run_server, daemon=True)
server_thread.start()


# ── Wait until server is ready ────────────────────────────────────────────────
def _wait_for_server(timeout: float = 10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=0.3):
                return True
        except OSError:
            time.sleep(0.1)
    return False


if not _wait_for_server():
    import tkinter as tk
    from tkinter import messagebox
    root = tk.Tk(); root.withdraw()
    messagebox.showerror("SafeFlight Map", "Backend failed to start.")
    sys.exit(1)


# ── Open pywebview window ─────────────────────────────────────────────────────
import webview

def _on_shown(window):
    """Dispatch a resize event after the window is visible so Leaflet tiles load."""
    time.sleep(0.4)
    window.evaluate_js("window.dispatchEvent(new Event('resize'));")

window = webview.create_window(
    "SafeFlight Map",
    url=URL,
    width=1280,
    height=800,
    min_size=(900, 600),
    resizable=True,
)
window.events.shown += lambda: threading.Thread(target=_on_shown, args=(window,), daemon=True).start()

webview.start(
    gui="edgechromium",  # Use Edge Chromium on Windows for best tile rendering
    debug=False,
)
