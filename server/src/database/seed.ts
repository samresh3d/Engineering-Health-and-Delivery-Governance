import jwt from 'jsonwebtoken';
import { getDatabase } from './connection';

const JWT_SECRET = 'engineering-health-platform-secret';

/** Mock user definitions */
const MOCK_USERS = [
  { userId: 'user-admin-001', username: 'admin', role: 'Admin' as const },
  { userId: 'user-em-001', username: 'eng_manager', role: 'Engineering_Manager' as const },
  { userId: 'user-dm-001', username: 'del_manager', role: 'Delivery_Manager' as const },
  { userId: 'user-lead-001', username: 'leadership', role: 'Leadership' as const },
];

/** Default track-to-portfolio mappings */
const TRACK_PORTFOLIO_MAPPINGS = [
  { track: 'IBPS-POS', portfolio: 'IBPS-POS' },
  { track: 'IBPS-Dolphin', portfolio: 'IBPS-Dolphin' },
  { track: 'IBPS-Claims', portfolio: 'IBPS-Claims' },
  { track: 'mPro', portfolio: 'mPro' },
  { track: 'E-Commerce', portfolio: 'E-Commerce' },
  { track: 'POSV/IVC', portfolio: 'POSV/IVC' },
];

/** Default RAG thresholds for all 9 KPIs */
const RAG_THRESHOLDS = [
  { kpiName: 'sprint_commitment', comparisonType: 'above', green: 90, amber: 80 },
  { kpiName: 'release_success_rate', comparisonType: 'above', green: 98, amber: 95 },
  { kpiName: 'deployment_frequency', comparisonType: 'trend', green: 5, amber: -5 },
  { kpiName: 'capacity_utilization', comparisonType: 'above', green: 90, amber: 75 },
  { kpiName: 'ai_efficiency', comparisonType: 'above', green: 20, amber: 15 },
  { kpiName: 'uat_predictability', comparisonType: 'above', green: 95, amber: 85 },
  { kpiName: 'dev_cycle_time', comparisonType: 'trend', green: -5, amber: 5 },
  { kpiName: 'story_drop_rate', comparisonType: 'below', green: 5, amber: 10 },
  { kpiName: 'rollback_rate', comparisonType: 'below', green: 2, amber: 5 },
];

/**
 * Generate a JWT token for a mock user with a 365-day expiry.
 */
function generateToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '365d' });
}

/**
 * Seed the database with default data. Only inserts data if tables are empty (idempotent).
 * Should be called after migrations have been applied.
 */
export async function seedDatabase(): Promise<void> {
  const db = getDatabase();

  // Seed users table
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const insertUser = db.prepare('INSERT INTO users (id, username, role, token) VALUES (?, ?, ?, ?)');
    const insertUsers = db.transaction(() => {
      for (const user of MOCK_USERS) {
        const token = generateToken(user.userId, user.role);
        insertUser.run(user.userId, user.username, user.role, token);
      }
    });
    insertUsers();
    console.log('[seed] ✓ Seeded users table with 4 mock users.');
  } else {
    console.log('[seed] Users table already has data, skipping.');
  }

  // Seed track_portfolio_mapping table
  const mappingCount = db.prepare('SELECT COUNT(*) as count FROM track_portfolio_mapping').get() as { count: number };
  if (mappingCount.count === 0) {
    const insertMapping = db.prepare('INSERT INTO track_portfolio_mapping (track, portfolio) VALUES (?, ?)');
    const insertMappings = db.transaction(() => {
      for (const mapping of TRACK_PORTFOLIO_MAPPINGS) {
        insertMapping.run(mapping.track, mapping.portfolio);
      }
    });
    insertMappings();
    console.log('[seed] ✓ Seeded track_portfolio_mapping table with 6 default mappings.');
  } else {
    console.log('[seed] track_portfolio_mapping table already has data, skipping.');
  }

  // Seed rag_thresholds table
  const thresholdCount = db.prepare('SELECT COUNT(*) as count FROM rag_thresholds').get() as { count: number };
  if (thresholdCount.count === 0) {
    const insertThreshold = db.prepare(
      'INSERT INTO rag_thresholds (kpi_name, green_threshold, amber_threshold, red_threshold, comparison_type) VALUES (?, ?, ?, ?, ?)'
    );
    const insertThresholds = db.transaction(() => {
      for (const threshold of RAG_THRESHOLDS) {
        // red_threshold is not stored separately — it is implied by comparison_type and amber threshold
        // We store NULL for red_threshold as it's derived from green/amber + comparison_type
        insertThreshold.run(
          threshold.kpiName,
          threshold.green,
          threshold.amber,
          null,
          threshold.comparisonType
        );
      }
    });
    insertThresholds();
    console.log('[seed] ✓ Seeded rag_thresholds table with 9 default KPI thresholds.');
  } else {
    console.log('[seed] rag_thresholds table already has data, skipping.');
  }
}
