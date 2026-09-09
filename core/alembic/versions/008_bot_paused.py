"""Add a global operator pause switch for automated bot turns."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "008_bot_paused"
down_revision: Union[str, Sequence[str], None] = "007_inbound_coalescing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agent_config",
        sa.Column("bot_paused", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("agent_config", "bot_paused")
