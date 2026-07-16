# Design Document: Dashboard, Reports & Data Management Enhancements

## Overview

This design consolidates the Dashboard as the single analytics hub, removes the standalone Analytics page, introduces data-backed month selection, adds bulk delete for uploads, and provides a function-wise upload view — all governed by consistent role-based data scoping enforced at the API layer.

## Architecture

The feature follows the existing layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│  Client (React + Vite)                                       │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │Dashboard │  │  History Page │  │  Shared Components    │  │
│  │(EM/Lead) │  │(Uploads/Func)│  │  KpiTrendChart        │  │
│  │          │  │              │  │  TeamComparisonTable   │  │
│  │          │  │              │  │  MonthPicker           │  │
│  └──────────┘  └──────────────┘  └───────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (JWT Bearer)
┌────────────────────────┴────────────────────────────────────┐
│  Server (Express + TypeScript)                               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │RBAC Middleware│ │DataScope     │  │ Routes             │  │
│  │(auth+role)   │ │Middleware    │  │ dashboard.routes   │  │
│  │              │ │(function     │  │ history.routes     │  │
│  │              │ │ scoping)     │  │ em-teams.routes    │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Repositories (better-sqlite3)                           │ │
│  │  UploadRepository | SprintDataRepository                 │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Analytics Page Removal

**Files affected:**
- `client/src/App.tsx` — Remove `/analytics` route, add redirect to `/`
- `client/src/App.tsx` — Remove analytics links from `getNavLinks()` for all roles
- `client/src/pages/Analytics.tsx` — File retained but no longer routed (components reused)

**Routing change:**
```typescript
// Before: <Route path="analytics" element={<Analytics />} />
// After:  <Route path="analytics" element={<Navigate to="/" replace />} />
```

**Navigation update:**
All role entries in `getNavLinks()` will have analytics/reports links removed. The Dashboard itself will contain all analytics content.

### 2. Dashboard Consolidation

**LeadershipDashboard.tsx enhancements:**
- Import and render `KpiTrendChart` with cross-function data
- Import and render `TeamComparisonTable` with cross-function data
- Add function filter dropdown (populated from `/api/admin/functions`)
- Wire the `MonthPicker` component with data-backed months

**EmDashboard.tsx enhancements:**
- Import and render `KpiTrendChart` scoped to EM's function
- Replace static month picker with data-backed `MonthPicker`
- Remove the manual `monthOptions` generation; use API-backed months

**New component: `DataBackedMonthPicker.tsx`**
```typescript
interface DataBackedMonthPickerProps {
  selectedMonth: string;          // YYYY-MM
  onMonthChange: (month: string) => void;
  availableMonths: string[];      // from API
}
```

### 3. Available Months API Enhancement

**Endpoint:** `GET /api/dashboard/available-months`

This is a new endpoint on `dashboard.routes.ts` that serves both EM and Leadership roles, applying role-based scoping via the authenticated user context.

```typescript
interface AvailableMonthsResponse {
  success: boolean;
  months: string[];  // YYYY-MM, sorted descending
}
```

**Scoping logic:**
```typescript
function getAvailableMonths(user: AuthenticatedRequest['user']): string[] {
  if (user.role === 'Engineering_Manager') {
    // Query sprint_data WHERE function_name = user's function
    // Extract distinct YYYY-MM from dev_start_date
  } else {
    // Leadership, Super_Admin, Delivery_Manager
    // Query sprint_data across all functions
    // Extract distinct YYYY-MM from dev_start_date
  }
}
```

### 4. Bulk Delete Uploads

**New endpoint:** `DELETE /api/uploads/bulk`

```typescript
interface BulkDeleteRequest {
  uploadIds: string[];  // UUIDs of uploads to delete
}

interface BulkDeleteResponse {
  success: boolean;
  deletedCount: number;
  message: string;
}
```

**Authorization logic:**
- Engineering_Manager: Server validates each upload belongs to the EM's function before deletion. Rejects the entire request if any upload is out of scope.
- Super_Admin: No function restriction; all uploads deletable.
- Other roles: 403 Forbidden.

**Cascade logic (within a transaction):**
```typescript
function bulkDeleteUploads(uploadIds: string[], user: AuthenticatedUser): void {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    // 1. Validate authorization (EM: check function_name on sprint_data)
    // 2. DELETE FROM sprint_data WHERE upload_id IN (...)
    // 3. DELETE FROM uploads WHERE id IN (...)
  });
  transaction();
}
```

**Client-side:**
- Add checkbox column to uploads table in `History.tsx`
- Track `selectedUploadIds: Set<string>` state
- "Delete Selected" button appears when `selectedUploadIds.size > 0`
- Confirmation modal shows count before executing

### 5. Function-Wise Upload View

**New endpoint:** `GET /api/uploads/by-function`

```typescript
interface FunctionGroup {
  functionName: string;
  uploads: Array<{
    id: string;
    fileName: string;
    uploaderName: string;  // resolved from users table
    rowsIngested: number;
    status: string;
    uploadedAt: string;
  }>;
}

interface ByFunctionResponse {
  success: boolean;
  data: FunctionGroup[];
}
```

**Query logic:**
```sql
SELECT u.id, u.file_name, u.rows_ingested, u.status, u.uploaded_at,
       usr.name as uploader_name,
       sd.function_name
FROM uploads u
JOIN users usr ON u.uploaded_by = usr.id
JOIN sprint_data sd ON sd.upload_id = u.id
WHERE (function_scope_clause)
GROUP BY u.id, sd.function_name
ORDER BY sd.function_name, u.uploaded_at DESC
```

**Client-side:**
- Add "By Function" tab to `History.tsx` view mode toggle
- New `ViewMode` type: `'uploads' | 'entries' | 'byFunction'`
- Render grouped sections with function name headings and EM names

### 6. Role-Based Data Scoping (Server-Side Enforcement)

**New middleware: `dataScopeMiddleware`**

Applied to dashboard and history routes, this middleware enriches the request with scoping parameters that downstream handlers use for queries.

```typescript
interface DataScope {
  functionName: string | null;  // null = all functions (Leadership/Super_Admin)
  functionId: number | null;
}

function dataScopeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  const { role, functionId } = authReq.user;

  if (role === 'Engineering_Manager') {
    // Resolve functionName from functionId, attach to request
    // This scope is MANDATORY and cannot be overridden by query params
  } else {
    // Leadership, Super_Admin, Delivery_Manager: no mandatory scope
    // Allow optional functionName query param for filtering
  }
  next();
}
```

**Key principle:** The server never trusts client-provided `functionName` for EM users. Even if an EM sends `?functionName=OtherFunction`, the server resolves their actual assignment from the database.

## Data Models

### Existing Tables (no schema changes)

```sql
-- uploads table
CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,  -- FK to users.id
  rows_ingested INTEGER DEFAULT 0,
  status TEXT NOT NULL,       -- 'processing' | 'success' | 'failed'
  error_message TEXT,
  uploaded_at TEXT NOT NULL
);

-- sprint_data table (relevant columns)
CREATE TABLE sprint_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id TEXT,             -- FK to uploads.id
  function_name TEXT,
  team TEXT,
  dev_start_date TEXT,        -- DD-MM-YYYY format
  ...
);

-- users table (relevant columns)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT,
  role TEXT,
  function_id INTEGER,        -- FK to functions.id
  team_id TEXT
);
```

### No new tables required

All features work with existing schema. The `function_name` in `sprint_data` and `function_id` in `users` provide the necessary linkage for scoping.

### API Interfaces

#### New API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/dashboard/available-months` | All dashboard roles | Returns data-backed months, scoped by role |
| DELETE | `/api/uploads/bulk` | EM, Super_Admin | Bulk delete uploads with cascade |
| GET | `/api/uploads/by-function` | All history roles | Uploads grouped by function |

#### Modified API Endpoints

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/dashboard/kpis` | Add server-side function scoping enforcement |
| GET | `/api/dashboard/trends` | Add server-side function scoping enforcement |

#### Client Interfaces

```typescript
// DataBackedMonthPicker props
interface DataBackedMonthPickerProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  availableMonths: string[];
}

// Bulk delete selection state
interface BulkDeleteState {
  selectedIds: Set<string>;
  isConfirmDialogOpen: boolean;
  isDeleting: boolean;
}

// Function view tab data
interface FunctionGroupView {
  functionName: string;
  uploads: UploadWithUploaderName[];
}
```

## Error Handling

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| EM tries to delete other function's upload | 403 | `{ error: "Forbidden. Upload does not belong to your function." }` |
| Bulk delete with empty array | 400 | `{ error: "At least one upload ID is required." }` |
| Bulk delete with invalid UUID | 400 | `{ error: "Invalid upload ID format." }` |
| Upload not found during delete | 404 | `{ error: "One or more uploads not found." }` |
| Database transaction failure | 500 | `{ error: "Bulk delete failed. No records were modified." }` |
| No function assigned (EM) | 400 | `{ error: "No function assigned to your account." }` |

**Transaction safety:** Bulk delete uses a SQLite transaction. If any step fails, the entire operation rolls back — no partial deletes occur.

## Testing Strategy

### Unit Tests
- Navigation link generation (`getNavLinks`) for each role — verify no analytics links
- `DataBackedMonthPicker` rendering with various available months arrays
- Bulk delete confirmation dialog displays correct count
- Function view tab rendering with grouped data
- Redirect behavior when navigating to `/analytics`

### Property-Based Tests
- Role-based data scoping: generate random users with various roles/functions and verify API response boundaries
- Available months correctness: generate random sprint_data sets and verify month extraction matches actual data
- Bulk delete integrity: generate random upload sets, delete subsets, verify cascade
- Bulk delete authorization: generate EM users with function assignments, attempt cross-function deletes
- Server-side enforcement: generate EM requests with tampered query params, verify scoping holds
- Function view grouping: generate uploads across functions, verify correct grouping
- Dashboard filter consistency: apply random function filters, verify all response sections match

### Integration Tests
- End-to-end bulk delete flow with real SQLite transactions
- Dashboard rendering with KpiTrendChart and TeamComparisonTable for Leadership
- Redirect from `/analytics` to `/` in the router
- Month picker populated from actual API response

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Navigation contains no analytics references for any role

*For any* valid user role in the system (Engineering_Manager, Leadership, Super_Admin, Delivery_Manager, Admin), the navigation link set produced by `getNavLinks(role)` shall contain no link with path `/analytics` and no link labeled "Analytics".

**Validates: Requirements 1.2**

### Property 2: Role-based data scoping on all API responses

*For any* authenticated user with role Engineering_Manager and an assigned function F, all records returned by dashboard and history API endpoints shall have `function_name` equal to F. Conversely, for any user with role Leadership, Super_Admin, or Delivery_Manager, the API shall return records spanning all functions that contain data.

**Validates: Requirements 1.6, 1.7, 5.1, 5.2, 5.3, 5.4, 5.5, 4.4, 4.5**

### Property 3: Server-side scoping ignores unauthorized client parameters

*For any* authenticated Engineering_Manager user with assigned function F, if the client sends a request with a `functionName` query parameter set to a value G (where G ≠ F), the API shall still return only records belonging to function F and never records from function G.

**Validates: Requirements 5.6, 5.7**

### Property 4: Available months reflect actual data presence

*For any* database state and any authenticated user, every month string M returned by the available-months API shall correspond to at least one `sprint_data` record with a `dev_start_date` in month M within the user's authorized scope. Additionally, for any month M not returned, there shall be no `sprint_data` record with `dev_start_date` in month M within the user's authorized scope.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 5: Bulk delete cascade integrity

*For any* set of upload IDs successfully deleted via the bulk delete endpoint, after the operation completes: (a) no row in the `uploads` table shall have an `id` matching any deleted upload ID, and (b) no row in the `sprint_data` table shall have an `upload_id` matching any deleted upload ID.

**Validates: Requirements 3.5, 3.6**

### Property 6: Bulk delete authorization boundary

*For any* Engineering_Manager user with assigned function F and any set of upload IDs submitted for deletion, if any upload ID corresponds to a record whose associated `sprint_data` has `function_name` ≠ F, the entire bulk delete request shall be rejected with an authorization error and no records shall be modified. For any Super_Admin user, the bulk delete shall succeed regardless of function assignment.

**Validates: Requirements 3.7, 3.8, 3.9**

### Property 7: Function view grouping correctness

*For any* set of upload records returned by the by-function endpoint, each record shall appear under exactly the function heading matching its associated `sprint_data.function_name`, and each record shall include a non-empty `uploaderName` field resolved from the `users` table.

**Validates: Requirements 4.2, 4.3**

### Property 8: Dashboard filter consistency

*For any* function filter F applied by a Leadership or Super_Admin user on the Dashboard, all data returned by the KPI, trend, and comparison endpoints shall exclusively contain records where `function_name` equals F, and no records from other functions shall appear in any response.

**Validates: Requirements 6.4, 6.5**
