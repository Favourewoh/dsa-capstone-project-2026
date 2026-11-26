const TOKEN_KEY = "et_auth_token";
const USER_KEY = "et_auth_user";

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

export function getUser() {
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession({ token, user }) {
  if (typeof token === "string" && token.length > 0) {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
  if (user && typeof user === "object") {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}