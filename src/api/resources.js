import { api } from './client';

export const getEmployees       = ()           => api.get('/employees');
export const createEmployee     = (body)       => api.post('/employees', body);
export const updateEmployee     = (id, body)   => api.patch(`/employees/${id}`, body);

export const getActiveProcesses = ()           => api.get('/resources/active-processes');
export const getWeekSchedule    = (week)       => api.get(`/resources/schedule${week ? `?week=${week}` : ''}`);

export const deleteAssignment   = (ppId)       => api.delete(`/assignments/${ppId}`);

// PUT isn't in the shared client, so we call fetch directly
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const tok  = () => localStorage.getItem('mfg_token');

export async function upsertAssignment(ppId, body) {
  const res = await fetch(`${BASE}/assignments/${ppId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', ...(tok() ? { Authorization: `Bearer ${tok()}` } : {}) },
    body:    JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Failed'); }
  return res.json();
}
