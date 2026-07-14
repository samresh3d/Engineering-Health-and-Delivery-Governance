import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { KpiResultsRepository } from '../../repositories/kpi-results.repository.js';
import type { KpiComputedResult, KpiName } from '../../types/index.js';

function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE kpi_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_name TEXT NOT NULL,
      value REAL,
      rag_status TEXT CHECK(rag_status IN ('green', 'amber', 'red')),
      percent_change REAL,
      team TEXT,
      portfolio TEXT,
      sprint TEXT,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      calculated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      insufficient_data INTEGER DEFAULT 0
    );

    CREATE INDEX idx_kpi_results_lookup ON kpi_results(kpi_name, team, portfolio, period_start);
  `);

  return db;
}

function makeKpiResult(overrides: Partial<KpiComputedResult> = {}): KpiComputedResult {
  return {
    kpiName: 'sprint_commitment',
    value: 85.5,
    ragStatus: 'green',
    percentChange: 2.3,
    team: 'Team Alpha',
    portfolio: 'IBPS-POS',
    sprint: 'Sprint 1',
    periodStart: '2024-01-01',
    periodEnd: '2024-01-14',
    calculatedAt: '2024-01-15T10:00:00Z',
    insufficientData: false,
    ...overrides,
  };
}

describe('KpiResultsRepository', () => {
  let db: Database.Database;
  let repo: KpiResultsRepository;

  beforeEach(() => {
    db = createInMemoryDb();
    repo = new KpiResultsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('save', () => {
    it('should save a single KPI result', async () => {
      const result = makeKpiResult();
      await repo.save(result);

      const rows = db.prepare('SELECT * FROM kpi_results').all() as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].kpi_name).toBe('sprint_commitment');
      expect(rows[0].value).toBe(85.5);
      expect(rows[0].rag_status).toBe('green');
      expect(rows[0].team).toBe('Team Alpha');
    });

    it('should map insufficientData boolean to INTEGER 0/1', async () => {
      await repo.save(makeKpiResult({ insufficientData: true, kpiName: 'sprint_commitment' }));
      await repo.save(makeKpiResult({ insufficientData: false, kpiName: 'deployment_frequency' }));

      const insuffRow = db.prepare('SELECT insufficient_data FROM kpi_results WHERE kpi_name = ?').get('sprint_commitment') as any;
      const suffRow = db.prepare('SELECT insufficient_data FROM kpi_results WHERE kpi_name = ?').get('deployment_frequency') as any;
      expect(insuffRow.insufficient_data).toBe(1);
      expect(suffRow.insufficient_data).toBe(0);
    });

    it('should handle null values correctly', async () => {
      const result = makeKpiResult({
        value: null,
        percentChange: null,
        team: null,
        portfolio: null,
        sprint: null,
      });
      await repo.save(result);

      const row = db.prepare('SELECT * FROM kpi_results').get() as any;
      expect(row.value).toBeNull();
      expect(row.percent_change).toBeNull();
      expect(row.team).toBeNull();
      expect(row.portfolio).toBeNull();
      expect(row.sprint).toBeNull();
    });
  });

  describe('saveBatch', () => {
    it('should save multiple results in a single transaction', async () => {
      const results = [
        makeKpiResult({ kpiName: 'sprint_commitment' }),
        makeKpiResult({ kpiName: 'deployment_frequency', value: 12 }),
        makeKpiResult({ kpiName: 'release_success_rate', value: 92 }),
      ];

      await repo.saveBatch(results);

      const rows = db.prepare('SELECT * FROM kpi_results').all();
      expect(rows).toHaveLength(3);
    });

    it('should handle empty array without error', async () => {
      await repo.saveBatch([]);
      const rows = db.prepare('SELECT * FROM kpi_results').all();
      expect(rows).toHaveLength(0);
    });

    it('should rollback all rows on failure (atomicity)', async () => {
      const results = [
        makeKpiResult({ kpiName: 'sprint_commitment' }),
        makeKpiResult({ kpiName: 'deployment_frequency', ragStatus: 'INVALID' as any }),
      ];

      await expect(repo.saveBatch(results)).rejects.toThrow();

      const rows = db.prepare('SELECT * FROM kpi_results').all();
      expect(rows).toHaveLength(0);
    });
  });

  describe('findLatest', () => {
    beforeEach(async () => {
      // Insert results with different calculated_at times
      const results = [
        makeKpiResult({ kpiName: 'sprint_commitment', calculatedAt: '2024-01-10T10:00:00Z', team: 'Team Alpha' }),
        makeKpiResult({ kpiName: 'sprint_commitment', calculatedAt: '2024-01-15T10:00:00Z', team: 'Team Alpha' }),
        makeKpiResult({ kpiName: 'deployment_frequency', calculatedAt: '2024-01-10T10:00:00Z', team: 'Team Alpha', value: 10 }),
        makeKpiResult({ kpiName: 'deployment_frequency', calculatedAt: '2024-01-15T10:00:00Z', team: 'Team Alpha', value: 15 }),
        makeKpiResult({ kpiName: 'sprint_commitment', calculatedAt: '2024-01-15T10:00:00Z', team: 'Team Beta', portfolio: 'mPro' }),
      ];
      await repo.saveBatch(results);
    });

    it('should return the latest result per kpi_name with no filter', async () => {
      const results = await repo.findLatest({});
      // Should get latest sprint_commitment (2 rows at 2024-01-15) and latest deployment_frequency (1 row at 2024-01-15)
      expect(results.length).toBeGreaterThanOrEqual(3);
      // All returned results should have the latest calculated_at
      const sprintResults = results.filter(r => r.kpiName === 'sprint_commitment');
      for (const r of sprintResults) {
        expect(r.calculatedAt).toBe('2024-01-15T10:00:00Z');
      }
    });

    it('should filter by team', async () => {
      const results = await repo.findLatest({ team: 'Team Alpha' });
      expect(results.every(r => r.team === 'Team Alpha')).toBe(true);
      expect(results.length).toBe(2); // latest sprint_commitment + latest deployment_frequency for Team Alpha
    });

    it('should filter by portfolio', async () => {
      const results = await repo.findLatest({ portfolio: 'mPro' });
      expect(results).toHaveLength(1);
      expect(results[0].team).toBe('Team Beta');
    });

    it('should return empty array when no results match', async () => {
      const results = await repo.findLatest({ team: 'NonExistent' });
      expect(results).toHaveLength(0);
    });
  });

  describe('findTrend', () => {
    beforeEach(async () => {
      const results = [
        makeKpiResult({ kpiName: 'sprint_commitment', team: 'Team Alpha', periodStart: '2024-01-01', periodEnd: '2024-01-14' }),
        makeKpiResult({ kpiName: 'sprint_commitment', team: 'Team Alpha', periodStart: '2024-01-15', periodEnd: '2024-01-28' }),
        makeKpiResult({ kpiName: 'sprint_commitment', team: 'Team Alpha', periodStart: '2024-01-29', periodEnd: '2024-02-11' }),
        makeKpiResult({ kpiName: 'sprint_commitment', team: 'Team Alpha', periodStart: '2024-02-12', periodEnd: '2024-02-25' }),
        makeKpiResult({ kpiName: 'sprint_commitment', team: 'Team Beta', periodStart: '2024-01-01', periodEnd: '2024-01-14' }),
      ];
      await repo.saveBatch(results);
    });

    it('should return results ordered by period_start DESC limited to N periods', async () => {
      const results = await repo.findTrend('sprint_commitment', 'Team Alpha', 3);
      expect(results).toHaveLength(3);
      expect(results[0].periodStart).toBe('2024-02-12');
      expect(results[1].periodStart).toBe('2024-01-29');
      expect(results[2].periodStart).toBe('2024-01-15');
    });

    it('should only return results for the specified team', async () => {
      const results = await repo.findTrend('sprint_commitment', 'Team Beta', 5);
      expect(results).toHaveLength(1);
      expect(results[0].team).toBe('Team Beta');
    });

    it('should return empty array when no results match', async () => {
      const results = await repo.findTrend('deployment_frequency', 'Team Alpha', 5);
      expect(results).toHaveLength(0);
    });

    it('should return fewer than periods if not enough data', async () => {
      const results = await repo.findTrend('sprint_commitment', 'Team Alpha', 10);
      expect(results).toHaveLength(4);
    });
  });
});
