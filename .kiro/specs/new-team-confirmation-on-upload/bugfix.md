# Bugfix Requirements Document

## Introduction

When an Engineering Manager uploads sprint data via the Excel upload flow (`POST /api/upload`), the system validates each row's Team value against the `teams` table. If the uploaded Excel contains a team name that does not exist in the database under the EM's function, the upload is currently hard-rejected with a validation error (e.g., `Team "X" is not registered under the assigned function`).

This is incorrect behavior. New teams should be detected and the user should be prompted for confirmation before the system creates them, because adding a new team cascades through Leadership dashboards, Engineering Manager team cards, and all related reporting views.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a row in the uploaded Excel contains a Team value that does not exist in the `teams` table under the EM's assigned function THEN the system rejects the row with a validation error `Team "X" is not registered under the assigned function`

1.2 WHEN multiple rows in the uploaded Excel contain new team names not present in the database THEN the system collects all team validation errors and returns a 400 response, blocking the entire upload

1.3 WHEN an upload contains a mix of existing and new teams THEN the system rejects the upload entirely without distinguishing between new teams requiring confirmation and genuinely invalid data

### Expected Behavior (Correct)

2.1 WHEN a row in the uploaded Excel contains a Team value that does not exist in the `teams` table under the EM's assigned function THEN the system SHALL detect it as a new team and return a response indicating new teams were found, along with the list of new team names

2.2 WHEN new teams are detected during upload validation THEN the system SHALL respond with a distinct status (not a validation error) that includes the list of new team names requiring user confirmation before proceeding

2.3 WHEN the user confirms the creation of new teams THEN the system SHALL create the new team records in the `teams` table under the EM's function, and then proceed to process and persist the uploaded data normally

2.4 WHEN the user declines the creation of new teams THEN the system SHALL cancel the upload without creating any new teams or persisting any data

### Unchanged Behavior (Regression Prevention)

3.1 WHEN all Team values in the uploaded Excel already exist in the `teams` table under the EM's function THEN the system SHALL CONTINUE TO process and persist the upload data without any confirmation prompt

3.2 WHEN a row has an empty or blank Team value THEN the system SHALL CONTINUE TO reject that row with a validation error stating Team is required

3.3 WHEN the uploaded file fails other validations (file format, headers, function mismatch, dropdown values, field types) THEN the system SHALL CONTINUE TO reject the upload with appropriate validation errors

3.4 WHEN the upload is valid and all teams exist THEN the system SHALL CONTINUE TO return a 200 response with `{ success: true, rowsIngested, uploadId, timestamp }`
