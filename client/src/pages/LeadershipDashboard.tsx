import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import type { AnalyticsFilter } from '../api/client';
import PeriodSwitcher from '../components/PeriodSwitcher';
import DataBackedMonthPicker from '../components/DataBackedMonthPicker';
import KpiTrendChart from '../components/KpiTrendChart';
import { TeamComparisonTable } from '../components/TeamComparisonTable';
import TeamCard from '../components/TeamCard';
import DrillDownPanel from '../components/DrillDownPanel';
import RagBadge from '../components/RagBadge';
import { colors, theme } from '../theme';
import type {
  LeadershipDashboardData,
  PeriodType,
  KpiTileData,
  DivisionMetrics,
} from '../types/governance';

/** The 10 executive KPI names expected in the leadership dashboard */
const EXECUTIVE_KPI_NAMES = [
  'health_score',
  'sprint_predictability',
  'delivery_efficiency',
  'velocity_trend',
  'escaped_defects',
  'team_capacity',
  'story_completion',
  'planned_vs_delivered',
  'risks_count',
  'blockers_count',
];

/** Map KPI identifiers to human-readable labels */
const KPI_DISPLAY_LABELS: Record<string, string> = {
  health_score: 'Health Score',
  sprint_predictability: 'Sprint Predictability',
  delivery_efficiency: 'Delivery Efficiency',
  velocity_trend: 'Velocity Trend',
  escaped_defects: 'Escaped Defects',
  team_capacity: 'Team Capacity',
  story_completion: 'Story Completion %',
  planned_vs_delivered: 'Planned vs Delivered',
  risks_count: 'Risks',
  blockers_count: 'Blockers',
};

/** Format KPI value for display */
function formatKpiValue(kpiName: string, value: number | null): string {
  if (value === null) return '—';
  if (kpiName.includes('count')) return String(value);
  return `${value}%`;
}

/** Get trend arrow character */
function getTrendArrow(direction: 'up' | 'down' | 'stable' | null): string {
  if (direction === 'up') return '↑';
  if (direction === 'down') return '↓';
  if (direction === 'stable') return '→';
  return '';
}

/** Get trend color */
function getTrendColor(direction: 'up' | 'down' | 'stable' | null): string {
  if (direction === 'up') return colors.green;
  if (direction === 'down') return colors.red;
  return colors.textSecondary;
}

/**
 * LeadershipDashboard — Executive dashboard with KPI tiles, period switching,
 * team cards grid, and accordion drill-down navigation.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.4, 3.6, 7.2, 7.4, 7.5, 7.6, 11.1, 11.2
 */
export default function LeadershipDashboard() {
  const [data, setData] = useState<LeadershipDashboardData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('quarter');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [expandedDivision, setExpandedDivision] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function filter state for cross-function filtering
  const [functions, setFunctions] = useState<string[]>([]);
  const [selectedFunction, setSelectedFunction] = useState<string>('');

  // Drill-down data fetched per-team on expand
  const [drillDownData, setDrillDownData] = useState<Record<string, DivisionMetrics[]>>({});
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  // Fetch leadership dashboard data on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      try {
        const response = await apiClient.get('/api/governance/leadership');
        if (!cancelled) {
          const result = response.data?.data || response.data;
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load leadership dashboard. Please try again.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDashboard();
    return () => { cancelled = true; };
  }, []);

  // Fetch available months from the data-backed API endpoint
  useEffect(() => {
    let cancelled = false;

    async function fetchAvailableMonths() {
      try {
        const response = await apiClient.get('/api/dashboard/available-months');
        if (!cancelled && response.data.months && response.data.months.length > 0) {
          setAvailableMonths(response.data.months);
          // Default to most recent month with data
          setSelectedMonth(response.data.months[0]);
        }
      } catch {
        // Non-critical: month picker will show empty state
      }
    }

    fetchAvailableMonths();
    return () => { cancelled = true; };
  }, []);

  // Fetch available functions for the function filter dropdown
  useEffect(() => {
    let cancelled = false;

    async function fetchFunctions() {
      try {
        const response = await apiClient.get('/api/admin/functions');
        if (!cancelled) {
          const fnList = response.data.functions || response.data.data || [];
          setFunctions(fnList.map((f: { name: string }) => f.name));
        }
      } catch {
        // Non-critical: function filter will not be shown if this fails
      }
    }

    fetchFunctions();
    return () => { cancelled = true; };
  }, []);

  // Build analytics filter based on selected function
  const analyticsFilter: AnalyticsFilter | undefined = selectedFunction
    ? { functionName: selectedFunction }
    : undefined;

  // Fetch team drill-down data when a team is expanded
  const fetchTeamDrillDown = useCallback(async (teamName: string) => {
    if (drillDownData[teamName]) return; // Already cached
    setDrillDownLoading(true);
    try {
      const response = await apiClient.get(`/api/governance/team/${encodeURIComponent(teamName)}`);
      const result = response.data?.data || response.data;
      setDrillDownData((prev) => ({
        ...prev,
        [teamName]: result?.divisions || [],
      }));
    } catch {
      // If drill-down fails, show empty divisions
      setDrillDownData((prev) => ({
        ...prev,
        [teamName]: [],
      }));
    } finally {
      setDrillDownLoading(false);
    }
  }, [drillDownData]);

  // Handle team card toggle
  const handleTeamToggle = useCallback((teamName: string) => {
    setExpandedTeam((prev) => {
      if (prev === teamName) {
        // Collapsing — reset division expansion
        setExpandedDivision(null);
        return null;
      }
      // Expanding — fetch drill-down data
      fetchTeamDrillDown(teamName);
      setExpandedDivision(null);
      return teamName;
    });
  }, [fetchTeamDrillDown]);

  // Handle division toggle within drill-down
  const handleDivisionToggle = useCallback((divisionName: string) => {
    setExpandedDivision((prev) => (prev === divisionName ? null : divisionName));
  }, []);

  // Handle period change — client-side data swap, no API call
  const handlePeriodChange = useCallback((period: PeriodType) => {
    setSelectedPeriod(period);
  }, []);

  // Get KPIs for the currently selected period
  const currentKpis: KpiTileData[] = data?.periods?.[selectedPeriod]?.kpis || [];

  // Sort teams alphabetically by team name
  const sortedTeams = data?.teams
    ? [...data.teams].sort((a, b) => a.teamName.localeCompare(b.teamName))
    : [];

  // Check if we have fewer than 2 periods of data (limited data indicator)
  const periodsWithData = data?.periods
    ? Object.values(data.periods).filter((p) => p.kpis && p.kpis.length > 0).length
    : 0;
  const hasLimitedData = periodsWithData < 2;

  // ─── Loading State ─────────────────────────────────────────────────────────

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
        <p style={{ color: colors.textSecondary, fontSize: '14px' }}>
          Loading leadership dashboard...
        </p>
      </div>
    );
  }

  // ─── Error State ───────────────────────────────────────────────────────────

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

  // ─── Main Render ───────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header with period switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: colors.text, marginBottom: '4px' }}>
            Leadership Dashboard
          </h1>
          <p style={{ fontSize: '14px', color: colors.textSecondary, margin: 0 }}>
            Executive KPIs across all teams and divisions
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* Function filter dropdown */}
          {functions.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: colors.text,
                }}
              >
                Function
              </span>
              <select
                value={selectedFunction}
                onChange={(e) => setSelectedFunction(e.target.value)}
                aria-label="Filter by function"
                style={{
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: `1px solid ${colors.border}`,
                  fontSize: '14px',
                  minWidth: '160px',
                  color: colors.text,
                  backgroundColor: colors.background,
                  cursor: 'pointer',
                }}
              >
                <option value="">All Functions</option>
                {functions.map((fn) => (
                  <option key={fn} value={fn}>
                    {fn}
                  </option>
                ))}
              </select>
            </label>
          )}
          <DataBackedMonthPicker
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            availableMonths={availableMonths}
          />
          <PeriodSwitcher selected={selectedPeriod} onChange={handlePeriodChange} />
        </div>
      </div>

      {/* Limited Data indicator */}
      {hasLimitedData && (
        <div
          style={{
            background: '#FFF8E1',
            border: '1px solid #FFE082',
            borderRadius: theme.borderRadius.sm,
            padding: '10px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: '#6D4C00',
          }}
          role="alert"
        >
          <span aria-hidden="true">⚠️</span>
          <span>
            <strong>Limited Data:</strong> Fewer than 2 periods of data available. Trend indicators and comparisons may be incomplete.
          </span>
        </div>
      )}

      {/* Executive KPI Tiles Grid */}
      <section aria-label="Executive KPIs" style={{ marginBottom: '32px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          {EXECUTIVE_KPI_NAMES.map((kpiName) => {
            const kpiData = currentKpis.find((k) => k.kpiName === kpiName);
            return (
              <ExecutiveKpiTile
                key={kpiName}
                kpiName={kpiName}
                data={kpiData || null}
              />
            );
          })}
        </div>
      </section>

      {/* KPI Trend Chart — cross-function trend data */}
      <section aria-label="KPI Trends" style={{ marginBottom: '32px' }}>
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: colors.text,
            marginBottom: '16px',
          }}
        >
          KPI Trends
        </h2>
        <KpiTrendChart filter={analyticsFilter} />
      </section>

      {/* Team Comparison Table — cross-function team data */}
      <TeamComparisonTable filter={analyticsFilter} />

      {/* Team Cards Section */}
      <section aria-label="Team overview">
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: colors.text,
            marginBottom: '16px',
          }}
        >
          Teams ({sortedTeams.length})
        </h2>

        {sortedTeams.length === 0 ? (
          <div
            style={{
              background: colors.secondary,
              border: `1px solid ${colors.border}`,
              borderRadius: theme.borderRadius.md,
              padding: '48px',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '16px', color: colors.textSecondary }}>
              No team data available yet.
            </p>
          </div>
        ) : (
          <div className="team-cards-grid">
            {sortedTeams.map((team) => {
              const isExpanded = expandedTeam === team.teamName;
              return (
                <div key={team.teamName} className="team-card-wrapper">
                  <TeamCard
                    teamName={team.teamName}
                    healthScore={team.healthScore}
                    activeDivisions={team.activeDivisions}
                    activeProjects={team.activeProjects}
                    sparkline={team.sparkline}
                    isExpanded={isExpanded}
                    onToggle={() => handleTeamToggle(team.teamName)}
                  />

                  {/* DrillDownPanel rendered below the expanded card */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: '8px',
                        marginBottom: '8px',
                        animation: 'fadeIn 0.3s ease',
                      }}
                    >
                      {drillDownLoading && !drillDownData[team.teamName] ? (
                        <div
                          style={{
                            padding: '24px',
                            textAlign: 'center',
                            color: colors.textSecondary,
                            fontSize: '13px',
                          }}
                        >
                          Loading team details...
                        </div>
                      ) : (
                        <DrillDownPanel
                          teamId={team.teamName}
                          selectedPeriod={selectedPeriod}
                          divisions={drillDownData[team.teamName] || []}
                          expandedDivision={expandedDivision}
                          onDivisionToggle={handleDivisionToggle}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Responsive CSS */}
      <style>{`
        .team-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .team-card-wrapper {
          /* Allow drill-down to span full width when expanded */
        }

        .team-card-wrapper:has([aria-expanded="true"]) {
          grid-column: 1 / -1;
        }

        @media (max-width: 1199px) {
          .team-cards-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 767px) {
          .team-cards-grid {
            grid-template-columns: 1fr;
          }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Executive KPI Tile (inline component) ─────────────────────────────────

interface ExecutiveKpiTileProps {
  kpiName: string;
  data: KpiTileData | null;
}

/**
 * Executive KPI tile — displays current value, RAG indicator, trend arrow.
 * Shows "Limited Data" when insufficientData flag is set.
 */
function ExecutiveKpiTile({ kpiName, data }: ExecutiveKpiTileProps) {
  const label = KPI_DISPLAY_LABELS[kpiName] || kpiName;
  const value = data?.value ?? null;
  const ragStatus = data?.ragStatus || 'amber';
  const trendDirection = data?.trendDirection || null;
  const insufficientData = data?.insufficientData ?? false;

  return (
    <div
      style={{
        background: colors.background,
        border: `1px solid ${colors.border}`,
        borderRadius: theme.borderRadius.md,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: theme.shadows.card,
        transition: 'box-shadow 0.2s, transform 0.2s',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = theme.shadows.hover;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = theme.shadows.card;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* KPI Label + RAG Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
          }}
        >
          {label}
        </span>
        <RagBadge status={ragStatus} />
      </div>

      {/* Value + Trend Arrow */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontSize: '26px', fontWeight: 700, color: colors.text }}>
          {formatKpiValue(kpiName, value)}
        </span>
        {trendDirection && (
          <span
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: getTrendColor(trendDirection),
            }}
            aria-label={`Trend: ${trendDirection}`}
          >
            {getTrendArrow(trendDirection)}
          </span>
        )}
      </div>

      {/* Limited Data indicator */}
      {insufficientData && (
        <div
          style={{
            fontSize: '11px',
            fontWeight: 500,
            color: '#B8860B',
            fontStyle: 'italic',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span aria-hidden="true">⚠</span>
          Limited Data
        </div>
      )}
    </div>
  );
}
