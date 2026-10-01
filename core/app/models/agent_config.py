"""Agent configuration — the DB-editable knobs behind the orchestrator.

Singleton table (TrTalk = one project per deployment, §4): the system prompt
the operator edits from the admin (Sprint 5), which tools are enabled, and
per-module settings. Migration 003 seeds the default row.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def _utcnow_naive() -> datetime:
    """Naive UTC now (asyncpg requires naive datetimes for TIMESTAMP columns)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# Seed value — operators rewrite it from the admin panel in their own
# language/voice. "Always reply in the user's language" is what localizes
# the agent (all LLM-facing strings in the codebase are English).
DEFAULT_SYSTEM_PROMPT = (
    "You are the company's virtual assistant. You serve customers over chat "
    "in a cordial, clear and concise way. This is a messaging channel: keep "
    "replies short, and format only with light standard Markdown — **bold**, "
    "*italic*, `code`, \"- \" bullets, [label](url) links — never headings "
    "or tables (each channel renders it natively, ADR-007).\n\n"
    "Language rules (follow the latest customer-written text):\n"
    "- If the customer uses only one language, reply only in that language; do not leave ordinary English words in a Hindi or Punjabi reply. Translate or rephrase every ordinary term, including common business and technical terms.\n"
    "- Match both language and script: use Gurmukhi for Punjabi written in Gurmukhi, Devanagari for Hindi written in Devanagari, and Latin characters for Roman Hindi or Roman Punjabi.\n"
    "- For mixed messages such as Hinglish or Roman Punjabi-English, reply in the same script and mirror the customer's language mix and approximate balance. Do not convert the whole reply into one language or another script.\n"
    "- For a message containing only an attachment and no caption, use the language and script from the latest text written by that customer. Never infer it from the attachment or from an earlier assistant reply. If the customer has never sent text, use English.\n"
    "- Keep literal names, numbers, and exact IDs unchanged when needed, but translate the words around them.\n\n"
    "Rules:\n"
    "- Use a tool only when it is directly relevant to the customer's latest request; ignore unrelated tool results.\n"
    "- If you don't know something, say so honestly; never make up facts.\n"
    "- If the user asks to talk to a person, use the human handoff tool."
)


class AgentConfig(SQLModel, table=True):
    """Editable agent settings (system prompt, tool enable/config)."""

    __tablename__ = "agent_config"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    # The persona/rules the orchestrator injects as the system message
    system_prompt: str = Field(
        default=DEFAULT_SYSTEM_PROMPT,
        sa_column=Column(Text, nullable=False),
    )

    bot_paused: bool = Field(default=False, nullable=False)

    # {tool_name: bool} — missing key = enabled (new modules work out of the box)
    enabled_tools: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default="{}"),
    )

    # {module_name: {…}} — validated by each module's config_schema()
    tool_config: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default="{}"),
    )

    updated_at: datetime = Field(default_factory=_utcnow_naive, nullable=False)
