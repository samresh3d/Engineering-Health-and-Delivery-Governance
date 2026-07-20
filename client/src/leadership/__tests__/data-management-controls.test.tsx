/**
 * View-layer unit tests for the enhanced Data Management controls.
 *
 * Covers the four UI enhancements:
 *  - Collapsible, categorized grid filter panel (collapsed by default).
 *  - Full-screen overlay for the data surface (enter / exit).
 *  - Explicit "Save" that creates a version checkpoint and tracks unsaved
 *    changes.
 *
 * These render deterministically in jsdom (they do not depend on AG-Grid row
 * virtualization).
 */
import { act } from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';

import { LeadershipProvider } from '../state/LeadershipProvider';
import { useLeadership } from '../state/useLeadership';
import DataManagementView from '../components/DataManagementView';
import { TEST_WORKBOOK_BUFFER, ROW_ID_ALPHA_JAN } from './test-workbook';

/**
 * Test harness: renders hidden buttons wired to provider actions so tests can
 * drive state (load a model, commit an edit) via a single provider instance
 * shared with the component under test.
 */
function Harness({ children }: { children?: ReactNode }) {
  const { uploadWorkbook, commitEdit } = useLeadership();
  return (
    <div>
      <button
        type="button"
        data-testid="harness-load-model"
        onClick={() => uploadWorkbook(TEST_WORKBOOK_BUFFER)}
      >
        load model
      </button>
      <button
        type="button"
        data-testid="harness-commit-edit"
        onClick={() => commitEdit(ROW_ID_ALPHA_JAN, 'actual', '999')}
      >
        commit edit
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

function clickTestId(testId: string) {
  act(() => {
    screen.getByTestId(testId).click();
  });
}

function loadModel() {
  clickTestId('harness-load-model');
}

beforeEach(() => {
  localStorage.clear();
});

describe('DataManagementView controls', () => {
  it('keeps the grid filter panel collapsed by default and expands on toggle', () => {
    renderView();
    loadModel();

    // Scope assertions to the filter region: some dimension labels (e.g. "KPI",
    // "Month") also appear as matrix column headers elsewhere on the page.
    const filterBar = screen.getByRole('region', { name: /grid filters/i });

    // Collapsed by default: the categorized dimension group labels are absent.
    expect(within(filterBar).queryByText('Month')).not.toBeInTheDocument();
    expect(within(filterBar).queryByText('Engineering Pillar')).not.toBeInTheDocument();
    expect(within(filterBar).queryByText('Status')).not.toBeInTheDocument();

    // Expand the panel via the always-visible header toggle.
    clickTestId('grid-filter-toggle');

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
  });

  it('enters and exits full-screen for the data surface', () => {
    renderView();
    loadModel();

    // Not full-screen initially.
    expect(screen.queryByTestId('fullscreen-overlay')).not.toBeInTheDocument();

    // Enter full-screen.
    clickTestId('fullscreen-toggle');
    expect(screen.getByTestId('fullscreen-overlay')).toBeInTheDocument();

    // Exit full-screen.
    clickTestId('fullscreen-exit');
    expect(screen.queryByTestId('fullscreen-overlay')).not.toBeInTheDocument();
  });

  it('tracks unsaved changes and creates a version checkpoint on Save', () => {
    renderView();
    loadModel();

    // Switch to grid view so the VersionPanel (side column) renders.
    clickTestId('view-mode-grid');

    // Freshly loaded model: no unsaved changes → Save button reads "Saved"
    // and is disabled; the version store is empty.
    const savedButton = screen.getByTestId('save-changes');
    expect(savedButton).toHaveTextContent('Saved');
    expect(savedButton).toBeDisabled();
    expect(screen.getByTestId('version-empty')).toBeInTheDocument();

    // Make an edit → unsaved changes appear.
    clickTestId('harness-commit-edit');
    const dirtyButton = screen.getByTestId('save-changes');
    expect(dirtyButton).toHaveTextContent('Save changes');
    expect(dirtyButton).not.toBeDisabled();

    // Save → a version checkpoint is created and the unsaved indicator clears.
    clickTestId('save-changes');
    expect(screen.queryByTestId('version-empty')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('version-item').length).toBeGreaterThan(0);

    const afterSaveButton = screen.getByTestId('save-changes');
    expect(afterSaveButton).toHaveTextContent('Saved');
    expect(afterSaveButton).toBeDisabled();
  });
});
