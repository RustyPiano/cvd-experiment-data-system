# Setup Methods Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the V1 Setup / Methods data foundation so every submitted or locked CVD experiment has a traceable setup snapshot, setup diagram, methods text, analysis grouping keys, and exportable context.

**Architecture:** V1 adds an `experiment_setup_snapshots` table and keeps setup/methods out of `experiment_module_payloads`. The backend owns snapshot hashing, setup diagram validation, submission/lock gates, clone semantics, and export context. The frontend treats `setup_methods` as an editor section with its own API, not as a module payload.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, PostgreSQL JSONB, React, TypeScript, Vite, Ant Design, TanStack Query, `uv`, `bun`.

---

## Scope

Implement V1 only:

- `experiment_setup_snapshots`
- V1 seed setup templates, read-only
- experiment-level setup diagram files using `asset_role=setup_diagram`
- setup methods API and warnings response
- submit and lock validation
- clone behavior
- JSON, Excel, and analysis export context
- frontend setup methods section
- admin visibility for records missing setup/methods

Do not implement in this plan:

- persistent `experimental_setups` management UI/API
- Recipe `default_setup_id`
- template-level file assets
- external field mapping management
- AI extraction from papers/PPT/Excel

## File Structure

Backend files:

- Create `backend/app/models/setup_methods.py` for `ExperimentSetupSnapshot`.
- Modify `backend/app/models/file_asset.py` to add `asset_role`.
- Modify `backend/app/models/__init__.py` to import the new model.
- Create `backend/alembic/versions/20260605_0019_add_setup_methods_v1.py`.
- Create `backend/app/schemas/setup_methods.py` for API request/response models.
- Create `backend/app/repositories/setup_methods_repository.py`.
- Create `backend/app/services/setup_methods_hash_service.py`.
- Create `backend/app/services/setup_methods_service.py`.
- Create `backend/app/services/setup_method_template_service.py` for V1 seed templates.
- Create `backend/app/api/v1/endpoints/setup_method_templates.py` for read-only seed template routes.
- Modify `backend/app/api/v1/router.py` to include the seed template router.
- Modify `backend/app/api/v1/endpoints/experiments.py`.
- Modify `backend/app/api/v1/endpoints/files.py`.
- Modify `backend/app/schemas/file_asset.py`.
- Modify `backend/app/services/file_asset_service.py`.
- Modify `backend/app/services/file_storage_service.py`.
- Modify `backend/app/repositories/file_asset_repository.py`.
- Modify `backend/app/services/experiment_validation_service.py`.
- Modify `backend/app/services/experiment_service.py`.
- Modify `backend/app/services/experiment_export_service.py`.
- Modify `backend/app/schemas/experiment.py`.
- Modify `backend/app/repositories/experiment_repository.py`.
- Modify `backend/app/services/admin_dashboard_service.py`.
- Modify `backend/app/schemas/admin_dashboard.py`.

Backend tests:

- Create `backend/tests/models/test_setup_methods_model.py`.
- Create `backend/tests/services/test_setup_methods_hash_service.py`.
- Create `backend/tests/api/test_setup_methods.py`.
- Create `backend/tests/api/test_setup_method_templates.py`.
- Create `backend/tests/helpers/__init__.py`.
- Create `backend/tests/helpers/setup_methods.py`.
- Modify `backend/tests/api/test_files.py`.
- Modify `backend/tests/services/test_experiment_validation_service.py`.
- Modify `backend/tests/api/test_experiments.py`.
- Modify `backend/tests/api/test_experiment_exports.py`.
- Modify `backend/tests/api/test_experiment_audit.py`.
- Modify `backend/tests/api/test_experiment_recipes.py`.
- Modify `backend/tests/api/test_admin_dashboard.py`.

Frontend files:

- Modify `frontend/src/shared/types/api.ts`.
- Modify `frontend/src/features/experiments/api.ts`.
- Modify `frontend/src/features/experiments/editor-types.ts`.
- Modify `frontend/src/features/experiments/use-experiment-editor.ts`.
- Modify `frontend/src/features/experiments/experiment-editor-page.tsx`.
- Create `frontend/src/features/experiments/components/setup-methods-section.tsx`.
- Create `frontend/src/features/experiments/components/setup-methods-section.test.tsx`.
- Modify `frontend/src/features/experiments/components/completion-indicator.tsx`.
- Modify `frontend/src/features/experiments/experiment-files-page.tsx`.
- Modify `frontend/src/features/admin-dashboard/admin-dashboard-page.tsx`.
- Modify `frontend/src/shared/types/api.ts` for dashboard fields.

Frontend tests:

- Modify `frontend/src/features/experiments/use-experiment-editor.test.tsx`.
- Modify `frontend/src/features/experiments/experiment-editor-page.test.tsx`.
- Modify `frontend/src/features/experiments/experiment-files-page.test.tsx`.
- Modify `frontend/src/features/admin-dashboard/admin-dashboard-page.test.tsx`.

## Task 1: Database Schema And ORM Model

**Files:**
- Create: `backend/alembic/versions/20260605_0019_add_setup_methods_v1.py`
- Create: `backend/app/models/setup_methods.py`
- Modify: `backend/app/models/file_asset.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/models/test_setup_methods_model.py`

- [ ] **Step 1: Write failing model test**

Create `backend/tests/models/test_setup_methods_model.py`:

```python
from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.experiment import ExperimentRun, QualityLabel
from app.models.file_asset import FileAsset
from app.models.setup_methods import ExperimentSetupSnapshot


def make_experiment(db_session, active_user, run_code: str) -> ExperimentRun:
    experiment = ExperimentRun(
        run_code=run_code,
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 6, 5),
        objective="setup methods model test",
        quality_label=QualityLabel.UNKNOWN,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)
    return experiment


def test_setup_snapshot_allows_draft_without_key_and_diagram(db_session, active_user) -> None:
    experiment = make_experiment(db_session, active_user, "CVD-2026-SM01")

    snapshot = ExperimentSetupSnapshot(
        experiment_run_id=experiment.id,
        setup_key_snapshot=None,
        setup_name_snapshot="Manual setup",
        setup_version_snapshot=1,
        apparatus_description_snapshot="Tube furnace with manual setup",
        methods_text_snapshot="Manual methods text",
        sample_placement_description_snapshot="Sample downstream of precursor",
        reaction_flow_description_snapshot="Ramp, hold, cool",
        unpublished_reason_snapshot="Internal protocol",
        is_same_as_template=False,
        snapshot_hash="",
        metadata_json={"semantic_context": {"pressure": "ambient"}},
    )
    db_session.add(snapshot)
    db_session.commit()
    db_session.refresh(snapshot)

    assert snapshot.setup_key_snapshot is None
    assert snapshot.diagram_file_asset_id is None


def test_setup_snapshot_is_unique_per_experiment(db_session, active_user) -> None:
    experiment = make_experiment(db_session, active_user, "CVD-2026-SM02")
    db_session.add_all(
        [
            ExperimentSetupSnapshot(
                experiment_run_id=experiment.id,
                setup_key_snapshot="manual:1111",
                setup_name_snapshot="Setup A",
                setup_version_snapshot=1,
                apparatus_description_snapshot="Apparatus",
                methods_text_snapshot="Methods",
                sample_placement_description_snapshot="Placement",
                reaction_flow_description_snapshot="Flow",
                unpublished_reason_snapshot="Internal",
                is_same_as_template=False,
                snapshot_hash="1111",
                metadata_json={},
            ),
            ExperimentSetupSnapshot(
                experiment_run_id=experiment.id,
                setup_key_snapshot="manual:2222",
                setup_name_snapshot="Setup B",
                setup_version_snapshot=1,
                apparatus_description_snapshot="Apparatus",
                methods_text_snapshot="Methods",
                sample_placement_description_snapshot="Placement",
                reaction_flow_description_snapshot="Flow",
                unpublished_reason_snapshot="Internal",
                is_same_as_template=False,
                snapshot_hash="2222",
                metadata_json={},
            ),
        ]
    )

    with pytest.raises(IntegrityError):
        db_session.commit()


def test_file_asset_defaults_to_characterization_role(db_session, active_user) -> None:
    experiment = make_experiment(db_session, active_user, "CVD-2026-SM03")
    file_asset = FileAsset(
        experiment_run_id=experiment.id,
        uploaded_by_id=active_user.id,
        original_name="raman.txt",
        storage_path="tests/raman.txt",
        size_bytes=5,
        sha256="a" * 64,
        method="Raman",
        file_category="raw",
    )
    db_session.add(file_asset)
    db_session.commit()
    db_session.refresh(file_asset)

    assert file_asset.asset_role == "characterization_file"
```

- [ ] **Step 2: Run model test to verify it fails**

Run:

```bash
cd backend && uv run pytest tests/models/test_setup_methods_model.py -q
```

Expected: FAIL with import or missing column errors for `ExperimentSetupSnapshot` and `asset_role`.

- [ ] **Step 3: Add ORM model and migration**

Create `backend/app/models/setup_methods.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class ExperimentSetupSnapshot(Base):
    __tablename__ = "experiment_setup_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("experiment_runs.id"),
        unique=True,
        index=True,
    )
    source_template_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_template_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    setup_key_snapshot: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    setup_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    setup_version_snapshot: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    institution_snapshot: Mapped[str | None] = mapped_column(String(128), nullable=True)
    apparatus_description_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    methods_text_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    sample_placement_description_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    reaction_flow_description_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    reference_paper_url_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    unpublished_reason_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    diagram_file_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("file_assets.id"),
        nullable=True,
        index=True,
    )
    is_same_as_template: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deviation_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    snapshot_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    metadata_json: Mapped[dict] = mapped_column(json_payload_type, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    experiment_run = relationship("ExperimentRun")
    diagram_file = relationship("FileAsset", foreign_keys=[diagram_file_asset_id])
```

Modify `backend/app/models/file_asset.py`:

```python
    asset_role: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="characterization_file",
        index=True,
    )
```

Create migration `backend/alembic/versions/20260605_0019_add_setup_methods_v1.py` with:

```python
"""add setup methods v1

Revision ID: 20260605_0019
Revises: 20260513_0018
Create Date: 2026-06-05 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260605_0019"
down_revision: str | None = "20260513_0018"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "file_assets",
        sa.Column(
            "asset_role",
            sa.String(length=64),
            nullable=False,
            server_default="characterization_file",
        ),
    )
    op.create_index("ix_file_assets_asset_role", "file_assets", ["asset_role"])
    op.alter_column("file_assets", "asset_role", server_default=None)

    payload_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")
    op.create_table(
        "experiment_setup_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), nullable=False),
        sa.Column("source_template_key", sa.String(length=128), nullable=True),
        sa.Column("source_template_version", sa.Integer(), nullable=True),
        sa.Column("setup_key_snapshot", sa.String(length=160), nullable=True),
        sa.Column("setup_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("setup_version_snapshot", sa.Integer(), nullable=False),
        sa.Column("institution_snapshot", sa.String(length=128), nullable=True),
        sa.Column("apparatus_description_snapshot", sa.Text(), nullable=False),
        sa.Column("methods_text_snapshot", sa.Text(), nullable=False),
        sa.Column("sample_placement_description_snapshot", sa.Text(), nullable=False),
        sa.Column("reaction_flow_description_snapshot", sa.Text(), nullable=False),
        sa.Column("reference_paper_url_snapshot", sa.Text(), nullable=True),
        sa.Column("unpublished_reason_snapshot", sa.Text(), nullable=True),
        sa.Column("diagram_file_asset_id", sa.Uuid(), nullable=True),
        sa.Column("is_same_as_template", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deviation_note", sa.Text(), nullable=True),
        sa.Column("confirmed_by_id", sa.Uuid(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("snapshot_hash", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("metadata_json", payload_type, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["confirmed_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["diagram_file_asset_id"], ["file_assets.id"]),
        sa.ForeignKeyConstraint(["experiment_run_id"], ["experiment_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("experiment_run_id", name="uq_setup_snapshot_experiment_run"),
    )
    op.create_index(
        "ix_experiment_setup_snapshots_experiment_run_id",
        "experiment_setup_snapshots",
        ["experiment_run_id"],
    )
    op.create_index(
        "ix_experiment_setup_snapshots_setup_key_snapshot",
        "experiment_setup_snapshots",
        ["setup_key_snapshot"],
    )
    op.create_index(
        "ix_experiment_setup_snapshots_diagram_file_asset_id",
        "experiment_setup_snapshots",
        ["diagram_file_asset_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_experiment_setup_snapshots_diagram_file_asset_id")
    op.drop_index("ix_experiment_setup_snapshots_setup_key_snapshot")
    op.drop_index("ix_experiment_setup_snapshots_experiment_run_id")
    op.drop_table("experiment_setup_snapshots")
    op.drop_index("ix_file_assets_asset_role", table_name="file_assets")
    op.drop_column("file_assets", "asset_role")
```

- [ ] **Step 4: Export model from `models/__init__.py`**

Modify `backend/app/models/__init__.py`:

```python
from app.models.setup_methods import ExperimentSetupSnapshot
```

- [ ] **Step 5: Run model test**

Run:

```bash
cd backend && uv run pytest tests/models/test_setup_methods_model.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/20260605_0019_add_setup_methods_v1.py backend/app/models/setup_methods.py backend/app/models/file_asset.py backend/app/models/__init__.py backend/tests/models/test_setup_methods_model.py
git commit -m "feat(backend): add setup methods snapshot model"
```

## Task 2: Setup Methods Schemas, Hashing, Repository, And Seed Templates

**Files:**
- Create: `backend/app/schemas/setup_methods.py`
- Create: `backend/app/repositories/setup_methods_repository.py`
- Create: `backend/app/services/setup_methods_hash_service.py`
- Create: `backend/app/services/setup_method_template_service.py`
- Test: `backend/tests/services/test_setup_methods_hash_service.py`

- [ ] **Step 1: Write failing hash service tests**

Create `backend/tests/services/test_setup_methods_hash_service.py`:

```python
from app.services.setup_methods_hash_service import SetupMethodsHashService


def base_payload() -> dict:
    return {
        "setup_name_snapshot": "Manual setup",
        "setup_version_snapshot": 1,
        "institution_snapshot": "group",
        "apparatus_description_snapshot": "Tube furnace",
        "methods_text_snapshot": "Methods text",
        "sample_placement_description_snapshot": "Downstream placement",
        "reaction_flow_description_snapshot": "Ramp hold cool",
        "reference_paper_url_snapshot": None,
        "unpublished_reason_snapshot": "Internal",
        "diagram_sha256": "d" * 64,
        "is_same_as_template": False,
        "deviation_note": None,
        "metadata_json": {"semantic_context": {"pressure": "ambient"}, "ui": {"expanded": True}},
    }


def test_hash_ignores_non_semantic_metadata() -> None:
    service = SetupMethodsHashService()
    first = base_payload()
    second = base_payload()
    second["metadata_json"]["ui"] = {"expanded": False}

    assert service.calculate_hash(first) == service.calculate_hash(second)


def test_hash_changes_when_semantic_context_changes() -> None:
    service = SetupMethodsHashService()
    first = base_payload()
    second = base_payload()
    second["metadata_json"]["semantic_context"] = {"pressure": "low"}

    assert service.calculate_hash(first) != service.calculate_hash(second)


def test_manual_setup_key_uses_hash_prefix() -> None:
    service = SetupMethodsHashService()
    snapshot_hash = "abcdef1234567890ffff"

    assert service.manual_key(snapshot_hash) == "manual:abcdef1234567890"
```

- [ ] **Step 2: Run hash tests to verify they fail**

Run:

```bash
cd backend && uv run pytest tests/services/test_setup_methods_hash_service.py -q
```

Expected: FAIL because `SetupMethodsHashService` does not exist.

- [ ] **Step 3: Implement hash service**

Create `backend/app/services/setup_methods_hash_service.py`:

```python
from __future__ import annotations

import hashlib
import json
from typing import Any


HASH_FIELDS = (
    "setup_name_snapshot",
    "setup_version_snapshot",
    "institution_snapshot",
    "apparatus_description_snapshot",
    "methods_text_snapshot",
    "sample_placement_description_snapshot",
    "reaction_flow_description_snapshot",
    "reference_paper_url_snapshot",
    "unpublished_reason_snapshot",
    "diagram_sha256",
    "is_same_as_template",
    "deviation_note",
    "semantic_context",
)


class SetupMethodsHashService:
    def calculate_hash(self, payload: dict[str, Any]) -> str:
        metadata = payload.get("metadata_json")
        semantic_context = metadata.get("semantic_context") if isinstance(metadata, dict) else None
        canonical = {
            field: payload.get(field)
            for field in HASH_FIELDS
            if field != "semantic_context" and payload.get(field) is not None
        }
        if semantic_context is not None:
            canonical["semantic_context"] = semantic_context
        serialized = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def manual_key(self, snapshot_hash: str) -> str:
        return f"manual:{snapshot_hash[:16]}"
```

- [ ] **Step 4: Implement schemas**

Create `backend/app/schemas/setup_methods.py`:

```python
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.experiment_validation import ExperimentValidationIssue


class SetupMethodTemplateRead(BaseModel):
    template_key: str
    template_version: int
    name: str
    institution: str | None = None
    apparatus_description: str
    methods_text: str
    sample_placement_description: str
    reaction_flow_description: str
    reference_paper_url: str | None = None
    unpublished_reason: str | None = None
    semantic_context: dict[str, Any] = Field(default_factory=dict)
    has_packaged_diagram: bool = False


class SetupMethodTemplateListResponse(BaseModel):
    items: list[SetupMethodTemplateRead]
    total: int


class SetupMethodsUpsert(BaseModel):
    setup_name_snapshot: str = ""
    institution_snapshot: str | None = None
    apparatus_description_snapshot: str = ""
    methods_text_snapshot: str = ""
    sample_placement_description_snapshot: str = ""
    reaction_flow_description_snapshot: str = ""
    reference_paper_url_snapshot: str | None = None
    unpublished_reason_snapshot: str | None = None
    diagram_file_asset_id: UUID | None = None
    is_same_as_template: bool = False
    deviation_note: str | None = None
    semantic_context: dict[str, Any] = Field(default_factory=dict)


class SetupMethodsFromTemplateRequest(BaseModel):
    template_key: str = Field(min_length=1)
    template_version: int = Field(ge=1)


class SetupMethodsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    experiment_run_id: UUID
    source_template_key: str | None
    source_template_version: int | None
    setup_key_snapshot: str | None
    setup_name_snapshot: str
    setup_version_snapshot: int
    institution_snapshot: str | None
    apparatus_description_snapshot: str
    methods_text_snapshot: str
    sample_placement_description_snapshot: str
    reaction_flow_description_snapshot: str
    reference_paper_url_snapshot: str | None
    unpublished_reason_snapshot: str | None
    diagram_file_asset_id: UUID | None
    is_same_as_template: bool
    deviation_note: str | None
    confirmed_by_id: UUID | None
    confirmed_at: datetime | None
    snapshot_hash: str
    semantic_context: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class SetupMethodsMutationResponse(BaseModel):
    data: SetupMethodsRead
    warnings: list[ExperimentValidationIssue] = Field(default_factory=list)
```

- [ ] **Step 5: Implement repository**

Create `backend/app/repositories/setup_methods_repository.py`:

```python
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.setup_methods import ExperimentSetupSnapshot


class SetupMethodsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_experiment(self, experiment_run_id: UUID) -> ExperimentSetupSnapshot | None:
        return self.db.scalar(
            select(ExperimentSetupSnapshot).where(
                ExperimentSetupSnapshot.experiment_run_id == experiment_run_id
            )
        )

    def save(self, snapshot: ExperimentSetupSnapshot) -> ExperimentSetupSnapshot:
        self.db.add(snapshot)
        self.db.flush()
        self.db.refresh(snapshot)
        return snapshot
```

- [ ] **Step 6: Implement seed template service**

Create `backend/app/services/setup_method_template_service.py`:

```python
from app.schemas.setup_methods import SetupMethodTemplateListResponse, SetupMethodTemplateRead


SEED_TEMPLATES = [
    SetupMethodTemplateRead(
        template_key="group_fast_cvd",
        template_version=1,
        name="组内快速 CVD",
        institution="group",
        apparatus_description="Two-zone tube furnace CVD setup used by the group.",
        methods_text="A substrate and precursor are placed in a two-zone CVD furnace. The system is purged before growth, heated to the target profile, held during growth, and cooled under carrier gas.",
        sample_placement_description="Substrate is placed downstream of the precursor according to the furnace coordinate system used in the run.",
        reaction_flow_description="Purge, ramp, growth hold, and cool-down under programmed carrier gas flow.",
        unpublished_reason="Internal group setup template",
        semantic_context={"temperature_reference": "furnace program setpoint"},
        has_packaged_diagram=False,
    )
]


class SetupMethodTemplateService:
    def list_templates(self) -> SetupMethodTemplateListResponse:
        return SetupMethodTemplateListResponse(items=SEED_TEMPLATES, total=len(SEED_TEMPLATES))

    def get_template(self, template_key: str, template_version: int | None = None) -> SetupMethodTemplateRead | None:
        matching = [item for item in SEED_TEMPLATES if item.template_key == template_key]
        if template_version is not None:
            matching = [item for item in matching if item.template_version == template_version]
        return max(matching, key=lambda item: item.template_version, default=None)
```

- [ ] **Step 7: Run hash tests**

Run:

```bash
cd backend && uv run pytest tests/services/test_setup_methods_hash_service.py -q
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/setup_methods.py backend/app/repositories/setup_methods_repository.py backend/app/services/setup_methods_hash_service.py backend/app/services/setup_method_template_service.py backend/tests/services/test_setup_methods_hash_service.py
git commit -m "feat(backend): add setup methods schemas and hashing"
```

## Task 3: File Asset Role Support

**Files:**
- Modify: `backend/app/schemas/file_asset.py`
- Modify: `backend/app/api/v1/endpoints/files.py`
- Modify: `backend/app/services/file_asset_service.py`
- Modify: `backend/app/repositories/file_asset_repository.py`
- Test: `backend/tests/api/test_files.py`

- [ ] **Step 1: Write failing file API tests**

Append to `backend/tests/api/test_files.py`:

```python
def test_upload_setup_diagram_allows_missing_method(active_user) -> None:
    experiment_id = create_experiment_for_test(active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        files={"file": ("setup.png", b"diagram", "image/png")},
        data={"asset_role": "setup_diagram", "file_category": "raw"},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["asset_role"] == "setup_diagram"
    assert body["method"] == "setup_diagram"
    assert body["sample_id"] is None


def test_setup_diagram_rejects_sample_link(active_user) -> None:
    experiment_id = create_experiment_for_test(active_user.email)
    sample = create_sample_for_experiment(experiment_id, active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        files={"file": ("setup.png", b"diagram", "image/png")},
        data={"asset_role": "setup_diagram", "sample_id": sample["id"], "file_category": "raw"},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    assert "sample" in response.json()["detail"].lower()
```

Add this local helper near the top-level helper functions in `backend/tests/api/test_files.py`:

```python
def create_sample_for_experiment(experiment_id: str, email: str) -> dict:
    response = client.post(
        f"/api/v1/experiments/{experiment_id}/samples",
        json={
            "sample_code": "S-SETUP-01",
            "substrate_id": None,
            "position_label": "center",
            "notes": "sample helper for setup diagram role test",
        },
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()
```

- [ ] **Step 2: Run file tests to verify they fail**

Run:

```bash
cd backend && uv run pytest tests/api/test_files.py::test_upload_setup_diagram_allows_missing_method tests/api/test_files.py::test_setup_diagram_rejects_sample_link -q
```

Expected: FAIL because `asset_role` is not accepted and `method` is still required.

- [ ] **Step 3: Implement file schema and endpoint input**

Modify `backend/app/schemas/file_asset.py`:

```python
    asset_role: str
```

Modify `backend/app/api/v1/endpoints/files.py` upload endpoint:

```python
    asset_role: Annotated[str | None, Form()] = None,
```

and pass `asset_role=asset_role` to `FileAssetService.upload_file`.

Also add `asset_role` as an optional query filter in the `/files` list endpoint:

```python
    asset_role: Annotated[str | None, Query()] = None,
```

and pass it to `FileAssetService.list_files`.

- [ ] **Step 4: Implement file role service logic**

Modify `backend/app/services/file_asset_service.py`:

```python
    def _normalize_asset_role(self, value: str | None) -> str:
        normalized = (value or "characterization_file").strip()
        if normalized not in {"characterization_file", "setup_diagram"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid asset role")
        return normalized
```

In `upload_file`:

```python
        resolved_asset_role = self._normalize_asset_role(asset_role)
        if resolved_asset_role == "setup_diagram":
            if sample_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Setup diagram cannot be linked to a sample",
                )
            resolved_method = "setup_diagram"
        else:
            resolved_method = self._normalize_method(method)
            if resolved_method is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="File method is required",
                )
```

Set `asset_role=resolved_asset_role` on `FileAsset`.

- [ ] **Step 5: Serialize and filter by asset role**

Modify `serialize_file_asset` in `backend/app/services/file_asset_service.py`:

```python
        "asset_role": file_asset.asset_role,
```

Modify `FileAssetService.list_files` and `FileAssetRepository.list_visible` to accept `asset_role: str | None = None` and apply:

```python
        if asset_role:
            statement = statement.where(FileAsset.asset_role == asset_role)
```

- [ ] **Step 6: Run file tests**

Run:

```bash
cd backend && uv run pytest tests/api/test_files.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/file_asset.py backend/app/api/v1/endpoints/files.py backend/app/services/file_asset_service.py backend/app/repositories/file_asset_repository.py backend/tests/api/test_files.py
git commit -m "feat(files): support setup diagram assets"
```

## Task 4: Setup Methods API And Service

**Files:**
- Create: `backend/app/services/setup_methods_service.py`
- Create: `backend/app/api/v1/endpoints/setup_method_templates.py`
- Modify: `backend/app/api/v1/endpoints/experiments.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/app/services/experiment_service.py`
- Test: `backend/tests/api/test_setup_methods.py`
- Test: `backend/tests/api/test_setup_method_templates.py`

- [ ] **Step 1: Write failing API tests**

Create `backend/tests/api/test_setup_methods.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def login(email: str, password: str = "Password123!") -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(email)}"}


def create_experiment(email: str) -> str:
    response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-06-05",
            "objective": "setup methods API",
        },
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()["id"]


def upload_setup_diagram(experiment_id: str, email: str) -> str:
    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        files={"file": ("setup.png", b"diagram", "image/png")},
        data={"asset_role": "setup_diagram", "file_category": "raw"},
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_upsert_setup_methods_creates_snapshot(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    diagram_id = upload_setup_diagram(experiment_id, active_user.email)

    response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "Substrate downstream",
            "reaction_flow_description_snapshot": "Purge ramp hold cool",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
            "semantic_context": {"temperature_reference": "setpoint"},
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["warnings"] == []
    assert body["data"]["setup_name_snapshot"] == "Manual setup"
    assert body["data"]["setup_key_snapshot"].startswith("manual:")
    assert body["data"]["semantic_context"] == {"temperature_reference": "setpoint"}
    assert body["data"]["confirmed_at"] is None

    get_response = client.get(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        headers=auth_headers(active_user.email),
    )
    assert get_response.status_code == 200
    assert get_response.json()["semantic_context"] == {"temperature_reference": "setpoint"}


def test_upsert_setup_methods_allows_incomplete_draft_autosave(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "",
            "apparatus_description_snapshot": "",
            "methods_text_snapshot": "",
            "sample_placement_description_snapshot": "",
            "reaction_flow_description_snapshot": "",
            "reference_paper_url_snapshot": None,
            "unpublished_reason_snapshot": None,
            "diagram_file_asset_id": None,
            "is_same_as_template": False,
            "semantic_context": {},
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["data"]["confirmed_at"] is None


def test_confirm_setup_methods_sets_confirmation(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    diagram_id = upload_setup_diagram(experiment_id, active_user.email)
    client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "Substrate downstream",
            "reaction_flow_description_snapshot": "Purge ramp hold cool",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
        },
        headers=auth_headers(active_user.email),
    )

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["data"]["confirmed_by_id"] is not None
    assert response.json()["warnings"] == []


def test_confirm_setup_methods_rejects_incomplete_snapshot(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    upsert_response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "Substrate downstream",
            "reaction_flow_description_snapshot": "Purge ramp hold cool",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": None,
            "is_same_as_template": False,
        },
        headers=auth_headers(active_user.email),
    )
    assert upsert_response.status_code == 200

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422
    assert response.json()["errors"] == [
        {
            "module_key": "setup_methods",
            "field_path": "diagram_file_asset_id",
            "message": "Setup diagram is required",
        }
    ]
    get_response = client.get(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        headers=auth_headers(active_user.email),
    )
    assert get_response.status_code == 200
    assert get_response.json()["confirmed_at"] is None


def test_create_setup_methods_from_template_writes_template_snapshot(active_user) -> None:
    experiment_id = create_experiment(active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/from-template",
        json={"template_key": "group_fast_cvd", "template_version": 1},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["warnings"] == []
    assert body["data"]["source_template_key"] == "group_fast_cvd"
    assert body["data"]["source_template_version"] == 1
    assert body["data"]["setup_key_snapshot"] == "group_fast_cvd"
    assert body["data"]["setup_version_snapshot"] == 1
    assert body["data"]["confirmed_at"] is None
    assert body["data"]["semantic_context"] == {"temperature_reference": "furnace program setpoint"}


def test_from_template_warning_response_uses_validation_issue_shape(active_user, monkeypatch) -> None:
    from app.schemas.experiment_validation import ExperimentValidationIssue
    from app.schemas.setup_methods import SetupMethodTemplateRead
    from app.services.setup_method_template_service import SetupMethodTemplateService
    from app.services.setup_methods_service import SetupMethodsService

    def fake_get_template(self, template_key, template_version=None):
        return SetupMethodTemplateRead(
            template_key="group_fast_cvd",
            template_version=1,
            name="组内快速 CVD",
            institution="group",
            apparatus_description="Two-zone tube furnace CVD setup used by the group.",
            methods_text="Template methods",
            sample_placement_description="Template placement",
            reaction_flow_description="Template flow",
            unpublished_reason="Internal group setup template",
            semantic_context={"temperature_reference": "furnace program setpoint"},
            has_packaged_diagram=True,
        )

    def fake_materialize_diagram(self, experiment, template, current_user):
        return None, ExperimentValidationIssue(
            module_key="setup_methods",
            field_path="diagram_file_asset_id",
            message="Setup diagram could not be materialized from template",
        )

    monkeypatch.setattr(SetupMethodTemplateService, "get_template", fake_get_template)
    monkeypatch.setattr(
        SetupMethodsService,
        "_materialize_template_diagram",
        fake_materialize_diagram,
    )
    experiment_id = create_experiment(active_user.email)

    response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/from-template",
        json={"template_key": "group_fast_cvd", "template_version": 1},
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["warnings"] == [
        {
            "module_key": "setup_methods",
            "field_path": "diagram_file_asset_id",
            "message": "Setup diagram could not be materialized from template",
        }
    ]


def test_setup_diagram_must_belong_to_same_experiment(active_user) -> None:
    first_id = create_experiment(active_user.email)
    second_id = create_experiment(active_user.email)
    diagram_id = upload_setup_diagram(first_id, active_user.email)

    response = client.put(
        f"/api/v1/experiments/{second_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "Substrate downstream",
            "reaction_flow_description_snapshot": "Purge ramp hold cool",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
        },
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 422


def test_delete_referenced_setup_diagram_is_blocked(active_user) -> None:
    experiment_id = create_experiment(active_user.email)
    diagram_id = upload_setup_diagram(experiment_id, active_user.email)
    upsert_response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "Substrate downstream",
            "reaction_flow_description_snapshot": "Purge ramp hold cool",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
        },
        headers=auth_headers(active_user.email),
    )
    assert upsert_response.status_code == 200

    response = client.delete(
        f"/api/v1/files/{diagram_id}",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Setup diagram is referenced by setup methods"
```

Create `backend/tests/api/test_setup_method_templates.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def login(email: str, password: str = "Password123!") -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(email)}"}


def test_list_setup_method_templates(active_user) -> None:
    response = client.get(
        "/api/v1/setup-method-templates",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert body["items"][0]["template_key"] == "group_fast_cvd"


def test_get_setup_method_template_resolves_current_version(active_user) -> None:
    response = client.get(
        "/api/v1/setup-method-templates/group_fast_cvd",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    assert response.json()["template_version"] == 1
```

- [ ] **Step 2: Run setup methods API tests to verify they fail**

Run:

```bash
cd backend && uv run pytest tests/api/test_setup_methods.py tests/api/test_setup_method_templates.py -q
```

Expected: FAIL because routes and service do not exist.

- [ ] **Step 3: Implement `SetupMethodsService`**

Create `backend/app/services/setup_methods_service.py` with this public contract:

```python
class SetupMethodsService:
    def get_setup_methods(self, experiment_id: UUID, current_user: User) -> SetupMethodsRead:
        snapshot = self._get_visible_snapshot(experiment_id, current_user)
        return self._to_read(snapshot)

    def upsert_setup_methods(
        self,
        experiment_id: UUID,
        payload: SetupMethodsUpsert,
        current_user: User,
    ) -> SetupMethodsMutationResponse:
        snapshot = self._upsert_snapshot_from_payload(experiment_id, payload, current_user)
        self.db.commit()
        return SetupMethodsMutationResponse(data=self._to_read(snapshot), warnings=[])

    def create_from_template(
        self,
        experiment_id: UUID,
        payload: SetupMethodsFromTemplateRequest,
        current_user: User,
    ) -> SetupMethodsMutationResponse:
        snapshot, warnings = self._copy_seed_template_to_snapshot(experiment_id, payload, current_user)
        self.db.commit()
        return SetupMethodsMutationResponse(data=self._to_read(snapshot), warnings=warnings)

    def confirm_setup_methods(
        self,
        experiment_id: UUID,
        current_user: User,
    ) -> SetupMethodsMutationResponse:
        snapshot = self._confirm_current_snapshot(experiment_id, current_user)
        self.db.commit()
        return SetupMethodsMutationResponse(data=self._to_read(snapshot), warnings=[])
```

The service must:

- require draft experiment for mutation
- validate `diagram_file_asset_id` belongs to the same experiment, is not deleted, has `asset_role="setup_diagram"`, and has `sample_id is None`
- store `semantic_context` under `metadata_json["semantic_context"]`
- implement `_to_read(snapshot)` by explicitly mapping `semantic_context=(snapshot.metadata_json or {}).get("semantic_context", {})`; direct `SetupMethodsRead.model_validate(snapshot)` is not sufficient because `semantic_context` is not an ORM column
- recalculate `snapshot_hash` on each upsert
- set manual `setup_key_snapshot` when `source_template_key is None`
- clear `confirmed_by_id` and `confirmed_at` on changes
- implement shared `_validate_setup_content(snapshot)` for content completeness only: setup key, setup name, setup diagram, methods text, sample placement, reaction flow, reference paper URL or unpublished reason, and template deviation note when required
- implement `_confirm_current_snapshot` so it runs `_validate_setup_content(snapshot)` before setting `confirmed_by_id` or `confirmed_at`; it must not require `confirmed_at` before confirmation exists
- submit/lock validation must run `_validate_setup_content(snapshot)` and then add the extra confirmation gate: `confirmed_by_id` and `confirmed_at` are required
- if confirm content checks fail, raise `ExperimentValidationFailed` or return HTTP 422 with `ExperimentValidationResponse` shape and leave the snapshot unconfirmed
- write audit events with entity type `experiment_setup_snapshot`
- prevent deleting a referenced setup diagram by adding a `FileAssetService.delete_file` check that returns HTTP 409 with `Setup diagram is referenced by setup methods`

Modify `ExperimentService.__init__` so clone and lifecycle methods can reuse the setup service:

```python
from app.services.setup_methods_service import SetupMethodsService


self.setup_methods_service = SetupMethodsService(db)
```

- [ ] **Step 4: Add routes**

Modify `backend/app/api/v1/endpoints/experiments.py`:

```python
@router.get("/{experiment_id}/setup-methods", response_model=SetupMethodsRead)
def get_setup_methods(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> SetupMethodsRead:
    return SetupMethodsService(db).get_setup_methods(experiment_id, current_user)

@router.put("/{experiment_id}/setup-methods", response_model=SetupMethodsMutationResponse)
def upsert_setup_methods(
    experiment_id: UUID,
    payload: SetupMethodsUpsert,
    db: DbSession,
    current_user: CurrentUser,
) -> SetupMethodsMutationResponse:
    return SetupMethodsService(db).upsert_setup_methods(experiment_id, payload, current_user)

@router.post("/{experiment_id}/setup-methods/from-template", response_model=SetupMethodsMutationResponse)
def create_setup_methods_from_template(
    experiment_id: UUID,
    payload: SetupMethodsFromTemplateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> SetupMethodsMutationResponse:
    return SetupMethodsService(db).create_from_template(experiment_id, payload, current_user)

@router.post("/{experiment_id}/setup-methods/confirm", response_model=SetupMethodsMutationResponse)
def confirm_setup_methods(
    experiment_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    try:
        return SetupMethodsService(db).confirm_setup_methods(experiment_id, current_user)
    except ExperimentValidationFailed as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=exc.result.model_dump(mode="json"),
        )
```

Create `backend/app/api/v1/endpoints/setup_method_templates.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.setup_methods import SetupMethodTemplateListResponse, SetupMethodTemplateRead
from app.services.setup_method_template_service import SetupMethodTemplateService

router = APIRouter(prefix="/api/v1/setup-method-templates", tags=["setup-method-templates"])
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=SetupMethodTemplateListResponse)
def list_setup_method_templates(current_user: CurrentUser) -> SetupMethodTemplateListResponse:
    return SetupMethodTemplateService().list_templates()


@router.get("/{template_key}", response_model=SetupMethodTemplateRead)
def get_setup_method_template(
    template_key: str,
    current_user: CurrentUser,
    version: Annotated[int | None, Query()] = None,
) -> SetupMethodTemplateRead:
    template = SetupMethodTemplateService().get_template(template_key, version)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Setup method template not found",
        )
    return template
```

Modify `backend/app/api/v1/router.py` to include this router before or after the experiment router. It has its own `/api/v1/setup-method-templates` prefix and does not conflict with `/{experiment_id}` routes.

- [ ] **Step 5: Run setup methods API tests**

Run:

```bash
cd backend && uv run pytest tests/api/test_setup_methods.py tests/api/test_setup_method_templates.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/setup_methods_service.py backend/app/api/v1/endpoints/experiments.py backend/app/api/v1/endpoints/setup_method_templates.py backend/app/api/v1/router.py backend/app/services/experiment_service.py backend/app/services/file_asset_service.py backend/tests/api/test_setup_methods.py backend/tests/api/test_setup_method_templates.py
git commit -m "feat(backend): add setup methods API"
```

## Task 5: Validation, Submit, And Lock Gates

**Files:**
- Modify: `backend/app/services/experiment_validation_service.py`
- Modify: `backend/app/services/experiment_service.py`
- Create: `backend/tests/helpers/__init__.py`
- Create: `backend/tests/helpers/setup_methods.py`
- Test: `backend/tests/services/test_experiment_validation_service.py`
- Test: `backend/tests/api/test_experiments.py`
- Test: `backend/tests/api/test_experiment_audit.py`
- Test: `backend/tests/api/test_experiment_recipes.py`
- Test: `backend/tests/api/test_experiment_exports.py`

- [ ] **Step 1: Write failing validation tests**

Append to `backend/tests/services/test_experiment_validation_service.py`:

```python
def test_setup_methods_missing_blocks_validation(active_user, db_session) -> None:
    experiment = ExperimentRun(
        run_code="CVD-2026-SETUP-MISSING",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 6, 5),
        objective="setup validation",
        quality_label=QualityLabel.SUCCESS,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)

    result = ExperimentValidationService(db_session).validate_experiment(experiment)

    assert any(
        issue.module_key == "setup_methods"
        and issue.field_path == "root"
        and "required" in issue.message
        for issue in result.errors
    )


def test_setup_methods_missing_group_key_blocks_validation(active_user, db_session) -> None:
    from datetime import UTC, datetime

    from app.models.setup_methods import ExperimentSetupSnapshot

    experiment = ExperimentRun(
        run_code="CVD-2026-SETUP-NOKEY",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 6, 5),
        objective="setup key validation",
        quality_label=QualityLabel.SUCCESS,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)
    snapshot = ExperimentSetupSnapshot(
        experiment_run_id=experiment.id,
        setup_key_snapshot=None,
        setup_name_snapshot="Manual setup",
        setup_version_snapshot=1,
        apparatus_description_snapshot="Tube furnace",
        methods_text_snapshot="Methods",
        sample_placement_description_snapshot="Placement",
        reaction_flow_description_snapshot="Flow",
        unpublished_reason_snapshot="Internal",
        is_same_as_template=False,
        confirmed_by_id=active_user.id,
        confirmed_at=datetime.now(UTC),
        snapshot_hash="a" * 64,
        metadata_json={"semantic_context": {}},
    )
    db_session.add(snapshot)
    db_session.commit()

    result = ExperimentValidationService(db_session).validate_experiment(experiment)

    assert any(
        issue.module_key == "setup_methods"
        and issue.field_path == "setup_key_snapshot"
        and "required" in issue.message
        for issue in result.errors
    )
```

Append to `backend/tests/api/test_experiments.py`:

```python
def test_lock_revalidates_submitted_experiment_missing_setup_methods(active_user, db_session) -> None:
    from datetime import UTC, date, datetime

    from app.models.experiment import ExperimentRun, ExperimentStatus, QualityLabel

    experiment = ExperimentRun(
        run_code="CVD-2026-LEGACY-SUBMITTED",
        owner_id=active_user.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=date(2026, 6, 5),
        objective="legacy submitted row without setup methods",
        status=ExperimentStatus.SUBMITTED,
        quality_label=QualityLabel.SUCCESS,
        submitted_at=datetime.now(UTC),
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)

    lock_response = client.post(
        f"/api/v1/experiments/{experiment.id}/lock",
        headers=auth_headers(active_user.email),
    )

    assert lock_response.status_code == 422
    assert_issue_exists(
        lock_response.json()["errors"],
        module_key="setup_methods",
        field_path="root",
        message_contains="required",
    )
```

- [ ] **Step 2: Run validation tests to verify they fail**

Run:

```bash
cd backend && uv run pytest tests/services/test_experiment_validation_service.py::test_setup_methods_missing_blocks_validation tests/services/test_experiment_validation_service.py::test_setup_methods_missing_group_key_blocks_validation tests/api/test_experiments.py::test_lock_revalidates_submitted_experiment_missing_setup_methods -q
```

Expected: FAIL because setup methods validation is not implemented and lock does not validate.

- [ ] **Step 3: Add setup validation**

Modify imports and `ExperimentValidationService.__init__`:

```python
from app.repositories.setup_methods_repository import SetupMethodsRepository


class ExperimentValidationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.module_payloads = ModulePayloadRepository(db)
        self.files = FileAssetRepository(db)
        self.setup_methods = SetupMethodsRepository(db)
```

Modify `ExperimentValidationService.validate_experiment`:

```python
setup_snapshot = self.setup_methods.get_by_experiment(experiment.id)
self._validate_setup_methods(experiment, setup_snapshot, errors, warnings)
```

Add `_validate_setup_content` and `_validate_setup_methods`:

```python
def _validate_setup_content(
    self,
    snapshot: ExperimentSetupSnapshot | None,
    errors: list[ExperimentValidationIssue],
) -> None:
    if snapshot is None:
        errors.append(self._issue("setup_methods", "root", "Setup / Methods is required"))
        return
    if self._is_blank(snapshot.setup_key_snapshot):
        errors.append(self._issue("setup_methods", "setup_key_snapshot", "Setup key is required"))
    if self._is_blank(snapshot.setup_name_snapshot):
        errors.append(self._issue("setup_methods", "setup_name_snapshot", "Setup name is required"))
    if snapshot.diagram_file_asset_id is None:
        errors.append(self._issue("setup_methods", "diagram_file_asset_id", "Setup diagram is required"))
    if self._is_blank(snapshot.methods_text_snapshot):
        errors.append(self._issue("setup_methods", "methods_text_snapshot", "Methods text is required"))
    if self._is_blank(snapshot.sample_placement_description_snapshot):
        errors.append(self._issue("setup_methods", "sample_placement_description_snapshot", "Sample placement description is required"))
    if self._is_blank(snapshot.reaction_flow_description_snapshot):
        errors.append(self._issue("setup_methods", "reaction_flow_description_snapshot", "Reaction flow description is required"))
    if self._is_blank(snapshot.reference_paper_url_snapshot) and self._is_blank(snapshot.unpublished_reason_snapshot):
        errors.append(self._issue("setup_methods", "reference_paper_url_snapshot", "Reference paper URL or unpublished reason is required"))
    if snapshot.source_template_key and not snapshot.is_same_as_template and self._is_blank(snapshot.deviation_note):
        errors.append(self._issue("setup_methods", "deviation_note", "Deviation note is required when setup differs from template"))


def _validate_setup_methods(
    self,
    experiment: ExperimentRun,
    snapshot: ExperimentSetupSnapshot | None,
    errors: list[ExperimentValidationIssue],
    warnings: list[ExperimentValidationIssue],
) -> None:
    before_count = len(errors)
    self._validate_setup_content(snapshot, errors)
    if snapshot is None or len(errors) > before_count:
        return
    if snapshot.confirmed_at is None or snapshot.confirmed_by_id is None:
        errors.append(self._issue("setup_methods", "confirmed_at", "Setup confirmation is required"))
```

- [ ] **Step 4: Revalidate on lock**

Modify `ExperimentService.lock_experiment`:

```python
validation_result = self.validation.validate_experiment(experiment)
if not validation_result.ok:
    raise ExperimentValidationFailed(validation_result)
```

Modify lock endpoint to catch `ExperimentValidationFailed` like submit.

- [ ] **Step 5: Update completion score**

In `validate_experiment`, fetch the snapshot once and pass it to both setup validation and completion scoring:

```python
setup_snapshot = self.setup_methods.get_by_experiment(experiment.id)
self._validate_setup_methods(experiment, setup_snapshot, errors, warnings)
```

Change `_validate_setup_methods` to accept the already-fetched snapshot:

```python
def _validate_setup_methods(
    self,
    experiment: ExperimentRun,
    snapshot: ExperimentSetupSnapshot | None,
    errors: list[ExperimentValidationIssue],
    warnings: list[ExperimentValidationIssue],
) -> None:
```

Modify `_calculate_completion_score` to receive `setup_snapshot`:

```python
def _calculate_completion_score(
    self,
    *,
    experiment: ExperimentRun,
    module_payloads: dict[str, dict],
    setup_snapshot: ExperimentSetupSnapshot | None,
) -> int:
```

Add setup methods checks to the `checks` list:

```python
setup_snapshot is not None,
setup_snapshot is not None and not self._is_blank(setup_snapshot.setup_key_snapshot),
setup_snapshot is not None and setup_snapshot.diagram_file_asset_id is not None,
setup_snapshot is not None and not self._is_blank(setup_snapshot.methods_text_snapshot),
setup_snapshot is not None and setup_snapshot.confirmed_at is not None,
```

Update existing completion score assertions that hard-code exact values. In `backend/tests/api/test_experiments.py`, update `test_validate_experiment_returns_errors_and_completion_score` so its `completion_score` expected value reflects missing setup methods, update `test_validate_can_return_ok_with_incomplete_score` to call `create_confirmed_setup_methods` before validation, and add one assertion that a complete confirmed setup contributes to a higher deterministic score than the same payload without setup. Keep the assertions deterministic; do not replace them with only `0 <= score <= 100`.

- [ ] **Step 6: Add shared setup methods test helper and update success-submit tests**

Create `backend/tests/helpers/__init__.py` as an empty file.

Create `backend/tests/helpers/setup_methods.py`:

```python
from fastapi.testclient import TestClient


def create_confirmed_setup_methods(
    client: TestClient,
    *,
    experiment_id: str,
    headers: dict[str, str],
) -> dict:
    diagram_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        files={"file": ("setup.png", b"diagram", "image/png")},
        data={"asset_role": "setup_diagram", "file_category": "raw"},
        headers=headers,
    )
    assert diagram_response.status_code == 201
    diagram_id = diagram_response.json()["id"]

    upsert_response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Test setup",
            "institution_snapshot": "group",
            "apparatus_description_snapshot": "Tube furnace test setup",
            "methods_text_snapshot": "Test methods text",
            "sample_placement_description_snapshot": "Substrate downstream of precursor",
            "reaction_flow_description_snapshot": "Purge, ramp, hold, cool",
            "unpublished_reason_snapshot": "Internal test protocol",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
            "semantic_context": {"temperature_reference": "setpoint"},
        },
        headers=headers,
    )
    assert upsert_response.status_code == 200

    confirm_response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=headers,
    )
    assert confirm_response.status_code == 200
    return confirm_response.json()["data"]
```

Update tests that expect successful submit, lock, clone from submitted/locked source, save-as-recipe from submitted source, or viewer export of locked experiments:

```python
from tests.helpers.setup_methods import create_confirmed_setup_methods


create_confirmed_setup_methods(
    client,
    experiment_id=experiment_id,
    headers=auth_headers(active_user.email),
)
```

Apply this helper in:

- `backend/tests/api/test_experiments.py`: every branch asserting `submit_response.status_code == 200` or `lock_response.status_code == 200`; keep tests that intentionally assert missing setup errors without the helper.
- `backend/tests/api/test_experiment_audit.py`: clone/audit tests that submit and lock a source experiment before cloning.
- `backend/tests/api/test_experiment_recipes.py`: inside `create_experiment(status_ready=True)`, after `upsert_modules(experiment_id, email)` and before submit.
- `backend/tests/api/test_experiment_exports.py`: locked export visibility tests, Excel export setup, and any helper that creates a submitted or locked experiment for export.

For tests that assert a specific non-setup validation failure, add the helper when the setup context is not the subject of the test so the new setup gate does not add unrelated errors.

- [ ] **Step 7: Run validation and affected backend API tests**

Run:

```bash
cd backend && uv run pytest tests/services/test_experiment_validation_service.py tests/api/test_experiments.py tests/api/test_experiment_audit.py tests/api/test_experiment_recipes.py tests/api/test_experiment_exports.py -q
```

Expected: PASS after all success-submit, success-lock, clone, recipe, and export tests create and confirm setup methods first.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/experiment_validation_service.py backend/app/services/experiment_service.py backend/app/api/v1/endpoints/experiments.py backend/tests/helpers/__init__.py backend/tests/helpers/setup_methods.py backend/tests/services/test_experiment_validation_service.py backend/tests/api/test_experiments.py backend/tests/api/test_experiment_audit.py backend/tests/api/test_experiment_recipes.py backend/tests/api/test_experiment_exports.py
git commit -m "feat(experiments): require setup methods for submit and lock"
```

## Task 6: Clone And Recipe Semantics

**Files:**
- Modify: `backend/app/services/experiment_service.py`
- Modify: `backend/app/services/file_storage_service.py`
- Test: `backend/tests/api/test_experiments.py`

- [ ] **Step 1: Write failing clone test**

Append to `backend/tests/api/test_experiments.py`:

```python
def upload_setup_diagram(experiment_id: str, email: str) -> str:
    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        files={"file": ("setup.png", b"diagram", "image/png")},
        data={"asset_role": "setup_diagram", "file_category": "raw"},
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_clone_copies_setup_snapshot_but_requires_reconfirmation(active_user) -> None:
    source_id = create_experiment_for_test(active_user.email)
    diagram_id = upload_setup_diagram(source_id, active_user.email)
    upsert_response = client.put(
        f"/api/v1/experiments/{source_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods",
            "sample_placement_description_snapshot": "Placement",
            "reaction_flow_description_snapshot": "Flow",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
        },
        headers=auth_headers(active_user.email),
    )
    assert upsert_response.status_code == 200
    assert client.post(f"/api/v1/experiments/{source_id}/setup-methods/confirm", headers=auth_headers(active_user.email)).status_code == 200
    populate_required_modules(source_id, active_user.email)
    submit_response = client.post(
        f"/api/v1/experiments/{source_id}/submit",
        headers=auth_headers(active_user.email),
    )
    assert submit_response.status_code == 200

    clone_response = client.post(
        f"/api/v1/experiments/{source_id}/clone",
        headers=auth_headers(active_user.email),
    )
    assert clone_response.status_code == 201
    clone_id = clone_response.json()["id"]

    setup_response = client.get(
        f"/api/v1/experiments/{clone_id}/setup-methods",
        headers=auth_headers(active_user.email),
    )
    assert setup_response.status_code == 200
    body = setup_response.json()
    assert body["confirmed_at"] is None
    assert body["diagram_file_asset_id"] != diagram_id
```

- [ ] **Step 2: Run clone test to verify it fails**

Run:

```bash
cd backend && uv run pytest tests/api/test_experiments.py::test_clone_copies_setup_snapshot_but_requires_reconfirmation -q
```

Expected: FAIL because clone does not copy setup snapshot.

- [ ] **Step 3: Implement clone setup snapshot copy**

Add `FileStorageService.copy_between_experiments`:

```python
    def copy_between_experiments(
        self,
        *,
        source_storage_path: str,
        target_experiment_run_code: str,
        target_file_id: UUID,
        original_name: str,
    ) -> tuple[str, str]:
        content = self.resolve(source_storage_path).read_bytes()
        return self.persist(
            experiment_run_code=target_experiment_run_code,
            file_id=target_file_id,
            original_name=original_name,
            content=content,
        )
```

In `ExperimentService.clone_experiment`, after creating the target experiment:

```python
self.setup_methods_service.clone_snapshot(
    source_experiment=source,
    target_experiment=created,
    current_user=current_user,
)
```

Implement `clone_snapshot` to:

- copy snapshot text, source template fields, `is_same_as_template`, `deviation_note`, and `metadata_json`
- copy the source diagram file into a new target experiment `FileAsset` with `asset_role="setup_diagram"`, `method="setup_diagram"`, `sample_id=None`, a new `id`, and target experiment ID
- set target `diagram_file_asset_id` to the copied file ID
- if file copy raises `OSError` or `ValueError`, save the target snapshot with `diagram_file_asset_id=None`
- clear `confirmed_by_id` and `confirmed_at`
- recompute `snapshot_hash`
- for manual snapshots, update `setup_key_snapshot` from the new hash prefix

- [ ] **Step 4: Ensure Recipe behavior stays V1-scoped**

Append this test to `backend/tests/api/test_experiments.py`:

```python
def test_create_experiment_from_recipe_does_not_create_setup_snapshot(active_user, db_session) -> None:
    from app.models.recipe import Recipe

    recipe = Recipe(
        name="Recipe without setup binding",
        material_system="MoS2",
        default_payload_json={
            "precursors": {"items": [{"species": "MoO3", "method": "powder"}]},
            "furnace_program": {
                "furnace_info": {"zones_count": 1, "initial_temperatures_C": {"zone_1": 25}},
                "placements": [],
                "zones": [
                    {
                        "zone_key": "zone_1",
                        "temperature_program": [
                            {"node_index": 1, "time_min": 0, "temperature_C": 25, "note": ""},
                            {"node_index": 2, "time_min": 30, "temperature_C": 750, "note": ""},
                        ],
                        "note": "",
                    }
                ],
            },
            "gas_program": {
                "pre_washing_gas": "Ar",
                "segments": [
                    {
                        "stage": "growth",
                        "start_min": 0,
                        "end_min": 45,
                        "gas": "Ar",
                        "flow_sccm": 80,
                        "components": [{"name": "Ar", "fraction": 1, "flow_sccm": 80}],
                    }
                ],
            },
        },
        description="Recipe V1 must not carry setup methods",
        created_by=active_user.id,
        is_active=True,
    )
    db_session.add(recipe)
    db_session.commit()
    db_session.refresh(recipe)

    response = client.post(
        "/api/v1/experiments/from-recipe",
        json={"recipe_id": str(recipe.id), "experiment_date": "2026-06-05"},
        headers=auth_headers(active_user.email),
    )
    assert response.status_code == 201
    experiment_id = response.json()["id"]

    setup_response = client.get(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        headers=auth_headers(active_user.email),
    )

    assert setup_response.status_code == 404
```

- [ ] **Step 5: Run clone and recipe tests**

Run:

```bash
cd backend && uv run pytest tests/api/test_experiments.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/experiment_service.py backend/app/services/setup_methods_service.py backend/app/services/file_storage_service.py backend/tests/api/test_experiments.py
git commit -m "feat(experiments): clone setup methods snapshots"
```

## Task 7: Export JSON, Excel, And Analysis Context

**Files:**
- Modify: `backend/app/schemas/experiment.py`
- Modify: `backend/app/services/experiment_export_service.py`
- Test: `backend/tests/api/test_experiment_exports.py`

- [ ] **Step 1: Write failing export tests**

Append to `backend/tests/api/test_experiment_exports.py`:

```python
def upload_setup_diagram(experiment_id: str, email: str) -> str:
    response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=auth_headers(email),
        data={"asset_role": "setup_diagram", "file_category": "raw"},
        files={"file": ("setup.png", b"diagram", "image/png")},
    )
    assert response.status_code == 201
    return response.json()["id"]


def create_complete_submitted_experiment_with_setup(email: str) -> str:
    experiment_id = create_experiment(email, objective="Export with setup methods")
    populate_required_modules(experiment_id, email)
    diagram_id = upload_setup_diagram(experiment_id, email)
    setup_response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Manual setup",
            "institution_snapshot": "group",
            "apparatus_description_snapshot": "Tube furnace",
            "methods_text_snapshot": "Methods text",
            "sample_placement_description_snapshot": "Substrate downstream",
            "reaction_flow_description_snapshot": "Purge ramp hold cool",
            "unpublished_reason_snapshot": "Internal",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
            "semantic_context": {"temperature_reference": "setpoint"},
        },
        headers=auth_headers(email),
    )
    assert setup_response.status_code == 200
    confirm_response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=auth_headers(email),
    )
    assert confirm_response.status_code == 200
    submit_response = client.post(
        f"/api/v1/experiments/{experiment_id}/submit",
        headers=auth_headers(email),
    )
    assert submit_response.status_code == 200
    return experiment_id


def test_json_export_includes_setup_methods_snapshot(active_user) -> None:
    experiment_id = create_complete_submitted_experiment_with_setup(active_user.email)

    response = client.get(
        f"/api/v1/experiments/{experiment_id}/export/json",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    setup = response.json()["setup_methods"]
    assert setup["setup_name_snapshot"] == "Manual setup"
    assert setup["semantic_context"]["temperature_reference"] == "setpoint"
    assert setup["snapshot_hash"]
    assert any(
        event["entity_type"] == "experiment_setup_snapshot"
        for event in response.json()["audit_events"]
    )


def test_analysis_export_includes_setup_context_on_all_rows(active_user) -> None:
    experiment_id = create_complete_submitted_experiment_with_setup(active_user.email)

    response = client.get(
        f"/api/v1/experiments/{experiment_id}/export/analysis",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    context_fields = [
        "setup_key_snapshot",
        "setup_name_snapshot",
        "setup_version_snapshot",
        "institution_snapshot",
        "setup_snapshot_hash",
    ]
    row_groups = [
        [body["experiment"]],
        body["precursor_rows"],
        body["substrate_rows"],
        body["furnace_step_rows"],
        body["furnace_temperature_rows"],
        body["furnace_precursor_rows"],
        body["gas_program_rows"],
        body["gas_segment_rows"],
        body["gas_component_rows"],
        body["characterization_rows"],
        body["sample_rows"],
        body["file_rows"],
    ]
    for rows in row_groups:
        for row in rows:
            for field in context_fields:
                assert field in row
                assert row[field] not in (None, "")


def test_excel_export_includes_setup_methods_sheet(active_user) -> None:
    experiment_id = create_complete_submitted_experiment_with_setup(active_user.email)

    response = client.get(
        f"/api/v1/experiments/{experiment_id}/export/excel",
        headers=auth_headers(active_user.email),
    )

    assert response.status_code == 200
    workbook = load_workbook(BytesIO(response.content))
    assert "Setup & Methods" in workbook.sheetnames
    sheet = workbook["Setup & Methods"]
    first_column = [cell.value for cell in sheet["A"]]
    assert "setup_name_snapshot" in first_column
    assert "semantic_context" in first_column
```

- [ ] **Step 2: Run export tests to verify they fail**

Run:

```bash
cd backend && uv run pytest tests/api/test_experiment_exports.py::test_json_export_includes_setup_methods_snapshot tests/api/test_experiment_exports.py::test_analysis_export_includes_setup_context_on_all_rows tests/api/test_experiment_exports.py::test_excel_export_includes_setup_methods_sheet -q
```

Expected: FAIL because exports do not include setup methods.

- [ ] **Step 3: Extend export schemas**

In `backend/app/schemas/experiment.py`, import `SetupMethodsRead` and add `setup_methods` to the existing export schema:

```python
from app.schemas.setup_methods import SetupMethodsRead

class ExperimentExportRead(BaseModel):
    export_version: str
    exported_at: datetime
    experiment: ExperimentRead
    modules: list[ExperimentModulePayloadRead]
    samples: list[SampleRead]
    files: list[FileAssetRead]
    setup_methods: SetupMethodsRead | None = None
    features: list[dict[str, Any]]
    provenance: ExperimentExportProvenance
    audit_events: list[AuditEventRead]
    counts: ExperimentExportCounts
```

Add setup context fields to every `ExperimentAnalysis*Row` model:

```python
setup_key_snapshot: str | None
setup_name_snapshot: str | None
setup_version_snapshot: int | None
institution_snapshot: str | None
setup_snapshot_hash: str | None
```

- [ ] **Step 4: Extend export service**

In `ExperimentExportService.build_json_export`, fetch snapshot and populate `setup_methods`.
When collecting audit events, include `entity_type="experiment_setup_snapshot"` rows for the snapshot ID so exports preserve methods/deviation change history.

In `build_analysis_export`, build:

```python
setup_context = self._setup_context(export_payload.setup_methods)
context = {
    "experiment_id": export_payload.experiment.id,
    "run_code": export_payload.experiment.run_code,
    **setup_context,
}
```

Ensure all row builder methods receive the expanded context.

- [ ] **Step 5: Add Excel sheet**

In `build_excel_bytes`, insert:

```python
self._write_setup_methods_sheet(workbook.create_sheet("Setup & Methods"), export_payload)
```

The sheet must include `semantic_context` serialized as JSON.

- [ ] **Step 6: Run export tests**

Run:

```bash
cd backend && uv run pytest tests/api/test_experiment_exports.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/experiment.py backend/app/services/experiment_export_service.py backend/tests/api/test_experiment_exports.py
git commit -m "feat(exports): include setup methods context"
```

## Task 8: Admin Dashboard Missing Setup Visibility

**Files:**
- Modify: `backend/app/repositories/experiment_repository.py`
- Modify: `backend/app/services/admin_dashboard_service.py`
- Modify: `backend/app/schemas/admin_dashboard.py`
- Modify: `frontend/src/shared/types/api.ts`
- Modify: `frontend/src/features/admin-dashboard/admin-dashboard-page.tsx`
- Test: `backend/tests/api/test_admin_dashboard.py`
- Test: `frontend/src/features/admin-dashboard/admin-dashboard-page.test.tsx`

- [ ] **Step 1: Write failing backend dashboard test**

Append to `backend/tests/api/test_admin_dashboard.py`:

```python
def test_admin_dashboard_counts_experiments_missing_setup_methods(db_session, admin_user, active_user) -> None:
    from app.models.setup_methods import ExperimentSetupSnapshot

    now = datetime.now(UTC)
    add_experiment(
        db_session,
        owner=active_user,
        run_code="CVD-2026-NOSETUP",
        status=ExperimentStatus.DRAFT,
        created_at=now,
        updated_at=now,
    )
    unconfirmed = add_experiment(
        db_session,
        owner=active_user,
        run_code="CVD-2026-UNCONFIRMED-SETUP",
        status=ExperimentStatus.DRAFT,
        created_at=now,
        updated_at=now,
    )
    db_session.add(
        ExperimentSetupSnapshot(
            experiment_run_id=unconfirmed.id,
            setup_key_snapshot="manual:abcdef1234567890",
            setup_name_snapshot="Unconfirmed setup",
            setup_version_snapshot=1,
            apparatus_description_snapshot="Tube furnace",
            methods_text_snapshot="Methods",
            sample_placement_description_snapshot="Placement",
            reaction_flow_description_snapshot="Flow",
            unpublished_reason_snapshot="Internal",
            is_same_as_template=False,
            confirmed_by_id=None,
            confirmed_at=None,
            snapshot_hash="a" * 64,
            metadata_json={"semantic_context": {}},
        )
    )
    db_session.commit()

    response = client.get(
        "/api/v1/admin/dashboard/overview",
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["totals"]["missing_setup_methods"] == 2
    member = next(item for item in body["members"] if item["email"] == active_user.email)
    assert member["missing_setup_methods"] == 2
```

- [ ] **Step 2: Run backend dashboard test to verify it fails**

Run:

```bash
cd backend && uv run pytest tests/api/test_admin_dashboard.py::test_admin_dashboard_counts_experiments_missing_setup_methods -q
```

Expected: FAIL because schema has no missing setup fields.

- [ ] **Step 3: Implement backend dashboard counts**

Add fields:

```python
class DashboardTotals(BaseModel):
    missing_setup_methods: int

class DashboardMemberStat(BaseModel):
    missing_setup_methods: int
```

Add repository query using outer join from `experiment_runs` to `experiment_setup_snapshots` and count rows where snapshot is missing or unconfirmed.

- [ ] **Step 4: Update frontend dashboard**

In `frontend/src/shared/types/api.ts`, add `missing_setup_methods` to `DashboardTotals` and `DashboardMemberStat`.

In `admin-dashboard-page.tsx`, add:

- KPI tile label: `缺 Setup`
- member table column: `缺 Setup`

- [ ] **Step 5: Run dashboard tests**

Run:

```bash
cd backend && uv run pytest tests/api/test_admin_dashboard.py -q
cd ../frontend && bun run test -- admin-dashboard-page
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/repositories/experiment_repository.py backend/app/services/admin_dashboard_service.py backend/app/schemas/admin_dashboard.py backend/tests/api/test_admin_dashboard.py frontend/src/shared/types/api.ts frontend/src/features/admin-dashboard/admin-dashboard-page.tsx frontend/src/features/admin-dashboard/admin-dashboard-page.test.tsx
git commit -m "feat(admin): surface missing setup methods"
```

## Task 9: Frontend API Types And Client

**Files:**
- Modify: `frontend/src/shared/types/api.ts`
- Modify: `frontend/src/features/experiments/api.ts`
- Test: `frontend/src/shared/api/client.test.ts`

- [ ] **Step 1: Add TypeScript API types**

Add to `frontend/src/shared/types/api.ts`:

```ts
export type SetupMethodsRead = {
  id: string;
  experiment_run_id: string;
  source_template_key: string | null;
  source_template_version: number | null;
  setup_key_snapshot: string | null;
  setup_name_snapshot: string;
  setup_version_snapshot: number;
  institution_snapshot: string | null;
  apparatus_description_snapshot: string;
  methods_text_snapshot: string;
  sample_placement_description_snapshot: string;
  reaction_flow_description_snapshot: string;
  reference_paper_url_snapshot: string | null;
  unpublished_reason_snapshot: string | null;
  diagram_file_asset_id: string | null;
  is_same_as_template: boolean;
  deviation_note: string | null;
  confirmed_by_id: string | null;
  confirmed_at: string | null;
  snapshot_hash: string;
  semantic_context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SetupMethodsUpsertRequest = {
  setup_name_snapshot: string;
  institution_snapshot?: string | null;
  apparatus_description_snapshot: string;
  methods_text_snapshot: string;
  sample_placement_description_snapshot: string;
  reaction_flow_description_snapshot: string;
  reference_paper_url_snapshot?: string | null;
  unpublished_reason_snapshot?: string | null;
  diagram_file_asset_id?: string | null;
  is_same_as_template: boolean;
  deviation_note?: string | null;
  semantic_context?: Record<string, unknown>;
};

export type SetupMethodsMutationResponse = {
  data: SetupMethodsRead;
  warnings: ExperimentValidationIssue[];
};

export type SetupMethodTemplateRead = {
  template_key: string;
  template_version: number;
  name: string;
  institution: string | null;
  apparatus_description: string;
  methods_text: string;
  sample_placement_description: string;
  reaction_flow_description: string;
  reference_paper_url: string | null;
  unpublished_reason: string | null;
  semantic_context: Record<string, unknown>;
  has_packaged_diagram: boolean;
};

export type SetupMethodTemplateListResponse = {
  items: SetupMethodTemplateRead[];
  total: number;
};
```

- [ ] **Step 2: Add API functions**

Modify `frontend/src/features/experiments/api.ts`:

```ts
export function getSetupMethods(token: string, experimentId: string) {
  return apiRequest<SetupMethodsRead>(`/api/v1/experiments/${experimentId}/setup-methods`, { token });
}

export function upsertSetupMethods(token: string, experimentId: string, payload: SetupMethodsUpsertRequest) {
  return apiRequest<SetupMethodsMutationResponse>(`/api/v1/experiments/${experimentId}/setup-methods`, {
    method: "PUT",
    body: payload,
    token,
  });
}

export function confirmSetupMethods(token: string, experimentId: string) {
  return apiRequest<SetupMethodsMutationResponse>(`/api/v1/experiments/${experimentId}/setup-methods/confirm`, {
    method: "POST",
    token,
  });
}

export function createSetupMethodsFromTemplate(token: string, experimentId: string, templateKey: string, templateVersion: number) {
  return apiRequest<SetupMethodsMutationResponse>(`/api/v1/experiments/${experimentId}/setup-methods/from-template`, {
    method: "POST",
    body: { template_key: templateKey, template_version: templateVersion },
    token,
  });
}

export function listSetupMethodTemplates(token: string) {
  return apiRequest<SetupMethodTemplateListResponse>("/api/v1/setup-method-templates", { token });
}

export function getSetupMethodTemplate(token: string, templateKey: string, templateVersion?: number) {
  return apiRequest<SetupMethodTemplateRead>(
    `/api/v1/setup-method-templates/${templateKey}${buildQueryString({ version: templateVersion ?? null })}`,
    { token },
  );
}
```

Extend `ListExperimentFilesFilters`:

```ts
type ListExperimentFilesFilters = {
  experimentId: string;
  fileCategory?: string | null;
  method?: string | null;
  sampleId?: string | null;
  assetRole?: "characterization_file" | "setup_diagram" | null;
};
```

Add `asset_role: filters.assetRole ?? null` to the `listExperimentFiles` query string.

- [ ] **Step 3: Update file upload type**

Change `UploadExperimentFileInput`:

```ts
type UploadExperimentFileInput = {
  file: File;
  fileCategory: string;
  method?: string;
  assetRole?: "characterization_file" | "setup_diagram";
  note?: string;
  sampleId?: string | null;
  signal?: AbortSignal;
};
```

Set `asset_role` in `FormData` when provided.
Only set `method` when `payload.method` is non-empty:

```ts
if (payload.method) {
  formData.set("method", payload.method);
}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd frontend && bun run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/types/api.ts frontend/src/features/experiments/api.ts
git commit -m "feat(frontend): add setup methods API types"
```

## Task 10: Frontend Setup Methods Editor Section

**Files:**
- Modify: `frontend/src/features/experiments/editor-types.ts`
- Modify: `frontend/src/features/experiments/use-experiment-editor.ts`
- Modify: `frontend/src/features/experiments/experiment-editor-page.tsx`
- Create: `frontend/src/features/experiments/components/setup-methods-section.tsx`
- Create: `frontend/src/features/experiments/components/setup-methods-section.test.tsx`
- Modify: `frontend/src/features/experiments/components/completion-indicator.tsx`
- Test: `frontend/src/features/experiments/use-experiment-editor.test.tsx`
- Test: `frontend/src/features/experiments/experiment-editor-page.test.tsx`

- [ ] **Step 1: Write failing component test**

Create `frontend/src/features/experiments/components/setup-methods-section.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithApp } from "../../../test/render";
import { SetupMethodsSection } from "./setup-methods-section";

test("renders setup methods required fields and confirm action", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const onConfirm = vi.fn();
  const onApplyTemplate = vi.fn();

  renderWithApp(
    <SetupMethodsSection
      disabled={false}
      files={[]}
      onApplyTemplate={onApplyTemplate}
      onChange={onChange}
      onConfirm={onConfirm}
      templateOptions={[
        {
          template_key: "group_fast_cvd",
          template_version: 1,
          name: "组内快速 CVD",
          institution: "group",
          apparatus_description: "Tube furnace",
          methods_text: "Template methods",
          sample_placement_description: "Template placement",
          reaction_flow_description: "Template flow",
          reference_paper_url: null,
          unpublished_reason: "Internal",
          semantic_context: {},
          has_packaged_diagram: false,
        },
      ]}
      value={{
        sourceTemplateKey: null,
        sourceTemplateVersion: null,
        setupNameSnapshot: "",
        institutionSnapshot: "",
        apparatusDescriptionSnapshot: "",
        methodsTextSnapshot: "",
        samplePlacementDescriptionSnapshot: "",
        reactionFlowDescriptionSnapshot: "",
        referencePaperUrlSnapshot: "",
        unpublishedReasonSnapshot: "",
        diagramFileAssetId: "",
        isSameAsTemplate: false,
        deviationNote: "",
        semanticContextText: "{}",
        confirmedAt: null,
      }}
    />,
  );

  await user.type(screen.getByLabelText("Setup 名称"), "组内快速 CVD");
  expect(onChange).toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText("Setup 模板"), "group_fast_cvd:1");
  await user.click(screen.getByRole("button", { name: "套用模板" }));
  expect(onApplyTemplate).toHaveBeenCalledWith("group_fast_cvd", 1);
  expect(screen.getByRole("button", { name: "套用模板" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认 Setup" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run component test to verify it fails**

Run:

```bash
cd frontend && bun run test -- setup-methods-section
```

Expected: FAIL because component does not exist.

- [ ] **Step 2a: Write failing editor load test**

Add or update `frontend/src/features/experiments/experiment-editor-page.test.tsx`:

```tsx
test("loads existing setup methods snapshot into the editor", async () => {
  const server = createEditorFetchMock();
  server.setupMethods = {
    id: "setup-1",
    experiment_run_id: "exp-1",
    source_template_key: null,
    source_template_version: null,
    setup_key_snapshot: "manual:abcdef1234567890",
    setup_name_snapshot: "Manual setup",
    setup_version_snapshot: 1,
    institution_snapshot: "group",
    apparatus_description_snapshot: "Tube furnace",
    methods_text_snapshot: "Methods text",
    sample_placement_description_snapshot: "Substrate downstream",
    reaction_flow_description_snapshot: "Purge ramp hold cool",
    reference_paper_url_snapshot: null,
    unpublished_reason_snapshot: "Internal",
    diagram_file_asset_id: "file-setup",
    is_same_as_template: false,
    deviation_note: null,
    confirmed_by_id: null,
    confirmed_at: null,
    snapshot_hash: "a".repeat(64),
    semantic_context: { temperature_reference: "setpoint" },
    created_at: "2026-06-05T00:00:00Z",
    updated_at: "2026-06-05T00:00:00Z",
  };
  vi.stubGlobal("fetch", server.fetchMock);

  renderWithApp(
    <Routes>
      <Route path="/experiments/:experimentId/edit" element={<ExperimentEditorPage />} />
    </Routes>,
    {
    authenticated: true,
    initialEntries: ["/experiments/exp-1/edit"],
    },
  );

  expect(await screen.findByDisplayValue("Manual setup")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Methods text")).toBeInTheDocument();
});
```

Modify `createEditorFetchMock` in the same test file so it stores setup state on the returned server object and handles these GETs:

```tsx
const serverState = {
  setupMethods: null as Record<string, unknown> | null,
};

if (url.pathname === "/api/v1/experiments/exp-1/setup-methods" && method === "GET") {
  return serverState.setupMethods
    ? jsonResponse(serverState.setupMethods)
    : jsonResponse({ detail: "Not found" }, { status: 404 });
}

if (url.pathname === "/api/v1/setup-method-templates" && method === "GET") {
  return jsonResponse({ items: [], total: 0 });
}

if (url.pathname === "/api/v1/files" && method === "GET" && url.searchParams.get("asset_role") === "setup_diagram") {
  return jsonResponse({ items: [], total: 0 });
}
```

Return accessors from `createEditorFetchMock` so the test can assign the full snapshot object to `server.setupMethods` before rendering and the fetch mock reads the same value:

```tsx
return {
  experiment,
  modules,
  requests,
  sourceModules,
  fetchMock,
  get setupMethods() {
    return serverState.setupMethods;
  },
  set setupMethods(value: Record<string, unknown> | null) {
    serverState.setupMethods = value;
  },
};
```

- [ ] **Step 3: Add editor types**

Modify `editorSectionKeys` to insert `"setup_methods"` after `"basic_info"`.

Add:

```ts
export type SetupMethodsValues = {
  sourceTemplateKey: string | null;
  sourceTemplateVersion: number | null;
  setupNameSnapshot: string;
  institutionSnapshot: string;
  apparatusDescriptionSnapshot: string;
  methodsTextSnapshot: string;
  samplePlacementDescriptionSnapshot: string;
  reactionFlowDescriptionSnapshot: string;
  referencePaperUrlSnapshot: string;
  unpublishedReasonSnapshot: string;
  diagramFileAssetId: string;
  isSameAsTemplate: boolean;
  deviationNote: string;
  semanticContextText: string;
  confirmedAt: string | null;
};
```

Add `setupMethods: SetupMethodsValues` to `ExperimentEditorValues`.
Split editor sections that persist through module payloads from all editor sections:

```ts
export type ModuleEditorSectionKey = Exclude<EditorSectionKey, "setup_methods">;

export const moduleEditorSectionKeys = editorSectionKeys.filter(
  (sectionKey): sectionKey is ModuleEditorSectionKey => sectionKey !== "setup_methods",
);

export type ModulePayloadMap = Partial<Record<ModuleEditorSectionKey, Record<string, unknown>>>;
```

Add conversion helpers in `editor-types.ts`:

```ts
export function createSetupMethodsValues(snapshot: SetupMethodsRead | null): SetupMethodsValues {
  return {
    sourceTemplateKey: snapshot?.source_template_key ?? null,
    sourceTemplateVersion: snapshot?.source_template_version ?? null,
    setupNameSnapshot: snapshot?.setup_name_snapshot ?? "",
    institutionSnapshot: snapshot?.institution_snapshot ?? "",
    apparatusDescriptionSnapshot: snapshot?.apparatus_description_snapshot ?? "",
    methodsTextSnapshot: snapshot?.methods_text_snapshot ?? "",
    samplePlacementDescriptionSnapshot: snapshot?.sample_placement_description_snapshot ?? "",
    reactionFlowDescriptionSnapshot: snapshot?.reaction_flow_description_snapshot ?? "",
    referencePaperUrlSnapshot: snapshot?.reference_paper_url_snapshot ?? "",
    unpublishedReasonSnapshot: snapshot?.unpublished_reason_snapshot ?? "",
    diagramFileAssetId: snapshot?.diagram_file_asset_id ?? "",
    isSameAsTemplate: snapshot?.is_same_as_template ?? false,
    deviationNote: snapshot?.deviation_note ?? "",
    semanticContextText: JSON.stringify(snapshot?.semantic_context ?? {}, null, 2),
    confirmedAt: snapshot?.confirmed_at ?? null,
  };
}
```

Update these existing code paths so adding `"setup_methods"` is deliberate:

- `frontend/src/features/experiments/editor-types.ts`: change `ModulePayloadMap` from `Partial<Record<EditorSectionKey, Record<string, unknown>>>` to `Partial<Record<ModuleEditorSectionKey, Record<string, unknown>>>`.
- `frontend/src/features/experiments/editor-types.ts`: add a `"setup_methods"` branch to `serializeSectionValues(sectionKey, values)` that serializes `values.setupMethods`.
- `frontend/src/features/experiments/editor-types.ts`: add a `"setup_methods"` branch to `validateSectionValues(sectionKey, values)` that returns a field error when `semanticContextText` is not valid JSON.
- `frontend/src/features/experiments/editor-types.ts`: update `createModulePayloadMap(modulePayloads)` to use `moduleEditorSectionKeys`.
- `frontend/src/features/experiments/use-experiment-editor.ts`: keep `snapshotsRef` typed as `Record<EditorSectionKey, string>` and `sectionStates` typed as `Record<EditorSectionKey, SectionSaveState>` because setup methods participates in dirty/save state.
- `frontend/src/features/experiments/use-experiment-editor.ts`: change `currentModulePayloads` and `diffModulePayloads` to `Record<ModuleEditorSectionKey, Record<string, unknown>>`.
- `frontend/src/features/experiments/use-experiment-editor.ts`: add a `setup_methods` branch in the autosave loop before the `/modules` branches, and only call `upsertExperimentModule` for `ModuleEditorSectionKey`.
- `frontend/src/features/experiments/use-experiment-editor.ts`: add a `setup_methods` entry to `moduleCompletionMap`, computed from `values.setupMethods.confirmedAt`, required field presence, and validation issues where `module_key === "setup_methods"`.

- [ ] **Step 4: Implement non-module autosave branch**

In `useExperimentEditor`, when `sectionKey === "setup_methods"`:

- call `upsertSetupMethods`
- do not call `upsertExperimentModule`
- update local setup methods state from `response.data`
- surface `response.warnings` in section save message
- expose `confirmSetupMethods` and `createSetupMethodsFromTemplate` handlers so the page can confirm or seed the section without routing through module APIs
- when `confirmSetupMethods` resolves, replace `values.setupMethods` from `response.data`, reset `snapshotsRef.current.setup_methods`, set the setup section save state to saved, and update the `["experiments", "setup-methods", currentUserId, experimentId]` query cache so the UI immediately shows `confirmedAt`
- when `createSetupMethodsFromTemplate` resolves, replace `values.setupMethods` from `response.data`, reset that section snapshot, and show returned warnings in the setup section save state

- [ ] **Step 5: Build `SetupMethodsSection`**

Component controls:

- select: seed setup template from `templateOptions`, with option value `${template_key}:${template_version}`
- button: `套用模板`, disabled until a template is selected, calls `onApplyTemplate(template_key, template_version)`
- text input: Setup 名称
- textarea: 装置说明
- textarea: Methods
- textarea: 样品放置
- textarea: 反应流程
- input: 论文链接
- textarea: 未发表说明
- select: setup diagram file from `asset_role=setup_diagram`
- checkbox: 与模板一致
- textarea: 偏差说明, visible when not same as template and template source exists
- button: 确认 Setup

- [ ] **Step 6: Wire editor page**

In `experiment-editor-page.tsx`:

- add `setup_methods` to `sectionAnchorList`
- render `SetupMethodsSection` after `ExperimentMainFields`
- add a `setupMethodsQuery` using `getSetupMethods`; catch `HttpError` with `status === 404` and return `null` so new drafts render an empty setup section
- add a `setupTemplatesQuery` using `listSetupMethodTemplates`
- add a `setupDiagramFilesQuery` using `listExperimentFiles({ experimentId, assetRole: "setup_diagram" })`; the `assetRole` filter is added in Task 9
- build `initialValues` only after experiment, modules, and setup methods queries have resolved, and call `createSetupMethodsValues(setupMethodsQuery.data ?? null)`
- pass `setupTemplatesQuery.data?.items ?? []` and `setupDiagramFilesQuery.data?.items ?? []` into `SetupMethodsSection`
- pass the template apply handler from the editor hook into `SetupMethodsSection`
- pass confirm handler from editor hook

- [ ] **Step 7: Run frontend editor tests**

Run:

```bash
cd frontend && bun run test -- setup-methods-section use-experiment-editor experiment-editor-page
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/experiments/editor-types.ts frontend/src/features/experiments/use-experiment-editor.ts frontend/src/features/experiments/experiment-editor-page.tsx frontend/src/features/experiments/components/setup-methods-section.tsx frontend/src/features/experiments/components/setup-methods-section.test.tsx frontend/src/features/experiments/components/completion-indicator.tsx frontend/src/features/experiments/use-experiment-editor.test.tsx frontend/src/features/experiments/experiment-editor-page.test.tsx
git commit -m "feat(frontend): add setup methods editor section"
```

## Task 11: Frontend Setup Diagram File Upload

**Files:**
- Modify: `frontend/src/features/experiments/api.ts`
- Modify: `frontend/src/features/experiments/experiment-files-page.tsx`
- Modify: `frontend/src/features/experiments/experiment-files-page.test.tsx`

- [ ] **Step 1: Write failing file page test**

Add a test asserting setup diagram upload does not require method and sends `asset_role=setup_diagram`.

Test expectation:

```tsx
expect(fetchMock).toHaveBeenCalledWith(
  expect.stringContaining(`/api/v1/experiments/${experimentId}/files`),
  expect.objectContaining({
    method: "POST",
  }),
);
```

Inspect the submitted `FormData` and assert:

```ts
expect(formData.get("asset_role")).toBe("setup_diagram");
expect(formData.get("method")).toBeNull();
```

- [ ] **Step 2: Run file page test to verify it fails**

Run:

```bash
cd frontend && bun run test -- experiment-files-page
```

Expected: FAIL because the page always requires method.

- [ ] **Step 3: Add asset role UI**

In `experiment-files-page.tsx`:

- add segmented/select control with values `characterization_file` and `setup_diagram`
- hide method and sample controls when `assetRole === "setup_diagram"`
- skip method validation for setup diagram
- pass `assetRole` to `uploadExperimentFile`

- [ ] **Step 4: Run file page test**

Run:

```bash
cd frontend && bun run test -- experiment-files-page
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/experiments/api.ts frontend/src/features/experiments/experiment-files-page.tsx frontend/src/features/experiments/experiment-files-page.test.tsx
git commit -m "feat(frontend): support setup diagram uploads"
```

## Task 12: Final Verification And Documentation Alignment

**Files:**
- Modify: `README.md`
- Modify: `AGENT_IMPLEMENTATION_BRIEF.md`
- Test: quality gates

- [ ] **Step 1: Update docs**

Add short notes:

- `README.md`: setup/methods is required before submit/lock
- `AGENT_IMPLEMENTATION_BRIEF.md`: V1 includes setup snapshot, setup diagram asset role, exports, and admin visibility

- [ ] **Step 2: Run backend quality gates**

Run:

```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest
```

Expected: PASS.

- [ ] **Step 3: Run frontend quality gates**

Run:

```bash
cd frontend && bun run lint && bun run typecheck && bun run test
```

Expected: PASS.

- [ ] **Step 4: Review spec coverage**

Verify each V1 acceptance item in `docs/superpowers/specs/2026-06-05-setup-methods-data-foundation-design.md` maps to implementation:

- Setup / Methods editor step: Task 10
- draft can save incomplete setup: Tasks 4 and 10
- submit and lock block missing setup: Task 5
- setup diagram upload: Tasks 3 and 11
- JSON export setup snapshot: Task 7
- Excel `Setup & Methods` sheet: Task 7
- analysis rows include setup context: Task 7
- locked export uses snapshot: Task 7
- admin can identify missing setup: Task 8
- clone requires reconfirmation: Task 6
- Recipe does not bypass gate: Task 6

- [ ] **Step 5: Commit**

```bash
git add README.md AGENT_IMPLEMENTATION_BRIEF.md
git commit -m "docs: document setup methods v1 behavior"
```

## Execution Order

Use this order:

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 8
9. Task 9
10. Task 10
11. Task 11
12. Task 12

Backend tasks should be complete before frontend editor integration, because the frontend depends on API contracts and response shapes.

## Verification Checklist

- [ ] `cd backend && uv run ruff check .`
- [ ] `cd backend && uv run ruff format --check .`
- [ ] `cd backend && uv run pytest`
- [ ] `cd frontend && bun run lint`
- [ ] `cd frontend && bun run typecheck`
- [ ] `cd frontend && bun run test`
- [ ] Manual UI check: create draft, upload setup diagram, fill Setup / Methods, confirm, submit, lock.
- [ ] Manual export check: JSON, Excel, and analysis export include setup context.

## Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-05-setup-methods-data-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
