"""Inbound media → self-contained data URI.

Telegram file URLs require the bot token and are channel-private, so the
channel-agnostic core can never fetch them. The gateway downloads the bytes
(`getFile` → `download_as_bytearray`) and ships them inline in the canonical
`media_url` as `data:<mime>;base64,…`. The core uses them for the current LLM
turn only (history stays text-only).

Mirror of whatsapp/app/services/media.py — same size cap, same never-raise
posture (return None on failure → the turn proceeds text-only).
"""

import base64
import logging

logger = logging.getLogger(__name__)

# Telegram getFile downloads files up to 20 MB; 16 MB matches the WhatsApp
# gateway and is plenty for photos (≤10 MB) and voice notes.
MAX_MEDIA_BYTES = 16 * 1024 * 1024


async def media_to_data_uri(bot, file_id: str, mime: str | None = None) -> str | None:
    """Download a Telegram file by id → data URI (None on failure, never raises)."""
    try:
        tg_file = await bot.get_file(file_id)
        data = bytes(await tg_file.download_as_bytearray())
    except Exception:
        logger.warning("Media download failed (file_id=%s)", file_id, exc_info=True)
        return None

    if len(data) > MAX_MEDIA_BYTES:
        logger.warning(
            "Media too large (%d bytes, file_id=%s) — skipping inline payload",
            len(data),
            file_id,
        )
        return None

    mime = mime or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"
