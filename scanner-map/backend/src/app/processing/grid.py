import math

def latlon_to_cell(lat: float, lon: float, cell_m: int = 100):
    lat_step = cell_m / 111320.0
    lon_step = cell_m / max(1.0, 111320.0 * math.cos(math.radians(lat)))
    return int(round(lat / lat_step)), int(round(lon / lon_step))

def weight_from_rssi(rssi: float | None) -> float:
    if rssi is None:
        return 0.0
    return max(0.0, float(rssi) - (-95.0))
