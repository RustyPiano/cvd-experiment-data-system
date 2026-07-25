"""P4 验收门回归测试：一条完整 cvd_v2 炉次的全流程走查。

覆盖：实体登记（物料/装置/仪器）→ 创建炉次 → 装置引用快照 → 全模块 payload
（含条件必填：异质结 components、固态源用量、SiO₂/Si 氧化层、反应生长外场+压力、
降温参数）→ 样品 → 表征记录（仪器引用）→ 实测产物 → check-r0 合规报告 compliant。
"""

import csv
import io
import zipfile
from copy import deepcopy
from uuid import UUID

from fastapi.testclient import TestClient

from app.commands.check_r0 import build_r0_reports
from app.main import app
from app.models.module_payload import ExperimentModulePayload
from app.schemas.generated.v2_module_payload import validate_v2_module_payload
from tests.helpers.v2_payloads import (
    basic_info_payload,
    gas_lot_payload,
    lot_reference,
    reaction_step,
    setup_payload,
    substrate_item,
    substrate_lot_payload,
    target_product_payload,
)

client = TestClient(app)


def _auth_headers(email: str, password: str = "Password123!") -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_full_v2_run_walkthrough(active_user, admin_user, db_session) -> None:
    headers = _auth_headers(active_user.email)
    admin_headers = _auth_headers(admin_user.email)

    lot = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "化学品",
            "substance_name": "三氧化钼",
            "chemical_formula": "MoO3",
            "cas_number": "1313-27-5",
            "batch_number": "B202405",
            "supplier": "阿拉丁",
            "purity": 99.95,
        },
        headers=admin_headers,
    )
    assert lot.status_code == 201, lot.text

    substrate_lot = client.post(
        "/api/v1/material-lots",
        json=substrate_lot_payload(
            batch_number="WAFER-B202405",
            material="sio2_si",
            chemical_formula="SiO2",
        ),
        headers=admin_headers,
    )
    assert substrate_lot.status_code == 201, substrate_lot.text

    gas_lot = client.post(
        "/api/v1/material-lots",
        json=gas_lot_payload(batch_number="AR-B202405"),
        headers=admin_headers,
    )
    assert gas_lot.status_code == 201, gas_lot.text

    setup = client.post(
        "/api/v1/setups",
        json=setup_payload(
            setup_code="CVD-炉1",
            setup_name="1号双温区管式炉",
            field_devices=["plasma"],
            wall_type="hot_wall",
        ),
        headers=admin_headers,
    )
    assert setup.status_code == 201, setup.text

    instrument = client.post(
        "/api/v1/instruments",
        json={"instrument_code": "RAMAN-1", "name_type": "Raman", "vendor": "Horiba"},
        headers=admin_headers,
    )
    assert instrument.status_code == 201, instrument.text

    run = client.post(
        "/api/v1/experiments",
        json={
            "run_code": "CVD-2026-0200",
            "started_at": "2026-07-08T09:30:00",
            "synthesis_method": "APCVD",
            "operator": "李俊杰",
            "chemical_formula": "MoS2/WS2",
        },
        headers=headers,
    )
    assert run.status_code == 201, run.text
    run_id = run.json()["id"]

    ref = client.put(
        f"/api/v1/experiments/{run_id}/setup-reference",
        json={
            "setup_id": setup.json()["id"],
            "version": 1,
            "tube_usage_history": {"reset_count": 1, "use_number_since_reset": 7},
        },
        headers=headers,
    )
    assert ref.status_code == 200, ref.text

    def upsert(module: str, payload: dict) -> None:
        response = client.put(
            f"/api/v1/experiments/{run_id}/modules/{module}",
            json={"payload_json": payload},
            headers=headers,
        )
        assert response.status_code == 200, f"{module}: {response.text}"

    upsert(
        "basic_info",
        basic_info_payload(
            started_at="2026-07-08T09:30:00",
            operator="李俊杰",
            run_code="CVD-2026-0200",
        ),
    )
    upsert(
        "target_product",
        target_product_payload(
            chemical_formula="MoS2/WS2",
            structure_type="vertical_heterostructure",
            components=[
                {"formula": "MoS2", "role": "bottom_layer", "layer_order": 1},
                {"formula": "WS2", "role": "top_layer", "layer_order": 2},
            ],
            target_layer_count=1,
        ),
    )
    upsert(
        "precursors",
        {
            "items": [
                {
                    "name_formula": "MoO3",
                    "cas_inchi": "1313-27-5",
                    "phase_state": "solid",
                    "appearance": "white_powder",
                    "lot_ref": lot_reference(lot.json()),
                    "role": "main_precursor",
                    "amount": 20,
                    "treatment_steps": [{"type": "direct_load", "parameters": {}}],
                    "boat_crucible": {
                        "material": "quartz_boat",
                        "length_mm": 90,
                        "width_mm": 15,
                        "reset_count": 1,
                        "use_number_since_reset": 7,
                    },
                    "source_zone_temperature": {
                        "zone_index": 1,
                        "temperature_C": 620,
                        "temperature_basis": "estimate",
                    },
                    "thermocouple_distance_mm": -20,
                }
            ]
        },
    )
    upsert(
        "substrates",
        {
            "items": [
                substrate_item(
                    substrate_lot.json(),
                    material="sio2_si",
                    chemical_formula="SiO2",
                    crystal_orientation="(100)",
                    oxide_thickness_nm=285.0,
                    pretreatment_steps=[
                        {"type": "acetone_clean", "parameters": {"duration_min": 10.0}},
                        {
                            "type": "isopropanol_clean",
                            "parameters": {"duration_min": 10.0},
                        },
                        {"type": "nitrogen_dry", "parameters": {"duration_min": 2.0}},
                    ],
                )
            ]
        },
    )
    upsert(
        "process_steps",
        {
            "items": [
                {
                    "stage_type": "preparation",
                    "preparation_operations": [
                        {
                            "operation_type": "pump_down",
                            "target_absolute_pressure_Pa": 100.0,
                            "duration_min": 15.0,
                        }
                    ],
                },
                reaction_step(
                    gas_lot.json(),
                    duration_min=15.0,
                    cooling_params={"method": "furnace_cooling"},
                    field_params=[
                        {
                            "field_type": "plasma",
                            "start_min": 2.0,
                            "end_min": 12.0,
                            "parameters": [
                                {"name": "power", "value": 50.0, "unit": "W"},
                                {"name": "gas", "value": "Ar", "unit": "—"},
                                {"name": "pressure", "value": 100.0, "unit": "Pa"},
                            ],
                        }
                    ],
                ),
            ]
        },
    )
    stale_substrates = (
        db_session.query(ExperimentModulePayload)
        .filter(
            ExperimentModulePayload.experiment_run_id == UUID(run_id),
            ExperimentModulePayload.module_key == "substrates",
        )
        .one()
    )
    stale_payload = deepcopy(stale_substrates.payload_json)
    stale_payload["items"][0].pop("orientation_polish_availability")
    stale_payload["items"][0].pop("miscut_availability")
    stale_substrates.payload_json = stale_payload
    db_session.commit()
    stored_stale_payload = deepcopy(stale_substrates.payload_json)

    locked = client.post(f"/api/v1/experiments/{run_id}/lock", headers=headers)
    assert locked.status_code == 200, locked.text
    db_session.expire_all()
    assert (
        db_session.get(ExperimentModulePayload, stale_substrates.id).payload_json
        == stored_stale_payload
    )
    exported_json = client.get(
        f"/api/v1/experiments/{run_id}/export",
        headers=headers,
    )
    assert exported_json.status_code == 200, exported_json.text
    exported_substrates = exported_json.json()["modules"]["substrates"]
    schema_payload = deepcopy(exported_substrates)
    for item in schema_payload["items"]:
        item.pop("source_id", None)
    validate_v2_module_payload("substrates", schema_payload)
    assert exported_substrates["items"][0]["orientation_polish_availability"] == ("reported")
    assert exported_substrates["items"][0]["miscut_availability"] == "reported"
    exported_zip = client.get(
        "/api/v1/exports/runs",
        params={"query": "0200"},
        headers=headers,
    )
    assert exported_zip.status_code == 200, exported_zip.text
    with zipfile.ZipFile(io.BytesIO(exported_zip.content)) as archive:
        substrate_rows = list(
            csv.DictReader(io.StringIO(archive.read("substrates.csv").decode("utf-8-sig")))
        )
    assert {row["orientation_polish_availability"] for row in substrate_rows} == {"reported"}
    assert {row["miscut_availability"] for row in substrate_rows} == {"reported"}
    samples = client.get(f"/api/v1/samples?experiment_id={run_id}", headers=headers)
    assert samples.status_code == 200, samples.text
    assert samples.json()["total"] == 1
    sample_id = samples.json()["items"][0]["id"]

    record = client.post(
        f"/api/v1/experiments/{run_id}/characterization-records",
        json={
            "sample_id": sample_id,
            "instrument_id": instrument.json()["id"],
            "instrument_version": 1,
            "method_instrument": "Raman",
            "test_conditions": "532nm / 1mW / 100×",
        },
        headers=headers,
    )
    assert record.status_code == 201, record.text

    product = client.post(
        f"/api/v1/samples/{sample_id}/measured-products",
        json={
            "characterization_record_id": record.json()["id"],
            "observed_phenomena": ["不连续覆盖", "厚层区域"],
            "detected_phase_stacking": "2H-MoS2；AB堆垛",
            "layer_count": 1,
            "coverage_percent": 70,
        },
        headers=headers,
    )
    assert product.status_code == 201, product.text

    reports = build_r0_reports(db_session, run_code="CVD-2026-0200")
    assert len(reports) == 1, reports
    report = reports[0]
    failed = [item for item in report["items"] if item["applicable"] and not item["passed"]]
    assert report["status"] == "compliant", f"R0 未通过项: {failed}"
    assert (
        client.delete(
            f"/api/v1/measured-products/{product.json()['id']}", headers=headers
        ).status_code
        == 204
    )
    assert (
        client.delete(
            f"/api/v1/characterization-records/{record.json()['id']}", headers=headers
        ).status_code
        == 204
    )
    after_delete = client.get(f"/api/v1/experiments/{run_id}", headers=headers)
    assert after_delete.json()["result_missing_todo"] is True
    supplemented = client.post(
        f"/api/v1/experiments/{run_id}/characterization-records",
        json={
            "sample_id": sample_id,
            "instrument_id": instrument.json()["id"],
            "instrument_version": 1,
            "method_instrument": "Raman",
            "test_conditions": "532nm / 1mW / 100×",
        },
        headers=headers,
    )
    assert supplemented.status_code == 201, supplemented.text
    refreshed = client.get(f"/api/v1/experiments/{run_id}", headers=headers)
    assert refreshed.json()["result_missing_todo"] is True

    replacement = client.post(
        f"/api/v1/samples/{sample_id}/measured-products",
        json={
            "characterization_record_id": supplemented.json()["id"],
            "observed_phenomena": ["不连续覆盖"],
        },
        headers=headers,
    )
    assert replacement.status_code == 201, replacement.text
    refreshed = client.get(f"/api/v1/experiments/{run_id}", headers=headers)
    assert refreshed.json()["result_missing_todo"] is False
    reports = build_r0_reports(db_session, run_code="CVD-2026-0200")
    assert reports[0]["status"] == "compliant"
