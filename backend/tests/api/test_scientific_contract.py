from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, UserRole

client = TestClient(app)


def _headers(email: str, password: str = "Password123!") -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_run(
    headers: dict[str, str],
    *,
    run_code: str,
    synthesis_method: str = "APCVD",
    started_at: str = "2026-07-24T09:00:00",
) -> str:
    response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": run_code,
            "started_at": started_at,
            "synthesis_method": synthesis_method,
            "chemical_formula": "MoS2",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_setup(headers: dict[str, str], *, setup_code: str = "SETUP-SCIENCE") -> str:
    response = client.post(
        "/api/v1/setups",
        json={
            "setup_code": setup_code,
            "setup_name": "双温区管式炉",
            "zone_count": 2,
            "orientation": "horizontal",
            "coordinate_system": "上游负/下游正",
            "flow_reference_temperature_C": 20,
            "flow_reference_pressure_Pa": 101325,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _set_setup(headers: dict[str, str], run_id: str, setup_id: str) -> None:
    response = client.put(
        f"/api/v1/experiments/{run_id}/setup-reference",
        json={"setup_id": setup_id, "version": 1},
        headers=headers,
    )
    assert response.status_code == 200, response.text


def _create_material_lot(
    headers: dict[str, str],
    *,
    lot_category: str,
    formula: str,
    batch_number: str,
    substrate_material: str = "sapphire",
) -> dict:
    response = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": lot_category,
            "substance_name": formula,
            "chemical_formula": formula,
            "batch_number": batch_number,
            **(
                {"substrate_material": substrate_material}
                if lot_category in {"substrate", "衬底"}
                else {}
            ),
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_material_lot_formula_accepts_common_grouped_and_hydrated_formulas(active_user) -> None:
    headers = _headers(active_user.email)

    for index, formula in enumerate(
        ("(NH4)6Mo7O24·4H2O", "Na2WO4·2H2O", "Fe2(SO4)3"),
        start=1,
    ):
        response = client.post(
            "/api/v1/material-lots",
            json={
                "lot_category": "chemical",
                "substance_name": formula,
                "chemical_formula": formula,
                "batch_number": f"HYDRATE-{index}",
            },
            headers=headers,
        )
        assert response.status_code == 201, response.text
        assert response.json()["latest_version"]["data"]["chemical_formula"] == formula


def test_entity_dates_and_file_references_are_validated_and_snapshotted(
    active_user, admin_user, db_session
) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    other = User(
        email="entity-file-other@example.com",
        name="Entity File Other",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    other_headers = _headers(other.email)

    invalid_date = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "batch_number": "BAD-DATE",
            "opened_date": "not-a-date",
        },
        headers=headers,
    )
    assert invalid_date.status_code == 422

    invalid_attachment = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "batch_number": "BAD-FILE",
            "coa_attachment": "coa.pdf",
        },
        headers=headers,
    )
    assert invalid_attachment.status_code == 422

    upload = client.post(
        "/api/v1/entity-files",
        headers=headers,
        data={"note": "supplier certificate"},
        files={"file": ("coa.pdf", b"certificate-bytes", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    asset = upload.json()
    assert asset["experiment_run_id"] is None
    assert asset["entity_type"] is None
    assert asset["entity_id"] is None
    assert asset["entity_version"] is None
    assert (
        client.get(f"/api/v1/entity-files/{asset['id']}", headers=other_headers).status_code == 404
    )
    assert (
        client.get(f"/api/v1/entity-files/{asset['id']}", headers=admin_headers).status_code == 200
    )

    wrong_sha = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "batch_number": "WRONG-SHA",
            "coa_attachment": {
                "file_asset_id": asset["id"],
                "sha256": "0" * 64,
            },
        },
        headers=headers,
    )
    assert wrong_sha.status_code == 422

    valid = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "batch_number": "GOOD-FILE",
            "opened_date": "2026-07-24",
            "coa_attachment": {
                "file_asset_id": asset["id"],
                "sha256": asset["sha256"],
            },
        },
        headers=headers,
    )
    assert valid.status_code == 201, valid.text
    saved = valid.json()["latest_version"]["data"]["coa_attachment"]
    assert saved == {
        "file_asset_id": asset["id"],
        "sha256": asset["sha256"],
        "original_name": "coa.pdf",
        "size_bytes": len(b"certificate-bytes"),
    }
    bound = client.get(f"/api/v1/entity-files/{asset['id']}", headers=other_headers)
    assert bound.status_code == 200, bound.text
    assert bound.json()["entity_type"] == "material_lot"
    assert bound.json()["entity_id"] == valid.json()["id"]
    assert bound.json()["entity_version"] == 1
    assert client.delete(f"/api/v1/entity-files/{asset['id']}", headers=headers).status_code == 409
    assert (
        client.delete(f"/api/v1/entity-files/{asset['id']}", headers=admin_headers).status_code
        == 409
    )


def test_unbound_entity_file_can_only_be_read_or_deleted_by_uploader_or_admin(
    active_user, admin_user, db_session
) -> None:
    owner_headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    other = User(
        email="unbound-file-other@example.com",
        name="Unbound File Other",
        password_hash=active_user.password_hash,
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    other_headers = _headers(other.email)
    upload = client.post(
        "/api/v1/entity-files",
        headers=owner_headers,
        files={"file": ("draft.pdf", b"draft", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    file_id = upload.json()["id"]

    assert client.get(f"/api/v1/entity-files/{file_id}", headers=other_headers).status_code == 404
    assert (
        client.delete(f"/api/v1/entity-files/{file_id}", headers=other_headers).status_code == 404
    )
    assert client.get(f"/api/v1/entity-files/{file_id}", headers=admin_headers).status_code == 200
    assert (
        client.delete(f"/api/v1/entity-files/{file_id}", headers=admin_headers).status_code == 204
    )


def test_appending_entity_version_binds_uploaded_reference_to_new_version(active_user) -> None:
    headers = _headers(active_user.email)
    lot = _create_material_lot(
        headers,
        lot_category="chemical",
        formula="MoO3",
        batch_number="APPEND-FILE-V1",
    )
    upload = client.post(
        "/api/v1/entity-files",
        headers=headers,
        files={"file": ("coa-v2.pdf", b"version-two", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    asset = upload.json()

    appended = client.post(
        f"/api/v1/material-lots/{lot['id']}/versions",
        json={
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "batch_number": "APPEND-FILE-V2",
            "coa_attachment": {
                "file_asset_id": asset["id"],
                "sha256": asset["sha256"],
            },
        },
        headers=headers,
    )
    assert appended.status_code == 201, appended.text
    assert appended.json()["version"] == 2

    bound = client.get(f"/api/v1/entity-files/{asset['id']}", headers=headers)
    assert bound.status_code == 200, bound.text
    assert bound.json()["entity_type"] == "material_lot"
    assert bound.json()["entity_id"] == lot["id"]
    assert bound.json()["entity_version"] == 2


def test_setup_requires_versioned_sccm_reference_state(active_user) -> None:
    headers = _headers(active_user.email)

    missing_reference = client.post(
        "/api/v1/setups",
        json={
            "setup_code": "SETUP-NO-REF",
            "setup_name": "未注明参考状态",
            "zone_count": 2,
            "orientation": "horizontal",
            "coordinate_system": "上游负/下游正",
        },
        headers=headers,
    )
    assert missing_reference.status_code == 422
    assert set(missing_reference.json()["detail"]["missing"]) >= {
        "flow_reference_temperature_C",
        "flow_reference_pressure_Pa",
    }

    invalid_zone_count = client.post(
        "/api/v1/setups",
        json={
            "setup_code": "SETUP-ZERO-ZONES",
            "setup_name": "无温区",
            "zone_count": 0,
            "orientation": "horizontal",
            "coordinate_system": "上游负/下游正",
            "flow_reference_temperature_C": 20,
            "flow_reference_pressure_Pa": 101325,
        },
        headers=headers,
    )
    assert invalid_zone_count.status_code == 422

    absolute_zero_reference = client.post(
        "/api/v1/setups",
        json={
            "setup_code": "SETUP-ZERO-KELVIN",
            "setup_name": "不可能的 sccm 参考态",
            "zone_count": 1,
            "orientation": "horizontal",
            "coordinate_system": "上游负/下游正",
            "flow_reference_temperature_C": -273.15,
            "flow_reference_pressure_Pa": 101325,
        },
        headers=headers,
    )
    assert absolute_zero_reference.status_code == 422


def test_material_lot_positive_measurements_reject_zero(active_user) -> None:
    headers = _headers(active_user.email)
    invalid_payloads = (
        {
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "batch_number": "ZERO-PURITY",
            "purity": 0,
        },
        {
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "batch_number": "ZERO-PARTICLE",
            "particle_size_d50_um": 0,
        },
        {
            "lot_category": "substrate",
            "substance_name": "SiO2/Si wafer",
            "chemical_formula": "SiO2",
            "batch_number": "ZERO-OXIDE",
            "substrate_material": "sio2_si",
            "substrate_oxide_thickness_nm": 0,
        },
    )

    for payload in invalid_payloads:
        response = client.post("/api/v1/material-lots", json=payload, headers=headers)
        assert response.status_code == 422, response.text


def test_naive_run_time_is_stored_with_configured_utc_offset(active_user) -> None:
    headers = _headers(active_user.email)
    run_id = _create_run(
        headers,
        run_code="CVD-2026-0802",
        started_at="2026-07-24T09:00:00",
    )

    basic = client.get(
        f"/api/v1/experiments/{run_id}/modules/basic_info",
        headers=headers,
    )

    assert basic.status_code == 200, basic.text
    assert basic.json()["payload_json"]["started_at"] == "2026-07-24T09:00:00+08:00"


def test_run_rejects_date_without_clock_time(active_user) -> None:
    response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": "CVD-2026-0810",
            "started_at": "2026-07-24",
            "synthesis_method": "APCVD",
        },
        headers=_headers(active_user.email),
    )

    assert response.status_code == 422


def test_composite_formula_is_not_silently_classified_as_intrinsic(active_user) -> None:
    headers = _headers(active_user.email)
    response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": "CVD-2026-0805",
            "started_at": "2026-07-24T09:00:00+08:00",
            "synthesis_method": "APCVD",
            "chemical_formula": "MoS2/WS2",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text

    target = client.get(
        f"/api/v1/experiments/{response.json()['id']}/modules/target_product",
        headers=headers,
    )

    assert target.status_code == 200, target.text
    assert target.json()["payload_json"]["structure_type"] is None


def test_material_lot_references_are_verified_and_frozen_for_precursor_and_substrate(
    active_user,
) -> None:
    headers = _headers(active_user.email)
    setup_id = _create_setup(headers)
    run_id = _create_run(headers, run_code="CVD-2026-0803")
    _set_setup(headers, run_id, setup_id)
    precursor_lot = _create_material_lot(
        headers,
        lot_category="chemical",
        formula="MoO3",
        batch_number="LOT-MOO3",
    )
    substrate_lot = _create_material_lot(
        headers,
        lot_category="substrate",
        formula="Al2O3",
        batch_number="LOT-SAPPHIRE",
    )

    precursor = client.put(
        f"/api/v1/experiments/{run_id}/modules/precursors",
        json={
            "payload_json": {
                "items": [
                    {
                        "name_formula": "MoO3",
                        "phase_state": "solid",
                        "amount": 20,
                        "lot_ref": {
                            "entity_id": precursor_lot["id"],
                            "version": 1,
                            "snapshot": {"chemical_formula": "FORGED"},
                        },
                        "source_zone_temperature": {
                            "zone_index": 1,
                            "temperature_C": 620,
                        },
                    }
                ]
            }
        },
        headers=headers,
    )
    assert precursor.status_code == 200, precursor.text
    precursor_ref = precursor.json()["payload_json"]["items"][0]["lot_ref"]
    assert precursor_ref["entity_id"] == precursor_lot["id"]
    assert precursor_ref["version"] == 1
    assert precursor_ref["snapshot"]["chemical_formula"] == "MoO3"
    assert "FORGED" not in str(precursor_ref["snapshot"])

    out_of_range_zone = client.put(
        f"/api/v1/experiments/{run_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "material": "sapphire_al2o3",
                        "lot_ref": {
                            "entity_id": substrate_lot["id"],
                            "version": 1,
                            "snapshot": {"chemical_formula": "FORGED"},
                        },
                        "zone_thermocouple_distance_mm": {
                            "zone_index": 3,
                            "distance_mm": 15,
                        },
                    }
                ]
            }
        },
        headers=headers,
    )
    assert out_of_range_zone.status_code == 422

    substrate = client.put(
        f"/api/v1/experiments/{run_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "material": "sapphire_al2o3",
                        "lot_ref": {
                            "entity_id": substrate_lot["id"],
                            "version": 1,
                        },
                        "zone_thermocouple_distance_mm": {
                            "zone_index": 2,
                            "distance_mm": 15,
                        },
                    }
                ]
            }
        },
        headers=headers,
    )
    assert substrate.status_code == 200, substrate.text
    substrate_ref = substrate.json()["payload_json"]["items"][0]["lot_ref"]
    assert substrate_ref["snapshot"]["lot_category"] == "substrate"
    assert substrate_ref["snapshot"]["chemical_formula"] == "Al2O3"

    nonexistent = client.put(
        f"/api/v1/experiments/{run_id}/modules/precursors",
        json={
            "payload_json": {
                "items": [
                    {
                        "name_formula": "MoO3",
                        "phase_state": "solid",
                        "amount": 20,
                        "lot_ref": {
                            "entity_id": "00000000-0000-0000-0000-000000000001",
                            "version": 1,
                        },
                    }
                ]
            }
        },
        headers=headers,
    )
    assert nonexistent.status_code == 422

    precursor_formula_mismatch = client.put(
        f"/api/v1/experiments/{run_id}/modules/precursors",
        json={
            "payload_json": {
                "items": [
                    {
                        "name_formula": "WO3",
                        "phase_state": "solid",
                        "amount": 20,
                        "lot_ref": {
                            "entity_id": precursor_lot["id"],
                            "version": 1,
                        },
                    }
                ]
            }
        },
        headers=headers,
    )
    assert precursor_formula_mismatch.status_code == 422

    controlled_name_alias = client.put(
        f"/api/v1/experiments/{run_id}/modules/precursors",
        json={
            "payload_json": {
                "items": [
                    {
                        "name_formula": "三氧化钼",
                        "phase_state": "solid",
                        "amount": 20,
                        "lot_ref": {
                            "entity_id": precursor_lot["id"],
                            "version": 1,
                        },
                    }
                ]
            }
        },
        headers=headers,
    )
    assert controlled_name_alias.status_code == 200, controlled_name_alias.text

    substrate_material_mismatch = client.put(
        f"/api/v1/experiments/{run_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "material": "quartz",
                        "lot_ref": {
                            "entity_id": substrate_lot["id"],
                            "version": 1,
                        },
                    }
                ]
            }
        },
        headers=headers,
    )
    assert substrate_material_mismatch.status_code == 422


def test_custom_substrate_lot_reference_accepts_matching_other_material(active_user) -> None:
    headers = _headers(active_user.email)
    run_id = _create_run(headers, run_code="CVD-2026-0811")
    custom_lot = _create_material_lot(
        headers,
        lot_category="substrate",
        formula="SiC",
        batch_number="LOT-CUSTOM-SIC",
        substrate_material="other",
    )

    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    {
                        "material": "other",
                        "lot_ref": {
                            "entity_id": custom_lot["id"],
                            "version": 1,
                        },
                    }
                ]
            }
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text


def test_pvd_target_lot_snapshot_is_always_rebuilt_server_side(active_user) -> None:
    headers = _headers(active_user.email)
    target_lot = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "chemical",
            "substance_name": "MoS2 sputtering target",
            "chemical_formula": "MoS2",
            "batch_number": "TARGET-T01",
            "form_appearance": "target",
        },
        headers=headers,
    )
    assert target_lot.status_code == 201, target_lot.text
    run_id = _create_run(
        headers,
        run_code="CVD-2026-0808",
        synthesis_method="PVD-磁控溅射",
    )

    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/pvd",
        json={
            "payload_json": {
                "target_lot_ref": {
                    "entity_id": target_lot.json()["id"],
                    "version": 1,
                    "snapshot": {
                        "chemical_formula": "FORGED",
                        "batch_number": "FORGED",
                    },
                },
                "target_substrate_distance_mm": 80,
                "power_bias": 150,
                "plasma_gas_pressure": {"value": 0.5, "option": "Ar"},
                "presputter_shutter": 5,
                "deposition_rate_nm_s": 0.1,
            }
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text
    snapshot = response.json()["payload_json"]["target_lot_ref"]["snapshot"]
    assert snapshot["chemical_formula"] == "MoS2"
    assert snapshot["batch_number"] == "TARGET-T01"


def test_apcvd_lpcvd_pressure_regime_is_checked_in_both_save_orders(active_user) -> None:
    headers = _headers(active_user.email)
    run_id = _create_run(headers, run_code="CVD-2026-0804", synthesis_method="APCVD")

    low_pressure_growth = client.put(
        f"/api/v1/experiments/{run_id}/modules/process_steps",
        json={
            "payload_json": {
                "items": [
                    {
                        "stage_type": "growth",
                        "temperature_program": "25->750",
                        "gas_species": ["Ar"],
                        "gas_flow_sccm": {"value": 80, "option": "MFC"},
                        "pressure_system": {
                            "value": 100,
                            "option": "low_pressure",
                        },
                    }
                ]
            }
        },
        headers=headers,
    )
    assert low_pressure_growth.status_code == 422

    atmospheric_growth = client.put(
        f"/api/v1/experiments/{run_id}/modules/process_steps",
        json={
            "payload_json": {
                "items": [
                    {
                        "stage_type": "growth",
                        "temperature_program": "25->750",
                        "gas_species": ["Ar"],
                        "gas_flow_sccm": {"value": 80, "option": "MFC"},
                        "pressure_system": {
                            "value": 101325,
                            "option": "atmospheric_pressure",
                        },
                    }
                ]
            }
        },
        headers=headers,
    )
    assert atmospheric_growth.status_code == 200, atmospheric_growth.text

    incompatible_method_update = client.put(
        f"/api/v1/experiments/{run_id}/modules/basic_info",
        json={
            "payload_json": {
                "started_at": "2026-07-24T09:00:00+08:00",
                "synthesis_method": "LPCVD",
                "operator": "ignored",
                "run_code": "CVD-2026-0804",
            }
        },
        headers=headers,
    )
    assert incompatible_method_update.status_code == 422


def test_pressure_category_requires_a_physically_compatible_absolute_value(active_user) -> None:
    headers = _headers(active_user.email)
    cases = (
        ("CVD-2026-0809", "APCVD", 1, "atmospheric_pressure"),
        ("CVD-2026-0810", "LPCVD", 101325, "low_pressure"),
    )
    for run_code, method, pressure_value, pressure_option in cases:
        run_id = _create_run(
            headers,
            run_code=run_code,
            synthesis_method=method,
        )
        response = client.put(
            f"/api/v1/experiments/{run_id}/modules/process_steps",
            json={
                "payload_json": {
                    "items": [
                        {
                            "stage_type": "growth",
                            "temperature_program": "25->750",
                            "gas_species": ["Ar"],
                            "gas_flow_sccm": {"value": 80, "option": "MFC"},
                            "pressure_system": {
                                "value": pressure_value,
                                "option": pressure_option,
                            },
                        }
                    ]
                }
            },
            headers=headers,
        )
        assert response.status_code == 422


def test_process_events_cannot_precede_started_at_in_either_save_order(active_user) -> None:
    headers = _headers(active_user.email)
    run_id = _create_run(
        headers,
        run_code="CVD-2026-0806",
        started_at="2026-07-24T09:00:00+08:00",
    )

    event_before_start = client.put(
        f"/api/v1/experiments/{run_id}/modules/process_events",
        json={
            "payload_json": {
                "items": [
                    {
                        "event_part": "开始升温",
                        "occurred_at": "2026-07-24T01:30:00+01:00",
                    },
                    {
                        "event_part": "提前发生",
                        "occurred_at": "2026-07-24T08:59:59+08:00",
                    },
                ]
            }
        },
        headers=headers,
    )
    assert event_before_start.status_code == 422
    assert event_before_start.json()["detail"]["invalid"][0]["key"] == "occurred_at"

    valid_events = client.put(
        f"/api/v1/experiments/{run_id}/modules/process_events",
        json={
            "payload_json": {
                "items": [
                    {
                        "event_part": "开始升温",
                        "occurred_at": "2026-07-24T09:00:00+08:00",
                    },
                    {
                        "event_part": "结束生长",
                        "occurred_at": "2026-07-24T03:00:00+01:00",
                    },
                ]
            }
        },
        headers=headers,
    )
    assert valid_events.status_code == 200, valid_events.text

    start_after_saved_event = client.put(
        f"/api/v1/experiments/{run_id}/modules/basic_info",
        json={
            "payload_json": {
                "started_at": "2026-07-24T10:00:00+08:00",
                "synthesis_method": "APCVD",
                "operator": "ignored",
                "run_code": "ignored",
            }
        },
        headers=headers,
    )
    assert start_after_saved_event.status_code == 422
    assert start_after_saved_event.json()["detail"]["invalid"][0]["key"] == "started_at"


def test_process_event_rejects_date_without_time(active_user) -> None:
    headers = _headers(active_user.email)
    run_id = _create_run(headers, run_code="CVD-2026-0807")

    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/process_events",
        json={
            "payload_json": {
                "items": [
                    {
                        "event_part": "日期不是时刻",
                        "occurred_at": "2026-07-24",
                    }
                ]
            }
        },
        headers=headers,
    )

    assert response.status_code == 422
