from app.processing.encounters import gap_timeout

def test_gap_values():
    assert gap_timeout('wifi') == 2.0
    assert gap_timeout('ble') == 1.0
