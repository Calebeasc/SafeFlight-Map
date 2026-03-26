from fastapi import APIRouter
router = APIRouter()
@router.get("/encounters")
def encounters(since: int | None = None, target: str | None = None):
    return []
