import { useState } from 'react';
import { updateProcessStatus, updateProcessVendorPo, advanceStep } from '../api/processes';
import { useLookups } from '../hooks/useLookups';

// Status options from part_status table
const PROCESS_STATUSES = [
  { code: 'IN_PRGS',       label: 'In Progress' },
  { code: 'CMPLT',         label: 'Completed' },
  { code: 'NOT_STARTED',   label: 'Not Started' },
  { code: 'QC',            label: 'QC' },
  { code: 'REJECTED',      label: 'Rejected' },
  { code: 'W_4_RM',        label: 'Waiting for RM' },
  { code: 'W_4_QUT',       label: 'Waiting for Quotation' },
  { code: 'PO_APPROVAL',   label: 'PO Approval' },
  { code: 'W_4_PARTS',     label: 'Waiting for Parts' },
  { code: 'W_F_PAYMENT',   label: 'Waiting for Payment' },
  { code: 'W_F_DECISION',  label: 'Waiting for Decision' },
  { code: 'M_SEND',        label: 'Material Sent' },
  { code: 'M_RCV',         label: 'Material Received' },
  { code: 'CANCELLED',     label: 'Cancelled' },
];

// ─────────────────────────────────────────────
// Mini modal used for Assign Vendor/PO and
// Change Status actions
// ─────────────────────────────────────────────

function ActionModal({ title, children, onClose }) {
  return (
    <div
      className="backdrop open"
      style={{ zIndex: 200 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-title" style={{ fontSize: 14 }}>{title}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main BulkActionBar
// Props:
//   selected   — Set of part IDs (string)
//   parts      — full parts array (to resolve part_id → processData)
//   onClear    — callback to deselect all
//   onDone     — callback to refetch after actions
// ─────────────────────────────────────────────

function BulkActionBar({ selected, parts, onClear, onDone }) {
  const count = selected.size;
  const { vendors } = useLookups();

  // Which modal is open: null | 'vendor' | 'status' | 'advance-confirm'
  const [activeModal, setActiveModal] = useState(null);

  // Vendor/PO form state
  const [vendor,   setVendor]   = useState('');
  const [poNumber, setPoNumber] = useState('');

  // Status change state
  const [newStatus, setNewStatus] = useState('');

  // Progress state
  const [running,  setRunning]  = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [toast,    setToast]    = useState(null);

  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function getSelectedParts() {
    return parts.filter(p => selected.has(p.id));
  }

  // ── Action: Advance Step ──────────────────

  async function doAdvanceStep() {
    setActiveModal(null);
    setRunning(true);
    const ids = getSelectedParts().map(p => p.part_id).filter(Boolean);
    setProgress({ done: 0, total: ids.length });
    try {
      await advanceStep(ids);
      setProgress({ done: ids.length, total: ids.length });
      showToast(`${ids.length} part${ids.length !== 1 ? 's' : ''} advanced to next step`);
      await onDone();
    } catch (e) {
      showToast(e.message, 'err');
    } finally {
      setRunning(false);
    }
  }

  // ── Action: Change Process Status ────────

  async function doChangeStatus() {
    if (!newStatus) return;
    setActiveModal(null);
    setRunning(true);
    const selectedParts = getSelectedParts();
    setProgress({ done: 0, total: selectedParts.length });

    let done = 0;
    for (const part of selectedParts) {
      // Target the current active process — anything that isn't CMPLT
      const INACTIVE = ['CMPLT'];
      const target = part.processData?.find(pp => !INACTIVE.includes(pp.status));

      if (target) {
        try {
          await updateProcessStatus(target.part_process_id, newStatus);
        } catch (e) {
          // continue on error
        }
      }
      done++;
      setProgress({ done, total: selectedParts.length });
    }

    showToast(`Status updated for ${done} part${done !== 1 ? 's' : ''}`);
    setNewStatus('');
    setRunning(false);
    await onDone();
  }

  // ── Action: Assign Vendor / PO ───────────
  // Applies to the active (non-CMPLT) process of each selected part.

  async function doAssignVendor() {
    if (!vendor.trim() && !poNumber.trim()) return;
    setActiveModal(null);
    setRunning(true);
    const selectedParts = getSelectedParts();
    setProgress({ done: 0, total: selectedParts.length });

    let done = 0;
    for (const part of selectedParts) {
      // Target the active process — first non-CMPLT, or last CMPLT if all done
      const active = part.processData?.find(pp => pp.status !== 'CMPLT')
        ?? part.processData?.[part.processData.length - 1];

      if (active?.part_process_id) {
        try {
          await updateProcessVendorPo(active.part_process_id, {
            ...(vendor.trim()   ? { vendor:    vendor.trim()   } : {}),
            ...(poNumber.trim() ? { po_number: poNumber.trim() } : {}),
          });
        } catch (e) {
          // continue on error
        }
      }
      done++;
      setProgress({ done, total: selectedParts.length });
    }

    showToast(`Vendor/PO assigned to ${done} part${done !== 1 ? 's' : ''}`);
    setVendor('');
    setPoNumber('');
    setRunning(false);
    await onDone();
  }

  const btnStyle = {
    background: 'transparent',
    border: '1px solid var(--border2)',
    borderRadius: 3,
    color: 'var(--text)',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    padding: '5px 12px',
    cursor: 'pointer',
    letterSpacing: '.05em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    transition: 'border-color .15s, color .15s',
  };

  return (
    <>
      <div className="bulk-edit-bar show" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

        {/* Count */}
        <span className="beb-count">{count} part{count !== 1 ? 's' : ''} selected</span>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'var(--border2)', margin: '0 4px' }} />

        {/* Advance Step */}
        <button
          style={btnStyle}
          disabled={running}
          onClick={() => setActiveModal('advance-confirm')}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        >
          ⟳ Advance Step
        </button>

        {/* Change Status */}
        <button
          style={btnStyle}
          disabled={running}
          onClick={() => setActiveModal('status')}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        >
          ✎ Change Status
        </button>

        {/* Assign Vendor / PO */}
        <button
          style={btnStyle}
          disabled={running}
          onClick={() => setActiveModal('vendor')}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border2)'}
        >
          ◎ Assign Vendor / PO
        </button>

        {/* Progress bar while running */}
        {running && (
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ height: 3, background: 'var(--border2)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(progress.done / progress.total) * 100}%`,
                background: 'var(--accent)',
                transition: 'width .2s',
              }} />
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              {progress.done} / {progress.total}
            </div>
          </div>
        )}

        {/* Deselect All — pushed right */}
        <button
          style={{ ...btnStyle, marginLeft: 'auto', color: 'var(--muted)', borderColor: 'transparent' }}
          onClick={onClear}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'transparent'; }}
        >
          ✕ Deselect All
        </button>
      </div>

      {/* ── Advance Step Confirm Modal ── */}
      {activeModal === 'advance-confirm' && (
        <ActionModal title="⟳ ADVANCE STEP" onClose={() => setActiveModal(null)}>
          <div className="modal-body">
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.7 }}>
              This will mark the <strong style={{ color: 'var(--text)' }}>current active process</strong> as{' '}
              <strong style={{ color: 'var(--green)' }}>COMPLETED</strong> for{' '}
              <strong style={{ color: 'var(--accent)' }}>{count} part{count !== 1 ? 's' : ''}</strong>,
              and automatically start the next step.
            </div>
            <div style={{
              background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
              borderRadius: 3, padding: '8px 12px',
              fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)',
            }}>
              ⚠ This cannot be undone in bulk. Parts with no active step will be skipped.
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setActiveModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={doAdvanceStep}>Confirm Advance</button>
          </div>
        </ActionModal>
      )}

      {/* ── Change Status Modal ── */}
      {activeModal === 'status' && (
        <ActionModal title="✎ CHANGE PROCESS STATUS" onClose={() => setActiveModal(null)}>
          <div className="modal-body">
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
              Sets the status of the <strong style={{ color: 'var(--text)' }}>current active process</strong> for{' '}
              <strong style={{ color: 'var(--accent)' }}>{count} selected part{count !== 1 ? 's' : ''}</strong>.
            </div>
            <div className="fgrp">
              <label>New Status</label>
              <select
                className="fi"
                value={newStatus}
                onChange={e => setNewStatus(e.target.value)}
              >
                <option value="">— Select status —</option>
                {PROCESS_STATUSES.map(s => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setActiveModal(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={doChangeStatus}
              disabled={!newStatus}
            >
              Apply to {count} Part{count !== 1 ? 's' : ''}
            </button>
          </div>
        </ActionModal>
      )}

      {/* ── Assign Vendor / PO Modal ── */}
      {activeModal === 'vendor' && (
        <ActionModal title="◎ ASSIGN VENDOR / PO" onClose={() => setActiveModal(null)}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
              Will be applied to <strong style={{ color: 'var(--accent)' }}>{count} selected part{count !== 1 ? 's' : ''}</strong>.
              Leave a field blank to keep existing value.
            </div>
            <div className="fgrp">
              <label>Vendor</label>
              <select
                className="fi"
                value={vendor}
                onChange={e => setVendor(e.target.value)}
              >
                <option value="">— Select vendor —</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.name}>{v.name}</option>
                ))}
              </select>
            </div>
            <div className="fgrp">
              <label>PO Number</label>
              <input
                className="fi"
                type="text"
                placeholder="e.g. PO-2025-0042"
                value={poNumber}
                onChange={e => setPoNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setActiveModal(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={doAssignVendor}
              disabled={!vendor.trim() && !poNumber.trim()}
            >
              Assign to {count} Part{count !== 1 ? 's' : ''}
            </button>
          </div>
        </ActionModal>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 22, right: 22, zIndex: 300,
          background: toast.type === 'err' ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.15)',
          border: `1px solid ${toast.type === 'err' ? 'rgba(239,68,68,.4)' : 'rgba(34,197,94,.4)'}`,
          color: toast.type === 'err' ? 'var(--red)' : 'var(--green)',
          padding: '10px 16px', borderRadius: 4,
          fontFamily: 'var(--mono)', fontSize: 12,
        }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}

export default BulkActionBar;
