import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

function setMockAuth(role: string = 'Engineering_Manager') {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLWVtLTAwMSIsInJvbGUiOiJFbmdpbmVlcmluZ19NYW5hZ2VyIiwiaWF0IjoxNzE3MDAwMDAwLCJleHAiOjE3MTc2MDQ4MDB9.fake-signature-for-testing';
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify({
    userId: 'user-em-001',
    username: 'eng_manager',
    role,
    token,
  }));
}

describe('App routing', () => {
  beforeEach(() => {
    setMockAuth();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('redirects unauthenticated users to /login', () => {
    localStorage.clear();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('renders Dashboard page on "/" route when authenticated', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
  });

  it('renders Upload page on "/upload" route when authenticated', () => {
    render(
      <MemoryRouter initialEntries={['/upload']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Upload Sprint Data')).toBeInTheDocument();
  });

  it('displays the platform logo', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    const logo = screen.getByAltText('Engineering Health Platform');
    expect(logo).toBeInTheDocument();
  });

  it('shows Admin Panel link only for Super_Admin users', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
  });

  it('shows Admin Panel link for Super_Admin users', () => {
    localStorage.clear();
    setMockAuth('Super_Admin');
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
  });

  it('shows Logout button when authenticated', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('redirects non-Super_Admin users away from /admin', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    );
    // Should redirect to dashboard (/) since not Super_Admin
    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
  });
});
