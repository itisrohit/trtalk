"""Deleting a channel's conversation history (admin: disconnect + delete).

Contacts, conversations, messages and memories go; leads stay (unlinked) and
other channels are untouched.
"""

import uuid

import pytest
from sqlmodel import select

from app.models import Contact, Conversation, Memory, Message
from app.modules.handoff.models import Lead
from app.services.admin_service import create_admin_access_token


@pytest.fixture
def admin_headers() -> dict:
    token = create_admin_access_token(uuid.uuid4(), "admin@test.local", "super_admin")
    return {"Authorization": f"Bearer {token}"}


async def seed(session, channel: str, external_id: str) -> Contact:
    contact = Contact(channel=channel, external_id=external_id, display_name=external_id)
    session.add(contact)
    await session.flush()
    conversation = Conversation(contact_id=contact.id)
    session.add(conversation)
    await session.flush()
    session.add_all([
        Message(conversation_id=conversation.id, direction="in", type="text", text="hi"),
        Message(conversation_id=conversation.id, direction="out", type="text", text="hello"),
        Memory(contact_id=contact.id, content="likes NCERT books"),
        Lead(contact_id=contact.id, name="Aadeep", phone="917330947711", interest="NCERT"),
    ])
    await session.flush()
    return contact


async def test_requires_admin_and_a_channel(client, admin_headers):
    assert (await client.delete("/admin/contacts?channel=whatsapp")).status_code == 401
    assert (await client.delete("/admin/contacts", headers=admin_headers)).status_code == 422


async def test_deletes_channel_history_but_keeps_leads(client, session, admin_headers):
    wa = await seed(session, "whatsapp", "bsuid-DEL-WA")
    tg = await seed(session, "telegram", "tg-DEL-KEEP")

    response = await client.delete("/admin/contacts?channel=whatsapp", headers=admin_headers)

    assert response.status_code == 200
    assert response.json() == {"deleted_contacts": 1, "deleted_messages": 2}
    assert (await session.exec(select(Contact).where(Contact.id == wa.id))).first() is None
    remaining = (await session.exec(select(Contact.channel))).all()
    assert "whatsapp" not in remaining and "telegram" in remaining
    assert (await session.exec(select(Memory).where(Memory.contact_id == wa.id))).all() == []
    assert len((await session.exec(select(Message))).all()) == 2  # telegram's only

    leads = (await session.exec(select(Lead).order_by(Lead.contact_id))).all()
    assert len(leads) == 2  # the WhatsApp lead survived …
    orphan = next(lead for lead in leads if lead.contact_id is None)
    assert orphan.phone == "917330947711"  # … with its own contact details
    assert any(lead.contact_id == tg.id for lead in leads)


async def test_leads_page_still_lists_unlinked_leads(client, session, admin_headers):
    await seed(session, "whatsapp", "bsuid-DEL-LEADS")
    await client.delete("/admin/contacts?channel=whatsapp", headers=admin_headers)

    response = await client.get("/admin/modules/handoff/leads", headers=admin_headers)

    items = response.json()["items"]
    assert response.json()["total"] == 1
    assert items[0]["contact_id"] is None and items[0]["name"] == "Aadeep"


async def test_empty_channel_is_a_no_op(client, admin_headers):
    response = await client.delete("/admin/contacts?channel=whatsapp", headers=admin_headers)
    assert response.json() == {"deleted_contacts": 0, "deleted_messages": 0}
