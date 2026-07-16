import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DrillDownPanel from './DrillDownPanel';
import type { DivisionMetrics } from '../types/governance';

const mockDivisions: DivisionMetrics[] = [
  {
    divisionName: 'Platform',
    healthScore: { value: 85, ragStatus: 'green' },
    kpis: [
      { kpiName: 'sprint_commitment', value: 90, ragStatus: 'green', percentChange: 5, trendDirection: 'up', insufficientData: false },
      { kpiName: 'release_success_rate', value: 75, ragStatus: 'amber', percentChange: -2, trendDirection: 'down', insufficientData: false },
    ],
  },
  {
    divisionName: 'Mobile',
    healthScore: { value: 45, ragStatus: 'red' },
    kpis: [
      { kpiName: 'deployment_frequency', value: 30, ragStatus: 'red', percentChange: -10, trendDirection: 'down', insufficientData: false },
    ],
  },
];

describe('DrillDownPanel', () => {
  const defaultProps = {
    teamId: 'team-alpha',
    selectedPeriod: 'quarter' as const,
    divisions: mockDivisions,
    expandedDivision: null,
    onDivisionToggle: vi.fn(),
  };

  it('renders all division rows', () => {
    render(<DrillDownPanel {...defaultProps} />);
    expect(screen.getByTestId('division-row-Platform')).toBeInTheDocument();
    expect(screen.getByTestId('division-row-Mobile')).toBeInTheDocument();
  });

  it('displays empty state when no divisions', () => {
    render(<DrillDownPanel {...defaultProps} divisions={[]} />);
    expect(screen.getByText(/no divisions configured/i)).toBeInTheDocument();
  });

  it('shows division names', () => {
    render(<DrillDownPanel {...defaultProps} />);
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
  });

  it('displays health score values', () => {
    render(<DrillDownPanel {...defaultProps} />);
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('sets aria-expanded=false when division is collapsed', () => {
    render(<DrillDownPanel {...defaultProps} expandedDivision={null} />);
    const platformRow = screen.getByTestId('division-row-Platform');
    expect(platformRow).toHaveAttribute('aria-expanded', 'false');
    const mobileRow = screen.getByTestId('division-row-Mobile');
    expect(mobileRow).toHaveAttribute('aria-expanded', 'false');
  });

  it('sets aria-expanded=true on the expanded division', () => {
    render(<DrillDownPanel {...defaultProps} expandedDivision="Platform" />);
    const platformRow = screen.getByTestId('division-row-Platform');
    expect(platformRow).toHaveAttribute('aria-expanded', 'true');
    const mobileRow = screen.getByTestId('division-row-Mobile');
    expect(mobileRow).toHaveAttribute('aria-expanded', 'false');
  });

  it('calls onDivisionToggle when a division row is clicked', () => {
    const onToggle = vi.fn();
    render(<DrillDownPanel {...defaultProps} onDivisionToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('division-row-Platform'));
    expect(onToggle).toHaveBeenCalledWith('Platform');
  });

  it('calls onDivisionToggle on Enter key press', () => {
    const onToggle = vi.fn();
    render(<DrillDownPanel {...defaultProps} onDivisionToggle={onToggle} />);
    fireEvent.keyDown(screen.getByTestId('division-row-Mobile'), { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledWith('Mobile');
  });

  it('calls onDivisionToggle on Space key press', () => {
    const onToggle = vi.fn();
    render(<DrillDownPanel {...defaultProps} onDivisionToggle={onToggle} />);
    fireEvent.keyDown(screen.getByTestId('division-row-Platform'), { key: ' ' });
    expect(onToggle).toHaveBeenCalledWith('Platform');
  });

  it('renders the detail panel content when expanded', () => {
    render(<DrillDownPanel {...defaultProps} expandedDivision="Platform" />);
    expect(screen.getByText(/KPI Breakdown — Platform/)).toBeInTheDocument();
  });

  it('hides detail panel when collapsed (max-height 0)', () => {
    render(<DrillDownPanel {...defaultProps} expandedDivision={null} />);
    const detailPanel = document.getElementById('division-detail-Platform');
    expect(detailPanel).toHaveStyle({ maxHeight: '0' });
  });

  it('shows detail panel when expanded (max-height > 0)', () => {
    render(<DrillDownPanel {...defaultProps} expandedDivision="Platform" />);
    const detailPanel = document.getElementById('division-detail-Platform');
    expect(detailPanel).toHaveStyle({ maxHeight: '600px' });
  });

  it('preserves period selection via data attribute', () => {
    const { rerender } = render(<DrillDownPanel {...defaultProps} selectedPeriod="month" />);
    const panel = screen.getByTestId('drill-down-panel');
    expect(panel).toHaveAttribute('data-period', 'month');

    rerender(<DrillDownPanel {...defaultProps} selectedPeriod="year" expandedDivision="Platform" />);
    expect(panel).toHaveAttribute('data-period', 'year');
    // Expansion remains preserved — detail panel is visible
    expect(screen.getByText(/KPI Breakdown — Platform/)).toBeInTheDocument();
  });

  it('renders RAG badges for divisions with health scores', () => {
    render(<DrillDownPanel {...defaultProps} />);
    // RagBadge renders with role="status" — we should see multiple statuses
    const badges = screen.getAllByRole('status');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('has role=button and tabIndex=0 for keyboard accessibility', () => {
    render(<DrillDownPanel {...defaultProps} />);
    const row = screen.getByTestId('division-row-Platform');
    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('tabindex', '0');
  });
});
