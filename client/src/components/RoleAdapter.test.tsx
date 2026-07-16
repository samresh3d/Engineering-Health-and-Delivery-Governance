import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleAdapter } from './RoleAdapter';
import * as auth from '../auth';

vi.mock('../auth', () => ({
  getStoredUser: vi.fn(),
}));

describe('RoleAdapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders children when user role is in allowedRoles', () => {
    vi.mocked(auth.getStoredUser).mockReturnValue({
      userId: '1',
      username: 'admin',
      role: 'Super_Admin',
      token: 'token-abc-123-long-enough',
      teamId: null,
    });

    render(
      <RoleAdapter allowedRoles={['Super_Admin', 'Leadership']}>
        <div>Admin Content</div>
      </RoleAdapter>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('renders fallback when user role is not in allowedRoles', () => {
    vi.mocked(auth.getStoredUser).mockReturnValue({
      userId: '2',
      username: 'em1',
      role: 'Engineering_Manager',
      token: 'token-abc-123-long-enough',
      teamId: 'team-1',
    });

    render(
      <RoleAdapter
        allowedRoles={['Super_Admin', 'Leadership']}
        fallback={<div>Access Denied</div>}
      >
        <div>Admin Content</div>
      </RoleAdapter>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('renders nothing when user role is not in allowedRoles and no fallback is provided', () => {
    vi.mocked(auth.getStoredUser).mockReturnValue({
      userId: '2',
      username: 'em1',
      role: 'Engineering_Manager',
      token: 'token-abc-123-long-enough',
      teamId: 'team-1',
    });

    const { container } = render(
      <RoleAdapter allowedRoles={['Super_Admin']}>
        <div>Admin Content</div>
      </RoleAdapter>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(container.innerHTML).toBe('');
  });

  it('renders fallback when no user is authenticated', () => {
    vi.mocked(auth.getStoredUser).mockReturnValue(null);

    render(
      <RoleAdapter
        allowedRoles={['Super_Admin']}
        fallback={<div>Please log in</div>}
      >
        <div>Admin Content</div>
      </RoleAdapter>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(screen.getByText('Please log in')).toBeInTheDocument();
  });

  it('renders nothing when no user is authenticated and no fallback is provided', () => {
    vi.mocked(auth.getStoredUser).mockReturnValue(null);

    const { container } = render(
      <RoleAdapter allowedRoles={['Super_Admin']}>
        <div>Admin Content</div>
      </RoleAdapter>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(container.innerHTML).toBe('');
  });

  it('supports multiple roles in allowedRoles', () => {
    vi.mocked(auth.getStoredUser).mockReturnValue({
      userId: '3',
      username: 'lead1',
      role: 'Leadership',
      token: 'token-abc-123-long-enough',
      teamId: null,
    });

    render(
      <RoleAdapter allowedRoles={['Engineering_Manager', 'Leadership', 'Super_Admin']}>
        <div>Multi-Role Content</div>
      </RoleAdapter>
    );

    expect(screen.getByText('Multi-Role Content')).toBeInTheDocument();
  });
});
