import axios from 'axios';

/**
 * Pre-configured Axios instance for API communication.
 * - Base URL points to the local Express server
 * - Request interceptor injects JWT token from localStorage
 */
const apiClient = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
