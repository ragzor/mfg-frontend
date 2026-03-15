import { useState, useMemo, useEffect, useCallback } from 'react';
import { getEmployees, getActiveProcesses, getWeekSchedule, upsertAssignment, deleteAssignment, createEmployee, updateEmployee } from '../api/resources';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const DAY_START_MIN  = 9 * 60;    // 09:00
const DAY_END_MIN    = 18 * 60;   // 18:00
const LUNCH_START    = 13 * 60;   // 13:00
const LUNCH_END      = 14 * 60;   // 14:00
const DAY_CAPACITY   = (DAY_END_MIN - DAY_START_MIN) - (LUNCH_END - LUNCH_START); // 480 min productive
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const PROC_COLORS = {
  Cutting:'#3b82f6', Welding:'#ef4444', Drilling:'#8b5cf6',
  Deburring:'#f97316', Buffing:'#22c55e', Polishing:'#06b6d4',
};
const procColor = (name) => PROC_COLORS[name] || '#7a8290';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function getMondayOf(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}
function addDays(date, n)  { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function fmtShort(date)    { return date.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }); }
function fmtDate(str)      { if (!str) return '—'; return new Date(str+'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short' }); }
function toISODate(date)   { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function minToTime(min)    { return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`; }
function fmtDur(min)       { if (min < 60) return `${min}m`; const h=Math.floor(min/60),m=min%60; return m?`${h}h ${m}m`:`${h}h`; }
function initials(name)    { return name.split(' ').map(x=>x[0]).join('').toUpperCase(); }

// ─────────────────────────────────────────────
// CLIENT-SIDE SCHEDULER
// Mirrors the backend exactly.
// KEY FIX: cursor is shared across all jobs —
// job 2 starts where job 1 ends, not at 09:00.
// ─────────────────────────────────────────────

function scheduleEmployeeJobs(jobs) {
  const sorted = [...jobs].sort((a,b) => new Date(a.start_date+'T00:00:00') - new Date(b.start_date+'T00:00:00'));

  let curDate = null;
  let curMin  = DAY_START_MIN;
  const blocksByDay = {};

  function ensureDay(d) {
    const k = toISODate(d);
    if (!blocksByDay[k]) blocksByDay[k] = [];
    return k;
  }

  // Advance cursor past lunch if it lands in the lunch window
  function skipLunch(min) {
    if (min >= LUNCH_START && min < LUNCH_END) return LUNCH_END;
    return min;
  }

  // How many productive minutes are available from curMin to DAY_END_MIN (excluding lunch)
  function availableFromCursor(min) {
    if (min >= DAY_END_MIN) return 0;
    if (min >= LUNCH_END)   return DAY_END_MIN - min;
    if (min >= LUNCH_START) return DAY_END_MIN - LUNCH_END;  // cursor in lunch → moves to LUNCH_END
    // cursor before lunch
    return (LUNCH_START - min) + (DAY_END_MIN - LUNCH_END);
  }

  for (const job of sorted) {
    const jobStart = new Date(job.start_date + 'T00:00:00');
    if (curDate === null || jobStart > curDate) {
      curDate = new Date(jobStart);
      curMin  = DAY_START_MIN;
    }
    curMin = skipLunch(curMin);

    let remaining = job.qty * job.mins_per_part;
    let partIdx   = 1;

    while (remaining > 0) {
      // If cursor is at or past end of day, roll to next day
      if (curMin >= DAY_END_MIN) {
        curDate = addDays(curDate, 1);
        curMin  = DAY_START_MIN;
      }
      curMin = skipLunch(curMin);

      const available = availableFromCursor(curMin);
      if (available <= 0) {
        curDate = addDays(curDate, 1);
        curMin  = DAY_START_MIN;
        continue;
      }

      // How much can we place before hitting lunch (or end of day)?
      const nextBreak   = curMin < LUNCH_START ? LUNCH_START : DAY_END_MIN;
      const slotMins    = nextBreak - curMin;           // minutes until next break
      const takeMin     = Math.min(slotMins, remaining);
      const wholeParts  = Math.floor(takeMin / job.mins_per_part);
      const hasPartial  = (takeMin % job.mins_per_part > 0) && (partIdx + wholeParts - 1) < job.qty;
      const partsTo     = Math.min(partIdx + wholeParts - 1 + (hasPartial ? 1 : 0), job.qty);

      const dayKey = ensureDay(curDate);
      blocksByDay[dayKey].push({
        part_process_id: job.part_process_id,
        part_number:     job.part_number,
        part_name:       job.part_name,
        process_name:    job.process_name,
        color:           procColor(job.process_name),
        start_min:       curMin,
        end_min:         curMin + takeMin,
        parts_from:      partIdx,
        parts_to:        partsTo,
        mins_per_part:   job.mins_per_part,
        qty:             job.qty,
      });

      curMin    += takeMin;
      remaining -= takeMin;
      partIdx   += wholeParts + (hasPartial ? 1 : 0);
      curMin     = skipLunch(curMin);  // jump over lunch if we landed in it
    }
  }

  Object.keys(blocksByDay).forEach(d => {
    blocksByDay[d].sort((a,b) => a.start_min - b.start_min);
  });

  return blocksByDay;
}

// ─────────────────────────────────────────────
// PRINT DAY SHEET
// ─────────────────────────────────────────────

async function printDaySheet(emp, day, blocks, processes) {
  const dayStr   = toISODate(day);
  const dayBlocks = blocks[dayStr] || [];
  const usedMin  = dayBlocks.reduce((s,b) => s+(b.end_min-b.start_min), 0);
  const dateStr  = day.toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const totalParts = dayBlocks.reduce((s,b) => s+(b.parts_to-b.parts_from+1), 0);

  // Timeline spans 09:00–18:00 (9 hours total)
  const TL_TOTAL = DAY_END_MIN - DAY_START_MIN; // 540 min
  const tlBlocks = dayBlocks.map(b => {
    const left  = ((b.start_min - DAY_START_MIN) / TL_TOTAL * 100).toFixed(1);
    const width = ((b.end_min - b.start_min)     / TL_TOTAL * 100).toFixed(1);
    return `<div style="position:absolute;top:0;bottom:0;left:${left}%;width:${width}%;background:${b.color};border-right:2px solid #fff;display:flex;align-items:center;justify-content:center;overflow:hidden;">
      <div style="font-family:monospace;font-size:9px;font-weight:900;color:#000;text-align:center;padding:0 4px;line-height:1.3;">${b.process_name}<br/>${b.part_number}</div>
    </div>`;
  }).join('');

  // Lunch block
  const lunchLeft  = ((LUNCH_START - DAY_START_MIN) / TL_TOTAL * 100).toFixed(1);
  const lunchWidth = ((LUNCH_END   - LUNCH_START)   / TL_TOTAL * 100).toFixed(1);
  const lunchBlock = `<div style="position:absolute;top:0;bottom:0;left:${lunchLeft}%;width:${lunchWidth}%;background:repeating-linear-gradient(45deg,#ddd,#ddd 3px,#eee 3px,#eee 8px);border-right:2px solid #fff;display:flex;align-items:center;justify-content:center;">
    <span style="font-family:monospace;font-size:8px;font-weight:700;color:#888;">LUNCH</span>
  </div>`;

  // Hour markers — 09:00 to 18:00
  const hourMarkers = Array.from({length:10},(_,i) => {
    const pct=((i*60)/TL_TOTAL*100).toFixed(1);
    return `<div style="position:absolute;top:0;bottom:0;left:${pct}%;border-left:1px solid rgba(0,0,0,.15);display:flex;align-items:flex-end;padding-bottom:2px;z-index:1;pointer-events:none;"><span style="font-family:monospace;font-size:7px;color:#000;font-weight:700;padding-left:2px;">${String(9+i).padStart(2,'0')}:00</span></div>`;
  }).join('');

  function checklistRows(b) {
    const proc = processes.find(p => p.id === b.part_process_id);
    const qty  = proc?.qty ?? b.qty ?? '?';
    let rows = '';
    for (let i = b.parts_from; i <= b.parts_to; i++) {
      rows += `<tr>
        <td style="width:24px;text-align:center;"><input type="checkbox"/></td>
        <td style="font-family:monospace;font-size:10px;font-weight:700;width:70px;">Part ${i} of ${qty}</td>
        <td style="font-family:monospace;font-size:10px;color:#555;width:90px;">${b.part_number}</td>
        <td style="font-size:11px;font-weight:600;">${b.part_name}</td>
        <td style="font-family:monospace;font-size:10px;font-weight:700;width:80px;color:${b.color};">${b.process_name}</td>
        <td style="font-family:monospace;font-size:10px;color:#555;width:110px;">${minToTime(b.start_min)} – ${minToTime(b.end_min)}</td>
        <td style="width:80px;border-bottom:1px solid #999;"></td>
      </tr>`;
    }
    return rows;
  }

  // Pre-fetch all drawings as base64 so they embed correctly in about:blank windows
  // (cross-origin img src fails in new windows opened via window.open)
  const uniqueProcs = [...new Map(dayBlocks.map(b => [b.part_process_id, b])).values()].map(b => {
    const proc = processes.find(p => p.id === b.part_process_id);
    return { ...b, proc, drawingUrl: proc?.drawing_url || null, qty: proc?.qty ?? b.qty ?? '?', mpp: proc?.assignment?.mins_per_part ?? b.mins_per_part ?? '?' };
  });

  // Fetch each drawing via the backend proxy (avoids CORS in about:blank print windows)
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const tok  = () => localStorage.getItem('mfg_token');

  async function toDataUri(url) {
    try {
      // First try: backend proxy (handles CORS/auth)
      const proxyUrl = `${BASE}/resources/drawing-proxy?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, {
        headers: tok() ? { Authorization: `Bearer ${tok()}` } : {},
      });
      if (!res.ok) {
        console.warn('[Drawing] Proxy failed', res.status, url);
        // Fallback: try fetching directly (works if public URL has CORS headers)
        const res2 = await fetch(url, { mode: 'cors' });
        if (!res2.ok) { console.warn('[Drawing] Direct fetch also failed', res2.status); return null; }
        const blob2 = await res2.blob();
        return new Promise((resolve) => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result);
          r.onerror  = () => resolve(null);
          r.readAsDataURL(blob2);
        });
      }
      const blob = await res.blob();
      console.log('[Drawing] Proxy OK, blob size:', blob.size, 'type:', blob.type);
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => { console.log('[Drawing] Base64 length:', reader.result?.length); resolve(reader.result); };
        reader.onerror  = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch(e) { console.error('[Drawing] fetch error:', e); return null; }
  }

  const drawingDataUris = {};
  await Promise.all(uniqueProcs.map(async (b) => {
    if (b.drawingUrl) {
      drawingDataUris[b.part_process_id] = await toDataUri(b.drawingUrl);
    }
  }));

  // Each drawing gets its own full A4 page
  const drawingBlocks = uniqueProcs.map(b => {
    const dataUri = drawingDataUris[b.part_process_id] || null;
    return `<div style="page-break-before:always;width:100%;height:100vh;display:flex;flex-direction:column;box-sizing:border-box;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0 8px 0;border-bottom:2px solid #111;margin-bottom:10px;flex-shrink:0;">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <span style="font-family:monospace;font-size:11px;font-weight:700;background:#222;color:#fff;padding:3px 9px;border-radius:2px;">${b.part_number}</span>
          <span style="font-size:13px;font-weight:800;">${b.part_name}</span>
          <span style="font-family:monospace;font-size:11px;font-weight:700;color:${b.color};">${b.process_name}</span>
          <span style="font-family:monospace;font-size:10px;color:#555;">Qty: ${b.qty} · ${b.mpp}min/part</span>
        </div>
        <div style="font-family:monospace;font-size:10px;color:#888;text-align:right;">${emp.name} · ${dateStr}</div>
      </div>
      <div style="flex:1;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:0;">
        ${dataUri
          ? dataUri.startsWith('data:application/pdf')
            // pdf2image not installed — embed as scrollable iframe
            ? `<iframe src="${dataUri}" style="width:100%;height:100%;border:none;" title="Drawing ${b.part_number}"></iframe>`
            // converted PNG — full-page image
            : `<img src="${dataUri}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;"/>`
          : b.drawingUrl
            ? `<div style="width:100%;height:100%;border:3px dashed #f0c040;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;text-align:center;">
                 <span style="font-size:28px;">⚠</span>
                 <span style="font-family:monospace;font-size:12px;color:#555;">Drawing could not be embedded.</span>
                 <a href="${b.drawingUrl}" target="_blank" style="font-family:monospace;font-size:11px;color:#3b82f6;word-break:break-all;">Open drawing in new tab →</a>
               </div>`
            : `<div style="width:100%;height:100%;border:3px dashed #ddd;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
                 <span style="font-size:32px;">📄</span>
                 <span style="font-family:monospace;font-size:13px;color:#aaa;">No drawing on file for ${b.part_number}</span>
               </div>`
        }
      </div>
      <div style="flex-shrink:0;margin-top:10px;padding-top:8px;border-top:1px solid #ddd;">
        <strong style="font-size:10px;">Notes / Special Instructions:</strong>
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:10px;">
          <div style="border-bottom:1px solid #ccc;height:16px;"></div>
          <div style="border-bottom:1px solid #ccc;height:16px;"></div>
          <div style="border-bottom:1px solid #ccc;height:16px;"></div>
        </div>
      </div>
    </div>`;
  }).join('');

  const win = window.open('','_blank','width=960,height=800');
  win.document.write(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<title>Work Order – ${emp.name} – ${dayStr}</title>
<style>
  @page{size:A4;margin:15mm;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;background:#fff;}
  table{width:100%;border-collapse:collapse;}
  thead tr{background:#111;color:#fff;}
  th{padding:6px 8px;font-family:monospace;font-size:9px;text-transform:uppercase;letter-spacing:.06em;text-align:left;font-weight:600;}
  td{padding:7px 8px;border-bottom:1px solid #eee;vertical-align:middle;}
  tr:nth-child(even) td{background:#fafafa;}
  input[type=checkbox]{width:14px;height:14px;cursor:pointer;accent-color:#111;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.no-print{display:none;}}
</style>
</head><body>
<div class="no-print" style="background:#fffbe6;border:1px solid #f0c040;padding:8px 14px;border-radius:4px;font-family:monospace;font-size:11px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
  <span>⚠ Work Order — <strong>Ctrl+P</strong> / <strong>⌘+P</strong> to print or save as PDF</span>
  <button onclick="window.print()" style="background:#111;color:#fff;border:none;padding:6px 14px;border-radius:3px;cursor:pointer;font-size:11px;">🖨 Print</button>
</div>
<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:3px solid #111;margin-bottom:14px;">
  <div>
    <div style="font-size:18px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;">MANUFACT</div>
    <div style="font-size:11px;color:#555;margin-top:2px;font-family:monospace;letter-spacing:.06em;text-transform:uppercase;">Daily Work Order · Shop Floor Sheet</div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:20px;font-weight:800;">${emp.name}</div>
    <div style="font-size:11px;color:#555;font-family:monospace;">${emp.role}</div>
    <div style="font-size:12px;font-weight:700;margin-top:4px;">${dateStr}</div>
  </div>
</div>
<div style="display:flex;gap:12px;margin-bottom:16px;">
  ${[['Jobs',dayBlocks.length],['Total Parts',totalParts],['Scheduled',fmtDur(usedMin)],['Free',fmtDur(DAY_CAPACITY-usedMin)]].map(([l,v])=>`
  <div style="flex:1;border:1px solid #ddd;border-radius:3px;padding:8px 10px;text-align:center;">
    <div style="font-size:18px;font-weight:800;font-family:monospace;">${v}</div>
    <div style="font-size:9px;color:#888;font-family:monospace;text-transform:uppercase;letter-spacing:.06em;margin-top:2px;">${l}</div>
  </div>`).join('')}
</div>
<div style="margin-bottom:16px;">
  <div style="font-family:monospace;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:3px;">Timeline — 09:00 to 18:00 · Lunch 13:00–14:00</div>
  <div style="position:relative;height:48px;background:#f5f5f5;border:1px solid #ddd;border-radius:3px;overflow:hidden;">${hourMarkers}${lunchBlock}${tlBlocks}</div>
  <div style="display:flex;gap:12px;margin-top:6px;flex-wrap:wrap;">
    ${dayBlocks.map(b=>`<div style="display:flex;align-items:center;gap:4px;font-family:monospace;font-size:9px;">
      <div style="width:8px;height:8px;border-radius:2px;background:${b.color};flex-shrink:0;"></div>
      <span style="color:#000;">${minToTime(b.start_min)}–${minToTime(b.end_min)} · ${b.process_name} · ${b.part_number} · Pt ${b.parts_from}${b.parts_to>b.parts_from?'–'+b.parts_to:''}</span>
    </div>`).join('')}
  </div>
</div>
<div style="margin-bottom:18px;">
  <div style="font-family:monospace;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:3px;">Part Completion Checklist</div>
  <table><thead><tr><th>✓</th><th>Part #</th><th>Part ID</th><th>Description</th><th>Process</th><th>Time Slot</th><th>Sign-off</th></tr></thead>
  <tbody>${dayBlocks.map(b=>checklistRows(b)).join('')}</tbody></table>
</div>
<div style="margin-top:16px;padding-top:8px;border-top:1px solid #ddd;display:flex;justify-content:space-between;align-items:flex-end;">
  <div style="display:flex;gap:40px;">
    <div><div style="width:160px;border-bottom:1px solid #999;margin-top:20px;"></div><div style="font-family:monospace;font-size:9px;color:#888;margin-top:4px;">Employee Signature</div></div>
    <div><div style="width:160px;border-bottom:1px solid #999;margin-top:20px;"></div><div style="font-family:monospace;font-size:9px;color:#888;margin-top:4px;">Supervisor Sign-off</div></div>
  </div>
  <div style="font-family:monospace;font-size:9px;color:#bbb;text-align:right;">Printed: ${new Date().toLocaleString('en-GB')}<br/>MANUFACT · Work Order System</div>
</div>
${drawingBlocks}
</body></html>`);
  win.document.close();
}

// ─────────────────────────────────────────────
// ASSIGN MODAL
// ─────────────────────────────────────────────

function AssignModal({ proc, employees, existing, onSave, onRemove, onClose }) {
  const [empId,     setEmpId]    = useState(existing?.employee_id   || '');
  const [mpp,       setMpp]      = useState(existing?.mins_per_part || 30);
  const [startDate, setStart]    = useState(existing?.start_date    || proc.planned_start || '');
  const [saving,    setSaving]   = useState(false);
  const [error,     setError]    = useState('');

  const color     = procColor(proc.process);
  const totalMins = proc.qty * mpp;
  const totalDays = Math.ceil(totalMins / DAY_CAPACITY);

  // Preview: build schedule for this job alone, to show the user what days it lands on
  const preview = useMemo(() => {
    if (!startDate || mpp < 1) return {};
    return scheduleEmployeeJobs([{
      part_process_id: proc.id,
      part_number:     proc.part_number,
      part_name:       proc.part_name,
      process_name:    proc.process,
      qty:             proc.qty,
      mins_per_part:   mpp,
      start_date:      startDate,
    }]);
  }, [proc, mpp, startDate]);

  const previewEntries = Object.entries(preview).sort(([a],[b]) => a.localeCompare(b));
  const canSave = empId && mpp >= 1 && startDate && !saving;

  async function handleSave() {
    setSaving(true); setError('');
    try {
      await onSave(proc.id, { employee_id: empId, mins_per_part: mpp, start_date: startDate });
      onClose();
    } catch(e) {
      setError(e.message);
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try { await onRemove(proc.id); onClose(); }
    catch(e) { setError(e.message); setSaving(false); }
  }

  return (
    <div className="backdrop open" style={{ zIndex:200 }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{ width:520, maxHeight:'90vh', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>

        <div className="modal-hdr" style={{ flexShrink:0 }}>
          <div>
            <div className="modal-title" style={{ fontSize:14 }}>{existing ? 'Edit Assignment' : 'Assign Process'}</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)', marginTop:2 }}>{proc.part_number} · {proc.part_name}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
          <span style={{ fontFamily:'var(--mono)', fontWeight:700, fontSize:12, color, background:`${color}15`, border:`1px solid ${color}33`, padding:'3px 10px', borderRadius:3 }}>{proc.process}</span>
          <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted)' }}>Qty: <strong style={{ color:'var(--text)' }}>{proc.qty} parts</strong></span>
          {mpp > 0 && (
            <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>
              Total: <strong style={{ color:'var(--accent)' }}>{fmtDur(totalMins)}</strong>
              <span style={{ color:'var(--border2)' }}> · {totalDays}d</span>
            </span>
          )}
        </div>

        <div style={{ overflowY:'auto', flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* Employee picker */}
          <div className="fgrp">
            <label>Assign To</label>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {employees.map(emp => {
                const canDo = emp.skills.includes(proc.process);
                const sel   = emp.id === empId;
                return (
                  <div key={emp.id} onClick={() => canDo && setEmpId(emp.id)} style={{
                    display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:3,
                    border:`1px solid ${sel ? emp.color+'88' : 'var(--border)'}`,
                    background: sel ? `${emp.color}12` : 'var(--surface2)',
                    cursor: canDo ? 'pointer' : 'not-allowed', opacity: canDo ? 1 : 0.35, transition:'all .12s',
                  }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:`${emp.color}22`, border:`1px solid ${emp.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontWeight:700, fontSize:10, color:emp.color, flexShrink:0 }}>
                      {initials(emp.name)}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{emp.name}</div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)' }}>{emp.role}{!canDo ? ' · not skilled' : ''}</div>
                    </div>
                    {sel && <span style={{ fontFamily:'var(--mono)', fontSize:10, color:emp.color, fontWeight:700 }}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time inputs */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="fgrp">
              <label>Minutes per Part</label>
              <input type="number" min={1} max={480} className="fi" value={mpp}
                onChange={e => setMpp(Math.max(1, parseInt(e.target.value)||1))}
                style={{ fontFamily:'var(--mono)', fontSize:13 }}
              />
              <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)', marginTop:4 }}>
                {proc.qty} × {mpp}m = <strong style={{ color:'var(--accent)' }}>{fmtDur(totalMins)}</strong>
              </div>
            </div>
            <div className="fgrp">
              <label>Start Date</label>
              <input type="date" className="fi" value={startDate}
                onChange={e => setStart(e.target.value)}
                style={{ fontFamily:'var(--mono)', fontSize:13 }}
              />
            </div>
          </div>

          {/* Preview */}
          {previewEntries.length > 0 && (
            <div>
              <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>
                Schedule Preview
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {previewEntries.map(([ds, blocks]) => {
                  const d = new Date(ds+'T00:00:00');
                  const usedMin = blocks.reduce((s,b)=>s+(b.end_min-b.start_min),0);
                  const pct = Math.round(usedMin/DAY_CAPACITY*100);
                  return (
                    <div key={ds} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ padding:'5px 10px', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)', width:80 }}>
                          {DAY_NAMES[(d.getDay()+6)%7]} {fmtDate(ds)}
                        </span>
                        <div style={{ flex:1, height:3, background:'var(--border)', borderRadius:2 }}>
                          <div style={{ height:3, background:color, borderRadius:2, width:`${pct}%` }} />
                        </div>
                        <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)' }}>{fmtDur(usedMin)} / 8h</span>
                      </div>
                      {blocks.map((b,bi) => (
                        <div key={bi} style={{ padding:'5px 10px', display:'flex', alignItems:'center', gap:10, borderBottom: bi<blocks.length-1?'1px solid var(--border)':'none' }}>
                          <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--accent)', width:100, flexShrink:0 }}>{minToTime(b.start_min)} – {minToTime(b.end_min)}</span>
                          <span style={{ fontFamily:'var(--mono)', fontSize:10, color, fontWeight:600, flexShrink:0 }}>{b.process_name}</span>
                          <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)', flex:1 }}>{b.part_number} · Pt {b.parts_from}–{b.parts_to}</span>
                          <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--border2)' }}>{fmtDur(b.end_min-b.start_min)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--red)', background:'rgba(239,68,68,.1)', padding:'8px 12px', borderRadius:3 }}>⚠ {error}</div>}
        </div>

        <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', gap:8, flexShrink:0 }}>
          <div>
            {existing && (
              <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)', borderColor:'rgba(239,68,68,.3)' }} onClick={handleRemove} disabled={saving}>
                ✕ Remove
              </button>
            )}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={!canSave} onClick={handleSave}>
              {saving ? '…' : existing ? 'Update →' : 'Assign →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// EMPLOYEE CARD
// ─────────────────────────────────────────────

function EmployeeCard({ emp, weekDays, blocks, processes, onOpenAssign }) {
  const today = new Date(); today.setHours(0,0,0,0);

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, marginBottom:12, overflow:'hidden' }}>
      {/* Header with mini utilization bars */}
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'11px 16px', background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ width:34, height:34, borderRadius:'50%', background:`${emp.color}20`, border:`2px solid ${emp.color}55`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontWeight:700, fontSize:11, color:emp.color, flexShrink:0 }}>
          {initials(emp.name)}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:700 }}>{emp.name}</div>
          <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>{emp.role}</div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {weekDays.map((day, di) => {
            const key     = toISODate(day);
            const dayBlocks = blocks[key] || [];
            const usedMin = dayBlocks.reduce((s,b)=>s+(b.end_min-b.start_min),0);
            const pct     = Math.min(100, Math.round(usedMin/DAY_CAPACITY*100));
            const isToday = day.toDateString() === today.toDateString();
            const barColor = pct>90?'var(--red)':pct>60?'var(--accent)':emp.color;
            return (
              <div key={di} title={`${DAY_NAMES[di]}: ${fmtDur(usedMin)} / 8h`} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <div style={{ width:14, height:32, background:'var(--border)', borderRadius:2, position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', bottom:0, left:0, right:0, background:barColor, height:`${pct}%`, borderRadius:2, transition:'height .3s' }} />
                </div>
                <span style={{ fontFamily:'var(--mono)', fontSize:7, color: isToday?'var(--accent)':'var(--border2)' }}>{DAY_NAMES[di][0]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Week grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
        {weekDays.map((day, di) => {
          const key       = toISODate(day);
          const isToday   = day.toDateString() === today.toDateString();
          const isWeekend = di >= 5;
          const dayBlocks = blocks[key] || [];
          const usedMin   = dayBlocks.reduce((s,b)=>s+(b.end_min-b.start_min),0);
          const pct       = Math.min(100, Math.round(usedMin/DAY_CAPACITY*100));
          const barColor  = pct>90?'var(--red)':pct>60?'var(--accent)':emp.color;

          return (
            <div key={di} style={{ borderRight: di<6?'1px solid var(--border)':'none', background: isToday?'rgba(245,166,35,.04)':isWeekend?'rgba(255,255,255,.01)':'transparent', minHeight:120, display:'flex', flexDirection:'column' }}>
              <div style={{ padding:'5px 6px', borderBottom:'1px solid var(--border)', background: isToday?'rgba(245,166,35,.08)':'transparent', flexShrink:0 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:9, color: isToday?'var(--accent)':'var(--muted)', fontWeight: isToday?700:400 }}>{DAY_NAMES[di]}</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:8, color: isToday?'var(--accent)':'var(--border2)', marginTop:1 }}>{fmtShort(day)}</div>
                </div>
                {dayBlocks.length > 0 && (
                  <button onClick={async (e) => {
                    const btn = e.currentTarget;
                    btn.textContent = '…';
                    btn.disabled = true;
                    await printDaySheet(emp, day, blocks, processes);
                    btn.textContent = '⎙ Print';
                    btn.disabled = false;
                  }}
                    style={{ display:'block', width:'100%', marginTop:4, background:'rgba(245,166,35,.12)', border:'1px solid rgba(245,166,35,.25)', color:'var(--accent)', borderRadius:2, cursor:'pointer', fontFamily:'var(--mono)', fontSize:8, fontWeight:700, padding:'2px 0' }}
                    onMouseEnter={e=>{ if(!e.currentTarget.disabled) e.currentTarget.style.background='rgba(245,166,35,.24)'; }}
                    onMouseLeave={e=>e.currentTarget.style.background='rgba(245,166,35,.12)'}>
                    ⎙ Print
                  </button>
                )}
              </div>

              {usedMin > 0 && (
                <div style={{ height:3, background:'var(--border)', flexShrink:0 }}>
                  <div style={{ height:3, background:barColor, width:`${pct}%`, transition:'width .3s' }} />
                </div>
              )}

              <div style={{ padding:'3px', display:'flex', flexDirection:'column', gap:2, flex:1 }}>
                {dayBlocks.length === 0
                  ? <div style={{ fontFamily:'var(--mono)', fontSize:8, color:'var(--border2)', textAlign:'center', padding:'14px 0' }}>—</div>
                  : dayBlocks.map((b,bi) => (
                      <div key={bi} onClick={() => { const p = processes.find(p=>p.id===b.part_process_id); if(p) onOpenAssign(p); }}
                        style={{ borderLeft:`2px solid ${b.color}`, background:`${b.color}10`, borderRadius:'0 2px 2px 0', padding:'3px 5px', cursor:'pointer' }}>
                        <div style={{ fontFamily:'var(--mono)', fontSize:8, color:'var(--accent)', lineHeight:1.3 }}>{minToTime(b.start_min)}–{minToTime(b.end_min)}</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:9, color:b.color, fontWeight:700, lineHeight:1.3 }}>{b.process_name}</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:8, color:'var(--muted)', lineHeight:1.2 }}>{b.part_number}</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:8, color:'var(--text)', lineHeight:1.3 }}>Pt {b.parts_from}{b.parts_to>b.parts_from?`–${b.parts_to}`:''}</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:7, color:'var(--border2)', marginTop:1 }}>{fmtDur(b.end_min-b.start_min)}</div>
                      </div>
                    ))
                }
              </div>

              {usedMin > 0 && (
                <div style={{ padding:'2px 4px', borderTop:'1px solid var(--border)', background:'var(--surface2)', flexShrink:0 }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:7, color: pct>90?'var(--red)':'var(--muted)', textAlign:'right' }}>
                    {fmtDur(usedMin)}/{fmtDur(DAY_CAPACITY)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PROCESS QUEUE
// ─────────────────────────────────────────────

function ProcessQueue({ processes, employees, onOpenAssign }) {
  const grouped = useMemo(() => {
    const map = {};
    processes.forEach(p => { if (!map[p.process]) map[p.process]=[]; map[p.process].push(p); });
    return Object.entries(map).sort((a,b) => {
      const ua = a[1].filter(p=>!p.assignment).length;
      const ub = b[1].filter(p=>!p.assignment).length;
      return ub-ua;
    });
  }, [processes]);

  const totalU = processes.filter(p=>!p.assignment).length;
  const totalA = processes.filter(p=> p.assignment).length;

  return (
    <div style={{ width:300, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', gap:8 }}>
        <div style={{ flex:1, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', borderRadius:3, padding:'8px 10px', textAlign:'center' }}>
          <div style={{ fontFamily:'var(--display)', fontSize:22, fontWeight:800, color:'var(--red)' }}>{totalU}</div>
          <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)' }}>Unassigned</div>
        </div>
        <div style={{ flex:1, background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.2)', borderRadius:3, padding:'8px 10px', textAlign:'center' }}>
          <div style={{ fontFamily:'var(--display)', fontSize:22, fontWeight:800, color:'var(--green)' }}>{totalA}</div>
          <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)' }}>Assigned</div>
        </div>
      </div>

      {grouped.map(([procName, procs]) => {
        const color = procColor(procName);
        const unCount = procs.filter(p=>!p.assignment).length;
        return (
          <div key={procName} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderTop:`3px solid ${color}`, borderRadius:4, overflow:'hidden' }}>
            <div style={{ padding:'9px 12px', background:`${color}08`, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontFamily:'var(--display)', fontWeight:800, fontSize:14, color }}>{procName}</span>
                <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>{procs.length} part{procs.length>1?'s':''}</span>
              </div>
              {unCount > 0 && <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--red)', background:'rgba(239,68,68,.12)', padding:'2px 6px', borderRadius:2, fontWeight:600 }}>{unCount} unassigned</span>}
            </div>
            {procs.map(proc => {
              const asgn = proc.assignment;
              const emp  = asgn ? employees.find(e=>e.id===asgn.employee_id) : null;
              return (
                <div key={proc.id} style={{ padding:'9px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', gap:8, background: asgn?`${color}05`:'transparent' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)' }}>{proc.part_number}</div>
                    <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{proc.part_name}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)', marginTop:1 }}>Qty {proc.qty} · {fmtDate(proc.planned_start)}</div>
                    {asgn && emp && (
                      <div style={{ marginTop:4, display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                        <span style={{ fontFamily:'var(--mono)', fontSize:9, color:emp.color, fontWeight:600 }}>◉ {emp.name.split(' ')[0]}</span>
                        <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)' }}>· {asgn.mins_per_part}m/part · {fmtDur(proc.qty*asgn.mins_per_part)} · from {fmtDate(asgn.start_date)}</span>
                      </div>
                    )}
                  </div>
                  <button onClick={() => onOpenAssign(proc)} style={{
                    flexShrink:0, fontFamily:'var(--mono)', fontSize:10, fontWeight:600,
                    padding:'5px 9px', borderRadius:2, cursor:'pointer', whiteSpace:'nowrap',
                    background: asgn?`${color}15`:'rgba(245,166,35,.12)',
                    border:`1px solid ${asgn?color+'44':'rgba(245,166,35,.3)'}`,
                    color: asgn?color:'var(--accent)',
                  }}>
                    {asgn ? '✎ Edit' : '+ Assign'}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// EMPLOYEE MODAL — create or edit
// ─────────────────────────────────────────────

const ALL_SKILLS = Object.keys(PROC_COLORS);
const PALETTE = ['#3b82f6','#ef4444','#8b5cf6','#f97316','#22c55e','#06b6d4','#eab308','#ec4899','#14b8a6','#f43f5e'];

function EmployeeModal({ employee, onSave, onClose }) {
  const [name,   setName]   = useState(employee?.name  || '');
  const [role,   setRole]   = useState(employee?.role  || '');
  const [color,  setColor]  = useState(employee?.color || PALETTE[0]);
  const [skills, setSkills] = useState(employee?.skills || []);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function toggleSkill(s) {
    setSkills(prev => prev.includes(s) ? prev.filter(x=>x!==s) : [...prev, s]);
  }

  async function handleSave() {
    if (!name.trim() || !role.trim()) { setError('Name and role are required'); return; }
    if (skills.length === 0) { setError('Select at least one skill'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ name: name.trim(), role: role.trim(), color, skills: skills.join(',') }, employee?.id || null);
    } catch(e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="backdrop open" style={{ zIndex:300 }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{ width:460 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-title">{employee ? 'Edit Employee' : 'Add Employee'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ gap:14 }}>

          {/* Preview */}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--surface2)', borderRadius:3, border:'1px solid var(--border)' }}>
            <div style={{ width:42, height:42, borderRadius:'50%', background:`${color}22`, border:`2px solid ${color}`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontWeight:700, fontSize:14, color }}>
              {initials(name || '??')}
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:13 }}>{name || 'Employee Name'}</div>
              <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>{role || 'Role'}</div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="fgrp">
              <label>Full Name</label>
              <input className="fi" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Ravi Patel"/>
            </div>
            <div className="fgrp">
              <label>Role / Title</label>
              <input className="fi" value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. Machinist"/>
            </div>
          </div>

          <div className="fgrp">
            <label>Colour</label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {PALETTE.map(c => (
                <div key={c} onClick={() => setColor(c)} style={{
                  width:26, height:26, borderRadius:'50%', background:c, cursor:'pointer',
                  border: color===c ? `3px solid #fff` : '3px solid transparent',
                  boxShadow: color===c ? `0 0 0 2px ${c}` : 'none',
                  transition:'all .12s',
                }}/>
              ))}
            </div>
          </div>

          <div className="fgrp">
            <label>Skills — processes this employee can perform</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:2 }}>
              {ALL_SKILLS.map(s => {
                const active = skills.includes(s);
                const c = PROC_COLORS[s];
                return (
                  <div key={s} onClick={() => toggleSkill(s)} style={{
                    padding:'5px 12px', borderRadius:3, cursor:'pointer',
                    background: active ? `${c}20` : 'var(--surface2)',
                    border: `1px solid ${active ? c+'66' : 'var(--border)'}`,
                    color: active ? c : 'var(--muted)',
                    fontFamily:'var(--mono)', fontSize:11, fontWeight: active?700:400,
                    transition:'all .12s',
                  }}>
                    {active ? '✓ ' : ''}{s}
                  </div>
                );
              })}
            </div>
          </div>

          {error && <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--red)', background:'rgba(239,68,68,.1)', padding:'8px 12px', borderRadius:3 }}>⚠ {error}</div>}
        </div>
        <div className="modal-footer">
          <div>
            {employee && (
              <button className="btn btn-ghost btn-sm"
                style={{ color:'var(--muted)', borderColor:'var(--border)' }}
                onClick={async () => { setSaving(true); await onSave({ active:0 }, employee.id); }}
                disabled={saving}>
                Deactivate
              </button>
            )}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !name || !role}>
              {saving ? '…' : employee ? 'Save Changes' : 'Add Employee'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN ResourceView
// ─────────────────────────────────────────────

export default function ResourceView() {
  const [weekOffset,   setWeekOffset]   = useState(0);
  const [employees,    setEmployees]    = useState([]);
  const [processes,    setProcesses]    = useState([]);   // active in-house part-processes
  const [scheduleData, setScheduleData] = useState([]);   // [ { employee, week_blocks } ]
  const [loading,      setLoading]      = useState(true);
  const [assignTarget, setAssignTarget] = useState(null);

  const weekDays = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const mon   = getMondayOf(today);
    mon.setDate(mon.getDate() + weekOffset*7);
    return Array.from({length:7}, (_,i) => addDays(mon, i));
  }, [weekOffset]);

  const weekLabel = `${fmtShort(weekDays[0])} — ${fmtShort(weekDays[6])}`;
  const weekParam = toISODate(weekDays[0]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, procs, sched] = await Promise.all([
        getEmployees(),
        getActiveProcesses(),
        getWeekSchedule(weekParam),
      ]);
      setEmployees(emps);
      setProcesses(procs);
      setScheduleData(sched);
    } catch(e) {
      console.error('ResourceView load error', e);
    } finally {
      setLoading(false);
    }
  }, [weekParam]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Build per-employee blocks from schedule API response (already computed by backend)
  // BUT we also recompute client-side so UI updates optimistically before refetch
  const employeeBlocks = useMemo(() => {
    const result = {};
    scheduleData.forEach(({ employee, week_blocks }) => {
      result[employee.id] = week_blocks;
    });
    return result;
  }, [scheduleData]);

  const [showEmpPanel, setShowEmpPanel] = useState(false);
  const [empModal,     setEmpModal]     = useState(null); // null | 'new' | employee object

  async function handleSaveEmployee(data, id) {
    if (id) await updateEmployee(id, data);
    else     await createEmployee(data);
    await loadAll();
    setEmpModal(null);
  }

  async function handleSave(ppId, data) {
    await upsertAssignment(ppId, data);
    await loadAll();
  }

  async function handleRemove(ppId) {
    await deleteAssignment(ppId);
    await loadAll();
  }

  return (
    <div className="page">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div className="section-title">Resource View</div>
          <div className="section-sub">Assign in-house processes · time-block scheduling · {weekLabel}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowEmpPanel(p=>!p)}
            style={{ color: showEmpPanel?'var(--accent)':'var(--muted)', borderColor: showEmpPanel?'var(--accent)':'var(--border2)' }}>
            ◉ Manage Employees
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w=>w-1)}>← Prev</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>Today</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w=>w+1)}>Next →</button>
        </div>
      </div>

      {/* Employee Management Panel */}
      {showEmpPanel && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderTop:`3px solid var(--accent)`, borderRadius:4, marginBottom:20, overflow:'hidden' }}>
          <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(245,166,35,.05)' }}>
            <span style={{ fontFamily:'var(--display)', fontWeight:800, fontSize:14, color:'var(--accent)' }}>Employees & Skills</span>
            <button className="btn btn-primary btn-sm" onClick={() => setEmpModal('new')}>+ Add Employee</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:1, background:'var(--border)' }}>
            {employees.map(emp => (
              <div key={emp.id} style={{ background:'var(--surface)', padding:'12px 14px', display:'flex', alignItems:'flex-start', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:`${emp.color}22`, border:`2px solid ${emp.color}55`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontWeight:700, fontSize:12, color:emp.color, flexShrink:0 }}>
                  {initials(emp.name)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{emp.name}</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>{emp.role}</div>
                  <div style={{ marginTop:5, display:'flex', flexWrap:'wrap', gap:3 }}>
                    {emp.skills.map(s => (
                      <span key={s} style={{ fontFamily:'var(--mono)', fontSize:9, background:`${PROC_COLORS[s]||'#555'}20`, border:`1px solid ${PROC_COLORS[s]||'#555'}44`, color:PROC_COLORS[s]||'var(--muted)', padding:'1px 6px', borderRadius:2 }}>{s}</span>
                    ))}
                  </div>
                </div>
                <button onClick={() => setEmpModal(emp)} style={{ background:'var(--surface2)', border:'1px solid var(--border2)', color:'var(--muted)', borderRadius:2, cursor:'pointer', fontFamily:'var(--mono)', fontSize:10, padding:'4px 8px', flexShrink:0 }}>✎</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employee Edit/Create Modal */}
      {empModal && (
        <EmployeeModal
          employee={empModal === 'new' ? null : empModal}
          onSave={handleSaveEmployee}
          onClose={() => setEmpModal(null)}
        />
      )}

      {loading ? (
        <div style={{ padding:'60px', textAlign:'center', fontFamily:'var(--mono)', fontSize:12, color:'var(--muted)' }}>Loading…</div>
      ) : (
        <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
          <ProcessQueue
            processes={processes}
            employees={employees}
            onOpenAssign={setAssignTarget}
          />
          <div style={{ flex:1, minWidth:0 }}>
            {employees.map(emp => (
              <EmployeeCard
                key={emp.id}
                emp={emp}
                weekDays={weekDays}
                blocks={employeeBlocks[emp.id] || {}}
                processes={processes}
                onOpenAssign={setAssignTarget}
              />
            ))}
            {employees.length === 0 && (
              <div style={{ padding:'40px', textAlign:'center', fontFamily:'var(--mono)', fontSize:12, color:'var(--muted)', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4 }}>
                No employees found. Add employees in the List Editor.
              </div>
            )}
          </div>
        </div>
      )}

      {assignTarget && (
        <AssignModal
          proc={assignTarget}
          employees={employees}
          existing={assignTarget.assignment || null}
          onSave={handleSave}
          onRemove={handleRemove}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  );
}
