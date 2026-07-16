import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import * as auth from '../auth';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../auth', () => ({
  setAuth: vi.fn(),
  fetchAndUpdateUserProfile: vi.fn().mockResolvedValue(undefined),
}));

const mockUsers = {
  users: [
    { userId: 'user-admin-001', username: 'admin', role: 'Admin', token: 'token-admin' },
    { userId: 'user-em-001', username: 'eng_manager', role: 'Engineering_Manager', token: 'token-em' },
    { userId: 'user-sa-001', username: 'super_admin', role: 'Super_Admin', token: 'token-sa' },
  ],
};

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('displays logo and platform name', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(mockUsers),
    } as Response);

    renderLogin();

    expect(screen.getByAltText('Engineering Health Platform')).toBeInTheDocument();
    expect(screen.getByText('Engineering Health Platform')).toBeInTheDocument();
  });

  it('fetches and displays mock users in dropdown', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(mockUsers),
    } as Response);

    renderLogin();

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });
    expect(screen.getByText('eng_manager')).toBeInTheDocument();
    expect(screen.getByText('super_admin')).toBeInTheDocument();
  });

  it('calls the correct API endpoint on mount', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(mockUsers),
    } as Response);

    renderLogin();

    expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:3000/api/auth/mock-users');
  });

  it('submit button is disabled when no user is selected', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(mockUsers),
    } as Response);

    renderLogin();

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: 'Sign In' });
    expect(button).toBeDisabled();
  });

  it('submit button is enabled when a user is selected', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(mockUsers),
    } as Response);

    renderLogin();

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Select user');
    fireEvent.change(select, { target: { value: 'user-admin-001' } });

    const button = screen.getByRole('button', { name: 'Sign In' });
    expect(button).not.toBeDisabled();
  });

  it('stores credentials and navigates on submit', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: () => Promise.resolve(mockUsers),
    } as Response);

    renderLogin();

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Select user');
    fireEvent.change(select, { target: { value: 'user-admin-001' } });

    const button = screen.getByRole('button', { name: 'Sign In' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(auth.setAuth).toHaveBeenCalledWith({ ...mockUsers.users[0], teamId: null });
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('shows error message when fetch fails', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

    renderLogin();

    await waitFor(() => {
      expect(screen.getByText('Failed to load users. Please try again.')).toBeInTheDocument();
    });
  });
});
