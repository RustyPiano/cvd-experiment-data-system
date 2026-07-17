from uuid import UUID
from zlib import crc32

from fastapi.testclient import TestClient

from app.main import app
from app.models.audit import AuditEvent
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.user import User, UserRole

client = TestClient(app)


def _headers(email: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _run(headers: dict[str, str], code: str, method: str = "PVD-热蒸发") -> dict:
    response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": f"CVD-2026-{crc32(code.encode()) % 10000:04d}",
            "started_at": "2026-07-11T09:00:00",
            "synthesis_method": method,
            "operator": "tester",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_state_transitions_audit_and_result_todo(active_user, admin_user, db_session) -> None:
    owner = _headers(active_user.email)
    admin = _headers(admin_user.email)
    run = _run(owner, "STATE-HAPPY")
    run_id = run["id"]

    assert (
        client.post(f"/api/v1/experiments/{run_id}/return-to-draft", headers=owner).status_code
        == 409
    )

    submitted = client.post(f"/api/v1/experiments/{run_id}/submit", headers=owner)
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "submitted"
    assert submitted.json()["submitted_at"] is not None
    assert client.post(f"/api/v1/experiments/{run_id}/submit", headers=owner).status_code == 409
    assert client.post(f"/api/v1/experiments/{run_id}/unlock", headers=admin).status_code == 409

    locked = client.post(f"/api/v1/experiments/{run_id}/lock", headers=owner)
    assert locked.status_code == 200, locked.text
    assert locked.json()["status"] == "locked"
    assert locked.json()["result_missing_todo"] is True
    assert client.post(f"/api/v1/experiments/{run_id}/lock", headers=owner).status_code == 409
    assert (
        client.post(
            f"/api/v1/experiments/{run_id}/invalidate",
            json={"reason": "locked"},
            headers=owner,
        ).status_code
        == 409
    )

    assert client.post(f"/api/v1/experiments/{run_id}/unlock", headers=owner).status_code == 403
    unlocked = client.post(f"/api/v1/experiments/{run_id}/unlock", headers=admin)
    assert unlocked.status_code == 200, unlocked.text
    assert unlocked.json()["status"] == "submitted"
    assert unlocked.json()["locked_at"] is None
    assert unlocked.json()["result_missing_todo"] is False

    draft = client.post(f"/api/v1/experiments/{run_id}/return-to-draft", headers=owner)
    assert draft.status_code == 200, draft.text
    assert draft.json()["status"] == "draft"
    assert draft.json()["submitted_at"] is None

    invalid = client.post(
        f"/api/v1/experiments/{run_id}/invalidate",
        json={"reason": "bad run"},
        headers=owner,
    )
    assert invalid.status_code == 200, invalid.text
    assert invalid.json()["status"] == "invalid"
    assert (
        client.post(
            f"/api/v1/experiments/{run_id}/invalidate",
            json={"reason": "again"},
            headers=owner,
        ).status_code
        == 409
    )

    events = db_session.query(AuditEvent).filter(AuditEvent.entity_id == UUID(run_id)).all()
    assert [event.action for event in events] == [
        "create",
        "submit",
        "lock",
        "unlock",
        "return_to_draft",
        "invalidate",
    ]
    assert [event.actor_id for event in events] == [
        active_user.id,
        active_user.id,
        active_user.id,
        admin_user.id,
        active_user.id,
        active_user.id,
    ]
    assert all(event.entity_id == UUID(run_id) for event in events)
    assert all(
        event.before_json.get("status") != event.after_json.get("status") for event in events[1:]
    )


def test_r0_gate_returns_structured_missing_fields(active_user) -> None:
    headers = _headers(active_user.email)
    run = _run(headers, "STATE-R0", "APCVD")

    response = client.post(f"/api/v1/experiments/{run['id']}/submit", headers=headers)

    assert response.status_code == 422
    missing = response.json()["detail"]["missing"]
    assert missing
    assert {"key", "label", "module"} <= missing[0].keys()


def test_submit_rejects_missing_non_r0_required_fields(active_user) -> None:
    headers = _headers(active_user.email)

    for code, target_product, precursor, expected_key in (
        (
            "STATE-REQUIRED-STRUCTURE",
            {
                "chemical_formula": "WS2/MoS2",
                "structure_type": None,
                "components": [{"formula": "WS2", "role": "上层"}],
            },
            {"name_formula": "MoO3", "phase_state": "固", "amount": 20},
            "structure_type",
        ),
        (
            "STATE-REQUIRED-PHASE",
            {"chemical_formula": "MoS2", "structure_type": "本征"},
            {"name_formula": "MoO3", "phase_state": None, "amount": 20},
            "phase_state",
        ),
    ):
        setup = client.post(
            "/api/v1/setups",
            json={
                "setup_code": f"SETUP-{code}",
                "setup_name": code,
                "zone_count": 1,
                "orientation": "水平",
                "coordinate_system": "上游负/下游正",
                "field_devices": "无",
            },
            headers=headers,
        )
        assert setup.status_code == 201, setup.text
        run = _run(headers, code, "APCVD")
        run_id = run["id"]
        assert (
            client.put(
                f"/api/v1/experiments/{run_id}/setup-reference",
                json={"setup_id": setup.json()["id"], "version": 1},
                headers=headers,
            ).status_code
            == 200
        )
        payloads = {
            "target_product": target_product,
            "precursors": {"items": [precursor]},
            "substrates": {"items": [{"material": "蓝宝石"}]},
            "process_steps": {
                "items": [
                    {
                        "stage_type": "反应生长",
                        "temperature_program": "750 C",
                        "gas_species": "Ar",
                        "gas_flow_sccm": 80,
                        "pressure_system": "常压",
                    }
                ]
            },
        }
        for module, payload in payloads.items():
            response = client.put(
                f"/api/v1/experiments/{run_id}/modules/{module}",
                json={"payload_json": payload},
                headers=headers,
            )
            assert response.status_code == 200, response.text

        response = client.post(f"/api/v1/experiments/{run_id}/submit", headers=headers)

        assert response.status_code == 422, response.text
        missing = response.json()["detail"]["missing"]
        assert next(item for item in missing if item["key"] == expected_key)["requirement"] == (
            "required"
        )


def test_write_permissions_hide_invisible_runs_and_forbid_visible_runs(
    active_user, db_session
) -> None:
    owner = _headers(active_user.email)
    other = User(
        email="other@example.com",
        name="Other",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    run = _run(owner, "STATE-OWNER")
    headers = _headers(other.email)

    for action in ("submit", "lock", "unlock", "return-to-draft"):
        assert (
            client.post(f"/api/v1/experiments/{run['id']}/{action}", headers=headers).status_code
            == 404
        )
    assert (
        client.post(
            f"/api/v1/experiments/{run['id']}/invalidate",
            json={"reason": "no"},
            headers=headers,
        ).status_code
        == 404
    )

    experiment = db_session.get(ExperimentRun, UUID(run["id"]))
    experiment.status = ExperimentStatus.SUBMITTED
    db_session.commit()

    assert (
        client.post(f"/api/v1/experiments/{run['id']}/return-to-draft", headers=headers).status_code
        == 403
    )
    assert (
        client.post(f"/api/v1/experiments/{run['id']}/unlock", headers=headers).status_code == 403
    )


def test_locked_run_allows_result_writes_and_refreshes_todo(active_user) -> None:
    headers = _headers(active_user.email)
    run = _run(headers, "CVD-2026-9001")
    run_id = run["id"]
    sample = client.post(
        f"/api/v1/experiments/{run_id}/samples", json={"role": "product"}, headers=headers
    ).json()
    assert client.post(f"/api/v1/experiments/{run_id}/submit", headers=headers).status_code == 200
    locked = client.post(f"/api/v1/experiments/{run_id}/lock", headers=headers)
    assert locked.status_code == 200
    assert locked.json()["result_missing_todo"] is True

    record = client.post(
        f"/api/v1/experiments/{run_id}/characterization-records",
        json={"sample_id": sample["id"], "method_instrument": "Raman"},
        headers=headers,
    )
    assert record.status_code == 201, record.text
    assert (
        client.get(f"/api/v1/experiments/{run_id}", headers=headers).json()["result_missing_todo"]
        is False
    )
    record_id = record.json()["id"]
    assert (
        client.patch(
            f"/api/v1/characterization-records/{record_id}",
            json={"method_instrument": "SEM"},
            headers=headers,
        ).status_code
        == 200
    )
    assert (
        client.delete(f"/api/v1/characterization-records/{record_id}", headers=headers).status_code
        == 204
    )
    assert (
        client.get(f"/api/v1/experiments/{run_id}", headers=headers).json()["result_missing_todo"]
        is True
    )

    product = client.post(
        f"/api/v1/samples/{sample['id']}/measured-products",
        json={"observed_phenomena": ["film"]},
        headers=headers,
    )
    assert product.status_code == 201, product.text
    assert (
        client.get(f"/api/v1/experiments/{run_id}", headers=headers).json()["result_missing_todo"]
        is False
    )
    product_id = product.json()["id"]
    assert (
        client.patch(
            f"/api/v1/measured-products/{product_id}",
            json={"observed_phenomena": ["continuous film"]},
            headers=headers,
        ).status_code
        == 200
    )
    assert (
        client.delete(f"/api/v1/measured-products/{product_id}", headers=headers).status_code == 204
    )
    assert (
        client.get(f"/api/v1/experiments/{run_id}", headers=headers).json()["result_missing_todo"]
        is True
    )

    assert (
        client.put(
            f"/api/v1/experiments/{run_id}/modules/basic_info",
            json={"payload_json": {}},
            headers=headers,
        ).status_code
        == 409
    )
    assert (
        client.put(
            f"/api/v1/experiments/{run_id}/setup-reference",
            json={"setup_id": "00000000-0000-0000-0000-000000000001", "version": 1},
            headers=headers,
        ).status_code
        == 409
    )


def test_invalid_run_rejects_process_and_result_writes(active_user) -> None:
    headers = _headers(active_user.email)
    run = _run(headers, "CVD-2026-9002")
    run_id = run["id"]
    sample = client.post(
        f"/api/v1/experiments/{run_id}/samples", json={"role": "product"}, headers=headers
    ).json()
    record = client.post(
        f"/api/v1/experiments/{run_id}/characterization-records",
        json={"sample_id": sample["id"], "method_instrument": "Raman"},
        headers=headers,
    ).json()
    product = client.post(
        f"/api/v1/samples/{sample['id']}/measured-products",
        json={"observed_phenomena": ["film"]},
        headers=headers,
    ).json()
    assert (
        client.post(
            f"/api/v1/experiments/{run_id}/invalidate",
            json={"reason": "invalid data"},
            headers=headers,
        ).status_code
        == 200
    )

    requests = [
        ("put", f"/api/v1/experiments/{run_id}/modules/basic_info", {"payload_json": {}}),
        (
            "put",
            f"/api/v1/experiments/{run_id}/setup-reference",
            {"setup_id": "00000000-0000-0000-0000-000000000001", "version": 1},
        ),
        (
            "post",
            f"/api/v1/experiments/{run_id}/characterization-records",
            {"sample_id": sample["id"], "method_instrument": "Raman"},
        ),
        ("patch", f"/api/v1/characterization-records/{record['id']}", {}),
        ("delete", f"/api/v1/characterization-records/{record['id']}", None),
        ("post", f"/api/v1/samples/{sample['id']}/measured-products", {}),
        ("patch", f"/api/v1/measured-products/{product['id']}", {}),
        ("delete", f"/api/v1/measured-products/{product['id']}", None),
    ]
    for method, url, body in requests:
        response = client.request(method, url, json=body, headers=headers)
        assert response.status_code == 409, (method, url, response.text)
