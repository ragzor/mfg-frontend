import { useState, useEffect, useRef } from 'react';
import { updateProcessStatus, undoProcess, recordProduction, advanceStep, updateProcessVendorPo } from '../api/processes';
import { getPartByNumber, uploadDrawing, getPartAudit } from '../api/parts';
import { useLookups } from '../hooks/useLookups';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function fmt(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// Per-process colour logic
function processColor(pp) {
  const s = pp.status;
  if (s === 'CMPLT') {
    const actual  = daysBetween(pp.actual_start, pp.actual_end);
    const planned = pp.duration_days || pp.planned_days;
    if (actual != null && planned != null) {
      return actual <= planned ? 'var(--green)' : 'var(--red)';
    }
    return 'var(--green)';
  }
  if (s === 'IN_PRGS') return '#3b82f6';
  if (s === 'QC')      return '#f59e0b';
  if (s === 'CANCELLED') return 'var(--border2)';
  if (s === 'M_SEND' || s === 'M_RCV') return '#06b6d4';
  if (['REJECTED','W_4_RM','W_4_QUT','PO_APPROVAL','W_4_PARTS','W_F_PAYMENT','W_F_DECISION'].includes(s))
    return 'var(--red)';
  return 'var(--border2)'; // NOT_STARTED
}

function processIcon(s) {
  if (s === 'CMPLT')   return '✓';
  if (s === 'IN_PRGS') return '▶';
  if (s === 'QC')      return '◉';
  if (s === 'REJECTED') return '✕';
  return '○';
}

const STATUS_LABELS = {
  IN_PRGS:'In Progress', CMPLT:'Completed', NOT_STARTED:'Not Started',
  QC:'QC Hold', REJECTED:'Rejected', W_4_RM:'Waiting for RM',
  W_4_QUT:'Waiting for Quotation', PO_APPROVAL:'PO Approval',
  W_4_PARTS:'Waiting for Parts', W_F_PAYMENT:'Waiting for Payment',
  W_F_DECISION:'Waiting for Decision',
  M_SEND:'Material Sent', M_RCV:'Material Received', CANCELLED:'Cancelled',
};

const ALL_STATUSES = Object.keys(STATUS_LABELS);

// ─────────────────────────────────────────────
// Process Step Card
// ─────────────────────────────────────────────

function StepCard({ pp, partId, onRefresh, vendors = [] }) {
  const [statusOpen,   setStatusOpen]   = useState(false);
  const [qtyOpen,      setQtyOpen]      = useState(false);
  const [qtyVal,       setQtyVal]       = useState('');
  const [busy,         setBusy]         = useState(false);
  const [err,          setErr]          = useState('');
  const [confirm,      setConfirm]      = useState(null);
  const [vendorVal,    setVendorVal]    = useState(pp.vendor    || '');
  const [poVal,        setPoVal]        = useState(pp.po_number || '');
  const [vpSaving,     setVpSaving]     = useState(false);
  const [vpSaved,      setVpSaved]      = useState(false);

  // JW_Machining manual rate
  const isJW = (pp.process_name || '').toLowerCase().includes('jw') || (pp.process_name || '').toLowerCase().includes('machining');
  const [jwRate,    setJwRate]    = useState(pp.cost_per_kg != null ? String(pp.cost_per_kg) : '');
  const [jwSaving,  setJwSaving]  = useState(false);
  const [jwSaved,   setJwSaved]   = useState(false);

  async function saveJwRate() {
    setJwSaving(true);
    try {
      const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      await fetch(`${BASE}/parts/process/${pp.part_process_id}/cost`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('mfg_token')}` },
        body: JSON.stringify({ cost_per_kg: jwRate !== '' ? parseFloat(jwRate) : null }),
      });
      setJwSaved(true);
      setTimeout(() => setJwSaved(false), 2000);
    } catch (e) { setErr(e.message); }
    finally { setJwSaving(false); }
  }

  const color = processColor(pp);
  const actual  = daysBetween(pp.actual_start, pp.actual_end);
  const planned = pp.duration_days || pp.planned_days;

  async function saveVendorPo() {
    setVpSaving(true); setErr('');
    try {
      await updateProcessVendorPo(pp.part_process_id, { vendor: vendorVal, po_number: poVal });
      setVpSaved(true);
      setTimeout(() => setVpSaved(false), 2000);
      await onRefresh();
    } catch (e) { setErr(e.message); }
    finally { setVpSaving(false); }
  }

  async function doStatus(newStatus) {
    setBusy(true); setErr('');
    try {
      await updateProcessStatus(pp.part_process_id, newStatus);
      setStatusOpen(false);
      await onRefresh();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function doAdvance() {
    setBusy(true); setErr(''); setConfirm(null);
    try {
      await advanceStep([partId]);
      await onRefresh();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function doUndo() {
    setBusy(true); setErr(''); setConfirm(null);
    try {
      await undoProcess(pp.part_process_id);
      await onRefresh();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function doRecord() {
    const n = parseInt(qtyVal);
    if (!n || n < 1) return setErr('Enter a valid quantity');
    setBusy(true); setErr('');
    try {
      await recordProduction(pp.part_process_id, n);
      setQtyOpen(false); setQtyVal('');
      await onRefresh();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{
      background: 'var(--surface2)',
      border: `1px solid ${color}44`,
      borderTop: `3px solid ${color}`,
      borderRadius: 6,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      position: 'relative',
      minWidth: 180,
      flex: '1 1 180px',
    }}>
      {/* Step header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>
            Step {pp.step_number}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--display)', color: 'var(--text)' }}>
            {pp.process_name}
          </div>
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: `${color}22`, border: `2px solid ${color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color, fontSize: 12, fontWeight: 700,
        }}>
          {processIcon(pp.status)}
        </div>
      </div>

      {/* Status badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
        color, background: `${color}18`,
        border: `1px solid ${color}44`,
        borderRadius: 3, padding: '2px 8px', width: 'fit-content',
      }}>
        {STATUS_LABELS[pp.status] || pp.status}
      </div>

      {/* Dates */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div>
          <span style={{ color: 'var(--border2)' }}>Planned: </span>
          {fmt(pp.planned_start)} → {fmt(pp.planned_end)}
          {planned && <span style={{ color: 'var(--border2)' }}> ({planned}d)</span>}
        </div>
        {pp.actual_start && (
          <div>
            <span style={{ color: 'var(--border2)' }}>Actual:  </span>
            {fmt(pp.actual_start)} → {pp.actual_end ? fmt(pp.actual_end) : <span style={{ color: '#3b82f6' }}>ongoing</span>}
            {actual != null && planned != null && (
              <span style={{ color: actual <= planned ? 'var(--green)' : 'var(--red)', marginLeft: 4 }}>
                ({actual <= planned ? `on time (${actual}d)` : `+${actual - planned}d delay`})
              </span>
            )}
          </div>
        )}
        {/* Partial qty progress — only show if production has been recorded */}
        {pp.completed_quantity != null && pp.completed_quantity > 0 && (
          <div style={{ marginTop: 2 }}>
            <span style={{ color: 'var(--border2)' }}>Qty: </span>
            <span style={{ color: 'var(--green)' }}>{pp.completed_quantity} done</span>
            <span style={{ color: 'var(--border2)' }}> / </span>
            <span style={{ color: pp.remaining_quantity > 0 ? '#f59e0b' : 'var(--muted)' }}>
              {pp.remaining_quantity} remaining
            </span>
          </div>
        )}
      </div>

      {/* JW_Machining manual rate */}
      {isJW && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>₹/kg</span>
          <input
            className="fi"
            type="number" min={0} step="0.01"
            placeholder="Rate per kg"
            value={jwRate}
            onChange={e => setJwRate(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveJwRate()}
            style={{ width: 100, fontSize: 11, padding: '3px 7px', fontFamily: 'var(--mono)' }}
          />
          <button
            className="btn btn-ghost btn-sm"
            onClick={saveJwRate}
            disabled={jwSaving}
            style={{ fontSize: 10, padding: '3px 8px', color: jwSaved ? 'var(--green)' : undefined }}
          >
            {jwSaving ? '…' : jwSaved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      )}

      {/* Vendor / PO inline editor */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
        <select
          className="fi"
          value={vendorVal}
          onChange={e => setVendorVal(e.target.value)}
          style={{ width: 130, fontSize: 11, padding: '3px 7px' }}
        >
          <option value="">— Vendor —</option>
          {vendors.map(v => (
            <option key={v.id} value={v.name}>{v.name}</option>
          ))}
        </select>
        <input
          className="fi"
          placeholder="PO #"
          value={poVal}
          onChange={e => setPoVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && saveVendorPo()}
          style={{ width: 90, fontSize: 11, padding: '3px 7px', fontFamily: 'var(--mono)' }}
        />
        <button
          className="btn btn-ghost btn-sm"
          onClick={saveVendorPo}
          disabled={vpSaving}
          style={{ fontSize: 10, padding: '3px 8px', color: vpSaved ? 'var(--green)' : undefined }}
        >
          {vpSaving ? '…' : vpSaved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {/* Error */}
      {err && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 10 }}>⚠ {err}</div>}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>

        {/* Change Status */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 10, padding: '3px 8px' }}
            onClick={() => { setStatusOpen(o => !o); setQtyOpen(false); }}
            disabled={busy}
          >
            ✎ Status
          </button>
          {statusOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 200,
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: 4, marginTop: 4, minWidth: 180,
              boxShadow: '0 8px 24px rgba(0,0,0,.4)',
            }}>
              {ALL_STATUSES.map(s => (
                <div
                  key={s}
                  onClick={() => doStatus(s)}
                  style={{
                    padding: '7px 12px', cursor: 'pointer',
                    fontFamily: 'var(--mono)', fontSize: 11,
                    color: s === pp.status ? 'var(--accent)' : 'var(--text)',
                    background: s === pp.status ? 'var(--surface2)' : 'transparent',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = s === pp.status ? 'var(--surface2)' : 'transparent'}
                >
                  {s === pp.status && '• '}{STATUS_LABELS[s]}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Record Qty */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 10, padding: '3px 8px' }}
            onClick={() => { setQtyOpen(o => !o); setStatusOpen(false); }}
            disabled={busy}
          >
            # Qty
          </button>
          {qtyOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 200,
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: 4, marginTop: 4, padding: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,.4)',
              display: 'flex', gap: 6, alignItems: 'center', minWidth: 160,
            }}>
              <input
                className="fi"
                type="number"
                min="1"
                placeholder="Qty"
                value={qtyVal}
                onChange={e => setQtyVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doRecord()}
                style={{ width: 70, fontSize: 12, padding: '4px 8px' }}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={doRecord} disabled={busy} style={{ fontSize: 10 }}>
                {busy ? '…' : 'Record'}
              </button>
            </div>
          )}
        </div>

        {/* Undo — only if CMPLT */}
        {pp.status === 'CMPLT' && (
          confirm?.action === 'undo' ? (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>Revert to In Progress?</span>
              <button className="btn btn-sm" onClick={doUndo} disabled={busy}
                style={{ fontSize: 10, background: 'var(--red)', color: '#fff', border: 'none', padding: '3px 8px' }}>
                {busy ? '…' : 'Yes'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)} style={{ fontSize: 10, padding: '3px 8px' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 10, padding: '3px 8px', color: 'var(--red)', borderColor: 'rgba(239,68,68,.3)' }}
              onClick={() => setConfirm({ action: 'undo' })}
              disabled={busy}
            >
              ↩ Undo
            </button>
          )
        )}

        {/* Advance Step — only on active step */}
        {pp.status === 'IN_PRGS' && (
          confirm?.action === 'advance' ? (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>Mark complete & advance?</span>
              <button className="btn btn-sm" onClick={doAdvance} disabled={busy}
                style={{ fontSize: 10, background: 'var(--accent)', color: '#000', border: 'none', padding: '3px 8px' }}>
                {busy ? '…' : 'Yes'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)} style={{ fontSize: 10, padding: '3px 8px' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              style={{ fontSize: 10, padding: '3px 10px' }}
              onClick={() => setConfirm({ action: 'advance' })}
              disabled={busy}
            >
              ⏭ Advance Step
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Scheduling Tab — edit planned dates & duration per process
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Audit History Tab
// ─────────────────────────────────────────────

const ACTION_COLORS = {
  CREATE:  { bg: 'rgba(56,189,100,.12)',  color: 'var(--green)' },
  UPDATE:  { bg: 'rgba(59,130,246,.12)',  color: '#60a5fa' },
  ADVANCE: { bg: 'rgba(255,140,0,.12)',   color: 'var(--accent)' },
  UPLOAD:  { bg: 'rgba(168,85,247,.12)',  color: '#c084fc' },
};

function AuditTab({ partId }) {
  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    setLoading(true);
    getPartAudit(partId)
      .then(data => { setEntries(data); setLoading(false); })
      .catch(e  => { setError(e.message); setLoading(false); });
  }, [partId]);

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return { date, time };
  }

  if (loading) return (
    <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12, padding: 20 }}>
      Loading audit history…
    </div>
  );

  if (error) return (
    <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 12, padding: 20 }}>
      ⚠ {error}
    </div>
  );

  if (entries.length === 0) return (
    <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12, padding: '30px 0', textAlign: 'center' }}>
      No audit history yet.
    </div>
  );

  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {entries.length} event{entries.length !== 1 ? 's' : ''}
      </div>
      {entries.map(e => {
        const { bg, color } = ACTION_COLORS[e.action] || ACTION_COLORS.UPDATE;
        const t = fmtTime(e.created_at);
        return (
          <div key={e.id} style={{
            display: 'grid',
            gridTemplateColumns: '90px 56px 1fr',
            gap: 10,
            alignItems: 'start',
            padding: '9px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            {/* Timestamp */}
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
              {t.date}<br />
              <span style={{ fontSize: 9 }}>{t.time}</span><br />
              <span style={{ fontSize: 9, color: 'var(--muted)' }}>{e.user_name}</span>
            </div>

            {/* Action badge */}
            <div>
              <span style={{
                display: 'inline-block',
                background: bg, color,
                fontFamily: 'var(--mono)', fontSize: 9,
                fontWeight: 700, letterSpacing: '.06em',
                padding: '2px 6px', borderRadius: 3,
                textTransform: 'uppercase',
              }}>
                {e.action}
              </span>
            </div>

            {/* Detail */}
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', lineHeight: 1.6 }}>
              {e.detail}
              {(e.before != null || e.after != null) && (
                <div style={{ marginTop: 3, fontSize: 10, color: 'var(--muted)' }}>
                  {e.before != null && (
                    <span>
                      <span style={{ width: 44, display: 'inline-block' }}>Before:</span>
                      <span style={{ color: '#f87171' }}>{e.before}</span>
                    </span>
                  )}
                  {e.before != null && e.after != null && <br />}
                  {e.after != null && (
                    <span>
                      <span style={{ width: 44, display: 'inline-block' }}>After:</span>
                      <span style={{ color: 'var(--green)' }}>{e.after}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


function SchedulingTab({ part, onRefresh }) {
  const pp = part.processData || [];
  const [rows, setRows] = useState(() =>
    pp.map(p => ({
      id:            p.part_process_id,
      name:          p.process_name,
      step:          p.step_number,
      planned_start: p.planned_start || '',
      planned_end:   p.planned_end   || '',
      duration_days: p.duration_days || 1,
      status:        p.status,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [err,    setErr]    = useState('');

  function setRow(id, field, val) {
    setRows(rs => {
      // First update the changed row
      const updated = rs.map(r => {
        if (r.id !== id) return r;
        const next = { ...r, [field]: val };
        // Auto-recalculate end date when duration or start changes
        if ((field === 'duration_days' || field === 'planned_start') && next.planned_start) {
          const start = new Date(next.planned_start);
          const days  = parseInt(next.duration_days) || 1;
          const end   = new Date(start);
          end.setDate(end.getDate() + days - 1);
          next.planned_end = end.toISOString().slice(0, 10);
        }
        return next;
      });

      // Then cascade: recalculate start/end for all downstream NOT_STARTED rows
      const changedIdx = updated.findIndex(r => r.id === id);
      const result = [...updated];
      for (let i = changedIdx + 1; i < result.length; i++) {
        if (result[i].status === 'CMPLT' || result[i].status === 'IN_PRGS') continue;
        const prev = result[i - 1];
        if (!prev.planned_end) continue;
        const newStart = new Date(prev.planned_end);
        newStart.setDate(newStart.getDate() + 1);
        const days = parseInt(result[i].duration_days) || 1;
        const newEnd = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + days - 1);
        result[i] = {
          ...result[i],
          planned_start: newStart.toISOString().slice(0, 10),
          planned_end:   newEnd.toISOString().slice(0, 10),
        };
      }
      return result;
    });
  }

  async function saveAll() {
    setSaving(true); setErr(''); setSaved(false);
    const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('mfg_token')}`,
    };
    try {
      // Save sequentially so each cascade completes before the next step is saved
      for (const r of rows) {
        if (r.status === 'CMPLT') continue;
        await fetch(`${BASE}/part-processes/${r.id}/schedule`, {
          method: 'PATCH', headers,
          body: JSON.stringify({
            planned_start: r.planned_start || null,
            planned_end:   r.planned_end   || null,
            duration_days: parseInt(r.duration_days) || 1,
          }),
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Reload fresh data into rows
      const fresh = await fetch(`${BASE}/parts/by-number/${part.id}`, { headers }).then(r => r.json());
      if (fresh.processes) {
        setRows(fresh.processes.map(p => ({
          id:            p.part_process_id,
          name:          p.process_name,
          step:          p.step_number,
          planned_start: p.planned_start || '',
          planned_end:   p.planned_end   || '',
          duration_days: p.duration_days || 1,
          status:        p.status,
        })));
      }
      onRefresh();
    } catch (e) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const STATUS_COLOR = { CMPLT: 'var(--green)', IN_PRGS: '#3b82f6', NOT_STARTED: 'var(--border2)', QC: '#f59e0b' };

  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        Override planned dates and duration for each process step. Changes will cascade to downstream steps.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border2)' }}>
            {['Step', 'Process', 'Status', 'Duration (days)', 'Planned Start', 'Planned End'].map(h => (
              <th key={h} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', textAlign: 'left', padding: '6px 10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>{r.step}</td>
              <td style={{ padding: '10px', fontWeight: 600, fontSize: 13 }}>{r.name}</td>
              <td style={{ padding: '10px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: STATUS_COLOR[r.status] || 'var(--muted)' }}>{r.status}</span>
              </td>
              <td style={{ padding: '10px' }}>
                <input
                  type="number" min={1} max={365}
                  className="fi"
                  value={r.duration_days}
                  onChange={e => setRow(r.id, 'duration_days', e.target.value)}
                  style={{ width: 70, fontSize: 12, padding: '4px 8px', fontFamily: 'var(--mono)' }}
                  disabled={r.status === 'CMPLT'}
                />
              </td>
              <td style={{ padding: '10px' }}>
                <input
                  type="date"
                  className="fi"
                  value={r.planned_start}
                  onChange={e => setRow(r.id, 'planned_start', e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', fontFamily: 'var(--mono)' }}
                  disabled={r.status === 'CMPLT'}
                />
              </td>
              <td style={{ padding: '10px' }}>
                <input
                  type="date"
                  className="fi"
                  value={r.planned_end}
                  onChange={e => setRow(r.id, 'planned_end', e.target.value)}
                  style={{ fontSize: 12, padding: '4px 8px', fontFamily: 'var(--mono)' }}
                  disabled={r.status === 'CMPLT'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
        <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
          {saving ? '…Saving' : saved ? '✓ Saved' : 'Save Schedule'}
        </button>
        {err && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)' }}>⚠ {err}</span>}
        {saved && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)' }}>Schedule updated</span>}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// Edit Part Tab — change qty and process steps
// ─────────────────────────────────────────────

function EditPartTab({ part, onRefresh, onClose }) {
  const { processes, vendors } = useLookups();
  const [qty,               setQty]               = useState(part.qty || part.quantity || 1);
  const [weightKg,          setWeightKg]          = useState(part.weight_kg || '');
  const [materialCostPerKg, setMaterialCostPerKg] = useState(part.material_cost_per_kg || '');
  const [steps,   setSteps]   = useState(() =>
    (part.processData || []).map(p => ({
      part_process_id: p.part_process_id,
      process_id:      p.process_id,
      process_name:    p.process_name,
      step_number:     p.step_number,
      duration_days:   p.duration_days || 1,
      status:          p.status,
      isNew:           false,
      isDeleted:       false,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const [saved,  setSaved]  = useState(false);

  function addStep() {
    const maxStep = Math.max(...steps.filter(s => !s.isDeleted).map(s => s.step_number), 0);
    setSteps(s => [...s, {
      part_process_id: `new-${Date.now()}`,
      process_id: '',
      process_name: '',
      step_number: maxStep + 1,
      duration_days: 1,
      status: 'NOT_STARTED',
      isNew: true,
      isDeleted: false,
    }]);
  }

  function removeStep(id) {
    setSteps(s => s.map(r => r.part_process_id === id ? { ...r, isDeleted: true } : r));
  }

  function updateStep(id, field, val) {
    setSteps(s => s.map(r => r.part_process_id === id ? { ...r, [field]: val } : r));
  }

  async function saveChanges() {
    setSaving(true); setErr(''); setSaved(false);
    const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('mfg_token')}`,
    };
    try {
      // 1. Update quantity, weight, material cost on the part
      await fetch(`${BASE}/parts/${part.part_id}/edit`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          quantity:             parseInt(qty),
          weight_kg:            weightKg !== '' ? parseFloat(weightKg) : null,
          material_cost_per_kg: materialCostPerKg !== '' ? parseFloat(materialCostPerKg) : null,
        }),
      });

      // 2. Delete removed steps
      const deleted = steps.filter(s => s.isDeleted && !s.isNew);
      await Promise.all(deleted.map(s =>
        fetch(`${BASE}/part-processes/${s.part_process_id}`, { method: 'DELETE', headers })
      ));

      // 3. Add new steps
      const newSteps = steps.filter(s => s.isNew && !s.isDeleted && s.process_id);
      await Promise.all(newSteps.map(s =>
        fetch(`${BASE}/parts/${part.part_id}/add-process`, {
          method: 'POST', headers,
          body: JSON.stringify({ process_id: s.process_id, duration_days: parseInt(s.duration_days), step_number: s.step_number }),
        })
      ));

      // 4. Reorder steps
      const active = steps.filter(s => !s.isDeleted && !s.isNew);
      await Promise.all(active.map(s =>
        fetch(`${BASE}/part-processes/${s.part_process_id}/schedule`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ duration_days: parseInt(s.duration_days) }),
        })
      ));

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onRefresh();
    } catch (e) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const activeSteps = steps.filter(s => !s.isDeleted);

  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 20 }}>
        ⚠ Engineer / Admin only. Changes to completed steps are locked.
      </div>

      {/* Quantity + Weight + Material Cost */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="fgrp" style={{ width: 160 }}>
          <label>Total Quantity</label>
          <input
            type="number" min={1}
            className="fi"
            value={qty}
            onChange={e => setQty(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
          />
        </div>
        <div className="fgrp" style={{ width: 160 }}>
          <label>Weight / Unit (kg)</label>
          <input
            type="number" min={0} step="0.001"
            className="fi"
            value={weightKg}
            placeholder="e.g. 1.36"
            onChange={e => setWeightKg(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
          />
        </div>
        <div className="fgrp" style={{ width: 160 }}>
          <label>Material Cost/kg (₹)</label>
          <input
            type="number" min={0} step="0.01"
            className="fi"
            value={materialCostPerKg}
            placeholder="e.g. 85.00"
            onChange={e => setMaterialCostPerKg(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
          />
        </div>
      </div>

      {/* Process steps */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
        Process Steps
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {activeSteps.map((s, i) => (
          <div key={s.part_process_id} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', width: 20, flexShrink: 0 }}>{i + 1}</span>
            {s.isNew ? (
              <select
                className="fi"
                value={s.process_id}
                onChange={e => {
                  const proc = processes.find(p => p.id === e.target.value);
                  updateStep(s.part_process_id, 'process_id', e.target.value);
                  updateStep(s.part_process_id, 'process_name', proc?.name || '');
                  updateStep(s.part_process_id, 'duration_days', proc?.default_days || 1);
                }}
                style={{ flex: 1, fontSize: 12 }}
              >
                <option value="">— Select process —</option>
                {processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.process_name}</span>
            )}
            <input
              type="number" min={1}
              className="fi"
              value={s.duration_days}
              onChange={e => updateStep(s.part_process_id, 'duration_days', e.target.value)}
              style={{ width: 60, fontSize: 12, padding: '4px 8px', fontFamily: 'var(--mono)' }}
              disabled={s.status === 'CMPLT'}
            />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>days</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: s.status === 'CMPLT' ? 'var(--green)' : s.status === 'IN_PRGS' ? '#3b82f6' : 'var(--border2)', width: 80 }}>{s.status}</span>
            {s.status !== 'CMPLT' && s.status !== 'IN_PRGS' && (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', fontSize: 10, padding: '2px 7px' }} onClick={() => removeStep(s.part_process_id)}>✕</button>
            )}
          </div>
        ))}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={addStep} style={{ marginBottom: 20 }}>+ Add Step</button>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={saveChanges} disabled={saving}>
          {saving ? '…Saving' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
        {err && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)' }}>⚠ {err}</span>}
        {saved && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)' }}>Changes saved</span>}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// ChildPartsTab  — shown only for WL- parts
// ─────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
function jwtTok() { return localStorage.getItem('mfg_token') || ''; }

function statusColor(s) {
  if (!s) return 'var(--border2)';
  const u = s.toUpperCase();
  if (u === 'CMPLT' || u === 'COMPLETED')  return 'var(--green)';
  if (u === 'IN_PRGS')                      return '#3b82f6';
  if (u === 'W_4_PARTS' || u === 'W_4_RM') return '#f59e0b';
  if (u === 'NOT_STARTED')                  return 'var(--border2)';
  return '#f59e0b';
}
const STATUS_LABELS_SHORT = {
  NOT_STARTED: 'Not Started', IN_PRGS: 'In Progress', CMPLT: 'Complete',
  W_4_PARTS: 'Waiting Parts', W_4_RM: 'Waiting RM', QC: 'QC Hold',
  REJECTED: 'Rejected', W_4_QUT: 'Waiting Quote', PO_APPROVAL: 'PO Approval',
};

function ChildPartsTab({ assemblyId, onBomChange }) {
  const [bom,         setBom]         = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState('');
  const [searchQ,     setSearchQ]     = useState('');
  const [searchRes,   setSearchRes]   = useState([]);
  const [searchParts, setSearchParts] = useState([]);
  const [addQty,      setAddQty]      = useState(1);
  const [adding,      setAdding]      = useState(false);
  const [removing,    setRemoving]    = useState(null);
  const [addErr,      setAddErr]      = useState('');

  const hdrs = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtTok()}` };

  async function fetchBom() {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`${API_BASE}/welding/${assemblyId}/bom`, { headers: hdrs });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      setBom(await r.json());
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  async function loadAllParts() {
    try {
      const r = await fetch(`${API_BASE}/parts`, { headers: hdrs });
      const d = await r.json();
      setSearchParts(Array.isArray(d) ? d : []);
    } catch { /* silent */ }
  }

  useEffect(() => { fetchBom(); loadAllParts(); }, [assemblyId]);

  function search(q) {
    setSearchQ(q);
    if (!q.trim()) return setSearchRes([]);
    const n = q.toLowerCase();
    setSearchRes(searchParts.filter(p =>
      p.part_number?.toLowerCase().includes(n) || p.name?.toLowerCase().includes(n)
    ).slice(0, 8));
  }

  async function addChild(partNumber) {
    setAdding(true); setAddErr('');
    try {
      const r = await fetch(`${API_BASE}/welding/${assemblyId}/dependency`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ child_part_number: partNumber, quantity: Number(addQty) || 1 }),
      });
      if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.detail || `Error ${r.status}`); }
      setSearchQ(''); setSearchRes([]); setAddQty(1);
      await fetchBom();
      onBomChange?.();
    } catch (e) { setAddErr(e.message); }
    finally { setAdding(false); }
  }

  async function removeChild(depId) {
    setRemoving(depId);
    try {
      const r = await fetch(`${API_BASE}/welding/${assemblyId}/dependency/${depId}`, {
        method: 'DELETE', headers: hdrs,
      });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      await fetchBom();
      onBomChange?.();
    } catch (e) { setErr(e.message); }
    finally { setRemoving(null); }
  }

  if (loading) return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', padding: 20 }}>
      Loading child parts…
    </div>
  );
  if (err) return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', padding: 20 }}>⚠ {err}</div>
  );

  const children = bom?.children || [];
  const blocking = children.filter(c => c.is_blocking).length;
  const complete = children.filter(c => !c.is_blocking).length;

  return (
    <div>
      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 4, padding: '10px 14px', marginBottom: 16,
        fontFamily: 'var(--mono)', fontSize: 11,
      }}>
        <span style={{ color: 'var(--muted)' }}>Child Parts</span>
        <span style={{ fontWeight: 700 }}>{children.length} total</span>
        {complete > 0  && <span style={{ color: 'var(--green)'  }}>✓ {complete} complete</span>}
        {blocking > 0  && <span style={{ color: '#f59e0b'       }}>⏳ {blocking} pending</span>}
        {bom?.all_parts_ready && (
          <span style={{
            marginLeft: 'auto', color: 'var(--green)',
            background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)',
            padding: '2px 10px', borderRadius: 2,
          }}>✓ All parts ready — welding can begin</span>
        )}
      </div>

      {/* Child parts list */}
      {children.length === 0 ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
          No child parts linked yet. Add them below.
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 2fr 60px 110px 100px 36px',
            gap: 8, padding: '5px 10px',
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '.08em',
            borderBottom: '1px solid var(--border)',
          }}>
            <span>Part #</span><span>Name</span><span>Qty</span><span>Current Process</span><span>Target Date</span><span></span>
          </div>

          {children.map(c => (
            <div key={c.dependency_id} style={{
              display: 'grid', gridTemplateColumns: '1fr 2fr 60px 110px 100px 36px',
              gap: 8, padding: '8px 10px', alignItems: 'center',
              borderBottom: '1px solid var(--border)',
              background: c.is_blocking ? 'rgba(245,158,11,.04)' : 'transparent',
              transition: 'background .1s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = c.is_blocking ? 'rgba(245,158,11,.04)' : 'transparent'}
            >
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>
                {c.child_part_number}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.child_name}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
                ×{c.quantity}
              </span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 7px', borderRadius: 2,
                background: `${statusColor(c.child_status)}18`,
                color: statusColor(c.child_status),
                border: `1px solid ${statusColor(c.child_status)}33`,
                whiteSpace: 'nowrap',
              }}>
                {c.child_status === 'CMPLT' ? '✓ Complete' : (c.child_active_process || STATUS_LABELS_SHORT[c.child_status] || c.child_status)}
              </span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 10,
                color: c.child_target_date ? (c.is_blocking ? '#f59e0b' : 'var(--muted)') : 'var(--border2)',
              }}>
                {c.child_target_date ? fmt(c.child_target_date) : '—'}
              </span>
              <button
                onClick={() => removeChild(c.dependency_id)}
                disabled={removing === c.dependency_id}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--red)', opacity: removing === c.dependency_id ? 0.4 : 0.5,
                  fontSize: 14, padding: 0, transition: 'opacity .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = removing === c.dependency_id ? '0.4' : '0.5'}
                title="Remove link"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Add child part */}
      <div style={{
        background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.2)',
        borderRadius: 4, padding: '12px 14px',
      }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
          + Link Child Part
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              value={searchQ}
              onChange={e => search(e.target.value)}
              placeholder="Search by part number or name…"
              className="fi"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }}
            />
            {searchRes.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: 'var(--surface)', border: '1px solid var(--border2)',
                borderRadius: 3, maxHeight: 240, overflowY: 'auto',
                boxShadow: '0 4px 16px rgba(0,0,0,.3)',
              }}>
                {searchRes.map(p => (
                  <div key={p.part_id || p.id}
                    onClick={() => { setSearchQ(p.part_number); setSearchRes([]); }}
                    style={{
                      padding: '8px 10px', cursor: 'pointer', display: 'flex',
                      gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', minWidth: 120 }}>
                      {p.part_number}
                    </span>
                    <span style={{ fontSize: 12, flex: 1, color: 'var(--muted)' }}>{p.name}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: statusColor(p.status) }}>
                      {STATUS_LABELS_SHORT[p.status] || p.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <input
            type="number" min="1" value={addQty}
            onChange={e => setAddQty(e.target.value)}
            className="fi"
            style={{ width: 64, textAlign: 'center', fontSize: 12 }}
            placeholder="Qty"
          />
          <button
            className="btn btn-sm"
            onClick={() => addChild(searchQ.trim())}
            disabled={adding || !searchQ.trim()}
            style={{ background: '#3b82f6', color: '#fff', whiteSpace: 'nowrap' }}
          >
            {adding ? '…' : '+ Link'}
          </button>
        </div>
        {addErr && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)', marginTop: 6 }}>
            ⚠ {addErr}
          </div>
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// Main PartDetailModal
// ─────────────────────────────────────────────

function PartDetailModal({ part: partProp, onClose, onRefresh }) {
  const [detailTab,   setDetailTab]  = useState('timeline');
  const [pdfOpen,     setPdfOpen]    = useState(false);
  const [localPart,   setLocalPart]  = useState(partProp);
  const [refreshKey,  setRefreshKey] = useState(0);
  const [uploading,   setUploading]  = useState(false);
  const [uploadErr,   setUploadErr]  = useState('');
  const fileInputRef = useRef(null);
  const { vendors } = useLookups();

  const STATUS_MAP = { NOT_STARTED:'Not Started', IN_PRGS:'In Progress', CMPLT:'Completed', QC:'QC', REJECTED:'Rejected', W_4_DECS:'On Hold', W_4_RM:'On Hold', W_4_QUT:'On Hold', PO_APPROVAL:'On Hold', W_4_PARTS:'On Hold', W_F_PAYMENT:'On Hold', W_F_DECISION:'On Hold' };

  function mapFresh(fresh) {
    const processes = fresh.processes || [];
    let currentStep = processes.findIndex(pp => pp.status === 'IN_PRGS' || pp.status === 'QC');
    if (currentStep === -1) currentStep = processes.filter(pp => pp.status === 'CMPLT').length;
    return {
      ...fresh,
      id:          fresh.part_number,
      name:        fresh.name,
      project:     fresh.project_name   || '—',
      qty:         fresh.quantity,
      matType:     fresh.material_type  || '—',
      matGrade:    fresh.material_grade || '—',
      vendor:      fresh.active_vendor      || '—',
      po:          fresh.active_po_number   || '—',
      activeProcStatus: fresh.active_proc_status || '',
      activeProcName:   fresh.active_proc_name   || '',
      asanaId:     fresh.asana_ref ? String(fresh.asana_ref) : '',
      drawing_url: fresh.drawing_url    || '',
      part_type:   fresh.part_type      || (fresh.part_number?.startsWith('WL-') ? 'welding_assembly' : 'component'),
      status:      STATUS_MAP[fresh.status] || fresh.status,
      rawStatus:   fresh.status,
      currentStep,
      processes:   processes.map(pp => pp.process_name),
      processData: processes,
    };
  }

  // Fast single-part refresh — only fetches this one part
  async function handleRefresh() {
    try {
      onRefresh(); // keep table in sync in background
      const fresh = await getPartByNumber(localPart.id);
      setLocalPart(mapFresh(fresh));
      setRefreshKey(k => k + 1);
    } catch (e) {
      console.error('Modal refresh failed:', e);
    }
  }

  async function handleDrawingUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadErr('Only PDF files allowed'); return;
    }
    setUploading(true); setUploadErr('');
    try {
      const result = await uploadDrawing(localPart.part_id, file);
      await handleRefresh(); // reload to get new drawing_url + weight_kg
      if (result?.weight_extracted && result?.weight_kg != null) {
        setUploadErr(''); // clear any previous error
        // Show success with weight — reuse uploadErr as info (green)
        setUploadErr(`✓ Weight auto-extracted: ${result.weight_kg} kg`);
        setTimeout(() => setUploadErr(''), 4000);
      }
    } catch (err) {
      setUploadErr(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const part = localPart;
  if (!part) return null;

  // Welding assemblies have WL- prefix — show Child Parts tab
  const isWelding = (part.id || '').startsWith('WL-') || (part.part_type === 'welding_assembly');

  const pp = part.processData || [];

  // Summary stats
  const done    = pp.filter(p => p.status === 'CMPLT').length;
  const total   = pp.length;
  const delayed = pp.filter(p => {
    if (p.status !== 'CMPLT') return false;
    const actual  = daysBetween(p.actual_start, p.actual_end);
    const planned = p.duration_days || p.planned_days;
    return actual != null && planned != null && actual > planned;
  }).length;

  const partStatusColor = {
    'In Progress': '#3b82f6', 'Completed': 'var(--green)',
    'On Hold': 'var(--red)', 'Not Started': 'var(--muted)',
    'QC': '#f59e0b', 'Rejected': 'var(--red)',
  };

  return (
    <div className="backdrop open">
      <div
        className="modal"
        style={{ width: 'min(95vw, 1000px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '20px 24px 0',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', marginBottom: 4 }}>
                {part.id}
              </div>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 24, color: 'var(--text)' }}>
                {part.name}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={handleDrawingUpload}
              />
              {/* Upload / Replace Drawing */}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ gap: 5 }}
              >
                {uploading ? '⏳ Uploading…' : part.drawing_url ? '↑ Replace Drawing' : '↑ Upload Drawing'}
              </button>
              {uploadErr && (
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 10,
                  color: uploadErr.startsWith('✓') ? 'var(--green)' : 'var(--red)'
                }}>
                  {uploadErr}
                </span>
              )}
              {/* View Drawing */}
              {part.drawing_url ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setPdfOpen(true)}>
                  📄 View Drawing
                </button>
              ) : (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--border2)', padding: '6px 10px' }}>
                  No drawing
                </span>
              )}
              <button className="modal-close" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Info cards row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Project',  value: part.project },
              { label: 'Status',   value: part.status, color: partStatusColor[part.status] },
              { label: 'Material', value: `${part.matType} / ${part.matGrade}` },
              { label: 'Qty',      value: part.qty },
              { label: part.activeProcName ? `Vendor (${part.activeProcName})` : 'Vendor',
                value: part.vendor && part.vendor !== '—' ? part.vendor : null },
              { label: part.activeProcName ? `PO # (${part.activeProcName})` : 'PO #',
                value: part.po && part.po !== '—' ? part.po : null },
              { label: 'Asana ID', value: part.asanaId || null },
            ].filter(c => c.value != null).map(card => (
              <div key={card.label} style={{
                background: 'var(--surface2)', borderRadius: 4,
                padding: '8px 14px', border: '1px solid var(--border)',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>
                  {card.label}
                </div>
                <div style={{ fontFamily: card.label === 'Project' || card.label === 'Status' ? 'var(--display)' : 'var(--mono)', fontWeight: 600, fontSize: 13, color: card.color || 'var(--text)' }}>
                  {card.value}
                </div>
              </div>
            ))}

            {/* Progress summary */}
            <div style={{
              background: 'var(--surface2)', borderRadius: 4,
              padding: '8px 14px', border: '1px solid var(--border)',
              marginLeft: 'auto',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>
                Progress
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                {done}/{total} steps
                {delayed > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>· {delayed} delayed</span>}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="tab-bar" style={{ marginBottom: 0, border: 'none' }}>
            <div className={`tab${detailTab === 'timeline'   ? ' active' : ''}`} onClick={() => setDetailTab('timeline')}>Process Timeline</div>
            <div className={`tab${detailTab === 'scheduling' ? ' active' : ''}`} onClick={() => setDetailTab('scheduling')}>Scheduling</div>
            {isWelding && (
              <div className={`tab${detailTab === 'children' ? ' active' : ''}`}
                onClick={() => setDetailTab('children')}
                style={{ color: detailTab === 'children' ? '#f97316' : undefined }}
              >
                ⚙ Child Parts
              </div>
            )}
            <div className={`tab${detailTab === 'edit'       ? ' active' : ''}`} onClick={() => setDetailTab('edit')}>Edit Part</div>
            <div className={`tab${detailTab === 'audit'      ? ' active' : ''}`} onClick={() => setDetailTab('audit')}>Audit History</div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>

          {detailTab === 'timeline' && (
            <>
              {pp.length === 0 && (
                <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                  No processes assigned to this part.
                </div>
              )}

              {/* Process cards — wrap on small screens */}
              <div key={refreshKey} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {pp.map((step) => (
                  <StepCard key={step.part_process_id} pp={step} partId={part.part_id} onRefresh={handleRefresh} vendors={vendors} />
                ))}
              </div>

              {/* Legend */}
              {pp.length > 0 && (
                <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
                  {[
                    { color: 'var(--green)',  label: 'Completed on time' },
                    { color: 'var(--red)',    label: 'Completed with delay' },
                    { color: '#3b82f6',       label: 'In Progress' },
                    { color: '#f59e0b',       label: 'QC Hold' },
                    { color: 'var(--border2)',label: 'Not Started' },
                  ].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {detailTab === 'audit' && (
            <AuditTab partId={part.part_id} />
          )}

          {detailTab === 'children' && isWelding && (
            <ChildPartsTab assemblyId={part.part_id} onBomChange={handleRefresh} />
          )}

          {detailTab === 'scheduling' && (
            <SchedulingTab part={part} onRefresh={handleRefresh} />
          )}

          {detailTab === 'edit' && (
            <EditPartTab part={part} onRefresh={handleRefresh} onClose={onClose} />
          )}
        </div>
      </div>

      {/* ── PDF Viewer overlay ── */}
      {pdfOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,.85)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12,
          }}
          onClick={() => setPdfOpen(false)}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#aaa' }}>
              {part.name} — Drawing
            </span>
            <a
              href={part.drawing_url}
              target="_blank"
              rel="noreferrer"
              style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}
              onClick={e => e.stopPropagation()}
            >
              ↗ Open in new tab
            </a>
            <button
              onClick={() => setPdfOpen(false)}
              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 18 }}
            >✕</button>
          </div>
          <iframe
            src={part.drawing_url}
            style={{ width: 'min(90vw, 900px)', height: '80vh', border: 'none', borderRadius: 4 }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default PartDetailModal;
