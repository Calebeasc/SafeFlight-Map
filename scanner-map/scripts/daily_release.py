from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = ROOT.parent
VERSION_FILE = ROOT / "version.txt"
VERSION_JSON = ROOT / "frontend" / "public" / "version.json"
UPDATES_DIR = ROOT / "frontend" / "src" / "content" / "updates"
RELEASE_DIR = ROOT / "release_logs" / "daily"
EVOLUTION_LOG = WORKSPACE_ROOT / "EVOLUTION.log"
BACKEND_SRC = ROOT / "backend" / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))


def _now() -> datetime:
    return datetime.now().astimezone()


def _load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(payload, indent=2) + "\n"
    current = ""
    if path.is_file():
        current = path.read_text(encoding="utf-8")
    if current != rendered:
        path.write_text(rendered, encoding="utf-8")


def _read_version() -> str:
    try:
        return VERSION_FILE.read_text(encoding="utf-8").strip() or "0.0.0"
    except Exception:
        return "0.0.0"


def _git_output(*args: str) -> str:
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=str(WORKSPACE_ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            return ""
        return completed.stdout.strip()
    except Exception:
        return ""


def _latest_public_update() -> dict[str, str]:
    files = sorted(UPDATES_DIR.glob("*.mdx"), reverse=True)
    if not files:
        return {}

    path = files[0]
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {"file": path.name}

    frontmatter: dict[str, str] = {"file": path.name}
    lines = text.splitlines()
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        frontmatter[key.strip()] = value.strip().strip('"')
    return frontmatter


def _ensure_daily_save(version: str) -> dict[str, object]:
    try:
        from app.core.daily_checkpoint import ensure_daily_save

        mode = "user"
        raw_mode = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower()
        if raw_mode in {"dev", "sovereign"}:
            mode = "sovereign"
        return ensure_daily_save(mode, version)
    except Exception as exc:
        return {"created": False, "error": str(exc)}


def _append_evolution_if_missing(date_str: str, public_version: str, release_path: Path) -> None:
    marker = f"[{date_str}] DAILY CHECKPOINT"
    if EVOLUTION_LOG.is_file():
        current = EVOLUTION_LOG.read_text(encoding="utf-8", errors="ignore")
        if marker in current:
            return
    else:
        current = "# EVOLUTION.log - Invincible.Inc\nA ledger of major architectural transitions and strategic milestones.\n\n"

    with EVOLUTION_LOG.open("a", encoding="utf-8") as handle:
        if current and not current.endswith("\n"):
            handle.write("\n")
        handle.write(f"[{date_str}] DAILY CHECKPOINT (v{public_version})\n")
        handle.write(f"- Automated daily release ledger written to `{release_path.relative_to(WORKSPACE_ROOT)}`.\n")
        handle.write("- Daily runtime save snapshot recorded if local app data was present.\n\n")


def main() -> int:
    now = _now()
    date_str = now.date().isoformat()
    release_path = RELEASE_DIR / f"{date_str}.json"

    existing_release = _load_json(release_path)
    created_at = existing_release.get("created_at") or now.isoformat()

    base_version = _read_version()
    existing_version_json = _load_json(VERSION_JSON)
    latest_update = _latest_public_update()
    public_version = (
        latest_update.get("version")
        or existing_release.get("public_version")
        or existing_version_json.get("version")
        or base_version
    )
    notes = (
        latest_update.get("description")
        or existing_release.get("notes")
        or existing_version_json.get("notes")
        or f"Daily checkpoint recorded on {date_str}"
    )

    daily_save = existing_release.get("daily_save") or _ensure_daily_save(base_version)
    changed_files = [line for line in _git_output("status", "--short").splitlines() if line.strip()]

    release_payload = {
        "kind": "daily-checkpoint",
        "release_id": date_str,
        "created_at": created_at,
        "base_version": base_version,
        "public_version": public_version,
        "notes": notes,
        "latest_public_update": latest_update,
        "git": {
            "branch": _git_output("branch", "--show-current"),
            "commit": _git_output("rev-parse", "--short", "HEAD"),
            "dirty_files_count": len(changed_files),
            "dirty_files_sample": changed_files[:25],
        },
        "daily_save": daily_save,
    }
    _write_json(release_path, release_payload)

    version_payload = {
        "version": public_version,
        "baseVersion": base_version,
        "releaseId": date_str,
        "buildTime": created_at,
        "notes": notes,
        "latestUpdateFile": latest_update.get("file", ""),
        "latestUpdateTitle": latest_update.get("title", ""),
    }
    _write_json(VERSION_JSON, version_payload)

    _append_evolution_if_missing(date_str, public_version, release_path)

    print(f"[daily-release] version={public_version} release_id={date_str}")
    print(f"[daily-release] log={release_path}")
    if isinstance(daily_save, dict) and daily_save.get("path"):
        print(f"[daily-release] save={daily_save['path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
