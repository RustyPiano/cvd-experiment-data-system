from __future__ import annotations

import csv
import io
import json
import math
import zipfile
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session

from app.commands.export_v2_schema import (
    STANDARD_ID,
    build_v2_field_dictionary,
    build_v2_json_schema,
)
from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.sample import Sample
from app.models.scientific import (
    AnalysisRun,
    DataDerivationEdge,
    MaterialAssertion,
    ProcessChannel,
    PropertyValue,
    RunContributor,
    RunFeature,
    RunRevision,
    SampleRevisionAssociation,
    SampleRevisionState,
    SourceLoad,
    SourceLoadIngredient,
    TransformationInput,
    TransformationOutput,
    TransformationRun,
)
from app.models.user import User
from app.models.v2_results import CharacterizationRecord, MeasuredProduct
from app.repositories.experiment_repository import ExperimentRepository
from app.services.experiment_guards import get_owned_experiment, get_visible_experiment
from app.services.v2_entity_snapshot_service import effective_run_module_payloads
from app.services.v2_field_source import (
    SCHEMA_VERSION,
    canonical_option_value,
    canonicalize_controlled_values,
    load_field_source,
    payload_fields_by_module,
)

LEGACY_BACKFILL_REASON = "Backfilled from production revision 20260728_0002"


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


def derive_gas_flow_shares(gas_feeds: Any) -> list[dict[str, Any]]:
    """Slice gas feeds at every boundary and derive per-feed flow shares."""
    if not isinstance(gas_feeds, list):
        return []

    valid_intervals: list[tuple[int, dict[str, Any], float, float, float]] = []
    boundaries: set[float] = set()
    for feed_index, feed in enumerate(gas_feeds, 1):
        if not isinstance(feed, dict):
            continue
        for interval in feed.get("intervals") or []:
            if not isinstance(interval, dict):
                continue
            start = interval.get("start_min")
            end = interval.get("end_min")
            flow = interval.get("flow_sccm")
            if not all(
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and math.isfinite(value)
                for value in (start, end, flow)
            ):
                continue
            start_value, end_value, flow_value = float(start), float(end), float(flow)
            if start_value < 0 or end_value <= start_value or flow_value < 0:
                continue
            boundaries.update((start_value, end_value))
            valid_intervals.append((feed_index, feed, start_value, end_value, flow_value))

    rows: list[dict[str, Any]] = []
    ordered = sorted(boundaries)
    segment_index = 0
    for start, end in zip(ordered, ordered[1:], strict=False):
        if end <= start:
            continue
        flows: dict[int, float] = {}
        feeds: dict[int, dict[str, Any]] = {}
        for feed_index, feed, interval_start, interval_end, flow in valid_intervals:
            if interval_start <= start and interval_end >= end and flow > 0:
                flows[feed_index] = flows.get(feed_index, 0.0) + flow
                feeds[feed_index] = feed
        total = sum(flows.values())
        if total <= 0:
            continue
        segment_index += 1
        for feed_index in sorted(flows):
            feed = feeds[feed_index]
            reference = feed.get("lot_ref")
            reference = reference if isinstance(reference, dict) else {}
            species = str(feed.get("species") or "")
            gas = str(feed.get("other_name") or "").strip() if species == "other" else species
            flow = flows[feed_index]
            rows.append(
                {
                    "interval_index": segment_index,
                    "interval_start_min": start,
                    "interval_end_min": end,
                    "gas_feed_index": feed_index,
                    "gas": gas,
                    "gas_lot_entity_id": str(reference.get("entity_id") or ""),
                    "gas_lot_version": reference.get("version") or "",
                    "flow_sccm": flow,
                    "total_flow_sccm": total,
                    "flow_percent": flow / total * 100,
                }
            )
    return rows


class V2ReportingService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.experiments = ExperimentRepository(db)

    def export_run_json(
        self,
        run_id: UUID,
        revision_id: UUID,
        current_user: User,
    ) -> tuple[bytes, str]:
        with self._batch_export_snapshot() as snapshot:
            return snapshot._export_run_json_from_snapshot(
                run_id,
                revision_id,
                current_user,
            )

    def _export_run_json_from_snapshot(
        self,
        run_id: UUID,
        revision_id: UUID,
        current_user: User,
    ) -> tuple[bytes, str]:
        run = get_visible_experiment(
            self.experiments,
            run_id,
            current_user,
            schema_version=SCHEMA_VERSION,
        )
        revision = self.db.get(RunRevision, revision_id)
        if revision is None or revision.experiment_run_id != run.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revision not found")
        content = json.dumps(
            self._run_bundle(run, revision),
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")
        return content, f"{run.run_code}-r{revision.revision_number}.json"

    def export_draft_json(
        self,
        run_id: UUID,
        current_user: User,
    ) -> tuple[bytes, str]:
        run = get_owned_experiment(
            self.experiments,
            run_id,
            current_user,
            schema_version=SCHEMA_VERSION,
        )
        if run.status != ExperimentStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only drafts have a working-copy export",
            )
        bundle = {
            "export_kind": "draft_working_copy",
            "citation_status": "NON_CITABLE",
            "schema_version": SCHEMA_VERSION,
            "exported_at": datetime.now(UTC).isoformat(),
            "run": {
                "id": str(run.id),
                "run_code": run.run_code,
                "status": run.status.value,
                "based_on_revision_id": (
                    str(run.draft_supersedes_revision_id)
                    if run.draft_supersedes_revision_id
                    else None
                ),
            },
            "modules": canonicalize_controlled_values(effective_run_module_payloads(run)),
        }
        return (
            json.dumps(bundle, ensure_ascii=False, indent=2).encode("utf-8"),
            f"{run.run_code}-DRAFT-NON-CITABLE.json",
        )

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
        with self._batch_export_snapshot() as snapshot:
            return snapshot._export_runs_zip_from_snapshot(
                current_user,
                query_text=query_text,
                material_system=material_system,
                operator=operator,
                date_from=date_from,
                date_to=date_to,
                status_filters=status_filters,
            )

    def _export_runs_zip_from_snapshot(
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
        revisions = {run.id: self._current_revision(run) for run in runs}
        records = {
            "schema_version": SCHEMA_VERSION,
            "runs": [self._run_bundle(run, revisions[run.id]) for run in runs],
        }
        tables = self._csv_tables(runs, revisions)
        field_dictionary = build_v2_field_dictionary(load_field_source())
        json_schema = build_v2_json_schema()
        dictionary_fields = [
            "source_part",
            "module",
            "module_key",
            "key",
            "label",
            "label_en",
            "meaning",
            "input",
            "example",
            "help",
            "help_en",
            "machine_type",
            "schema_path",
            "r0",
            "requirement",
            "condition",
            "validation",
            "unit",
            "options",
        ]
        dictionary_rows = [
            {
                key: (
                    json.dumps(row[key], ensure_ascii=False, sort_keys=True)
                    if key in {"condition", "validation"} and row.get(key) is not None
                    else (row.get(key) if row.get(key) is not None else "")
                )
                for key in dictionary_fields
            }
            for row in field_dictionary["fields"]
        ]
        manifest = {
            "standard_id": STANDARD_ID,
            "standard_version": load_field_source()["meta"]["version"],
            "schema_version": SCHEMA_VERSION,
            "exported_at": datetime.now(UTC).isoformat(),
            "run_count": len(runs),
            "run_revision_ids": [str(revisions[run.id].id) for run in runs],
            "tables": [*tables, "field_dictionary.csv"],
            "artifacts": [
                "records.json",
                "cvd-2d-process-v2.schema.json",
                "cvd-2d-field-dictionary-v2.json",
            ],
            "module_details": {
                "path_notation": "JSONPath-like",
                "array_index_base": 0,
                "reconstruction_key": [
                    "run_code",
                    "module_key",
                    "item_index",
                    "field_key",
                    "detail_path",
                ],
            },
            "reconstruction": {
                "authoritative_source": "records.json",
                "csv_empty_cells_distinguish_null_and_empty": False,
                "csv_empty_cell_note": (
                    "CSV empty cells alone cannot distinguish null, empty string, "
                    "empty list, and empty object."
                ),
            },
            "derived_tables": {
                "gas_flow_shares.csv": {
                    "source": "records.json $.runs[*].modules.process_steps.items[*].gas_feeds",
                    "reconstruction_key": [
                        "experiment_id",
                        "process_step_index",
                        "interval_index",
                        "gas_feed_index",
                    ],
                }
            },
        }
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for filename, (fieldnames, rows) in tables.items():
                archive.writestr(filename, self._csv_bytes(fieldnames, rows))
            archive.writestr(
                "field_dictionary.csv",
                self._csv_bytes(dictionary_fields, dictionary_rows),
            )
            archive.writestr(
                "records.json",
                json.dumps(records, ensure_ascii=False, indent=2).encode("utf-8"),
            )
            archive.writestr(
                "cvd-2d-process-v2.schema.json",
                json.dumps(json_schema, ensure_ascii=False, indent=2).encode("utf-8"),
            )
            archive.writestr(
                "cvd-2d-field-dictionary-v2.json",
                json.dumps(field_dictionary, ensure_ascii=False, indent=2).encode("utf-8"),
            )
            archive.writestr(
                "schema_manifest.json",
                json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
            )
        stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        return buffer.getvalue(), f"cvd-runs-{stamp}.zip"

    @contextmanager
    def _batch_export_snapshot(self) -> Iterator[V2ReportingService]:
        bind = self.db.get_bind()
        snapshot_db = Session(
            bind=bind,
            autoflush=False,
            expire_on_commit=False,
        )
        sqlite_query_only = bind.dialect.name == "sqlite"
        try:
            if bind.dialect.name == "postgresql":
                snapshot_db.execute(
                    text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                )
            elif sqlite_query_only:
                snapshot_db.execute(text("PRAGMA query_only = ON"))
                snapshot_db.execute(text("BEGIN"))
            else:
                snapshot_db.begin()
            yield type(self)(snapshot_db)
        finally:
            snapshot_db.rollback()
            if sqlite_query_only:
                snapshot_db.execute(text("PRAGMA query_only = OFF"))
                snapshot_db.commit()
            snapshot_db.close()

    def _visible_runs_for_export(
        self,
        current_user: User,
        **filters: Any,
    ) -> list[ExperimentRun]:
        runs, _ = self.experiments.list_visible(
            current_user=current_user,
            page=1,
            page_size=2_147_483_647,
            sort_by="experiment_date",
            sort_order="asc",
            schema_version=SCHEMA_VERSION,
            **filters,
        )
        return [
            run
            for run in runs
            if run.status in {ExperimentStatus.LOCKED, ExperimentStatus.REVIEWED}
            and run.current_revision_id is not None
        ]

    def _current_revision(self, run: ExperimentRun) -> RunRevision:
        revision = self.db.get(RunRevision, run.current_revision_id)
        if revision is None:
            raise RuntimeError(f"Run {run.id} has no current immutable revision")
        return revision

    def _run_bundle(self, run: ExperimentRun, revision: RunRevision) -> dict[str, Any]:
        modules = {
            module_key: canonicalize_controlled_values(payload)
            for module_key, payload in revision.content_json["modules"].items()
        }
        records = self._records(run.id, revision.id)
        samples = self._samples_for_revision(run.id, revision.id, records)
        files = self._files_for_records(records)

        bundle = {
            "export_kind": "immutable_run_revision",
            "citation_status": "CITABLE",
            "schema_version": SCHEMA_VERSION,
            "exported_at": datetime.now(UTC).isoformat(),
            "run": {
                **revision.content_json["run"],
                "revision_id": str(revision.id),
                "revision_number": revision.revision_number,
                "revision_status": revision.status,
                "content_sha256": revision.content_sha256,
            },
            "modules": modules,
            "scientific_record": self._scientific_json(
                run,
                revision,
                samples,
                records,
                files,
            ),
        }
        return canonicalize_controlled_values(bundle)

    def _scientific_json(
        self,
        run: ExperimentRun,
        revision: RunRevision,
        samples: list[Sample],
        records: list[CharacterizationRecord],
        files: list[FileAsset],
    ) -> dict[str, Any]:
        legacy_products = self._products(samples, records, revision)
        revisions = [revision]
        revision_ids = [item.id for item in revisions]
        record_ids = [item.id for item in records if item.run_revision_id is not None]
        sample_codes = {item.id: item.sample_code for item in samples}
        source_loads = list(
            self.db.scalars(
                select(SourceLoad)
                .where(SourceLoad.run_revision_id == revision.id)
                .order_by(SourceLoad.load_key)
            )
        )
        source_load_ids = [item.id for item in source_loads]
        ingredients_by_load: dict[UUID, list[SourceLoadIngredient]] = {}
        if source_load_ids:
            for ingredient in self.db.scalars(
                select(SourceLoadIngredient)
                .where(SourceLoadIngredient.source_load_id.in_(source_load_ids))
                .order_by(SourceLoadIngredient.id)
            ):
                ingredients_by_load.setdefault(ingredient.source_load_id, []).append(ingredient)
        files_by_record: dict[UUID, list[FileAsset]] = {}
        for file in files:
            if file.characterization_record_id and file.deleted_at is None:
                files_by_record.setdefault(file.characterization_record_id, []).append(file)

        analyses = (
            list(
                self.db.scalars(
                    select(AnalysisRun)
                    .where(AnalysisRun.measurement_run_id.in_(record_ids))
                    .order_by(AnalysisRun.started_at, AnalysisRun.id)
                )
            )
            if record_ids
            else []
        )
        analysis_ids = [item.id for item in analyses]
        edges = (
            list(
                self.db.scalars(
                    select(DataDerivationEdge).where(
                        DataDerivationEdge.analysis_run_id.in_(analysis_ids)
                    )
                )
            )
            if analysis_ids
            else []
        )
        edges_by_analysis: dict[UUID, list[DataDerivationEdge]] = {}
        for edge in edges:
            edges_by_analysis.setdefault(edge.analysis_run_id, []).append(edge)
        analyses_by_measurement: dict[UUID, list[AnalysisRun]] = {}
        for analysis in analyses:
            analyses_by_measurement.setdefault(analysis.measurement_run_id, []).append(analysis)

        properties = (
            list(
                self.db.scalars(
                    select(PropertyValue).where(PropertyValue.measurement_run_id.in_(record_ids))
                )
            )
            if record_ids
            else []
        )
        assertions = (
            list(
                self.db.scalars(
                    select(MaterialAssertion).where(
                        MaterialAssertion.measurement_run_id.in_(record_ids)
                    )
                )
            )
            if record_ids
            else []
        )
        properties_by_measurement: dict[UUID, list[PropertyValue]] = {}
        assertions_by_measurement: dict[UUID, list[MaterialAssertion]] = {}
        for item in properties:
            properties_by_measurement.setdefault(item.measurement_run_id, []).append(item)
        for item in assertions:
            assertions_by_measurement.setdefault(item.measurement_run_id, []).append(item)

        transformation_ids_for_revision = set(
            self.db.scalars(
                select(TransformationInput.transformation_run_id).where(
                    TransformationInput.run_revision_id == revision.id
                )
            )
        )
        transformations = (
            list(
                self.db.scalars(
                    select(TransformationRun)
                    .where(TransformationRun.id.in_(transformation_ids_for_revision))
                    .order_by(TransformationRun.occurred_at, TransformationRun.id)
                )
            )
            if transformation_ids_for_revision
            else []
        )
        transformation_ids = [item.id for item in transformations]
        inputs = (
            list(
                self.db.scalars(
                    select(TransformationInput).where(
                        TransformationInput.transformation_run_id.in_(transformation_ids)
                    )
                )
            )
            if transformation_ids
            else []
        )
        outputs = (
            list(
                self.db.scalars(
                    select(TransformationOutput).where(
                        TransformationOutput.transformation_run_id.in_(transformation_ids)
                    )
                )
            )
            if transformation_ids
            else []
        )

        return {
            "schema_release": {
                "version": SCHEMA_VERSION,
                "status": load_field_source()["meta"]["status"],
            },
            "missing_value_states": [
                "unknown",
                "not_measured",
                "not_applicable",
                "below_detection_limit",
            ],
            "revisions": [
                {
                    "id": str(item.id),
                    "revision_number": item.revision_number,
                    "supersedes_revision_id": (
                        str(item.supersedes_revision_id) if item.supersedes_revision_id else None
                    ),
                    "schema_version": item.schema_version,
                    "schema_status": item.schema_status,
                    "status": item.status,
                    "content_sha256": item.content_sha256,
                    "correction_reason": item.correction_reason,
                    "locked_by_id": str(item.locked_by_id),
                    "reviewed_by_id": (str(item.reviewed_by_id) if item.reviewed_by_id else None),
                    "locked_at": _iso(item.locked_at),
                    "reviewed_at": _iso(item.reviewed_at) or None,
                    "superseded_at": _iso(item.superseded_at) or None,
                    "content": item.content_json,
                }
                for item in revisions
            ],
            "contributors": [
                {
                    "run_revision_id": str(item.run_revision_id),
                    "user_id": str(item.user_id),
                    "role": item.role,
                    "contribution_role": item.contribution_role,
                    "user_snapshot": item.user_snapshot_json,
                }
                for item in (
                    self.db.scalars(
                        select(RunContributor).where(
                            RunContributor.run_revision_id.in_(revision_ids)
                        )
                    )
                    if revision_ids
                    else []
                )
            ],
            "features": [
                {
                    "run_revision_id": str(item.run_revision_id),
                    "feature_code": item.feature_code,
                    "ordinal": item.ordinal,
                    "numeric_value": item.numeric_value,
                    "text_value": item.text_value,
                    "boolean_value": item.boolean_value,
                    "unit": item.unit,
                    "source_path": item.source_path,
                }
                for item in (
                    self.db.scalars(
                        select(RunFeature)
                        .where(RunFeature.run_revision_id.in_(revision_ids))
                        .order_by(RunFeature.feature_code, RunFeature.ordinal)
                    )
                    if revision_ids
                    else []
                )
            ],
            "source_loads": [
                {
                    "id": str(item.id),
                    "run_revision_id": str(item.run_revision_id),
                    "load_key": item.load_key,
                    "container_instance_id": (
                        str(item.container_instance_id) if item.container_instance_id else None
                    ),
                    "container_snapshot": item.container_snapshot_json,
                    "container_state_at_loading": item.container_state_at_loading,
                    "loading_method": item.loading_method,
                    "preparation_steps": item.preparation_steps,
                    "initial_position": item.initial_position,
                    "position_program": item.position_program,
                    "heating_zone_ref": item.heating_zone_ref,
                    "attrs": item.attrs,
                    "ingredients": [
                        {
                            "material_lot_id": str(ingredient.material_lot_id),
                            "material_lot_version": ingredient.material_lot_version,
                            "material_snapshot": ingredient.material_snapshot_json,
                            "function_role": ingredient.function_role,
                            "amount": ingredient.amount,
                            "unit": ingredient.unit,
                            "composition_basis": ingredient.composition_basis,
                            "uncertainty": ingredient.uncertainty,
                            "attrs": ingredient.attrs,
                        }
                        for ingredient in ingredients_by_load.get(item.id, [])
                    ],
                }
                for item in source_loads
            ],
            "sample_revision_associations": [
                {
                    "sample_id": str(item.sample_id),
                    "run_revision_id": str(item.run_revision_id),
                    "sample_snapshot": item.sample_snapshot_json,
                    "created_at": _iso(item.created_at),
                }
                for item in self.db.scalars(
                    select(SampleRevisionAssociation)
                    .where(SampleRevisionAssociation.run_revision_id == revision.id)
                    .order_by(SampleRevisionAssociation.sample_id)
                )
            ],
            "sample_revision_states": [
                {
                    "sample_id": str(item.sample_id),
                    "run_revision_id": str(item.run_revision_id),
                    "growth_state": item.growth_state,
                    "identity_state": item.identity_state,
                    "material_summary": item.material_summary,
                    "evidence_assertion_ids": item.evidence_assertion_ids,
                    "updated_at": _iso(item.updated_at),
                }
                for item in self.db.scalars(
                    select(SampleRevisionState)
                    .where(SampleRevisionState.run_revision_id == revision.id)
                    .order_by(SampleRevisionState.sample_id)
                )
            ],
            "process_channels": [
                {
                    "id": str(item.id),
                    "channel_key": item.channel_key,
                    "channel_type": item.channel_type,
                    "source_type": item.source_type,
                    "subject_type": item.subject_type,
                    "subject_ref": item.subject_ref,
                    "subject_instance_ref": item.subject_instance_ref,
                    "subject_snapshot": item.subject_snapshot_json,
                    "gas_species_code": item.gas_species_code,
                    "gas_lot_id": str(item.gas_lot_id) if item.gas_lot_id else None,
                    "gas_lot_version": item.gas_lot_version,
                    "gas_lot_snapshot": item.gas_lot_snapshot_json,
                    "zone_index": item.zone_index,
                    "pressure_location": item.pressure_location,
                    "pressure_type": item.pressure_type,
                    "unit": item.unit,
                    "data_kind": item.data_kind,
                    "file_asset_id": str(item.file_asset_id) if item.file_asset_id else None,
                    "canonical_unit": item.canonical_unit,
                    "canonical_scalar_value": item.canonical_scalar_value,
                    "canonical_series": item.canonical_series_json,
                    "statistics": item.statistics_json,
                    "source_file_sha256": item.source_file_sha256,
                    "parser_version": item.parser_version,
                    "projection_status": item.projection_status,
                }
                for item in self.db.scalars(
                    select(ProcessChannel)
                    .where(ProcessChannel.run_revision_id == revision.id)
                    .order_by(ProcessChannel.channel_key)
                )
            ],
            "measurements": [
                {
                    "id": str(record.id),
                    "run_revision_id": str(record.run_revision_id),
                    "sample_id": str(record.sample_id),
                    "sample_code": sample_codes.get(record.sample_id),
                    "method_profile": record.method_instrument,
                    "instrument_id": (str(record.instrument_id) if record.instrument_id else None),
                    "instrument_version": record.instrument_version,
                    "instrument_snapshot": record.instrument_snapshot_json,
                    "performed_by_id": (
                        str(record.performed_by_id) if record.performed_by_id else None
                    ),
                    "measured_at": _iso(record.measured_at),
                    "sample_region": record.sample_region,
                    "typed_conditions": record.typed_conditions,
                    "quality_flag": record.quality_flag,
                    "raw_file_ids": [str(file.id) for file in files_by_record.get(record.id, [])],
                    "analyses": [
                        {
                            "id": str(analysis.id),
                            "performed_by_id": str(analysis.performed_by_id),
                            "software_name": analysis.software_name,
                            "software_version": analysis.software_version,
                            "code_commit": analysis.code_commit,
                            "parameters": analysis.parameters_json,
                            "started_at": _iso(analysis.started_at),
                            "completed_at": _iso(analysis.completed_at) or None,
                            "file_derivations": [
                                {
                                    "file_asset_id": str(edge.file_asset_id),
                                    "direction": edge.direction,
                                    "role": edge.role,
                                }
                                for edge in edges_by_analysis.get(analysis.id, [])
                            ],
                        }
                        for analysis in analyses_by_measurement.get(record.id, [])
                    ],
                    "properties": [
                        {
                            "id": str(item.id),
                            "analysis_run_id": (
                                str(item.analysis_run_id) if item.analysis_run_id else None
                            ),
                            "property_code": item.property_code,
                            "numeric_value": item.numeric_value,
                            "text_value": item.text_value,
                            "structured_value": item.structured_value,
                            "unit": item.unit,
                            "statistic": item.statistic,
                            "uncertainty_value": item.uncertainty_value,
                            "uncertainty_type": item.uncertainty_type,
                            "sample_count": item.sample_count,
                            "quality_flag": item.quality_flag,
                        }
                        for item in properties_by_measurement.get(record.id, [])
                    ],
                    "assertions": [
                        {
                            "id": str(item.id),
                            "analysis_run_id": (
                                str(item.analysis_run_id) if item.analysis_run_id else None
                            ),
                            "assertion_type": item.assertion_type,
                            "value": item.value_json,
                            "confidence": item.confidence,
                            "validity": item.validity,
                            "created_at": _iso(item.created_at),
                        }
                        for item in assertions_by_measurement.get(record.id, [])
                    ],
                }
                for record in records
                if record.run_revision_id is not None
            ],
            "legacy_measured_products": [
                {
                    "id": str(product.id),
                    "sample_id": str(product.sample_id),
                    "sample_code": sample_codes.get(product.sample_id),
                    "characterization_record_id": (
                        str(product.characterization_record_id)
                        if product.characterization_record_id
                        else None
                    ),
                    "observed_phenomena": product.observed_phenomena,
                    "detected_phase_stacking": product.detected_phase_stacking,
                    "layer_count": product.layer_count,
                    "coverage_percent": product.coverage_percent,
                    "domain_size_um": product.domain_size_um,
                    "nucleation_density_cm2": product.nucleation_density_cm2,
                    "measured_layers_coverage": product.measured_layers_coverage,
                    "domain_nucleation_continuity": product.domain_nucleation_continuity,
                    "key_spectral_metrics": product.key_spectral_metrics,
                    "attrs": product.attrs,
                    "created_at": _iso(product.created_at),
                    "updated_at": _iso(product.updated_at),
                }
                for product in legacy_products
            ],
            "transformations": [
                {
                    "id": str(item.id),
                    "output_experiment_run_id": str(item.output_experiment_run_id),
                    "transformation_type": item.transformation_type,
                    "operator_id": str(item.operator_id),
                    "occurred_at": _iso(item.occurred_at),
                    "parameters": item.parameters_json,
                    "destination_substrate_snapshot": item.destination_substrate_snapshot,
                    "note": item.note,
                    "inputs": [
                        {
                            "sample_id": str(link.sample_id),
                            "sample_code": sample_codes.get(link.sample_id),
                            "role": link.input_role,
                            "run_revision_id": (
                                str(link.run_revision_id) if link.run_revision_id else None
                            ),
                            "provenance": link.provenance_json,
                        }
                        for link in inputs
                        if link.transformation_run_id == item.id
                    ],
                    "outputs": [
                        {
                            "sample_id": str(link.sample_id),
                            "sample_code": sample_codes.get(link.sample_id),
                            "role": link.output_role,
                        }
                        for link in outputs
                        if link.transformation_run_id == item.id
                    ],
                }
                for item in transformations
            ],
        }

    def _csv_tables(
        self,
        runs: list[ExperimentRun],
        revisions: dict[UUID, RunRevision],
    ) -> dict[str, tuple[list[str], list[dict[str, Any]]]]:
        module_fields = payload_fields_by_module()
        precursor_keys = [field["key"] for field in module_fields["precursors"]]
        substrate_keys = [field["key"] for field in module_fields["substrates"]]
        process_keys = [field["key"] for field in module_fields["process_steps"]]

        run_rows: list[dict[str, Any]] = []
        precursor_rows: list[dict[str, Any]] = []
        substrate_rows: list[dict[str, Any]] = []
        process_rows: list[dict[str, Any]] = []
        module_detail_rows: list[dict[str, Any]] = []
        source_snapshot_keys = [f"source_{key}" for key in substrate_keys]
        sample_rows: list[dict[str, Any]] = []
        result_rows: list[dict[str, Any]] = []
        file_rows: list[dict[str, Any]] = []
        gas_flow_share_rows: list[dict[str, Any]] = []
        revision_rows: list[dict[str, Any]] = []
        scientific_fact_rows: list[dict[str, Any]] = []

        for run in runs:
            revision = revisions[run.id]
            modules = {
                module_key: canonicalize_controlled_values(payload)
                for module_key, payload in revision.content_json["modules"].items()
            }
            operator = (modules.get("basic_info") or {}).get("operator") or run.owner_name
            records = self._records(run.id, revision.id)
            samples = self._samples_for_revision(run.id, revision.id, records)
            products = self._products(samples, records, revision)
            files = self._files_for_records(records)
            scientific = self._scientific_json(
                run,
                revision,
                samples,
                records,
                files,
            )
            sample_by_id = {sample.id: sample for sample in samples}
            sample_by_source = {
                str(sample.source_substrate_id): sample
                for sample in samples
                if sample.source_substrate_id
            }
            record_by_id = {record.id: record for record in records}

            setup_snapshot = canonicalize_controlled_values(
                revision.content_json["run"].get("setup_ref_snapshot") or {}
            )
            setup_attrs = setup_snapshot.get("attrs_snapshot")
            setup_leaves = (
                _nested_leaves(setup_attrs) if isinstance(setup_attrs, (dict, list)) else []
            )
            run_row = {
                "run_code": run.run_code,
                "operator": operator,
                "target_material_system": run.target_material_system,
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
                "current_revision_id": run.current_revision_id,
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
            for step_index, step in enumerate(
                (modules.get("process_steps") or {}).get("items", []), 1
            ):
                if not isinstance(step, dict):
                    continue
                for row in derive_gas_flow_shares(step.get("gas_feeds")):
                    relation_key = (
                        f"{run.id}:process_steps:{step_index}:"
                        f"{row['interval_index']}:{row['gas_feed_index']}"
                    )
                    gas_flow_share_rows.append(
                        {
                            "experiment_id": str(run.id),
                            "run_code": run.run_code,
                            "process_step_index": step_index,
                            **row,
                            "relation_key": relation_key,
                        }
                    )
            for module_key in (
                "basic_info",
                "target_product",
                "equipment",
                "process_events",
            ):
                self._extend_module_detail_rows(
                    module_detail_rows,
                    run.run_code,
                    module_key,
                    modules.get(module_key),
                    module_fields[module_key],
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
                            "run_revision_id": str(revision.id),
                            "target_material_system": sample.target_material_system,
                            "actual_state": sample.actual_state,
                            "actual_material_summary": sample.actual_material_summary,
                            "lifecycle_state": sample.lifecycle_state,
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

            revision_rows.extend(
                {
                    "run_code": run.run_code,
                    "revision_id": item["id"],
                    "revision_number": item["revision_number"],
                    "supersedes_revision_id": item["supersedes_revision_id"],
                    "schema_version": item["schema_version"],
                    "schema_status": item["schema_status"],
                    "status": item["status"],
                    "content_sha256": item["content_sha256"],
                    "correction_reason": item["correction_reason"],
                    "locked_by_id": item["locked_by_id"],
                    "reviewed_by_id": item["reviewed_by_id"],
                    "locked_at": item["locked_at"],
                    "reviewed_at": item["reviewed_at"],
                    "superseded_at": item["superseded_at"],
                }
                for item in scientific["revisions"]
            )
            scientific_fact_rows.extend(
                {
                    "run_code": run.run_code,
                    "path": path,
                    "value": value,
                }
                for path, value in _walk_nested_leaves(scientific)
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
                    "layer_count": product.layer_count,
                    "coverage_percent": product.coverage_percent,
                    "domain_size_um": product.domain_size_um,
                    "nucleation_density_cm2": product.nucleation_density_cm2,
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
                            "layer_count": "",
                            "coverage_percent": "",
                            "domain_size_um": "",
                            "nucleation_density_cm2": "",
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
                        "file_id": str(file.id),
                        "binding_type": file.metadata_json.get("binding_type"),
                        "binding_id": file.metadata_json.get("binding_id"),
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
                    "target_material_system",
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
                    "current_revision_id",
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
            "gas_flow_shares.csv": (
                [
                    "experiment_id",
                    "run_code",
                    "process_step_index",
                    "interval_index",
                    "interval_start_min",
                    "interval_end_min",
                    "gas_feed_index",
                    "gas",
                    "gas_lot_entity_id",
                    "gas_lot_version",
                    "flow_sccm",
                    "total_flow_sccm",
                    "flow_percent",
                    "relation_key",
                ],
                gas_flow_share_rows,
            ),
            "samples.csv": (
                [
                    "run_code",
                    "sample_code",
                    "role",
                    "run_revision_id",
                    "target_material_system",
                    "actual_state",
                    "actual_material_summary",
                    "lifecycle_state",
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
                    "layer_count",
                    "coverage_percent",
                    "domain_size_um",
                    "nucleation_density_cm2",
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
                    "file_id",
                    "binding_type",
                    "binding_id",
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
            "run_revisions.csv": (
                [
                    "run_code",
                    "revision_id",
                    "revision_number",
                    "supersedes_revision_id",
                    "schema_version",
                    "schema_status",
                    "status",
                    "content_sha256",
                    "correction_reason",
                    "locked_by_id",
                    "reviewed_by_id",
                    "locked_at",
                    "reviewed_at",
                    "superseded_at",
                ],
                revision_rows,
            ),
            "scientific_facts.csv": (
                ["run_code", "path", "value"],
                scientific_fact_rows,
            ),
            "module_details.csv": (
                [
                    "run_code",
                    "module_key",
                    "item_index",
                    "field_key",
                    "detail_path",
                    "detail_value",
                    "unit",
                ],
                module_detail_rows,
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
    def _extend_module_detail_rows(
        target: list[dict[str, Any]],
        run_code: str,
        module_key: str,
        payload: dict[str, Any] | None,
        fields: list[dict[str, Any]],
    ) -> None:
        if not payload:
            return
        units = {
            field["key"]: ("" if field.get("unit") in {None, "—"} else field["unit"])
            for field in fields
        }
        items = payload.get("items", []) if isinstance(payload.get("items"), list) else [payload]
        for index, item in enumerate(items, 1):
            if not isinstance(item, dict):
                continue
            for field_key, value in item.items():
                if field_key == "items":
                    continue
                leaves = _nested_leaves(value) if isinstance(value, (dict, list)) else [("", value)]
                target.extend(
                    {
                        "run_code": run_code,
                        "module_key": module_key,
                        "item_index": index if "items" in payload else "",
                        "field_key": field_key,
                        "detail_path": path,
                        "detail_value": leaf,
                        "unit": units.get(field_key, ""),
                    }
                    for path, leaf in leaves
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

    def _records(
        self,
        run_id: UUID,
        revision_id: UUID | None = None,
    ) -> list[CharacterizationRecord]:
        statement = select(CharacterizationRecord).where(
            CharacterizationRecord.experiment_run_id == run_id
        )
        if revision_id is not None:
            statement = statement.where(CharacterizationRecord.run_revision_id == revision_id)
        return list(self.db.scalars(statement.order_by(CharacterizationRecord.created_at.asc())))

    def _samples_for_revision(
        self,
        run_id: UUID,
        revision_id: UUID,
        records: list[CharacterizationRecord],
    ) -> list[Sample]:
        measured_sample_ids = [record.sample_id for record in records]
        associated_sample_ids = select(SampleRevisionAssociation.sample_id).where(
            SampleRevisionAssociation.run_revision_id == revision_id
        )
        revision_filter = or_(
            Sample.run_revision_id == revision_id,
            Sample.id.in_(associated_sample_ids),
        )
        if measured_sample_ids:
            revision_filter = or_(revision_filter, Sample.id.in_(measured_sample_ids))
        return list(
            self.db.scalars(
                select(Sample)
                .where(
                    Sample.experiment_run_id == run_id,
                    revision_filter,
                )
                .order_by(Sample.sample_code.asc())
            )
        )

    def _products(
        self,
        samples: list[Sample],
        records: list[CharacterizationRecord],
        revision: RunRevision,
    ) -> list[MeasuredProduct]:
        sample_ids = [sample.id for sample in samples]
        if not sample_ids:
            return []
        record_ids = [record.id for record in records]
        revision_scope = []
        if record_ids:
            revision_scope.append(MeasuredProduct.characterization_record_id.in_(record_ids))
        if revision.correction_reason == LEGACY_BACKFILL_REASON:
            revision_scope.append(MeasuredProduct.characterization_record_id.is_(None))
        if not revision_scope:
            return []
        return list(
            self.db.scalars(
                select(MeasuredProduct)
                .where(
                    MeasuredProduct.sample_id.in_(sample_ids),
                    or_(*revision_scope),
                )
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

    def _files_for_records(
        self,
        records: list[CharacterizationRecord],
    ) -> list[FileAsset]:
        record_ids = [record.id for record in records]
        if not record_ids:
            return []
        return list(
            self.db.scalars(
                select(FileAsset)
                .where(
                    FileAsset.characterization_record_id.in_(record_ids),
                    FileAsset.deleted_at.is_(None),
                )
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
            "layer_count": product.layer_count,
            "coverage_percent": product.coverage_percent,
            "domain_size_um": product.domain_size_um,
            "nucleation_density_cm2": product.nucleation_density_cm2,
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
