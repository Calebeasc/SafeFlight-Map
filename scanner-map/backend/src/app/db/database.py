"""
SQLite database initialisation and helpers.
"""
import os
import sqlite3
import threading
from app.core.config import settings

_local = threading.local()


def _get_conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn"):
        os.makedirs(os.path.dirname(settings.DB_PATH), exist_ok=True)
        conn = sqlite3.connect(settings.DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        _local.conn = conn
    return _local.conn


def get_db() -> sqlite3.Connection:
    return _get_conn()


def init_db():
    conn = _get_conn()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS raw_observations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ts_ms       INTEGER NOT NULL,
        lat         REAL,
        lon         REAL,
        speed_mps   REAL,
        heading     REAL,
        source      TEXT NOT NULL,
        target_key  TEXT NOT NULL,
        rssi        REAL NOT NULL,
        meta_json   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_raw_ts   ON raw_observations(ts_ms);
    CREATE INDEX IF NOT EXISTS idx_raw_tkey ON raw_observations(target_key);

    CREATE TABLE IF NOT EXISTS encounters (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        target_key  TEXT NOT NULL,
        source      TEXT NOT NULL,
        start_ts_ms INTEGER NOT NULL,
        end_ts_ms   INTEGER NOT NULL,
        peak_ts_ms  INTEGER NOT NULL,
        peak_lat    REAL,
        peak_lon    REAL,
        rssi_max    REAL NOT NULL,
        hit_count   INTEGER NOT NULL,
        confidence  REAL NOT NULL DEFAULT 0.5,
        label       TEXT,
        color       TEXT,
        device_type TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_enc_tkey ON encounters(target_key);
    CREATE INDEX IF NOT EXISTS idx_enc_ts   ON encounters(start_ts_ms);

    CREATE TABLE IF NOT EXISTS heat_cells (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        cell_x      INTEGER NOT NULL,
        cell_y      INTEGER NOT NULL,
        target_key  TEXT,
        sum_weight  REAL NOT NULL DEFAULT 0,
        hit_count   INTEGER NOT NULL DEFAULT 0,
        max_rssi    REAL NOT NULL DEFAULT -100,
        last_seen_ts_ms INTEGER NOT NULL,
        UNIQUE(cell_x, cell_y, target_key)
    );
    CREATE INDEX IF NOT EXISTS idx_cell_xy ON heat_cells(cell_x, cell_y);

    CREATE TABLE IF NOT EXISTS route_points (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        ts_ms     INTEGER NOT NULL,
        lat       REAL NOT NULL,
        lon       REAL NOT NULL,
        speed_mps REAL,
        heading   REAL,
        source    TEXT DEFAULT 'gps'
    );
    CREATE INDEX IF NOT EXISTS idx_route_ts ON route_points(ts_ms);

    CREATE TABLE IF NOT EXISTS user_registry (
        device_id         TEXT PRIMARY KEY,
        username          TEXT NOT NULL DEFAULT '',
        vehicle           TEXT NOT NULL DEFAULT 'motorcycle',
        ip                TEXT,
        user_agent        TEXT,
        status            TEXT NOT NULL DEFAULT 'pending',
        first_seen_ms     INTEGER,
        last_seen_ms      INTEGER,
        notes             TEXT NOT NULL DEFAULT '',
        visible_to_others INTEGER NOT NULL DEFAULT 1,
        can_view_others   INTEGER NOT NULL DEFAULT 1,
        can_contribute    INTEGER NOT NULL DEFAULT 1
    );

    -- Feature 4: tracks which 100m cells saw a Stopper on which calendar day
    CREATE TABLE IF NOT EXISTS stopper_daily_hits (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        cell_x   INTEGER NOT NULL,
        cell_y   INTEGER NOT NULL,
        day_str  TEXT NOT NULL,
        UNIQUE(cell_x, cell_y, day_str)
    );
    CREATE INDEX IF NOT EXISTS idx_sdh_cell ON stopper_daily_hits(cell_x, cell_y);
    CREATE INDEX IF NOT EXISTS idx_sdh_day  ON stopper_daily_hits(day_str);

    -- Feature 4: promoted hotspot zones (cell seen on 3+ days in 7-day window)
    CREATE TABLE IF NOT EXISTS stopper_hotspots (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        cell_x        INTEGER NOT NULL,
        cell_y        INTEGER NOT NULL,
        lat           REAL NOT NULL,
        lon           REAL NOT NULL,
        radius_m      REAL NOT NULL DEFAULT 150,
        first_seen_ms INTEGER NOT NULL,
        last_seen_ms  INTEGER NOT NULL,
        day_count     INTEGER NOT NULL DEFAULT 3,
        hit_count     INTEGER NOT NULL DEFAULT 0,
        confirmed     INTEGER NOT NULL DEFAULT 0,
        UNIQUE(cell_x, cell_y)
    );

    -- Multi-device accounts (email or phone → account_id)
    CREATE TABLE IF NOT EXISTS accounts (
        account_id   TEXT PRIMARY KEY,
        identifier   TEXT NOT NULL UNIQUE,   -- normalised email or phone
        created_ms   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_id ON accounts(identifier);

    CREATE TABLE IF NOT EXISTS dev_operators (
        email         TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        created_ms    INTEGER NOT NULL,
        last_login_ms INTEGER
    );

    -- Friends / social connections (keyed by username)
    CREATE TABLE IF NOT EXISTS friends (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        requester   TEXT NOT NULL,
        recipient   TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        created_ms  INTEGER NOT NULL,
        UNIQUE(requester, recipient)
    );
    CREATE INDEX IF NOT EXISTS idx_friends_req ON friends(requester);
    CREATE INDEX IF NOT EXISTS idx_friends_rec ON friends(recipient);
    """)
    # Migrate existing user_registry tables that predate these columns
    for _col in [
        "ALTER TABLE user_registry ADD COLUMN visible_to_others INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE user_registry ADD COLUMN can_view_others   INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE user_registry ADD COLUMN can_contribute    INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE user_registry ADD COLUMN needs_reregister  INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_registry ADD COLUMN top_speed_mps     REAL",
        "ALTER TABLE user_registry ADD COLUMN top_speed_ts_ms   INTEGER",
        "ALTER TABLE encounters ADD COLUMN device_type TEXT",
        "CREATE INDEX IF NOT EXISTS idx_enc_dtype ON encounters(device_type)",
        # Driving stats columns on user_registry
        "ALTER TABLE user_registry ADD COLUMN avg_speed_mps    REAL",
        "ALTER TABLE user_registry ADD COLUMN driving_samples  INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_registry ADD COLUMN driving_time_s   INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_registry ADD COLUMN total_distance_m REAL    NOT NULL DEFAULT 0",
        # MAC address and device name stored per encounter
        "ALTER TABLE encounters ADD COLUMN mac_addr    TEXT",
        "ALTER TABLE encounters ADD COLUMN device_name TEXT",
        "ALTER TABLE user_registry ADD COLUMN account_id TEXT",
        "CREATE INDEX IF NOT EXISTS idx_registry_account ON user_registry(account_id)",
    ]:
        try:
            conn.execute(_col)
        except Exception:
            pass  # column already exists
    conn.commit()
