from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.sample import Sample
from app.models.user import User
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.repositories.experiment_repository import ExperimentRepository
from app.services.experiment_guards import get_visible_experiment
from app.services.v2_field_source import (
    SCHEMA_VERSION,
    canonical_option_value,
    canonicalize_controlled_values,
    payload_fields_by_module,
)


def _iso(value: date | datetime | None) -> str:
    return value.isoformat() if value is not None else ""


def _cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        raise ValueError("Nested values must be normalized before CSV export")
    if isinstance(value, (date, datetime)):
        value = value.isoformat()
    if isinstance(value, str):
        significant = value.lstrip(" \t\r\n")
        if significant.startswith(("=", "+", "-", "@")):
            return f"'{value}"
    return value


def _walk_nested_leaves(value: Any, path: str = "") -> list[tuple[str, Any]]:
    if isinstance(value, dict):
        leaves = [
            leaf
            for key in sorted(value)
            for leaf in _walk_nested_leaves(
                value[key],
                f"{path}.{key}" if path else str(key),
            )
        ]
        return leaves or [(path, "")]
    if isinstance(value, list):
        leaves = [
            leaf
            for index, item in enumerate(value)
            for leaf in _walk_nested_leaves(item, f"{path}[{index}]")
        ]
        return leaves or [(path, "")]
    return [(path, value)]


def _nested_leaves(value: Any, path: str = "") -> list[tuple[str, Any]]:
    """Flatten export details only after recursively normalizing controlled values."""
    return _walk_nested_leaves(canonicalize_controlled_values(value), path)


def _relational_rows(
    base: dict[str, Any],
    values: dict[str, Any],
) -> list[dict[str, Any]]:
    scalar_values = {
        key: value for key, value in values.items() if not isinstance(value, (dict, list))
    }
    nested = [
        (key, path, value)
        for key, container in values.items()
        if isinstance(container, (dict, list))
        for path, value in _nested_leaves(container)
    ]
    common = {
        **base,
        **scalar_values,
        "nested_field": "",
        "nested_path": "",
        "nested_value": "",
    }
    if not nested:
        return [common]
    return [
        {
            **common,
            "nested_field": key,
            "nested_path": path,
            "nested_value": value,
        }
        for key, path, value in nested
    ]


def _result_rows(
    base: dict[str, Any],
    observed_phenomena: list[str] | None,
    details: dict[str, Any],
) -> list[dict[str, Any]]:
    rows = [
        {
            **base,
            "observed_phenomenon": phenomenon,
            "detail_scope": "",
            "detail_path": "",
            "detail_value": "",
        }
        for phenomenon in observed_phenomena or []
    ]
    for scope, value in details.items():
        if value is None or value == {} or value == []:
            continue
        leaves = _nested_leaves(value) if isinstance(value, (dict, list)) else [("", value)]
        rows.extend(
            {
                **base,
                "observed_phenomenon": "",
                "detail_scope": scope,
                "detail_path": path,
                "detail_value": leaf,
            }
            for path, leaf in leaves
        )
    return rows or [
        {
            **base,
            "observed_phenomenon": "",
            "detail_scope": "",
            "detail_path": "",
            "detail_value": "",
        }
    ]


class V2ReportingService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)

    def export_run_json(self, run_id: UUID, current_user: User) -> tuple[bytes, str]:
        run = get_visible_experiment(
            self.experiments,
            run_id,
            current_user,
            schema_version=SCHEMA_VERSION,
        )
        content = json.dumps(
            self._run_bundle(run),
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")
        return content, f"{run.run_code}.json"

    def export_runs_zip(
        self,
        current_user: User,
        *,
        query_text: str | None = None,
        material_system: str | None = None,
        operator: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        status_filters: list[ExperimentStatus] | None = None,
    ) -> tuple[bytes, str]:
        runs = self._visible_runs_for_export(
            current_user,
            query_text=query_text,
            material_system=material_system,
            operator=operator,
            date_from=date_from,
            date_to=date_to,
            status_filters=status_filters,
        )
        tables = self._csv_tables(runs)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for filename, (fieldnames, rows) in tables.items():
                archive.writestr(filename, self._csv_bytes(fieldnames, rows))
        stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        return buffer.getvalue(), f"cvd-runs-{stamp}.zip"

    def _visible_runs_for_export(
        self,
        current_user: User,
        **filters: Any,
    ) -> list[ExperimentRun]:
        page = 1
        page_size = 1_000
        runs: list[ExperimentRun] = []
        while True:
            batch, total = self.experiments.list_visible(
                current_user=current_user,
                page=page,
                page_size=page_size,
                sort_by="experiment_date",
                sort_order="asc",
                schema_version=SCHEMA_VERSION,
                **filters,
            )
            runs.extend(batch)
            if len(runs) >= total:
                return runs
            page += 1

    def _run_bundle(self, run: ExperimentRun) -> dict[str, Any]:
        modules = {
            item.module_key: canonicalize_controlled_values(item.payload_json)
            for item in run.module_payloads
        }
        operator = (modules.get("basic_info") or {}).get("operator") or run.owner_name
        samples = self._samples(run.id)
        records = self._records(run.id)
        products = self._products(samples)
        files = self._files(run.id)
        sample_by_id = {sample.id: sample for sample in samples}
        record_by_id = {record.id: record for record in records}
        files_by_record: dict[UUID, list[FileAsset]] = {}
        for file in files:
            if file.characterization_record_id:
                files_by_record.setdefault(file.characterization_record_id, []).append(file)

        products_by_record: dict[UUID, list[MeasuredProduct]] = {}
        for product in products:
            if product.characterization_record_id:
                products_by_record.setdefault(product.characterization_record_id, []).append(
                    product
                )

        results_by_sample: dict[UUID, list[dict[str, Any]]] = {}
        for product in products:
            record = (
                record_by_id.get(product.characterization_record_id)
                if product.characterization_record_id
                else None
            )
            result_files = files_by_record.get(record.id, []) if record else []
            results_by_sample.setdefault(product.sample_id, []).append(
                self._result_json(product, record, result_files)
            )
        for record in records:
            if products_by_record.get(record.id):
                continue
            results_by_sample.setdefault(record.sample_id, []).append(
                self._standalone_record_json(record, files_by_record.get(record.id, []))
            )

        sample_json = []
        for sample in samples:
            parent = sample_by_id.get(sample.parent_sample_id) if sample.parent_sample_id else None
            sample_json.append(
                {
                    "id": str(sample.id),
                    "sample_code": sample.sample_code,
                    "role": sample.role,
                    "parent_sample_code": parent.sample_code if parent else None,
                    "source_substrate_id": (
                        str(sample.source_substrate_id) if sample.source_substrate_id else None
                    ),
                    "source_substrate_snapshot": sample.source_substrate_snapshot_json,
                    "metadata": sample.metadata_json,
                    "created_at": _iso(sample.created_at),
                    "updated_at": _iso(sample.updated_at),
                    "deleted_at": _iso(sample.deleted_at) or None,
                    "results": results_by_sample.get(sample.id, []),
                }
            )

        attached_file_ids = {file.id for rows in files_by_record.values() for file in rows}
        bundle = {
            "schema_version": SCHEMA_VERSION,
            "exported_at": datetime.now(UTC).isoformat(),
            "run": {
                "id": str(run.id),
                "run_code": run.run_code,
                "operator": operator,
                "material_system": run.material_system,
                "experiment_date": run.experiment_date.isoformat(),
                "objective": run.objective,
                "status": run.status.value,
                "invalid_reason": run.invalid_reason,
                "result_missing_todo": run.result_missing_todo,
                "not_characterized_by_id": (
                    str(run.not_characterized_by_id) if run.not_characterized_by_id else None
                ),
                "not_characterized_at": _iso(run.not_characterized_at) or None,
                "created_at": _iso(run.created_at),
                "updated_at": _iso(run.updated_at),
                "locked_at": _iso(run.locked_at) or None,
                "setup_reference": {
                    "id": str(run.setup_ref) if run.setup_ref else None,
                    "version": run.setup_ref_version,
                    "snapshot": run.setup_ref_snapshot_json,
                },
            },
            "modules": modules,
            "samples": sample_json,
            "other_files": [
                self._file_json(file) for file in files if file.id not in attached_file_ids
            ],
        }
        return canonicalize_controlled_values(bundle)

    def _csv_tables(
        self, runs: list[ExperimentRun]
    ) -> dict[str, tuple[list[str], list[dict[str, Any]]]]:
        module_fields = payload_fields_by_module()
        precursor_keys = [field["key"] for field in module_fields["precursors"]]
        substrate_keys = [field["key"] for field in module_fields["substrates"]]
        process_keys = [field["key"] for field in module_fields["process_steps"]]

        run_rows: list[dict[str, Any]] = []
        precursor_rows: list[dict[str, Any]] = []
        substrate_rows: list[dict[str, Any]] = []
        process_rows: list[dict[str, Any]] = []
        source_snapshot_keys = [f"source_{key}" for key in substrate_keys]
        sample_rows: list[dict[str, Any]] = []
        result_rows: list[dict[str, Any]] = []
        file_rows: list[dict[str, Any]] = []

        for run in runs:
            modules = {
                item.module_key: canonicalize_controlled_values(item.payload_json)
                for item in run.module_payloads
            }
            operator = (modules.get("basic_info") or {}).get("operator") or run.owner_name
            samples = self._samples(run.id)
            records = self._records(run.id)
            products = self._products(samples)
            files = self._files(run.id)
            sample_by_id = {sample.id: sample for sample in samples}
            sample_by_source = {
                str(sample.source_substrate_id): sample
                for sample in samples
                if sample.source_substrate_id
            }
            record_by_id = {record.id: record for record in records}

            setup_snapshot = canonicalize_controlled_values(run.setup_ref_snapshot_json or {})
            setup_attrs = setup_snapshot.get("attrs_snapshot")
            setup_leaves = (
                _nested_leaves(setup_attrs) if isinstance(setup_attrs, (dict, list)) else []
            )
            run_row = {
                "run_code": run.run_code,
                "operator": operator,
                "material_system": run.material_system,
                "experiment_date": run.experiment_date,
                "status": run.status.value,
                "objective": run.objective,
                "invalid_reason": run.invalid_reason,
                "result_missing_todo": run.result_missing_todo,
                "not_characterized_at": run.not_characterized_at,
                "setup_reference_id": run.setup_ref,
                "setup_version": run.setup_ref_version,
                "setup_code": setup_snapshot.get("setup_code_snapshot"),
                "setup_name": setup_snapshot.get("setup_name_snapshot"),
                "setup_zone_count": setup_snapshot.get("zone_count_snapshot"),
                "setup_orientation": setup_snapshot.get("orientation_snapshot"),
                "setup_coordinate_system": setup_snapshot.get("coordinate_system_snapshot"),
                "created_at": run.created_at,
                "locked_at": run.locked_at,
                "setup_detail_path": "",
                "setup_detail_value": "",
            }
            if setup_leaves:
                run_rows.extend(
                    {
                        **run_row,
                        "setup_detail_path": path,
                        "setup_detail_value": value,
                    }
                    for path, value in setup_leaves
                )
            else:
                run_rows.append(run_row)
            self._extend_module_rows(
                precursor_rows,
                run.run_code,
                modules.get("precursors"),
                precursor_keys,
            )
            self._extend_module_rows(
                process_rows,
                run.run_code,
                modules.get("process_steps"),
                process_keys,
            )
            for index, item in enumerate((modules.get("substrates") or {}).get("items", []), 1):
                source_id = str(item.get("source_id") or "")
                generated = sample_by_source.get(source_id)
                substrate_rows.extend(
                    _relational_rows(
                        {
                            "run_code": run.run_code,
                            "item_index": index,
                            "sample_code": generated.sample_code if generated else "",
                        },
                        {key: item.get(key) for key in substrate_keys},
                    )
                )

            for sample in samples:
                parent = (
                    sample_by_id.get(sample.parent_sample_id) if sample.parent_sample_id else None
                )
                sample_rows.extend(
                    _relational_rows(
                        {
                            "run_code": run.run_code,
                            "sample_code": sample.sample_code,
                            "role": sample.role,
                            "parent_sample_code": parent.sample_code if parent else "",
                            "deleted_at": sample.deleted_at,
                        },
                        {
                            **{
                                f"source_{key}": canonicalize_controlled_values(
                                    sample.source_substrate_snapshot_json or {}
                                ).get(key, "")
                                for key in substrate_keys
                            },
                            "sample_metadata": sample.metadata_json,
                        },
                    )
                )

            result_codes_by_record: dict[UUID, list[str]] = {}
            per_sample_index: dict[UUID, int] = {}
            for product in products:
                sample = sample_by_id[product.sample_id]
                per_sample_index[sample.id] = per_sample_index.get(sample.id, 0) + 1
                result_code = f"{sample.sample_code}-R{per_sample_index[sample.id]:02d}"
                record = (
                    record_by_id.get(product.characterization_record_id)
                    if product.characterization_record_id
                    else None
                )
                result_row = {
                    "run_code": run.run_code,
                    "sample_code": sample.sample_code,
                    "result_code": result_code,
                    "kind": "characterization" if record else "direct_observation",
                    "method": (canonical_option_value(record.method_instrument) if record else ""),
                    "test_conditions": record.test_conditions if record else "",
                    "detected_phase_stacking": product.detected_phase_stacking,
                    "measured_layers_coverage": product.measured_layers_coverage,
                    "domain_nucleation_continuity": product.domain_nucleation_continuity,
                    "created_at": product.created_at,
                }
                result_rows.extend(
                    _result_rows(
                        result_row,
                        (
                            [canonical_option_value(value) for value in product.observed_phenomena]
                            if product.observed_phenomena
                            else product.observed_phenomena
                        ),
                        {
                            "instrument_snapshot": (
                                record.instrument_snapshot_json if record else None
                            ),
                            "raw_data": record.raw_data if record else None,
                            "record_attrs": record.attrs if record else None,
                            "key_spectral_metrics": product.key_spectral_metrics,
                            "measurement_attrs": product.attrs,
                        },
                    )
                )
                if record:
                    result_codes_by_record.setdefault(record.id, []).append(result_code)

            linked_record_ids = set(result_codes_by_record)
            for record in records:
                if record.id in linked_record_ids:
                    continue
                sample = sample_by_id[record.sample_id]
                per_sample_index[sample.id] = per_sample_index.get(sample.id, 0) + 1
                result_code = f"{sample.sample_code}-R{per_sample_index[sample.id]:02d}"
                result_codes_by_record[record.id] = [result_code]
                result_rows.extend(
                    _result_rows(
                        {
                            "run_code": run.run_code,
                            "sample_code": sample.sample_code,
                            "result_code": result_code,
                            "kind": "characterization",
                            "method": canonical_option_value(record.method_instrument),
                            "test_conditions": record.test_conditions,
                            "detected_phase_stacking": "",
                            "measured_layers_coverage": "",
                            "domain_nucleation_continuity": "",
                            "created_at": record.created_at,
                        },
                        None,
                        {
                            "instrument_snapshot": record.instrument_snapshot_json,
                            "raw_data": record.raw_data,
                            "record_attrs": record.attrs,
                        },
                    )
                )

            for file in files:
                record = record_by_id.get(file.characterization_record_id)
                sample_id = file.sample_id or (record.sample_id if record else None)
                sample = sample_by_id.get(sample_id) if sample_id else None
                related_codes = (
                    result_codes_by_record.get(file.characterization_record_id, [])
                    if file.characterization_record_id
                    else []
                )
                metadata_leaves = _nested_leaves(file.metadata_json) if file.metadata_json else []
                for result_code in related_codes or [""]:
                    file_row = {
                        "run_code": run.run_code,
                        "sample_code": sample.sample_code if sample else "",
                        "result_code": result_code,
                        "filename": file.original_name,
                        "method": canonical_option_value(file.method),
                        "file_category": file.file_category,
                        "asset_role": file.asset_role,
                        "file_kind": canonical_option_value(file.file_kind),
                        "note": file.note,
                        "content_type": file.content_type,
                        "size_bytes": file.size_bytes,
                        "sha256": file.sha256,
                        "download_url": (
                            f"/api/v1/files/{file.id}/download" if file.deleted_at is None else ""
                        ),
                        "is_deleted": file.deleted_at is not None,
                        "created_at": file.created_at,
                        "updated_at": file.updated_at,
                        "deleted_at": file.deleted_at,
                        "metadata_path": "",
                        "metadata_value": "",
                    }
                    if metadata_leaves:
                        file_rows.extend(
                            {
                                **file_row,
                                "metadata_path": path,
                                "metadata_value": value,
                            }
                            for path, value in metadata_leaves
                        )
                    else:
                        file_rows.append(file_row)

        return {
            "runs.csv": (
                [
                    "run_code",
                    "operator",
                    "material_system",
                    "experiment_date",
                    "status",
                    "objective",
                    "invalid_reason",
                    "result_missing_todo",
                    "not_characterized_at",
                    "setup_reference_id",
                    "setup_version",
                    "setup_code",
                    "setup_name",
                    "setup_zone_count",
                    "setup_orientation",
                    "setup_coordinate_system",
                    "setup_detail_path",
                    "setup_detail_value",
                    "created_at",
                    "locked_at",
                ],
                run_rows,
            ),
            "precursors.csv": (
                [
                    "run_code",
                    "item_index",
                    *precursor_keys,
                    "nested_field",
                    "nested_path",
                    "nested_value",
                ],
                precursor_rows,
            ),
            "substrates.csv": (
                [
                    "run_code",
                    "item_index",
                    "sample_code",
                    *substrate_keys,
                    "nested_field",
                    "nested_path",
                    "nested_value",
                ],
                substrate_rows,
            ),
            "process_steps.csv": (
                [
                    "run_code",
                    "item_index",
                    *process_keys,
                    "nested_field",
                    "nested_path",
                    "nested_value",
                ],
                process_rows,
            ),
            "samples.csv": (
                [
                    "run_code",
                    "sample_code",
                    "role",
                    "parent_sample_code",
                    *source_snapshot_keys,
                    "deleted_at",
                    "nested_field",
                    "nested_path",
                    "nested_value",
                ],
                sample_rows,
            ),
            "characterization_results.csv": (
                [
                    "run_code",
                    "sample_code",
                    "result_code",
                    "kind",
                    "method",
                    "test_conditions",
                    "observed_phenomenon",
                    "detected_phase_stacking",
                    "measured_layers_coverage",
                    "domain_nucleation_continuity",
                    "detail_scope",
                    "detail_path",
                    "detail_value",
                    "created_at",
                ],
                result_rows,
            ),
            "files.csv": (
                [
                    "run_code",
                    "sample_code",
                    "result_code",
                    "filename",
                    "method",
                    "file_category",
                    "asset_role",
                    "file_kind",
                    "note",
                    "content_type",
                    "size_bytes",
                    "sha256",
                    "download_url",
                    "is_deleted",
                    "created_at",
                    "updated_at",
                    "deleted_at",
                    "metadata_path",
                    "metadata_value",
                ],
                file_rows,
            ),
        }

    @staticmethod
    def _extend_module_rows(
        target: list[dict[str, Any]],
        run_code: str,
        payload: dict[str, Any] | None,
        field_keys: list[str],
    ) -> None:
        for index, item in enumerate((payload or {}).get("items", []), 1):
            target.extend(
                _relational_rows(
                    {"run_code": run_code, "item_index": index},
                    {key: item.get(key) for key in field_keys},
                )
            )

    @staticmethod
    def _csv_bytes(fieldnames: list[str], rows: list[dict[str, Any]]) -> bytes:
        stream = io.StringIO(newline="")
        writer = csv.DictWriter(stream, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows({key: _cell(value) for key, value in row.items()} for row in rows)
        return stream.getvalue().encode("utf-8-sig")

    def _samples(self, run_id: UUID) -> list[Sample]:
        return list(
            self.db.scalars(
                select(Sample)
                .where(Sample.experiment_run_id == run_id)
                .order_by(Sample.sample_code.asc())
            )
        )

    def _records(self, run_id: UUID) -> list[CharacterizationRecord]:
        return list(
            self.db.scalars(
                select(CharacterizationRecord)
                .where(CharacterizationRecord.experiment_run_id == run_id)
                .order_by(CharacterizationRecord.created_at.asc())
            )
        )

    def _products(self, samples: list[Sample]) -> list[MeasuredProduct]:
        sample_ids = [sample.id for sample in samples]
        if not sample_ids:
            return []
        return list(
            self.db.scalars(
                select(MeasuredProduct)
                .where(MeasuredProduct.sample_id.in_(sample_ids))
                .order_by(MeasuredProduct.created_at.asc(), MeasuredProduct.id.asc())
            )
        )

    def _files(self, run_id: UUID) -> list[FileAsset]:
        return list(
            self.db.scalars(
                select(FileAsset)
                .where(FileAsset.experiment_run_id == run_id)
                .order_by(FileAsset.created_at.asc(), FileAsset.id.asc())
            )
        )

    @staticmethod
    def _result_json(
        product: MeasuredProduct,
        record: CharacterizationRecord | None,
        files: list[FileAsset],
    ) -> dict[str, Any]:
        return {
            "id": str(product.id),
            "kind": "characterization" if record else "direct_observation",
            "record": (V2ReportingService._record_json(record, files) if record else None),
            "measurement": V2ReportingService._measurement_json(product),
            "created_at": _iso(product.created_at),
            "updated_at": _iso(product.updated_at),
        }

    @staticmethod
    def _standalone_record_json(
        record: CharacterizationRecord,
        files: list[FileAsset],
    ) -> dict[str, Any]:
        return {
            "id": str(record.id),
            "kind": "characterization",
            "record": V2ReportingService._record_json(record, files),
            "measurement": None,
            "created_at": _iso(record.created_at),
            "updated_at": _iso(record.updated_at),
        }

    @staticmethod
    def _record_json(
        record: CharacterizationRecord,
        files: list[FileAsset],
    ) -> dict[str, Any]:
        return {
            "id": str(record.id),
            "instrument_id": str(record.instrument_id) if record.instrument_id else None,
            "instrument_version": record.instrument_version,
            "instrument_snapshot": record.instrument_snapshot_json,
            "method": canonical_option_value(record.method_instrument),
            "test_conditions": record.test_conditions,
            "raw_data": record.raw_data,
            "attrs": record.attrs,
            "created_at": _iso(record.created_at),
            "updated_at": _iso(record.updated_at),
            "files": [V2ReportingService._file_json(file) for file in files],
        }

    @staticmethod
    def _measurement_json(product: MeasuredProduct) -> dict[str, Any]:
        return {
            "id": str(product.id),
            "observed_phenomena": (
                [canonical_option_value(value) for value in product.observed_phenomena]
                if product.observed_phenomena
                else product.observed_phenomena
            ),
            "detected_phase_stacking": product.detected_phase_stacking,
            "measured_layers_coverage": product.measured_layers_coverage,
            "domain_nucleation_continuity": product.domain_nucleation_continuity,
            "key_spectral_metrics": product.key_spectral_metrics,
            "attrs": product.attrs,
            "created_at": _iso(product.created_at),
            "updated_at": _iso(product.updated_at),
        }

    @staticmethod
    def _file_json(file: FileAsset) -> dict[str, Any]:
        return {
            "id": str(file.id),
            "sample_id": str(file.sample_id) if file.sample_id else None,
            "characterization_record_id": (
                str(file.characterization_record_id) if file.characterization_record_id else None
            ),
            "filename": file.original_name,
            "method": canonical_option_value(file.method),
            "file_category": file.file_category,
            "asset_role": file.asset_role,
            "file_kind": canonical_option_value(file.file_kind),
            "note": file.note,
            "content_type": file.content_type,
            "size_bytes": file.size_bytes,
            "sha256": file.sha256,
            "metadata": file.metadata_json,
            "download_url": (
                f"/api/v1/files/{file.id}/download" if file.deleted_at is None else None
            ),
            "deleted_at": _iso(file.deleted_at) or None,
            "created_at": _iso(file.created_at),
            "updated_at": _iso(file.updated_at),
        }
