"""agent_config — DB-editable system prompt + tool enable/config (singleton)

Revision ID: 003_agent_config
Revises: 002_domain
Create Date: 2026-06-09

"""
import uuid
from datetime import datetime, timezone

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "003_agent_config"
down_revision: Union[str, Sequence[str], None] = "002_domain"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Keep in sync with app.models.agent_config.DEFAULT_SYSTEM_PROMPT
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
    "- Use the available tools whenever they help you answer.\n"
    "- If you don't know something, say so honestly; never make up facts.\n"
    "- If the user asks to talk to a person, use the human handoff tool."
)


def upgrade() -> None:
    table = op.create_table(
        "agent_config",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("enabled_tools", JSONB(), nullable=False, server_default="{}"),
        sa.Column("tool_config", JSONB(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Seed the singleton row so a fresh deployment answers out of the box
    op.bulk_insert(
        table,
        [
            {
                "id": uuid.uuid4(),
                "system_prompt": DEFAULT_SYSTEM_PROMPT,
                "enabled_tools": {},
                "tool_config": {},
                "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        ],
    )


def downgrade() -> None:
    op.drop_table("agent_config")
