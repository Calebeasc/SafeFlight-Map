def gap_timeout(source: str) -> float:
    return 2.0 if source == "wifi" else 1.0
