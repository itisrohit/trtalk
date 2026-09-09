"""TrTalk Telegram gateway — stateless channel adapter.

Mirror of the WhatsApp gateway (itisrohit/whatsapp): receive Telegram
webhook updates, normalize to the canonical contract (ARCHITECTURE §5), POST
the core's /ingest, render the canonical response back to Telegram. Plus the
canonical outbound contract POST /send (ADR-004) for the human-handoff inbox.

Library + integration per ADR-006: python-telegram-bot as a Bot API client
only; FastAPI owns the /webhook route (no PTB Application server). Inbound is
implemented (#9); outbound POST /send lands in #10.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated

import sentry_sdk
from fastapi import FastAPI, Header, HTTPException, Request
from telegram import Bot, Update

from app.core.config import settings

if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.1)

from app.handlers.message_handlers import (  # noqa: E402
    handle_audio,
    handle_callback,
    handle_photo,
    handle_text,
    handle_unsupported,
    handle_voice,
)
from app.services.core_client import CoreClient  # noqa: E402
from app.services.sender import SendError, SendRequest, send_canonical  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

core_client: CoreClient | None = None
bot: Bot | None = None


def _normalize_webhook_url(base: str) -> str:
    """The gateway serves the webhook at /webhook. setWebhook returns 200 even
    for a wrong path, so a URL missing it silently drops every update (Telegram
    just gets 404s). Append /webhook if it isn't already there."""
    base = base.rstrip("/")
    return base if base.endswith("/webhook") else f"{base}/webhook"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global core_client, bot
    core_client = CoreClient(base_url=settings.core_url, api_key=settings.internal_api_key)
    bot = Bot(token=settings.telegram_bot_token)
    await bot.initialize()  # PTB Bot needs its HTTPXRequest initialized
    # Dev convenience: register the webhook on startup when a public URL is set
    # (e.g. ngrok). In production the webhook is configured once, out of band.
    if settings.telegram_webhook_url:
        webhook_url = _normalize_webhook_url(settings.telegram_webhook_url)
        if webhook_url != settings.telegram_webhook_url.rstrip("/"):
            logger.warning(
                "TELEGRAM_WEBHOOK_URL did not point at /webhook — using %s "
                "(Telegram would otherwise get 404 and drop every update)",
                webhook_url,
            )
        await bot.set_webhook(
            url=webhook_url,
            secret_token=settings.telegram_webhook_secret,
            allowed_updates=["message", "callback_query"],
        )
        logger.info("Webhook registered → %s", webhook_url)
    logger.info("TrTalk Telegram gateway started — core=%s", settings.core_url)
    yield
    if bot:
        await bot.shutdown()
    if core_client:
        await core_client.close()


app = FastAPI(
    title="TrTalk Telegram Gateway",
    description="Stateless Telegram channel adapter",
    version="0.1.0",
    lifespan=lifespan,
)


def get_core() -> CoreClient:
    if core_client is None:
        raise RuntimeError("CoreClient not initialized")
    return core_client


def get_bot() -> Bot:
    if bot is None:
        raise RuntimeError("Bot not initialized")
    return bot


def _verify_webhook_secret(token: str | None) -> None:
    """Telegram echoes the secret set via setWebhook on every call (ADR-006)."""
    if token != settings.telegram_webhook_secret:
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Invalid webhook secret"},
        )


# ---------------------------------------------------------------------------
# Ack fast: parse the update, dispatch the core round-trip as a background task
# and return 200 immediately. Telegram retries — and can disable — a slow
# webhook, so handlers must never block the response.
# ---------------------------------------------------------------------------
_background_tasks: set[asyncio.Task] = set()


def _dispatch(coro) -> None:
    """Fire-and-forget a handler coroutine (kept referenced until done)."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


def _route(update: Update) -> None:
    """Pick the handler for an update and dispatch it (no awaiting here)."""
    b, core = get_bot(), get_core()
    if update.callback_query is not None:
        _dispatch(handle_callback(b, update.callback_query, core))
        return
    msg = update.message or update.edited_message
    if msg is None:
        logger.info("Ignoring update with no message/callback_query")
        return
    if msg.text:
        _dispatch(handle_text(b, msg, core))
    elif msg.photo:
        _dispatch(handle_photo(b, msg, core))
    elif msg.voice:
        _dispatch(handle_voice(b, msg, core))
    elif msg.audio:
        _dispatch(handle_audio(b, msg, core))
    else:
        _dispatch(handle_unsupported(b, msg.chat.id))


@app.post("/webhook")
async def webhook(
    request: Request,
    x_telegram_bot_api_secret_token: Annotated[str | None, Header()] = None,
):
    """Telegram update entry point — verify, ack fast, process async."""
    _verify_webhook_secret(x_telegram_bot_api_secret_token)
    data = await request.json()
    update = Update.de_json(data, get_bot())
    if update is not None:
        _route(update)
    return {"ok": True}


@app.post("/send")
async def send_message(
    payload: SendRequest,
    x_internal_api_key: Annotated[str | None, Header()] = None,
):
    """Canonical outbound contract (ADR-004) — the mirror of the core's /ingest.

    Same shared secret as /ingest; unset key = open (dev), matching the core.
    Addressed by the chat id; no 24h window (unlike WhatsApp) → no WINDOW_EXPIRED.
    """
    if settings.internal_api_key and x_internal_api_key != settings.internal_api_key:
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Invalid internal API key"},
        )
    try:
        return await send_canonical(get_bot(), payload)
    except SendError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        )


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "trtalk-telegram"}
