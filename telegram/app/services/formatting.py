"""Render canonical Markdown → Telegram MarkdownV2.

The core emits one canonical markup (standard Markdown, ARCHITECTURE §5);
each gateway renders it to its platform. Telegram's MarkdownV2 needs a long
list of characters escaped (``_*[]()~>#+-=|{}.!``) and uses single-`*` bold /
single-`_` italic — hand-rolling is bug-prone, so we lean on the
battle-tested `telegramify-markdown` converter.

`to_markdown_v2` never raises: if conversion fails, return None so the caller
can fall back to sending the original text as plain (no parse_mode).
"""

import logging

import telegramify_markdown
from telegram.error import BadRequest

logger = logging.getLogger(__name__)


def to_markdown_v2(text: str | None) -> str | None:
    """Convert standard Markdown to Telegram MarkdownV2 (None on empty/failure)."""
    if not text:
        return None
    try:
        return telegramify_markdown.markdownify(text)
    except Exception:
        logger.warning("MarkdownV2 conversion failed — will send plain", exc_info=True)
        return None


async def send_markdown(send, text: str | None):
    """Render canonical Markdown to MarkdownV2 and send via `send(text, parse_mode)`.

    Shared by both outbound paths — the agent reply (`_reply_canonical`) and the
    handoff `/send` (`sender`). Falls back to the original plain text if Telegram
    rejects the entities (BadRequest), so a malformed entity never drops a reply.
    """
    md = to_markdown_v2(text)
    if md is not None:
        try:
            return await send(md, "MarkdownV2")
        except BadRequest:
            logger.warning("MarkdownV2 rejected — resending as plain text")
    return await send(text, None)
