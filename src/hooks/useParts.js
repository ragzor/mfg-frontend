import { useState, useEffect, useCallback } from "react";
import { getParts } from "../api/parts";

// ─────────────────────────────────────────────
// Maps the backend part shape → frontend shape
// so the rest of the UI (PartsTable, Pipeline,
// etc.) works without changes.
//
// Backend status codes → display labels:
//   NOT_STARTED → "Not Started"
//   IN_PRGS     → "In Progress"
//   CMPLT       → "Completed"
//   QC          → "QC"
//   REJECTED    → "Rejected"
//   W_4_DECS    → "On Hold"
// ─────────────────────────────────────────────

const STATUS_LABEL = {
  NOT_STARTED:  "Not Started",
  IN_PRGS:      "In Progress",
  CMPLT:        "Completed",
  QC:           "QC",
  REJECTED:     "Rejected",
  W_4_DECS:     "On Hold",
  W_4_RM:       "On Hold",
  W_4_QUT:      "On Hold",
  PO_APPROVAL:  "On Hold",
  W_4_PARTS:    "On Hold",
  W_F_PAYMENT:  "On Hold",
  W_F_DECISION: "On Hold",
};

function mapPart(p) {
  const processes = p.processes || [];

  // Use the authoritative current_step from the backend (incremented on advance, decremented on undo)
  // Falls back to deriving from process statuses for backwards compatibility
  let currentStep = (p.current_step != null) ? p.current_step - 1 : (() => {
    let idx = processes.findIndex(pp => pp.status === "IN_PRGS" || pp.status === "QC");
    if (idx === -1) idx = processes.filter(pp => pp.status === "CMPLT").length;
    return idx;
  })();

  return {
    ...p,
    id:               p.part_number,
    name:             p.name,
    project:          p.project_name  || "—",
    qty:              p.quantity,
    matType:          p.material_type  || "—",
    matGrade:         p.material_grade || "—",
    vendor:           p.active_vendor      || "—",
    po:               p.active_po_number   || "—",
    asanaId:          p.asana_ref != null && String(p.asana_ref).trim() !== "" ? String(p.asana_ref) : "",
    drawing_url:      p.drawing_url || "",
    status:           STATUS_LABEL[p.status] || p.status,
    rawStatus:        p.status,
    activeProcStatus: p.active_proc_status || "",
    activeProcName:   p.active_proc_name   || "",
    currentStep,
    currentStepNumber: p.current_step || 1,   // 1-based, for display
    processes:        processes.map(pp => pp.process_name),
    processData:      processes,
  };
}

export function useParts() {
  const [parts, setParts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchParts = useCallback(async () => {
    // Only show loading spinner on first load (when parts is empty)
    // On subsequent refetches, update silently so mounted components aren't destroyed
    setError(null);
    try {
      const raw = await getParts();
      console.log('RAW API RESPONSE:', raw[0]);
      const mapped = raw.map(mapPart);
      setParts(mapped);
      return mapped;
    } catch (e) {
      setError(e.message);
      return [];
    } finally {
      setLoading(false); // always clear initial loading
    }
  }, []);

  useEffect(() => {
    fetchParts();
  }, [fetchParts]);

  return { parts, loading, error, refetch: fetchParts };
}
