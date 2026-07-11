from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from app.core.config import get_settings

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_FIELD_SOURCE = REPO_ROOT / "docs" / "standard" / "field-source.yaml"
SCHEMA_VERSION = "cvd_v2"
PAYLOAD_MODULE_KEYS = (
    "basic_info",
    "target_product",
    "equipment",
    "precursors",
    "substrates",
    "process_steps",
    "process_events",
    "pvd",
)
ARRAY_MODULE_KEYS = {"precursors", "substrates", "process_steps", "process_events"}
RESULT_MODULE_KEYS = {"characterization", "measured_products"}
PVD_METHODS = {"PVD-磁控溅射", "PVD-热蒸发", "PLD"}


@lru_cache(maxsize=4)
def _load_field_source_cached(path: str) -> dict[str, Any]:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def load_field_source(path: str = str(DEFAULT_FIELD_SOURCE)) -> dict[str, Any]:
    settings = get_settings()
    # Dev reloads field metadata on every request so YAML edits appear without a restart.
    if settings.app_debug or settings.app_env.lower() in {"dev", "development"}:
        return yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return _load_field_source_cached(path)


def experiment_fields(doc: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    source = doc or load_field_source()
    return [
        field for section in source["experiment_record"]["sections"] for field in section["fields"]
    ]


def entity_fields(doc: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    source = doc or load_field_source()
    return [field for section in source["entities"]["sections"] for field in section["fields"]]


def field_option_values(field_key: str, doc: dict[str, Any] | None = None) -> set[str]:
    source = doc or load_field_source()
    field = next(
        (
            item
            for item in [*experiment_fields(source), *entity_fields(source)]
            if item["key"] == field_key
        ),
        None,
    )
    if field is None:
        # 快速失败：键名拼错/YAML 改名时立刻暴露，而不是静默空集导致所有值被拒
        raise ValueError(f"field-source.yaml 中不存在字段 key: {field_key}")
    return {value.strip() for value in str(field.get("options") or "").split("/") if value.strip()}


def module_key_for_field(field: dict[str, Any], doc: dict[str, Any] | None = None) -> str:
    source = doc or load_field_source()
    module = field["module"]
    return source["modules"].get(module) or source["entity_keys"][module]


def payload_fields_by_module(doc: dict[str, Any] | None = None) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {key: [] for key in PAYLOAD_MODULE_KEYS}
    source = doc or load_field_source()
    for field in experiment_fields(source):
        module_key = module_key_for_field(field, source)
        if module_key in grouped:
            grouped[module_key].append(field)
    return grouped


def entity_fields_by_key(doc: dict[str, Any] | None = None) -> dict[str, list[dict[str, Any]]]:
    source = doc or load_field_source()
    grouped = {value: [] for value in source["entity_keys"].values()}
    for field in entity_fields(source):
        grouped[module_key_for_field(field, source)].append(field)
    return grouped


def stage_type_names(doc: dict[str, Any] | None = None) -> list[str]:
    source = doc or load_field_source()
    return [item["name"] for item in source["stage_types"]["types"]]


def stage_types_with_group(group: str, doc: dict[str, Any] | None = None) -> set[str]:
    source = doc or load_field_source()
    return {
        item["name"] for item in source["stage_types"]["types"] if group in item.get("shows", [])
    }


def missing(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def condition_local_key(
    field: dict[str, Any],
    condition: dict[str, Any] | None,
    doc: dict[str, Any] | None = None,
) -> str | None:
    if not condition:
        return None
    source = doc or load_field_source()
    raw_field = str(condition.get("field") or "")
    if "." not in raw_field:
        return None
    condition_module, condition_label = raw_field.split(".", 1)
    current_module_key = module_key_for_field(field, source)
    condition_module_key = source["modules"].get(condition_module) or source["entity_keys"].get(
        condition_module
    )
    if condition_module_key != current_module_key:
        return None

    candidates = (
        experiment_fields(source)
        if current_module_key in source["modules"].values()
        else entity_fields(source)
    )
    for candidate in candidates:
        if (
            module_key_for_field(candidate, source) == current_module_key
            and candidate["label"] == condition_label
        ):
            return candidate["key"]
    return None


def condition_matches(condition: dict[str, Any], value: Any) -> bool:
    op = condition.get("op")
    expected = condition.get("value")
    if isinstance(value, list):
        if op == "eq":
            return expected in value
        if op == "ne":
            return expected not in value
        if op == "in":
            return any(item in set(expected or []) for item in value)
    if op == "eq":
        return value == expected
    if op == "ne":
        return value != expected
    if op == "in":
        return value in set(expected or [])
    msg = f"Unsupported condition op: {op}"
    raise ValueError(msg)
