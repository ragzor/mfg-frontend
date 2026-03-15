// ─────────────────────────────────────────────
// Base API client
// All fetch calls go through here so we have
// one place to set the base URL and auth header.
// ─────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getToken() {
  return localStorage.getItem("mfg_token");
}

async function request(path, options = {}) {
  const token = getToken();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

export const api = {
  get:    (path)         => request(path),
  post:   (path, body)   => request(path, { method: "POST",  body: JSON.stringify(body) }),
  patch:  (path, body)   => request(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path)         => request(path, { method: "DELETE" }),

  // Multipart upload (no Content-Type header — browser sets boundary automatically)
  upload: (path, formData) => {
    const token = getToken();
    return fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json());
  },
};
