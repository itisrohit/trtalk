"""Test config: provide required env + keep the Bot off the network.

Settings() reads TELEGRAM_* at import time, and the app lifespan calls
Bot.initialize()/shutdown() (which would hit api.telegram.org). Tests stub
both so nothing leaves the process.
"""

import os

# Valid token *format* (digits:rest) so PTB's Bot() constructor doesn't raise
# InvalidToken; it's never used on the network (Bot.initialize is stubbed below).
os.environ["TELEGRAM_BOT_TOKEN"] = "123456789:TESTtokenTESTtokenTESTtokenTEST"
os.environ["TELEGRAM_WEBHOOK_SECRET"] = "test-secret"
# Override any real .env value so the lifespan never calls setWebhook on the
# network during tests (env vars take precedence over the .env file).
os.environ["TELEGRAM_WEBHOOK_URL"] = ""

import pytest  # noqa: E402
from telegram import Bot  # noqa: E402


@pytest.fixture(autouse=True)
def _offline_bot(monkeypatch):
    async def _noop(self, *args, **kwargs):
        return None

    # Stub every network entry point the app touches at startup.
    monkeypatch.setattr(Bot, "initialize", _noop)
    monkeypatch.setattr(Bot, "shutdown", _noop)
    monkeypatch.setattr(Bot, "set_webhook", _noop)
