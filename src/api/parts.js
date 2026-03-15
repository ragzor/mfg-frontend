import { api } from "./client";

// ─────────────────────────────────────────────
// GET /parts
// Returns all parts with their nested processes
//
// Each part looks like:
// {
//   part_id, part_number, name, quantity,
//   material_type, material_grade, asana_ref,
//   target_date, status,
//   processes: [
//     { part_process_id, process_id, process_name,
//       step_number, planned_start, planned_end,
//       duration_days, status }
//   ]
// }
// ─────────────────────────────────────────────

export function getParts() {
  return api.get("/parts/");
}

// Single part by part_number — fast, used by detail modal refresh
export function getPartByNumber(partNumber) {
  return api.get(`/parts/by-number/${encodeURIComponent(partNumber)}`);
}

// ─────────────────────────────────────────────
// POST /parts
// Requires: engineer role (JWT)
//
// Body (PartCreate schema):
// {
//   name: string,
//   project_id: uuid,
//   quantity: number,
//   material_type_id: uuid,
//   material_grade_id: uuid,
//   process_ids: uuid[],   // ordered list
//   asana_ref?: string
// }
//
// Returns: { part_id, part_number, target_date, schedule }
// ─────────────────────────────────────────────

export function createPart(partData) {
  return api.post("/parts/", partData);
}

// ─────────────────────────────────────────────
// POST /parts/:part_id/upload-drawing
// Requires: engineer role (JWT)
// Body: multipart/form-data with "file" (PDF only)
// Returns: { message, file_url }
// ─────────────────────────────────────────────

export function uploadDrawing(partId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return api.upload(`/parts/${partId}/upload-drawing`, formData);
}

export function getPartAudit(partId) {
  return api.get(`/parts/${partId}/audit`);
}
