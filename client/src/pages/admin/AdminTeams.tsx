import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredToken } from '../../auth';
import { colors, theme } from '../../theme';
import { API_BASE_URL } from '../../config';

interface TeamSummary {
  team: string;
  portfolio: string;
  entryCount: number;
}

export default function AdminTeams() {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [portfolioFilter, setPortfolioFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const token = getStoredToken();
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (portfolioFilter) params.set('portfolio', portfolioFilter);

    const url = `${API_BASE_URL}/api/admin/teams?${params.toString()}`;

    setLoading(true);
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch teams');
        return res.json();
      })
      .then((data) => {
        setTeams(data.teams);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch teams');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [search, portfolioFilter]);

  const portfolios = useMemo(() => {
    const allPortfolios = teams.map((t) => t.portfolio).filter(Boolean);
    return Array.from(new Set(allPortfolios)).sort();
  }, [teams]);

  return (
    <div>
      <h1 style={{ color: colors.text, fontSize: '24px', marginBottom: '24px', fontWeight: 600 }}>
        Teams
      </h1>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          placeholder="Search teams..."
          aria-label="Search teams"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '10px 14px',
            border: `1px solid ${colors.border}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: '14px',
            minWidth: '220px',
            outline: 'none',
            fontFamily: theme.fonts.body,
          }}
        />
        <select
          aria-label="Filter by portfolio"
          value={portfolioFilter}
          onChange={(e) => setPortfolioFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            border: `1px solid ${colors.border}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: '14px',
            minWidth: '180px',
            background: colors.background,
            fontFamily: theme.fonts.body,
          }}
        >
          <option value="">All Portfolios</option>
          {portfolios.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {loading && (
        <div data-testid="teams-loading" style={{ color: colors.textSecondary, padding: '24px 0' }}>
          Loading teams...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          data-testid="teams-error"
          style={{ color: colors.red, padding: '12px', background: '#fef2f2', borderRadius: theme.borderRadius.sm }}
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && teams.length === 0 && (
        <div data-testid="teams-empty" style={{ color: colors.textSecondary, padding: '24px 0' }}>
          No teams found.
        </div>
      )}

      {/* Team cards grid */}
      {!loading && !error && teams.length > 0 && (
        <div
          data-testid="teams-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          {teams.map((team) => (
            <div
              key={team.team}
              data-testid={`team-card-${team.team}`}
              role="button"
              tabIndex={0}
              aria-label={`View team ${team.team}`}
              onClick={() => navigate(`/admin/teams/${encodeURIComponent(team.team)}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/admin/teams/${encodeURIComponent(team.team)}`);
                }
              }}
              style={{
                padding: '20px',
                background: colors.background,
                border: `1px solid ${colors.border}`,
                borderRadius: theme.borderRadius.md,
                boxShadow: theme.shadows.card,
                cursor: 'pointer',
                transition: 'box-shadow 0.2s, border-color 0.2s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = theme.shadows.hover;
                (e.currentTarget as HTMLElement).style.borderColor = colors.primary;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = theme.shadows.card;
                (e.currentTarget as HTMLElement).style.borderColor = colors.border;
              }}
            >
              <h3
                style={{
                  color: colors.text,
                  fontSize: '16px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  margin: '0 0 8px 0',
                }}
              >
                {team.team}
              </h3>
              <p
                style={{
                  color: colors.textSecondary,
                  fontSize: '13px',
                  margin: '0 0 4px 0',
                }}
              >
                Portfolio: {team.portfolio || '—'}
              </p>
              <p
                style={{
                  color: colors.primary,
                  fontSize: '14px',
                  fontWeight: 500,
                  margin: '0',
                }}
              >
                {team.entryCount} {team.entryCount === 1 ? 'entry' : 'entries'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
