"""collapse viewer role to member (viewer role retired)

The 'viewer' role is retired: a small lab has no real read-only users, and the
role only added permission branches everywhere. Any existing viewer users are
converted to 'member'. The Postgres enum 'user_role' keeps its 'viewer' value
(removing an enum value is unsupported/unsafe in place); it simply becomes
unused.

Revision ID: 20260611_0030
Revises: 20260610_0029
Create Date: 2026-06-11 00:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260611_0030"
down_revision: str | None = "20260610_0029"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_USERS = sa.table("users", sa.column("role", sa.String()))


def upgrade() -> None:
    op.get_bind().execute(
        _USERS.update().where(_USERS.c.role == "viewer").values(role="member")
    )


def downgrade() -> None:
    # Original viewer assignments are not recoverable; no-op.
    pass
