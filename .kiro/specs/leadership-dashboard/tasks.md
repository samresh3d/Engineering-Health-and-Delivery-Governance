# Implementation Plan: Leadership Dashboard

## Overview

This plan builds the standalone, client-side, Excel-driven Leadership Dashboard module inside the existing Vite + React + TypeScript client at `client/src/leadership`. Work proceeds bottom-up: first the module scaffold and data model, then the pure computation core (parser, export, classifier, trend, filter, insight services) with property tests placed next to each service to catch errors early, then the React state layer and view components (ECharts-backed), and finally routing integration, isolation guarantees, and end-to-end wiring. Each step builds on the previous ones so there is no orphaned code, and everything is integrated through the `LeadershipProvider` context and the `/leadership` route.

All code is TypeScript. Property-based tests use `fast-check` and live in `client/src/leadership/__tests__/properties/`; example, edge-case, integration, and smoke tests live in `client/src/leadership/__tests__/`.

## Tasks

- [x] 1. Scaffold the isolated module, dependencies, and data model
  - [x] 1.1 Create module skeleton and add module-scoped dependencies
    - Create the `client/src/leadership/` directory structure per the design directory layout (`state/`, `services/`, `model/`, `components/`, `components/charts/`, `__tests__/properties/`)
    - Add `xlsx` (SheetJS), `echarts`, `echarts-for-react`, `jspdf`, `html2canvas`, and `fast-check` (dev) to `client/package.json`
    - Add a placeholder `index.tsx` module entry so imports resolve
    - _Requirements: 14.1, 14.2_

  - [x] 1.2 Define the Dashboard_Model and related types
    - Create `model/types.ts` with `EngineeringPillar`, `Period`, `KpiDefinition`, `MetricValue`, `Dimensions`, `DashboardModel`, `FilteredDataset`, `HealthStatus`, `Direction`, `AmberBand`, `FilterSelection`, and `FilterOptions`
    - Ensure absent value/target are representable as `null`
    - _Requirements: 2.5, 2.7, 2.8, 4.5_

  - [x] 1.3 Create the KPI → Pillar and direction mapping
    - Create `model/pillars.ts` with the static KPI-to-`EngineeringPillar` mapping and default better-directions (e.g. `MTTR → Quality, LowerIsBetter`; `Deployment Frequency → Delivery, HigherIsBetter`; `Cloud Cost → Cost, LowerIsBetter`)
    - Default unknown KPIs to `pillar: null`, `HigherIsBetter`
    - _Requirements: 4.2, 4.6_

- [x] 2. Implement the Excel parser (computation core)
  - [x] 2.1 Implement ExcelParser with validation, sheet location, and dynamic structure detection
    - Create `services/excel-parser.ts` implementing `IExcelParser.parse(buffer)` returning the `ParseResult` discriminated union (never throws)
    - Validate workbook readability, locate the `KPIs` sheet by name, and return `INVALID_WORKBOOK`, `MISSING_KPIS_SHEET`, or `EMPTY_KPIS_SHEET` errors
    - Detect columns by header name (case-insensitive, trimmed) per the KPIs Sheet Contract; derive teams, KPIs, periods, years, pillars, and optional Business Unit dimension from content; preserve raw headers in `sourceColumns`
    - Record absent value/target cells as `null` without terminating parsing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 2.2 Write property test for parser robustness
    - **Property 1: Parser robustness on arbitrary input**
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 2.3 Write property test for row capture and dimension derivation
    - **Property 2: Every KPIs-sheet data row is captured and dimensions equal the distinct values present**
    - **Validates: Requirements 2.5, 4.1, 4.2, 4.3, 4.4**

  - [ ]* 2.4 Write property test for Business Unit dimension presence
    - **Property 3: Business Unit dimension presence tracks the source column**
    - **Validates: Requirements 4.5**

  - [ ]* 2.5 Write property test for absent values and targets
    - **Property 4: Absent values and targets are recorded as null without terminating parsing**
    - **Validates: Requirements 2.7, 2.8**

  - [ ]* 2.6 Write unit tests for parser sheet location and error codes
    - Locate `KPIs` among multiple sheets; missing-sheet and empty-sheet error codes
    - _Requirements: 2.3, 2.4, 2.6_

- [x] 3. Implement the export service and round-trip fidelity
  - [x] 3.1 Implement ExportService workbook export
    - Create `services/export-service.ts` implementing `exportModelToWorkbook(model)` using the SheetJS writer to emit a workbook containing a `KPIs` sheet, reproducing `sourceColumns` and representing absent values as empty cells
    - Add `exportReportToExcel`, `exportChartToPng`, and `exportReportToPdf` signatures (PNG from an ECharts data URL; PDF from a printable element)
    - _Requirements: 3.1, 3.3, 8.5, 12.2, 12.3, 12.4_

  - [ ]* 3.2 Write property test for parse → export → parse round trip
    - **Property 5: Parse → export → parse round trip preserves the model**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 3.3 Write unit test for export workbook structure
    - Export produces a workbook containing a `KPIs` sheet
    - _Requirements: 3.1_

- [x] 4. Checkpoint - parser and export
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement the health classifier
  - [x] 5.1 Implement HealthClassifier
    - Create `services/health-classifier.ts` with the pure `classify(input)` function returning `Green | Amber | Red | Unknown`
    - Honor direction (`HigherIsBetter`/`LowerIsBetter`), optional amber band, and absent value/target → `Unknown`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 5.2 Write property test for classification totality and correctness
    - **Property 9: Health classification is total and correct for present values**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**

  - [ ]* 5.3 Write property test for absent-input classification
    - **Property 10: Absent value or target classifies as Unknown**
    - **Validates: Requirements 5.7**

- [x] 6. Implement the trend calculator
  - [x] 6.1 Implement TrendCalculator
    - Create `services/trend-calculator.ts` with `computeTrend(orderedValues)` producing direction, percent change (null when previous is absent/zero-undefined), and an ordered sparkline series
    - Add a trend tooltip formatter that includes Period, Team, KPI, and value; add a zoom-range filter helper; add ascending-by-period-key ordering
    - _Requirements: 8.1, 8.2, 8.3, 9.3_

  - [ ]* 6.2 Write property test for trend tooltip content
    - **Property 13: Trend tooltip content is complete**
    - **Validates: Requirements 8.2**

  - [ ]* 6.3 Write property test for zoom window restriction
    - **Property 14: Zoom window restricts displayed points to the selected range**
    - **Validates: Requirements 8.3**

  - [ ]* 6.4 Write property test for monthly progression ordering
    - **Property 17: Monthly progression is ordered ascending by period**
    - **Validates: Requirements 9.3**

- [x] 7. Implement the filter controller
  - [x] 7.1 Implement FilterController
    - Create `services/filter-controller.ts` with `deriveOptions(model)`, `applyFilters(model, selection)`, and `emptySelection()`
    - Options mirror the model dimensions (Business Unit only when present); a metric is included iff it matches all active criteria; empty selection returns the full dataset ordered by period key
    - _Requirements: 4.6, 6.4, 7.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 7.2 Write property test for filter options mirroring dimensions
    - **Property 6: Filter options mirror the model dimensions**
    - **Validates: Requirements 4.6, 10.1, 10.2, 10.3, 10.5**

  - [ ]* 7.3 Write property test for filter application correctness
    - **Property 7: Filter application returns exactly the matching metrics**
    - **Validates: Requirements 6.4, 7.5, 10.4**

  - [ ]* 7.4 Write property test for clearing all filters
    - **Property 8: Clearing all filters yields the full dataset**
    - **Validates: Requirements 10.6**

- [x] 8. Implement the insight engine
  - [x] 8.1 Implement InsightEngine
    - Create `services/insight-engine.ts` with `generateInsights(data, config)` producing `MoMChange`, `HighestForKpi`, and `ConsistentlyExceeds` insights derived only from teams/KPIs/periods in the dataset
    - Emit MoM insights iff absolute percent change meets the configured threshold; identify highest team per KPI/period; identify consistently-exceeds per team/pillar across selected periods; omit MoM insights when fewer than two periods
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 8.2 Write property test for insight soundness
    - **Property 18: Insights are sound with respect to the dataset**
    - **Validates: Requirements 11.1, 11.5**

  - [ ]* 8.3 Write property test for month-over-month threshold behavior
    - **Property 19: Month-over-month insight emitted exactly when change meets the threshold**
    - **Validates: Requirements 11.2**

  - [ ]* 8.4 Write property test for highest-team insight
    - **Property 20: Highest-team insight names the maximum team for the KPI and period**
    - **Validates: Requirements 11.3**

  - [ ]* 8.5 Write property test for consistently-exceeds insight
    - **Property 21: Consistently-exceeds insight matches the all-KPIs-all-periods condition**
    - **Validates: Requirements 11.4**

  - [ ]* 8.6 Write property test for minimum-periods rule
    - **Property 22: No month-over-month insights below two periods**
    - **Validates: Requirements 11.6**

- [x] 9. Checkpoint - computation core complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement the module state layer
  - [x] 10.1 Implement LeadershipProvider and useLeadership hook
    - Create `state/LeadershipProvider.tsx` holding `model`, `status`, `error`, `selection`, `options`, `filtered`, `theme`, and `search`
    - Implement actions `uploadWorkbook`, `updateSelection`, `clearFilters`, `setSearch`, `toggleTheme`; wire `uploadWorkbook` to `ExcelParser` and derive `options`/`filtered` via `FilterController`; do not mutate `model` on parse error
    - Create `state/useLeadership.ts`
    - _Requirements: 1.7, 6.4, 7.5, 10.4, 10.5, 10.6, 11.5_

  - [ ]* 10.2 Write unit tests for provider state transitions
    - Parse success refreshes derived state; parse error preserves prior model; clear filters resets selection
    - _Requirements: 1.7, 10.6_

- [x] 11. Implement upload gating and the UploadZone component
  - [x] 11.1 Implement the pure upload gate
    - Create `classifyUpload(name, mimeType?) → 'accept' | 'reject' | 'idle'` (accept `.xlsx`/`.xls`; reject other known types; idle when type undetermined)
    - _Requirements: 1.4, 1.5_

  - [x] 11.2 Implement UploadZone component
    - Create `components/UploadZone.tsx` with a file picker and drag-and-drop zone; on accept, read the file to an `ArrayBuffer` and call `uploadWorkbook`; show a loading indicator while parsing; show reject message naming accepted types
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 11.3 Write unit tests for UploadZone and the gate
    - Renders picker + drop zone; drop and picker invoke parse; gate handles extensions and interrupted selection; loading indicator shows during parse
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 12. Implement chart wrappers and RAG color mapping
  - [x] 12.1 Implement shared RAG colors and ECharts chart wrappers
    - Create `components/charts/` thin wrappers (Line, Bar, Heatmap, Radar, Sparkline) around ECharts accepting plain data props
    - Create a shared `ragColors` map with four distinct colors for Green/Amber/Red/Unknown applied consistently across wrappers
    - _Requirements: 5.8, 6.2, 13.6_

  - [ ]* 12.2 Write unit test for RAG color map
    - RAG color map has four distinct colors and is consumed by chart wrappers
    - _Requirements: 5.8, 13.6_

- [x] 13. Implement the filter panel
  - [x] 13.1 Implement FilterPanel component
    - Create `components/FilterPanel.tsx` rendering Month, Year, Team, KPI, Engineering Pillar, and Status controls populated from `options`; conditionally render the Business Unit filter when the dimension exists, including when it appears after load; sticky on scroll; changes call `updateSelection` and clearing calls `clearFilters`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 13.3_

  - [ ]* 13.2 Write unit tests for FilterPanel
    - Renders six controls; BU shown/hidden; BU added after load
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 14. Implement the Executive Summary view
  - [x] 14.1 Implement ExecutiveSummaryView component
    - Create `components/ExecutiveSummaryView.tsx` with the eight named KPI cards (Overall/Delivery/Quality/Sustainability/Cost Health, Teams On Target/At Risk/Off Target)
    - Each card shows value, target, month-over-month trend, percentage change, health status, and a sparkline; absent value shows an absent-value indicator; cards recompute from the filtered dataset
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 14.2 Write property test for summary aggregation
    - **Property 11: Executive summary aggregates equal recomputation over the filtered dataset**
    - **Validates: Requirements 6.4**

  - [ ]* 14.3 Write unit tests for Executive Summary rendering
    - Shows eight named cards with all fields; absent card value shows the absent indicator
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 15. Implement the Team Performance view
  - [x] 15.1 Implement TeamPerformanceView component
    - Create `components/TeamPerformanceView.tsx` comparing teams across the listed KPIs using clustered bar, line, heat map, radar, leaderboard, and scorecard; omit KPIs absent from the model without error; show a "no KPI data available for comparison" message when none are available; recompute on filter change
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 15.2 Write property test for comparison KPI subset
    - **Property 12: Team comparison only includes KPIs present in the model**
    - **Validates: Requirements 7.3**

  - [ ]* 15.3 Write unit tests for Team Performance rendering
    - Renders across chart types; shows the "no KPI data" comparison message
    - _Requirements: 7.1, 7.2, 7.4_

- [x] 16. Implement the Trends view
  - [x] 16.1 Implement TrendsView component
    - Create `components/TrendsView.tsx` presenting each KPI as a line chart and a bar chart across periods; hover tooltip with Period/Team/KPI/value; zoom range via `dataZoom`; one series per selected team with data; PNG export via ECharts `getDataURL()`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 16.2 Write property test for one series per team with data
    - **Property 15: One trend series per selected team with data**
    - **Validates: Requirements 8.4**

  - [ ]* 16.3 Write unit tests for Trends rendering and export
    - Line + bar per KPI; PNG export via ECharts data URL
    - _Requirements: 8.1, 8.5_

- [x] 17. Implement the KPI Drill-Down view
  - [x] 17.1 Implement KpiDrillDownView component
    - Create `components/KpiDrillDownView.tsx` showing historical trend, team comparison, target vs actual, and variance; identify best and worst team by direction; show monthly progression ascending by period; render a single empty-state message for the whole drill-down when no data matches the filters
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 17.2 Write property test for best/worst team identification
    - **Property 16: Drill-down identifies the correct best and worst team**
    - **Validates: Requirements 9.2**

  - [ ]* 17.3 Write unit tests for Drill-Down rendering
    - Shows the four sections; single empty-state message when no data
    - _Requirements: 9.1, 9.4_

- [x] 18. Implement the Insights panel
  - [x] 18.1 Implement InsightsPanel component
    - Create `components/InsightsPanel.tsx` rendering insights from `generateInsights` over the filtered dataset; regenerate on filter change
    - _Requirements: 11.1, 11.5_

- [x] 19. Implement KPI search
  - [x] 19.1 Implement SearchBar and search filtering
    - Create `components/SearchBar.tsx` bound to `setSearch`; implement a pure case-insensitive substring match returning exactly the name-matching KPIs, consumed by the KPI views
    - _Requirements: 12.1_

  - [ ]* 19.2 Write property test for KPI search matching
    - **Property 23: KPI search returns exactly the name-matching KPIs**
    - **Validates: Requirements 12.1**

- [x] 20. Implement export controls and print
  - [x] 20.1 Implement ExportControls and print-friendly layout
    - Create `components/ExportControls.tsx` wiring Excel/PDF/PNG export to `ExportService` and a print trigger that renders a print-friendly layout of the current report; implement section expand/collapse toggling detailed content; surface export failures as a non-blocking notification
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ]* 20.2 Write unit tests for export, print, and collapse
    - Excel/PDF/PNG produce buffers/blobs; print-friendly layout renders; section expand/collapse toggles content
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6_

- [x] 21. Implement theming and responsive layout
  - [x] 21.1 Implement ThemeToggle and responsive layout resolver
    - Create `components/ThemeToggle.tsx` toggling light/dark and applying the mode to every view via the provider
    - Implement a pure layout resolver returning single-column below the mobile breakpoint (including width 0) and multi-column at or above it
    - _Requirements: 13.1, 13.2, 13.4, 13.5_

  - [ ]* 21.2 Write property test for responsive layout resolution
    - **Property 24: Responsive layout is determined by viewport width and breakpoint**
    - **Validates: Requirements 13.4, 13.5**

  - [ ]* 21.3 Write unit test for theme toggling
    - Light/dark mode selectable and applied to views
    - _Requirements: 13.1, 13.2_

- [x] 22. Wire the module together and integrate the route
  - [x] 22.1 Assemble the module shell and entry
    - Implement `index.tsx` to mount `LeadershipProvider` and a `LeadershipShell` composing UploadZone, FilterPanel, ExecutiveSummaryView, TeamPerformanceView, TrendsView, KpiDrillDownView, InsightsPanel, SearchBar, ExportControls, and ThemeToggle
    - Create `routes.tsx` exporting the route element for `/leadership`
    - _Requirements: 13.1, 13.2, 13.3, 13.6_

  - [x] 22.2 Add the isolated `/leadership` route to the client
    - Add a single lazy-loaded `<Route path="/leadership/*" element={<LeadershipModule />} />` in `client/src/App.tsx` using `React.lazy(() => import('./leadership'))`, leaving existing routes and components untouched
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 22.3 Write integration and smoke tests
    - Route `/leadership` mounts the module; upload → parse → all views/insights refresh; filter change propagates to cards/charts/summary/insights; module files reside under `client/src/leadership`; module imports no API client/`fetch`/`axios`; filter panel remains sticky on scroll
    - _Requirements: 1.7, 6.4, 7.5, 10.4, 11.5, 13.3, 14.1, 14.2, 14.3, 14.4_

- [x] 23. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements (granular clauses) for traceability.
- Property test sub-tasks each reference a single Correctness Property from the design and are placed next to the service they validate to catch errors early.
- Property tests use `fast-check` (≥100 runs) in the client's `jsdom` environment; run with `cd client && npx vitest run src/leadership/__tests__/properties/`.
- Checkpoints ensure incremental validation at natural boundaries (parser/export, computation core, and final wiring).
- The existing Engineering Health Dashboard is not modified; the only touch point with existing code is the single lazy route added in task 22.2.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "5.1", "6.1", "12.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.1", "5.2", "5.3", "6.2", "6.3", "6.4", "7.1", "12.2"] },
    { "id": 4, "tasks": ["3.2", "3.3", "7.2", "7.3", "7.4", "8.1", "10.1", "11.1", "13.1", "19.1", "21.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.4", "8.5", "8.6", "10.2", "11.2", "11.3", "13.2", "14.1", "15.1", "16.1", "17.1", "18.1", "19.2", "20.1", "21.2", "21.3"] },
    { "id": 6, "tasks": ["14.2", "14.3", "15.2", "15.3", "16.2", "16.3", "17.2", "17.3", "20.2", "22.1"] },
    { "id": 7, "tasks": ["22.2"] },
    { "id": 8, "tasks": ["22.3"] }
  ]
}
```
