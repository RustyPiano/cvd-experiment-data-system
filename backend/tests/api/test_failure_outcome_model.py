"""M2 — 失败 / 结果模型.

把扁平 quality_label 升级为可分析的失败模型：failure_mode 受控词表 +
result_summary 的 failure_modes / failure_detail 字段，并确保失败炉次是一等记录、
导出(analysis_v1)能带出失败信息。

设计见 docs/standard/schema-v0.1-tdd-plan.md (M2)。
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from tests.helpers.setup_methods import create_confirmed_setup_methods

client = TestClient(app)


def login(email: str, password: str = "Password123!") -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(email)}"}


def _create_experiment(email: str) -> str:
    response = client.post(
        "/api/v1/experiments",
        json={
            "experiment_type": "cvd_2zone",
            "material_system": "MoS2",
            "experiment_date": "2026-04-23",
            "objective": "Failure model flow",
        },
        headers=auth_headers(email),
    )
    assert response.status_code == 201
    return response.json()["id"]


def _populate_required_modules(experiment_id: str, email: str) -> None:
    headers = auth_headers(email)
    assert (
        client.put(
            f"/api/v1/experiments/{experiment_id}/modules/precursors",
            json={"payload_json": {"items": [{"species": "MoO3", "method": "powder"}]}},
            headers=headers,
        ).status_code
        == 200
    )
    assert (
        client.put(
            f"/api/v1/experiments/{experiment_id}/modules/furnace_program",
            json={
                "payload_json": {
                    "furnace_info": {
                        "zones_count": 1,
                        "initial_temperatures_C": {"zone_1": 25},
                    },
                    "placements": [],
                    "zones": [
                        {
                            "zone_key": "zone_1",
                            "temperature_program": [
                                {"node_index": 1, "time_min": 0, "temperature_C": 25},
                                {"node_index": 2, "time_min": 30, "temperature_C": 750},
                            ],
                            "note": "",
                        }
                    ],
                }
            },
            headers=headers,
        ).status_code
        == 200
    )
    assert (
        client.put(
            f"/api/v1/experiments/{experiment_id}/modules/gas_program",
            json={
                "payload_json": {
                    "segments": [
                        {
                            "stage": "growth",
                            "start_min": 0,
                            "end_min": 45,
                            "gas": "Ar",
                            "components": [{"name": "Ar", "fraction": 1, "flow_sccm": 80}],
                            "flow_sccm": 80,
                        }
                    ]
                }
            },
            headers=headers,
        ).status_code
        == 200
    )


def _set_failed_result_summary(experiment_id: str, email: str) -> None:
    response = client.put(
        f"/api/v1/experiments/{experiment_id}/modules/result_summary",
        json={
            "payload_json": {
                "quality_label": "failed",
                "summary_result": "未观察到连续膜",
                "failure_modes": ["no_growth", "contamination"],
                "failure_detail": "基底疑似沾污，未成核",
            }
        },
        headers=auth_headers(email),
    )
    assert response.status_code == 200


def test_t2_1_failure_mode_vocabulary_is_seeded(active_user) -> None:
    """T2.1 failure_mode 受控词表已 seed 且可列出。"""
    response = client.get(
        "/api/v1/vocabularies?vocab_key=failure_mode",
        headers=auth_headers(active_user.email),
    )
    assert response.status_code == 200
    values = {item["value"] for item in response.json()["items"]}
    # v0.1 草案里的代表性取值
    assert {"no_growth", "multilayer", "wrong_phase", "contamination", "other"} <= values


def test_t2_2_result_summary_accepts_failure_fields(active_user) -> None:
    """T2.2 result_summary payload 接受并持久化 failure_modes / failure_detail。"""
    experiment_id = _create_experiment(active_user.email)
    _set_failed_result_summary(experiment_id, active_user.email)

    response = client.get(
        f"/api/v1/experiments/{experiment_id}/modules/result_summary",
        headers=auth_headers(active_user.email),
    )
    assert response.status_code == 200
    payload = response.json()["payload_json"]
    assert payload["failure_modes"] == ["no_growth", "contamination"]
    assert payload["failure_detail"] == "基底疑似沾污，未成核"


def test_t2_3_failed_experiment_can_be_submitted_and_persisted(active_user) -> None:
    """T2.3 失败炉次是一等记录：quality_label=failed 的实验能提交并留存(true negative)。"""
    email = active_user.email
    experiment_id = _create_experiment(email)
    _populate_required_modules(experiment_id, email)
    _set_failed_result_summary(experiment_id, email)
    create_confirmed_setup_methods(client, experiment_id=experiment_id, headers=auth_headers(email))

    submit = client.post(f"/api/v1/experiments/{experiment_id}/submit", headers=auth_headers(email))
    assert submit.status_code == 200

    detail = client.get(f"/api/v1/experiments/{experiment_id}", headers=auth_headers(email))
    assert detail.status_code == 200
    assert detail.json()["quality_label"] == "failed"


def test_t2_4_analysis_export_includes_failure_fields(active_user) -> None:
    """T2.4 analysis 导出在实验行带出 failure_modes / failure_detail。"""
    email = active_user.email
    experiment_id = _create_experiment(email)
    _populate_required_modules(experiment_id, email)
    _set_failed_result_summary(experiment_id, email)

    response = client.get(
        f"/api/v1/experiments/{experiment_id}/export/analysis",
        headers=auth_headers(email),
    )
    assert response.status_code == 200
    experiment_row = response.json()["experiment"]
    assert experiment_row["failure_modes"] == ["no_growth", "contamination"]
    assert experiment_row["failure_detail"] == "基底疑似沾污，未成核"
