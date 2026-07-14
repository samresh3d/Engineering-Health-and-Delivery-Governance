import { describe, it, expect, beforeEach } from 'vitest';
import apiClient from './client';

describe('API Client', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('has correct base URL', () => {
    expect(apiClient.defaults.baseURL).toBe('http://localhost:3000');
  });

  it('sets Content-Type to application/json', () => {
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('adds Authorization header when token is in localStorage', async () => {
    localStorage.setItem('auth_token', 'test-jwt-token');

    // Manually run the request interceptor
    const interceptor = (apiClient.interceptors.request as any).handlers[0];
    const config = { headers: {} as Record<string, string> };
    const result = interceptor.fulfilled(config);

    expect(result.headers.Authorization).toBe('Bearer test-jwt-token');
  });

  it('does not add Authorization header when no token in localStorage', () => {
    const interceptor = (apiClient.interceptors.request as any).handlers[0];
    const config = { headers: {} as Record<string, string> };
    const result = interceptor.fulfilled(config);

    expect(result.headers.Authorization).toBeUndefined();
  });
});
