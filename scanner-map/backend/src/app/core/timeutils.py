import datetime as dt

def utc_ms() -> int:
    return int(dt.datetime.now(dt.timezone.utc).timestamp() * 1000)
