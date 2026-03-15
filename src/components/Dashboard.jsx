import { useMemo } from 'react';
import { useLookups } from '../hooks/useLookups';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const PROJ_PALETTE = ['#f5a623','#3b82f6','#10b981','#8b5cf6','#ec4899','#f97316','#06b6d4','#a78bfa'];
function projColor(idx) { return PROJ_PALETTE[idx % PROJ_PALETTE.length]; }

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ─────────────────────────────────────────────
// MetricCard
// ─────────────────────────────────────────────

function MetricCard({ label, value, sub, color, pct, icon }) {
  return (
    <div className="card" style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      {icon && <div style={{ position: 'absolute', right: 14, top: 14, fontSize: 22, opacity: 0.12, color }}>{icon}</div>}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 36, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>{sub}</div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{ height: 3, background: color, borderRadius: 2, width: `${Math.min(pct, 100)}%`, transition: 'width .4s ease' }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ProjectCard
// ─────────────────────────────────────────────

function ProjectCard({ proj, done, total, pct, target, daysLeftVal, hasDelay, color }) {
  const overdue = daysLeftVal !== null && daysLeftVal < 0;
  const soon    = daysLeftVal !== null && daysLeftVal >= 0 && daysLeftVal <= 7;
  return (
    <div className="card" style={{ padding: '16px 18px', borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15 }}>{proj}</div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 2, background: 'rgba(59,130,246,.12)', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          IN PROGRESS
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
          <div style={{ height: 4, background: color, borderRadius: 2, width: `${pct}%`, transition: 'width .4s' }} />
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{pct}%</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color }}>{done}/{total} parts complete</span>
        {target && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>TARGET</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: overdue ? 'var(--red)' : soon ? '#f59e0b' : 'var(--muted)' }}>
              {fmtDate(target)}
              {daysLeftVal !== null && (
                <span style={{ marginLeft: 4, fontSize: 9 }}>
                  {overdue ? `(${Math.abs(daysLeftVal)}d late)` : `(${daysLeftVal}d left)`}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
      {hasDelay && <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>⚠ Delayed processes</div>}
    </div>
  );
}

// ─────────────────────────────────────────────
// SectionHeader
// ─────────────────────────────────────────────

function SectionHeader({ title, sub, count }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
      <div>
        <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16 }}>{title}</div>
        {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      {count !== undefined && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 3 }}>{count} items</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Shared table primitives
// ─────────────────────────────────────────────

const TH = ({ children, align = 'left' }) => (
  <th style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '8px 12px', textAlign: align, fontWeight: 600, borderBottom: '1px solid var(--border2)', whiteSpace: 'nowrap' }}>
    {children}
  </th>
);

const TD = ({ children, mono, color, align = 'left' }) => (
  <td style={{ padding: '10px 12px', fontSize: mono ? 11 : 13, fontFamily: mono ? 'var(--mono)' : 'inherit', color: color || 'var(--text)', textAlign: align, borderBottom: '1px solid var(--border)' }}>
    {children}
  </td>
);

function StatusChip({ status }) {
  const map = {
    IN_PRGS: { label: 'In Progress',       color: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
    M_SEND:  { label: 'Material Sent',     color: '#06b6d4', bg: 'rgba(6,182,212,.12)'  },
    M_RCV:   { label: 'Material Received', color: '#10b981', bg: 'rgba(16,185,129,.12)' },
  };
  const s = map[status] || { label: status, color: 'var(--muted)', bg: 'var(--border)' };
  return <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 2, background: s.bg, color: s.color }}>{s.label}</span>;
}

// ─────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────

export default function Dashboard({ parts = [], loading = false }) {
  const { projects: liveProjects } = useLookups();
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  // Metrics
  const total     = parts.length;
  const completed = parts.filter(p => p.status === 'Completed').length;
  const inProg    = parts.filter(p => p.status === 'In Progress').length;
  const onHold    = parts.filter(p => ['On Hold','QC'].includes(p.status)).length;
  const compPct   = total ? Math.round(completed / total * 100) : 0;

  // Project summaries
  const projectSummaries = useMemo(() => {
    return liveProjects.map((proj, idx) => {
      const pparts = parts.filter(p => p.project === proj.name);
      if (!pparts.length) return null;
      const done  = pparts.filter(p => p.status === 'Completed').length;
      const pct   = Math.round(done / pparts.length * 100);
      const ends  = pparts.flatMap(p => (p.processData || []).map(pp => pp.planned_end).filter(Boolean)).map(d => new Date(d));
      const target = ends.length ? new Date(Math.max(...ends)) : null;
      const dl = target ? Math.round((target - today) / 86400000) : null;
      const hasDelay = pparts.some(p => (p.processData || []).some(pp => ['IN_PRGS','QC'].includes(pp.status) && pp.planned_end && today > new Date(pp.planned_end)));
      return { proj: proj.name, total: pparts.length, done, pct, target, daysLeftVal: dl, hasDelay, color: projColor(idx) };
    }).filter(Boolean);
  }, [liveProjects, parts, today]);

  // Active vendor POs — grouped by vendor → unique POs with latest planned end
  const vendorGrouped = useMemo(() => {
    const map = {};
    parts.forEach(p => {
      (p.processData || []).forEach(pp => {
        if (pp.status === 'IN_PRGS' && pp.vendor && pp.po_number) {
          const key = `${pp.vendor}|||${pp.po_number}`;
          if (!map[key]) map[key] = { vendor: pp.vendor, po: pp.po_number, plannedEnds: [], partCount: 0 };
          map[key].partCount += 1;
          if (pp.planned_end) map[key].plannedEnds.push(new Date(pp.planned_end));
        }
      });
    });
    return Object.values(map).map(r => ({
      ...r,
      latestEnd: r.plannedEnds.length ? new Date(Math.max(...r.plannedEnds)) : null,
      overdue:   r.plannedEnds.length ? r.plannedEnds.every(d => today > d) : false,
    })).sort((a, b) => a.vendor.localeCompare(b.vendor));
  }, [parts, today]);

  // M_SEND / M_RCV — deduplicated by vendor + PO
  const materialPOs = useMemo(() => {
    const dedup = (status) => {
      const map = {};
      parts.forEach(p => {
        (p.processData || []).forEach(pp => {
          if (pp.status === status && pp.po_number) {
            const key = `${pp.vendor || '—'}|||${pp.po_number}`;
            map[key] = { vendor: pp.vendor || '—', po: pp.po_number };
          }
        });
      });
      return Object.values(map).sort((a, b) => a.vendor.localeCompare(b.vendor));
    };
    return { sent: dedup('M_SEND'), received: dedup('M_RCV') };
  }, [parts]);

  if (loading && !parts.length) return (
    <div className="page">
      <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12, padding: 20 }}>Loading dashboard...</div>
    </div>
  );

  return (
    <div className="page">

      {/* ── Metric strip ── */}
      <div className="grid4" style={{ marginBottom: 24 }}>
        <MetricCard label="Total Parts"  value={total}     sub={`Across ${liveProjects.length} projects`} color="var(--accent)" icon="⬡" pct={100} />
        <MetricCard label="Completed"    value={completed} sub={`${compPct}% rate`}                       color="var(--green)"  pct={compPct} />
        <MetricCard label="In Progress"  value={inProg}    sub="Active manufacturing"                     color="#3b82f6"       pct={total ? inProg/total*100 : 0} />
        <MetricCard label="On Hold"      value={onHold}    sub={onHold ? 'Needs attention' : 'None on hold'} color="#f59e0b"   pct={total ? onHold/total*100 : 0} />
      </div>

      {/* ── Projects ── */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader title="Projects" sub="Target completion dates and part progress" />
        {projectSummaries.length === 0
          ? <div className="card" style={{ padding: 20, color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>No projects with parts yet.</div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {projectSummaries.map(s => <ProjectCard key={s.proj} {...s} />)}
            </div>
        }
      </div>

      {/* ── Active Vendor POs — grouped ── */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader title="Active Vendor POs" sub="Grouped by vendor · in-progress processes" count={vendorGrouped.length} />
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {vendorGrouped.length === 0
            ? <div style={{ padding: 20, color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>No active vendor POs</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><TH>Vendor</TH><TH>PO #</TH><TH align="right">Parts</TH><TH>Latest End</TH><TH>Status</TH></tr>
                </thead>
                <tbody>
                  {vendorGrouped.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                      <TD><span style={{ fontWeight: 600 }}>{r.vendor}</span></TD>
                      <TD mono color="var(--accent)">{r.po}</TD>
                      <TD mono align="right" color="var(--muted)">{r.partCount}</TD>
                      <TD mono color={r.overdue ? 'var(--red)' : 'var(--muted)'}>
                        {r.latestEnd ? fmtDate(r.latestEnd) : '—'}
                        {r.overdue && <span style={{ marginLeft: 5, fontSize: 9, background: 'rgba(239,68,68,.15)', color: 'var(--red)', padding: '1px 5px', borderRadius: 2 }}>OVERDUE</span>}
                      </TD>
                      <TD><StatusChip status="IN_PRGS" /></TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      </div>

      {/* ── Material Sent + Received ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

        <div>
          <SectionHeader title="Material Sent" sub="POs dispatched to vendor" count={materialPOs.sent.length} />
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {materialPOs.sent.length === 0
              ? <div style={{ padding: 20, color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>No material sent</div>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><TH>Vendor</TH><TH>PO #</TH></tr></thead>
                  <tbody>
                    {materialPOs.sent.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                        <TD><span style={{ fontWeight: 600 }}>{r.vendor}</span></TD>
                        <TD mono color="var(--accent)">{r.po}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>
        </div>

        <div>
          <SectionHeader title="Material Received" sub="POs received back from vendor" count={materialPOs.received.length} />
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {materialPOs.received.length === 0
              ? <div style={{ padding: 20, color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>No material received</div>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><TH>Vendor</TH><TH>PO #</TH></tr></thead>
                  <tbody>
                    {materialPOs.received.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                        <TD><span style={{ fontWeight: 600 }}>{r.vendor}</span></TD>
                        <TD mono color="var(--accent)">{r.po}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>
        </div>

      </div>

    </div>
  );
}
