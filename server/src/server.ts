import app from './app';
import { initializeDatabase } from './database/connection';
import { runMigrations } from './database/migrate';
import { seedDatabase } from './database/seed';
import { seedDefaultWorkbook } from './services/leadership-workbook.service';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function start(): Promise<void> {
  try {
    console.log('[server] Initializing database...');
    initializeDatabase();

    console.log('[server] Running migrations...');
    await runMigrations();

    console.log('[server] Seeding data...');
    await seedDatabase();

    // Seed the default Leadership workbook into the upload dir when none exists
    // (ensures the dashboard has data on a fresh/ephemeral deploy).
    if (seedDefaultWorkbook()) {
      console.log('[server] Seeded default leadership.xlsx into the upload directory.');
    }

    app.listen(PORT, () => {
      console.log(`[server] Engineering Health Platform API running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[server] Failed to start:', error);
    process.exit(1);
  }
}

start();
