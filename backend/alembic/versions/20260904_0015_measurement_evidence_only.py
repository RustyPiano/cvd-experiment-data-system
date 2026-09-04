"""Stop treating measurement assignments as sample-wide verdicts.

Revision ID: 20260904_0015
Revises: 20260903_0014
"""

import sqlalchemy as sa

from alembic import op

revision = "20260904_0015"
down_revision = "20260903_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    states = sa.Table("sample_revision_states", sa.MetaData(), autoload_with=bind)
    samples = sa.Table("samples", sa.MetaData(), autoload_with=bind)
    bind.execute(
        states.update().values(
            growth_state="unknown",
            identity_state="unknown",
            material_summary=None,
            evidence_assertion_ids=[],
        )
    )
    bind.execute(
        samples.update().values(
            actual_state="unknown",
            identity_state="unknown",
            actual_material_summary=None,
        )
    )


def downgrade() -> None:
    # Original measurements and assertions are untouched; do not recreate inferred verdicts.
    pass
