"""Provider wiring for the Groq-chat + Sarvam-LID setup (no network)."""

from app.core import llm
from app.core.config import settings
from app.services import language_id


def test_reasoning_effort_sent_raw_to_openai_compatible_host(monkeypatch):
    captured = {}
    monkeypatch.setattr(llm, "init_chat_model", lambda model, **kw: captured.update(kw))
    monkeypatch.setattr(settings, "openai_api_key", "groq-key")
    monkeypatch.setattr(settings, "openai_base_url", "https://api.groq.com/openai/v1")
    monkeypatch.setattr(settings, "llm_reasoning_effort", "none")

    llm.get_chat_model(provider="openai", model="qwen/qwen3.8-27b")

    assert captured["extra_body"] == {"reasoning_effort": "none"}
    assert captured["base_url"] == "https://api.groq.com/openai/v1"


def test_reasoning_effort_omitted_when_unset(monkeypatch):
    captured = {}
    monkeypatch.setattr(llm, "init_chat_model", lambda model, **kw: captured.update(kw))
    monkeypatch.setattr(settings, "openai_api_key", "key")
    monkeypatch.setattr(settings, "llm_reasoning_effort", None)

    llm.get_chat_model(provider="openai", model="gpt-5-mini")

    assert "extra_body" not in captured


def test_lid_never_sends_a_groq_key_to_sarvam(monkeypatch):
    monkeypatch.setattr(settings, "sarvam_api_key", None)
    monkeypatch.setattr(settings, "openai_api_key", "groq-key")
    monkeypatch.setattr(settings, "openai_base_url", "https://api.groq.com/openai/v1")
    assert language_id._api_key() is None

    monkeypatch.setattr(settings, "sarvam_api_key", "sarvam-key")
    assert language_id._api_key() == "sarvam-key"


def test_lid_reuses_openai_key_only_when_it_points_at_sarvam(monkeypatch):
    monkeypatch.setattr(settings, "sarvam_api_key", None)
    monkeypatch.setattr(settings, "openai_api_key", "sarvam-key")
    monkeypatch.setattr(settings, "openai_base_url", "https://api.sarvam.ai/v1")
    assert language_id._api_key() == "sarvam-key"


async def test_romanize_keeps_lines_and_skips_latin(monkeypatch):
    sent = []

    class Resp:
        def __init__(self, text): self._text = text
        def raise_for_status(self): pass
        def json(self): return {"transliterated_text": f"ROMAN({self._text})"}

    class Client:
        def __init__(self, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, json=None):
            sent.append(json)
            return Resp(json["input"])

    monkeypatch.setattr(settings, "sarvam_api_key", "sarvam-key")
    monkeypatch.setattr(language_id.httpx, "AsyncClient", Client)

    out = await language_id.romanize("नमस्ते जी\n\nOK thanks", "hi-IN")

    assert out == "ROMAN(नमस्ते जी)\n\nOK thanks"  # blank line + Latin line untouched
    assert sent == [{"input": "नमस्ते जी", "source_language_code": "hi-IN",
                     "target_language_code": "en-IN"}]
    assert await language_id.romanize("already roman", "hi-IN") == "already roman"


async def test_enforce_script_only_for_latin_lock(monkeypatch):
    from app.schemas.ingest import OutboundMessage
    from app.services import orchestrator

    async def fake_romanize(text, lang):
        return "roman text"

    monkeypatch.setattr(language_id, "romanize", fake_romanize)
    latin = language_id.LanguagePreference("hi-IN", "Latn")
    native = language_id.LanguagePreference("pa-IN", "Guru")

    slipped = [OutboundMessage(type="text", text="हमारे पास books हैं")]
    assert (await orchestrator._enforce_script(slipped, latin))[0].text == "roman text"

    gurmukhi_ok = [OutboundMessage(type="text", text="ਸਾਡੇ ਕੋਲ ਕਿਤਾਬਾਂ ਹਨ")]
    assert (await orchestrator._enforce_script(gurmukhi_ok, native))[0].text == "ਸਾਡੇ ਕੋਲ ਕਿਤਾਬਾਂ ਹਨ"
