from sqlalchemy import Column, Integer, Float, String, BigInteger, Text
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

class RawObservation(Base):
    __tablename__ = "raw_observations"
    id = Column(Integer, primary_key=True)
    ts_ms = Column(BigInteger, index=True)
    lat = Column(Float)
    lon = Column(Float)
    speed_mps = Column(Float)
    heading = Column(Float)
    source = Column(String(16), index=True)
    target_key = Column(String(128), index=True)
    rssi = Column(Float)
    meta_json = Column(Text)

class Encounter(Base):
    __tablename__ = "encounters"
    id = Column(Integer, primary_key=True)
    target_key = Column(String(128), index=True)
    start_ts_ms = Column(BigInteger, index=True)
    end_ts_ms = Column(BigInteger)
    peak_ts_ms = Column(BigInteger)
    peak_lat = Column(Float)
    peak_lon = Column(Float)
    rssi_max = Column(Float)
    hit_count = Column(Integer)
    confidence = Column(Float)

class HeatCell(Base):
    __tablename__ = "heat_cells"
    id = Column(Integer, primary_key=True)
    cell_x = Column(Integer, index=True)
    cell_y = Column(Integer, index=True)
    target_key = Column(String(128), index=True, nullable=True)
    sum_weight = Column(Float, default=0.0)
    hit_count = Column(Integer, default=0)
    max_rssi = Column(Float, default=-999)
    last_seen_ts_ms = Column(BigInteger, index=True)
