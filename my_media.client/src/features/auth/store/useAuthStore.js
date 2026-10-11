import { create } from "zustand";
import { api } from "../../../services/api";

export const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,
  error: "",
  async bootstrap() {
    const token = localStorage.getItem("pulse_token");
    if (!token) {
      set({ loading: false, user: null });
      return;
    }
    try {
      const user = await api.get("/api/auth/me");
      set({ user, loading: false, error: "" });
    } catch (e) {
      localStorage.removeItem("pulse_token");
      set({ user: null, loading: false });
    }
  },
  async login(payload) {
    const contact = (payload.contact || "").trim();
    const password = payload.password || "";
    const data = await api.post("/api/auth/login", { contact, password });
    localStorage.setItem("pulse_token", data.token);
    set({ user: data.user, error: "", loading: false });
    return data.user;
  },
  async social(kind, extra) {
    const email = (extra?.email || "").trim().toLowerCase();
    const fullName = (extra?.fullName || "").trim();
    const data = await api.post(`/api/auth/${kind}`, { email, fullName });
    localStorage.setItem("pulse_token", data.token);
    set({ user: data.user, error: "", loading: false });
    return data.user;
  },
  logout() {
    localStorage.removeItem("pulse_token");
    set({ user: null, loading: false });
  },
  setUser(user) {
    set({ user, loading: false });
  },
  getUser: () => get().user,
}));
