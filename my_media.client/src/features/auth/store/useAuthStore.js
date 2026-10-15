import { create } from "zustand";
import { api } from "../../../services/api";
import { chooseLanguage, currentLanguage, syncAccountLanguage } from "../../i18n/engine";
import {
  clearAccounts,
  deviceLabel,
  exchange,
  forgetAccount,
  homeFor,
  readAccounts,
  rememberAccount,
  revokeRefresh,
  tokenHasSession,
} from "../accountVault";
import { armIfFresh } from "../../tour/tourFlag";

function pageReloaded() {
  try {
    return performance.getEntriesByType("navigation")[0]?.type === "reload";
  } catch {
    return false;
  }
}

function takeKeep() {
  try {
    const on = sessionStorage.getItem("pulse_keep") === "1";
    if (on) sessionStorage.removeItem("pulse_keep");
    return on;
  } catch {
    return false;
  }
}

function skipIntroOnce() {
  try {
    sessionStorage.setItem("pulse_skip_intro", "1");
  } catch {
    /* ignore */
  }
}

export async function openHome(user, navigate) {
  const code = user?.language;
  if (code && LANGUAGE_OK(code) && code !== currentLanguage()) {
    if (code === "az") {
      try { sessionStorage.setItem("pulse_keep", "1"); } catch { /* sessiyanı saxla */ }
      skipIntroOnce();
      localStorage.setItem("pulse_lang", "az");
      window.location.assign(homeFor(user));
      return;
    }
    await chooseLanguage(code);
  }
  navigate(homeFor(user), { replace: true });
}

function LANGUAGE_OK(code) {
  return typeof code === "string" && code.length > 0;
}

export const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,
  error: "",
  async bootstrap() {
    if (pageReloaded() && !takeKeep()) {
      set({ user: null, loading: false, error: "" });
      return;
    }
    let token = localStorage.getItem("pulse_token");
    const refresh = localStorage.getItem("pulse_refresh");
    if (refresh && (!token || !tokenHasSession(token))) {
      try {
        const data = await exchange(refresh);
        rememberAccount(data.user, data.token, data.refreshToken);
        set({ user: data.user, loading: false, error: "" });
        return;
      } catch {
        forgetAccount(readAccounts().find((row) => row.refreshToken === refresh)?.id);
        localStorage.removeItem("pulse_token");
        localStorage.removeItem("pulse_refresh");
        token = "";
      }
    }
    if (!token) {
      set({ loading: false, user: null });
      return;
    }
    try {
      const user = await api.get("/api/auth/me");
      rememberAccount(user, localStorage.getItem("pulse_token"), localStorage.getItem("pulse_refresh"));
      if (syncAccountLanguage(user.language)) {
        try { sessionStorage.setItem("pulse_keep", "1"); } catch { /* sessiyanı saxla */ }
        skipIntroOnce();
        window.location.reload();
        return;
      }
      set({ user, loading: false, error: "" });
    } catch {
      set({ user: null, loading: false });
    }
  },
  async login(payload) {
    const contact = (payload.contact || "").trim();
    const password = payload.password || "";
    const data = await api.post("/api/auth/login", { contact, password, device: deviceLabel(), adding: Boolean(payload.adding) }, payload.adding ? undefined : { skipAuth: true });
    rememberAccount(data.user, data.token, data.refreshToken);
    syncAccountLanguage(data.user?.language);
    set({ user: data.user, error: "", loading: false });
    return data.user;
  },
  async social(kind, extra) {
    const idToken = (extra?.idToken || "").trim();
    const fullName = (extra?.fullName || "").trim();
    const data = await api.post(`/api/auth/${kind}`, { idToken, fullName, device: deviceLabel(), adding: Boolean(extra?.adding) }, extra?.adding ? undefined : { skipAuth: true });
    rememberAccount(data.user, data.token, data.refreshToken);
    syncAccountLanguage(data.user?.language);
    armIfFresh(data.user);
    set({ user: data.user, error: "", loading: false });
    return data.user;
  },
  async switchTo(account) {
    try {
      const data = await exchange(account.refreshToken);
      rememberAccount(data.user, data.token, data.refreshToken);
      syncAccountLanguage(data.user?.language);
      skipIntroOnce();
      window.location.assign(homeFor(data.user));
    } catch (err) {
      forgetAccount(account.id);
      throw err;
    }
  },
  async logout() {
    const id = get().user?.id;
    const refresh = localStorage.getItem("pulse_refresh");
    await revokeRefresh(refresh);
    if (id) forgetAccount(id);
    const next = readAccounts()[0];
    if (next) {
      try {
        const data = await exchange(next.refreshToken);
        rememberAccount(data.user, data.token, data.refreshToken);
        syncAccountLanguage(data.user?.language);
        skipIntroOnce();
        window.location.assign(homeFor(data.user));
        return;
      } catch {
        forgetAccount(next.id);
      }
    }
    localStorage.removeItem("pulse_token");
    localStorage.removeItem("pulse_refresh");
    set({ user: null, loading: false });
    window.location.assign("/login");
  },
  async logoutAll() {
    const list = readAccounts();
    await Promise.all(list.map((row) => revokeRefresh(row.refreshToken)));
    clearAccounts();
    set({ user: null, loading: false });
    window.location.assign("/login");
  },
  async removeSaved(account) {
    await revokeRefresh(account.refreshToken);
    forgetAccount(account.id);
    if (get().user?.id === account.id) {
      const next = readAccounts()[0];
      if (next) {
        try {
          const data = await exchange(next.refreshToken);
          rememberAccount(data.user, data.token, data.refreshToken);
          syncAccountLanguage(data.user?.language);
          skipIntroOnce();
          window.location.assign(homeFor(data.user));
          return;
        } catch {
          forgetAccount(next.id);
        }
      }
      localStorage.removeItem("pulse_token");
      localStorage.removeItem("pulse_refresh");
      set({ user: null, loading: false });
      window.location.assign("/login");
    }
  },
  setUser(user) {
    set({ user, loading: false });
    const refresh = localStorage.getItem("pulse_refresh");
    const token = localStorage.getItem("pulse_token");
    if (user?.id && refresh) rememberAccount(user, token, refresh);
  },
  getUser: () => get().user,
}));
