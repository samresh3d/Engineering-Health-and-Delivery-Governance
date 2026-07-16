import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStoredToken } from '../../auth';
import { colors, theme } from '../../theme';

interface SprintDataEntry {
  id: number;
  sno: number | null;
  team: string;
  track: string;
  project: string;
  portfolio: string;
  jiraId: string;
  status: string | null;
  itemsList: string | null;
  walkthroughGivenOn: string | null;
  estimatedEffortWithAi: number | null;
  estimatedEffortWithoutAi: number | null;
  actualEffortWithAi: number | null;
  aiUsed: string | null;
  devStartDate: string | null;
  devEndDate: string | null;
  developmentStatus: string | null;
  uatDeliveryDate: string | null;
  uatDeliveryTarget: string | null;
  resources: string | null;
  goLivePlannedDate: string | null;
  goLiveDate: string | null;
  productionStatus: string | null;
  rollback: string | null;
  rollbackReason: string | null;
  storyDropReason: string | null;
}

interface TeamDetailData {
  team: string;
  portfolio: string;
  totalEntries: number;
  distinctProjects: number;
  entries: SprintDataEntry[];
}

export default function AdminTeamDetail() {
  const { teamName } = useParams<{ teamName: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<TeamDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamName) return;

    const token = getStoredToken();
    const url = `http://localhost:3000/api/admin/teams/${encodeURIComponent(teamName)}`;

    setLoading(true);
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (res.status === 404) {
          throw new Error('Team not found');
        }
        if (!res.ok) {
          throw new Error('Failed to fetch team details');
        }
        return res.json();
      })
      .then((responseData: TeamDetailData) => {
        setData(responseData);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch team details');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [teamName]);

  return (
    <div>
      {/* Back to Teams button */}
      <button
        onClick={() => navigate('/admin/teams')}
        aria-label="Back to Teams"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 16px',
          background: 'transparent',
          border: `1px solid ${colors.border}`,
          borderRadius: theme.borderRadius.sm,
          color: colors.primary,
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          fontFamily: theme.fonts.body,
          marginBottom: '24px',
          transition: 'background 0.2s, border-color 0.2s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = colors.primaryLight;
          (e.currentTarget as HTMLElement).style.borderColor = colors.primary;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.borderColor = colors.border;
        }}
      >
        ← Back to Teams
      </button>

      {/* Loading state */}
      {loading && (
        <div data-testid="team-detail-loading" style={{ color: colors.textSecondary, padding: '24px 0' }}>
          Loading team details...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          data-testid="team-detail-error"
          style={{
            color: colors.red,
            padding: '16px',
            background: '#fef2f2',
            borderRadius: theme.borderRadius.sm,
            border: '1px solid #FED7D7',
          }}
        >
          {error}
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <>
          {/* Team header */}
          <h1 style={{ color: colors.text, fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>
            {data.team}
          </h1>
          <p style={{ color: colors.textSecondary, fontSize: '14px', marginBottom: '24px' }}>
            Portfolio: {data.portfolio || '—'}
          </p>

          {/* Summary metrics */}
          <div
            data-testid="team-summary-metrics"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
              marginBottom: '32px',
            }}
          >
            <div
              style={{
                background: colors.background,
                border: `1px solid ${colors.border}`,
                borderRadius: theme.borderRadius.md,
                boxShadow: theme.shadows.card,
                padding: '20px',
              }}
            >
              <span style={{ fontSize: '13px', color: colors.textSecondary, fontWeight: 500 }}>
                Total Entries
              </span>
              <div style={{ fontSize: '28px', fontWeight: 700, color: colors.primary, marginTop: '4px' }}>
                {data.totalEntries}
              </div>
            </div>
            <div
              style={{
                background: colors.background,
                border: `1px solid ${colors.border}`,
                borderRadius: theme.borderRadius.md,
                boxShadow: theme.shadows.card,
                padding: '20px',
              }}
            >
              <span style={{ fontSize: '13px', color: colors.textSecondary, fontWeight: 500 }}>
                Distinct Projects
              </span>
              <div style={{ fontSize: '28px', fontWeight: 700, color: colors.accent, marginTop: '4px' }}>
                {data.distinctProjects}
              </div>
            </div>
          </div>

          {/* Entries data table */}
          <h2 style={{ color: colors.text, fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
            Team Entries
          </h2>

          {data.entries.length === 0 ? (
            <div data-testid="team-entries-empty" style={{ color: colors.textSecondary, padding: '16px 0' }}>
              No entries found for this team.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                data-testid="team-entries-table"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                  fontFamily: theme.fonts.body,
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: colors.secondary,
                      borderBottom: `2px solid ${colors.border}`,
                    }}
                  >
                    <th style={thStyle}>Jira ID</th>
                    <th style={thStyle}>Project</th>
                    <th style={thStyle}>Division</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Dev Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry, index) => (
                    <tr
                      key={entry.id ?? index}
                      style={{
                        borderBottom: `1px solid ${colors.border}`,
                        background: index % 2 === 0 ? colors.background : colors.secondary,
                      }}
                    >
                      <td style={tdStyle}>{entry.jiraId || '—'}</td>
                      <td style={tdStyle}>{entry.project || '—'}</td>
                      <td style={tdStyle}>{entry.track || '—'}</td>
                      <td style={tdStyle}>{entry.status || '—'}</td>
                      <td style={tdStyle}>{entry.developmentStatus || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontWeight: 600,
  color: colors.text,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
  color: colors.text,
  whiteSpace: 'nowrap',
};
