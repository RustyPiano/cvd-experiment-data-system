from __future__ import annotations

import argparse
import json
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.session import SessionLocal
from app.models.experiment import ExperimentRun
from app.services.v2_field_source import SCHEMA_VERSION
from app.services.v2_r0_service import build_run_report


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
    return [build_run_report(run) for run in db.scalars(statement).all()]


def render_text_report(reports: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for report in reports:
        lines.append(f"{report['run_code']} [{report['status']}]")
        for item in report["items"]:
            mark = "-" if not item["applicable"] else ("✓" if item["passed"] else "✗")
            lines.append(f"  {mark} {item['module_key']}.{item['key']}: {item['label']}")
    return "\n".join(lines)


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
