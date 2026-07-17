import csv
import io
import json
import zipfile
from uuid import UUID

from fastapi.testclient import TestClient

from app.main import app
from app.models.experiment import ExperimentRun, ExperimentStatus

client = TestClient(app)


def _headers(email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _run(
    headers: dict[str, str],
    *,
    code: str,
    started_at: str,
    operator: str,
    material: str,
    objective: str | None = None,
) -> dict:
    response = client.post(
        "/api/v1/experiments",
        json={
            "run_code": code,
            "started_at": started_at,
            "synthesis_method": "APCVD",
            "operator": operator,
            "chemical_formula": material,
            "objective": objective,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_run_filters_share_visibility_and_return_operator(active_user, admin_user) -> None:
    member_headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    _run(
        member_headers,
        code="CVD-2026-3001",
        started_at="2026-07-01T09:00:00",
        operator="Alice Zhang",
        material="MoS2",
    )
    _run(
        member_headers,
        code="CVD-2026-3002",
        started_at="2026-07-10T09:00:00",
        operator="Bob Li",
        material="WS2",
    )
    _run(
        admin_headers,
        code="CVD-2026-3003",
        started_at="2026-07-02T09:00:00",
        operator="Alice Zhang",
        material="MoSe2",
    )

    filtered = client.get(
        "/api/v1/experiments",
        params={
            "query": "3001",
            "material_system": "Mo",
            "operator": "alice",
            "date_from": "2026-07-01",
            "date_to": "2026-07-05",
            "status": "draft",
        },
        headers=member_headers,
    )
    assert filtered.status_code == 200, filtered.text
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["operator"] == "Alice Zhang"

    visible_to_member = client.get(
        "/api/v1/experiments",
        params={"material_system": "Mo", "operator": "Alice"},
        headers=member_headers,
    )
    visible_to_admin = client.get(
        "/api/v1/experiments",
        params={"material_system": "Mo", "operator": "Alice"},
        headers=admin_headers,
    )
    assert visible_to_member.json()["total"] == 1
    assert visible_to_admin.json()["total"] == 2


def test_run_audit_timeline_is_readable_and_omits_payload_snapshots(active_user) -> None:
    headers = _headers(active_user.email)
    run = _run(
        headers,
        code="CVD-2026-3101",
        started_at="2026-07-03T09:00:00",
        operator="Timeline User",
        material="MoS2",
    )
    sample = client.post(
        f"/api/v1/experiments/{run['id']}/samples",
        json={"role": "control"},
        headers=headers,
    ).json()
    result = client.post(
        f"/api/v1/samples/{sample['id']}/results",
        json={
            "kind": "direct_observation",
            "observed_phenomena": ["不连续覆盖"],
        },
        headers=headers,
    )
    assert result.status_code == 201, result.text

    timeline = client.get(
        f"/api/v1/experiments/{run['id']}/audit-events",
        headers=headers,
    )
    assert timeline.status_code == 200, timeline.text
    items = timeline.json()["items"]
    assert [item["action"] for item in items] == [
        "create",
        "create_sample",
        "create_result",
    ]
    assert all(item["actor_name"] == active_user.name for item in items)
    assert "id" not in items[0]
    assert "actor_id" not in items[0]
    assert "before_json" not in items[0]
    assert "after_json" not in items[0]


def test_json_and_filtered_zip_exports_are_relational_and_utf8(
    active_user,
    admin_user,
) -> None:
    member_headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    run = _run(
        member_headers,
        code="CVD-2026-3201",
        started_at="2026-07-04T09:00:00",
        operator="张三",
        material="MoS2",
        objective=' \t=HYPERLINK("https://invalid.example")',
    )
    hidden_run = _run(
        admin_headers,
        code="CVD-2026-3202",
        started_at="2026-07-04T09:00:00",
        operator="张三",
        material="MoS2",
    )
    sample = client.post(
        f"/api/v1/experiments/{run['id']}/samples",
        json={"role": "control"},
        headers=member_headers,
    ).json()
    result = client.post(
        f"/api/v1/samples/{sample['id']}/results",
        json={
            "kind": "characterization",
            "method_instrument": "Raman",
            "observed_phenomena": ["厚层区域"],
        },
        headers=member_headers,
    ).json()
    upload = client.post(
        f"/api/v1/experiments/{run['id']}/files",
        data={
            "characterization_record_id": result["characterization_record_id"],
            "method": "Raman",
        },
        files={"file": ("拉曼.csv", b"shift,intensity\n384,12\n", "text/csv")},
        headers=member_headers,
    )
    assert upload.status_code == 201, upload.text

    exported_json = client.get(
        f"/api/v1/experiments/{run['id']}/export",
        headers=member_headers,
    )
    assert exported_json.status_code == 200, exported_json.text
    payload = json.loads(exported_json.content)
    assert payload["run"]["run_code"] == "CVD-2026-3201"
    assert payload["run"]["operator"] == "张三"
    assert payload["samples"][0]["sample_code"] == sample["sample_code"]
    exported_result = payload["samples"][0]["results"][0]
    assert exported_result["record"]["method"] == "Raman"
    assert exported_result["record"]["files"][0]["filename"] == "拉曼.csv"
    assert exported_result["measurement"]["observed_phenomena"] == ["厚层区域"]
    assert payload["run"]["setup_reference"] == {
        "id": None,
        "version": None,
        "snapshot": None,
    }

    for path in ["export", "audit-events"]:
        forbidden = client.get(
            f"/api/v1/experiments/{hidden_run['id']}/{path}",
            headers=member_headers,
        )
        assert forbidden.status_code == 404

    exported_zip = client.get(
        "/api/v1/exports/runs",
        params={"operator": "张三"},
        headers=member_headers,
    )
    assert exported_zip.status_code == 200, exported_zip.text
    with zipfile.ZipFile(io.BytesIO(exported_zip.content)) as archive:
        assert set(archive.namelist()) == {
            "runs.csv",
            "precursors.csv",
            "substrates.csv",
            "process_steps.csv",
            "samples.csv",
            "characterization_results.csv",
            "files.csv",
        }
        runs = list(csv.DictReader(io.StringIO(archive.read("runs.csv").decode("utf-8-sig"))))
        results = list(
            csv.DictReader(
                io.StringIO(archive.read("characterization_results.csv").decode("utf-8-sig"))
            )
        )
        files = list(csv.DictReader(io.StringIO(archive.read("files.csv").decode("utf-8-sig"))))
    assert [row["run_code"] for row in runs] == ["CVD-2026-3201"]
    assert runs[0]["operator"] == "张三"
    assert runs[0]["objective"].startswith("'")
    assert results[0]["sample_code"] == sample["sample_code"]
    assert results[0]["observed_phenomenon"] == "厚层区域"
    assert not results[0]["observed_phenomenon"].startswith("[")
    assert files[0]["result_code"] == results[0]["result_code"]
    assert files[0]["download_url"].endswith("/download")


def test_exports_keep_standalone_records_shared_results_and_soft_deleted_files(
    active_user,
) -> None:
    headers = _headers(active_user.email)
    run = _run(
        headers,
        code="CVD-2026-3301",
        started_at="2026-07-05T09:00:00",
        operator="Export User",
        material="MoS2",
    )
    sample = client.post(
        f"/api/v1/experiments/{run['id']}/samples",
        json={"role": "control"},
        headers=headers,
    ).json()

    standalone = client.post(
        f"/api/v1/experiments/{run['id']}/characterization-records",
        json={
            "sample_id": sample["id"],
            "method_instrument": "Raman",
            "test_conditions": "532 nm",
            "raw_data": {"peaks": [384, 403]},
            "attrs": {"software": "LabSpec"},
        },
        headers=headers,
    )
    shared = client.post(
        f"/api/v1/experiments/{run['id']}/characterization-records",
        json={
            "sample_id": sample["id"],
            "method_instrument": "SEM",
            "raw_data": {"images": 2},
            "attrs": {"detector": "SE"},
        },
        headers=headers,
    )
    assert standalone.status_code == shared.status_code == 201

    standalone_upload = client.post(
        f"/api/v1/experiments/{run['id']}/files",
        data={"characterization_record_id": standalone.json()["id"]},
        files={"file": ("standalone.csv", b"x,y\n1,2\n", "text/csv")},
        headers=headers,
    )
    shared_upload = client.post(
        f"/api/v1/experiments/{run['id']}/files",
        data={"characterization_record_id": shared.json()["id"]},
        files={"file": ("shared.png", b"png", "image/png")},
        headers=headers,
    )
    assert standalone_upload.status_code == shared_upload.status_code == 201
    assert (
        client.delete(
            f"/api/v1/files/{standalone_upload.json()['id']}", headers=headers
        ).status_code
        == 204
    )

    for phenomenon in ["不连续覆盖", "厚层区域"]:
        product = client.post(
            f"/api/v1/samples/{sample['id']}/measured-products",
            json={
                "characterization_record_id": shared.json()["id"],
                "observed_phenomena": [phenomenon],
                "attrs": {"reviewed": True},
            },
            headers=headers,
        )
        assert product.status_code == 201, product.text

    exported_json = client.get(f"/api/v1/experiments/{run['id']}/export", headers=headers)
    assert exported_json.status_code == 200, exported_json.text
    payload = exported_json.json()
    results = payload["samples"][0]["results"]
    standalone_result = next(
        item for item in results if item["record"]["id"] == standalone.json()["id"]
    )
    shared_results = [item for item in results if item["record"]["id"] == shared.json()["id"]]
    assert standalone_result["measurement"] is None
    assert standalone_result["record"]["raw_data"] == {"peaks": [384, 403]}
    assert standalone_result["record"]["attrs"] == {"software": "LabSpec"}
    assert standalone_result["record"]["files"][0]["deleted_at"] is not None
    assert standalone_result["record"]["files"][0]["download_url"] is None
    assert len(shared_results) == 2
    assert {item["measurement"]["attrs"]["reviewed"] for item in shared_results} == {True}
    assert payload["other_files"] == []

    exported_zip = client.get(
        "/api/v1/exports/runs",
        params={"query": "3301"},
        headers=headers,
    )
    assert exported_zip.status_code == 200, exported_zip.text
    with zipfile.ZipFile(io.BytesIO(exported_zip.content)) as archive:
        result_rows = list(
            csv.DictReader(
                io.StringIO(archive.read("characterization_results.csv").decode("utf-8-sig"))
            )
        )
        file_rows = list(csv.DictReader(io.StringIO(archive.read("files.csv").decode("utf-8-sig"))))
    assert len({row["result_code"] for row in result_rows}) == 3
    assert {row["detail_scope"] for row in result_rows} >= {
        "raw_data",
        "record_attrs",
        "measurement_attrs",
    }
    assert all(not value.startswith(("[", "{")) for row in result_rows for value in row.values())
    assert len(file_rows) == 3
    shared_file_rows = [row for row in file_rows if row["filename"] == "shared.png"]
    assert len(shared_file_rows) == 2
    assert len({row["result_code"] for row in shared_file_rows}) == 2
    deleted_file = next(row for row in file_rows if row["filename"] == "standalone.csv")
    assert deleted_file["is_deleted"] == "True"
    assert deleted_file["download_url"] == ""


def test_export_relationalizes_nested_module_values_and_includes_run_state(
    active_user,
    db_session,
) -> None:
    headers = _headers(active_user.email)
    setup = client.post(
        "/api/v1/setups",
        json={
            "setup_code": "SETUP-EXPORT-1",
            "setup_name": "Export setup",
            "zone_count": 2,
            "orientation": "水平",
            "coordinate_system": "上游负/下游正",
            "field_devices": ["光", "电"],
        },
        headers=headers,
    )
    assert setup.status_code == 201, setup.text
    run = _run(
        headers,
        code="CVD-2026-3351",
        started_at="2026-07-05T10:00:00",
        operator="Nested Export User",
        material="MoS2",
    )
    referenced = client.put(
        f"/api/v1/experiments/{run['id']}/setup-reference",
        json={"setup_id": setup.json()["id"], "version": 1},
        headers=headers,
    )
    assert referenced.status_code == 200, referenced.text
    process = client.put(
        f"/api/v1/experiments/{run['id']}/modules/process_steps",
        json={
            "payload_json": {
                "items": [
                    {
                        "stage_type": "放气",
                        "gas_species": ["Ar", "H2"],
                        "gas_flow_sccm": "10",
                    }
                ]
            }
        },
        headers=headers,
    )
    assert process.status_code == 200, process.text
    stored_run = db_session.get(ExperimentRun, UUID(run["id"]))
    stored_run.status = ExperimentStatus.LOCKED
    stored_run.result_missing_todo = True
    db_session.commit()
    not_characterized = client.put(
        f"/api/v1/experiments/{run['id']}/not-characterized",
        json={"confirmed": True},
        headers=headers,
    )
    assert not_characterized.status_code == 200, not_characterized.text

    exported_json = client.get(f"/api/v1/experiments/{run['id']}/export", headers=headers)
    assert exported_json.status_code == 200, exported_json.text
    json_run = exported_json.json()["run"]
    assert json_run["not_characterized_at"] is not None
    assert json_run["setup_reference"]["version"] == 1
    assert json_run["setup_reference"]["snapshot"]["setup_code_snapshot"] == ("SETUP-EXPORT-1")

    exported_zip = client.get(
        "/api/v1/exports/runs",
        params={"query": "3351"},
        headers=headers,
    )
    assert exported_zip.status_code == 200, exported_zip.text
    with zipfile.ZipFile(io.BytesIO(exported_zip.content)) as archive:
        run_rows = list(csv.DictReader(io.StringIO(archive.read("runs.csv").decode("utf-8-sig"))))
        process_rows = list(
            csv.DictReader(io.StringIO(archive.read("process_steps.csv").decode("utf-8-sig")))
        )
    assert {row["setup_code"] for row in run_rows} == {"SETUP-EXPORT-1"}
    assert {row["result_missing_todo"] for row in run_rows} == {"False"}
    assert all(row["not_characterized_at"] for row in run_rows)
    assert {row["setup_detail_value"] for row in run_rows} == {"光", "电"}
    nested_gases = [row for row in process_rows if row["nested_field"] == "gas_species"]
    assert {row["nested_path"] for row in nested_gases} == {"[0]", "[1]"}
    assert {row["nested_value"] for row in nested_gases} == {"Ar", "H2"}
    assert all(row["gas_flow_sccm"] == "10" for row in nested_gases)

    cleared = client.put(
        f"/api/v1/experiments/{run['id']}/not-characterized",
        json={"confirmed": False},
        headers=headers,
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["result_missing_todo"] is True
    refreshed_zip = client.get(
        "/api/v1/exports/runs",
        params={"query": "3351"},
        headers=headers,
    )
    with zipfile.ZipFile(io.BytesIO(refreshed_zip.content)) as archive:
        refreshed_rows = list(
            csv.DictReader(io.StringIO(archive.read("runs.csv").decode("utf-8-sig")))
        )
    assert {row["result_missing_todo"] for row in refreshed_rows} == {"True"}
    assert {row["not_characterized_at"] for row in refreshed_rows} == {""}


def test_legacy_result_crud_writes_run_level_audit(active_user) -> None:
    headers = _headers(active_user.email)
    run = _run(
        headers,
        code="CVD-2026-3401",
        started_at="2026-07-06T09:00:00",
        operator="Audit User",
        material="WS2",
    )
    sample = client.post(
        f"/api/v1/experiments/{run['id']}/samples",
        json={"role": "control"},
        headers=headers,
    ).json()
    record = client.post(
        f"/api/v1/experiments/{run['id']}/characterization-records",
        json={"sample_id": sample["id"], "method_instrument": "Raman"},
        headers=headers,
    )
    assert record.status_code == 201, record.text
    assert (
        client.patch(
            f"/api/v1/characterization-records/{record.json()['id']}",
            json={"test_conditions": "room temperature"},
            headers=headers,
        ).status_code
        == 200
    )
    product = client.post(
        f"/api/v1/samples/{sample['id']}/measured-products",
        json={
            "characterization_record_id": record.json()["id"],
            "observed_phenomena": ["无生长"],
        },
        headers=headers,
    )
    assert product.status_code == 201, product.text
    assert (
        client.patch(
            f"/api/v1/measured-products/{product.json()['id']}",
            json={"detected_phase_stacking": "none"},
            headers=headers,
        ).status_code
        == 200
    )
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

    timeline = client.get(f"/api/v1/experiments/{run['id']}/audit-events", headers=headers).json()[
        "items"
    ]
    result_actions = [
        item["action"]
        for item in timeline
        if item["action"] in {"create_result", "update_result", "delete_result"}
    ]
    assert result_actions == [
        "create_result",
        "update_result",
        "create_result",
        "update_result",
        "delete_result",
        "delete_result",
    ]
