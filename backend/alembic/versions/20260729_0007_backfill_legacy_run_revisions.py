"""backfill immutable revisions for existing production runs

Revision ID: 20260729_0007
Revises: 20260729_0006
Create Date: 2026-07-29 23:00:00.000000
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa

from alembic import op

revision: str = "20260729_0007"
down_revision: str | None = "20260729_0006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

BACKFILL_REASON = "Backfilled from production revision 20260728_0002"


def _canonical_content(content: dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps(
            content,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()


def _new_id(bind: sa.Connection) -> uuid.UUID | str:
    value = uuid.uuid4()
    return value.hex if bind.dialect.name == "sqlite" else value


def _uuid_text(value: Any) -> str:
    return str(uuid.UUID(str(value)))


def _growth_state(value: Any) -> str:
    return {
        "growth_present": "present",
        "asserted": "present",
        "no_growth": "absent",
        "uncertain": "uncertain",
    }.get(str(value), "unknown")


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    tables = {
        name: sa.Table(name, metadata, autoload_with=bind)
        for name in (
            "characterization_records",
            "experiment_module_payloads",
            "experiment_runs",
            "run_contributors",
            "run_revisions",
            "sample_revision_associations",
            "sample_revision_states",
            "samples",
            "users",
        )
    }
    runs = tables["experiment_runs"]
    revisions = tables["run_revisions"]
    modules = tables["experiment_module_payloads"]
    samples = tables["samples"]
    records = tables["characterization_records"]

    legacy_runs = list(
        bind.execute(
            sa.select(runs).where(
                sa.cast(runs.c.status, sa.String).in_(("locked", "reviewed")),
                runs.c.current_revision_id.is_(None),
            )
        ).mappings()
    )
    for run in legacy_runs:
        revision_id = _new_id(bind)
        module_snapshot = {
            row.module_key: row.payload_json
            for row in bind.execute(
                sa.select(modules.c.module_key, modules.c.payload_json)
                .where(modules.c.experiment_run_id == run["id"])
                .order_by(modules.c.module_key)
            )
        }
        content = {
            "run": {
                "id": _uuid_text(run["id"]),
                "run_code": run["run_code"],
                "experiment_date": run["experiment_date"].isoformat(),
                "objective": run["objective"],
                "setup_ref": _uuid_text(run["setup_ref"]) if run["setup_ref"] else None,
                "setup_ref_version": run["setup_ref_version"],
                "setup_ref_snapshot": run["setup_ref_snapshot_json"],
            },
            "modules": module_snapshot,
        }
        locked_at = run["locked_at"] or run["updated_at"] or run["created_at"]
        bind.execute(
            sa.insert(revisions).values(
                id=revision_id,
                experiment_run_id=run["id"],
                revision_number=1,
                supersedes_revision_id=None,
                schema_version="v4.0-alpha.2",
                schema_status="internal_validation",
                status=run["status"],
                content_json=content,
                content_sha256=_canonical_content(content),
                correction_reason=BACKFILL_REASON,
                locked_by_id=run["owner_id"],
                reviewed_by_id=None,
                locked_at=locked_at,
                reviewed_at=None,
                superseded_at=None,
            )
        )

        owner = (
            bind.execute(sa.select(tables["users"]).where(tables["users"].c.id == run["owner_id"]))
            .mappings()
            .one()
        )
        for role in ("recorded_by", "performed_by"):
            bind.execute(
                sa.insert(tables["run_contributors"]).values(
                    id=_new_id(bind),
                    run_revision_id=revision_id,
                    user_id=run["owner_id"],
                    role=role,
                    contribution_role="legacy_run_owner",
                    user_snapshot_json={
                        "id": _uuid_text(owner["id"]),
                        "name": owner["name"],
                        "email": owner["email"],
                    },
                )
            )

        sample_rows = list(
            bind.execute(
                sa.select(samples).where(samples.c.experiment_run_id == run["id"])
            ).mappings()
        )
        for sample in sample_rows:
            bind.execute(
                sa.insert(tables["sample_revision_associations"]).values(
                    id=_new_id(bind),
                    sample_id=sample["id"],
                    run_revision_id=revision_id,
                    sample_snapshot_json={
                        "sample_code": sample["sample_code"],
                        "role": sample["role"],
                        "source_substrate_id": (
                            _uuid_text(sample["source_substrate_id"])
                            if sample["source_substrate_id"]
                            else None
                        ),
                        "source_substrate_snapshot": sample["source_substrate_snapshot_json"],
                    },
                )
            )
            bind.execute(
                sa.insert(tables["sample_revision_states"]).values(
                    id=_new_id(bind),
                    sample_id=sample["id"],
                    run_revision_id=revision_id,
                    growth_state=_growth_state(sample["actual_state"]),
                    identity_state=sample["identity_state"],
                    material_summary=sample["actual_material_summary"],
                    evidence_assertion_ids=[],
                )
            )
        bind.execute(
            sa.update(samples)
            .where(samples.c.experiment_run_id == run["id"])
            .values(run_revision_id=revision_id)
        )

        for record in bind.execute(
            sa.select(records).where(records.c.experiment_run_id == run["id"])
        ).mappings():
            bind.execute(
                sa.update(records)
                .where(records.c.id == record["id"])
                .values(
                    run_revision_id=revision_id,
                    performed_by_id=record["performed_by_id"] or run["owner_id"],
                    measured_at=record["measured_at"] or record["created_at"] or locked_at,
                    sample_region=record["sample_region"]
                    or {"geometry_type": "legacy_unspecified"},
                    method_instrument=record["method_instrument"] or "legacy_unspecified",
                )
            )

        bind.execute(
            sa.update(runs).where(runs.c.id == run["id"]).values(current_revision_id=revision_id)
        )

    association_pairs = {
        (row.sample_id, row.run_revision_id)
        for row in bind.execute(
            sa.select(
                tables["sample_revision_associations"].c.sample_id,
                tables["sample_revision_associations"].c.run_revision_id,
            )
        )
    }
    for sample in bind.execute(
        sa.select(samples).where(samples.c.run_revision_id.is_not(None))
    ).mappings():
        pair = (sample["id"], sample["run_revision_id"])
        if pair in association_pairs:
            continue
        bind.execute(
            sa.insert(tables["sample_revision_associations"]).values(
                id=_new_id(bind),
                sample_id=sample["id"],
                run_revision_id=sample["run_revision_id"],
                sample_snapshot_json={
                    "sample_code": sample["sample_code"],
                    "role": sample["role"],
                    "source_substrate_id": (
                        _uuid_text(sample["source_substrate_id"])
                        if sample["source_substrate_id"]
                        else None
                    ),
                    "source_substrate_snapshot": sample["source_substrate_snapshot_json"],
                },
            )
        )

    state_pairs = {
        (row.sample_id, row.run_revision_id)
        for row in bind.execute(
            sa.select(
                tables["sample_revision_states"].c.sample_id,
                tables["sample_revision_states"].c.run_revision_id,
            )
        )
    }
    associations = bind.execute(
        sa.select(
            tables["sample_revision_associations"].c.sample_id,
            tables["sample_revision_associations"].c.run_revision_id,
            samples.c.run_revision_id.label("current_revision_id"),
            samples.c.actual_state,
            samples.c.identity_state,
            samples.c.actual_material_summary,
        ).join(
            samples,
            samples.c.id == tables["sample_revision_associations"].c.sample_id,
        )
    ).mappings()
    for association in associations:
        pair = (association["sample_id"], association["run_revision_id"])
        if pair in state_pairs:
            continue
        is_current = association["run_revision_id"] == association["current_revision_id"]
        bind.execute(
            sa.insert(tables["sample_revision_states"]).values(
                id=_new_id(bind),
                sample_id=association["sample_id"],
                run_revision_id=association["run_revision_id"],
                growth_state=(
                    _growth_state(association["actual_state"]) if is_current else "unknown"
                ),
                identity_state=association["identity_state"] if is_current else "unknown",
                material_summary=(association["actual_material_summary"] if is_current else None),
                evidence_assertion_ids=[],
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    runs = sa.Table("experiment_runs", metadata, autoload_with=bind)
    revisions = sa.Table("run_revisions", metadata, autoload_with=bind)
    samples = sa.Table("samples", metadata, autoload_with=bind)
    records = sa.Table("characterization_records", metadata, autoload_with=bind)

    backfilled = list(
        bind.execute(
            sa.select(
                revisions.c.id,
                revisions.c.experiment_run_id,
            ).where(revisions.c.correction_reason == BACKFILL_REASON)
        )
    )
    for revision_id, run_id in backfilled:
        bind.execute(
            sa.update(records)
            .where(records.c.run_revision_id == revision_id)
            .values(run_revision_id=None)
        )
        bind.execute(
            sa.update(samples)
            .where(samples.c.run_revision_id == revision_id)
            .values(run_revision_id=None)
        )
        bind.execute(
            sa.update(runs)
            .where(
                runs.c.id == run_id,
                runs.c.current_revision_id == revision_id,
            )
            .values(current_revision_id=None)
        )
        bind.execute(sa.delete(revisions).where(revisions.c.id == revision_id))
