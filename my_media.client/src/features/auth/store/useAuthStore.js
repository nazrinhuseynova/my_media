import { create } from "zustand";
import { api } from "../../../services/api";
import {
  clearAccounts,
  deviceLabel,
  exchange,
  forgetAccount,
  readAccounts,
  rememberAccount,
  revokeRefresh,
  tokenHasSession,
} from "../accountVault";

export const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,
  error: "",
  async bootstrap() {
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
      set({ user, loading: false, error: "" });
    } catch {
      set({ user: null, loading: false });
    }
  },
  async login(payload) {
    const contact = (payload.contact || "").trim();
    const password = payload.password || "";
    const data = await api.post("/api/auth/login", { contact, password, device: deviceLabel() });
    rememberAccount(data.user, data.token, data.refreshToken);
    set({ user: data.user, error: "", loading: false });
    return data.user;
  },
  async social(kind, extra) {
    const idToken = (extra?.idToken || "").trim();
    const fullName = (extra?.fullName || "").trim();
    const data = await api.post(`/api/auth/${kind}`, { idToken, fullName, device: deviceLabel() });
    rememberAccount(data.user, data.token, data.refreshToken);
    set({ user: data.user, error: "", loading: false });
    return data.user;
  },
  async switchTo(account) {
    try {
      const data = await exchange(account.refreshToken);
      rememberAccount(data.user, data.token, data.refreshToken);
      window.location.assign("/");
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
        window.location.assign("/");
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
          window.location.assign("/");
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
