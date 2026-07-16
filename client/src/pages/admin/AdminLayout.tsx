import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { getStoredUser } from '../../auth';
import { colors } from '../../theme';

const NAV_ITEMS = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/admin/functions', label: 'Functions', icon: '🏢' },
  { path: '/admin/teams', label: 'Teams', icon: '👥' },
  { path: '/admin/em-assignment', label: 'EM Assignment', icon: '🔗' },
  { path: '/admin/entries', label: 'Entries', icon: '📋' },
  { path: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

const BREAKPOINT = 768;

export default function AdminLayout() {
  const user = getStoredUser();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= BREAKPOINT);

  useEffect(() => {
    const handleResize = () => {
      setSidebarOpen(window.innerWidth >= BREAKPOINT);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
      {/* Mobile toggle button */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
          style={{
            position: 'fixed',
            top: '72px',
            left: '8px',
            zIndex: 1001,
            background: colors.primary,
            color: colors.textLight,
            border: 'none',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '18px',
            cursor: 'pointer',
          }}
        >
          ☰
        </button>
      )}

      {/* Sidebar */}
      <aside
        data-testid="admin-sidebar"
        style={{
          width: sidebarOpen ? '240px' : '0px',
          minWidth: sidebarOpen ? '240px' : '0px',
          overflow: 'hidden',
          background: colors.secondary,
          borderRight: sidebarOpen ? `1px solid ${colors.border}` : 'none',
          padding: sidebarOpen ? '24px 0' : '0',
          position: 'sticky',
          top: '64px',
          height: 'calc(100vh - 64px)',
          transition: 'width 0.2s ease, min-width 0.2s ease, padding 0.2s ease',
        }}
      >
        {sidebarOpen && (
          <>
            {/* Close button for mobile */}
            {window.innerWidth < BREAKPOINT && (
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: colors.text,
                }}
              >
                ✕
              </button>
            )}

            {/* User info header */}
            <div
              data-testid="sidebar-user-info"
              style={{ padding: '0 16px 24px', borderBottom: `1px solid ${colors.border}` }}
            >
              <p style={{ margin: 0, fontWeight: 600, color: colors.text }}>{user?.username}</p>
              <span style={{ fontSize: '12px', color: colors.textSecondary }}>{user?.role}</span>
            </div>

            {/* Navigation */}
            <nav style={{ marginTop: '16px' }} data-testid="sidebar-nav">
              <NavLink
                to="/"
                style={{
                  display: 'block',
                  padding: '12px 24px',
                  color: colors.primary,
                  background: 'transparent',
                  textDecoration: 'none',
                  fontWeight: 500,
                  borderLeft: '3px solid transparent',
                  fontSize: '14px',
                  marginBottom: '8px',
                }}
              >
                ← Back to Home
              </NavLink>
              {NAV_ITEMS.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  style={({ isActive }) => ({
                    display: 'block',
                    padding: '12px 24px',
                    color: isActive ? colors.primary : colors.text,
                    background: isActive ? colors.primaryLight : 'transparent',
                    textDecoration: 'none',
                    fontWeight: isActive ? 600 : 400,
                    borderLeft: isActive ? `3px solid ${colors.primary}` : '3px solid transparent',
                    fontSize: '14px',
                  })}
                >
                  {item.icon} {item.label}
                </NavLink>
              ))}
            </nav>
          </>
        )}
      </aside>

      {/* Content Area */}
      <main style={{ flex: 1, padding: '24px 32px' }} data-testid="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
