import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import KpiTile from '../components/KpiTile';
import type { KpiResult } from '../types';

/**
 * Dashboard page — fetches KPI data and renders 9 KPI tiles in a responsive grid.
 */
export default function Dashboard() {
  const [kpis, setKpis] = useState<KpiResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchKpis() {
      try {
        const response = await apiClient.get<KpiResult[]>('/api/dashboard/kpis');
        if (!cancelled) {
          setKpis(response.data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load KPI data. Please try again later.');
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
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <p>Loading KPI data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#DC3545' }}>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ marginBottom: '24px', color: '#333333' }}>Dashboard</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
        }}
        className="kpi-grid"
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
    </div>
  );
}
