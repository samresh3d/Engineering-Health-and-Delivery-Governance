# Implementation Plan: Leadership Data Management

## Overview

This plan implements the in-portal, editable KPI data layer entirely inside the isolated `client/src/leadership` module using TypeScript, React, AG Grid, and the existing SheetJS-based parser/export services. Work proceeds bottom-up: first the shared editing types, then the pure computation-core services (grid projection, validation, indicators, change tracking, approval, edit history, grid filtering, import/merge, CSV/Excel export, persistence), then the extended `LeadershipProvider` state layer that wires actions and auto-save, then the view layer (Data Management page, grid, panels, controls), and finally navigation integration and isolation checks. Each step builds on the prior ones so nothing is left orphaned.

Property tests use `fast-check` + Vitest (`vitest run`), a minimum of 100 iterations each, one property test per correctness property, tagged with `// Feature: leadership-data-management, Property {n}: {text}`. Optional test sub-tasks are marked with `*`.

## Tasks

- [x] 1. Establish editing types and shared test infrastructure
  - [x] 1.1 Define editing types module
    - Create `client/src/leadership/model/editing-types.ts` with `KpiType`, `ApprovalStatus`, `GridRow`, `ChangeRecord`, `AuditTrail`, `Version`, and `GridFilterSelection`
    - Import and reuse existing `EngineeringPillar` and `DashboardModel` from `model/types.ts`; do not redefine existing types
    - _Requirements: 11.3_

  - [x]* 1.2 Create shared property-test generators
    - Create `client/src/leadership/__tests__/properties/arbitraries.ts` with `arbModel()`, `arbGridRows()`, `arbRawInput(kpiType)`, `arbAuditTrail(model)`, and `arbWorkbookBuffer()`
    - Include present/absent values and targets (null) and the optional Business Unit dimension
    - _Requirements: 11.3_

- [x] 2. Implement GridProjector service
  - [x] 2.1 Implement grid projection and edit application
    - Create `client/src/leadership/services/grid-projector.ts` implementing `IGridProjector`: `toRows`, `rowId`, `applyActual`, `applyTarget`, `removeRows`
    - Project one `GridRow` per `MetricValue`; derive Month/Team/Pillar/KPI/Target/Actual/KPI_Type; apply edits immutably to a new `DashboardModel`
    - Derive per-row `lastUpdated`/`updatedBy`/`approvalStatus`/`source` via `RowMetaLookup`, showing absent-value indicators when absent
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.3, 2.4, 8.4, 11.3_

  - [x]* 2.2 Write property test for grid projection fidelity
    - **Property 1: Grid projection fidelity**
    - **Validates: Requirements 1.3, 1.4, 1.5, 5.5**

  - [x]* 2.3 Write property test for edit application
    - **Property 2: Edit application updates only the intended target and yields a valid model**
    - **Validates: Requirements 2.3, 2.4, 11.3**

  - [x]* 2.4 Write property test for bulk delete row removal
    - **Property 20: Bulk delete removes exactly the selected rows**
    - **Validates: Requirements 8.4**

- [x] 3. Implement Validator service
  - [x] 3.1 Implement per-type validation and KPI type derivation
    - Create `client/src/leadership/services/validator.ts` implementing `IValidator.validate` and `deriveKpiType`
    - Apply existing fraction normalization for Percentage inputs so `85`, `85%`, and `0.85` normalize consistently
    - _Requirements: 2.5, 2.8_

  - [x]* 3.2 Write property test for validator correctness
    - **Property 3: Validator correctness including fraction normalization**
    - **Validates: Requirements 2.5, 2.8**

  - [x]* 3.3 Write unit tests for validator edge cases
    - Test whitespace, non-numeric, boundary numbers, currency, and text inputs per type
    - _Requirements: 2.5, 2.6_

- [x] 4. Implement IndicatorService
  - [x] 4.1 Implement visual-indicator computation
    - Create `client/src/leadership/services/indicator-service.ts` implementing `indicatorsFor`
    - Reuse `health-classifier` direction semantics for below-target; use dispersion (2σ or IQR) for outlier; support missing-data, recently-updated, requires-attention
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x]* 4.2 Write property test for visual indicators
    - **Property 22: Visual indicators are exactly those whose conditions hold**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

- [x] 5. Implement ChangeTracker service
  - [x] 5.1 Implement change-record construction and audit trail
    - Create `client/src/leadership/services/change-tracker.ts` implementing `IChangeTracker`: `record`, `append`, `forRow`
    - Populate Previous Value, New Value, Updated By, ISO-8601 timestamp, and optional Comments
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [x]* 5.2 Write property test for change records
    - **Property 11: Change records are well-formed and appended**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [x]* 5.3 Write property test for per-row audit retrieval
    - **Property 12: Audit trail is viewable per row**
    - **Validates: Requirements 5.6**

- [x] 6. Implement ApprovalService
  - [x] 6.1 Implement approval transitions and approved-model derivation
    - Create `client/src/leadership/services/approval-service.ts` implementing `IApprovalService`: `transition` and `approvedModel`
    - When enabled, incorporate only Approved changes; when disabled, return the full model
    - _Requirements: 3.3, 3.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x]* 6.2 Write property test for approved-model derivation
    - **Property 6: Approved model reflects approval state**
    - **Validates: Requirements 3.3, 3.4, 6.6**

  - [x]* 6.3 Write property test for approval transitions
    - **Property 13: Approval transitions are total and correct**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 7. Implement EditHistory service
  - [x] 7.1 Implement undo/redo snapshot stacks
    - Create `client/src/leadership/services/edit-history.ts` implementing `pushSnapshot`, `undo`, `redo` over immutable `DashboardModel` snapshots
    - _Requirements: 8.5, 8.6_

  - [x]* 7.2 Write property test for undo/redo consistency
    - **Property 21: Undo/redo consistency**
    - **Validates: Requirements 8.5, 8.6**

- [x] 8. Implement grid filtering
  - [x] 8.1 Implement grid filter and filter-option derivation
    - Create `client/src/leadership/services/grid-filter.ts` with a pure `filterRows(rows, selection)` and an options builder derived from the model + audit trail (Updated By from the audit trail)
    - Omit `Approval_Status` options from Status when the approval workflow is disabled; support a cleared selection returning all rows
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

  - [x]* 8.2 Write property test for grid filtering
    - **Property 14: Grid filter returns exactly the matching rows**
    - **Validates: Requirements 7.2**

  - [x]* 8.3 Write property test for filter options
    - **Property 15: Filter options mirror present values**
    - **Validates: Requirements 7.3, 7.5**

  - [x]* 8.4 Write property test for clearing filters
    - **Property 16: Clearing filters yields every row**
    - **Validates: Requirements 7.4**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement ImportService
  - [x] 10.1 Implement replace/merge import over the existing parser
    - Create `client/src/leadership/services/import-service.ts` implementing `IImportService.importWorkbook` delegating to `excelParser.parse`
    - Merge by (Month, Team, Pillar, KPI): update matching rows, add new rows; on parse error retain the current model and return an error result
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.8, 11.4_

  - [x]* 10.2 Write property test for import modes
    - **Property 7: Import modes — replace and merge**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [x]* 10.3 Write property test for invalid import
    - **Property 8: Invalid import leaves the model unchanged**
    - **Validates: Requirements 4.8**

- [x] 11. Implement export (CSV and Excel round-trip)
  - [x] 11.1 Implement CSV export
    - Create `client/src/leadership/services/csv-export.ts` with `toCsv(rows)` producing RFC-4180 CSV containing Month, Team, Pillar, KPI, Target, Actual Value, Source, Last Updated, Updated By
    - _Requirements: 4.6_

  - [x]* 11.2 Write property test for CSV export
    - **Property 10: CSV export contains every row and its fields**
    - **Validates: Requirements 4.6**

  - [x] 11.3 Wire Excel export to the existing export service
    - Add an export path that delegates to `exportService.exportModelToWorkbook(model)`, preserving the existing matrix layout, normalized parsers, and fraction normalization
    - _Requirements: 4.5, 4.7, 11.4_

  - [x]* 11.4 Write property test for export/import round trip
    - **Property 9: Export/import round trip preserves the model**
    - **Validates: Requirements 4.5, 4.7, 11.5**

- [x] 12. Implement PersistenceService
  - [x] 12.1 Implement client-side persistence, versioning, and comparison
    - Create `client/src/leadership/services/persistence-service.ts` implementing `IPersistenceService`: `save`, `load`, `snapshotVersion`, plus a `compareVersions` diff and a `restoreVersion` helper
    - Use a `StorageAdapter` wrapping localStorage (IndexedDB adapter as drop-in); serialize `PersistedState` to JSON under a namespaced, versioned key; degrade gracefully to in-memory on failure
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x]* 12.2 Write property test for persistence round trip
    - **Property 23: Persistence save/load round trip**
    - **Validates: Requirements 10.1, 10.2**

  - [x]* 12.3 Write property test for version snapshot and restore
    - **Property 24: Version snapshot and restore round trip**
    - **Validates: Requirements 10.3, 10.5**

  - [x]* 12.4 Write property test for version comparison
    - **Property 25: Version comparison reports exactly the real differences**
    - **Validates: Requirements 10.4**

  - [x]* 12.5 Write property test for save failure handling
    - **Property 26: Save failure preserves in-memory state**
    - **Validates: Requirements 10.6**

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Extend the LeadershipProvider state layer
  - [x] 14.1 Extend context types and editing state
    - Extend `client/src/leadership/state/LeadershipContext.ts` with `LeadershipEditingState` and `LeadershipEditingActions` signatures
    - Keep existing state untouched; add auditTrail, versions, currentUser, approvalEnabled, history, saveError, gridFilter
    - _Requirements: 3.3, 3.4, 11.3_

  - [x] 14.2 Implement editing reducer actions and auto-save
    - Extend `client/src/leadership/state/LeadershipProvider.tsx` to implement `commitEdit`, `bulkEdit`, `pasteCells`, `deleteRows`, `undo`, `redo`, `setCurrentUser`, `setApprovalEnabled`, `submitForApproval`, `approve`, `reject`, `setGridFilter`, `clearGridFilter`, `importWorkbook`, `restoreVersion`
    - On each commit: push undo snapshot, apply via GridProjector, record Change_Record, recompute `options`/`filtered` from the approved model, and auto-save via PersistenceService (surface saveError on failure)
    - _Requirements: 2.7, 2.9, 3.1, 3.2, 3.5, 5.5, 8.1, 8.2, 8.3, 8.7, 10.1_

  - [x]* 14.3 Write property test for invalid commit
    - **Property 4: Invalid commit leaves the model unchanged**
    - **Validates: Requirements 2.7**

  - [x]* 14.4 Write property test for dashboard/derived recomputation
    - **Property 5: Dashboards and derived fields recompute as a pure function of the committed approved model**
    - **Validates: Requirements 2.9, 3.1, 3.5**

  - [x]* 14.5 Write property test for bulk apply
    - **Property 17: Bulk apply updates exactly the selected valid cells**
    - **Validates: Requirements 8.1**

  - [x]* 14.6 Write property test for paste
    - **Property 18: Paste populates aligned cells and preserves invalid targets**
    - **Validates: Requirements 8.2, 8.7**

  - [x]* 14.7 Write property test for bulk-update change recording
    - **Property 19: Bulk update records one change per modified row**
    - **Validates: Requirements 8.3**

  - [x]* 14.8 Write integration test for auto-save wiring
    - Verify a commit invokes the storage adapter (mock adapter) and that ImportService delegates to `excelParser`
    - _Requirements: 10.1, 11.4_

- [x] 15. Build the Data Management view layer
  - [x] 15.1 Implement DataManagementView page shell
    - Create `client/src/leadership/components/DataManagementView.tsx` hosting the grid, filter bar, and panels; render the empty-state message when no model is available
    - _Requirements: 1.1, 1.7_

  - [x] 15.2 Implement DataGrid with editing, selection, paste, and indicators
    - Create `client/src/leadership/components/DataGrid.tsx` (AG-Grid) with columns Month, Team, Pillar, KPI, Target, Actual Value, Source, Last Updated, Updated By (+ Approval Status when enabled)
    - Support inline edit-state on click, editable Target/Actual cells, invalid-cell highlighting, multi-cell selection, clipboard paste, and indicator CSS classes from IndicatorService; call provider actions on commit
    - _Requirements: 1.2, 1.6, 2.1, 2.2, 2.6, 6.7, 8.1, 8.2, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 15.3 Implement GridFilterBar
    - Create `client/src/leadership/components/GridFilterBar.tsx` with Month/Team/Pillar/KPI/Status/Updated By filters populated from the model + audit trail; wire to `setGridFilter`/`clearGridFilter`
    - _Requirements: 7.1, 7.3, 7.4, 7.5_

  - [x] 15.4 Implement AuditTrailPanel
    - Create `client/src/leadership/components/AuditTrailPanel.tsx` showing the selected row's Change_Records
    - _Requirements: 5.6_

  - [x] 15.5 Implement VersionPanel
    - Create `client/src/leadership/components/VersionPanel.tsx` listing versions, comparing two, and restoring
    - _Requirements: 10.3, 10.4, 10.5_

  - [x] 15.6 Implement ImportExportControls
    - Create `client/src/leadership/components/ImportExportControls.tsx` for replace/merge import and Excel + CSV export, surfacing import errors
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.8_

  - [x] 15.7 Implement IdentityPrompt
    - Create `client/src/leadership/components/IdentityPrompt.tsx` to capture the local display name once and store it (Assumption A1); feeds Updated By
    - _Requirements: 5.2_

  - [x]* 15.8 Write view-layer unit tests
    - Test nav reachability (1.1), column set (1.2), edit-state activation (2.1), Target/Actual editability (2.2), invalid-cell highlight (2.6), no-manual-refresh reactivity (3.2), status column when enabled (6.7), filter-bar presence (7.1), empty-state (1.7), absent-value rendering (1.6)
    - _Requirements: 1.1, 1.2, 1.6, 1.7, 2.1, 2.2, 2.6, 3.2, 6.7, 7.1_

- [x] 16. Integrate navigation
  - [x] 16.1 Add the Data Management nav entry and view switch
    - Add a `Data Management` entry to `NAV_ITEMS` and a `'data'` case rendering `DataManagementView` in `client/src/leadership/index.tsx`
    - Keep changes confined to the module shell; do not touch external routes or the Engineering Health Dashboard
    - _Requirements: 1.1, 11.1, 11.6_

- [x] 17. Verify module isolation
  - [x]* 17.1 Add isolation static/smoke checks
    - Assert new files reside under `client/src/leadership`, the data-management path makes no network/backend calls, and no files outside the module (beyond its own nav entry) are modified
    - _Requirements: 11.1, 11.2, 11.6_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific granular requirements for traceability, and each property task references a design property by number.
- The computation core is built as pure services first so the 26 correctness properties can be property-tested in isolation before the state and view layers are wired.
- All work stays inside `client/src/leadership` and reuses existing types, `excelParser`, and `exportService` (Req 11); no new dependencies are added.
- Checkpoints ensure incremental validation at natural boundaries (after the pure core, after persistence, and at the end).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1", "4.1", "5.1", "6.1", "7.1", "8.1", "10.1", "11.1", "12.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "4.2", "5.2", "5.3", "6.2", "6.3", "7.2", "8.2", "8.3", "8.4", "10.2", "10.3", "11.2", "11.3", "12.2", "12.3", "12.4", "12.5", "14.1"] },
    { "id": 3, "tasks": ["11.4", "14.2"] },
    { "id": 4, "tasks": ["14.3", "14.4", "14.5", "14.6", "14.7", "14.8", "15.1", "15.2", "15.3", "15.4", "15.5", "15.6", "15.7"] },
    { "id": 5, "tasks": ["15.8", "16.1"] },
    { "id": 6, "tasks": ["17.1"] }
  ]
}
```
