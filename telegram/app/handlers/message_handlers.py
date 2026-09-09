"""Telegram message handlers.

Normalize incoming Telegram updates to the canonical contract (ARCHITECTURE §5),
forward them to the core's /ingest, and render the canonical response back to
the user. This service is stateless — no business logic lives here.

Structure mirrors whatsapp/app/handlers: pure `payload_from_*` builders
(unit-testable, no I/O) + one `process_update` coroutine that does the network
round-trip. Handlers are dispatched as background tasks from main.py so the
webhook acks Telegram fast.

Identity (ARCHITECTURE §10 analog): Telegram has no BSUID, so canonical
`contact.external_id` is the **chat id** (what replies are addressed to). The
user id / username / language live in `contact.metadata`; `wa_id` stays None.
"""

import logging
from datetime import datetime, timezone

from app.core.config import settings
from app.services.core_client import CoreClient
from app.services.formatting import send_markdown
from app.services.media import media_to_data_uri

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Canonical payload builders (pure — no I/O)
# ---------------------------------------------------------------------------

def _contact(chat_id, user) -> dict:
    """Map a Telegram chat + user to a canonical contact (chat-id-first)."""
    return {
        "external_id": str(chat_id),  # the chat id is what we reply to
        "wa_id": None,                # WhatsApp-specific; never set for Telegram
        "display_name": getattr(user, "full_name", None),
        "metadata": {
            "user_id": getattr(user, "id", None),
            "username": getattr(user, "username", None),
            "language_code": getattr(user, "language_code", None),
        },
    }


def _payload(chat_id, user, received_at, mtype, *, text=None, media_url=None, raw=None) -> dict:
    rec = received_at if isinstance(received_at, datetime) else datetime.now(timezone.utc)
    return {
        "channel": "telegram",
        "contact": _contact(chat_id, user),
        "message": {
            "type": mtype,
            "text": text,
            "media_url": media_url,
            "raw": raw or {},
        },
        "received_at": rec.isoformat(),
    }


def payload_from_text(msg) -> dict:
    return _payload(
        msg.chat.id, msg.from_user, msg.date, "text",
        text=msg.text, raw={"message_id": msg.message_id},
    )


def payload_from_photo(msg) -> dict:
    """Largest available photo size; Telegram photos have no mime → image/jpeg."""
    photo = msg.photo[-1]
    return _payload(
        msg.chat.id, msg.from_user, msg.date, "image",
        text=msg.caption,
        raw={
            "message_id": msg.message_id,
            "file_id": photo.file_id,
            "mime_type": "image/jpeg",
        },
    )


def payload_from_voice(msg) -> dict:
    v = msg.voice
    return _payload(
        msg.chat.id, msg.from_user, msg.date, "audio",
        raw={
            "message_id": msg.message_id,
            "file_id": v.file_id,
            "mime_type": getattr(v, "mime_type", None) or "audio/ogg",
            "voice": True,  # voice note vs audio file
        },
    )


def payload_from_audio(msg) -> dict:
    a = msg.audio
    return _payload(
        msg.chat.id, msg.from_user, msg.date, "audio",
        text=getattr(a, "title", None),
        raw={
            "message_id": msg.message_id,
            "file_id": a.file_id,
            "mime_type": getattr(a, "mime_type", None) or "audio/mpeg",
            "voice": False,
        },
    )


def payload_from_callback(cb) -> dict:
    """Inline-keyboard button press → canonical "button" message.

    Telegram carries the pressed button's `callback_data` (not its label), so
    `data` is the agent-actionable value and also the text.
    """
    return _payload(
        cb.message.chat.id, cb.from_user, getattr(cb.message, "date", None), "button",
        text=getattr(cb, "data", None),
        raw={"callback_id": cb.id, "data": getattr(cb, "data", None)},
    )


# ---------------------------------------------------------------------------
# Processing (network) — runs as a background task, after Telegram got its 200
# ---------------------------------------------------------------------------

async def _reply_canonical(bot, chat_id, result: dict) -> None:
    """Render the core's canonical response messages back to Telegram."""
    for m in result.get("messages", []):
        if m.get("type") == "text" and m.get("text"):
            # Render canonical Markdown → MarkdownV2 (ADR-007), plain fallback.
            await send_markdown(
                lambda txt, pm: bot.send_message(chat_id=chat_id, text=txt, parse_mode=pm),
                m["text"],
            )
        else:
            # Outbound buttons/media land in #10
            logger.warning("Skipping unsupported outbound message type: %s", m.get("type"))


async def process_update(bot, chat_id, core: CoreClient, payload: dict) -> None:
    """Canonical round-trip: typing action → /ingest → render reply."""
    try:
        try:
            await bot.send_chat_action(chat_id=chat_id, action="typing")
        except Exception:  # typing is best-effort, never block the turn
            logger.debug("send_chat_action failed", exc_info=True)
        result = await core.ingest(payload)
        if not result:
            await bot.send_message(chat_id=chat_id, text=settings.error_reply)
            return
        await _reply_canonical(bot, chat_id, result)
    except Exception:
        logger.exception("Failed processing update for chat %s", chat_id)
        try:
            await bot.send_message(chat_id=chat_id, text=settings.error_reply)
        except Exception:  # pragma: no cover - best effort
            logger.exception("Could not deliver error reply")


# ---------------------------------------------------------------------------
# Handlers (thin: build payload → maybe inline media → process)
# ---------------------------------------------------------------------------

async def handle_text(bot, msg, core: CoreClient):
    await process_update(bot, msg.chat.id, core, payload_from_text(msg))


async def handle_photo(bot, msg, core: CoreClient):
    payload = payload_from_photo(msg)
    raw = payload["message"]["raw"]
    payload["message"]["media_url"] = await media_to_data_uri(
        bot, raw["file_id"], raw["mime_type"]
    )
    await process_update(bot, msg.chat.id, core, payload)


async def handle_voice(bot, msg, core: CoreClient):
    payload = payload_from_voice(msg)
    raw = payload["message"]["raw"]
    payload["message"]["media_url"] = await media_to_data_uri(
        bot, raw["file_id"], raw["mime_type"]
    )
    await process_update(bot, msg.chat.id, core, payload)


async def handle_audio(bot, msg, core: CoreClient):
    payload = payload_from_audio(msg)
    raw = payload["message"]["raw"]
    payload["message"]["media_url"] = await media_to_data_uri(
        bot, raw["file_id"], raw["mime_type"]
    )
    await process_update(bot, msg.chat.id, core, payload)


async def handle_callback(bot, cb, core: CoreClient):
    await process_update(bot, cb.message.chat.id, core, payload_from_callback(cb))
    try:
        await bot.answer_callback_query(cb.id)  # stop the client's loading spinner
    except Exception:  # pragma: no cover - best effort
        logger.debug("answer_callback_query failed", exc_info=True)


async def handle_unsupported(bot, chat_id):
    """Reply that this message type isn't supported yet."""
    logger.info("Unsupported message type for chat %s", chat_id)
    await bot.send_message(chat_id=chat_id, text=settings.unsupported_reply)
