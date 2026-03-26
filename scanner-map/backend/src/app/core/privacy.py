import hashlib
import hmac

def normalize_target_id(v: str) -> str:
    return (v or "").strip().lower()

def hash_target(secret: str, target_id: str) -> str:
    return hmac.new(secret.encode(), normalize_target_id(target_id).encode(), hashlib.sha256).hexdigest()
