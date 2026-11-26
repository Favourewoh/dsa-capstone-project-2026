import { getToken, setSession, clearSession } from "./session.js";

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("Network error. Check your connection and try again.");
    err.code = "NETWORK_ERROR";
    err.status = 0;
    throw err;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const code = payload?.error?.code || payload?.code || "HTTP_ERROR";
    const message =
      payload?.error?.message ||
      payload?.message ||
      `Request failed with status ${response.status}.`;
    const err = new Error(message);
    err.code = code;
    err.status = response.status;
    throw err;
  }

  return payload;
}

export async function signup({ email, password, name, role }) {
  const data = await request("/api/auth/signup", {
    method: "POST",
    body: { email, password, name, role },
    auth: false,
  });
  if (data?.token || data?.user) {
    setSession({ token: data.token, user: data.user });
  }
  return data;
}

export async function login({ email, password }) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  if (data?.token || data?.user) {
    setSession({ token: data.token, user: data.user });
  }
  return data;
}

export async function getMe() {
  return request("/api/auth/me", { auth: true });
}

export function logout() {
  clearSession();
}

export async function listEvents(filters = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", String(filters.q));
  if (filters.city) params.set("city", String(filters.city));
  if (
    filters.maxPriceCents !== undefined &&
    filters.maxPriceCents !== null &&
    filters.maxPriceCents !== ""
  ) {
    params.set("maxPriceCents", String(filters.maxPriceCents));
  }
  if (filters.sortBy) params.set("sortBy", String(filters.sortBy));
  const qs = params.toString();
  return request(`/api/events${qs ? `?${qs}` : ""}`, { auth: false });
}

export async function getEvent(eventId) {
  return request(`/api/events/${encodeURIComponent(eventId)}`, { auth: false });
}

export async function createEvent(payload) {
  return request("/api/events", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export async function addTier(eventId, payload) {
  return request(`/api/events/${encodeURIComponent(eventId)}/tiers`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export async function publishEvent(eventId) {
  return request(`/api/events/${encodeURIComponent(eventId)}/publish`, {
    method: "POST",
    auth: true,
  });
}

export async function unpublishEvent(eventId) {
  return request(`/api/events/${encodeURIComponent(eventId)}/unpublish`, {
    method: "POST",
    auth: true,
  });
}

export async function createBooking(payload) {
  return request("/api/bookings", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export async function listMyBookings() {
  return request("/api/bookings", { auth: true });
}

export async function pay(reference, options = {}) {
  return request(`/api/bookings/${encodeURIComponent(reference)}/pay`, {
    method: "POST",
    body: options,
    auth: true,
  });
}

export async function cancelBooking(reference) {
  return request(`/api/bookings/${encodeURIComponent(reference)}/cancel`, {
    method: "POST",
    auth: true,
  });
}