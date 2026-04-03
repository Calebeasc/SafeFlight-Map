"""
Central in-memory alert bus.

Aggregator and API routes both import from here to avoid circular imports.
Supports both per-user alerts and global broadcasts (delivered to all active users).
"""
import threading
from typing import Optional

_lock        = threading.Lock()
_user_alerts: dict = {}    # username -> list[dict]
_global_queue: list = []   # broadcast alerts, bounded at 100
_global_seen: dict = {}    # username -> set of internal _gid values

_id_counter = 0


def _next_id() -> int:
    global _id_counter
    _id_counter += 1
    return _id_counter


def push_user_alert(username: str, alert: dict):
    """Queue an alert for a specific user."""
    with _lock:
        _user_alerts.setdefault(username, []).append(alert)


def push_global_alert(alert: dict):
    """Queue an alert that every active user should receive once."""
    with _lock:
        item = dict(alert)
        item["_gid"] = _next_id()
        _global_queue.append(item)
        if len(_global_queue) > 100:
            removed = _global_queue.pop(0)
            # Clean up seen references to avoid unbounded growth
            old_id = removed["_gid"]
            for s in _global_seen.values():
                s.discard(old_id)


def pop_alerts_for_user(username: str) -> list:
    """Return and clear all pending alerts for this user (personal + unseen globals)."""
    with _lock:
        personal = _user_alerts.pop(username, [])
        seen = _global_seen.setdefault(username, set())
        new_globals = [a for a in _global_queue if a["_gid"] not in seen]
        for a in new_globals:
            seen.add(a["_gid"])
        # Strip internal _gid field before returning
        clean_globals = [{k: v for k, v in a.items() if k != "_gid"} for a in new_globals]
        return personal + clean_globals
