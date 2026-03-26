from app.core.privacy import Allowlist

def test_normalize_stable():
    a = Allowlist()
    assert a.normalize('AA-BB') == 'aa:bb'
