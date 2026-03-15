const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const ASANA_TOKEN_KEY = "mfg_asana_token";

export function getAsanaToken() {
  return localStorage.getItem(ASANA_TOKEN_KEY) || "";
}

export function saveAsanaToken(token) {
  localStorage.setItem(ASANA_TOKEN_KEY, token);
}

// ─────────────────────────────────────────────
// GET /asana/prefill?task_id=&token=
// Returns pre-filled part data from Asana task
// ─────────────────────────────────────────────

export async function getAsanaPrefill(taskId, asanaToken) {
  const jwt = localStorage.getItem("mfg_token") || "";
  // Build URL manually — token contains slashes/colons that must NOT be double-encoded
  const params = new URLSearchParams({ task_id: taskId, token: asanaToken });
  const url = `${API}/asana/prefill?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Asana fetch failed (${res.status})`);
  }

  return res.json();
}
