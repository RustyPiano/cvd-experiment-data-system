import csv
import hashlib
import io
import json
import os
import zipfile
from pathlib import Path
from uuid import UUID

from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from alembic import command
from app.core.config import get_settings
from app.models.experiment import ExperimentRun
from app.models.sample import Sample
from app.models.scientific import (
    RunContributor,
    RunRevision,
    SampleRevisionAssociation,
    SampleRevisionState,
)
from app.models.user import User
from app.models.v2_results import CharacterizationRecord
from app.services.v2_reporting_service import V2ReportingService

USER_ID = "11111111111141118111111111111111"
RUN_ID = "22222222222242228222222222222222"
SAMPLE_ID = "33333333333343338333333333333333"
SOURCE_ID = "44444444444444448444444444444444"
RECORD_ID = "55555555555545558555555555555555"
PRODUCT_ID = "66666666666646668666666666666666"
CURRENT_RUN_ID = "77777777777747778777777777777777"
CURRENT_REVISION_ID = "88888888888848888888888888888888"
CURRENT_SAMPLE_ID = "99999999999949998999999999999999"


def test_populated_0002_upgrade_backfills_revision_and_preserves_export(
    tmp_path: Path,
) -> None:
    database = tmp_path / "legacy-production.sqlite3"
    url = f"sqlite+pysqlite:///{database}"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option(
        "script_location",
        str(Path(__file__).resolve().parents[2] / "alembic"),
    )
    config.set_main_option("sqlalchemy.url", url)
    original_url = os.environ["DATABASE_URL"]
    os.environ["DATABASE_URL"] = url
    get_settings.cache_clear()
    try:
        command.upgrade(config, "20260728_0002")
        engine = create_engine(url)
        modules = {
            "basic_info": {"operator": "Legacy User"},
            "target_product": {"chemical_formula": "MoS2"},
            "precursors": {"items": []},
            "substrates": {
                "items": [
                    {
                        "source_id": str(UUID(SOURCE_ID)),
                        "material": "SiO2/Si",
                    }
                ]
            },
            "process_steps": {"items": []},
            "process_events": {"items": []},
        }
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO users (
                        id, email, name, password_hash, role, is_active
                    ) VALUES (
                        :id, 'legacy@example.com', 'Legacy User', 'hash', 'member', 1
                    )
                    """
                ),
                {"id": USER_ID},
            )
            connection.execute(
                text(
                    """
                    INSERT INTO experiment_runs (
                        id, run_code, owner_id, schema_version, material_system,
                        experiment_date, objective, status, locked_at,
                        result_missing_todo
                    ) VALUES (
                        :id, 'CVD-2026-0042', :owner_id, 'cvd_v2', 'MoS2',
                        '2026-07-28', 'legacy production run', 'locked',
                        '2026-07-28 12:00:00', 0
                    )
                    """
                ),
                {"id": RUN_ID, "owner_id": USER_ID},
            )
            for index, (module_key, payload) in enumerate(modules.items(), 1):
                connection.execute(
                    text(
                        """
                        INSERT INTO experiment_module_payloads (
                            id, experiment_run_id, module_key, schema_version, payload_json
                        ) VALUES (:id, :run_id, :module_key, 'cvd_v2', :payload)
                        """
                    ),
                    {
                        "id": f"{index:032x}",
                        "run_id": RUN_ID,
                        "module_key": module_key,
                        "payload": json.dumps(payload, ensure_ascii=False),
                    },
                )
            connection.execute(
                text(
                    """
                    INSERT INTO samples (
                        id, sample_code, experiment_run_id, role, source_substrate_id,
                        source_substrate_snapshot_json, metadata_json
                    ) VALUES (
                        :id, 'CVD-2026-0042-S01', :run_id, 'growth', :source_id,
                        :snapshot, :metadata
                    )
                    """
                ),
                {
                    "id": SAMPLE_ID,
                    "run_id": RUN_ID,
                    "source_id": SOURCE_ID,
                    "snapshot": json.dumps({"material": "SiO2/Si"}),
                    "metadata": json.dumps({"legacy_note": "keep me"}),
                },
            )
            connection.execute(
                text(
                    """
                    INSERT INTO characterization_records (
                        id, experiment_run_id, sample_id, method_instrument,
                        test_conditions, raw_data, attrs
                    ) VALUES (
                        :id, :run_id, :sample_id, 'Raman',
                        '532 nm', :raw_data, :attrs
                    )
                    """
                ),
                {
                    "id": RECORD_ID,
                    "run_id": RUN_ID,
                    "sample_id": SAMPLE_ID,
                    "raw_data": json.dumps({"filename": "legacy.txt"}),
                    "attrs": json.dumps({"legacy_record": True}),
                },
            )
            connection.execute(
                text(
                    """
                    INSERT INTO measured_products (
                        id, sample_id, characterization_record_id, observed_phenomena,
                        detected_phase_stacking, layer_count, coverage_percent,
                        measured_layers_coverage, domain_nucleation_continuity,
                        key_spectral_metrics, attrs
                    ) VALUES (
                        :id, :sample_id, :record_id, :phenomena,
                        '2H', 2, 87.5, '2层；87.5%', '低成核密度；连续',
                        :metrics, :attrs
                    )
                    """
                ),
                {
                    "id": PRODUCT_ID,
                    "sample_id": SAMPLE_ID,
                    "record_id": RECORD_ID,
                    "phenomena": json.dumps(["continuous_film"]),
                    "metrics": json.dumps([{"peak": 383.2, "unit": "cm-1"}]),
                    "attrs": json.dumps({"legacy_measurement": True}),
                },
            )

        command.upgrade(config, "20260729_0006")
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    UPDATE samples
                    SET actual_state = 'growth_present'
                    WHERE id = :sample_id
                    """
                ),
                {"sample_id": SAMPLE_ID},
            )
            connection.execute(
                text(
                    """
                    INSERT INTO experiment_runs (
                        id, run_code, owner_id, schema_version, experiment_date,
                        status, current_revision_id, result_missing_todo
                    ) VALUES (
                        :id, 'CVD-2026-DEV', :owner_id, 'cvd_v2', '2026-07-29',
                        'invalid', NULL, 0
                    )
                    """
                ),
                {"id": CURRENT_RUN_ID, "owner_id": USER_ID},
            )
            connection.execute(
                text(
                    """
                    INSERT INTO run_revisions (
                        id, experiment_run_id, revision_number, schema_version,
                        schema_status, status, content_json, content_sha256,
                        locked_by_id, locked_at
                    ) VALUES (
                        :id, :run_id, 1, 'v4.0-alpha.2', 'internal_validation',
                        'locked', '{}', :sha, :owner_id, '2026-07-29 12:00:00'
                    )
                    """
                ),
                {
                    "id": CURRENT_REVISION_ID,
                    "run_id": CURRENT_RUN_ID,
                    "sha": "a" * 64,
                    "owner_id": USER_ID,
                },
            )
            connection.execute(
                text(
                    """
                    UPDATE experiment_runs
                    SET current_revision_id = :revision_id
                    WHERE id = :run_id
                    """
                ),
                {"revision_id": CURRENT_REVISION_ID, "run_id": CURRENT_RUN_ID},
            )
            connection.execute(
                text(
                    """
                    INSERT INTO samples (
                        id, sample_code, experiment_run_id, run_revision_id, role,
                        actual_state, identity_state, metadata_json
                    ) VALUES (
                        :id, 'CVD-2026-DEV-S01', :run_id, :revision_id, 'growth',
                        'no_growth', 'unknown', '{}'
                    )
                    """
                ),
                {
                    "id": CURRENT_SAMPLE_ID,
                    "run_id": CURRENT_RUN_ID,
                    "revision_id": CURRENT_REVISION_ID,
                },
            )

        command.upgrade(config, "head")
        with Session(engine) as session:
            run = session.get(ExperimentRun, UUID(RUN_ID))
            user = session.get(User, UUID(USER_ID))
            sample = session.get(Sample, UUID(SAMPLE_ID))
            record = session.get(CharacterizationRecord, UUID(RECORD_ID))
            assert run is not None and user is not None and sample is not None
            assert record is not None and run.current_revision_id is not None

            revision = session.get(RunRevision, run.current_revision_id)
            assert revision is not None
            assert revision.content_json["modules"] == modules
            canonical = json.dumps(
                revision.content_json,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode()
            assert revision.content_sha256 == hashlib.sha256(canonical).hexdigest()
            assert sample.run_revision_id == revision.id
            assert record.run_revision_id == revision.id
            assert record.performed_by_id == user.id
            assert record.measured_at is not None
            assert record.sample_region == {"geometry_type": "legacy_unspecified"}

            association = session.scalar(
                select(SampleRevisionAssociation).where(
                    SampleRevisionAssociation.sample_id == sample.id,
                    SampleRevisionAssociation.run_revision_id == revision.id,
                )
            )
            state = session.scalar(
                select(SampleRevisionState).where(
                    SampleRevisionState.sample_id == sample.id,
                    SampleRevisionState.run_revision_id == revision.id,
                )
            )
            assert association is not None
            assert association.sample_snapshot_json["source_substrate_snapshot"] == {
                "material": "SiO2/Si"
            }
            assert state is not None
            assert (state.growth_state, state.identity_state) == ("unknown", "unknown")
            current_sample_state = session.scalar(
                select(SampleRevisionState).where(
                    SampleRevisionState.sample_id == UUID(CURRENT_SAMPLE_ID),
                    SampleRevisionState.run_revision_id == UUID(CURRENT_REVISION_ID),
                )
            )
            current_association = session.scalar(
                select(SampleRevisionAssociation).where(
                    SampleRevisionAssociation.sample_id == UUID(CURRENT_SAMPLE_ID),
                    SampleRevisionAssociation.run_revision_id == UUID(CURRENT_REVISION_ID),
                )
            )
            assert current_association is not None
            assert current_sample_state is not None
            assert current_sample_state.growth_state == "unknown"
            assert set(
                session.scalars(
                    select(RunContributor.role).where(RunContributor.run_revision_id == revision.id)
                )
            ) == {"recorded_by", "performed_by"}

            archive_bytes, _ = V2ReportingService(session).export_runs_zip(user)
            with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
                sample_rows = list(
                    csv.DictReader(io.StringIO(archive.read("samples.csv").decode("utf-8-sig")))
                )
                result_rows = list(
                    csv.DictReader(
                        io.StringIO(
                            archive.read("characterization_results.csv").decode("utf-8-sig")
                        )
                    )
                )
                records_json = json.loads(archive.read("records.json"))
            assert {row["sample_code"] for row in sample_rows} == {"CVD-2026-0042-S01"}
            legacy_rows = [row for row in result_rows if row["layer_count"] == "2"]
            assert {row["result_code"] for row in legacy_rows} == {"CVD-2026-0042-S01-R01"}
            assert {row["measured_layers_coverage"] for row in legacy_rows} == {"2层；87.5%"}
            assert {row["domain_nucleation_continuity"] for row in legacy_rows} == {
                "低成核密度；连续"
            }
            assert ("key_spectral_metrics", "[0].peak", "383.2") in {
                (row["detail_scope"], row["detail_path"], row["detail_value"])
                for row in legacy_rows
            }
            assert len(records_json["runs"][0]["scientific_record"]["measurements"]) == 1
            legacy_products = records_json["runs"][0]["scientific_record"][
                "legacy_measured_products"
            ]
            assert len(legacy_products) == 1
            assert legacy_products[0]["measured_layers_coverage"] == "2层；87.5%"
    finally:
        os.environ["DATABASE_URL"] = original_url
        get_settings.cache_clear()
