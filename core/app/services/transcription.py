"""Speech-to-text support for inbound voice notes.

ADR-010. A voice note arrives as an `audio` message (bytes inlined as a `data:`
URI). When STT is configured, every voice note is transcribed first so language
selection is based on the latest spoken message rather than older conversation
history. This also lets a fast dedicated STT provider (such as Groq Whisper)
handle audio while Gemini concentrates on the support reply.

Design (ADR-010):
- **Gemini Transcribe** uploads the audio briefly to Gemini Files and calls
  `gemini-3.5-transcribe`; the temporary file is deleted after each request.
- **OpenAI-compatible** `POST {base_url}/audio/transcriptions` (multipart). The
  shape is a de-facto standard — OpenAI and Groq are byte-identical — so one
  `httpx` client serves any compatible host by swapping `STT_BASE_URL`.
- **Groq `whisper-large-v3-turbo`** is the default: it accepts OGG/Opus natively
  (WhatsApp/Telegram voice) so there is no transcoding step, and it's cheapest.
- **Best-effort:** any failure returns None and the caller keeps today's graceful
  text fallback. STT never breaks a turn.
- httpx only — no provider SDK (httpx is already a core dependency).
"""

import asyncio
import io
import logging

import httpx

from app.core import storage
from app.core.config import settings

logger = logging.getLogger(__name__)


class Transcript(str):
    """Transcript text plus the spoken language when the provider reports it.

    A `str` so every caller that only needs the text keeps working.
    `language_code` is BCP-47 (e.g. "pa-IN"); only Sarvam returns it — it is
    detected from the audio itself, which beats classifying the text after
    the fact.
    """

    language_code: str | None

    def __new__(cls, text: str, language_code: str | None = None):
        obj = super().__new__(cls, text)
        obj.language_code = language_code
        return obj

# provider → default base_url (an explicit STT_BASE_URL overrides these).
_DEFAULT_BASE_URLS = {
    "groq": "https://api.groq.com/openai/v1",
    "openai": "https://api.openai.com/v1",
    "sarvam": "https://api.sarvam.ai",
}


def stt_enabled() -> bool:
    """True when a provider + key are set and a base_url can be resolved."""
    return settings.stt_configured and bool(_base_url())


def _base_url() -> str:
    if settings.stt_provider == "gemini":
        return "gemini"
    return (
        settings.stt_base_url or _DEFAULT_BASE_URLS.get(settings.stt_provider, "")
    ).rstrip("/")


def should_transcribe_native_audio() -> bool:
    """An explicitly configured STT provider is authoritative for voice notes."""
    return stt_enabled()


def _transcribe_gemini_sync(audio: bytes, mime: str) -> str | None:
    """Run Gemini's file transcription API and promptly remove the temp file."""
    from google import genai

    file_ref = None
    try:
        client = genai.Client(api_key=settings.google_api_key)
        upload = io.BytesIO(audio)
        upload.name = f"voice-note.{storage.ext_for_mime(mime) or 'ogg'}"
        file_ref = client.files.upload(file=upload, config={"mime_type": mime})
        interaction = client.interactions.create(
            model=settings.stt_model or "gemini-3.5-transcribe",
            input=[
                {
                    "type": "audio",
                    "uri": file_ref.uri,
                    "mime_type": mime,
                }
            ],
            generation_config={
                "transcription_config": {
                    "language_codes": [],
                    "mode": "smart",
                }
            },
        )
        return (getattr(interaction, "output_text", "") or "").strip() or None
    finally:
        if file_ref is not None and getattr(file_ref, "name", None):
            try:
                client.files.delete(name=file_ref.name)
            except Exception:
                logger.warning("Could not delete temporary Gemini audio file")


async def transcribe(audio: bytes, mime: str) -> Transcript | None:
    """Transcribe audio bytes to text. None on any failure (caller falls back).

    OGG/Opus is sent as-is — the default provider (Groq) accepts it natively, so
    there is no ffmpeg/transcoding step (ADR-010).
    """
    if not stt_enabled():
        return None
    if len(audio) > settings.stt_max_bytes:
        logger.warning(
            "Inbound audio is %d bytes (> STT cap %d) — skipping transcription",
            len(audio),
            settings.stt_max_bytes,
        )
        return None

    if settings.stt_provider == "gemini":
        try:
            transcript = await asyncio.to_thread(_transcribe_gemini_sync, audio, mime)
            return Transcript(transcript.strip()) if transcript else None
        except Exception as exc:
            logger.warning("Gemini STT request failed (%s) — text fallback", exc)
            return None

    ext = storage.ext_for_mime(mime) or "ogg"
    files = {"file": (f"audio.{ext}", audio, mime)}
    if settings.stt_provider == "sarvam":
        # Saaras has its own multipart contract and returns JSON.  `unknown`
        # enables automatic detection of Hindi, Punjabi, English, and
        # code-mixed Indian speech.
        data = {
            # v3, not v4: v4 ignores `mode` and was seen translating Hindi
            # speech into English ("aap kaise ho" → "You how are you?").
            "model": settings.stt_model or "saaras:v3",
            "language_code": settings.stt_language or "unknown",
            "mode": "transcribe",
        }
        headers = {"api-subscription-key": settings.stt_api_key}
        endpoint = f"{_base_url()}/speech-to-text"
    else:
        data = {"model": settings.stt_model, "response_format": "text"}
        if settings.stt_language:
            data["language"] = settings.stt_language
        headers = {"Authorization": f"Bearer {settings.stt_api_key}"}
        endpoint = f"{_base_url()}/audio/transcriptions"

    try:
        async with httpx.AsyncClient(timeout=settings.stt_timeout_seconds) as client:
            response = await client.post(
                endpoint,
                data=data,
                files=files,
                headers=headers,
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("STT request failed (%s) — text fallback", exc)
        return None

    language_code = None
    if settings.stt_provider == "sarvam":
        try:
            body = response.json()
            transcript = (body.get("transcript") or "").strip()
            language_code = body.get("language_code") or None
        except (ValueError, AttributeError):
            logger.warning("Sarvam STT returned invalid JSON — text fallback")
            return None
    else:
        # response_format=text → plain-text body (not JSON).
        transcript = response.text.strip()
    return Transcript(transcript, language_code) if transcript else None
