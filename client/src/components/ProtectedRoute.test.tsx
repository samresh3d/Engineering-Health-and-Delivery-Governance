import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import * as auth from '../auth';

vi.mock('../auth', () => ({
  isAuthenticated: vi.fn(),
  isSuperAdmin: vi.fn(),
}));

function renderWithRouter(ui: React.ReactElement, initialEntry = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      {ui}
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders children when user is authenticated', () => {
    vi.mocked(auth.isAuthenticated).mockReturnValue(true);
    vi.mocked(auth.isSuperAdmin).mockReturnValue(false);

    renderWithRouter(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to /login when user is not authenticated', () => {
    vi.mocked(auth.isAuthenticated).mockReturnValue(false);

    const { container } = renderWithRouter(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    // Navigate component renders nothing visible, but the children should not appear
    expect(container.innerHTML).toBe('');
  });

  it('renders children when requireSuperAdmin is true and user is Super_Admin', () => {
    vi.mocked(auth.isAuthenticated).mockReturnValue(true);
    vi.mocked(auth.isSuperAdmin).mockReturnValue(true);

    renderWithRouter(
      <ProtectedRoute requireSuperAdmin>
        <div>Admin Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('redirects non-Super_Admin users to / when requireSuperAdmin is true', () => {
    vi.mocked(auth.isAuthenticated).mockReturnValue(true);
    vi.mocked(auth.isSuperAdmin).mockReturnValue(false);

    const { container } = renderWithRouter(
      <ProtectedRoute requireSuperAdmin>
        <div>Admin Content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(container.innerHTML).toBe('');
  });

  it('does not check isSuperAdmin when requireSuperAdmin is false', () => {
    vi.mocked(auth.isAuthenticated).mockReturnValue(true);
    vi.mocked(auth.isSuperAdmin).mockReturnValue(false);

    renderWithRouter(
      <ProtectedRoute>
        <div>Regular Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Regular Content')).toBeInTheDocument();
    // isSuperAdmin should not be called when requireSuperAdmin defaults to false
    expect(auth.isSuperAdmin).not.toHaveBeenCalled();
  });

  it('prioritizes authentication check over super admin check', () => {
    vi.mocked(auth.isAuthenticated).mockReturnValue(false);
    vi.mocked(auth.isSuperAdmin).mockReturnValue(true);

    const { container } = renderWithRouter(
      <ProtectedRoute requireSuperAdmin>
        <div>Admin Content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(container.innerHTML).toBe('');
    // Should not even check isSuperAdmin if not authenticated
    expect(auth.isSuperAdmin).not.toHaveBeenCalled();
  });
});
