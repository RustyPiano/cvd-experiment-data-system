from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any
from uuid import UUID

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.session import SessionLocal
from app.models.experiment import ExperimentRun
from app.models.module_payload import (
    ExperimentModulePayload,
    ExperimentModulePayloadV1Archive,
)
from app.services.v2_field_source import SCHEMA_VERSION
from app.services.v2_field_source import missing as _missing

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MAPPING_PATH = REPO_ROOT / "docs" / "standard" / "v1-to-v2-mapping.yaml"
V1_DICTIONARY_PATH = REPO_ROOT / "docs" / "archive" / "generated" / "cvd-2d-field-dictionary.json"
V1_SCHEMA_VERSION = "cvd_v1"

STATUS_MAPPED = "已映射"
STATUS_MANUAL = "需人工映射"
STATUS_PENDING = "待用户确认"
STATUS_DROPPED = "丢弃"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Dry-run, execute, or reconcile cvd_v1 -> cvd_v2 payload migration."
    )
    parser.add_argument("--run-id", help="Experiment run UUID.")
    parser.add_argument("--run-code", help="Experiment run code.")
    parser.add_argument("--mapping", default=str(DEFAULT_MAPPING_PATH), help="Mapping YAML path.")
    parser.add_argument("--execute", action="store_true", help="Write cvd_v2 payloads.")
    parser.add_argument(
        "--i-have-backup",
        action="store_true",
        help="Required with --execute after verified DB and file backups.",
    )
    parser.add_argument(
        "--reconcile",
        action="store_true",
        help="Compare archived v1 values with migrated cvd_v2 values.",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json", "both"],
        default="text",
        help="Output format.",
    )
    return parser


def load_mapping(path: str | Path = DEFAULT_MAPPING_PATH) -> dict[str, Any]:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def v1_field_paths() -> set[str]:
    doc = json.loads(V1_DICTIONARY_PATH.read_text(encoding="utf-8"))
    return {
        f"{field['module_key']}.{field['field_key']}"
        for module in doc["modules"]
        for field in module["fields"]
    }


def build_migration_reports(
    db: Session,
    *,
    run_id: UUID | None = None,
    run_code: str | None = None,
    mapping_path: str | Path = DEFAULT_MAPPING_PATH,
) -> list[dict[str, Any]]:
    mapping = load_mapping(mapping_path)
    entries = mapping["mappings"]
    missing_entries = sorted(v1_field_paths() - {entry["source_path"] for entry in entries})
    return [
        _build_run_report(run, entries, missing_entries)
        for run in _select_v1_runs(db, run_id=run_id, run_code=run_code)
    ]


def migrate_runs(
    db: Session,
    *,
    run_id: UUID | None = None,
    run_code: str | None = None,
    mapping_path: str | Path = DEFAULT_MAPPING_PATH,
    execute: bool = False,
) -> list[dict[str, Any]]:
    reports = build_migration_reports(
        db,
        run_id=run_id,
        run_code=run_code,
        mapping_path=mapping_path,
    )
    if not execute:
        return reports
    if any(report["blocker"] for report in reports):
        raise RuntimeError("Refusing to execute while unmapped v1 fields remain.")

    mapping = load_mapping(mapping_path)
    entries = mapping["mappings"]
    try:
        for run in _select_v1_runs(db, run_id=run_id, run_code=run_code):
            _archive_v1_payloads(db, run)
            _write_v2_payloads(db, run, entries)
            run.schema_version = SCHEMA_VERSION
            run.experiment_type = SCHEMA_VERSION
        db.commit()
    except Exception:
        db.rollback()
        raise
    return reports


def build_reconciliation_reports(
    db: Session,
    *,
    run_id: UUID | None = None,
    run_code: str | None = None,
    mapping_path: str | Path = DEFAULT_MAPPING_PATH,
) -> list[dict[str, Any]]:
    entries = [entry for entry in load_mapping(mapping_path)["mappings"] if entry.get("compare")]
    reports: list[dict[str, Any]] = []
    for run in _select_v2_runs(db, run_id=run_id, run_code=run_code):
        archived = _archive_payload_map(db, run.id)
        v2_payloads = {
            item.module_key: item.payload_json
            for item in run.module_payloads
            if item.schema_version == SCHEMA_VERSION
        }
        matched: list[dict[str, Any]] = []
        differences: list[dict[str, Any]] = []
        for entry in entries:
            source_payload = archived.get(entry["source_module"]) or {}
            expected = _get_payload_value(source_payload, entry["source_payload_path"])
            actual = _get_target_value(run, v2_payloads, entry)
            item = {
                "source_path": entry["source_path"],
                "target": _target_name(entry["target"]),
                "expected": expected,
                "actual": actual,
            }
            if expected == actual:
                matched.append(item)
            else:
                differences.append(item)
        reports.append(
            {
                "run_id": str(run.id),
                "run_code": run.run_code,
                "schema_version": run.schema_version,
                "matched": matched,
                "differences": differences,
                "difference_count": len(differences),
            }
        )
    return reports


def render_text_report(reports: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for report in reports:
        if "counts" not in report:
            lines.append(
                f"{report['run_code']} reconcile: "
                f"{len(report['matched'])} matched, {report['difference_count']} differences"
            )
            for diff in report["differences"]:
                lines.append(
                    f"  x {diff['source_path']} -> {diff['target']}: "
                    f"{diff['expected']!r} != {diff['actual']!r}"
                )
            continue
        counts = report["counts"]
        blocker = " BLOCKER" if report["blocker"] else ""
        lines.append(f"{report['run_code']} [{report['schema_version'] or 'cvd_v1'}]{blocker}")
        lines.append(
            "  counts: "
            f"mapped={counts['mapped']} manual={counts['manual']} "
            f"pending_confirmation={counts['pending_confirmation']} "
            f"dropped={counts['dropped']} unmapped={counts['unmapped']}"
        )
        for item in report["unmapped_fields"]:
            lines.append(f"  x unmapped: {item}")
    return "\n".join(lines)


def render_json_report(reports: list[dict[str, Any]]) -> str:
    return json.dumps(reports, ensure_ascii=False, indent=2, default=str)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.execute != args.i_have_backup:
        print(
            "Refusing to run: execution mode requires both --execute and --i-have-backup.",
            file=sys.stderr,
        )
        return 2

    db = SessionLocal()
    try:
        run_id = UUID(args.run_id) if args.run_id else None
        if args.reconcile:
            reports = build_reconciliation_reports(
                db,
                run_id=run_id,
                run_code=args.run_code,
                mapping_path=args.mapping,
            )
        else:
            reports = migrate_runs(
                db,
                run_id=run_id,
                run_code=args.run_code,
                mapping_path=args.mapping,
                execute=args.execute,
            )
    finally:
        db.close()

    if args.format in {"text", "both"}:
        print(render_text_report(reports))
    if args.format == "both":
        print("\nJSON:")
    if args.format in {"json", "both"}:
        print(render_json_report(reports))
    return 1 if any(report.get("blocker") for report in reports) else 0


def _select_v1_runs(
    db: Session,
    *,
    run_id: UUID | None = None,
    run_code: str | None = None,
) -> list[ExperimentRun]:
    statement = (
        select(ExperimentRun)
        .options(selectinload(ExperimentRun.module_payloads))
        .where(ExperimentRun.schema_version.is_distinct_from(SCHEMA_VERSION))
        .order_by(ExperimentRun.run_code.asc())
    )
    if run_id is not None:
        statement = statement.where(ExperimentRun.id == run_id)
    if run_code is not None:
        statement = statement.where(ExperimentRun.run_code == run_code)
    return list(db.scalars(statement).all())


def _select_v2_runs(
    db: Session,
    *,
    run_id: UUID | None = None,
    run_code: str | None = None,
) -> list[ExperimentRun]:
    statement = (
        select(ExperimentRun)
        .options(selectinload(ExperimentRun.module_payloads))
        .where(ExperimentRun.schema_version == SCHEMA_VERSION)
        .order_by(ExperimentRun.run_code.asc())
    )
    if run_id is not None:
        statement = statement.where(ExperimentRun.id == run_id)
    if run_code is not None:
        statement = statement.where(ExperimentRun.run_code == run_code)
    return list(db.scalars(statement).all())


def _build_run_report(
    run: ExperimentRun,
    entries: list[dict[str, Any]],
    missing_entries: list[str],
) -> dict[str, Any]:
    payloads = {
        item.module_key: item.payload_json
        for item in run.module_payloads
        if item.schema_version != SCHEMA_VERSION
    }
    fields: list[dict[str, Any]] = []
    counts = {
        "mapped": 0,
        "manual": 0,
        "pending_confirmation": 0,
        "dropped": 0,
        "unmapped": len(missing_entries),
    }
    for entry in entries:
        status_value = entry["status"]
        if status_value == STATUS_MAPPED:
            counts["mapped"] += 1
        elif status_value == STATUS_MANUAL:
            counts["manual"] += 1
        elif status_value == STATUS_PENDING:
            counts["pending_confirmation"] += 1
        elif status_value == STATUS_DROPPED:
            counts["dropped"] += 1
        fields.append(
            {
                "source_path": entry["source_path"],
                "source_label": entry.get("source_label"),
                "target": entry.get("target"),
                "status": status_value,
                "value_present": not _missing(
                    _get_payload_value(
                        payloads.get(entry["source_module"]) or {},
                        entry["source_payload_path"],
                    )
                ),
            }
        )
    return {
        "run_id": str(run.id),
        "run_code": run.run_code,
        "schema_version": run.schema_version or V1_SCHEMA_VERSION,
        "counts": counts,
        "blocker": counts["unmapped"] > 0,
        "fields": fields,
        "unmapped_fields": missing_entries,
    }


def _archive_v1_payloads(db: Session, run: ExperimentRun) -> None:
    existing = {
        source_payload_id
        for source_payload_id in db.scalars(
            select(ExperimentModulePayloadV1Archive.source_payload_id).where(
                ExperimentModulePayloadV1Archive.experiment_run_id == run.id
            )
        )
    }
    for payload in run.module_payloads:
        if payload.schema_version == SCHEMA_VERSION or payload.id in existing:
            continue
        db.add(
            ExperimentModulePayloadV1Archive(
                source_payload_id=payload.id,
                experiment_run_id=payload.experiment_run_id,
                module_key=payload.module_key,
                schema_version=payload.schema_version,
                payload_json=deepcopy(payload.payload_json),
                note=payload.note,
                source_created_at=payload.created_at,
                source_updated_at=payload.updated_at,
            )
        )
    db.flush()


def _write_v2_payloads(
    db: Session,
    run: ExperimentRun,
    entries: list[dict[str, Any]],
) -> None:
    """Materialize the cvd_v2 module payloads for a run.

    IMPORTANT: only status=已映射 entries whose target.kind == "module_payload" are
    written here. entity_field / table_field / run_field targets are silently skipped
    even though they count as "mapped" in the migration report (see _build_run_report).
    So report `mapped` OVERSTATES what --execute actually writes; run_field schema tags
    are set separately in migrate_runs, and entity_field/table_field targets need the
    manual P5 review before a real --execute (see v1-to-v2-mapping.yaml header).
    """
    source_payloads = {
        payload.module_key: deepcopy(payload.payload_json)
        for payload in run.module_payloads
        if payload.schema_version != SCHEMA_VERSION
    }
    target_payloads: dict[str, dict[str, Any]] = {
        "basic_info": {"run_code": run.run_code},
    }
    for entry in entries:
        if entry["status"] != STATUS_MAPPED:
            continue
        target = entry.get("target")
        # Skips non-module_payload targets — see docstring: these still counted as mapped.
        if not isinstance(target, dict) or target.get("kind") != "module_payload":
            continue
        value = _get_payload_value(
            source_payloads.get(entry["source_module"]) or {},
            entry["source_payload_path"],
        )
        _assign_module_value(target_payloads, target, entry, value)

    for module_key, payload_json in target_payloads.items():
        existing = _module_for_run(run, module_key)
        payload = existing or ExperimentModulePayload(
            experiment_run_id=run.id,
            module_key=module_key,
        )
        payload.schema_version = SCHEMA_VERSION
        payload.payload_json = payload_json
        db.add(payload)
    db.flush()


def _module_for_run(run: ExperimentRun, module_key: str) -> ExperimentModulePayload | None:
    return next((item for item in run.module_payloads if item.module_key == module_key), None)


def _assign_module_value(
    target_payloads: dict[str, dict[str, Any]],
    target: dict[str, Any],
    entry: dict[str, Any],
    value: Any,
) -> None:
    if _missing(value):
        return
    module_key = target["module_key"]
    payload = target_payloads.setdefault(module_key, {})
    path = target.get("path") or target["key"]
    transform = entry.get("transform")

    # Special case: a scalar v1 value mapped to the process_events items[] array is
    # wrapped into a single {description_action: value} item. The only path-suffix rule.
    if path.endswith("[].description_action") and not isinstance(value, list):
        payload.setdefault("items", []).append({"description_action": value})
        return
    if "[]" not in path:
        _merge_or_set(payload, path, entry["source_field"], value, transform)
        return

    array_name, child_path = path.split("[].", 1)
    target_items = payload.setdefault(array_name, [])
    values = value if isinstance(value, list) else [value]
    for index, item_value in enumerate(values):
        if _missing(item_value):
            continue
        while len(target_items) <= index:
            target_items.append({})
        _merge_or_set(target_items[index], child_path, entry["source_field"], item_value, transform)


def _merge_or_set(
    payload: dict[str, Any],
    path: str,
    source_field: str,
    value: Any,
    transform: str | None,
) -> None:
    # Only "merge_into_*" transforms carry machine semantics (nest source_field under a
    # dict at `path`). Every other transform name is descriptive only and falls through
    # to plain copy/set below — see v1-to-v2-mapping.yaml header.
    if transform and transform.startswith("merge_into_"):
        existing = _get_nested(payload, path)
        if not isinstance(existing, dict):
            existing = {}
            _set_nested(payload, path, existing)
        existing[source_field] = value
        return
    existing = _get_nested(payload, path)
    if _missing(existing):
        _set_nested(payload, path, value)
    elif existing != value:
        merged = [*existing, value] if isinstance(existing, list) else [existing, value]
        _set_nested(payload, path, merged)


def _archive_payload_map(db: Session, run_id: UUID) -> dict[str, dict[str, Any]]:
    rows = db.scalars(
        select(ExperimentModulePayloadV1Archive).where(
            ExperimentModulePayloadV1Archive.experiment_run_id == run_id
        )
    ).all()
    return {row.module_key: row.payload_json for row in rows}


def _get_target_value(
    run: ExperimentRun,
    v2_payloads: dict[str, dict[str, Any]],
    entry: dict[str, Any],
) -> Any:
    target = entry["target"]
    if target["kind"] == "module_payload":
        return _get_payload_value(v2_payloads.get(target["module_key"]) or {}, target["path"])
    if target["kind"] == "run_field":
        return getattr(run, target["key"])
    return None


def _target_name(target: dict[str, Any]) -> str:
    if target.get("kind") == "module_payload":
        return f"{target['module_key']}.{target['key']}"
    if target.get("kind") in {"run_field", "table_field"}:
        return f"{target['table']}.{target['key']}"
    if target.get("kind") == "entity_field":
        return f"{target['entity']}.{target['key']}"
    return target.get("kind", "unknown")


def _get_payload_value(payload: dict[str, Any], path: str) -> Any:
    if "[]" not in path:
        return _get_nested(payload, path)
    array_path, child_path = path.split("[]", 1)
    items = _get_nested(payload, array_path.rstrip("."))
    if not isinstance(items, list):
        return []
    child_path = child_path.lstrip(".")
    if not child_path:
        return items
    return [_get_nested(item, child_path) for item in items if isinstance(item, dict)]


def _get_nested(payload: dict[str, Any], path: str) -> Any:
    current: Any = payload
    for part in path.split("."):
        if not part:
            continue
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _set_nested(payload: dict[str, Any], path: str, value: Any) -> None:
    current = payload
    parts = [part for part in path.split(".") if part]
    for part in parts[:-1]:
        next_value = current.get(part)
        if not isinstance(next_value, dict):
            next_value = {}
            current[part] = next_value
        current = next_value
    current[parts[-1]] = value


if __name__ == "__main__":
    raise SystemExit(main())
