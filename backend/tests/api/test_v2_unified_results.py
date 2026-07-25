from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.experiment import ExperimentRun, ExperimentStatus
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


@pytest.mark.parametrize(
    "payload",
    [
        {"kind": "characterization", "method_instrument": "other"},
        {
            "kind": "characterization",
            "method_instrument": "Raman",
            "method_other": "AFM phase imaging",
        },
        {"kind": "direct_observation", "observed_phenomena": ["other"]},
        {
            "kind": "direct_observation",
            "observed_phenomena": ["no_growth"],
            "observed_phenomena_other": "unexpected residue",
        },
    ],
)
def test_other_result_options_require_details_only_when_selected(
    active_user,
    payload: dict,
) -> None:
    headers = _headers(active_user.email)
    _, sample_id = _sample(headers, "0210")

    response = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json=payload,
        headers=headers,
    )

    assert response.status_code == 422


def test_other_result_details_round_trip_without_an_instrument(
    active_user,
    db_session,
) -> None:
    headers = _headers(active_user.email)
    _, sample_id = _sample(headers, "0211")

    response = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "characterization",
            "method_instrument": "other",
            "method_other": "AFM phase imaging",
            "observed_phenomena": ["other"],
            "observed_phenomena_other": "triangular domains",
        },
        headers=headers,
    )

    assert response.status_code == 201, response.text
    result = response.json()
    assert result["instrument_id"] is None
    assert result["method_other"] == "AFM phase imaging"
    assert result["observed_phenomena_other"] == "triangular domains"
    record = db_session.get(CharacterizationRecord, UUID(result["characterization_record_id"]))
    product = db_session.get(MeasuredProduct, UUID(result["id"]))
    assert record.attrs["method_other"] == "AFM phase imaging"
    assert product.attrs["observed_phenomena_other"] == "triangular domains"

    direct = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "direct_observation",
            "observed_phenomena": ["other"],
            "observed_phenomena_other": "visible triangular domains",
        },
        headers=headers,
    )
    assert direct.status_code == 201, direct.text
    assert direct.json()["observed_phenomena_other"] == "visible triangular domains"


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
            "key_spectral_metrics": [
                {"metric_code": "raman_e2g_peak", "value": 384, "unit": "cm-1"}
            ],
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
            "layer_count": 1,
            "coverage_percent": 80,
        },
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["method_instrument"] == "SEM"
    assert updated.json()["layer_count"] == 1
    assert updated.json()["coverage_percent"] == 80

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


def test_characterization_patch_rejects_null_attrs(active_user) -> None:
    headers = _headers(active_user.email)
    run_id, sample_id = _sample(headers, "0214")
    created = client.post(
        f"/api/v1/experiments/{run_id}/characterization-records",
        json={"sample_id": sample_id, "method_instrument": "Raman"},
        headers=headers,
    )
    assert created.status_code == 201, created.text

    response = client.patch(
        f"/api/v1/characterization-records/{created.json()['id']}",
        json={"attrs": None},
        headers=headers,
    )

    assert response.status_code == 422, response.text


def test_measured_product_patch_rejects_null_attrs(active_user) -> None:
    headers = _headers(active_user.email)
    _, sample_id = _sample(headers, "0215")
    created = client.post(
        f"/api/v1/samples/{sample_id}/measured-products",
        json={"observed_phenomena": ["no_growth"]},
        headers=headers,
    )
    assert created.status_code == 201, created.text

    response = client.patch(
        f"/api/v1/measured-products/{created.json()['id']}",
        json={"attrs": None},
        headers=headers,
    )

    assert response.status_code == 422, response.text


@pytest.mark.parametrize(("replacement", "suffix"), [("null", "0216"), ("record", "0217")])
def test_legacy_measured_product_patch_cannot_change_result_kind_or_record(
    active_user,
    replacement: str,
    suffix: str,
) -> None:
    headers = _headers(active_user.email)
    run_id, sample_id = _sample(headers, suffix)
    created = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "characterization",
            "method_instrument": "Raman",
            "observed_phenomena": ["no_growth"],
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    original_record_id = created.json()["characterization_record_id"]
    replacement_record_id = None
    if replacement == "record":
        replacement_record = client.post(
            f"/api/v1/experiments/{run_id}/characterization-records",
            json={"sample_id": sample_id, "method_instrument": "SEM"},
            headers=headers,
        )
        assert replacement_record.status_code == 201, replacement_record.text
        replacement_record_id = replacement_record.json()["id"]

    response = client.patch(
        f"/api/v1/measured-products/{created.json()['id']}",
        json={"characterization_record_id": replacement_record_id},
        headers=headers,
    )

    assert response.status_code == 422, response.text
    retained = client.get(f"/api/v1/samples/{sample_id}/results", headers=headers).json()["items"][
        0
    ]
    assert retained["kind"] == "characterization"
    assert retained["characterization_record_id"] == original_record_id


def test_characterization_metrics_use_structured_numeric_contract(active_user) -> None:
    headers = _headers(active_user.email)
    _, sample_id = _sample(headers, "0205")

    created = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "characterization",
            "method_instrument": "Raman",
            "layer_count": 2,
            "coverage_percent": 87.5,
            "domain_size_um": 42.0,
            "nucleation_density_cm2": 1.2e5,
            "key_spectral_metrics": [
                {"metric_code": "raman_e2g_peak", "value": 384.2, "unit": "cm-1"}
            ],
        },
        headers=headers,
    )

    assert created.status_code == 201, created.text
    assert (
        created.json()
        | {
            "layer_count": 2,
            "coverage_percent": 87.5,
            "domain_size_um": 42.0,
            "nucleation_density_cm2": 1.2e5,
            "key_spectral_metrics": [
                {"metric_code": "raman_e2g_peak", "value": 384.2, "unit": "cm-1"}
            ],
        }
        == created.json()
    )


@pytest.mark.parametrize(
    ("method", "metric", "unit", "suffix", "expected"),
    [
        (
            "Raman",
            "raman_e2g_peak_position",
            "cm⁻¹",
            "0221",
            201,
        ),
        (
            "SEM",
            "raman_e2g_peak_position",
            "cm⁻¹",
            "0222",
            422,
        ),
        (
            "Raman",
            "raman_e2g_peak_position",
            "nm",
            "0223",
            422,
        ),
        (
            "SEM",
            "legacy_named_parameter",
            "arbitrary",
            "0224",
            201,
        ),
    ],
)
def test_controlled_result_metrics_enforce_method_and_fixed_unit_without_breaking_legacy(
    active_user,
    method: str,
    metric: str,
    unit: str,
    suffix: str,
    expected: int,
) -> None:
    headers = _headers(active_user.email)
    _, sample_id = _sample(headers, suffix)

    response = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "characterization",
            "method_instrument": method,
            "key_spectral_metrics": [{"metric_code": metric, "value": 384.2, "unit": unit}],
        },
        headers=headers,
    )

    assert response.status_code == expected, response.text


@pytest.mark.parametrize(
    "field,value",
    [
        ("layer_count", -1),
        ("coverage_percent", -0.1),
        ("coverage_percent", 100.1),
        ("domain_size_um", -1),
        ("domain_size_um", 0),
        ("nucleation_density_cm2", -1),
    ],
)
def test_characterization_metrics_reject_nonphysical_ranges(
    active_user,
    field: str,
    value: float,
) -> None:
    headers = _headers(active_user.email)
    _, sample_id = _sample(headers, f"02{10 + len(field):02d}")

    response = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "characterization",
            "method_instrument": "Raman",
            field: value,
        },
        headers=headers,
    )

    assert response.status_code == 422


def test_empty_legacy_measured_product_does_not_clear_missing_todo(
    active_user,
    db_session,
) -> None:
    headers = _headers(active_user.email)
    run_id, sample_id = _sample(headers, "0206")
    run = db_session.get(ExperimentRun, UUID(run_id))
    run.status = ExperimentStatus.LOCKED
    run.result_missing_todo = True
    db_session.commit()

    response = client.post(
        f"/api/v1/samples/{sample_id}/measured-products",
        json={},
        headers=headers,
    )

    assert response.status_code == 422
    db_session.expire_all()
    assert db_session.get(ExperimentRun, UUID(run_id)).result_missing_todo is True
    assert db_session.query(MeasuredProduct).count() == 0


def test_blank_legacy_measured_text_is_not_evidence(active_user) -> None:
    headers = _headers(active_user.email)
    _, sample_id = _sample(headers, "0208")

    response = client.post(
        f"/api/v1/samples/{sample_id}/measured-products",
        json={"detected_phase_stacking": "   "},
        headers=headers,
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("cleared_metrics", "suffix"),
    [
        (None, "0210"),
        ([], "0211"),
    ],
)
def test_legacy_patch_rejects_clearing_the_final_json_evidence(
    active_user,
    db_session,
    cleared_metrics,
    suffix: str,
) -> None:
    headers = _headers(active_user.email)
    run_id, sample_id = _sample(headers, suffix)
    run = db_session.get(ExperimentRun, UUID(run_id))
    run.status = ExperimentStatus.LOCKED
    run.result_missing_todo = True
    db_session.commit()
    created = client.post(
        f"/api/v1/samples/{sample_id}/measured-products",
        json={
            "key_spectral_metrics": [
                {"metric_code": "raman_e2g_peak", "value": 384.2, "unit": "cm-1"}
            ]
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    db_session.expire_all()
    assert db_session.get(ExperimentRun, UUID(run_id)).result_missing_todo is False

    cleared = client.patch(
        f"/api/v1/measured-products/{created.json()['id']}",
        json={"key_spectral_metrics": cleared_metrics, "attrs": {"note": None}},
        headers=headers,
    )

    assert cleared.status_code == 422, cleared.text
    retained = client.get(
        f"/api/v1/samples/{sample_id}/measured-products",
        headers=headers,
    ).json()["items"][0]
    assert retained["key_spectral_metrics"] == [
        {"metric_code": "raman_e2g_peak", "value": 384.2, "unit": "cm-1"}
    ]
    db_session.expire_all()
    assert db_session.get(ExperimentRun, UUID(run_id)).result_missing_todo is False


@pytest.mark.parametrize(
    ("metric_value", "suffix"),
    [
        ("384.2", "0212"),
        (True, "0213"),
    ],
)
def test_spectral_metric_value_rejects_coerced_types(
    active_user,
    metric_value,
    suffix: str,
) -> None:
    headers = _headers(active_user.email)
    _, sample_id = _sample(headers, suffix)

    response = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "characterization",
            "method_instrument": "Raman",
            "key_spectral_metrics": [
                {
                    "metric_code": "raman_e2g_peak",
                    "value": metric_value,
                    "unit": "cm-1",
                }
            ],
        },
        headers=headers,
    )

    assert response.status_code == 422


def test_instrument_type_must_match_characterization_method(active_user, admin_user) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    _, sample_id = _sample(headers, "0207")
    instrument = client.post(
        "/api/v1/instruments",
        json={"instrument_code": "SEM-ONLY", "name_type": "SEM"},
        headers=admin_headers,
    )
    assert instrument.status_code == 201, instrument.text

    mismatch = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "characterization",
            "instrument_id": instrument.json()["id"],
            "instrument_version": 1,
            "method_instrument": "Raman",
        },
        headers=headers,
    )

    assert mismatch.status_code == 422
    assert "instrument" in mismatch.text.lower()


def test_other_method_is_compatible_with_any_instrument_type(active_user, admin_user) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    run_id, sample_id = _sample(headers, "0209")
    instrument = client.post(
        "/api/v1/instruments",
        json={"instrument_code": "SEM-OTHER", "name_type": "SEM"},
        headers=admin_headers,
    )
    assert instrument.status_code == 201, instrument.text
    reference = {
        "instrument_id": instrument.json()["id"],
        "instrument_version": 1,
        "method_instrument": "other",
    }

    unified = client.post(
        f"/api/v1/samples/{sample_id}/results",
        json={
            "kind": "characterization",
            **reference,
            "method_other": "SEM-based custom method",
        },
        headers=headers,
    )
    legacy = client.post(
        f"/api/v1/experiments/{run_id}/characterization-records",
        json={"sample_id": sample_id, **reference},
        headers=headers,
    )

    assert unified.status_code == 201, unified.text
    assert legacy.status_code == 201, legacy.text
