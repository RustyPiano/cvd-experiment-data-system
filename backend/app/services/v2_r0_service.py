from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun
from app.models.v2_entities import MaterialLotVersion
from app.schemas.generated.v2_module_payload import validate_v2_module_payload
from app.services.scientific_revision_service import validate_scientific_module_payload
from app.services.v2_entity_snapshot_service import (
    effective_run_module_payloads,
    material_lot_version_snapshot,
)
from app.services.v2_field_source import (
    SCHEMA_VERSION,
    load_field_source,
)
from app.services.v2_process_semantics import (
    valid_frozen_gas_reference,
)


def build_run_report(
    run: ExperimentRun,
    payloads: dict[str, dict[str, Any]] | None = None,
    *,
    db: Session | None = None,
) -> dict[str, Any]:
    doc = load_field_source()
    payloads, run_snapshot, schema_version, immutable_revision = _report_source(run, payloads, doc)
    items = _scientific_contract_checks(
        run,
        payloads,
        run_snapshot,
        immutable_revision=immutable_revision,
        db=db,
    )
    applicable = [item for item in items if item["applicable"]]
    return _report(
        run,
        "compliant" if all(item["passed"] for item in applicable) else "non_compliant",
        items,
        schema_version=schema_version,
    )


def _report_source(
    run: ExperimentRun,
    payloads: dict[str, dict[str, Any]] | None,
    doc: dict[str, Any],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any], str, bool]:
    schema_version = str((doc.get("meta") or {}).get("version") or SCHEMA_VERSION)
    if payloads is not None:
        return payloads, _live_run_snapshot(run), schema_version, False

    status = getattr(run.status, "value", run.status)
    revision = run.current_revision if status in {"locked", "reviewed"} else None
    content = revision.content_json if revision is not None else None
    revision_modules = content.get("modules") if isinstance(content, dict) else None
    if isinstance(revision_modules, dict):
        run_snapshot = content.get("run")
        canonical = json.dumps(
            content,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return (
            revision_modules,
            run_snapshot if isinstance(run_snapshot, dict) else {},
            revision.schema_version,
            revision.experiment_run_id == run.id
            and isinstance(run_snapshot, dict)
            and str(run_snapshot.get("id") or "") == str(run.id)
            and hashlib.sha256(canonical).hexdigest() == revision.content_sha256,
        )
    return (
        effective_run_module_payloads(run),
        _live_run_snapshot(run),
        schema_version,
        False,
    )


def _live_run_snapshot(run: ExperimentRun) -> dict[str, Any]:
    return {
        "id": str(run.id),
        "run_code": run.run_code,
        "setup_ref": str(run.setup_ref) if run.setup_ref else None,
        "setup_ref_version": run.setup_ref_version,
        "setup_ref_snapshot": run.setup_ref_snapshot_json,
    }


def _scientific_contract_checks(
    run: ExperimentRun,
    payloads: dict[str, dict[str, Any]],
    run_snapshot: dict[str, Any],
    *,
    immutable_revision: bool,
    db: Session | None,
) -> list[dict[str, Any]]:
    required_modules = {
        "basic_info": "基础信息",
        "target_product": "目标产物",
        "equipment": "实验装置",
        "precursors": "前驱体",
        "substrates": "衬底",
        "process_steps": "生长条件",
    }
    checks = [
        _semantic_item(
            module_key,
            "module_present",
            f"{label}模块",
            isinstance(payloads.get(module_key), dict) and bool(payloads[module_key]),
        )
        for module_key, label in required_modules.items()
    ]
    module_labels = {
        "basic_info": "基础信息符合科学契约",
        "target_product": "目标产物符合科学契约",
        "equipment": "实验装置符合字段契约",
        "precursors": "前驱体符合科学契约",
        "substrates": "衬底符合字段契约",
        "process_steps": "生长条件符合科学契约",
        "process_events": "过程事件符合科学契约",
    }
    for module_key, label in module_labels.items():
        applicable = module_key != "process_events" or module_key in payloads
        checks.append(
            _semantic_item(
                module_key,
                "module_schema",
                label,
                _scientific_module_is_valid(module_key, payloads.get(module_key) or {}),
                applicable=applicable,
            )
        )

    status = getattr(run.status, "value", run.status)
    checks.append(
        _semantic_item(
            "revision",
            "immutable_revision_content",
            "锁定记录使用不可变修订内容",
            immutable_revision,
            applicable=status in {"locked", "reviewed"},
        )
    )

    basic = payloads.get("basic_info") or {}
    checks.extend(
        [
            _semantic_item(
                "basic_info",
                "run_identity",
                "记录编号与创建者一致",
                basic.get("run_code") == run.run_code
                and str(basic.get("created_by_user_id") or "") == str(run.owner_id),
            ),
            _semantic_item(
                "basic_info",
                "performed_by_user_ids",
                "至少一名实验执行人",
                bool(basic.get("performed_by_user_ids")),
            ),
            _semantic_item(
                "basic_info",
                "precheck_confirmed",
                "实验前检查已确认",
                (basic.get("precheck") or {}).get("confirmed") is True,
            ),
        ]
    )

    target = payloads.get("target_product") or {}
    target_regions = [
        item for item in target.get("material_regions") or [] if isinstance(item, dict)
    ]
    checks.append(
        _semantic_item(
            "target_product",
            "material_regions",
            "目标材料区域与化学式",
            bool(target_regions) and all(item.get("formula") for item in target_regions),
        )
    )

    equipment = payloads.get("equipment") or {}
    setup_ref = str(run_snapshot.get("setup_ref") or "")
    setup_snapshot = run_snapshot.get("setup_ref_snapshot") or {}
    zone_count = setup_snapshot.get("zone_count_snapshot")
    if not isinstance(zone_count, int):
        zone_count = equipment.get("zone_count")
    checks.extend(
        [
            _semantic_item(
                "equipment",
                "setup_ref",
                "装置版本引用与修订快照一致",
                bool(setup_ref)
                and str(equipment.get("setup_ref") or "") == setup_ref
                and bool(run_snapshot.get("setup_ref_version")),
            ),
            _semantic_item(
                "equipment",
                "setup_snapshot",
                "装置温区与方向快照",
                isinstance(setup_snapshot, dict)
                and isinstance(zone_count, int)
                and zone_count > 0
                and bool(setup_snapshot.get("orientation_snapshot")),
            ),
            _semantic_item(
                "equipment",
                "tube_usage_history",
                "本炉炉管清洗或更换后的使用履历",
                isinstance((tube_usage := equipment.get("tube_usage_history")), dict)
                and isinstance(tube_usage.get("reset_count"), int)
                and tube_usage["reset_count"] >= 0
                and isinstance(tube_usage.get("use_number_since_reset"), int)
                and tube_usage["use_number_since_reset"] >= 1,
            ),
        ]
    )

    source_loads = [
        item
        for item in (payloads.get("precursors") or {}).get("items") or []
        if isinstance(item, dict)
    ]
    ingredients = [
        ingredient
        for load in source_loads
        for ingredient in load.get("ingredients") or []
        if isinstance(ingredient, dict)
    ]
    checks.append(
        _semantic_item(
            "precursors",
            "material_lot_references",
            "前驱体批次版本引用",
            bool(source_loads)
            and bool(ingredients)
            and all(
                ingredient.get("material_lot_id")
                and isinstance(ingredient.get("material_lot_version"), int)
                and ingredient["material_lot_version"] >= 1
                for ingredient in ingredients
            )
            and _lot_references_exist(
                db,
                [
                    (ingredient.get("material_lot_id"), ingredient.get("material_lot_version"))
                    for ingredient in ingredients
                ],
            ),
        )
    )
    non_gas_ingredients = [
        ingredient
        for load in source_loads
        if load.get("loading_method") != "gas_line"
        and not any(
            step.get("step_type") in {"dip_coat", "drop_cast", "spin_coat"}
            for step in load.get("preparation_steps") or []
        )
        for ingredient in load.get("ingredients") or []
        if isinstance(ingredient, dict)
    ]
    checks.append(
        _semantic_item(
            "precursors",
            "amount",
            "非气态前驱体本次使用量",
            all(
                isinstance(ingredient.get("amount"), int | float)
                and not isinstance(ingredient.get("amount"), bool)
                and ingredient["amount"] > 0
                and bool(str(ingredient.get("unit") or "").strip())
                for ingredient in non_gas_ingredients
            ),
            applicable=bool(non_gas_ingredients),
        )
    )

    substrate_items = [
        item
        for item in (payloads.get("substrates") or {}).get("items") or []
        if isinstance(item, dict)
    ]
    checks.append(
        _semantic_item(
            "substrates",
            "substrate_lot_references",
            "衬底片与冻结批次引用",
            bool(substrate_items)
            and all(
                isinstance(item.get("lot_ref"), dict)
                and item["lot_ref"].get("entity_id")
                and item["lot_ref"].get("version")
                and isinstance(item["lot_ref"].get("snapshot"), dict)
                for item in substrate_items
            )
            and _lot_references_exist(
                db,
                [
                    (
                        (item.get("lot_ref") or {}).get("entity_id"),
                        (item.get("lot_ref") or {}).get("version"),
                    )
                    for item in substrate_items
                ],
                category="substrate",
            ),
        )
    )

    valid_zones = (
        {f"zone_{index}" for index in range(1, zone_count + 1)}
        if isinstance(zone_count, int) and zone_count > 0
        else set()
    )
    source_zones = {
        str(load.get("heating_zone_ref")) for load in source_loads if load.get("heating_zone_ref")
    }
    substrate_zones = {
        f"zone_{position.get('zone_index')}"
        for item in substrate_items
        if isinstance((position := item.get("zone_thermocouple_distance_mm")), dict)
    }
    checks.append(
        _semantic_item(
            "precursors",
            "setup_zone_references",
            "前驱体与衬底温区引用",
            bool(valid_zones)
            and source_zones.issubset(valid_zones)
            and substrate_zones.issubset(valid_zones),
        )
    )

    surface_loads = [
        load for load in source_loads if load.get("loading_method") == "substrate_surface"
    ]
    substrate_source_ids = {
        str(item.get("source_id")) for item in substrate_items if item.get("source_id")
    }
    surface_references = [
        str(reference)
        for load in surface_loads
        for reference in load.get("substrate_source_ids") or []
    ]
    checks.append(
        _semantic_item(
            "precursors",
            "substrate_source_references",
            "衬底表面装载关联具体衬底片",
            bool(surface_references)
            and all(reference in substrate_source_ids for reference in surface_references),
            applicable=bool(surface_loads),
        )
    )

    process = payloads.get("process_steps") or {}
    gas_exchange_operations = [
        item
        for item in process.get("preparation_operations") or []
        if isinstance(item, dict) and item.get("operation_type") == "gas_exchange"
    ]
    preparation_gas_sources = [
        source
        for operation in gas_exchange_operations
        for source in operation.get("gas_sources") or []
        if isinstance(source, dict)
    ]
    checks.append(
        _semantic_item(
            "process_steps",
            "preparation_gas_sources",
            "气氛置换使用实际气瓶批次",
            bool(preparation_gas_sources)
            and _preparation_gas_references_valid(
                db,
                preparation_gas_sources,
                require_frozen_snapshot=immutable_revision,
            ),
            applicable=bool(gas_exchange_operations),
        )
    )
    channels = [item for item in process.get("channels") or [] if isinstance(item, dict)]
    temperature_channels = [
        item
        for item in channels
        if item.get("channel_type") == "temperature" and item.get("source_type") == "setpoint"
    ]
    temperature_zones = {str(item.get("subject_ref")) for item in temperature_channels}
    checks.append(
        _semantic_item(
            "process_steps",
            "temperature_program",
            "每个装置温区均有设定温度程序",
            bool(valid_zones)
            and len(temperature_channels) == len(valid_zones)
            and temperature_zones == valid_zones,
        )
    )

    flow_channels = [item for item in channels if item.get("channel_type") == "flow"]
    checks.append(
        _semantic_item(
            "process_steps",
            "gas_flow_program",
            "至少一条带气瓶批次的供气程序",
            bool(flow_channels)
            and all(
                item.get("gas_species_code")
                and item.get("gas_lot_id")
                and isinstance(item.get("gas_lot_version"), int)
                and item["gas_lot_version"] >= 1
                and item.get("data_kind") == "interval_series"
                and bool(item.get("series"))
                and all(
                    isinstance(point, dict)
                    and isinstance(point.get("end_s"), int | float)
                    and point["end_s"] > point.get("start_s", -1)
                    for point in item.get("series") or []
                )
                for item in flow_channels
            )
            and _gas_lot_references_valid(db, flow_channels),
        )
    )

    pressure_regime = process.get("pressure_regime")
    pressure_channels = [
        item
        for item in channels
        if item.get("channel_type") == "pressure" and item.get("source_type") == "setpoint"
    ]
    pressure_valid = pressure_regime == "atmospheric" and not pressure_channels
    if pressure_regime in {"low_pressure", "ultra_high_vacuum", "high_pressure", "other"}:
        pressure_valid = len(pressure_channels) == 1 and (
            pressure_channels[0].get("pressure_type") == "absolute"
            and pressure_channels[0].get("data_kind") == "scalar"
            and isinstance(pressure_channels[0].get("scalar_value"), int | float)
            and not isinstance(pressure_channels[0].get("scalar_value"), bool)
            and pressure_channels[0]["scalar_value"] > 0
        )
    checks.append(
        _semantic_item(
            "process_steps",
            "pressure_condition",
            "反应压力条件与绝对压力",
            pressure_valid,
        )
    )
    checks.append(
        _semantic_item(
            "process_steps",
            "cooling_method",
            "降温方式",
            bool(process.get("cooling_method")),
        )
    )
    checks.extend(_scientific_file_reference_checks(run, payloads, channels))
    return checks


def _material_lot_version(
    db: Session,
    entity_id: object,
    version: object,
) -> MaterialLotVersion | None:
    try:
        lot_id = UUID(str(entity_id))
        version_number = int(version)
    except (TypeError, ValueError, AttributeError):
        return None
    return db.scalar(
        select(MaterialLotVersion).where(
            MaterialLotVersion.entity_id == lot_id,
            MaterialLotVersion.version == version_number,
        )
    )


def _lot_references_exist(
    db: Session | None,
    references: list[tuple[object, object]],
    *,
    category: str | None = None,
) -> bool:
    if db is None:
        return True
    return all(
        (version := _material_lot_version(db, entity_id, version_number)) is not None
        and (category is None or version.lot_category == category)
        for entity_id, version_number in references
    )


def _gas_lot_references_valid(
    db: Session | None,
    channels: list[dict[str, Any]],
) -> bool:
    if db is None:
        return True
    for channel in channels:
        version = _material_lot_version(
            db,
            channel.get("gas_lot_id"),
            channel.get("gas_lot_version"),
        )
        if version is None or not valid_frozen_gas_reference(
            {
                "species": channel.get("gas_species_code"),
                "lot_ref": {
                    "entity_id": str(version.entity_id),
                    "version": version.version,
                    "snapshot": material_lot_version_snapshot(version),
                },
            }
        ):
            return False
    return True


def _preparation_gas_references_valid(
    db: Session | None,
    sources: list[dict[str, Any]],
    *,
    require_frozen_snapshot: bool,
) -> bool:
    for source in sources:
        entity_id = source.get("material_lot_id")
        version_number = source.get("material_lot_version")
        if not entity_id or not isinstance(version_number, int) or version_number < 1:
            return False
        if require_frozen_snapshot and not valid_frozen_gas_reference(source):
            return False
        if db is None:
            continue
        version = _material_lot_version(db, entity_id, version_number)
        if version is None or not valid_frozen_gas_reference(
            {
                "material_lot_id": str(version.entity_id),
                "material_lot_version": version.version,
                "snapshot": material_lot_version_snapshot(version),
            }
        ):
            return False
    return True


def _scientific_module_is_valid(module_key: str, payload: dict[str, Any]) -> bool:
    try:
        value = deepcopy(payload)
        if module_key == "substrates":
            for item in value.get("items") or []:
                if isinstance(item, dict):
                    item.pop("source_id", None)
            validate_v2_module_payload(module_key, value)
        elif module_key == "equipment":
            value.pop("setup_code", None)
            value.pop("setup_name", None)
            validate_v2_module_payload(module_key, value)
        else:
            validate_scientific_module_payload(module_key, value)
    except (TypeError, ValueError):
        return False
    return True


def _scientific_file_reference_checks(
    run: ExperimentRun,
    payloads: dict[str, dict[str, Any]],
    channels: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    files = {
        str(item.id): item
        for item in run.file_assets
        if item.experiment_run_id == run.id and item.deleted_at is None
    }
    timeseries = [item for item in channels if item.get("data_kind") == "timeseries_file"]
    timeseries_valid = all(
        (file_asset := files.get(str(item.get("file_asset_id")))) is not None
        and file_asset.asset_role == "process_timeseries"
        and file_asset.metadata_json.get("binding_type") == "process_channel"
        and str(file_asset.metadata_json.get("binding_id") or "") == item.get("channel_key")
        for item in timeseries
    )
    events = [
        item
        for item in (payloads.get("process_events") or {}).get("items") or []
        if isinstance(item, dict)
    ]
    attachments = [
        (str(event.get("event_key") or ""), str(file_id))
        for event in events
        for file_id in event.get("attachment_file_ids") or []
    ]
    attachments_valid = all(
        (file_asset := files.get(file_id)) is not None
        and file_asset.asset_role == "process_event_attachment"
        and file_asset.metadata_json.get("binding_type") == "process_event"
        and str(file_asset.metadata_json.get("binding_id") or "") == event_key
        for event_key, file_id in attachments
    )
    return [
        _semantic_item(
            "process_steps",
            "timeseries_file_references",
            "过程时序文件绑定",
            timeseries_valid,
            applicable=bool(timeseries),
        ),
        _semantic_item(
            "process_events",
            "attachment_file_references",
            "过程事件附件绑定",
            attachments_valid,
            applicable=bool(attachments),
        ),
    ]


def _report(
    run: ExperimentRun,
    status: Literal["compliant", "non_compliant"],
    items: list[dict[str, Any]],
    *,
    schema_version: str,
) -> dict[str, Any]:
    return {
        "run_id": str(run.id),
        "run_code": run.run_code,
        "schema_version": schema_version,
        "status": status,
        "items": items,
    }


def _semantic_item(
    module_key: str,
    key: str,
    label: str,
    passed: bool,
    *,
    applicable: bool = True,
) -> dict[str, Any]:
    return {
        "module_key": module_key,
        "key": key,
        "label": label,
        "r0": True,
        "condition": None,
        "applicable": applicable,
        "passed": passed,
    }


def _records(
    run: ExperimentRun, payloads: dict[str, dict[str, Any]], module_key: str
) -> list[dict[str, Any]]:
    payload = payloads.get(module_key) or {}
    if isinstance(payload.get("items"), list):
        return [item for item in payload["items"] if isinstance(item, dict)]
    if module_key == "process_events":
        return []
    return [{**payload, "run_code": run.run_code}] if module_key == "basic_info" else [payload]
