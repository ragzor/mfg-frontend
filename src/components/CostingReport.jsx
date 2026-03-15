import { useState, useEffect } from 'react';
import { getCostingReport, getReportProjects } from '../api/reports';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs';

const fmtN = (v, digits = 2) => v != null ? Number(v).toFixed(digits) : '—';

export default function CostingReport() {
  const [projects,  setProjects]  = useState([]);
  const [projectId, setProjectId] = useState('');
  const [report,    setReport]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    getReportProjects()
      .then(setProjects)
      .catch(() => setError('Failed to load projects'));
  }, []);

  async function generate() {
    if (!projectId) return;
    setLoading(true); setError(''); setReport(null);
    try {
      const data = await getCostingReport(projectId);
      setReport(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function exportXlsx() {
    if (!report) return;
    const { project_name, processes, rows } = report;

    const headers = [
      'Part ID', 'Part Name', 'Qty', 'Weight (kg)',
      'Mat. Rs/kg', 'Mat. Cost (Rs)',
      ...processes.map(p => `${p.name} (Rs)`),
      'Unit Cost (Rs)', 'Total Cost (Rs)',
    ];

    const dataRows = rows.map(r => [
      r.part_number, r.part_name, r.qty,
      r.weight_kg ?? '',
      r.material_cost_per_kg ?? '',
      r.material_unit_cost ?? '',
      ...processes.map(p => r.processes[p.id]?.unit_rate ?? ''),
      r.unit_cost ?? '',
      r.total_cost ?? '',
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    ws['!cols'] = [
      { wch: 14 }, { wch: 32 }, { wch: 6 }, { wch: 12 },
      { wch: 12 }, { wch: 16 },
      ...processes.map(() => ({ wch: 20 })),
      { wch: 14 }, { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, project_name.slice(0, 31));
    XLSX.writeFile(wb, `Costing_${project_name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const muted    = 'var(--muted)';
  const mono     = 'var(--mono)';
  const accent   = 'var(--accent)';
  const surface2 = 'var(--surface2)';
  const border2  = 'var(--border2)';

  return (
    <div className="page">
      <div className="section-hdr">
        <div>
          <div className="section-title">Costing Report</div>
          <div className="section-sub">Select a project to generate a full cost breakdown</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: mono, fontSize: 10, color: muted, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Project
          </label>
          <select
            value={projectId}
            onChange={e => { setProjectId(e.target.value); setReport(null); }}
            style={{
              background: surface2, border: `1px solid ${border2}`, borderRadius: 4,
              color: 'var(--text)', fontFamily: mono, fontSize: 13, padding: '7px 12px',
              minWidth: 220, outline: 'none',
            }}
          >
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <button className="btn btn-primary" onClick={generate} disabled={!projectId || loading} style={{ height: 36 }}>
          {loading ? 'Generating…' : '⚡ Generate Report'}
        </button>

        {report && (
          <button className="btn btn-ghost" onClick={exportXlsx} style={{ height: 36 }}>
            ↓ Export to Excel
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: 'var(--red)', fontFamily: mono, fontSize: 12, marginBottom: 16 }}>⚠ {error}</div>
      )}

      {report && (
        <>
          <div style={{ fontFamily: mono, fontSize: 11, color: muted, marginBottom: 10 }}>
            {report.rows.length} parts · {report.project_name}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: mono, fontSize: 12 }}>
              <thead>
                <tr>
                  {['Part ID', 'Part Name', 'Qty', 'Weight (kg)', 'Mat. ₹/kg', 'Mat. Cost (₹)'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                  {report.processes.map(p => (
                    <th key={p.id} style={{ ...thStyle, background: 'rgba(255,140,0,.08)', borderBottom: '2px solid var(--accent)' }}>
                      {p.name}
                    </th>
                  ))}
                  <th style={{ ...thStyle, background: 'rgba(56,189,100,.06)', color: 'var(--green)' }}>Unit Cost (₹)</th>
                  <th style={{ ...thStyle, background: 'rgba(56,189,100,.14)', color: 'var(--green)' }}>Total Cost (₹)</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, i) => (
                  <tr key={row.part_id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                    <td style={{ ...tdStyle, color: accent }}>{row.part_number}</td>
                    <td style={{ ...tdStyle, color: 'var(--text)', fontFamily: 'var(--body)' }}>{row.part_name}</td>
                    <td style={tdStyle}>{row.qty}</td>
                    <td style={tdStyle}>{row.weight_kg != null ? fmtN(row.weight_kg, 3) : '—'}</td>
                    <td style={tdStyle}>{row.material_cost_per_kg != null ? fmtN(row.material_cost_per_kg) : '—'}</td>
                    <td style={{ ...tdStyle, color: row.material_unit_cost != null ? 'var(--text)' : muted }}>
                      {row.material_unit_cost != null ? `₹${row.material_unit_cost.toFixed(2)}` : '—'}
                    </td>
                    {report.processes.map(p => {
                      const pc = row.processes[p.id];
                      return (
                        <td key={p.id} style={{ ...tdStyle, color: pc?.unit_rate != null ? 'var(--text)' : muted }}>
                          {pc?.unit_rate != null ? `₹${pc.unit_rate.toFixed(2)}` : '—'}
                        </td>
                      );
                    })}
                    <td style={{ ...tdStyle, color: row.unit_cost != null ? 'var(--text)' : muted, fontWeight: 600 }}>
                      {row.unit_cost != null ? `₹${row.unit_cost.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>
                      {row.total_cost != null ? `₹${row.total_cost.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const thStyle = {
  padding: '8px 10px',
  textAlign: 'left',
  background: 'var(--surface2)',
  borderBottom: '1px solid var(--border2)',
  color: 'var(--muted)',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--muted)',
  whiteSpace: 'nowrap',
  fontFamily: 'var(--mono)',
  fontSize: 12,
};
