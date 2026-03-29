from fastapi import APIRouter, Header

from app.core.dev_auth import create_operator, decode_token, get_operator, has_any_operator, issue_token, verify_operator

router = APIRouter()


def _extract_token(authorization: str = "") -> str:
    prefix = "Bearer "
    return authorization[len(prefix):].strip() if authorization.startswith(prefix) else ""


@router.get("/status")
def status(authorization: str = Header(default="")):
    payload = decode_token(_extract_token(authorization))
    session = None
    if payload:
        row = get_operator(payload.get("sub", ""))
        if row:
            session = {"email": row["email"], "last_login_ms": row["last_login_ms"]}
    return {"configured": has_any_operator(), "session": session}


@router.post("/setup")
def setup(data: dict):
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    if has_any_operator():
        return {"error": "operator already configured"}
    if not email or "@" not in email:
        return {"error": "valid email required"}
    if len(password) < 10:
        return {"error": "password must be at least 10 characters"}
    create_operator(email, password)
    token = issue_token(email)
    return {"ok": True, "token": token, "email": email.lower()}


@router.post("/login")
def login(data: dict):
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    if not verify_operator(email, password):
        return {"error": "invalid credentials"}
    token = issue_token(email)
    return {"ok": True, "token": token, "email": email.lower()}


@router.get("/me")
def me(authorization: str = Header(default="")):
    payload = decode_token(_extract_token(authorization))
    if not payload:
        return {"authenticated": False}
    row = get_operator(payload.get("sub", ""))
    if not row:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "email": row["email"],
        "last_login_ms": row["last_login_ms"],
    }
