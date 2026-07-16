# Requirements Document

## Introduction

This document specifies requirements for revising the standard Excel upload template in the Engineering Health & Delivery Governance Platform to introduce a Function → Team → Story hierarchy. The current system uses a single "Project" field that conflates team, track, and project concepts. This feature separates the organizational structure into explicit Function and Team fields, ties Function assignment to the logged-in Engineering Manager, and adds new delivery tracking fields (DOR, DOD, Refinement Closure Date, UAT Start/Complete Date, Delay Reason). Functions and Teams are admin-configurable entities that propagate to the template and the rest of the application without code changes.

## Glossary

- **Platform**: The Engineering Health & Delivery Governance web application comprising a React/TypeScript client and Express/TypeScript backend with SQLite persistence.
- **Excel_Template**: The standard spreadsheet template defining the columns, dropdowns, and data types that Engineering Managers use to upload sprint delivery data.
- **Upload_Service**: The server-side module responsible for parsing, validating, and persisting uploaded Excel files into the sprint_data table.
- **Function**: The top-level organizational unit (e.g., E-Com, MPro, Dolphin, IVC) representing a business domain. Replaces the previous concept of "Track" as the highest grouping level.
- **Team**: A delivery squad, board, or workgroup operating within a single Function (e.g., Retail, Claims, Customer Journey, Digital Sales).
- **Story**: An individual delivery item or user story tracked within a Team, identified by a JIRA ID.
- **Function_Registry**: The admin-managed data store holding the list of valid Function names available for assignment and template population.
- **Team_Registry**: The admin-managed data store holding the list of valid Team names associated with their parent Function.
- **Engineering_Manager**: A user role assigned to exactly one Function, with upload and CRUD permissions scoped to that Function's Teams.
- **Super_Admin**: A user role with full administrative access including managing the Function_Registry, Team_Registry, and all data across Functions.
- **Template_Generator**: The server-side module responsible for producing a downloadable Excel template with pre-populated dropdowns and read-only fields based on user context and admin configuration.
- **Validation_Engine**: The Zod-based schema validation layer that checks each uploaded Excel row against the defined field rules before persistence.

## Requirements

### Requirement 1: Standard Excel Template Field Structure

**User Story:** As an Engineering Manager, I want a standardized Excel template with all required delivery tracking fields, so that I can consistently report sprint data in the expected format.

#### Acceptance Criteria

1. THE Excel_Template SHALL contain the following columns in order: S.No, Function, Team, Item / Story Name, Walkthrough Given to Development Team, JIRA ID, Dev Start Date, Dev Complete Date, With AI (Story Points), UAT Delivery Date, UAT Delivery Target, Resources, Go Live Planned Date, Go Live Date, Production Status, Rollback (Y/N), Rollback Reason, AI Used (Y/N), Estimated Effort Without AI (Hours), Actual Effort, Actual Effort With AI (Hours), Story Status, Story Drop Reason, Definition of Ready (DOR), Definition of Done (DOD), Refinement Closure Date, UAT Start Date, UAT Complete Date, Delay Reason, Delay Reason Description.
2. THE Excel_Template SHALL define the S.No column as a positive integer field with a maximum value of 99999.
3. THE Excel_Template SHALL define date columns (Walkthrough Given to Development Team, Dev Start Date, Dev Complete Date, UAT Delivery Date, UAT Delivery Target, Go Live Planned Date, Go Live Date, Refinement Closure Date, UAT Start Date, UAT Complete Date) as date-type fields accepting DD-MM-YYYY, ISO 8601, or Excel serial number formats.
4. THE Excel_Template SHALL define numeric columns (With AI Story Points, Estimated Effort Without AI Hours, Actual Effort, Actual Effort With AI Hours) as non-negative numeric fields with up to 2 decimal places and a maximum value of 99999.99.
5. THE Excel_Template SHALL define Rollback (Y/N), AI Used (Y/N), Definition of Ready (DOR), and Definition of Done (DOD) as fields accepting only the case-insensitive values "Y" or "N".
6. THE Excel_Template SHALL define Delay Reason Description as a multi-line text field with a maximum length of 2000 characters.
7. THE Excel_Template SHALL define Item / Story Name, Team, JIRA ID, Resources, Rollback Reason, Story Drop Reason as text fields with a maximum length of 500 characters.
8. THE Excel_Template SHALL define Function as a text field with a maximum length of 100 characters.

### Requirement 2: Function Field Configuration and Dropdown

**User Story:** As an Engineering Manager, I want the Function field in the Excel template to be a dropdown populated from admin-configured values, so that I select from a controlled list of valid Functions.

#### Acceptance Criteria

1. THE Template_Generator SHALL populate the Function column dropdown with all Function names present in the Function_Registry, sorted in alphabetical order.
2. WHEN the Super_Admin adds a new Function to the Function_Registry, THE Template_Generator SHALL include the new Function in the dropdown on the next template download without requiring code changes.
3. WHEN the Super_Admin removes a Function from the Function_Registry, THE Template_Generator SHALL exclude the removed Function from the dropdown on the next template download.
4. THE Function_Registry SHALL store each Function with a unique name that is between 1 and 100 characters in length, contains only alphanumeric characters, hyphens, spaces, and underscores, and is compared case-insensitively for uniqueness.
5. THE Platform SHALL seed the Function_Registry with the initial values: E-Com, MPro, Dolphin, IVC.
6. IF the Function_Registry contains no entries when an Engineering_Manager requests a template download, THEN THE Template_Generator SHALL generate the template with an empty Function dropdown and display a message indicating that no Functions are configured.

### Requirement 3: Function Auto-Population for Engineering Managers

**User Story:** As an Engineering Manager, I want my assigned Function to be automatically populated and locked in the template, so that I cannot accidentally upload data under an incorrect Function.

#### Acceptance Criteria

1. WHEN an Engineering_Manager requests a template download, THE Template_Generator SHALL pre-fill the Function column with the Engineering_Manager's assigned Function name in all data-entry rows (up to the maximum of 500 rows).
2. WHEN an Engineering_Manager requests a template download, THE Template_Generator SHALL set the Function column as read-only using cell protection so that the Engineering_Manager cannot modify the value.
3. WHEN an Engineering_Manager uploads an Excel file, THE Upload_Service SHALL verify that every row's Function value matches the Engineering_Manager's assigned Function exactly (case-sensitive string comparison).
4. IF an Engineering_Manager uploads a file containing one or more rows with a Function value that does not match the assigned Function, THEN THE Upload_Service SHALL reject the entire file without persisting any data and return a validation error specifying each mismatched row number and the invalid Function value found.
5. IF an Engineering_Manager uploads a file containing one or more rows where the Function cell is empty or blank, THEN THE Upload_Service SHALL reject the entire file without persisting any data and return a validation error specifying each affected row number.
6. IF an Engineering_Manager who has no Function assignment requests a template download, THEN THE Template_Generator SHALL refuse the request and return an error indicating that no Function is assigned to the user.

### Requirement 4: Team Field and Function-Team Association

**User Story:** As an Engineering Manager, I want the Team field to represent my delivery squad within my Function, so that data is organized by the correct team hierarchy.

#### Acceptance Criteria

1. THE Team_Registry SHALL store each Team with a unique name within its parent Function, a maximum length of 100 characters, and a foreign key reference to the parent Function.
2. WHEN an Engineering_Manager requests a template download, THE Template_Generator SHALL populate the Team column dropdown with only the Teams belonging to the Engineering_Manager's assigned Function.
3. WHEN the Super_Admin adds a new Team to a Function in the Team_Registry, THE Template_Generator SHALL include the new Team in the dropdown for Engineering Managers assigned to that Function on the next template download.
4. WHEN the Super_Admin removes a Team from the Team_Registry, THE Template_Generator SHALL exclude the removed Team from the dropdown on the next template download.
5. THE Platform SHALL allow multiple Teams to exist within a single Function.
6. WHEN an Engineering_Manager uploads an Excel file, THE Validation_Engine SHALL verify that each row's Team value exists in the Team_Registry under the Engineering_Manager's assigned Function.
7. IF an uploaded row contains a Team value not registered under the Engineering_Manager's assigned Function, THEN THE Validation_Engine SHALL reject the row and return a validation error specifying the invalid Team name and row number.
8. IF an uploaded row contains an empty or blank Team value, THEN THE Validation_Engine SHALL reject the row and return a validation error indicating the Team field is required.

### Requirement 5: Function-Team-Story Hierarchy in Data Model

**User Story:** As a platform developer, I want the data model to support the Function → Team → Story hierarchy, so that data can be queried, filtered, and aggregated at each level.

#### Acceptance Criteria

1. THE Platform SHALL store each sprint data entry with separate Function, Team, and Story Name fields in the persistence layer, where each field maps to its own column.
2. THE Platform SHALL enforce that every sprint data entry references a valid Function from the Function_Registry via a foreign key constraint, rejecting any insert or update that references a non-existent Function with a constraint violation error.
3. THE Platform SHALL enforce that every sprint data entry references a valid Team from the Team_Registry under the associated Function via a foreign key constraint, rejecting any insert or update that references a non-existent Function-Team combination with a constraint violation error.
4. WHEN the Platform receives a query filtered by Function, THE Platform SHALL return only sprint data entries belonging to the specified Function, returning an empty result set with zero records if no entries match.
5. WHEN the Platform receives a query filtered by Function and Team, THE Platform SHALL return only sprint data entries belonging to the specified Function and Team combination, returning an empty result set with zero records if no entries match.
6. WHEN the Platform receives a query filtered by Function, THE Platform SHALL support aggregation of sprint data entries at the Function level, returning computed totals and counts across all Teams and Stories within the specified Function.
7. THE Platform SHALL create database indexes on the Function and Team columns in the sprint_data table.
8. THE Platform SHALL enforce a uniqueness constraint on the combination of JIRA ID and Team within the sprint_data table, preventing duplicate story entries for the same Team.

### Requirement 6: Admin Management of Functions

**User Story:** As a Super_Admin, I want to create, edit, and remove Functions, so that the organizational structure can evolve without developer intervention.

#### Acceptance Criteria

1. WHEN a Super_Admin submits a valid Function name (1 to 100 characters, not blank or whitespace-only), THE Platform SHALL add the Function to the Function_Registry and return the created record with its identifier.
2. WHEN a Super_Admin renames an existing Function, THE Platform SHALL update the Function name in the Function_Registry and update all sprint_data entries referencing the old name to the new name atomically so that no entry references a stale name.
3. IF a Super_Admin attempts to delete a Function that has associated Teams, THEN THE Platform SHALL reject the deletion and return an error indicating that all Teams must be removed or reassigned first.
4. WHEN a Super_Admin deletes a Function with no associated Teams, THE Platform SHALL remove the Function from the Function_Registry.
5. IF a Super_Admin attempts to create a Function with a name that already exists in the Function_Registry, THEN THE Platform SHALL reject the request and return a duplicate name error.
6. IF a Super_Admin attempts to rename a Function to a name that already exists in the Function_Registry, THEN THE Platform SHALL reject the request and return a duplicate name error.
7. IF a Super_Admin submits a create or rename request with a Function name that is empty, whitespace-only, or exceeds 100 characters, THEN THE Platform SHALL reject the request and return a validation error indicating the name constraint.
8. THE Platform SHALL expose Function management operations through API endpoints accessible only to the Super_Admin role.

### Requirement 7: Admin Management of Teams

**User Story:** As a Super_Admin, I want to create, edit, and remove Teams within a Function, so that I can maintain the team structure as squads are formed or dissolved.

#### Acceptance Criteria

1. WHEN a Super_Admin creates a new Team under a Function, THE Platform SHALL validate that the Team name is between 1 and 100 characters after trimming whitespace, add the Team to the Team_Registry with a reference to the parent Function, and return the created record including its identifier and parent Function reference.
2. WHEN a Super_Admin renames an existing Team, THE Platform SHALL validate that the new name does not duplicate an existing Team within the same Function, update the Team name in the Team_Registry, and update all sprint_data entries referencing the old Team name within that Function to the new name.
3. IF a Super_Admin attempts to delete a Team that has associated sprint data entries, THEN THE Platform SHALL reject the deletion and return an error indicating that data exists for the Team.
4. WHEN a Super_Admin deletes a Team with no associated sprint data entries, THE Platform SHALL remove the Team from the Team_Registry.
5. IF a Super_Admin attempts to create a Team with a name that already exists within the same Function, THEN THE Platform SHALL reject the request and return a duplicate name error.
6. THE Platform SHALL allow the same Team name to exist under different Functions.
7. THE Platform SHALL expose Team management operations through API endpoints accessible only to the Super_Admin role.
8. IF a Super_Admin attempts to create a Team under a Function that does not exist in the Function_Registry, THEN THE Platform SHALL reject the request and return an error indicating the specified Function is invalid.
9. IF a Super_Admin attempts to rename a Team to a name that already exists within the same Function, THEN THE Platform SHALL reject the request and return a duplicate name error.
10. IF a Super_Admin submits a Team name that is empty or contains only whitespace, THEN THE Platform SHALL reject the request and return a validation error indicating the Team name is required.

### Requirement 8: Engineering Manager Function Assignment

**User Story:** As a Super_Admin, I want to assign each Engineering Manager to exactly one Function, so that their data access and template are scoped correctly.

#### Acceptance Criteria

1. THE Platform SHALL store a function assignment for each Engineering_Manager user, linking the user to exactly one Function from the Function_Registry.
2. WHEN a Super_Admin assigns an Engineering_Manager to a Function, THE Platform SHALL update the user's function assignment record and the change SHALL take effect immediately for all subsequent API requests by that Engineering_Manager without requiring re-login.
3. WHEN a Super_Admin reassigns an Engineering_Manager to a different Function, THE Platform SHALL update the function assignment, the Engineering_Manager's subsequent template downloads and uploads SHALL reflect the new Function, and previously submitted sprint data entries SHALL remain associated with the original Function under which they were submitted.
4. IF a Super_Admin attempts to assign an Engineering_Manager to a Function that does not exist in the Function_Registry, THEN THE Platform SHALL reject the request and return an error indicating the Function is invalid.
5. IF a Super_Admin attempts to assign a Function to a user that does not exist or does not have the Engineering_Manager role, THEN THE Platform SHALL reject the request and return an error indicating the user is invalid.
6. THE Platform SHALL NOT permit an Engineering_Manager to be assigned to more than one Function simultaneously.
7. THE Platform SHALL seed the initial Engineering_Manager user (eng_manager) with an assignment to the "E-Com" Function.
8. THE Platform SHALL expose Engineering_Manager function assignment operations through API endpoints accessible only to the Super_Admin role.

### Requirement 9: Production Status and Story Status Dropdowns

**User Story:** As an Engineering Manager, I want Production Status, Story Status, and Delay Reason fields to be dropdown selections, so that data entry is standardized and reporting is consistent.

#### Acceptance Criteria

1. THE Excel_Template SHALL define the Production Status column as a dropdown with admin-configurable values stored in the Platform configuration, supporting between 1 and 50 configured options per dropdown field, where each option value is a non-empty string with a maximum length of 100 characters.
2. THE Excel_Template SHALL define the Story Status column as a dropdown with admin-configurable values stored in the Platform configuration, supporting between 1 and 50 configured options per dropdown field, where each option value is a non-empty string with a maximum length of 100 characters.
3. THE Excel_Template SHALL define the Delay Reason column as a dropdown with admin-configurable values stored in the Platform configuration, supporting between 1 and 50 configured options per dropdown field, where each option value is a non-empty string with a maximum length of 100 characters.
4. WHEN the Super_Admin adds, edits, or removes a value from a dropdown configuration, THE Template_Generator SHALL reflect the updated dropdown values on the next template download.
5. WHEN an Engineering_Manager uploads an Excel file, THE Validation_Engine SHALL verify that Production Status, Story Status, and Delay Reason values match the configured dropdown options using case-insensitive comparison.
6. IF an uploaded row contains a Production Status, Story Status, or Delay Reason value not in the configured options, THEN THE Validation_Engine SHALL reject the row and return a validation error specifying the invalid value, field name, and row number.
7. IF an uploaded row contains an empty or blank Production Status or Story Status value, THEN THE Validation_Engine SHALL reject the row and return a validation error indicating the mandatory field name and row number.
8. IF an uploaded row contains an empty or blank Delay Reason value, THEN THE Validation_Engine SHALL accept the row, treating Delay Reason as an optional field that is only validated against configured options when a value is provided.
9. IF the Super_Admin removes a dropdown value that is referenced by existing Story records, THEN THE Platform SHALL retain the value in existing records and exclude it only from future template downloads and upload validation.

### Requirement 10: Upload Validation for Revised Template

**User Story:** As an Engineering Manager, I want the upload system to validate my file against the revised template structure, so that data quality issues are caught before persistence.

#### Acceptance Criteria

1. WHEN an Excel file is uploaded, THE Upload_Service SHALL validate that all 29 required column headers are present, matching expected names using case-insensitive trimmed comparison.
2. WHEN an Excel file is uploaded, THE Validation_Engine SHALL validate each row's JIRA ID against the pattern of alphanumeric project key followed by a hyphen and numeric identifier (e.g., ECOM-1234), rejecting values that do not match the pattern `^[A-Z0-9]+-\d+$`.
3. WHEN an Excel file is uploaded, THE Validation_Engine SHALL validate that date fields contain valid dates in DD-MM-YYYY, ISO 8601, DD-MMM-YY, DD-MMM-YYYY format or an Excel serial number, or are empty.
4. WHEN an Excel file is uploaded, THE Validation_Engine SHALL validate that numeric fields contain non-negative numbers not exceeding 99999.99 or are empty.
5. WHEN an Excel file is uploaded, THE Validation_Engine SHALL validate that Y/N fields contain only "Y", "N" (case-insensitive), or are empty.
6. IF validation fails for one or more rows, THEN THE Upload_Service SHALL return all validation errors (up to 100) with row numbers and field names without persisting any data.
7. WHEN all rows pass validation, THE Upload_Service SHALL persist the data into the sprint_data table with the Function, Team, and all new fields mapped to their respective database columns.
8. WHEN an Excel file is uploaded, THE Upload_Service SHALL validate that the file does not exceed 10 MB in size and is in .xlsx or .xls format before parsing.
9. IF the uploaded file contains the required column headers but zero data rows, THEN THE Upload_Service SHALL reject the file and return an error indicating the file contains no data to process.

### Requirement 11: Cross-Function Visibility for Leadership and Admin

**User Story:** As a Leadership user, I want to view and filter data across all Functions, so that I can monitor organization-wide delivery health.

#### Acceptance Criteria

1. WHEN a Leadership user accesses the dashboard, THE Platform SHALL display data aggregated across all Functions registered in the Function_Registry.
2. WHEN a Leadership or Super_Admin user selects a Function filter, THE Platform SHALL display data for only the selected Function and SHALL update the Team filter dropdown to list only Teams belonging to the selected Function as defined in the Team_Registry.
3. WHEN a Leadership or Super_Admin user selects a Function and Team filter, THE Platform SHALL display data for only the specified Function-Team combination.
4. WHEN a Super_Admin accesses any data view, THE Platform SHALL provide the same cross-Function visibility and filtering capabilities as Leadership users while retaining full administrative and write permissions defined for the Super_Admin role.
5. THE Platform SHALL provide a Function filter dropdown on the analytics dashboard populated with all active Function names from the Function_Registry, visible only to Leadership and Super_Admin users.
6. THE Platform SHALL NOT display the Function filter dropdown to Engineering_Manager users, since their data access is scoped to their assigned Function.
7. IF a Leadership or Super_Admin user selects a Function filter for a Function that contains no sprint data entries, THEN THE Platform SHALL display an empty state message indicating no data is available for the selected Function.
8. WHEN no Function filter is selected, THE Platform SHALL populate the Team filter dropdown with all Teams from the Team_Registry across all Functions.

### Requirement 12: Migration from Current Data Model

**User Story:** As a platform operator, I want existing data to be migrated to the new Function-Team-Story structure, so that historical records remain accessible under the new hierarchy.

#### Acceptance Criteria

1. WHEN the database migration runs, THE Platform SHALL add a "function_name" TEXT column to the sprint_data table with a NOT NULL constraint and default value of "Unassigned".
2. WHEN the database migration runs, THE Platform SHALL retain the existing "track" column in sprint_data and add an alias mapping so that the "team" column continues to hold the team identifier as before.
3. WHEN the database migration runs, THE Platform SHALL add the following columns to the sprint_data table: story_name TEXT, actual_effort REAL, definition_of_ready TEXT CHECK(definition_of_ready IN ('Y','N')), definition_of_done TEXT CHECK(definition_of_done IN ('Y','N')), refinement_closure_date TEXT, uat_start_date TEXT, uat_complete_date TEXT, delay_reason TEXT, delay_reason_description TEXT.
4. WHEN the database migration runs, THE Platform SHALL populate the function_name column for existing records by joining with the track_portfolio_mapping table on the track column and mapping each portfolio value to its corresponding Function name using a defined portfolio-to-function mapping.
5. IF an existing record's track value has no entry in track_portfolio_mapping, THEN THE Platform SHALL set the function_name to "Unassigned" for that record.
6. THE Platform SHALL create a "functions" table with columns: id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (current timestamp).
7. THE Platform SHALL create a "teams" table with columns: id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, function_id INTEGER NOT NULL REFERENCES functions(id), created_at TEXT NOT NULL DEFAULT (current timestamp), with a UNIQUE constraint on (name, function_id).
8. THE Platform SHALL execute the entire migration within a single transaction, rolling back all changes if any step fails.
9. WHEN the migration completes successfully, THE Platform SHALL populate the functions table with the seed values (E-Com, MPro, Dolphin, IVC) and populate the teams table with teams derived from existing distinct team values in sprint_data grouped by their mapped function.
