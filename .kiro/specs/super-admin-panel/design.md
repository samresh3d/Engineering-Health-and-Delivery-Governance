# Design Document: Super Admin Panel

## Architecture Overview

This feature extends the existing Engineering Health & Delivery Governance Platform with three major capabilities: branded logo integration, a login page with role-based authentication flow, and a full Super Admin Panel. The architecture follows the existing monorepo pattern with a React 18/TypeScript client (Vite) and Express/TypeScript server (better-sqlite3).

### High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Client (React 18 + TypeScript + Vite)                         │
│                                                                │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────────────┐   │
│  │  Login   │  │  Dashboard │  │  Admin Panel (Super_Admin)│   │
│  │  Page    │  │  + Upload  │  │  ┌─────────┐ ┌────────┐  │   │
│  │          │  │  (existing)│  │  │Sidebar  │ │Content │  │   │
│  └──────────┘  └────────────┘  │  │Nav      │ │Area    │  │   │
│                                │  └─────────┘ └────────┘  │   │
│                                └──────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Auth Guard (ProtectedRoute) + React Router v6          │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
                           │ HTTP (Bearer JWT)
┌────────────────────────────────────────────────────────────────┐
│  Server (Express + TypeScript)                                 │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  RBAC Middleware (updated: +Super_Admin, +/api/admin/*) │    │
│  └────────────────────────────────────────────────────────┘    │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────────┐   │
│  │auth.routes│ │existing  │ │  admin.routes (NEW)          │   │
│  │(+mock-   │ │routes    │ │  GET /analytics              │   │
│  │ users)   │ │          │ │  GET/POST /entries           │   │
│  └──────────┘ └──────────┘ │  PUT/DELETE /entries/:id     │   │
│                            │  GET /teams, /teams/:name    │   │
│                            └──────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  admin.repository.ts (NEW) — better-sqlite3 queries     │    │
│  └────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  SQLite DB (+ migration 002: Super_Admin CHECK update)  │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

## Components

### Server-Side Components

#### 1. Database Migration (`002-add-super-admin-role.ts`)

Alters the `users` table CHECK constraint to include `Super_Admin`:

```typescript
// server/src/database/migrations/002-add-super-admin-role.ts
import type Database from 'better-sqlite3';

export const id = '002-add-super-admin-role';
export const description = 'Add Super_Admin role to users table CHECK constraint';

export function up(db: Database.Database): void {
  // SQLite doesn't support ALTER TABLE to modify CHECK constraints.
  // Recreate the table with the updated constraint.
  db.exec(`
    CREATE TABLE users_new (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      role TEXT CHECK(role IN ('Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin')) NOT NULL,
      token TEXT NOT NULL
    );
    INSERT INTO users_new SELECT * FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `);
}
```

#### 2. Updated Seed Data (`seed.ts`)

Add Super_Admin mock user to the `MOCK_USERS` array:

```typescript
const MOCK_USERS = [
  { userId: 'user-admin-001', username: 'admin', role: 'Admin' as const },
  { userId: 'user-em-001', username: 'eng_manager', role: 'Engineering_Manager' as const },
  { userId: 'user-dm-001', username: 'del_manager', role: 'Delivery_Manager' as const },
  { userId: 'user-lead-001', username: 'leadership', role: 'Leadership' as const },
  { userId: 'user-sa-001', username: 'super_admin', role: 'Super_Admin' as const },
];
```

#### 3. Updated Types (`server/src/types/index.ts`)

```typescript
/** Decoded JWT token payload */
export interface DecodedToken {
  userId: string;
  role: 'Admin' | 'Engineering_Manager' | 'Delivery_Manager' | 'Leadership' | 'Super_Admin';
  iat: number;
  exp: number;
}
```

#### 4. Updated RBAC Middleware (`server/src/middleware/rbac.ts`)

Add Super_Admin to all existing route permissions and add exclusive `/api/admin/*` route:

```typescript
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/api/upload': ['Admin', 'Engineering_Manager', 'Super_Admin'],
  '/api/dashboard/*': ['Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin'],
  '/api/config/*': ['Admin', 'Super_Admin'],
  '/api/reports/*': ['Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin'],
  '/api/filters/*': ['Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin'],
  '/api/admin/*': ['Super_Admin'],
};
```

#### 5. Admin Repository (`server/src/repositories/admin.repository.ts`)

```typescript
import type Database from 'better-sqlite3';
import { getDatabase } from '../database/connection';

export interface AdminAnalytics {
  totalTeams: number;
  totalEntries: number;
  recentUploads: number;
  pendingItems: number;
}

export interface TeamSummary {
  team: string;
  portfolio: string;
  entryCount: number;
}

export interface TeamDetail {
  team: string;
  portfolio: string;
  totalEntries: number;
  distinctProjects: number;
  entries: SprintDataRow[];
}

export interface PaginatedEntries {
  entries: SprintDataRow[];
  total: number;
  limit: number;
  offset: number;
}

export class AdminRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  getAnalytics(): AdminAnalytics { /* ... */ }
  getTeams(search?: string, portfolio?: string): TeamSummary[] { /* ... */ }
  getTeamDetail(teamName: string): TeamDetail | null { /* ... */ }
  getEntries(limit: number, offset: number, sort?: string): PaginatedEntries { /* ... */ }
  createEntry(data: Partial<SprintDataRow>): SprintDataRow { /* ... */ }
  updateEntry(id: number, data: Partial<SprintDataRow>): SprintDataRow | null { /* ... */ }
  deleteEntry(id: number): boolean { /* ... */ }
}
```

#### 6. Admin Routes (`server/src/routes/admin.routes.ts`)

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { AdminRepository } from '../repositories/admin.repository';

const router = Router();
const adminRepo = new AdminRepository();

// GET /api/admin/analytics
router.get('/analytics', (req, res, next) => { /* ... */ });

// GET /api/admin/teams
router.get('/teams', (req, res, next) => { /* ... */ });

// GET /api/admin/teams/:teamName
router.get('/teams/:teamName', (req, res, next) => { /* ... */ });

// GET /api/admin/entries
router.get('/entries', (req, res, next) => { /* ... */ });

// POST /api/admin/entries
router.post('/entries', (req, res, next) => { /* ... */ });

// PUT /api/admin/entries/:id
router.put('/entries/:id', (req, res, next) => { /* ... */ });

// DELETE /api/admin/entries/:id
router.delete('/entries/:id', (req, res, next) => { /* ... */ });

export default router;
```

#### 7. Zod Validation Schemas (`server/src/validators/admin.validators.ts`)

```typescript
import { z } from 'zod';

export const createEntrySchema = z.object({
  team: z.string().min(1, 'team is required'),
  track: z.string().min(1, 'track is required'),
  project: z.string().min(1, 'project is required'),
  portfolio: z.string().min(1, 'portfolio is required'),
  jiraId: z.string().min(1, 'jiraId is required'),
  sno: z.number().nullable().optional(),
  status: z.string().nullable().optional(),
  itemsList: z.string().nullable().optional(),
  walkthroughGivenOn: z.string().nullable().optional(),
  estimatedEffortWithAi: z.number().nullable().optional(),
  estimatedEffortWithoutAi: z.number().nullable().optional(),
  actualEffortWithAi: z.number().nullable().optional(),
  aiUsed: z.enum(['Y', 'N']).nullable().optional(),
  devStartDate: z.string().nullable().optional(),
  devEndDate: z.string().nullable().optional(),
  developmentStatus: z.string().nullable().optional(),
  uatDeliveryDate: z.string().nullable().optional(),
  uatDeliveryTarget: z.string().nullable().optional(),
  resources: z.string().nullable().optional(),
  goLivePlannedDate: z.string().nullable().optional(),
  goLiveDate: z.string().nullable().optional(),
  productionStatus: z.string().nullable().optional(),
  rollback: z.enum(['Y', 'N']).nullable().optional(),
  rollbackReason: z.string().nullable().optional(),
  storyDropReason: z.string().nullable().optional(),
});

export const updateEntrySchema = createEntrySchema.partial();

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(25),
  offset: z.coerce.number().min(0).default(0),
  sort: z.string().optional(),
});
```

### Client-Side Components

#### 8. Auth Utilities (`client/src/auth/index.ts`)

```typescript
export interface AuthUser {
  userId: string;
  username: string;
  role: 'Admin' | 'Engineering_Manager' | 'Delivery_Manager' | 'Leadership' | 'Super_Admin';
  token: string;
}

export function getStoredToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem('auth_user');
  return raw ? JSON.parse(raw) : null;
}

export function setAuth(user: AuthUser): void {
  localStorage.setItem('auth_token', user.token);
  localStorage.setItem('auth_user', JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
}

export function isAuthenticated(): boolean {
  const token = getStoredToken();
  return !!token && token.length > 20;
}

export function isSuperAdmin(): boolean {
  const user = getStoredUser();
  return user?.role === 'Super_Admin';
}
```

#### 9. Protected Route Component (`client/src/components/ProtectedRoute.tsx`)

```typescript
import { Navigate } from 'react-router-dom';
import { isAuthenticated, isSuperAdmin } from '../auth';

interface Props {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
}

export function ProtectedRoute({ children, requireSuperAdmin = false }: Props) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  if (requireSuperAdmin && !isSuperAdmin()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
```

#### 10. Login Page (`client/src/pages/Login.tsx`)

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAuth, AuthUser } from '../auth';
import { colors } from '../theme';
import logo from '../logo.svg';

export default function Login() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [selected, setSelected] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    fetch('http://localhost:3000/api/auth/mock-users')
      .then(res => res.json())
      .then(data => setUsers(data.users));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.userId === selected);
    if (user) {
      setAuth(user);
      navigate('/');
    }
  };

  return (
    <div style={{ /* centered card layout with brand styling */ }}>
      <img src={logo} alt="Engineering Health Platform" style={{ height: '48px' }} />
      <h1>Engineering Health Platform</h1>
      <form onSubmit={handleSubmit}>
        <select value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">Select user...</option>
          {users.map(u => (
            <option key={u.userId} value={u.userId}>
              {u.username} ({u.role})
            </option>
          ))}
        </select>
        <button type="submit" disabled={!selected}>Sign In</button>
      </form>
    </div>
  );
}
```

#### 11. Admin Panel Layout (`client/src/pages/admin/AdminLayout.tsx`)

```typescript
import { Outlet, NavLink } from 'react-router-dom';
import { getStoredUser } from '../../auth';
import { colors } from '../../theme';

const NAV_ITEMS = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/admin/teams', label: 'Teams', icon: '👥' },
  { path: '/admin/entries', label: 'Entries', icon: '📋' },
  { path: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

export default function AdminLayout() {
  const user = getStoredUser();

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
      {/* Sidebar */}
      <aside style={{
        width: '240px',
        background: colors.secondary,
        borderRight: `1px solid ${colors.border}`,
        padding: '24px 0',
        position: 'sticky',
        top: '64px',
        height: 'calc(100vh - 64px)',
      }}>
        <div style={{ padding: '0 16px 24px', borderBottom: `1px solid ${colors.border}` }}>
          <p>{user?.username}</p>
          <span>{user?.role}</span>
        </div>
        <nav>
          {NAV_ITEMS.map(item => (
            <NavLink key={item.path} to={item.path}
              style={({ isActive }) => ({
                display: 'block',
                padding: '12px 24px',
                color: isActive ? colors.primary : colors.text,
                background: isActive ? colors.primaryLight : 'transparent',
                textDecoration: 'none',
                fontWeight: isActive ? 600 : 400,
                borderLeft: isActive ? `3px solid ${colors.primary}` : '3px solid transparent',
              })}
            >
              {item.icon} {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Content Area */}
      <main style={{ flex: 1, padding: '24px 32px' }}>
        <Outlet />
      </main>
    </div>
  );
}
```

#### 12. Admin Dashboard Page (`client/src/pages/admin/AdminDashboard.tsx`)

Displays 4 stat cards (total teams, total entries, recent uploads, pending items) fetched from `/api/admin/analytics`. Uses Recharts for optional trend visualizations and theme colors for cards.

#### 13. Admin Teams Page (`client/src/pages/admin/AdminTeams.tsx`)

Displays searchable, filterable team list. Text search uses case-insensitive partial matching. Portfolio dropdown filters by portfolio. Clicking a team navigates to `/admin/teams/:teamName`.

#### 14. Admin Entries Page (`client/src/pages/admin/AdminEntries.tsx`)

Uses AG Grid with:
- Paginated data (limit/offset via API)
- Sortable columns
- Inline editing: custom cell renderer toggles cells to inputs on edit click
- Save/Cancel buttons per row in edit mode
- Delete with confirmation modal
- "Add Entry" button opening a form modal

#### 15. Admin Settings Page (`client/src/pages/admin/AdminSettings.tsx`)

Placeholder page with "Settings coming soon" message and platform info.

### Routing Structure

Updated `App.tsx` routing with React Router v6:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminTeams from './pages/admin/AdminTeams';
import AdminTeamDetail from './pages/admin/AdminTeamDetail';
import AdminEntries from './pages/admin/AdminEntries';
import AdminSettings from './pages/admin/AdminSettings';

// Route tree
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
    <Route index element={<Dashboard />} />
    <Route path="upload" element={<Upload />} />
  </Route>
  <Route path="/admin" element={<ProtectedRoute requireSuperAdmin><AdminLayout /></ProtectedRoute>}>
    <Route index element={<Navigate to="/admin/dashboard" replace />} />
    <Route path="dashboard" element={<AdminDashboard />} />
    <Route path="teams" element={<AdminTeams />} />
    <Route path="teams/:teamName" element={<AdminTeamDetail />} />
    <Route path="entries" element={<AdminEntries />} />
    <Route path="settings" element={<AdminSettings />} />
  </Route>
</Routes>
```

## Interfaces

### API Contracts

#### GET `/api/admin/analytics`

**Response:**
```typescript
interface AnalyticsResponse {
  totalTeams: number;
  totalEntries: number;
  recentUploads: number;  // uploads in last 7 days
  pendingItems: number;   // entries with null/empty development_status
}
```

#### GET `/api/admin/teams?search=&portfolio=`

**Response:**
```typescript
interface TeamsResponse {
  teams: Array<{
    team: string;
    portfolio: string;
    entryCount: number;
  }>;
}
```

#### GET `/api/admin/teams/:teamName`

**Response:**
```typescript
interface TeamDetailResponse {
  team: string;
  portfolio: string;
  totalEntries: number;
  distinctProjects: number;
  entries: SprintDataRow[];
}
```

**Error (404):**
```typescript
{ error: 'Team not found' }
```

#### GET `/api/admin/entries?limit=25&offset=0&sort=id`

**Response:**
```typescript
interface EntriesResponse {
  entries: SprintDataRow[];
  total: number;
  limit: number;
  offset: number;
}
```

#### POST `/api/admin/entries`

**Request Body:** `CreateEntryPayload` (validated by `createEntrySchema`)
**Response (201):** Created `SprintDataRow` with assigned ID.
**Error (400):**
```typescript
{ error: 'Validation failed', details: Array<{ field: string; message: string }> }
```

#### PUT `/api/admin/entries/:id`

**Request Body:** `Partial<CreateEntryPayload>` (validated by `updateEntrySchema`)
**Response (200):** Updated `SprintDataRow`.
**Error (404):** `{ error: 'Entry not found' }`
**Error (400):** `{ error: 'Validation failed', details: [...] }`

#### DELETE `/api/admin/entries/:id`

**Response (200):** `{ success: true, id: number }`
**Error (404):** `{ error: 'Entry not found' }`

## Data Models

### Updated Users Table Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  role TEXT CHECK(role IN ('Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership', 'Super_Admin')) NOT NULL,
  token TEXT NOT NULL
);
```

### Client Auth Storage

```
localStorage:
  auth_token: string (JWT)
  auth_user: JSON string of { userId, username, role, token }
```

## Error Handling

### Server-Side

| Scenario | Status | Response Body |
|----------|--------|---------------|
| No token provided | 401 | `{ error: 'Authentication required. No token provided.' }` |
| Invalid/expired token | 401 | `{ error: 'Authentication failed. Invalid token.' }` |
| Insufficient role | 403 | `{ error: 'Forbidden. Insufficient permissions for this resource.' }` |
| Entry not found | 404 | `{ error: 'Entry not found' }` |
| Team not found | 404 | `{ error: 'Team not found' }` |
| Validation failure | 400 | `{ error: 'Validation failed', details: [{ field, message }] }` |
| Internal error | 500 | `{ error: 'Internal server error' }` |

### Client-Side

- API errors display inline toast/banner messages with the error text
- Failed CRUD operations revert the row to its pre-edit state
- Network errors show a generic "Connection failed" message
- Loading states show skeleton/spinner indicators in place of content

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Unauthenticated access redirects to login

*For any* route path that is not `/login`, if no valid auth token is present in localStorage, navigating to that path shall result in a redirect to `/login`.

**Validates: Requirements 2.1**

### Property 2: Login stores credentials for any selected user

*For any* mock user returned by the `/api/auth/mock-users` endpoint, selecting that user and submitting the login form shall result in both `auth_token` containing that user's JWT token and `auth_user` containing a JSON object with that user's `userId`, `username`, and `role`.

**Validates: Requirements 2.3, 2.4**

### Property 3: Valid token grants access without re-authentication

*For any* valid JWT token stored in localStorage, navigating to a protected route shall render the page content without redirecting to the login page.

**Validates: Requirements 2.6**

### Property 4: Super_Admin has access to all protected routes

*For any* route in the set of existing protected route patterns (`/api/upload`, `/api/dashboard/*`, `/api/config/*`, `/api/reports/*`, `/api/filters/*`, `/api/admin/*`), a request bearing a valid Super_Admin JWT token shall not receive a 403 Forbidden response.

**Validates: Requirements 3.2, 3.3**

### Property 5: Non-Super_Admin users are denied admin access

*For any* role in `{Admin, Engineering_Manager, Delivery_Manager, Leadership}` and *for any* route path matching `/api/admin/*`, a request bearing a valid JWT token with that role shall receive a 403 Forbidden response.

**Validates: Requirements 3.4, 4.2, 4.4**

### Property 6: Team search filtering is correct

*For any* search query string and *for any* portfolio filter value applied to the teams list, all returned teams shall satisfy both: (a) the team name contains the search query as a case-insensitive substring, and (b) if a portfolio filter is specified, the team belongs to that portfolio. No team matching both criteria shall be excluded from results.

**Validates: Requirements 6.2, 6.3**

### Property 7: Analytics counts are accurate

*For any* state of the sprint_data and uploads tables, the `/api/admin/analytics` endpoint shall return: `totalTeams` equal to `COUNT(DISTINCT team)` from sprint_data, `totalEntries` equal to `COUNT(*)` from sprint_data, `recentUploads` equal to the count of uploads with `uploaded_at` within the last 7 days, and `pendingItems` equal to the count of sprint_data entries where `development_status` is NULL or empty string.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 9.1**

### Property 8: Teams endpoint returns accurate summaries

*For any* state of the sprint_data table, the `/api/admin/teams` endpoint shall return one entry per distinct team value, and each entry's `entryCount` shall equal the actual number of sprint_data rows with that team value.

**Validates: Requirements 6.1, 9.2**

### Property 9: Team detail returns only that team's entries

*For any* team name present in the sprint_data table, the `/api/admin/teams/:teamName` endpoint shall return all entries belonging to that team and no entries belonging to other teams.

**Validates: Requirements 9.3**

### Property 10: Pagination returns correct slices

*For any* valid `limit` (1–100) and `offset` (≥ 0) values, the `/api/admin/entries` endpoint shall return at most `limit` entries starting from position `offset` in the ordered result set, and the `total` field shall equal the total count of all entries regardless of pagination.

**Validates: Requirements 9.4**

### Property 11: CRUD round-trip preserves data

*For any* valid sprint data entry payload, creating it via POST `/api/admin/entries` and then retrieving it via GET `/api/admin/entries` shall return an entry with all submitted field values preserved. Updating a field via PUT and re-fetching shall reflect the updated value. Deleting via DELETE shall cause the entry to no longer appear in subsequent GET requests.

**Validates: Requirements 9.5, 9.6, 9.7**

### Property 12: Non-existent entry IDs return 404

*For any* integer ID that does not exist in the sprint_data table, both PUT `/api/admin/entries/:id` and DELETE `/api/admin/entries/:id` shall return a 404 status code.

**Validates: Requirements 9.8**

### Property 13: Invalid payloads return 400 with field errors

*For any* request payload sent to POST `/api/admin/entries` or PUT `/api/admin/entries/:id` that is missing a required field (team, track, project, portfolio, jiraId) or contains a value of incorrect type, the endpoint shall return a 400 status code with a response body containing field-level error details.

**Validates: Requirements 9.9**

### Property 14: Failed CRUD operations preserve client state

*For any* CRUD operation (create, update, delete) that results in an API error response, the client-side table data shall remain in its pre-operation state with no rows added, modified, or removed.

**Validates: Requirements 7.11**
