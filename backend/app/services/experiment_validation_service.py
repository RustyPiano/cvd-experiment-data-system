from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, QualityLabel
from app.models.module_payload import ExperimentModuleKey, normalize_module_payload
from app.repositories.file_asset_repository import FileAssetRepository
from app.repositories.module_payload_repository import ModulePayloadRepository
from app.schemas.experiment_validation import (
    ExperimentValidationIssue,
    ExperimentValidationResponse,
)


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
        module_payloads = self._module_payload_map(experiment.id)
        files = self.files.list_by_experiment(experiment.id)
        errors: list[ExperimentValidationIssue] = []
        warnings: list[ExperimentValidationIssue] = []

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

    def _module_payload_map(self, experiment_id: UUID) -> dict[str, dict]:
        return {
            item.module_key: normalize_module_payload(item.module_key, item.payload_json)
            for item in self.module_payloads.list_by_run(experiment_id)
        }

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
            if self._is_blank(item.get("type")):
                errors.append(
                    self._issue(
                        "precursors",
                        f"items[{index}].type",
                        "Precursor type is required",
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
            if item.get("mass_mg") is None:
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
        furnace_zones = furnace_payload.get("zones") if isinstance(furnace_payload, dict) else None
        if not isinstance(furnace_zones, list) or not furnace_zones:
            errors.append(
                self._issue(
                    "furnace_program",
                    "zones",
                    "At least one furnace zone is required",
                )
            )
            return

        for zone_index, zone in enumerate(furnace_zones):
            if not isinstance(zone, dict):
                errors.append(
                    self._issue(
                        "furnace_program",
                        f"zones[{zone_index}]",
                        "Furnace zone must be an object",
                    )
                )
                continue

            temperature_program = zone.get("temperature_program")
            if not isinstance(temperature_program, list) or not temperature_program:
                errors.append(
                    self._issue(
                        "furnace_program",
                        f"zones[{zone_index}].temperature_program",
                        "Temperature program is required",
                    )
                )
                continue

            time_points: list[float] = []
            malformed = False
            for point_index, point in enumerate(temperature_program):
                if not isinstance(point, dict):
                    errors.append(
                        self._issue(
                            "furnace_program",
                            f"zones[{zone_index}].temperature_program[{point_index}]",
                            "Furnace program point must be an object",
                        )
                    )
                    malformed = True
                    continue

                time_min = point.get("time_min")
                if not self._is_number(time_min):
                    errors.append(
                        self._issue(
                            "furnace_program",
                            f"zones[{zone_index}].temperature_program[{point_index}].time_min",
                            "Furnace program time_min must be numeric",
                        )
                    )
                    malformed = True
                    continue
                temperature = point.get("temperature_C")
                if not self._is_number(temperature):
                    errors.append(
                        self._issue(
                            "furnace_program",
                            (
                                f"zones[{zone_index}].temperature_program"
                                f"[{point_index}].temperature_C"
                            ),
                            "Furnace program temperature_C is required and must be numeric",
                        )
                    )
                    malformed = True
                    continue
                time_points.append(float(time_min))

            if malformed:
                continue

            if any(
                current <= previous
                for previous, current in zip(time_points, time_points[1:], strict=False)
            ):
                errors.append(
                    self._issue(
                        "furnace_program",
                        f"zones[{zone_index}].temperature_program",
                        "Furnace program time points must be strictly increasing",
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
            if not self._is_number(segment.get("flow_sccm")):
                errors.append(
                    self._issue(
                        "gas_program",
                        f"segments[{index}].flow_sccm",
                        "Gas segment flow_sccm is required and must be numeric",
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
            value = str(precheck_payload.get(field_name) or "").strip().lower()
            if value == "high":
                warnings.append(
                    self._issue(
                        "precheck",
                        field_name,
                        f"{field_name} is high",
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
            experiment.owner_id is not None,
            bool(precursor_items),
            self._all_items(precursor_items, lambda item: not self._is_blank(item.get("type"))),
            self._all_items(precursor_items, lambda item: not self._is_blank(item.get("method"))),
            self._all_items(
                precursor_items,
                lambda item: not self._is_blank(item.get("batch_no")),
            ),
            self._all_items(
                precursor_items,
                lambda item: (
                    item.get("mass_mg") is not None and self._is_number(item.get("mass_mg"))
                ),
            ),
            bool(substrate_items),
            self._all_items(
                substrate_items,
                lambda item: item.get("role") in {"top", "bottom"},
            ),
            self._all_items(substrate_items, lambda item: not self._is_blank(item.get("type"))),
            bool(furnace_zones),
            self._all_furnace_zones_have_temperature_program(furnace_zones),
            self._all_furnace_points_have_numeric_field(furnace_zones, "time_min"),
            self._all_furnace_points_have_numeric_field(furnace_zones, "temperature_C"),
            self._all_furnace_programs_strictly_increasing(furnace_zones),
            bool(gas_segments),
            self._all_gas_segments_have_valid_boundaries(gas_segments),
            self._all_items(gas_segments, lambda item: not self._is_blank(item.get("gas"))),
            self._all_items(
                gas_segments,
                lambda item: self._is_number(item.get("flow_sccm")),
            ),
            self._gas_segments_do_not_overlap(gas_segments),
            self._is_number(indoor_temperature) and 15 <= float(indoor_temperature) <= 35,
            self._is_number(indoor_humidity) and 0 <= float(indoor_humidity) <= 100,
        ]

        return round(sum(1 for check in checks if check) / len(checks) * 100)

    def _issue(self, module_key: str, field_path: str, message: str) -> ExperimentValidationIssue:
        return ExperimentValidationIssue(
            module_key=module_key,
            field_path=field_path,
            message=message,
        )

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

    def _furnace_temperature_programs(self, zones: list[dict]) -> list[list[dict]]:
        programs: list[list[dict]] = []
        for zone in zones:
            temperature_program = zone.get("temperature_program")
            if not isinstance(temperature_program, list):
                programs.append([])
                continue
            programs.append([point for point in temperature_program if isinstance(point, dict)])
        return programs

    def _all_furnace_zones_have_temperature_program(self, zones: list[dict]) -> bool:
        programs = self._furnace_temperature_programs(zones)
        return bool(programs) and all(bool(program) for program in programs)

    def _all_furnace_points_have_numeric_field(
        self,
        zones: list[dict],
        field_name: str,
    ) -> bool:
        programs = self._furnace_temperature_programs(zones)
        return bool(programs) and all(
            bool(program) and all(self._is_number(point.get(field_name)) for point in program)
            for program in programs
        )

    def _all_furnace_programs_strictly_increasing(self, zones: list[dict]) -> bool:
        programs = self._furnace_temperature_programs(zones)
        if not programs:
            return False
        for program in programs:
            time_points = [
                float(point["time_min"])
                for point in program
                if self._is_number(point.get("time_min"))
            ]
            if len(time_points) != len(program) or not self._is_strictly_increasing(time_points):
                return False
        return True

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

    def _is_strictly_increasing(self, values: list[float]) -> bool:
        if not values:
            return False
        return all(
            current > previous for previous, current in zip(values, values[1:], strict=False)
        )

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
