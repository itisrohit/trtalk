from app.core.config import settings
from app.models import Contact, Memory
from app.services import memory_service


class FakeEmbeddings:
    def __init__(self):
        self.calls: list[str] = []

    async def aembed_query(self, text: str) -> list[float]:
        self.calls.append(text)
        return [0.0] * settings.embedding_dim


async def test_retrieve_skips_embedding_for_contact_without_memories(session, monkeypatch):
    """A first-time contact should not pay for a retrieval embedding call."""
    import app.core.embeddings as embeddings_mod

    fake = FakeEmbeddings()
    monkeypatch.setattr(settings, "google_api_key", "test-key")
    monkeypatch.setattr(embeddings_mod, "get_embeddings", lambda: fake)

    contact = Contact(channel="whatsapp", external_id="new-contact")
    session.add(contact)
    await session.flush()

    result = await memory_service.retrieve_relevant(session, contact.id, "hello")

    assert result == []
    assert fake.calls == []
