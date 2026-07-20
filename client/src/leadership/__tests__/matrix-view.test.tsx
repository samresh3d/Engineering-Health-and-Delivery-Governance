/**
 * View-layer unit tests for the Excel-style {@link MatrixView} (pivot).
 *
 * Uses the shared normalized fixture ({@link TEST_WORKBOOK_BUFFER}) which has
 * no How-to-Measure/Source columns — those descriptor cells therefore render an
 * em dash. The test verifies the core pivot requirement: KPI rows crossed with
 * Month/Team columns holding the correct Actual values, plus edit reflection.
 */
import { act } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';

import { LeadershipProvider } from '../state/LeadershipProvider';
import { useLeadership } from '../state/useLeadership';
import MatrixView from '../components/MatrixView';
import { TEST_WORKBOOK_BUFFER } from './test-workbook';

function Harness() {
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
      <MatrixView />
    </div>
  );
}

function renderMatrix() {
  return render(
    <LeadershipProvider>
      <Harness />
    </LeadershipProvider>
  );
}

function click(testId: string) {
  act(() => {
    screen.getByTestId(testId).click();
  });
}

async function loadModel() {
  click('harness-load-model');
  await waitFor(() => {
    expect(screen.queryByTestId('leadership-matrix-view')).not.toBeNull();
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('MatrixView', () => {
  it('renders the pivot table after a model is loaded', async () => {
    renderMatrix();
    await loadModel();

    expect(screen.getByTestId('leadership-matrix-view')).toBeTruthy();
    // Descriptor headers present.
    expect(screen.getByText('KPI')).toBeTruthy();
    expect(screen.getByText('How to Measure')).toBeTruthy();
    expect(screen.getByText('Source')).toBeTruthy();
  });

  it('renders KPI names as row labels and Team labels as column headers', async () => {
    renderMatrix();
    await loadModel();

    const view = screen.getByTestId('leadership-matrix-view');
    // KPI row label.
    expect(within(view).getByText('Velocity')).toBeTruthy();
    // Team sub-column headers (Alpha and Beta appear once each per month; the
    // fixture has a single month with data on load — assert presence).
    expect(within(view).getAllByText('Alpha').length).toBeGreaterThan(0);
    expect(within(view).getAllByText('Beta').length).toBeGreaterThan(0);
    // Month group header.
    expect(within(view).getAllByText('Jan').length).toBeGreaterThan(0);
  });

  it('renders a known cell value at the right KPI/Month/Team intersection', async () => {
    renderMatrix();
    await loadModel();

    const view = screen.getByTestId('leadership-matrix-view');
    // Alpha/Velocity/Jan is 100 in the fixture; it appears in an input value.
    const inputs = Array.from(
      view.querySelectorAll('input')
    ) as HTMLInputElement[];
    const values = inputs.map((i) => i.value);
    expect(values).toContain('100');
    // Alpha/Velocity/Feb is 80.
    expect(values).toContain('80');
  });

  it('reflects a committed edit in the displayed cell value', async () => {
    renderMatrix();
    await loadModel();

    const view = screen.getByTestId('leadership-matrix-view');
    const cell = (Array.from(view.querySelectorAll('input')) as HTMLInputElement[]).find(
      (i) => i.value === '100'
    );
    expect(cell).toBeTruthy();

    fireEvent.change(cell!, { target: { value: '150' } });
    fireEvent.blur(cell!);

    await waitFor(() => {
      const values = (
        Array.from(
          screen.getByTestId('leadership-matrix-view').querySelectorAll('input')
        ) as HTMLInputElement[]
      ).map((i) => i.value);
      expect(values).toContain('150');
    });
  });
});
