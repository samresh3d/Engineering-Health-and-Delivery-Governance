import express from 'express';
import cors from 'cors';
import path from 'path';
import { rbacMiddleware } from './middleware/rbac';
import { errorHandler } from './middleware/error-handler';
import uploadRoutes from './routes/upload.routes';
import authRoutes from './routes/auth.routes';
import configRoutes from './routes/config.routes';
import dashboardRoutes from './routes/dashboard.routes';
import filterRoutes from './routes/filter.routes';
import adminRoutes from './routes/admin.routes';
import analyticsRoutes from './routes/analytics.routes';
import reportsRoutes from './routes/reports.routes';
import auditLogRoutes from './routes/audit-log.routes';
import usersRoutes from './routes/users.routes';
import submissionsRoutes from './routes/submissions.routes';
import divisionRoutes from './routes/division.routes';
import governanceRoutes from './routes/governance.routes';
import functionRoutes from './routes/function.routes';
import teamRoutes from './routes/team.routes';
import emTeamsRoutes from './routes/em-teams.routes';
import leadershipRoutes from './routes/leadership.routes';

const app = express();

// CORS middleware
app.use(cors());

// JSON body parser
app.use(express.json());

// Serve client static files BEFORE any auth (no token needed for frontend assets)
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// Leadership workbook file-store: intentionally PUBLIC and lightweight.
// This backs an internal single-file dashboard whose Excel workbook is the only
// data source, matching the unauthenticated static assets and /leadership client
// module. Registered BEFORE the RBAC middleware so it stays unauthenticated.
app.use('/api/leadership', leadershipRoutes);

// RBAC middleware applied globally (skips non-API routes internally)
app.use(rbacMiddleware);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/config', configRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/filters', filterRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/functions', functionRoutes);
app.use('/api/admin', teamRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/submissions', submissionsRoutes);
app.use('/api/divisions', divisionRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/em', emTeamsRoutes);

// Global error handler (must be AFTER routes)
app.use(errorHandler);

// SPA fallback: serve index.html for any non-API route not matched by static files
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

export default app;
