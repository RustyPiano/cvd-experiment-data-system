from __future__ import annotations

from typing import Any

from app.models.experiment import ExperimentRun
from app.services.v2_field_source import (
    PVD_METHODS,
    SCHEMA_VERSION,
    condition_local_key,
    condition_matches,
    experiment_fields,
    load_field_source,
    missing,
    module_key_for_field,
)


def build_run_report(run: ExperimentRun) -> dict[str, Any]:
    doc = load_field_source()
    payloads = {item.module_key: item.payload_json for item in run.module_payloads}
    if (payloads.get("basic_info") or {}).get("synthesis_method") in PVD_METHODS:
        return _report(run, "excluded_pvd", [])
    items = [
        _check_field(run, payloads, field, doc)
        for field in experiment_fields(doc)
        if field.get("r0")
    ]
    applicable = [item for item in items if item["applicable"]]
    return _report(
        run, "compliant" if all(item["passed"] for item in applicable) else "non_compliant", items
    )


def missing_r0_fields(run: ExperimentRun) -> list[dict[str, str]]:
    return [
        {"key": item["key"], "label": item["label"], "module": item["module_key"]}
        for item in build_run_report(run)["items"]
        if item["applicable"] and not item["passed"]
    ]


def _report(run: ExperimentRun, status: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "run_id": str(run.id),
        "run_code": run.run_code,
        "schema_version": SCHEMA_VERSION,
        "status": status,
        "items": items,
    }


def _check_field(
    run: ExperimentRun,
    payloads: dict[str, dict[str, Any]],
    field: dict[str, Any],
    doc: dict[str, Any],
) -> dict[str, Any]:
    module_key = module_key_for_field(field, doc)
    records = _records(run, payloads, module_key)
    condition = field["requirement"].get("condition")
    local_key = condition_local_key(field, condition, doc)
    applicable_records = records
    if condition and local_key is not None:
        applicable_records = [
            record for record in records if condition_matches(condition, record.get(local_key))
        ]
        applicable = bool(applicable_records)
    else:
        applicable = True
    passed = any(not missing(record.get(field["key"])) for record in applicable_records)
    snapshots = run.setup_ref_snapshot_json or {}
    if field["key"] == "setup_ref":
        passed = bool(run.setup_ref or passed)
    elif field["key"] == "zone_count":
        passed = bool(snapshots.get("zone_count_snapshot") or passed)
    elif field["key"] == "orientation":
        passed = bool(snapshots.get("orientation_snapshot") or passed)
    return {
        "module_key": module_key,
        "key": field["key"],
        "label": field["label"],
        "r0": True,
        "condition": condition,
        "applicable": applicable,
        "passed": passed,
    }


def _records(
    run: ExperimentRun, payloads: dict[str, dict[str, Any]], module_key: str
) -> list[dict[str, Any]]:
    payload = payloads.get(module_key) or {}
    if isinstance(payload.get("items"), list):
        return [item for item in payload["items"] if isinstance(item, dict)]
    return [{**payload, "run_code": run.run_code}] if module_key == "basic_info" else [payload]
