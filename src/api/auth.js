import { api } from "./client";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function login(username, password) {
  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Login failed");
  }

  const data = await res.json();
  localStorage.setItem("mfg_token", data.access_token);

  // Store user info for sidebar display
  if (data.user) {
    localStorage.setItem("mfg_user", JSON.stringify(data.user));
  }

  return data;
}

export function logout() {
  localStorage.removeItem("mfg_token");
  localStorage.removeItem("mfg_user");
}

export function isLoggedIn() {
  return Boolean(localStorage.getItem("mfg_token"));
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem("mfg_user");
    return raw ? JSON.parse(raw) : { name: "User", role: "operator", email: "" };
  } catch {
    return { name: "User", role: "operator", email: "" };
  }
}

// Fetch fresh user info from /me endpoint (call once on app load)
export async function fetchMe() {
  try {
    const data = await api.get("/me");
    localStorage.setItem("mfg_user", JSON.stringify(data));
    return data;
  } catch {
    return getCurrentUser();
  }
}

