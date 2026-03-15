import { useState } from "react";
import { createPart, uploadDrawing } from "../api/parts";

// ─────────────────────────────────────────────
// Wraps the POST /parts creation flow.
// Optionally chains an upload-drawing call
// if a PDF file is provided.
// ─────────────────────────────────────────────

export function useCreatePart({ onSuccess } = {}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // partData shape matches PartCreate schema:
  // {
  //   name: string,
  //   project_id: string (uuid),
  //   quantity: number,
  //   material_type_id: string (uuid),
  //   material_grade_id: string (uuid),
  //   process_ids: string[],   // ordered UUIDs
  //   asana_ref?: string
  // }
  //
  // drawingFile: optional File object (PDF)

  async function submit(partData, drawingFile = null) {
    setLoading(true);
    setError(null);
    try {
      const result = await createPart(partData);

      if (drawingFile && result.part_id) {
        await uploadDrawing(result.part_id, drawingFile);
      }

      onSuccess?.(result);
      return result;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { submit, loading, error };
}
