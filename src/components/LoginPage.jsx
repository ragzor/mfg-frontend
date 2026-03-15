import { useState } from 'react';
import { login } from '../api/auth';

function LoginPage({ onLogin }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      onLogin();
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ width: 360 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div className="logo-icon" style={{ width: 40, height: 40, fontSize: 17 }}>MFG</div>
          <div>
            <div className="logo-text" style={{ fontSize: 22 }}>MANUFACT</div>
            <div className="logo-sub">Mgmt System</div>
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 28 }}>
          <div style={{
            fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700,
            marginBottom: 4,
          }}>
            Sign In
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 22 }}>
            ENTER YOUR CREDENTIALS TO CONTINUE
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div className="fgrp">
              <label>Email</label>
              <input
                className="fi"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="fgrp">
              <label>Password</label>
              <input
                className="fi"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,.1)',
                border: '1px solid rgba(239,68,68,.3)',
                borderRadius: 3,
                padding: '8px 12px',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--red)',
              }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>

          </form>
        </div>

      </div>
    </div>
  );
}

export default LoginPage;
