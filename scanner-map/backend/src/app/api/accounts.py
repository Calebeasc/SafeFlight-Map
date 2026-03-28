"""
Account system: email/phone-based identity with OTP verification.
Links multiple devices to one account so stats aggregate across them.

OTP flow:
  1. POST /accounts/request-otp  { identifier, device_id }
     → generates 6-digit code, stores server-side, returns it in response
       (shown on-screen since this is a local server; configure SMTP below
        to also dispatch it by email)
  2. POST /accounts/verify-otp   { identifier, otp, device_id }
     → creates/finds account, links device, returns account_id
  3. Any device with the same account_id shares stats & is shown as "linked"
"""
import time
import uuid
import random
import string
import smtplib
import threading
from email.mime.text import MIMEText
from fastapi import APIRouter, Query
from app.db.database import get_db
from app.core.config import settings as app_settings

# ── optional Twilio SMS config ────────────────────────────────────────────────
# Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM in .env / config.
# If not configured the OTP is returned in the API response (shown in-app).
def _try_send_sms(to_number: str, otp: str) -> bool:
    sid   = getattr(app_settings, "TWILIO_ACCOUNT_SID", "")
    token = getattr(app_settings, "TWILIO_AUTH_TOKEN",  "")
    frm   = getattr(app_settings, "TWILIO_FROM",        "")
    if not sid or not token or not frm:
        return False
    try:
        # Use requests instead of twilio SDK to avoid extra dependency
        import requests as _req
        # iOS/Android autofill format:
        #   iOS  — detects any 4-8 digit code in the SMS body automatically
        #   Android WebOTP — the last line must be "@domain #code", but
        #   autocomplete="one-time-code" on the input handles it without that.
        body = (
            f"Your Invincible.Inc code is {otp}\n\n"
            f"Expires in 10 minutes. Do not share this code."
        )
        resp = _req.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            auth=(sid, token),
            data={"From": frm, "To": to_number, "Body": body},
            timeout=10,
        )
        return resp.status_code in (200, 201)
    except Exception:
        return False

router  = APIRouter()
_lock   = threading.Lock()
_otps: dict = {}     # identifier → {otp, expires_ms, device_id}

OTP_EXPIRE_S = 600   # 10 minutes


# ── optional SMTP config (set in .env / config if desired) ───────────────────
# SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
# If not configured the OTP is only returned in the API response (shown in-app).
def _try_send_email(to_addr: str, otp: str) -> bool:
    host = getattr(app_settings, "SMTP_HOST", "")
    user = getattr(app_settings, "SMTP_USER", "")
    pwd  = getattr(app_settings, "SMTP_PASS", "")
    frm  = getattr(app_settings, "SMTP_FROM", user)
    port = int(getattr(app_settings, "SMTP_PORT", 587))
    if not host or not user:
        return False
    try:
        msg = MIMEText(
            f"Your Invincible.Inc verification code is: {otp}\n\n"
            f"Expires in 10 minutes. Do not share this code.\n\n"
            "— Invincible.Inc Scanner"
        )
        msg["Subject"] = f"Your code is {otp} — Invincible.Inc"
        msg["From"]    = frm
        msg["To"]      = to_addr
        with smtplib.SMTP(host, port, timeout=10) as s:
            s.starttls()
            s.login(user, pwd)
            s.sendmail(frm, [to_addr], msg.as_string())
        return True
    except Exception:
        return False


# ── helpers ───────────────────────────────────────────────────────────────────
def _gen_otp() -> str:
    return "".join(random.choices(string.digits, k=6))

def _is_email(s: str) -> bool:
    return "@" in s

def _normalise(identifier: str) -> str:
    """Lower-case email; strip non-digits from phone."""
    if _is_email(identifier):
        return identifier.lower().strip()
    digits = "".join(c for c in identifier if c.isdigit())
    return digits


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("/request-otp")
async def request_otp(data: dict):
    raw_id    = (data.get("identifier") or "").strip()
    device_id = (data.get("device_id")  or "").strip()
    if not raw_id or not device_id:
        return {"error": "identifier and device_id required"}

    identifier = _normalise(raw_id)
    if len(identifier) < 4:
        return {"error": "invalid email or phone number"}

    otp        = _gen_otp()
    expires_ms = int(time.time() * 1000) + OTP_EXPIRE_S * 1000

    with _lock:
        _otps[identifier] = {"otp": otp, "expires_ms": expires_ms, "device_id": device_id}

    email_sent = False
    sms_sent   = False
    if _is_email(identifier):
        email_sent = _try_send_email(identifier, otp)
    else:
        sms_sent = _try_send_sms(raw_id, otp)  # use raw_id (original formatting) for Twilio

    return {
        "ok":         True,
        "otp":        otp,           # always returned so app can show it on-screen
        "email_sent": email_sent,
        "sms_sent":   sms_sent,
        "identifier": identifier,
        "expires_in": OTP_EXPIRE_S,
    }


@router.post("/verify-otp")
async def verify_otp(data: dict):
    raw_id    = (data.get("identifier") or "").strip()
    entered   = (data.get("otp")        or "").strip()
    device_id = (data.get("device_id")  or "").strip()
    if not raw_id or not entered or not device_id:
        return {"error": "identifier, otp, and device_id required"}

    identifier = _normalise(raw_id)
    now_ms     = int(time.time() * 1000)

    with _lock:
        entry = _otps.get(identifier)
        if not entry:
            return {"error": "no code requested — request a new one"}
        if now_ms > entry["expires_ms"]:
            del _otps[identifier]
            return {"error": "code expired — request a new one"}
        if entry["otp"] != entered:
            return {"error": "incorrect code"}
        del _otps[identifier]

    conn = get_db()

    # Find or create account
    row = conn.execute(
        "SELECT account_id FROM accounts WHERE identifier=?", (identifier,)
    ).fetchone()

    if row:
        account_id = row["account_id"]
    else:
        account_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO accounts (account_id, identifier, created_ms) VALUES (?,?,?)",
            (account_id, identifier, now_ms),
        )

    # Link this device
    conn.execute(
        "UPDATE user_registry SET account_id=? WHERE device_id=?",
        (account_id, device_id),
    )
    conn.commit()

    # Return linked devices so the app can show the full account picture
    devices = conn.execute(
        "SELECT device_id, username, vehicle, last_seen_ms, "
        "top_speed_mps, avg_speed_mps, total_distance_m, driving_time_s "
        "FROM user_registry WHERE account_id=? ORDER BY last_seen_ms DESC",
        (account_id,),
    ).fetchall()

    return {
        "ok":        True,
        "account_id": account_id,
        "identifier": identifier,
        "devices":   [dict(d) for d in devices],
    }


@router.get("/linked-devices")
def get_linked_devices(account_id: str = Query("")):
    if not account_id:
        return {"devices": []}
    rows = get_db().execute(
        "SELECT device_id, username, vehicle, last_seen_ms, "
        "top_speed_mps, avg_speed_mps, total_distance_m, driving_time_s "
        "FROM user_registry WHERE account_id=? ORDER BY last_seen_ms DESC",
        (account_id,),
    ).fetchall()
    return {"devices": [dict(r) for r in rows]}


@router.get("/aggregated-stats")
def get_aggregated_stats(account_id: str = Query("")):
    """Combined driving stats across every device linked to the account."""
    if not account_id:
        return {"stats": None}
    row = get_db().execute("""
        SELECT
            MAX(top_speed_mps)     AS top_speed_mps,
            SUM(total_distance_m)  AS total_distance_m,
            SUM(driving_time_s)    AS driving_time_s,
            SUM(COALESCE(driving_samples, 0)) AS driving_samples,
            SUM(COALESCE(avg_speed_mps, 0) * COALESCE(driving_samples, 0)) AS weighted_speed_sum
        FROM user_registry WHERE account_id=?
    """, (account_id,)).fetchone()
    if not row or not dict(row).get("driving_samples"):
        return {"stats": None}
    r   = dict(row)
    avg = r["weighted_speed_sum"] / r["driving_samples"] if r["driving_samples"] else None
    return {
        "stats": {
            "top_speed_mps":    r["top_speed_mps"],
            "total_distance_m": r["total_distance_m"] or 0,
            "driving_time_s":   r["driving_time_s"]   or 0,
            "avg_speed_mps":    avg,
        }
    }


@router.delete("/unlink-device")
async def unlink_device(data: dict):
    """Remove a device from its account (the device keeps its local stats)."""
    device_id  = (data.get("device_id")  or "").strip()
    account_id = (data.get("account_id") or "").strip()
    if not device_id or not account_id:
        return {"error": "device_id and account_id required"}
    conn = get_db()
    conn.execute(
        "UPDATE user_registry SET account_id=NULL WHERE device_id=? AND account_id=?",
        (device_id, account_id),
    )
    conn.commit()
    return {"ok": True}
