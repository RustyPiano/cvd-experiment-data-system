from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User, UserRole
from tests.helpers.v2_payloads import (
    basic_info_payload,
    reaction_step,
    setup_payload,
    substrate_item,
    target_product_payload,
)

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
            "ambient_temperature_C": 25.0,
            "ambient_humidity_percent": 45.0,
            "precheck_confirmed": True,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_setup(
    headers: dict[str, str],
    *,
    setup_code: str = "SETUP-SCIENCE",
    zone_count: int = 2,
) -> str:
    response = client.post(
        "/api/v1/setups",
        json=setup_payload(
            setup_code=setup_code,
            setup_name="管式炉",
            zone_count=zone_count,
        ),
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _set_setup(headers: dict[str, str], run_id: str, setup_id: str) -> None:
    response = client.put(
        f"/api/v1/experiments/{run_id}/setup-reference",
        json={
            "setup_id": setup_id,
            "version": 1,
            "tube_usage_history": {"reset_count": 0, "use_number_since_reset": 1},
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text


def _create_material_lot(
    headers: dict[str, str],
    *,
    lot_category: str,
    formula: str,
    batch_number: str,
    substrate_material: str = "sapphire_al2o3",
) -> dict:
    extra: dict = {}
    if lot_category in {"chemical", "化学品", "gas_cylinder", "气瓶"}:
        extra.update(cas_number="TEST-CAS", purity=99.9)
    if lot_category in {"substrate", "衬底"}:
        extra.update(
            substrate_material=substrate_material,
            substrate_orientation_polish_availability="reported",
            substrate_orientation_polish={
                "value": "c-plane",
                "option": "single_side_polished",
            },
            substrate_miscut_availability="reported",
            substrate_miscut_angle_deg=0.0,
            substrate_surface_roughness={"metric": "RMS", "value_nm": 0.5},
        )
        if substrate_material == "sio2_si":
            extra["substrate_oxide_thickness_nm"] = 285.0
    elif lot_category in {"gas_cylinder", "气瓶"}:
        extra["gas_purity_grade"] = "industrial_grade"
    response = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": lot_category,
            "substance_name": formula,
            "chemical_formula": formula,
            "batch_number": batch_number,
            **extra,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_material_lot_formula_accepts_common_grouped_and_hydrated_formulas(
    admin_user,
) -> None:
    headers = _headers(admin_user.email)

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
                "cas_number": "TEST-CAS",
                "batch_number": f"HYDRATE-{index}",
                "purity": 99.9,
            },
            headers=headers,
        )
        assert response.status_code == 201, response.text
        assert response.json()["latest_version"]["data"]["chemical_formula"] == formula


def test_target_and_substrate_api_accept_grouped_hydrated_formulas(
    active_user,
    admin_user,
) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    run_id = _create_run(headers, run_code="CVD-2026-0989")

    target = client.put(
        f"/api/v1/experiments/{run_id}/modules/target_product",
        json={
            "payload_json": target_product_payload(
                chemical_formula="(NH4)6Mo7O24∙4H2O",
            )
        },
        headers=headers,
    )
    assert target.status_code == 200, target.text
    assert target.json()["payload_json"]["chemical_formula"] == "(NH4)6Mo7O24·4H2O"

    substrate_lot = _create_material_lot(
        admin_headers,
        lot_category="substrate",
        formula="Na2WO4·2H2O",
        batch_number="HYDRATED-SUBSTRATE",
        substrate_material="hydrated_tungstate",
    )
    substrate = client.put(
        f"/api/v1/experiments/{run_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    substrate_item(
                        substrate_lot,
                        material="hydrated_tungstate",
                        chemical_formula="Na2WO4⋅2H2O",
                        crystal_orientation="polycrystalline",
                    )
                ]
            }
        },
        headers=headers,
    )
    assert substrate.status_code == 200, substrate.text
    assert substrate.json()["payload_json"]["items"][0]["chemical_formula"] == "Na2WO4·2H2O"


def test_module_api_rejects_nonempty_fields_when_their_condition_is_false(
    active_user,
) -> None:
    headers = _headers(active_user.email)
    run_id = _create_run(headers, run_code="CVD-2026-0990")
    cases = (
        (
            "precursors",
            {
                "items": [
                    {
                        "name_formula": "NH3",
                        "phase_state": "gas",
                        "lot_ref": {
                            "entity_id": str(uuid4()),
                            "version": 1,
                        },
                        "amount": 20,
                    }
                ]
            },
        ),
        (
            "substrates",
            {
                "items": [
                    {
                        "material": "sapphire_al2o3",
                        "lot_ref": {
                            "entity_id": str(uuid4()),
                            "version": 1,
                        },
                        "chemical_formula": "Al2O3",
                        "crystal_orientation": "c-plane",
                        "miscut_angle_deg": 0,
                        "oxide_thickness_nm": 285,
                        "surface_roughness": {"metric": "RMS", "value_nm": 0.5},
                        "size_placement": {
                            "length_mm": 10,
                            "width_mm": 10,
                            "placement": "face_up",
                        },
                    }
                ]
            },
        ),
        (
            "process_events",
            {
                "items": [
                    {
                        "event_id": str(uuid4()),
                        "event_type": "equipment_alarm",
                        "occurred_at": "2026-07-24T10:00:00+08:00",
                        "terminated_run": False,
                        "termination_reason": "other",
                    }
                ]
            },
        ),
    )

    for module_key, payload_json in cases:
        response = client.put(
            f"/api/v1/experiments/{run_id}/modules/{module_key}",
            json={"payload_json": payload_json},
            headers=headers,
        )
        assert response.status_code == 422, (module_key, response.text)

    for termination in (
        {"terminated_run": False},
        {"terminated_run": True, "termination_reason": "equipment_alarm"},
    ):
        response = client.put(
            f"/api/v1/experiments/{run_id}/modules/process_events",
            json={
                "payload_json": {
                    "items": [
                        {
                            "event_id": str(uuid4()),
                            "event_type": "equipment_alarm",
                            "occurred_at": "2026-07-24T10:00:00+08:00",
                            "description": "报警时炉压短时波动",
                            **termination,
                        }
                    ]
                }
            },
            headers=headers,
        )
        assert response.status_code == 200, response.text


def test_entity_dates_and_file_references_are_validated_and_snapshotted(
    active_user, admin_user, db_session
) -> None:
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
        headers=admin_headers,
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
        headers=admin_headers,
    )
    assert invalid_attachment.status_code == 422

    upload = client.post(
        "/api/v1/entity-files",
        headers=admin_headers,
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
        headers=admin_headers,
    )
    assert wrong_sha.status_code == 422

    valid = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "cas_number": "TEST-CAS",
            "batch_number": "GOOD-FILE",
            "purity": 99.9,
            "opened_date": "2026-07-24",
            "coa_attachment": {
                "file_asset_id": asset["id"],
                "sha256": asset["sha256"],
            },
        },
        headers=admin_headers,
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
    assert (
        client.delete(f"/api/v1/entity-files/{asset['id']}", headers=admin_headers).status_code
        == 409
    )


def test_unbound_entity_file_can_only_be_read_or_deleted_by_uploader_or_admin(
    active_user, admin_user, db_session
) -> None:
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
        headers=admin_headers,
        files={"file": ("draft.pdf", b"draft", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    file_id = upload.json()["id"]

    assert client.get(f"/api/v1/entity-files/{file_id}", headers=other_headers).status_code == 404
    assert (
        client.delete(f"/api/v1/entity-files/{file_id}", headers=other_headers).status_code == 403
    )
    assert client.get(f"/api/v1/entity-files/{file_id}", headers=admin_headers).status_code == 200
    assert (
        client.delete(f"/api/v1/entity-files/{file_id}", headers=admin_headers).status_code == 204
    )


def test_appending_entity_version_binds_uploaded_reference_to_new_version(admin_user) -> None:
    headers = _headers(admin_user.email)
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
            "cas_number": "TEST-CAS",
            "batch_number": "APPEND-FILE-V2",
            "purity": 99.9,
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


def test_setup_requires_sensor_contract_and_rejects_removed_reference_fields(
    admin_user,
) -> None:
    headers = _headers(admin_user.email)
    missing_sensors = client.post(
        "/api/v1/setups",
        json={
            "setup_code": "SETUP-NO-REF",
            "setup_name": "未注明传感器",
            "zone_count": 2,
            "orientation": "horizontal",
        },
        headers=headers,
    )
    assert missing_sensors.status_code == 422
    assert "temperature_sensors" in missing_sensors.text

    invalid_zone_count = client.post(
        "/api/v1/setups",
        json=setup_payload(setup_code="SETUP-ZERO-ZONES", zone_count=0),
        headers=headers,
    )
    assert invalid_zone_count.status_code == 422

    deleted_reference_fields = client.post(
        "/api/v1/setups",
        json={
            **setup_payload(setup_code="SETUP-OLD-REF", zone_count=1),
            "flow_reference_temperature_C": -273.15,
            "flow_reference_pressure_Pa": 101325,
        },
        headers=headers,
    )
    assert deleted_reference_fields.status_code == 422


@pytest.mark.parametrize(
    ("suffix", "shape", "dimensions"),
    [
        (
            "ROUND",
            {"material": "quartz", "shape": "round"},
            {"outer_diameter_mm": 50.0, "wall_thickness_mm": 2.0},
        ),
        (
            "SQUARE",
            {"material": "quartz", "shape": "square"},
            {"outer_side_mm": 40.0, "wall_thickness_mm": 2.0},
        ),
        (
            "RECT",
            {"material": "quartz", "shape": "rectangular"},
            {
                "outer_width_mm": 50.0,
                "outer_height_mm": 30.0,
                "wall_thickness_mm": 2.0,
            },
        ),
        (
            "OTHER",
            {
                "material": "other",
                "material_other": "SiC",
                "shape": "other",
                "shape_other": "D-shaped",
            },
            {"dimension_description": "50 mm wide D-shaped section"},
        ),
    ],
)
def test_setup_accepts_dimensions_for_each_cross_section(
    admin_user,
    suffix: str,
    shape: dict,
    dimensions: dict,
) -> None:
    response = client.post(
        "/api/v1/setups",
        json=setup_payload(
            setup_code=f"SETUP-{suffix}",
            zone_count=2,
            tube_material_shape=shape,
            tube_outer_diameter_wall_mm=dimensions,
        ),
        headers=_headers(admin_user.email),
    )

    assert response.status_code == 201, response.text
    assert response.json()["latest_version"]["data"]["tube_outer_diameter_wall_mm"] == dimensions


def test_draft_can_switch_setup_before_reconciling_dependent_modules(
    active_user,
    admin_user,
) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    one_zone = _create_setup(
        admin_headers,
        setup_code="SETUP-SWITCH-ONE",
        zone_count=1,
    )
    two_zone = _create_setup(
        admin_headers,
        setup_code="SETUP-SWITCH-TWO",
        zone_count=2,
    )
    gas_lot = _create_material_lot(
        admin_headers,
        lot_category="gas_cylinder",
        formula="Ar",
        batch_number="SWITCH-AR",
    )
    run_id = _create_run(headers, run_code="CVD-2026-0901")
    _set_setup(headers, run_id, one_zone)
    target = client.put(
        f"/api/v1/experiments/{run_id}/modules/target_product",
        json={"payload_json": target_product_payload()},
        headers=headers,
    )
    assert target.status_code == 200, target.text
    process = client.put(
        f"/api/v1/experiments/{run_id}/modules/process_steps",
        json={"payload_json": {"items": [reaction_step(gas_lot, zone_count=1)]}},
        headers=headers,
    )
    assert process.status_code == 200, process.text

    switched = client.put(
        f"/api/v1/experiments/{run_id}/setup-reference",
        json={
            "setup_id": two_zone,
            "version": 1,
            "tube_usage_history": {
                "reset_count": 0,
                "use_number_since_reset": 2,
            },
        },
        headers=headers,
    )
    assert switched.status_code == 200, switched.text

    lock = client.post(
        f"/api/v1/experiments/{run_id}/lock",
        headers=headers,
    )
    assert lock.status_code == 422
    assert "temperature_program" in lock.text


def test_material_lot_positive_measurements_reject_zero(admin_user) -> None:
    headers = _headers(admin_user.email)
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


def test_substrate_composite_fields_survive_controlled_value_validation(admin_user) -> None:
    response = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "substrate",
            "substance_name": "Sapphire substrate",
            "chemical_formula": "Al2O3",
            "batch_number": "SAPPHIRE-COMPOSITE",
            "substrate_material": "sapphire_al2o3",
            "substrate_orientation_polish_availability": "reported",
            "substrate_orientation_polish": {
                "value": "c-plane",
                "option": "single_side_polished",
            },
            "substrate_miscut_availability": "reported",
            "substrate_miscut_angle_deg": 0,
            "substrate_surface_roughness": {"metric": "RMS", "value_nm": 0.5},
            "substrate_size_spec": "10 × 10 × 0.5",
        },
        headers=_headers(admin_user.email),
    )

    assert response.status_code == 201, response.text
    data = response.json()["latest_version"]["data"]
    assert data["substrate_orientation_polish"] == {
        "value": "c-plane",
        "option": "single_side_polished",
    }


@pytest.mark.parametrize(
    ("field", "value"),
    (
        (
            "substrate_orientation_polish",
            {"value": "c-plane", "option": "single_side_polished"},
        ),
        ("substrate_size_spec", "10×10×0.5"),
        ("gas_cylinder_number", "GC-Ar-07"),
    ),
)
def test_material_lot_rejects_category_specific_fields(
    admin_user,
    field: str,
    value: object,
) -> None:
    response = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "cas_number": "TEST-CAS",
            "batch_number": f"WRONG-CATEGORY-{field}",
            "purity": 99.9,
            field: value,
        },
        headers=_headers(admin_user.email),
    )

    assert response.status_code == 422


@pytest.mark.parametrize("field", ("particle_size_d50_um", "form_appearance"))
def test_gas_lot_rejects_non_gas_material_fields(admin_user, field: str) -> None:
    response = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "gas_cylinder",
            "substance_name": "Ar",
            "chemical_formula": "Ar",
            "cas_number": "7440-37-1",
            "batch_number": f"GAS-WITH-{field}",
            "purity": 99.999,
            field: 10 if field == "particle_size_d50_um" else "powder",
        },
        headers=_headers(admin_user.email),
    )

    assert response.status_code == 422


def test_substrate_lot_rejects_formula_that_conflicts_with_material(admin_user) -> None:
    response = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "substrate",
            "substance_name": "Sapphire substrate",
            "chemical_formula": "MoS2",
            "batch_number": "SAPPHIRE-WRONG-FORMULA",
            "substrate_material": "sapphire_al2o3",
            "substrate_orientation_polish_availability": "not_provided",
            "substrate_miscut_availability": "not_applicable",
            "substrate_surface_roughness": {"availability": "not_provided"},
        },
        headers=_headers(admin_user.email),
    )

    assert response.status_code == 422
    assert "chemical_formula" in response.text
    assert "identity" in response.text


def test_foil_substrate_lot_can_mark_crystal_specs_not_applicable(admin_user) -> None:
    response = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "substrate",
            "substance_name": "Copper foil",
            "chemical_formula": "Cu",
            "batch_number": "CU-FOIL-NO-CRYSTAL-SPEC",
            "substrate_material": "cu_foil",
            "substrate_orientation_polish_availability": "not_applicable",
            "substrate_miscut_availability": "not_applicable",
            "substrate_surface_roughness": {"availability": "not_provided"},
        },
        headers=_headers(admin_user.email),
    )

    assert response.status_code == 201, response.text
    data = response.json()["latest_version"]["data"]
    assert data["substrate_orientation_polish"] is None
    assert data["substrate_miscut_angle_deg"] is None


def test_substrate_upsert_discards_forged_lot_owned_facts(
    active_user,
    admin_user,
) -> None:
    owner_headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    lot = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "substrate",
            "substance_name": "Copper foil",
            "chemical_formula": "Cu",
            "batch_number": "CU-FOIL-FORGED-RUN-FACTS",
            "substrate_material": "cu_foil",
            "substrate_orientation_polish_availability": "not_applicable",
            "substrate_miscut_availability": "not_applicable",
            "substrate_surface_roughness": {"availability": "not_provided"},
        },
        headers=admin_headers,
    )
    assert lot.status_code == 201, lot.text
    run_id = _create_run(owner_headers, run_code="CVD-2026-0801")

    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    substrate_item(
                        lot.json(),
                        material="cu_foil",
                        chemical_formula="Cu",
                        crystal_orientation="forged-orientation",
                        miscut_angle_deg=1.5,
                        miscut_direction="x面向x轴偏1.5°",
                    )
                ]
            }
        },
        headers=owner_headers,
    )

    assert response.status_code == 200, response.text
    item = response.json()["payload_json"]["items"][0]
    assert item["orientation_polish_availability"] == "not_applicable"
    assert item["miscut_availability"] == "not_applicable"
    assert "crystal_orientation" not in item
    assert "miscut_angle_deg" not in item


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
    admin_user,
) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    setup_id = _create_setup(admin_headers)
    run_id = _create_run(headers, run_code="CVD-2026-0803")
    _set_setup(headers, run_id, setup_id)
    precursor_lot = _create_material_lot(
        admin_headers,
        lot_category="chemical",
        formula="MoO3",
        batch_number="LOT-MOO3",
    )
    substrate_lot = _create_material_lot(
        admin_headers,
        lot_category="substrate",
        formula="Al2O3",
        batch_number="LOT-SAPPHIRE",
    )
    valid_substrate = substrate_item(substrate_lot)

    precursor = client.put(
        f"/api/v1/experiments/{run_id}/modules/precursors",
        json={
            "payload_json": {
                "items": [
                    {
                        "name_formula": "MoO3",
                        "cas_inchi": "FORGED",
                        "phase_state": "solid",
                        "amount": 20,
                        "boat_crucible": {
                            "material": "quartz_boat",
                            "length_mm": 90,
                            "reset_count": 0,
                            "use_number_since_reset": 1,
                        },
                        "lot_ref": {
                            "entity_id": precursor_lot["id"],
                            "version": 1,
                            "snapshot": {"chemical_formula": "FORGED"},
                        },
                        "source_zone_temperature": {
                            "zone_index": 1,
                            "temperature_C": 620,
                            "temperature_basis": "estimate",
                        },
                    }
                ]
            }
        },
        headers=headers,
    )
    assert precursor.status_code == 200, precursor.text
    precursor_ref = precursor.json()["payload_json"]["items"][0]["lot_ref"]
    assert precursor.json()["payload_json"]["items"][0]["cas_inchi"] == "TEST-CAS"
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
                        **valid_substrate,
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
                        **valid_substrate,
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
                        "boat_crucible": {
                            "material": "quartz_boat",
                            "length_mm": 90,
                            "reset_count": 0,
                            "use_number_since_reset": 1,
                        },
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
                        **valid_substrate,
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


def test_custom_substrate_lot_reference_accepts_matching_other_material(
    active_user, admin_user
) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    run_id = _create_run(headers, run_code="CVD-2026-0811")
    custom_lot = _create_material_lot(
        admin_headers,
        lot_category="substrate",
        formula="SiC",
        batch_number="LOT-CUSTOM-SIC",
        substrate_material="SiC",
    )

    response = client.put(
        f"/api/v1/experiments/{run_id}/modules/substrates",
        json={
            "payload_json": {
                "items": [
                    substrate_item(
                        custom_lot,
                        material="SiC",
                        chemical_formula="SiC",
                        crystal_orientation="polycrystalline",
                    )
                ]
            }
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text


def test_pvd_target_lot_snapshot_is_always_rebuilt_server_side(active_user, admin_user) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    target_lot = client.post(
        "/api/v1/material-lots",
        json={
            "lot_category": "chemical",
            "substance_name": "MoS2 sputtering target",
            "chemical_formula": "MoS2",
            "cas_number": "TEST-CAS",
            "batch_number": "TARGET-T01",
            "purity": 99.9,
            "form_appearance": "target",
        },
        headers=admin_headers,
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


def test_apcvd_lpcvd_pressure_regime_is_checked_in_both_save_orders(
    active_user, admin_user
) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    run_id = _create_run(headers, run_code="CVD-2026-0804", synthesis_method="APCVD")
    setup_id = _create_setup(admin_headers, setup_code="SETUP-PRESSURE-ORDER")
    _set_setup(headers, run_id, setup_id)
    gas_lot = _create_material_lot(
        admin_headers,
        lot_category="gas_cylinder",
        formula="Ar",
        batch_number="AR-PRESSURE-ORDER",
    )

    low_pressure_growth = client.put(
        f"/api/v1/experiments/{run_id}/modules/process_steps",
        json={
            "payload_json": {
                "items": [
                    reaction_step(
                        gas_lot,
                        pressure_system={"value": 100.0, "option": "low_pressure"},
                    )
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
                    reaction_step(
                        gas_lot,
                        pressure_system={
                            "value": 101325,
                            "option": "atmospheric_pressure",
                        },
                    )
                ]
            }
        },
        headers=headers,
    )
    assert atmospheric_growth.status_code == 200, atmospheric_growth.text

    incompatible_method_update = client.put(
        f"/api/v1/experiments/{run_id}/modules/basic_info",
        json={
            "payload_json": basic_info_payload(
                started_at="2026-07-24T09:00:00+08:00",
                synthesis_method="LPCVD",
                operator="ignored",
                run_code="CVD-2026-0804",
            )
        },
        headers=headers,
    )
    assert incompatible_method_update.status_code == 422


def test_pressure_category_requires_a_physically_compatible_absolute_value(
    active_user, admin_user
) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    setup_id = _create_setup(admin_headers, setup_code="SETUP-PRESSURE-RANGE")
    gas_lot = _create_material_lot(
        admin_headers,
        lot_category="gas_cylinder",
        formula="Ar",
        batch_number="AR-PRESSURE-RANGE",
    )
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
        _set_setup(headers, run_id, setup_id)
        response = client.put(
            f"/api/v1/experiments/{run_id}/modules/process_steps",
            json={
                "payload_json": {
                    "items": [
                        reaction_step(
                            gas_lot,
                            pressure_system={
                                "value": pressure_value,
                                "option": pressure_option,
                            },
                        )
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
                        "event_id": str(uuid4()),
                        "event_type": "manual_intervention",
                        "occurred_at": "2026-07-24T01:30:00+01:00",
                        "terminated_run": False,
                    },
                    {
                        "event_id": str(uuid4()),
                        "event_type": "signal_anomaly",
                        "occurred_at": "2026-07-24T08:59:59+08:00",
                        "terminated_run": False,
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
                        "event_id": str(uuid4()),
                        "event_type": "manual_intervention",
                        "occurred_at": "2026-07-24T09:00:00+08:00",
                        "terminated_run": False,
                    },
                    {
                        "event_id": str(uuid4()),
                        "event_type": "manual_intervention",
                        "occurred_at": "2026-07-24T03:00:00+01:00",
                        "terminated_run": False,
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
            "payload_json": basic_info_payload(
                started_at="2026-07-24T10:00:00+08:00",
                operator="ignored",
                run_code="ignored",
            )
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
                        "event_id": str(uuid4()),
                        "event_type": "manual_intervention",
                        "occurred_at": "2026-07-24",
                        "terminated_run": False,
                    }
                ]
            }
        },
        headers=headers,
    )

    assert response.status_code == 422
