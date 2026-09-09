"""Canonical /send → Telegram Bot API mapping (mock Bot)."""

import base64

import pytest
from telegram.error import BadRequest, TelegramError
from unittest.mock import AsyncMock

from app.services.sender import SendError, SendRequest, send_canonical


def _data_uri(mime: str, raw: bytes = b"x") -> str:
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


def _req(mtype="text", **msg) -> SendRequest:
    return SendRequest(
        contact={"channel": "telegram", "external_id": "123"},
        message={"type": mtype, **msg},
    )


def _bot(message_id=99) -> AsyncMock:
    sent = type("M", (), {"message_id": message_id})()
    bot = AsyncMock()
    for m in ("send_message", "send_photo", "send_document", "send_voice", "send_audio"):
        getattr(bot, m).return_value = sent
    return bot


async def test_text_renders_markdownv2():
    bot = _bot()
    out = await send_canonical(bot, _req("text", text="**hola**"))
    kwargs = bot.send_message.await_args.kwargs
    assert kwargs["chat_id"] == "123"
    assert kwargs["parse_mode"] == "MarkdownV2"
    assert "hola" in kwargs["text"]
    assert "**" not in kwargs["text"]  # ** bold → MarkdownV2 single *
    assert out == {"status": "sent", "message_id": "99"}


async def test_image_decodes_and_sends_photo():
    bot = _bot()
    await send_canonical(bot, _req("image", text="cap", media_url=_data_uri("image/jpeg", b"img")))
    kwargs = bot.send_photo.await_args.kwargs
    assert kwargs["chat_id"] == "123"
    assert kwargs["photo"] == b"img"
    assert "cap" in kwargs["caption"]
    assert kwargs["parse_mode"] == "MarkdownV2"


async def test_document_uses_filename():
    bot = _bot()
    await send_canonical(
        bot, _req("document", filename="report.pdf", media_url=_data_uri("application/pdf"))
    )
    assert bot.send_document.await_args.kwargs["filename"] == "report.pdf"


async def test_audio_ogg_is_voice_note():
    bot = _bot()
    await send_canonical(bot, _req("audio", media_url=_data_uri("audio/ogg")))
    bot.send_voice.assert_awaited_once()
    bot.send_audio.assert_not_awaited()


async def test_audio_mp3_is_send_audio():
    bot = _bot()
    await send_canonical(bot, _req("audio", media_url=_data_uri("audio/mpeg")))
    bot.send_audio.assert_awaited_once()
    bot.send_voice.assert_not_awaited()


async def test_markdownv2_rejected_falls_back_to_plain():
    bot = _bot()
    sent = type("M", (), {"message_id": 7})()
    bot.send_message.side_effect = [BadRequest("can't parse entities"), sent]
    out = await send_canonical(bot, _req("text", text="weird _ * markup"))
    assert bot.send_message.await_count == 2
    # second (fallback) call: original text, no parse_mode
    fallback = bot.send_message.await_args_list[1].kwargs
    assert fallback["text"] == "weird _ * markup"
    assert fallback["parse_mode"] is None
    assert out == {"status": "sent", "message_id": "7"}


async def test_media_type_without_media_url_rejected():
    with pytest.raises(SendError) as ei:
        await send_canonical(_bot(), _req("image"))
    assert ei.value.code == "UNSUPPORTED_TYPE"


async def test_unknown_type_rejected():
    with pytest.raises(SendError) as ei:
        await send_canonical(_bot(), _req("sticker", text="x"))
    assert ei.value.code == "UNSUPPORTED_TYPE"


async def test_missing_chat_id_rejected():
    req = SendRequest(contact={"channel": "telegram"}, message={"type": "text", "text": "hi"})
    with pytest.raises(SendError) as ei:
        await send_canonical(_bot(), req)
    assert ei.value.code == "NO_CHAT_ID"


async def test_invalid_data_uri_rejected():
    with pytest.raises(SendError) as ei:
        await send_canonical(_bot(), _req("image", media_url="not-a-data-uri"))
    assert ei.value.code == "INVALID_MEDIA"


async def test_telegram_error_maps_to_send_failed():
    bot = _bot()
    bot.send_message.side_effect = TelegramError("bot was blocked by the user")
    with pytest.raises(SendError) as ei:
        await send_canonical(bot, _req("text", text="hi"))
    assert ei.value.code == "SEND_FAILED"
    assert ei.value.status_code == 502
