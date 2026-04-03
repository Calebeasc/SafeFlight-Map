import sys
from pathlib import Path

from app.core.config import settings


def get_source_root() -> Path:
    return Path(__file__).resolve().parents[4]


def get_windows_download_targets() -> list[Path]:
    root = get_source_root()
    candidates = [
        root / "dist_installer" / "InvincibleInc_Setup_v1.1.exe",
        root / "explainer" / "Invincible_Setup_v1.1.exe",
        root / "dist" / "InvincibleInc" / "InvincibleInc.exe",
    ]
    if getattr(sys, "frozen", False):
        candidates.insert(0, Path(sys.executable).resolve())
    return candidates


def get_secure_dev_download_targets() -> list[Path]:
    root = get_source_root()
    secure_dir = Path(settings.SECURE_BUILD_DIR)
    candidates = [
        secure_dir / "Invincible_Inc_Sovereign_Dev_v2.exe",
        secure_dir / "Invincible_Inc_Sovereign_Dev.exe",
        root / "dist_installer" / "DevInvincible_Setup_v1.0.exe",
        root / "dist" / "DevInvincibleInc" / "DevInvincibleInc.exe",
        root / "backend" / "dist" / "DevInvincibleInc" / "DevInvincibleInc.exe",
    ]
    return candidates


def resolve_download_path(candidates: list[Path], error_message: str) -> Path:
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(error_message)


def iter_file_chunks(path: Path, chunk_size: int = 64 * 1024):
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            yield chunk
