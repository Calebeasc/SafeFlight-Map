from fastapi import APIRouter, Body, Header, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from app.core.audit_log import log_dev_action
from app.core.dev_auth import get_operator, require_developer, verify_operator
from app.core.distribution import (
    get_secure_dev_download_targets,
    get_windows_download_targets,
    iter_file_chunks,
    resolve_download_path,
)
from app.core.download_tickets import consume_download_ticket, issue_download_ticket

router = APIRouter()


def _file_headers(path, filename: str) -> dict[str, str]:
    return {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Length": str(path.stat().st_size),
        "Cache-Control": "no-store",
    }


def _resolve_dev_download_subject(authorization: str, data: dict | None) -> tuple[str, str]:
    payload = None
    if authorization:
        try:
            payload = require_developer(authorization)
        except HTTPException:
            payload = None

    credentials = data or {}
    email = (credentials.get("email") or "").strip().lower()
    password = credentials.get("password") or credentials.get("stepup_password") or ""

    if payload:
        subject = (payload.get("sub") or "").strip().lower() or "developer"
        if password:
            if email and email != subject:
                raise HTTPException(status_code=403, detail="authenticated developer mismatch")
            if not verify_operator(subject, password):
                raise HTTPException(status_code=401, detail="invalid developer credentials")
            return subject, "token+password"
        return subject, "token"

    if not email or not password:
        raise HTTPException(status_code=401, detail="developer authentication required")
    if not verify_operator(email, password):
        raise HTTPException(status_code=401, detail="invalid developer credentials")

    row = get_operator(email)
    if not row:
        raise HTTPException(status_code=403, detail="developer account not found")
    return row["email"], "password"


def _resolve_secure_dev_download_subject(ticket: str, authorization: str) -> tuple[str, str]:
    if authorization:
        try:
            payload = require_developer(authorization)
            subject = (payload.get("sub") or "").strip().lower() or "developer"
            return subject, "token"
        except HTTPException:
            pass

    normalized_ticket = (ticket or "").strip()
    if not normalized_ticket:
        raise HTTPException(status_code=403, detail="download ticket required")

    try:
        payload = consume_download_ticket(normalized_ticket, expected_kind="secure-dev-build")
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc) or "invalid download ticket") from exc
    return (payload.get("sub") or "developer"), "ticket"


@router.api_route("/dist/windows-build", methods=["GET", "HEAD"])
def windows_build(request: Request):
    try:
        download_path = resolve_download_path(get_windows_download_targets(), "No Windows installer artifact found.")
    except FileNotFoundError:
        return Response(
            content='{"detail":"windows installer artifact missing"}',
            status_code=404,
            media_type="application/json",
        )
    headers = _file_headers(download_path, "Invincible_Inc_Windows_Sovereign.exe")
    media_type = "application/vnd.microsoft.portable-executable"
    if request.method == "HEAD":
        return Response(status_code=200, headers=headers, media_type=media_type)
    return StreamingResponse(iter_file_chunks(download_path), headers=headers, media_type=media_type)


@router.post("/dev/generate-download-ticket")
def generate_download_ticket(
    request: Request,
    data: dict | None = Body(default=None),
    authorization: str = Header(default=""),
):
    try:
        subject, auth_mode = _resolve_dev_download_subject(authorization, data)
    except HTTPException as exc:
        attempted_email = ((data or {}).get("email") or "").strip().lower() or "unknown"
        log_dev_action(
            "secure_dev_ticket_denied",
            attempted_email,
            {
                "reason": str(exc.detail),
                "route": "/api/dev/generate-download-ticket",
            },
            request.client.host if request.client else "",
        )
        raise

    ticket = issue_download_ticket(subject, kind="secure-dev-build")
    log_dev_action(
        "secure_dev_ticket_issued",
        subject,
        {
            "auth_mode": auth_mode,
            "route": "/api/dev/generate-download-ticket",
        },
        request.client.host if request.client else "",
    )
    return {"ok": True, "ticket": ticket, "expires_in_s": 60, "auth_mode": auth_mode}


@router.api_route("/dist/secure-dev-build", methods=["GET", "HEAD"])
def secure_dev_build(request: Request, ticket: str = "", authorization: str = Header(default="")):
    try:
        subject, auth_mode = _resolve_secure_dev_download_subject(ticket, authorization)
    except HTTPException as exc:
        log_dev_action(
            "secure_dev_download_denied",
            "unknown",
            {
                "reason": str(exc.detail),
                "route": "/api/dist/secure-dev-build",
                "method": request.method,
            },
            request.client.host if request.client else "",
        )
        raise

    try:
        download_path = resolve_download_path(get_secure_dev_download_targets(), "No secure developer build artifact found.")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="secure developer build missing")

    headers = _file_headers(download_path, "Invincible_Inc_Sovereign_Dev_v2.exe")
    media_type = "application/vnd.microsoft.portable-executable"

    log_dev_action(
        "secure_dev_download_granted",
        subject,
        {
            "filename": download_path.name,
            "route": "/api/dist/secure-dev-build",
            "auth_mode": auth_mode,
            "method": request.method,
        },
        request.client.host if request.client else "",
    )

    if request.method == "HEAD":
        return Response(status_code=200, headers=headers, media_type=media_type)
    return StreamingResponse(iter_file_chunks(download_path), headers=headers, media_type=media_type)
