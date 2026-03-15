import { useState, useEffect, useRef } from 'react';
import { useLookups } from '../hooks/useLookups';
import { useCreatePart } from '../hooks/useCreatePart';
import { createPart } from '../api/parts';
import { getAsanaPrefill, getAsanaToken, saveAsanaToken } from '../api/asana';
import { getProcesses } from '../api/lookups';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function syncDrawings(taskId, asanaToken, partIds) {
  const jwt = localStorage.getItem('mfg_token') || '';
  const res = await fetch(`${API}/asana/sync-drawings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ task_id: taskId, token: asanaToken, part_ids: partIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Drawing sync failed (${res.status})`);
  }
  return res.json();
}

// ─────────────────────────────────────────────
// Process Picker sub-component
// Renders a checkbox list of all processes,
// numbered in selection order
// ─────────────────────────────────────────────

function ProcessPicker({ processes, selected, onChange }) {
  function toggle(proc) {
    const exists = selected.find(s => s.id === proc.id);
    if (exists) {
      onChange(selected.filter(s => s.id !== proc.id));
    } else {
      onChange([...selected, proc]);
    }
  }

  return (
    <div>
      {processes.map(proc => {
        const idx = selected.findIndex(s => s.id === proc.id);
        const isSelected = idx !== -1;
        return (
          <div key={proc.id} className="ppopt" onClick={() => toggle(proc)}>
            <input type="checkbox" checked={isSelected} onChange={() => {}} />
            <span className="ppord">{isSelected ? idx + 1 : ''}</span>
            <span style={{ flex: 1 }}>{proc.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>
              {proc.default_days}d
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Empty single-part form state
// ─────────────────────────────────────────────

function emptyForm() {
  return {
    name: '',
    project_id: '',
    quantity: 1,
    material_type_id: '',
    material_grade_id: '',
    asana_ref: '',
    material_cost_per_kg: '',
    selectedProcesses: [],   // array of { id, name, default_days }
  };
}

// ─────────────────────────────────────────────
// Empty bulk row
// ─────────────────────────────────────────────

function emptyRow(id) {
  return {
    _id: id,
    name: '',
    project_id: '',
    quantity: 1,
    material_type_id: '',
    material_grade_id: '',
    asana_ref: '',
    material_cost_per_kg: '',
    selectedProcesses: [],
  };
}

// ─────────────────────────────────────────────
// Main Modal Component
// ─────────────────────────────────────────────

function NewPartModal({ open, initialTab = 'single', onClose, onSuccess }) {
  const { projects, materialTypes, materialGrades, processes, refetch } = useLookups();
  const { submit, loading, error } = useCreatePart({ onSuccess });

  const [tab, setTab]   = useState(initialTab);
  const [form, setForm] = useState(emptyForm());

  // Refresh lookups every time modal opens so newly added projects/processes appear
  useEffect(() => { if (open) refetch(); }, [open]);

  // Asana import state
  const [asanaToken,     setAsanaToken]     = useState(getAsanaToken);
  const [asanaTaskId,    setAsanaTaskId]    = useState('');
  const [asanaFetching,  setAsanaFetching]  = useState(false);
  const [asanaError,     setAsanaError]     = useState('');
  const [asanaFilled,    setAsanaFilled]    = useState(false); // true after successful prefill

  // Bulk rows
  const [rows, setRows]       = useState([emptyRow(1), emptyRow(2), emptyRow(3)]);
  const [nextId, setNextId]   = useState(4);

  // Process picker state (shared for single + bulk)
  const [ppOpen, setPpOpen]         = useState(false);
  const [ppTarget, setPpTarget]     = useState(null);
  const [ppSelected, setPpSelected] = useState([]);

  // Toast state
  const [toast, setToast] = useState(null);

  useEffect(() => { setTab(initialTab); }, [initialTab]);

  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Asana prefill ────────────────────────────

  // Resolve process sequence from grade + post_process
  // processes passed explicitly to avoid stale closure issues
  function resolveProcesses(gradeName, postProcess, procList) {
    const list  = procList || processes;
    const grade = (gradeName || '').toUpperCase();
    const pp    = (postProcess || '').toUpperCase().replace(/\s/g, '');

    let names = [];
    if (grade.includes('PLT')) {
      names = ['Raw Material Check', 'Laser Cutting'];
      if (pp === 'M,W')                      names.push('Drilling');
      else if (pp === 'M,G' || pp === 'M,O') names.push('Drilling', 'Deburring', 'Powder Coating');
      else if (pp === 'G'   || pp === 'O')   names.push('Deburring', 'Powder Coating');
    } else if (grade.includes('RBAR') || grade.includes('SBAR')) {
      names = ['Raw Material Check', 'Cutting', 'JW_Machining', 'Deburring'];
      if (pp === 'EP')                       names.push('Electroplating');
      else if (pp === 'W')                   names.push('Welding');
      else if (pp === 'G' || pp === 'O')     names.push('Powder Coating');
    }

    return names
      .map(n => list.find(p => p.name.toUpperCase() === n.toUpperCase()))
      .filter(Boolean);
  }

  async function fetchFromAsana() {
    if (!asanaTaskId.trim()) return setAsanaError('Enter a Task ID');
    if (!asanaToken.trim())  return setAsanaError('No Asana token — go to ⚙ Settings');
    setAsanaError('');
    setAsanaFetching(true);
    try {
      saveAsanaToken(asanaToken.trim());
      // Fetch processes fresh in parallel with the Asana call — avoids stale closure
      const [data, freshProcesses] = await Promise.all([
        getAsanaPrefill(asanaTaskId.trim(), asanaToken.trim()),
        getProcesses(),
      ]);
      // API now always returns an array
      const parts = Array.isArray(data) ? data : [data];

      if (parts.length === 1) {
        // Single part — fill the single form
        const p = parts[0];
        const suggested = resolveProcesses(p.grade_name, p.post_process, freshProcesses);
        setForm(f => ({
          ...f,
          name:               p.part_name   || f.name,
          quantity:           p.qty         || f.quantity,
          material_type_id:   p.material_type_id  || f.material_type_id,
          material_grade_id:  p.material_grade_id || f.material_grade_id,
          asana_ref:          asanaTaskId.trim(),
          selectedProcesses:  suggested.length ? suggested : (p.suggested_processes || []),
        }));
        setAsanaFilled(true);
        const procMsg = suggested.length ? ` · ${suggested.length} processes auto-set` : '';
        showToast(`Imported: ${p.part_name} · Qty ${p.qty} · ${p.material_name||'—'} / ${p.grade_name||'—'}${procMsg}`);
      } else {
        // Multiple parts — switch to Bulk tab and populate rows
        let id = 1;
        const newRows = parts.map(p => {
          const suggested = resolveProcesses(p.grade_name, p.post_process, freshProcesses);
          return {
            _id:               id++,
            name:              p.part_name || '',
            project_id:        '',
            quantity:          p.qty || 1,
            material_type_id:  p.material_type_id  || '',
            material_grade_id: p.material_grade_id || '',
            asana_ref:         p.asana_ref || String(asanaTaskId.trim()),
            rate:              p.rate ?? null,
            material_cost_per_kg: '',
            selectedProcesses: suggested.length ? suggested : (p.suggested_processes || []),
          };
        });
        setRows(newRows);
        setNextId(id);
        setTab('bulk');
        setAsanaFilled(true);
        const autoCount = newRows.filter(r => r.selectedProcesses.length > 0).length;
        showToast(`Imported ${parts.length} parts · ${autoCount} with processes auto-set — assign project then create`);
      }
    } catch (e) {
      setAsanaError(e.message);
    } finally {
      setAsanaFetching(false);
    }
  }

  function clearAsana() {
    setAsanaTaskId('');
    setAsanaFilled(false);
    setAsanaError('');
    setForm(emptyForm());
  }

  // ── Single form helpers ──────────────────────

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function openPPSingle() {
    setPpTarget('single');
    setPpSelected(form.selectedProcesses);
    setPpOpen(true);
  }

  function openPPRow(rowId) {
    const row = rows.find(r => r._id === rowId);
    setPpTarget(rowId);
    setPpSelected(row?.selectedProcesses || []);
    setPpOpen(true);
  }

  function confirmPP() {
    if (ppTarget === 'single') {
      setForm(f => ({ ...f, selectedProcesses: ppSelected }));
    } else if (ppTarget === 'all-rows') {
      // Apply selected processes to every bulk row
      setRows(rs => rs.map(r => ({ ...r, selectedProcesses: ppSelected })));
    } else {
      setRows(rs => rs.map(r => r._id === ppTarget
        ? { ...r, selectedProcesses: ppSelected }
        : r
      ));
    }
    setPpOpen(false);
  }

  // ── Submit single ────────────────────────────

  async function submitSingle() {
    if (!form.name.trim())             return showToast('Part name is required', 'err');
    if (!form.project_id)              return showToast('Select a project', 'err');
    if (form.selectedProcesses.length === 0) return showToast('Add at least one process', 'err');

    try {
      await submit({
        name:                 form.name.trim(),
        project_id:           form.project_id,
        quantity:             Number(form.quantity),
        material_type_id:     form.material_type_id  || null,
        material_grade_id:    form.material_grade_id || null,
        asana_ref:            form.asana_ref ? String(form.asana_ref) : null,
        material_cost_per_kg: form.material_cost_per_kg ? Number(form.material_cost_per_kg) : null,
        process_ids:          form.selectedProcesses.map(p => p.id),
      });
      showToast('Part created!');
      setForm(emptyForm());
      onClose();
    } catch (e) {
      showToast(e.message, 'err');
    }
  }

  // ── Bulk row helpers ─────────────────────────

  function updateRow(id, key, val) {
    setRows(rs => rs.map(r => r._id === id ? { ...r, [key]: val } : r));
  }

  function addRows(n = 1) {
    const newRows = [];
    let id = nextId;
    for (let i = 0; i < n; i++) newRows.push(emptyRow(id++));
    setRows(rs => [...rs, ...newRows]);
    setNextId(id);
  }

  function deleteRow(id) {
    setRows(rs => rs.filter(r => r._id !== id));
  }

  // ── Submit bulk ──────────────────────────────

  const [bulkLoading,   setBulkLoading]   = useState(false);
  const [bulkErrors,    setBulkErrors]    = useState([]);
  const [drawingSync,   setDrawingSync]   = useState(null); // { syncing, results }

  async function submitBulk() {
    const valid = rows.filter(r => r.name.trim() && r.selectedProcesses.length > 0);
    if (valid.length === 0) return showToast('Add at least one row with a name and processes', 'err');

    setBulkLoading(true);
    setBulkErrors([]);
    setDrawingSync(null);
    let created = 0;
    const errs = [];
    const createdPartIds = [];

    for (const row of valid) {
      try {
        const result = await createPart({
          name:                 row.name.trim(),
          project_id:           row.project_id        || null,
          quantity:             Number(row.quantity)  || 1,
          material_type_id:     row.material_type_id  || null,
          material_grade_id:    row.material_grade_id || null,
          asana_ref:            row.asana_ref ? String(row.asana_ref) : null,
          material_cost_per_kg: row.material_cost_per_kg ? Number(row.material_cost_per_kg) : null,
          process_ids:          row.selectedProcesses.map(p => p.id),
        });
        createdPartIds.push(result.part_id);
        created++;
      } catch (e) {
        errs.push(`"${row.name}": ${e.message}`);
      }
    }

    setBulkLoading(false);
    setBulkErrors(errs);

    if (created > 0) {
      showToast(`${created} part${created > 1 ? 's' : ''} created!`);

      // ── Auto-sync drawings from Asana if we have a task ID and token ──
      if (asanaTaskId.trim() && asanaToken && createdPartIds.length > 0) {
        setDrawingSync({ syncing: true, results: [] });
        try {
          const syncResults = await syncDrawings(
            asanaTaskId.trim(),
            asanaToken,
            createdPartIds
          );
          setDrawingSync({ syncing: false, results: syncResults });
        } catch (e) {
          setDrawingSync({ syncing: false, results: [], error: e.message });
        }
      }

      if (errs.length === 0) {
        // Small delay so user can see drawing sync results before close
        setTimeout(() => {
          setRows([emptyRow(1), emptyRow(2), emptyRow(3)]);
          setNextId(4);
          setDrawingSync(null);
          onSuccess?.();
        }, drawingSync || asanaTaskId.trim() ? 2500 : 0);
      }
    } else {
      showToast('All rows failed — check errors below', 'err');
    }
  }

  if (!open) return null;

  const selectStyle = {
    background: 'var(--surface2)', border: '1px solid var(--border2)',
    borderRadius: 3, padding: '8px 11px', color: 'var(--text)',
    fontFamily: 'var(--body)', fontSize: 13, outline: 'none', width: '100%',
  };
  const inputStyle = { ...selectStyle };
  const smallSelectStyle = {
    width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 3, padding: '5px 7px', color: 'var(--text)',
    fontFamily: 'var(--body)', fontSize: 12, outline: 'none',
  };

  return (
    <>
      {/* ── Backdrop ── */}
      <div className="backdrop open" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal modal-wide" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="modal-hdr">
            <div>
              <div className="modal-title">{tab === 'single' ? 'NEW PART' : 'BULK CREATE'}</div>
              <div className="tab-bar" style={{ marginBottom: 0, marginTop: 8, border: 'none' }}>
                <div className={`tab${tab === 'single' ? ' active' : ''}`} onClick={() => setTab('single')}>
                  Single Part
                </div>
                <div className={`tab${tab === 'bulk' ? ' active' : ''}`} onClick={() => setTab('bulk')}>
                  ⊞ Bulk Create
                </div>
              </div>
            </div>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          {/* ── SINGLE PANE ── */}
          {tab === 'single' && (
            <div className="modal-body">
              {/* ── Asana Import Panel ── */}
          <div style={{
            background: 'rgba(255,140,0,.07)', border: '1px solid rgba(255,140,0,.25)',
            borderRadius: 4, padding: '12px 14px', marginBottom: 16,
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
              ⚡ Import from Asana
            </div>

            {/* Task ID row */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="fi"
                type="text"
                placeholder="Task ID  e.g. 1209650123456789"
                value={asanaTaskId}
                onChange={e => { setAsanaTaskId(e.target.value); setAsanaFilled(false); setAsanaError(''); }}
                style={{ flex: 1, fontSize: 12 }}
                onKeyDown={e => e.key === 'Enter' && fetchFromAsana()}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={fetchFromAsana}
                disabled={asanaFetching}
                style={{ whiteSpace: 'nowrap', minWidth: 90 }}
              >
                {asanaFetching ? 'Fetching…' : asanaFilled ? '✓ Re-fetch' : '↓ Fetch'}
              </button>
              {asanaFilled && (
                <button className="btn btn-ghost btn-sm" onClick={clearAsana}>Clear</button>
              )}
            </div>

            {!asanaToken && (
              <div style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 6 }}>
                ⚠ No Asana token saved — go to ⚙ Settings to add one
              </div>
            )}
            {asanaError && (
              <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 11, marginTop: 6 }}>
                ⚠ {asanaError}
              </div>
            )}
            {asanaFilled && (
              <div style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 11, marginTop: 6 }}>
                ✓ Fields populated — review and adjust below if needed
              </div>
            )}
          </div>

          <div className="form-grid" style={{ marginBottom: 14 }}>

                {/* Part Name — full width */}
                <div className="fgrp" style={{ gridColumn: '1 / -1' }}>
                  <label>Part Name *</label>
                  <input className="fi" type="text" placeholder="e.g. Shaft Assembly - Main Drive"
                    value={form.name} onChange={e => setField('name', e.target.value)} />
                </div>

                {/* Project */}
                <div className="fgrp">
                  <label>Project *</label>
                  <select className="fi" value={form.project_id} onChange={e => setField('project_id', e.target.value)}>
                    <option value="">— Select project —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {/* Quantity */}
                <div className="fgrp">
                  <label>Quantity</label>
                  <input className="fi" type="number" min="1" value={form.quantity}
                    onChange={e => setField('quantity', e.target.value)} />
                </div>

                {/* Material Type */}
                <div className="fgrp">
                  <label>Material Type</label>
                  <select className="fi" value={form.material_type_id} onChange={e => setField('material_type_id', e.target.value)}>
                    <option value="">— Select —</option>
                    {materialTypes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>

                {/* Material Grade */}
                <div className="fgrp">
                  <label>Material Grade</label>
                  <select className="fi" value={form.material_grade_id} onChange={e => setField('material_grade_id', e.target.value)}>
                    <option value="">— Select —</option>
                    {materialGrades.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>

                {/* Material Cost */}
                <div className="fgrp">
                  <label>Material Cost/kg (₹)</label>
                  <input className="fi" type="number" min="0" step="0.01" placeholder="e.g. 85.00"
                    value={form.material_cost_per_kg} onChange={e => setField('material_cost_per_kg', e.target.value)} />
                </div>

                {/* Asana Ref */}
                <div className="fgrp" style={{ gridColumn: '1 / -1' }}>
                  <label>Asana Task ID</label>
                  <input className="fi" type="text" placeholder="e.g. 1234567890123456"
                    value={form.asana_ref} onChange={e => setField('asana_ref', e.target.value)} />
                </div>
              </div>

              {/* Process Sequence */}
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                Process Sequence *
              </div>

              {form.selectedProcesses.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  {form.selectedProcesses.map((proc, i) => (
                    <div key={proc.id} className="proc-row">
                      <span className="proc-num">{i + 1}</span>
                      <span style={{ flex: 1, fontSize: 13 }}>{proc.name}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{proc.default_days}d</span>
                      <button className="proc-rm" onClick={() =>
                        setForm(f => ({ ...f, selectedProcesses: f.selectedProcesses.filter(p => p.id !== proc.id) }))
                      }>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="add-proc-btn" onClick={openPPSingle}>
                + Add Process Step
              </div>

              {error && (
                <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 11, marginTop: 10 }}>
                  ⚠ {error}
                </div>
              )}

              <div className="modal-foot" style={{ padding: 0, border: 'none', marginTop: 14 }}>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={submitSingle} disabled={loading}>
                  {loading ? 'Creating…' : 'Create Part'}
                </button>
              </div>
            </div>
          )}

          {/* ── BULK PANE ── */}
          {tab === 'bulk' && (
            <div className="modal-body">

              {/* Asana import in bulk tab */}
              <div style={{
                background: 'rgba(255,140,0,.07)', border: '1px solid rgba(255,140,0,.25)',
                borderRadius: 4, padding: '10px 14px', marginBottom: 14,
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                  ⚡ Import from Asana
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="fi" type="text" placeholder="Task ID"
                    value={asanaTaskId}
                    onChange={e => { setAsanaTaskId(e.target.value); setAsanaFilled(false); setAsanaError(''); }}
                    style={{ flex: 1, fontSize: 12 }}
                    onKeyDown={e => e.key === 'Enter' && fetchFromAsana()}
                  />
                  <button className="btn btn-primary btn-sm" onClick={fetchFromAsana} disabled={asanaFetching} style={{ whiteSpace: 'nowrap' }}>
                    {asanaFetching ? 'Fetching…' : '↓ Fetch'}
                  </button>
                </div>
                {!asanaToken && <div style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 6 }}>⚠ No token — go to ⚙ Settings</div>}
                {asanaError  && <div style={{ color: 'var(--red)',    fontFamily: 'var(--mono)', fontSize: 11, marginTop: 6 }}>⚠ {asanaError}</div>}
                {asanaFilled && <div style={{ color: 'var(--green)',  fontFamily: 'var(--mono)', fontSize: 11, marginTop: 6 }}>✓ Rows populated from Asana — assign project & processes below</div>}
              </div>

              <div className="note" style={{ marginBottom: 12 }}>
                ⊞ Add multiple parts. Click <strong>Processes</strong> cell to assign per row, or use <strong>Apply to All</strong> below.
              </div>

              {/* ── Apply to All Rows ── */}
              <div style={{
                background: 'rgba(255,140,0,.07)', border: '1px solid rgba(255,140,0,.2)',
                borderRadius: 4, padding: '10px 14px', marginBottom: 12,
                display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', width: '100%', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  ⚡ Apply to all rows
                </div>
                {/* Project — always shown */}
                <div className="fgrp" style={{ margin: 0, flex: 2, minWidth: 140 }}>
                  <label>Project *</label>
                  <select className="fi" style={{ fontSize: 12 }}
                    onChange={e => {
                      const v = e.target.value;
                      setRows(rs => rs.map(r => ({ ...r, project_id: v })));
                    }}
                  >
                    <option value="">— Select project —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                {/* Mat Type */}
                <div className="fgrp" style={{ margin: 0, flex: 1, minWidth: 100 }}>
                  <label>Mat. Type</label>
                  <select className="fi" style={{ fontSize: 12 }}
                    onChange={e => {
                      const v = e.target.value;
                      setRows(rs => rs.map(r => ({ ...r, material_type_id: v })));
                    }}
                  >
                    <option value="">—</option>
                    {materialTypes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                {/* Mat Grade */}
                <div className="fgrp" style={{ margin: 0, flex: 1, minWidth: 110 }}>
                  <label>Mat. Grade</label>
                  <select className="fi" style={{ fontSize: 12 }}
                    onChange={e => {
                      const v = e.target.value;
                      setRows(rs => rs.map(r => ({ ...r, material_grade_id: v })));
                    }}
                  >
                    <option value="">—</option>
                    {materialGrades.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                {/* Asana ID */}
                <div className="fgrp" style={{ margin: 0, flex: 1, minWidth: 90 }}>
                  <label>Asana ID</label>
                  <input
                    className="fi"
                    type="text"
                    placeholder="e.g. 1"
                    style={{ fontSize: 12 }}
                    onChange={e => {
                      const v = e.target.value;
                      setRows(rs => rs.map(r => ({ ...r, asana_ref: v })));
                    }}
                  />
                </div>
                {/* Mat Cost/kg */}
                <div className="fgrp" style={{ margin: 0, flex: 1, minWidth: 90 }}>
                  <label>Mat. Cost/kg (₹)</label>
                  <input
                    className="fi"
                    type="number" min="0" step="0.01"
                    placeholder="e.g. 85"
                    style={{ fontSize: 12 }}
                    onChange={e => {
                      const v = e.target.value;
                      setRows(rs => rs.map(r => ({ ...r, material_cost_per_kg: v })));
                    }}
                  />
                </div>
                {/* Processes — always shown */}
                <div className="fgrp" style={{ margin: 0, flex: 2, minWidth: 160 }}>
                  <label>Process Sequence *</label>
                  <button
                    className="fi"
                    style={{ textAlign: 'left', cursor: 'pointer', fontSize: 12, background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--muted)' }}
                    onClick={() => {
                      setPpTarget('all-rows');
                      setPpSelected([]);
                      setPpOpen(true);
                    }}
                  >
                    Click to select processes…
                  </button>
                </div>
              </div>

              <div className="bulk-wrap">
                <table className="bulk-tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 24 }}>#</th>
                      <th style={{ minWidth: 150 }}>Part Name *</th>
                      <th style={{ width: 50 }}>Qty</th>
                      {asanaFilled && <th style={{ width: 80 }}>Rate (₹)</th>}
                      {!asanaFilled && <th style={{ width: 120 }}>Project</th>}
                      {!asanaFilled && <th style={{ width: 100 }}>Mat. Type</th>}
                      {!asanaFilled && <th style={{ width: 100 }}>Mat. Grade</th>}
                      {!asanaFilled && <th style={{ width: 100 }}>Mat. ₹/kg</th>}
                      {!asanaFilled && <th style={{ width: 120 }}>Asana ID</th>}
                      <th style={{ minWidth: 160 }}>Processes *</th>
                      <th style={{ width: 26 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={row._id}>
                        <td className="rnum">{idx + 1}</td>
                        <td>
                          <input className="bi" type="text" placeholder="Part name"
                            value={row.name} onChange={e => updateRow(row._id, 'name', e.target.value)} />
                        </td>
                        <td>
                          <input className="bi" type="number" min="1" value={row.quantity}
                            onChange={e => updateRow(row._id, 'quantity', e.target.value)}
                            style={{ width: 46 }} />
                        </td>
                        {asanaFilled && (
                          <td>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)', padding: '0 4px' }}>
                              {row.rate != null && row.rate !== '' ? `₹${row.rate}` : '—'}
                            </span>
                          </td>
                        )}
                        {!asanaFilled && (
                          <td>
                            <select className="bs" value={row.project_id} onChange={e => updateRow(row._id, 'project_id', e.target.value)}>
                              <option value="">—</option>
                              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                        )}
                        {!asanaFilled && (
                          <td>
                            <select className="bs" value={row.material_type_id} onChange={e => updateRow(row._id, 'material_type_id', e.target.value)}>
                              <option value="">—</option>
                              {materialTypes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                          </td>
                        )}
                        {!asanaFilled && (
                          <td>
                            <select className="bs" value={row.material_grade_id} onChange={e => updateRow(row._id, 'material_grade_id', e.target.value)}>
                              <option value="">—</option>
                              {materialGrades.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                          </td>
                        )}
                        {!asanaFilled && (
                          <td>
                            <input className="bi" type="number" min="0" step="0.01" placeholder="₹/kg"
                              value={row.material_cost_per_kg} onChange={e => updateRow(row._id, 'material_cost_per_kg', e.target.value)}
                              style={{ width: 80 }} />
                          </td>
                        )}
                        {!asanaFilled && (
                          <td>
                            <input className="bi" type="text" placeholder="Asana ID"
                              value={row.asana_ref} onChange={e => updateRow(row._id, 'asana_ref', e.target.value)} />
                          </td>
                        )}
                        <td>
                          <div className="proc-tags-cell" onClick={() => openPPRow(row._id)}>
                            {row.selectedProcesses.length === 0
                              ? <span className="ptag-ph">Click to add…</span>
                              : row.selectedProcesses.map((p, i) => (
                                  <span key={p.id} className="ptag">{i + 1}. {p.name}</span>
                                ))
                            }
                          </div>
                        </td>
                        <td>
                          <button className="rdel" onClick={() => deleteRow(row._id)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <div className="add-proc-btn" onClick={() => addRows(1)}>+ Add Row</div>
                <div className="add-proc-btn" onClick={() => addRows(5)}>+ Add 5 Rows</div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
                  {rows.length} row{rows.length !== 1 ? 's' : ''}
                </span>
              </div>

              {error && (
                <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 11, marginTop: 10 }}>
                  ⚠ {error}
                </div>
              )}

              {/* Per-row errors */}
              {bulkErrors.length > 0 && (
                <div style={{
                  background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
                  borderRadius: 4, padding: '8px 12px', marginTop: 8,
                  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)',
                }}>
                  {bulkErrors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                </div>
              )}

              {/* Drawing sync status */}
              {drawingSync && (
                <div style={{
                  background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.2)',
                  borderRadius: 4, padding: '10px 14px', marginTop: 8,
                  fontFamily: 'var(--mono)', fontSize: 11,
                }}>
                  {drawingSync.syncing ? (
                    <div style={{ color: '#60a5fa' }}>⟳ Syncing drawings from Asana…</div>
                  ) : (
                    <>
                      <div style={{ color: '#60a5fa', marginBottom: 6, fontWeight: 600 }}>
                        📎 Drawing sync complete
                      </div>
                      {drawingSync.error && (
                        <div style={{ color: 'var(--red)' }}>⚠ {drawingSync.error}</div>
                      )}
                      {drawingSync.results.map((r, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ color: r.status === 'ok' ? 'var(--green)' : r.status === 'no_pdf' ? 'var(--muted)' : 'var(--red)' }}>
                            {r.status === 'ok' ? '✓' : r.status === 'no_pdf' ? '—' : '⚠'}
                          </span>
                          <span style={{ color: 'var(--text)' }}>{r.part_name}</span>
                          <span style={{ color: 'var(--muted)' }}>·</span>
                          {r.status === 'ok' && <span style={{ color: 'var(--muted)' }}>{r.filename}</span>}
                          {r.status === 'ok' && r.weight_extracted && (
                            <span style={{ color: 'var(--accent)', fontSize: 10 }}>⚖ {r.weight_kg} kg</span>
                          )}
                          {r.status === 'ok' && !r.weight_extracted && (
                            <span style={{ color: 'var(--muted)', fontSize: 10 }}>no weight found</span>
                          )}
                          {r.status === 'no_pdf' && <span style={{ color: 'var(--muted)', fontSize: 10 }}>no PDF found in task</span>}
                          {r.status !== 'ok' && r.status !== 'no_pdf' && (
                            <span style={{ color: 'var(--red)', fontSize: 10 }}>{r.error || r.status}</span>
                          )}
                        </div>
                      ))}
                      {drawingSync.results.length === 0 && !drawingSync.error && (
                        <div style={{ color: 'var(--muted)' }}>No PDF attachments found on this task.</div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="modal-foot" style={{ padding: 0, border: 'none', marginTop: 14 }}>
                <button className="btn btn-ghost" onClick={() => { setRows([emptyRow(1), emptyRow(2), emptyRow(3)]); setNextId(4); setBulkErrors([]); }}>
                  Clear All
                </button>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={submitBulk} disabled={bulkLoading}>
                  {bulkLoading ? 'Creating…' : 'Create Parts'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Process Picker Modal ── */}
      {ppOpen && (
        <div className="backdrop open" style={{ zIndex: 150 }}>
          <div className="modal" style={{ width: 360 }}>
            <div className="modal-hdr">
              <div className="modal-title" style={{ fontSize: 16 }}>Select Processes</div>
              <button className="modal-close" onClick={() => setPpOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>
                Select in order — numbered automatically.
              </div>
              <ProcessPicker
                processes={processes}
                selected={ppSelected}
                onChange={setPpSelected}
              />
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setPpOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmPP}>
                Confirm ({ppSelected.length} selected)
              </button>
            </div>
          </div>
        </div>
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

export default NewPartModal;
