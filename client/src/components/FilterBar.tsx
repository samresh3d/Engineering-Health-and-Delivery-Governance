import { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import type { KpiFilter } from '../types';
import { colors } from '../theme';

interface FilterBarProps {
  onFilterChange: (filter: KpiFilter) => void;
}

/**
 * FilterBar — portfolio dropdown, team dropdown (filtered by portfolio), and date range picker.
 * On any change, fires onFilterChange with the current filter state.
 */
export default function FilterBar({ onFilterChange }: FilterBarProps) {
  const [portfolios, setPortfolios] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Fetch portfolios on mount
  useEffect(() => {
    apiClient
      .get<string[]>('/api/filters/portfolios')
      .then((res) => setPortfolios(res.data))
      .catch(() => setPortfolios([]));
  }, []);

  // Fetch teams when portfolio changes
  useEffect(() => {
    const params = selectedPortfolio
      ? { portfolio: selectedPortfolio }
      : undefined;

    apiClient
      .get<string[]>('/api/filters/teams', { params })
      .then((res) => setTeams(res.data))
      .catch(() => setTeams([]));
  }, [selectedPortfolio]);

  // Notify parent whenever any filter value changes
  const emitFilter = useCallback(
    (portfolio: string, team: string, start: string, end: string) => {
      const filter: KpiFilter = {};
      if (portfolio) filter.portfolio = portfolio;
      if (team) filter.team = team;
      if (start) filter.startDate = start;
      if (end) filter.endDate = end;
      onFilterChange(filter);
    },
    [onFilterChange],
  );

  const handlePortfolioChange = (value: string) => {
    setSelectedPortfolio(value);
    setSelectedTeam('');
    emitFilter(value, '', startDate, endDate);
  };

  const handleTeamChange = (value: string) => {
    setSelectedTeam(value);
    emitFilter(selectedPortfolio, value, startDate, endDate);
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    emitFilter(selectedPortfolio, selectedTeam, value, endDate);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    emitFilter(selectedPortfolio, selectedTeam, startDate, value);
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
