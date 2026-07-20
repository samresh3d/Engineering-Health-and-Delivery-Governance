import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAuth, fetchAndUpdateUserProfile } from '../auth';
import { colors, theme } from '../theme';
import logo from '../logo.svg';
import apiClient from '../api/client';
import { API_BASE_URL } from '../config';

type RoleOption = 'Super_Admin' | 'Leadership' | 'Engineering_Manager';

interface FunctionOption {
  id: number;
  name: string;
}

export default function Login() {
  const [role, setRole] = useState<RoleOption | ''>('');
  const [functions, setFunctions] = useState<FunctionOption[]>([]);
  const [selectedFunctionId, setSelectedFunctionId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Fetch available functions when Engineering Manager is selected
  useEffect(() => {
    if (role === 'Engineering_Manager') {
      setLoading(true);
      fetch(`${API_BASE_URL}/api/auth/functions`)
        .then(res => res.json())
        .then(data => {
          setFunctions(data.functions || []);
          setLoading(false);
        })
        .catch(() => {
          setError('Failed to load functions. Please try again.');
          setLoading(false);
        });
    } else {
      setFunctions([]);
      setSelectedFunctionId('');
      setPassword('');
    }
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (role === 'Engineering_Manager') {
        if (!selectedFunctionId || !password) {
          setError('Please select a function and enter a password.');
          setLoading(false);
          return;
        }

        const response = await apiClient.post('/api/auth/login', {
          role: 'Engineering_Manager',
          functionId: Number(selectedFunctionId),
          password,
        });

        const data = response.data;
        setAuth({
          userId: data.userId,
          username: data.username,
          role: data.role,
          token: data.token,
          teamId: null,
        });
        await fetchAndUpdateUserProfile();
        navigate('/');
      } else if (role === 'Super_Admin' || role === 'Leadership') {
        const response = await apiClient.post('/api/auth/login', { role });
        const data = response.data;
        setAuth({
          userId: data.userId,
          username: data.username,
          role: data.role,
          token: data.token,
          teamId: null,
        });
        await fetchAndUpdateUserProfile();
        navigate('/');
      }
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
      ) {
        setError((err as { response: { data: { error: string } } }).response.data.error);
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isSubmitDisabled = () => {
    if (!role) return true;
    if (role === 'Engineering_Manager') {
      return !selectedFunctionId || !password;
    }
    return false;
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: colors.secondary,
        fontFamily: theme.fonts.body,
      }}
    >
      <div
        style={{
          background: colors.background,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.hover,
          padding: theme.spacing.xxl,
          width: '100%',
          maxWidth: '400px',
          textAlign: 'center',
        }}
      >
        <img
          src={logo}
          alt="Engineering Health Platform"
          style={{ height: '160px', marginBottom: theme.spacing.lg }}
        />
        <h1
          style={{
            fontSize: '1.5rem',
            color: colors.text,
            margin: `0 0 ${theme.spacing.xl}`,
            fontWeight: 600,
          }}
        >
          Engineering Health Platform
        </h1>

        {error && (
          <p style={{ color: colors.red, marginBottom: theme.spacing.md, fontSize: '14px' }}>{error}</p>
        )}

        <form onSubmit={handleSubmit}>
          {/* Role Dropdown */}
          <select
            value={role}
            onChange={e => {
              setRole(e.target.value as RoleOption | '');
              setError(null);
            }}
            aria-label="Select role"
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '1rem',
              border: `1px solid ${colors.border}`,
              borderRadius: theme.borderRadius.sm,
              background: colors.background,
              color: colors.text,
              marginBottom: theme.spacing.md,
              cursor: 'pointer',
              appearance: 'auto',
            }}
          >
            <option value="">Select role...</option>
            <option value="Super_Admin">Admin</option>
            <option value="Leadership">Leadership</option>
            <option value="Engineering_Manager">Engineering Manager</option>
          </select>

          {/* Function Dropdown — shown only for Engineering Manager */}
          {role === 'Engineering_Manager' && (
            <>
              <select
                value={selectedFunctionId}
                onChange={e => setSelectedFunctionId(e.target.value)}
                aria-label="Select function"
                disabled={loading || functions.length === 0}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '1rem',
                  border: `1px solid ${colors.border}`,
                  borderRadius: theme.borderRadius.sm,
                  background: colors.background,
                  color: colors.text,
                  marginBottom: theme.spacing.md,
                  cursor: loading ? 'wait' : 'pointer',
                  appearance: 'auto',
                }}
              >
                <option value="">Select function...</option>
                {functions.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>

              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                aria-label="Password"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '1rem',
                  border: `1px solid ${colors.border}`,
                  borderRadius: theme.borderRadius.sm,
                  background: colors.background,
                  color: colors.text,
                  marginBottom: theme.spacing.lg,
                  boxSizing: 'border-box',
                }}
              />
            </>
          )}

          {/* Spacer for non-EM roles */}
          {role && role !== 'Engineering_Manager' && (
            <div style={{ marginBottom: theme.spacing.md }} />
          )}

          <button
            type="submit"
            disabled={isSubmitDisabled() || loading}
            style={{
              width: '100%',
              padding: '12px 24px',
              fontSize: '1rem',
              fontWeight: 600,
              color: colors.textLight,
              background: isSubmitDisabled() || loading ? colors.textSecondary : colors.primary,
              border: 'none',
              borderRadius: theme.borderRadius.sm,
              cursor: isSubmitDisabled() || loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
