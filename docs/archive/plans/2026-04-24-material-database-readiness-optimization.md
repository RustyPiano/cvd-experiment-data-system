# Material Database Readiness Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the CVD experiment data capture system from V1 Beta lab-record capture into a more reliable foundation for building a structured materials database.

**Architecture:** Keep the current React + FastAPI + SQLAlchemy architecture. Add stricter typed module schemas, provenance-complete export, vocabulary-backed UI inputs, normalized analysis exports, and soft-deletion/audit guarantees without rewriting the whole product or replacing the MVP data model.

**Tech Stack:** Backend: FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic, PostgreSQL/SQLite tests, openpyxl. Frontend: React, TypeScript, Vite, Ant Design, TanStack Query, Vitest. Required tools: UV for Python, Bun for JavaScript.

---

## Scope And Sequencing

This plan addresses the five review findings in a staged way:

1. **Provenance first:** export child-entity audit events and audit vocabulary changes.
2. **Data correctness second:** reject non-numeric values for numeric scientific fields and add backend schema validation.
3. **Database readiness third:** add normalized analysis exports and stronger field completeness feedback.
4. **User workflow fourth:** replace free-text fields with vocabulary-backed controls where the database already has vocabulary keys.
5. **Retention and lifecycle fifth:** stop physically deleting substrate-derived sample rows.

Do not implement a full ELN/LIMS, instrument parsing, recipe management, or multi-tenant authorization in this plan.

## Files And Responsibilities

Backend files:

- `backend/app/schemas/module_payload.py`: add typed Pydantic schemas for each V1 module and a validation dispatcher.
- `backend/app/services/experiment_validation_service.py`: reuse typed schemas and expand submit-time scientific checks.
- `backend/app/services/experiment_service.py`: call schema validation on module upsert and preserve current normalization behavior.
- `backend/app/services/experiment_export_service.py`: include related audit events and add analysis-ready export structures.
- `backend/app/services/audit_service.py`: add helper methods for multi-entity audit collection and serialization.
- `backend/app/repositories/audit_repository.py`: query audit events by multiple entity references.
- `backend/app/services/vocabulary_service.py`: record create/update audit events for vocabulary changes.
- `backend/app/models/sample.py`: add sample soft-delete fields if substrate removal retention is implemented in schema.
- `backend/app/repositories/sample_repository.py`: hide soft-deleted samples by default and support active sample queries.
- `backend/app/services/sample_service.py`: replace physical delete during substrate sync with soft delete or inactive marker.
- `backend/alembic/versions/<new_revision>_add_sample_soft_delete_fields.py`: migration for soft-delete fields.
- `backend/tests/api/test_experiment_exports.py`: export provenance and analysis payload tests.
- `backend/tests/api/test_vocabularies.py`: vocabulary audit tests.
- `backend/tests/api/test_experiments.py`: module schema validation and numeric rejection tests.
- `backend/tests/api/test_samples.py`: sample soft-delete retention tests.

Frontend files:

- `frontend/src/features/experiments/editor-types.ts`: make numeric normalization strict and surface invalid numeric input before save.
- `frontend/src/features/experiments/use-experiment-editor.ts`: prevent autosave of invalid numeric module values and display section errors.
- `frontend/src/features/experiments/components/*-section.tsx`: use vocabulary-backed selects and numeric inputs.
- `frontend/src/features/experiments/api.ts`: fetch active vocabularies for editor sections.
- `frontend/src/shared/types/api.ts`: add typed export-analysis and validation response types.
- `frontend/src/features/experiments/experiment-detail-page.tsx`: add normalized export action if backend endpoint is introduced.
- `frontend/src/features/experiments/experiment-editor-page.test.tsx`: numeric validation and vocabulary select coverage.
- `frontend/src/features/vocabularies/vocabulary-admin-page.test.tsx`: keep vocabulary admin mutation coverage, consider increasing timeout only if flake persists after component fixes.

Docs:

- `README.md`: document new export endpoints and quality gates.
- `cvd_experiment_data_system_design_v1.md`: document normalized analysis export and audit provenance rule.
- `AGENT_IMPLEMENTATION_BRIEF.md`: update V1 Beta boundaries if schema validation is promoted into the MVP contract.

---

## Phase 1: Export Complete Provenance

### Task 1: Include Related Sample And File Audit Events In Experiment Export

**Files:**
- Modify: `backend/app/repositories/audit_repository.py`
- Modify: `backend/app/services/audit_service.py`
- Modify: `backend/app/services/experiment_export_service.py`
- Test: `backend/tests/api/test_experiment_exports.py`

- [ ] **Step 1: Write a failing export-provenance test**

Add a test that:
- creates an experiment,
- syncs a substrate sample,
- edits the sample through `PATCH /api/v1/samples/{sample_id}`,
- uploads a file,
- exports the experiment,
- asserts the export includes `sample` and `file_asset` audit events, not only `experiment_run`.

Run:

```bash
cd backend
uv run pytest tests/api/test_experiment_exports.py::test_export_includes_related_sample_and_file_audit_events -v
```

Expected: FAIL because export currently returns only `experiment_run` audit events.

- [ ] **Step 2: Add repository support for multiple audit entity refs**

Implement a method equivalent to:

```python
def list_for_entities(self, refs: list[tuple[str, UUID]]) -> list[AuditEvent]:
    if not refs:
        return []

    conditions = [
        sa.and_(AuditEvent.entity_type == entity_type, AuditEvent.entity_id == entity_id)
        for entity_type, entity_id in refs
    ]
    statement = select(AuditEvent).where(sa.or_(*conditions)).order_by(AuditEvent.created_at.asc())
    return list(self.db.scalars(statement).all())
```

Use SQLAlchemy imports already consistent with the repository style.

- [ ] **Step 3: Collect experiment-related entity refs in export service**

In `ExperimentExportService.build_json_export`, after loading samples and files, collect refs:

```python
audit_refs = [("experiment_run", experiment.id)]
audit_refs.extend(("sample", sample.id) for sample in samples)
audit_refs.extend(("file_asset", file_asset.id) for file_asset in files)
```

Then fetch audit events through the new repository/service method.

- [ ] **Step 4: Run targeted backend test**

```bash
cd backend
uv run pytest tests/api/test_experiment_exports.py::test_export_includes_related_sample_and_file_audit_events -v
```

Expected: PASS.

- [ ] **Step 5: Run export test module**

```bash
cd backend
uv run pytest tests/api/test_experiment_exports.py -v
```

Expected: PASS.

### Task 2: Audit Vocabulary Create And Update

**Files:**
- Modify: `backend/app/services/vocabulary_service.py`
- Test: `backend/tests/api/test_vocabularies.py`
- Optional: `backend/app/services/audit_service.py`

- [ ] **Step 1: Write failing tests**

Add tests that create and update a vocabulary as admin, then query audit repository directly or expose expectations through an internal service assertion. Verify:

- `entity_type == "controlled_vocabulary"`
- `action == "create"` for creation
- `action == "update"` for update
- `before_json` and `after_json` are present for update
- non-admin attempts still do not write audit events

Run:

```bash
cd backend
uv run pytest tests/api/test_vocabularies.py::test_vocabulary_create_and_update_write_audit_events -v
```

Expected: FAIL.

- [ ] **Step 2: Add serialization helper in vocabulary service**

Add a private helper:

```python
def _serialize_vocabulary(self, entry: ControlledVocabulary) -> dict:
    return {
        "id": str(entry.id),
        "vocab_key": entry.vocab_key,
        "value": entry.value,
        "label_zh": entry.label_zh,
        "label_en": entry.label_en,
        "sort_order": entry.sort_order,
        "is_active": entry.is_active,
        "metadata_json": entry.metadata_json,
    }
```

- [ ] **Step 3: Record audit around create/update**

Instantiate `AuditService(db)` in `VocabularyService.__init__`.

For create:

```python
self.audit.record_event(
    actor=current_user,
    entity_type="controlled_vocabulary",
    entity_id=saved.id,
    action="create",
    before_json=None,
    after_json=self._serialize_vocabulary(saved),
)
```

For update, serialize before applying `updates`, then record:

```python
self.audit.record_event(
    actor=current_user,
    entity_type="controlled_vocabulary",
    entity_id=saved.id,
    action="update",
    before_json=before,
    after_json=self._serialize_vocabulary(saved),
)
```

Keep one transaction per API call.

- [ ] **Step 4: Run vocabulary tests**

```bash
cd backend
uv run pytest tests/api/test_vocabularies.py -v
```

Expected: PASS.

---

## Phase 2: Typed Scientific Payload Validation

### Task 3: Add Backend Payload Schema Dispatcher

**Files:**
- Modify: `backend/app/schemas/module_payload.py`
- Modify: `backend/app/services/experiment_service.py`
- Test: `backend/tests/api/test_experiments.py`

- [ ] **Step 1: Write failing schema-validation tests**

Add tests for:

- precursor `mass_mg="abc"` returns 422,
- gas `flow_sccm="abc"` returns 422,
- furnace `temperature_C="hot"` returns 422,
- unknown keys are either preserved in a dedicated extension field or rejected by documented rule.

Run:

```bash
cd backend
uv run pytest tests/api/test_experiments.py::test_upsert_module_rejects_non_numeric_scientific_values -v
```

Expected: FAIL because invalid numeric strings currently persist in many fields.

- [ ] **Step 2: Define module-specific Pydantic models**

Add models for the current V1 payload shape, using permissive optional fields where the UI allows drafts but strict numeric types where units imply numeric values.

Minimum typed models:

- `EnvironmentPayload`
- `PrecheckPayload`
- `PrecursorsPayload` and `PrecursorItemPayload`
- `SubstratesPayload`, `SubstrateItemPayload`, `SubstrateTreatmentParamsPayload`
- `FurnaceProgramPayload`, `FurnaceZonePayload`, `FurnacePointPayload`
- `GasProgramPayload`, `GasSegmentPayload`, `GasComponentPayload`
- `ProcessObservationPayload`
- `CharacterizationPayload`, `CharacterizationMethodPayload`
- `ResultSummaryPayload`

Use `ConfigDict(extra="allow")` only for modules where legacy payload preservation is required. If using `extra="allow"`, keep typed fields strict and document that extension fields are not analysis-ready.

- [ ] **Step 3: Add validation dispatcher**

Add:

```python
def validate_module_payload(module_key: str, payload_json: dict[str, Any]) -> dict[str, Any]:
    model = MODULE_PAYLOAD_MODELS.get(module_key)
    if model is None:
        return payload_json
    return model.model_validate(payload_json).model_dump(mode="json", exclude_none=False)
```

Call this after `normalize_module_payload` in `_upsert_module_payload`.

- [ ] **Step 4: Convert Pydantic errors to HTTP 422**

In `ExperimentService._upsert_module_payload`, catch `ValidationError` and raise:

```python
raise HTTPException(
    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
    detail=exc.errors(),
) from exc
```

- [ ] **Step 5: Run targeted and full backend tests**

```bash
cd backend
uv run pytest tests/api/test_experiments.py::test_upsert_module_rejects_non_numeric_scientific_values -v
uv run pytest
```

Expected: PASS.

### Task 4: Strengthen Submit-Time Scientific Completeness Checks

**Files:**
- Modify: `backend/app/services/experiment_validation_service.py`
- Test: `backend/tests/api/test_experiments.py`

- [ ] **Step 1: Write failing tests for database-critical missing fields**

Add submit validation tests for:

- precursor `type` missing,
- precursor `method` missing,
- substrate `role` missing,
- substrate `type` missing,
- furnace point `temperature_C` missing,
- gas segment `gas` missing when segment exists,
- characterization method record missing `method`.

Run:

```bash
cd backend
uv run pytest tests/api/test_experiments.py::test_submit_reports_database_critical_missing_fields -v
```

Expected: FAIL.

- [ ] **Step 2: Add error/warning categories**

Extend `ExperimentValidationIssue` only if needed. If keeping current schema, encode severity by existing `errors` and `warnings` lists.

Blocking errors should protect fields required for normalized analysis tables. Warnings should cover useful-but-not-blocking metadata such as batch number, room humidity, sample link on file, and quality label.

- [ ] **Step 3: Implement checks in existing validation methods**

Keep methods small:

- `_validate_precursors`: require `type`, `method`; warn on missing `batch_no`, `mass_mg`.
- `_validate_substrates`: add new method; require top/bottom role object shape when present, require substrate type.
- `_validate_furnace_program`: require `temperature_C` numeric in addition to `time_min`.
- `_validate_gas_program`: require `gas` and `flow_sccm` numeric if a segment exists.
- `_validate_characterization`: add new method; require `method` on non-empty rows.

- [ ] **Step 4: Run validation tests**

```bash
cd backend
uv run pytest tests/api/test_experiments.py -k validation -v
```

Expected: PASS.

---

## Phase 3: Frontend Numeric Safety And Vocabulary Controls

### Task 5: Prevent Non-Numeric Scientific Inputs From Autosaving

**Files:**
- Modify: `frontend/src/features/experiments/editor-types.ts`
- Modify: `frontend/src/features/experiments/use-experiment-editor.ts`
- Test: `frontend/src/features/experiments/experiment-editor-page.test.tsx`

- [ ] **Step 1: Write failing frontend test**

Add a test that types `abc` into a numeric field such as precursor mass, waits past autosave delay, and asserts no `PUT /modules/precursors` request is sent and an inline/section error is shown.

Run:

```bash
cd frontend
bun run test src/features/experiments/experiment-editor-page.test.tsx -t "blocks autosave when numeric fields are invalid"
```

Expected: FAIL.

- [ ] **Step 2: Replace `normalizeNumberLike` behavior**

Change the internal contract:

```ts
type NumberParseResult =
  | { ok: true; value: number | null }
  | { ok: false; message: string };
```

Add:

```ts
function parseNullableNumber(value: string, label: string): NumberParseResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue)) {
    return { ok: false, message: `${label} 必须是数字` };
  }
  return { ok: true, value: numericValue };
}
```

- [ ] **Step 3: Add section-level validation before serialization**

For each module serialization function that has numeric fields, add a parallel validator returning:

```ts
type EditorValidationError = {
  sectionKey: EditorSectionKey;
  fieldPath: string;
  message: string;
};
```

Do not call API writes if the current dirty section has validation errors.

- [ ] **Step 4: Surface errors in `EditorSectionCard`**

Show section-local validation messages near the save state. Keep copy concise and Chinese-language consistent.

- [ ] **Step 5: Run targeted frontend test**

```bash
cd frontend
bun run test src/features/experiments/experiment-editor-page.test.tsx -t "blocks autosave when numeric fields are invalid"
```

Expected: PASS.

### Task 6: Replace High-Value Free Text Fields With Vocabulary-Backed Selects

**Files:**
- Modify: `frontend/src/features/experiments/experiment-editor-page.tsx`
- Modify: `frontend/src/features/experiments/api.ts`
- Modify: relevant components:
  - `components/experiment-main-fields.tsx`
  - `components/environment-section.tsx`
  - `components/precursors-section.tsx`
  - `components/substrates-section.tsx`
  - `components/gas-program-section.tsx`
  - `components/characterization-section.tsx`
- Test: `frontend/src/features/experiments/experiment-editor-page.test.tsx`

- [ ] **Step 1: Write failing tests for vocabulary usage**

Add tests proving:

- material system options come from `material_system`,
- precursor method options come from `precursor_method`,
- substrate type options come from `substrate_type`,
- substrate treatment options come from `substrate_treatment_method`,
- gas options come from `gas_label`,
- characterization method options come from `characterization_method`.

Run:

```bash
cd frontend
bun run test src/features/experiments/experiment-editor-page.test.tsx -t "loads vocabulary-backed editor controls"
```

Expected: FAIL.

- [ ] **Step 2: Fetch vocabularies in editor page**

Use existing `listActiveVocabularies`. Add query keys that include `currentUserId` and vocab key.

Do not block editor rendering if vocabulary fetch fails. Show free-text fallback or an error hint per section.

- [ ] **Step 3: Convert inputs to `Select` with `showSearch`**

For fields with controlled vocabularies, use Ant Design `Select`:

```tsx
<Select
  showSearch
  options={materialSystemOptions}
  value={value.materialSystem || undefined}
  onChange={(nextValue) => onChange({ ...value, materialSystem: nextValue })}
/>
```

Where legacy free values may exist, support `mode` or custom option injection so old records stay editable.

- [ ] **Step 4: Run editor tests**

```bash
cd frontend
bun run test src/features/experiments/experiment-editor-page.test.tsx -v
```

Expected: PASS.

---

## Phase 4: Analysis-Ready Export

### Task 7: Add Normalized Analysis Export In JSON

**Files:**
- Modify: `backend/app/schemas/experiment.py`
- Modify: `backend/app/services/experiment_export_service.py`
- Modify: `backend/app/api/v1/endpoints/experiments.py`
- Modify: `frontend/src/shared/types/api.ts`
- Modify: `frontend/src/features/experiments/api.ts`
- Test: `backend/tests/api/test_experiment_exports.py`

- [ ] **Step 1: Write failing backend test**

Add a test for:

```http
GET /api/v1/experiments/{id}/export/analysis
```

Expected response sections:

- `experiment`
- `precursor_rows`
- `substrate_rows`
- `furnace_point_rows`
- `gas_segment_rows`
- `gas_component_rows`
- `characterization_rows`
- `sample_rows`
- `file_rows`

Each row should include `experiment_id`, `run_code`, and row-specific identifiers.

Run:

```bash
cd backend
uv run pytest tests/api/test_experiment_exports.py::test_export_analysis_returns_normalized_rows -v
```

Expected: FAIL.

- [ ] **Step 2: Add schemas for normalized export**

Use explicit Pydantic models, not `dict[str, Any]` for top-level analysis rows. Keep extra derived feature work out of scope.

- [ ] **Step 3: Build rows from normalized module payloads**

In `ExperimentExportService`, add methods:

- `_build_precursor_rows`
- `_build_substrate_rows`
- `_build_furnace_point_rows`
- `_build_gas_segment_rows`
- `_build_gas_component_rows`
- `_build_characterization_rows`
- `_build_sample_rows`
- `_build_file_rows`

Rows should be stable, flat, and friendly to CSV/Parquet conversion later.

- [ ] **Step 4: Add endpoint**

Add:

```python
@router.get("/{experiment_id}/export/analysis", response_model=ExperimentAnalysisExportRead)
def export_experiment_analysis(...):
    return ExperimentService(db).export_experiment_analysis(experiment_id, current_user)
```

- [ ] **Step 5: Run export tests**

```bash
cd backend
uv run pytest tests/api/test_experiment_exports.py -v
```

Expected: PASS.

### Task 8: Add CSV/JSONL Batch Export As A Later Gate

**Files:**
- Modify: `backend/app/api/v1/endpoints/experiments.py`
- Modify: `backend/app/services/experiment_export_service.py`
- Test: new tests in `backend/tests/api/test_experiment_exports.py`

- [ ] **Step 1: Confirm UI/API need before implementation**

Do not implement batch export until the normalized single-experiment export is stable and a clear consumer exists.

- [ ] **Step 2: If approved, add batch endpoint with filters**

Endpoint shape:

```http
GET /api/v1/experiments/export/analysis.jsonl?status=locked&material_system=MoS2
```

Use existing visibility rules.

- [ ] **Step 3: Test authorization and filtering**

Ensure viewers only export visible submitted/locked records and members cannot export other users' drafts.

---

## Phase 5: Sample Retention During Substrate Sync

### Task 9: Replace Physical Sample Delete With Soft Delete

**Files:**
- Modify: `backend/app/models/sample.py`
- Create: `backend/alembic/versions/<new_revision>_add_sample_soft_delete_fields.py`
- Modify: `backend/app/repositories/sample_repository.py`
- Modify: `backend/app/services/sample_service.py`
- Modify: `backend/app/schemas/sample.py`
- Test: `backend/tests/api/test_samples.py`

- [ ] **Step 1: Write failing retention test**

Add test:

- create experiment,
- sync top/bottom substrates,
- remove bottom substrate from module,
- assert bottom sample is no longer listed by default,
- assert audit event records soft deletion,
- assert direct admin/internal query can see the retained row with `deleted_at`.

Run:

```bash
cd backend
uv run pytest tests/api/test_samples.py::test_substrate_sync_soft_deletes_removed_samples -v
```

Expected: FAIL.

- [ ] **Step 2: Add model fields**

Add:

```python
deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
deleted_by_id: Mapped[uuid.UUID | None] = mapped_column(
    Uuid(as_uuid=True),
    ForeignKey("users.id"),
    nullable=True,
    index=True,
)
```

Also consider `delete_reason` if users need a readable reason.

- [ ] **Step 3: Add Alembic migration**

Create migration with nullable columns and index on `deleted_by_id`.

Run:

```bash
cd backend
uv run alembic upgrade head
```

Expected: migration applies.

- [ ] **Step 4: Hide soft-deleted samples by default**

Update sample repository list methods to filter `Sample.deleted_at.is_(None)` unless explicitly requested.

- [ ] **Step 5: Soft-delete in `sync_substrate_samples`**

Replace `self.samples.delete(sample)` with setting `deleted_at`, `deleted_by_id`, and saving.

Keep the existing dependent-record guard if the user tries to remove a sample with files or children. Alternatively, allow soft delete even with dependents only if the UI clearly marks it inactive and downstream exports preserve links.

- [ ] **Step 6: Run sample tests**

```bash
cd backend
uv run pytest tests/api/test_samples.py -v
```

Expected: PASS.

---

## Phase 6: User-Facing Completeness And Workflow Improvements

### Task 10: Add Completeness Summary Before Submit

**Files:**
- Modify: `backend/app/services/experiment_validation_service.py`
- Modify: `backend/app/schemas/experiment_validation.py`
- Modify: `frontend/src/features/experiments/components/validation-summary.tsx`
- Modify: `frontend/src/features/experiments/use-experiment-editor.ts`
- Test: backend validation tests and frontend editor tests.

- [ ] **Step 1: Add validation response fields**

Add optional fields:

```python
completion_score: int
blocking_count: int
warning_count: int
```

Keep backwards compatibility by defaulting from `errors` and `warnings`.

- [ ] **Step 2: Calculate score deterministically**

Use a fixed checklist of required and recommended fields. Do not infer from arbitrary JSON keys.

- [ ] **Step 3: Display score and jump targets**

Frontend validation summary should show:

- blocking errors,
- warnings,
- completion score,
- jump buttons by `module_key`.

- [ ] **Step 4: Run tests**

```bash
cd backend
uv run pytest tests/api/test_experiments.py -k validate -v
cd ../frontend
bun run test src/features/experiments/experiment-editor-page.test.tsx -t "validation summary"
```

Expected: PASS.

### Task 11: Allow Experiment Date Correction In Draft

**Files:**
- Modify: `backend/app/schemas/experiment.py`
- Modify: `backend/app/services/experiment_service.py`
- Modify: `frontend/src/features/experiments/components/experiment-main-fields.tsx`
- Modify: `frontend/src/features/experiments/editor-types.ts`
- Test: backend experiment tests and frontend editor tests.

- [ ] **Step 1: Write failing tests**

Backend: patch draft experiment date succeeds; non-draft patch still fails.

Frontend: date input is enabled in draft and autosaves patch.

- [ ] **Step 2: Add `experiment_date` to `ExperimentUpdate`**

```python
experiment_date: date | None = None
```

Ensure changing date does not change `run_code`; run code remains historical identifier from creation. If the team wants run code to follow corrected dates, stop and make a separate migration/spec because changing identifiers has downstream risk.

- [ ] **Step 3: Enable date input in draft editor**

Remove unconditional `disabled` on the date input and respect page-level `disabled`.

- [ ] **Step 4: Run tests**

```bash
cd backend
uv run pytest tests/api/test_experiments.py -k patch -v
cd ../frontend
bun run test src/features/experiments/experiment-editor-page.test.tsx -t "autosaves edited draft fields"
```

Expected: PASS.

---

## Phase 7: Performance, Deployment, And Test Stability

### Task 12: Reduce Large Frontend Chunk

**Files:**
- Modify: `frontend/src/app/router.tsx`
- Modify: imports in heavy pages if needed.
- Test: `frontend` build.

- [ ] **Step 1: Inspect build output**

Run:

```bash
cd frontend
bun run build
```

Current expected warning: a chunk larger than 500 kB.

- [ ] **Step 2: Split Ant Design-heavy shared imports**

Keep route-level lazy loading. If the heavy shared chunk is caused by common UI imports, move page-local Ant Design components out of shared barrel-like imports and avoid importing full page modules from tests or shell components.

- [ ] **Step 3: Verify build**

```bash
cd frontend
bun run build
```

Expected: build passes. Chunk warning should be reduced or documented if Ant Design makes it acceptable for V1.

### Task 13: Stabilize Vocabulary Admin Test Flake

**Files:**
- Modify: `frontend/src/features/vocabularies/vocabulary-admin-page.test.tsx`
- Optional: `frontend/vite.config.ts`

- [ ] **Step 1: Reproduce**

Run full suite twice:

```bash
cd frontend
bun run test
bun run test
```

If both pass, do not change timeout. If the same test times out again, continue.

- [ ] **Step 2: Isolate slow interaction**

Run:

```bash
cd frontend
bun run test src/features/vocabularies/vocabulary-admin-page.test.tsx -t "creates a vocabulary entry and refreshes the table"
```

If isolated pass remains below 7 seconds, prefer test cleanup over increasing global timeout.

- [ ] **Step 3: Reduce expensive interactions**

Replace character-by-character `user.type` for large JSON textarea with `fireEvent.change` or `user.paste`, keeping one user-level path for critical fields.

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend
bun run test
```

Expected: PASS.

---

## Final Verification Gates

Run these before claiming the optimization branch is ready:

```bash
cd backend
uv lock --check
uv run ruff check .
uv run ruff format --check .
uv run pytest

cd ../frontend
bun install --frozen-lockfile --dry-run
bun run lint
bun run typecheck
bun run test
bun run build

cd ..
POSTGRES_PASSWORD=review-only JWT_SECRET_KEY=review-only docker compose config
```

Expected:

- Backend Ruff passes.
- Backend pytest passes.
- Frontend lint/typecheck/test/build pass.
- Lockfile checks do not rewrite `uv.lock` or `bun.lock`.
- Compose config validates when required env vars are supplied.

## Commit Strategy

Use separate commits by phase:

```bash
git add backend/app/repositories/audit_repository.py backend/app/services/audit_service.py backend/app/services/experiment_export_service.py backend/tests/api/test_experiment_exports.py
git commit -m "fix: include related audit events in experiment export"

git add backend/app/services/vocabulary_service.py backend/tests/api/test_vocabularies.py
git commit -m "feat: audit controlled vocabulary changes"

git add backend/app/schemas/module_payload.py backend/app/services/experiment_service.py backend/app/services/experiment_validation_service.py backend/tests/api/test_experiments.py
git commit -m "feat: validate scientific module payloads"

git add frontend/src/features/experiments frontend/src/shared/types/api.ts
git commit -m "feat: improve editor data validation"

git add backend/app/models/sample.py backend/app/repositories/sample_repository.py backend/app/services/sample_service.py backend/app/schemas/sample.py backend/alembic/versions backend/tests/api/test_samples.py
git commit -m "feat: retain removed substrate samples"
```

## Acceptance Criteria

- Experiment export includes provenance for experiment, related samples, and related files.
- Vocabulary create/update actions are audited.
- Numeric scientific fields cannot persist arbitrary strings.
- Module payload validation is stricter but still supports legacy payload normalization where explicitly allowed.
- Removed substrate-derived samples are retained by soft-delete or inactive marker.
- Users get clearer guidance before submit about database-critical missing fields.
- Analysis export returns stable, flat rows that can become CSV/JSONL/Parquet inputs later.
- Full backend and frontend gates pass with UV and Bun.

## Known Non-Goals

- No automatic image recognition.
- No Raman/PL/AFM/SEM feature extraction parser in this plan.
- No complete recipe management.
- No QR code printing.
- No multi-institution permissions.
- No migration of existing historical Excel files.

