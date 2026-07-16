import { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { colors } from '../theme';

interface TeamSummary {
  id: number;
  name: string;
  rowCount: number;
  lastIngestedAt: string | null;
}

interface TeamDataRow {
  sno: number | null;
  team: string;
  jira_id: string;
  story_name: string | null;
  dev_start_date: string | null;
  dev_end_date: string | null;
  production_status: string | null;
  resources: string | null;
  ai_used: string | null;
  rollback: string | null;
  ingested_at: string;
}

export default function MyTeams() {
  const [functionName, setFunctionName] = useState<string>('');
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create team state
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Drill-down state
  const [selectedTeam, setSelectedTeam] = useState<TeamSummary | null>(null);
  const [teamData, setTeamData] = useState<TeamDataRow[]>([]);
  const [teamDataLoading, setTeamDataLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/em/teams');
      setFunctionName(response.data.functionName);
      setTeams(response.data.teams);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load teams.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await apiClient.post('/api/em/teams', { name: newTeamName.trim() });
      setNewTeamName('');
      await fetchTeams();
    } catch (err: any) {
      setCreateError(err?.response?.data?.error || 'Failed to create team.');
    } finally {
      setCreating(false);
    }
  };

  const handleViewData = async (team: TeamSummary, page = 1) => {
    setSelectedTeam(team);
    setTeamDataLoading(true);
    try {
      const response = await apiClient.get(`/api/em/teams/${team.id}/data`, {
        params: { page, pageSize: 25 },
      });
      setTeamData(response.data.rows);
      setPagination(response.data.pagination);
    } catch {
      setTeamData([]);
    } finally {
      setTeamDataLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <p style={{ color: colors.textSecondary }}>Loading teams...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <p style={{ color: colors.red }}>{error}</p>
        <button onClick={fetchTeams} style={styles.primaryButton}>Retry</button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>My Teams</h1>
          <p style={styles.subtitle}>Function: <strong>{functionName}</strong> — {teams.length} team{teams.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Create Team Section */}
      <div style={styles.createSection}>
        <input
          type="text"
          placeholder="New team name..."
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
          style={styles.input}
          maxLength={100}
        />
        <button
          onClick={handleCreateTeam}
          disabled={creating || !newTeamName.trim()}
          style={{ ...styles.primaryButton, opacity: creating || !newTeamName.trim() ? 0.6 : 1 }}
        >
          {creating ? 'Creating...' : '+ Create Team'}
        </button>
        {createError && <p style={{ color: colors.red, fontSize: '13px', margin: '8px 0 0' }}>{createError}</p>}
      </div>

      {/* Teams Grid */}
      <div style={styles.teamsGrid}>
        {teams.map((team) => (
          <div
            key={team.id}
            style={{
              ...styles.teamCard,
              borderLeft: selectedTeam?.id === team.id ? `4px solid ${colors.primary}` : '4px solid transparent',
            }}
          >
            <div style={styles.teamCardHeader}>
              <h3 style={styles.teamName}>{team.name}</h3>
              <span style={styles.rowBadge}>{team.rowCount} rows</span>
            </div>
            <p style={styles.teamMeta}>
              {team.lastIngestedAt
                ? `Last upload: ${new Date(team.lastIngestedAt).toLocaleDateString()}`
                : 'No data uploaded yet'}
            </p>
            {team.rowCount > 0 && (
              <button
                onClick={() => handleViewData(team)}
                style={styles.viewButton}
              >
                View Data →
              </button>
            )}
          </div>
        ))}
        {teams.length === 0 && (
          <p style={{ color: colors.textSecondary, padding: '24px', textAlign: 'center' }}>
            No teams yet. Create one above or upload a file with new team names.
          </p>
        )}
      </div>

      {/* Team Data Drill-Down */}
      {selectedTeam && (
        <div style={styles.dataSection}>
          <div style={styles.dataSectionHeader}>
            <h2 style={styles.dataHeading}>
              {selectedTeam.name} — Sprint Data
            </h2>
            <button onClick={() => setSelectedTeam(null)} style={styles.closeButton}>✕ Close</button>
          </div>

          {teamDataLoading ? (
            <p style={{ color: colors.textSecondary, padding: '16px' }}>Loading...</p>
          ) : teamData.length === 0 ? (
            <p style={{ color: colors.textSecondary, padding: '16px' }}>No data found.</p>
          ) : (
            <>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>S.No</th>
                      <th style={styles.th}>JIRA ID</th>
                      <th style={styles.th}>Story</th>
                      <th style={styles.th}>Dev Start</th>
                      <th style={styles.th}>Dev End</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Resources</th>
                      <th style={styles.th}>AI</th>
                      <th style={styles.th}>Rollback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamData.map((row, idx) => (
                      <tr key={idx} style={idx % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                        <td style={styles.td}>{row.sno ?? '-'}</td>
                        <td style={{ ...styles.td, fontWeight: 500 }}>{row.jira_id}</td>
                        <td style={{ ...styles.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.story_name || '-'}</td>
                        <td style={styles.td}>{row.dev_start_date || '-'}</td>
                        <td style={styles.td}>{row.dev_end_date || '-'}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.statusBadge, background: getStatusColor(row.production_status) }}>
                            {row.production_status || '-'}
                          </span>
                        </td>
                        <td style={styles.td}>{row.resources || '-'}</td>
                        <td style={styles.td}>{row.ai_used || '-'}</td>
                        <td style={styles.td}>{row.rollback || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div style={styles.pagination}>
                <span style={{ fontSize: '13px', color: colors.textSecondary }}>
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} rows)
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => handleViewData(selectedTeam, pagination.page - 1)}
                    style={{ ...styles.pageButton, opacity: pagination.page <= 1 ? 0.4 : 1 }}
                  >
                    ← Prev
                  </button>
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => handleViewData(selectedTeam, pagination.page + 1)}
                    style={{ ...styles.pageButton, opacity: pagination.page >= pagination.totalPages ? 0.4 : 1 }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function getStatusColor(status: string | null): string {
  if (!status) return '#eee';
  const s = status.toLowerCase();
  if (s.includes('deployed') || s.includes('live')) return '#C6F6D5';
  if (s.includes('progress')) return '#FEFCBF';
  if (s.includes('rolled back')) return '#FED7D7';
  return '#EDF2F7';
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: '1100px', margin: '0 auto' },
  header: { marginBottom: '24px' },
  heading: { fontSize: '24px', fontWeight: 700, color: colors.text, margin: 0 },
  subtitle: { fontSize: '14px', color: colors.textSecondary, marginTop: '4px' },
  createSection: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' as const },
  input: {
    padding: '10px 16px', fontSize: '14px', border: `1px solid ${colors.border}`,
    borderRadius: '8px', width: '260px', outline: 'none',
  },
  primaryButton: {
    padding: '10px 20px', fontSize: '14px', fontWeight: 600,
    background: colors.primary, color: '#fff', border: 'none',
    borderRadius: '8px', cursor: 'pointer',
  },
  teamsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: '32px' },
  teamCard: {
    background: '#fff', borderRadius: '12px', padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', transition: 'all 0.2s',
  },
  teamCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  teamName: { fontSize: '16px', fontWeight: 600, color: colors.text, margin: 0 },
  rowBadge: {
    fontSize: '12px', fontWeight: 500, color: colors.primary,
    background: colors.primaryLight, padding: '3px 10px', borderRadius: '12px',
  },
  teamMeta: { fontSize: '13px', color: colors.textSecondary, margin: '0 0 12px' },
  viewButton: {
    fontSize: '13px', fontWeight: 500, color: colors.primary,
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  },
  dataSection: {
    background: '#fff', borderRadius: '12px', padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: '8px',
  },
  dataSectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  dataHeading: { fontSize: '18px', fontWeight: 600, color: colors.text, margin: 0 },
  closeButton: {
    background: 'none', border: `1px solid ${colors.border}`, borderRadius: '6px',
    padding: '6px 12px', fontSize: '13px', cursor: 'pointer', color: colors.textSecondary,
  },
  tableWrapper: { overflowX: 'auto' as const },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  th: {
    textAlign: 'left' as const, padding: '10px 12px', fontWeight: 600,
    color: colors.textSecondary, borderBottom: `2px solid ${colors.border}`, whiteSpace: 'nowrap' as const,
  },
  td: { padding: '10px 12px', borderBottom: `1px solid ${colors.border}`, color: colors.text },
  rowEven: { background: '#fff' },
  rowOdd: { background: '#F9FAFB' },
  statusBadge: { padding: '2px 8px', borderRadius: '4px', fontSize: '12px', whiteSpace: 'nowrap' as const },
  pagination: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${colors.border}` },
  pageButton: {
    padding: '6px 14px', fontSize: '13px', border: `1px solid ${colors.border}`,
    borderRadius: '6px', background: '#fff', cursor: 'pointer',
  },
};
