import { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { getRole } from '../auth';
import type { KpiFilter } from '../types';
import { colors } from '../theme';

interface FilterBarProps {
  onFilterChange: (filter: KpiFilter) => void;
}

/**
 * FilterBar — Function dropdown (Leadership/Super_Admin only), portfolio dropdown,
 * team dropdown (cascaded by Function when selected), and date range picker.
 * On any change, fires onFilterChange with the current filter state.
 */
export default function FilterBar({ onFilterChange }: FilterBarProps) {
  const [functions, setFunctions] = useState<string[]>([]);
  const [portfolios, setPortfolios] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedFunction, setSelectedFunction] = useState<string>('');
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const userRole = getRole();
  const showFunctionFilter = userRole === 'Leadership' || userRole === 'Super_Admin';

  // Fetch functions on mount (Leadership/Super_Admin only)
  useEffect(() => {
    if (!showFunctionFilter) return;

    apiClient
      .get<{ success: boolean; data: string[] }>('/api/filters/functions')
      .then((res) => {
        const data = res.data;
        // Handle both wrapped { success, data } and plain array responses
        if (Array.isArray(data)) {
          setFunctions(data);
        } else if (data && Array.isArray(data.data)) {
          setFunctions(data.data);
        } else {
          setFunctions([]);
        }
      })
      .catch(() => setFunctions([]));
  }, [showFunctionFilter]);

  // Fetch portfolios on mount
  useEffect(() => {
    apiClient
      .get<string[]>('/api/filters/portfolios')
      .then((res) => setPortfolios(res.data))
      .catch(() => setPortfolios([]));
  }, []);

  // Fetch teams when Function or portfolio changes
  // When Function is selected, cascade teams to only that Function's teams (Req 11.2)
  // When no Function selected, show all teams across all functions (Req 11.8)
  useEffect(() => {
    const params: Record<string, string> = {};

    if (selectedFunction) {
      params.functionName = selectedFunction;
    } else if (selectedPortfolio) {
      params.portfolio = selectedPortfolio;
    }

    apiClient
      .get<string[] | { success: boolean; data: Array<{ teamName: string }> | string[] }>(
        '/api/filters/teams',
        { params }
      )
      .then((res) => {
        const data = res.data;
        // Handle different response shapes from the API
        if (Array.isArray(data)) {
          // Plain array of strings (legacy)
          setTeams(data);
        } else if (data && Array.isArray(data.data)) {
          // Wrapped response: { success, data: [...] }
          const teamData = data.data;
          if (teamData.length > 0 && typeof teamData[0] === 'object' && 'teamName' in teamData[0]) {
            // Array of { teamName, functionName } objects
            setTeams((teamData as Array<{ teamName: string }>).map((t) => t.teamName));
          } else {
            // Array of strings or TeamConfig objects with teamName
            setTeams(
              (teamData as Array<string | { teamName: string }>).map((t) =>
                typeof t === 'string' ? t : t.teamName
              )
            );
          }
        } else {
          setTeams([]);
        }
      })
      .catch(() => setTeams([]));
  }, [selectedFunction, selectedPortfolio]);

  // Notify parent whenever any filter value changes
  const emitFilter = useCallback(
    (functionName: string, portfolio: string, team: string, start: string, end: string) => {
      const filter: KpiFilter = {};
      if (functionName) filter.functionName = functionName;
      if (portfolio) filter.portfolio = portfolio;
      if (team) filter.team = team;
      if (start) filter.startDate = start;
      if (end) filter.endDate = end;
      onFilterChange(filter);
    },
    [onFilterChange],
  );

  const handleFunctionChange = (value: string) => {
    setSelectedFunction(value);
    setSelectedTeam('');
    emitFilter(value, selectedPortfolio, '', startDate, endDate);
  };

  const handlePortfolioChange = (value: string) => {
    setSelectedPortfolio(value);
    setSelectedTeam('');
    emitFilter(selectedFunction, value, '', startDate, endDate);
  };

  const handleTeamChange = (value: string) => {
    setSelectedTeam(value);
    emitFilter(selectedFunction, selectedPortfolio, value, startDate, endDate);
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    emitFilter(selectedFunction, selectedPortfolio, selectedTeam, value, endDate);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    emitFilter(selectedFunction, selectedPortfolio, selectedTeam, startDate, value);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        alignItems: 'center',
        padding: '12px 16px',
        backgroundColor: colors.secondary,
        borderRadius: '8px',
        marginBottom: '24px',
      }}
      aria-label="Dashboard filters"
      role="toolbar"
    >
      {/* Function dropdown — visible only to Leadership/Super_Admin (Req 11.5, 11.6) */}
      {showFunctionFilter && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>
            Function
          </span>
          <select
            value={selectedFunction}
            onChange={(e) => handleFunctionChange(e.target.value)}
            aria-label="Select function"
            style={selectStyle}
          >
            <option value="">All Functions</option>
            {functions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Portfolio dropdown */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>
          Portfolio
        </span>
        <select
          value={selectedPortfolio}
          onChange={(e) => handlePortfolioChange(e.target.value)}
          aria-label="Select portfolio"
          style={selectStyle}
        >
          <option value="">All Portfolios</option>
          {portfolios.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      {/* Team dropdown */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>
          Team
        </span>
        <select
          value={selectedTeam}
          onChange={(e) => handleTeamChange(e.target.value)}
          aria-label="Select team"
          style={selectStyle}
        >
          <option value="">All Teams</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      {/* Start date */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>
          Start Date
        </span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => handleStartDateChange(e.target.value)}
          aria-label="Start date"
          style={inputStyle}
        />
      </label>

      {/* End date */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>
          End Date
        </span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => handleEndDateChange(e.target.value)}
          aria-label="End date"
          style={inputStyle}
        />
      </label>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  fontSize: '14px',
  minWidth: '160px',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: '4px',
  border: '1px solid #ccc',
  fontSize: '14px',
};
