import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import KpiTile from '../components/KpiTile';
import KpiTrendChart from '../components/KpiTrendChart';
import AnalyticsFilterBar from '../components/AnalyticsFilterBar';
import TeamComparisonTable from '../components/TeamComparisonTable';
import type { KpiResult } from '../types';
import type { AnalyticsFilter as ApiAnalyticsFilter } from '../api/client';
import { colors } from '../theme';

/**
 * Filter state for analytics — will be wired to AnalyticsFilterBar in a later task.
 */
export interface AnalyticsFilter {
  team?: string;
  engineeringManager?: string;
  functionName?: string;
  startDate?: string;
  endDate?: string;
  developmentStatus?: string;
  period?: 'month' | 'quarter' | 'year' | 'custom';
}

interface AnalyticsProps {
  /** External filter state (optional — if not provided, internal state is used) */
  filter?: AnalyticsFilter;
}

/**
 * Analytics Dashboard page — KPI Scorecard with RAG status badges and trend indicators.
 * Displays 9 KPI tiles fetched from the analytics scorecard API endpoint.
 * Integrates AnalyticsFilterBar for multi-dimensional filtering with role-based controls.
 */
export default function Analytics({ filter: externalFilter }: AnalyticsProps) {
  const [internalFilter, setInternalFilter] = useState<AnalyticsFilter>({});
  const filter = externalFilter ?? internalFilter;
  const [kpis, setKpis] = useState<KpiResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchScorecard() {
      setLoading(true);
      setError(null);

      try {
        const params: Record<string, string> = {};
        if (filter?.functionName) params.functionName = filter.functionName;
        if (filter?.team) params.team = filter.team;
        if (filter?.engineeringManager) params.engineeringManager = filter.engineeringManager;
        if (filter?.startDate) params.startDate = filter.startDate;
        if (filter?.endDate) params.endDate = filter.endDate;
        if (filter?.developmentStatus) params.developmentStatus = filter.developmentStatus;
        if (filter?.period) params.period = filter.period;

        const response = await apiClient.get('/api/analytics/scorecard', { params });

        if (!cancelled) {
          const data = response.data?.data?.kpis ?? response.data?.kpis ?? response.data?.data ?? [];
          setKpis(Array.isArray(data) ? data : []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load analytics data. Please try again later.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchScorecard();
    return () => { cancelled = true; };
  }, [filter?.functionName, filter?.team, filter?.engineeringManager, filter?.startDate, filter?.endDate, filter?.developmentStatus, filter?.period]);

  if (loading) {
    return (
      <div style={{ padding: '64px', textAlign: 'center' }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: `4px solid ${colors.primaryLight}`,
            borderTop: `4px solid ${colors.primary}`,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }}
        />
        <p style={{ color: colors.textSecondary, fontSize: '14px' }}>Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div
          style={{
            background: '#FFF5F5',
            border: '1px solid #FED7D7',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '500px',
            margin: '0 auto',
          }}
        >
          <p style={{ fontSize: '16px', color: colors.red, fontWeight: 500, marginBottom: '12px' }}>
            ⚠️ {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              background: colors.primary,
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: colors.text, marginBottom: '4px' }}>
          Analytics Dashboard
        </h1>
        <p style={{ fontSize: '14px', color: colors.textSecondary }}>
          KPI performance scorecard with RAG status and trend analysis
        </p>
      </div>

      {/* Analytics Filter Bar */}
      <AnalyticsFilterBar
        filter={filter}
        onFilterChange={setInternalFilter}
      />

      {/* KPI Scorecard Section */}
      <section aria-label="KPI Scorecard">
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: colors.text,
            marginBottom: '16px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          KPI Scorecard
        </h2>

        {kpis.length === 0 ? (
          <div
            style={{
              background: colors.background,
              border: `1px solid ${colors.border}`,
              borderRadius: '12px',
              padding: '48px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📈</div>
            <p style={{ fontSize: '18px', fontWeight: 500, color: colors.text, marginBottom: '8px' }}>
              No analytics data available
            </p>
            <p style={{ fontSize: '14px', color: colors.textSecondary }}>
              Upload sprint data or adjust your filters to see KPI metrics.
            </p>
          </div>
        ) : (
          <div
            className="kpi-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '20px',
            }}
          >
            {kpis.map((kpi) => (
              <KpiTile
                key={kpi.kpiName}
                kpiName={kpi.kpiName}
                value={kpi.value}
                ragStatus={kpi.ragStatus}
                percentChange={kpi.percentChange}
                insufficientData={kpi.insufficientData}
              />
            ))}
          </div>
        )}
      </section>

      {/* Trend Charts Section */}
      <section aria-label="KPI Trend Charts" style={{ marginTop: '32px' }}>
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: colors.text,
            marginBottom: '16px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Trend Analysis
        </h2>

        <KpiTrendChart filter={filter as ApiAnalyticsFilter | undefined} />
      </section>

      {/* Team Comparison Table — Leadership/Super_Admin only */}
      <TeamComparisonTable filter={filter as ApiAnalyticsFilter | undefined} />
    </div>
  );
}
