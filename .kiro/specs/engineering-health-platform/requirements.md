# Requirements Document

## Introduction

The Engineering Health & Delivery Governance Platform is an internal tool that enables engineering leadership to track delivery health across portfolios. In MVP (Phase 1), the platform supports Excel-based data ingestion, calculates 9 key performance indicators, and presents results on an executive dashboard with RAG status indicators. Access is governed by a stubbed RBAC system with four roles. The tech stack consists of a React/TypeScript frontend and a Node.js/Express/TypeScript backend with SQLite persistence.

## Glossary

- **Platform**: The Engineering Health & Delivery Governance Platform web application comprising a React client and Express server
- **Upload_Service**: The server-side module responsible for receiving, validating, and processing Excel file uploads
- **KPI_Engine**: The server-side calculation module that computes all nine key performance indicators from ingested data
- **Dashboard**: The React-based executive view displaying KPI tiles, RAG indicators, and trend charts
- **RBAC_Middleware**: The Express middleware layer that enforces role-based access control using stubbed JWT authentication
- **Data_Store**: The SQLite database accessed through the Repository Pattern for persisting upload data and computed KPIs
- **RAG_Indicator**: A Red/Amber/Green status classification applied to each KPI based on configurable thresholds
- **Sprint_Commitment**: KPI measuring percentage of sprint-committed stories completed (target > 90%)
- **Release_Success_Rate**: KPI measuring percentage of releases deployed without rollback (target > 98%)
- **Deployment_Frequency**: KPI measuring how often releases are deployed to production (target: increasing trend)
- **Capacity_Utilization**: KPI measuring team resource utilization against available capacity (target >= 90%)
- **AI_Efficiency**: KPI measuring effort savings from AI tooling (target: Brownfield 20-30%, Greenfield 50-70%)
- **UAT_Predictability**: KPI measuring on-time UAT delivery against target dates (target > 95%)
- **Dev_Cycle_Time**: KPI measuring average elapsed time from development start to completion (target: reducing trend)
- **Story_Drop_Rate**: KPI measuring percentage of stories dropped from a sprint (target < 5%)
- **Rollback_Rate**: KPI measuring percentage of production deployments that required rollback (target < 2%)
- **Portfolio**: A logical grouping of projects (IBPS-POS, IBPS-Dolphin, IBPS-Claims, mPro, E-Commerce, POSV/IVC)
- **Admin**: Role with permissions to manage users, configure KPIs, configure thresholds, and manage teams/projects
- **Engineering_Manager**: Role with permissions to view dashboards, upload Excel files, generate reports, and view team analytics
- **Delivery_Manager**: Role with permissions to track releases, monitor delivery health, and review governance metrics
- **Leadership**: Role with permissions to view executive dashboards, access portfolio reports, and review trends/risks

## Requirements

### Requirement 1: Excel File Upload

**User Story:** As an Engineering Manager, I want to upload sprint delivery data via Excel drag-and-drop, so that the platform can ingest team performance data without manual entry.

#### Acceptance Criteria

1. WHEN an authenticated user with the Engineering_Manager or Admin role drags and drops an Excel file onto the upload area, THE Upload_Service SHALL accept the file and begin processing within 2 seconds.
2. WHEN an Excel file is uploaded, THE Upload_Service SHALL validate that the file contains all required columns: Sno, TEAM, Track, Project, Status, Items List, Walkthrough Given On, JIRA ID, Estimated Effort Without AI (SP), Actual Effort With AI (Hrs), AI Used (Y/N), Dev Start Date, Dev End Date, Development Status, UAT Delivery Date, UAT Delivery Target, Resources, GO Live Planned Date, GO Live Date, Production Status, Rollback (Y/N), Rollback Reason, Story Drop Reason.
3. IF the uploaded file is missing required columns, THEN THE Upload_Service SHALL reject the file and return a validation error listing each missing column name.
4. IF the uploaded file contains rows with invalid data types or formats, THEN THE Upload_Service SHALL report data quality errors identifying the row number and field name for each violation, where valid formats are: Sno as a positive integer, TEAM/Track/Project/Status/Items List/Development Status/Production Status/Resources/Rollback Reason/Story Drop Reason as text strings with a maximum length of 500 characters, Walkthrough Given On/Dev Start Date/Dev End Date/UAT Delivery Date/UAT Delivery Target/GO Live Planned Date/GO Live Date as dates in DD-MM-YYYY or ISO 8601 format, JIRA ID as a non-empty string matching a project key pattern, Estimated Effort Without AI (SP) as a non-negative number between 0 and 999, Actual Effort With AI (Hrs) as a non-negative number between 0 and 9999, AI Used (Y/N) and Rollback (Y/N) as either Y or N, and the Upload_Service SHALL report a maximum of 100 errors per file.
5. WHEN validation succeeds, THE Upload_Service SHALL persist the parsed row data to the Data_Store and return a success confirmation with the count of rows ingested.
6. IF the uploaded file is not in .xlsx or .xls format, THEN THE Upload_Service SHALL reject the file and return an error indicating the supported file formats.
7. IF the uploaded file exceeds 10 MB in size, THEN THE Upload_Service SHALL reject the file before parsing and return an error indicating the maximum allowed file size of 10 MB.
8. IF the uploaded file contains the required columns but zero data rows, THEN THE Upload_Service SHALL reject the file and return an error indicating that the file contains no data to process.

### Requirement 2: Data Persistence

**User Story:** As a platform operator, I want uploaded data stored reliably in SQLite, so that KPI calculations can query historical records.

#### Acceptance Criteria

1. WHEN validated Excel data is received, THE Data_Store SHALL persist each row retaining all 22 source columns (Sno, TEAM, Track, Project, Status, Items List, Walkthrough Given On, JIRA ID, Estimated Effort Without AI (SP), Actual Effort With AI (Hrs), AI Used (Y/N), Dev Start Date, Dev End Date, Development Status, UAT Delivery Date, UAT Delivery Target, Resources, GO Live Planned Date, GO Live Date, Production Status, Rollback (Y/N), Rollback Reason, Story Drop Reason) along with the associated portfolio derived from the Track field using a configured Track-to-Portfolio mapping.
2. THE Data_Store SHALL expose data access through a Repository Pattern interface, separating query logic from business logic.
3. WHEN a record is persisted, THE Data_Store SHALL store a UTC timestamp with second-level precision indicating when the data was ingested.
4. THE Data_Store SHALL support querying records by team, portfolio, project, and date range, where date range filtering applies to the Dev Start Date field by default.
5. IF a batch persistence operation fails before all rows are written, THEN THE Data_Store SHALL roll back the entire transaction so that no partial data from that upload is committed.
6. IF an uploaded file contains rows with a JIRA ID that already exists in the Data_Store for the same team, THEN THE Data_Store SHALL update the existing record with the new values rather than creating a duplicate entry.
7. THE Data_Store SHALL enforce a maximum of 10,000 rows stored per single upload operation.

### Requirement 3: KPI Calculation Engine

**User Story:** As a Delivery Manager, I want all nine KPIs computed automatically from ingested data, so that I can assess delivery health without manual calculations.

#### Acceptance Criteria

1. WHEN new data is ingested, THE KPI_Engine SHALL calculate Sprint_Commitment as (count of items where Development Status equals "Complete" / count of total items in that sprint for that team) × 100, per team per sprint.
2. WHEN new data is ingested, THE KPI_Engine SHALL calculate Release_Success_Rate as (count of items with a non-empty GO Live Date where Rollback (Y/N) equals N / count of all items with a non-empty GO Live Date) × 100.
3. WHEN new data is ingested, THE KPI_Engine SHALL calculate Deployment_Frequency as the count of distinct GO Live Dates within the selected date range per team.
4. WHEN new data is ingested, THE KPI_Engine SHALL calculate Capacity_Utilization as (sum of Actual Effort With AI hours for all team items in the period / team capacity hours configured by Admin for that period) × 100.
5. WHEN new data is ingested, THE KPI_Engine SHALL calculate AI_Efficiency as ((Estimated Effort Without AI − Actual Effort With AI) / Estimated Effort Without AI) × 100 for items where AI Used equals Y, averaged across all qualifying items per team.
6. WHEN new data is ingested, THE KPI_Engine SHALL calculate UAT_Predictability as (count of items where UAT Delivery Date is on or before UAT Delivery Target / count of items with both UAT Delivery Date and UAT Delivery Target populated) × 100.
7. WHEN new data is ingested, THE KPI_Engine SHALL calculate Dev_Cycle_Time as the average number of calendar days between Dev Start Date and Dev End Date across all items with both dates populated, per team.
8. WHEN new data is ingested, THE KPI_Engine SHALL calculate Story_Drop_Rate as (count of items with a non-empty Story Drop Reason / count of total items in that sprint for that team) × 100.
9. WHEN new data is ingested, THE KPI_Engine SHALL calculate Rollback_Rate as (count of items where Rollback (Y/N) equals Y / count of all items with a non-empty GO Live Date) × 100.
10. WHEN a user applies a filter, THE KPI_Engine SHALL recalculate KPI values scoped to the selected combination of team, portfolio, project, and date range, applying all filters that are specified.
11. IF the denominator for any KPI calculation is zero, THEN THE KPI_Engine SHALL return a null value for that KPI and indicate that insufficient data is available for the calculation.
12. THE KPI_Engine SHALL round all percentage-based KPI values to two decimal places and Dev_Cycle_Time to one decimal place.
13. WHEN KPI values are calculated, THE KPI_Engine SHALL persist the computed results to the Data_Store with the associated team, portfolio, sprint, date range, and calculation timestamp.

### Requirement 4: RAG Status Classification

**User Story:** As a Leadership user, I want each KPI displayed with a RAG indicator, so that I can instantly identify areas requiring attention.

#### Acceptance Criteria

1. WHEN KPI values are calculated, THE KPI_Engine SHALL classify Sprint_Commitment as Green when above 90%, Amber when between 80% and 90% inclusive, and Red when below 80%.
2. WHEN KPI values are calculated, THE KPI_Engine SHALL classify Release_Success_Rate as Green when above 98%, Amber when between 95% and 98% inclusive, and Red when below 95%.
3. WHEN KPI values are calculated, THE KPI_Engine SHALL classify Deployment_Frequency as Green when the current period count exceeds the previous period count by more than 5%, Amber when the current period count is within 5% of the previous period count (inclusive), and Red when the current period count is more than 5% below the previous period count.
4. WHEN KPI values are calculated, THE KPI_Engine SHALL classify Capacity_Utilization as Green when at or above 90%, Amber when between 75% and 89% inclusive, and Red when below 75%.
5. WHEN KPI values are calculated, THE KPI_Engine SHALL classify AI_Efficiency as Green when within or above target range (Brownfield 20-30%, Greenfield 50-70%), Amber when within 5 percentage points below the lower bound of the target range, and Red when more than 5 percentage points below the lower bound of the target range.
6. WHEN KPI values are calculated, THE KPI_Engine SHALL classify UAT_Predictability as Green when above 95%, Amber when between 85% and 95% inclusive, and Red when below 85%.
7. WHEN KPI values are calculated, THE KPI_Engine SHALL classify Dev_Cycle_Time as Green when the current period average is more than 5% below the previous period average, Amber when the current period average is within 5% of the previous period average (inclusive), and Red when the current period average exceeds the previous period average by more than 5%.
8. WHEN KPI values are calculated, THE KPI_Engine SHALL classify Story_Drop_Rate as Green when below 5%, Amber when between 5% and 10% inclusive, and Red when above 10%.
9. WHEN KPI values are calculated, THE KPI_Engine SHALL classify Rollback_Rate as Green when below 2%, Amber when between 2% and 5% inclusive, and Red when above 5%.
10. IF fewer than 2 periods of data are available for a trend-based KPI (Deployment_Frequency or Dev_Cycle_Time), THEN THE KPI_Engine SHALL assign a classification of Amber and indicate that insufficient data exists for trend calculation.

### Requirement 5: Executive Dashboard

**User Story:** As a Leadership user, I want an executive dashboard displaying all KPIs at a glance, so that I can monitor engineering health across portfolios.

#### Acceptance Criteria

1. WHEN an authenticated user navigates to the Dashboard, THE Dashboard SHALL display a KPI tile for each of the nine KPIs showing the current value, RAG_Indicator, and the percentage change compared to the immediately preceding sprint period, within 3 seconds of navigation.
2. WHEN the Dashboard loads and no time range filter has been selected, THE Dashboard SHALL display trend charts for each KPI showing data points for the most recent 6 sprint periods using line or bar visualizations, with a minimum of 2 data points required to render a trend line.
3. WHEN a user selects a portfolio filter, THE Dashboard SHALL recalculate and display KPI values for the selected portfolio only within 2 seconds of selection.
4. WHEN a user selects a team filter, THE Dashboard SHALL recalculate and display KPI values for the selected team only within 2 seconds of selection.
5. WHEN both a portfolio filter and a team filter are selected, THE Dashboard SHALL display KPI values scoped to the selected team within the selected portfolio.
6. THE Dashboard SHALL display the six supported portfolios (IBPS-POS, IBPS-Dolphin, IBPS-Claims, mPro, E-Commerce, POSV/IVC) as available filter options.
7. IF no data exists for the selected filter combination, THEN THE Dashboard SHALL display the KPI tiles with a "No data available" indicator in place of values and omit trend chart rendering for those KPIs.
8. THE Dashboard SHALL render using the platform brand theme with Burgundy/Maroon as the primary color, White backgrounds, Light Grey secondary areas, and Dark Grey text.
9. THE Dashboard SHALL display RAG status using Green (#28A745) for Healthy, Amber (#FFC107) for Attention, and Red (#DC3545) for Critical indicators.
10. THE Dashboard SHALL use AG Grid for tabular data displays and Recharts for chart visualizations.

### Requirement 6: Role-Based Access Control

**User Story:** As an Admin, I want role-based route protection, so that users can only access features appropriate to their role.

#### Acceptance Criteria

1. THE RBAC_Middleware SHALL authenticate requests by verifying a stubbed JWT token present in the Authorization header, extracting the user role and a unique user identity claim from the token payload.
2. THE RBAC_Middleware SHALL support four roles: Admin, Engineering_Manager, Delivery_Manager, and Leadership.
3. IF a request has a missing, malformed, or unverifiable JWT token, THEN THE RBAC_Middleware SHALL return a 401 Unauthorized response with a JSON body containing an error message indicating the authentication failure reason.
4. IF an authenticated user attempts to access a route not included in their role's permitted route set, THEN THE RBAC_Middleware SHALL return a 403 Forbidden response with a JSON body containing an error message indicating insufficient permissions.
5. WHILE the Admin role is active, THE Platform SHALL permit access to user management, KPI configuration, threshold configuration, and team/project management routes.
6. WHILE the Engineering_Manager role is active, THE Platform SHALL permit access to dashboard viewing, Excel file upload, report generation, and team analytics routes.
7. WHILE the Delivery_Manager role is active, THE Platform SHALL permit access to release tracking, delivery health monitoring, and governance metrics routes.
8. WHILE the Leadership role is active, THE Platform SHALL permit access to executive dashboard, portfolio reports, and trend/risk review routes.
9. THE RBAC_Middleware SHALL provide at least one mock user account per role (minimum four accounts total), each containing a pre-generated valid JWT token with a unique user identifier and the assigned role claim, to enable development and testing without external authentication services.
10. WHEN a request carries a valid JWT token and the requested route is within the user's role permissions, THE RBAC_Middleware SHALL forward the request to the route handler with the decoded user identity and role available in the request context.

### Requirement 7: Project Structure and Architecture

**User Story:** As a developer, I want a well-structured codebase with clear separation of concerns, so that the platform is maintainable and extensible.

#### Acceptance Criteria

1. THE Platform SHALL organize source code into a /client directory for the React frontend and a /server directory for the Express backend, each with a separate package.json file.
2. THE Platform SHALL implement server-side business logic using a Service Layer pattern where service modules encapsulate KPI calculations and data transformation, and service modules SHALL NOT directly execute database queries.
3. THE Platform SHALL implement data access using a Repository Pattern where each entity has a dedicated repository module exposing CRUD methods that abstract SQLite queries behind a consistent interface.
4. THE Platform SHALL use Zod schemas for validating all incoming request payloads and uploaded Excel data structures.
5. THE Platform SHALL use TypeScript for both client and server codebases with strict type checking enabled via "strict": true in each tsconfig.json file.
6. WHEN the server starts, THE Data_Store SHALL initialize the SQLite database schema automatically using migration scripts, and IF a migration script fails, THEN THE server SHALL log the migration error and terminate the startup process with a non-zero exit code.
7. THE Platform SHALL support independent build execution for client and server, where running the build command in /client SHALL produce a deployable frontend bundle and running the build command in /server SHALL produce compiled JavaScript output, each without requiring the other to be built first.
