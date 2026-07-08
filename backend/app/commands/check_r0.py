from __future__ import annotations

import argparse
import json
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.session import SessionLocal
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check cvd_v2 R0 compliance.")
    parser.add_argument("--run-id", help="Experiment run UUID to check.")
    parser.add_argument("--run-code", help="Experiment run code to check.")
    parser.add_argument(
        "--format",
        choices=["text", "json", "both"],
        default="both",
        help="Output format.",
    )
    return parser


def build_r0_reports(
    db: Session,
    *,
    run_id: UUID | None = None,
    run_code: str | None = None,
) -> list[dict[str, Any]]:
    doc = load_field_source()
    statement = (
        select(ExperimentRun)
        .options(selectinload(ExperimentRun.module_payloads), selectinload(ExperimentRun.samples))
        .where(ExperimentRun.schema_version == SCHEMA_VERSION)
        .order_by(ExperimentRun.run_code.asc())
    )
    if run_id is not None:
        statement = statement.where(ExperimentRun.id == run_id)
    if run_code is not None:
        statement = statement.where(ExperimentRun.run_code == run_code)
    return [_build_run_report(db, run, doc) for run in db.scalars(statement).all()]


def render_text_report(reports: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for report in reports:
        lines.append(f"{report['run_code']} [{report['status']}]")
        if report["status"] == "excluded_pvd":
            lines.append("  PVD run excluded from v2.0 R0 compliance.")
            continue
        for item in report["items"]:
            mark = "-" if not item["applicable"] else ("✓" if item["passed"] else "✗")
            lines.append(f"  {mark} {item['module_key']}.{item['key']}: {item['label']}")
    return "\n".join(lines)


def _build_run_report(db: Session, run: ExperimentRun, doc: dict[str, Any]) -> dict[str, Any]:
    payloads = {item.module_key: item.payload_json for item in run.module_payloads}
    basic_info = payloads.get("basic_info") or {}
    if basic_info.get("synthesis_method") in PVD_METHODS:
        return {
            "run_id": str(run.id),
            "run_code": run.run_code,
            "schema_version": SCHEMA_VERSION,
            "status": "excluded_pvd",
            "items": [],
        }

    items = [
        _check_r0_field(db, run, payloads, field, doc)
        for field in experiment_fields(doc)
        if field.get("r0")
    ]
    applicable = [item for item in items if item["applicable"]]
    status = "compliant" if all(item["passed"] for item in applicable) else "non_compliant"
    return {
        "run_id": str(run.id),
        "run_code": run.run_code,
        "schema_version": SCHEMA_VERSION,
        "status": status,
        "items": items,
    }


def _check_r0_field(
    db: Session,
    run: ExperimentRun,
    payloads: dict[str, dict[str, Any]],
    field: dict[str, Any],
    doc: dict[str, Any],
) -> dict[str, Any]:
    module_key = module_key_for_field(field, doc)
    records = _records_for_module(run, payloads, module_key)
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

    passed = _field_present(field["key"], applicable_records)
    if field["key"] == "setup_ref":
        passed = bool(run.setup_ref or passed)
    if field["key"] == "zone_count":
        passed = bool((run.setup_ref_snapshot_json or {}).get("zone_count_snapshot") or passed)
    if field["key"] == "orientation":
        passed = bool((run.setup_ref_snapshot_json or {}).get("orientation_snapshot") or passed)

    return {
        "module_key": module_key,
        "key": field["key"],
        "label": field["label"],
        "r0": True,
        "condition": condition,
        "applicable": applicable,
        "passed": passed,
    }


def _records_for_module(
    run: ExperimentRun,
    payloads: dict[str, dict[str, Any]],
    module_key: str,
) -> list[dict[str, Any]]:
    if module_key == "measured_products":
        return []
    payload = payloads.get(module_key) or {}
    items = payload.get("items")
    if isinstance(items, list):
        return [item for item in items if isinstance(item, dict)]
    if module_key == "basic_info":
        return [{**payload, "run_code": run.run_code}]
    return [payload]


def _field_present(key: str, records: list[dict[str, Any]]) -> bool:
    return any(not missing(record.get(key)) for record in records)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    db = SessionLocal()
    try:
        reports = build_r0_reports(
            db,
            run_id=UUID(args.run_id) if args.run_id else None,
            run_code=args.run_code,
        )
    finally:
        db.close()

    if args.format in {"text", "both"}:
        print(render_text_report(reports))
    if args.format == "both":
        print("\nJSON:")
    if args.format in {"json", "both"}:
        print(json.dumps(reports, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
