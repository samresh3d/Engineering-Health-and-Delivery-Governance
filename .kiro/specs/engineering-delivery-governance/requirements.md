# Requirements Document

## Introduction

The Engineering Delivery Governance feature provides a comprehensive delivery tracking and governance layer for the Engineering Health platform. It implements a **Function → Team → Story** organizational hierarchy where Functions represent major business verticals (E-Com, MPro, Dolphin, IVC, and admin-configurable additions), Teams represent delivery squads within a Function, and Stories (Delivery Items) represent individual work units tracked through their lifecycle. Engineering Managers are each assigned to exactly one Function and can view/manage teams within it. The feature includes an admin-configurable Excel upload template for bulk data ingestion, a Leadership Dashboard with progressive drill-down (Organization → Function → Team → Story), client-side period switching, role-based access control, and health score computation.

## Glossary

- **Platform**: The Engineering Health & Delivery Governance web application comprising a React/TypeScript client and Express/TypeScript server with SQLite persistence
- **Function**: A top-level organizational grouping representing a major business vertical (e.g., E-Com, MPro, Dolphin, IVC). Functions are admin-configurable and can be added, edited, or removed without code changes
- **Team**: A delivery squad operating within a Function (e.g., Retail, Claims, Customer Journey, Digital Sales). Teams are admin-configurable
- **Story**: A single delivery item or work unit tracked through its lifecycle from walkthrough to production go-live. Also referred to as "Delivery Item"
- **Leadership_Dashboard**: The executive-level single-page view that displays organization-wide KPIs, Function Cards, and supports progressive drill-down into Function, Team, and Story metrics
- **EM_Dashboard**: The Engineering Manager-scoped dashboard showing Function-level metrics with team and story management capabilities
- **Function_Card**: A visual summary component on the Leadership Dashboard representing one Function, displaying aggregated health score and key metrics with a drill-down affordance
- **Team_Card**: A visual summary component within a Function drill-down representing one Team, displaying aggregated health score and key metrics
- **Drill_Down_View**: The progressive reveal interface that expands in-page to show detailed metrics when a Function Card or Team is selected
- **Period_Switcher**: The client-side UI control allowing users to toggle between Month, Quarter, and Year time views using pre-fetched data
- **Authorization_Service**: The server-side module that enforces data-level access permissions based on user role and Function assignment
- **KPI_Engine**: The server-side calculation module that computes performance indicators from ingested delivery data
- **Health_Score**: A composite metric aggregating RAG statuses across all KPIs for a given Function, Team, or Story
- **RAG_Indicator**: A Red/Amber/Green status classification applied to metrics based on configurable thresholds
- **Function_Service**: The server-side module responsible for CRUD operations on Functions and Teams
- **Upload_Service**: The server-side module responsible for parsing and validating Excel template uploads
- **Super_Admin**: Role with unrestricted platform access including Function/Team configuration, Engineering Manager assignment, story management for any Function, user password resets, organization dashboard viewing, and reporting period configuration
- **Leadership**: Role with read-only cross-Function access for viewing all Functions, comparing metrics, viewing trends, and drilling down from Organization to Function to Team to Story
- **Engineering_Manager**: Role assigned to exactly one Function with permissions to view and manage teams and stories within that Function, upload delivery data, update health metrics, and view historical reports
- **Excel_Template**: The standardized spreadsheet format used for bulk upload of delivery tracking data, with fields dynamically reflecting configured Functions and Teams
- **Delivery_Item**: Synonym for Story; a tracked work unit with lifecycle dates, effort metrics, and status indicators

## Requirements

### Requirement 1: Function and Team Hierarchy

**User Story:** As a platform administrator, I want to configure Functions and Teams as the primary organizational hierarchy, so that delivery tracking aligns with the business vertical and squad structure.

#### Acceptance Criteria

1. THE Platform SHALL implement a three-level organizational hierarchy: Organization → Function → Team → Story, where Functions represent business verticals, Teams represent delivery squads within a Function, and Stories represent individual delivery items.
2. THE Platform SHALL store Function names, Team names, and Function-to-Team relationships in the database with no hard-coded Function or Team identifiers in application code.
3. WHEN a Super_Admin creates a new Function through the Admin interface, THE Platform SHALL make the new Function immediately available in dashboards, Excel template dropdowns, and filter options without requiring a code deployment.
4. WHEN a Super_Admin creates a new Team within a Function, THE Platform SHALL make the new Team immediately available in dashboards, Excel template fields, and filter options without requiring a code deployment.
5. THE Platform SHALL support a variable number of Teams per Function, with no fixed upper limit enforced by the application.
6. THE Platform SHALL support a variable number of Functions, with no fixed upper limit enforced by the application.
7. WHEN a Super_Admin removes a Function, THE Platform SHALL prevent removal if any Teams or Stories are currently associated with that Function, returning an error message indicating reassignment is required.
8. WHEN a Super_Admin removes a Team, THE Platform SHALL prevent removal if any Stories are currently associated with that Team, returning an error message indicating reassignment is required.

### Requirement 2: Engineering Manager Function Assignment

**User Story:** As a Super Admin, I want to assign each Engineering Manager to exactly one Function, so that their access and data uploads are automatically scoped to the correct business vertical.

#### Acceptance Criteria

1. THE Platform SHALL enforce that each Engineering Manager user is assigned to exactly one Function at any given time.
2. WHEN a Super_Admin assigns an Engineering Manager to a Function, THE Platform SHALL update the user's function assignment and immediately scope all subsequent requests from that Engineering Manager to the assigned Function.
3. WHEN an Engineering Manager logs in, THE Platform SHALL resolve the assigned Function and use the Function identifier to scope all dashboard views, data uploads, and management operations.
4. IF an Engineering Manager has no Function assigned, THEN THE Platform SHALL display an informational message indicating that a Super Admin must assign a Function before the Engineering Manager can access platform features.
5. WHEN an Engineering Manager uploads delivery data, THE Platform SHALL auto-populate the Function field based on the logged-in Engineering Manager's assigned Function, making the Function field read-only for Engineering Managers.

### Requirement 3: Excel Template Structure

**User Story:** As an Engineering Manager, I want a standardized Excel template with all delivery tracking fields, so that I can bulk-upload my team's delivery data consistently.

#### Acceptance Criteria

1. THE Upload_Service SHALL accept Excel files containing the following columns in order: S.No (Number), Function (Dropdown), Team (Text), Item/Story Name (Text), Walkthrough Given to Development Team (Date), JIRA ID (Text), Dev Start Date (Date), Dev Complete Date (Date), With AI Story Points (Number), UAT Delivery Date (Date), UAT Delivery Target (Date), Resources (Text), Go Live Planned Date (Date), Go Live Date (Date), Production Status (Dropdown), Rollback (Yes/No), Rollback Reason (Text), AI Used (Yes/No), Estimated Effort Without AI Hours (Number), Actual Effort (Number), Actual Effort With AI Hours (Number), Story Status (Dropdown), Story Drop Reason (Text), Definition of Ready DOR (Yes/No), Definition of Done DOD (Yes/No), Refinement Closure Date (Date), UAT Start Date (Date), UAT Complete Date (Date), Delay Reason (Dropdown), and Delay Reason Description (Multi-line Text).
2. WHEN an Engineering Manager uploads an Excel file, THE Upload_Service SHALL validate that the Function column value matches the logged-in Engineering Manager's assigned Function for every row in the file.
3. IF any row in the uploaded file contains a Function value that does not match the Engineering Manager's assigned Function, THEN THE Upload_Service SHALL reject the entire file and return an error specifying the mismatched rows.
4. WHEN a Super_Admin uploads an Excel file, THE Upload_Service SHALL accept any valid Function value present in the configured Functions list without restriction.
5. THE Upload_Service SHALL validate that all Date fields conform to a recognized date format (DD/MM/YYYY or YYYY-MM-DD) and reject rows with unparseable dates, reporting the specific row and column.
6. THE Upload_Service SHALL validate that all Number fields contain numeric values and reject rows with non-numeric entries, reporting the specific row and column.
7. THE Upload_Service SHALL validate that Yes/No fields contain only "Yes", "No", "Y", or "N" values (case-insensitive) and reject rows with other values.
8. THE Upload_Service SHALL validate that Dropdown fields (Function, Production Status, Story Status, Delay Reason) contain only values from their respective configured option lists.
9. WHEN the Excel template is downloaded, THE Platform SHALL generate the Function dropdown options dynamically from the currently configured Functions list.
10. WHEN the Excel template is downloaded, THE Platform SHALL include all configured dropdown option values for Production Status, Story Status, and Delay Reason fields based on current admin configuration.

### Requirement 4: Leadership Dashboard with Executive KPIs

**User Story:** As a Leadership user, I want an executive dashboard showing organization-wide health at a glance with key KPIs, so that I can quickly assess engineering delivery performance across all Functions.

#### Acceptance Criteria

1. WHEN a user with the Leadership or Super_Admin role navigates to the Dashboard, THE Leadership_Dashboard SHALL display the following executive KPI tiles: Health Score, Sprint Predictability, Delivery Efficiency, Velocity Trend, Escaped Defects, Team Capacity, Story Completion percentage, Planned vs Delivered ratio, Risks count, and Blockers count.
2. THE Leadership_Dashboard SHALL display each executive KPI tile with the current value, a RAG_Indicator color code, and a trend arrow indicating improvement or decline compared to the previous period.
3. WHEN the Leadership_Dashboard loads, THE Platform SHALL pre-fetch metric data for all available time periods (Month, Quarter, Year) in a single API response to enable instant client-side period switching.
4. THE Leadership_Dashboard SHALL display a grid of Function_Card components, one per Function registered in the platform, ordered alphabetically by Function name.
5. WHEN fewer than 2 data periods exist for a given KPI, THE Leadership_Dashboard SHALL display the KPI tile with a "Limited Data" indicator and omit the trend arrow.
6. THE Leadership_Dashboard SHALL render within 3 seconds of navigation including the pre-fetch of all period data.

### Requirement 5: Progressive Drill-Down Navigation

**User Story:** As a Leadership user, I want to drill down from the organization overview into specific Functions, Teams, and Stories on the same page, so that I can investigate metrics without navigating away and losing context.

#### Acceptance Criteria

1. WHEN a user clicks on a Function_Card, THE Leadership_Dashboard SHALL expand an in-page detail section below the selected Function_Card showing Function-level metrics with a breakdown by Team.
2. WHEN the Function detail section is expanded, THE Drill_Down_View SHALL display a list of Teams within that Function, each showing team-level aggregated KPI values and RAG_Indicator status as Team_Cards.
3. WHEN a user clicks on a Team_Card within the Function detail section, THE Drill_Down_View SHALL expand a Team metrics panel showing individual Story metrics, KPI breakdowns, and historical trends for that Team.
4. WHEN a user clicks on an already-expanded Function_Card, THE Leadership_Dashboard SHALL collapse the detail section, returning to the organization overview state.
5. THE Drill_Down_View SHALL preserve the selected time period from the Period_Switcher when transitioning between drill-down levels.
6. WHEN a drill-down section is expanded, THE Leadership_Dashboard SHALL visually highlight the selected Function_Card or Team_Card to indicate the active selection.
7. THE Drill_Down_View SHALL support keyboard navigation, allowing users to expand and collapse sections using Enter or Space keys on focused Function_Card or Team_Card elements.

### Requirement 6: Function Cards

**User Story:** As a Leadership user, I want each Function represented as a summary card showing key health indicators, so that I can quickly compare Functions and identify those needing attention.

#### Acceptance Criteria

1. THE Function_Card SHALL display the Function name, the composite Health_Score value, the Health_Score RAG_Indicator, the number of active Teams, and the total number of active Stories across all Teams in that Function.
2. THE Function_Card SHALL display a mini sparkline chart showing the Health_Score trend over the last 3 periods relative to the currently selected time period.
3. WHEN the Health_Score RAG_Indicator is Red, THE Function_Card SHALL apply a visual accent (colored left border) using the Red color (#DC3545) to draw attention.
4. WHEN the Health_Score RAG_Indicator is Amber, THE Function_Card SHALL apply a visual accent (colored left border) using the Amber color (#FFC107).
5. WHEN the Health_Score RAG_Indicator is Green, THE Function_Card SHALL apply a visual accent (colored left border) using the Green color (#28A745).
6. THE Function_Card SHALL display a clickable drill-down affordance (chevron icon or expand button) indicating that additional detail is available.

### Requirement 7: Engineering Manager Dashboard

**User Story:** As an Engineering Manager, I want a Function-scoped dashboard showing my Function's delivery metrics with team breakdowns, so that I can monitor and manage my teams' performance.

#### Acceptance Criteria

1. WHEN a user with the Engineering_Manager role navigates to the Dashboard, THE EM_Dashboard SHALL display KPI metrics scoped exclusively to the Function assigned to that Engineering Manager.
2. THE EM_Dashboard SHALL display a Team breakdown section showing each Team within the Engineering Manager's assigned Function with per-Team KPI summaries and RAG_Indicator status.
3. THE EM_Dashboard SHALL display a "Manage Teams" action button that opens the Team management interface for the Engineering Manager's assigned Function.
4. WHEN the EM_Dashboard loads, THE Platform SHALL pre-fetch metric data for all available time periods (Month, Quarter, Year) to enable instant client-side period switching.
5. THE EM_Dashboard SHALL display a list of Stories grouped by Team, showing story-level metrics including Dev Start Date, Dev Complete Date, UAT status, Go Live status, and current Story Status.
6. IF the Engineering Manager's assigned Function has zero Teams configured, THEN THE EM_Dashboard SHALL display an onboarding prompt suggesting the user create Teams and add delivery items.

### Requirement 8: Time-Based Period Switching

**User Story:** As a dashboard user, I want to switch between Month, Quarter, and Year views instantly without page reloads, so that I can analyze trends across different time horizons efficiently.

#### Acceptance Criteria

1. THE Period_Switcher SHALL display three selectable options: Month, Quarter, and Year, with the current selection visually highlighted.
2. WHEN the Period_Switcher is used, THE Platform SHALL filter the displayed dashboard metrics client-side from the pre-fetched dataset without making additional API requests.
3. WHEN the Dashboard initially loads, THE Platform API SHALL return metric data aggregated by all three period types (Month, Quarter, Year) in a single response payload.
4. WHEN the user selects a different period, THE Leadership_Dashboard and EM_Dashboard SHALL update all displayed KPI values, RAG indicators, trend charts, and Function_Card or Team_Card sparklines to reflect the selected time period within 200 milliseconds.
5. THE Period_Switcher SHALL default to the Quarter view on initial page load.
6. WHEN the user switches periods, THE Period_Switcher SHALL preserve any active drill-down state and re-render the expanded sections with data for the newly selected period.

### Requirement 9: Role-Based Access Control

**User Story:** As a platform administrator, I want strict role-based access enforcement so that Leadership users have read-only cross-Function visibility, Engineering Managers are isolated to their assigned Function, and Super Admins have unrestricted access.

#### Acceptance Criteria

1. WHILE the Super_Admin role is active, THE Authorization_Service SHALL permit access to all platform features including Function/Team configuration, Engineering Manager assignment, story management for any Function, user password resets, organization dashboard viewing, and reporting period configuration.
2. WHILE the Leadership role is active, THE Authorization_Service SHALL permit read-only access to all Functions' data, cross-Function metric comparison, trend viewing, and drill-down navigation from Organization to Function to Team to Story.
3. WHILE the Leadership role is active, THE Authorization_Service SHALL deny any write operations including data uploads, team management, story updates, and configuration changes, returning a 403 Forbidden response.
4. WHILE the Engineering_Manager role is active, THE Authorization_Service SHALL permit access exclusively to data belonging to the Function assigned to that Engineering Manager, denying access to other Functions' data with a 403 Forbidden response.
5. WHILE the Engineering_Manager role is active, THE Authorization_Service SHALL permit team management, story uploads, delivery data updates, and historical report viewing scoped to the assigned Function only.
6. WHEN a Super_Admin reassigns an Engineering Manager to a different Function, THE Platform SHALL update the user's Function assignment and immediately scope all subsequent requests from that user to the newly assigned Function.
7. THE Authorization_Service SHALL enforce Function isolation at the API layer, ensuring that query parameters or request bodies referencing Functions outside the Engineering Manager's assigned Function are rejected before database queries execute.

### Requirement 10: Health Score Computation

**User Story:** As a Leadership user, I want a composite Health Score per Function and Team, so that I can assess overall delivery health with a single metric.

#### Acceptance Criteria

1. THE KPI_Engine SHALL compute the Health_Score as a weighted average of all applicable KPI RAG statuses, where Green equals 100, Amber equals 50, and Red equals 0, producing a value between 0 and 100.
2. WHEN the Health_Score value is 80 or above, THE KPI_Engine SHALL classify the Health_Score RAG_Indicator as Green.
3. WHEN the Health_Score value is between 50 and 79 inclusive, THE KPI_Engine SHALL classify the Health_Score RAG_Indicator as Amber.
4. WHEN the Health_Score value is below 50, THE KPI_Engine SHALL classify the Health_Score RAG_Indicator as Red.
5. THE KPI_Engine SHALL compute Health_Score at Function level (aggregating all Teams within the Function) and Team level (aggregating all Stories within the Team).
6. IF a Function or Team has no KPI data for the selected period, THEN THE KPI_Engine SHALL return a null Health_Score and indicate that insufficient data is available.

### Requirement 11: Function and Team Management (Admin)

**User Story:** As a Super Admin, I want to create, edit, and remove Functions and Teams through the admin interface, so that the platform adapts to organizational changes without code modifications.

#### Acceptance Criteria

1. WHEN a Super_Admin invokes the create Function action, THE Function_Service SHALL create a new Function entry requiring a non-empty name with a maximum length of 100 characters.
2. WHEN a Super_Admin invokes the rename Function action with a valid new name, THE Function_Service SHALL update the Function name and propagate the name change to all associated Team references and historical data.
3. WHEN a Super_Admin invokes the create Team action within a Function, THE Function_Service SHALL create a new Team entry associated with the specified Function, requiring a non-empty Team name with a maximum length of 100 characters.
4. WHEN a Super_Admin invokes the rename Team action with a valid new name, THE Function_Service SHALL update the Team name and propagate the name change to all associated Story references and historical data.
5. WHEN a Function is created or renamed, THE Function_Service SHALL validate that no other Function has the same name (case-insensitive).
6. WHEN a Team is created or renamed within a Function, THE Function_Service SHALL validate that no other Team within the same Function has the same name (case-insensitive).
7. THE Function_Service SHALL log all Function and Team CRUD operations to the audit log with the performing user, action type, entity type (Function or Team), entity name, and timestamp.
8. WHEN a new Function or Team is created, THE Platform SHALL immediately reflect the addition in the Excel template dropdown options and dashboard views without requiring application restart or redeployment.

### Requirement 12: Story Lifecycle Tracking

**User Story:** As an Engineering Manager, I want to track each delivery item through its full lifecycle from walkthrough to production, so that I can monitor progress and identify bottlenecks.

#### Acceptance Criteria

1. THE Platform SHALL track each Story with the following lifecycle dates: Walkthrough Given to Development Team, Dev Start Date, Dev Complete Date, UAT Start Date, UAT Complete Date, UAT Delivery Date, UAT Delivery Target, Refinement Closure Date, Go Live Planned Date, and Go Live Date.
2. THE Platform SHALL track each Story with the following effort metrics: With AI Story Points, Estimated Effort Without AI Hours, Actual Effort, and Actual Effort With AI Hours.
3. THE Platform SHALL track each Story with the following status indicators: Production Status, Story Status, Rollback (Yes/No), AI Used (Yes/No), Definition of Ready DOR (Yes/No), and Definition of Done DOD (Yes/No).
4. THE Platform SHALL track each Story with the following descriptive fields: Rollback Reason, Story Drop Reason, Delay Reason, and Delay Reason Description.
5. WHEN a Story has a Go Live Planned Date and a Go Live Date, THE KPI_Engine SHALL compute delivery variance as the difference between planned and actual go-live dates.
6. WHEN a Story has a UAT Delivery Target and a UAT Delivery Date, THE KPI_Engine SHALL compute UAT delivery variance as the difference between target and actual UAT delivery dates.

### Requirement 13: Auto-Population and Scoping Rules

**User Story:** As an Engineering Manager, I want Function and Team fields to be automatically populated based on my assignment, so that data uploads are consistent and correctly scoped without manual selection.

#### Acceptance Criteria

1. WHEN an Engineering Manager accesses the upload interface, THE Platform SHALL auto-populate the Function field with the Engineering Manager's assigned Function and render the Function field as read-only.
2. WHEN an Engineering Manager uploads data, THE Upload_Service SHALL set the Function value to the Engineering Manager's assigned Function for all rows, ignoring any Function value provided in the Excel file.
3. WHEN a Super_Admin accesses the upload interface, THE Platform SHALL present the Function field as an editable dropdown populated with all configured Functions.
4. THE Platform SHALL validate that the Team value in each uploaded row exists within the specified Function's configured Team list.
5. IF a row contains a Team value that is not configured within the specified Function, THEN THE Upload_Service SHALL reject that row and report the invalid Team value with row number.

### Requirement 14: Dashboard Dropdown Filters

**User Story:** As a Leadership user, I want dropdown filters on the dashboard to filter by Function and Team, so that I can focus on specific organizational segments.

#### Acceptance Criteria

1. THE Leadership_Dashboard SHALL display a Function filter dropdown populated dynamically with all configured Functions plus an "All Functions" option.
2. WHEN a user selects a specific Function from the filter, THE Leadership_Dashboard SHALL display only the Function_Card and drill-down data for the selected Function.
3. THE Leadership_Dashboard SHALL display a Team filter dropdown that is contextually populated based on the selected Function filter value.
4. WHEN a user selects a specific Team from the filter, THE Leadership_Dashboard SHALL display metrics and stories scoped to only the selected Team.
5. WHEN "All Functions" is selected, THE Leadership_Dashboard SHALL display all Function_Cards and aggregate KPI tiles across the entire organization.

### Requirement 15: UI/UX Standards

**User Story:** As a platform user, I want a modern, responsive, executive-style interface with clear visual indicators, so that I can interpret delivery health data quickly and accurately.

#### Acceptance Criteria

1. THE Platform SHALL render all dashboard views responsively, adapting Function_Card grid layouts from 3 columns on desktop (1200px and above) to 2 columns on tablet (768px to 1199px) to 1 column on mobile (below 768px).
2. THE Platform SHALL use color-coded RAG indicators consistently: Green (#28A745) for Healthy, Amber (#FFC107) for Attention Needed, and Red (#DC3545) for Critical across all KPI tiles, Function Cards, Team Cards, and Story rows.
3. THE Platform SHALL display interactive charts using the Recharts library for trend visualizations and sparklines within Function Cards and Team Cards.
4. THE Platform SHALL implement the drill-down progressive reveal using accordion or expandable panel patterns with smooth CSS transitions lasting between 200 and 400 milliseconds.
5. THE Platform SHALL ensure all interactive elements (Function Cards, Team Cards, Period Switcher buttons, drill-down triggers) are accessible with keyboard navigation and include appropriate ARIA attributes for screen readers.
6. THE Platform SHALL maintain the platform brand theme with Burgundy/Maroon as primary color, white backgrounds, light grey secondary areas, and dark grey text throughout all governance views.
