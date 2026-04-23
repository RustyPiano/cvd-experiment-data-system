"""expand mvp 0.2 payload handling

Revision ID: 20260423_0008
Revises: 20260423_0007
Create Date: 2026-04-23 18:20:00.000000
"""

from collections.abc import Sequence

revision: str = "20260423_0008"
down_revision: str | None = "20260423_0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Stage marker revision for application-layer payload normalization rollout."""


def downgrade() -> None:
    """No schema objects to revert for this application-layer rollout."""
