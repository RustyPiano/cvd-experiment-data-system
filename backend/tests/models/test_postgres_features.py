import csv
import io
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.sample import Sample
from app.models.scientific import RunRevision
from app.models.v2_entities import MaterialLotVersion
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.schemas.generated.v2_module_payload import MaterialLotVersionPayload
from app.services.v2_entity_service import V2EntityService
from app.services.v2_field_source import SCHEMA_VERSION
from app.services.v2_reporting_service import V2ReportingService
from tests.helpers.v2_payloads import chemical_lot_payload


def test_postgres_search_indexes_and_version_triggers(db_session, active_user) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL smoke only")

    indexes = set(
        db_session.scalars(
            text("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()")
        )
    )
    assert {
        "ix_experiment_runs_run_code_trgm",
        "ix_experiment_runs_material_system_trgm",
        "ix_experiment_runs_objective_trgm",
        "ix_module_payloads_operator_trgm",
    } <= indexes

    triggers = set(
        db_session.scalars(
            text(
                "SELECT trigger_name FROM information_schema.triggers "
                "WHERE trigger_schema = current_schema()"
            )
        )
    )
    assert {
        "trg_material_lot_versions_immutable",
        "trg_setup_versions_immutable",
        "trg_instrument_versions_immutable",
        "trg_run_revisions_immutable",
    } <= triggers

    run = ExperimentRun(
        run_code="CVD-2026-9699",
        owner_id=active_user.id,
        schema_version=SCHEMA_VERSION,
        material_system="MoS2",
        experiment_date=date(2026, 7, 24),
        status=ExperimentStatus.LOCKED,
    )
    db_session.add(run)
    db_session.flush()
    revision_row = RunRevision(
        experiment_run_id=run.id,
        revision_number=1,
        schema_version=SCHEMA_VERSION,
        schema_status="INTERNAL_VALIDATION",
        status="locked",
        content_json={"run": {"id": str(run.id)}, "modules": {}},
        content_sha256="a" * 64,
        locked_by_id=active_user.id,
    )
    db_session.add(revision_row)
    db_session.commit()
    with pytest.raises(DBAPIError):
        db_session.execute(
            text("UPDATE run_revisions SET content_sha256 = :hash WHERE id = :id"),
            {"hash": "f" * 64, "id": revision_row.id},
        )
        db_session.commit()
    db_session.rollback()

    entity_id = uuid4()
    version_id = uuid4()
    db_session.execute(
        text("INSERT INTO material_lots (id) VALUES (:id)"),
        {"id": entity_id},
    )
    db_session.execute(
        text(
            """
            INSERT INTO material_lot_versions
                (id, entity_id, version, lot_category, substance_name,
                 chemical_formula, batch_number, attrs)
            VALUES
                (:id, :entity_id, 1, 'chemical', 'MoO3', 'MoO3', 'B1', '{}')
            """
        ),
        {"id": version_id, "entity_id": entity_id},
    )
    db_session.commit()

    with pytest.raises(DBAPIError):
        db_session.execute(
            text("UPDATE material_lot_versions SET version = 2 WHERE id = :id"),
            {"id": version_id},
        )
        db_session.commit()
    db_session.rollback()

    with pytest.raises(DBAPIError):
        db_session.execute(
            text("DELETE FROM material_lot_versions WHERE id = :id"),
            {"id": version_id},
        )
        db_session.commit()
    db_session.rollback()


def test_postgres_batch_export_uses_one_repeatable_read_snapshot(
    db_session,
    active_user,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL concurrency only")

    run = ExperimentRun(
        run_code="CVD-2026-9701",
        owner_id=active_user.id,
        schema_version=SCHEMA_VERSION,
        material_system="MoS2",
        experiment_date=date(2026, 7, 24),
        status=ExperimentStatus.LOCKED,
    )
    db_session.add(run)
    db_session.flush()
    batch_revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=1,
        schema_version=SCHEMA_VERSION,
        schema_status="INTERNAL_VALIDATION",
        status="locked",
        content_json={"run": {"id": str(run.id)}, "modules": {}},
        content_sha256="b" * 64,
        locked_by_id=active_user.id,
    )
    db_session.add(batch_revision)
    db_session.flush()
    run.current_revision_id = batch_revision.id
    db_session.commit()
    run_id = run.id

    class ConcurrentInsertReportingService(V2ReportingService):
        def _visible_runs_for_export(self, current_user, **filters):
            runs = super()._visible_runs_for_export(current_user, **filters)
            with Session(bind=self.db.get_bind()) as writer:
                writer.add(
                    Sample(
                        sample_code="CVD-2026-9701-CONCURRENT",
                        experiment_run_id=run_id,
                        role="control",
                    )
                )
                writer.commit()
            return runs

    content, _ = ConcurrentInsertReportingService(db_session).export_runs_zip(
        active_user,
        query_text="9701",
    )

    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        samples = list(csv.DictReader(io.StringIO(archive.read("samples.csv").decode("utf-8-sig"))))
    assert samples == []
    with Session(bind=db_session.get_bind()) as verifier:
        assert (
            verifier.query(Sample).filter(Sample.sample_code == "CVD-2026-9701-CONCURRENT").count()
            == 1
        )


def test_postgres_single_export_uses_one_repeatable_read_snapshot(
    db_session,
    active_user,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL concurrency only")

    run = ExperimentRun(
        run_code="CVD-2026-9702",
        owner_id=active_user.id,
        schema_version=SCHEMA_VERSION,
        material_system="MoS2",
        experiment_date=date(2026, 7, 24),
        status=ExperimentStatus.LOCKED,
    )
    db_session.add(run)
    db_session.flush()
    sample = Sample(
        sample_code="CVD-2026-9702-S1",
        experiment_run_id=run.id,
        role="control",
    )
    db_session.add(sample)
    revision = RunRevision(
        experiment_run_id=run.id,
        revision_number=1,
        schema_version=SCHEMA_VERSION,
        schema_status="INTERNAL_VALIDATION",
        status="locked",
        content_json={"run": {"id": str(run.id)}, "modules": {}},
        content_sha256="c" * 64,
        locked_by_id=active_user.id,
    )
    db_session.add(revision)
    db_session.flush()
    run.current_revision_id = revision.id
    sample.run_revision_id = revision.id
    db_session.commit()
    run_id = run.id
    sample_id = sample.id

    class ConcurrentInsertReportingService(V2ReportingService):
        def _records(self, export_run_id, revision_id=None):
            records = super()._records(export_run_id, revision_id)
            with Session(bind=self.db.get_bind()) as writer:
                record = CharacterizationRecord(
                    experiment_run_id=run_id,
                    sample_id=sample_id,
                    method_instrument="Raman",
                )
                writer.add(record)
                writer.flush()
                writer.add(
                    MeasuredProduct(
                        sample_id=sample_id,
                        characterization_record_id=record.id,
                        observed_phenomena=["no_growth"],
                    )
                )
                writer.commit()
            return records

    content, _ = ConcurrentInsertReportingService(db_session).export_run_json(
        run_id,
        revision.id,
        active_user,
    )

    assert b'"measurements": []' in content
    with Session(bind=db_session.get_bind()) as verifier:
        assert verifier.query(CharacterizationRecord).filter_by(sample_id=sample_id).count() == 1
        assert verifier.query(MeasuredProduct).filter_by(sample_id=sample_id).count() == 1


def test_postgres_entity_file_can_only_be_bound_once(db_session, active_user) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL concurrency only")

    asset = FileAsset(
        uploaded_by_id=active_user.id,
        original_name="coa.pdf",
        storage_path=f"entity/{uuid4()}_coa.pdf",
        size_bytes=3,
        sha256="b" * 64,
        method="entity_reference",
        file_category="raw",
        asset_role="entity_attachment",
        file_kind="entity_reference",
        metadata_json={},
    )
    db_session.add(asset)
    db_session.commit()
    file_id = asset.id
    bind = db_session.get_bind()
    barrier = Barrier(2)

    def bind_file(batch_number: str) -> int:
        with Session(bind=bind) as session:
            payload = MaterialLotVersionPayload.model_validate(
                chemical_lot_payload(
                    batch_number=batch_number,
                    coa_attachment={
                        "file_asset_id": str(file_id),
                        "sha256": "b" * 64,
                    },
                )
            )
            barrier.wait()
            try:
                V2EntityService(session).create_entity(
                    "material_lot",
                    payload,
                    active_user,
                )
            except HTTPException as exc:
                session.rollback()
                return exc.status_code
            return 201

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(pool.map(bind_file, ("RACE-A", "RACE-B")))

    assert statuses == [201, 422]
    with Session(bind=bind) as verifier:
        versions = verifier.query(MaterialLotVersion).all()
        references = [
            version
            for version in versions
            if (version.attrs.get("coa_attachment") or {}).get("file_asset_id") == str(file_id)
        ]
        assert len(references) == 1
        saved_asset = verifier.get(FileAsset, file_id)
        assert saved_asset is not None
        assert saved_asset.entity_id == references[0].entity_id
        assert saved_asset.entity_version == references[0].version
