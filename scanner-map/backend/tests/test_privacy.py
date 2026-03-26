from app.core.privacy import hash_target

def test_hash_stable():
    assert hash_target("s", "A") == hash_target("s", "a")
