from __future__ import annotations

from typing import Any, Literal

from app.models.experiment import ExperimentRun
from app.schemas.generated.v2_module_payload import validate_v2_module_payload
from app.services.temperature_timeseries import temperature_timeseries_mapping_error
from app.services.v2_field_source import (
    PVD_METHODS,
    SCHEMA_VERSION,
    canonical_option_value,
    condition_local_key,
    condition_matches,
    entity_fields,
    experiment_fields,
    load_field_source,
    missing,
    module_key_for_field,
)
from app.services.v2_process_semantics import (
    process_duration_violations,
    process_step_order_is_valid,
    reaction_cycle_counts_are_consistent,
    temperature_programs_start_at_zero,
    valid_frozen_gas_reference,
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
    if "process_steps" in doc["modules"].values():
        items.extend(_process_semantic_checks(run, payloads))
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


def missing_required_fields(run: ExperimentRun) -> list[dict[str, str]]:
    doc = load_field_source()
    payloads = {item.module_key: item.payload_json for item in run.module_payloads}
    if (payloads.get("basic_info") or {}).get("synthesis_method") in PVD_METHODS:
        return []

    stage_types = {
        canonical_option_value(item["name"], doc): item for item in doc["stage_types"]["types"]
    }
    missing_items: list[dict[str, str]] = []
    for field in experiment_fields(doc):
        level = field["requirement"]["level"]
        if level not in {"required", "conditional_required"}:
            continue
        module_key = module_key_for_field(field, doc)
        records = _records(run, payloads, module_key)
        for record in records:
            required = level == "required"
            if module_key == "process_steps":
                stage = stage_types.get(record.get("stage_type"), {})
                field_group = field.get("group", "common")
                if field_group != "common" and field_group not in stage.get("shows", []):
                    continue
                required = field["key"] in stage.get("required_extra", []) or required
            condition = field["requirement"].get("condition")
            if level == "conditional_required" and condition:
                value, resolved = _condition_value(field, condition, record, payloads, run, doc)
                required = required or (resolved and condition_matches(condition, value))
            if required and missing(record.get(field["key"])):
                missing_items.append(
                    {"key": field["key"], "label": field["label"], "module": module_key}
                )
                break
    return missing_items


def _condition_value(
    field: dict[str, Any],
    condition: dict[str, Any],
    record: dict[str, Any],
    payloads: dict[str, dict[str, Any]],
    run: ExperimentRun,
    doc: dict[str, Any],
) -> tuple[Any, bool]:
    local_key = condition_local_key(field, condition, doc)
    if local_key is not None:
        return record.get(local_key), True

    condition_module, _, condition_label = str(condition.get("field") or "").partition(".")
    module_key = doc["modules"].get(condition_module)
    if module_key:
        driver = next(
            (
                item
                for item in experiment_fields(doc)
                if module_key_for_field(item, doc) == module_key
                and item["label"] == condition_label
            ),
            None,
        )
        if driver:
            records = _records(run, payloads, module_key)
            return records[0].get(driver["key"]), True

    if doc["entity_keys"].get(condition_module) == "setup":
        attrs = (run.setup_ref_snapshot_json or {}).get("attrs_snapshot") or {}
        driver = next(
            (
                item
                for item in entity_fields(doc)
                if module_key_for_field(item, doc) == "setup" and item["label"] == condition_label
            ),
            None,
        )
        if driver and driver["key"] in attrs:
            return attrs[driver["key"]], True
    return None, False


def _report(
    run: ExperimentRun,
    status: Literal["excluded_pvd", "compliant", "non_compliant"],
    items: list[dict[str, Any]],
) -> dict[str, Any]:
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
        passed = bool(run.setup_ref)
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


def _process_semantic_checks(
    run: ExperimentRun,
    payloads: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    process_payload = payloads.get("process_steps") or {}
    event_payload = payloads.get("process_events") or {}
    process_items = [item for item in process_payload.get("items") or [] if isinstance(item, dict)]
    event_items = [item for item in event_payload.get("items") or [] if isinstance(item, dict)]

    try:
        validate_v2_module_payload("process_steps", process_payload)
        process_structure_valid = all(
            item.get("stage_type") in {"preparation", "reaction_conditions", "other"}
            for item in process_items
        )
    except (TypeError, ValueError):
        process_structure_valid = False
    try:
        validate_v2_module_payload("process_events", event_payload)
        event_structure_valid = True
    except (TypeError, ValueError):
        event_structure_valid = False

    preparation_count = sum(item.get("stage_type") == "preparation" for item in process_items)
    reaction_items = [
        item for item in process_items if item.get("stage_type") == "reaction_conditions"
    ]
    reaction_count = len(reaction_items)
    checks = [
        _semantic_item(
            "process_steps",
            "process_steps_structure",
            "过程记录结构",
            process_structure_valid,
        ),
        _semantic_item(
            "process_steps",
            "preparation",
            "预处理记录（恰好一条）",
            preparation_count == 1,
        ),
        _semantic_item(
            "process_steps",
            "reaction_conditions",
            "反应条件记录（恰好一条）",
            reaction_count == 1,
        ),
        _semantic_item(
            "process_steps",
            "process_step_order",
            "预处理记录早于反应条件记录",
            process_step_order_is_valid(process_payload),
            applicable=preparation_count > 0 and reaction_count > 0,
        ),
        _semantic_item(
            "process_steps",
            "temperature_program_start",
            "各温区温度程序从 0 min 开始",
            temperature_programs_start_at_zero(process_payload),
            applicable=bool(reaction_items),
        ),
        _semantic_item(
            "process_steps",
            "reaction_cycle_count",
            "反应循环次数由单一气体最大供气区间数派生",
            reaction_cycle_counts_are_consistent(process_payload),
            applicable=bool(reaction_items),
        ),
        _semantic_item(
            "process_events",
            "process_events_structure",
            "过程事件结构",
            event_structure_valid,
            applicable=bool(event_payload),
        ),
    ]

    zone_count = (run.setup_ref_snapshot_json or {}).get("zone_count_snapshot")
    temperature_zone_indices: list[int] = []
    measured_zone_indices: list[int] = []
    gas_references: list[dict[str, Any]] = []
    actual_fields: list[dict[str, Any]] = []
    measured_references: list[dict[str, Any]] = []
    for item in process_items:
        if item.get("stage_type") == "preparation":
            for operation in item.get("preparation_operations") or []:
                if (
                    isinstance(operation, dict)
                    and operation.get("operation_type") == "gas_exchange"
                ):
                    gas_references.extend(
                        gas for gas in operation.get("gases") or [] if isinstance(gas, dict)
                    )
        if item.get("stage_type") != "reaction_conditions":
            continue
        temperature_program = item.get("temperature_program") or {}
        temperature_zone_indices.extend(
            zone.get("zone_index")
            for zone in temperature_program.get("zones") or []
            if isinstance(zone, dict) and isinstance(zone.get("zone_index"), int)
        )
        measured = item.get("measured_temperature")
        if isinstance(measured, dict):
            measured_references.append(measured)
            measured_zone_indices.extend(
                channel.get("zone_index")
                for channel in measured.get("channels") or []
                if isinstance(channel, dict) and isinstance(channel.get("zone_index"), int)
            )
        gas_references.extend(
            feed for feed in item.get("gas_feeds") or [] if isinstance(feed, dict)
        )
        actual_fields.extend(
            field for field in item.get("field_params") or [] if isinstance(field, dict)
        )

    zones_valid = (
        isinstance(zone_count, int)
        and set(temperature_zone_indices) == set(range(1, zone_count + 1))
        and all(1 <= zone_index <= zone_count for zone_index in measured_zone_indices)
    )
    checks.append(
        _semantic_item(
            "process_steps",
            "process_zone_indices",
            "过程温区与装置温区一致",
            zones_valid,
            applicable=bool(reaction_items),
        )
    )

    gas_snapshots_valid = all(valid_frozen_gas_reference(item) for item in gas_references)
    checks.append(
        _semantic_item(
            "process_steps",
            "gas_lot_snapshots",
            "气瓶批次身份与纯度快照",
            gas_snapshots_valid,
            applicable=bool(gas_references),
        )
    )
    checks.append(
        _semantic_item(
            "process_steps",
            "process_duration_bounds",
            "过程时间不超过反应总时长",
            not process_duration_violations(process_payload),
            applicable=bool(reaction_items),
        )
    )

    setup_attrs = (run.setup_ref_snapshot_json or {}).get("attrs_snapshot") or {}
    raw_devices = setup_attrs.get("field_devices")
    configured_devices = (
        {canonical_option_value(value) for value in raw_devices if isinstance(value, str)}
        if isinstance(raw_devices, list)
        else set()
    )
    configured_devices.discard("none")
    fields_valid = all(
        canonical_option_value(field.get("field_type")) in configured_devices
        for field in actual_fields
    )
    checks.append(
        _semantic_item(
            "process_steps",
            "field_params_setup_capability",
            "实际外场属于装置能力",
            fields_valid,
            applicable=bool(actual_fields),
        )
    )

    active_run_files = {
        str(file_asset.id): file_asset
        for file_asset in run.file_assets
        if file_asset.experiment_run_id == run.id and file_asset.deleted_at is None
    }
    measured_files_valid = all(
        (
            (file_asset := active_run_files.get(str(reference.get("file_asset_id")))) is not None
            and file_asset.asset_role == "temperature_timeseries"
            and file_asset.metadata_json.get("binding_type") == "process_step"
            and str(file_asset.metadata_json.get("binding_id") or "") == "reaction_conditions"
            and temperature_timeseries_mapping_error(file_asset.metadata_json, reference) is None
        )
        for reference in measured_references
    )
    checks.append(
        _semantic_item(
            "process_steps",
            "measured_temperature_file",
            "实测温度文件引用",
            measured_files_valid,
            applicable=bool(measured_references),
        )
    )

    event_ids = [str(item.get("event_id") or "") for item in event_items]
    checks.append(
        _semantic_item(
            "process_events",
            "process_event_ids",
            "过程事件标识唯一",
            all(event_ids) and len(event_ids) == len(set(event_ids)),
            applicable=bool(event_items),
        )
    )
    attachment_references = [
        (event_id, str(file_id))
        for event, event_id in zip(event_items, event_ids, strict=True)
        for file_id in event.get("attachment_file_ids") or []
    ]
    attachments_valid = all(
        (
            (file_asset := active_run_files.get(file_id)) is not None
            and file_asset.asset_role == "process_event_attachment"
            and file_asset.metadata_json.get("binding_type") == "process_event"
            and str(file_asset.metadata_json.get("binding_id") or "") == event_id
        )
        for event_id, file_id in attachment_references
    )
    checks.append(
        _semantic_item(
            "process_events",
            "process_event_attachments",
            "过程事件附件绑定",
            attachments_valid,
            applicable=bool(attachment_references),
        )
    )
    return checks


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
    return [{**payload, "run_code": run.run_code}] if module_key == "basic_info" else [payload]
