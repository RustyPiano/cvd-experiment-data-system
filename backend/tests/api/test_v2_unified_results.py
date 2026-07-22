from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.repositories.v2_repository import V2ResultRepository

client = TestClient(app)


def _headers(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _sample(headers: dict[str, str], suffix: str) -> tuple[str, str]:
    run = client.post(
        "/api/v1/experiments",
        json={
            "run_code": f"CVD-2026-{suffix}",
            "started_at": "2026-07-17T09:00:00",
            "synthesis_method": "APCVD",
            "operator": "tester",
        },
        headers=headers,
    )
    assert run.status_code == 201, run.text
    sample = client.post(
        f"/api/v1/experiments/{run.json()['id']}/samples",
        json={"role": "control"},
        headers=headers,
    )
    assert sample.status_code == 201, sample.text
    return run.json()["id"], sample.json()["id"]


def test_direct_observation_uses_one_result_contract(active_user) -> None:
    headers = _headers(active_user.email)
    _, sample_id = _sample(headers, "0201")

    created = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "direct_observation",
            "observed_phenomena": ["不连续覆盖"],
        },
        headers=headers,
    )

    assert created.status_code == 201, created.text
    result = created.json()
    assert result["kind"] == "direct_observation"
    assert result["characterization_record_id"] is None
    assert result["observed_phenomena"] == ["discontinuous_coverage"]

    listed = client.get(f"/api/v1/samples/{sample_id}/results", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["items"] == [result]

    updated = client.put(
        f"/api/v1/results/{result['id']}",
        json={
            "kind": "direct_observation",
            "observed_phenomena": ["无生长"],
        },
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["observed_phenomena"] == ["no_growth"]

    switched = client.put(
        f"/api/v1/results/{result['id']}",
        json={"kind": "characterization", "method_instrument": "Raman"},
        headers=headers,
    )
    assert switched.status_code == 409

    assert client.delete(f"/api/v1/results/{result['id']}", headers=headers).status_code == 204
    assert client.get(f"/api/v1/samples/{sample_id}/results", headers=headers).json()["total"] == 0


def test_characterization_result_writes_both_rows_atomically(
    active_user,
    db_session,
) -> None:
    headers = _headers(active_user.email)
    run_id, sample_id = _sample(headers, "0202")

    created = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "characterization",
            "method_instrument": "Raman",
            "test_conditions": "532 nm",
            "observed_phenomena": ["厚层区域"],
            "key_spectral_metrics": {"note": "E2g 384 cm-1"},
        },
        headers=headers,
    )

    assert created.status_code == 201, created.text
    result = created.json()
    assert result["kind"] == "characterization"
    assert result["method_instrument"] == "Raman"
    record = db_session.get(CharacterizationRecord, UUID(result["characterization_record_id"]))
    product = db_session.get(MeasuredProduct, UUID(result["id"]))
    assert record is not None and record.experiment_run_id == UUID(run_id)
    assert product is not None and product.characterization_record_id == record.id

    updated = client.put(
        f"/api/v1/results/{result['id']}",
        json={
            "kind": "characterization",
            "method_instrument": "SEM",
            "test_conditions": "5 kV",
            "measured_layers_coverage": "80%",
        },
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["method_instrument"] == "SEM"
    assert updated.json()["measured_layers_coverage"] == "80%"

    linked = client.post(
        f"/api/v1/samples/{sample_id}/measured-products",
        json={
            "characterization_record_id": result["characterization_record_id"],
            "observed_phenomena": ["不连续覆盖"],
        },
        headers=headers,
    )
    assert linked.status_code == 201, linked.text
    assert client.delete(f"/api/v1/results/{result['id']}", headers=headers).status_code == 409
    linked_delete = client.delete(
        f"/api/v1/measured-products/{linked.json()['id']}", headers=headers
    )
    assert linked_delete.status_code == 204
    assert client.delete(f"/api/v1/results/{result['id']}", headers=headers).status_code == 204
    db_session.expire_all()
    assert db_session.get(MeasuredProduct, UUID(result["id"])) is None
    assert (
        db_session.get(CharacterizationRecord, UUID(result["characterization_record_id"])) is None
    )


def test_unified_result_validation_is_kind_specific(active_user) -> None:
    headers = _headers(active_user.email)
    _, sample_id = _sample(headers, "0203")

    direct = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={"kind": "direct_observation"},
        headers=headers,
    )
    characterization = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={"kind": "characterization"},
        headers=headers,
    )
    direct_with_characterization_data = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "direct_observation",
            "observed_phenomena": ["无生长"],
            "key_spectral_metrics": {"note": "must be rejected"},
        },
        headers=headers,
    )
    subjective_observation = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "direct_observation",
            "observed_phenomena": ["实验成功"],
        },
        headers=headers,
    )
    legacy_subjective_observation = client.post(
        f"/api/v1/samples/{sample_id}/measured-products",
        json={"observed_phenomena": ["实验成功"]},
        headers=headers,
    )

    assert direct.status_code == 422
    assert characterization.status_code == 422
    assert direct_with_characterization_data.status_code == 422
    assert subjective_observation.status_code == 422
    assert legacy_subjective_observation.status_code == 422


def test_characterization_creation_rolls_back_when_result_write_fails(
    active_user,
    db_session,
    monkeypatch,
) -> None:
    headers = _headers(active_user.email)
    _, sample_id = _sample(headers, "0204")

    def fail_save(_repository, _product):
        raise RuntimeError("forced result failure")

    monkeypatch.setattr(V2ResultRepository, "save_measured_product", fail_save)
    with pytest.raises(RuntimeError, match="forced result failure"):
        client.post(
            f"/api/v1/samples/{sample_id}/results",
            json={"kind": "characterization", "method_instrument": "Raman"},
            headers=headers,
        )

    db_session.expire_all()
    assert db_session.query(CharacterizationRecord).count() == 0
    assert db_session.query(MeasuredProduct).count() == 0
