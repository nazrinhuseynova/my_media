import axios from "axios";

const KEY = "pulse_accounts";
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5017";
const LIMIT = 5;

export function deviceLabel() {
  const ua = navigator.userAgent || "";
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Cihaz";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Brauzer";
  return `${browser} · ${os}`.slice(0, 80);
}

export function tokenHasSession(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return false;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return Boolean(json.sid);
  } catch {
    return false;
  }
}

function isDesk(row) {
  return row?.role === "admin" || String(row?.username || "").toLowerCase() === "admin";
}

function readRaw() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(list)) return [];
    return list.filter((row) => row && row.id && row.refreshToken);
  } catch {
    return [];
  }
}

export function readAccounts() {
  const list = readRaw();
  const visible = list.filter((row) => !isDesk(row));
  if (visible.length !== list.length) {
    const active = localStorage.getItem("pulse_refresh");
    list.filter(isDesk).forEach((row) => {
      if (row.refreshToken && row.refreshToken !== active) revokeRefresh(row.refreshToken);
    });
    write(visible);
  }
  return visible;
}

function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
}

export async function revokeRefresh(refreshToken) {
  if (!refreshToken) return;
  try {
    await axios.post(`${API_URL}/api/auth/logout`, { refreshToken });
  } catch {
  }
}

export function rememberAccount(user, token, refreshToken) {
  if (!user?.id || !refreshToken) return;
  localStorage.setItem("pulse_token", token || "");
  localStorage.setItem("pulse_refresh", refreshToken);
  if (isDesk(user)) {
    const leftover = readRaw().filter((row) => isDesk(row) && row.refreshToken !== refreshToken);
    leftover.forEach((row) => revokeRefresh(row.refreshToken));
    write(readRaw().filter((row) => !isDesk(row)));
    return;
  }
  const previous = readRaw().find((row) => row.id === user.id);
  const row = {
    id: user.id,
    username: user.username || "",
    fullName: user.fullName || "",
    avatar: user.avatar || "",
    role: user.role || "user",
    token: token || "",
    refreshToken,
  };
  const rest = readRaw().filter((item) => item.id !== row.id && !isDesk(item));
  const overflow = rest.slice(LIMIT - 1);
  write([row, ...rest.slice(0, LIMIT - 1)]);
  if (previous && previous.refreshToken !== row.refreshToken) revokeRefresh(previous.refreshToken);
  overflow.forEach((item) => revokeRefresh(item.refreshToken));
}

export function touchSession(oldRefresh, token, refreshToken, user) {
  if (isDesk(user)) {
    rememberAccount(user, token, refreshToken);
    return;
  }
  const list = readRaw().filter((row) => !isDesk(row));
  const index = list.findIndex((row) => row.refreshToken === oldRefresh || (user && row.id === user.id));
  if (index < 0) {
    if (user) rememberAccount(user, token, refreshToken);
    return;
  }
  const current = list[index];
  const next = {
    ...current,
    token: token || current.token,
    refreshToken: refreshToken || current.refreshToken,
    username: user?.username || current.username,
    fullName: user?.fullName || current.fullName,
    avatar: user?.avatar || current.avatar,
    role: user?.role || current.role || "user",
  };
  write([next, ...list.filter((_, i) => i !== index)]);
  localStorage.setItem("pulse_token", next.token);
  localStorage.setItem("pulse_refresh", next.refreshToken);
}

export function forgetAccount(id) {
  write(readAccounts().filter((row) => row.id !== id));
}

export function clearAccounts() {
  localStorage.removeItem(KEY);
  localStorage.removeItem("pulse_token");
  localStorage.removeItem("pulse_refresh");
}

export function dropActiveAccount() {
  const refresh = localStorage.getItem("pulse_refresh");
  const token = localStorage.getItem("pulse_token");
  const list = readAccounts().filter((row) => row.refreshToken !== refresh && row.token !== token);
  write(list);
  localStorage.removeItem("pulse_token");
  localStorage.removeItem("pulse_refresh");
  return list[0] || null;
}

export function homeFor(user) {
  if (user?.role === "admin") return "/admin";
  if (!user?.language) return "/welcome";
  return "/";
}

export async function exchange(refreshToken) {
  const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {
    refreshToken,
    device: deviceLabel(),
  });
  return data;
}
