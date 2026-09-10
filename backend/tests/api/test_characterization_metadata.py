from uuid import uuid4

import pytest
from jsonschema import Draft202012Validator
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.commands.export_v2_schema import export_v2_schema
from app.models.v2_entities import Instrument, InstrumentCapability, InstrumentVersion
from app.schemas.scientific import MeasurementBundleCreate, MeasurementConditions
from app.services.v2_reporting_service import V2ReportingService
from tests.api.test_scientific_integrity import _headers, _locked_sample, client


def test_export_restores_query_only_on_the_same_pooled_connection(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'snapshot.sqlite3'}", pool_size=2, max_overflow=0
    )
    try:
        with Session(engine) as db:
            with V2ReportingService(db)._batch_export_snapshot():
                # Return a different connection first to expose a reset after pool release.
                with engine.connect() as other:
                    other.exec_driver_sql("SELECT 1")
            with engine.connect() as first, engine.connect() as second:
                assert [
                    connection.exec_driver_sql("PRAGMA query_only").scalar()
                    for connection in (first, second)
                ] == [0, 0]
    finally:
        engine.dispose()


def test_conditional_modes_and_om_numeric_bounds_match_the_schema():
    schema = Draft202012Validator(
        export_v2_schema(output_dir=None)["json_schema_doc"]["result_models"]["measurement_bundle"]
    )
    for conditions in [
        {"observation_mode": "digital", "exposure_time_ms": -1},
        {"observation_mode": "digital", "image_bit_depth": 65},
        {
            "observation_mode": "digital",
            "image_color_mode": "monochrome",
            "white_balance_mode": "manual",
        },
        {"contrast_method": "other"},
    ]:
        payload = {
            "measurement": {
                "sample_id": str(uuid4()),
                "instrument_id": str(uuid4()),
                "instrument_version": 1,
                "method_profile": "optical_microscopy",
                "measured_at": "2026-09-09T08:00:00+08:00",
                "typed_conditions": conditions,
                "raw_file_ids": [str(uuid4())],
            }
        }
        with pytest.raises(ValueError):
            MeasurementBundleCreate.model_validate(payload)
        assert not schema.is_valid(payload)
    payload["measurement"].update(
        method_profile="TEM",
        typed_conditions={
            "accelerating_voltage_kV": 80,
            "data_type": "image",
            "acquisition_mode": "TEM",
            "image_mode": "HAADF",
        },
    )
    with pytest.raises(ValueError, match="does not apply"):
        MeasurementBundleCreate.model_validate(payload)
    assert not schema.is_valid(payload)
    payload["measurement"]["typed_conditions"]["acquisition_mode"] = "STEM"
    MeasurementBundleCreate.model_validate(payload)
    schema.validate(payload)
    with pytest.raises(ValueError, match="live time"):
        MeasurementConditions(eds_live_time_s=11, eds_real_time_s=10)


@pytest.mark.parametrize("method", ["optical_microscopy", "AFM"])
def test_metadata_file_provenance_survives_save_detail_export_and_rejects_bad_sources(
    active_user,
    db_session,
    method,
):
    run, sample = _locked_sample(db_session, active_user, "m43")
    instrument = Instrument()
    db_session.add(instrument)
    db_session.flush()
    version = InstrumentVersion(
        entity_id=instrument.id, version=1, instrument_code="META-43", name_type=method, attrs={}
    )
    db_session.add(version)
    db_session.flush()
    db_session.add(
        InstrumentCapability(
            instrument_version_id=version.id, capability_code=method, configuration_json={}
        )
    )
    db_session.commit()
    headers = _headers(active_user.email)
    files = []
    for name, category in [("original.txt", "raw"), ("processed.txt", "processed")]:
        response = client.post(
            f"/api/v1/experiments/{run.id}/files",
            headers=headers,
            data={
                "sample_id": str(sample.id),
                "method": method,
                "asset_role": "characterization_file",
                "file_category": category,
            },
            files={"file": (name, b"measurement data", "text/plain")},
        )
        assert response.status_code == 201, response.text
        files.append(response.json()["id"])
    conditions = (
        {
            "observation_mode": "digital",
            "exposure_time_ms": 12.5,
            "image_color_mode": "color",
            "white_balance_mode": "one_shot",
            "white_balance_settings": "R=1.2 G=1 B=1.4",
            "detector_gain": "6 dB",
        }
        if method == "optical_microscopy"
        else {
            "scan_size_um": {"x": 5, "y": 5},
            "mode": "tapping",
            "feedback_setpoint": "70% A0",
            "height_processing": "平面校平，排除台阶",
        }
    )
    payload = {
        "measurement": {
            "sample_id": str(sample.id),
            "method_profile": method,
            "instrument_id": str(instrument.id),
            "instrument_version": 1,
            "measured_at": "2026-09-09T10:00:00+08:00",
            "typed_conditions": conditions,
            "operator_name": "测试中心操作员",
            "operator_institution": "测试中心",
            "raw_file_ids": [files[0]],
            "supplementary_files": [
                {
                    "file_id": files[1],
                    "role": "processed",
                    "source_file_ids": [str(uuid4())],
                    "description": "校平或颜色校正",
                }
            ],
        },
        "properties": [],
    }
    rejected = client.post("/api/v1/measurements", headers=headers, json=payload)
    assert rejected.status_code == 422
    payload["measurement"]["supplementary_files"][0]["source_file_ids"] = [files[0]]
    if method == "AFM":
        payload["properties"] = [
            {
                "property_code": "afm_step_height",
                "numeric_value": 0.8,
                "unit": "nm",
                "source_file_id": files[1],
                "source_locator": "Height Trace / profile 2",
                "processing_note": "两平台平均高度差",
            }
        ]
    response = client.post("/api/v1/measurements", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    detail = client.get(f"/api/v1/measurements/{response.json()['id']}", headers=headers).json()
    assert detail["typed_conditions"] == conditions
    assert detail["operator_name"] == "测试中心操作员"
    assert detail["performed_by_id"] == str(active_user.id)
    assert [f["id"] for f in detail["raw_files"]] == [files[0]]
    assert [f["id"] for f in detail["supplementary_files"]] == [files[1]]
    assert detail["file_contexts"][0]["source_file_ids"] == [files[0]]
    exported = client.get(
        f"/api/v1/experiments/{run.id}/export",
        headers=headers,
        params={"revision_id": str(run.current_revision_id)},
    )
    assert exported.status_code == 200, exported.text
    measurement = exported.json()["scientific_record"]["measurements"][0]
    assert measurement["raw_file_ids"] == [files[0]]
    assert measurement["supplementary_files"][0]["file_id"] == files[1]
    assert measurement["operator_name"] == "测试中心操作员"
    if method == "AFM":
        assert detail["properties"][0]["source_file_id"] == files[1]
        assert measurement["properties"][0]["source_locator"] == "Height Trace / profile 2"
    for file_id in files:
        assert client.delete(f"/api/v1/files/{file_id}", headers=headers).status_code == 409
