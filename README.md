# Engineering Health & Delivery Governance Platform

An internal web application that automates tracking of engineering delivery health. The system ingests sprint data via Excel upload, computes 9 KPIs with RAG (Red/Amber/Green) classification, and presents results on an executive dashboard.

## Architecture

- **`/client`** — React + TypeScript frontend (Vite, AG Grid, Recharts)
- **`/server`** — Node.js + Express + TypeScript backend (SQLite, Zod validation)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, React Router, AG Grid, Recharts, Axios |
| Backend | Node.js, Express, TypeScript, better-sqlite3, Zod, Multer, xlsx |
| Database | SQLite (file-based, zero-config) |
| Auth | Stubbed JWT with 4 pre-configured mock users |
| Testing | Vitest, fast-check (property-based), Testing Library |

## Prerequisites

- Node.js >= 18
- npm >= 9

## Getting Started

### Server

```bash
cd server
npm install
npm run build
npm start
```

For development with auto-reload:

```bash
cd server
npm install
npm run dev
```

The server starts on `http://localhost:3000` by default.

### Client

```bash
cd client
npm install
npm run dev
```

The client dev server starts on `http://localhost:5173` by default.

To build for production:

```bash
cd client
npm run build
npm run preview
```

## KPIs Tracked

1. **Sprint Commitment** — % of committed stories completed (target > 90%)
2. **Release Success Rate** — % of releases without rollback (target > 98%)
3. **Deployment Frequency** — Number of production deployments (target: increasing)
4. **Capacity Utilization** — Team resource utilization (target >= 90%)
5. **AI Efficiency** — Effort savings from AI tooling (target: 20-70% by type)
6. **UAT Predictability** — On-time UAT delivery (target > 95%)
7. **Dev Cycle Time** — Average development duration (target: decreasing)
8. **Story Drop Rate** — % of stories dropped from sprint (target < 5%)
9. **Rollback Rate** — % of deployments requiring rollback (target < 2%)

## Roles

| Role | Permissions |
|------|-------------|
| Admin | User management, KPI/threshold config, team management |
| Engineering Manager | Dashboard, Excel upload, reports, team analytics |
| Delivery Manager | Release tracking, delivery health, governance metrics |
| Leadership | Executive dashboard, portfolio reports, trends/risks |

## Project Structure

```
/client
  /src
    /components    — Reusable UI components (KpiTile, FilterBar, etc.)
    /pages         — Route pages (Dashboard, Upload)
    /theme         — Brand colors and styling
    /types         — TypeScript type definitions
/server
  /src
    /database      — SQLite connection, migrations, seeds
    /middleware    — RBAC auth, error handling
    /repositories  — Data access layer (Repository Pattern)
    /routes        — Express route handlers
    /schemas       — Zod validation schemas
    /services      — Business logic (KPI Engine, Upload, RAG)
    /types         — TypeScript type definitions
```

## License

MIT
