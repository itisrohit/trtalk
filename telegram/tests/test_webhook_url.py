"""The webhook URL must point at /webhook — setWebhook 200s on a wrong path
and then Telegram silently 404s every update, so the gateway normalizes it."""

import pytest

from app.main import _normalize_webhook_url


@pytest.mark.parametrize(
    "base,expected",
    [
        # the footgun: a bare ngrok base → /webhook appended
        ("https://abc123.ngrok-free.app", "https://abc123.ngrok-free.app/webhook"),
        ("https://abc123.ngrok-free.app/", "https://abc123.ngrok-free.app/webhook"),
        # already correct → left as-is (idempotent)
        ("https://abc123.ngrok-free.app/webhook", "https://abc123.ngrok-free.app/webhook"),
        ("https://abc123.ngrok-free.app/webhook/", "https://abc123.ngrok-free.app/webhook"),
    ],
)
def test_normalize_webhook_url(base, expected):
    assert _normalize_webhook_url(base) == expected
