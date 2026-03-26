from statistics import median

def median_rssi(values):
    return median(values) if values else None
