# Design Document: Engineering Delivery Governance

## Overview

This feature extends the existing Engineering Health platform with a comprehensive governance layer. It introduces a Leadership Dashboard with executive KPIs and progressive accordion drill-down, renames "track" to "division" at the API/UI layer, enables Engineering Manager division CRUD, and implements client-side instant period switching using pre-fetched datasets. The implementation builds on the existing Express + TypeScript + SQLite server and React + TypeScript + Vite client with no database schema changes.

## Architecture

This feature extends the existing Engineering Health platform with a governance layer built on the current Express + TypeScript server and React + TypeScript client. The architecture follows the established layered pattern: Routes → Services → Repositories, with new components slotted into existing infrastructure.

**Key Architectural Decisions:**
- "Division" is a presentation-layer rename of the existing `track` database column — no schema migration required
- Leadership Dashboard is a new page component with accordion-based progressive drill-down
- EM Dashboard extends the current Dashboard page with division-scoped views
- Period switching uses a single API call returning all aggregations (month/quarter/year) for client-side instant filtering
- Health Score is a pure computation added to the existing KpiEngineService

```
┌─────────────────────────────────────────────────────────────┐
│  React Client (Vite + React Router v6)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Leadership   │  │ EM Dashboard │  │ Division Manager │  │
│  │ Dashboard    │  │ (extended)   │  │ (CRUD UI)        │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                  │                    │            │
│  ┌──────┴──────────────────┴────────────────────┴────────┐  │
│  │  Period Switcher  │  Drill-Down State  │  API Client   │  │
│  └──────────────────────────────────────────────┬────────┘  │
└─────────────────────────────────────────────────┼───────────┘
                                                  │ HTTP/JSON
┌─────────────────────────────────────────────────┼───────────┐
│  Express Server                                 │           │
│  ┌──────────────────────────────────────────────┴────────┐  │
│  │  RBAC Middleware + Data Scope Middleware               │  │
│  └──────┬───────────────────────────────────┬────────────┘  │
│  ┌──────┴──────────┐  ┌────────────────────┴─────────────┐  │
│  │ Governance      │  │ Division Routes                   │  │
│  │ Dashboard Route │  │ /api/divisions/*                  │  │
│  └──────┬──────────┘  └────────────────────┬─────────────┘  │
│  ┌──────┴──────────────────────────────────┴─────────────┐  │
│  │  Services Layer                                        │  │
│  │  ┌──────────────┐ ┌────────────┐ ┌─────────────────┐  │  │
│  │  │ KpiEngine    │ │ Division   │ │ Authorization   │  │  │
│  │  │ (+ Health    │ │ Service    │ │ Service         │  │  │
│  │  │  Score)      │ │ (new)      │ │ (extended)      │  │  │
│  │  └──────┬───────┘ └─────┬──────┘ └────────────────┘   │  │
│  └─────────┼───────────────┼─────────────────────────────┘  │
│  ┌─────────┴───────────────┴─────────────────────────────┐  │
│  │  Repositories (SQLite / better-sqlite3)                │  │
│  │  sprint_data | track_portfolio_mapping | audit_logs    │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Server-Side Components

#### 1. DivisionService (New)

Responsible for CRUD operations on divisions (track values) within a team, and project-to-division assignment.

```typescript
// server/src/services/division.service.ts

export interface IDivisionService {
  /** List all divisions for a given team */
  listByTeam(teamId: string): Promise<Division[]>;

  /** Create a new division within a team */
  create(teamId: string, name: string, userId: string): Promise<Division>;

  /** Rename an existing division */
  rename(teamId: string, oldName: string, newName: string, userId: string): Promise<Division>;

  /** Delete a division (only if no projects assigned) */
  delete(teamId: string, divisionName: string, userId: string): Promise<void>;

  /** Assign a project to a division within the same team */
  assignProject(teamId: string, projectName: string, divisionName: string, userId: string): Promise<void>;

  /** Get projects grouped by division for a team */
  getProjectsByDivision(teamId: string): Promise<DivisionWithProjects[]>;
}

export interface Division {
  id: number;
  name: string;        // The track value (displayed as "division")
  teamId: string;
  projectCount: number;
  createdAt: string;
}

export interface DivisionWithProjects {
  divisionName: string;
  projects: string[];
}
```

#### 2. GovernanceDashboardService (New)

Orchestrates the pre-fetch of all period data for Leadership and EM dashboards.

```typescript
// server/src/services/governance-dashboard.service.ts

export interface IGovernanceDashboardService {
  /** Get Leadership dashboard data with all period aggregations */
  getLeadershipDashboard(): Promise<LeadershipDashboardData>;

  /** Get EM dashboard data for a specific team with all period aggregations */
  getEmDashboard(teamId: string): Promise<EmDashboardData>;
}

export interface LeadershipDashboardData {
  periods: {
    month: PeriodMetrics;
    quarter: PeriodMetrics;
    year: PeriodMetrics;
  };
  teams: TeamCardData[];
}

export interface EmDashboardData {
  periods: {
    month: PeriodMetrics;
    quarter: PeriodMetrics;
    year: PeriodMetrics;
  };
  divisions: DivisionMetrics[];
  projects: ProjectByDivision[];
}

export interface PeriodMetrics {
  kpis: KpiTileData[];
  healthScore: HealthScoreData | null;
}

export interface KpiTileData {
  kpiName: string;
  value: number | null;
  ragStatus: RagStatus;
  percentChange: number | null;
  trendDirection: 'up' | 'down' | 'stable' | null;
  insufficientData: boolean;
}

export interface TeamCardData {
  teamName: string;
  healthScore: HealthScoreData | null;
  activeDivisions: number;
  activeProjects: number;
  sparkline: number[]; // Last 3 period health scores
}

export interface HealthScoreData {
  value: number;
  ragStatus: RagStatus;
}

export interface DivisionMetrics {
  divisionName: string;
  kpis: KpiTileData[];
  healthScore: HealthScoreData | null;
}

export interface ProjectByDivision {
  divisionName: string;
  projectName: string;
  sprintPredictability: number | null;
  deliveryEfficiency: number | null;
  ragStatus: RagStatus;
}
```

#### 3. HealthScoreCalculator (Extension to KpiEngineService)

```typescript
// Added to server/src/services/kpi-engine.service.ts

export interface IHealthScoreCalculator {
  /** Compute health score from a set of KPI results */
  computeHealthScore(kpiResults: KpiResult[]): HealthScoreData | null;

  /** Classify health score value into RAG status */
  classifyHealthScore(value: number): RagStatus;
}

/**
 * Health Score computation:
 * - Maps RAG statuses: Green=100, Amber=50, Red=0
 * - Computes weighted average across all non-null KPIs
 * - Classifies result: >=80 Green, 50-79 Amber, <50 Red
 * - Returns null if no KPI data available
 */
export function computeHealthScore(kpiResults: KpiResult[]): HealthScoreData | null {
  const validResults = kpiResults.filter(r => r.value !== null && !r.insufficientData);
  if (validResults.length === 0) return null;

  const ragValues: Record<RagStatus, number> = { green: 100, amber: 50, red: 0 };
  const sum = validResults.reduce((acc, r) => acc + ragValues[r.ragStatus], 0);
  const value = Math.round(sum / validResults.length);

  const ragStatus: RagStatus = value >= 80 ? 'green' : value >= 50 ? 'amber' : 'red';

  return { value, ragStatus };
}
```

#### 4. Division Routes (New)

```typescript
// server/src/routes/division.routes.ts

// POST   /api/divisions              - Create division (EM: own team, Super_Admin: any team)
// PUT    /api/divisions/:name        - Rename division
// DELETE /api/divisions/:name        - Delete division (only if 0 projects)
// GET    /api/divisions              - List divisions for team (query: ?team=X)
// POST   /api/divisions/:name/assign - Assign project to division
```

#### 5. Governance Dashboard Routes (New)

```typescript
// server/src/routes/governance.routes.ts

// GET /api/governance/leadership     - Leadership dashboard (all teams, all periods)
// GET /api/governance/em             - EM dashboard (own team, all periods)
// GET /api/governance/team/:teamId   - Team drill-down data (divisions + metrics)
// GET /api/governance/division/:teamId/:divisionName - Division drill-down data
```

#### 6. Division-to-Track Mapping Middleware

```typescript
// server/src/middleware/division-mapper.middleware.ts

/**
 * Request middleware: maps incoming "division" parameters to "track"
 * Response middleware: maps outgoing "track" fields to "division"
 * Applied selectively on governance and analytics routes.
 */
export function divisionRequestMapper(req: Request, _res: Response, next: NextFunction): void {
  // Map query.division → query.track
  if (req.query.division) {
    req.query.track = req.query.division;
    delete req.query.division;
  }
  // Map body.division → body.track
  if (req.body?.division) {
    req.body.track = req.body.division;
    delete req.body.division;
  }
  next();
}

export function divisionResponseMapper(data: any): any {
  // Recursively rename "track" → "division" in response payloads
  if (Array.isArray(data)) return data.map(divisionResponseMapper);
  if (data && typeof data === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      const newKey = key === 'track' ? 'division' : key;
      result[newKey] = divisionResponseMapper(value);
    }
    return result;
  }
  return data;
}
```

### Client-Side Components

#### 7. LeadershipDashboard Page (New)

```typescript
// client/src/pages/LeadershipDashboard.tsx

/**
 * Executive dashboard with:
 * - KPI tiles (10 executive KPIs including Health Score)
 * - Period Switcher (Month/Quarter/Year, default: Quarter)
 * - Team Cards grid (alphabetically ordered)
 * - Accordion drill-down (Team → Division → Metrics)
 *
 * Data: Single API call pre-fetches all period aggregations.
 * State: Selected period, expanded team, expanded division.
 */
```

#### 8. EmDashboard Page (Extension of Dashboard)

```typescript
// client/src/pages/EmDashboard.tsx

/**
 * Team-scoped dashboard for Engineering Managers:
 * - Team KPI tiles with Period Switcher
 * - Division breakdown with per-division KPIs + RAG
 * - Projects grouped by division
 * - "Manage Divisions" action button
 * - Onboarding prompt when zero divisions exist
 *
 * Data: Single API call pre-fetches all period aggregations for own team.
 */
```

#### 9. TeamCard Component (New)

```typescript
// client/src/components/TeamCard.tsx

interface TeamCardProps {
  teamName: string;
  healthScore: { value: number; ragStatus: RagStatus } | null;
  activeDivisions: number;
  activeProjects: number;
  sparkline: number[];
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Displays team summary with:
 * - Left border color-coded by Health Score RAG (Green=#28A745, Amber=#FFC107, Red=#DC3545)
 * - Team name, Health Score value + RAG badge
 * - Division count, project count
 * - Mini sparkline (last 3 periods) using Recharts
 * - Chevron/expand affordance
 * - Keyboard accessible (Enter/Space to toggle)
 * - aria-expanded attribute for screen readers
 */
```

#### 10. PeriodSwitcher Component (New)

```typescript
// client/src/components/PeriodSwitcher.tsx

type PeriodType = 'month' | 'quarter' | 'year';

interface PeriodSwitcherProps {
  selected: PeriodType;
  onChange: (period: PeriodType) => void;
}

/**
 * Segmented control with three buttons: Month | Quarter | Year
 * - Default selection: Quarter
 * - Highlighted state on active button
 * - Triggers client-side data swap from pre-fetched cache (no API call)
 * - Keyboard accessible with aria-pressed attributes
 */
```

#### 11. DrillDownPanel Component (New)

```typescript
// client/src/components/DrillDownPanel.tsx

interface DrillDownPanelProps {
  teamId: string;
  selectedPeriod: PeriodType;
  divisions: DivisionMetrics[];
  expandedDivision: string | null;
  onDivisionToggle: (divisionName: string) => void;
}

/**
 * Accordion panel rendered below an expanded Team Card:
 * - Lists divisions with KPI summaries + RAG badges
 * - Clicking a division expands project-level detail
 * - Smooth CSS transitions (200-400ms)
 * - Preserves period selection across expand/collapse
 * - aria-expanded on each division row
 */
```

#### 12. DivisionManager Component (New)

```typescript
// client/src/components/DivisionManager.tsx

interface DivisionManagerProps {
  teamId: string;
  divisions: Division[];
  onRefresh: () => void;
}

/**
 * Modal or panel for EM division CRUD:
 * - Create: text input (max 100 chars, required, unique per team)
 * - Rename: inline edit with validation
 * - Delete: only enabled when project count = 0
 * - Assign project: dropdown/combobox for project selection
 * - Shows validation errors (duplicate names, non-empty delete)
 */
```

#### 13. Dashboard Routing Update

The Dashboard page (`/`) will render different components based on role:
- `Leadership` / `Super_Admin` → `LeadershipDashboard`
- `Engineering_Manager` → `EmDashboard`
- Others → Existing `Dashboard` (unchanged)

```typescript
// Updated in client/src/pages/Dashboard.tsx
export default function Dashboard() {
  const user = getStoredUser();
  
  if (user?.role === 'Leadership' || user?.role === 'Super_Admin') {
    return <LeadershipDashboard />;
  }
  if (user?.role === 'Engineering_Manager') {
    return <EmDashboard />;
  }
  // Fallback: existing dashboard behavior
  return <DefaultDashboard />;
}
```

## Interfaces

### API Contracts

#### GET /api/governance/leadership

**Authorization:** Leadership, Super_Admin

**Response:**
```typescript
{
  periods: {
    month: {
      kpis: KpiTileData[];
      healthScore: { value: number; ragStatus: string } | null;
    };
    quarter: { /* same structure */ };
    year: { /* same structure */ };
  };
  teams: Array<{
    teamName: string;
    healthScore: { value: number; ragStatus: string } | null;
    activeDivisions: number;
    activeProjects: number;
    sparkline: number[]; // health scores for last 3 periods
  }>;
}
```

#### GET /api/governance/em

**Authorization:** Engineering_Manager (auto-scoped to assigned team)

**Response:**
```typescript
{
  periods: {
    month: {
      kpis: KpiTileData[];
      healthScore: { value: number; ragStatus: string } | null;
    };
    quarter: { /* same structure */ };
    year: { /* same structure */ };
  };
  divisions: Array<{
    divisionName: string;
    kpis: KpiTileData[];
    healthScore: { value: number; ragStatus: string } | null;
  }>;
  projects: Array<{
    divisionName: string;
    projectName: string;
    sprintPredictability: number | null;
    deliveryEfficiency: number | null;
    ragStatus: string;
  }>;
}
```

#### GET /api/governance/team/:teamId

**Authorization:** Leadership, Super_Admin

**Response:**
```typescript
{
  teamName: string;
  divisions: Array<{
    divisionName: string;
    kpis: KpiTileData[];
    healthScore: { value: number; ragStatus: string } | null;
    projects: Array<{
      projectName: string;
      kpis: KpiTileData[];
      ragStatus: string;
    }>;
  }>;
}
```

#### POST /api/divisions

**Authorization:** Engineering_Manager (own team), Super_Admin (any team)

**Request:**
```typescript
{ team: string; name: string; }
```

**Response (201):**
```typescript
{ id: number; name: string; team: string; projectCount: 0; createdAt: string; }
```

**Errors:** 400 (empty name, name too long, duplicate name), 403 (wrong team)

#### PUT /api/divisions/:name

**Authorization:** Engineering_Manager (own team), Super_Admin (any team)

**Request:**
```typescript
{ team: string; newName: string; }
```

**Response (200):**
```typescript
{ id: number; name: string; team: string; projectCount: number; }
```

**Errors:** 400 (empty name, name too long, duplicate name), 403 (wrong team), 404 (not found)

#### DELETE /api/divisions/:name

**Authorization:** Engineering_Manager (own team), Super_Admin (any team)

**Query:** `?team=TeamName`

**Response (204):** No content

**Errors:** 400 (has assigned projects), 403 (wrong team), 404 (not found)

#### POST /api/divisions/:name/assign

**Authorization:** Engineering_Manager (own team), Super_Admin (any team)

**Request:**
```typescript
{ team: string; project: string; }
```

**Response (200):**
```typescript
{ division: string; project: string; team: string; }
```

**Errors:** 400 (project not in team), 403 (wrong team), 404 (division not found)

## Data Models

### No Schema Changes to Existing Tables

The `sprint_data.track` column continues to store division values. The `track_portfolio_mapping` table continues to map track values to portfolios. No new database migration is needed for the rename.

### Extended Authorization Checks

The existing `AuthorizationService` will be extended with:

```typescript
/** Check if user can manage divisions for a given team */
canManageDivisions(user: UserContext, targetTeam: string): AuthorizationResult;
```

Rules:
- `Super_Admin`: permitted for any team
- `Engineering_Manager`: permitted only for own team (team_id match)
- `Leadership`: denied (read-only role)
- Others: denied

### Client-Side State Model

```typescript
// client/src/types/governance.ts

interface GovernanceState {
  /** Pre-fetched data for all periods */
  data: LeadershipDashboardData | EmDashboardData | null;
  
  /** Currently selected period */
  selectedPeriod: 'month' | 'quarter' | 'year';
  
  /** Currently expanded team (Leadership view) */
  expandedTeam: string | null;
  
  /** Currently expanded division within expanded team */
  expandedDivision: string | null;
  
  /** Loading state */
  loading: boolean;
  
  /** Error state */
  error: string | null;
}
```

Period switching operates entirely on the client by indexing into the `periods` object of the pre-fetched response. No additional API calls are made when the user toggles between Month, Quarter, and Year.

## Error Handling

### Server-Side Error Responses

All API errors follow the existing pattern from `error-handler.ts`:

```typescript
interface ApiError {
  status: number;
  message: string;
  code?: string;
}
```

| Scenario | Status | Code | Message |
|----------|--------|------|---------|
| Division name empty | 400 | `VALIDATION_ERROR` | "Division name is required" |
| Division name too long | 400 | `VALIDATION_ERROR` | "Division name must not exceed 100 characters" |
| Duplicate division name | 400 | `DUPLICATE_DIVISION` | "A division with this name already exists in the team" |
| Delete with projects | 400 | `DIVISION_HAS_PROJECTS` | "Cannot delete division with assigned projects. Reassign all projects first." |
| Wrong team (EM) | 403 | `TEAM_SCOPE_VIOLATION` | "Access denied. You do not have permission to manage divisions for this team." |
| Leadership write attempt | 403 | `WRITE_DENIED` | "Forbidden. Your role does not permit this operation." |
| Division not found | 404 | `NOT_FOUND` | "Division not found" |
| Insufficient data | 200 | — | Response includes `insufficientData: true` and `healthScore: null` |

### Client-Side Error Handling

- Network failures: Show error banner with retry button (existing pattern from Dashboard)
- 403 responses: Show access-denied message explaining scope
- Validation errors (400): Display inline form validation messages in Division Manager
- Empty states: Show contextual onboarding prompts (e.g., "Create your first division")

## Testing Strategy

### Unit Tests
- Health Score computation (pure function, specific RAG combinations)
- Division name validation (empty, too long, whitespace-only, valid)
- Division-to-track field mapping (request/response transformation)
- Authorization checks for each role × operation combination
- Period data structure transformation

### Property-Based Tests
- Health Score computation across random RAG status distributions
- Division name uniqueness validation with random name generators
- Division deletion guard with random project assignment states
- Authorization matrix with random role/team/operation combinations
- Field mapping round-trip (track ↔ division)

### Integration Tests
- Division CRUD API endpoints with authentication
- Governance dashboard API responses with real data
- Audit log creation on division operations
- Team isolation enforcement end-to-end

### Component Tests (Client)
- TeamCard rendering with various health score states
- PeriodSwitcher toggling without API calls
- DrillDownPanel expand/collapse behavior
- DivisionManager form validation

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Division Field Mapping Round-Trip

*For any* sprint data row stored with a `track` value in the database, the API response SHALL return that value under the field name `division`, and *for any* API request containing a `division` parameter, the system SHALL query the database using the `track` column with the same value.

**Validates: Requirements 1.2, 1.3**

### Property 2: Health Score Computation Correctness

*For any* non-empty list of KPI results with RAG statuses, the computed Health Score SHALL equal the arithmetic mean of the status values (Green=100, Amber=50, Red=0) rounded to the nearest integer, producing a value in the range [0, 100].

**Validates: Requirements 9.1**

### Property 3: Health Score RAG Classification

*For any* Health Score value, the RAG classification SHALL be Green if the value is ≥ 80, Amber if the value is in [50, 79], and Red if the value is < 50.

**Validates: Requirements 9.2, 9.3, 9.4**

### Property 4: Division Name Uniqueness Within Team

*For any* team and *for any* division creation or rename operation, if another division within the same team already has the same name (case-insensitive comparison), the operation SHALL be rejected.

**Validates: Requirements 6.7**

### Property 5: Division Deletion Guard

*For any* division with one or more assigned projects, a delete operation SHALL be rejected. *For any* division with zero assigned projects, a delete operation SHALL succeed and remove the division.

**Validates: Requirements 6.3, 6.4**

### Property 6: Division Name Validation

*For any* string that is empty, whitespace-only, or exceeds 100 characters, division creation SHALL be rejected. *For any* non-empty, non-whitespace string of 100 characters or fewer, division creation SHALL succeed (subject to uniqueness constraint).

**Validates: Requirements 6.1**

### Property 7: Engineering Manager Team Isolation

*For any* Engineering Manager user and *for any* team identifier that does not match their assigned team_id, all read and write operations targeting that team SHALL be rejected with a 403 response before any database query executes.

**Validates: Requirements 8.4, 8.5, 8.7**

### Property 8: Leadership Read-Only Enforcement

*For any* user with the Leadership role and *for any* write operation (division create/rename/delete, data upload, metric update, configuration change), the Authorization Service SHALL reject the request with a 403 response.

**Validates: Requirements 8.3**

### Property 9: Super Admin Unrestricted Access

*For any* user with the Super_Admin role and *for any* resource and action combination, the Authorization Service SHALL permit the operation.

**Validates: Requirements 8.1**

### Property 10: Team Cards Alphabetical Ordering

*For any* set of teams in the platform, the Leadership Dashboard Team Cards SHALL be rendered in alphabetical order by team name.

**Validates: Requirements 2.4**

### Property 11: RAG Status Color Consistency

*For any* RAG status displayed anywhere in the platform (KPI tiles, Team Cards, division rows, drill-down panels), Green SHALL render as #28A745, Amber as #FFC107, and Red as #DC3545.

**Validates: Requirements 4.3, 4.4, 4.5, 11.2**

### Property 12: Period Switching Without Network Requests

*For any* period selection change on the Leadership or EM Dashboard, the displayed metrics SHALL update exclusively from the pre-fetched client-side data cache without triggering additional API requests.

**Validates: Requirements 7.2**

### Property 13: Division CRUD Audit Logging

*For any* division create, rename, or delete operation that succeeds, an audit log entry SHALL be persisted containing the performing user ID, action type, team, division name, and timestamp.

**Validates: Requirements 6.8**

### Property 14: Division Rename Propagation

*For any* successful division rename operation, all sprint_data rows previously referencing the old division name (track value) within the same team SHALL be updated to reference the new name.

**Validates: Requirements 6.2**

### Property 15: Drill-Down Period Preservation

*For any* active drill-down state (expanded team or division) and *for any* period switch action, the drill-down SHALL remain expanded and re-render with data for the newly selected period.

**Validates: Requirements 3.5, 7.6**
