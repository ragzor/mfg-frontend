/**
 * NewWeldingModal.jsx  —  Create Welding Assembly Parts
 *
 * Tabs:
 *   Single  — one assembly, Asana import optional
 *   Batch   — multiple assemblies from one Asana task
 *             (each PDF attachment → one sub-assembly row)
 *
 * Fixed process sequence:
 *   1. W_4_PARTS  (locked — auto-managed)
 *   2. Welding    (locked)
 *   3. Deburring  (locked)
 *   4. User selects: Powder Coating | JW_Machining | Electroplating
 *   5. If step 4 = JW_Machining → user selects: Powder Coating | Electroplating
 *
 * BOM section:
 *   After Asana fetch the description table is parsed into BOM rows.
 *   Each row shows a match status (exact / fuzzy / multiple / not_found).
 *   "Multiple" shows candidate chips to pick from.
 *   "Not found" flags it — it will be manually linked after creation.
 *   Override search lets engineer reassign any row.
 */

import { useState, useEffect } from 'react';
import { useLookups } from '../hooks/useLookups';
import { getAsanaToken, saveAsanaToken } from '../api/asana';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function jwt() {
  return localStorage.getItem('mfg_token') || '';
}
function authHdr() {
  return { 'Content-Type': 'application/json', ...(jwt() ? { Authorization: `Bearer ${jwt()}` } : {}) };
}

// ── colour map matching rest of the app ─────────────────────────
const PCOL = {
  'W_4_PARTS':      '#6b7280',
  'Welding':        '#f97316',
  'Deburring':      '#8b5cf6',
  'Powder Coating': '#ec4899',
  'JW_Machining':   '#4ade80',
  'Electroplating': '#fb7185',
};

function statusDot(s) {
  if (!s) return 'var(--border2)';
  const u = s.toUpperCase();
  if (u === 'CMPLT' || u === 'COMPLETED') return 'var(--green)';
  if (u.includes('PRGS') || u.includes('PROGRESS')) return '#3b82f6';
  if (u === 'NOT_STARTED') return 'var(--border2)';
  return '#f59e0b';
}

// ─────────────────────────────────────────────────────────────────
// ProcessSequenceBuilder
// Shows fixed steps 1-3 locked, step 4 dropdown, step 5 conditional
// ─────────────────────────────────────────────────────────────────

function ProcessSequenceBuilder({ step4, step5, onChange4, onChange5 }) {
  const FIXED = ['W_4_PARTS', 'Welding', 'Deburring'];
  const S4    = ['Powder Coating', 'JW_Machining', 'Electroplating'];
  const S5    = ['Powder Coating', 'Electroplating'];

  function StepBadge({ n, name, locked }) {
    const col = PCOL[name] || '#888';
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 12px', borderRadius: 3, marginBottom: 5,
        background: `${col}14`,
        border: `1px solid ${col}38`,
        opacity: locked ? 0.8 : 1,
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
          background: col, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontFamily: 'var(--mono)',
          fontSize: 10, fontWeight: 700, color: '#000',
        }}>{n}</span>
        <span style={{ flex: 1, fontSize: 13 }}>{name}</span>
        {locked && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)',
            background: 'var(--border)', padding: '1px 6px', borderRadius: 2,
          }}>FIXED</span>
        )}
      </div>
    );
  }

  const step4Col = step4 ? (PCOL[step4] || '#888') : 'var(--border2)';
  const step5Col = step5 ? (PCOL[step5] || '#888') : 'var(--border2)';

  return (
    <div>
      {FIXED.map((name, i) => (
        <StepBadge key={name} n={i + 1} name={name} locked />
      ))}

      {/* Step 4 — selectable */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '5px 12px 5px 5px', borderRadius: 3, marginBottom: 5,
        border: `1px solid ${step4 ? step4Col + '55' : 'var(--border2)'}`,
        background: step4 ? `${step4Col}10` : 'var(--surface2)',
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
          background: step4 ? step4Col : 'var(--border2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: '#000',
          marginLeft: 7,
        }}>4</span>
        <select
          value={step4}
          onChange={e => { onChange4(e.target.value); onChange5(''); }}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: step4 ? 'var(--text)' : 'var(--muted)',
            fontFamily: 'var(--body)', fontSize: 13, cursor: 'pointer',
          }}
        >
          <option value="">— Select finishing step —</option>
          {S4.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {/* Step 5 — only if JW_Machining selected */}
      {step4 === 'JW_Machining' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '5px 12px 5px 5px', borderRadius: 3, marginBottom: 5,
          border: `1px solid ${step5 ? step5Col + '55' : 'var(--border2)'}`,
          background: step5 ? `${step5Col}10` : 'var(--surface2)',
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: step5 ? step5Col : 'var(--border2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: '#000',
            marginLeft: 7,
          }}>5</span>
          <select
            value={step5}
            onChange={e => onChange5(e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: step5 ? 'var(--text)' : 'var(--muted)',
              fontFamily: 'var(--body)', fontSize: 13, cursor: 'pointer',
            }}
          >
            <option value="">— Select post-machining finish —</option>
            {S5.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}

      {/* Summary strip */}
      {(step4) && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 6 }}>
          {[...FIXED, step4, ...(step4 === 'JW_Machining' && step5 ? [step5] : [])].map((s, i) => (
            <span key={i} style={{
              fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 7px', borderRadius: 2,
              background: `${PCOL[s] || '#888'}22`,
              border: `1px solid ${PCOL[s] || '#888'}44`,
              color: PCOL[s] || 'var(--muted)',
            }}>{i + 1}. {s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// BomRowCard — one child part from the parsed BOM table
// ─────────────────────────────────────────────────────────────────

function BomRowCard({ row, index, allParts, onOverride }) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [searchQ,      setSearchQ]      = useState('');
  const [suggs,        setSuggs]        = useState([]);

  const MC = {
    exact:     { color: 'var(--green)',  label: '✓ Exact match',     border: '#22c55e44' },
    fuzzy:     { color: '#f59e0b',       label: '~ Fuzzy match',     border: '#f59e0b44' },
    multiple:  { color: '#3b82f6',       label: '⚡ Multiple matches', border: '#3b82f644' },
    not_found: { color: 'var(--red)',    label: '✗ Not found',       border: '#ef444444' },
  };
  const mc = MC[row.match] || MC.not_found;

  function search(q) {
    setSearchQ(q);
    if (!q.trim()) return setSuggs([]);
    const n = q.toLowerCase();
    setSuggs(allParts.filter(p =>
      p.name?.toLowerCase().includes(n) || p.part_number?.toLowerCase().includes(n)
    ).slice(0, 7));
  }

  function pickCandidate(c) {
    onOverride(index, { ...c, match: 'exact' });
  }

  return (
    <div style={{
      border: `1px solid ${mc.border}`,
      borderLeft: `3px solid ${mc.color}`,
      borderRadius: 3, padding: '9px 12px', marginBottom: 6,
      background: 'var(--surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Index */}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', paddingTop: 1, minWidth: 16 }}>
          {index + 1}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top row: part number + match badge + qty */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>{row.part_number}</span>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, padding: '1px 6px', borderRadius: 2,
              color: mc.color, background: `${mc.color}18`,
            }}>{mc.label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>
              Qty: {row.quantity}
            </span>
          </div>

          {/* Match result */}
          {(row.match === 'exact' || row.match === 'fuzzy') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.name}</span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9,
                color: statusDot(row.status),
                background: `${statusDot(row.status)}18`,
                padding: '1px 6px', borderRadius: 2,
              }}>{row.status}</span>
              <button
                onClick={() => setOverrideOpen(o => !o)}
                style={{
                  marginLeft: 'auto', cursor: 'pointer', fontFamily: 'var(--mono)',
                  fontSize: 9, color: 'var(--muted)', background: 'none',
                  border: '1px solid var(--border2)', borderRadius: 2, padding: '1px 6px',
                }}>
                {overrideOpen ? 'cancel' : 'override'}
              </button>
            </div>
          )}

          {row.match === 'multiple' && (
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 5 }}>
                Select the correct match:
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {(row.candidates || []).map(c => (
                  <button key={c.part_id}
                    onClick={() => pickCandidate(c)}
                    style={{
                      fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 9px', cursor: 'pointer',
                      background: 'var(--surface2)', border: '1px solid var(--border2)',
                      borderRadius: 2, color: 'var(--text)',
                    }}>
                    {c.part_number}
                    <span style={{ color: 'var(--muted)', marginLeft: 5 }}>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {row.match === 'not_found' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>
                Not in database — will be flagged. Link manually after creation.
              </span>
              <button
                onClick={() => setOverrideOpen(o => !o)}
                style={{
                  marginLeft: 'auto', cursor: 'pointer', fontFamily: 'var(--mono)',
                  fontSize: 9, color: '#3b82f6', background: 'none',
                  border: '1px solid #3b82f644', borderRadius: 2, padding: '1px 6px',
                }}>
                search & link
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Override search panel */}
      {overrideOpen && (
        <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
          <input
            autoFocus
            value={searchQ}
            onChange={e => search(e.target.value)}
            placeholder="Search by part number or name…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg)', border: '1px solid var(--border2)',
              borderRadius: 3, padding: '5px 9px',
              fontFamily: 'var(--mono)', fontSize: 11,
              color: 'var(--text)', outline: 'none',
            }}
          />
          {suggs.length > 0 && (
            <div style={{ border: '1px solid var(--border2)', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
              {suggs.map(p => (
                <div key={p.id || p.part_id}
                  onClick={() => { pickCandidate({ part_id: p.id || p.part_id, part_number: p.part_number, name: p.name, status: p.status }); setOverrideOpen(false); setSearchQ(''); }}
                  style={{
                    padding: '7px 10px', cursor: 'pointer', display: 'flex',
                    gap: 9, alignItems: 'center', borderBottom: '1px solid var(--border)',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', minWidth: 120 }}>{p.part_number}</span>
                  <span style={{ fontSize: 12, flex: 1, color: 'var(--text)' }}>{p.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: statusDot(p.status) }}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Asana Import Panel (shared between tabs)
// ─────────────────────────────────────────────────────────────────

function AsanaPanel({ token, taskId, fetching, error, result, onTokenChange, onTaskIdChange, onFetch, onClear }) {
  return (
    <div style={{
      background: 'rgba(249,115,22,.07)', border: '1px solid rgba(249,115,22,.3)',
      borderRadius: 4, padding: '12px 14px', marginBottom: 16,
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10, color: '#f97316',
        textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10,
      }}>
        ⚡ Import from Asana — parses BOM table + lists PDF drawings
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input className="fi"
          type="text" placeholder="Asana Task ID (numbers only)"
          value={taskId}
          onChange={e => { onTaskIdChange(e.target.value); onClear(); }}
          onKeyDown={e => e.key === 'Enter' && onFetch()}
          style={{ flex: 1, fontSize: 12 }}
        />
        <button
          className="btn btn-sm"
          onClick={onFetch}
          disabled={fetching}
          style={{ background: '#f97316', color: '#000', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}
        >
          {fetching ? '⟳ Fetching…' : '↓ Fetch BOM'}
        </button>
      </div>

      {!token && (
        <div style={{ color: '#f97316', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 6 }}>
          ⚠ No Asana token saved — go to ⚙ Settings
        </div>
      )}
      {error && (
        <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 11, marginTop: 6 }}>⚠ {error}</div>
      )}
      {result && (
        <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)' }}>
          ✓ <strong style={{ color: 'var(--text)' }}>{result.task_name}</strong>
          <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
            {result.assembly_count ?? result.assemblies?.length ?? 0} assembl{(result.assembly_count ?? result.assemblies?.length ?? 0) !== 1 ? 'ies' : 'y'} detected
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Results panel (shown after successful creation)
// ─────────────────────────────────────────────────────────────────

function ResultsPanel({ results, onCreateAnother, onClose }) {
  const { type, data } = results;

  if (type === 'single') {
    const r = data;
    const linked    = (r.dependencies || []).filter(d => d.linked);
    const notLinked = (r.dependencies || []).filter(d => !d.linked);
    return (
      <div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: 'var(--green)', marginBottom: 12 }}>
          ✓ Assembly Created
        </div>
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderLeft: '3px solid var(--green)', borderRadius: 3, padding: '12px 14px',
          fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 12,
        }}>
          <div><span style={{ color: 'var(--muted)' }}>Part No · </span><span style={{ color: 'var(--accent)' }}>{r.part_number}</span></div>
          <div><span style={{ color: 'var(--muted)' }}>Name    · </span>{r.name}</div>
          <div><span style={{ color: 'var(--muted)' }}>Target  · </span>{r.target_date}</div>
        </div>
        {linked.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
              Linked child parts ({linked.length})
            </div>
            {linked.map((d, i) => (
              <div key={i} style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)', marginBottom: 3 }}>
                ✓ {d.part_number}
              </div>
            ))}
          </div>
        )}
        {notLinked.length > 0 && (
          <div style={{
            background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.3)',
            borderRadius: 3, padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 10,
          }}>
            <div style={{ color: '#f97316', marginBottom: 4 }}>⚠ {notLinked.length} part(s) not found in database — link them manually via Part Detail:</div>
            {notLinked.map((d, i) => <div key={i} style={{ color: 'var(--muted)' }}>· {d.part_number}</div>)}
          </div>
        )}
      </div>
    );
  }

  // Batch results
  const ok   = data.results.filter(r => r.status === 'ok');
  const fail = data.results.filter(r => r.status !== 'ok');
  const drw  = data.drawing_sync || [];

  return (
    <div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: 'var(--green)', marginBottom: 12 }}>
        ✓ {data.created} Assembly{data.created !== 1 ? ' assemblies' : ''} Created
        {data.failed > 0 && <span style={{ color: 'var(--red)', fontSize: 13, marginLeft: 10 }}>· {data.failed} failed</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
        {data.results.map((r, i) => (
          <div key={i} style={{
            background: 'var(--surface2)', borderRadius: 3,
            borderLeft: `3px solid ${r.status === 'ok' ? 'var(--green)' : 'var(--red)'}`,
            padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 11,
          }}>
            {r.status === 'ok'
              ? <><span style={{ color: 'var(--accent)' }}>{r.part_number}</span> — {r.name}</>
              : <><span style={{ color: 'var(--red)' }}>✗ </span>{r.name || '(unnamed)'} — {r.error}</>}
          </div>
        ))}
      </div>

      {drw.length > 0 && (
        <div style={{
          background: 'rgba(59,130,246,.07)', border: '1px solid rgba(59,130,246,.25)',
          borderRadius: 3, padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 10,
        }}>
          <div style={{ color: '#60a5fa', marginBottom: 6 }}>📎 Drawing sync: {drw.filter(d => d.status === 'ok').length} synced · {drw.filter(d => d.status !== 'ok').length} skipped</div>
          {drw.map((d, i) => (
            <div key={i} style={{ color: d.status === 'ok' ? 'var(--green)' : 'var(--muted)', marginBottom: 2 }}>
              {d.status === 'ok' ? '✓' : '—'} {d.part_name}{d.filename ? ` · ${d.filename}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// MAIN MODAL
// ─────────────────────────────────────────────────────────────────

function emptyAssembly(overrides = {}) {
  return {
    name: '', project_id: '', quantity: 1,
    material_grade_id: '', asana_ref: '',
    step4: '', step5: '',
    bomRows: [],   // per-assembly BOM (set from PDF extraction)
    ...overrides,
  };
}

function buildChildParts(bomRows) {
  return bomRows
    .filter(r => r.matched_part_number || r.part_id)
    .map(r => ({
      part_number: r.matched_part_number || r.part_number,
      quantity:    r.quantity,
    }));
}

export default function NewWeldingModal({ open, onClose, onSuccess }) {
  const { projects, materialGrades, refetch } = useLookups();

  const [tab, setTab] = useState('single');

  // Asana state
  const [asanaToken,    setAsanaToken]    = useState(getAsanaToken);
  const [asanaTaskId,   setAsanaTaskId]   = useState('');
  const [asanaFetching, setAsanaFetching] = useState(false);
  const [asanaError,    setAsanaError]    = useState('');
  const [asanaResult,   setAsanaResult]   = useState(null);  // full API response

  // All parts for BOM override search
  const [allParts, setAllParts] = useState([]);

  // Single tab — one assembly with its own bomRows
  const [single, setSingle] = useState(emptyAssembly());

  // Batch tab — array of assemblies, each with bomRows pre-filled from PDF
  const [batchRows, setBatchRows] = useState([emptyAssembly(), emptyAssembly(), emptyAssembly()]);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState('');
  const [results,    setResults]    = useState(null);
  const [toast,      setToast]      = useState(null);

  useEffect(() => {
    if (!open) return;
    refetch();
    loadAllParts();
    setTab('single');
    setResults(null); setFormError('');
    setAsanaResult(null); setAsanaTaskId(''); setAsanaError('');
    setSingle(emptyAssembly());
    setBatchRows([emptyAssembly(), emptyAssembly(), emptyAssembly()]);
  }, [open]);

  async function loadAllParts() {
    try {
      const r = await fetch(`${API}/parts`, { headers: { Authorization: `Bearer ${jwt()}` } });
      const d = await r.json();
      setAllParts(Array.isArray(d) ? d : (d.parts || []));
    } catch { /* silent */ }
  }

  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Asana fetch ──────────────────────────────────────────────
  async function fetchAsana() {
    const tid = asanaTaskId.trim();
    const tok = asanaToken.trim();
    if (!tid) return setAsanaError('Enter a Task ID');
    if (!tok) return setAsanaError('No Asana token — go to ⚙ Settings');
    setAsanaError(''); setAsanaFetching(true);
    try {
      saveAsanaToken(tok);
      const url = `${API}/welding/asana-prefill?task_id=${encodeURIComponent(tid)}&token=${encodeURIComponent(tok)}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${jwt()}` } });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Error ${r.status}`); }
      const data = await r.json();
      setAsanaResult(data);

      // New API: data.assemblies is an array, one per PDF
      const asms = data.assemblies || [];

      if (asms.length === 0) {
        if (data.attachments !== undefined) {
          setAsanaError('Server is running old welding.py — please restart the backend after updating welding.py');
        } else {
          setAsanaError('No PDF attachments found on this task. Attach one PDF drawing per assembly.');
        }
        return;
      }

      // Always populate batch rows — one per PDF assembly
      // Auto-select WLD material grade if it exists
      const wldGrade = materialGrades.find(m => m.name === 'WLD');
      const newRows = asms.map(a => emptyAssembly({
        name:               a.name,
        bomRows:            a.bom_rows || [],
        material_grade_id:  wldGrade?.id || '',
      }));
      setBatchRows(newRows);
      setTab('batch');

      // Also pre-fill single if exactly 1
      if (asms.length === 1) {
        setSingle(s => ({ ...s, name: asms[0].name, bomRows: asms[0].bom_rows || [] }));
      }

      const totalBom = asms.reduce((s, a) => s + (a.bom_count || 0), 0);
      showToast(`Fetched: ${asms.length} assemblies · ${totalBom} BOM lines total`);
    } catch (e) {
      setAsanaError(e.message);
    } finally {
      setAsanaFetching(false);
    }
  }

  // Override a BOM row in single or a specific batch row
  function overrideSingleBom(idx, override) {
    setSingle(s => ({ ...s, bomRows: s.bomRows.map((r, i) => i === idx ? { ...r, ...override } : r) }));
  }
  function overrideBatchBom(rowIdx, bomIdx, override) {
    setBatchRows(rs => rs.map((r, i) => i === rowIdx
      ? { ...r, bomRows: r.bomRows.map((b, bi) => bi === bomIdx ? { ...b, ...override } : b) }
      : r
    ));
  }

  // ── Validate ──────────────────────────────────────────────────
  function validateAssembly(a, label = '') {
    if (!a.name.trim()) return `${label}Assembly name is required`;
    if (!a.step4) return `${label}Select a finishing step (step 4)`;
    if (a.step4 === 'JW_Machining' && !a.step5)
      return `${label}"${a.name}" — select a post-machining finish (step 5)`;
    return null;
  }

  // ── Submit single ─────────────────────────────────────────────
  async function submitSingle() {
    const err = validateAssembly(single);
    if (err) return setFormError(err);
    setFormError(''); setSubmitting(true);
    try {
      const body = {
        name:               single.name.trim(),
        project_id:         single.project_id     || null,
        quantity:           Number(single.quantity) || 1,
        material_grade_id:  single.material_grade_id || null,
        asana_ref:          single.asana_ref       || null,
        step4:              single.step4,
        step5:              single.step5           || null,
        child_parts:        buildChildParts(single.bomRows),
      };
      const r = await fetch(`${API}/welding/create`, {
        method: 'POST', headers: authHdr(), body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Error ${r.status}`); }
      const data = await r.json();
      setResults({ type: 'single', data });
      showToast(`✓ Assembly created: ${data.part_number}`);
      onSuccess?.();
    } catch (e) { setFormError(e.message); }
    finally { setSubmitting(false); }
  }

  // ── Submit batch ──────────────────────────────────────────────
  async function submitBatch() {
    const valid = batchRows.filter(a => a.name.trim());
    if (!valid.length) return setFormError('Add at least one assembly with a name');
    for (const a of valid) {
      const err = validateAssembly(a, `"${a.name}": `);
      if (err) return setFormError(err);
    }
    setFormError(''); setSubmitting(true);
    try {
      const body = {
        assemblies: valid.map(a => ({
          name:               a.name.trim(),
          project_id:         a.project_id         || null,
          quantity:           Number(a.quantity)   || 1,
          material_grade_id:  a.material_grade_id  || null,
          asana_ref:          a.asana_ref           || null,
          step4:              a.step4,
          step5:              a.step5               || null,
          child_parts:        buildChildParts(a.bomRows),  // each assembly has its own BOM
        })),
        asana_task_id: asanaTaskId.trim() || null,
        asana_token:   asanaToken         || null,
      };
      const r = await fetch(`${API}/welding/create-batch`, {
        method: 'POST', headers: authHdr(), body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Error ${r.status}`); }
      const data = await r.json();
      setResults({ type: 'batch', data });
      showToast(`✓ ${data.created} assemblies created`);
      onSuccess?.();
    } catch (e) { setFormError(e.message); }
    finally { setSubmitting(false); }
  }

  function resetAndCreateAnother() {
    setResults(null); setFormError('');
    setSingle(emptyAssembly());
    setBatchRows([emptyAssembly(), emptyAssembly(), emptyAssembly()]);
    setAsanaResult(null); setAsanaTaskId('');
  }

  if (!open) return null;

  // BOM summary for the single tab
  const singleBomMatched = single.bomRows.filter(r => r.match === 'exact' || r.match === 'fuzzy').length;
  const singleBomMissing = single.bomRows.filter(r => r.match === 'not_found').length;

  return (
    <>
      <div className="backdrop open" onClick={e => e.target === e.currentTarget && onClose()}>
        <div
          className="modal modal-wide"
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        >
          {/* ── Header ── */}
          <div className="modal-hdr" style={{ flexShrink: 0 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{
                  background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.4)',
                  color: '#f97316', fontFamily: 'var(--mono)', fontSize: 9,
                  padding: '2px 8px', borderRadius: 2, letterSpacing: '.1em',
                }}>⚙ WELDING ASSEMBLY</span>
                <div className="modal-title">New Welding Part</div>
              </div>
              {!results && (
                <div className="tab-bar" style={{ marginBottom: 0, marginTop: 8, border: 'none' }}>
                  <div className={`tab${tab === 'single' ? ' active' : ''}`} onClick={() => setTab('single')}>Single</div>
                  <div className={`tab${tab === 'batch'  ? ' active' : ''}`} onClick={() => setTab('batch') }>⊞ Batch ({batchRows.filter(r=>r.name).length || '…'})</div>
                </div>
              )}
            </div>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          {/* ── Scrollable body ── */}
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>

            {results ? (
              <ResultsPanel results={results} onCreateAnother={resetAndCreateAnother} onClose={onClose} />
            ) : (
              <>
                {/* Asana import panel */}
                <AsanaPanel
                  token={asanaToken} taskId={asanaTaskId}
                  fetching={asanaFetching} error={asanaError} result={asanaResult}
                  onTokenChange={setAsanaToken}
                  onTaskIdChange={v => { setAsanaTaskId(v); setAsanaError(''); setAsanaResult(null); }}
                  onFetch={fetchAsana}
                  onClear={() => { setAsanaResult(null); setSingle(s => ({...s, bomRows:[]})); }}
                />

                {/* ── SINGLE TAB ── */}
                {tab === 'single' && (
                  <>
                    <div className="form-grid" style={{ marginBottom: 16 }}>
                      <div className="fgrp" style={{ gridColumn: '1 / -1' }}>
                        <label>Assembly Name *</label>
                        <input className="fi" type="text"
                          placeholder="e.g. WL-CTN-CONV-DRV-ROL-88.9"
                          value={single.name}
                          onChange={e => setSingle(s => ({ ...s, name: e.target.value }))} />
                      </div>
                      <div className="fgrp">
                        <label>Project</label>
                        <select className="fi" value={single.project_id}
                          onChange={e => setSingle(s => ({ ...s, project_id: e.target.value }))}>
                          <option value="">— Select project —</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="fgrp">
                        <label>Quantity</label>
                        <input className="fi" type="number" min="1"
                          value={single.quantity}
                          onChange={e => setSingle(s => ({ ...s, quantity: e.target.value }))} />
                      </div>
                      <div className="fgrp">
                        <label>Material Grade</label>
                        <select className="fi" value={single.material_grade_id}
                          onChange={e => setSingle(s => ({ ...s, material_grade_id: e.target.value }))}>
                          <option value="">—</option>
                          {materialGrades.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div className="fgrp">
                        <label>Asana Ref</label>
                        <input className="fi" type="text" placeholder="Task ID"
                          value={single.asana_ref}
                          onChange={e => setSingle(s => ({ ...s, asana_ref: e.target.value }))} />
                      </div>
                    </div>

                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                      Process Sequence *
                    </div>
                    <ProcessSequenceBuilder
                      step4={single.step4} step5={single.step5}
                      onChange4={v => setSingle(s => ({ ...s, step4: v, step5: '' }))}
                      onChange5={v => setSingle(s => ({ ...s, step5: v }))}
                    />

                    {single.bomRows.length > 0 && (
                      <div style={{ marginTop: 20 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>
                          <span>Child Parts — from PDF drawing</span>
                          {singleBomMatched > 0 && <span style={{color:'var(--green)'}}>✓ {singleBomMatched} matched</span>}
                          {singleBomMissing > 0 && <span style={{color:'var(--red)'}}>✗ {singleBomMissing} not found</span>}
                        </div>
                        {single.bomRows.map((row, ri) => (
                          <BomRowCard key={ri} row={row} index={ri} allParts={allParts}
                            onOverride={(idx, ov) => overrideSingleBom(idx, ov)} />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* ── BATCH TAB ── */}
                {tab === 'batch' && (
                  <>
                    <div style={{
                      fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)',
                      background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.2)',
                      borderRadius:3, padding:'8px 12px', marginBottom:14,
                    }}>
                      ℹ Fetch the Asana task above — one assembly row is created per PDF attachment.
                      Each PDF is scanned to extract its child parts automatically.
                    </div>

                    {/* Apply-to-all bar */}
                    <div style={{
                      background:'rgba(249,115,22,.06)', border:'1px solid rgba(249,115,22,.2)',
                      borderRadius:3, padding:'10px 14px', marginBottom:14,
                      display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap',
                    }}>
                      <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'#f97316', width:'100%', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:2 }}>
                        ⚡ Apply to all rows
                      </div>
                      <div className="fgrp" style={{ margin:0, flex:'1 1 160px' }}>
                        <label>Project</label>
                        <select className="fi" style={{ fontSize:12 }}
                          onChange={e => { const v=e.target.value; setBatchRows(rs=>rs.map(r=>({...r, project_id:v}))); }}>
                          <option value="">— Select project —</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="fgrp" style={{ margin:0, flex:'1 1 130px' }}>
                        <label>Material Grade</label>
                        <select className="fi" style={{ fontSize:12 }}
                          onChange={e => { const v=e.target.value; setBatchRows(rs=>rs.map(r=>({...r, material_grade_id:v}))); }}>
                          <option value="">—</option>
                          {materialGrades.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div className="fgrp" style={{ margin:0, flex:'1 1 100px' }}>
                        <label>Asana Ref #</label>
                        <input className="fi" type="number" placeholder="e.g. 1234" style={{ fontSize:12 }}
                          onChange={e => { const v=e.target.value; setBatchRows(rs=>rs.map(r=>({...r, asana_ref:v}))); }} />
                      </div>
                      <div className="fgrp" style={{ margin:0, flex:'1 1 140px' }}>
                        <label>Step 4 Finish</label>
                        <select className="fi" style={{ fontSize:12 }}
                          onChange={e => { const v=e.target.value; setBatchRows(rs=>rs.map(r=>({...r, step4:v, step5:''}))); }}>
                          <option value="">— Select —</option>
                          {['Powder Coating','JW_Machining','Electroplating'].map(o=><option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Assembly rows */}
                    {batchRows.map((row, idx) => (
                      <div key={idx} style={{ border:'1px solid var(--border2)', borderRadius:4, marginBottom:12, background:'var(--surface)' }}>
                        {/* Row header */}
                        <div style={{ background:'rgba(249,115,22,.07)', borderBottom:'1px solid var(--border)', padding:'7px 14px', display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'#f97316', fontWeight:700 }}>⚙ ASSEMBLY {idx+1}</span>
                          <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)', flex:1 }}>{row.name || 'unnamed'}</span>
                          {row.bomRows.length > 0 && (
                            <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--green)' }}>
                              📋 {row.bomRows.length} BOM line{row.bomRows.length!==1?'s':''}
                            </span>
                          )}
                          {batchRows.length > 1 && (
                            <button onClick={() => setBatchRows(rs=>rs.filter((_,i)=>i!==idx))}
                              style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--red)', background:'none', border:'none', cursor:'pointer' }}>
                              ✕
                            </button>
                          )}
                        </div>

                        <div style={{ padding:'12px 14px' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 70px 1fr', gap:8, marginBottom:10 }}>
                            <div className="fgrp" style={{ margin:0, gridColumn:'1 / 3' }}>
                              <label>Assembly Name *</label>
                              <input className="fi" type="text" placeholder="WL-…"
                                value={row.name}
                                onChange={e => setBatchRows(rs=>rs.map((r,i)=>i===idx?{...r,name:e.target.value}:r))} />
                            </div>
                            <div className="fgrp" style={{ margin:0 }}>
                              <label>Qty</label>
                              <input className="fi" type="number" min="1"
                                value={row.quantity}
                                onChange={e => setBatchRows(rs=>rs.map((r,i)=>i===idx?{...r,quantity:e.target.value}:r))} />
                            </div>
                            <div className="fgrp" style={{ margin:0 }}>
                              <label>Material Grade</label>
                              <select className="fi"
                                value={row.material_grade_id}
                                onChange={e => setBatchRows(rs=>rs.map((r,i)=>i===idx?{...r,material_grade_id:e.target.value}:r))}>
                                <option value="">—</option>
                                {materialGrades.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* Per-row process sequence */}
                          <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>
                            Process Sequence *
                          </div>
                          <ProcessSequenceBuilder
                            step4={row.step4} step5={row.step5}
                            onChange4={v => setBatchRows(rs=>rs.map((r,i)=>i===idx?{...r,step4:v,step5:''}:r))}
                            onChange5={v => setBatchRows(rs=>rs.map((r,i)=>i===idx?{...r,step5:v}:r))}
                          />

                          {/* Per-assembly BOM */}
                          {row.bomRows.length > 0 && (
                            <div style={{ marginTop:12 }}>
                              <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>
                                Child Parts from PDF · {row.bomRows.filter(b=>b.match==='exact'||b.match==='fuzzy').length}/{row.bomRows.length} matched
                              </div>
                              {row.bomRows.map((brow, bi) => (
                                <BomRowCard key={bi} row={brow} index={bi} allParts={allParts}
                                  onOverride={(bomIdx, ov) => overrideBatchBom(idx, bomIdx, ov)} />
                              ))}
                            </div>
                          )}
                          {row.bomRows.length === 0 && (
                            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)', marginTop:8, padding:'6px 10px', background:'rgba(249,115,22,.05)', borderRadius:3 }}>
                              ⚠ No BOM extracted from PDF — add child parts manually after creation via Part Detail.
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="add-proc-btn" onClick={() => setBatchRows(rs=>[...rs, emptyAssembly()])}
                      style={{ marginBottom:12 }}>
                      + Add Assembly Row
                    </div>
                  </>
                )}

                {formError && (
                  <div style={{ color:'var(--red)', fontFamily:'var(--mono)', fontSize:11, marginTop:12 }}>
                    ⚠ {formError}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="modal-foot" style={{ flexShrink:0 }}>
            {results ? (
              <>
                <button className="btn btn-ghost" onClick={resetAndCreateAnother}>+ Create Another</button>
                <button className="btn btn-primary" onClick={onClose}
                  style={{ background:'#f97316', borderColor:'#f97316' }}>Done</button>
              </>
            ) : (
              <>
                {formError && (
                  <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--red)', marginRight:'auto' }}>
                    ⚠ {formError}
                  </span>
                )}
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                {tab === 'single' ? (
                  <button className="btn btn-primary" onClick={submitSingle} disabled={submitting}
                    style={{ background:'#f97316', borderColor:'#f97316' }}>
                    {submitting ? 'Creating…' : '⚙ Create Assembly'}
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={submitBatch} disabled={submitting}
                    style={{ background:'#f97316', borderColor:'#f97316' }}>
                    {submitting ? 'Creating…' : `⊞ Create ${batchRows.filter(r=>r.name.trim()).length||''} Assemblies`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div style={{
          position:'fixed', bottom:22, right:22, zIndex:400,
          background: toast.type==='err' ? 'rgba(239,68,68,.15)' : 'rgba(249,115,22,.15)',
          border: `1px solid ${toast.type==='err' ? 'rgba(239,68,68,.4)' : 'rgba(249,115,22,.4)'}`,
          color: toast.type==='err' ? 'var(--red)' : '#f97316',
          padding:'10px 16px', borderRadius:4, fontFamily:'var(--mono)', fontSize:12,
        }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
