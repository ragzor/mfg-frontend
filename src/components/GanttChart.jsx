import { useState, useMemo, useRef, useEffect } from 'react';
import { useLookups } from '../hooks/useLookups';
import PartDetailModal from './PartDetailModal';

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────
function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function startOfMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function fmtShort(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
function fmtLong(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ─────────────────────────────────────────────
// Process bar color
// ─────────────────────────────────────────────
const PROC_COLORS = {
  'Raw Material Check': '#f59e0b',
  'Laser Cutting':      '#3b82f6',
  'Deburring':          '#8b5cf6',
  'Nitriding':          '#06b6d4',
  'Powder Coating':     '#ec4899',
  'Welding':            '#f97316',
  'Drilling':           '#10b981',
  'Buffing':            '#a78bfa',
  'Cutting':            '#38bdf8',
  'Electroplating':     '#fb7185',
  'JW_Machining':       '#4ade80',
};
const FALLBACK_COLORS = ['#6b7280','#d97706','#7c3aed','#0891b2','#be185d','#15803d','#b45309','#1d4ed8'];
function procColor(name) {
  if (PROC_COLORS[name]) return PROC_COLORS[name];
  // Hash name → consistent color for unknown processes
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}
function barBg(proc) {
  const c = procColor(proc.process_name);
  if (proc.status === 'CMPLT')   return `${c}99`;
  if (proc.status === 'IN_PRGS') return c;
  if (['QC','W_4_RM','W_4_QUT','PO_APPROVAL','W_4_PARTS','W_F_PAYMENT','W_F_DECISION'].includes(proc.status)) return '#f59e0b88';
  if (proc.status === 'REJECTED') return '#ef444488';
  return '#1e2028';
}
function barBorder(proc) {
  const c = procColor(proc.process_name);
  return `1px solid ${c}66`;
}

// Project color palette
const PROJ_PALETTE = ['#f5a623','#3b82f6','#10b981','#8b5cf6','#ec4899','#f97316','#06b6d4','#a78bfa'];
function projColor(name, projects) {
  const idx = projects.indexOf(name);
  return PROJ_PALETTE[idx % PROJ_PALETTE.length] || '#888';
}

// ─────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────
function Tooltip({ tooltip }) {
  if (!tooltip) return null;
  return (
    <div style={{
      position: 'fixed',
      left: tooltip.x + 14, top: tooltip.y - 20,
      background: 'var(--surface)',
      border: '1px solid var(--border2)',
      borderRadius: 4, padding: '10px 14px',
      zIndex: 9999, pointerEvents: 'none',
      boxShadow: '0 8px 24px rgba(0,0,0,.6)',
      minWidth: 200,
    }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
        {tooltip.procName}
      </div>
      {[
        ['Part',    tooltip.partName],
        ['Status',  tooltip.status],
        ['Planned', `${fmtShort(tooltip.plannedStart)} → ${fmtShort(tooltip.plannedEnd)}`],
        tooltip.actualStart ? ['Actual', tooltip.actualEnd
          ? `${fmtShort(tooltip.actualStart)} → ${fmtShort(tooltip.actualEnd)}`
          : `${fmtShort(tooltip.actualStart)} → ongoing`] : null,
        ['Duration', `${tooltip.duration}d planned`],
      ].filter(Boolean).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>
          <span>{k}</span><strong style={{ color: 'var(--text)' }}>{v}</strong>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main GanttChart
// ─────────────────────────────────────────────
export default function GanttChart({ parts = [], loading = false, onPartsChange }) {
  const { projects: liveProjects } = useLookups();

  const [zoom,        setZoom]        = useState('week');
  const [projFilter,  setProjFilter]  = useState('ALL');
  const [tooltip,     setTooltip]     = useState(null);
  const [detailPart,  setDetailPart]  = useState(null);

  const projectNames = useMemo(() => liveProjects.map(p => p.name), [liveProjects]);

  // Build gantt rows from real parts data
  const ganttParts = useMemo(() => {
    return parts
      .filter(p => p.processData && p.processData.length > 0)
      .map(p => {
        const procs = p.processData;
        // Find earliest planned_start across all processes
        const starts = procs.map(pp => pp.planned_start).filter(Boolean).map(d => new Date(d));
        const ends   = procs.map(pp => pp.planned_end).filter(Boolean).map(d => new Date(d));
        const start  = starts.length ? new Date(Math.min(...starts)) : new Date();
        const end    = ends.length   ? new Date(Math.max(...ends))   : addDays(start, 7);
        return { ...p, ganttStart: start, ganttEnd: end };
      });
  }, [parts]);

  const filtered = useMemo(() =>
    projFilter === 'ALL' ? ganttParts : ganttParts.filter(p => p.project === projFilter),
    [ganttParts, projFilter]
  );

  // Date range
  const { minDate, maxDate } = useMemo(() => {
    if (!filtered.length) {
      const today = new Date(); today.setHours(0,0,0,0);
      return { minDate: today, maxDate: addDays(today, 60) };
    }
    let mn = new Date('2099-01-01'), mx = new Date('2000-01-01');
    filtered.forEach(p => {
      if (p.ganttStart < mn) mn = p.ganttStart;
      if (p.ganttEnd   > mx) mx = p.ganttEnd;
    });
    return {
      minDate: startOfMonday(addDays(mn, -7)),
      maxDate: addDays(mx, 21),
    };
  }, [filtered]);

  const [containerWidth, setContainerWidth] = useState(0);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width || 0;
      setContainerWidth(w);
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  const LABEL_W  = 230;
  const totalDays = daysBetween(minDate, maxDate);

  // Weekly: fixed 22px/day. Monthly: fill available width, min 6px/day
  const DAY = useMemo(() => {
    if (zoom === 'week') return 22;
    const available = containerWidth - LABEL_W - 20; // 20px for scrollbar
    if (available > 0 && totalDays > 0) return Math.max(6, available / totalDays);
    return 10;
  }, [zoom, containerWidth, totalDays]);

  const totalPx  = totalDays * DAY;

  const today = new Date(); today.setHours(0,0,0,0);
  const todayPx = daysBetween(minDate, today) * DAY;

  // Month header cells
  const months = useMemo(() => {
    const result = [];
    let mc = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (mc <= maxDate) {
      const me = new Date(mc.getFullYear(), mc.getMonth() + 1, 0);
      const mfrom = mc < minDate ? minDate : mc;
      const mto   = me > maxDate ? maxDate : me;
      result.push({
        label: mc.toLocaleString('default', { month: 'short', year: '2-digit' }),
        days:  daysBetween(mfrom, addDays(mto, 1)),
      });
      mc = new Date(mc.getFullYear(), mc.getMonth() + 1, 1);
    }
    return result;
  }, [minDate, maxDate]);

  // Week header cells
  const weeks = useMemo(() => {
    const result = [];
    let wc = new Date(minDate);
    while (wc < maxDate) {
      const wd = Math.min(7, daysBetween(wc, maxDate));
      result.push({ label: fmtShort(wc), days: wd });
      wc = addDays(wc, 7);
    }
    return result;
  }, [minDate, maxDate]);

  // Group by project, sub-group by material grade
  const groups = useMemo(() => {
    const g = {};
    filtered.forEach(p => {
      const proj  = p.project || 'No Project';
      const grade = p.material_grade || p.materialGrade || 'Unspecified';
      if (!g[proj]) g[proj] = {};
      if (!g[proj][grade]) g[proj][grade] = [];
      g[proj][grade].push(p);
    });
    return g;
  }, [filtered]);

  // Which material sub-groups are expanded — default all collapsed
  const [expandedGrades, setExpandedGrades] = useState({});
  function toggleGrade(proj, grade) {
    const key = `${proj}||${grade}`;
    setExpandedGrades(prev => ({ ...prev, [key]: !prev[key] }));
  }
  function isExpanded(proj, grade) {
    return !!expandedGrades[`${proj}||${grade}`];
  }

  // Summary cards
  const summaries = useMemo(() => {
    return projectNames.map(proj => {
      const gradeMap = groups[proj] || {};
      const pparts   = Object.values(gradeMap).flat();
      if (!pparts.length) return null;
      let pE = new Date('2000-01-01');
      pparts.forEach(p => { if (p.ganttEnd > pE) pE = p.ganttEnd; });
      const done  = pparts.filter(p => p.status === 'Completed').length;
      const pct   = Math.round(done / pparts.length * 100);
      const daysLeft = daysBetween(today, pE);
      return { proj, pE, done, total: pparts.length, pct, daysLeft };
    }).filter(Boolean);
  }, [projectNames, groups, today]);

  function offsetPx(date) {
    return daysBetween(minDate, new Date(date)) * DAY;
  }

  function handleMouseEnter(e, part, proc) {
    setTooltip({
      x: e.clientX, y: e.clientY,
      procName:     proc.process_name,
      partName:     part.name,
      status:       proc.status,
      plannedStart: proc.planned_start,
      plannedEnd:   proc.planned_end,
      actualStart:  proc.actual_start,
      actualEnd:    proc.actual_end,
      duration:     proc.duration_days,
    });
  }
  function handleMouseLeave() { setTooltip(null); }
  useEffect(() => {
    const move = e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null);
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  if (loading) return (
    <div className="page">
      <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12, padding: 20 }}>Loading Gantt...</div>
    </div>
  );

  const gridLines = (h) => months.map((m, i) => (
    <div key={i} style={{ width: m.days * DAY, minWidth: m.days * DAY, height: h, borderRight: '1px solid var(--border)', flexShrink: 0 }} />
  ));

  const todayLine = (h) => todayPx >= 0 && todayPx <= totalPx ? (
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayPx, width: 2, background: 'var(--red)', opacity: .75, zIndex: 6, pointerEvents: 'none', height: h }} />
  ) : null;

  return (
    <div className="page" ref={wrapperRef}>
      {/* Header */}
      <div className="section-hdr">
        <div>
          <div className="section-title">Gantt Chart</div>
          <div className="section-sub">Hover bars for details · Color = process type</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>

        {/* Zoom toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 3, overflow: 'hidden' }}>
          {['week','month'].map(z => (
            <div key={z} onClick={() => setZoom(z)} style={{
              padding: '5px 13px', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 10,
              background: zoom === z ? 'rgba(245,166,35,.12)' : 'transparent',
              color: zoom === z ? 'var(--accent)' : 'var(--muted)',
              borderRight: z === 'week' ? '1px solid var(--border2)' : 'none',
              transition: 'all .15s',
            }}>
              {z === 'week' ? 'Weekly' : 'Monthly'}
            </div>
          ))}
        </div>

        <div style={{ width: 1, height: 18, background: 'var(--border2)' }} />

        {/* Project filter chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['ALL', ...projectNames].map(p => (
            <div key={p} onClick={() => setProjFilter(p)} style={{
              padding: '4px 10px', border: '1px solid var(--border2)', borderRadius: 2,
              fontFamily: 'var(--mono)', fontSize: 10, cursor: 'pointer',
              textTransform: 'uppercase', transition: 'all .12s',
              color:      projFilter === p ? 'var(--accent)' : 'var(--muted)',
              borderColor: projFilter === p ? 'var(--accent)' : 'var(--border2)',
              background:  projFilter === p ? 'rgba(245,166,35,.08)' : 'transparent',
            }}>
              {p === 'ALL' ? 'All Projects' : p}
            </div>
          ))}
        </div>

        <div style={{ width: 1, height: 18, background: 'var(--border2)' }} />

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { bg: 'var(--green)', opacity: .7, label: 'Completed' },
            { bg: '#3b82f6',      opacity: 1,  label: 'In Progress' },
            { bg: '#f59e0b',      opacity: .7, label: 'On Hold' },
            { bg: '#1e2028',      opacity: 1,  label: 'Not Started', border: '1px solid var(--border2)' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.bg, opacity: l.opacity, border: l.border || 'none' }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{l.label}</span>
            </div>
          ))}
          <div style={{ width: 1, height: 14, background: 'var(--border2)', margin: '0 2px' }} />
          {/* Planned vs Actual */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 8, borderRadius: 2, background: '#3b82f6', opacity: 0.4 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>Planned</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 8, borderRadius: 2, background: '#3b82f6', opacity: 0.9 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>Actual</span>
          </div>
          <div style={{ width: 1, height: 14, background: 'var(--border2)', margin: '0 2px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 0, borderTop: '2px dashed var(--accent)', opacity: .8 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>Target</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 2, height: 13, background: 'var(--red)', opacity: .7 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>Today</span>
          </div>
        </div>
      </div>

      {/* Gantt table */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: '50px', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
          NO PARTS TO DISPLAY
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
            <div style={{ display: 'inline-block', minWidth: '100%', width: LABEL_W + totalPx }}>

              {/* Sticky header */}
              <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 8, background: 'var(--surface)' }}>
                {/* Label col */}
                <div style={{ width: LABEL_W, minWidth: LABEL_W, background: 'var(--surface2)', borderRight: '1px solid var(--border2)', flexShrink: 0 }}>
                  <div style={{ height: 50, display: 'flex', alignItems: 'center', padding: '0 14px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.12em', borderBottom: '2px solid var(--border2)' }}>
                    Part / Project
                  </div>
                </div>
                {/* Timeline header */}
                <div style={{ flex: 1, overflow: 'hidden', width: totalPx, minWidth: totalPx }}>
                  {/* Month row */}
                  <div style={{ display: 'flex', height: 25, borderBottom: '1px solid var(--border)' }}>
                    {months.map((m, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: m.days * DAY, minWidth: m.days * DAY, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', borderRight: '1px solid var(--border2)', flexShrink: 0, overflow: 'hidden' }}>
                        {m.label}
                      </div>
                    ))}
                  </div>
                  {/* Week/day row */}
                  <div style={{ display: 'flex', height: 25, borderBottom: '2px solid var(--border2)' }}>
                    {zoom === 'week'
                      ? weeks.map((w, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: w.days * DAY, minWidth: w.days * DAY, fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--border2)', borderRight: '1px solid var(--border)', flexShrink: 0, overflow: 'hidden' }}>
                            {w.label}
                          </div>
                        ))
                      : months.map((m, i) => (
                          <div key={i} style={{ width: m.days * DAY, minWidth: m.days * DAY, borderRight: '1px solid var(--border)', flexShrink: 0 }} />
                        ))
                    }
                  </div>
                </div>
              </div>

              {/* Rows — projects with collapsible material grade sub-groups */}
              {projectNames.map(proj => {
                const gradeMap = groups[proj];
                if (!gradeMap || !Object.keys(gradeMap).length) return null;
                const color    = projColor(proj, projectNames);
                const allParts = Object.values(gradeMap).flat();
                const grades   = Object.keys(gradeMap).sort();

                let pS = new Date('2099-01-01'), pE = new Date('2000-01-01');
                allParts.forEach(p => { if (p.ganttStart < pS) pS = p.ganttStart; if (p.ganttEnd > pE) pE = p.ganttEnd; });
                const psOff = offsetPx(pS), peOff = offsetPx(pE);

                return (
                  <div key={proj}>
                    {/* ── Project header ── */}
                    <div style={{ display:'flex', background:'var(--surface2)', borderBottom:'1px solid var(--border2)' }}>
                      <div style={{ width:LABEL_W, minWidth:LABEL_W, padding:'10px 14px', display:'flex', alignItems:'center', gap:8, borderRight:'1px solid var(--border2)', flexShrink:0 }}>
                        <div style={{ width:10, height:10, borderRadius:2, flexShrink:0, background:color }} />
                        <div>
                          <div style={{ fontFamily:'var(--display)', fontSize:14, fontWeight:700, color }}>{proj}</div>
                          <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)', marginTop:1 }}>
                            {allParts.length} parts · {grades.length} grade{grades.length>1?'s':''} · Target: {fmtLong(pE)}
                          </div>
                        </div>
                      </div>
                      <div style={{ flex:1, height:50, position:'relative' }}>
                        <div style={{ position:'absolute', inset:0, display:'flex', pointerEvents:'none' }}>{gridLines(50)}</div>
                        <div style={{ position:'absolute', height:6, top:22, left:psOff, width:Math.max(peOff-psOff,4), borderRadius:2, background:color, opacity:.3, zIndex:1 }} />
                        <div style={{ position:'absolute', left:psOff, height:22, top:14, width:Math.max(peOff-psOff,80), borderRadius:3, background:`${color}22`, border:`1px solid ${color}44`, display:'flex', alignItems:'center', padding:'0 8px', fontFamily:'var(--mono)', fontSize:9, color, whiteSpace:'nowrap', overflow:'hidden', zIndex:2 }}>
                          {fmtShort(pS)} → {fmtLong(pE)}
                        </div>
                        <div style={{ position:'absolute', top:0, bottom:0, left:peOff, width:0, borderLeft:`2px dashed ${color}`, opacity:.6, zIndex:5, pointerEvents:'none', height:50 }} />
                        {todayLine(50)}
                      </div>
                    </div>

                    {/* ── Material grade sub-rows ── */}
                    {grades.map(grade => {
                      const gparts   = gradeMap[grade];
                      const expanded = isExpanded(proj, grade);
                      let gS = new Date('2099-01-01'), gE = new Date('2000-01-01');
                      gparts.forEach(p => { if (p.ganttStart < gS) gS = p.ganttStart; if (p.ganttEnd > gE) gE = p.ganttEnd; });
                      const gsOff = offsetPx(gS), geOff = offsetPx(gE);
                      const doneCount = gparts.filter(p => p.status === 'Completed').length;

                      return (
                        <div key={grade}>
                          {/* Grade sub-header — click to expand/collapse */}
                          <div
                            onClick={() => toggleGrade(proj, grade)}
                            style={{ display:'flex', background:`${color}09`, borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background .12s' }}
                            onMouseEnter={e => e.currentTarget.style.background=`${color}16`}
                            onMouseLeave={e => e.currentTarget.style.background=`${color}09`}
                          >
                            <div style={{ width:LABEL_W, minWidth:LABEL_W, padding:'7px 14px 7px 20px', display:'flex', alignItems:'center', gap:7, borderRight:'1px solid var(--border2)', flexShrink:0 }}>
                              <div style={{ width:18, height:18, borderRadius:3, border:`1px solid ${color}55`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:13, color, flexShrink:0, fontWeight:700, lineHeight:1 }}>
                                {expanded ? '−' : '+'}
                              </div>
                              <div style={{ width:8, height:8, borderRadius:2, background:`${color}99`, flexShrink:0 }} />
                              <div>
                                <div style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:700, color }}>{grade}</div>
                                <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)' }}>
                                  {gparts.length} part{gparts.length>1?'s':''} · {doneCount}/{gparts.length} done · click to {expanded?'collapse':'expand'}
                                </div>
                              </div>
                            </div>
                            <div style={{ flex:1, height:40, position:'relative' }}>
                              <div style={{ position:'absolute', inset:0, display:'flex', pointerEvents:'none' }}>{gridLines(40)}</div>
                              <div style={{ position:'absolute', height:4, top:18, left:gsOff, width:Math.max(geOff-gsOff,4), borderRadius:2, background:color, opacity:.2, zIndex:1 }} />
                              {/* Collapsed: show tiny part id chips */}
                              {!expanded && gparts.map((p,pi) => {
                                const bL = offsetPx(p.ganttStart);
                                const bW = Math.max(daysBetween(p.ganttStart,p.ganttEnd)*DAY, 24);
                                const sc = {'Completed':'var(--green)','In Progress':'#3b82f6','On Hold':'#f59e0b'}[p.status]||'var(--border2)';
                                return (
                                  <div key={pi} style={{ position:'absolute', height:22, top:9, left:bL, width:Math.max(bW,28), borderRadius:2, background:`${sc}18`, border:`1px solid ${sc}44`, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', zIndex:2 }}>
                                    <span style={{ fontFamily:'var(--mono)', fontSize:7, color:sc, fontWeight:700, padding:'0 3px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.id}</span>
                                  </div>
                                );
                              })}
                              {todayLine(40)}
                            </div>
                          </div>

                          {/* Expanded part rows */}
                          {expanded && gparts.map(part => {
                            const ptOff = offsetPx(part.ganttEnd);
                            const sc = {'Completed':'var(--green)','In Progress':'#3b82f6','On Hold':'#f59e0b','Not Started':'var(--border2)','QC':'#a855f7','Rejected':'var(--red)'}[part.status]||'var(--border2)';
                            return (
                              <div key={part.id} style={{ display:'flex', borderBottom:'1px solid var(--border)', borderLeft:`3px solid ${sc}` }}>
                                <div
                                  onClick={() => setDetailPart(part)}
                                  title="Click to view part details"
                                  style={{ width:LABEL_W, minWidth:LABEL_W, padding:'0 14px 0 44px', display:'flex', alignItems:'center', gap:6, borderRight:'1px solid var(--border2)', flexShrink:0, minHeight:62, cursor:'pointer', transition:'background .12s' }}
                                  onMouseEnter={e => e.currentTarget.style.background='rgba(245,166,35,.05)'}
                                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                                >
                                  <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--accent)', flexShrink:0 }}>{part.id}</div>
                                  <div style={{ overflow:'hidden', flex:1 }}>
                                    <div style={{ fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'flex', alignItems:'center', gap:4 }}>
                                      <span style={{ width:6, height:6, borderRadius:'50%', background:sc, flexShrink:0, display:'inline-block' }} />
                                      {part.name}
                                    </div>
                                    <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)', marginTop:1 }}>Due: {fmtShort(part.ganttEnd)}</div>
                                    <div style={{ fontFamily:'var(--mono)', fontSize:9, color:sc, marginTop:1 }}>{part.status}</div>
                                  </div>
                                  <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--border2)', flexShrink:0 }}>↗</span>
                                </div>
                                <div style={{ flex:1, height:62, position:'relative' }}>
                                  <div style={{ position:'absolute', inset:0, display:'flex', pointerEvents:'none' }}>{gridLines(62)}</div>
                                  {part.processData.map((proc,pi) => {
                                    if (!proc.planned_start||!proc.planned_end) return null;
                                    const left  = offsetPx(proc.planned_start);
                                    const width = Math.max(daysBetween(proc.planned_start,proc.planned_end)*DAY,4);
                                    const bg=barBg(proc), bd=barBorder(proc), c=procColor(proc.process_name);
                                    const hasActual=!!proc.actual_start;
                                    const actualEnd=proc.actual_end||new Date().toISOString().slice(0,10);
                                    const aLeft=hasActual?offsetPx(proc.actual_start):0;
                                    const aWidth=hasActual?Math.max(daysBetween(proc.actual_start,actualEnd)*DAY,4):0;
                                    const isOngoing=hasActual&&!proc.actual_end;
                                    return (
                                      <div key={pi}>
                                        <div onMouseEnter={e=>handleMouseEnter(e,part,proc)} onMouseLeave={handleMouseLeave}
                                          style={{ position:'absolute', height:18, top:6, left, width:width-2, borderRadius:3, background:bg, border:bd, display:'flex', alignItems:'center', padding:'0 6px', fontFamily:'var(--mono)', fontSize:8, whiteSpace:'nowrap', overflow:'hidden', cursor:'default', zIndex:2, opacity:0.5 }}
                                          onMouseOver={e=>e.currentTarget.style.filter='brightness(1.3)'}
                                          onMouseOut={e=>e.currentTarget.style.filter='brightness(1)'}>
                                          {width>55&&<span style={{color:'#fff',fontSize:8,overflow:'hidden',textOverflow:'ellipsis'}}>{proc.process_name}</span>}
                                        </div>
                                        {hasActual&&(
                                          <div onMouseEnter={e=>handleMouseEnter(e,part,proc)} onMouseLeave={handleMouseLeave}
                                            style={{ position:'absolute', height:18, top:28, left:aLeft, width:aWidth-2, borderRadius:3, background:c, border:isOngoing?`1px dashed ${c}`:`1px solid ${c}`, display:'flex', alignItems:'center', padding:'0 6px', fontFamily:'var(--mono)', fontSize:8, whiteSpace:'nowrap', overflow:'hidden', cursor:'default', zIndex:2, opacity:0.9 }}
                                            onMouseOver={e=>e.currentTarget.style.filter='brightness(1.3)'}
                                            onMouseOut={e=>e.currentTarget.style.filter='brightness(1)'}>
                                            {aWidth>55&&<span style={{color:'#fff',fontSize:8}}>{isOngoing?'⟶ ongoing':proc.process_name}</span>}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  <div style={{ position:'absolute', top:0, left:ptOff, height:62, width:0, borderLeft:'2px dashed var(--accent)', opacity:.5, zIndex:5, pointerEvents:'none' }} />
                                  {todayLine(62)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {summaries.length > 0 && (
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:18 }}>
          {summaries.map(s => {
            const color = projColor(s.proj, projectNames);
            return (
              <div key={s.proj} style={{ flex:'1 1 190px', minWidth:190, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:14 }}>
                <div style={{ fontFamily:'var(--display)', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', gap:7, marginBottom:8 }}>
                  <div style={{ width:10, height:10, borderRadius:2, background:color }} />
                  {s.proj}
                </div>
                <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(245,166,35,.12)', color:'var(--accent)', border:'1px solid rgba(245,166,35,.3)', padding:'3px 9px', borderRadius:2, fontFamily:'var(--mono)', fontSize:10, fontWeight:600, marginBottom:8 }}>
                  ⚑ {fmtLong(s.pE)}
                </div>
                <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)', marginBottom:6 }}>
                  {s.daysLeft>0 ? `${s.daysLeft} days remaining` : <span style={{color:'var(--red)'}}>⚠ {Math.abs(s.daysLeft)} days overdue</span>}
                </div>
                <div style={{ height:4, background:'var(--border)', borderRadius:2, overflow:'hidden', marginBottom:5 }}>
                  <div style={{ height:'100%', width:`${s.pct}%`, background:color, borderRadius:2 }} />
                </div>
                <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>
                  {s.done}/{s.total} complete · <span style={{color}}>{s.pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Tooltip tooltip={tooltip} />

      {detailPart && (
        <PartDetailModal
          part={detailPart}
          onClose={() => setDetailPart(null)}
          onRefresh={() => { onPartsChange?.(); }}
        />
      )}
    </div>
  );
}
