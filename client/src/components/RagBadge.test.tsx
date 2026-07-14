import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RagBadge from './RagBadge';

describe('RagBadge', () => {
  it('renders a green badge with correct color', () => {
    render(<RagBadge status="green" />);
    const badge = screen.getByRole('img', { name: /status: green/i });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ backgroundColor: '#28A745' });
  });

  it('renders an amber badge with correct color', () => {
    render(<RagBadge status="amber" />);
    const badge = screen.getByRole('img', { name: /status: amber/i });
    expect(badge).toHaveStyle({ backgroundColor: '#FFC107' });
  });

  it('renders a red badge with correct color', () => {
    render(<RagBadge status="red" />);
    const badge = screen.getByRole('img', { name: /status: red/i });
    expect(badge).toHaveStyle({ backgroundColor: '#DC3545' });
  });

  it('renders as a circular element', () => {
    render(<RagBadge status="green" />);
    const badge = screen.getByRole('img', { name: /status: green/i });
    expect(badge).toHaveStyle({ borderRadius: '50%' });
  });
});
