# Requirements Document

## Introduction

This feature consolidates the Dashboard as the single source of truth for all KPIs and analytics, removes the standalone Analytics page/route, introduces data-backed historical month selection, adds bulk delete capability for uploads, and provides a function-wise upload view on the History page — all governed by role-based visibility rules.

## Glossary

- **Platform**: The Engineering Health & Delivery Governance web application (React + Express + better-sqlite3)
- **Dashboard**: The main landing page that displays KPI tiles, trend charts, and team comparison data
- **History_Page**: The page displaying past upload records and sprint entries
- **Analytics_Page**: The current standalone analytics route (`/analytics`) to be removed
- **Month_Picker**: A UI control allowing users to select a month for filtering dashboard data
- **Upload_Record**: A row in the `uploads` table representing a single file upload event
- **Sprint_Data**: Rows in the `sprint_data` table representing individual sprint entries linked to an upload
- **Function**: An organizational grouping (ECOM, MPRO, Dolphin, IVC) to which Engineering Managers are assigned via `function_id`
- **Engineering_Manager**: A user with role `Engineering_Manager` assigned to a specific function
- **Leadership**: A user with role `Leadership` who has cross-function visibility
- **Super_Admin**: A user with role `Super_Admin` who has full system access
- **Delivery_Manager**: A user with role `Delivery_Manager`
- **KpiTrendChart**: An existing React component rendering KPI trends over time
- **TeamComparisonTable**: An existing React component rendering team-by-team KPI comparison
- **Bulk_Delete**: The action of selecting multiple upload records and deleting them along with associated sprint data
- **Function_View**: A new tab on the History page grouping uploads by function name

## Requirements

### Requirement 1: Remove Analytics Page

**User Story:** As a platform user, I want all analytics consolidated into the Dashboard, so that I have a single source of truth for KPI data without navigating to separate pages.

#### Acceptance Criteria

1.1 WHEN the Platform removes the Analytics_Page, THE Platform SHALL delete the `/analytics` route from the routing configuration.

1.2 WHEN the Platform removes the Analytics_Page, THE Platform SHALL remove all navigation links referencing the Analytics_Page from the header navigation for every role.

1.3 WHEN a user navigates to the `/analytics` URL directly, THE Platform SHALL redirect the user to the Dashboard route (`/`).

1.4 THE Platform SHALL integrate the KpiTrendChart component into the Dashboard for both Leadership and Engineering_Manager views.

1.5 THE Platform SHALL integrate the TeamComparisonTable component into the Leadership Dashboard view.

1.6 WHEN a user with role Engineering_Manager views the Dashboard, THE Platform SHALL display KPI trend charts scoped to the Engineering_Manager's assigned function.

1.7 WHEN a user with role Leadership or Super_Admin views the Dashboard, THE Platform SHALL display KPI trend charts and team comparison data across all functions.

### Requirement 2: Historical Month Selection (Data-Backed)

**User Story:** As a dashboard user, I want the month picker to only show months that have actual uploaded data, so that I avoid selecting empty time periods.

#### Acceptance Criteria

2.1 THE Month_Picker SHALL display only months for which at least one Upload_Record with associated Sprint_Data exists in the database.

2.2 WHEN no Upload_Record exists for a given month, THE Month_Picker SHALL omit that month from the selectable options.

2.3 THE Platform SHALL provide an API endpoint that returns the list of months containing uploaded data, scoped by the requesting user's role and function assignment.

2.4 WHEN a user with role Engineering_Manager requests available months, THE Platform SHALL return only months containing data for the Engineering_Manager's assigned function.

2.5 WHEN a user with role Leadership or Super_Admin requests available months, THE Platform SHALL return months containing data across all functions.

2.6 THE Platform SHALL render the data-backed Month_Picker on both the Engineering_Manager Dashboard and the Leadership Dashboard.

### Requirement 3: Bulk Select and Delete Uploads

**User Story:** As a user managing upload history, I want to select multiple uploads and delete them in one action, so that I can efficiently clean up outdated or erroneous data.

#### Acceptance Criteria

3.1 WHEN the History_Page displays the uploads tab, THE Platform SHALL render a checkbox next to each Upload_Record row.

3.2 WHEN at least one Upload_Record checkbox is selected, THE Platform SHALL display a "Delete Selected" action button.

3.3 WHEN no Upload_Record checkbox is selected, THE Platform SHALL disable or hide the "Delete Selected" action button.

3.4 WHEN the user activates the "Delete Selected" action, THE Platform SHALL display a confirmation dialog listing the count of selected uploads.

3.5 WHEN the user confirms the bulk delete action, THE Platform SHALL delete all selected Upload_Record entries from the `uploads` table.

3.6 WHEN the user confirms the bulk delete action, THE Platform SHALL cascade-delete all Sprint_Data rows associated with the deleted Upload_Record entries.

3.7 WHEN a user with role Engineering_Manager performs bulk delete, THE Platform SHALL restrict deletion to Upload_Record entries belonging to the Engineering_Manager's assigned function.

3.8 WHEN a user with role Super_Admin performs bulk delete, THE Platform SHALL allow deletion of any Upload_Record regardless of function assignment.

3.9 IF a user with role Engineering_Manager attempts to delete an Upload_Record not belonging to their function, THEN THE Platform SHALL reject the request and return an authorization error.

3.10 WHEN the bulk delete completes successfully, THE Platform SHALL refresh the uploads list and display a success notification with the count of deleted records.

3.11 IF the bulk delete operation fails, THEN THE Platform SHALL display an error message and retain the current selection state.

### Requirement 4: Function-Wise Upload View

**User Story:** As a Leadership or Admin user, I want to view uploads grouped by function, so that I can understand data submission patterns across organizational units.

#### Acceptance Criteria

4.1 THE History_Page SHALL provide a "By Function" tab in addition to the existing "Uploads" and "Sprint Entries" tabs.

4.2 WHEN the "By Function" tab is active, THE Platform SHALL display upload records grouped under their respective function headings (ECOM, MPRO, Dolphin, IVC).

4.3 WHEN the "By Function" tab is active, THE Platform SHALL display the Engineering_Manager name associated with each Upload_Record entry.

4.4 WHEN a user with role Leadership or Super_Admin views the "By Function" tab, THE Platform SHALL display uploads across all functions.

4.5 WHEN a user with role Engineering_Manager views the "By Function" tab, THE Platform SHALL display only uploads belonging to the Engineering_Manager's assigned function.

4.6 THE Platform SHALL provide an API endpoint that returns upload records grouped by function name, including the uploader's name for each record.

### Requirement 5: Role-Based Data Visibility

**User Story:** As a platform administrator, I want data visibility enforced consistently across all views, so that users only access data appropriate to their role and function assignment.

#### Acceptance Criteria

5.1 WHILE a user with role Engineering_Manager is authenticated, THE Platform SHALL restrict all data queries on the Dashboard to Sprint_Data belonging to the Engineering_Manager's assigned function.

5.2 WHILE a user with role Engineering_Manager is authenticated, THE Platform SHALL restrict all data queries on the History_Page to Upload_Record and Sprint_Data belonging to the Engineering_Manager's assigned function.

5.3 WHILE a user with role Leadership or Super_Admin is authenticated, THE Platform SHALL return data across all functions on the Dashboard.

5.4 WHILE a user with role Leadership or Super_Admin is authenticated, THE Platform SHALL return data across all functions on the History_Page.

5.5 WHILE a user with role Delivery_Manager is authenticated, THE Platform SHALL apply the same data visibility rules as Leadership for read-only access on the Dashboard.

5.6 THE Platform SHALL enforce role-based data scoping at the API layer, independent of client-side filtering.

5.7 IF a user sends an API request for data outside their authorized scope, THEN THE Platform SHALL return only data within the user's authorized scope without exposing unauthorized records.

### Requirement 6: Dashboard as Consolidated Analytics Hub

**User Story:** As a Leadership user, I want the Dashboard to contain all KPI scorecards, trends, and comparisons, so that I have a comprehensive view without navigating away.

#### Acceptance Criteria

6.1 THE Dashboard SHALL display KPI scorecard tiles showing current values and RAG status for all 9 defined KPIs.

6.2 THE Dashboard SHALL display KPI trend charts showing historical performance over the last 6 available data periods.

6.3 WHEN a user with role Leadership or Super_Admin views the Dashboard, THE Platform SHALL display the TeamComparisonTable component with cross-function team data.

6.4 THE Dashboard SHALL support filtering by function name for users with role Leadership or Super_Admin.

6.5 WHEN a filter is applied on the Dashboard, THE Platform SHALL update KPI tiles, trend charts, and comparison tables to reflect the filtered scope.

6.6 THE Dashboard SHALL retain the existing period switcher functionality for toggling between month, quarter, and year views.
