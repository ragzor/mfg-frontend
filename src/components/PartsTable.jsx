import { useState, useMemo } from 'react';
import Pipeline from './Pipeline';
import BulkActionBar from './BulkActionBar';
import PartDetailModal from './PartDetailModal';
import { LISTS, STATUS_BADGE } from '../data';
import { useProcessActions } from '../hooks/useProcessActions';
import { useLookups } from '../hooks/useLookups';

function StatusBadge({ status }) {
  const cls = STATUS_BADGE[status] || 's-ns';
  return <span className={`sbadge ${cls}`}>{status}</span>;
}

// Shows the current active process status + name
const PROC_STATUS_LABEL = {
  IN_PRGS:      { label: 'In Progress',       color: '#3b82f6' },
  CMPLT:        { label: 'Completed',          color: 'var(--green)' },
  QC:           { label: 'QC',                 color: '#a855f7' },
  REJECTED:     { label: 'Rejected',           color: 'var(--red)' },
  W_4_RM:       { label: 'Waiting RM',         color: '#f59e0b' },
  W_4_QUT:      { label: 'Waiting Quote',      color: '#f59e0b' },
  PO_APPROVAL:  { label: 'PO Approval',        color: '#f59e0b' },
  W_4_PARTS:    { label: 'Waiting Parts',      color: '#f59e0b' },
  W_F_PAYMENT:  { label: 'Awaiting Payment',   color: '#f59e0b' },
  W_F_DECISION: { label: 'Awaiting Decision',  color: '#f59e0b' },
  NOT_STARTED:  { label: 'Not Started',        color: 'var(--muted)' },
  M_SEND:       { label: 'Material Sent',      color: '#06b6d4' },
  M_RCV:        { label: 'Material Received',  color: '#06b6d4' },
  CANCELLED:    { label: 'Cancelled',          color: 'var(--border2)' },
};

function ProcStatusBadge({ status, name }) {
  if (!status) return <span style={{ color: 'var(--border2)' }}>—</span>;
  const s = PROC_STATUS_LABEL[status] || { label: status, color: 'var(--muted)' };
  return (
    <div>
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
        padding: '2px 6px', borderRadius: 2, whiteSpace: 'nowrap',
        background: `${s.color}18`, color: s.color,
        border: `1px solid ${s.color}44`,
      }}>
        {s.label}
      </span>
      {name && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--border2)', marginTop: 2 }}>
          {name}
        </div>
      )}
    </div>
  );
}

function PartsTable({ parts, onPartsChange, onOpenModal }) {
  const [search, setSearch]         = useState('');
  const [poFilter, setPoFilter]     = useState('');
  const [matFilter, setMatFilter]   = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeStatus, setActiveStatus]               = useState([]);
  const [activeProject, setActiveProject]             = useState([]);
  const [activeVendor, setActiveVendor]               = useState([]);
  const [activeProcess, setActiveProcess]             = useState([]);
  const [activeProcessStatus, setActiveProcessStatus] = useState([]);
  const [scheduleFilter, setScheduleFilter]           = useState([]);
  const [selected,   setSelected]   = useState(new Set());
  const [detailPart, setDetailPart] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  async function handleBulkDone() {
    setRefreshing(true);
    setSelected(new Set());
    try {
      await onPartsChange();
    } finally {
      setRefreshing(false);
    }
  }

  // Wire process mutations to the live backend
  const { setStatus: setProcessStatus, loading: actionLoading } = useProcessActions({
    onSuccess: onPartsChange,
  });

  // Live lookup data — all dropdowns come from the backend
  const { projects: liveProjects, materialTypes: liveMaterialTypes, materialGrades: liveMaterialGrades, processes, vendors } = useLookups();
  const projectNames   = liveProjects.map(p => p.name);
  const materialTypes  = liveMaterialTypes.map(m => m.name);
  const materialGrades = liveMaterialGrades.map(m => m.name);

  // Unique PO numbers for dropdown
  const poOptions = useMemo(() =>
    [...new Set(parts.map(p => p.po).filter(p => p && p !== '—'))],
    [parts]
  );

  // Schedule classification per part
  function getSchedule(p) {
    const procs = p.processData || [];
    const today = new Date();
    // Delayed: any CMPLT process took longer than planned, OR any IN_PRGS past its planned_end
    const hasDelay = procs.some(pp => {
      if (pp.status === 'CMPLT' && pp.actual_end && pp.planned_end) {
        return new Date(pp.actual_end) > new Date(pp.planned_end);
      }
      if (['IN_PRGS','QC','W_4_RM','W_4_QUT','PO_APPROVAL','W_4_PARTS','W_F_PAYMENT','W_F_DECISION'].includes(pp.status) && pp.planned_end) {
        return today > new Date(pp.planned_end);
      }
      return false;
    });
    if (hasDelay) return 'Delayed';
    // At Risk: active process ends within 2 days
    const atRisk = procs.some(pp => {
      if (pp.status === 'IN_PRGS' && pp.planned_end) {
        const daysLeft = (new Date(pp.planned_end) - today) / 86400000;
        return daysLeft >= 0 && daysLeft <= 2;
      }
      return false;
    });
    if (atRisk) return 'At Risk';
    return 'On Time';
  }

  // Filtered parts
  const filtered = useMemo(() => {
    return parts.filter(p => {
      const q = search.toLowerCase();
      if (q && ![p.id, p.name, p.matType, p.matGrade, p.project, p.asanaId||'']
        .join(' ').toLowerCase().includes(q)) return false;
      if (poFilter && p.po !== poFilter) return false;
      if (matFilter && p.matType !== matFilter) return false;
      if (gradeFilter && p.matGrade !== gradeFilter) return false;
      if (activeStatus.length && !activeStatus.includes(p.status)) return false;
      if (activeProject.length && !activeProject.includes(p.project)) return false;
      // Vendor filter — matches active process vendor
      if (activeVendor.length && !activeVendor.includes(p.vendor)) return false;
      if (activeProcess.length && !activeProcess.some(proc => p.processes.includes(proc))) return false;
      // Process status filter — part must have at least one process in that status
      if (activeProcessStatus.length && !activeProcessStatus.some(s =>
        (p.processData || []).some(pp => pp.status === s)
      )) return false;
      // Schedule filter
      if (scheduleFilter.length && !scheduleFilter.includes(getSchedule(p))) return false;
      return true;
    });
  }, [parts, search, poFilter, matFilter, gradeFilter, activeStatus, activeProject, activeVendor, activeProcess, activeProcessStatus, scheduleFilter]);

  // Active filter tags
  const activeTags = [
    ...activeStatus.map(v => ({ type: 'status', val: v })),
    ...activeProject.map(v => ({ type: 'project', val: v })),
    ...activeVendor.map(v => ({ type: 'vendor', val: v })),
    ...activeProcess.map(v => ({ type: 'process', val: v })),
    ...activeProcessStatus.map(v => ({ type: 'procstatus', val: v })),
    ...scheduleFilter.map(v => ({ type: 'schedule', val: v })),
    ...(matFilter   ? [{ type: 'mat',   val: matFilter   }] : []),
    ...(gradeFilter ? [{ type: 'grade', val: gradeFilter }] : []),
    ...(poFilter    ? [{ type: 'po',    val: poFilter    }] : []),
    ...(search      ? [{ type: 'search', val: search     }] : []),
  ];

  function toggleChip(arr, setArr, val) {
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);
  }

  function removeTag(tag) {
    if (tag.type === 'status')     setActiveStatus(activeStatus.filter(v => v !== tag.val));
    if (tag.type === 'project')    setActiveProject(activeProject.filter(v => v !== tag.val));
    if (tag.type === 'vendor')     setActiveVendor(activeVendor.filter(v => v !== tag.val));
    if (tag.type === 'process')    setActiveProcess(activeProcess.filter(v => v !== tag.val));
    if (tag.type === 'procstatus') setActiveProcessStatus(activeProcessStatus.filter(v => v !== tag.val));
    if (tag.type === 'schedule')   setScheduleFilter(scheduleFilter.filter(v => v !== tag.val));
    if (tag.type === 'mat')    setMatFilter('');
    if (tag.type === 'grade')  setGradeFilter('');
    if (tag.type === 'po')     setPoFilter('');
    if (tag.type === 'search') setSearch('');
  }

  function clearAll() {
    setSearch(''); setPoFilter(''); setMatFilter(''); setGradeFilter('');
    setActiveStatus([]); setActiveProject([]); setActiveVendor([]); setActiveProcess([]);
    setActiveProcessStatus([]); setScheduleFilter([]);
    setSelected(new Set());
  }

  function toggleSelect(id) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  }

  function toggleSelectAll(e) {
    if (e.target.checked) {
      setSelected(new Set(filtered.map(p => p.id)));
    } else {
      setSelected(new Set());
    }
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="section-hdr">
        <div>
          <div className="section-title">Parts Management</div>
          <div className="section-sub">Click any row to view history · Check rows to bulk-edit</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onOpenModal('bulk')}>⊞ Bulk Create</button>
          <button className="btn btn-primary btn-sm" onClick={() => onOpenModal('single')}>+ New Part</button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <BulkActionBar
          selected={selected}
          parts={parts}
          onClear={() => setSelected(new Set())}
          onDone={handleBulkDone}
        />
      )}

      {/* Refresh overlay — shown while re-fetching after bulk action */}
      {refreshing && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            border: '3px solid var(--border2)',
            borderTopColor: 'var(--accent)',
            animation: 'spin 0.7s linear infinite',
          }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--muted)', letterSpacing: 1 }}>
            UPDATING…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Search + Filter Row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="🔍  Search name, ID, material..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 3, padding: '7px 11px', color: 'var(--text)', fontFamily: 'var(--body)', fontSize: 13, outline: 'none', width: 240 }}
        />
        <select
          value={poFilter}
          onChange={e => setPoFilter(e.target.value)}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 3, padding: '7px 10px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none' }}
        >
          <option value="">All PO Numbers</option>
          {poOptions.map(po => <option key={po}>{po}</option>)}
        </select>
        <select
          value={matFilter}
          onChange={e => setMatFilter(e.target.value)}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 3, padding: '7px 10px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none' }}
        >
          <option value="">All Material Types</option>
          {materialTypes.map(m => <option key={m}>{m}</option>)}
        </select>
        <select
          value={gradeFilter}
          onChange={e => setGradeFilter(e.target.value)}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 3, padding: '7px 10px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none' }}
        >
          <option value="">All Grades</option>
          {materialGrades.map(g => <option key={g}>{g}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => setFilterOpen(o => !o)}>
          ⚙ More Filters
          {activeTags.filter(t => !['search'].includes(t.type)).length > 0 && (
            <span style={{ background: 'var(--accent)', color: '#000', fontFamily: 'var(--mono)', fontSize: 9, padding: '1px 4px', borderRadius: 2, marginLeft: 4 }}>
              {activeTags.filter(t => !['search'].includes(t.type)).length}
            </span>
          )}
        </button>
        {activeTags.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,.3)' }} onClick={clearAll}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Advanced Filter Panel */}
      {filterOpen && (
        <div className="filter-panel open">
          <div className="fp-grid-2">
            <div>
              <div className="fp-label">Status</div>
              <div className="fp-chips">
                {['In Progress','Completed','QC','Rejected','On Hold','Not Started'].map(s => (
                  <div key={s} className={`fp-chip${activeStatus.includes(s) ? ' sel' : ''}`} onClick={() => toggleChip(activeStatus, setActiveStatus, s)}>{s}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="fp-label">Project</div>
              <div className="fp-chips">
                {projectNames.map(s => (
                  <div key={s} className={`fp-chip${activeProject.includes(s) ? ' sel' : ''}`} onClick={() => toggleChip(activeProject, setActiveProject, s)}>{s}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="fp-label">Vendor (Active Process)</div>
              <div className="fp-chips">
                {vendors.map(v => (
                  <div key={v.id} className={`fp-chip${activeVendor.includes(v.name) ? ' sel' : ''}`} onClick={() => toggleChip(activeVendor, setActiveVendor, v.name)}>{v.name}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="fp-label">Has Process</div>
              <div className="fp-chips">
                {processes.map(p => (
                  <div key={p.id} className={`fp-chip${activeProcess.includes(p.name) ? ' sel-p' : ''}`} onClick={() => toggleChip(activeProcess, setActiveProcess, p.name)}>{p.name}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="fp-label">Process Status</div>
              <div className="fp-chips">
                {[
                  { code: 'IN_PRGS',      label: 'In Progress' },
                  { code: 'CMPLT',        label: 'Completed' },
                  { code: 'QC',           label: 'QC Hold' },
                  { code: 'REJECTED',     label: 'Rejected' },
                  { code: 'W_4_RM',       label: 'Waiting RM' },
                  { code: 'W_4_QUT',      label: 'Waiting Quote' },
                  { code: 'PO_APPROVAL',  label: 'PO Approval' },
                  { code: 'W_4_PARTS',    label: 'Waiting Parts' },
                  { code: 'W_F_PAYMENT',  label: 'Waiting Payment' },
                  { code: 'W_F_DECISION', label: 'Waiting Decision' },
                ].map(s => (
                  <div key={s.code} className={`fp-chip${activeProcessStatus.includes(s.code) ? ' sel' : ''}`} onClick={() => toggleChip(activeProcessStatus, setActiveProcessStatus, s.code)}>{s.label}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="fp-label">Schedule</div>
              <div className="fp-chips">
                {[
                  { val: 'On Time', style: { borderColor: 'var(--green)', color: 'var(--green)' } },
                  { val: 'At Risk', style: { borderColor: '#f59e0b',      color: '#f59e0b'      } },
                  { val: 'Delayed', style: { borderColor: 'var(--red)',   color: 'var(--red)'   } },
                ].map(s => (
                  <div
                    key={s.val}
                    className={`fp-chip${scheduleFilter.includes(s.val) ? ' sel' : ''}`}
                    style={scheduleFilter.includes(s.val) ? {} : s.style}
                    onClick={() => toggleChip(scheduleFilter, setScheduleFilter, s.val)}
                  >
                    {s.val}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Tags */}
      {activeTags.length > 0 && (
        <div className="active-tags" style={{ display: 'flex' }}>
          {activeTags.map((tag, i) => (
            <div key={i} className={`atag${tag.type === 'process' ? ' pt' : ''}`}>
              <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>{tag.type}:</span>
              {tag.val}
              <button className="atag-rm" onClick={() => removeTag(tag)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Result count */}
      <div className="res-count">
        Showing <strong>{filtered.length}</strong> of <strong>{parts.length}</strong> parts
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    className="row-check"
                    checked={filtered.length > 0 && filtered.every(p => selected.has(p.id))}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Part ID</th>
                <th>Part Name</th>
                <th>Project</th>
                <th>Qty</th>
                <th>Material</th>
                <th>Grade</th>
                <th>Status</th>
                <th>Proc. Status</th>
                <th>Vendor</th>
                <th>PO #</th>
                <th>Asana</th>
                <th style={{ minWidth: 220 }}>Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr
                  key={p.id}
                  className={selected.has(p.id) ? 'selected' : ''}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDetailPart(p)}
                >
                  <td onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="row-check"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                    />
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>{p.id}</span>
                  </td>
                  <td><strong>{p.name}</strong></td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.project}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{p.qty}</td>
                  <td style={{ fontSize: 12 }}>{p.matType}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.matGrade}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td><ProcStatusBadge status={p.activeProcStatus} name={p.activeProcName} /></td>
                  <td>
                    {p.vendor && p.vendor !== '—'
                      ? <span style={{ fontSize: 12 }}>{p.vendor}</span>
                      : <span style={{ color: 'var(--border2)' }}>—</span>}
                  </td>
                  <td>
                    {p.po && p.po !== '—'
                      ? <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>{p.po}</span>
                      : <span style={{ color: 'var(--border2)' }}>—</span>}
                  </td>
                  <td>
                    {p.asanaId
                      ? <span className="asana-chip">⚓ {p.asanaId.slice(-6)}</span>
                      : <span style={{ color: 'var(--border2)' }}>—</span>
                    }
                  </td>
                  <td>
                    <Pipeline processes={p.processes} currentStep={p.currentStep} status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detailPart && (
        <PartDetailModal
          part={detailPart}
          onClose={() => setDetailPart(null)}
          onRefresh={onPartsChange}
        />
      )}
    </div>
  );
}

export default PartsTable;
