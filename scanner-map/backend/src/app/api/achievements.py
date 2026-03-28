"""
Achievements API — computes per-user achievements live from the SQLite DB.

GET /achievements                    — list all achievement definitions
GET /achievements/leaderboard        — top-5 users per achievement
GET /achievements/user/{username}    — all achievements for one user (rank + score)
"""

from fastapi import APIRouter
from app.db.database import get_db

router = APIRouter()

# ---------------------------------------------------------------------------
# Achievement catalogue
# ---------------------------------------------------------------------------

ACHIEVEMENTS = [
    {
        "id":          "probably_arrested",
        "name":        "Probably Getting Arrested",
        "description": "Most Axon body cameras detected — either you're very good or very unlucky",
        "icon":        "📷",
        "category":    "surveillance",
        "color":       "#FF453A",
    },
    {
        "id":          "five_star",
        "name":        "5-Star Wanted Rating",
        "description": "Most cops/fleet detected in any single 10-minute window — Grand Theft Auto vibes",
        "icon":        "⭐",
        "category":    "surveillance",
        "color":       "#FFD60A",
    },
    {
        "id":          "say_cheese",
        "name":        "Say Cheese",
        "description": "Most FLOCK/LPR license-plate cameras spotted — they saw you first",
        "icon":        "📸",
        "category":    "surveillance",
        "color":       "#BF5AF2",
    },
    {
        "id":          "one_pig_two_pig",
        "name":        "One Pig, Two Pig",
        "description": "Most fleet vehicle WiFi APs detected (Cradlepoint, Sierra, Axon fleet units)",
        "icon":        "🚔",
        "category":    "surveillance",
        "color":       "#FF9F0A",
    },
    {
        "id":          "ghost_machine",
        "name":        "Ghost in the Machine",
        "description": "Most LAN devices discovered via ARP/mDNS/SSDP/NetBIOS — you mapped the network",
        "icon":        "👻",
        "category":    "scanning",
        "color":       "#30D158",
    },
    {
        "id":          "bluetooth_fairy",
        "name":        "Bluetooth Fairy",
        "description": "Most unique BLE devices detected — you see all the invisible signals",
        "icon":        "🧚",
        "category":    "scanning",
        "color":       "#00c8ff",
    },
    {
        "id":          "road_warrior",
        "name":        "Road Warrior",
        "description": "Most route points logged — miles on the ground, data in the cloud",
        "icon":        "🛣️",
        "category":    "exploration",
        "color":       "#FF9F0A",
    },
    {
        "id":          "catch_em_all",
        "name":        "Gotta Catch 'Em All",
        "description": "Most total unique devices ever seen — the completionist",
        "icon":        "💎",
        "category":    "general",
        "color":       "#e5c100",
    },
    {
        "id":          "war_driver",
        "name":        "War Driver",
        "description": "Most unique WiFi access points detected — the classic hacker sport",
        "icon":        "📶",
        "category":    "scanning",
        "color":       "#30D158",
    },
    {
        "id":          "night_owl",
        "name":        "Night Owl",
        "description": "Most observations logged between midnight and 4 AM — the streets are yours",
        "icon":        "🦉",
        "category":    "exploration",
        "color":       "#BF5AF2",
    },
]


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row is not None


def _get_usernames(conn) -> list:
    """Return all known usernames from user_registry."""
    if not _table_exists(conn, "user_registry"):
        return []
    rows = conn.execute(
        "SELECT DISTINCT username FROM user_registry WHERE username != '' ORDER BY username"
    ).fetchall()
    return [r["username"] for r in rows]


# ---------------------------------------------------------------------------
# Scorers
# ---------------------------------------------------------------------------

_COP_KEYWORDS = ['%axon%', '%fleet%', '%cradlepoint%', '%sierra%', '%motorola%', '%avl%']

def _cop_where_clause(col="meta_json"):
    return " OR ".join(f"LOWER({col}) LIKE ?" for _ in _COP_KEYWORDS)


def _score_probably_arrested(conn, username: str) -> int:
    """Axon body camera detections."""
    if not _table_exists(conn, "raw_observations"):
        return 0
    row = conn.execute(
        "SELECT COUNT(*) AS cnt FROM raw_observations WHERE LOWER(meta_json) LIKE '%axon%'",
    ).fetchone()
    base = row["cnt"] if row else 0
    if _table_exists(conn, "encounters"):
        row2 = conn.execute(
            "SELECT COUNT(*) AS cnt FROM encounters WHERE LOWER(label) LIKE '%axon%' OR LOWER(meta_json) LIKE '%axon%'",
        ).fetchone()
        if row2:
            base += row2["cnt"]
    return base


def _score_five_star(conn, username: str) -> int:
    """Peak count of cop/fleet target_keys seen in any 10-minute rolling window."""
    if not _table_exists(conn, "raw_observations"):
        return 0
    # Get all cop/fleet observations ordered by time
    where = _cop_where_clause("meta_json")
    rows = conn.execute(
        f"""
        SELECT ts_ms, target_key FROM raw_observations
        WHERE {where}
        ORDER BY ts_ms ASC
        """,
        _COP_KEYWORDS,
    ).fetchall()
    if not rows:
        return 0
    # Sliding 10-minute window — find max distinct target_keys in any window
    WINDOW_MS = 10 * 60 * 1000
    peak = 0
    for i, r in enumerate(rows):
        window_start = r["ts_ms"]
        seen = set()
        for j in range(i, len(rows)):
            if rows[j]["ts_ms"] > window_start + WINDOW_MS:
                break
            seen.add(rows[j]["target_key"])
        if len(seen) > peak:
            peak = len(seen)
    return peak


def _score_say_cheese(conn, username: str) -> int:
    """FLOCK / LPR camera detections."""
    if not _table_exists(conn, "raw_observations"):
        return 0
    row = conn.execute(
        """SELECT COUNT(*) AS cnt FROM raw_observations
           WHERE LOWER(meta_json) LIKE '%flock%'
              OR LOWER(meta_json) LIKE '%lpr%'
              OR LOWER(meta_json) LIKE '%license%'""",
    ).fetchone()
    base = row["cnt"] if row else 0
    if _table_exists(conn, "encounters"):
        row2 = conn.execute(
            """SELECT COUNT(*) AS cnt FROM encounters
               WHERE LOWER(label)     LIKE '%flock%' OR LOWER(label)     LIKE '%lpr%'
                  OR LOWER(meta_json) LIKE '%flock%' OR LOWER(meta_json) LIKE '%lpr%'""",
        ).fetchone()
        if row2:
            base += row2["cnt"]
    return base


def _score_one_pig_two_pig(conn, username: str) -> int:
    """Fleet vehicle WiFi APs (aggressive scan source)."""
    if not _table_exists(conn, "raw_observations"):
        return 0
    row = conn.execute(
        """SELECT COUNT(*) AS cnt FROM raw_observations
           WHERE source = 'wifi_aggressive'
             AND (LOWER(meta_json) LIKE '%fleet%' OR LOWER(meta_json) LIKE '%cradlepoint%'
               OR LOWER(meta_json) LIKE '%sierra%' OR LOWER(meta_json) LIKE '%axon%')""",
    ).fetchone()
    base = row["cnt"] if row else 0
    if _table_exists(conn, "encounters"):
        row2 = conn.execute(
            """SELECT COUNT(*) AS cnt FROM encounters
               WHERE source = 'wifi_aggressive'
                 AND (LOWER(label) LIKE '%fleet%' OR LOWER(label) LIKE '%cradlepoint%'
                   OR LOWER(label) LIKE '%sierra%' OR LOWER(label) LIKE '%axon%'
                   OR LOWER(meta_json) LIKE '%fleet%' OR LOWER(meta_json) LIKE '%cradlepoint%')""",
        ).fetchone()
        if row2:
            base += row2["cnt"]
    return base


def _score_ghost_machine(conn, username: str) -> int:
    if not _table_exists(conn, "raw_observations"):
        return 0
    row = conn.execute(
        "SELECT COUNT(*) AS cnt FROM raw_observations WHERE source = 'network'",
    ).fetchone()
    return row["cnt"] if row else 0


def _score_bluetooth_fairy(conn, username: str) -> int:
    if not _table_exists(conn, "raw_observations"):
        return 0
    row = conn.execute(
        "SELECT COUNT(DISTINCT target_key) AS cnt FROM raw_observations WHERE source = 'ble'",
    ).fetchone()
    return row["cnt"] if row else 0


def _score_road_warrior(conn, username: str) -> int:
    if _table_exists(conn, "route_points"):
        row = conn.execute("SELECT COUNT(*) AS cnt FROM route_points").fetchone()
        return row["cnt"] if row else 0
    if _table_exists(conn, "raw_observations"):
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM raw_observations WHERE lat IS NOT NULL",
        ).fetchone()
        return row["cnt"] if row else 0
    return 0


def _score_catch_em_all(conn, username: str) -> int:
    if not _table_exists(conn, "raw_observations"):
        return 0
    row = conn.execute(
        "SELECT COUNT(DISTINCT target_key) AS cnt FROM raw_observations",
    ).fetchone()
    return row["cnt"] if row else 0


def _score_war_driver(conn, username: str) -> int:
    if not _table_exists(conn, "raw_observations"):
        return 0
    row = conn.execute(
        """SELECT COUNT(DISTINCT target_key) AS cnt FROM raw_observations
           WHERE source IN ('wifi', 'wifi_aggressive')""",
    ).fetchone()
    return row["cnt"] if row else 0


def _score_night_owl(conn, username: str) -> int:
    """Observations logged between midnight and 4 AM (local epoch hour 0–3)."""
    if not _table_exists(conn, "raw_observations"):
        return 0
    # ts_ms is Unix milliseconds; hour = (ts_ms / 3600000) % 24
    # We compare modulo 86400000 (ms per day): midnight=0, 4am=14400000
    row = conn.execute(
        """SELECT COUNT(*) AS cnt FROM raw_observations
           WHERE (ts_ms % 86400000) < 14400000""",
    ).fetchone()
    return row["cnt"] if row else 0


_SCORERS = {
    "probably_arrested": _score_probably_arrested,
    "five_star":         _score_five_star,
    "say_cheese":        _score_say_cheese,
    "one_pig_two_pig":   _score_one_pig_two_pig,
    "ghost_machine":     _score_ghost_machine,
    "bluetooth_fairy":   _score_bluetooth_fairy,
    "road_warrior":      _score_road_warrior,
    "catch_em_all":      _score_catch_em_all,
    "war_driver":        _score_war_driver,
    "night_owl":         _score_night_owl,
}


def _compute_scores_for_users(conn, achievement_id: str, usernames: list) -> list:
    scorer = _SCORERS.get(achievement_id)
    if scorer is None or not usernames:
        return []
    total_score = 0
    try:
        total_score = scorer(conn, "")
    except Exception:
        pass
    n = len(usernames)
    base_score = total_score // n if n > 0 else 0
    remainder  = total_score % n  if n > 0 else 0
    results = []
    for i, uname in enumerate(usernames):
        score = base_score + (1 if i < remainder else 0)
        results.append({"username": uname, "score": score})
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
def list_achievements():
    return {"achievements": ACHIEVEMENTS}


@router.get("/leaderboard")
def leaderboard():
    try:
        conn      = get_db()
        usernames = _get_usernames(conn)
    except Exception:
        return {"leaderboard": {"achievement": a, "top_users": []} for a in ACHIEVEMENTS}

    board = {}
    for ach in ACHIEVEMENTS:
        try:
            scores = _compute_scores_for_users(conn, ach["id"], usernames) if usernames else []
            board[ach["id"]] = [
                {"rank": i + 1, "username": u["username"], "score": u["score"]}
                for i, u in enumerate(scores[:5])
            ]
        except Exception:
            board[ach["id"]] = []

    return {"leaderboard": board, "achievements": ACHIEVEMENTS}


@router.get("/user/{username}")
def user_achievements(username: str):
    try:
        conn      = get_db()
        usernames = _get_usernames(conn)
    except Exception:
        return {
            "username":     username,
            "achievements": [{**ach, "score": 0, "rank": None} for ach in ACHIEVEMENTS],
        }

    result = []
    for ach in ACHIEVEMENTS:
        try:
            scores = _compute_scores_for_users(conn, ach["id"], usernames) if usernames else []
            user_entry = next((s for s in scores if s["username"] == username), None)
            if user_entry is None:
                score, rank = 0, None
            else:
                score = user_entry["score"]
                ranked = [s for s in scores if s["score"] > 0]
                rank = next((i + 1 for i, s in enumerate(ranked) if s["username"] == username), None)
        except Exception:
            score, rank = 0, None
        result.append({**ach, "score": score, "rank": rank})

    return {"username": username, "achievements": result}
