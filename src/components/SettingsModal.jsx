import { useState, useEffect } from 'react';
import { getAsanaToken, saveAsanaToken } from '../api/asana';

function SettingsModal({ open, onClose }) {
  const [token,   setToken]   = useState('');
  const [saved,   setSaved]   = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setToken(getAsanaToken());
      setSaved(false);
    }
  }, [open]);

  function handleSave() {
    saveAsanaToken(token.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClear() {
    setToken('');
    saveAsanaToken('');
    setSaved(false);
  }

  if (!open) return null;

  return (
    <div className="backdrop open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-hdr">
          <div className="modal-title">SETTINGS</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Asana Integration ── */}
          <div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)',
              textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12,
            }}>
              ⚡ Asana Integration
            </div>

            <div className="fgrp" style={{ marginBottom: 8 }}>
              <label>Personal Access Token (PAT)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="fi"
                  type={visible ? 'text' : 'password'}
                  placeholder="Paste your Asana PAT here…"
                  value={token}
                  onChange={e => { setToken(e.target.value); setSaved(false); }}
                  style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12 }}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setVisible(v => !v)}
                  style={{ minWidth: 52 }}
                >
                  {visible ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6 }}>
              Used to auto-fill part details from Asana tasks when creating parts.
              <br />
              Get yours at: <span style={{ color: 'var(--accent)' }}>app.asana.com → Profile → My Settings → Apps → Personal Access Tokens</span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!token.trim()}>
                {saved ? '✓ Saved' : 'Save Token'}
              </button>
              {getAsanaToken() && (
                <button className="btn btn-ghost btn-sm" onClick={handleClear}>
                  Clear
                </button>
              )}
            </div>

            {/* Status indicator */}
            <div style={{ marginTop: 12 }}>
              {getAsanaToken() ? (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)',
                  borderRadius: 3, padding: '4px 10px',
                  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                  Token configured
                </div>
              ) : (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
                  borderRadius: 3, padding: '4px 10px',
                  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
                  No token — Asana import disabled
                </div>
              )}
            </div>
          </div>

          {/* ── Divider ── */}
          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* ── App info ── */}
          <div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10,
            }}>
              About
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.8 }}>
              <div>MANUFACT Management System</div>
              <div>Intralog Automation · v1.0</div>
            </div>
          </div>

        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
