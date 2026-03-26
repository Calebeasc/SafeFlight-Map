from fastapi import APIRouter
from app.db.session import SessionLocal
from app.db.models import Encounter
from sqlalchemy import select

router = APIRouter()

@router.get('/encounters')
def encounters(since: int | None = None, target: str | None = None):
    with SessionLocal() as db:
        q = select(Encounter)
        if since is not None:
            q = q.where(Encounter.peak_ts_ms >= since)
        if target:
            q = q.where(Encounter.target_key == target)
        rows = db.execute(q).scalars().all()
        return [{"target_key": r.target_key, "peak_lat": r.peak_lat, "peak_lon": r.peak_lon, "confidence": r.confidence} for r in rows]
