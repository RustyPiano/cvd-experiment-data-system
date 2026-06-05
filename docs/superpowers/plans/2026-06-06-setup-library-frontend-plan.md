# Setup Library Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the frontend development for the Setup Library feature, including the library management page, authenticated image rendering, editor integration, detail page display, and creation inheritance.

**Architecture:** Implement a dedicated setup library list/edit route with automatic cascade diagram upload. Integrate this library into the experiment editor with a select dropdown and read-only fast-snapshot preview, utilizing custom authenticated image rendering.

**Tech Stack:** React 19, TypeScript, Vite, Ant Design 6, React Router 7, TanStack Query (React Query) v5.

---

### Task 1: Type Definitions and API Client Layer

**Files:**
- Modify: `frontend/src/shared/types/api.ts`
- Create: `frontend/src/features/setup-library/api.ts`
- Modify: `frontend/src/features/experiments/api.ts`

- [ ] **Step 1: Write types to `frontend/src/shared/types/api.ts`**
  Add type definitions: `SetupVisibility`, `SetupLibraryRead`, `SetupLibraryListResponse`, `SetupLibraryCreateRequest`, `SetupLibraryUpdateRequest`. Add `source_setup_library_id` to `SetupMethodsRead`.

- [ ] **Step 2: Create API Client `frontend/src/features/setup-library/api.ts`**
  Implement API queries and mutations for Setup Library entries.

- [ ] **Step 3: Modify API Client `frontend/src/features/experiments/api.ts`**
  Add the `createSetupMethodsFromLibrary` helper.

- [ ] **Step 4: Run typecheck to verify**
  Run: `bun run typecheck`
  Expected: Success without compilation errors.

- [ ] **Step 5: Commit**
  Run: `git commit -am "feat: add Setup Library api client and types"`

---

### Task 2: AuthenticatedImage Component

**Files:**
- Create: `frontend/src/shared/ui/authenticated-image.tsx`
- Create: `frontend/src/shared/ui/authenticated-image.test.tsx`

- [ ] **Step 1: Write tests for `AuthenticatedImage`**
  Create `frontend/src/shared/ui/authenticated-image.test.tsx` verifying authenticated rendering and object URL cleanup.

- [ ] **Step 2: Run test to verify it fails**
  Run: `bun run test authenticated-image.test.tsx`
  Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
  Create `frontend/src/shared/ui/authenticated-image.tsx` implementing JWT header fetch and lifecycle cleanup.

- [ ] **Step 4: Run test to verify it passes**
  Run: `bun run test authenticated-image.test.tsx`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git commit -am "feat: add AuthenticatedImage component"`

---

### Task 3: Setup Library Management Page and Routing

**Files:**
- Create: `frontend/src/features/setup-library/setup-library-page.tsx`
- Create: `frontend/src/features/setup-library/setup-library-page.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/shared/ui/app-shell.tsx`

- [ ] **Step 1: Create Setup Library Page**
  Implement lists Table, View Drawer, and Form Modal supporting cascade diagram upload.

- [ ] **Step 2: Add Route & Navigation Menu**
  Add router entry and sidebar link under AppShell.

- [ ] **Step 3: Write tests for Setup Library Page**
  Implement integration tests in `setup-library-page.test.tsx` checking CRUD operations and file upload logic.

- [ ] **Step 4: Verify typecheck & lint**
  Run: `bun run typecheck && bun run lint`

- [ ] **Step 5: Commit**
  Run: `git commit -am "feat: add Setup Library management page"`

---

### Task 4: Re-writing Completion Indicator and Editor Types

**Files:**
- Modify: `frontend/src/features/experiments/components/completion-indicator.tsx`
- Modify: `frontend/src/features/experiments/editor-types.ts`

- [ ] **Step 1: Simplify completion checks in `completion-indicator.tsx`**
  Update `baseCompletion` for `setup_methods` to check only the 7 new core properties.

- [ ] **Step 2: Update `editor-types.ts` conversion and schema helpers**
  Include new ID and key snapshot fields in `SetupMethodsValues`. Ensure upsert payloads carry all read-only fields intact to prevent clearing them in the database. Remove JSON parse validator.

- [ ] **Step 3: Run existing typecheck and tests**
  Run: `bun run typecheck && bun run test`

- [ ] **Step 4: Commit**
  Run: `git commit -am "refactor: simplify completion indicator and preserve snapshot fields"`

---

### Task 5: Rewriting Setup Methods Section in Editor

**Files:**
- Modify: `frontend/src/features/experiments/components/setup-methods-section.tsx`

- [ ] **Step 1: Implement custom select and preview drawer**
  Replace old fields with library selection. Display read-only snapshot preview card with diagram image rendering via `AuthenticatedImage`. Bind deviations checkbox ("与该 Setup 一致") and text input.

- [ ] **Step 2: Commit**
  Run: `git commit -am "feat: rewrite Setup Methods Section UI"`

---

### Task 6: Hook and Editor Page Wiring

**Files:**
- Modify: `frontend/src/features/experiments/use-experiment-editor.ts`
- Modify: `frontend/src/features/experiments/experiment-editor-page.tsx`

- [ ] **Step 1: Bind library association callback in editor hook**
  Remove template/confirm handlers and add `applySetupLibrary` using backend library import endpoint.

- [ ] **Step 2: Wire editor page queries and props**
  Query setup library instead of templates. Pass options down to `SetupMethodsSection` and bind action callback.

- [ ] **Step 3: Commit**
  Run: `git commit -am "feat: wire editor page to Setup Library APIs"`

---

### Task 7: Experiment Detail Page Setup Card

**Files:**
- Modify: `frontend/src/features/experiments/experiment-detail-page.tsx`

- [ ] **Step 1: Render Setup Methods snapshot card in parameters tab**
  Query setup snapshot using `getSetupMethods` (handle 404 cleanly) and render full text and diagram using `AuthenticatedImage`.

- [ ] **Step 2: Commit**
  Run: `git commit -am "feat: add Setup Card to Experiment Detail page"`

---

### Task 8: Experiment Creation Inheritance

**Files:**
- Modify: `frontend/src/features/experiments/experiment-new-page.tsx`

- [ ] **Step 1: Inherit Setup reference automatically in blank experiment creation**
  Fetch previous experiment's Setup snapshot. If it's a library entry, trigger cascade association in the background upon creation success. Swallow errors cleanly.

- [ ] **Step 2: Commit**
  Run: `git commit -am "feat: inherit Setup reference during creation"`

---

### Task 9: Integrating, Running and Fixing Tests

**Files:**
- Modify: `frontend/src/features/experiments/components/setup-methods-section.test.tsx`
- Modify: `frontend/src/features/experiments/use-experiment-editor.test.tsx`
- Modify: `frontend/src/features/experiments/experiment-editor-page.test.tsx`
- Modify: `frontend/src/features/experiments/experiment-new-page.test.tsx`
- Modify: `frontend/src/features/experiments/experiment-detail-page.test.tsx`

- [ ] **Step 1: Rewrite and adapt mock assertions**
  Update all test suites to fit the new selection, drawer, card, and deviation checkbox flows.

- [ ] **Step 2: Verify all tests and compile build**
  Run: `bun run test && bun run lint && bun run typecheck && bun run build`

- [ ] **Step 3: Commit**
  Run: `git commit -am "test: adapt all tests to Setup Library flow"`
