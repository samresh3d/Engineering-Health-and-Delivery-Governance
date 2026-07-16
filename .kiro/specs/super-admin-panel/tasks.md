# Implementation Plan: Super Admin Panel

## Overview

This plan implements the Super Admin Panel feature in four stages: server-side infrastructure (DB migration, types, repository, routes), client-side auth flow (utilities, protected routes, login page, routing), admin panel UI pages (layout, dashboard, teams, entries, settings), and final integration/polish. The implementation uses TypeScript throughout, matching the existing monorepo architecture.

## Tasks

- [x] 1. Server-side infrastructure and data layer
  - [x] 1.1 Create database migration for Super_Admin role
    - Create `server/src/database/migrations/002-add-super-admin-role.ts`
    - Recreate users table with updated CHECK constraint including 'Super_Admin'
    - Follow the existing migration pattern in the migrations folder
    - _Requirements: 3.6_

  - [x] 1.2 Update server types to include Super_Admin role
    - Update `server/src/types/index.ts` DecodedToken interface to include 'Super_Admin' in the role union type
    - Add any shared admin-related type exports (AdminAnalytics, TeamSummary, PaginatedEntries)
    - _Requirements: 3.1_

  - [x] 1.3 Update seed data with Super_Admin mock user
    - Add Super_Admin user (`user-sa-001`, `super_admin`, `Super_Admin`) to `server/src/database/seed.ts` MOCK_USERS array
    - Ensure the mock-users endpoint returns the new user
    - _Requirements: 3.5_

  - [x] 1.4 Update RBAC middleware for Super_Admin permissions
    - Modify `server/src/middleware/rbac.ts` to add 'Super_Admin' to all existing route permission arrays
    - Add `/api/admin/*` route pattern with exclusive `['Super_Admin']` access
    - Ensure non-Super_Admin users receive 403 on `/api/admin/*` routes
    - _Requirements: 3.2, 3.3, 3.4_

  - [x] 1.5 Create Zod validation schemas for admin endpoints
    - Create `server/src/schemas/admin.schema.ts` (or `server/src/validators/admin.validators.ts`)
    - Implement `createEntrySchema`, `updateEntrySchema`, and `paginationSchema` as defined in design
    - Require fields: team, track, project, portfolio, jiraId
    - _Requirements: 9.9_

  - [x] 1.6 Implement admin repository
    - Create `server/src/repositories/admin.repository.ts`
    - Implement `getAnalytics()`: COUNT DISTINCT team, COUNT entries, recent uploads (7 days), pending items (null/empty development_status)
    - Implement `getTeams(search?, portfolio?)`: distinct teams with entry counts and portfolio, case-insensitive search
    - Implement `getTeamDetail(teamName)`: team entries, total count, distinct projects
    - Implement `getEntries(limit, offset, sort)`: paginated entries with total count
    - Implement `createEntry(data)`, `updateEntry(id, data)`, `deleteEntry(id)`: full CRUD
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 1.7 Create admin routes
    - Create `server/src/routes/admin.routes.ts`
    - Implement GET `/analytics`, GET `/teams`, GET `/teams/:teamName`, GET `/entries`
    - Implement POST `/entries`, PUT `/entries/:id`, DELETE `/entries/:id`
    - Use Zod schemas for request validation; return 400 with field-level errors on validation failure
    - Return 404 for non-existent entry IDs on PUT/DELETE
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x] 1.8 Register admin routes in Express app
    - Update `server/src/app.ts` to mount admin routes at `/api/admin` with RBAC middleware applied
    - _Requirements: 3.3, 9.1_

- [x] 2. Checkpoint - Server-side verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Client-side authentication and routing
  - [x] 3.1 Create auth utilities module
    - Create `client/src/auth/index.ts`
    - Implement `getStoredToken()`, `getStoredUser()`, `setAuth()`, `clearAuth()`, `isAuthenticated()`, `isSuperAdmin()`
    - Store/retrieve from localStorage keys `auth_token` and `auth_user`
    - _Requirements: 2.3, 2.4, 2.6, 2.8_

  - [x] 3.2 Create ProtectedRoute component
    - Create `client/src/components/ProtectedRoute.tsx`
    - Redirect unauthenticated users to `/login`
    - Accept `requireSuperAdmin` prop; redirect non-Super_Admin users to `/` when true
    - _Requirements: 2.1, 4.4_

  - [x] 3.3 Create Login page
    - Create `client/src/pages/Login.tsx`
    - Fetch mock users from `/api/auth/mock-users` on mount
    - Render dropdown selector with all users (username + role displayed)
    - On submit: store credentials via `setAuth()` and navigate to `/`
    - Display platform logo and platform name
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.7_

  - [x] 3.4 Update App.tsx with routing and logo
    - Refactor `client/src/App.tsx` to use React Router v6 with route structure from design
    - Replace header letter placeholder with `logo.svg` (height fits 64px, alt="Engineering Health Platform")
    - Add "Admin Panel" nav link visible only when `isSuperAdmin()` returns true
    - Add logout button that calls `clearAuth()` and navigates to `/login`
    - Wrap routes with ProtectedRoute; admin routes use `requireSuperAdmin`
    - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2, 4.3, 2.8_

- [x] 4. Checkpoint - Auth flow verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Admin Panel pages
  - [x] 5.1 Create Admin Layout with sidebar navigation
    - Create `client/src/pages/admin/AdminLayout.tsx`
    - Implement persistent sidebar with NavLinks to Dashboard, Teams, Entries, Settings
    - Show authenticated user's username and role in sidebar header
    - Use NavLink `isActive` for active section highlighting with border-left indicator
    - Sidebar collapses on viewport < 768px (responsive)
    - Content area uses `<Outlet />` for nested routes
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 10.1, 10.2, 10.4_

  - [x] 5.2 Create Admin Dashboard page
    - Create `client/src/pages/admin/AdminDashboard.tsx`
    - Fetch analytics from `/api/admin/analytics` with auth token in header
    - Display 4 stat cards: total teams, total entries, recent uploads, pending items
    - Show loading skeleton/spinner while data loads
    - Use theme colors and consistent card styling (border-radius, shadow)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 10.3_

  - [x] 5.3 Create Admin Teams page
    - Create `client/src/pages/admin/AdminTeams.tsx`
    - Fetch teams from `/api/admin/teams` with search and portfolio query params
    - Render text search input for case-insensitive team name filtering
    - Render portfolio dropdown filter
    - Display team list with name, portfolio, entry count
    - Clicking a team navigates to `/admin/teams/:teamName`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

  - [x] 5.4 Create Admin Team Detail page
    - Create `client/src/pages/admin/AdminTeamDetail.tsx`
    - Fetch team detail from `/api/admin/teams/:teamName`
    - Display summary metrics (total entries, distinct projects)
    - Display data table of all entries for the selected team
    - _Requirements: 6.4, 6.5, 6.7_

  - [x] 5.5 Create Admin Entries page with inline CRUD
    - Create `client/src/pages/admin/AdminEntries.tsx`
    - Fetch paginated entries from `/api/admin/entries` with limit/offset/sort params
    - Render sortable, paginated data table (using AG Grid or custom table)
    - Implement inline editing: edit button converts row to input fields, show Save/Cancel
    - Save sends PUT to `/api/admin/entries/:id`; Cancel reverts row
    - Delete button shows confirmation modal; confirmed DELETE removes row
    - "Add Entry" button opens form modal; submit POSTs to `/api/admin/entries`
    - Display error messages on failed operations; preserve pre-operation state
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 8.5_

  - [x] 5.6 Create Admin Settings page
    - Create `client/src/pages/admin/AdminSettings.tsx`
    - Render placeholder UI with "Settings coming soon" message
    - Display platform version/info
    - _Requirements: 8.6_

- [x] 6. Checkpoint - Admin panel verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integration and polish
  - [x] 7.1 Wire API client with auth headers
    - Update `client/src/api/client.ts` to include `Authorization: Bearer <token>` header from stored auth
    - Ensure all admin API calls pass through the authenticated client
    - Handle 401 responses by clearing auth and redirecting to login
    - _Requirements: 2.6, 3.2, 3.3_

  - [ ]* 7.2 Write property tests for RBAC and admin access control
    - **Property 4: Super_Admin has access to all protected routes**
    - **Property 5: Non-Super_Admin users are denied admin access**
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [ ]* 7.3 Write property tests for analytics accuracy
    - **Property 7: Analytics counts are accurate**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 9.1**

  - [ ]* 7.4 Write property tests for teams endpoint
    - **Property 6: Team search filtering is correct**
    - **Property 8: Teams endpoint returns accurate summaries**
    - **Property 9: Team detail returns only that team's entries**
    - **Validates: Requirements 6.1, 6.2, 6.3, 9.2, 9.3**

  - [ ]* 7.5 Write property tests for CRUD operations
    - **Property 10: Pagination returns correct slices**
    - **Property 11: CRUD round-trip preserves data**
    - **Property 12: Non-existent entry IDs return 404**
    - **Property 13: Invalid payloads return 400 with field errors**
    - **Validates: Requirements 9.4, 9.5, 9.6, 9.7, 9.8, 9.9**

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The server uses better-sqlite3 (synchronous) — no async/await needed for DB calls
- The client already has AG Grid, React Router v6, Recharts, and Axios installed
- Property tests use fast-check (already in server devDependencies)
- Vitest is the test runner for both client and server

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.5"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["1.6"] },
    { "id": 3, "tasks": ["1.7"] },
    { "id": 4, "tasks": ["1.8", "3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3"] },
    { "id": 6, "tasks": ["3.4"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2", "5.3", "5.6"] },
    { "id": 9, "tasks": ["5.4", "5.5"] },
    { "id": 10, "tasks": ["7.1"] },
    { "id": 11, "tasks": ["7.2", "7.3", "7.4", "7.5"] }
  ]
}
```
