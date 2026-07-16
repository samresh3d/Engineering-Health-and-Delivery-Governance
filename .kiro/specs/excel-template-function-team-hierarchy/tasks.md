# Implementation Plan: Excel Template Function-Team Hierarchy

## Overview

This plan implements the Function → Team → Story hierarchy to replace the flat "Project" field. The approach is bottom-up: start with database schema and migration, build repository/service layers, add API routes, revise the upload/template generation pipeline, and finish with client-side admin UI and filtering enhancements.

## Tasks

- [x] 1. Database migration and schema setup
  - [x] 1.1 Create migration file `server/src/database/migrations/004-function-team-hierarchy.ts`
    - Create `functions` table (id, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at)
    - Create `teams` table (id, name, function_id FK, created_at, UNIQUE(name, function_id))
    - Create `dropdown_options` table (id, field_name, option_value, sort_order, created_at, UNIQUE(field_name, option_value))
    - Add columns to `sprint_data`: function_name, story_name, actual_effort, definition_of_ready, definition_of_done, refinement_closure_date, uat_start_date, uat_complete_date, delay_reason, delay_reason_description
    - Add `function_id` nullable column to `users` table referencing functions(id)
    - Create indexes: idx_sprint_data_function, idx_sprint_data_function_team, idx_teams_function_id
    - Seed `functions` with E-Com, MPro, Dolphin, IVC
    - Populate `function_name` for existing records using track_portfolio_mapping join
    - Set function_name to "Unassigned" for records with no mapping
    - Populate `teams` from distinct team values grouped by mapped function
    - Seed `dropdown_options` with initial Production Status, Story Status, Delay Reason values
    - Seed eng_manager user function assignment to E-Com
    - Wrap entire migration in a single transaction
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 5.8, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 2.5, 8.7_

  - [x] 1.2 Define TypeScript domain types in `server/src/types/`
    - Add FunctionRecord, TeamRecord, DropdownOption, SprintDataRowExtended interfaces
    - Extend existing SprintDataRow type with new fields
    - _Requirements: 5.1_

- [x] 2. Function repository and service layer
  - [x] 2.1 Implement Function repository (`server/src/repositories/function.repository.ts`)
    - Implement getAll, getById, getByName, create, rename, delete, hasTeams methods
    - Use transactions for rename (update functions.name + all sprint_data.function_name)
    - Use case-insensitive comparison for duplicate detection
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x]* 2.2 Write property test for Function name validation
    - **Property 4: Function name validation rules**
    - **Validates: Requirements 2.4, 6.1, 6.5, 6.6, 6.7**

  - [x]* 2.3 Write property test for Function rename cascade
    - **Property 10: Function rename cascades atomically**
    - **Validates: Requirements 6.2**

  - [x] 2.4 Implement Function admin routes (`server/src/routes/function.routes.ts`)
    - GET /api/admin/functions — list all (Super_Admin only)
    - POST /api/admin/functions — create (Super_Admin only)
    - PUT /api/admin/functions/:id — rename (Super_Admin only)
    - DELETE /api/admin/functions/:id — delete (Super_Admin only)
    - Input validation with Zod (name: 1-100 chars, alphanumeric/hyphens/spaces/underscores)
    - Wire RBAC middleware for Super_Admin role check
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x]* 2.5 Write unit tests for Function CRUD (`server/src/__tests__/unit/function-crud.test.ts`)
    - Test create, rename, delete success paths
    - Test duplicate name rejection (case-insensitive)
    - Test delete with associated teams rejection
    - Test invalid name format rejection
    - _Requirements: 6.1, 6.3, 6.5, 6.6, 6.7_

- [x] 3. Team repository and service layer
  - [x] 3.1 Implement Team repository (`server/src/repositories/team.repository.ts`)
    - Implement getByFunction, getById, getByNameAndFunction, create, rename, delete, hasSprintData methods
    - Use transactions for rename (update teams.name + sprint_data.team for that function)
    - Validate parent function exists before create
    - _Requirements: 4.1, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8, 7.9, 7.10_

  - [x]* 3.2 Write property test for Team name validation
    - **Property 5: Team name validation with within-function uniqueness**
    - **Validates: Requirements 4.1, 7.1, 7.5, 7.6, 7.9, 7.10**

  - [x] 3.3 Implement Team admin routes (`server/src/routes/team.routes.ts`)
    - GET /api/admin/functions/:functionId/teams — list teams for function (Super_Admin only)
    - POST /api/admin/functions/:functionId/teams — create team (Super_Admin only)
    - PUT /api/admin/teams/:id — rename team (Super_Admin only)
    - DELETE /api/admin/teams/:id — delete team (Super_Admin only)
    - Input validation with Zod
    - Wire RBAC middleware for Super_Admin role check
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

  - [x]* 3.4 Write unit tests for Team CRUD (`server/src/__tests__/unit/team-crud.test.ts`)
    - Test create, rename, delete success paths
    - Test duplicate within same function rejection
    - Test same name allowed under different functions
    - Test delete with sprint data rejection
    - Test create under non-existent function rejection
    - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 7.8_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Engineering Manager function assignment
  - [x] 5.1 Implement EM assignment route (`server/src/routes/function.routes.ts` or dedicated route)
    - PUT /api/admin/users/:id/function — assign EM to function (Super_Admin only)
    - Validate user exists and has Engineering_Manager role
    - Validate target function exists in Function_Registry
    - Update users.function_id
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8_

  - [x]* 5.2 Write property test for EM reassignment data preservation
    - **Property 11: Historical data preservation on EM reassignment**
    - **Validates: Requirements 8.3**

  - [x]* 5.3 Write unit tests for EM assignment (`server/src/__tests__/unit/em-assignment.test.ts`)
    - Test assign success, immediate effect
    - Test assign to non-existent function rejection
    - Test assign to non-EM user rejection
    - Test reassignment does not modify existing sprint data
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6_

- [x] 6. Dropdown configuration management
  - [x] 6.1 Implement dropdown options repository/service
    - Add methods to `server/src/repositories/config.repository.ts` or create new file
    - getOptionsByField(fieldName) → returns sorted options
    - setOptions(fieldName, values[]) → replace all options for field
    - addOption, removeOption, reorderOptions
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.9_

  - [x] 6.2 Implement dropdown config routes (`server/src/routes/config.routes.ts` extension)
    - GET /api/config/dropdowns — get all dropdown options (all authenticated users)
    - PUT /api/config/dropdowns/:field — update dropdown options for field (Super_Admin only)
    - Validate field is one of: production_status, story_status, delay_reason
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 7. Template generator revision
  - [x] 7.1 Revise template generator service (`server/src/services/template-generator.service.ts` or existing upload service)
    - Generate 29-column Excel template using ExcelJS
    - Set column headers in specified order (Requirement 1.1)
    - Pre-fill Function column with EM's assigned function name in rows 2-501
    - Apply cell protection (sheet protection + locked cells) on Function column
    - Populate Team dropdown from teams belonging to EM's function
    - Populate Production Status, Story Status, Delay Reason dropdowns from dropdown_options
    - Populate Function dropdown for non-locked scenarios (if needed)
    - Handle edge case: EM with no function assignment → return error
    - Handle edge case: empty Function_Registry → empty dropdown + message
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.6, 3.1, 3.2, 3.6, 4.2, 4.3, 4.4, 9.1, 9.2, 9.3_

  - [x]* 7.2 Write unit tests for template generator (`server/src/__tests__/unit/template-generator.test.ts`)
    - Test exact 29 columns in correct order
    - Test Function cell protection (read-only)
    - Test Team dropdown filtered by function
    - Test EM with no assignment error
    - Test empty Function_Registry handling
    - _Requirements: 1.1, 2.6, 3.1, 3.2, 3.6, 4.2_

- [x] 8. Upload validation engine revision
  - [x] 8.1 Implement revised Zod schema (`server/src/validators/upload.validator.ts` or `server/src/schemas/`)
    - Define revisedExcelRowSchema with all 29 fields per design
    - Define dateStringSchema supporting DD-MM-YYYY, ISO 8601, DD-MMM-YY, DD-MMM-YYYY, Excel serial
    - Define JIRA ID regex pattern: /^[A-Z0-9]+-\d+$/
    - Numeric fields: non-negative, max 99999.99
    - Y/N fields: case-insensitive "Y" or "N"
    - Text field max lengths (500, 2000, 100 as appropriate)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 8.2 Implement upload validation pipeline (header check, function enforcement, team membership, dropdown validation)
    - validateHeaders: check 29 headers present (case-insensitive trimmed)
    - validateFunctionAssignment: every row's Function matches EM's assigned function (case-sensitive), reject entire file on mismatch
    - validateTeamMembership: every row's Team exists in Team_Registry under EM's function
    - validateDropdowns: Production Status and Story Status mandatory, Delay Reason optional; case-insensitive match against configured options
    - validateFieldTypes: dates, numerics, Y/N, text lengths, JIRA ID pattern
    - Collect up to 100 errors with row numbers and field names
    - Validate file size ≤ 10MB and .xlsx/.xls format before parsing
    - Reject file with zero data rows
    - _Requirements: 3.3, 3.4, 3.5, 4.6, 4.7, 4.8, 9.5, 9.6, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

  - [x]* 8.3 Write property test for date field validation
    - **Property 1: Date field validation accepts all supported formats and rejects invalid**
    - **Validates: Requirements 1.3, 10.3**

  - [x]* 8.4 Write property test for numeric field validation
    - **Property 2: Numeric field validation enforces bounds**
    - **Validates: Requirements 1.4, 10.4**

  - [x]* 8.5 Write property test for text field length validation
    - **Property 3: Text field length validation**
    - **Validates: Requirements 1.6, 1.7, 1.8**

  - [x]* 8.6 Write property test for function assignment enforcement on upload
    - **Property 6: Function assignment enforcement on upload**
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [x]* 8.7 Write property test for team membership enforcement on upload
    - **Property 7: Team membership enforcement on upload**
    - **Validates: Requirements 4.6, 4.7, 4.8**

  - [x]* 8.8 Write property test for dropdown value case-insensitive validation
    - **Property 8: Dropdown value case-insensitive validation**
    - **Validates: Requirements 9.5, 9.6, 9.7, 9.8**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Upload service persistence and sprint data repository update
  - [x] 10.1 Update sprint data repository (`server/src/repositories/sprint-data.repository.ts`)
    - Extend bulkUpsert to persist all 29 fields including function_name, story_name, actual_effort, DOR, DOD, refinement_closure_date, uat_start_date, uat_complete_date, delay_reason, delay_reason_description
    - Enforce UNIQUE(jira_id, team) constraint on upsert
    - _Requirements: 5.1, 5.2, 5.3, 5.8, 10.7_

  - [x] 10.2 Update upload route handler (`server/src/routes/upload.routes.ts`)
    - Wire revised validation pipeline into upload flow
    - On validation pass, persist via updated repository
    - Return errors array (up to 100) on validation failure
    - _Requirements: 10.6, 10.7_

  - [x]* 10.3 Write property test for upload-persist round trip
    - **Property 12: Upload-persist round trip**
    - **Validates: Requirements 10.7**

- [x] 11. Cross-function filtering for analytics
  - [x] 11.1 Update filter/analytics routes and repository queries
    - Add Function filter parameter to analytics/dashboard routes
    - Support query by Function only, Function+Team, or all Functions
    - Return empty result set with zero records when no matches
    - Cascade Team dropdown based on selected Function
    - Restrict Function filter visibility to Leadership/Super_Admin roles
    - _Requirements: 5.4, 5.5, 5.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [x]* 11.2 Write property test for query filtering correctness
    - **Property 9: Query filtering correctness**
    - **Validates: Requirements 5.4, 5.5, 11.3**

- [x] 12. Client-side admin UI for Functions and Teams
  - [x] 12.1 Create FunctionManager component (`client/src/pages/admin/FunctionManager.tsx`)
    - List all functions with create/rename/delete actions
    - Inline editing for function names
    - Validation feedback (duplicate name, name constraints)
    - Super_Admin only access
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 12.2 Create TeamManager component (`client/src/pages/admin/TeamManager.tsx`)
    - Function selector dropdown to scope team view
    - List teams under selected function with create/rename/delete actions
    - Validation feedback (duplicate within function, parent function required)
    - Super_Admin only access
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

  - [x] 12.3 Create EM Function Assignment UI (in AdminSettings or dedicated section)
    - List Engineering Manager users with their current function assignment
    - Dropdown to assign/reassign function
    - Super_Admin only access
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.8_

  - [x] 12.4 Wire admin navigation to include Function and Team management pages
    - Add routes in App.tsx for /admin/functions and /admin/teams
    - Add sidebar/nav links in AdminLayout
    - _Requirements: 6.8, 7.7_

- [x] 13. Client-side filtering enhancements
  - [x] 13.1 Update FilterBar component (`client/src/components/FilterBar.tsx`)
    - Add Function dropdown filter (visible only to Leadership/Super_Admin)
    - Cascade Team dropdown based on selected Function
    - When no Function selected, show all Teams across functions
    - Hide Function filter for Engineering_Manager users
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.8_

  - [x] 13.2 Update AnalyticsFilterBar (`client/src/components/AnalyticsFilterBar.tsx`)
    - Add Function-level filter for cross-function aggregation views
    - Show empty state message when selected Function has no data
    - _Requirements: 11.1, 11.4, 11.5, 11.7_

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Migration correctness verification
  - [x]* 15.1 Write property test for migration mapping correctness
    - **Property 13: Migration mapping correctness**
    - **Validates: Requirements 12.4, 12.5**

  - [x]* 15.2 Write integration tests for full migration flow (`server/src/__tests__/integration/migration-integration.test.ts`)
    - Test migration runs in single transaction
    - Test rollback on failure
    - Test seed values exist after migration
    - Test existing data mapped correctly
    - Test indexes created
    - _Requirements: 12.6, 12.7, 12.8, 12.9, 5.7_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The migration (task 1.1) must run first as all other tasks depend on the schema changes
- Client-side work (tasks 12-13) can proceed in parallel with server-side work after the API routes are complete

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "6.2"] },
    { "id": 3, "tasks": ["2.5", "3.4", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "7.1"] },
    { "id": 5, "tasks": ["7.2", "8.1"] },
    { "id": 6, "tasks": ["8.2"] },
    { "id": 7, "tasks": ["8.3", "8.4", "8.5", "8.6", "8.7", "8.8"] },
    { "id": 8, "tasks": ["10.1", "10.2"] },
    { "id": 9, "tasks": ["10.3", "11.1"] },
    { "id": 10, "tasks": ["11.2", "12.1", "12.2", "12.3"] },
    { "id": 11, "tasks": ["12.4", "13.1", "13.2"] },
    { "id": 12, "tasks": ["15.1", "15.2"] }
  ]
}
```
