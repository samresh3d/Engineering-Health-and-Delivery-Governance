import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import KpiTile from '../components/KpiTile';
import type { KpiResult } from '../types';
import { colors } from '../theme';
import { getStoredUser } from '../auth';
import LeadershipDashboard from './LeadershipDashboard';
import EmDashboard from './EmDashboard';

/**
 * Dashboard page — Role-based rendering.
 * Leadership / Super_Admin → LeadershipDashboard
 * Engineering_Manager → EmDashboard
 * Others → Default KPI overview
 */
export default function Dashboard() {
  const user = getStoredUser();

  if (user?.role === 'Leadership' || user?.role === 'Super_Admin') {
    return <LeadershipDashboard />;
  }
  if (user?.role === 'Engineering_Manager') {
    return <EmDashboard />;
  }

  return <DefaultDashboard />;
}

/**
 * DefaultDashboard — Original KPI overview for non-Leadership/non-EM users.
 */
function DefaultDashboard() {
  const [kpis, setKpis] = useState<KpiResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchKpis() {
      try {
        const response = await apiClient.get('/api/dashboard/kpis');
        if (!cancelled) {
          const kpiData = response.data.data || response.data;
          setKpis(Array.isArray(kpiData) ? kpiData : []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load KPI data. Please check that the server is running.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchKpis();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '64px', textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: `4px solid ${colors.primaryLight}`, borderTop: `4px solid ${colors.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: colors.textSecondary, fontSize: '14px' }}>Loading KPI data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ background: '#FFF5F5', border: '1px solid #FED7D7', borderRadius: '12px', padding: '32px', maxWidth: '500px', margin: '0 auto' }}>
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
          Delivery Health Overview
        </h1>
        <p style={{ fontSize: '14px', color: colors.textSecondary }}>
          Real-time engineering KPIs across all portfolios
        </p>
      </div>

      {kpis.length === 0 ? (
        <div style={{
          background: colors.background,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          padding: '48px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <p style={{ fontSize: '18px', fontWeight: 500, color: colors.text, marginBottom: '8px' }}>
            No data uploaded yet
          </p>
          <p style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: '20px' }}>
            Upload a sprint delivery Excel file to see KPI metrics.
          </p>
          <a
            href="/upload"
            style={{
              display: 'inline-block',
              padding: '10px 24px',
              background: colors.primary,
              color: '#fff',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Upload Data
          </a>
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
    </div>
  );
}
