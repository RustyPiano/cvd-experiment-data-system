"""生成对外标准产物（JSON Schema + 字段字典）到 docs/standard/generated/。

用法：
    cd backend && .venv/bin/python -m app.commands.generate_spec
    # 或指定输出目录
    .venv/bin/python -m app.commands.generate_spec --output-dir /tmp/spec

只读数据库（仅 SELECT），从当前 DATABASE_URL 指向的库读取 FieldDefinition 与受控词表。
"""

import argparse
from pathlib import Path

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.services.spec_export_service import SpecExportService

# backend/app/commands/generate_spec.py -> 仓库根 / docs / standard / generated
DEFAULT_OUTPUT_DIR = (
    Path(__file__).resolve().parents[3] / "docs" / "standard" / "generated"
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate the published CVD-2D standard artifacts."
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory to write the generated spec artifacts into.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    db: Session = SessionLocal()
    try:
        paths = SpecExportService(db).generate(args.output_dir)
    finally:
        db.close()

    for name, path in paths.items():
        print(f"{name}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
