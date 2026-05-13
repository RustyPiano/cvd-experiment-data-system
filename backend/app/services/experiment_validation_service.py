from __future__ import annotations

from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, QualityLabel
from app.models.module_payload import ExperimentModuleKey, normalize_module_payload
from app.repositories.file_asset_repository import FileAssetRepository
from app.repositories.module_payload_repository import ModulePayloadRepository
from app.schemas.experiment_validation import (
    ExperimentValidationIssue,
    ExperimentValidationResponse,
)
from app.schemas.module_payload import validate_module_payload

ISSUE_MESSAGE_ZH = {
    "Quality label is unknown": "质量标签仍为未知",
    "Experiment type is required": "实验类型必填",
    "Material system is required": "材料体系必填",
    "Experiment date is required": "实验日期必填",
    "Operator is required": "实验负责人必填",
    "At least one precursor is required": "至少需要填写一个前驱体",
    "Precursor item must be an object": "前驱体记录格式无效",
    "Precursor species is required": "前驱体种类必填",
    "Precursor method is required": "前驱体方法必填",
    "Precursor batch_no is missing": "前驱体批号缺失",
    "Precursor mass_mg is missing": "前驱体质量缺失",
    "Substrate item must be an object": "基底记录格式无效",
    "Substrate role is required": "基底角色必填",
    "Substrate role must be top or bottom": "基底角色必须是 top 或 bottom",
    "Substrate type is required": "基底类型必填",
    "At least one furnace zone is required": "至少需要填写一个温区程序",
    "Zones count must be a positive integer": "温区数量必须是正整数",
    "Furnace zone must be an object": "温区记录格式无效",
    "Furnace zone key is required": "温区标识必填",
    "Furnace zone key must match declared zones": "温区标识必须在声明温区范围内",
    "Each declared furnace zone must have exactly one temperature program": (
        "每个声明温区必须有且仅有一个温度程序"
    ),
    "Furnace zone key must be unique": "温区标识不能重复",
    "Each furnace zone must have at least two temperature nodes": ("每个温区至少需要两个温度节点"),
    "Furnace temperature node must be an object": "温度节点格式无效",
    "Furnace temperature time must be a non-negative number": "温度节点时间必须是非负数",
    "Furnace temperature must be a number": "温度节点温度必须是数字",
    "Furnace zone time points must be strictly increasing": "温区时间节点必须严格递增",
    "Gas segment must be an object": "气体程序段格式无效",
    "Gas segment boundaries must be numeric": "气体程序段起止时间必须是数字",
    "Gas segment gas is required": "气体程序段气体必填",
    "Gas segment flow_sccm is required and must be numeric when no components are specified": (
        "气体程序段流量必填且必须是数字（无组分时）"
    ),
    "Gas component flow_sccm must be a positive number": "气体组分流量必须是正数",
    "Gas component flow_sccm values must sum to a positive number": "气体组分流量之和必须为正数",
    "Gas segment end time must be greater than start time": "气体程序段结束时间必须大于开始时间",
    "Gas segments overlap": "气体程序段时间存在重叠",
    "Characterization method record must be an object": "表征方法记录格式无效",
    "Characterization method is required": "表征方法必填",
    "Indoor temperature is out of range": "室内温度超出建议范围",
    "Indoor humidity is missing": "室内湿度缺失",
    "Indoor humidity is out of range": "室内湿度超出有效范围",
    "Risk note is required when seal integrity fails": "密封检查失败时必须填写风险说明",
    "Boat contamination is present": "瓷舟存在污染",
    "Tube contamination is present": "石英管存在污染",
    "File method is required": "文件方法必填",
    "File experiment_id is required": "文件关联实验必填",
    "File experiment_id does not match experiment": "文件关联实验与当前实验不一致",
    "File is not linked to a sample": "文件未关联样品",
}

SCHEMA_VALIDATION_MESSAGE_ZH = {
    "int_type": "必须是整数",
    "int_parsing": "必须是整数",
    "float_type": "必须是数字",
    "float_parsing": "必须是数字",
    "bool_type": "必须是布尔值",
    "bool_parsing": "必须是布尔值",
    "list_type": "必须是列表",
    "model_type": "必须是对象",
    "string_type": "必须是文本",
}


class ExperimentValidationFailed(Exception):
    def __init__(self, result: ExperimentValidationResponse) -> None:
        super().__init__("Experiment validation failed")
        self.result = result


class ExperimentValidationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.module_payloads = ModulePayloadRepository(db)
        self.files = FileAssetRepository(db)

    def validate_experiment(self, experiment: ExperimentRun) -> ExperimentValidationResponse:
        errors: list[ExperimentValidationIssue] = []
        warnings: list[ExperimentValidationIssue] = []
        module_payloads = self._module_payload_map(experiment.id, errors)
        files = self.files.list_by_experiment(experiment.id)

        self._validate_basic_info(experiment, errors)
        self._validate_precursors(
            module_payloads.get(ExperimentModuleKey.PRECURSORS.value), errors, warnings
        )
        self._validate_substrates(module_payloads.get(ExperimentModuleKey.SUBSTRATES.value), errors)
        self._validate_furnace_program(
            module_payloads.get(ExperimentModuleKey.FURNACE_PROGRAM.value),
            errors,
        )
        self._validate_gas_program(
            module_payloads.get(ExperimentModuleKey.GAS_PROGRAM.value), errors
        )
        self._validate_environment(
            module_payloads.get(ExperimentModuleKey.ENVIRONMENT.value), warnings
        )
        self._validate_precheck(
            module_payloads.get(ExperimentModuleKey.PRECHECK.value), errors, warnings
        )
        self._validate_characterization(
            module_payloads.get(ExperimentModuleKey.CHARACTERIZATION.value), errors
        )
        self._validate_files(experiment, files, errors, warnings)

        if experiment.quality_label == QualityLabel.UNKNOWN:
            warnings.append(
                self._issue(
                    module_key=ExperimentModuleKey.RESULT_SUMMARY.value,
                    field_path="quality_label",
                    message="Quality label is unknown",
                )
            )

        return ExperimentValidationResponse(
            ok=not errors,
            errors=errors,
            warnings=warnings,
            completion_score=self._calculate_completion_score(
                experiment=experiment,
                module_payloads=module_payloads,
            ),
            blocking_count=len(errors),
            warning_count=len(warnings),
        )

    def _module_payload_map(
        self,
        experiment_id: UUID,
        errors: list[ExperimentValidationIssue],
    ) -> dict[str, dict]:
        payloads: dict[str, dict] = {}
        for item in self.module_payloads.list_by_run(experiment_id):
            normalized_payload = normalize_module_payload(item.module_key, item.payload_json)
            try:
                payloads[item.module_key] = validate_module_payload(
                    item.module_key,
                    normalized_payload,
                )
            except ValidationError as exc:
                payloads[item.module_key] = normalized_payload
                errors.extend(self._schema_validation_issues(item.module_key, exc))
        return payloads

    def _validate_basic_info(
        self,
        experiment: ExperimentRun,
        errors: list[ExperimentValidationIssue],
    ) -> None:
        if not experiment.experiment_type:
            errors.append(
                self._issue("basic_info", "experiment_type", "Experiment type is required")
            )
        if not experiment.material_system:
            errors.append(
                self._issue("basic_info", "material_system", "Material system is required")
            )
        if experiment.experiment_date is None:
            errors.append(
                self._issue("basic_info", "experiment_date", "Experiment date is required")
            )
        if experiment.owner_id is None:
            errors.append(self._issue("basic_info", "operator_id", "Operator is required"))

    def _validate_precursors(
        self,
        precursor_payload: dict | None,
        errors: list[ExperimentValidationIssue],
        warnings: list[ExperimentValidationIssue],
    ) -> None:
        precursor_items = (
            precursor_payload.get("items") if isinstance(precursor_payload, dict) else None
        )
        if not isinstance(precursor_items, list) or not precursor_items:
            errors.append(self._issue("precursors", "items", "At least one precursor is required"))
            return

        for index, item in enumerate(precursor_items):
            if not isinstance(item, dict):
                errors.append(
                    self._issue(
                        "precursors",
                        f"items[{index}]",
                        "Precursor item must be an object",
                    )
                )
                continue
            if self._is_blank(item.get("species")):
                errors.append(
                    self._issue(
                        "precursors",
                        f"items[{index}].species",
                        "Precursor species is required",
                    )
                )
            if self._is_blank(item.get("method")):
                errors.append(
                    self._issue(
                        "precursors",
                        f"items[{index}].method",
                        "Precursor method is required",
                    )
                )
            if not str(item.get("batch_no") or "").strip():
                warnings.append(
                    self._issue(
                        "precursors",
                        f"items[{index}].batch_no",
                        "Precursor batch_no is missing",
                    )
                )
            if self._precursor_requires_mass(item) and item.get("mass_mg") is None:
                warnings.append(
                    self._issue(
                        "precursors",
                        f"items[{index}].mass_mg",
                        "Precursor mass_mg is missing",
                    )
                )

    def _validate_substrates(
        self,
        substrates_payload: dict | None,
        errors: list[ExperimentValidationIssue],
    ) -> None:
        if not isinstance(substrates_payload, dict):
            return

        substrate_items = substrates_payload.get("items")
        if not isinstance(substrate_items, list) or not substrate_items:
            return

        for index, item in enumerate(substrate_items):
            if not isinstance(item, dict):
                errors.append(
                    self._issue(
                        "substrates",
                        f"items[{index}]",
                        "Substrate item must be an object",
                    )
                )
                continue

            role = item.get("role")
            if self._is_blank(role):
                errors.append(
                    self._issue(
                        "substrates",
                        f"items[{index}].role",
                        "Substrate role is required",
                    )
                )
            elif role not in {"top", "bottom"}:
                errors.append(
                    self._issue(
                        "substrates",
                        f"items[{index}].role",
                        "Substrate role must be top or bottom",
                    )
                )

            if self._is_blank(item.get("type")):
                errors.append(
                    self._issue(
                        "substrates",
                        f"items[{index}].type",
                        "Substrate type is required",
                    )
                )

    def _validate_furnace_program(
        self,
        furnace_payload: dict | None,
        errors: list[ExperimentValidationIssue],
    ) -> None:
        furnace_info = (
            furnace_payload.get("furnace_info") if isinstance(furnace_payload, dict) else None
        )
        declared_zone_keys = self._declared_furnace_zone_keys(furnace_payload)
        if isinstance(furnace_info, dict):
            zones_count = furnace_info.get("zones_count")
            if zones_count is not None and not (
                isinstance(zones_count, int)
                and not isinstance(zones_count, bool)
                and zones_count > 0
            ):
                errors.append(
                    self._issue(
                        "furnace_program",
                        "furnace_info.zones_count",
                        "Zones count must be a positive integer",
                    )
                )

        zones = furnace_payload.get("zones") if isinstance(furnace_payload, dict) else None
        if not isinstance(zones, list) or not zones:
            errors.append(
                self._issue(
                    "furnace_program",
                    "zones",
                    "At least one furnace zone is required",
                )
            )
            return

        zone_key_counts: dict[str, int] = {}
        for zone_index, zone in enumerate(zones):
            if not isinstance(zone, dict):
                errors.append(
                    self._issue(
                        "furnace_program",
                        f"zones[{zone_index}]",
                        "Furnace zone must be an object",
                    )
                )
                continue

            zone_key = zone.get("zone_key")
            if self._is_blank(zone_key):
                errors.append(
                    self._issue(
                        "furnace_program",
                        f"zones[{zone_index}].zone_key",
                        "Furnace zone key is required",
                    )
                )
            elif not isinstance(zone_key, str):
                errors.append(
                    self._issue(
                        "furnace_program",
                        f"zones[{zone_index}].zone_key",
                        "Furnace zone key must match declared zones",
                    )
                )
            else:
                zone_key_counts[zone_key] = zone_key_counts.get(zone_key, 0) + 1
                if declared_zone_keys and zone_key not in declared_zone_keys:
                    errors.append(
                        self._issue(
                            "furnace_program",
                            f"zones[{zone_index}].zone_key",
                            "Furnace zone key must match declared zones",
                        )
                    )

            if isinstance(zone_key, str) and zone_key_counts.get(zone_key, 0) > 1:
                errors.append(
                    self._issue(
                        "furnace_program",
                        "zones",
                        "Furnace zone key must be unique",
                    )
                )

            temperature_program = zone.get("temperature_program")
            if not isinstance(temperature_program, list) or len(temperature_program) < 2:
                errors.append(
                    self._issue(
                        "furnace_program",
                        f"zones[{zone_index}].temperature_program",
                        "Each furnace zone must have at least two temperature nodes",
                    )
                )
                continue

            previous_time: float | None = None
            for node_index, node in enumerate(temperature_program):
                if not isinstance(node, dict):
                    errors.append(
                        self._issue(
                            "furnace_program",
                            f"zones[{zone_index}].temperature_program[{node_index}]",
                            "Furnace temperature node must be an object",
                        )
                    )
                    continue

                time_min = node.get("time_min")
                if not self._is_number(time_min) or float(time_min) < 0:
                    errors.append(
                        self._issue(
                            "furnace_program",
                            f"zones[{zone_index}].temperature_program[{node_index}].time_min",
                            "Furnace temperature time must be a non-negative number",
                        )
                    )
                    continue

                time_value = float(time_min)
                if previous_time is not None and time_value <= previous_time:
                    errors.append(
                        self._issue(
                            "furnace_program",
                            f"zones[{zone_index}].temperature_program[{node_index}].time_min",
                            "Furnace zone time points must be strictly increasing",
                        )
                    )
                previous_time = time_value

                if not self._is_number(node.get("temperature_C")):
                    errors.append(
                        self._issue(
                            "furnace_program",
                            f"zones[{zone_index}].temperature_program[{node_index}].temperature_C",
                            "Furnace temperature must be a number",
                        )
                    )

        if declared_zone_keys and any(
            zone_key_counts.get(zone_key, 0) != 1 for zone_key in declared_zone_keys
        ):
            errors.append(
                self._issue(
                    "furnace_program",
                    "zones",
                    "Each declared furnace zone must have exactly one temperature program",
                )
            )

    def _validate_gas_program(
        self,
        gas_payload: dict | None,
        errors: list[ExperimentValidationIssue],
    ) -> None:
        gas_segments = gas_payload.get("segments") if isinstance(gas_payload, dict) else None
        if not isinstance(gas_segments, list) or not gas_segments:
            return

        normalized_segments: list[tuple[float, float]] = []
        malformed = False
        for index, segment in enumerate(gas_segments):
            if not isinstance(segment, dict):
                errors.append(
                    self._issue(
                        "gas_program", f"segments[{index}]", "Gas segment must be an object"
                    )
                )
                malformed = True
                continue
            start = segment.get("start_min")
            end = segment.get("end_min")
            if not self._is_number(start) or not self._is_number(end):
                errors.append(
                    self._issue(
                        "gas_program",
                        f"segments[{index}]",
                        "Gas segment boundaries must be numeric",
                    )
                )
                malformed = True
                continue
            if self._is_blank(segment.get("gas")):
                errors.append(
                    self._issue(
                        "gas_program",
                        f"segments[{index}].gas",
                        "Gas segment gas is required",
                    )
                )
                malformed = True
                continue
            components = segment.get("components")
            has_components = isinstance(components, list) and len(components) > 0
            if not has_components and not self._is_number(segment.get("flow_sccm")):
                errors.append(
                    self._issue(
                        "gas_program",
                        f"segments[{index}].flow_sccm",
                        (
                            "Gas segment flow_sccm is required"
                            " and must be numeric when no components"
                            " are specified"
                        ),
                    )
                )
                malformed = True
                continue
            if has_components:
                component_flow_sum = 0.0
                component_flow_valid = True
                for comp_index, component in enumerate(components):
                    if not isinstance(component, dict):
                        continue
                    comp_flow = component.get("flow_sccm")
                    if not self._is_number(comp_flow) or float(comp_flow) <= 0:
                        errors.append(
                            self._issue(
                                "gas_program",
                                f"segments[{index}].components[{comp_index}].flow_sccm",
                                "Gas component flow_sccm must be a positive number",
                            )
                        )
                        component_flow_valid = False
                    else:
                        component_flow_sum += float(comp_flow)
                if component_flow_valid and has_components and component_flow_sum <= 0:
                    errors.append(
                        self._issue(
                            "gas_program",
                            f"segments[{index}].components",
                            "Gas component flow_sccm values must sum to a positive number",
                        )
                    )
                    malformed = True
                    continue
            start_value = float(start)
            end_value = float(end)
            if end_value <= start_value:
                errors.append(
                    self._issue(
                        "gas_program",
                        f"segments[{index}].end_min",
                        "Gas segment end time must be greater than start time",
                    )
                )
                malformed = True
                continue
            normalized_segments.append((start_value, end_value))

        if malformed:
            return

        normalized_segments.sort(key=lambda item: item[0])
        if any(
            current_start < previous_end
            for previous_end, (current_start, _current_end) in zip(
                [segment[1] for segment in normalized_segments],
                normalized_segments[1:],
                strict=False,
            )
        ):
            errors.append(
                self._issue(
                    "gas_program",
                    "segments",
                    "Gas segments overlap",
                )
            )

    def _validate_characterization(
        self,
        characterization_payload: dict | None,
        errors: list[ExperimentValidationIssue],
    ) -> None:
        if not isinstance(characterization_payload, dict):
            return

        methods = characterization_payload.get("methods")
        if not isinstance(methods, list) or not methods:
            return

        for index, method in enumerate(methods):
            if not isinstance(method, dict):
                errors.append(
                    self._issue(
                        "characterization",
                        f"methods[{index}]",
                        "Characterization method record must be an object",
                    )
                )
                continue
            if self._is_blank(method.get("method")):
                errors.append(
                    self._issue(
                        "characterization",
                        f"methods[{index}].method",
                        "Characterization method is required",
                    )
                )

    def _validate_environment(
        self,
        environment_payload: dict | None,
        warnings: list[ExperimentValidationIssue],
    ) -> None:
        if not isinstance(environment_payload, dict):
            return

        indoor_temperature = environment_payload.get("indoor_temperature_C")
        if self._is_number(indoor_temperature) and not 15 <= float(indoor_temperature) <= 35:
            warnings.append(
                self._issue(
                    "environment",
                    "indoor_temperature_C",
                    "Indoor temperature is out of range",
                )
            )

        humidity = environment_payload.get("indoor_humidity_percent")
        if humidity is None:
            warnings.append(
                self._issue(
                    "environment",
                    "indoor_humidity_percent",
                    "Indoor humidity is missing",
                )
            )
        elif self._is_number(humidity) and not 0 <= float(humidity) <= 100:
            warnings.append(
                self._issue(
                    "environment",
                    "indoor_humidity_percent",
                    "Indoor humidity is out of range",
                )
            )

    def _validate_precheck(
        self,
        precheck_payload: dict | None,
        errors: list[ExperimentValidationIssue],
        warnings: list[ExperimentValidationIssue],
    ) -> None:
        if not isinstance(precheck_payload, dict):
            return

        if (
            precheck_payload.get("seal_intact") is False
            and not str(precheck_payload.get("risk_note") or "").strip()
        ):
            errors.append(
                self._issue(
                    "precheck",
                    "risk_note",
                    "Risk note is required when seal integrity fails",
                )
            )

        for field_name in ("boat_contamination_level", "tube_contamination_level"):
            if precheck_payload.get(field_name) is True:
                message = (
                    "Boat contamination is present"
                    if field_name == "boat_contamination_level"
                    else "Tube contamination is present"
                )
                warnings.append(
                    self._issue(
                        "precheck",
                        field_name,
                        message,
                    )
                )

    def _validate_files(
        self,
        experiment: ExperimentRun,
        files: list,
        errors: list[ExperimentValidationIssue],
        warnings: list[ExperimentValidationIssue],
    ) -> None:
        for index, file_asset in enumerate(files):
            if not str(file_asset.method or "").strip():
                errors.append(
                    self._issue(
                        "files",
                        f"items[{index}].method",
                        "File method is required",
                    )
                )
            if file_asset.experiment_run_id is None:
                errors.append(
                    self._issue(
                        "files",
                        f"items[{index}].experiment_id",
                        "File experiment_id is required",
                    )
                )
            elif file_asset.experiment_run_id != experiment.id:
                errors.append(
                    self._issue(
                        "files",
                        f"items[{index}].experiment_id",
                        "File experiment_id does not match experiment",
                    )
                )
            if file_asset.sample_id is None:
                warnings.append(
                    self._issue(
                        "files",
                        f"items[{index}].sample_id",
                        "File is not linked to a sample",
                    )
                )

    def _calculate_completion_score(
        self,
        *,
        experiment: ExperimentRun,
        module_payloads: dict[str, dict],
    ) -> int:
        precursor_payload = module_payloads.get(ExperimentModuleKey.PRECURSORS.value)
        precursor_items = self._payload_items(precursor_payload, "items")
        substrate_payload = module_payloads.get(ExperimentModuleKey.SUBSTRATES.value)
        substrate_items = self._payload_items(substrate_payload, "items")
        furnace_payload = module_payloads.get(ExperimentModuleKey.FURNACE_PROGRAM.value)
        furnace_zones = self._payload_items(furnace_payload, "zones")
        gas_payload = module_payloads.get(ExperimentModuleKey.GAS_PROGRAM.value)
        gas_segments = self._payload_items(gas_payload, "segments")
        environment_payload = module_payloads.get(ExperimentModuleKey.ENVIRONMENT.value)
        indoor_temperature = (
            environment_payload.get("indoor_temperature_C")
            if isinstance(environment_payload, dict)
            else None
        )
        indoor_humidity = (
            environment_payload.get("indoor_humidity_percent")
            if isinstance(environment_payload, dict)
            else None
        )

        checks = [
            not self._is_blank(experiment.experiment_type),
            not self._is_blank(experiment.material_system),
            experiment.experiment_date is not None,
            bool(precursor_items),
            self._all_items(precursor_items, lambda item: not self._is_blank(item.get("species"))),
            self._all_items(precursor_items, lambda item: not self._is_blank(item.get("method"))),
            self._all_items(
                precursor_items,
                lambda item: not self._is_blank(item.get("batch_no")),
            ),
            self._all_items(
                precursor_items,
                lambda item: (
                    not self._precursor_requires_mass(item)
                    or (item.get("mass_mg") is not None and self._is_number(item.get("mass_mg")))
                ),
            ),
            bool(substrate_items),
            self._all_items(
                substrate_items,
                lambda item: item.get("role") in {"top", "bottom"},
            ),
            self._all_items(substrate_items, lambda item: not self._is_blank(item.get("type"))),
            self._furnace_zones_cover_declared_zones(furnace_payload, furnace_zones),
            self._all_furnace_zones_have_temperature_programs(furnace_zones),
            self._all_furnace_zone_times_increase(furnace_zones),
            bool(gas_segments),
            self._all_gas_segments_have_valid_boundaries(gas_segments),
            self._all_items(gas_segments, lambda item: not self._is_blank(item.get("gas"))),
            self._all_items(
                gas_segments,
                lambda item: (
                    self._is_number(item.get("flow_sccm"))
                    or (
                        isinstance(item.get("components"), list)
                        and len(item["components"]) > 0
                        and any(
                            isinstance(c, dict) and self._is_number(c.get("flow_sccm"))
                            for c in item["components"]
                        )
                    )
                ),
            ),
            self._gas_segments_do_not_overlap(gas_segments),
            self._is_number(indoor_temperature) and 15 <= float(indoor_temperature) <= 35,
            self._is_number(indoor_humidity) and 0 <= float(indoor_humidity) <= 100,
        ]

        return round(sum(1 for check in checks if check) / len(checks) * 100)

    def _issue(self, module_key: str, field_path: str, message: str) -> ExperimentValidationIssue:
        translated_message = ISSUE_MESSAGE_ZH.get(message)

        return ExperimentValidationIssue(
            module_key=module_key,
            field_path=field_path,
            message=translated_message or message,
        )

    def _precursor_requires_mass(self, item: dict) -> bool:
        method = str(item.get("method") or "").strip().lower()
        return method not in {"solution", "spin_coating"}

    def _schema_validation_issues(
        self,
        module_key: str,
        exc: ValidationError,
    ) -> list[ExperimentValidationIssue]:
        return [
            self._issue(
                module_key,
                self._format_validation_loc(error.get("loc", ())),
                SCHEMA_VALIDATION_MESSAGE_ZH.get(
                    str(error.get("type", "")),
                    "模块数据格式无效",
                ),
            )
            for error in exc.errors()
        ]

    def _format_validation_loc(self, loc: object) -> str:
        if not isinstance(loc, tuple):
            return "payload_json"

        field_path = ""
        for part in loc:
            if isinstance(part, int):
                field_path = f"{field_path}[{part}]"
            elif field_path:
                field_path = f"{field_path}.{part}"
            else:
                field_path = str(part)
        return field_path or "payload_json"

    def _is_number(self, value: object) -> bool:
        return isinstance(value, int | float) and not isinstance(value, bool)

    def _is_blank(self, value: object) -> bool:
        return not str(value or "").strip()

    def _payload_items(self, payload: dict | None, key: str) -> list[dict]:
        if not isinstance(payload, dict):
            return []
        value = payload.get(key)
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, dict)]

    def _all_items(self, items: list[dict], predicate) -> bool:
        return bool(items) and all(predicate(item) for item in items)

    def _declared_furnace_zone_keys(self, furnace_payload: dict | None) -> list[str]:
        if not isinstance(furnace_payload, dict):
            return []
        furnace_info = furnace_payload.get("furnace_info")
        if not isinstance(furnace_info, dict):
            return []
        zones_count = furnace_info.get("zones_count")
        if not isinstance(zones_count, int) or isinstance(zones_count, bool) or zones_count <= 0:
            return []
        return [f"zone_{index + 1}" for index in range(zones_count)]

    def _furnace_zones_cover_declared_zones(
        self,
        furnace_payload: dict | None,
        zones: list[dict],
    ) -> bool:
        if not zones:
            return False
        declared_zone_keys = self._declared_furnace_zone_keys(furnace_payload)
        if not declared_zone_keys:
            return True

        actual_zone_keys = [
            zone.get("zone_key")
            for zone in zones
            if isinstance(zone.get("zone_key"), str) and not self._is_blank(zone.get("zone_key"))
        ]
        return (
            len(actual_zone_keys) == len(zones)
            and len(actual_zone_keys) == len(declared_zone_keys)
            and set(actual_zone_keys) == set(declared_zone_keys)
        )

    def _all_furnace_zones_have_temperature_programs(self, zones: list[dict]) -> bool:
        return bool(zones) and all(
            isinstance(zone.get("temperature_program"), list)
            and len(zone["temperature_program"]) >= 2
            and all(
                isinstance(node, dict)
                and self._is_number(node.get("time_min"))
                and float(node["time_min"]) >= 0
                and self._is_number(node.get("temperature_C"))
                for node in zone["temperature_program"]
            )
            for zone in zones
            if isinstance(zone, dict)
        )

    def _all_furnace_zone_times_increase(self, zones: list[dict]) -> bool:
        if not self._all_furnace_zones_have_temperature_programs(zones):
            return False
        return all(
            self._strictly_increasing(
                [float(node["time_min"]) for node in zone["temperature_program"]]
            )
            for zone in zones
            if isinstance(zone, dict)
        )

    def _strictly_increasing(self, values: list[float]) -> bool:
        return all(
            current > previous for previous, current in zip(values, values[1:], strict=False)
        )

    def _all_gas_segments_have_valid_boundaries(self, segments: list[dict]) -> bool:
        return bool(segments) and all(
            self._is_number(segment.get("start_min"))
            and self._is_number(segment.get("end_min"))
            and float(segment["end_min"]) > float(segment["start_min"])
            for segment in segments
        )

    def _gas_segments_do_not_overlap(self, segments: list[dict]) -> bool:
        if not self._all_gas_segments_have_valid_boundaries(segments):
            return False
        normalized_segments = [
            (float(segment["start_min"]), float(segment["end_min"])) for segment in segments
        ]
        return self._has_non_overlapping_segments(normalized_segments)

    def _has_non_overlapping_segments(self, segments: list[tuple[float, float]]) -> bool:
        if not segments:
            return False
        if any(end <= start for start, end in segments):
            return False

        normalized_segments = sorted(segments, key=lambda item: item[0])
        return all(
            current_start >= previous_end
            for previous_end, (current_start, _current_end) in zip(
                [segment[1] for segment in normalized_segments],
                normalized_segments[1:],
                strict=False,
            )
        )
