# Implementation Plan: Engineering Health & Delivery Governance Platform

## Overview

This plan implements the Engineering Health & Delivery Governance Platform as a monorepo with `/client` (React/TypeScript) and `/server` (Node.js/Express/TypeScript). Tasks proceed incrementally: git init → project scaffolding → database → RBAC → upload pipeline → KPI engine → RAG classification → API endpoints → dashboard frontend → property tests → integration tests. Git commits are made at each checkpoint to track progress.

## Tasks

- [x] 1. Initialize Git repository
  - [x] 1.1 Initialize git repo and create initial commit
    - Run `git init` in the project root
    - Create `.gitignore` with entries for: node_modules/, dist/, *.sqlite, *.sqlite3, .env, coverage/, .DS_Store
    - Run `git add .gitignore` and `git commit -m "chore: initialize repository with .gitignore"`
    - _Requirements: 7.1_

- [ ] 2. Set up project structure and core interfaces
  - [x] 2.1 Initialize monorepo with /client and /server directories
    - Create `/server/package.json` with dependencies: express, better-sqlite3, multer, zod, jsonwebtoken, xlsx, uuid, cors
    - Create `/server/tsconfig.json` with `strict: true`
    - Create `/client/package.json` with dependencies: react, react-dom, react-router-dom, axios, ag-grid-react, recharts
    - Create `/client/tsconfig.json` with `strict: true`
    - Create top-level README.md with project overview and run instructions
    - _Requirements: 7.1, 7.5, 7.7_

  - [-] 2.2 Define shared TypeScript types and interfaces
    - Create `/server/src/types/index.ts` with all domain interfaces: SprintDataRow, KpiComputedResult, TeamConfig, UploadRecord, KpiName, RagStatus, KpiResult, KpiFilter, ThresholdConfig, DecodedToken
    - Create `/server/src/types/api.ts` with API request/response types: UploadResult, ValidationError
    - Create `/client/src/types/index.ts` with client-side type definitions matching API contracts
    - _Requirements: 7.5_

  - [-] 2.3 Create Zod validation schemas
    - Create `/server/src/schemas/excel-row.schema.ts` with the `excelRowSchema` for all 22 columns including date format validation, JIRA ID pattern, numeric ranges, and Y/N enums
    - Create `/server/src/schemas/kpi-filter.schema.ts` with the `kpiFilterSchema`
    - Create `/server/src/schemas/threshold.schema.ts` with the `thresholdUpdateSchema`
    - _Requirements: 7.4, 1.4_

  - [x] 2.4 Set up Vitest and fast-check testing infrastructure
    - Add vitest and fast-check as dev dependencies in `/server/package.json`
    - Create `/server/vitest.config.ts` with test configuration
    - Add @testing-library/react, jsdom, vitest to `/client/package.json` dev dependencies
    - Create `/client/vitest.config.ts` with jsdom environment
    - Create test directory structure: `/server/src/__tests__/properties/`, `/server/src/__tests__/unit/`, `/server/src/__tests__/integration/`
    - _Requirements: 7.5_

- [x] 3. Implement database schema and migrations
  - [x] 3.1 Create SQLite database initialization and migration system
    - Create `/server/src/database/connection.ts` exporting a function to initialize better-sqlite3 with WAL mode
    - Create `/server/src/database/migrations/001-initial-schema.ts` with all 7 tables: uploads, sprint_data, kpi_results, team_config, track_portfolio_mapping, rag_thresholds, users
    - Include all indexes: idx_sprint_data_team, idx_sprint_data_portfolio, idx_sprint_data_project, idx_sprint_data_dev_start, idx_sprint_data_jira_team, idx_kpi_results_lookup
    - Create `/server/src/database/migrate.ts` that runs migrations on server startup and terminates with non-zero exit code on failure
    - _Requirements: 7.6, 2.3_

  - [x] 3.2 Create seed data for mock users and default configurations
    - Seed `users` table with 4 mock users (one per role: Admin, Engineering_Manager, Delivery_Manager, Leadership) each with pre-generated JWT tokens
    - Seed `track_portfolio_mapping` with 6 default mappings (IBPS-POS, IBPS-Dolphin, IBPS-Claims, mPro, E-Commerce, POSV/IVC)
    - Seed `rag_thresholds` with default thresholds for all 9 KPIs per design specification
    - Create `/server/src/database/seed.ts` that inserts seed data only if tables are empty
    - _Requirements: 6.9, 4.1-4.9_

- [x] 4. Implement RBAC middleware
  - [x] 4.1 Create JWT authentication and role-based authorization middleware
    - Create `/server/src/middleware/rbac.ts` implementing token verification using a local JWT secret
    - Implement `AuthenticatedRequest` extension of Express Request with user context (userId, role)
    - Implement route permission mapping: `/api/upload` → [Admin, Engineering_Manager], `/api/dashboard/*` → all roles, `/api/config/*` → [Admin], `/api/reports/*` → [Engineering_Manager, Delivery_Manager, Leadership], `/api/filters/*` → all roles
    - Return 401 for missing/invalid/expired tokens, 403 for insufficient role permissions
    - Forward decoded userId and role in request context on success
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.10_

  - [ ]* 4.2 Write property tests for RBAC (Properties 22-23)
    - **Property 22: JWT Authentication Correctness** — For any request with a valid JWT signed with correct secret, middleware extracts correct userId and role; for missing/malformed/expired/wrong-secret tokens, returns 401
    - **Property 23: Role-Based Route Authorization** — For any (role, route) pair, middleware permits if and only if route is in permitted set for that role, returns 403 otherwise
    - Create `/server/src/__tests__/properties/rbac.property.test.ts`
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.10**

- [x] 5. Implement data persistence layer (Repository Pattern)
  - [x] 5.1 Create repository interfaces and sprint data repository
    - Create `/server/src/repositories/interfaces.ts` with ISprintDataRepository, IKpiResultsRepository, IConfigRepository interfaces
    - Create `/server/src/repositories/sprint-data.repository.ts` implementing bulkUpsert (with transaction), findByFilter, findByJiraIdAndTeam, countByUpload
    - Implement upsert logic using INSERT OR REPLACE on UNIQUE(jira_id, team) constraint
    - Enforce 10,000 row limit per upload operation
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 7.2, 7.3_

  - [x] 5.2 Create KPI results and config repositories
    - Create `/server/src/repositories/kpi-results.repository.ts` implementing save, saveBatch, findLatest, findTrend
    - Create `/server/src/repositories/config.repository.ts` implementing getThresholds, getThreshold, updateThreshold, getTeamConfig, getAllTeams, upsertTeamConfig, getTrackPortfolioMapping
    - _Requirements: 2.2, 3.13, 7.3_

  - [ ]* 5.3 Write property tests for persistence (Properties 3-7)
    - **Property 3: Persistence Row Count Invariant** — For any valid file with N rows, upload returns count N and DB confirms N rows persisted
    - **Property 4: Data Persistence Round-Trip** — For any valid row, persist then query returns all 22 fields unchanged with correct portfolio mapping
    - **Property 5: Query Filter Correctness** — For any dataset and filter combination, all returned rows satisfy all filter conditions, no matching rows omitted
    - **Property 6: Transaction Atomicity on Failure** — For any batch that fails at arbitrary position, DB contains zero rows from that batch
    - **Property 7: Upsert Deduplication** — For rows with duplicate (jira_id, team), DB contains exactly one record per pair with last-written values
    - Create `/server/src/__tests__/properties/persistence.property.test.ts`
    - **Validates: Requirements 1.5, 2.1, 2.4, 2.5, 2.6**

- [x] 6. Checkpoint - Core infrastructure complete
  - Ensure all tests pass, ask the user if questions arise.
  - [x] 6.1 Commit progress
    - Stage all changes: `git add -A`
    - Commit with message: `git commit -m "feat: project scaffolding and database schema"`
    - _Covers tasks 1-5_

- [x] 7. Implement Upload Service
  - [x] 7.1 Create upload service with file validation and Excel parsing
    - Create `/server/src/services/upload.service.ts` implementing IUploadService interface
    - Implement file format validation: accept only .xlsx/.xls, reject all others with error
    - Implement file size check: reject files > 10 MB before parsing
    - Implement column header validation: verify all 22 required columns present, report missing ones
    - Implement empty file check: reject if headers present but zero data rows
    - Parse Excel using xlsx library, map column headers to SprintDataRow fields
    - _Requirements: 1.2, 1.3, 1.6, 1.7, 1.8_

  - [x] 7.2 Implement row-level validation and persistence orchestration
    - Validate each parsed row against the Zod excelRowSchema
    - Collect up to 100 validation errors with row number and field name
    - On successful validation, call sprint data repository bulkUpsert within a transaction
    - Map Track field to Portfolio using track_portfolio_mapping from config repository
    - Return UploadResult with success status, rowsIngested count, uploadId, and timestamp
    - _Requirements: 1.4, 1.5, 2.1_

  - [ ]* 7.3 Write property tests for upload validation (Properties 1-2)
    - **Property 1: Column Validation Correctness** — For any set of column headers, validation accepts iff all 22 present; rejection reports exact set difference
    - **Property 2: Row Data Validation Accuracy** — For any row with invalid field values, validator reports correct row number and exact field name for each violation
    - Create `/server/src/__tests__/properties/column-validation.property.test.ts`
    - Create `/server/src/__tests__/properties/row-validation.property.test.ts`
    - **Validates: Requirements 1.2, 1.3, 1.4**

- [x] 8. Implement KPI Engine Service
  - [x] 8.1 Implement 9 KPI calculation functions
    - Create `/server/src/services/kpi-engine.service.ts` implementing IKpiEngineService
    - Implement Sprint_Commitment: (Complete items / total items) × 100, rounded to 2 decimal places
    - Implement Release_Success_Rate: (non-empty GO Live Date AND Rollback=N / non-empty GO Live Date) × 100, rounded to 2 decimal places
    - Implement Deployment_Frequency: count of distinct non-empty GO Live Dates
    - Implement Capacity_Utilization: (sum Actual Effort / team capacity) × 100, rounded to 2 decimal places
    - Implement AI_Efficiency: average of ((Estimated - Actual) / Estimated × 100) where AI Used=Y, rounded to 2 decimal places
    - Implement UAT_Predictability: (delivery ≤ target / total with both dates) × 100, rounded to 2 decimal places
    - Implement Dev_Cycle_Time: average calendar days between start and end, rounded to 1 decimal place
    - Implement Story_Drop_Rate: (non-empty Story Drop Reason / total items) × 100, rounded to 2 decimal places
    - Implement Rollback_Rate: (Rollback=Y / non-empty GO Live Date) × 100, rounded to 2 decimal places
    - Handle zero-denominator case: return null value with insufficientData=true
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.11, 3.12_

  - [x] 8.2 Implement filter-scoped KPI calculation and persistence
    - Implement calculateAll(filter) that queries data by filter then computes all 9 KPIs on the filtered subset
    - Implement calculateSingle(kpiName, filter) for individual KPI recalculation
    - Persist computed KPI results to kpi_results table via KPI results repository with team, portfolio, sprint, period, and timestamp
    - Implement percent change calculation against immediately preceding period
    - _Requirements: 3.10, 3.13_

  - [ ]* 8.3 Write property tests for KPI calculations (Properties 8-18)
    - **Property 8: Sprint Commitment** — For random Development Status values, calculation matches formula exactly
    - **Property 9: Release Success Rate** — For random GO Live Date and Rollback values, calculation matches formula
    - **Property 10: Deployment Frequency** — For random GO Live Dates, count equals distinct non-empty dates
    - **Property 11: Capacity Utilization** — For random efforts and positive capacity, calculation matches formula
    - **Property 12: AI Efficiency** — For random efforts where AI Used=Y, calculation matches average formula
    - **Property 13: UAT Predictability** — For random delivery/target dates, calculation matches formula
    - **Property 14: Dev Cycle Time** — For random start/end dates (end ≥ start), calculation matches average days
    - **Property 15: Story Drop Rate** — For random Story Drop Reasons, calculation matches formula
    - **Property 16: Rollback Rate** — For random Rollback flags and GO Live Dates, calculation matches formula
    - **Property 17: Filter-Scoped KPI Recalculation** — For multi-team data and any filter, KPI equals calculation on matching subset only
    - **Property 18: Zero Denominator Returns Null** — For datasets with zero denominator, returns null with insufficientData
    - Create `/server/src/__tests__/properties/kpi-calculations.property.test.ts`
    - Create `/server/src/__tests__/properties/kpi-filters.property.test.ts`
    - **Validates: Requirements 3.1-3.12**

- [x] 9. Implement RAG Classification Service
  - [x] 9.1 Create RAG classification with threshold-based and trend-based logic
    - Create `/server/src/services/rag.service.ts` implementing IRagService
    - Implement threshold-based classification for: Sprint_Commitment (>90 green, 80-90 amber, <80 red), Release_Success_Rate (>98 green, 95-98 amber, <95 red), Capacity_Utilization (≥90 green, 75-89 amber, <75 red), AI_Efficiency (within/above target green, within 5pp below amber, >5pp below red), UAT_Predictability (>95 green, 85-95 amber, <85 red), Story_Drop_Rate (<5 green, 5-10 amber, >10 red), Rollback_Rate (<2 green, 2-5 amber, >5 red)
    - Implement trend-based classification for: Deployment_Frequency and Dev_Cycle_Time (>5% improvement green, within 5% amber, >5% regression red)
    - Implement insufficient data handling: return Amber when <2 periods available for trend-based KPIs
    - Load thresholds from config repository for configurable classification
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [ ]* 9.2 Write property tests for RAG classification (Properties 19-21)
    - **Property 19: Threshold-Based RAG Classification** — For any numeric value and threshold-based KPI, classification returns correct color with no gaps or overlaps
    - **Property 20: Trend-Based RAG Classification** — For any (current, previous) value pair, classification returns correct color based on 5% thresholds
    - **Property 21: Insufficient Trend Data Defaults to Amber** — For trend-based KPIs with <2 periods, always returns Amber
    - Create `/server/src/__tests__/properties/rag-classification.property.test.ts`
    - **Validates: Requirements 4.1-4.10**

- [ ] 10. Checkpoint - Backend business logic complete
  - Ensure all tests pass, ask the user if questions arise.
  - [-] 10.1 Commit progress
    - Stage all changes: `git add -A`
    - Commit with message: `git commit -m "feat: RBAC middleware and data persistence layer"`
    - Then commit upload/KPI/RAG: `git commit --allow-empty -m "feat: upload service, KPI engine, and RAG classification"`
    - Note: If preferred, combine into a single commit covering tasks 4-9: `git add -A && git commit -m "feat: upload service, KPI engine, and RAG classification"`
    - _Covers tasks 4-9_

- [ ] 11. Implement API endpoints and Express server
  - [~] 11.1 Create Express server setup with middleware stack
    - Create `/server/src/app.ts` configuring Express with: cors, JSON body parser, multer for file uploads (10 MB limit), RBAC middleware, global error handler
    - Create `/server/src/server.ts` as entry point: run migrations, seed data, start HTTP server
    - Implement global error handler in `/server/src/middleware/error-handler.ts` handling ZodError (400), generic errors (500), with secure error messages
    - _Requirements: 7.6_

  - [~] 11.2 Implement upload and auth API routes
    - Create `/server/src/routes/upload.routes.ts` with POST `/api/upload` — accept multipart file, validate format/size/columns/rows, process and return result
    - Create `/server/src/routes/auth.routes.ts` with GET `/api/auth/me` (return current user) and GET `/api/auth/mock-users` (dev-only, list mock tokens)
    - Wire routes to upload service and return appropriate error responses (400 for validation, 401/403 from RBAC)
    - _Requirements: 1.1, 1.6, 1.7, 6.9_

  - [~] 11.3 Implement dashboard and filter API routes
    - Create `/server/src/routes/dashboard.routes.ts` with GET `/api/dashboard/kpis` (KPI values with RAG and percent change) and GET `/api/dashboard/trends` (6-period trend data)
    - Create `/server/src/routes/filter.routes.ts` with GET `/api/filters/portfolios`, GET `/api/filters/teams`, GET `/api/filters/projects`
    - Accept query parameters for team, portfolio, project, startDate, endDate; validate with kpiFilterSchema
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [~] 11.4 Implement configuration API routes
    - Create `/server/src/routes/config.routes.ts` with GET `/api/config/thresholds`, PUT `/api/config/thresholds`, GET `/api/config/teams`, PUT `/api/config/teams/:teamName`
    - Validate threshold updates with thresholdUpdateSchema
    - Restrict access to Admin role only
    - _Requirements: 4.1-4.9 (configurable thresholds)_

- [ ] 12. Implement Dashboard frontend
  - [~] 12.1 Set up React application with routing and theme
    - Create `/client/src/main.tsx` entry point with React Router
    - Create `/client/src/App.tsx` with route definitions: `/` (Dashboard), `/upload` (Upload page)
    - Create `/client/src/theme/` with Axis Max Life branding: primary Burgundy/Maroon, white backgrounds, light grey secondary, dark grey text
    - Define RAG color constants: Green #28A745, Amber #FFC107, Red #DC3545
    - Set up Axios instance with base URL and JWT token injection in Authorization header
    - _Requirements: 5.8, 5.9_

  - [~] 12.2 Implement KPI tiles and RAG badge components
    - Create `/client/src/components/RagBadge.tsx` — colored dot indicator (green/amber/red)
    - Create `/client/src/components/KpiTile.tsx` — displays KPI name, current value (or "No data available"), RAG badge, percentage change with up/down arrow
    - Create `/client/src/pages/Dashboard.tsx` — renders 9 KPI tiles in responsive 3×3 grid
    - Handle null values and insufficientData flag with appropriate UI indicators
    - _Requirements: 5.1, 5.7, 5.9_

  - [~] 12.3 Implement filter bar and trend charts
    - Create `/client/src/components/FilterBar.tsx` — portfolio dropdown (6 portfolios), team dropdown (filtered by portfolio), date range picker
    - Create `/client/src/components/KpiTrendChart.tsx` using Recharts — line/bar chart showing up to 6 sprint periods per KPI
    - Wire filters to API calls: on filter change, re-fetch KPIs and trends
    - Show minimum 2 data points for trend lines; omit chart rendering if insufficient data
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.10_

  - [~] 12.4 Implement upload page with drag-and-drop
    - Create `/client/src/pages/Upload.tsx` with HTML5 drag-and-drop zone and visual feedback
    - Implement client-side pre-validation: file type (.xlsx/.xls only), file size (≤ 10 MB)
    - Show progress indicator during upload/processing
    - Display success result (row count) or error table (row/field/message) using AG Grid
    - _Requirements: 1.1, 1.6, 1.7, 5.10_

  - [~] 12.5 Implement data table component with AG Grid
    - Create `/client/src/components/DataTable.tsx` wrapping AG Grid with sort, filter, and pagination
    - Use for displaying upload validation errors and any tabular data views
    - _Requirements: 5.10_

- [ ] 13. Checkpoint - Full application assembled
  - Ensure all tests pass, ask the user if questions arise.
  - [~] 13.1 Commit progress
    - Stage all changes: `git add -A`
    - Commit with message: `git commit -m "feat: API endpoints and dashboard frontend"`
    - _Covers tasks 11-12_

- [ ] 14. Write integration tests
  - [ ]* 14.1 Write upload pipeline integration tests
    - Create `/server/src/__tests__/integration/upload.integration.test.ts`
    - Test full flow: upload Excel → validate → persist → calculate KPIs → verify DB state
    - Test database migrations: server starts with empty DB, schema initializes correctly
    - Test rejection scenarios: wrong format, oversized file, missing columns, invalid rows, empty file
    - **Validates: Requirements 1.1-1.8, 2.1, 2.5**

  - [ ]* 14.2 Write dashboard and filter API integration tests
    - Create `/server/src/__tests__/integration/dashboard.integration.test.ts`
    - Test API round-trip: POST upload → GET dashboard/kpis → verify KPI values match expected calculations
    - Test filter cascading: portfolio filter → team filter → verify scoped results
    - Test empty state: filters with no matching data return null KPI values with insufficientData flag
    - **Validates: Requirements 3.10, 5.1-5.7**

  - [ ]* 14.3 Write configuration and RBAC integration tests
    - Create `/server/src/__tests__/integration/config.integration.test.ts`
    - Test threshold update → recalculate → verify new RAG status
    - Test role-based access: each role can access its permitted routes and gets 403 on others
    - Test mock user tokens are valid and contain correct claims
    - **Validates: Requirements 4.1-4.10, 6.1-6.10**

- [ ] 15. Checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - [~] 15.1 Commit progress
    - Stage all changes: `git add -A`
    - Commit with message: `git commit -m "test: integration and property-based tests"`
    - _Covers task 14_

- [ ] 16. Push to feature branch
  - [~] 16.1 Push all commits to a new remote branch
    - Create and switch to feature branch: `git checkout -b feat/engineering-health-platform`
    - Push with upstream tracking: `git push -u origin feat/engineering-health-platform`
    - Do NOT push directly to main/master
    - _Ensures all work is safely stored on remote_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (23 properties total)
- Unit tests validate specific examples and edge cases
- The tech stack is: React/TypeScript, Node.js/Express/TypeScript, SQLite (better-sqlite3), AG Grid, Recharts, Zod, Vitest, fast-check
- All code uses TypeScript with `strict: true` throughout
- Git commits are made at each checkpoint to maintain a clean, traceable history
- All work is pushed to a feature branch, never directly to main

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["4.1"] },
    { "id": 6, "tasks": ["4.2", "5.1"] },
    { "id": 7, "tasks": ["5.2", "5.3"] },
    { "id": 8, "tasks": ["6.1"] },
    { "id": 9, "tasks": ["7.1"] },
    { "id": 10, "tasks": ["7.2", "7.3"] },
    { "id": 11, "tasks": ["8.1"] },
    { "id": 12, "tasks": ["8.2", "8.3"] },
    { "id": 13, "tasks": ["9.1"] },
    { "id": 14, "tasks": ["9.2", "10.1"] },
    { "id": 15, "tasks": ["11.1"] },
    { "id": 16, "tasks": ["11.2", "11.3", "11.4"] },
    { "id": 17, "tasks": ["12.1"] },
    { "id": 18, "tasks": ["12.2", "12.3", "12.4", "12.5"] },
    { "id": 19, "tasks": ["13.1"] },
    { "id": 20, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 21, "tasks": ["15.1"] },
    { "id": 22, "tasks": ["16.1"] }
  ]
}
```
