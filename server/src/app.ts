import express from 'express';
import cors from 'cors';
import { rbacMiddleware } from './middleware/rbac';
import { errorHandler } from './middleware/error-handler';
import uploadRoutes from './routes/upload.routes';
import authRoutes from './routes/auth.routes';
import configRoutes from './routes/config.routes';
import dashboardRoutes from './routes/dashboard.routes';
import filterRoutes from './routes/filter.routes';

const app = express();

// CORS middleware
app.use(cors());

// JSON body parser
app.use(express.json());

// RBAC middleware applied globally
app.use(rbacMiddleware);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/config', configRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/filters', filterRoutes);

// Global error handler (must be AFTER routes)
app.use(errorHandler);

export default app;
