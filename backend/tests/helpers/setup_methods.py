from fastapi.testclient import TestClient


def create_confirmed_setup_methods(
    client: TestClient,
    *,
    experiment_id: str,
    headers: dict[str, str],
) -> dict:
    diagram_response = client.post(
        f"/api/v1/experiments/{experiment_id}/files",
        files={"file": ("setup.png", b"diagram", "image/png")},
        data={"asset_role": "setup_diagram", "file_category": "raw"},
        headers=headers,
    )
    assert diagram_response.status_code == 201
    diagram_id = diagram_response.json()["id"]

    upsert_response = client.put(
        f"/api/v1/experiments/{experiment_id}/setup-methods",
        json={
            "setup_name_snapshot": "Test setup",
            "institution_snapshot": "group",
            "apparatus_description_snapshot": "Tube furnace test setup",
            "methods_text_snapshot": "Test methods text",
            "sample_placement_description_snapshot": "Substrate downstream of precursor",
            "reaction_flow_description_snapshot": "Purge, ramp, hold, cool",
            "unpublished_reason_snapshot": "Internal test protocol",
            "diagram_file_asset_id": diagram_id,
            "is_same_as_template": False,
            "semantic_context": {"temperature_reference": "setpoint"},
        },
        headers=headers,
    )
    assert upsert_response.status_code == 200

    confirm_response = client.post(
        f"/api/v1/experiments/{experiment_id}/setup-methods/confirm",
        headers=headers,
    )
    assert confirm_response.status_code == 200
    return confirm_response.json()["data"]
