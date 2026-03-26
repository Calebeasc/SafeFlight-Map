import socket
import threading
import sys
from pathlib import Path
import uvicorn
import webview

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))
from app.main import app


def free_port(default=8000):
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", default))
        return default
    except OSError:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]
    finally:
        s.close()


def run():
    port = free_port(8000)
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    th = threading.Thread(target=server.run, daemon=True)
    th.start()
    webview.create_window("Scanner Map", f"http://127.0.0.1:{port}/")
    webview.start()
    server.should_exit = True


if __name__ == "__main__":
    run()
