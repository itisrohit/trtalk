"""media_to_data_uri — base64 data: URI shaping, size cap, never-raise."""

import base64
from unittest.mock import AsyncMock

from app.services import media


def _bot_returning(data: bytearray) -> AsyncMock:
    tg_file = AsyncMock()
    tg_file.download_as_bytearray = AsyncMock(return_value=data)
    bot = AsyncMock()
    bot.get_file = AsyncMock(return_value=tg_file)
    return bot


async def test_data_uri_ok():
    bot = _bot_returning(bytearray(b"hello"))
    uri = await media.media_to_data_uri(bot, "fid", "image/jpeg")
    assert uri == "data:image/jpeg;base64," + base64.b64encode(b"hello").decode()


async def test_default_mime_when_missing():
    bot = _bot_returning(bytearray(b"x"))
    uri = await media.media_to_data_uri(bot, "fid")
    assert uri.startswith("data:application/octet-stream;base64,")


async def test_too_large_returns_none():
    bot = _bot_returning(bytearray(media.MAX_MEDIA_BYTES + 1))
    assert await media.media_to_data_uri(bot, "fid", "image/jpeg") is None


async def test_download_failure_returns_none():
    bot = AsyncMock()
    bot.get_file = AsyncMock(side_effect=RuntimeError("boom"))
    assert await media.media_to_data_uri(bot, "fid") is None
