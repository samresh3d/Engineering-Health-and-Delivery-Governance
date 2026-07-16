export interface AuthUser {
  userId: string;
  username: string;
  role: 'Admin' | 'Engineering_Manager' | 'Delivery_Manager' | 'Leadership' | 'Super_Admin';
  token: string;
  teamId: string | null;
}

export function getStoredToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem('auth_user');
  return raw ? JSON.parse(raw) : null;
}

export function setAuth(user: AuthUser): void {
  localStorage.setItem('auth_token', user.token);
  localStorage.setItem('auth_user', JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
}

export function isAuthenticated(): boolean {
  const token = getStoredToken();
  return !!token && token.length > 20;
}

export function isSuperAdmin(): boolean {
  const user = getStoredUser();
  return user?.role === 'Super_Admin';
}

/**
 * Get the current user's role from stored auth context.
 * Returns null if no user is authenticated.
 */
export function getRole(): AuthUser['role'] | null {
  const user = getStoredUser();
  return user?.role ?? null;
}

/**
 * Get the current user's team assignment from stored auth context.
 * Returns null if no user is authenticated or the user has no team assignment
 * (e.g., Leadership or Super_Admin users).
 */
export function getTeamId(): string | null {
  const user = getStoredUser();
  return user?.teamId ?? null;
}

/**
 * Fetch the user's profile from /api/users/me and update the stored auth
 * with the latest teamId. Should be called after initial authentication.
 * If the request fails, teamId is set to null.
 */
export async function fetchAndUpdateUserProfile(): Promise<void> {
  const user = getStoredUser();
  const token = getStoredToken();
  if (!user || !token) return;

  try {
    const response = await fetch('http://localhost:3000/api/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const profile = await response.json();
      const updatedUser: AuthUser = {
        ...user,
        teamId: profile.teamId ?? null,
      };
      setAuth(updatedUser);
    } else {
      // If the profile fetch fails, ensure teamId is set to null
      const updatedUser: AuthUser = {
        ...user,
        teamId: user.teamId ?? null,
      };
      setAuth(updatedUser);
    }
  } catch {
    // Network error — ensure teamId is set to null if not already present
    const updatedUser: AuthUser = {
      ...user,
      teamId: user.teamId ?? null,
    };
    setAuth(updatedUser);
  }
}
