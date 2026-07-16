import { describe, it, expect, beforeEach, vi } from 'vitest';
import apiClient from './client';
import * as auth from '../auth';

// Mock the auth module
vi.mock('../auth', () => ({
  getStoredToken: vi.fn(),
  clearAuth: vi.fn(),
}));

describe('API Client', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Reset window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
  });

  it('has correct base URL', () => {
    expect(apiClient.defaults.baseURL).toBe('http://localhost:3000');
  });

  it('sets Content-Type to application/json', () => {
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('adds Authorization header when token is available from getStoredToken', async () => {
    vi.mocked(auth.getStoredToken).mockReturnValue('test-jwt-token-123456789');

    // Manually run the request interceptor
    const interceptor = (apiClient.interceptors.request as any).handlers[0];
    const config = { headers: {} as Record<string, string> };
    const result = interceptor.fulfilled(config);

    expect(auth.getStoredToken).toHaveBeenCalled();
    expect(result.headers.Authorization).toBe('Bearer test-jwt-token-123456789');
  });

  it('does not add Authorization header when getStoredToken returns null', () => {
    vi.mocked(auth.getStoredToken).mockReturnValue(null);

    const interceptor = (apiClient.interceptors.request as any).handlers[0];
    const config = { headers: {} as Record<string, string> };
    const result = interceptor.fulfilled(config);

    expect(auth.getStoredToken).toHaveBeenCalled();
    expect(result.headers.Authorization).toBeUndefined();
  });

  it('clears auth and redirects to /login on 401 response', async () => {
    const responseInterceptor = (apiClient.interceptors.response as any).handlers[0];
    const error = {
      response: { status: 401 },
    };

    await expect(responseInterceptor.rejected(error)).rejects.toEqual(error);

    expect(auth.clearAuth).toHaveBeenCalled();
    expect(window.location.href).toBe('/login');
  });

  it('does not clear auth for non-401 errors', async () => {
    const responseInterceptor = (apiClient.interceptors.response as any).handlers[0];
    const error = {
      response: { status: 500 },
    };

    await expect(responseInterceptor.rejected(error)).rejects.toEqual(error);

    expect(auth.clearAuth).not.toHaveBeenCalled();
    expect(window.location.href).not.toBe('/login');
  });

  it('does not clear auth when error has no response (network error)', async () => {
    const responseInterceptor = (apiClient.interceptors.response as any).handlers[0];
    const error = { message: 'Network Error' };

    await expect(responseInterceptor.rejected(error)).rejects.toEqual(error);

    expect(auth.clearAuth).not.toHaveBeenCalled();
    expect(window.location.href).not.toBe('/login');
  });

  it('passes through successful responses unchanged', () => {
    const responseInterceptor = (apiClient.interceptors.response as any).handlers[0];
    const response = { status: 200, data: { result: 'ok' } };

    const result = responseInterceptor.fulfilled(response);

    expect(result).toBe(response);
  });
});
