import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { initializeDatabase, getDatabase, closeDatabase } from '../../database/connection';
import { runMigrations } from '../../database/migrate';
import { seedDatabase } from '../../database/seed';

const JWT_SECRET = 'engineering-health-platform-secret';

describe('seedDatabase', () => {
  beforeEach(async () => {
    // Use in-memory DB for tests
    initializeDatabase(':memory:');
    await runMigrations();
  });

  afterEach(() => {
    closeDatabase();
  });

  it('should seed users table with 5 mock users', async () => {
    await seedDatabase();

    const db = getDatabase();
    const users = db.prepare('SELECT * FROM users').all() as Array<{
      id: string;
      username: string;
      role: string;
      token: string;
      team_id: string | null;
    }>;

    expect(users).toHaveLength(5);

    const admin = users.find((u) => u.id === 'user-admin-001');
    expect(admin).toBeDefined();
    expect(admin!.role).toBe('Super_Admin');
    expect(admin!.username).toBe('admin');
    expect(admin!.team_id).toBeNull();

    const em = users.find((u) => u.role === 'Engineering_Manager');
    expect(em).toBeDefined();
    expect(em!.id).toBe('user-em-001');
    expect(em!.username).toBe('eng_manager');
    expect(em!.team_id).toBe('Savings SPA1');

    const dm = users.find((u) => u.role === 'Delivery_Manager');
    expect(dm).toBeDefined();
    expect(dm!.id).toBe('user-dm-001');
    expect(dm!.username).toBe('del_manager');
    expect(dm!.team_id).toBeNull();

    const lead = users.find((u) => u.role === 'Leadership');
    expect(lead).toBeDefined();
    expect(lead!.id).toBe('user-lead-001');
    expect(lead!.username).toBe('leadership');
    expect(lead!.team_id).toBeNull();

    const superAdmin = users.find((u) => u.id === 'user-sa-001');
    expect(superAdmin).toBeDefined();
    expect(superAdmin!.role).toBe('Super_Admin');
    expect(superAdmin!.username).toBe('super_admin');
    expect(superAdmin!.team_id).toBeNull();
  });

  it('should generate valid JWT tokens for each user', async () => {
    await seedDatabase();

    const db = getDatabase();
    const users = db.prepare('SELECT * FROM users').all() as Array<{
      id: string;
      username: string;
      role: string;
      token: string;
    }>;

    for (const user of users) {
      const decoded = jwt.verify(user.token, JWT_SECRET) as { userId: string; role: string };
      expect(decoded.userId).toBe(user.id);
      expect(decoded.role).toBe(user.role);
    }
  });

  it('should seed track_portfolio_mapping with 17 entries', async () => {
    await seedDatabase();

    const db = getDatabase();
    const mappings = db.prepare('SELECT * FROM track_portfolio_mapping').all() as Array<{
      track: string;
      portfolio: string;
    }>;

    expect(mappings).toHaveLength(17);

    // Verify original spec portfolios
    const expectedOriginalTracks = ['IBPS-POS', 'IBPS-Dolphin', 'IBPS-Claims', 'mPro', 'E-Commerce', 'POSV/IVC'];
    for (const track of expectedOriginalTracks) {
      const mapping = mappings.find((m) => m.track === track);
      expect(mapping).toBeDefined();
      expect(mapping!.portfolio).toBe(track);
    }

    // Verify actual project mappings from Excel
    const savingsMapping = mappings.find((m) => m.track === 'Savings SPA1');
    expect(savingsMapping).toBeDefined();
    expect(savingsMapping!.portfolio).toBe('Savings');
  });

  it('should seed rag_thresholds with 9 KPI thresholds', async () => {
    await seedDatabase();

    const db = getDatabase();
    const thresholds = db.prepare('SELECT * FROM rag_thresholds').all() as Array<{
      kpi_name: string;
      green_threshold: number;
      amber_threshold: number;
      red_threshold: number | null;
      comparison_type: string;
    }>;

    expect(thresholds).toHaveLength(9);

    // Verify specific thresholds
    const sprintCommitment = thresholds.find((t) => t.kpi_name === 'sprint_commitment');
    expect(sprintCommitment).toBeDefined();
    expect(sprintCommitment!.comparison_type).toBe('above');
    expect(sprintCommitment!.green_threshold).toBe(90);
    expect(sprintCommitment!.amber_threshold).toBe(80);

    const storyDrop = thresholds.find((t) => t.kpi_name === 'story_drop_rate');
    expect(storyDrop).toBeDefined();
    expect(storyDrop!.comparison_type).toBe('below');
    expect(storyDrop!.green_threshold).toBe(5);
    expect(storyDrop!.amber_threshold).toBe(10);

    const deployFreq = thresholds.find((t) => t.kpi_name === 'deployment_frequency');
    expect(deployFreq).toBeDefined();
    expect(deployFreq!.comparison_type).toBe('trend');
    expect(deployFreq!.green_threshold).toBe(5);
    expect(deployFreq!.amber_threshold).toBe(-5);
  });

  it('should be idempotent — not insert duplicate data on second call', async () => {
    await seedDatabase();
    await seedDatabase();

    const db = getDatabase();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const mappingCount = db.prepare('SELECT COUNT(*) as count FROM track_portfolio_mapping').get() as { count: number };
    const thresholdCount = db.prepare('SELECT COUNT(*) as count FROM rag_thresholds').get() as { count: number };

    expect(userCount.count).toBe(5);
    expect(mappingCount.count).toBe(17);
    expect(thresholdCount.count).toBe(9);
  });

  it('should not seed if tables already have data', async () => {
    const db = getDatabase();

    // Manually insert one user
    const token = jwt.sign({ userId: 'existing', role: 'Admin' }, JWT_SECRET);
    db.prepare('INSERT INTO users (id, username, role, token) VALUES (?, ?, ?, ?)').run(
      'existing-user',
      'existing',
      'Admin',
      token
    );

    await seedDatabase();

    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    // Should still be 1 — the seed did not add more users
    expect(userCount.count).toBe(1);
  });
});
