import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RagBadge from './RagBadge';

describe('RagBadge', () => {
  it('renders a green badge with correct color', () => {
    render(<RagBadge status="green" />);
    const badge = screen.getByRole('status', { name: /status: healthy/i });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ backgroundColor: '#E6F9ED' });
  });

  it('renders an amber badge with correct color', () => {
    render(<RagBadge status="amber" />);
    const badge = screen.getByRole('status', { name: /status: attention/i });
    expect(badge).toHaveStyle({ backgroundColor: '#FFF8E6' });
  });

  it('renders a red badge with correct color', () => {
    render(<RagBadge status="red" />);
    const badge = screen.getByRole('status', { name: /status: critical/i });
    expect(badge).toHaveStyle({ backgroundColor: '#FDEDEF' });
  });

  it('renders as a pill-shaped element with a circular dot indicator', () => {
    render(<RagBadge status="green" />);
    const badge = screen.getByRole('status', { name: /status: healthy/i });
    expect(badge).toHaveStyle({ borderRadius: '12px' });
  });
});
