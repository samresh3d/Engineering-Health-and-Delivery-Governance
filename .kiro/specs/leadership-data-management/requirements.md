# Requirements Document

## Introduction

The Leadership Data Management feature extends the existing standalone, client-side, Excel-driven Leadership Dashboard module (`client/src/leadership`, React + TypeScript + ECharts, no backend) with an in-portal Data Management module. Today, every change to KPI data requires editing the source Excel workbook and re-uploading it. This feature lets business users view, edit, and manage KPI data directly inside the application through a spreadsheet-like grid, so that Excel becomes an optional import/export mechanism rather than the only path to change data.

The feature transforms the reporting-only dashboard into a lightweight Engineering KPI Management Portal: users maintain and validate KPI data through the UI while all existing dashboards (KPI cards, charts, heatmaps, team rankings, trends, executive summary, and AI-generated insights) remain synchronized with the latest approved data.

The feature is delivered entirely within the existing isolated, backend-free Leadership Dashboard module. It reuses the existing in-memory `Dashboard_Model` and its types (`MetricValue`, `KpiDefinition`, `Period`, `Dimensions`) and the existing SheetJS-based parser and export service. Because no backend, network API, or database is currently available, all persistence is client-side (in-memory plus browser storage such as localStorage or IndexedDB). Capabilities that would genuinely require a backend (for example, multi-user approval routing) are captured as assumptions and constraints rather than hard requirements.

### Scope Decisions and Constraints

- **Module boundary**: All changes live inside the isolated `client/src/leadership` module. The existing Engineering Health Dashboard and any tightly-coupled components remain untouched.
- **Backend-free persistence**: There is no server, network API, or database. Edited data, audit trail, and versions are held in the in-memory `Dashboard_Model` and persisted to browser storage (localStorage/IndexedDB) so they survive a page reload on the same browser.
- **Existing model reuse**: Editing maps back to the existing model. An edit to Actual Value changes `MetricValue.value`; an edit to Target changes `KpiDefinition.target`. The combination of Month, Team, Pillar, and KPI defines the identity of a grid row.
- **Existing parser/export reuse**: Excel import and export use the existing SheetJS-based parser and export service, and the existing Excel matrix layout, normalized parsers, and fraction normalization remain intact.
- **User identity assumption**: "Updated By" implies a user identity. Because the module is standalone and backend-free, the current user is determined from a lightweight local identity — a display name the user provides or a stored local profile — rather than an authenticated account.
- **Approval workflow is optional**: The Draft / Pending Approval / Approved / Rejected workflow and version restore are OPTIONAL ("should") capabilities. Multi-user approval routing is out of scope until a backend exists.

### Assumptions

- **A1**: The current user's identity for "Updated By" is a locally captured display name (prompted once and stored in browser storage). No authentication or server-side identity exists.
- **A2**: Persistence is per-browser and per-device. Client-side storage (localStorage/IndexedDB) is the durable store; clearing browser data removes locally persisted edits, audit trail, and versions.
- **A3**: A single user edits data at a time in a given browser session; concurrent multi-user editing and server-side conflict resolution are out of scope until a backend is available.
- **A4**: When the approval workflow is disabled, all saved edits are treated as approved and immediately drive the dashboards.
- **A5**: KPI type (Percentage, Currency, Number, Text) is derived from the existing `KpiDefinition` metadata or inferred from the KPI's existing values, consistent with existing fraction normalization.

## Glossary

- **Leadership_Module**: The existing isolated, client-side Leadership Dashboard module at `client/src/leadership` that this feature extends.
- **Data_Management_Page**: The new dedicated page within the Leadership_Module that presents KPI data in an editable, spreadsheet-like grid.
- **Data_Grid**: The spreadsheet-like grid on the Data_Management_Page whose columns are Month, Team, Pillar, KPI, Target, Actual Value, Source, Last Updated, and Updated By.
- **Grid_Row**: A single record in the Data_Grid, uniquely identified by the combination of Month, Team, Pillar, and KPI.
- **Dashboard_Model**: The existing in-memory data structure containing KPI definitions, metric values, dimensions, and source columns.
- **MetricValue**: The existing model entity holding a KPI value for a Team in a Period; its `value` field is the Actual Value shown in the Data_Grid.
- **KpiDefinition**: The existing model entity defining a KPI; its `target` field is the Target shown in the Data_Grid.
- **Period**: The existing model entity representing a month within a year; supplies the Month column of a Grid_Row.
- **KPI_Type**: The value category of a KPI, one of Percentage, Currency, Number, or Text, used for input validation and formatting.
- **Validator**: The service that validates an edited cell value against the KPI_Type and reports whether the value is valid.
- **Persistence_Service**: The client-side service that stores and retrieves the Dashboard_Model, audit trail, and versions using browser storage.
- **Import_Service**: The service that loads Excel workbooks into the Dashboard_Model using the existing SheetJS-based parser, supporting replace and merge modes.
- **Export_Service**: The existing service that writes the Dashboard_Model to Excel and exports data to CSV.
- **Change_Record**: An audit-trail entry describing one modification, containing Previous Value, New Value, Updated By, Date & Time, and optional Comments.
- **Audit_Trail**: The ordered collection of Change_Records maintained by the Leadership_Module.
- **Current_User**: The locally determined identity used to populate Updated By, per Assumption A1.
- **Approval_Status**: The optional lifecycle state of a change, one of Draft, Pending Approval, Approved, or Rejected.
- **Approval_Workflow**: The optional capability that gates dashboard visibility on Approval_Status.
- **Approved_Data**: The subset of KPI data whose changes are Approved, or all saved data when the Approval_Workflow is disabled.
- **Version**: A stored snapshot of the Dashboard_Model for a reporting cycle.
- **Version_Store**: The collection of stored Versions maintained by the Persistence_Service.
- **Reporting_Cycle**: A labeled period (for example a month) for which a Version snapshot is retained.
- **Visual_Indicator**: A distinct visual treatment applied to a cell or row to signal a condition such as below-target, missing data, outlier, recently updated, or requiring attention.
- **Filter_Selection**: The set of active filter criteria applied to the Data_Grid (Month, Team, Pillar, KPI, Status, Updated By).

## Requirements

### Requirement 1: Data Management Page and Grid

**User Story:** As a business user, I want a dedicated page that shows the uploaded KPI data in a spreadsheet-like grid, so that I can view and manage all KPI data in one place.

#### Acceptance Criteria

1. THE Leadership_Module SHALL provide a Data_Management_Page reachable through a dedicated navigation entry within the module.
2. THE Data_Management_Page SHALL display a Data_Grid whose columns are Month, Team, Pillar, KPI, Target, Actual Value, Source, Last Updated, and Updated By.
3. WHEN a Dashboard_Model is available, THE Data_Management_Page SHALL render one Grid_Row for each MetricValue in the Dashboard_Model.
4. THE Data_Management_Page SHALL derive each Grid_Row's Month, Team, Pillar, and KPI from the corresponding Period, Team, Engineering_Pillar, and KpiDefinition in the Dashboard_Model.
5. THE Data_Management_Page SHALL display each Grid_Row's Actual Value from the corresponding MetricValue value and the Target from the corresponding KpiDefinition target.
6. WHERE a MetricValue value or a KpiDefinition target is absent, THE Data_Management_Page SHALL display an absent-value indicator in that cell.
7. WHEN no Dashboard_Model is available, THE Data_Management_Page SHALL display an empty-state message directing the User to import data.

### Requirement 2: Inline Cell Editing and Validation

**User Story:** As a business user, I want to edit cell values inline with validation by KPI type, so that I can correct and maintain KPI data accurately without touching Excel.

#### Acceptance Criteria

1. WHEN a User clicks an editable cell in the Data_Grid, THE Data_Management_Page SHALL present that cell in an editable input state.
2. THE Data_Management_Page SHALL treat the Target and Actual Value cells as editable.
3. WHEN a User commits an edit to an Actual Value cell, THE Leadership_Module SHALL set the corresponding MetricValue value to the committed value.
4. WHEN a User commits an edit to a Target cell, THE Leadership_Module SHALL set the corresponding KpiDefinition target to the committed value.
5. WHEN a User edits a cell, THE Validator SHALL validate the entered value against the KPI_Type of that Grid_Row's KPI.
6. IF an entered value is invalid for its KPI_Type, THEN THE Data_Management_Page SHALL highlight the cell as invalid before the value is saved.
7. IF an entered value is invalid for its KPI_Type, THEN THE Leadership_Module SHALL reject the edit and retain the previous value.
8. WHERE a KPI_Type is Percentage, THE Validator SHALL apply the existing fraction normalization when interpreting the entered value.
9. WHERE a Grid_Row has a derived field defined by the Dashboard_Model, THE Data_Management_Page SHALL recalculate that derived field when a value it depends on is committed.

### Requirement 3: Dashboard Synchronization

**User Story:** As a business user, I want every dashboard view to update instantly when I change grid data, so that reports always reflect the latest approved data without a manual refresh.

#### Acceptance Criteria

1. WHEN a Grid_Row change is committed, THE Leadership_Module SHALL update the KPI cards, charts, heatmaps, team rankings, trends, executive summary, and AI-generated insights to reflect the change.
2. WHEN a Grid_Row change is committed, THE Leadership_Module SHALL update the dashboards without requiring a manual refresh action.
3. WHERE the Approval_Workflow is enabled, THE Leadership_Module SHALL drive the dashboards from Approved_Data only.
4. WHERE the Approval_Workflow is disabled, THE Leadership_Module SHALL drive the dashboards from all saved data.
5. WHEN Approved_Data changes, THE Leadership_Module SHALL recompute every affected dashboard view from the changed Approved_Data.

### Requirement 4: Import and Export

**User Story:** As a business user, I want to import from and export to Excel and CSV, so that Excel remains an optional exchange mechanism alongside in-app editing.

#### Acceptance Criteria

1. WHEN a User uploads an Excel workbook in replace mode, THE Import_Service SHALL parse the workbook using the existing parser and replace the current Dashboard_Model with the parsed data.
2. WHEN a User uploads an Excel workbook in merge mode, THE Import_Service SHALL parse the workbook using the existing parser and merge the parsed rows into the current Dashboard_Model.
3. WHEN merging, IF a parsed row shares the same Month, Team, Pillar, and KPI as an existing Grid_Row, THEN THE Import_Service SHALL update the existing Grid_Row with the parsed values.
4. WHEN merging, IF a parsed row has no matching existing Grid_Row, THEN THE Import_Service SHALL add the parsed row as a new Grid_Row.
5. WHEN a User requests download of the current data as Excel, THE Export_Service SHALL produce an Excel workbook containing the current Dashboard_Model using the existing export service and the existing Excel matrix layout.
6. WHEN a User requests download of dashboard data as CSV, THE Export_Service SHALL produce a CSV file containing the current dashboard data.
7. THE Import_Service SHALL preserve the existing Excel matrix layout, normalized parsers, and fraction normalization when importing.
8. IF an uploaded workbook is invalid, THEN THE Import_Service SHALL report an error and retain the current Dashboard_Model.

### Requirement 5: Change Tracking

**User Story:** As a business user, I want an audit trail of every change, so that I can see what was modified, by whom, and when.

#### Acceptance Criteria

1. WHEN a Grid_Row value is committed, THE Leadership_Module SHALL record a Change_Record containing the Previous Value, the New Value, the Updated By, and the Date & Time of the change.
2. THE Leadership_Module SHALL set the Updated By of a Change_Record to the Current_User.
3. WHERE a User provides Comments for a change, THE Leadership_Module SHALL store the Comments in the Change_Record.
4. WHEN a Change_Record is created, THE Leadership_Module SHALL add the Change_Record to the Audit_Trail.
5. WHEN a Grid_Row value is committed, THE Data_Management_Page SHALL update that Grid_Row's Last Updated and Updated By cells to reflect the change.
6. THE Leadership_Module SHALL make the Audit_Trail viewable for a selected Grid_Row.

### Requirement 6: Approval Workflow (Optional)

**User Story:** As a data steward, I want changes to move through an approval lifecycle, so that only approved changes appear on the dashboards.

#### Acceptance Criteria

1. WHERE the Approval_Workflow is enabled, THE Leadership_Module SHALL assign each change an Approval_Status of Draft, Pending Approval, Approved, or Rejected.
2. WHERE the Approval_Workflow is enabled, WHEN a change is committed, THE Leadership_Module SHALL set the change's Approval_Status to Draft.
3. WHERE the Approval_Workflow is enabled, WHEN a User submits a Draft change for approval, THE Leadership_Module SHALL set the change's Approval_Status to Pending Approval.
4. WHERE the Approval_Workflow is enabled, WHEN a User approves a Pending Approval change, THE Leadership_Module SHALL set the change's Approval_Status to Approved.
5. WHERE the Approval_Workflow is enabled, WHEN a User rejects a Pending Approval change, THE Leadership_Module SHALL set the change's Approval_Status to Rejected.
6. WHERE the Approval_Workflow is enabled, THE Leadership_Module SHALL include only Approved changes in Approved_Data.
7. WHERE the Approval_Workflow is enabled, THE Data_Management_Page SHALL display the Approval_Status of each Grid_Row.

### Requirement 7: Filters

**User Story:** As a business user, I want to filter the grid by common attributes, so that I can focus on the records I need to manage.

#### Acceptance Criteria

1. THE Data_Management_Page SHALL provide filters for Month, Team, Pillar, KPI, Status, and Updated By.
2. WHEN a User changes a filter, THE Data_Management_Page SHALL display only the Grid_Rows that satisfy every active filter criterion.
3. THE Data_Management_Page SHALL populate each filter's available options from the current Dashboard_Model and Audit_Trail.
4. WHEN a User clears all filters, THE Data_Management_Page SHALL display every Grid_Row in the current Dashboard_Model.
5. WHERE the Approval_Workflow is disabled, THE Data_Management_Page SHALL omit Approval_Status values from the Status filter options.

### Requirement 8: Bulk Operations

**User Story:** As a business user, I want to edit many cells at once and undo mistakes, so that I can maintain large datasets efficiently.

#### Acceptance Criteria

1. WHEN a User selects multiple cells and commits a value, THE Data_Management_Page SHALL apply the committed value to every selected editable cell that is valid for its KPI_Type.
2. WHEN a User pastes tabular content copied from Excel into the Data_Grid, THE Data_Management_Page SHALL populate the target cells from the pasted content.
3. WHEN a User performs a bulk update across selected Grid_Rows, THE Leadership_Module SHALL record a Change_Record for each modified Grid_Row.
4. WHEN a User performs a bulk delete of selected Grid_Rows, THE Leadership_Module SHALL remove the selected Grid_Rows from the Dashboard_Model.
5. WHEN a User performs an undo, THE Leadership_Module SHALL revert the most recent editing operation and restore the affected Grid_Rows to their prior values.
6. WHEN a User performs a redo after an undo, THE Leadership_Module SHALL reapply the reverted operation.
7. IF a pasted value is invalid for its target cell's KPI_Type, THEN THE Data_Management_Page SHALL highlight the target cell as invalid and retain the prior value of that cell.

### Requirement 9: Visual Indicators

**User Story:** As a business user, I want the grid to highlight notable records, so that I can quickly spot data that needs attention.

#### Acceptance Criteria

1. WHERE a Grid_Row's Actual Value is below its Target for a KPI whose better direction is higher, THE Data_Management_Page SHALL apply a below-target Visual_Indicator to that Grid_Row.
2. WHERE a Grid_Row's Actual Value or Target is absent, THE Data_Management_Page SHALL apply a missing-data Visual_Indicator to that Grid_Row.
3. WHERE a Grid_Row's Actual Value is an outlier relative to the other values for the same KPI, THE Data_Management_Page SHALL apply an outlier Visual_Indicator to that Grid_Row.
4. WHERE a Grid_Row was modified within the recent-change window, THE Data_Management_Page SHALL apply a recently-updated Visual_Indicator to that Grid_Row.
5. WHERE a Grid_Row meets a requires-attention condition, THE Data_Management_Page SHALL apply a requires-attention Visual_Indicator to that Grid_Row.

### Requirement 10: Save and Versioning

**User Story:** As a business user, I want my edits auto-saved and prior versions retained, so that I never lose work and can compare or restore earlier data.

#### Acceptance Criteria

1. WHEN a Grid_Row change is committed, THE Persistence_Service SHALL auto-save the current Dashboard_Model and Audit_Trail to browser storage.
2. WHEN the Data_Management_Page loads AND browser storage contains a previously saved Dashboard_Model, THE Persistence_Service SHALL restore that Dashboard_Model.
3. THE Persistence_Service SHALL retain a Version snapshot of the Dashboard_Model for each Reporting_Cycle in the Version_Store.
4. WHEN a User selects two Versions to compare, THE Leadership_Module SHALL display the differences between the two selected Versions.
5. WHERE version restore is enabled, WHEN a User restores a selected Version, THE Leadership_Module SHALL replace the current Dashboard_Model with the selected Version's snapshot.
6. IF browser storage is unavailable or a save fails, THEN THE Persistence_Service SHALL report a save error and continue operating on the in-memory Dashboard_Model.

### Requirement 11: Module Isolation and Model Fidelity

**User Story:** As a maintainer, I want the data management feature to stay within the isolated module and reuse the existing model and services, so that the existing dashboards and Engineering Health Dashboard remain untouched.

#### Acceptance Criteria

1. THE Data_Management_Page SHALL reside within the isolated Leadership_Module directory.
2. THE Leadership_Module SHALL operate without invoking a backend service, network API, or persistent server-side database.
3. THE Leadership_Module SHALL represent all edits within the existing Dashboard_Model, MetricValue, KpiDefinition, Period, and Dimensions types.
4. THE Import_Service and Export_Service SHALL reuse the existing SheetJS-based parser and export service.
5. FOR ALL Dashboard_Models, exporting the current data to Excel and importing the exported workbook in replace mode SHALL produce a Dashboard_Model equivalent to the current one (round-trip property).
6. THE Leadership_Data_Management feature SHALL NOT modify the existing Engineering Health Dashboard code or its tightly-coupled components.
