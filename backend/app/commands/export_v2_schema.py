from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from app.schemas.generated.v2_module_payload import (
    V2_MODULE_PAYLOAD_MODELS,
    V2_MODULE_PAYLOAD_SCHEMA_VERSION,
)
from app.schemas.v2 import MeasuredProductMetrics, V2ResultWrite
from app.services.v2_field_source import (
    DEFAULT_FIELD_SOURCE,
    SCHEMA_VERSION,
    canonical_option_value,
    entity_fields,
    experiment_fields,
    load_field_source,
    module_key_for_field,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "docs" / "standard" / "generated"
STANDARD_ID = "cvd-2d-process"
STANDARD_VERSION = "2.0.0"
JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"
SCHEMA_BASE_URI = f"https://standard.cvd-2d.org/{STANDARD_VERSION}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export cvd_v2 JSON Schema artifacts.")
    parser.add_argument("--field-source", default=str(DEFAULT_FIELD_SOURCE))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    return parser


def export_v2_schema(
    *,
    field_source: str | Path = DEFAULT_FIELD_SOURCE,
    output_dir: str | Path | None = DEFAULT_OUTPUT_DIR,
) -> dict[str, Any]:
    doc = load_field_source(str(field_source))
    schema = build_v2_json_schema()
    field_dictionary = build_v2_field_dictionary(doc)

    result: dict[str, Any] = {
        "json_schema_doc": schema,
        "field_dictionary_doc": field_dictionary,
    }
    if output_dir is None:
        return result

    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    schema_path = directory / "cvd-2d-process-v2.schema.json"
    dictionary_path = directory / "cvd-2d-field-dictionary-v2.json"
    schema_path.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    dictionary_path.write_text(
        json.dumps(field_dictionary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    result.update({"json_schema": str(schema_path), "field_dictionary_json": str(dictionary_path)})
    return result


def build_v2_json_schema() -> dict[str, Any]:
    modules: dict[str, Any] = {}
    for module_key, model in V2_MODULE_PAYLOAD_MODELS.items():
        module_schema = model.model_json_schema()
        module_schema["$id"] = f"{SCHEMA_BASE_URI}/{module_key}.schema.json"
        modules[module_key] = module_schema
    result_models = {
        "unified_result_write": V2ResultWrite.model_json_schema(),
        "measured_product_metrics": MeasuredProductMetrics.model_json_schema(),
    }
    return {
        "$schema": JSON_SCHEMA_DIALECT,
        "standard_id": STANDARD_ID,
        "title": "CVD-2D 工艺数据标准 v2 / CVD-2D Process Data Standard v2",
        "version": STANDARD_VERSION,
        "schema_version": SCHEMA_VERSION,
        "module_payload_schema_version": V2_MODULE_PAYLOAD_SCHEMA_VERSION,
        "modules": modules,
        "result_models": result_models,
    }


def build_v2_field_dictionary(doc: dict[str, Any]) -> dict[str, Any]:
    rows = [
        _field_dictionary_row(doc, "experiment_record", field) for field in experiment_fields(doc)
    ]
    rows.extend(_field_dictionary_row(doc, "entity", field) for field in entity_fields(doc))
    return {
        "standard_id": STANDARD_ID,
        "version": STANDARD_VERSION,
        "schema_version": SCHEMA_VERSION,
        "fields": rows,
        "field_count": len(rows),
    }


def _field_dictionary_row(
    doc: dict[str, Any],
    source_part: str,
    field: dict[str, Any],
) -> dict[str, Any]:
    requirement = field["requirement"]
    condition = requirement.get("condition")
    if condition is not None:
        condition = {
            **condition,
            "value": canonical_option_value(condition.get("value"), doc),
        }
    return {
        "source_part": source_part,
        "module": field["module"],
        "module_key": module_key_for_field(field, doc),
        "key": field["key"],
        "label": field["label"],
        "label_en": field["label_en"],
        "r0": bool(field.get("r0")),
        "condition": condition,
        "requirement": requirement["level"],
        "validation": field.get("validation"),
        "unit": None if field.get("unit") == "—" else field.get("unit"),
        "options": None if field.get("options") == "—" else field.get("options"),
    }


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    paths = export_v2_schema(field_source=args.field_source, output_dir=args.output_dir)
    print(paths["json_schema"])
    print(paths["field_dictionary_json"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
