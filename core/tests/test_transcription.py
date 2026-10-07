"""Sprint 12: the STT fallback service (ADR-010).

The transcription client is OpenAI-compatible multipart over httpx; these tests
stub the AsyncClient (no network, no key) and assert the request shape and the
best-effort posture — any failure returns None so the caller keeps the graceful
text fallback.
"""

import httpx
import pytest

from app.core.config import settings
from app.services import transcription

OGG = b"fake-ogg-opus-bytes"


class FakeResponse:
    def __init__(self, status_code: int = 200, text: str = ""):
        self.status_code = status_code
        self.text = text

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "boom", request=None, response=None
            )


class FakeAsyncClient:
    """Stands in for httpx.AsyncClient — records the POST, returns a script."""

    def __init__(self, response, recorded: list):
        self._response = response
        self._recorded = recorded

    def __call__(self, **kwargs):  # the AsyncClient(timeout=...) constructor call
        self._recorded.append({"client_kwargs": kwargs})
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, data=None, files=None, headers=None):
        if isinstance(self._response, Exception):
            raise self._response
        self._recorded.append(
            {"url": url, "data": data, "files": files, "headers": headers}
        )
        return self._response


def _stub_http(monkeypatch, response) -> list:
    recorded: list = []
    monkeypatch.setattr(
        transcription.httpx, "AsyncClient", FakeAsyncClient(response, recorded)
    )
    return recorded


@pytest.fixture
def stt_on(monkeypatch):
    """Enable STT with the default (Groq) provider and a fake key."""
    monkeypatch.setattr(settings, "stt_provider", "groq")
    monkeypatch.setattr(settings, "stt_api_key", "test-key")
    monkeypatch.setattr(settings, "stt_model", "whisper-large-v3-turbo")
    monkeypatch.setattr(settings, "stt_base_url", None)
    monkeypatch.setattr(settings, "stt_language", None)


async def test_disabled_returns_none_without_calling_http(monkeypatch):
    monkeypatch.setattr(settings, "stt_provider", "")
    recorded = _stub_http(monkeypatch, FakeResponse(200, "should not be used"))

    assert not transcription.stt_enabled()
    assert await transcription.transcribe(OGG, "audio/ogg") is None
    assert recorded == []  # no HTTP call


async def test_provider_set_but_no_key_is_disabled(monkeypatch):
    monkeypatch.setattr(settings, "stt_provider", "groq")
    monkeypatch.setattr(settings, "stt_api_key", None)
    assert not transcription.stt_enabled()


async def test_gemini_uses_google_key_and_dedicated_transcriber(monkeypatch):
    monkeypatch.setattr(settings, "stt_provider", "gemini")
    monkeypatch.setattr(settings, "stt_api_key", None)
    monkeypatch.setattr(settings, "google_api_key", "google-test-key")
    monkeypatch.setattr(settings, "stt_model", "gemini-3.5-transcribe")
    called = []

    def fake_gemini(audio, mime):
        called.append((audio, mime))
        return "  hello from a voice note  "

    monkeypatch.setattr(transcription, "_transcribe_gemini_sync", fake_gemini)

    assert transcription.stt_enabled()
    assert transcription.should_transcribe_native_audio()
    assert await transcription.transcribe(OGG, "audio/ogg") == "hello from a voice note"
    assert called == [(OGG, "audio/ogg")]


async def test_transcribe_posts_multipart_and_returns_text(stt_on, monkeypatch):
    recorded = _stub_http(monkeypatch, FakeResponse(200, "  hola quiero información  "))

    result = await transcription.transcribe(OGG, "audio/ogg")

    assert transcription.should_transcribe_native_audio()
    assert result == "hola quiero información"  # stripped
    post = next(r for r in recorded if "url" in r)
    assert post["url"] == "https://api.groq.com/openai/v1/audio/transcriptions"
    assert post["data"]["model"] == "whisper-large-v3-turbo"
    assert post["data"]["response_format"] == "text"
    assert "language" not in post["data"]  # auto-detect when unset
    # OGG sent as-is, no transcoding (ADR-010): filename ext + real mime
    filename, body, mime = post["files"]["file"]
    assert filename == "audio.ogg" and body == OGG and mime == "audio/ogg"
    assert post["headers"]["Authorization"] == "Bearer test-key"


async def test_language_hint_is_forwarded(stt_on, monkeypatch):
    monkeypatch.setattr(settings, "stt_language", "es")
    recorded = _stub_http(monkeypatch, FakeResponse(200, "hola"))

    await transcription.transcribe(OGG, "audio/ogg")

    post = next(r for r in recorded if "url" in r)
    assert post["data"]["language"] == "es"


async def test_base_url_override_is_used(stt_on, monkeypatch):
    monkeypatch.setattr(settings, "stt_base_url", "https://stt.internal/v1/")
    recorded = _stub_http(monkeypatch, FakeResponse(200, "hola"))

    await transcription.transcribe(OGG, "audio/ogg")

    post = next(r for r in recorded if "url" in r)
    assert post["url"] == "https://stt.internal/v1/audio/transcriptions"  # rstrip + path


async def test_http_error_returns_none(stt_on, monkeypatch):
    _stub_http(monkeypatch, httpx.ConnectError("down"))
    assert await transcription.transcribe(OGG, "audio/ogg") is None


async def test_non_2xx_returns_none(stt_on, monkeypatch):
    _stub_http(monkeypatch, FakeResponse(500, "server error"))
    assert await transcription.transcribe(OGG, "audio/ogg") is None


async def test_empty_transcript_returns_none(stt_on, monkeypatch):
    _stub_http(monkeypatch, FakeResponse(200, "   "))
    assert await transcription.transcribe(OGG, "audio/ogg") is None


async def test_oversize_audio_skipped(stt_on, monkeypatch):
    monkeypatch.setattr(settings, "stt_max_bytes", 4)
    recorded = _stub_http(monkeypatch, FakeResponse(200, "nope"))

    assert await transcription.transcribe(OGG, "audio/ogg") is None
    assert recorded == []  # never hit the network


async def test_sarvam_returns_spoken_language(monkeypatch):
    """Saaras detects the language from the audio; it rides on the transcript."""
    import json

    monkeypatch.setattr(settings, "stt_provider", "sarvam")
    monkeypatch.setattr(settings, "stt_api_key", "sarvam-key")
    monkeypatch.setattr(settings, "stt_model", "saaras:v3")
    monkeypatch.setattr(settings, "stt_base_url", None)
    monkeypatch.setattr(settings, "stt_language", None)
    body = {"transcript": " ਤੁਸੀਂ ਕਿਵੇਂ ਹੋ ", "language_code": "pa-IN"}
    response = FakeResponse(200, json.dumps(body))
    response.json = lambda: body
    recorded = _stub_http(monkeypatch, response)

    result = await transcription.transcribe(OGG, "audio/ogg")

    assert result == "ਤੁਸੀਂ ਕਿਵੇਂ ਹੋ"
    assert result.language_code == "pa-IN"
    post = next(r for r in recorded if "url" in r)
    assert post["url"] == "https://api.sarvam.ai/speech-to-text"
    assert post["data"]["language_code"] == "unknown"  # auto-detect
    assert post["headers"] == {"api-subscription-key": "sarvam-key"}


async def test_whisper_transcript_has_no_language(stt_on, monkeypatch):
    _stub_http(monkeypatch, FakeResponse(200, "hello"))
    result = await transcription.transcribe(OGG, "audio/ogg")
    assert result == "hello" and result.language_code is None
