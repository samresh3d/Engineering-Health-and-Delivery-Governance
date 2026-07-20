# Design Document: Leadership Data Management

## Overview

The Leadership Data Management feature adds an **in-portal, editable KPI data layer** to the existing standalone, client-side, Excel-driven Leadership Dashboard module at `client/src/leadership`. Today the only way to change KPI data is to edit the source Excel workbook and re-upload it. This feature introduces a dedicated **Data Management page** with a spreadsheet-like, inline-editable **Data Grid** so business users can view, edit, validate, and manage KPI data directly in the app. Excel becomes an optional import/export exchange mechanism rather than the sole path to change data.

The feature is delivered **entirely inside the isolated Leadership module** and reuses its existing in-memory `DashboardModel` and its `MetricValue`, `KpiDefinition`, `Period`, and `Dimensions` types, the SheetJS-based `ExcelParser`, and the `ExportService`. There is no backend, network API, or database: all durable state (edited model, audit trail, and versions) is persisted to **browser storage** (localStorage/IndexedDB) so it survives a page reload on the same browser.

Because every dashboard view already renders from the context `model`/`filtered` state (see `LeadershipProvider`), committing an edit into the model automatically re-renders KPI cards, charts, heatmaps, team rankings, trends, executive summary, and insights — satisfying the "instant synchronization" requirement without a manual refresh.

### Alignment with the existing module

This design extends, rather than replaces, the architecture established by the `leadership-dashboard` spec:

- **State**: The existing `LeadershipProvider` reducer + React Context is the single source of truth. This feature adds editing state (audit trail, versions, current user, edit history, approval settings) and editing actions to the same provider, keeping all state confined to the module.
- **Pure computation core**: New logic (grid projection, validation, indicators, merge, approval, persistence serialization) is implemented as pure functions/services in `services/`, mirroring the existing `filter-controller`, `health-classifier`, and `excel-parser` style. This keeps the logic property-testable and free of React/DOM coupling.
- **Parser/Export reuse**: Import reuses `excelParser.parse`; Excel export reuses `exportService.exportModelToWorkbook`. The existing matrix layout, normalized parsers, and fraction normalization remain intact.
- **Grid library**: `ag-grid-react` is already a client dependency (`client/package.json`), so the spreadsheet-like grid, multi-cell selection, and clipboard paste are built on it without adding new dependencies.

### Key Design Decisions

1. **Grid rows are a projection of the model, not a new store.** The Data Grid renders one row per `MetricValue`. Edits are applied back to the model (`MetricValue.value` for Actual, `KpiDefinition.target` for Target). The model remains the single source of truth, guaranteeing dashboard synchronization and model fidelity (Req 3, Req 11.3).
2. **Target edits are per-KPI by design.** `Target` lives on `KpiDefinition`, which is shared across all periods/teams for that KPI. Editing a Target therefore updates the KPI's definition and is reflected in every row for that KPI. This is called out explicitly so the UI can communicate the scope of a target edit.
3. **Backend-free persistence via a `PersistenceService` abstraction.** A storage-adapter interface wraps localStorage (with an IndexedDB adapter as a drop-in for larger datasets). Auto-save runs on every commit; load runs on page mount. Storage failures degrade gracefully to in-memory operation (Req 10.6).
4. **KPI type is derived, not stored on the sheet.** Per Assumption A5, `KPI_Type` (Percentage, Currency, Number, Text) is resolved from `KpiDefinition` metadata and, failing that, inferred from the KPI's existing values. Percentage validation reuses the existing fraction normalization.
5. **Approval workflow is an optional, toggleable layer.** When enabled, a derived "approved model" drives the dashboards; when disabled, all saved data drives them (Req 3.3, 3.4, 6). The toggle is a module setting persisted alongside the model.
6. **Undo/redo via immutable snapshots.** Each editing operation pushes the prior model onto an undo stack; undo/redo swap snapshots. Because the model is plain data, snapshotting is a structured clone — simple and correct (Req 8.5, 8.6).
7. **Local identity for "Updated By".** Per Assumption A1, the current user is a locally captured display name prompted once and stored in browser storage. No authentication exists.

### Scope Boundaries

- **In scope:** Data Management page + editable grid, inline editing with per-type validation, dashboard synchronization, Excel/CSV import (replace/merge) and export, change tracking/audit trail, optional approval workflow, grid filters, bulk edit/paste/delete + undo/redo, visual indicators, auto-save + versioning.
- **Out of scope:** Any backend, network API, or database; multi-user approval routing and server-side conflict resolution; any change to the existing Engineering Health Dashboard or its tightly-coupled components (Req 11.6); authentication.

---

## Architecture

### High-Level Architecture

```mermaid
graph TD
    subgraph Module ["client/src/leadership (isolated module)"]
        subgraph UI ["View Layer (React + AG Grid + ECharts)"]
            NAV[Nav: Data Management entry]
            DMP[DataManagementView]
            DG[DataGrid AG-Grid]
            GF[GridFilterBar]
            AUD[AuditTrailPanel]
            VER[VersionPanel]
            IMP[ImportExportControls]
            IDN[IdentityPrompt]
            DASH[Existing dashboards: cards, charts, trends, insights]
        end

        subgraph State ["State Layer (extended LeadershipProvider)"]
            CTX[LeadershipProvider Context + reducer]
        end

        subgraph Core ["Computation Core (pure services)"]
            GP[GridProjector]
            VAL[Validator]
            IND[IndicatorService]
            CT[ChangeTracker]
            AP[ApprovalService]
            EH[EditHistory undo/redo]
            IS[ImportService]
            XS[ExportService + CSV]
            PS[PersistenceService]
        end

        subgraph Reused ["Existing services (unchanged)"]
            EP[excelParser]
            EXP[exportService]
            FC[filter-controller]
            HC[health-classifier]
        end
    end

    NAV --> DMP
    DMP --> DG & GF & AUD & VER & IMP & IDN
    DG -->|commit edit| CTX
    GP -->|GridRow[]| DG
    CTX --> GP
    DG --> VAL
    DG --> IND
    CTX -->|commit| CT
    CT --> AUD
    CTX --> EH
    IMP --> IS & XS
    IS --> EP
    XS --> EXP
    CTX -->|autosave / load| PS
    PS --> Browser[(localStorage / IndexedDB)]
    CTX -->|approved model| AP
    AP --> DASH
    CTX --> DASH
    CTX --> FC
    FC --> HC
```

### Edit-and-Synchronize Flow

```mermaid
sequenceDiagram
    participant U as User
    participant DG as DataGrid
    participant V as Validator
    participant CTX as LeadershipProvider
    participant CT as ChangeTracker
    participant PS as PersistenceService
    participant D as Dashboards

    U->>DG: Edit a Target/Actual cell and commit
    DG->>V: validate(rawInput, kpiType)
    alt invalid
        V-->>DG: { ok: false }
        DG-->>U: Highlight cell invalid, retain prior value
    else valid
        V-->>DG: { ok: true, value }
        DG->>CTX: commitEdit(rowId, field, value, comment?)
        CTX->>CTX: push undo snapshot; apply to model; bump Last Updated/Updated By
        CTX->>CT: record Change_Record(prev, new, user, time, comment?)
        CTX->>PS: autosave(model, auditTrail)
        CTX-->>D: re-render from updated (approved) model — no manual refresh
    end
```

### Import (Replace / Merge) Flow

```mermaid
sequenceDiagram
    participant U as User
    participant IEC as ImportExportControls
    participant IS as ImportService
    participant EP as excelParser
    participant CTX as LeadershipProvider

    U->>IEC: Upload workbook (mode: replace | merge)
    IEC->>IS: importWorkbook(buffer, mode)
    IS->>EP: parse(buffer)
    alt parse error
        EP-->>IS: { ok: false, error }
        IS-->>CTX: keep current model; report error
    else parsed
        EP-->>IS: { ok: true, model: parsed }
        alt replace
            IS-->>CTX: setModel(parsed)
        else merge
            IS->>IS: merge parsed metrics into current model by (Month,Team,Pillar,KPI)
            IS-->>CTX: setModel(merged)
        end
        CTX->>CTX: derive options, recompute filtered + dashboards, autosave
    end
```

### Directory Layout (additions)

New files live inside the existing isolated module; existing files are extended in place, not replaced.

```
client/src/leadership/
  components/
    DataManagementView.tsx        # page shell: grid + filter bar + panels
    DataGrid.tsx                  # AG-Grid wrapper (editing, selection, paste)
    GridFilterBar.tsx             # Month/Team/Pillar/KPI/Status/Updated By filters
    AuditTrailPanel.tsx           # per-row Change_Record history
    VersionPanel.tsx              # version list, compare, restore
    ImportExportControls.tsx      # replace/merge import, Excel/CSV export
    IdentityPrompt.tsx            # one-time local display-name capture (A1)
  services/
    grid-projector.ts             # model <-> GridRow[] projection + edit application
    validator.ts                  # per-KPI_Type validation (+ fraction normalization)
    indicator-service.ts          # visual-indicator computation
    change-tracker.ts             # Change_Record / Audit_Trail construction
    approval-service.ts           # optional Approval_Status transitions + approved model
    edit-history.ts               # undo/redo snapshot stacks
    import-service.ts             # replace/merge import over excelParser
    csv-export.ts                 # CSV serialization of the current dashboard data
    persistence-service.ts        # storage adapter (localStorage/IndexedDB)
  model/
    editing-types.ts              # GridRow, KpiType, ChangeRecord, ApprovalStatus, Version, etc.
  state/
    LeadershipProvider.tsx        # EXTENDED: editing state + actions
    LeadershipContext.ts          # EXTENDED: editing state + action signatures
  __tests__/
    properties/                   # fast-check property tests for the new services
    *.test.ts                     # example/edge/integration tests
```

### Navigation Integration (isolation-preserving)

A new nav entry `Data Management` is added to the existing `NAV_ITEMS` array in `index.tsx`, and a `'data'` case is added to the shell's view switch to render `DataManagementView`. This is confined to the module's own shell and touches no existing external routes or the Engineering Health Dashboard (Req 11.1, 11.6).

---

## Components and Interfaces

### Computation Core (pure services)

#### 1. GridProjector (`services/grid-projector.ts`)

Projects the `DashboardModel` into flat `GridRow`s and applies committed edits back to a new model (immutably). Row identity is the tuple (Month, Team, Pillar, KPI).

```typescript
export interface IGridProjector {
  /** One GridRow per MetricValue; derives Month/Team/Pillar/KPI, Target, Actual, KPI_Type. */
  toRows(model: DashboardModel, meta?: RowMetaLookup): GridRow[];
  /** Stable row id from the identity tuple. */
  rowId(month: string, team: string, pillar: EngineeringPillar | null, kpi: string): string;
  /** Apply an Actual edit → returns a new model with MetricValue.value updated. */
  applyActual(model: DashboardModel, rowId: string, value: number | null): DashboardModel;
  /** Apply a Target edit → returns a new model with KpiDefinition.target updated (per-KPI). */
  applyTarget(model: DashboardModel, kpi: string, target: number | null): DashboardModel;
  /** Remove the rows for the given ids → returns a new model without those metrics. */
  removeRows(model: DashboardModel, rowIds: string[]): DashboardModel;
}
```

`RowMetaLookup` supplies per-row `lastUpdated`/`updatedBy`/`approvalStatus`/`source` derived from the audit trail and source columns; when absent those cells show the absent-value indicator.

#### 2. Validator (`services/validator.ts`)

Validates a raw cell input against the row's `KPI_Type` and returns the normalized value or a rejection. Percentage validation applies the existing fraction normalization.

```typescript
export type KpiType = 'Percentage' | 'Currency' | 'Number' | 'Text';

export type ValidationResult =
  | { ok: true; value: number | string | null }
  | { ok: false; reason: string };

export interface IValidator {
  validate(raw: string, kpiType: KpiType): ValidationResult;
}

/** Derive KPI_Type from definition metadata, else infer from existing values (A5). */
export function deriveKpiType(def: KpiDefinition, samples: (number | null)[]): KpiType;
```

#### 3. IndicatorService (`services/indicator-service.ts`)

Pure computation of which `Visual_Indicator`s apply to a row.

```typescript
export type Indicator =
  | 'below-target'
  | 'missing-data'
  | 'outlier'
  | 'recently-updated'
  | 'requires-attention';

export interface IndicatorContext {
  recentWindowMs: number;              // recent-change window
  kpiValues: Map<string, number[]>;    // per-KPI values for outlier detection
  now: number;
}

export function indicatorsFor(row: GridRow, def: KpiDefinition, ctx: IndicatorContext): Indicator[];
```

Below-target reuses `health-classifier` semantics (direction-aware). Outlier uses a standard dispersion test (e.g. > 2σ, or IQR) over the same KPI's values.

#### 4. ChangeTracker (`services/change-tracker.ts`)

Builds `Change_Record`s and appends them to the `Audit_Trail`.

```typescript
export interface IChangeTracker {
  record(input: {
    rowId: string;
    field: 'target' | 'actual';
    previousValue: number | string | null;
    newValue: number | string | null;
    updatedBy: string;
    timestamp: string;   // ISO-8601
    comments?: string;
  }): ChangeRecord;
  append(trail: AuditTrail, record: ChangeRecord): AuditTrail;
  forRow(trail: AuditTrail, rowId: string): ChangeRecord[];
}
```

#### 5. ApprovalService (`services/approval-service.ts`)

Optional lifecycle transitions and derivation of the approved model that drives dashboards.

```typescript
export type ApprovalStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected';

export interface IApprovalService {
  transition(current: ApprovalStatus, action: 'submit' | 'approve' | 'reject'): ApprovalStatus;
  /** When enabled → model containing only Approved changes; when disabled → full model. */
  approvedModel(model: DashboardModel, trail: AuditTrail, enabled: boolean): DashboardModel;
}
```

#### 6. EditHistory (`services/edit-history.ts`)

Undo/redo over immutable model snapshots.

```typescript
export interface EditHistoryState {
  undo: DashboardModel[];
  redo: DashboardModel[];
}

export function pushSnapshot(history: EditHistoryState, prior: DashboardModel): EditHistoryState;
export function undo(history: EditHistoryState, current: DashboardModel): { history: EditHistoryState; model: DashboardModel | null };
export function redo(history: EditHistoryState, current: DashboardModel): { history: EditHistoryState; model: DashboardModel | null };
```

#### 7. ImportService (`services/import-service.ts`)

Replace/merge import built on the existing parser.

```typescript
export type ImportMode = 'replace' | 'merge';

export type ImportResult =
  | { ok: true; model: DashboardModel }
  | { ok: false; error: ParseError };

export interface IImportService {
  importWorkbook(current: DashboardModel | null, buffer: ArrayBuffer, mode: ImportMode): ImportResult;
}
```

Merge rule: a parsed metric with the same (Month, Team, Pillar, KPI) as an existing row updates that row; otherwise it is added. Parsed `KpiDefinition` targets update/extend the current definitions. On parse error the current model is retained (Req 4.8).

#### 8. CSV Export (`services/csv-export.ts`) and reused ExportService

```typescript
/** Serialize the current dashboard data (grid rows) to RFC-4180 CSV text. */
export function toCsv(rows: GridRow[]): string;
```

Excel export delegates to the existing `exportService.exportModelToWorkbook(model)` to preserve the matrix layout and round-trip fidelity (Req 4.5, 4.7, 11.5).

#### 9. PersistenceService (`services/persistence-service.ts`)

Client-side durable store with a swappable adapter.

```typescript
export interface StorageAdapter {
  read(key: string): string | null | Promise<string | null>;
  write(key: string, value: string): void | Promise<void>;
}

export interface PersistedState {
  model: DashboardModel;
  auditTrail: AuditTrail;
  versions: Version[];
  approvalEnabled: boolean;
  currentUser: string | null;
}

export interface IPersistenceService {
  save(state: PersistedState): { ok: true } | { ok: false; error: string };
  load(): PersistedState | null;
  snapshotVersion(state: PersistedState, cycle: string): PersistedState;
}
```

`save`/`load` serialize to JSON. Failures (quota exceeded, storage disabled) return `{ ok: false }` so the provider surfaces a save error and continues on the in-memory model (Req 10.6).

### State Layer (extended `LeadershipProvider`)

New state and actions are added to the existing context. Existing state (`model`, `status`, `selection`, `options`, `filtered`, `theme`, `search`) is unchanged; dashboards keep reading `filtered`, now computed from the **approved** model.

```typescript
export interface LeadershipEditingState {
  auditTrail: AuditTrail;
  versions: Version[];
  currentUser: string | null;
  approvalEnabled: boolean;
  history: EditHistoryState;      // undo/redo stacks
  saveError: string | null;
  gridFilter: GridFilterSelection; // Month/Team/Pillar/KPI/Status/Updated By
}

export interface LeadershipEditingActions {
  commitEdit(rowId: string, field: 'target' | 'actual', raw: string, comments?: string): void;
  bulkEdit(rowIds: string[], field: 'target' | 'actual', raw: string): void;
  pasteCells(anchorRowId: string, field: 'target' | 'actual', matrix: string[][]): void;
  deleteRows(rowIds: string[]): void;
  undo(): void;
  redo(): void;
  setCurrentUser(name: string): void;
  setApprovalEnabled(enabled: boolean): void;
  submitForApproval(rowId: string): void;
  approve(rowId: string): void;
  reject(rowId: string): void;
  setGridFilter(patch: Partial<GridFilterSelection>): void;
  clearGridFilter(): void;
  importWorkbook(buffer: ArrayBuffer, mode: ImportMode): void;
  restoreVersion(versionId: string): void;
}
```

The reducer applies each editing action to the model, records audit entries, updates undo/redo, recomputes `options`/`filtered` from the approved model, and triggers auto-save.

### View Layer

| Component | Responsibility | Requirements |
|---|---|---|
| `DataManagementView` | Page shell; empty-state when no model; hosts grid, filter bar, panels | 1.1, 1.7 |
| `DataGrid` | AG-Grid: columns, inline edit, multi-cell selection, clipboard paste, indicators, status column | 1.2–1.6, 2.1–2.9, 6.7, 8.1–8.2, 8.7, 9.1–9.5 |
| `GridFilterBar` | Month/Team/Pillar/KPI/Status/Updated By filters populated from model + audit trail | 7.1–7.5 |
| `AuditTrailPanel` | View a selected row's Change_Records | 5.6 |
| `VersionPanel` | List versions, compare two, restore | 10.3–10.5 |
| `ImportExportControls` | Replace/merge import; Excel + CSV export | 4.1–4.8 |
| `IdentityPrompt` | Capture the local display name once (A1) | 5.2 |

The `DataGrid` derives its rows via `GridProjector.toRows`, applies `IndicatorService` output as row/cell CSS classes, and calls `commitEdit`/`bulkEdit`/`pasteCells`/`deleteRows` on commit. Column set: Month, Team, Pillar, KPI, Target, Actual Value, Source, Last Updated, Updated By (+ Approval Status when the workflow is enabled).

---

## Data Models

### Editing Types (`model/editing-types.ts`)

```typescript
import type { EngineeringPillar, DashboardModel } from './types';

export type KpiType = 'Percentage' | 'Currency' | 'Number' | 'Text';
export type ApprovalStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected';

/** A single, uniquely identified record in the Data_Grid. */
export interface GridRow {
  /** Stable identity from (month, team, pillar, kpi). */
  id: string;
  month: string;
  year: number;
  periodKey: string;
  team: string;
  pillar: EngineeringPillar | null;
  kpi: string;
  kpiType: KpiType;
  target: number | null;         // from KpiDefinition.target
  actualValue: number | null;    // from MetricValue.value
  source: string | null;
  lastUpdated: string | null;    // ISO-8601, from latest Change_Record
  updatedBy: string | null;      // from latest Change_Record
  approvalStatus?: ApprovalStatus;
}

/** One audit-trail entry describing a single modification. */
export interface ChangeRecord {
  id: string;
  rowId: string;
  field: 'target' | 'actual';
  previousValue: number | string | null;
  newValue: number | string | null;
  updatedBy: string;
  timestamp: string;             // ISO-8601
  comments?: string;
  approvalStatus?: ApprovalStatus;
}

/** Ordered collection of change records. */
export type AuditTrail = ChangeRecord[];

/** A stored snapshot of the model for a reporting cycle. */
export interface Version {
  id: string;
  cycle: string;                 // e.g. "2025-01"
  createdAt: string;             // ISO-8601
  model: DashboardModel;
}

/** Active grid filter criteria (superset of dashboard filters). */
export interface GridFilterSelection {
  months: string[];
  teams: string[];
  pillars: EngineeringPillar[];
  kpis: string[];
  statuses: (ApprovalStatus | 'Green' | 'Amber' | 'Red' | 'Unknown')[];
  updatedBy: string[];
}
```

### Mapping to the existing model

| Grid column | Model source | Edit target |
|---|---|---|
| Month | `MetricValue.period.month` (+ `year`, `key`) | — (identity) |
| Team | `MetricValue.team` | — (identity) |
| Pillar | `KpiDefinition.pillar` (derived from KPI) | — (identity) |
| KPI | `MetricValue.kpi` / `KpiDefinition.name` | — (identity) |
| Target | `KpiDefinition.target` | `KpiDefinition.target` (per-KPI) |
| Actual Value | `MetricValue.value` | `MetricValue.value` |
| Source | `DashboardModel.sourceColumns` context | — |
| Last Updated | latest `ChangeRecord.timestamp` for the row | audit-derived |
| Updated By | latest `ChangeRecord.updatedBy` for the row | audit-derived |
| Approval Status | latest `ChangeRecord.approvalStatus` (when enabled) | approval actions |

### KPI Type derivation (Assumption A5)

`deriveKpiType` resolves the type in priority order: (1) explicit type in `KpiDefinition` metadata if present; (2) inference from the KPI's non-null values — all within [0,1] or expressed with `%` semantics → `Percentage` (fraction-normalized); values carrying currency semantics → `Currency`; otherwise `Number`; non-numeric → `Text`. This mirrors the existing fraction normalization so percentages entered as `85`, `85%`, or `0.85` are interpreted consistently.

### Persistence schema

`PersistedState` (model + audit trail + versions + approval flag + current user) is serialized to JSON under a namespaced storage key (e.g. `leadership.dm.v1`). Versions live under the same record so a load restores the full working set. The schema is versioned by key suffix to allow forward migration.

### New dependencies

None. `ag-grid-react`, `xlsx`, `echarts`, and `fast-check` are already declared in `client/package.json`. All new work reuses existing dependencies, preserving the module's isolation and bundle scope.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The computation core of this feature (grid projector, validator, indicator service, change tracker, approval service, edit history, import/merge, CSV export, and persistence serialization) is a set of pure functions over plain data, which makes property-based testing appropriate. The following properties were derived from the acceptance-criteria prework and consolidated to remove redundancy (see the Property Reflection in prework).

### Property 1: Grid projection fidelity

*For any* `DashboardModel`, `GridProjector.toRows` SHALL produce exactly one `GridRow` per `MetricValue`, and for each row: `month`/`year`/`team`/`kpi` SHALL equal the source metric's period and identity fields, `pillar` SHALL equal the source KPI definition's pillar, `actualValue` SHALL equal the metric's value, and `target` SHALL equal the KPI definition's target. After a commit, the affected row's `lastUpdated` and `updatedBy` SHALL equal the latest `Change_Record` for that row.

**Validates: Requirements 1.3, 1.4, 1.5, 5.5**

### Property 2: Edit application updates only the intended target and yields a valid model

*For any* `DashboardModel`, an Actual edit via `applyActual` SHALL set only the addressed `MetricValue.value` (leaving all other metrics and all definitions unchanged), and a Target edit via `applyTarget` SHALL set only the addressed `KpiDefinition.target` (affecting exactly the rows of that KPI); in both cases the result SHALL be a structurally valid `DashboardModel` of the existing type.

**Validates: Requirements 2.3, 2.4, 11.3**

### Property 3: Validator correctness including fraction normalization

*For any* raw input string and `KPI_Type`, the `Validator` SHALL return `ok` with a normalized value if and only if the input is well-formed for that type, and for `Percentage` inputs the normalized value SHALL equal the existing fraction normalization applied to the input (so `85`, `85%`, and `0.85` normalize consistently).

**Validates: Requirements 2.5, 2.8**

### Property 4: Invalid commit leaves the model unchanged

*For any* `DashboardModel` and any raw input that is invalid for the target cell's `KPI_Type`, committing the edit SHALL reject it and return a model equal to the model before the commit.

**Validates: Requirements 2.7**

### Property 5: Dashboards and derived fields recompute as a pure function of the committed approved model

*For any* `DashboardModel`, `FilterSelection`, and committed change, the filtered dataset and every derived field/aggregate SHALL equal the result of recomputing (via `applyFilters` and the pure aggregators) over the post-commit approved model — so a commit always yields dashboards consistent with the changed data.

**Validates: Requirements 2.9, 3.1, 3.5**

### Property 6: Approved model reflects approval state

*For any* `DashboardModel` and `Audit_Trail`, `ApprovalService.approvedModel(model, trail, enabled)` SHALL, when `enabled` is true, incorporate only changes whose `Approval_Status` is Approved, and SHALL, when `enabled` is false, equal the full model.

**Validates: Requirements 3.3, 3.4, 6.6**

### Property 7: Import modes — replace and merge

*For any* current `DashboardModel` and any valid workbook buffer: importing in replace mode SHALL return exactly the parsed model; importing in merge mode SHALL return a model whose metric key-set equals the union of the current and parsed (Month, Team, Pillar, KPI) keys, where every key present in the parsed data takes the parsed value (updated) and every key present only in the current model is preserved unchanged.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 8: Invalid import leaves the model unchanged

*For any* current `DashboardModel` and any buffer that is not a valid workbook, `ImportService.importWorkbook` SHALL return an error result and SHALL leave the current model unchanged.

**Validates: Requirements 4.8**

### Property 9: Export/import round trip preserves the model

*For any* `DashboardModel`, exporting it to a workbook with the existing export service and re-importing that workbook in replace mode SHALL yield an equivalent `DashboardModel` (same teams, KPIs, periods, years, targets, and metric values, with absent values represented as empty cells that re-parse to null).

**Validates: Requirements 4.5, 4.7, 11.5**

### Property 10: CSV export contains every row and its fields

*For any* set of `GridRow`s, `toCsv` SHALL emit exactly one data line per row, each line containing that row's Month, Team, Pillar, KPI, Target, Actual Value, Source, Last Updated, and Updated By fields, such that parsing the CSV recovers those field values.

**Validates: Requirements 4.6**

### Property 11: Change records are well-formed and appended

*For any* `DashboardModel` and any valid commit, exactly one `Change_Record` SHALL be appended to the `Audit_Trail` whose `previousValue` equals the value before the commit, `newValue` equals the committed value, `updatedBy` equals the `Current_User`, `timestamp` is present, and `comments` equals the provided comments when supplied (and is absent otherwise).

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 12: Audit trail is viewable per row

*For any* `Audit_Trail` and any `Grid_Row` id, `ChangeTracker.forRow` SHALL return exactly the `Change_Record`s whose `rowId` matches that id, in chronological order, and no others.

**Validates: Requirements 5.6**

### Property 13: Approval transitions are total and correct

*For any* change under an enabled `Approval_Workflow`, the change SHALL start in `Draft` on commit, and `ApprovalService.transition` SHALL map (Draft, submit) → Pending Approval, (Pending Approval, approve) → Approved, and (Pending Approval, reject) → Rejected; every resulting status SHALL be one of Draft, Pending Approval, Approved, or Rejected.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 14: Grid filter returns exactly the matching rows

*For any* set of `GridRow`s and any `GridFilterSelection`, the filtered result SHALL include a row if and only if it satisfies every active filter criterion (Month, Team, Pillar, KPI, Status, Updated By), and no others.

**Validates: Requirements 7.2**

### Property 15: Filter options mirror present values

*For any* `DashboardModel` and `Audit_Trail`, each grid filter's options SHALL equal the distinct values present for that dimension (Updated By drawn from the audit trail); and when the `Approval_Workflow` is disabled, the Status options SHALL contain only health statuses and no `Approval_Status` values.

**Validates: Requirements 7.3, 7.5**

### Property 16: Clearing filters yields every row

*For any* set of `GridRow`s, applying the cleared `GridFilterSelection` SHALL return the complete set of rows.

**Validates: Requirements 7.4**

### Property 17: Bulk apply updates exactly the selected valid cells

*For any* `DashboardModel`, any set of selected cells, and any committed value, `bulkEdit` SHALL apply the value to every selected editable cell that is valid for its `KPI_Type` and SHALL leave every other cell (including selected cells invalid for their type) unchanged.

**Validates: Requirements 8.1**

### Property 18: Paste populates aligned cells and preserves invalid targets

*For any* anchor cell and any pasted matrix, `pasteCells` SHALL populate the aligned target cells from the matrix, applying each value that is valid for its target cell's `KPI_Type` and retaining the prior value of (and flagging as invalid) each target cell whose pasted value is invalid.

**Validates: Requirements 8.2, 8.7**

### Property 19: Bulk update records one change per modified row

*For any* bulk update across selected `Grid_Row`s, the `Audit_Trail` SHALL grow by exactly the number of rows actually modified, with one `Change_Record` per modified row.

**Validates: Requirements 8.3**

### Property 20: Bulk delete removes exactly the selected rows

*For any* `DashboardModel` and any set of selected row ids, `removeRows` SHALL return a model whose metric set excludes exactly the metrics for those ids and retains all others unchanged.

**Validates: Requirements 8.4**

### Property 21: Undo/redo consistency

*For any* `DashboardModel` and any editing operation, applying the operation then performing undo SHALL yield a model equal to the original, and performing undo then redo SHALL yield a model equal to the post-operation model.

**Validates: Requirements 8.5, 8.6**

### Property 22: Visual indicators are exactly those whose conditions hold

*For any* `GridRow` and its KPI definition, `indicatorsFor` SHALL return exactly the set of indicators whose defined conditions hold: `below-target` when the present Actual is worse than Target for the KPI's direction; `missing-data` when Actual or Target is absent; `outlier` when the Actual exceeds the dispersion threshold over the same KPI's values; `recently-updated` when the row was modified within the recent-change window; and `requires-attention` when its composite condition holds.

**Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

### Property 23: Persistence save/load round trip

*For any* `PersistedState`, saving it to browser storage and then loading SHALL yield an equivalent `PersistedState` (same model, audit trail, versions, approval flag, and current user).

**Validates: Requirements 10.1, 10.2**

### Property 24: Version snapshot and restore round trip

*For any* `PersistedState` and reporting cycle, `snapshotVersion` SHALL append a `Version` whose snapshot model equals the current model and whose cycle label matches; and restoring that `Version` SHALL replace the current model with a model equal to the snapshot.

**Validates: Requirements 10.3, 10.5**

### Property 25: Version comparison reports exactly the real differences

*For any* two `Version`s, the computed difference SHALL be empty if and only if the two snapshot models are equal, and every reported difference SHALL correspond to an actual field difference between the two models.

**Validates: Requirements 10.4**

### Property 26: Save failure preserves in-memory state

*For any* `PersistedState`, when the storage adapter fails, `PersistenceService.save` SHALL return an error result, the module SHALL surface a save error, and the in-memory model SHALL remain unchanged.

**Validates: Requirements 10.6**

---

## Error Handling

### Editing and Validation Errors

| Scenario | Behavior | Requirement |
|---|---|---|
| Entered value invalid for `KPI_Type` | Highlight cell invalid before save; reject; retain prior value | 2.6, 2.7 |
| Pasted value invalid for target cell | Flag target cell invalid; retain that cell's prior value; apply the valid cells | 8.7 |
| Bulk apply value invalid for some selected cells | Apply to valid cells only; leave invalid selected cells unchanged | 8.1 |

Validation is a pure function (`Validator.validate`), so the accept/reject decision is deterministic and testable in isolation; the grid layer only reflects the result as styling and either commits or discards.

### Import Errors

| Scenario | Result | User-facing behavior | Requirement |
|---|---|---|---|
| Buffer is not a readable workbook | `ParseError(INVALID_WORKBOOK)` | Show error; retain current model | 4.8 |
| Valid workbook, no usable KPI sheet | `ParseError(MISSING_KPIS_SHEET)` | Show error; retain current model | 4.8 |
| Sheet has header only / no data rows | `ParseError(EMPTY_KPIS_SHEET)` | Show error; retain current model | 4.8 |

`ImportService` delegates to `excelParser.parse`, which never throws and returns a discriminated `ParseResult`. On `ok: false` the current model is left intact and the error is surfaced.

### Persistence Errors

| Scenario | Behavior | Requirement |
|---|---|---|
| `localStorage`/IndexedDB unavailable | `save` returns `{ ok: false }`; provider sets `saveError`; continue in-memory | 10.6 |
| Quota exceeded on save | Same as above; the in-memory model is unaffected | 10.6 |
| Corrupt/absent record on load | `load` returns `null`; module starts from an empty/idle state | 10.2 |

### Empty and Absent States

| Scenario | Behavior | Requirement |
|---|---|---|
| No model loaded | Data Management page shows an empty-state message directing to import | 1.7 |
| Metric value or KPI target absent | Cell shows an absent-value indicator; row flagged `missing-data` | 1.6, 9.2 |
| Row modified but no audit entry yet | `Last Updated`/`Updated By` show the absent-value indicator | 1.6 |

### Approval Workflow States

When the workflow is disabled, all editing actions treat saved edits as approved and immediately drive the dashboards (Assumption A4); the Status filter omits `Approval_Status` values (7.5) and the grid omits the Approval Status column (6.7 applies only when enabled).

---

## Testing Strategy

### Dual Testing Approach

- **Unit/example tests** cover specific UI scenarios and configuration: nav entry reachability (1.1), grid column set (1.2), edit-state activation (2.1), column editability (2.2), invalid-cell highlight reflection (2.6), no-manual-refresh reactivity (3.2), status column presence when enabled (6.7), filter-bar presence (7.1), empty-state (1.7), and absent-value rendering (1.6).
- **Property tests** cover the 26 correctness properties above across generated inputs.
- **Integration tests (1–3 examples)** verify reuse wiring: `ImportService` delegates to `excelParser` and Excel export delegates to `exportService.exportModelToWorkbook` (11.4); auto-save invokes the storage adapter on commit (10.1) using a mock adapter.
- **Smoke/static checks** verify isolation constraints: new files reside under `client/src/leadership` (11.1); the data-management code path performs no network/backend calls (11.2); no files outside the module (beyond the module's own nav entry) are modified (11.6).

### Property-Based Testing

Property tests use **`fast-check`** (already a dev dependency) with **Vitest** (`vitest run`). Requirements:

- Each property test runs a **minimum of 100 iterations** (`fc.assert(fc.property(...), { numRuns: 100 })` or higher).
- Each property test is tagged with a comment referencing its design property, in the format:
  `// Feature: leadership-data-management, Property {number}: {property text}`
- Each of the 26 correctness properties is implemented by a **single** property-based test.
- Generators produce arbitrary `DashboardModel`s (varying teams, KPIs, periods, years, pillars, present/absent values and targets, and the optional Business Unit dimension), arbitrary `FilterSelection`/`GridFilterSelection`, arbitrary raw edit inputs (including whitespace, non-numeric, percentage forms, and boundary numbers), arbitrary audit trails, and arbitrary paste matrices. Absent values/targets (null) are included so missing-data and absent-cell behavior is exercised.
- Model equality/equivalence for round-trip properties (2, 9, 21, 23, 24) compares the normalized model (teams, KPIs, periods, years, targets, and metric values), treating absent values as null.

Because the run is deterministic under a seed, any failing property reports a minimal counterexample for debugging.

### Test Data Generators (shared)

A shared `arbitraries.ts` in `__tests__/properties/` provides:
- `arbModel()` — a valid `DashboardModel` with coherent definitions and metrics.
- `arbGridRows()` — projected rows (via `GridProjector`) or standalone rows for filter/indicator tests.
- `arbRawInput(kpiType)` — raw strings biased toward both valid and invalid values for the type.
- `arbAuditTrail(model)` — change records referencing real row ids.
- `arbWorkbookBuffer()` — buffers from exported models plus deliberately invalid buffers for the invalid-import property.

### Non-PBT Coverage Rationale

UI-feel, navigation, and reactivity behaviors (1.1, 1.2, 1.7, 2.1, 2.2, 2.6, 3.2, 6.7, 7.1) are verified with React Testing Library example tests rather than property tests, because their behavior does not vary meaningfully with generated inputs. Isolation constraints (11.1, 11.2, 11.6) are verified with static/CI checks. Reuse wiring (11.4) is verified with a small number of integration examples. These complement — but do not replace — the property tests that guard the pure logic.
