from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from app.models.experiment import ExperimentRun
from app.models.sample import Sample
from app.models.v2_entities import InstrumentVersion, MaterialLotVersion, SetupVersion
from app.models.v2_results import CharacterizationRecord, MeasuredProduct

REPO_ROOT = Path(__file__).resolve().parents[3]
V1_DICTIONARY = REPO_ROOT / "docs" / "archive" / "generated" / "cvd-2d-field-dictionary.json"
FIELD_SOURCE = REPO_ROOT / "docs" / "standard" / "field-source.yaml"
MAPPING = REPO_ROOT / "docs" / "standard" / "v1-to-v2-mapping.yaml"


def _v1_paths() -> set[str]:
    doc = json.loads(V1_DICTIONARY.read_text(encoding="utf-8"))
    return {
        f"{field['module_key']}.{field['field_key']}"
        for module in doc["modules"]
        for field in module["fields"]
    }


def _mapping_entries() -> list[dict[str, Any]]:
    return yaml.safe_load(MAPPING.read_text(encoding="utf-8"))["mappings"]


def _field_source_targets() -> set[tuple[str, str]]:
    doc = yaml.safe_load(FIELD_SOURCE.read_text(encoding="utf-8"))
    targets: set[tuple[str, str]] = set()
    for section in doc["experiment_record"]["sections"]:
        for field in section["fields"]:
            targets.add((doc["modules"][field["module"]], field["key"]))
    for section in doc["entities"]["sections"]:
        for field in section["fields"]:
            targets.add((doc["entity_keys"][field["module"]], field["key"]))
    return targets


def _model_targets() -> set[tuple[str, str]]:
    models = (
        ExperimentRun,
        Sample,
        MaterialLotVersion,
        SetupVersion,
        InstrumentVersion,
        CharacterizationRecord,
        MeasuredProduct,
    )
    return {
        (model.__tablename__, column.name) for model in models for column in model.__table__.columns
    }


def _target_items(entry: dict[str, Any]) -> list[dict[str, Any]]:
    target = entry.get("target")
    if isinstance(target, list):
        return target
    return [target] if isinstance(target, dict) else []


def test_v1_to_v2_mapping_covers_all_68_v1_fields() -> None:
    mapped_paths = {entry["source_path"] for entry in _mapping_entries()}
    assert mapped_paths == _v1_paths()
    assert len(mapped_paths) == 68


def test_sensitive_and_manual_fields_stay_review_gated() -> None:
    entries = {entry["source_path"]: entry for entry in _mapping_entries()}

    assert entries["result_summary.quality_label"]["status"] == "待用户确认"
    assert entries["result_summary.failure_modes"]["status"] == "待用户确认"
    assert entries["process_observation.color_change"]["status"] == "待用户确认"
    assert entries["furnace_program.furnace_info"]["status"] == "需人工映射"


def test_mapping_targets_exist_in_field_source_or_model_tables() -> None:
    allowed = _field_source_targets() | _model_targets()

    missing: list[tuple[str, str, str]] = []
    for entry in _mapping_entries():
        for target in _target_items(entry):
            kind = target.get("kind")
            if kind in {"discard", "manual"}:
                continue
            namespace = target.get("module_key") or target.get("entity") or target.get("table")
            key = target.get("key")
            if namespace and key and (namespace, key) not in allowed:
                missing.append((entry["source_path"], namespace, key))

    assert missing == []
