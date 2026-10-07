"""Sarvam Language Identification for deterministic reply language locks.

Chat models can understand Roman Hindi and Roman Punjabi but cannot always
distinguish them reliably from prompt wording alone.  Sarvam's dedicated LID
endpoint returns the language *and* script of the newest customer text.
"""

import asyncio
from dataclasses import dataclass
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_LID_URL = "https://api.sarvam.ai/text-lid"
_VALID_LANGUAGES = {"en-IN", "hi-IN", "pa-IN"}
_VALID_SCRIPTS = {"Latn", "Deva", "Guru"}


@dataclass(frozen=True)
class LanguagePreference:
    language_code: str
    script_code: str

    @property
    def instruction(self) -> str:
        """A direct, model-readable output requirement for this turn."""
        rules = {
            ("en-IN", "Latn"): "Reply in English using Latin characters.",
            ("hi-IN", "Latn"): (
                "Reply in Roman Hindi/Hinglish using Latin characters only. "
                "Do not reply in Punjabi, Roman Punjabi, Gurmukhi, or Devanagari."
            ),
            ("pa-IN", "Latn"): (
                "Reply in Roman Punjabi using Latin characters only. "
                "Do not reply in Hindi, Roman Hindi, Gurmukhi, or Devanagari."
            ),
            ("hi-IN", "Deva"): "Reply in Hindi using Devanagari script only.",
            ("pa-IN", "Guru"): "Reply in Punjabi using Gurmukhi script only.",
        }
        if (self.language_code, self.script_code) in rules:
            return rules[(self.language_code, self.script_code)]
        if self.script_code == "Latn":
            # Voice notes: any spoken language (or "und" when unidentified).
            return (
                "Reply in the language the customer used, written in Latin "
                "(Roman) characters only — never in a native Indic script."
            )
        return "Match the detected customer language and script exactly."


def _api_key() -> str | None:
    # SARVAM_API_KEY first: when chat runs on another OpenAI-compatible host
    # (e.g. Groq), OPENAI_API_KEY is that host's key and Sarvam would reject
    # it. The OpenAI key is reused only when it actually points at Sarvam
    # (the docker-compose.sarvam.yml chat overlay).
    if settings.sarvam_api_key:
        return settings.sarvam_api_key
    if "sarvam.ai" in (settings.openai_base_url or ""):
        return settings.openai_api_key
    return None


async def identify(text: str | None) -> LanguagePreference | None:
    """Identify meaningful customer text; failures never block a reply."""
    text = (text or "").strip()
    api_key = _api_key()
    if not settings.sarvam_lid_enabled or len(text) < 3 or not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=settings.sarvam_lid_timeout_seconds) as client:
            response = await client.post(
                _LID_URL,
                headers={"api-subscription-key": api_key},
                json={"input": text[:1000]},
            )
            response.raise_for_status()
        data = response.json()
        language = data.get("language_code")
        script = data.get("script_code")
        if language in _VALID_LANGUAGES and script in _VALID_SCRIPTS:
            return LanguagePreference(language, script)
        logger.info("Sarvam LID returned unsupported result: %s / %s", language, script)
    except (httpx.HTTPError, ValueError, TypeError):
        logger.warning("Sarvam Language ID unavailable; using prompt fallback")
    return None


# ---------------------------------------------------------------------------
# Script enforcement — the deterministic backstop for a Latin-script lock.
# Models sometimes copy the script of a native-script transcript even when
# told to answer in Roman; transliterating the reply guarantees the script
# without a second LLM call. Only runs when the reply actually slipped.
# ---------------------------------------------------------------------------

_TRANSLIT_URL = "https://api.sarvam.ai/transliterate"
_TRANSLIT_LANGUAGES = {
    "bn-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN",
}
_TRANSLIT_MAX_CHARS = 1000


def has_indic_script(text: str) -> bool:
    """Any character from the Indic Unicode blocks (Devanagari … Malayalam)."""
    return any("ऀ" <= ch <= "ൿ" for ch in text)


def _source_language(text: str, language_code: str) -> str:
    if language_code in _TRANSLIT_LANGUAGES:
        return language_code
    if any("਀" <= ch <= "੿" for ch in text):  # Gurmukhi
        return "pa-IN"
    return "hi-IN"  # Devanagari, the common case


async def romanize(text: str, language_code: str) -> str:
    """Rewrite Indic-script text in Roman letters; the original on any failure.

    Line by line (in parallel): the API drops line breaks, and short replies
    rarely have more than a few lines.
    """
    api_key = _api_key()
    if not text or not api_key or not has_indic_script(text):
        return text
    source = _source_language(text, language_code)
    lines = text.split("\n")

    async def one(client: httpx.AsyncClient, line: str) -> str:
        if not has_indic_script(line):
            return line
        response = await client.post(
            _TRANSLIT_URL,
            headers={"api-subscription-key": api_key},
            json={
                "input": line[:_TRANSLIT_MAX_CHARS],
                "source_language_code": source,
                "target_language_code": "en-IN",
            },
        )
        response.raise_for_status()
        return response.json()["transliterated_text"]

    try:
        async with httpx.AsyncClient(timeout=settings.sarvam_lid_timeout_seconds) as client:
            out = await asyncio.gather(*(one(client, line) for line in lines))
        return "\n".join(out)
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        logger.warning("Sarvam transliteration unavailable; sending reply as-is")
        return text
