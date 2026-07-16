import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TeamCard, { TeamCardProps } from './TeamCard';

// Mock Recharts to avoid rendering issues in test env
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="sparkline">{children}</div>,
  Line: () => <div data-testid="sparkline-line" />,
}));

const defaultProps: TeamCardProps = {
  teamName: 'Platform Engineering',
  healthScore: { value: 85, ragStatus: 'green' },
  activeDivisions: 3,
  activeProjects: 12,
  sparkline: [70, 78, 85],
  isExpanded: false,
  onToggle: vi.fn(),
};

describe('TeamCard', () => {
  it('renders team name', () => {
    render(<TeamCard {...defaultProps} />);
    expect(screen.getByText('Platform Engineering')).toBeDefined();
  });

  it('renders health score value', () => {
    render(<TeamCard {...defaultProps} />);
    expect(screen.getByText('85')).toBeDefined();
  });

  it('renders division and project counts', () => {
    render(<TeamCard {...defaultProps} />);
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText(/Division/)).toBeDefined();
    expect(screen.getByText(/Project/)).toBeDefined();
  });

  it('shows N/A when health score is null', () => {
    render(<TeamCard {...defaultProps} healthScore={null} />);
    expect(screen.getByText('N/A')).toBeDefined();
    expect(screen.getByText('—')).toBeDefined();
  });

  it('renders RAG badge for green status', () => {
    render(<TeamCard {...defaultProps} />);
    expect(screen.getByText('Healthy')).toBeDefined();
  });

  it('renders RAG badge for amber status', () => {
    render(<TeamCard {...defaultProps} healthScore={{ value: 65, ragStatus: 'amber' }} />);
    expect(screen.getByText('Attention')).toBeDefined();
  });

  it('renders RAG badge for red status', () => {
    render(<TeamCard {...defaultProps} healthScore={{ value: 30, ragStatus: 'red' }} />);
    expect(screen.getByText('Critical')).toBeDefined();
  });

  it('applies aria-expanded=false when collapsed', () => {
    render(<TeamCard {...defaultProps} isExpanded={false} />);
    const card = screen.getByRole('button');
    expect(card.getAttribute('aria-expanded')).toBe('false');
  });

  it('applies aria-expanded=true when expanded', () => {
    render(<TeamCard {...defaultProps} isExpanded={true} />);
    const card = screen.getByRole('button');
    expect(card.getAttribute('aria-expanded')).toBe('true');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<TeamCard {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onToggle on Enter key press', () => {
    const onToggle = vi.fn();
    render(<TeamCard {...defaultProps} onToggle={onToggle} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onToggle on Space key press', () => {
    const onToggle = vi.fn();
    render(<TeamCard {...defaultProps} onToggle={onToggle} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not call onToggle on other key presses', () => {
    const onToggle = vi.fn();
    render(<TeamCard {...defaultProps} onToggle={onToggle} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders sparkline when data is available', () => {
    render(<TeamCard {...defaultProps} />);
    expect(screen.getByTestId('sparkline')).toBeDefined();
  });

  it('does not render sparkline when data is empty', () => {
    render(<TeamCard {...defaultProps} sparkline={[]} />);
    expect(screen.queryByTestId('sparkline')).toBeNull();
  });

  it('applies green left border for green RAG status', () => {
    const { container } = render(<TeamCard {...defaultProps} />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.borderLeft).toBe('4px solid rgb(40, 167, 69)');
  });

  it('applies amber left border for amber RAG status', () => {
    const { container } = render(
      <TeamCard {...defaultProps} healthScore={{ value: 60, ragStatus: 'amber' }} />
    );
    const card = container.firstChild as HTMLElement;
    expect(card.style.borderLeft).toBe('4px solid rgb(255, 193, 7)');
  });

  it('applies red left border for red RAG status', () => {
    const { container } = render(
      <TeamCard {...defaultProps} healthScore={{ value: 25, ragStatus: 'red' }} />
    );
    const card = container.firstChild as HTMLElement;
    expect(card.style.borderLeft).toBe('4px solid rgb(220, 53, 69)');
  });

  it('uses singular form for 1 division', () => {
    render(<TeamCard {...defaultProps} activeDivisions={1} />);
    expect(screen.getByText(/Division$/)).toBeDefined();
  });

  it('uses singular form for 1 project', () => {
    render(<TeamCard {...defaultProps} activeProjects={1} />);
    expect(screen.getByText(/Project$/)).toBeDefined();
  });

  it('has tabIndex 0 for keyboard focus', () => {
    render(<TeamCard {...defaultProps} />);
    const card = screen.getByRole('button');
    expect(card.tabIndex).toBe(0);
  });
});
