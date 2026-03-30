from __future__ import annotations

import json
import shutil
import socket
from datetime import datetime
from pathlib import Path

from app.core.config import settings
from app.core.storage import get_app_data_dir


def _snapshot_candidates() -> list[tuple[str, Path]]:
    home_data = Path.home() / "SafeFlightMap"
    return [
        ("database", Path(settings.DB_PATH)),
        ("targets", Path(settings.TARGETS_FILE)),
        ("runtime_settings", home_data / "runtime_settings.json"),
        ("ui_settings", home_data / "settings.json"),
    ]


def ensure_daily_save(app_mode: str, app_version: str) -> dict[str, object]:
    now = datetime.now().astimezone()
    date_str = now.date().isoformat()

    backup_root = get_app_data_dir() / "daily-saves"
    backup_root.mkdir(parents=True, exist_ok=True)

    daily_dir = backup_root / date_str
    metadata_path = daily_dir / "metadata.json"
    log_path = backup_root / "daily.log"

    if metadata_path.is_file():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except Exception:
            metadata = {}
        return {
            "created": False,
            "date": date_str,
            "path": str(daily_dir),
            "files": metadata.get("files", []),
        }

    daily_dir.mkdir(parents=True, exist_ok=True)

    files: list[dict[str, object]] = []
    for label, source in _snapshot_candidates():
        try:
            if not source.is_file():
                continue
            destination = daily_dir / source.name
            shutil.copy2(source, destination)
            files.append(
                {
                    "label": label,
                    "source": str(source),
                    "snapshot": destination.name,
                    "size_bytes": destination.stat().st_size,
                }
            )
        except Exception:
            continue

    metadata = {
        "kind": "daily-save",
        "date": date_str,
        "created_at": now.isoformat(),
        "mode": app_mode,
        "version": app_version,
        "hostname": socket.gethostname(),
        "backup_dir": str(daily_dir),
        "files": files,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(
            f"{now.isoformat()} created daily save {date_str} "
            f"mode={app_mode} version={app_version} files={len(files)}\n"
        )

    return {
        "created": True,
        "date": date_str,
        "path": str(daily_dir),
        "files": files,
    }
