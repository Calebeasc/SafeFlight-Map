import hashlib
import secrets
import threading
import time
from typing import Any

import jwt

from app.core.config import settings

_LOCK = threading.Lock()
_USED_TICKETS: dict[str, float] = {}
_BLOCKED_TICKETS: dict[str, float] = {}
_TICKET_ALGO = "HS256"
_TICKET_TTL_S = 60


def _hash_ticket(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _prune(now: float | None = None) -> None:
    now = now or time.time()
    for store in (_USED_TICKETS, _BLOCKED_TICKETS):
        expired = [key for key, exp in store.items() if exp <= now]
        for key in expired:
            del store[key]


def issue_download_ticket(subject: str, kind: str = "secure-dev-build") -> str:
    now = int(time.time())
    payload = {
        "sub": subject,
        "kind": kind,
        "iat": now,
        "exp": now + _TICKET_TTL_S,
        "jti": secrets.token_urlsafe(18),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=_TICKET_ALGO)


def consume_download_ticket(ticket: str, expected_kind: str = "secure-dev-build") -> dict[str, Any]:
    ticket_hash = _hash_ticket(ticket)
    now = time.time()
    with _LOCK:
        _prune(now)
        if ticket_hash in _BLOCKED_TICKETS:
            raise ValueError("ticket blocked")
        if ticket_hash in _USED_TICKETS:
            raise ValueError("ticket already consumed")
        try:
            payload = jwt.decode(ticket, settings.JWT_SECRET, algorithms=[_TICKET_ALGO])
        except Exception as exc:
            _BLOCKED_TICKETS[ticket_hash] = now + _TICKET_TTL_S
            raise ValueError("ticket invalid") from exc
        if payload.get("kind") != expected_kind:
            _BLOCKED_TICKETS[ticket_hash] = now + _TICKET_TTL_S
            raise ValueError("ticket kind mismatch")
        _USED_TICKETS[ticket_hash] = float(payload.get("exp") or (int(now) + _TICKET_TTL_S))
        return payload
