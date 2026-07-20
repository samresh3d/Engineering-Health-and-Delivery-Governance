import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import InsightsPanel from './InsightsPanel';
import {
  LeadershipContext,
  type LeadershipContextValue,
} from '../state/LeadershipContext';
import type {
  FilteredDataset,
  FilterSelection,
  Period,
} from '../model/types';

/** Empty filter selection used across fixtures. */
const EMPTY_SELECTION: FilterSelection = {
  months: [],
  years: [],
  teams: [],
  kpis: [],
  pillars: [],
  statuses: [],
};

function period(key: string, month: string): Period {
  return { year: 2025, month, key };
}

/**
 * Render InsightsPanel with a stub Leadership context supplying `filtered`.
 * Only `filtered` matters to the panel; the rest of the context is stubbed.
 */
function renderWithFiltered(filtered: FilteredDataset | null) {
  const value = {
    filtered,
    // Unused-by-panel state/actions, stubbed to satisfy the context type.
    model: null,
    status: 'ready',
    error: null,
    selection: EMPTY_SELECTION,
    options: {
      months: [],
      years: [],
      teams: [],
      kpis: [],
      pillars: [],
      statuses: [],
      businessUnits: null,
    },
    theme: 'light',
    search: '',
    uploadWorkbook: () => {},
    updateSelection: () => {},
    clearFilters: () => {},
    setSearch: () => {},
    toggleTheme: () => {},
  } as unknown as LeadershipContextValue;

  return render(
    <LeadershipContext.Provider value={value}>
      <InsightsPanel />
    </LeadershipContext.Provider>
  );
}

describe('InsightsPanel', () => {
  it('shows a no-data empty state when filtered is null', () => {
    renderWithFiltered(null);
    expect(screen.getByTestId('insights-empty')).toBeTruthy();
    expect(screen.queryByTestId('insights-panel')).toBeNull();
  });

  it('shows a no-insights empty state when the dataset yields none', () => {
    const empty: FilteredDataset = {
      metrics: [],
      kpiDefinitions: [],
      periods: [],
      teams: [],
      selection: EMPTY_SELECTION,
    };
    renderWithFiltered(empty);
    expect(screen.getByTestId('insights-empty')).toBeTruthy();
  });

  it('renders insight messages grouped by type for a populated dataset', () => {
    const jan = period('2025-01', 'Jan');
    const feb = period('2025-02', 'Feb');
    const data: FilteredDataset = {
      metrics: [
        { team: 'Alpha', kpi: 'Velocity', period: jan, value: 100 },
        { team: 'Alpha', kpi: 'Velocity', period: feb, value: 130 },
        { team: 'Beta', kpi: 'Velocity', period: jan, value: 50 },
        { team: 'Beta', kpi: 'Velocity', period: feb, value: 55 },
      ],
      kpiDefinitions: [
        {
          name: 'Velocity',
          pillar: 'Delivery',
          direction: 'HigherIsBetter',
          target: 40,
          amberBand: null,
        },
      ],
      periods: [jan, feb],
      teams: ['Alpha', 'Beta'],
      selection: EMPTY_SELECTION,
    };

    renderWithFiltered(data);

    // The panel renders (not the empty state).
    expect(screen.getByTestId('insights-panel')).toBeTruthy();

    // A >=10% MoM change for Alpha's Velocity produces a MoMChange group.
    expect(screen.getByTestId('insight-group-MoMChange')).toBeTruthy();
    // Alpha leads Velocity, so a KPI-leader group is present.
    expect(screen.getByTestId('insight-group-HighestForKpi')).toBeTruthy();

    // Each insight's message text is displayed.
    const items = screen.getAllByTestId(/^insight-item-/);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((el) => /Alpha/.test(el.textContent ?? ''))).toBe(true);
  });

  it('regenerates insights from the filtered dataset on filter change', () => {
    const jan = period('2025-01', 'Jan');
    const feb = period('2025-02', 'Feb');
    const twoPeriods: FilteredDataset = {
      metrics: [
        { team: 'Alpha', kpi: 'Velocity', period: jan, value: 100 },
        { team: 'Alpha', kpi: 'Velocity', period: feb, value: 200 },
      ],
      kpiDefinitions: [
        {
          name: 'Velocity',
          pillar: 'Delivery',
          direction: 'HigherIsBetter',
          target: 40,
          amberBand: null,
        },
      ],
      periods: [jan, feb],
      teams: ['Alpha'],
      selection: EMPTY_SELECTION,
    };

    const { rerender } = renderWithFiltered(twoPeriods);
    // With two periods a MoM insight is generated (Req 11.5).
    expect(screen.getByTestId('insight-group-MoMChange')).toBeTruthy();

    // Simulate a filter change narrowing to a single period: MoM insights are
    // omitted (Req 11.6), demonstrating regeneration from the new dataset.
    const onePeriod: FilteredDataset = {
      metrics: [{ team: 'Alpha', kpi: 'Velocity', period: feb, value: 200 }],
      kpiDefinitions: twoPeriods.kpiDefinitions,
      periods: [feb],
      teams: ['Alpha'],
      selection: EMPTY_SELECTION,
    };
    const value = {
      filtered: onePeriod,
      model: null,
      status: 'ready',
      error: null,
      selection: EMPTY_SELECTION,
      options: {
        months: [],
        years: [],
        teams: [],
        kpis: [],
        pillars: [],
        statuses: [],
        businessUnits: null,
      },
      theme: 'light',
      search: '',
      uploadWorkbook: () => {},
      updateSelection: () => {},
      clearFilters: () => {},
      setSearch: () => {},
      toggleTheme: () => {},
    } as unknown as LeadershipContextValue;

    rerender(
      <LeadershipContext.Provider value={value}>
        <InsightsPanel />
      </LeadershipContext.Provider>
    );

    expect(screen.queryByTestId('insight-group-MoMChange')).toBeNull();
  });
});
