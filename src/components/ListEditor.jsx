import { useState, useEffect } from 'react';
import {
  getMaterialTypes, createMaterialType, deleteMaterialType,
  getMaterialGrades, createMaterialGrade, deleteMaterialGrade,
  getProcesses, createProcess, updateProcess, deleteProcess,
  getVendors, createVendor, deleteVendor,
} from '../api/lookups';
import { api } from '../api/client';

// ─────────────────────────────────────────────
// Generic editable list card
// ─────────────────────────────────────────────

function ListCard({ title, description, items, onAdd, onDelete, extraField }) {
  const [input,  setInput]  = useState('');
  const [extra,  setExtra]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleAdd() {
    if (!input.trim()) return;
    setSaving(true); setError('');
    try {
      const extraVal = extra
        ? (extraField === 'description' ? extra : Number(extra))
        : undefined;
      await onAdd(input.trim(), extraVal);
      setInput(''); setExtra('');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Remove "${item.name}"?`)) return;
    try {
      await onDelete(item.id);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 3 }}>{title}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{description}</div>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 3 }}>
          {items.length} items
        </span>
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, minHeight: 32 }}>
        {items.length === 0 && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>No items yet</span>
        )}
        {items.map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--surface2)', border: '1px solid var(--border2)',
            borderRadius: 3, padding: '3px 8px',
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
          }}>
            {item.name}
            {item.default_days !== undefined && (
              <span style={{ color: 'var(--muted)', fontSize: 10 }}> · {item.default_days}d</span>
            )}
          </div>
        ))}
      </div>

      {/* Add row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="fi"
          type="text"
          placeholder={`Add ${title.toLowerCase().replace(/s$/, '')}…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{ flex: 1, fontSize: 12 }}
        />
        {extraField && (
          <input
            className="fi"
            type={extraField === 'description' ? 'text' : 'number'}
            placeholder={extraField === 'description' ? 'Description (optional)' : 'Days'}
            value={extra}
            onChange={e => setExtra(e.target.value)}
            style={{ width: extraField === 'description' ? 180 : 70, fontSize: 12 }}
          />
        )}
        <button
          className="btn btn-primary btn-sm"
          onClick={handleAdd}
          disabled={saving || !input.trim()}
          style={{ whiteSpace: 'nowrap' }}
        >
          {saving ? '…' : '+ Add'}
        </button>
      </div>

      {error && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', marginTop: 6 }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main List Editor page
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Process-specific list card with cost_per_kg editing
// ─────────────────────────────────────────────

function ProcessListCard({ processes, onAdd, onUpdate, onDelete }) {
  const [newName,    setNewName]    = useState('');
  const [newDays,    setNewDays]    = useState('1');
  const [newCost,    setNewCost]    = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  // editing state: { [processId]: { days, cost } }
  const [editing,    setEditing]    = useState({});
  const [editSaving, setEditSaving] = useState({});
  const [editSaved,  setEditSaved]  = useState({});

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true); setError('');
    try {
      await onAdd(newName.trim(), Number(newDays) || 1, newCost !== '' ? Number(newCost) : null);
      setNewName(''); setNewDays('1'); setNewCost('');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  function startEdit(p) {
    setEditing(e => ({ ...e, [p.id]: { days: String(p.default_days), cost: p.cost_per_kg != null ? String(p.cost_per_kg) : '' } }));
  }

  async function saveEdit(p) {
    const vals = editing[p.id];
    if (!vals) return;
    setEditSaving(s => ({ ...s, [p.id]: true }));
    try {
      await onUpdate(p.id, p.name, Number(vals.days) || 1, vals.cost !== '' ? Number(vals.cost) : null);
      setEditing(e => { const n = { ...e }; delete n[p.id]; return n; });
      setEditSaved(s => ({ ...s, [p.id]: true }));
      setTimeout(() => setEditSaved(s => { const n = { ...s }; delete n[p.id]; return n; }), 2000);
    } catch (e) { setError(e.message); }
    finally { setEditSaving(s => ({ ...s, [p.id]: false })); }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 3 }}>Processes</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>Configure process steps and costing rates</div>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 3 }}>
          {processes.length} items
        </span>
      </div>

      {/* Process rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {processes.length === 0 && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>No processes yet</span>
        )}
        {processes.map(p => {
          const isEditing = !!editing[p.id];
          const vals = editing[p.id] || {};
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--surface2)', border: '1px solid var(--border2)',
              borderRadius: 4, padding: '6px 10px',
              fontFamily: 'var(--mono)', fontSize: 11,
            }}>
              <span style={{ flex: 1, color: 'var(--text)' }}>{p.name}</span>
              {isEditing ? (
                <>
                  <input
                    type="number" min={1}
                    value={vals.days}
                    onChange={e => setEditing(ed => ({ ...ed, [p.id]: { ...ed[p.id], days: e.target.value } }))}
                    style={{ width: 46, fontSize: 11, padding: '2px 5px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 3, color: 'var(--text)', fontFamily: 'var(--mono)' }}
                    title="Days"
                  />
                  <span style={{ color: 'var(--muted)' }}>d</span>
                  <input
                    type="number" min={0} step="0.01"
                    placeholder="₹/kg"
                    value={vals.cost}
                    onChange={e => setEditing(ed => ({ ...ed, [p.id]: { ...ed[p.id], cost: e.target.value } }))}
                    style={{ width: 70, fontSize: 11, padding: '2px 5px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 3, color: 'var(--text)', fontFamily: 'var(--mono)' }}
                    title="Cost per kg (₹)"
                  />
                  <button
                    onClick={() => saveEdit(p)}
                    disabled={editSaving[p.id]}
                    style={{ fontSize: 10, padding: '2px 7px', background: 'transparent', border: '1px solid var(--accent)', borderRadius: 3, color: editSaved[p.id] ? 'var(--green)' : 'var(--accent)', cursor: 'pointer' }}
                  >
                    {editSaving[p.id] ? '…' : editSaved[p.id] ? '✓' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditing(e => { const n = { ...e }; delete n[p.id]; return n; })}
                    style={{ fontSize: 10, padding: '2px 7px', background: 'transparent', border: '1px solid var(--border2)', borderRadius: 3, color: 'var(--muted)', cursor: 'pointer' }}
                  >✕</button>
                </>
              ) : (
                <>
                  <span style={{ color: 'var(--muted)', fontSize: 10 }}>{p.default_days}d</span>
                  <span style={{ color: p.cost_per_kg != null ? 'var(--accent)' : 'var(--muted)', fontSize: 10, minWidth: 52, textAlign: 'right' }}>
                    {p.cost_per_kg != null ? `₹${p.cost_per_kg}/kg` : '—'}
                  </span>
                  <button
                    onClick={() => startEdit(p)}
                    style={{ fontSize: 10, padding: '2px 7px', background: 'transparent', border: '1px solid var(--border2)', borderRadius: 3, color: 'var(--muted)', cursor: 'pointer' }}
                  >Edit</button>
                  <button
                    onClick={() => { if (confirm(`Remove "${p.name}"?`)) onDelete(p.id); }}
                    style={{ fontSize: 10, padding: '2px 7px', background: 'transparent', border: '1px solid rgba(239,68,68,.3)', borderRadius: 3, color: 'var(--red)', cursor: 'pointer' }}
                  >✕</button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Add row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="fi"
          placeholder="Process name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{ flex: 1, minWidth: 130, fontSize: 12 }}
        />
        <input
          type="number" min={1}
          className="fi"
          placeholder="Days"
          value={newDays}
          onChange={e => setNewDays(e.target.value)}
          style={{ width: 60, fontSize: 12 }}
        />
        <input
          type="number" min={0} step="0.01"
          className="fi"
          placeholder="₹/kg"
          value={newCost}
          onChange={e => setNewCost(e.target.value)}
          style={{ width: 80, fontSize: 12 }}
        />
        <button className="btn btn-primary" onClick={handleAdd} disabled={saving} style={{ fontSize: 12, padding: '6px 14px' }}>
          {saving ? '…' : '+ Add'}
        </button>
      </div>
      {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 6 }}>⚠ {error}</div>}
    </div>
  );
}


function ListEditor() {
  const [materialTypes,  setMaterialTypes]  = useState([]);
  const [materialGrades, setMaterialGrades] = useState([]);
  const [processes,      setProcesses]      = useState([]);
  const [vendors,        setVendors]        = useState([]);
  const [projects,       setProjects]       = useState([]);

  async function refresh() {
    const [types, grades, procs, vends, projs] = await Promise.all([
      getMaterialTypes(),
      getMaterialGrades(),
      getProcesses(),
      getVendors(),
      api.get('/lookups/projects'),
    ]);
    setMaterialTypes(types.map(t => ({ id: String(t.id), name: t.name })));
    setMaterialGrades(grades.map(g => ({ id: String(g.id), name: g.name })));
    setProcesses(procs.map(p => ({ id: String(p.id), name: p.name, default_days: p.default_days, cost_per_kg: p.cost_per_kg ?? null })));
    setVendors(vends.map(v => ({ id: String(v.id), name: v.name })));
    setProjects(projs.map(p => ({ id: String(p.id), name: p.name })));
  }

  useEffect(() => { refresh(); }, []);

  async function wrapAdd(fn, ...args) { await fn(...args); await refresh(); }
  async function wrapDel(fn, id)      { await fn(id);      await refresh(); }

  return (
    <div className="page">
      <div className="section-hdr" style={{ marginBottom: 20 }}>
        <div>
          <div className="section-title">List Editor</div>
          <div className="section-sub">Admin · Manage system-wide reference lists</div>
        </div>
      </div>

      <div style={{
        background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.25)',
        borderRadius: 4, padding: '10px 14px', marginBottom: 20,
        fontFamily: 'var(--mono)', fontSize: 11, color: '#60a5fa',
      }}>
        ℹ Changes here affect all dropdowns and filters across the system. Only Admin users can edit these lists.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <ProcessListCard
          processes={processes}
          onAdd={(name, days, cost) => wrapAdd(createProcess, name, days || 1, cost)}
          onUpdate={(id, name, days, cost) => wrapAdd(updateProcess, id, name, days, cost)}
          onDelete={(id) => wrapDel(deleteProcess, id)}
        />

        <ListCard
          title="Material Types"
          description="Types of raw material (e.g. Metal, Plastic)"
          items={materialTypes}
          onAdd={(name) => wrapAdd(createMaterialType, name)}
          onDelete={(id) => wrapDel(deleteMaterialType, id)}
        />

        <ListCard
          title="Material Grades"
          description="Specific grades/alloys (e.g. SS316, Al6061)"
          items={materialGrades}
          onAdd={(name) => wrapAdd(createMaterialGrade, name)}
          onDelete={(id) => wrapDel(deleteMaterialGrade, id)}
        />

        <ListCard
          title="Vendors"
          description="Approved supplier list"
          items={vendors}
          onAdd={(name) => wrapAdd(createVendor, name)}
          onDelete={(id) => wrapDel(deleteVendor, id)}
        />

        <ListCard
          title="Projects"
          description="Active manufacturing projects"
          items={projects}
          extraField="description"
          onAdd={(name, desc) => wrapAdd(
            async (n, d) => { await api.post('/lookups/projects', { name: n, description: d || null }); },
            name, desc
          )}
          onDelete={() => {}}
        />

      </div>
    </div>
  );
}

export default ListEditor;
