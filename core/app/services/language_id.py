"""Sarvam Language Identification for deterministic reply language locks.

Chat models can understand Roman Hindi and Roman Punjabi but cannot always
distinguish them reliably from prompt wording alone.  Sarvam's dedicated LID
endpoint returns the language *and* script of the newest customer text.
"""

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
        return rules.get(
            (self.language_code, self.script_code),
            "Match the detected customer language and script exactly.",
        )


def _api_key() -> str | None:
    # The active Sarvam chat deployment supplies its working key through the
    # OpenAI-compatible setting. Prefer that same key so LID and chat cannot
    # silently use different credentials.
    return settings.openai_api_key or settings.sarvam_api_key


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
