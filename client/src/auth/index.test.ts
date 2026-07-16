import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AuthUser,
  getStoredToken,
  getStoredUser,
  setAuth,
  clearAuth,
  isAuthenticated,
  isSuperAdmin,
  getRole,
  getTeamId,
  fetchAndUpdateUserProfile,
} from './index';

describe('auth utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockSuperAdmin: AuthUser = {
    userId: 'user-sa-001',
    username: 'super_admin',
    role: 'Super_Admin',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLXNhLTAwMSJ9.abc123',
    teamId: null,
  };

  const mockAdmin: AuthUser = {
    userId: 'user-admin-001',
    username: 'admin',
    role: 'Admin',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLWFkbWluLTAwMSJ9.xyz789',
    teamId: null,
  };

  const mockEM: AuthUser = {
    userId: 'user-em-001',
    username: 'eng_manager',
    role: 'Engineering_Manager',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLWVtLTAwMSJ9.em1234',
    teamId: 'team-alpha',
  };

  describe('getStoredToken', () => {
    it('returns null when no token is stored', () => {
      expect(getStoredToken()).toBeNull();
    });

    it('returns the stored token', () => {
      localStorage.setItem('auth_token', 'my-token');
      expect(getStoredToken()).toBe('my-token');
    });
  });

  describe('getStoredUser', () => {
    it('returns null when no user is stored', () => {
      expect(getStoredUser()).toBeNull();
    });

    it('returns the parsed user object', () => {
      localStorage.setItem('auth_user', JSON.stringify(mockSuperAdmin));
      expect(getStoredUser()).toEqual(mockSuperAdmin);
    });
  });

  describe('setAuth', () => {
    it('stores the token under auth_token key', () => {
      setAuth(mockSuperAdmin);
      expect(localStorage.getItem('auth_token')).toBe(mockSuperAdmin.token);
    });

    it('stores the user JSON under auth_user key', () => {
      setAuth(mockSuperAdmin);
      const stored = JSON.parse(localStorage.getItem('auth_user')!);
      expect(stored).toEqual(mockSuperAdmin);
    });

    it('overwrites previous auth data', () => {
      setAuth(mockAdmin);
      setAuth(mockSuperAdmin);
      expect(localStorage.getItem('auth_token')).toBe(mockSuperAdmin.token);
      expect(JSON.parse(localStorage.getItem('auth_user')!)).toEqual(mockSuperAdmin);
    });

    it('stores teamId when provided', () => {
      setAuth(mockEM);
      const stored = JSON.parse(localStorage.getItem('auth_user')!);
      expect(stored.teamId).toBe('team-alpha');
    });

    it('stores teamId as null when user has no team', () => {
      setAuth(mockSuperAdmin);
      const stored = JSON.parse(localStorage.getItem('auth_user')!);
      expect(stored.teamId).toBeNull();
    });
  });

  describe('clearAuth', () => {
    it('removes auth_token from localStorage', () => {
      setAuth(mockSuperAdmin);
      clearAuth();
      expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('removes auth_user from localStorage', () => {
      setAuth(mockSuperAdmin);
      clearAuth();
      expect(localStorage.getItem('auth_user')).toBeNull();
    });

    it('does not throw when nothing is stored', () => {
      expect(() => clearAuth()).not.toThrow();
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no token exists', () => {
      expect(isAuthenticated()).toBe(false);
    });

    it('returns false when token is too short (<=20 chars)', () => {
      localStorage.setItem('auth_token', 'short-token');
      expect(isAuthenticated()).toBe(false);
    });

    it('returns false when token is exactly 20 chars', () => {
      localStorage.setItem('auth_token', '12345678901234567890');
      expect(isAuthenticated()).toBe(false);
    });

    it('returns true when token is longer than 20 chars', () => {
      localStorage.setItem('auth_token', '123456789012345678901');
      expect(isAuthenticated()).toBe(true);
    });

    it('returns true for a realistic JWT token', () => {
      setAuth(mockSuperAdmin);
      expect(isAuthenticated()).toBe(true);
    });
  });

  describe('isSuperAdmin', () => {
    it('returns false when no user is stored', () => {
      expect(isSuperAdmin()).toBe(false);
    });

    it('returns true when stored user has Super_Admin role', () => {
      setAuth(mockSuperAdmin);
      expect(isSuperAdmin()).toBe(true);
    });

    it('returns false when stored user has Admin role', () => {
      setAuth(mockAdmin);
      expect(isSuperAdmin()).toBe(false);
    });

    it('returns false for Engineering_Manager role', () => {
      const user: AuthUser = { ...mockAdmin, role: 'Engineering_Manager' };
      setAuth(user);
      expect(isSuperAdmin()).toBe(false);
    });

    it('returns false for Delivery_Manager role', () => {
      const user: AuthUser = { ...mockAdmin, role: 'Delivery_Manager' };
      setAuth(user);
      expect(isSuperAdmin()).toBe(false);
    });

    it('returns false for Leadership role', () => {
      const user: AuthUser = { ...mockAdmin, role: 'Leadership' };
      setAuth(user);
      expect(isSuperAdmin()).toBe(false);
    });
  });

  describe('getRole', () => {
    it('returns null when no user is stored', () => {
      expect(getRole()).toBeNull();
    });

    it('returns the role of the stored user', () => {
      setAuth(mockSuperAdmin);
      expect(getRole()).toBe('Super_Admin');
    });

    it('returns Engineering_Manager for EM user', () => {
      setAuth(mockEM);
      expect(getRole()).toBe('Engineering_Manager');
    });
  });

  describe('getTeamId', () => {
    it('returns null when no user is stored', () => {
      expect(getTeamId()).toBeNull();
    });

    it('returns null for users with no team assignment', () => {
      setAuth(mockSuperAdmin);
      expect(getTeamId()).toBeNull();
    });

    it('returns teamId for Engineering Manager with team assignment', () => {
      setAuth(mockEM);
      expect(getTeamId()).toBe('team-alpha');
    });
  });

  describe('fetchAndUpdateUserProfile', () => {
    it('does nothing when no user is stored', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await fetchAndUpdateUserProfile();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('updates teamId from /api/users/me response', async () => {
      setAuth({ ...mockEM, teamId: null });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ userId: 'user-em-001', username: 'eng_manager', role: 'Engineering_Manager', teamId: 'team-beta' }),
      } as Response);

      await fetchAndUpdateUserProfile();

      const stored = getStoredUser();
      expect(stored?.teamId).toBe('team-beta');
    });

    it('sets teamId to null when /api/users/me returns no teamId', async () => {
      setAuth(mockEM);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ userId: 'user-em-001', username: 'eng_manager', role: 'Engineering_Manager' }),
      } as Response);

      await fetchAndUpdateUserProfile();

      const stored = getStoredUser();
      expect(stored?.teamId).toBeNull();
    });

    it('keeps teamId as null when /api/users/me fails', async () => {
      setAuth({ ...mockSuperAdmin, teamId: null });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      } as Response);

      await fetchAndUpdateUserProfile();

      const stored = getStoredUser();
      expect(stored?.teamId).toBeNull();
    });

    it('handles network errors gracefully', async () => {
      setAuth(mockEM);
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      await fetchAndUpdateUserProfile();

      const stored = getStoredUser();
      expect(stored?.teamId).toBe('team-alpha');
    });
  });
});
