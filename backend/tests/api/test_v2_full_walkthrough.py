"""P4 验收门回归测试：一条完整 cvd_v2 炉次的全流程走查。

覆盖：实体登记（物料/装置/仪器）→ 创建炉次 → 装置引用快照 → 全模块 payload
（含条件必填：异质结 components、固态源用量、SiO₂/Si 氧化层、反应生长外场+压力、
降温参数）→ 样品 → 表征记录（仪器引用）→ 实测产物 → check-r0 合规报告 compliant。
"""

from fastapi.testclient import TestClient

from app.commands.check_r0 import build_r0_reports
from app.main import app

client = TestClient(app)


def _auth_headers(email: str, password: str = "Password123!") -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_full_v2_run_walkthrough(active_user, db_session) -> None:
    headers = _auth_headers(active_user.email)

    lot = client.post(
        "/api/v1/v2/material-lots",
        json={
            "lot_category": "化学品",
            "substance_name": "三氧化钼",
            "chemical_formula": "MoO3",
            "batch_number": "B202405",
            "supplier": "阿拉丁",
            "purity": "99.95",
        },
        headers=headers,
    )
    assert lot.status_code == 201, lot.text

    setup = client.post(
        "/api/v1/v2/setups",
        json={
            "setup_code": "CVD-炉1",
            "setup_name": "1号双温区管式炉",
            "zone_count": 2,
            "orientation": "水平",
            "coordinate_system": "原点=温区2热电偶；上游负/下游正",
            "field_devices": "等离子",
            "wall_type": "热壁",
        },
        headers=headers,
    )
    assert setup.status_code == 201, setup.text

    instrument = client.post(
        "/api/v1/v2/instruments",
        json={"instrument_code": "RAMAN-1", "name_type": "Raman", "vendor": "Horiba"},
        headers=headers,
    )
    assert instrument.status_code == 201, instrument.text

    run = client.post(
        "/api/v1/v2/experiments",
        json={
            "run_code": "RUN-V2-WALK",
            "started_at": "2026-07-08T09:30:00",
            "synthesis_method": "APCVD",
            "operator": "李俊杰",
            "chemical_formula": "WS2/MoS2",
        },
        headers=headers,
    )
    assert run.status_code == 201, run.text
    run_id = run.json()["id"]

    ref = client.put(
        f"/api/v1/v2/experiments/{run_id}/setup-reference",
        json={"setup_id": setup.json()["id"], "version": 1},
        headers=headers,
    )
    assert ref.status_code == 200, ref.text

    def upsert(module: str, payload: dict) -> None:
        response = client.put(
            f"/api/v1/v2/experiments/{run_id}/modules/{module}",
            json={"payload_json": payload},
            headers=headers,
        )
        assert response.status_code == 200, f"{module}: {response.text}"

    upsert(
        "basic_info",
        {
            "started_at": "2026-07-08T09:30:00",
            "synthesis_method": "APCVD",
            "operator": "李俊杰",
            "run_code": "RUN-V2-WALK",
            "ambient_temperature_C": 25,
            "ambient_humidity_percent": 45,
        },
    )
    upsert(
        "target_product",
        {
            "chemical_formula": "WS2/MoS2",
            "structure_type": "垂直异质结",
            "components": [
                {"formula": "WS2", "role": "上层", "layer_order": 2},
                {"formula": "MoS2", "role": "下层", "layer_order": 1},
            ],
            "target_layer_count": 1,
            "target_morphology": "连续膜",
        },
    )
    upsert(
        "precursors",
        {
            "items": [
                {
                    "name_formula": "三氧化钼 / MoO3",
                    "cas_inchi": "1313-27-5",
                    "phase_state": "固",
                    "appearance": "白色粉末",
                    "role": "主源",
                    "amount": 20,
                    "treatment_steps": "直接加载",
                    "boat_crucible": "石英舟 90×15",
                    "source_zone_temperature": "温区1，设定~620",
                    "thermocouple_distance_mm": -20,
                }
            ]
        },
    )
    upsert(
        "substrates",
        {
            "items": [
                {
                    "material": "SiO₂/Si",
                    "formula_orientation": "Si(100)",
                    "oxide_thickness_nm": 285,
                    "pretreatment_steps": "丙酮→异丙醇→N₂吹干",
                }
            ]
        },
    )
    upsert(
        "process_steps",
        {
            "items": [
                {
                    "stage_type": "升温",
                    "temperature_program": "温区2：25→750@20℃/min",
                    "gas_species": "Ar",
                    "gas_flow_sccm": 80,
                    "pressure_system": "常压",
                },
                {
                    "stage_type": "反应生长",
                    "temperature_program": "750 保温15min",
                    "gas_species": "Ar",
                    "gas_flow_sccm": 80,
                    "pressure_system": "常压；1.0×10⁵ Pa",
                    "field_params": "等离子 50W",
                    "duration_cycles": "15 min",
                },
                {
                    "stage_type": "降温",
                    "temperature_program": "自然降温",
                    "cooling_params": "随炉冷却；开盖~580",
                    "gas_species": "Ar",
                    "gas_flow_sccm": 50,
                    "pressure_system": "常压",
                },
            ]
        },
    )
    upsert(
        "process_events",
        {
            "items": [
                {
                    "event_part": "气流中断（Ar气路）",
                    "occurred_at": "10:28",
                    "description_action": "Ar瓶压不足，已更换",
                }
            ]
        },
    )

    sample = client.post(
        f"/api/v1/experiments/{run_id}/samples",
        json={"role": "product"},
        headers=headers,
    )
    assert sample.status_code == 201, sample.text
    sample_id = sample.json()["id"]

    record = client.post(
        f"/api/v1/v2/experiments/{run_id}/characterization-records",
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
        f"/api/v1/v2/samples/{sample_id}/measured-products",
        json={
            "characterization_record_id": record.json()["id"],
            "observed_phenomena": ["不连续覆盖", "厚层区域"],
            "detected_phase_stacking": "2H-MoS2；AB堆垛",
            "measured_layers_coverage": "1层；~70%",
        },
        headers=headers,
    )
    assert product.status_code == 201, product.text

    reports = build_r0_reports(db_session, run_code="RUN-V2-WALK")
    assert len(reports) == 1, reports
    report = reports[0]
    failed = [item for item in report["items"] if item["applicable"] and not item["passed"]]
    assert report["status"] == "compliant", f"R0 未通过项: {failed}"
    submitted = client.post(f"/api/v1/v2/experiments/{run_id}/submit", headers=headers)
    assert submitted.status_code == 200, submitted.text
    locked = client.post(f"/api/v1/v2/experiments/{run_id}/lock", headers=headers)
    assert locked.status_code == 200, locked.text
    reports = build_r0_reports(db_session, run_code="RUN-V2-WALK")
    assert reports[0]["status"] == "compliant"
