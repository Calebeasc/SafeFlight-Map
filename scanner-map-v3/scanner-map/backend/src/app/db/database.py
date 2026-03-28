"""
SQLite database initialisation and helpers.
Tables:
  raw_observations  – every individual detection event
  encounters        – burst summaries (one per pass-by)
  heat_cells        – aggregated grid cells for the heat map
"""
import os
import sqlite3
import threading
from app.core.config import settings

_local = threading.local()


def _get_conn() -> sqlite3.Connection:
    """Return a per-thread SQLite connection (creates DB on first call)."""
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
    """Create tables if they don't exist yet."""
    conn = _get_conn()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS raw_observations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ts_ms       INTEGER NOT NULL,
        lat         REAL,
        lon         REAL,
        speed_mps   REAL,
        heading     REAL,
        source      TEXT NOT NULL,      -- 'wifi' | 'ble'
        target_key  TEXT NOT NULL,      -- HMAC hash of identifier
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
        label       TEXT,              -- 'Fun-Watcher' | 'Fun-Stopper' | NULL
        color       TEXT               -- 'blue' | 'red' | NULL
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
    """)
    conn.commit()
