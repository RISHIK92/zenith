import { FormEvent, useState } from 'react';
import { Mountain, Sparkles } from 'lucide-react';
import type { User } from '../types';

type Props = {
  onAuthenticated: (user: User) => void;
};

export function AuthView({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('demo');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('zenith123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user =
        mode === 'login'
          ? await window.zenithAPI.auth.login({ identifier, password })
          : await window.zenithAPI.auth.register({ username, email, displayName, password });
      onAuthenticated(user);
    } catch (err: any) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="row-gap" style={{ marginBottom: 18 }}>
          <div className="brand-mark">
            <Mountain size={20} />
          </div>
          <div>
            <div className="brand-title">Zenith</div>
            <div className="brand-sub">Focus Rooms · Distraction Shield · Gamified Habits</div>
          </div>
        </div>

        <h1 style={{ fontSize: 21, fontWeight: 700, marginBottom: 6 }}>
          {mode === 'login' ? 'Welcome back' : 'Create your Zenith account'}
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 20 }}>
          {mode === 'login'
            ? 'Sign in to track focus sessions, join study rooms, and protect your attention.'
            : 'Build sustainable focus habits with accountability and distraction blocking.'}
        </p>

        <form className="stack" onSubmit={handleSubmit}>
          {mode === 'login' ? (
            <div className="field">
              <label className="label">Username or Email</label>
              <input
                className="input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="demo or demo@zenith.app"
                required
              />
            </div>
          ) : (
            <>
              <div className="field">
                <label className="label">Display Name</label>
                <input
                  className="input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex Rivera"
                  required
                />
              </div>
              <div className="field">
                <label className="label">Username</label>
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="alexr"
                  required
                />
              </div>
              <div className="field">
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@university.edu"
                  required
                />
              </div>
            </>
          )}

          <div className="field">
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              required
            />
          </div>

          {error && <div className="error-box">{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {mode === 'login' && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--primary-soft)',
              fontSize: 12.5,
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
            <Sparkles size={15} />
            <span>
              Demo account pre-filled: <strong>demo</strong> / <strong>zenith123</strong>
            </span>
          </div>
        )}

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13.5, color: 'var(--text-secondary)' }}>
          {mode === 'login' ? (
            <>
              New to Zenith?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                  setPassword('');
                }}
                style={{ border: 'none', background: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                style={{ border: 'none', background: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
