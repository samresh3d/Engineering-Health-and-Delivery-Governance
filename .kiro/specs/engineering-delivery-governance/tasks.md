# Implementation Plan: Engineering Delivery Governance

## Overview

This plan implements the Engineering Delivery Governance feature in incremental steps, building from server-side foundation (types, services, routes) through to client-side components (pages, dashboard routing). Each task builds on the previous, ensuring no orphaned code. The implementation uses the existing Express + TypeScript server with SQLite/better-sqlite3 and the React + TypeScript + Vite client with Recharts.

## Tasks

- [x] 1. Define shared types and interfaces
  - [x] 1.1 Create governance types file on the server
    - Create `server/src/types/governance.types.ts` with interfaces: `Division`, `DivisionWithProjects`, `LeadershipDashboardData`, `EmDashboardData`, `PeriodMetrics`, `KpiTileData`, `TeamCardData`, `HealthScoreData`, `DivisionMetrics`, `ProjectByDivision`, and `PeriodType`
    - Export types for use across services and routes
    - _Requirements: 1.2, 2.1, 5.1, 9.1_

  - [x] 1.2 Create governance types file on the client
    - Create `client/src/types/governance.ts` with matching interfaces for API response types: `LeadershipDashboardData`, `EmDashboardData`, `PeriodMetrics`, `KpiTileData`, `TeamCardData`, `HealthScoreData`, `DivisionMetrics`, `ProjectByDivision`, `GovernanceState`, and `PeriodType`
    - _Requirements: 2.1, 5.1, 7.1_

- [x] 2. Implement Health Score computation
  - [x] 2.1 Add `computeHealthScore` function to KpiEngineService
    - Add the `computeHealthScore` function in `server/src/services/kpi-engine.service.ts`
    - Map RAG statuses: Green=100, Amber=50, Red=0
    - Compute arithmetic mean rounded to nearest integer
    - Classify result: ≥80 Green, 50-79 Amber, <50 Red
    - Return null when no valid KPI data available
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 2.2 Write property tests for Health Score computation
    - **Property 2: Health Score Computation Correctness**
    - **Property 3: Health Score RAG Classification**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
    - Create `server/src/services/kpi-engine.health-score.test.ts`
    - Use fast-check to verify arithmetic mean correctness across random RAG distributions
    - Verify RAG classification boundaries (80, 50) hold for all integer values 0-100

- [x] 3. Implement Division-to-Track mapping middleware
  - [x] 3.1 Create the division mapper middleware
    - Create `server/src/middleware/division-mapper.middleware.ts`
    - Implement `divisionRequestMapper`: maps `req.query.division` → `req.query.track` and `req.body.division` → `req.body.track`
    - Implement `divisionResponseMapper`: recursively renames `track` → `division` in response objects
    - _Requirements: 1.2, 1.3, 1.5_

  - [ ]* 3.2 Write property tests for field mapping round-trip
    - **Property 1: Division Field Mapping Round-Trip**
    - **Validates: Requirements 1.2, 1.3**
    - Create `server/src/middleware/division-mapper.middleware.test.ts`
    - Use fast-check to verify track↔division renaming is consistent for arbitrary nested objects

- [x] 4. Implement DivisionService
  - [x] 4.1 Create the DivisionService
    - Create `server/src/services/division.service.ts`
    - Implement `listByTeam(teamId)`: query distinct track values from sprint_data for the team
    - Implement `create(teamId, name, userId)`: insert new track value, validate name (non-empty, ≤100 chars, unique per team case-insensitive), log to audit
    - Implement `rename(teamId, oldName, newName, userId)`: update all sprint_data rows with old track to new track within team, validate uniqueness, log to audit
    - Implement `delete(teamId, divisionName, userId)`: reject if projects assigned, remove track value, log to audit
    - Implement `assignProject(teamId, projectName, divisionName, userId)`: update track field for the project within team
    - Implement `getProjectsByDivision(teamId)`: group projects by track value
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8_

  - [ ]* 4.2 Write property tests for Division name validation
    - **Property 6: Division Name Validation**
    - **Validates: Requirements 6.1**
    - Test that empty, whitespace-only, and >100 char strings are rejected
    - Test that valid strings (non-empty, ≤100 chars) are accepted

  - [ ]* 4.3 Write property tests for Division deletion guard
    - **Property 5: Division Deletion Guard**
    - **Validates: Requirements 6.3, 6.4**
    - Verify divisions with projects cannot be deleted, divisions with zero projects can be deleted

  - [ ]* 4.4 Write property tests for Division name uniqueness
    - **Property 4: Division Name Uniqueness Within Team**
    - **Validates: Requirements 6.7**
    - Verify case-insensitive duplicate detection across random name generators

- [x] 5. Extend AuthorizationService with `canManageDivisions`
  - [x] 5.1 Add `canManageDivisions` method to AuthorizationService
    - Extend `server/src/services/authorization.service.ts`
    - Add method: `canManageDivisions(user: UserContext, targetTeam: string): AuthorizationResult`
    - Super_Admin: permitted for any team
    - Engineering_Manager: permitted only for own team (team_id match)
    - Leadership: denied (read-only role)
    - Others: denied
    - _Requirements: 8.1, 8.3, 8.4, 8.5_

  - [ ]* 5.2 Write property tests for RBAC division access
    - **Property 7: Engineering Manager Team Isolation**
    - **Property 8: Leadership Read-Only Enforcement**
    - **Property 9: Super Admin Unrestricted Access**
    - **Validates: Requirements 8.1, 8.3, 8.4, 8.5, 8.7**
    - Use fast-check to generate random role/team/operation combinations and verify authorization matrix

- [x] 6. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement GovernanceDashboardService
  - [x] 7.1 Create the GovernanceDashboardService
    - Create `server/src/services/governance-dashboard.service.ts`
    - Implement `getLeadershipDashboard()`: fetch all teams, compute KPIs for month/quarter/year periods, compute health scores, build TeamCardData with sparklines
    - Implement `getEmDashboard(teamId)`: fetch team divisions, compute per-division KPIs for all periods, group projects by division
    - Use existing KpiEngineService and DivisionService for underlying data
    - Handle insufficient data gracefully (null health scores, insufficientData flags)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 5.1, 5.2, 5.4, 5.5, 7.3_

- [x] 8. Implement Division routes
  - [x] 8.1 Create Division API routes
    - Create `server/src/routes/division.routes.ts`
    - `POST /api/divisions` — create division (EM: own team, Super_Admin: any team)
    - `PUT /api/divisions/:name` — rename division (with team in body)
    - `DELETE /api/divisions/:name` — delete division (query: ?team=X, reject if has projects)
    - `GET /api/divisions` — list divisions for team (query: ?team=X)
    - `POST /api/divisions/:name/assign` — assign project to division
    - Apply `canManageDivisions` authorization check on all write operations
    - Apply division response mapper on GET responses
    - Return proper error codes: 400, 403, 404 per design
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [ ]* 8.2 Write integration tests for Division routes
    - Test CRUD operations with different roles
    - Test validation errors (empty name, too long, duplicate)
    - Test 403 for wrong team access
    - _Requirements: 6.1, 6.6, 8.4_

- [x] 9. Implement Governance Dashboard routes
  - [x] 9.1 Create Governance Dashboard API routes
    - Create `server/src/routes/governance.routes.ts`
    - `GET /api/governance/leadership` — Leadership/Super_Admin dashboard (all teams, all periods)
    - `GET /api/governance/em` — EM dashboard (auto-scoped to own team, all periods)
    - `GET /api/governance/team/:teamId` — Team drill-down data (divisions + metrics)
    - `GET /api/governance/division/:teamId/:divisionName` — Division drill-down data
    - Enforce role-based access: Leadership/Super_Admin for leadership routes, EM for own team
    - Apply division response mapper on all responses
    - _Requirements: 2.1, 2.3, 3.1, 3.2, 3.3, 5.1, 5.4, 8.1, 8.2, 8.4_

- [x] 10. Register new routes in app.ts
  - [x] 10.1 Register division and governance routes in Express app
    - Import `divisionRoutes` and `governanceRoutes` in `server/src/app.ts`
    - Add `app.use('/api/divisions', divisionRoutes)`
    - Add `app.use('/api/governance', governanceRoutes)`
    - _Requirements: 1.2, 2.1, 5.1, 6.1_

- [x] 11. Checkpoint
  - Ensure all server tests pass, ask the user if questions arise.

- [x] 12. Implement PeriodSwitcher component
  - [x] 12.1 Create the PeriodSwitcher component
    - Create `client/src/components/PeriodSwitcher.tsx`
    - Render three segmented control buttons: Month | Quarter | Year
    - Default to Quarter selected
    - Highlight active button with visual state
    - Call `onChange` callback with selected period (no API calls)
    - Add `aria-pressed` attributes for accessibility
    - Support keyboard navigation
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 11.5_

  - [ ]* 12.2 Write component tests for PeriodSwitcher
    - Test default quarter selection
    - Test toggle without network calls
    - Test keyboard accessibility
    - _Requirements: 7.1, 7.5_

- [x] 13. Implement TeamCard component
  - [x] 13.1 Create the TeamCard component
    - Create `client/src/components/TeamCard.tsx`
    - Display: team name, Health Score value + RAG badge, active divisions count, active projects count
    - Render mini sparkline using Recharts (last 3 period health scores)
    - Apply colored left border based on RAG status (Green=#28A745, Amber=#FFC107, Red=#DC3545)
    - Add chevron/expand affordance
    - Support keyboard interaction (Enter/Space to toggle)
    - Include `aria-expanded` attribute
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 11.2, 11.3, 11.5_

  - [ ]* 13.2 Write component tests for TeamCard
    - Test rendering with various health score states (green, amber, red, null)
    - Test border color application
    - Test expand/collapse toggle
    - _Requirements: 4.3, 4.4, 4.5_

- [x] 14. Implement DrillDownPanel component
  - [x] 14.1 Create the DrillDownPanel component
    - Create `client/src/components/DrillDownPanel.tsx`
    - Render accordion list of divisions with KPI summaries and RAG badges
    - On division click, expand to show project-level metrics
    - Apply smooth CSS transitions (200-400ms)
    - Preserve period selection across expand/collapse
    - Add `aria-expanded` on each division row
    - Support keyboard navigation (Enter/Space)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 11.4, 11.5_

  - [ ]* 14.2 Write component tests for DrillDownPanel
    - Test expand/collapse behavior
    - Test period preservation during toggle
    - _Requirements: 3.4, 3.5_

- [x] 15. Implement DivisionManager component
  - [x] 15.1 Create the DivisionManager component
    - Create `client/src/components/DivisionManager.tsx`
    - Create form: text input (max 100 chars, required, unique per team)
    - Rename: inline edit with validation
    - Delete: only enabled when projectCount = 0, show warning if projects assigned
    - Assign project: dropdown/combobox for project selection
    - Display inline validation errors (duplicate names, non-empty delete)
    - Wire to POST/PUT/DELETE /api/divisions endpoints
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

  - [ ]* 15.2 Write component tests for DivisionManager
    - Test form validation (empty name, too long)
    - Test delete disabled when projects assigned
    - _Requirements: 6.1, 6.3_

- [x] 16. Implement LeadershipDashboard page
  - [x] 16.1 Create the LeadershipDashboard page
    - Create `client/src/pages/LeadershipDashboard.tsx`
    - Fetch data from `GET /api/governance/leadership` on mount
    - Render 10 executive KPI tiles (Health Score, Sprint Predictability, Delivery Efficiency, Velocity Trend, Escaped Defects, Team Capacity, Story Completion %, Planned vs Delivered, Risks count, Blockers count)
    - Each tile: current value, RAG indicator, trend arrow (up/down/stable)
    - Show "Limited Data" indicator when fewer than 2 periods available
    - Integrate PeriodSwitcher (default: Quarter, client-side data swap)
    - Render TeamCard grid (alphabetically ordered by team name)
    - On TeamCard click, expand DrillDownPanel below the card
    - Collapse on re-click of expanded card
    - Highlight selected card visually
    - Responsive grid: 3 cols desktop (≥1200px), 2 cols tablet (768-1199px), 1 col mobile (<768px)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.4, 3.6, 7.2, 7.4, 7.5, 7.6, 11.1, 11.2_

- [x] 17. Implement EmDashboard page
  - [x] 17.1 Create the EmDashboard page
    - Create `client/src/pages/EmDashboard.tsx`
    - Fetch data from `GET /api/governance/em` on mount
    - Render team KPI tiles scoped to EM's assigned team
    - Integrate PeriodSwitcher (default: Quarter, client-side data swap)
    - Display division breakdown: each division with KPI summaries + RAG
    - Display projects grouped by division with Sprint Predictability, Delivery Efficiency, RAG
    - Render "Manage Divisions" action button → opens DivisionManager
    - Show onboarding prompt if zero divisions
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.2, 7.4, 7.5_

- [x] 18. Update Dashboard routing for role-based rendering
  - [x] 18.1 Update the Dashboard page for role-based rendering
    - Modify `client/src/pages/Dashboard.tsx`
    - Leadership / Super_Admin → render `<LeadershipDashboard />`
    - Engineering_Manager → render `<EmDashboard />`
    - Others → render existing default dashboard (unchanged)
    - _Requirements: 2.1, 5.1, 8.1, 8.2, 8.4_

- [x] 19. Update Admin UI division label
  - [x] 19.1 Rename "Track" labels to "Division" in the Admin UI
    - Update relevant admin page components to display "Division" where "Track" was shown
    - Update filter dropdowns, table headers, form labels to use "Division"
    - Update track_portfolio_mapping references to display "Division-Portfolio Mapping"
    - _Requirements: 1.1, 1.4_

- [x] 20. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit/component tests validate specific examples and edge cases using vitest
- The design uses TypeScript throughout (server and client), matching the existing codebase
- No database schema changes are needed — "division" is a presentation-layer rename of "track"
- PeriodSwitcher operates client-side only; a single API call pre-fetches all period aggregations

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.1", "5.2"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "7.1"] },
    { "id": 4, "tasks": ["8.1", "9.1"] },
    { "id": 5, "tasks": ["8.2", "10.1"] },
    { "id": 6, "tasks": ["12.1", "13.1", "15.1"] },
    { "id": 7, "tasks": ["12.2", "13.2", "14.1", "15.2"] },
    { "id": 8, "tasks": ["14.2", "16.1", "17.1"] },
    { "id": 9, "tasks": ["18.1", "19.1"] }
  ]
}
```
