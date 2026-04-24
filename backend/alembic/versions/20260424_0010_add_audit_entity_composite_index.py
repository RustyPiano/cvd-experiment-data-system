"""add audit entity composite index

Revision ID: 20260424_0010
Revises: 20260424_0009
Create Date: 2026-04-24 13:20:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260424_0010"
down_revision: str | None = "20260424_0009"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_audit_events_entity_type_entity_id",
        "audit_events",
        ["entity_type", "entity_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_audit_events_entity_type_entity_id", table_name="audit_events")
