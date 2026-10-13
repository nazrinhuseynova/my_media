import { create } from "zustand";
import { api } from "../services/api";

export const useNotificationStore = create((set) => ({
  items: [],
  hasMore: false,
  page: 1,
  settings: { like: true, comment: true, follow: true, mention: true, dm: true },
  async load(page = 1) {
    const raw = await api.get("/api/notifications", { params: { page, pageSize: 20 } });
    const list = Array.isArray(raw) ? raw : (raw?.items || []);
    const items = list.map((n) => ({ ...n, from: n.from || n.fromUser || null }));
    set((s) => ({
      items: page === 1 ? items : [...s.items, ...items.filter((n) => !s.items.some((row) => row.id === n.id))],
      hasMore: !!raw?.hasMore,
      page,
    }));
    return items;
  },
  async markRead() {
    await api.post("/api/notifications/read");
    set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) }));
  },
  async loadSettings() {
    const settings = await api.get("/api/notifications/settings");
    set({ settings });
  },
  async saveSettings(settings) {
    const next = await api.put("/api/notifications/settings", settings);
    set({ settings: next });
  },
}));
