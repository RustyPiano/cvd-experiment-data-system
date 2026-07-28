from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from app.schemas.generated.v2_module_payload import (
    V2_ENTITY_PAYLOAD_MODELS,
    V2_MODULE_PAYLOAD_MODELS,
    V2_MODULE_PAYLOAD_SCHEMA_VERSION,
)
from app.schemas.scientific import (
    DatasetQuery,
    MeasurementBundleCreate,
    ProcessTimelinePayload,
    ScientificBasicInfo,
    ScientificProcessEventsPayload,
    SourceLoadsPayload,
    TargetSpecPayload,
    TransformationRunCreate,
)
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
JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"


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
    schema = build_v2_json_schema(doc)
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


def build_v2_json_schema(doc: dict[str, Any] | None = None) -> dict[str, Any]:
    source = doc or load_field_source()
    release_version = str(source["meta"]["version"])
    schema_base_uri = f"https://standard.cvd-2d.org/{release_version}"
    released_module_models = {
        **V2_MODULE_PAYLOAD_MODELS,
        "basic_info": ScientificBasicInfo,
        "target_product": TargetSpecPayload,
        "precursors": SourceLoadsPayload,
        "process_steps": ProcessTimelinePayload,
        "process_events": ScientificProcessEventsPayload,
    }
    modules: dict[str, Any] = {}
    for module_key, model in released_module_models.items():
        module_schema = model.model_json_schema()
        module_schema["$id"] = f"{schema_base_uri}/{module_key}.schema.json"
        modules[module_key] = module_schema
    result_models = {
        "measurement_bundle": MeasurementBundleCreate.model_json_schema(),
        "transformation": TransformationRunCreate.model_json_schema(),
        "dataset_query": DatasetQuery.model_json_schema(),
    }
    entity_models = {
        kind: model.model_json_schema() for kind, model in V2_ENTITY_PAYLOAD_MODELS.items()
    }
    return {
        "$schema": JSON_SCHEMA_DIALECT,
        "standard_id": STANDARD_ID,
        "title": "CVD-2D 科学数据契约 / CVD-2D Scientific Data Contract",
        "version": release_version,
        "status": source["meta"]["status"],
        "schema_version": SCHEMA_VERSION,
        "module_payload_schema_version": V2_MODULE_PAYLOAD_SCHEMA_VERSION,
        "scientific_contract": source["scientific_contract"],
        "modules": modules,
        "entities": entity_models,
        "result_models": result_models,
    }


def build_v2_field_dictionary(doc: dict[str, Any]) -> dict[str, Any]:
    rows = [
        _field_dictionary_row(doc, "experiment_record", field)
        for field in experiment_fields(doc)
        if field["requirement"]["level"] != "none"
    ]
    rows.extend(_field_dictionary_row(doc, "entity", field) for field in entity_fields(doc))
    return {
        "standard_id": STANDARD_ID,
        "version": doc["meta"]["version"],
        "status": doc["meta"]["status"],
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
    module_key = module_key_for_field(field, doc)
    condition = requirement.get("condition")
    if condition is not None:
        condition = {
            **condition,
            "value": canonical_option_value(condition.get("value"), doc),
        }
    return {
        "source_part": source_part,
        "module": field["module"],
        "module_key": module_key,
        "key": field["key"],
        "label": field["label"],
        "label_en": field["label_en"],
        "meaning": field.get("meaning"),
        "input": field.get("input"),
        "example": field.get("example"),
        "help": field.get("help"),
        "help_en": field.get("help_en"),
        "machine_type": _field_machine_type(source_part, module_key, field["key"]),
        "schema_path": _field_schema_path(source_part, module_key, field["key"]),
        "r0": bool(field.get("r0")),
        "condition": condition,
        "requirement": requirement["level"],
        "otherwise": requirement.get("otherwise"),
        "validation": field.get("validation"),
        "unit": None if field.get("unit") == "—" else field.get("unit"),
        "options": None if field.get("options") == "—" else field.get("options"),
    }


def _field_schema_path(source_part: str, module_key: str, key: str) -> str:
    if source_part == "entity":
        return f"$.entities.{module_key}.properties.{key}"
    if module_key in {"characterization", "measured_products"}:
        return f"$.result_models.unified_result_write.properties.{key}"
    if module_key in {"precursors", "substrates", "process_steps", "process_events"}:
        return f"$.modules.{module_key}.properties.items.items.properties.{key}"
    return f"$.modules.{module_key}.properties.{key}"


def _field_machine_type(source_part: str, module_key: str, key: str) -> str:
    model = (
        V2_ENTITY_PAYLOAD_MODELS.get(module_key)
        if source_part == "entity"
        else V2_MODULE_PAYLOAD_MODELS.get(module_key)
    )
    if model is None:
        return "file" if key == "raw_data" else "unknown"
    schema = model.model_json_schema()
    containers: list[dict[str, Any]] = [schema]
    items = schema.get("properties", {}).get("items")
    if items is not None:
        containers = _schema_variants(items.get("items", {}), schema)
    types = {
        item_type
        for container in containers
        for item_type in _schema_types(
            container.get("properties", {}).get(key, {}),
            schema,
        )
        if item_type != "null"
    }
    return " | ".join(sorted(types)) or ("file" if key == "raw_data" else "unknown")


def _schema_variants(node: dict[str, Any], root: dict[str, Any]) -> list[dict[str, Any]]:
    node = _resolve_schema_ref(node, root)
    variants = node.get("oneOf") or node.get("anyOf")
    if variants:
        return [resolved for variant in variants for resolved in _schema_variants(variant, root)]
    return [node]


def _schema_types(node: dict[str, Any], root: dict[str, Any]) -> set[str]:
    node = _resolve_schema_ref(node, root)
    result: set[str] = set()
    raw_type = node.get("type")
    if isinstance(raw_type, str):
        result.add(raw_type)
    elif isinstance(raw_type, list):
        result.update(item for item in raw_type if isinstance(item, str))
    for variant in [*(node.get("oneOf") or []), *(node.get("anyOf") or [])]:
        result.update(_schema_types(variant, root))
    return result


def _resolve_schema_ref(node: dict[str, Any], root: dict[str, Any]) -> dict[str, Any]:
    ref = node.get("$ref")
    if not isinstance(ref, str) or not ref.startswith("#/"):
        return node
    resolved: Any = root
    for token in ref[2:].split("/"):
        resolved = resolved[token.replace("~1", "/").replace("~0", "~")]
    return resolved if isinstance(resolved, dict) else node


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    paths = export_v2_schema(field_source=args.field_source, output_dir=args.output_dir)
    print(paths["json_schema"])
    print(paths["field_dictionary_json"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
