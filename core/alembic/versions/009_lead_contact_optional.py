"""Leads outlive their conversation: contact_id nullable, ON DELETE SET NULL.

Deleting a contact's conversation history (admin "disconnect + delete") must
not erase the sales list — a lead keeps its own name/phone/interest copy.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "009_lead_contact_optional"
down_revision: Union[str, Sequence[str], None] = "008_bot_paused"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("leads", "contact_id", nullable=True)
    op.drop_constraint("leads_contact_id_fkey", "leads", type_="foreignkey")
    op.create_foreign_key(
        "leads_contact_id_fkey", "leads", "contacts", ["contact_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.execute("DELETE FROM leads WHERE contact_id IS NULL")
    op.drop_constraint("leads_contact_id_fkey", "leads", type_="foreignkey")
    op.create_foreign_key(
        "leads_contact_id_fkey", "leads", "contacts", ["contact_id"], ["id"]
    )
    op.alter_column("leads", "contact_id", nullable=False)
