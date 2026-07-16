import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { colors, theme } from '../../theme';

interface AnalyticsData {
  totalTeams: number;
  totalEntries: number;
  recentUploads: number;
  pendingItems: number;
}

interface StatCard {
  label: string;
  value: number;
  icon: string;
  color: string;
}

function LoadingSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: theme.spacing.lg,
      }}
    >
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          data-testid="loading-skeleton"
          style={{
            background: colors.secondary,
            borderRadius: theme.borderRadius.md,
            padding: theme.spacing.lg,
            height: '120px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAnalytics() {
      try {
        const response = await apiClient.get('/api/admin/analytics');
        if (!cancelled) {
          setAnalytics(response.data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load analytics data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAnalytics();
    return () => { cancelled = true; };
  }, []);

  const statCards: StatCard[] = analytics
    ? [
        { label: 'Total Teams', value: analytics.totalTeams, icon: '👥', color: colors.primary },
        { label: 'Total Entries', value: analytics.totalEntries, icon: '📋', color: colors.accent },
        { label: 'Recent Uploads', value: analytics.recentUploads, icon: '📤', color: colors.green },
        { label: 'Pending Items', value: analytics.pendingItems, icon: '⏳', color: colors.amber },
      ]
    : [];

  return (
    <div>
      <div style={{ marginBottom: theme.spacing.lg }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: colors.text, marginBottom: '4px' }}>
          Admin Dashboard
        </h1>
        <p style={{ fontSize: '14px', color: colors.textSecondary }}>
          Platform-wide analytics overview
        </p>
      </div>

      {loading && <LoadingSkeleton />}

      {error && (
        <div
          style={{
            background: '#FFF5F5',
            border: '1px solid #FED7D7',
            borderRadius: theme.borderRadius.md,
            padding: theme.spacing.lg,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '16px', color: colors.red, fontWeight: 500 }}>
            ⚠️ {error}
          </p>
        </div>
      )}

      {!loading && !error && analytics && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: theme.spacing.lg,
          }}
        >
          {statCards.map((card) => (
            <div
              key={card.label}
              data-testid={`stat-card-${card.label.toLowerCase().replace(/\s+/g, '-')}`}
              style={{
                background: colors.background,
                border: `1px solid ${colors.border}`,
                borderRadius: theme.borderRadius.md,
                boxShadow: theme.shadows.card,
                padding: theme.spacing.lg,
                display: 'flex',
                flexDirection: 'column',
                gap: theme.spacing.sm,
                transition: 'box-shadow 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: colors.textSecondary, fontWeight: 500 }}>
                  {card.label}
                </span>
                <span style={{ fontSize: '24px' }}>{card.icon}</span>
              </div>
              <span
                style={{
                  fontSize: '32px',
                  fontWeight: 700,
                  color: card.color,
                  lineHeight: 1.2,
                }}
              >
                {card.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
