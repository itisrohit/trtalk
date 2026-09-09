"""Canonical outbound sending (ADR-004) → Telegram Bot API.

The mirror of /ingest: the core POSTs a canonical message here and this service
renders it on Telegram via the PTB Bot client. Addressing is the **chat id**
(`contact.external_id`) — Telegram has no separate send identifier, so there's
no `NO_WA_ID` case.

Simpler than the WhatsApp gateway: Telegram has **no 24h customer-service
window**, so there's no `WINDOW_EXPIRED`. It's also more permissive on audio —
mp3 plays natively via sendAudio, so no ffmpeg transcode dance; only OGG/Opus
is rendered as a proper voice note (sendVoice). Failures collapse to
`SEND_FAILED` (e.g. the user blocked the bot or never started it).
"""

import base64
import logging

from pydantic import BaseModel, Field
from telegram.error import TelegramError

from app.services.formatting import send_markdown

logger = logging.getLogger(__name__)

MEDIA_TYPES = ("image", "document", "audio")


class SendContact(BaseModel):
    channel: str = "telegram"
    external_id: str | None = None  # the Telegram chat id
    wa_id: str | None = None        # ignored for Telegram; kept for contract parity


class SendMessage(BaseModel):
    type: str = "text"
    text: str | None = Field(default=None, max_length=4096)
    # base64 `data:` URI for image/document/audio — the exact mirror of the
    # inbound contract (the gateway can never fetch a core-private URL).
    media_url: str | None = None
    filename: str | None = None  # documents: what Telegram shows the user


class SendRequest(BaseModel):
    contact: SendContact
    message: SendMessage


class SendError(Exception):
    """A send that didn't happen — `code` travels back to the core verbatim."""

    def __init__(self, code: str, status_code: int, message: str):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.message = message


def _decode_data_uri(uri: str) -> tuple[str, bytes]:
    """'data:<mime>;base64,<payload>' → (mime, bytes). Raises SendError."""
    header, _, payload = uri.partition(",")
    if not payload or not header.startswith("data:"):
        raise SendError("INVALID_MEDIA", 422, "media_url must be a base64 data: URI")
    mime = header.removeprefix("data:").split(";", 1)[0] or "application/octet-stream"
    try:
        return mime, base64.b64decode(payload)
    except Exception as exc:
        raise SendError("INVALID_MEDIA", 422, "media_url is not valid base64") from exc


async def _dispatch(bot, chat_id: str, message: SendMessage):
    """Route one canonical message to the matching PTB send call.

    Text and media captions are rendered to MarkdownV2 (ARCHITECTURE §5: the
    core emits canonical Markdown, the gateway renders it to the platform).
    """
    if message.type == "text":
        return await send_markdown(
            lambda txt, pm: bot.send_message(chat_id=chat_id, text=txt, parse_mode=pm),
            message.text,
        )

    mime, data = _decode_data_uri(message.media_url)
    if message.type == "image":
        return await send_markdown(
            lambda cap, pm: bot.send_photo(chat_id=chat_id, photo=data, caption=cap, parse_mode=pm),
            message.text,
        )
    if message.type == "document":
        return await send_markdown(
            lambda cap, pm: bot.send_document(
                chat_id=chat_id, document=data,
                filename=message.filename or "document", caption=cap, parse_mode=pm,
            ),
            message.text,
        )
    # audio — OGG/Opus renders as a proper voice note; everything else (e.g. the
    # core's mp3 TTS) plays natively via sendAudio, no transcode needed.
    if mime == "audio/ogg":
        return await send_markdown(
            lambda cap, pm: bot.send_voice(chat_id=chat_id, voice=data, caption=cap, parse_mode=pm),
            message.text,
        )
    return await send_markdown(
        lambda cap, pm: bot.send_audio(chat_id=chat_id, audio=data, caption=cap, parse_mode=pm),
        message.text,
    )


async def send_canonical(bot, request: SendRequest) -> dict:
    """Render one canonical outbound message on Telegram. Raises SendError."""
    message = request.message
    if message.type == "text":
        if not message.text:
            raise SendError("UNSUPPORTED_TYPE", 422, "Text messages need text")
    elif message.type in MEDIA_TYPES:
        if not message.media_url:
            raise SendError(
                "UNSUPPORTED_TYPE", 422, f"{message.type} messages need media_url"
            )
    else:
        raise SendError(
            "UNSUPPORTED_TYPE",
            422,
            f"Unsupported outbound type '{message.type}' "
            f"(text, {', '.join(MEDIA_TYPES)})",
        )
    if not request.contact.external_id:
        raise SendError(
            "NO_CHAT_ID", 400, "The contact has no Telegram chat id (external_id)"
        )

    try:
        sent = await _dispatch(bot, request.contact.external_id, message)
    except SendError:
        raise
    except TelegramError as exc:
        # Most common: the user blocked the bot or never started it (Forbidden).
        logger.warning("Telegram send failed for %s: %s", request.contact.external_id, exc)
        raise SendError("SEND_FAILED", 502, f"Telegram send failed: {exc}") from exc
    except Exception as exc:
        logger.exception("Telegram send failed for %s", request.contact.external_id)
        raise SendError("SEND_FAILED", 502, f"Telegram send failed: {exc}") from exc

    return {"status": "sent", "message_id": str(getattr(sent, "message_id", sent))}
