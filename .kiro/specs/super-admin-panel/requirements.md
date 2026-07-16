# Requirements Document

## Introduction

This document specifies requirements for enhancing the Engineering Health & Delivery Governance Platform with a branded logo, a login page with role-based authentication, and a Super Admin Panel providing comprehensive data management and analytics capabilities. The feature introduces a new Super_Admin role with elevated permissions and a dedicated administrative interface for managing teams, entries, and platform-wide analytics.

## Glossary

- **Platform**: The Engineering Health & Delivery Governance web application comprising a React 18/TypeScript client and Express/TypeScript backend with SQLite storage.
- **Login_Page**: The initial landing page that authenticates users via mock JWT tokens with role selection before granting access to the application.
- **Auth_System**: The JWT-based authentication subsystem responsible for token generation, validation, storage, and session management.
- **RBAC_Middleware**: The Express middleware that verifies JWT tokens and enforces role-based access control on API routes.
- **Super_Admin**: A new user role with all existing permissions (Admin, Engineering_Manager, Delivery_Manager, Leadership) plus exclusive access to the Admin Panel and /api/admin/* routes.
- **Admin_Panel**: A dedicated section of the application accessible only to Super_Admin users, providing analytics dashboards, team browsing, entry management, and CRUD operations.
- **App_Header**: The top navigation bar component containing the logo, navigation links, and user badge.
- **Sidebar_Navigation**: A vertical navigation component within the Admin Panel providing access to Dashboard, Teams, Entries, and Settings sections.
- **Inline_Editing**: A table interaction pattern where row data becomes editable in-place with save and cancel controls, without navigating to a separate form.
- **Sprint_Data_Entry**: A single row of sprint delivery data stored in the sprint_data table, representing a work item tracked by Jira ID and team.

## Requirements

### Requirement 1: Logo Replacement

**User Story:** As a platform user, I want to see the platform logo in the application header, so that the platform reflects the correct branding.

#### Acceptance Criteria

1. THE App_Header SHALL display the `logo.svg` image from `client/src/logo.svg` in place of the existing letter-based placeholder.
2. THE App_Header SHALL render the logo at a size that fits within the 64px header height without distortion.
3. THE App_Header SHALL include an accessible alt attribute with the text "Engineering Health Platform" on the logo image element.

### Requirement 2: Login Page as Default Landing

**User Story:** As a platform user, I want to authenticate via a login page before accessing any application content, so that access is controlled and role-appropriate.

#### Acceptance Criteria

1. WHEN an unauthenticated user navigates to any route, THE Platform SHALL redirect the user to the Login_Page.
2. THE Login_Page SHALL display a dropdown selector populated with all available mock users retrieved from the `/api/auth/mock-users` endpoint.
3. WHEN a user selects a mock user from the dropdown and submits the login form, THE Auth_System SHALL store the selected user's JWT token in localStorage under the key `auth_token`.
4. WHEN a user selects a mock user from the dropdown and submits the login form, THE Auth_System SHALL store the selected user's profile data (userId, username, role) in localStorage under the key `auth_user`.
5. WHEN a successful login occurs, THE Platform SHALL redirect the user to the Dashboard page regardless of role.
6. WHEN an authenticated user is present (valid token in localStorage), THE Platform SHALL grant access to authorized routes without requiring re-authentication.
7. THE Login_Page SHALL display the platform logo and platform name for brand consistency.
8. WHEN the user activates a logout action, THE Auth_System SHALL remove the token and user data from localStorage and redirect to the Login_Page.

### Requirement 3: Super_Admin Role and Permissions

**User Story:** As a system administrator, I want a Super_Admin role with full platform access including a dedicated admin panel, so that I can manage all data and monitor platform-wide analytics.

#### Acceptance Criteria

1. THE Auth_System SHALL recognize "Super_Admin" as a valid user role in addition to the existing roles (Admin, Engineering_Manager, Delivery_Manager, Leadership).
2. THE RBAC_Middleware SHALL grant Super_Admin access to all existing protected routes (/api/upload, /api/dashboard/*, /api/config/*, /api/reports/*, /api/filters/*).
3. THE RBAC_Middleware SHALL grant Super_Admin exclusive access to routes matching the pattern /api/admin/*.
4. IF a non-Super_Admin user attempts to access /api/admin/* routes, THEN THE RBAC_Middleware SHALL return a 403 Forbidden response.
5. THE Auth_System SHALL include a Super_Admin mock user in the seed data and mock-users endpoint response.
6. THE Platform SHALL store the Super_Admin role in the users database table by updating the role CHECK constraint to include "Super_Admin".

### Requirement 4: Admin Panel Navigation Access

**User Story:** As a Super_Admin user, I want to access the Admin Panel via a navigation link visible only to my role, so that the administrative interface is accessible without cluttering the UI for other roles.

#### Acceptance Criteria

1. WHILE a Super_Admin user is authenticated, THE App_Header SHALL display an "Admin Panel" navigation link.
2. WHILE a non-Super_Admin user is authenticated, THE App_Header SHALL NOT display the "Admin Panel" navigation link.
3. WHEN a Super_Admin user activates the "Admin Panel" navigation link, THE Platform SHALL navigate to the Admin Panel at the route `/admin`.
4. IF a non-Super_Admin user navigates directly to the `/admin` route, THEN THE Platform SHALL redirect the user to the Dashboard page.

### Requirement 5: Admin Panel Overview Dashboard

**User Story:** As a Super_Admin user, I want to see an overview dashboard with platform-wide analytics, so that I can quickly assess the state of all teams and data.

#### Acceptance Criteria

1. THE Admin_Panel dashboard section SHALL display the total number of distinct teams from the sprint_data table.
2. THE Admin_Panel dashboard section SHALL display the total number of sprint data entries across all teams.
3. THE Admin_Panel dashboard section SHALL display the count of uploads within the last 7 days.
4. THE Admin_Panel dashboard section SHALL display the count of sprint data entries with a null or empty development_status field as "pending items".
5. THE Admin_Panel SHALL retrieve dashboard analytics data from a dedicated `/api/admin/analytics` endpoint.
6. WHEN the analytics data is loading, THE Admin_Panel dashboard section SHALL display loading indicators in place of metric values.

### Requirement 6: Admin Panel Teams Browsing

**User Story:** As a Super_Admin user, I want to browse all teams with search and filter capabilities, so that I can quickly find and review specific team data.

#### Acceptance Criteria

1. THE Admin_Panel teams section SHALL display a list of all distinct teams present in the sprint_data table.
2. THE Admin_Panel teams section SHALL provide a text search input that filters the team list by team name using case-insensitive partial matching.
3. THE Admin_Panel teams section SHALL provide a filter control to narrow teams by portfolio.
4. WHEN a user selects a team from the list, THE Admin_Panel SHALL navigate to a team detail view displaying all sprint data entries associated with that team.
5. THE Admin_Panel team detail view SHALL display summary metrics for the selected team including total entries count and distinct project count.
6. THE Admin_Panel SHALL retrieve team list data from a `/api/admin/teams` endpoint.
7. THE Admin_Panel SHALL retrieve team detail data from a `/api/admin/teams/:teamName` endpoint.

### Requirement 7: Admin Panel Inline CRUD Operations

**User Story:** As a Super_Admin user, I want to edit, delete, and create sprint data entries directly within the admin panel tables, so that I can manage data efficiently without navigating to separate forms.

#### Acceptance Criteria

1. WHEN a Super_Admin user activates the edit action on a table row, THE Admin_Panel SHALL convert that row's cells to editable input fields with the current values pre-filled.
2. WHILE a row is in edit mode, THE Admin_Panel SHALL display "Save" and "Cancel" action controls for that row.
3. WHEN a user activates the "Save" control on an edited row, THE Admin_Panel SHALL send a PUT request to `/api/admin/entries/:id` with the updated field values.
4. WHEN a user activates the "Cancel" control on an edited row, THE Admin_Panel SHALL revert the row to its original display state without making any API request.
5. WHEN a user activates the delete action on a table row, THE Admin_Panel SHALL display a modal confirmation dialog requesting explicit user confirmation before proceeding.
6. WHEN a user confirms deletion in the modal, THE Admin_Panel SHALL send a DELETE request to `/api/admin/entries/:id` and remove the row from the displayed table upon success.
7. WHEN a user dismisses the deletion confirmation modal, THE Admin_Panel SHALL take no destructive action and close the modal.
8. THE Admin_Panel entries section SHALL provide an "Add Entry" control that opens a form for creating a new sprint data entry.
9. WHEN a user submits the add entry form with valid data, THE Admin_Panel SHALL send a POST request to `/api/admin/entries` and append the new entry to the displayed table upon success.
10. WHEN a CRUD operation completes successfully, THE Admin_Panel SHALL reflect the change immediately in the current view without requiring a full page reload.
11. IF a CRUD API request fails, THEN THE Admin_Panel SHALL display an error message indicating the failure reason and preserve the data in its pre-operation state.

### Requirement 8: Admin Panel Sidebar Navigation

**User Story:** As a Super_Admin user, I want a sidebar navigation within the admin panel, so that I can move between admin sections (Dashboard, Teams, Entries, Settings) efficiently.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a persistent sidebar navigation containing links to Dashboard, Teams, Entries, and Settings sections.
2. THE Sidebar_Navigation SHALL visually indicate the currently active section.
3. THE Sidebar_Navigation SHALL remain visible and accessible while the user navigates between admin sections.
4. THE Admin_Panel SHALL use a responsive layout where the sidebar collapses on viewport widths below 768px.
5. THE Admin_Panel entries section SHALL display a paginated table of all sprint data entries with sortable columns.
6. THE Admin_Panel settings section SHALL provide a placeholder interface for future configuration options.

### Requirement 9: Admin Panel API Endpoints

**User Story:** As a developer, I want dedicated admin API endpoints for the admin panel data operations, so that admin functionality is cleanly separated from existing routes.

#### Acceptance Criteria

1. THE Platform SHALL expose a GET `/api/admin/analytics` endpoint returning total teams count, total entries count, recent uploads count (last 7 days), and pending items count.
2. THE Platform SHALL expose a GET `/api/admin/teams` endpoint returning a list of distinct teams with their portfolio and entry count.
3. THE Platform SHALL expose a GET `/api/admin/teams/:teamName` endpoint returning team details with associated sprint data entries.
4. THE Platform SHALL expose a GET `/api/admin/entries` endpoint returning paginated sprint data entries with support for sort, limit, and offset query parameters.
5. THE Platform SHALL expose a POST `/api/admin/entries` endpoint that creates a new sprint data entry and returns the created record.
6. THE Platform SHALL expose a PUT `/api/admin/entries/:id` endpoint that updates an existing sprint data entry by ID and returns the updated record.
7. THE Platform SHALL expose a DELETE `/api/admin/entries/:id` endpoint that removes a sprint data entry by ID and returns a success confirmation.
8. IF a PUT or DELETE request targets a non-existent entry ID, THEN THE Platform SHALL return a 404 Not Found response.
9. IF a POST or PUT request contains invalid or missing required fields, THEN THE Platform SHALL return a 400 Bad Request response with field-level error details.

### Requirement 10: Responsive Modern UI

**User Story:** As a Super_Admin user, I want the admin panel to have a modern and responsive design, so that I can effectively manage data on various screen sizes.

#### Acceptance Criteria

1. THE Admin_Panel SHALL use the existing platform brand theme (colors, typography, spacing) defined in the platform theme configuration.
2. THE Admin_Panel layout SHALL adapt to viewport widths, maintaining usability from 768px to 1920px screen widths.
3. THE Admin_Panel cards and data tables SHALL use consistent border-radius, shadow, and spacing values from the platform theme.
4. THE Admin_Panel SHALL display the authenticated user's role and username in the sidebar or header area.
