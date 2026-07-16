import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PeriodSwitcher from './PeriodSwitcher';

describe('PeriodSwitcher', () => {
  it('renders three period buttons: Month, Quarter, Year', () => {
    const onChange = vi.fn();
    render(<PeriodSwitcher selected="quarter" onChange={onChange} />);

    expect(screen.getByText('Month')).toBeInTheDocument();
    expect(screen.getByText('Quarter')).toBeInTheDocument();
    expect(screen.getByText('Year')).toBeInTheDocument();
  });

  it('highlights the active button with aria-pressed="true"', () => {
    const onChange = vi.fn();
    render(<PeriodSwitcher selected="quarter" onChange={onChange} />);

    expect(screen.getByText('Month')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Quarter')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Year')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the correct period when a button is clicked', () => {
    const onChange = vi.fn();
    render(<PeriodSwitcher selected="quarter" onChange={onChange} />);

    fireEvent.click(screen.getByText('Month'));
    expect(onChange).toHaveBeenCalledWith('month');

    fireEvent.click(screen.getByText('Year'));
    expect(onChange).toHaveBeenCalledWith('year');
  });

  it('visually highlights the selected button with primary background color', () => {
    const onChange = vi.fn();
    render(<PeriodSwitcher selected="month" onChange={onChange} />);

    const monthBtn = screen.getByText('Month');
    expect(monthBtn).toHaveStyle({ backgroundColor: '#6B0F2B' });
    expect(monthBtn).toHaveStyle({ color: '#FFFFFF' });
  });

  it('renders non-selected buttons without primary background color', () => {
    const onChange = vi.fn();
    render(<PeriodSwitcher selected="month" onChange={onChange} />);

    const quarterBtn = screen.getByText('Quarter');
    // Non-active buttons should NOT have the primary color background
    expect(quarterBtn).not.toHaveStyle({ backgroundColor: '#6B0F2B' });
    expect(quarterBtn).toHaveStyle({ color: '#1A1A2E' });
  });

  it('supports keyboard activation via Enter and Space', () => {
    const onChange = vi.fn();
    render(<PeriodSwitcher selected="quarter" onChange={onChange} />);

    const yearBtn = screen.getByText('Year');
    fireEvent.keyDown(yearBtn, { key: 'Enter' });
    fireEvent.click(yearBtn);
    expect(onChange).toHaveBeenCalledWith('year');
  });

  it('wraps buttons in a group with accessible label', () => {
    const onChange = vi.fn();
    render(<PeriodSwitcher selected="quarter" onChange={onChange} />);

    const group = screen.getByRole('group', { name: /period selection/i });
    expect(group).toBeInTheDocument();
  });

  it('updates aria-pressed when selected prop changes', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PeriodSwitcher selected="quarter" onChange={onChange} />);

    expect(screen.getByText('Quarter')).toHaveAttribute('aria-pressed', 'true');

    rerender(<PeriodSwitcher selected="year" onChange={onChange} />);

    expect(screen.getByText('Quarter')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Year')).toHaveAttribute('aria-pressed', 'true');
  });
});
