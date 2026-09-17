"""Demo OTP store for collector phone login.

No SMS gateway exists in this prototype. A code is generated and handed back
to the caller in the API response itself (clearly labelled `demo_otp`) so the
flow can be exercised end-to-end without any external service. A fixed
fallback code is also accepted so a tester never has to read the response.

In-memory only — restarting the server clears every outstanding code, which
is fine for a demo.
"""
import random
import time

TTL_SECONDS = 5 * 60
# Always works, in addition to whatever code was actually issued — makes the
# demo easy to click through without copying the generated code.
DEMO_FALLBACK_OTP = "123456"

_store: dict[str, tuple[str, float]] = {}  # phone -> (code, expires_at)


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit() or ch == "+")
    return digits


def request_otp(phone: str) -> str:
    code = f"{random.randint(0, 999999):06d}"
    _store[phone] = (code, time.time() + TTL_SECONDS)
    return code


def verify_otp(phone: str, code: str) -> bool:
    code = (code or "").strip()
    if code == DEMO_FALLBACK_OTP:
        return True
    entry = _store.get(phone)
    if not entry:
        return False
    stored_code, expires_at = entry
    if time.time() > expires_at:
        return False
    return code == stored_code
