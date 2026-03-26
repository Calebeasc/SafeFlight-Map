import hmac, hashlib, json
from pathlib import Path
from app.config import settings, BASE_DIR

class Allowlist:
    def __init__(self):
        self.wifi = set()
        self.ble = set()
        p = BASE_DIR / settings.allowlist_file
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            self.wifi = {self.normalize(x) for x in d.get("wifi", [])}
            self.ble = {self.normalize(x) for x in d.get("ble", [])}

    @staticmethod
    def normalize(v: str) -> str:
        return (v or "").strip().lower().replace('-', ':')

    def is_allowed(self, source: str, raw_id: str) -> bool:
        n = self.normalize(raw_id)
        if source == "wifi":
            return n in self.wifi
        if source == "ble":
            return n in self.ble
        return False

    def key_for(self, raw_id: str) -> str:
        n = self.normalize(raw_id)
        return hmac.new(settings.hmac_secret.encode(), n.encode(), hashlib.sha256).hexdigest()

allowlist = Allowlist()
