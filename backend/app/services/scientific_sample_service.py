from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.sample import Sample, SampleRole
from app.models.scientific import (
    TransformationInput,
    TransformationOutput,
    TransformationRun,
)
from app.models.user import User, UserRole
from app.repositories.experiment_repository import ExperimentRepository
from app.schemas.scientific import (
    LineageSampleRead,
    LineageTransformationRead,
    SampleLineageRead,
    TransformationRunCreate,
    TransformationRunRead,
)
from app.services.audit_service import AuditService
from app.services.experiment_guards import get_visible_experiment
from app.services.sample_service import (
    SampleService,
    ensure_sample_revision_association,
    sample_revision_snapshot,
)
from app.services.v2_field_source import normalize_offset_datetime


class ScientificSampleService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.samples = SampleService(db)
        self.experiments = ExperimentRepository(db)
        self.audit = AuditService(db)

    def create_transformation(
        self,
        payload: TransformationRunCreate,
        actor: User,
    ) -> TransformationRunRead:
        sample_run_rows = list(
            self.db.execute(
                select(Sample.id, Sample.experiment_run_id).where(
                    Sample.id.in_(payload.input_sample_ids),
                    Sample.deleted_at.is_(None),
                )
            )
        )
        if {row.id for row in sample_run_rows} != set(payload.input_sample_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="An input sample is missing or inactive",
            )
        runs: dict[UUID, ExperimentRun] = {}
        for run_id in sorted({row.experiment_run_id for row in sample_run_rows}, key=str):
            run = self.experiments.get_by_id_for_update(run_id)
            if run is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="An input sample run is missing",
                )
            runs[run.id] = run
        inputs = list(
            self.db.scalars(
                select(Sample)
                .where(
                    Sample.id.in_(payload.input_sample_ids),
                    Sample.deleted_at.is_(None),
                )
                .order_by(Sample.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        if {item.id for item in inputs} != set(payload.input_sample_ids) or any(
            item.experiment_run_id not in runs for item in inputs
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="An input sample is missing or inactive",
            )
        if any(item.lifecycle_state != "active" for item in inputs):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Every input sample must be active",
            )
        by_id = {item.id: item for item in inputs}
        inputs = [by_id[item_id] for item_id in payload.input_sample_ids]
        if actor.role != UserRole.ADMIN and any(run.owner_id != actor.id for run in runs.values()):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if any(
            run.status not in {ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED}
            or run.current_revision_id is None
            for run in runs.values()
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Every input run must be locked or reviewed",
            )
        if payload.output_experiment_run_id is None:
            if len(runs) != 1:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Cross-run transformations require output_experiment_run_id",
                )
            output_run = next(iter(runs.values()))
        else:
            output_run = runs.get(payload.output_experiment_run_id)
            if output_run is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Output run must be one of the input sample runs",
                )
        producer_times = self.db.scalars(
            select(TransformationRun.occurred_at)
            .join(
                TransformationOutput,
                TransformationOutput.transformation_run_id == TransformationRun.id,
            )
            .where(TransformationOutput.sample_id.in_(payload.input_sample_ids))
        )
        if any(
            payload.occurred_at < normalize_offset_datetime(produced_at)
            for produced_at in producer_times
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Transformation cannot occur before an input sample was produced",
            )
        transformation = TransformationRun(
            output_experiment_run_id=output_run.id,
            transformation_type=payload.transformation_type,
            operator_id=actor.id,
            occurred_at=payload.occurred_at,
            parameters_json=payload.parameters,
            destination_substrate_snapshot=payload.destination_substrate_snapshot,
            note=payload.note,
        )
        self.db.add(transformation)
        self.db.flush()
        for input_ordinal, sample in enumerate(inputs):
            source_run = runs[sample.experiment_run_id]
            run_revision_id = source_run.current_revision_id
            assert run_revision_id is not None
            if sample.role == SampleRole.GROWTH.value and sample.run_revision_id != run_revision_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Historical growth samples cannot be transformed",
                )
            ensure_sample_revision_association(self.db, sample, run_revision_id)
            self.db.add(
                TransformationInput(
                    transformation_run_id=transformation.id,
                    sample_id=sample.id,
                    input_role=f"input_{input_ordinal + 1}",
                    run_revision_id=run_revision_id,
                    provenance_json=sample_revision_snapshot(sample)
                    | {
                        "run_revision_id": str(run_revision_id),
                        "input_ordinal": input_ordinal,
                        "consumed_by_this_transformation": payload.consume_inputs,
                        "captured_at": datetime.now(UTC).isoformat(),
                    },
                )
            )
            if payload.consume_inputs:
                sample.lifecycle_state = "consumed"

        outputs: list[Sample] = []
        for output in payload.outputs:
            sample = Sample(
                sample_code=self.samples.next_sample_code(output_run),
                experiment_run_id=output_run.id,
                run_revision_id=None,
                role=SampleRole.DERIVED.value,
                parent_sample_id=inputs[0].id if len(inputs) == 1 else None,
                actual_state="unknown",
                current_carrier=output.current_carrier,
                sample_region=output.sample_region,
                dimensions_json=output.dimensions,
                lifecycle_state="active",
                control_subtype=output.control_subtype,
                metadata_json={},
            )
            self.db.add(sample)
            self.db.flush()
            assert output_run.current_revision_id is not None
            ensure_sample_revision_association(
                self.db,
                sample,
                output_run.current_revision_id,
            )
            outputs.append(sample)
            self.db.add(
                TransformationOutput(
                    transformation_run_id=transformation.id,
                    sample_id=sample.id,
                    output_role=output.output_role,
                )
            )
        self.audit.record_event(
            actor=actor,
            entity_type="transformation_run",
            entity_id=transformation.id,
            action="create",
            before_json=None,
            after_json={
                "transformation_type": payload.transformation_type,
                "input_sample_ids": [str(item.id) for item in inputs],
                "output_sample_ids": [str(item.id) for item in outputs],
                "consume_inputs": payload.consume_inputs,
            },
        )
        self.db.commit()
        return TransformationRunRead(
            id=transformation.id,
            output_experiment_run_id=output_run.id,
            transformation_type=transformation.transformation_type,
            operator_id=actor.id,
            occurred_at=transformation.occurred_at,
            input_sample_ids=[item.id for item in inputs],
            output_sample_ids=[item.id for item in outputs],
        )

    def lineage(self, sample_id: UUID, actor: User) -> SampleLineageRead:
        root = self.db.get(Sample, sample_id)
        if root is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found")
        get_visible_experiment(self.experiments, root.experiment_run_id, actor)
        sample_ids = {sample_id}
        transformation_ids: set[UUID] = set()
        frontier = {sample_id}
        # ponytail: breadth-first queries are enough for lab-scale graphs; use a recursive
        # CTE if lineage depth or query counts become measurable.
        while frontier:
            found = set(
                self.db.scalars(
                    select(TransformationInput.transformation_run_id).where(
                        TransformationInput.sample_id.in_(frontier)
                    )
                )
            ) | set(
                self.db.scalars(
                    select(TransformationOutput.transformation_run_id).where(
                        TransformationOutput.sample_id.in_(frontier)
                    )
                )
            )
            found -= transformation_ids
            if not found:
                break
            transformation_ids.update(found)
            connected = set(
                self.db.scalars(
                    select(TransformationInput.sample_id).where(
                        TransformationInput.transformation_run_id.in_(found)
                    )
                )
            ) | set(
                self.db.scalars(
                    select(TransformationOutput.sample_id).where(
                        TransformationOutput.transformation_run_id.in_(found)
                    )
                )
            )
            frontier = connected - sample_ids
            sample_ids.update(connected)
        samples = list(
            self.db.scalars(
                select(Sample).where(Sample.id.in_(sample_ids)).order_by(Sample.sample_code)
            )
        )
        for run_id in {item.experiment_run_id for item in samples}:
            get_visible_experiment(
                self.experiments,
                run_id,
                actor,
            )
        transformations = (
            list(
                self.db.scalars(
                    select(TransformationRun)
                    .where(TransformationRun.id.in_(transformation_ids))
                    .order_by(TransformationRun.occurred_at, TransformationRun.id)
                )
            )
            if transformation_ids
            else []
        )
        inputs = (
            list(
                self.db.scalars(
                    select(TransformationInput).where(
                        TransformationInput.transformation_run_id.in_(transformation_ids)
                    )
                )
            )
            if transformation_ids
            else []
        )
        outputs = (
            list(
                self.db.scalars(
                    select(TransformationOutput).where(
                        TransformationOutput.transformation_run_id.in_(transformation_ids)
                    )
                )
            )
            if transformation_ids
            else []
        )
        return SampleLineageRead(
            samples=[
                LineageSampleRead(
                    id=item.id,
                    experiment_run_id=item.experiment_run_id,
                    sample_code=item.sample_code,
                    role=item.role,
                    actual_state=item.actual_state,
                    actual_material_summary=item.actual_material_summary,
                    lifecycle_state=item.lifecycle_state,
                    deleted_at=item.deleted_at,
                )
                for item in samples
            ],
            transformations=[
                LineageTransformationRead(
                    id=item.id,
                    output_experiment_run_id=item.output_experiment_run_id,
                    transformation_type=item.transformation_type,
                    occurred_at=item.occurred_at,
                    operator_id=item.operator_id,
                    input_sample_ids=[
                        link.sample_id for link in inputs if link.transformation_run_id == item.id
                    ],
                    output_sample_ids=[
                        link.sample_id for link in outputs if link.transformation_run_id == item.id
                    ],
                )
                for item in transformations
            ],
        )
