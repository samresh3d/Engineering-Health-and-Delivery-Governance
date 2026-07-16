# New Team Confirmation on Upload — Bugfix Design

## Overview

When an Engineering Manager uploads sprint data containing team names not registered in the database, the system currently hard-rejects the upload with validation errors. The fix introduces a two-phase upload flow: the initial upload detects new teams and returns them for confirmation via a distinct HTTP 409 response, then a confirmation endpoint creates the teams and completes the ingestion. The frontend renders a confirmation modal listing discovered new teams, allowing the user to confirm or cancel.

## Glossary

- **Bug_Condition (C)**: The uploaded Excel contains one or more Team values that are not present in the `teams` table under the EM's assigned function, AND those Team values are non-empty/non-blank strings
- **Property (P)**: When the bug condition holds, the system returns an HTTP 409 response with a `newTeams` list and a `pendingUploadId` token; after user confirmation, the system creates the teams and ingests the data
- **Preservation**: All uploads where every Team value already exists in the registry must continue to be processed immediately without any confirmation prompt; empty/blank teams must still be rejected as validation errors
- **`validateTeamMembership`**: The method in `upload-validation.service.ts` that checks each row's Team value against the registered team set
- **`POST /api/upload`**: The upload endpoint in `upload.routes.ts` that runs the full validation pipeline
- **`POST /api/upload/confirm`**: New endpoint that accepts a `pendingUploadId` and creates new teams + ingests data
- **`pendingUploadId`**: A UUID token that identifies a pending upload stored temporarily, allowing the confirmation step to resume processing

## Bug Details

### Bug Condition

The bug manifests when an EM uploads an Excel file where one or more rows contain a non-empty Team value that does not exist in the `teams` table for their assigned function. The `validateTeamMembership` method treats these as hard validation errors, collecting them alongside other row-level errors and returning a flat 400 response — making it impossible for the user to confirm creation of new teams.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { rows: RawRow[], validTeams: Set<string>, functionId: number }
  OUTPUT: boolean

  newTeams := SET()
  FOR EACH row IN input.rows DO
    teamValue := TRIM(STRING(row["Team"]))
    IF teamValue != "" AND teamValue NOT IN input.validTeams THEN
      ADD teamValue TO newTeams
    END IF
  END FOR

  RETURN SIZE(newTeams) > 0
END FUNCTION
```

### Examples

- **Single new team**: EM uploads 10 rows; 9 have team "Alpha" (registered), 1 has team "Beta" (not registered). Current: 400 error with `Team "Beta" is not registered...`. Expected: 409 response with `newTeams: ["Beta"]` and a `pendingUploadId`.
- **Multiple new teams**: EM uploads 20 rows with teams "Alpha", "Beta", "Gamma". Only "Alpha" is registered. Current: multiple 400 errors for "Beta" and "Gamma". Expected: 409 with `newTeams: ["Beta", "Gamma"]`.
- **All teams new**: EM uploads 5 rows all with team "Delta" (not registered). Current: 400 errors on every row. Expected: 409 with `newTeams: ["Delta"]`.
- **Edge case — mix of new teams and other errors**: EM uploads rows with new team "Beta" AND invalid JIRA IDs. Expected: Other validation errors take precedence; new team detection only applies after all other validations pass.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Uploads where all teams are already registered must be processed and ingested immediately (200 response) with no confirmation step
- Empty or blank Team values must continue to produce validation errors (`Team is required and cannot be empty.`)
- File prerequisite validation (format, size) must continue to short-circuit on failure
- Header validation must continue to short-circuit on failure
- Function mismatch validation must continue to reject the entire file
- Dropdown and field-type validation must continue to produce row-level errors
- Mouse/keyboard interactions on the Upload page unrelated to the new confirmation modal must be unchanged

**Scope:**
All inputs that do NOT involve unregistered team names in otherwise-valid uploads should be completely unaffected by this fix. This includes:
- Uploads with only registered teams (pass-through as today)
- Uploads failing on file format, headers, or function mismatch (short-circuit as today)
- Uploads failing on dropdown/field-type errors (400 error as today)
- Empty/blank Team values (validation error as today)

## Hypothesized Root Cause

Based on the bug description, the root cause is a **design gap** rather than a coding error:

1. **No distinction between "unregistered team" and "invalid team"**: The `validateTeamMembership` method treats any team not in the valid set as a hard validation error, with no mechanism to distinguish "this is a new team the user might want to create" from "this is truly invalid data."

2. **No confirmation flow in the API contract**: The `POST /api/upload` endpoint only returns 200 (success) or 400 (validation errors). There is no intermediate status code or response shape for "validation passed but user action required."

3. **No pending upload storage**: The system has no mechanism to hold parsed/validated upload data while waiting for user confirmation, then resume processing.

4. **No frontend confirmation UI**: The Upload page only handles two terminal outcomes (success banner or error table) and has no state for presenting a confirmation dialog.

## Correctness Properties

Property 1: Bug Condition — New Teams Trigger Confirmation Flow

_For any_ upload where the bug condition holds (isBugCondition returns true — at least one non-empty Team value is not in the registry AND all other validations pass), the upload endpoint SHALL return an HTTP 409 response with `{ requiresConfirmation: true, newTeams: string[], pendingUploadId: string }` instead of a 400 validation error.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Registered Teams Process Immediately

_For any_ upload where the bug condition does NOT hold (all non-empty Team values exist in the registry), the upload endpoint SHALL produce the same result as the original function — either a 200 success response or a 400 validation error for other issues — preserving all existing behavior for uploads with only known teams.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `server/src/services/upload-validation.service.ts`

**Function**: `validateTeamMembership`

**Specific Changes**:
1. **Separate new teams from truly invalid teams**: Refactor `validateTeamMembership` to return a richer result type: `{ errors: ValidationError[], newTeams: string[] }`. Empty/blank teams remain hard errors; non-empty teams not in the valid set are collected into `newTeams` instead of `errors`.

**File**: `server/src/routes/upload.routes.ts`

**Function**: `POST /api/upload` handler

**Specific Changes**:
2. **Detect new teams after other validations pass**: After dropdown and field-type validation succeed, check if `newTeams.length > 0`. If so, store the parsed rows + metadata in a pending upload record and return 409.
3. **Store pending upload**: Create a `pending_uploads` table (or use in-memory cache with TTL) to hold `{ id, rows, functionId, userId, filename, newTeams, expiresAt }`.
4. **New endpoint `POST /api/upload/confirm`**: Accepts `{ pendingUploadId, confirmed: boolean }`. If confirmed, creates new teams via `TeamRepository.create()`, then ingests the stored rows. If declined, deletes the pending record.

**File**: `server/src/types/api.ts`

**Specific Changes**:
5. **New response types**: Add `NewTeamConfirmationResponse { requiresConfirmation: true, newTeams: string[], pendingUploadId: string, message: string }`.

**File**: `client/src/types/index.ts`

**Specific Changes**:
6. **New client types**: Add `NewTeamConfirmationResponse` and update `UploadResult` union to handle 409 responses.

**File**: `client/src/pages/Upload.tsx`

**Specific Changes**:
7. **New state `confirming`**: Add a `confirming` state to `UploadState` that displays a confirmation modal.
8. **Confirmation modal**: Render a dialog listing new team names with "Confirm & Create Teams" and "Cancel Upload" buttons.
9. **Confirmation API call**: On confirm, call `POST /api/upload/confirm` with the `pendingUploadId`. On success, transition to `success` state. On cancel, reset to `idle`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code (new teams cause 400 errors), then verify the fix works correctly (409 + confirmation flow) and preserves existing behavior (registered teams still process immediately).

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that `validateTeamMembership` produces hard errors for unregistered teams and the upload route returns 400.

**Test Plan**: Write integration tests that upload Excel files containing unregistered team names and assert that the response is a 400 with team validation errors. Run these on the UNFIXED code to observe the current defective behavior.

**Test Cases**:
1. **Single New Team Test**: Upload a file with one unregistered team among valid rows (will produce 400 on unfixed code)
2. **Multiple New Teams Test**: Upload a file with 3 unregistered teams (will produce multiple 400 errors on unfixed code)
3. **All Teams New Test**: Upload a file where no team is registered (will produce 400 errors on unfixed code)
4. **New Team + Other Errors Test**: Upload a file with a new team AND invalid JIRA IDs (will produce 400 on unfixed code — verifying error aggregation behavior)

**Expected Counterexamples**:
- `POST /api/upload` returns `{ success: false, errors: [{ field: "Team", message: "Team \"X\" is not registered..." }] }` with status 400
- No mechanism for user to confirm and proceed

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed upload endpoint returns a 409 confirmation response and the confirm endpoint creates teams and ingests data.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  response := POST /api/upload(input.file)
  ASSERT response.status == 409
  ASSERT response.body.requiresConfirmation == true
  ASSERT response.body.newTeams CONTAINS ALL unregistered team names
  ASSERT response.body.pendingUploadId IS NOT NULL

  confirmResponse := POST /api/upload/confirm({ pendingUploadId, confirmed: true })
  ASSERT confirmResponse.status == 200
  ASSERT confirmResponse.body.success == true
  ASSERT confirmResponse.body.rowsIngested == input.rowCount
  FOR EACH teamName IN response.body.newTeams DO
    ASSERT teamRepo.getByNameAndFunction(teamName, input.functionId) IS NOT NULL
  END FOR
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed upload endpoint produces the same result as the original — either 200 success or 400 validation error.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT POST_original(input) == POST_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many valid upload payloads (with all teams registered) and verifies they produce 200 success
- It generates payloads with various validation errors (bad format, bad headers, empty teams) and verifies they still produce 400
- It catches edge cases like mixed-case team names, whitespace-only teams, and boundary file sizes

**Test Plan**: Observe behavior on UNFIXED code first for uploads with registered teams, then write property-based tests capturing that behavior remains unchanged after the fix.

**Test Cases**:
1. **All Registered Teams Preservation**: Upload files with only registered teams → still returns 200 with `rowsIngested`
2. **Empty Team Error Preservation**: Upload files with blank Team values → still returns 400 with "Team is required and cannot be empty"
3. **File Format Error Preservation**: Upload invalid file formats → still returns 400 with format errors
4. **Function Mismatch Preservation**: Upload files with wrong function → still returns 400 with function errors

### Unit Tests

- `validateTeamMembership` returns `newTeams` array for unregistered non-empty teams
- `validateTeamMembership` still returns errors for empty/blank teams
- `validateTeamMembership` returns empty `newTeams` when all teams are registered
- Pending upload storage: create, retrieve, delete, expiry
- Confirm endpoint: creates teams, ingests rows, returns success
- Confirm endpoint: declines gracefully, deletes pending record
- Confirm endpoint: rejects expired or missing `pendingUploadId`

### Property-Based Tests

- Generate random sets of team names (mix of registered and unregistered); verify that the validation service correctly partitions them into `errors` (empty/blank) and `newTeams` (unregistered non-empty)
- Generate random valid upload payloads with all teams registered; verify the full pipeline still returns 200 success (preservation)
- Generate random `pendingUploadId` tokens and confirm that invalid/expired tokens produce appropriate error responses

### Integration Tests

- Full flow: upload with new team → receive 409 → confirm → 200 success → verify team exists in DB → verify rows ingested
- Full flow: upload with new team → receive 409 → decline → verify no team created → verify no rows ingested
- Full flow: upload with new team + other validation errors → verify 400 with validation errors (not 409)
- Full flow: upload with all registered teams → verify 200 immediately (no confirmation step)
- Expiry: upload with new team → wait past TTL → confirm → verify 410 Gone response
- Frontend integration: verify modal renders with correct team names, confirm button triggers API call, cancel button resets state
