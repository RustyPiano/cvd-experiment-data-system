"""Separate planar form from target geometry without rewriting historical payloads."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260909_0016"
down_revision: str | None = "20260904_0015"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("target_specs") as batch:
        batch.add_column(sa.Column("film_form", sa.String(32), nullable=True))
        batch.add_column(sa.Column("dimensional_form_other", sa.String(128), nullable=True))
        batch.add_column(sa.Column("in_plane_outline_other", sa.String(128), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("target_specs") as batch:
        batch.drop_column("in_plane_outline_other")
        batch.drop_column("dimensional_form_other")
        batch.drop_column("film_form")
