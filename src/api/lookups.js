import { api } from "./client";

// ─────────────────────────────────────────────
// GET /lookups/material-types
// Returns: [{ id, name, ... }]
// ─────────────────────────────────────────────

export function getMaterialTypes() {
  return api.get("/lookups/material-types");
}

// ─────────────────────────────────────────────
// GET /lookups/material-grades
// Returns: [{ id, name, ... }]
// ─────────────────────────────────────────────

export function getMaterialGrades() {
  return api.get("/lookups/material-grades");
}

// ─────────────────────────────────────────────
// GET /lookups/part-statuses
// Returns the PART_STATUSES constant array
// (list of valid status strings)
// ─────────────────────────────────────────────

export function getPartStatuses() {
  return api.get("/lookups/part-statuses");
}

// ─────────────────────────────────────────────
// GET /lookups/projects
// Returns: [{ id, name }]
// ─────────────────────────────────────────────

export function getProjects() {
  return api.get("/lookups/projects");
}

export function getProcesses() {
  return api.get("/lookups/processes");
}

// ── Vendors ──────────────────────────────────

export function getVendors()              { return api.get("/lookups/vendors"); }
export function createVendor(name)        { return api.post("/lookups/vendors", { name }); }
export function deleteVendor(id)          { return api.delete(`/lookups/vendors/${id}`); }

// ── List Editor CRUD ─────────────────────────

export function createMaterialType(name)       { return api.post("/lookups/material-types", { name }); }
export function deleteMaterialType(id)         { return api.delete(`/lookups/material-types/${id}`); }

export function createMaterialGrade(name)      { return api.post("/lookups/material-grades", { name }); }
export function deleteMaterialGrade(id)        { return api.delete(`/lookups/material-grades/${id}`); }

export function createProcess(name, days, cost)   { return api.post("/lookups/processes", { name, default_days: days, cost_per_kg: cost ?? null }); }
export function updateProcess(id, name, days, cost){ return api.patch(`/lookups/processes/${id}`, { name, default_days: days, cost_per_kg: cost ?? null }); }
export function deleteProcess(id)                  { return api.delete(`/lookups/processes/${id}`); }

