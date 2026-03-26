from app.processing.grid import latlon_to_cell

def test_grid_index_deterministic():
    assert latlon_to_cell(1.2345, 2.3456) == latlon_to_cell(1.2345, 2.3456)
