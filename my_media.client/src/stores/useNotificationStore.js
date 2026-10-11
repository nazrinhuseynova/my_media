import { create } from "zustand";
import { api } from "../services/api";

export const useNotificationStore = create((set) => ({
  items: [],
  settings: { like: true, comment: true, follow: true, mention: true, dm: true },
  async load() {
    const raw = await api.get("/api/notifications");
    const list = Array.isArray(raw) ? raw : [];
    const items = list.map((n) => ({ ...n, from: n.from || n.fromUser || null }));
    set({ items });
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
