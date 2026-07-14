import app from './app';
import { initializeDatabase } from './database/connection';
import { runMigrations } from './database/migrate';
import { seedDatabase } from './database/seed';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function start(): Promise<void> {
  try {
    console.log('[server] Initializing database...');
    initializeDatabase();

    console.log('[server] Running migrations...');
    await runMigrations();

    console.log('[server] Seeding data...');
    await seedDatabase();

    app.listen(PORT, () => {
      console.log(`[server] Engineering Health Platform API running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[server] Failed to start:', error);
    process.exit(1);
  }
}

start();
