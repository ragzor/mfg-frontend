import { api } from "./client";

// ─────────────────────────────────────────────
// PATCH /part-processes/:process_id/status
// Requires: operator role (JWT)
//
// Body (ProcessStatusUpdate schema):
// { status: string }
//
// Valid statuses: NOT_STARTED | IN_PRGS | CMPLT |
//   REJECTED | QC | W_4_RM | W_4_QUT |
//   PO_APPROVAL | W_4_PARTS | W_F_PAYMENT | W_F_DECISION
//
// Side-effects (handled server-side):
//   - Sets actual_start when → IN_PRGS
//   - Sets actual_end + delay_days when → CMPLT
//   - Auto-starts next process step
//   - Shifts downstream planned dates if delayed
//   - Recalculates parent part status
//
// Returns: { process_id, old_status, new_status }
// ─────────────────────────────────────────────

export function updateProcessStatus(processId, status) {
  return api.patch(`/part-processes/${processId}/status`, { status });
}

// ─────────────────────────────────────────────
// PATCH /part-processes/:process_id/undo
// Requires: engineer role (JWT)
//
// Reverts a CMPLT process back to IN_PRGS,
// clears actual_end and delay_days,
// and resets the next process to NOT_STARTED.
//
// Returns: { message }
// ─────────────────────────────────────────────

export function undoProcess(processId) {
  return api.patch(`/part-processes/${processId}/undo`);
}

// ─────────────────────────────────────────────
// PATCH /part-processes/:process_id/record-production
// Requires: operator role (JWT)
//
// Query param: qty (integer)
// Records partial production progress.
// Auto-starts process if NOT_STARTED.
// Auto-completes and chains to next process
// when remaining_quantity hits 0.
//
// Returns: { completed_quantity, remaining_quantity, status }
// ─────────────────────────────────────────────

export function recordProduction(processId, qty) {
  return api.patch(`/part-processes/${processId}/record-production?qty=${qty}`);
}

// ─────────────────────────────────────────────
// PATCH /part-processes/:process_id/vendor-po
// Update vendor and/or PO number on a process
// ─────────────────────────────────────────────

export function updateProcessVendorPo(processId, data) {
  return api.patch(`/part-processes/${processId}/vendor-po`, data);
}

// ─────────────────────────────────────────────
// POST /parts/advance-step
// ─────────────────────────────────────────────

export function advanceStep(partIds) {
  return api.post('/parts/advance-step', { part_ids: partIds });
}
