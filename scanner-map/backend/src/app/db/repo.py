from sqlalchemy import select
from app.db.models import HeatCell
from app.processing.grid import latlon_to_cell, weight_from_rssi

def upsert_heat_cell(db, lat: float, lon: float, rssi: float | None, ts_ms: int, target_key: str | None = None, cell_size: int = 100):
    cx, cy = latlon_to_cell(lat, lon, cell_size)
    row = db.execute(select(HeatCell).where(HeatCell.cell_x == cx, HeatCell.cell_y == cy, HeatCell.target_key == target_key)).scalar_one_or_none()
    w = weight_from_rssi(rssi)
    if row is None:
        row = HeatCell(cell_x=cx, cell_y=cy, target_key=target_key, sum_weight=w, hit_count=1, max_rssi=rssi or -999, last_seen_ts_ms=ts_ms)
        db.add(row)
    else:
        row.sum_weight += w
        row.hit_count += 1
        if rssi is not None:
            row.max_rssi = max(row.max_rssi, rssi)
        row.last_seen_ts_ms = max(row.last_seen_ts_ms or 0, ts_ms)

def heatmap_geojson(db, since: int | None = None, target: str | None = None):
    q = select(HeatCell)
    if since is not None:
        q = q.where(HeatCell.last_seen_ts_ms >= since)
    if target:
        q = q.where(HeatCell.target_key == target)
    rows = db.execute(q).scalars().all()
    feats = []
    for r in rows:
        feats.append({"type":"Feature","geometry":{"type":"Point","coordinates":[r.cell_y, r.cell_x]},"properties":{"intensity":r.sum_weight,"hit_count":r.hit_count,"max_rssi":r.max_rssi}})
    return {"type":"FeatureCollection","features":feats}
