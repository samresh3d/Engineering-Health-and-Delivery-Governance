import { lazy, Suspense } from 'react';
import { Routes, Route, Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { clearAuth, getStoredUser } from './auth';
import { colors } from './theme';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import History from './pages/History';
import AdminLayout from './pages/admin/AdminLayout';
import MyTeams from './pages/MyTeams';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminTeams from './pages/admin/AdminTeams';
import AdminTeamDetail from './pages/admin/AdminTeamDetail';
import AdminEntries from './pages/admin/AdminEntries';
import AdminSettings from './pages/admin/AdminSettings';
import FunctionManager from './pages/admin/FunctionManager';
import TeamManager from './pages/admin/TeamManager';
import EMFunctionAssignment from './pages/admin/EMFunctionAssignment';
import logo from './logo.svg';

/**
 * Standalone, backend-free Leadership Dashboard module (Req 14.1-14.4).
 * Lazy-loaded so it stays fully isolated from the existing dashboard bundle;
 * './leadership' resolves to client/src/leadership/index.tsx (default export).
 */
const LeadershipModule = lazy(() => import('./leadership'));

/**
 * Helper to determine which nav links to show based on user role.
 * - Engineering_Manager: Dashboard, Upload Data, My Teams, History
 * - Leadership: Dashboard, History
 * - Super_Admin: Dashboard, Upload Data, History, Admin Panel
 * - Others (Admin, Delivery_Manager): Dashboard, Upload Data
 */
function getNavLinks(role: string | undefined): Array<{ to: string; label: string; matchPrefix?: boolean }> {
  switch (role) {
    case 'Engineering_Manager':
      return [
        { to: '/', label: 'Dashboard' },
        { to: '/upload', label: 'Upload Data' },
        { to: '/my-teams', label: 'My Teams' },
        { to: '/history', label: 'History' },
      ];
    case 'Leadership':
      return [
        { to: '/', label: 'Dashboard' },
        { to: '/history', label: 'History' },
      ];
    case 'Super_Admin':
      return [
        { to: '/', label: 'Dashboard' },
        { to: '/upload', label: 'Upload Data' },
        { to: '/history', label: 'History' },
        { to: '/admin', label: 'Admin Panel', matchPrefix: true },
      ];
    default:
      return [
        { to: '/', label: 'Dashboard' },
        { to: '/upload', label: 'Upload Data' },
      ];
  }
}

/**
 * App layout wrapper with branded header, navigation, and footer.
 * Renders child routes via <Outlet />.
 */
function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getStoredUser();
  const role = user?.role;
  const teamId = user?.teamId;

  const isActive = (path: string, matchPrefix?: boolean) => {
    if (matchPrefix) return location.pathname.startsWith(path);
    return location.pathname === path;
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const navLinks = getNavLinks(role);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Header */}
      <header style={{
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
        padding: '0 32px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1400px', margin: '0 auto', height: '64px' }}>
          {/* Logo / Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src={logo}
              alt="Engineering Health Platform"
              style={{ height: '50px', width: 'auto' }}
            />
            <span style={{ color: '#fff', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.3px' }}>
              Engineering Health
            </span>
            {/* Team name display for Engineering Managers */}
            {role === 'Engineering_Manager' && teamId && (
              <span style={{
                color: 'rgba(255,255,255,0.8)',
                fontSize: '13px',
                fontWeight: 400,
                marginLeft: '8px',
                padding: '2px 10px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '4px',
              }}>
                Team: {teamId}
              </span>
            )}
          </div>

          {/* Nav Links */}
          <nav style={{ display: 'flex', gap: '4px' }}>
            {navLinks.map((link, index) => (
              <Link
                key={`${link.to}-${index}`}
                to={link.to}
                style={{
                  color: isActive(link.to, link.matchPrefix) ? '#fff' : 'rgba(255,255,255,0.75)',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  textDecoration: 'none',
                  background: isActive(link.to, link.matchPrefix) ? 'rgba(255,255,255,0.15)' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'rgba(255,255,255,0.85)',
              fontSize: '13px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '6px',
              padding: '6px 14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '24px 32px' }}>
        <Outlet />
      </main>

      {/* Footer */}
      <footer style={{
        padding: '16px 32px',
        textAlign: 'center',
        fontSize: '12px',
        color: colors.textSecondary,
        borderTop: `1px solid ${colors.border}`,
        background: colors.background,
      }}>
        Engineering Health & Delivery Governance Platform
      </footer>
    </div>
  );
}

/**
 * Root application component with React Router v6 route structure.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="upload" element={<Upload />} />
        <Route path="my-teams" element={<MyTeams />} />
        <Route path="history" element={<History />} />
        <Route path="analytics" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="/admin" element={<ProtectedRoute requireSuperAdmin><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="teams" element={<TeamManager />} />
        <Route path="teams-overview" element={<AdminTeams />} />
        <Route path="teams-overview/:teamName" element={<AdminTeamDetail />} />
        <Route path="entries" element={<AdminEntries />} />
        <Route path="functions" element={<FunctionManager />} />
        <Route path="em-assignment" element={<EMFunctionAssignment />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
      {/*
        Isolated Leadership Dashboard module (Req 14.1-14.5). Intentionally kept
        outside ProtectedRoute/AppLayout so the module renders standalone as a
        separate, backend-free module — no coupling to existing routes.
      */}
      <Route
        path="/leadership/*"
        element={
          <Suspense fallback={<div>Loading Leadership Dashboard…</div>}>
            <LeadershipModule />
          </Suspense>
        }
      />
    </Routes>
  );
}
