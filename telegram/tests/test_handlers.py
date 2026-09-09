"""Pure canonical payload builders — no I/O, no network."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.handlers.message_handlers import (
    _reply_canonical,
    payload_from_audio,
    payload_from_callback,
    payload_from_photo,
    payload_from_text,
    payload_from_voice,
)


def _user():
    return SimpleNamespace(id=42, username="juan", full_name="Juan Pérez", language_code="es")


def _chat():
    return SimpleNamespace(id=12345)


def test_payload_from_text():
    msg = SimpleNamespace(
        chat=_chat(), from_user=_user(),
        date=datetime(2026, 1, 1, tzinfo=timezone.utc), text="hola", message_id=7,
    )
    p = payload_from_text(msg)
    assert p["channel"] == "telegram"
    assert p["contact"]["external_id"] == "12345"  # chat id, as a string
    assert p["contact"]["wa_id"] is None
    assert p["contact"]["display_name"] == "Juan Pérez"
    assert p["contact"]["metadata"] == {"user_id": 42, "username": "juan", "language_code": "es"}
    assert p["message"]["type"] == "text"
    assert p["message"]["text"] == "hola"
    assert p["message"]["media_url"] is None
    assert p["message"]["raw"]["message_id"] == 7
    assert p["received_at"].startswith("2026-01-01")


def test_payload_from_photo_picks_largest_and_caption():
    msg = SimpleNamespace(
        chat=_chat(), from_user=_user(), date=None, caption="mira esto", message_id=8,
        photo=[SimpleNamespace(file_id="small"), SimpleNamespace(file_id="big")],
    )
    p = payload_from_photo(msg)
    assert p["message"]["type"] == "image"
    assert p["message"]["text"] == "mira esto"
    assert p["message"]["raw"]["file_id"] == "big"
    assert p["message"]["raw"]["mime_type"] == "image/jpeg"
    assert isinstance(p["received_at"], str)  # fell back to now()


def test_payload_from_voice():
    msg = SimpleNamespace(
        chat=_chat(), from_user=_user(), date=None, message_id=9,
        voice=SimpleNamespace(file_id="v1", mime_type="audio/ogg"),
    )
    p = payload_from_voice(msg)
    assert p["message"]["type"] == "audio"
    assert p["message"]["raw"]["voice"] is True
    assert p["message"]["raw"]["file_id"] == "v1"
    assert p["message"]["raw"]["mime_type"] == "audio/ogg"


def test_payload_from_audio_defaults_mime():
    msg = SimpleNamespace(
        chat=_chat(), from_user=_user(), date=None, message_id=10,
        audio=SimpleNamespace(file_id="a1", mime_type=None, title="Song"),
    )
    p = payload_from_audio(msg)
    assert p["message"]["type"] == "audio"
    assert p["message"]["text"] == "Song"
    assert p["message"]["raw"]["voice"] is False
    assert p["message"]["raw"]["mime_type"] == "audio/mpeg"


async def test_reply_canonical_renders_markdown():
    """The agent-reply path must render canonical Markdown → MarkdownV2."""
    bot = AsyncMock()
    await _reply_canonical(bot, 555, {"messages": [{"type": "text", "text": "**hi** there"}]})
    kwargs = bot.send_message.await_args.kwargs
    assert kwargs["chat_id"] == 555
    assert kwargs["parse_mode"] == "MarkdownV2"
    assert "**" not in kwargs["text"]
    assert "hi" in kwargs["text"]


def test_payload_from_callback():
    cb = SimpleNamespace(
        id="cb1", data="opt_a", from_user=_user(),
        message=SimpleNamespace(chat=_chat(), date=None),
    )
    p = payload_from_callback(cb)
    assert p["message"]["type"] == "button"
    assert p["message"]["text"] == "opt_a"
    assert p["message"]["raw"] == {"callback_id": "cb1", "data": "opt_a"}
    assert p["contact"]["external_id"] == "12345"
