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
from app.schemas.scientific import (
    LineageSampleRead,
    LineageTransformationRead,
    SampleLineageRead,
    TransformationRunCreate,
    TransformationRunRead,
)
from app.services.audit_service import AuditService
from app.services.sample_service import SampleService


class ScientificSampleService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.samples = SampleService(db)
        self.audit = AuditService(db)

    def create_transformation(
        self,
        payload: TransformationRunCreate,
        actor: User,
    ) -> TransformationRunRead:
        inputs = list(
            self.db.scalars(
                select(Sample)
                .where(
                    Sample.id.in_(payload.input_sample_ids),
                    Sample.deleted_at.is_(None),
                )
                .order_by(Sample.id)
                .with_for_update()
            )
        )
        if {item.id for item in inputs} != set(payload.input_sample_ids):
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
        runs = {
            run.id: run
            for run in self.db.scalars(
                select(ExperimentRun).where(
                    ExperimentRun.id.in_({item.experiment_run_id for item in inputs})
                )
            )
        }
        if actor.role != UserRole.ADMIN and any(run.owner_id != actor.id for run in runs.values()):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if any(
            run.status not in {ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED}
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
        for sample in inputs:
            self.db.add(
                TransformationInput(
                    transformation_run_id=transformation.id,
                    sample_id=sample.id,
                    run_revision_id=sample.run_revision_id,
                    provenance_json={
                        "sample_id": str(sample.id),
                        "sample_code": sample.sample_code,
                        "experiment_run_id": str(sample.experiment_run_id),
                        "run_revision_id": (
                            str(sample.run_revision_id) if sample.run_revision_id else None
                        ),
                        "role": sample.role,
                        "actual_state": sample.actual_state,
                        "lifecycle_state": sample.lifecycle_state,
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
        self.samples.get_sample(sample_id, actor)
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
                select(Sample)
                .where(Sample.id.in_(sample_ids), Sample.deleted_at.is_(None))
                .order_by(Sample.sample_code)
            )
        )
        for run_id in {item.experiment_run_id for item in samples}:
            self.samples.get_sample(
                next(item.id for item in samples if item.experiment_run_id == run_id),
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
                    sample_code=item.sample_code,
                    role=item.role,
                    actual_state=item.actual_state,
                    actual_material_summary=item.actual_material_summary,
                    lifecycle_state=item.lifecycle_state,
                )
                for item in samples
            ],
            transformations=[
                LineageTransformationRead(
                    id=item.id,
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
