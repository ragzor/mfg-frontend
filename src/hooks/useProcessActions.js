import { useState } from "react";
import { updateProcessStatus, undoProcess, recordProduction } from "../api/processes";

// ─────────────────────────────────────────────
// Wraps all process mutation endpoints.
// Pass `onSuccess` callback to trigger a
// parts refetch after any mutation.
// ─────────────────────────────────────────────

export function useProcessActions({ onSuccess } = {}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  async function run(fn) {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      onSuccess?.();
      return result;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    error,

    // Advance or change process status
    // status: "IN_PRGS" | "CMPLT" | "QC" | "REJECTED" | "W_4_RM" | etc.
    setStatus: (processId, status) =>
      run(() => updateProcessStatus(processId, status)),

    // Undo a completed process (engineer only)
    undo: (processId) =>
      run(() => undoProcess(processId)),

    // Record partial production quantity
    recordQty: (processId, qty) =>
      run(() => recordProduction(processId, qty)),
  };
}
