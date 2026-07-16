# Implementation Plan: Dashboard, Reports & Data Management Enhancements

## Overview

This plan implements the consolidation of analytics into the Dashboard, removal of the standalone Analytics page, data-backed month selection, bulk delete for uploads, function-wise upload view, and server-side role-based data scoping — all in TypeScript across the React client and Express server.

## Tasks

- [x] 1. Remove Analytics page and consolidate routing
  - [x] 1.1 Remove `/analytics` route and add redirect in App.tsx
    - Replace the `<Route path="analytics" element={<Analytics />} />` with `<Route path="analytics" element={<Navigate to="/" replace />} />`
    - Remove the analytics import if no longer needed elsewhere
    - Remove all analytics/reports links from `getNavLinks()` for every role
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 1.2 Write unit tests for analytics removal
    - Test that `getNavLinks()` returns no link with path `/analytics` for any role
    - Test that navigating to `/analytics` redirects to `/`
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Implement server-side data scoping middleware
  - [x] 2.1 Create `dataScopeMiddleware` in `server/src/middleware/`
    - Create `server/src/middleware/data-scope.ts`
    - Implement middleware that resolves `functionName` and `functionId` from the authenticated user
    - For Engineering_Manager: resolve function from `functionId`, attach mandatory scope to request
    - For Leadership/Super_Admin/Delivery_Manager: allow optional `functionName` query param for filtering
    - Attach `DataScope` interface to express Request type
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 2.2 Apply data scope middleware to dashboard and history routes
    - Add `dataScopeMiddleware` to `dashboard.routes.ts` route handlers
    - Update existing KPI and trends endpoints to use `req.dataScope` for query filtering
    - _Requirements: 5.1, 5.3, 5.6_

  - [ ]* 2.3 Write property tests for role-based data scoping
    - **Property 2: Role-based data scoping on all API responses**
    - **Property 3: Server-side scoping ignores unauthorized client parameters**
    - Generate random users with various roles/functions, verify API response boundaries
    - Generate EM requests with tampered query params, verify scoping holds
    - **Validates: Requirements 1.6, 1.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7**

- [ ] 3. Implement available months API endpoint
  - [x] 3.1 Add `GET /api/dashboard/available-months` endpoint
    - Add route handler in `server/src/routes/dashboard.routes.ts`
    - Query `sprint_data` to extract distinct YYYY-MM values from `dev_start_date`
    - Apply data scope: EM gets months for their function only; Leadership/Super_Admin/DM get all months
    - Return `{ success: true, months: string[] }` sorted descending
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 3.2 Write property test for available months correctness
    - **Property 4: Available months reflect actual data presence**
    - Generate random sprint_data sets, verify month extraction matches actual data within user scope
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [x] 4. Implement DataBackedMonthPicker client component
  - [x] 4.1 Create `DataBackedMonthPicker` component
    - Create `client/src/components/DataBackedMonthPicker.tsx`
    - Accept props: `selectedMonth`, `onMonthChange`, `availableMonths`
    - Render a dropdown/select showing only months from `availableMonths`
    - Format month labels as "MMM YYYY" for readability
    - _Requirements: 2.1, 2.6_

  - [x] 4.2 Integrate DataBackedMonthPicker into EmDashboard and LeadershipDashboard
    - In `EmDashboard.tsx`: fetch available months from API, replace static month picker with `DataBackedMonthPicker`
    - In `LeadershipDashboard.tsx`: fetch available months from API, replace or add `DataBackedMonthPicker`
    - Remove manual `monthOptions` generation in favor of API-backed months
    - _Requirements: 2.6_

- [x] 5. Checkpoint - Verify routing, scoping, and month picker
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Consolidate analytics components into Dashboard
  - [x] 6.1 Integrate KpiTrendChart and TeamComparisonTable into LeadershipDashboard
    - Import `KpiTrendChart` and `TeamComparisonTable` into `LeadershipDashboard.tsx`
    - Render KpiTrendChart with cross-function trend data
    - Render TeamComparisonTable with cross-function team data
    - Add function filter dropdown (populated from `/api/admin/functions`) that filters all dashboard sections
    - _Requirements: 1.4, 1.5, 1.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 6.2 Integrate KpiTrendChart into EmDashboard
    - Import `KpiTrendChart` into `EmDashboard.tsx`
    - Render KpiTrendChart scoped to the EM's assigned function
    - Ensure period switcher still works with the new trend chart
    - _Requirements: 1.4, 1.6, 6.1, 6.2, 6.6_

  - [ ]* 6.3 Write property test for dashboard filter consistency
    - **Property 8: Dashboard filter consistency**
    - Apply random function filters for Leadership users, verify all response sections match
    - **Validates: Requirements 6.4, 6.5**

- [x] 7. Implement bulk delete uploads feature
  - [x] 7.1 Add `DELETE /api/uploads/bulk` endpoint
    - Add route handler in `server/src/routes/upload.routes.ts`
    - Validate request body contains non-empty `uploadIds` array of valid UUIDs
    - For Engineering_Manager: verify all uploads belong to EM's function via sprint_data join; reject entire request if any are out-of-scope
    - For Super_Admin: allow deletion of any uploads
    - Other roles: return 403
    - Execute within a SQLite transaction: delete sprint_data rows, then delete upload rows
    - Return `{ success: true, deletedCount, message }` on success
    - _Requirements: 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ]* 7.2 Write property tests for bulk delete
    - **Property 5: Bulk delete cascade integrity**
    - **Property 6: Bulk delete authorization boundary**
    - Generate random upload sets, delete subsets, verify cascade integrity
    - Generate EM users attempting cross-function deletes, verify rejection
    - **Validates: Requirements 3.5, 3.6, 3.7, 3.8, 3.9**

  - [x] 7.3 Add bulk delete UI to History page uploads tab
    - In `client/src/pages/History.tsx`: add checkbox column to uploads table rows
    - Track `selectedUploadIds: Set<string>` state
    - Show "Delete Selected" button when selection is non-empty; hide/disable otherwise
    - Add confirmation dialog showing count of selected uploads
    - On confirm: call `DELETE /api/uploads/bulk` with selected IDs
    - On success: refresh uploads list and show success notification with deleted count
    - On failure: display error message and retain selection state
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.10, 3.11_

  - [ ]* 7.4 Write unit tests for bulk delete UI
    - Test checkbox selection state management
    - Test "Delete Selected" button visibility based on selection
    - Test confirmation dialog renders correct count
    - Test success/error notification behavior
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.10, 3.11_

- [x] 8. Implement function-wise upload view
  - [x] 8.1 Add `GET /api/uploads/by-function` endpoint
    - Add route handler in `server/src/routes/upload.routes.ts`
    - Query uploads joined with sprint_data and users to group by function_name
    - Include uploader name resolved from users table
    - Apply data scope: EM sees only their function; Leadership/Super_Admin/DM see all
    - Return `{ success: true, data: FunctionGroup[] }`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 8.2 Write property test for function view grouping
    - **Property 7: Function view grouping correctness**
    - Generate uploads across functions, verify correct grouping and non-empty uploaderName
    - **Validates: Requirements 4.2, 4.3**

  - [x] 8.3 Add "By Function" tab to History page
    - In `client/src/pages/History.tsx`: add "By Function" to the view mode toggle (type `'uploads' | 'entries' | 'byFunction'`)
    - Fetch data from `GET /api/uploads/by-function` when tab is active
    - Render grouped sections with function name headings
    - Display EM name associated with each upload record
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 8.4 Write unit tests for function view UI
    - Test tab switching renders correct view
    - Test grouped sections display correctly with function headings and EM names
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 9. Checkpoint - Verify all features integrated
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Final wiring and navigation cleanup
  - [x] 10.1 Wire navigation links and ensure role-based visibility
    - Verify all nav links across roles point to valid routes (no dead analytics links)
    - Verify Dashboard link works as primary landing for all roles
    - Ensure History page "By Function" tab respects role visibility (visible to all, scoped by role)
    - _Requirements: 1.2, 5.1, 5.3, 5.5_

  - [ ]* 10.2 Write property test for navigation correctness
    - **Property 1: Navigation contains no analytics references for any role**
    - Test `getNavLinks()` for all valid roles produces no analytics paths or labels
    - **Validates: Requirements 1.2**

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The data scope middleware (task 2.1) is foundational — most other tasks depend on it
- SQLite transactions in bulk delete ensure atomicity (no partial deletes)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1"] },
    { "id": 2, "tasks": ["2.3", "3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "6.1", "6.2", "7.1", "8.1"] },
    { "id": 4, "tasks": ["6.3", "7.2", "7.3", "8.2", "8.3"] },
    { "id": 5, "tasks": ["7.4", "8.4", "10.1"] },
    { "id": 6, "tasks": ["10.2"] }
  ]
}
```
