# Implementation Plan: RBAC, Reporting & Analytics

## Overview

This plan implements enhanced role-based access control with team-scoped data isolation, an analytics dashboard with KPI scorecards and trend charts, report export in multiple formats, and audit logging. The implementation uses TypeScript on both server (Express) and client (React), building on the existing RBAC middleware, SQLite database, and component library.

## Tasks

- [x] 1. Database schema and core types
  - [x] 1.1 Create database migration for audit_logs table and users.team_id column
    - Add `team_id TEXT` column to `users` table with index
    - Create `audit_logs` table with all columns, constraints, and indexes as defined in design
    - Create migration file at `server/src/database/migrations/`
    - _Requirements: 1.1, 5.1, 5.5_

  - [x] 1.2 Define shared TypeScript types and interfaces
    - Create `server/src/types/rbac-analytics.types.ts` with `UserContext`, `AuthorizationResult`, `DataScope`, `AuditEntry`, `AnalyticsFilter`, `TeamComparisonRow`, `TrendDataPoint`, `KpiScorecard`, `ExportRequest`, `ExportResult`
    - Create Zod validation schemas (`analyticsFilterSchema`, `exportRequestSchema`, `auditLogFilterSchema`) in `server/src/validators/analytics.validators.ts`
    - _Requirements: 1.1, 5.1, 8.1, 10.1_

  - [x] 1.3 Update seed data to include team assignments for users
    - Modify `server/src/database/seed.ts` to assign `team_id` to Engineering Manager users
    - Ensure Leadership and Super_Admin users have `team_id` set to null
    - _Requirements: 1.1, 1.2_

- [x] 2. Authorization Service
  - [x] 2.1 Implement Authorization Service
    - Create `server/src/services/authorization.service.ts` implementing `IAuthorizationService`
    - Implement `canReadTeamData`, `canWriteTeamData`, `canDeleteData`, `getDataScope`, `canExportReports`, `canAccessAuditLogs`
    - Follow the Authorization Rules Matrix from design (EM: own team read/write only; Leadership: read-only all; Super_Admin: full access)
    - _Requirements: 1.5, 1.6, 2.6, 3.2, 4.1, 6.1, 6.2, 6.5, 6.6_

  - [x]* 2.2 Write property tests for Authorization Service (Properties 1-5, 10)
    - **Property 1: Engineering Manager Data Isolation** — verify EM denied for other teams, permitted for own team
    - **Property 2: Leadership Write Denial** — verify Leadership denied for all write operations
    - **Property 3: Engineering Manager Delete Denial** — verify EM denied for all deletes
    - **Property 4: Super Admin Full Access** — verify Super_Admin permitted for all CRUD on all teams
    - **Property 5: Team Reassignment Immediacy** — verify scope changes immediately after reassignment
    - **Property 10: 403 Response Format Consistency** — verify 403 responses have error field with non-empty string
    - Create at `server/src/__tests__/properties/rbac-analytics/authorization.property.test.ts`
    - **Validates: Requirements 1.3, 1.5, 1.6, 1.7, 2.6, 3.2, 4.1, 4.4, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7**

  - [x]* 2.3 Write unit tests for Authorization Service
    - Test specific role × operation × team combinations from the Authorization Rules Matrix
    - Test edge cases: null teamId, invalid role strings, missing user context
    - Create at `server/src/__tests__/unit/authorization.service.test.ts`
    - _Requirements: 1.5, 1.6, 2.6, 3.2, 4.1, 6.2_

- [x] 3. Enhanced RBAC Middleware
  - [x] 3.1 Extend RBAC middleware to include team context
    - Modify `server/src/middleware/rbac.ts` to fetch `team_id` from users table during token verification
    - Attach `teamId` to `AuthenticatedRequest.user` object
    - Ensure team context is available for all downstream route handlers
    - _Requirements: 1.2, 6.1, 6.7_

  - [x] 3.2 Create data-scope middleware for team-filtered routes
    - Create `server/src/middleware/data-scope.middleware.ts`
    - Integrate Authorization Service to apply team scoping before route handlers execute
    - Return 403 with proper JSON error format for team-scope violations
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 4. Audit Logger Service
  - [x] 4.1 Implement Audit Logger Service
    - Create `server/src/services/audit-logger.service.ts` implementing `IAuditLoggerService`
    - Implement `log`, `query`, and `getRecordHistory` methods
    - Create `server/src/repositories/audit-log.repository.ts` for database operations
    - Ensure audit log writes are transactional with the originating data mutation (rollback on failure)
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x]* 4.2 Write property tests for Audit Logger (Properties 6-9)
    - **Property 6: Audit Log Completeness** — verify every mutation produces a log entry with correct fields
    - **Property 7: Audit Log Modified Fields Accuracy** — verify update entries contain exactly the modified fields
    - **Property 8: Audit Log Filter Correctness** — verify query results match all active filter conditions
    - **Property 9: Audit Log Chronological Ordering** — verify record history is ordered by timestamp ascending
    - Create at `server/src/__tests__/properties/rbac-analytics/audit-logging.property.test.ts`
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6**

  - [x]* 4.3 Write unit tests for Audit Logger Service
    - Test specific mutation scenarios (create, update with field changes, delete)
    - Test filter combinations, pagination, empty results
    - Create at `server/src/__tests__/unit/audit-logger.service.test.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 5. Checkpoint - Core services verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Analytics Service and KPI Engine
  - [x] 6.1 Implement period-to-date-range converter utility
    - Create `server/src/utils/period-converter.ts`
    - Implement conversion for month, quarter, year, and custom date ranges
    - Handle edge cases: leap years, end-of-month boundaries
    - _Requirements: 8.3, 8.4, 8.5, 8.6_

  - [x]* 6.2 Write property tests for period converter (Properties 11-13)
    - **Property 11: Period-to-Date-Range Conversion** — verify correct start/end dates for all months, quarters, years
    - **Property 12: Custom Date Range Inclusive Filtering** — verify all records within range are included, none outside
    - **Property 13: Date Range Validation Rejection** — verify end < start is rejected
    - Create at `server/src/__tests__/properties/rbac-analytics/date-period.property.test.ts`
    - **Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.7**

  - [x] 6.3 Implement Analytics Service
    - Create `server/src/services/analytics.service.ts` implementing `IAnalyticsService`
    - Implement `getScorecard` returning 9 KPIs with values and RAG status
    - Implement `getTeamComparison` for cross-team KPI comparison
    - Implement `getTrends` and `getHistoricalTrends` for time-series data
    - Apply data scope filtering based on user context
    - _Requirements: 9.1, 9.2, 9.5, 12.1, 12.2_

  - [x]* 6.4 Write property tests for Analytics (Properties 14, 17, 18, 19)
    - **Property 14: KPI Scorecard Completeness** — verify exactly 9 KPIs returned with required fields
    - **Property 17: Filter AND Composition** — verify all returned records satisfy all active filter conditions
    - **Property 18: Trend Consecutive Period Coverage** — verify N periods produce N data points with no gaps
    - **Property 19: Multi-Team Trend Series** — verify K teams produce K series with same period count
    - Create at `server/src/__tests__/properties/rbac-analytics/filter-composition.property.test.ts` (P17)
    - Create at `server/src/__tests__/properties/rbac-analytics/trend-coverage.property.test.ts` (P18, P19)
    - **Validates: Requirements 9.1, 9.5, 11.2, 11.3, 11.4, 11.5, 12.1, 12.2, 12.4**

  - [x]* 6.5 Write unit tests for Analytics Service
    - Test scorecard with empty data, single team, all teams
    - Test team comparison with varied KPI values
    - Test trend with insufficient data (< 2 points) returning appropriate response
    - Create at `server/src/__tests__/unit/analytics.service.test.ts`
    - _Requirements: 9.1, 9.2, 9.5, 12.6_

- [x] 7. Report Exporter Service
  - [x] 7.1 Implement Report Exporter Service
    - Create `server/src/services/report-exporter.service.ts` implementing `IReportExporterService`
    - Implement Excel export using `exceljs` with auto-width columns and headers
    - Implement CSV export with UTF-8 BOM and comma separation
    - Implement PDF export using `pdfkit` with title, timestamp, filter summary, and formatted table
    - Implement `validateExportSize` to enforce 50,000 row limit
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x]* 7.2 Write property tests for Export (Properties 15, 16)
    - **Property 15: Export Data Round-Trip** — verify exported Excel/CSV can be parsed back to identical dataset
    - **Property 16: Export Scope Consistency** — verify export data matches dashboard API data for same filters
    - Create at `server/src/__tests__/properties/rbac-analytics/export-roundtrip.property.test.ts`
    - **Validates: Requirements 10.1, 10.2, 10.4, 10.6**

  - [x]* 7.3 Write unit tests for Report Exporter
    - Test edge cases: empty dataset, single row, special characters, max column widths
    - Test 50,000 row limit rejection
    - Test each format generates correct MIME type and valid buffer
    - Create at `server/src/__tests__/unit/report-exporter.service.test.ts`
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [x] 8. Checkpoint - Server services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. API Routes
  - [x] 9.1 Create analytics routes
    - Create `server/src/routes/analytics.routes.ts`
    - Implement `GET /api/analytics/scorecard` with filter validation and scope enforcement
    - Implement `GET /api/analytics/comparison` restricted to Leadership/Super_Admin
    - Implement `GET /api/analytics/trends` with KPI name parameter and filter
    - Implement `GET /api/analytics/historical` for multi-KPI historical data
    - Wire Authorization Service for team scoping on all endpoints
    - _Requirements: 9.1, 9.2, 9.5, 11.1, 11.5, 12.1_

  - [x] 9.2 Create report export route
    - Create `server/src/routes/reports.routes.ts`
    - Implement `POST /api/reports/export` with format and filter validation
    - Apply data scope from Authorization Service before generating export
    - Stream generated file buffer to client with correct Content-Type and Content-Disposition headers
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7_

  - [x] 9.3 Create audit log routes
    - Create `server/src/routes/audit-log.routes.ts`
    - Implement `GET /api/audit-logs` restricted to Super_Admin with filter parameters
    - Implement `GET /api/audit-logs/record/:id` restricted to Super_Admin
    - _Requirements: 5.4, 5.6, 4.8_

  - [x] 9.4 Create user profile and team assignment routes
    - Implement `GET /api/users/me` returning user profile with team assignment
    - Implement `PUT /api/admin/users/:id/team` restricted to Super_Admin for team reassignment
    - _Requirements: 1.2, 4.4_

  - [x] 9.5 Integrate audit logging into existing data mutation routes
    - Modify existing sprint data create/update/delete handlers to call Audit Logger Service
    - Ensure audit log and data mutation are in the same transaction
    - Modify upload route to log bulk create operations
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 9.6 Register all new routes in Express app
    - Update `server/src/app.ts` to mount analytics, reports, audit-log, and user routes
    - Apply RBAC middleware with appropriate role arrays to each route group
    - _Requirements: 6.1_

- [x] 10. Checkpoint - API layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Client - Role Adapter and UI infrastructure
  - [x] 11.1 Create RoleAdapter component
    - Create `client/src/components/RoleAdapter.tsx`
    - Implement conditional rendering based on user role from auth context
    - Accept `allowedRoles` array and optional `fallback` ReactNode
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 11.2 Update auth context to include team assignment
    - Modify `client/src/auth/index.ts` to store `teamId` from `/api/users/me` response
    - Expose `teamId` and `role` in auth context for downstream components
    - _Requirements: 1.2, 7.5, 7.6_

  - [x] 11.3 Create API client functions for analytics, export, and audit endpoints
    - Add analytics API functions to `client/src/api/client.ts` (getScorecard, getComparison, getTrends, getHistorical)
    - Add export API function with file download handling
    - Add audit log API functions
    - _Requirements: 9.1, 10.1, 5.4_

- [x] 12. Client - Analytics Dashboard
  - [x] 12.1 Create Analytics Dashboard page
    - Create `client/src/pages/Analytics.tsx`
    - Implement KPI Scorecard section with 9 tiles showing value, RAG badge, and percent change
    - Use existing `KpiTile` and `RagBadge` components as base
    - _Requirements: 9.1, 9.6_

  - [x] 12.2 Create AnalyticsFilterBar component
    - Create `client/src/components/AnalyticsFilterBar.tsx`
    - Implement Team dropdown (hidden for EM), Engineering Manager dropdown, Period segmented control, Custom Date Range picker (Leadership/Super_Admin only), Development Status dropdown
    - Apply role-based visibility using RoleAdapter
    - Emit filter state changes to parent component
    - _Requirements: 8.1, 8.2, 8.7, 11.1, 11.5, 11.6, 11.7, 7.5_

  - [x] 12.3 Create trend charts section
    - Implement line chart components using Recharts for KPI trends
    - Support multiple team series overlay for Leadership/Super_Admin
    - Display RAG status colors on data points
    - Handle insufficient data state (< 2 points)
    - _Requirements: 9.5, 12.1, 12.2, 12.4, 12.5, 12.6_

  - [x] 12.4 Create team comparison table
    - Implement team comparison using AG Grid with team rows and KPI columns
    - Show only for Leadership/Super_Admin using RoleAdapter
    - Support click-through to team detail view
    - _Requirements: 9.2, 9.3, 9.4_

  - [x] 12.5 Create ExportControls component
    - Create `client/src/components/ExportControls.tsx`
    - Render Excel, CSV, PDF export buttons
    - Show only for Leadership/Super_Admin and EM (scoped to own team)
    - Handle export size limit error with modal
    - Handle network timeout with retry toast
    - _Requirements: 7.7, 10.1, 10.2, 10.3, 10.5, 10.6_

- [x] 13. Client - Navigation and routing updates
  - [x] 13.1 Update navigation and routing for role-based views
    - Update `client/src/App.tsx` to add Analytics route
    - Update navigation to show/hide links based on role (EM: Dashboard, Upload, My Team; Leadership: Dashboard, Reports, Analytics; Super_Admin: all)
    - Hide Admin Panel link from non-Super_Admin users
    - Display team name in header for Engineering Managers
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_

  - [x]* 13.2 Write unit tests for RoleAdapter and AnalyticsFilterBar
    - Test RoleAdapter renders children for allowed roles, renders fallback otherwise
    - Test AnalyticsFilterBar shows/hides controls based on role
    - Test date range validation (end < start shows error)
    - _Requirements: 7.1, 7.2, 7.5, 8.7_

- [x] 14. Client - Historical and Ordering
  - [x] 14.1 Implement historical submissions view with proper ordering
    - Ensure historical submissions view displays records ordered by ingestion date descending
    - Apply team scoping for Engineering Manager view
    - _Requirements: 2.4, 1.7_

  - [x]* 14.2 Write property test for ordering (Property 20)
    - **Property 20: Historical Records Ordering** — verify records returned in descending ingestion date order
    - Create at `server/src/__tests__/properties/rbac-analytics/ordering.property.test.ts`
    - **Validates: Requirements 2.4**

- [x] 15. Integration and wiring
  - [x]* 15.1 Write integration tests for RBAC flow
    - Test full request cycle: authenticate → access data → verify scope enforcement
    - Test team reassignment → verify immediate scope change
    - Create at `server/src/__tests__/integration/rbac-flow.integration.test.ts`
    - _Requirements: 1.5, 4.4, 6.1, 6.2, 6.7_

  - [x]* 15.2 Write integration tests for export flow
    - Test authenticate → filter → export → verify file contents match dashboard data
    - Test export size limit with large dataset
    - Create at `server/src/__tests__/integration/export-flow.integration.test.ts`
    - _Requirements: 10.1, 10.4, 10.5, 10.6_

  - [x]* 15.3 Write integration tests for audit flow
    - Test create → update → delete → verify complete audit trail
    - Test audit log query with various filter combinations
    - Create at `server/src/__tests__/integration/audit-flow.integration.test.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout, matching existing project conventions
- Libraries: exceljs (Excel export), pdfkit (PDF export), fast-check (property tests), Recharts (charts), AG Grid (tables)
- All authorization is enforced server-side; client UI adaptation is for UX only

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3"] },
    { "id": 6, "tasks": ["6.4", "6.5", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "9.1", "9.3"] },
    { "id": 8, "tasks": ["9.2", "9.4", "9.5"] },
    { "id": 9, "tasks": ["9.6", "11.1", "11.2"] },
    { "id": 10, "tasks": ["11.3", "12.1"] },
    { "id": 11, "tasks": ["12.2", "12.3", "12.4", "12.5"] },
    { "id": 12, "tasks": ["13.1", "14.1"] },
    { "id": 13, "tasks": ["13.2", "14.2"] },
    { "id": 14, "tasks": ["15.1", "15.2", "15.3"] }
  ]
}
```
