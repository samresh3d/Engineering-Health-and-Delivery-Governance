import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminSettings from './AdminSettings';

describe('AdminSettings', () => {
  it('renders the Settings heading', () => {
    render(<AdminSettings />);
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
  });

  it('displays the "Settings coming soon" message', () => {
    render(<AdminSettings />);
    expect(screen.getByText('Settings coming soon')).toBeInTheDocument();
  });

  it('displays platform version information', () => {
    render(<AdminSettings />);
    expect(
      screen.getByText('Engineering Health & Delivery Governance Platform v1.0')
    ).toBeInTheDocument();
  });

  it('displays the Platform Information subheading', () => {
    render(<AdminSettings />);
    expect(screen.getByRole('heading', { name: 'Platform Information', level: 2 })).toBeInTheDocument();
  });
});
