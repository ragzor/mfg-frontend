import { useState, useEffect, useMemo } from 'react';
import { getBottlenecks, getPartDelays, getScheduleVariance } from '../api/metrics';

// ─── tiny helpers ───────────────────────────────────────────────
function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─── health colour (green → amber → red) ─────────────────────────
function healthColor(pct) {
  if (pct >= 80) return 'var(--green)';
  if (pct >= 50) return '#f59e0b';
  return 'var(--red)';
}
function delayColor(days) {
  if (days <= 0) return 'var(--green)';
  if (days <= 3) return '#f59e0b';
  return 'var(--red)';
}

// ─── process colour palette (matches Gantt) ────────────────────
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
const FALLBACK = ['#6b7280','#d97706','#7c3aed','#0891b2','#be185d','#15803d'];
function procColor(name) {
  if (PROC_COLORS[name]) return PROC_COLORS[name];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return FALLBACK[h % FALLBACK.length];
}

// ─── tiny donut ───────────────────────────────────────────────────
function Donut({ pct, color, size = 52 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border2)" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily:'var(--mono)', fontSize: size < 50 ? 8 : 10, fill: color, fontWeight: 700 }}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

// ─── stat card ────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent = 'var(--accent)', icon }) {
  return (
    <div style={{ flex: '1 1 160px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      {icon && <div style={{ fontSize: 22, flexShrink: 0 }}>{icon}</div>}
      <div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>{label}</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── section wrapper ─────────────────────────────────────────────
function Section({ title, sub, children, action }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700 }}>{title}</div>
          {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BOTTLENECK CARD
// ═══════════════════════════════════════════════════════════════
function BottleneckCard({ item, maxAvg }) {
  const color   = procColor(item.process_name);
  const barPct  = maxAvg > 0 ? (item.average_delay / maxAvg) * 100 : 0;
  const onTimePct = item.on_time_percentage;
  const hColor  = healthColor(onTimePct);

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${color}`, borderRadius: 4, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      {/* Donut */}
      <Donut pct={onTimePct} color={hColor} size={56} />

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.process_name}
        </div>
        {/* Delay bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 3, transition: 'width .6s ease' }} />
          </div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: delayColor(item.average_delay), whiteSpace: 'nowrap' }}>
            avg +{item.average_delay}d
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            ['max delay', `${item.max_delay}d`, delayColor(item.max_delay)],
            ['completed', item.total_completed, 'var(--text)'],
            ['delayed',   item.delayed_count,   item.delayed_count > 0 ? 'var(--red)' : 'var(--green)'],
          ].map(([k, v, c]) => (
            <div key={k}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--muted)', textTransform: 'uppercase' }}>{k}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PART DELAY TABLE
// ═══════════════════════════════════════════════════════════════
function PartDelayTable({ data }) {
  const [sort, setSort] = useState('desc'); // asc | desc
  const [search, setSearch] = useState('');

  const sorted = useMemo(() => {
    let rows = data.filter(r =>
      !search ||
      r.part_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.part_name?.toLowerCase().includes(search.toLowerCase())
    );
    rows = [...rows].sort((a, b) =>
      sort === 'desc'
        ? b.max_process_delay_days - a.max_process_delay_days
        : a.max_process_delay_days - b.max_process_delay_days
    );
    return rows;
  }, [data, sort, search]);

  const maxDelay = Math.max(...data.map(r => r.max_process_delay_days), 1);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
      {/* Table toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border2)', background: 'var(--surface2)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search part…"
          style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 3, padding: '5px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', outline: 'none' }}
        />
        <div
          onClick={() => setSort(s => s === 'desc' ? 'asc' : 'desc')}
          title="Toggle sort"
          style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none', padding: '5px 8px', border: '1px solid var(--border2)', borderRadius: 3 }}>
          {sort === 'desc' ? '↓ worst first' : '↑ best first'}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>{sorted.length} parts</div>
      </div>

      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 80px', gap: 0, background: 'var(--surface2)', borderBottom: '1px solid var(--border2)' }}>
        {['Part Number', 'Part Name', 'Max Delay', ''].map(h => (
          <div key={h} style={{ padding: '7px 14px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {sorted.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>No data</div>
        )}
        {sorted.map((row, i) => {
          const delay = row.max_process_delay_days;
          const barW  = clamp((delay / maxDelay) * 100, 0, 100);
          const dc    = delayColor(delay);
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 80px', borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>{row.part_number}</div>
              <div style={{ padding: '10px 14px', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.part_name}</div>
              {/* Bar cell */}
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${barW}%`, background: dc, borderRadius: 2 }} />
                </div>
              </div>
              {/* Days badge */}
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: dc }}>
                  {delay > 0 ? `+${delay}d` : '✓ on time'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULE VARIANCE TABLE
// ═══════════════════════════════════════════════════════════════
function ScheduleVarianceTable({ data }) {
  const [filter, setFilter] = useState('all'); // all | behind | ahead | ontime

  const filtered = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.variance_days - a.variance_days);
    if (filter === 'behind')  return sorted.filter(r => r.variance_days > 0);
    if (filter === 'ahead')   return sorted.filter(r => r.variance_days < 0);
    if (filter === 'ontime')  return sorted.filter(r => r.variance_days === 0);
    return sorted;
  }, [data, filter]);

  const behind  = data.filter(r => r.variance_days > 0).length;
  const ahead   = data.filter(r => r.variance_days < 0).length;
  const ontime  = data.filter(r => r.variance_days === 0).length;

  const maxAbs = Math.max(...data.map(r => Math.abs(r.variance_days)), 1);

  const FILTERS = [
    { id: 'all',    label: `All (${data.length})` },
    { id: 'behind', label: `Behind (${behind})`,  color: 'var(--red)' },
    { id: 'ahead',  label: `Ahead (${ahead})`,    color: 'var(--green)' },
    { id: 'ontime', label: `On time (${ontime})`, color: 'var(--muted)' },
  ];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--border2)', background: 'var(--surface2)', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <div key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '3px 10px', borderRadius: 2, cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 9, textTransform: 'uppercase',
            border: '1px solid var(--border2)',
            background: filter === f.id ? 'rgba(245,166,35,.1)' : 'transparent',
            color: filter === f.id ? (f.color || 'var(--accent)') : 'var(--muted)',
            borderColor: filter === f.id ? (f.color || 'var(--accent)') : 'var(--border2)',
            transition: 'all .12s',
          }}>{f.label}</div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 110px 110px 200px', background: 'var(--surface2)', borderBottom: '1px solid var(--border2)' }}>
        {['Part No.', 'Part', 'Original', 'Forecast', 'Variance'].map(h => (
          <div key={h} style={{ padding: '7px 14px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>No data</div>
        )}
        {filtered.map((row, i) => {
          const v   = row.variance_days;
          const vc  = v > 0 ? 'var(--red)' : v < 0 ? 'var(--green)' : 'var(--muted)';
          const barPct = (Math.abs(v) / maxAbs) * 100;
          const label = v > 0 ? `+${v}d behind` : v < 0 ? `${Math.abs(v)}d ahead` : 'on time';
          return (
            <div key={i}
              style={{ display: 'grid', gridTemplateColumns: '100px 1fr 110px 110px 200px', borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>{row.part_number}</div>
              <div style={{ padding: '10px 14px', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>—</div>
              <div style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{fmt(row.original_target_date)}</div>
              <div style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: v > 0 ? 'var(--red)' : 'var(--text)' }}>{fmt(row.forecast_target_date)}</div>
              {/* Diverging bar */}
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${barPct}%`, background: vc, borderRadius: 3, marginLeft: v >= 0 ? 0 : 'auto' }} />
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: vc, whiteSpace: 'nowrap', minWidth: 72 }}>{label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function ProcessTracking() {
  const [bottlenecks, setBottlenecks]   = useState([]);
  const [partDelays,  setPartDelays]    = useState([]);
  const [variance,    setVariance]      = useState([]);
  const [loading,     setLoading]       = useState(true);
  const [error,       setError]         = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getBottlenecks(),
      getPartDelays(),
      getScheduleVariance(),
    ]).then(([bn, pd, sv]) => {
      setBottlenecks(bn || []);
      setPartDelays(pd || []);
      setVariance(sv || []);
    }).catch(e => setError(e.message || 'Failed to load metrics'))
      .finally(() => setLoading(false));
  }, []);

  // ── derived summary stats ────────────────────────────────────
  const stats = useMemo(() => {
    const totalProcs     = bottlenecks.reduce((s, b) => s + b.total_completed, 0);
    const delayedProcs   = bottlenecks.reduce((s, b) => s + b.delayed_count, 0);
    const onTimePct      = totalProcs > 0 ? ((totalProcs - delayedProcs) / totalProcs) * 100 : 0;
    const avgDelay       = bottlenecks.length > 0 ? bottlenecks.reduce((s, b) => s + b.average_delay, 0) / bottlenecks.length : 0;
    const worstProc      = bottlenecks[0]?.process_name || '—';
    const behindParts    = variance.filter(r => r.variance_days > 0).length;
    const delayedParts   = partDelays.filter(r => r.max_process_delay_days > 0).length;
    return { totalProcs, delayedProcs, onTimePct, avgDelay, worstProc, behindParts, delayedParts };
  }, [bottlenecks, partDelays, variance]);

  const maxAvgDelay = useMemo(() => Math.max(...bottlenecks.map(b => b.average_delay), 1), [bottlenecks]);

  if (loading) return (
    <div className="page">
      <div style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12, padding: 20 }}>Loading metrics…</div>
    </div>
  );

  if (error) return (
    <div className="page">
      <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 12, padding: 20 }}>⚠ {error}</div>
    </div>
  );

  return (
    <div className="page">

      {/* ── Header ── */}
      <div className="section-hdr">
        <div>
          <div className="section-title">Process Tracking</div>
          <div className="section-sub">Bottlenecks · Part delays · Schedule variance</div>
        </div>
      </div>

      {/* ── Summary KPI strip ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <StatCard
          label="On-time rate"
          value={`${Math.round(stats.onTimePct)}%`}
          sub={`${stats.totalProcs} completed processes`}
          accent={healthColor(stats.onTimePct)}
          icon="🎯"
        />
        <StatCard
          label="Avg process delay"
          value={`${stats.avgDelay.toFixed(1)}d`}
          sub={`across ${bottlenecks.length} process types`}
          accent={delayColor(stats.avgDelay)}
          icon="⏱"
        />
        <StatCard
          label="Worst bottleneck"
          value={stats.worstProc}
          sub="highest average delay"
          accent={procColor(stats.worstProc)}
          icon="⚠"
        />
        <StatCard
          label="Parts behind schedule"
          value={stats.behindParts}
          sub={`of ${variance.length} tracked parts`}
          accent={stats.behindParts > 0 ? 'var(--red)' : 'var(--green)'}
          icon="📅"
        />
        <StatCard
          label="Parts with delay"
          value={stats.delayedParts}
          sub={`of ${partDelays.length} parts`}
          accent={stats.delayedParts > 0 ? '#f59e0b' : 'var(--green)'}
          icon="🔧"
        />
      </div>

      {/* ── Bottlenecks ── */}
      <Section
        title="Process Bottlenecks"
        sub="Sorted by average delay — completed processes only"
      >
        {bottlenecks.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--muted)', fontSize: 11 }}>
            No completed process data yet
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {bottlenecks.map(b => (
              <BottleneckCard key={b.process_name} item={b} maxAvg={maxAvgDelay} />
            ))}
          </div>
        )}
      </Section>

      {/* ── Part Delays ── */}
      <Section
        title="Part Delay Summary"
        sub="Maximum process delay across each part's entire workflow"
      >
        {partDelays.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--muted)', fontSize: 11 }}>
            No part delay data yet
          </div>
        ) : (
          <PartDelayTable data={partDelays} />
        )}
      </Section>

      {/* ── Schedule Variance ── */}
      <Section
        title="Schedule Variance"
        sub="Original target date vs current forecast — positive = behind schedule"
      >
        {variance.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--muted)', fontSize: 11 }}>
            No schedule variance data yet
          </div>
        ) : (
          <ScheduleVarianceTable data={variance} />
        )}
      </Section>

    </div>
  );
}
