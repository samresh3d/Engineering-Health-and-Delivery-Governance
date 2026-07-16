import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminLayout from './AdminLayout';

// Mock the auth module
vi.mock('../../auth', () => ({
  getStoredUser: vi.fn(() => ({
    userId: 'user-sa-001',
    username: 'super_admin',
    role: 'Super_Admin',
    token: 'mock-token-12345678901234567890',
  })),
}));

function renderAdminLayout(initialPath = '/admin/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<div>Dashboard Content</div>} />
          <Route path="teams" element={<div>Teams Content</div>} />
          <Route path="entries" element={<div>Entries Content</div>} />
          <Route path="settings" element={<div>Settings Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminLayout', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    // Default to desktop viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth });
  });

  it('renders sidebar with navigation links', () => {
    renderAdminLayout();

    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Teams/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Entries/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/ })).toBeInTheDocument();
  });

  it('displays authenticated user username and role', () => {
    renderAdminLayout();

    expect(screen.getByText('super_admin')).toBeInTheDocument();
    expect(screen.getByText('Super_Admin')).toBeInTheDocument();
  });

  it('renders the outlet content area', () => {
    renderAdminLayout('/admin/dashboard');

    expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('renders correct outlet content for teams route', () => {
    renderAdminLayout('/admin/teams');

    expect(screen.getByText('Teams Content')).toBeInTheDocument();
  });

  it('highlights active NavLink with border-left indicator', () => {
    renderAdminLayout('/admin/dashboard');

    const dashboardLink = screen.getByRole('link', { name: /Dashboard/ });
    // Active link should have the primary color and border-left style
    expect(dashboardLink).toHaveStyle({ borderLeft: '3px solid #6B0F2B' });
    expect(dashboardLink).toHaveStyle({ fontWeight: 600 });
  });

  it('non-active NavLinks do not have primary border-left', () => {
    renderAdminLayout('/admin/dashboard');

    const teamsLink = screen.getByRole('link', { name: /Teams/ });
    // Non-active links should not have the primary color border
    expect(teamsLink).not.toHaveStyle({ borderLeft: '3px solid #6B0F2B' });
    expect(teamsLink).toHaveStyle({ fontWeight: 400 });
  });

  it('collapses sidebar on viewport < 768px', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 600 });

    renderAdminLayout();

    const sidebar = screen.getByTestId('admin-sidebar');
    expect(sidebar).toHaveStyle({ width: '0px' });
  });

  it('shows sidebar on viewport >= 768px', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });

    renderAdminLayout();

    const sidebar = screen.getByTestId('admin-sidebar');
    expect(sidebar).toHaveStyle({ width: '240px' });
  });

  it('shows open sidebar button when collapsed', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 600 });

    renderAdminLayout();

    expect(screen.getByLabelText('Open sidebar')).toBeInTheDocument();
  });

  it('opens sidebar when toggle button is clicked on mobile', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 600 });

    renderAdminLayout();

    const openButton = screen.getByLabelText('Open sidebar');
    fireEvent.click(openButton);

    const sidebar = screen.getByTestId('admin-sidebar');
    expect(sidebar).toHaveStyle({ width: '240px' });
  });

  it('responds to window resize events', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });

    renderAdminLayout();

    // Verify sidebar is open at desktop width
    expect(screen.getByTestId('admin-sidebar')).toHaveStyle({ width: '240px' });

    // Simulate resize to mobile
    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 600 });
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.getByTestId('admin-sidebar')).toHaveStyle({ width: '0px' });
  });

  it('contains all navigation items with correct paths', () => {
    renderAdminLayout();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);

    expect(links[0]).toHaveAttribute('href', '/admin/dashboard');
    expect(links[1]).toHaveAttribute('href', '/admin/functions');
    expect(links[2]).toHaveAttribute('href', '/admin/teams');
    expect(links[3]).toHaveAttribute('href', '/admin/em-assignment');
    expect(links[4]).toHaveAttribute('href', '/admin/entries');
    expect(links[5]).toHaveAttribute('href', '/admin/settings');
  });
});
