---
version: alpha
name: CVD Lab Data Capture UI
description: Frontend design system for a small research-group CVD experiment data collection system for 2D materials synthesis, characterization, and AI-ready data curation.
colors:
  primary: "#1D4ED8"
  primary-hover: "#1E40AF"
  primary-active: "#1E3A8A"
  primary-subtle: "#DBEAFE"
  primary-soft: "#EFF6FF"
  on-primary: "#FFFFFF"
  secondary: "#0F766E"
  secondary-hover: "#115E59"
  secondary-subtle: "#CCFBF1"
  accent: "#7C3AED"
  accent-subtle: "#EDE9FE"
  background: "#F8FAFC"
  surface: "#FFFFFF"
  surface-subtle: "#F1F5F9"
  surface-muted: "#E2E8F0"
  border: "#CBD5E1"
  border-subtle: "#E2E8F0"
  text: "#0F172A"
  text-secondary: "#475569"
  text-muted: "#64748B"
  text-disabled: "#94A3B8"
  success: "#15803D"
  success-subtle: "#DCFCE7"
  warning: "#B45309"
  warning-subtle: "#FEF3C7"
  error: "#DC2626"
  error-subtle: "#FEE2E2"
  info: "#2563EB"
  info-subtle: "#DBEAFE"
  draft: "#64748B"
  draft-subtle: "#F1F5F9"
  submitted: "#2563EB"
  submitted-subtle: "#DBEAFE"
  locked: "#15803D"
  locked-subtle: "#DCFCE7"
  invalid: "#DC2626"
  invalid-subtle: "#FEE2E2"
typography:
  display-lg:
    fontFamily: "Noto Sans SC, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: "Noto Sans SC, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: -0.01em
  headline-md:
    fontFamily: "Noto Sans SC, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 20px
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: -0.01em
  title-md:
    fontFamily: "Noto Sans SC, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 18px
    fontWeight: 650
    lineHeight: 1.45
  body-lg:
    fontFamily: "Noto Sans SC, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.65
  body-md:
    fontFamily: "Noto Sans SC, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Noto Sans SC, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.55
  label-lg:
    fontFamily: "Noto Sans SC, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
  label-md:
    fontFamily: "Noto Sans SC, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.35
  label-sm:
    fontFamily: "Noto Sans SC, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.3
  caption:
    fontFamily: "Noto Sans SC, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.45
  mono-md:
    fontFamily: "JetBrains Mono, Roboto Mono, SFMono-Regular, Consolas, monospace"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.5
  mono-sm:
    fontFamily: "JetBrains Mono, Roboto Mono, SFMono-Regular, Consolas, monospace"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.45
spacing:
  zero: 0px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  xxxl: 64px
  page-x: 32px
  page-y: 24px
  card: 24px
  form-row: 20px
  form-section: 32px
  table-cell-x: 12px
  table-cell-y: 10px
rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 10px
    height: 40px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 10px
    height: 40px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 10px
    height: 40px
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: 10px
    height: 40px
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 10px
    height: 40px
  card-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 24px
  card-subtle:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 20px
  badge-draft:
    backgroundColor: "{colors.draft-subtle}"
    textColor: "{colors.draft}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 6px
  badge-submitted:
    backgroundColor: "{colors.submitted-subtle}"
    textColor: "{colors.submitted}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 6px
  badge-locked:
    backgroundColor: "{colors.locked-subtle}"
    textColor: "{colors.locked}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 6px
  badge-invalid:
    backgroundColor: "{colors.invalid-subtle}"
    textColor: "{colors.invalid}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 6px
  alert-info:
    backgroundColor: "{colors.info-subtle}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 16px
  alert-warning:
    backgroundColor: "{colors.warning-subtle}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 16px
  alert-error:
    backgroundColor: "{colors.error-subtle}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 16px
---

# CVD Lab Data Capture UI DESIGN.md

This document is the frontend design source of truth for the CVD experiment data collection web application. It is written for Google Stitch, coding agents, designers, and frontend developers. Use it to generate consistent screens, React/Vue components, Tailwind themes, and design reviews.

The product is a scientific data collection tool for a small 2D-materials research group. The interface must help experimental researchers record CVD synthesis parameters quickly, safely, and consistently while preserving enough structure for later AI analysis.

## Overview

The visual language is **scientific, calm, structured, and data-dense without feeling like a spreadsheet clone**. The system should feel like a reliable lab instrument panel combined with a modern research data notebook.

Primary design goals:

- Make long experimental forms feel manageable by splitting them into clear modules.
- Reduce accidental edits through explicit states, confirmation, and audit-friendly UI.
- Support quick repeated experiments through cloning, inherited defaults, and diff views.
- Make structured data visible: units, validation status, sample IDs, file links, and provenance should be easy to scan.
- Prioritize readability in Chinese labels with occasional English keys and scientific units.

Target users:

- Graduate students and researchers entering CVD experiments during or after lab work.
- A group administrator maintaining controlled vocabularies, recipes, and field definitions.
- A PI or collaborator reviewing submitted/locked experiments.

Tone:

- Professional, minimal, precise.
- Avoid playful illustrations, heavy gradients, excessive animation, or consumer-app aesthetics.
- Prefer quiet surfaces, sharp hierarchy, and clear states.

Density:

- Desktop-first and data-heavy.
- Use compact form controls and tables, but keep enough vertical spacing to avoid fatigue.
- Mobile should support viewing and light editing, but the primary editing experience is desktop/tablet.

## Colors

The palette uses high-legibility slate neutrals, scientific blue for primary actions, teal for material/sample-related secondary actions, and strict semantic colors for validation/status.

- **Primary (#1D4ED8):** Used for the main action on a screen, active navigation, current wizard step, focused form controls, and primary links.
- **Primary subtle (#DBEAFE / #EFF6FF):** Used for selected rows, active chips, info panels, and low-emphasis blue backgrounds.
- **Secondary (#0F766E):** Used for sample, file, and characterization contexts where the action is important but not the single primary submit action.
- **Accent (#7C3AED):** Used sparingly for AI-ready features, extracted features, or future analysis modules.
- **Background (#F8FAFC):** Main app background. Never use pure white as the full-page background.
- **Surface (#FFFFFF):** Cards, form sections, tables, modals, and panels.
- **Borders (#CBD5E1 / #E2E8F0):** Use borders instead of strong shadows for most hierarchy.
- **Text (#0F172A):** Primary readable text.
- **Muted text (#64748B):** Secondary metadata, units, hints, and timestamps.
- **Success (#15803D):** Valid, saved, locked, completed modules.
- **Warning (#B45309):** High-risk experiment conditions, inherited values requiring confirmation, missing optional but recommended metadata.
- **Error (#DC2626):** Blocking validation errors, failed upload, invalid experiment state.

Status colors:

| Status | Background | Text | Usage |
|---|---|---|---|
| Draft | `draft-subtle` | `draft` | Editable unsent experiment |
| Submitted | `submitted-subtle` | `submitted` | Submitted and reviewable |
| Locked | `locked-subtle` | `locked` | Frozen record used for datasets/papers |
| Invalid | `invalid-subtle` | `invalid` | Retained but excluded from normal analysis |

Color rules:

- Use one dominant primary action per screen.
- Do not use red except for destructive actions or blocking errors.
- Do not encode information by color alone; pair status colors with icons/text.
- Keep normal text contrast at WCAG AA level or better.
- Use blue for workflow navigation; use teal for samples/files; use purple only for AI/feature extraction.

## Typography

Typography must support Chinese scientific labels, English field keys, and numeric experimental values.

Font strategy:

- **Main UI:** `Noto Sans SC, Inter, system-ui`.
- **Technical values:** `JetBrains Mono, Roboto Mono, SFMono-Regular, Consolas, monospace`.
- Use Chinese labels as primary text and English keys as secondary metadata when both are needed.

Hierarchy:

- `display-lg`: Dashboard title or major product-level heading.
- `headline-lg`: Page title, experiment title, detail page header.
- `headline-md`: Card section heading and wizard module heading.
- `title-md`: Subsection titles inside forms.
- `body-md`: Default UI body text.
- `body-sm`: Dense table text, helper descriptions.
- `label-md` / `label-sm`: Form labels, tags, table headers, compact controls.
- `mono-md` / `mono-sm`: Experiment IDs, sample IDs, units, field keys, raw file hashes, JSON snippets.

Typography rules:

- Form labels should be 13px or 14px semi-bold.
- Helper text should be 12px to 13px muted gray.
- Numeric values with units should use monospaced font when displayed in tables or summaries.
- Long Chinese explanatory text should use 1.6 line-height.
- Do not uppercase Chinese labels.

Examples:

```text
实验编号 CVD-2026-0001
样品编号 S-2026-0001-A
气体 Ar 流量 80 sccm
温区 1 最高温度 750 ℃
```

## Layout

The app uses a **desktop-first research dashboard layout**.

Global shell:

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Bar: product name, global search, user menu              │
├───────────────┬──────────────────────────────────────────────┤
│ Left Nav      │ Page content                                 │
│ 240px         │ max-width depends on page type               │
└───────────────┴──────────────────────────────────────────────┘
```

Desktop layout:

- Left sidebar width: 240px.
- Top bar height: 56px.
- Main page padding: 24px top/bottom, 32px left/right.
- Content max width:
  - Experiment list: full width.
  - Experiment editor: 1280px.
  - Detail page: 1200px.
  - Admin settings: 1120px.

Responsive breakpoints:

| Breakpoint | Width | Behavior |
|---|---:|---|
| Mobile | `< 640px` | Sidebar collapses into drawer; forms become single column; table becomes card list |
| Tablet | `640–1023px` | Sidebar collapsible; editor uses top stepper or drawer stepper |
| Desktop | `>= 1024px` | Persistent sidebar; editor uses left stepper and right form |
| Wide desktop | `>= 1440px` | More columns allowed in summary/detail views; avoid stretching text blocks too wide |

Grid rules:

- Use a 12-column grid for desktop summary pages.
- Use 2-column form layout for medium-width modules, 3-column layout only for compact numeric fields.
- Long text areas, file upload areas, temperature program editors, and gas segment editors must span full width.
- Maintain 24px spacing between major cards and 16px between related controls.

Form layout:

```text
Section Card
  Section Header
    Title
    Description / module status
  Field Grid
    label + control + helper/error
  Section Footer
    Save status / actions
```

Table layout:

- Keep table headers sticky when lists are long.
- Use horizontal scrolling for dense admin tables instead of shrinking text below 12px.
- Important columns stay left: experiment ID, date, owner, status.
- Row actions stay right: view, edit, clone, export.

## Elevation & Depth

The system should feel crisp and precise. Use **tonal separation and borders** more than deep shadows.

Depth levels:

1. **Page background:** `background`.
2. **Primary cards and panels:** `surface` with 1px `border-subtle`.
3. **Nested panels:** `surface-subtle` with subtle border.
4. **Modals/popovers:** `surface` with stronger border and soft shadow.
5. **Critical floating elements:** use shadow only for dialogs, dropdowns, tooltips, and blocking confirmations.

Shadow guidance:

- Default cards should not have heavy shadows.
- Use `box-shadow: 0 8px 24px rgba(15, 23, 42, 0.10)` for modals.
- Use `box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08)` for dropdowns/popovers.
- Never combine strong shadow with bright backgrounds.

Hierarchy should come from:

- Size and placement.
- Border contrast.
- Status badges.
- Stepper progress.
- Section grouping.
- Clear typography.

## Shapes

The shape language is **soft-technical**.

- Default corner radius: 8px.
- Cards: 12px.
- Modals: 16px.
- Badges/chips: full pill.
- Tables: 12px outer container with square internal row boundaries.
- Inputs/buttons: 8px.
- Avoid highly rounded “consumer app” shapes for core lab workflows.

Use sharper boundaries for dense data:

- Data tables may have 0px internal cell radius.
- Temperature/gas timeline rows should align cleanly on a grid.
- File cards and sample cards may use 12px radius.

## Components

### App shell

Use a persistent scientific workspace shell.

Sidebar sections:

```text
实验记录
- 我的实验
- 新建实验
- 样品
- 文件

标准化配置
- Recipe
- 字段字典
- 受控词表

数据与导出
- 导出任务
- 审计日志
```

Top bar:

- Product name: `CVD Lab Data`.
- Optional project switcher.
- Global search field with placeholder: `搜索实验编号、样品编号、材料体系…`.
- User menu on right.

### Buttons

Button hierarchy:

| Variant | Usage |
|---|---|
| Primary | Save, Submit, Create experiment, Upload, Confirm clone |
| Secondary | Cancel, Back, View details, Export |
| Tertiary/Ghost | Minor actions in cards and tables |
| Danger | Invalidate, delete file, destructive admin action |

Rules:

- Only one primary button should appear in the main action area of a screen.
- If there is both “保存草稿” and “提交实验”, make “提交实验” primary and “保存草稿” secondary unless the user is still editing a module.
- Destructive actions require confirmation and must not be placed next to primary submit without spacing.

### Form fields

All form fields must include:

- Chinese label.
- Unit suffix where applicable.
- Helper text if the field is inherited, high risk, or conditionally required.
- Error message directly below the field.
- Optional English field key in admin/debug mode only.

Field anatomy:

```text
[Label] [Required marker]
[Input control] [unit suffix]
[Helper / inherited source / validation error]
```

Examples:

```text
室内湿度 *
[ 45 ] %

气体 Ar 流量
[ 80 ] sccm
继承自 CVD-2026-0012，提交前请确认。
```

Required marker:

- Use a red `*` only when the field blocks submission.
- Use “推荐填写” hint for non-blocking but important metadata.

Validation states:

| State | Visual |
|---|---|
| Default | White input, subtle border |
| Focus | Primary blue border and light blue ring |
| Error | Error border, error text, optional icon |
| Warning | Warning border or warning helper, not as strong as error |
| Disabled | Muted background, disabled text |
| Inherited | Small “继承” chip + source experiment ID |
| Changed from source | Small “已修改” chip + diff popover |

### Wizard / stepper

Experiment editing uses a stepper.

Steps:

```text
基本信息
环境与检查
前驱体
基底
温区
气体
过程观察
表征与文件
结果总结
提交
```

Desktop:

- Left vertical stepper fixed within editor layout.
- Each step shows status: empty, editing, saved, warning, error, complete.
- Clicking a step navigates without losing unsaved changes; auto-save first.

Mobile/tablet:

- Use top horizontal scrollable stepper or dropdown step selector.

Stepper status:

| Status | Icon/Color | Meaning |
|---|---|---|
| Empty | gray circle | No data yet |
| Saved | green check | Saved and valid |
| Warning | amber icon | Can submit but should review |
| Error | red icon | Blocks submission |
| Current | blue ring | Active step |

### Cards and section panels

Use cards to group semantic modules. Every module card should include:

- Title.
- Short description.
- Module status badge.
- Last saved time.
- Optional “复制自/继承自” source.

Example module header:

```text
前驱体
记录前驱体种类、品牌、浓度、制样方式与制备参数。
[已保存] 上次保存 14:32
```

### Experiment list table

Columns:

```text
实验编号 | 日期 | 实验人员 | 项目 | 材料体系 | 状态 | Recipe | 质量标签 | 更新时间 | 操作
```

Table controls:

- Search input.
- Filters: 我的/全部、日期范围、材料体系、状态、质量标签、是否有文件。
- Batch export selected rows.
- Row-level actions: 查看、编辑、复制、导出、作废。

Visual rules:

- Experiment ID uses mono font.
- Status uses badges.
- Locked rows should not look disabled; they are important records.
- Invalid rows should be visually de-emphasized and excluded by default filters.

### Create experiment entry

The new experiment screen should present 4 large choice cards:

1. **空白 CVD 实验**
2. **复制我的上一条实验**
3. **从 Recipe 创建**
4. **从历史实验复制**

Each card includes:

- Title.
- Description.
- What will be prefilled.
- Risk note if applicable.

For clone actions, always show a confirmation screen:

```text
将复制 CVD-2026-0012 的参数
将复制：前驱体、基底、温区、气体、表征计划
不会复制：实验日期、实验结果、异常备注、文件、质量标签
```

### Difference view

Diff view is important for cloned/inherited experiments.

Use side-by-side or inline diff depending on width.

Diff row format:

```text
字段                 来源值                  当前值
前驱体 A 种类         MoO3                    WO3
温区 1 最高温度        750 ℃                  800 ℃
Ar 流量              80 sccm                 100 sccm
```

Rules:

- Use mono font for numbers and units.
- Mark changed values with subtle blue background.
- Mark high-risk changes with warning color.
- Provide “确认所有继承字段” action before submit if inherited values exist.

### Status badges

Use consistent badge labels:

| Status | Label |
|---|---|
| `draft` | 草稿 |
| `submitted` | 已提交 |
| `locked` | 已锁定 |
| `invalid` | 已作废 |

Quality labels:

| Quality | Label | Color intent |
|---|---|---|
| success | 成功 | success |
| partial | 部分成功 | warning |
| failed | 失败 | error |
| unknown | 未判断 | neutral |

### Alerts

Alert types:

- Info: imported data, save status, general note.
- Warning: inherited value, abnormal operation, risky precheck, missing recommended metadata.
- Error: blocking validation, upload failure, permission denied.
- Success: saved, submitted, exported.

Alert copy must be concise and actionable.

Bad:

```text
错误
```

Good:

```text
温区程序时间必须递增。请检查第 3 个温度节点。
```

### File upload

File upload area should support drag-and-drop.

States:

- Empty: dashed border with upload icon.
- Drag over: primary-subtle background.
- Uploading: progress bar per file.
- Success: file card with metadata.
- Error: file card with retry and error reason.

Required metadata after upload:

- Sample ID.
- Characterization method: OM, Raman, PL, AFM, SEM, Other.
- Instrument, if known.
- Acquisition date/time, if known.
- File role: raw, processed, report.

File cards should show:

```text
[file icon] Raman_532_sampleA_001.txt
Raman · S-2026-0001-A · raw · 1.2 MB · uploaded by name
[补充元数据] [下载] [删除]
```

### Sample cards

Sample cards are compact identity cards.

Fields:

- Sample code, mono font.
- Role: upper substrate, lower substrate, product, control.
- Substrate type.
- Position relative to zone.
- Linked files/features count.
- QR code action when enabled.

Sample card example:

```text
S-2026-0001-A
上基底 · 硅片单抛 N<100> · +1 mm
文件 4 · 特征 12
```

### Temperature program editor

Do not use a single free-text input for temperature traces.

Use an editable table plus optional chart preview:

```text
节点 | 时间 min | 温度 ℃ | 说明 | 操作
1    | 0        | 25     | 起始 | 删除
2    | 30       | 750    | 升温结束 | 删除
3    | 45       | 750    | 保温结束 | 删除
```

Rules:

- Time must be non-negative and increasing.
- Temperature unit is always ℃ in UI.
- Show derived values: max temperature, ramp rate, hold time, total time.
- If chart is shown, keep it simple and monochrome/primary line.

### Gas program editor

Use editable segments instead of many fixed gas columns.

```text
阶段 | 起始 min | 结束 min | 气体 | 组分流量 sccm | 占比 | 总流量 sccm | 操作
洗气 | -10      | 0       | Ar+H2 | Ar 95, H2 5 | Ar 95%, H2 5% | 100 | 删除
生长 | 0        | 45      | Ar    | Ar 80        | 100% | 80 | 删除
```

Rules:

- Mixed gas opens component editor with per-component flow_sccm input and computed percentage.
- Check overlapping time segments.
- Total flow is derived (sum of component flows).
- Flow values use mono font in review summaries.

### Characterization and feature section

The characterization section is split into:

1. Planned/available characterization methods.
2. Uploaded files.
3. Extracted features.

Methods:

- OM
- Raman 532
- Raman 633
- PL 532
- PL 633
- AFM
- SEM

Feature table columns:

```text
特征 | 值 | 单位 | 来源文件 | 算法/人工 | 置信度 | 审核状态
```

Use purple accent only for extracted/AI-assisted features, not for normal upload actions.

### Modals and confirmations

Use modals for:

- Submit experiment.
- Lock experiment.
- Invalidate experiment.
- Delete file.
- Confirm clone.
- Review inherited high-risk fields.

Modals must include:

- Clear title.
- Consequence-oriented description.
- Primary action.
- Cancel action.
- For destructive actions, require reason text.

Example:

```text
锁定实验 CVD-2026-0001？
锁定后不能直接修改，只能派生新版本。此操作会写入审计日志。
[取消] [确认锁定]
```

### Empty states

Empty states should be practical, not decorative.

Examples:

```text
还没有实验记录
你可以创建空白 CVD 实验，或复制上一条实验快速开始。
[新建实验]
```

```text
还没有上传表征文件
上传 OM、Raman、PL、AFM 或 SEM 文件后，可以将文件关联到样品和特征。
[上传文件]
```

### Loading states

- Use skeleton rows for experiment list and detail pages.
- Use inline spinner for button actions.
- Do not block the whole page for module auto-save.
- Auto-save status should be subtle: `正在保存…` → `已保存 14:32` → `保存失败，点击重试`.

### Toasts

Use toasts for transient non-critical feedback:

- Saved.
- Export started.
- File uploaded.
- Clone created.

Do not use toast as the only place for blocking validation errors. Blocking errors must appear next to fields and in the submit validation summary.

## Do's and Don'ts

### Do

- Do use the token values defined in the YAML front matter instead of hardcoded colors or spacing.
- Do keep all scientific units visible near numeric inputs and outputs.
- Do show experiment status and save status in all edit/detail contexts.
- Do split long forms into modules and persist each module independently.
- Do use tables for structured repeated data such as precursors, temperature nodes, gas segments, files, and features.
- Do make inherited values explicit with source experiment IDs.
- Do show field-level errors close to the field that caused them.
- Do preserve raw imported data when field mapping is uncertain.
- Do support keyboard navigation in forms and tables.
- Do design for Chinese labels first, with English keys as secondary metadata.

### Don't

- Don't make the app look like a raw Excel sheet.
- Don't hide units inside placeholder text.
- Don't rely on color alone to communicate status.
- Don't use red for non-destructive or non-error states.
- Don't use heavy shadows, gradients, or decorative illustrations in core workflows.
- Don't allow silent inheritance of experimental parameters without showing the source.
- Don't allow locked experiments to be edited in place.
- Don't put destructive actions next to submit actions without spacing and confirmation.
- Don't shrink dense scientific tables below readable text sizes.
- Don't use uncontrolled free-text where a controlled vocabulary or structured editor is available.

## Product Screens

### Login page

Purpose: local account login for a small lab group.

Layout:

- Centered card, max width 420px.
- Product title and short subtitle.
- Username/email input.
- Password input.
- Primary login button.
- Optional deployment/environment label in footer.

Visual tone:

- Quiet and professional.
- No large illustration required.
- Use background color `background` and card `surface`.

### Experiment list: `/experiments`

Purpose: let users find, filter, clone, and export experiment records.

Header:

```text
实验记录
管理 CVD 实验、样品、表征文件和导出任务。
[新建实验]
```

Controls:

- Search: `搜索实验编号、样品编号、材料体系、备注…`
- Filter chips: 我的、全部、草稿、已提交、已锁定、有文件、成功/失败。
- Date range picker.
- Export selected.

Main view:

- Desktop: table.
- Mobile: stacked cards.

Default sorting:

- Last updated descending.
- Invalid records hidden unless filter enabled.

### New experiment: `/experiments/new`

Purpose: choose how to start a new record.

Use 2x2 choice grid on desktop and single column on mobile.

Cards:

1. 空白 CVD 实验
2. 复制我的上一条实验
3. 从 Recipe 创建
4. 从历史实验复制

Each card should include a primary/secondary call to action and a short explanation of copied/not-copied data.

### Experiment editor: `/experiments/:id/edit`

Purpose: fill and revise a draft experiment.

Layout:

```text
Experiment Header
  run code, status, owner, date, recipe/source, save state

Editor Body
  Left: stepper
  Right: module form card

Footer / sticky actions
  保存草稿 | 上一步 | 下一步 | 提交实验
```

Header rules:

- Experiment ID in mono font.
- Status badge near title.
- If cloned, show `派生自 CVD-2026-0012` link.
- If locked, redirect to read-only detail; do not show editable controls.

Module forms:

- Use cards for sub-sections.
- Repeated groups use inline editable tables with add/remove row controls.
- Save module on blur or debounce after edit.
- Show warning summary at top if the module contains high-risk values.

### Experiment detail: `/experiments/:id`

Purpose: review, export, and trace a submitted/locked experiment.

Layout:

- Header with experiment identity and actions.
- Summary cards: status, material system, date, operator, quality label.
- Tabs:
  - Overview
  - Parameters
  - Samples
  - Files
  - Features
  - Audit
  - Export

Rules:

- Detail view is read-only by default.
- For draft experiments, show “继续编辑”.
- For submitted experiments, show “解锁修改” only if permitted.
- For locked experiments, show “派生新实验”.

### File management: `/experiments/:id/files`

Purpose: upload and annotate characterization files.

Layout:

- Upload dropzone at top.
- File filters by method and sample.
- File cards or table.
- Metadata side panel for selected file.

Metadata editing:

- Sample ID is required.
- Method is required.
- Instrument and acquisition settings are recommended.
- Raw file metadata should be shown in a collapsed technical panel.

### Sample detail: `/samples/:id`

Purpose: view a sample, linked experiment, characterization, files, and extracted features.

Header:

- Sample ID, role, parent experiment, QR action.

Sections:

- Basic sample info.
- Position and substrate treatment.
- Linked files.
- Feature table.
- Provenance timeline.

### Admin: field dictionary `/admin/fields`

Purpose: manage standardized fields, labels, units, validation, and defaults.

Use a dense table with side-panel editing.

Columns:

```text
字段 key | 中文名 | 模块 | 类型 | 单位 | 必填 | 默认策略 | 可继承 | 枚举 | 状态
```

Rules:

- Field key uses mono font.
- Editing a field that affects existing templates should warn about versioning.
- Prefer creating a new template version over modifying locked historical definitions.

### Admin: controlled vocabulary `/admin/vocabularies`

Purpose: manage dropdown values such as substrate type, precursor method, gas type, characterization method.

Layout:

- Vocabulary categories in left panel.
- Values table in right panel.
- Add/edit value modal.

Rules:

- Allow aliases for historical data cleanup.
- Show usage count before disabling a vocabulary value.

## Form Modules

The CVD V1 form should be derived from the existing lab template, but represented as modular structured editors rather than a single wide spreadsheet.

### Basic information

Fields:

- Experiment date.
- Operator.
- Project.
- Material system.
- Experiment type/template version.
- Recipe/source experiment.
- Objective.

Design:

- Use 2-column grid on desktop.
- Objective spans full width.
- Show source recipe/experiment as a linked chip.

### Environment and precheck

Fields include:

- Indoor temperature.
- Indoor humidity.
- Sample preparation environment.
- Abnormal operation note.
- Hood cleanliness.
- Flange outlet blocked.
- Boat contamination.
- Quartz tube contamination.
- Seal intact.

Design:

- Use checklist cards for precheck items.
- Risky answers trigger warning panels and require notes when blocking.
- Numeric contamination values should use compact number inputs or segmented scale.

### Precursors

Represent precursors as a repeatable list instead of fixed A/B columns.

Each precursor row/card includes:

- Role: A, B, C, dopant, catalyst, other.
- Type.
- Brand.
- Concentration.
- Preparation method.
- Method-specific parameters: melting temperature, spin speed, pre-spin, preparation time.

Design:

- Desktop: editable table with expandable row details.
- Mobile: repeatable cards.
- Method-specific fields appear conditionally.

### Substrates

Represent upper/lower/control substrates as repeatable items with role.

Fields:

- Role.
- Type.
- Brand.
- Size.
- Treatment method.
- Treatment parameters.
- Position relative to temperature zone.

Design:

- Use cards grouped by role.
- Position input uses numeric value + unit `mm` + direction hint.

### Furnace zones

Represent zones as repeatable panels.

Each zone contains:

- Zone index.
- Whether precursor is placed.
- Temperature program node table.
- Derived values.

Design:

- Show compact line preview if possible.
- The table remains the source of truth.

### Gas program

Represent gas flow as time segments.

Fields:

- Stage.
- Start/end time.
- Gas name or mixture.
- Components with flow_sccm input and computed fraction/percentage.
- Flow rate.

Design:

- Use segment table and derived total flow.
- Warnings for overlap or missing flow.

### Characterization

Fields/methods:

- OM.
- OM area/feature extraction.
- Raman 532.
- Raman 633.
- PL 532.
- PL 633.
- AFM.
- SEM.

Design:

- Method toggles at top.
- Enabled methods create method-specific metadata areas.
- Uploads are associated with selected method and sample.

## Interaction Rules

### Auto-save

Auto-save behavior:

- Save on field blur for simple controls.
- Debounce 800–1200ms for text areas and repeated editors.
- Save each module independently.
- Show per-module save state.

Save states:

```text
未保存修改
正在保存…
已保存 14:32
保存失败，点击重试
```

### Submission

Before submit:

- Validate all modules.
- Show summary of blocking errors.
- Show warnings separately.
- Require confirmation for inherited high-risk fields.
- Require quality/result summary only if configured.

Submit confirmation should state that submitted records are more stable and changes are audited.

### Locking

Locking behavior:

- Locked experiments are read-only.
- Users can clone/derive a new experiment from locked records.
- Locking writes an audit event.
- UI must not show inline edit controls for locked records.

### Invalidating

Invalidation behavior:

- Invalid records are retained.
- Require reason.
- Default filters hide invalid records.
- Detail page shows prominent invalid banner.

### Cloning and inheritance

Cloning must be explicit.

Show copied and not-copied categories:

Copied:

- Precursors.
- Substrates.
- Furnace program.
- Gas program.
- Characterization plan.

Not copied by default:

- Experiment date.
- Result summary.
- Abnormal notes.
- Uploaded files.
- Quality labels.
- Audit history.

Inherited fields should show:

```text
继承自 CVD-2026-0012
```

When edited, show:

```text
已修改，原值：80 sccm
```

## Accessibility

Minimum requirements:

- All interactive controls keyboard accessible.
- Visible focus ring using primary color.
- Use `aria-describedby` for helper/error text.
- Use semantic form labels, not placeholder-only labels.
- Normal text contrast should meet WCAG AA.
- Error/warning/success must not rely on color alone.
- Tables need accessible headers.
- Modals trap focus and return focus to triggering element after close.
- Toasts should not contain the only copy of critical errors.

Chinese language support:

- Use proper Chinese punctuation.
- Avoid overlong labels; move explanations to helper text.
- Keep unit abbreviations standard: ℃, %, min, sccm, rpm, mm, nm, cm⁻¹.

## Content Guidelines

Voice:

- Direct.
- Specific.
- Actionable.
- Research-lab appropriate.

Use:

- `保存草稿`
- `提交实验`
- `锁定实验`
- `派生新实验`
- `复制上一条实验`
- `上传表征文件`
- `补充元数据`
- `导出 JSON`

Avoid:

- Vague messages like `失败了`.
- Consumer-style encouragement like `太棒了！`.
- Ambiguous actions like `确定` without context.

Error copy examples:

```text
温区 1 的时间节点必须递增。请检查第 3 行。
```

```text
密封圈状态为“否”时，必须填写异常备注。
```

```text
文件已上传，但尚未关联样品。提交前请补充样品编号。
```

## Implementation Notes

Token usage:

- Export the YAML tokens to Tailwind/theme config when possible.
- Use CSS variables generated from token names.
- Do not scatter raw hex values in components.
- Keep component variants mapped to token names.

Recommended CSS variable examples:

```css
:root {
  --color-primary: #1D4ED8;
  --color-background: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-text: #0F172A;
  --radius-md: 8px;
  --spacing-md: 16px;
}
```

Recommended frontend component structure:

```text
src/
  app/
  components/
    shell/
    forms/
    tables/
    experiment/
    files/
    samples/
    admin/
  design/
    tokens.css
    theme.ts
    DESIGN.md
```

Recommended UI libraries:

- If using Ant Design, override theme tokens to match this file.
- If using Tailwind, map tokens into `theme.extend`.
- If using shadcn/ui, customize CSS variables and keep components dense enough for lab workflows.

## AI Agent Instructions

When generating UI for this project:

1. Follow the YAML tokens exactly for color, typography, spacing, and radius.
2. Do not invent new primary colors, shadows, gradients, or brand styles.
3. Design in Chinese by default.
4. Use desktop-first layouts for experiment editing and data management.
5. Prefer structured editors over free-text fields for repeated scientific parameters.
6. Always show units for numeric experimental values.
7. Always make data state visible: draft/submitted/locked/invalid, saved/unsaved, inherited/modified.
8. Keep locked records read-only.
9. Treat file upload and sample association as first-class workflows.
10. Use warnings for risky experiment conditions and inherited values that require review.
