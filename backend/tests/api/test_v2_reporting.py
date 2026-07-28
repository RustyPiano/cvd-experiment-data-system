import csv
import io
import json
import zipfile
from types import SimpleNamespace
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import event, select

from app.main import app
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.module_payload import ExperimentModulePayload
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.services.v2_reporting_service import V2ReportingService
from tests.helpers.v2_payloads import setup_payload

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
            "operator": "Active",
            "date_from": "2026-07-01",
            "date_to": "2026-07-05",
            "status": "draft",
        },
        headers=member_headers,
    )
    assert filtered.status_code == 200, filtered.text
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["operator"] == active_user.name

    visible_to_member = client.get(
        "/api/v1/experiments",
        params={"material_system": "Mo", "operator": "User"},
        headers=member_headers,
    )
    visible_to_admin = client.get(
        "/api/v1/experiments",
        params={"material_system": "Mo", "operator": "User"},
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
    db_session,
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

    # Simulate legacy rows that predate machine-code writes. Export must normalize
    # without mutating narrative text or requiring a data migration first.
    target_payload = db_session.scalar(
        select(ExperimentModulePayload).where(
            ExperimentModulePayload.experiment_run_id == UUID(run["id"]),
            ExperimentModulePayload.module_key == "target_product",
        )
    )
    target_payload.payload_json = {
        "chemical_formula": "MoS2",
        "structure_type": "掺杂",
        "components": [{"formula": "MoS2", "role": "基体"}],
    }
    record = db_session.get(
        CharacterizationRecord,
        UUID(result["characterization_record_id"]),
    )
    product = db_session.get(MeasuredProduct, UUID(result["id"]))
    file = db_session.get(FileAsset, UUID(upload.json()["id"]))
    record.method_instrument = "光镜"
    record.instrument_snapshot_json = {"method_instrument_snapshot": "光镜"}
    record.attrs = {"method": "光镜"}
    product.observed_phenomena = ["厚层区域"]
    product.attrs = {"observed_phenomena": ["厚层区域"]}
    file.method = "光镜"
    file.file_kind = "光镜"
    db_session.commit()

    exported_json = client.get(
        f"/api/v1/experiments/{run['id']}/export",
        headers=member_headers,
    )
    assert exported_json.status_code == 200, exported_json.text
    payload = json.loads(exported_json.content)
    assert payload["run"]["run_code"] == "CVD-2026-3201"
    assert payload["run"]["operator"] == active_user.name
    assert payload["samples"][0]["sample_code"] == sample["sample_code"]
    exported_result = payload["samples"][0]["results"][0]
    assert payload["modules"]["target_product"]["structure_type"] == "doped"
    assert payload["modules"]["target_product"]["components"][0]["role"] == "matrix"
    assert exported_result["record"]["method"] == "optical_microscopy"
    assert exported_result["record"]["instrument_snapshot"] == {
        "method_instrument_snapshot": "optical_microscopy"
    }
    assert exported_result["record"]["attrs"] == {"method": "optical_microscopy"}
    assert exported_result["record"]["files"][0]["filename"] == "拉曼.csv"
    assert exported_result["record"]["files"][0]["method"] == "optical_microscopy"
    assert exported_result["measurement"]["observed_phenomena"] == ["thick_layer_regions"]
    assert exported_result["measurement"]["attrs"] == {
        "observed_phenomena": ["thick_layer_regions"]
    }
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
        params={"operator": active_user.name},
        headers=member_headers,
    )
    assert exported_zip.status_code == 200, exported_zip.text
    with zipfile.ZipFile(io.BytesIO(exported_zip.content)) as archive:
        assert set(archive.namelist()) == {
            "runs.csv",
            "precursors.csv",
            "substrates.csv",
            "process_steps.csv",
            "gas_flow_shares.csv",
            "samples.csv",
            "characterization_results.csv",
            "files.csv",
            "module_details.csv",
            "field_dictionary.csv",
            "records.json",
            "cvd-2d-process-v2.schema.json",
            "cvd-2d-field-dictionary-v2.json",
            "schema_manifest.json",
        }
        runs = list(csv.DictReader(io.StringIO(archive.read("runs.csv").decode("utf-8-sig"))))
        results = list(
            csv.DictReader(
                io.StringIO(archive.read("characterization_results.csv").decode("utf-8-sig"))
            )
        )
        files = list(csv.DictReader(io.StringIO(archive.read("files.csv").decode("utf-8-sig"))))
    assert [row["run_code"] for row in runs] == ["CVD-2026-3201"]
    assert runs[0]["operator"] == active_user.name
    assert runs[0]["objective"].startswith("'")
    assert results[0]["sample_code"] == sample["sample_code"]
    assert results[0]["method"] == "optical_microscopy"
    assert results[0]["observed_phenomenon"] == "thick_layer_regions"
    assert not results[0]["observed_phenomenon"].startswith("[")
    nested_values = {
        (row["detail_scope"], row["detail_path"], row["detail_value"]) for row in results
    }
    assert (
        "instrument_snapshot",
        "method_instrument_snapshot",
        "optical_microscopy",
    ) in nested_values
    assert ("record_attrs", "method", "optical_microscopy") in nested_values
    assert (
        "measurement_attrs",
        "observed_phenomena[0]",
        "thick_layer_regions",
    ) in nested_values
    assert files[0]["result_code"] == results[0]["result_code"]
    assert files[0]["method"] == "optical_microscopy"
    assert files[0]["download_url"].endswith("/download")


def test_batch_export_uses_dedicated_sqlite_read_snapshot(
    active_user,
    db_session,
    monkeypatch,
) -> None:
    headers = _headers(active_user.email)
    _run(
        headers,
        code="CVD-2026-3251",
        started_at="2026-07-04T10:00:00",
        operator="Snapshot User",
        material="MoS2",
    )
    statements: list[str] = []

    def capture_statement(_connection, _cursor, statement, _parameters, _context, _many) -> None:
        statements.append(statement)

    def forbid_request_session_queries(*_args, **_kwargs):
        raise AssertionError("batch export queried through the request session")

    event.listen(db_session.bind, "before_cursor_execute", capture_statement)
    monkeypatch.setattr(db_session, "scalar", forbid_request_session_queries)
    monkeypatch.setattr(db_session, "scalars", forbid_request_session_queries)
    try:
        content, _ = V2ReportingService(db_session).export_runs_zip(active_user)
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture_statement)

    assert zipfile.is_zipfile(io.BytesIO(content))
    normalized = [" ".join(statement.upper().split()) for statement in statements]
    assert "PRAGMA QUERY_ONLY = ON" in normalized
    assert "BEGIN" in normalized


def test_single_run_export_uses_dedicated_sqlite_read_snapshot(
    active_user,
    db_session,
    monkeypatch,
) -> None:
    headers = _headers(active_user.email)
    run = _run(
        headers,
        code="CVD-2026-3253",
        started_at="2026-07-04T10:30:00",
        operator="Single Snapshot User",
        material="MoS2",
    )
    statements: list[str] = []

    def capture_statement(_connection, _cursor, statement, _parameters, _context, _many) -> None:
        statements.append(statement)

    def forbid_request_session_queries(*_args, **_kwargs):
        raise AssertionError("single export queried through the request session")

    event.listen(db_session.bind, "before_cursor_execute", capture_statement)
    monkeypatch.setattr(db_session, "scalar", forbid_request_session_queries)
    monkeypatch.setattr(db_session, "scalars", forbid_request_session_queries)
    try:
        content, filename = V2ReportingService(db_session).export_run_json(
            UUID(run["id"]),
            active_user,
        )
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture_statement)

    assert json.loads(content)["run"]["run_code"] == "CVD-2026-3253"
    assert filename == "CVD-2026-3253.json"
    normalized = [" ".join(statement.upper().split()) for statement in statements]
    assert "PRAGMA QUERY_ONLY = ON" in normalized
    assert "BEGIN" in normalized


def test_zip_records_json_preserves_null_and_empty_values_and_declares_authority(
    active_user,
) -> None:
    headers = _headers(active_user.email)
    run = _run(
        headers,
        code="CVD-2026-3252",
        started_at="2026-07-04T11:00:00",
        operator="Lossless Export User",
        material="MoS2",
    )
    sample = client.post(
        f"/api/v1/experiments/{run['id']}/samples",
        json={"role": "control"},
        headers=headers,
    ).json()
    record = client.post(
        f"/api/v1/experiments/{run['id']}/characterization-records",
        json={
            "sample_id": sample["id"],
            "method_instrument": "Raman",
            "raw_data": {},
            "attrs": {
                "empty_string": "",
                "empty_list": [],
                "empty_object": {},
                "null_value": None,
            },
        },
        headers=headers,
    )
    assert record.status_code == 201, record.text

    exported = client.get(
        "/api/v1/exports/runs",
        params={"query": "3252"},
        headers=headers,
    )
    assert exported.status_code == 200, exported.text
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        records = json.loads(archive.read("records.json"))
        manifest = json.loads(archive.read("schema_manifest.json"))

    exported_record = records["runs"][0]["samples"][0]["results"][0]["record"]
    assert exported_record["raw_data"] == {}
    assert exported_record["attrs"] == {
        "empty_string": "",
        "empty_list": [],
        "empty_object": {},
        "null_value": None,
    }
    assert manifest["reconstruction"]["authoritative_source"] == "records.json"
    assert manifest["reconstruction"]["csv_empty_cells_distinguish_null_and_empty"] is False


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
            "attrs": {"software": "LabSpec", "method": "光镜"},
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
    assert standalone_result["record"]["attrs"] == {
        "software": "LabSpec",
        "method": "optical_microscopy",
    }
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
    assert any(
        row["detail_scope"] == "record_attrs"
        and row["detail_path"] == "method"
        and row["detail_value"] == "optical_microscopy"
        for row in result_rows
    )
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
    admin_user,
    db_session,
) -> None:
    headers = _headers(active_user.email)
    admin_headers = _headers(admin_user.email)
    setup = client.post(
        "/api/v1/setups",
        json=setup_payload(
            setup_code="SETUP-EXPORT-1",
            setup_name="Export setup",
            field_devices=["light", "electric_field"],
        ),
        headers=admin_headers,
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
        json={
            "setup_id": setup.json()["id"],
            "version": 1,
            "tube_usage_history": {"reset_count": 0, "use_number_since_reset": 1},
        },
        headers=headers,
    )
    assert referenced.status_code == 200, referenced.text
    process = client.put(
        f"/api/v1/experiments/{run['id']}/modules/process_steps",
        json={
            "payload_json": {
                "items": [
                    {
                        "stage_type": "other",
                        "other_stage_name": "Temporary source move",
                        "notes": "Moved source by 5 mm",
                    }
                ]
            }
        },
        headers=headers,
    )
    assert process.status_code == 200, process.text
    process_payload = db_session.scalar(
        select(ExperimentModulePayload).where(
            ExperimentModulePayload.experiment_run_id == UUID(run["id"]),
            ExperimentModulePayload.module_key == "process_steps",
        )
    )
    process_payload.payload_json = {
        "items": [
            {
                "stage_type": "反应条件",
                "temperature_program": {
                    "zones": [
                        {
                            "zone_index": 1,
                            "points": [
                                {"elapsed_min": 0.0, "setpoint_C": 25.0},
                                {"elapsed_min": 30.0, "setpoint_C": 750.0},
                            ],
                        }
                    ]
                },
                "gas_feeds": [
                    {
                        "species": "H₂",
                        "measurement_source": "MFC",
                        "lot_ref": {
                            "entity_id": "00000000-0000-0000-0000-000000000001",
                            "version": 1,
                            "snapshot": {"batch_number": "H2-EXPORT"},
                        },
                        "intervals": [{"start_min": 0.0, "end_min": 30.0, "flow_sccm": 10.0}],
                    }
                ],
                "pressure_system": {
                    "value": 101325.0,
                    "option": "atmospheric_pressure",
                },
                "duration_cycles": {"duration_min": 30.0},
            }
        ]
    }
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
    assert "flow_reference_temperature_C" not in json_run["setup_reference"]
    assert "flow_reference_pressure_Pa" not in json_run["setup_reference"]
    assert json_run["setup_reference"]["snapshot"]["setup_code_snapshot"] == ("SETUP-EXPORT-1")
    json_step = exported_json.json()["modules"]["process_steps"]["items"][0]
    assert json_step["stage_type"] == "reaction_conditions"
    assert json_step["gas_feeds"][0]["species"] == "H2"
    assert json_step["gas_feeds"][0]["measurement_source"] == "mfc"

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
        gas_share_rows = list(
            csv.DictReader(io.StringIO(archive.read("gas_flow_shares.csv").decode("utf-8-sig")))
        )
    assert {row["setup_code"] for row in run_rows} == {"SETUP-EXPORT-1"}
    assert "setup_flow_reference_temperature_C" not in run_rows[0]
    assert "setup_flow_reference_pressure_Pa" not in run_rows[0]
    assert {row["result_missing_todo"] for row in run_rows} == {"False"}
    assert all(row["not_characterized_at"] for row in run_rows)
    assert {"light", "electric_field"} <= {row["setup_detail_value"] for row in run_rows}
    nested_gases = [row for row in process_rows if row["nested_field"] == "gas_feeds"]
    assert any(
        row["nested_path"] == "[0].species" and row["nested_value"] == "H2" for row in nested_gases
    )
    assert any(
        row["nested_path"] == "[0].intervals[0].flow_sccm" and row["nested_value"] == "10.0"
        for row in nested_gases
    )
    assert [
        {
            key: row[key]
            for key in (
                "run_code",
                "process_step_index",
                "interval_index",
                "gas",
                "flow_sccm",
                "total_flow_sccm",
                "flow_percent",
            )
        }
        for row in gas_share_rows
    ] == [
        {
            "run_code": "CVD-2026-3351",
            "process_step_index": "1",
            "interval_index": "1",
            "gas": "H2",
            "flow_sccm": "10.0",
            "total_flow_sccm": "10.0",
            "flow_percent": "100.0",
        }
    ]
    assert gas_share_rows[0]["relation_key"] == (f"{run['id']}:process_steps:1:1:1")

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


def test_zip_export_includes_reversible_remaining_modules_and_schema_metadata(
    active_user,
    db_session,
) -> None:
    headers = _headers(active_user.email)
    run = _run(
        headers,
        code="CVD-2026-3501",
        started_at="2026-07-06T10:30:00",
        operator="Export Contract",
        material="MoS2",
    )
    target = db_session.scalar(
        select(ExperimentModulePayload).where(
            ExperimentModulePayload.experiment_run_id == UUID(run["id"]),
            ExperimentModulePayload.module_key == "target_product",
        )
    )
    target.payload_json = {
        "chemical_formula": "MoS2",
        "structure_type": "doped",
        "components": [
            {
                "formula": "MoS2",
                "role": "matrix",
                "concentration_at_percent": 98.5,
            },
            {
                "formula": "Nb",
                "role": "dopant",
                "concentration_at_percent": 1.5,
            },
        ],
    }
    db_session.add(
        ExperimentModulePayload(
            experiment_run_id=UUID(run["id"]),
            module_key="process_events",
            schema_version="cvd_v2",
            payload_json={
                "items": [
                    {
                        "event_part": "gas_supply_interruption",
                        "occurred_at": "10:28",
                        "description_action": "Changed Ar cylinder",
                    }
                ]
            },
        )
    )
    db_session.commit()

    response = client.get(
        "/api/v1/exports/runs",
        params={"query": "3501"},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert {
            "runs.csv",
            "precursors.csv",
            "substrates.csv",
            "process_steps.csv",
            "gas_flow_shares.csv",
            "samples.csv",
            "characterization_results.csv",
            "files.csv",
            "module_details.csv",
            "field_dictionary.csv",
            "cvd-2d-process-v2.schema.json",
            "cvd-2d-field-dictionary-v2.json",
            "schema_manifest.json",
        } <= set(archive.namelist())
        details = list(
            csv.DictReader(io.StringIO(archive.read("module_details.csv").decode("utf-8-sig")))
        )
        dictionary = list(
            csv.DictReader(io.StringIO(archive.read("field_dictionary.csv").decode("utf-8-sig")))
        )
        manifest = json.loads(archive.read("schema_manifest.json"))
        schema = json.loads(archive.read("cvd-2d-process-v2.schema.json"))
        dictionary_json = json.loads(archive.read("cvd-2d-field-dictionary-v2.json"))

    target_rows = [row for row in details if row["module_key"] == "target_product"]
    assert {(row["field_key"], row["detail_path"], row["detail_value"]) for row in target_rows} >= {
        ("chemical_formula", "", "MoS2"),
        ("components", "[0].formula", "MoS2"),
        ("components", "[1].role", "dopant"),
    }
    event_rows = [row for row in details if row["module_key"] == "process_events"]
    assert {(row["item_index"], row["field_key"], row["detail_value"]) for row in event_rows} >= {
        ("1", "occurred_at", "10:28"),
        ("1", "description_action", "Changed Ar cylinder"),
    }
    gas_feeds = next(row for row in dictionary if row["key"] == "gas_feeds")
    assert gas_feeds["input"] == "逐气体供气数组"
    assert gas_feeds["meaning"]
    assert gas_feeds["example"]
    assert gas_feeds["schema_path"].endswith(".gas_feeds")
    assert schema["schema_version"] == "cvd_v2"
    assert dictionary_json["field_count"] == 146
    assert manifest["schema_version"] == "cvd_v2"
    assert manifest["standard_version"] == "2.0.0"
    assert manifest["module_details"]["path_notation"] == "JSONPath-like"
    assert manifest["derived_tables"]["gas_flow_shares.csv"]["source"].startswith("records.json")
    assert "cvd-2d-process-v2.schema.json" in manifest["artifacts"]


def test_export_fetches_visible_runs_in_one_stable_query(active_user, db_session) -> None:
    service = V2ReportingService(db_session)
    expected = [SimpleNamespace(id=index) for index in range(1001)]
    calls: list[int] = []

    def mutating_offset_pages(*, page_size: int, **_kwargs):
        calls.append(page_size)
        if page_size >= len(expected):
            return expected, len(expected)
        if len(calls) == 1:
            return expected[:page_size], len(expected)
        return [expected[page_size - 1]], len(expected)

    service.experiments.list_visible = mutating_offset_pages

    exported = service._visible_runs_for_export(active_user)

    assert [run.id for run in exported] == list(range(1001))
    assert len(calls) == 1
