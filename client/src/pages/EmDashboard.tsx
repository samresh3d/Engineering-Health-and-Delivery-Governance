import { useEffect, useState, useCallback, useMemo } from 'react';
import apiClient from '../api/client';
import type { AnalyticsFilter } from '../api/client';
import { colors, theme } from '../theme';
import KpiTile from '../components/KpiTile';
import KpiTrendChart from '../components/KpiTrendChart';
import DataBackedMonthPicker from '../components/DataBackedMonthPicker';
import type { KpiResult } from '../types';

/**
 * Engineering Manager Dashboard — Team-scoped KPI view.
 * Shows all 9 KPIs computed from the EM's uploaded sprint data,
 * with month picker, period toggle (Month/Quarter/Year), and team filter.
 */
export default function EmDashboard() {
  const [kpis, setKpis] = useState<KpiResult[]>([]);
  const [teams, setTeams] = useState<Array<{ id: number; name: string; rowCount: number }>>([]);
  const [functionName, setFunctionName] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(''); // YYYY-MM format
  const [periodMode, setPeriodMode] = useState<'month' | 'quarter' | 'year'>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);



  // Fetch teams + available months from the EM teams endpoint
  const fetchTeams = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/em/teams');
      setFunctionName(response.data.functionName);
      setTeams(response.data.teams);
    } catch {
      // Supplementary, don't block
    }
  }, []);

  // Fetch available months from the data-backed API endpoint
  const fetchAvailableMonths = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/dashboard/available-months');
      if (response.data.months && response.data.months.length > 0) {
        setAvailableMonths(response.data.months);
        // Default to most recent month with data
        if (!selectedMonth) {
          setSelectedMonth(response.data.months[0]);
        }
      }
    } catch {
      // Fallback: no month detection, show all data
    }
  }, [selectedMonth]);

  // Fetch KPIs
  const fetchKpis = useCallback(async () => {
    if (!functionName) return;

    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        functionName,
      };

      if (selectedTeam) {
        params.team = selectedTeam;
      }

      // Don't apply date filter — show all data for the function/team
      // The date range filter has issues with DD-MM-YYYY format in the DB
      // TODO: Once dates are normalized to ISO in the DB, enable period filtering

      const response = await apiClient.get('/api/dashboard/kpis', { params });
      const kpiData = response.data.data || response.data;
      setKpis(Array.isArray(kpiData) ? kpiData : []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.response?.data?.message || 'Failed to load KPI data.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [functionName, selectedTeam]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  useEffect(() => {
    if (functionName) {
      fetchAvailableMonths();
      fetchKpis();
    }
  }, [functionName, fetchKpis, fetchAvailableMonths]);

  // Build the analytics filter for KpiTrendChart — scoped to the EM's function
  const trendFilter: AnalyticsFilter = useMemo(() => {
    const filter: AnalyticsFilter = {};
    if (functionName) filter.functionName = functionName;
    if (selectedTeam) filter.team = selectedTeam;
    filter.period = periodMode;
    return filter;
  }, [functionName, selectedTeam, periodMode]);

  // ─── Loading State ───────────────────────────────────────────────────────

  if (loading && kpis.length === 0) {
    return (
      <div style={{ padding: '64px', textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: `4px solid ${colors.primaryLight}`, borderTop: `4px solid ${colors.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: colors.textSecondary, fontSize: '14px' }}>Loading dashboard...</p>
      </div>
    );
  }

  // ─── Error / Setup Required ──────────────────────────────────────────────

  if (error && kpis.length === 0) {
    const isSetupIssue = error.includes('No team') || error.includes('No function') || error.includes('not assigned');
    if (isSetupIssue) {
      return (
        <div style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ background: '#FFFBF0', border: '1px solid #F6E05E', borderRadius: '12px', padding: '32px', maxWidth: '600px', margin: '0 auto', textAlign: 'left' }}>
            <h3 style={{ fontSize: '18px', color: '#744210', fontWeight: 600, marginTop: 0, marginBottom: '16px' }}>⚙️ Setup Required</h3>
            <p style={{ fontSize: '14px', color: '#744210', marginBottom: '16px', lineHeight: '1.6' }}>Your account needs a function assignment before the dashboard can display data.</p>
            <ol style={{ fontSize: '14px', color: '#744210', lineHeight: '2', paddingLeft: '20px', marginBottom: '20px' }}>
              <li><strong>Contact your Super Admin</strong> — Assign Function.</li>
              <li><strong>Upload sprint data</strong> from the Upload page.</li>
              <li><strong>Return here</strong> — KPIs appear automatically.</li>
            </ol>
            <button onClick={fetchKpis} style={btnStyle}>Check Again</button>
          </div>
        </div>
      );
    }
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <p style={{ color: colors.red, marginBottom: '16px' }}>⚠️ {error}</p>
        <button onClick={fetchKpis} style={btnStyle}>Retry</button>
      </div>
    );
  }

  const hasData = kpis.some((k) => k.value !== null);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: colors.text, margin: 0 }}>
            Engineering Manager Dashboard
          </h1>
          <p style={{ fontSize: '14px', color: colors.textSecondary, marginTop: '4px' }}>
            {functionName} — {selectedTeam || 'All Teams'}
            {lastUpdated && <span style={{ marginLeft: '12px', opacity: 0.6 }}>Updated {lastUpdated}</span>}
          </p>
        </div>

        {/* Filters Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Team Filter */}
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            style={selectStyle}
          >
            <option value="">All Teams ({teams.reduce((s, t) => s + t.rowCount, 0)} rows)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.name}>{t.name} ({t.rowCount})</option>
            ))}
          </select>

          {/* Month Picker — data-backed */}
          <DataBackedMonthPicker
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            availableMonths={availableMonths}
          />

          {/* Period Mode Toggle */}
          <div style={{ display: 'flex', border: `1px solid ${colors.border}`, borderRadius: '6px', overflow: 'hidden' }}>
            {(['month', 'quarter', 'year'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodMode(p)}
                style={{
                  padding: '7px 14px', fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer',
                  background: periodMode === p ? colors.primary : '#fff',
                  color: periodMode === p ? '#fff' : colors.text,
                }}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* No data state */}
      {!hasData && (
        <div style={{ background: colors.secondary, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '40px', textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div>
          <p style={{ fontSize: '16px', fontWeight: 500, color: colors.text, marginBottom: '8px' }}>No KPI data available</p>
          <p style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: '16px' }}>
            Upload sprint data from the Upload page to see KPIs here.
          </p>
        </div>
      )}

      {/* KPI Grid */}
      {hasData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px', marginBottom: '32px' }}>
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

      {/* KPI Trend Chart — scoped to the EM's function */}
      {hasData && (
        <div style={{ marginBottom: '32px' }}>
          <KpiTrendChart filter={trendFilter} />
        </div>
      )}

      {/* Summary Stats */}
      {hasData && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <StatCard label="Green KPIs" value={kpis.filter((k) => k.ragStatus === 'green' && k.value !== null).length} total={kpis.filter((k) => k.value !== null).length} color="#38A169" />
          <StatCard label="Amber KPIs" value={kpis.filter((k) => k.ragStatus === 'amber' && k.value !== null).length} total={kpis.filter((k) => k.value !== null).length} color="#D69E2E" />
          <StatCard label="Red KPIs" value={kpis.filter((k) => k.ragStatus === 'red' && k.value !== null).length} total={kpis.filter((k) => k.value !== null).length} color="#E53E3E" />
          <StatCard label="Insufficient Data" value={kpis.filter((k) => k.insufficientData || k.value === null).length} total={9} color="#A0AEC0" />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '16px 20px', flex: '1', minWidth: '140px', boxShadow: theme.shadows.card }}>
      <p style={{ fontSize: '12px', color: colors.textSecondary, textTransform: 'uppercase', margin: '0 0 6px', letterSpacing: '0.5px' }}>{label}</p>
      <p style={{ fontSize: '24px', fontWeight: 700, color, margin: 0 }}>{value}<span style={{ fontSize: '14px', color: colors.textSecondary, fontWeight: 400 }}>/{total}</span></p>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '10px 24px', background: colors.primary, color: '#fff',
  border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', fontSize: '13px', borderRadius: '6px',
  border: `1px solid ${colors.border}`, background: '#fff', cursor: 'pointer',
};
