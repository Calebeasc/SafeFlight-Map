"""
Multi-user presence — tracks all active users' positions and vehicle types.
Presence expires after 30 s of no updates.
Also provides a simple in-memory alert queue for test/manual alerts.
Includes a persistent device registry with approval gating.
"""
import time
import threading
from fastapi import APIRouter, Query, Request
from app.core.alerts_bus import push_user_alert, pop_alerts_for_user

router = APIRouter()
_lock = threading.Lock()
_users: dict = {}

STALE_AFTER_S         = 30.0
DRIVING_THRESHOLD_MPS = 4.47   # 10 mph — lower bound for "driving" speed samples
PRESENCE_INTERVAL_S   = 5      # approximate cadence of presence pings from frontend


@router.post("")
async def update_user(data: dict, request: Request):
    username  = (data.get("username")  or "").strip()
    device_id = (data.get("device_id") or "").strip()
    if not username:
        return {"error": "username required"}
    vehicle = data.get("vehicle", "car")
    with _lock:
        _users[username] = {
            "username":  username,
            "vehicle":   vehicle,
            "device_id": device_id,
            "lat":       data.get("lat"),
            "lon":       data.get("lon"),
            "heading":   data.get("heading"),
            "speed":     data.get("speed"),
            "ts":        time.time(),
        }

    # Auto-register device + update top speed in persistent registry
    if device_id:
        try:
            from app.db.database import get_db
            ip        = request.client.host if request.client else "unknown"
            ua        = request.headers.get("user-agent", "")[:200]
            now_ms    = int(time.time() * 1000)
            speed_mps = data.get("speed")  # m/s from browser geolocation
            conn      = get_db()
            existing  = conn.execute(
                "SELECT status, top_speed_mps FROM user_registry WHERE device_id = ?", (device_id,)
            ).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO user_registry "
                    "(device_id, username, vehicle, ip, user_agent, status, first_seen_ms, last_seen_ms, "
                    " top_speed_mps, top_speed_ts_ms) "
                    "VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)",
                    (device_id, username, vehicle, ip, ua, now_ms, now_ms,
                     speed_mps, now_ms if speed_mps else None),
                )
            else:
                # Update top speed if this beat the record
                old_top = existing["top_speed_mps"]
                if speed_mps and (old_top is None or speed_mps > old_top):
                    conn.execute(
                        "UPDATE user_registry SET last_seen_ms=?, username=?, vehicle=?, ip=?, "
                        "top_speed_mps=?, top_speed_ts_ms=? WHERE device_id=?",
                        (now_ms, username, vehicle, ip, speed_mps, now_ms, device_id),
                    )
                else:
                    conn.execute(
                        "UPDATE user_registry SET last_seen_ms=?, username=?, vehicle=?, ip=? WHERE device_id=?",
                        (now_ms, username, vehicle, ip, device_id),
                    )
            # ── Driving stats (accumulated from presence pings) ────────────
            if speed_mps and speed_mps > DRIVING_THRESHOLD_MPS:
                r2 = conn.execute(
                    "SELECT avg_speed_mps, driving_samples FROM user_registry WHERE device_id=?",
                    (device_id,)
                ).fetchone()
                if r2:
                    n       = (r2["driving_samples"] or 0) + 1
                    new_avg = ((r2["avg_speed_mps"] or 0.0) * (n - 1) + speed_mps) / n
                    conn.execute("""
                        UPDATE user_registry SET
                            avg_speed_mps    = ?,
                            driving_samples  = ?,
                            driving_time_s   = COALESCE(driving_time_s,   0) + ?,
                            total_distance_m = COALESCE(total_distance_m, 0) + ?
                        WHERE device_id = ?
                    """, (new_avg, n, PRESENCE_INTERVAL_S,
                          speed_mps * PRESENCE_INTERVAL_S, device_id))

            conn.commit()
        except Exception:
            pass

    return {"ok": True}


@router.get("")
def get_active_users(device_id: str = Query("")):
    from app.db.database import get_db
    now = time.time()
    conn = get_db()

    # Resolve requesting user's username + permissions
    my_username = ""
    if device_id:
        try:
            row = conn.execute(
                "SELECT username, can_view_others FROM user_registry WHERE device_id = ?", (device_id,)
            ).fetchone()
            if row:
                if not row["can_view_others"]:
                    return {"users": []}
                my_username = row["username"] or ""
        except Exception:
            pass

    with _lock:
        active = [dict(u) for u in _users.values() if now - u["ts"] < STALE_AFTER_S]

    if not active:
        return {"users": []}

    # Build visibility map + friends set for requester
    try:
        vis_rows = conn.execute(
            "SELECT username, visible_to_others FROM user_registry WHERE username != ''"
        ).fetchall()
        vis_map = {r["username"]: r["visible_to_others"] for r in vis_rows}
    except Exception:
        vis_map = {}

    friends_set: set = set()
    if my_username:
        try:
            friend_rows = conn.execute("""
                SELECT CASE WHEN requester=? THEN recipient ELSE requester END AS friend
                FROM friends
                WHERE (requester=? OR recipient=?) AND status='accepted'
            """, (my_username, my_username, my_username)).fetchall()
            friends_set = {r["friend"] for r in friend_rows}
        except Exception:
            pass

    result = []
    for u in active:
        uname = u["username"]
        if uname == my_username:
            result.append({**u, "hidden": False, "is_friend": True})
            continue
        # Only show users who are friends with the requester
        if my_username and uname not in friends_set:
            continue
        hidden = vis_map.get(uname, 1) == 0
        result.append({**u, "hidden": hidden, "is_friend": uname in friends_set})

    return {"users": result}


@router.post("/alert")
async def send_alert(data: dict):
    """Queue a manual alert for a specific user."""
    target = (data.get("target") or "").strip()
    if not target:
        return {"error": "target required"}
    alert = {
        "type":     data.get("type", "Fun-Stopper"),
        "color":    data.get("color", "red"),
        "distance": int(data.get("distance", 50)),
        "rssi":     float(data.get("rssi", -65.0)),
    }
    push_user_alert(target, alert)
    return {"ok": True}


@router.get("/alerts")
def get_pending_alerts(username: str = Query("")):
    """Return and clear any queued alerts for this user (personal + unseen global broadcasts)."""
    if not username:
        return {"alerts": []}
    return {"alerts": pop_alerts_for_user(username)}


# ── Device registry ────────────────────────────────────────────────────────────

@router.post("/register")
async def register_device(data: dict, request: Request):
    """
    Called by every client on startup.
    Creates a pending record for new devices; returns current status for known ones.
    Returns: {status: 'pending'|'approved'|'blocked', username, vehicle}
    """
    from app.db.database import get_db
    device_id = (data.get("device_id") or "").strip()
    if not device_id:
        return {"status": "error", "detail": "device_id required"}

    username   = (data.get("username") or "").strip()
    vehicle    = (data.get("vehicle")  or "motorcycle").strip()
    ip         = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")[:200]
    now_ms     = int(time.time() * 1000)

    conn = get_db()
    row = conn.execute(
        "SELECT * FROM user_registry WHERE device_id = ?", (device_id,)
    ).fetchone()

    if row:
        # Update last_seen, IP, and username/vehicle if provided
        updates = {"last_seen_ms": now_ms, "ip": ip}
        if username:
            updates["username"] = username
        if vehicle and vehicle != "motorcycle":
            updates["vehicle"] = vehicle
        sets = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE user_registry SET {sets} WHERE device_id = ?",
            list(updates.values()) + [device_id],
        )
        conn.commit()
        # Re-fetch to get current values
        row = conn.execute(
            "SELECT * FROM user_registry WHERE device_id = ?", (device_id,)
        ).fetchone()
        keys = row.keys()
        needs_re = row["needs_reregister"] if "needs_reregister" in keys else 0
        # Reset the flag so it only fires once
        if needs_re:
            conn.execute(
                "UPDATE user_registry SET needs_reregister=0 WHERE device_id=?", (device_id,)
            )
            conn.commit()
        return {
            "status":           row["status"],
            "username":         row["username"],
            "vehicle":          row["vehicle"],
            "can_contribute":   row["can_contribute"] if "can_contribute" in keys else 1,
            "needs_reregister": bool(needs_re),
        }
    else:
        # New device — create pending record
        conn.execute("""
            INSERT INTO user_registry
              (device_id, username, vehicle, ip, user_agent, status, first_seen_ms, last_seen_ms)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
        """, (device_id, username, vehicle, ip, user_agent, now_ms, now_ms))
        conn.commit()
        return {"status": "pending", "username": username, "vehicle": vehicle,
                "can_contribute": 1, "needs_reregister": False}


@router.get("/registry")
def get_registry():
    """Dev-only: list all registered devices."""
    from app.db.database import get_db
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM user_registry ORDER BY last_seen_ms DESC"
    ).fetchall()
    return {"users": [dict(r) for r in rows]}


@router.post("/registry/approve")
async def approve_device(data: dict):
    from app.db.database import get_db
    device_id = (data.get("device_id") or "").strip()
    if not device_id:
        return {"error": "device_id required"}
    conn = get_db()
    conn.execute(
        "UPDATE user_registry SET status = 'approved' WHERE device_id = ?", (device_id,)
    )
    conn.commit()
    return {"ok": True, "device_id": device_id, "status": "approved"}


@router.post("/registry/block")
async def block_device(data: dict):
    from app.db.database import get_db
    device_id = (data.get("device_id") or "").strip()
    if not device_id:
        return {"error": "device_id required"}
    conn = get_db()
    conn.execute(
        "UPDATE user_registry SET status = 'blocked' WHERE device_id = ?", (device_id,)
    )
    conn.commit()
    return {"ok": True, "device_id": device_id, "status": "blocked"}


@router.delete("/registry/{device_id}")
async def delete_registry(device_id: str):
    """Dev-only: permanently remove a device from the registry."""
    from app.db.database import get_db
    conn = get_db()
    conn.execute("DELETE FROM user_registry WHERE device_id = ?", (device_id,))
    conn.commit()
    return {"ok": True}


@router.post("/registry/reprompt-all")
async def reprompt_all():
    """Dev-only: flag every registered device to re-show the sign-in modal on next poll."""
    from app.db.database import get_db
    conn = get_db()
    conn.execute("UPDATE user_registry SET needs_reregister=1")
    conn.commit()
    return {"ok": True}


@router.post("/registry/reprompt")
async def reprompt_one(data: dict):
    """Dev-only: flag a single device to re-show the sign-in modal on next poll."""
    from app.db.database import get_db
    device_id = (data.get("device_id") or "").strip()
    if not device_id:
        return {"error": "device_id required"}
    conn = get_db()
    conn.execute("UPDATE user_registry SET needs_reregister=1 WHERE device_id=?", (device_id,))
    conn.commit()
    return {"ok": True}


@router.put("/registry/{device_id}")
async def update_registry(device_id: str, data: dict):
    """Dev-only: edit username, vehicle, notes, status, visibility flags, or needs_reregister."""
    from app.db.database import get_db
    allowed = {"username", "vehicle", "notes", "status", "visible_to_others", "can_view_others",
               "can_contribute", "needs_reregister"}
    valid_status = {"pending", "approved", "blocked"}
    fields = {k: v for k, v in data.items() if k in allowed}
    if "status" in fields and fields["status"] not in valid_status:
        return {"error": f"status must be one of {valid_status}"}
    if not fields:
        return {"error": "nothing to update"}
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn = get_db()
    conn.execute(
        f"UPDATE user_registry SET {sets} WHERE device_id = ?",
        list(fields.values()) + [device_id],
    )
    conn.commit()
    return {"ok": True}


@router.get("/leaderboard")
def get_leaderboard():
    """Public: all users with a recorded top speed, sorted fastest first."""
    from app.db.database import get_db
    rows = get_db().execute("""
        SELECT username, vehicle, top_speed_mps, top_speed_ts_ms,
               avg_speed_mps, total_distance_m, driving_time_s, account_id
        FROM user_registry
        WHERE top_speed_mps IS NOT NULL AND username != ''
        ORDER BY top_speed_mps DESC
    """).fetchall()
    return {"leaderboard": [dict(r) for r in rows]}


@router.post("/leaderboard/reset/{device_id}")
async def reset_top_speed(device_id: str):
    """Dev-only: clear a user's top speed record."""
    from app.db.database import get_db
    conn = get_db()
    conn.execute(
        "UPDATE user_registry SET top_speed_mps=NULL, top_speed_ts_ms=NULL WHERE device_id=?",
        (device_id,),
    )
    conn.commit()
    return {"ok": True}


@router.get("/leaderboard/today")
def get_leaderboard_today():
    """Users active in the last 24 hours, sorted by top speed."""
    from app.db.database import get_db
    since_ms = int(time.time() * 1000) - 24 * 60 * 60 * 1000
    rows = get_db().execute("""
        SELECT username, vehicle, top_speed_mps, top_speed_ts_ms
        FROM user_registry
        WHERE top_speed_mps IS NOT NULL
          AND username != ''
          AND last_seen_ms >= ?
        ORDER BY top_speed_mps DESC
    """, (since_ms,)).fetchall()
    return {"leaderboard": [dict(r) for r in rows]}


@router.get("/stats")
def get_user_stats(device_id: str = Query("")):
    """Personal driving stats for a device."""
    from app.db.database import get_db
    if not device_id:
        return {"stats": None}
    row = get_db().execute(
        "SELECT * FROM user_registry WHERE device_id = ?", (device_id,)
    ).fetchone()
    if not row:
        return {"stats": None}
    r = dict(row)
    return {
        "stats": {
            "username":        r.get("username"),
            "vehicle":         r.get("vehicle"),
            "top_speed_mps":   r.get("top_speed_mps"),
            "top_speed_ts_ms": r.get("top_speed_ts_ms"),
            "avg_speed_mps":   r.get("avg_speed_mps"),
            "driving_time_s":  r.get("driving_time_s")   or 0,
            "total_distance_m":r.get("total_distance_m") or 0,
        }
    }


@router.get("/public-stats")
def get_public_stats(username: str = Query("")):
    """Public driving stats for any user by username."""
    from app.db.database import get_db
    if not username:
        return {"stats": None}
    row = get_db().execute(
        "SELECT username, vehicle, top_speed_mps, top_speed_ts_ms, "
        "avg_speed_mps, driving_time_s, total_distance_m "
        "FROM user_registry WHERE username = ?", (username,)
    ).fetchone()
    if not row:
        return {"stats": None}
    r = dict(row)
    return {
        "stats": {
            "username":        r.get("username"),
            "vehicle":         r.get("vehicle"),
            "top_speed_mps":   r.get("top_speed_mps"),
            "top_speed_ts_ms": r.get("top_speed_ts_ms"),
            "avg_speed_mps":   r.get("avg_speed_mps"),
            "driving_time_s":  r.get("driving_time_s")   or 0,
            "total_distance_m":r.get("total_distance_m") or 0,
        }
    }


@router.get("/search")
def search_users(q: str = Query("")):
    """Search registered users by username (case-insensitive partial match)."""
    from app.db.database import get_db
    if not q or len(q) < 2:
        return {"users": []}
    rows = get_db().execute(
        "SELECT username, vehicle FROM user_registry "
        "WHERE username != '' AND status='approved' AND username LIKE ? "
        "ORDER BY username LIMIT 20",
        (f"%{q}%",),
    ).fetchall()
    return {"users": [dict(r) for r in rows]}


# ── Friends ────────────────────────────────────────────────────────────────────

@router.get("/friends")
def get_friends(username: str = Query("")):
    """Return accepted friends + pending requests, enriched with profile data."""
    from app.db.database import get_db
    if not username:
        return {"friends": [], "pending_in": [], "pending_out": []}
    conn = get_db()

    accepted_rows = conn.execute("""
        SELECT CASE WHEN requester=? THEN recipient ELSE requester END AS friend_username,
               created_ms
        FROM friends
        WHERE (requester=? OR recipient=?) AND status='accepted'
        ORDER BY created_ms DESC
    """, (username, username, username)).fetchall()

    # Enrich with registry data (vehicle, last_seen, top_speed)
    friends_out = []
    for r in accepted_rows:
        fn = r["friend_username"]
        profile = conn.execute(
            "SELECT vehicle, last_seen_ms, top_speed_mps, avg_speed_mps, total_distance_m "
            "FROM user_registry WHERE username=?", (fn,)
        ).fetchone()
        # Count mutual friends
        mutual = conn.execute("""
            SELECT COUNT(*) FROM friends f1
            JOIN friends f2 ON (
                CASE WHEN f2.requester=? THEN f2.recipient ELSE f2.requester END =
                CASE WHEN f1.requester=? THEN f1.recipient ELSE f1.requester END
            )
            WHERE (f1.requester=? OR f1.recipient=?) AND f1.status='accepted'
              AND (f2.requester=? OR f2.recipient=?) AND f2.status='accepted'
        """, (fn, username, fn, fn, username, username)).fetchone()[0]
        entry = {"friend_username": fn, "created_ms": r["created_ms"], "mutual_friends": mutual}
        if profile:
            entry.update(dict(profile))
        friends_out.append(entry)

    pending_in = conn.execute("""
        SELECT f.requester, f.created_ms, r.vehicle
        FROM friends f
        LEFT JOIN user_registry r ON r.username = f.requester
        WHERE f.recipient=? AND f.status='pending'
        ORDER BY f.created_ms DESC
    """, (username,)).fetchall()

    pending_out = conn.execute("""
        SELECT recipient, created_ms FROM friends
        WHERE requester=? AND status='pending'
        ORDER BY created_ms DESC
    """, (username,)).fetchall()

    return {
        "friends":     friends_out,
        "pending_in":  [dict(r) for r in pending_in],
        "pending_out": [dict(r) for r in pending_out],
    }


@router.post("/friends/request")
async def send_friend_request(data: dict):
    """Send a friend request from one username to another."""
    from app.db.database import get_db
    requester = (data.get("from_username") or "").strip()
    recipient = (data.get("to_username")   or "").strip()
    if not requester or not recipient:
        return {"error": "from_username and to_username required"}
    if requester == recipient:
        return {"error": "cannot friend yourself"}

    conn = get_db()
    # Verify recipient exists
    exists = conn.execute(
        "SELECT 1 FROM user_registry WHERE username=? AND status='approved'", (recipient,)
    ).fetchone()
    if not exists:
        return {"error": "user not found"}

    # Check if already friends or request already sent (either direction)
    existing = conn.execute("""
        SELECT status FROM friends
        WHERE (requester=? AND recipient=?) OR (requester=? AND recipient=?)
    """, (requester, recipient, recipient, requester)).fetchone()
    if existing:
        return {"error": "already friends or request pending", "status": existing["status"]}

    now_ms = int(time.time() * 1000)
    conn.execute(
        "INSERT INTO friends (requester, recipient, status, created_ms) VALUES (?,?,'pending',?)",
        (requester, recipient, now_ms),
    )
    conn.commit()
    return {"ok": True}


@router.post("/friends/respond")
async def respond_to_request(data: dict):
    """Accept or decline a pending friend request."""
    from app.db.database import get_db
    username  = (data.get("username")  or "").strip()
    requester = (data.get("requester") or "").strip()
    accept    = bool(data.get("accept", True))
    if not username or not requester:
        return {"error": "username and requester required"}

    conn = get_db()
    if accept:
        conn.execute(
            "UPDATE friends SET status='accepted' WHERE requester=? AND recipient=? AND status='pending'",
            (requester, username),
        )
    else:
        conn.execute(
            "DELETE FROM friends WHERE requester=? AND recipient=? AND status='pending'",
            (requester, username),
        )
    conn.commit()
    return {"ok": True}


@router.delete("/friends")
async def remove_friend(data: dict):
    """Remove an accepted friendship or cancel an outgoing request."""
    from app.db.database import get_db
    username     = (data.get("username")      or "").strip()
    friend_name  = (data.get("friend_username") or "").strip()
    if not username or not friend_name:
        return {"error": "username and friend_username required"}

    conn = get_db()
    conn.execute("""
        DELETE FROM friends
        WHERE (requester=? AND recipient=?) OR (requester=? AND recipient=?)
    """, (username, friend_name, friend_name, username))
    conn.commit()
    return {"ok": True}
