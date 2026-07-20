/**
 * View-layer unit tests for the Data Management page shell (task 15.8).
 *
 * Covers:
 *  - Req 1.7 — empty-state message directing the user to import data.
 *  - Req 1.1 — the Data Management region renders (nav reachability is verified
 *    more fully in task 16.1; here we assert the page's region is present).
 *  - Req 7.1 — the grid filter bar renders its Month/Team/Pillar/KPI/Status/
 *    Updated By controls.
 *
 * These assertions target the page shell and the filter bar, which render
 * deterministically in jsdom (they do not depend on AG-Grid row virtualization).
 */
import { act } from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';

import { LeadershipProvider } from '../state/LeadershipProvider';
import { useLeadership } from '../state/useLeadership';
import DataManagementView from '../components/DataManagementView';
import { TEST_WORKBOOK_BUFFER } from './test-workbook';

/**
 * Test harness: renders hidden buttons wired to provider actions so tests can
 * drive state (load a model) via a single provider instance shared with the
 * component under test.
 */
function Harness({ children }: { children?: ReactNode }) {
  const { uploadWorkbook } = useLeadership();
  return (
    <div>
      <button
        type="button"
        data-testid="harness-load-model"
        onClick={() => uploadWorkbook(TEST_WORKBOOK_BUFFER)}
      >
        load model
      </button>
      {children}
    </div>
  );
}

function renderView() {
  return render(
    <LeadershipProvider>
      <Harness>
        <DataManagementView />
      </Harness>
    </LeadershipProvider>
  );
}

/** Click the harness "load model" button, flushing the synchronous parse. */
function loadModel() {
  act(() => {
    screen.getByTestId('harness-load-model').click();
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('DataManagementView', () => {
  it('shows an empty-state directing the user to import data when no model (Req 1.7)', () => {
    renderView();

    // The region renders even in the empty state (Req 1.1).
    expect(screen.getByTestId('data-management-view')).toBeInTheDocument();

    const empty = screen.getByTestId('data-management-empty');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent(/no data/i);
    expect(empty).toHaveTextContent(/import a workbook/i);
  });

  it('renders the data-management region once a model is loaded (Req 1.1)', () => {
    renderView();
    loadModel();

    // The region is still present, now in its populated layout.
    expect(screen.getByTestId('data-management-view')).toBeInTheDocument();
    // The empty state is gone once a model is available.
    expect(screen.queryByTestId('data-management-empty')).not.toBeInTheDocument();
  });

  it('renders the grid filter bar with all filter controls once a model loads (Req 7.1)', () => {
    renderView();
    loadModel();

    const filterBar = screen.getByRole('region', { name: /grid filters/i });
    expect(filterBar).toBeInTheDocument();

    // The filter panel is collapsed by default; expand it so the categorized
    // dimension groups are rendered before asserting on them.
    act(() => {
      screen.getByTestId('grid-filter-toggle').click();
    });

    // One labelled control group per grid dimension.
    for (const label of [
      'Month',
      'Team',
      'Engineering Pillar',
      'KPI',
      'Status',
      'Updated By',
    ]) {
      expect(within(filterBar).getByText(label)).toBeInTheDocument();
    }

    // The clear-filters affordance is present (Req 7.4 hook).
    expect(
      within(filterBar).getByRole('button', { name: /clear filters/i })
    ).toBeInTheDocument();
  });
});
