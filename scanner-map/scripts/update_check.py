"""
SafeFlight auto-updater — called by START_BACKEND.bat on startup.

Checks GitHub Releases for a newer version tag than the one in version.txt.
If a newer release is found, runs `git pull --ff-only` and writes the new
version back to version.txt so the subsequent frontend build picks up any
changed files.

Always exits 0 — a failed update check never blocks startup.

Configuration
-------------
Set GITHUB_REPO in one of three ways (checked in this order):
  1. GITHUB_REPO environment variable
  2. backend/src/app/core/config.py  → Settings.GITHUB_REPO
  3. Leave as placeholder ("YOUR_ORG/safeflight") → update check is skipped
"""
import sys
import os
import json
import subprocess
import urllib.request
import urllib.error

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT_DIR     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION_FILE = os.path.join(ROOT_DIR, 'version.txt')


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse(v: str) -> tuple:
    try:
        return tuple(int(x) for x in v.lstrip('v').split('.'))
    except Exception:
        return (0,)


def _local_version() -> str:
    try:
        with open(VERSION_FILE) as f:
            return f.read().strip()
    except FileNotFoundError:
        return '0.0.0'


def _github_repo() -> str:
    """
    Resolution order:
      1. GITHUB_REPO env var
      2. config.py Settings.GITHUB_REPO  (importable because PYTHONPATH is set)
      3. Empty string → caller treats as unconfigured
    """
    repo = os.getenv('GITHUB_REPO', '')
    if repo:
        return repo

    try:
        sys.path.insert(0, os.path.join(ROOT_DIR, 'backend', 'src'))
        from app.core.config import settings
        return settings.GITHUB_REPO
    except Exception:
        return ''


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    repo = _github_repo()
    if not repo or 'YOUR_ORG' in repo or repo.startswith('YOUR_'):
        print('  [update] GITHUB_REPO not configured — skipping update check.')
        print('  [update] Set it in backend/src/app/core/config.py or via the')
        print('  [update] GITHUB_REPO environment variable.')
        return

    local = _local_version()
    print(f'  Checking for updates  (current: v{local})...', end='', flush=True)

    # ── Fetch latest release tag ──────────────────────────────────────────────
    try:
        api_url = f'https://api.github.com/repos/{repo}/releases/latest'
        req = urllib.request.Request(
            api_url, headers={'User-Agent': 'SafeFlightMap-Updater'}
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
    except urllib.error.URLError:
        print(' (offline — continuing without update)')
        return
    except Exception as e:
        print(f' (check failed: {e})')
        return

    latest = data.get('tag_name', '').lstrip('v')
    if not latest:
        print(' (no releases published yet)')
        return

    if _parse(latest) <= _parse(local):
        print(f' up to date.')
        return

    # ── Newer version available ───────────────────────────────────────────────
    print(f'\n\n  Updating SafeFlight to v{latest}...')
    result = subprocess.run(
        ['git', 'pull', '--ff-only'],
        capture_output=True,
        text=True,
        cwd=ROOT_DIR,
    )

    if result.returncode == 0:
        with open(VERSION_FILE, 'w') as f:
            f.write(latest + '\n')
        print(f'  SafeFlight updated to v{latest}.')
        print('  Frontend will be rebuilt in the next step.')
    else:
        # Non-fatal: dirty working tree, merge conflicts, etc.
        print(f'  git pull failed — {result.stderr.strip()}')
        print('  Continuing with current version.')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'  [update] Unexpected error: {e}')
    sys.exit(0)   # always succeed so START_BACKEND.bat is never blocked
